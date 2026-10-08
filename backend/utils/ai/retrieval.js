// backend/utils/ai/retrieval.js
// Hybrid retrieval:
//   1. semantic   -> Atlas $vectorSearch   (fallback: in-app cosine similarity)
//   2. keyword    -> BM25 over the document's chunks
//   3. fusion     -> Reciprocal Rank Fusion (RRF) of both rankings
//   4. rerank     -> Gemini scores the fused candidates for the question (optional)
// Returns the best `topK` chunks with page numbers for citations.

import mongoose from "mongoose";
import DocumentChunk from "../../models/DocumentChunk.js";
import { embedText } from "../embeddingService.js";
import { bm25Rank } from "./bm25.js";
import { askStructured } from "./lc/models.js";
import { rerankSchema } from "./lc/schemas.js";
import { VECTOR_INDEX_NAME } from "../../config/searchIndexes.js";

const RRF_K = 60;
let warnedVectorFallback = false;

// ---- small per-document chunk cache (chunks are immutable after processing) ----
const chunkCache = new Map(); // key -> { at, chunks }
const CACHE_TTL = 5 * 60 * 1000;

const loadChunks = async (documentId, userId) => {
  const key = `${documentId}:${userId}`;
  const hit = chunkCache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.chunks;

  const chunks = await DocumentChunk.find({ documentId, userId })
    .select("content heading pageNumber chunkIndex")
    .sort({ chunkIndex: 1 })
    .lean();
  chunkCache.set(key, { at: Date.now(), chunks });
  if (chunkCache.size > 50) chunkCache.delete(chunkCache.keys().next().value);
  return chunks;
};
export const clearChunkCache = (documentId) => {
  for (const key of chunkCache.keys()) if (key.startsWith(`${documentId}:`)) chunkCache.delete(key);
};

const cosine = (a, b) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};

const vectorCandidates = async (queryVector, documentId, userId, limit) => {
  try {
    const results = await DocumentChunk.aggregate([
      {
        $vectorSearch: {
          index: VECTOR_INDEX_NAME,
          path: "embedding",
          queryVector,
          numCandidates: Math.max(100, limit * 5),
          limit,
          filter: {
            $and: [
              { documentId: new mongoose.Types.ObjectId(documentId) },
              { userId: new mongoose.Types.ObjectId(userId) },
            ],
          },
        },
      },
      {
        $project: { _id: 1, content: 1, heading: 1, pageNumber: 1, chunkIndex: 1, vectorScore: { $meta: "vectorSearchScore" } },
      },
    ]);
    if (results.length) return results;
    throw new Error("vector search returned no rows (index may still be building)");
  } catch (error) {
    if (!warnedVectorFallback) {
      warnedVectorFallback = true;
      console.warn("Atlas $vectorSearch unavailable, using in-app cosine fallback:", error.message);
    }
    const all = await DocumentChunk.find({ documentId, userId })
      .select("content heading pageNumber chunkIndex embedding")
      .lean();
    return all
      .map(({ embedding, ...rest }) => ({ ...rest, vectorScore: cosine(queryVector, embedding || []) }))
      .sort((a, b) => b.vectorScore - a.vectorScore)
      .slice(0, limit);
  }
};

/** Reciprocal Rank Fusion of several ranked lists (items identified by chunkIndex). */
export const reciprocalRankFusion = (lists, k = RRF_K) => {
  const merged = new Map();
  lists.forEach((list, listIdx) => {
    list.forEach((item, rank) => {
      const entry = merged.get(item.chunkIndex) || { ...item, rrfScore: 0, ranks: {} };
      entry.rrfScore += 1 / (k + rank + 1);
      entry.ranks[listIdx] = rank + 1;
      Object.assign(entry, { ...item, rrfScore: entry.rrfScore, ranks: entry.ranks });
      merged.set(item.chunkIndex, entry);
    });
  });
  return [...merged.values()].sort((a, b) => b.rrfScore - a.rrfScore);
};

/** LLM reranker: asks Gemini to score each candidate 0-10 for the question. */
const rerankWithGemini = async (query, candidates) => {
  const listing = candidates
    .map((c, i) => `[${i}] (page ${c.pageNumber}${c.heading ? `, section: ${c.heading}` : ""})\n${c.content.slice(0, 700)}`)
    .join("\n\n");
  const prompt = `Rate how useful each passage is for answering the question. Score 0 (irrelevant) to 10 (directly answers it).
Return one {id, score} entry per passage.

Question: ${query}

Passages:
${listing}`;
  const { scores = [] } = await askStructured(prompt, rerankSchema, { name: "rerank", temperature: 0 });
  const byId = new Map(scores.map((s) => [Number(s.id), Number(s.score)]));
  return candidates.map((c, i) => ({ ...c, rerankScore: byId.has(i) ? byId.get(i) : 0 }));
};

export const hybridSearch = async ({
  query,
  documentId,
  userId,
  topK = 4,
  candidates = 12,
  rerank = process.env.RERANK !== "off",
  onStep,
}) => {
  if (!query || !documentId || !userId) return [];

  onStep?.("Searching the document…");
  const chunks = await loadChunks(documentId, userId);
  if (!chunks.length) return [];

  const queryVector = await embedText(query);
  const [semantic, keyword] = await Promise.all([
    vectorCandidates(queryVector, documentId, userId, 20),
    Promise.resolve(bm25Rank(query, chunks.map((c) => ({ ...c, content: c.heading ? `${c.heading} ${c.content}` : c.content })), { limit: 20 })).then(
      // restore the original chunk text (heading was only prepended for scoring)
      (rows) => rows.map((r) => ({ ...chunks.find((c) => c.chunkIndex === r.chunkIndex), keywordScore: r.keywordScore }))
    ),
  ]);

  const fused = reciprocalRankFusion([semantic, keyword]).slice(0, candidates);
  let final = fused;

  if (rerank && fused.length > topK) {
    try {
      onStep?.("Re-ranking the best passages…");
      const scored = await rerankWithGemini(query, fused);
      final = scored.sort((a, b) => b.rerankScore - a.rerankScore || b.rrfScore - a.rrfScore);
    } catch (error) {
      console.warn("Rerank skipped:", error.message);
    }
  }

  return final.slice(0, topK).map((c) => ({
    _id: c._id,
    content: c.content,
    heading: c.heading || "",
    pageNumber: c.pageNumber,
    chunkIndex: c.chunkIndex,
    score: c.rerankScore !== undefined ? c.rerankScore / 10 : c.vectorScore ?? c.rrfScore,
    vectorScore: c.vectorScore,
    keywordScore: c.keywordScore,
    rrfScore: c.rrfScore,
  }));
};
