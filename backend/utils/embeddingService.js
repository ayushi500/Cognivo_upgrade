// backend/utils/embeddingService.js
// Embeddings via the new @google/genai SDK. Same model + 768 dimensions as before,
// so vectors already stored in MongoDB keep working. Chunks are embedded in batches
// (one API call per ~16 chunks instead of one per chunk).

import { getClient, withRetry, MODELS, EMBEDDING_DIMENSIONS } from "./ai/genai.js";

export const TaskType = {
  RETRIEVAL_QUERY: "RETRIEVAL_QUERY",
  RETRIEVAL_DOCUMENT: "RETRIEVAL_DOCUMENT",
};

const BATCH_SIZE = 16;
const MAX_CHARS = 8000;

const normalize = (v) => {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
};

const embedBatch = async (texts, taskType) => {
  const res = await withRetry(
    () =>
      getClient().models.embedContent({
        model: MODELS.embedding,
        contents: texts.map((t) => (t || "").slice(0, MAX_CHARS)),
        config: { taskType, outputDimensionality: EMBEDDING_DIMENSIONS },
      }),
    { label: "Gemini embedding" }
  );
  const vectors = (res.embeddings || []).map((e) => e.values);
  if (vectors.length !== texts.length || vectors.some((v) => !v?.length)) {
    throw new Error("Embedding response did not match the request");
  }
  return vectors.map(normalize);
};

/** Embed one string (used for the search query). */
export const embedText = async (text, taskType = TaskType.RETRIEVAL_QUERY) => {
  try {
    const [vector] = await embedBatch([text], taskType);
    return vector;
  } catch (error) {
    console.error("Gemini embedding error:", error?.message || error);
    throw new Error("Failed to generate embedding");
  }
};

/**
 * Embed chunk objects ({ content, heading?, ... }) and return them with an `embedding` field.
 * The section heading is embedded together with the text, which improves retrieval.
 */
export const embedChunks = async (chunks, { onProgress } = {}) => {
  const out = [];
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const slice = chunks.slice(i, i + BATCH_SIZE);
    const texts = slice.map((c) => (c.heading ? `${c.heading}\n${c.content}` : c.content));
    let vectors;
    try {
      vectors = await embedBatch(texts, TaskType.RETRIEVAL_DOCUMENT);
    } catch (error) {
      console.error("Batch embedding failed:", error?.message || error);
      throw new Error("Failed to generate embeddings for the document");
    }
    slice.forEach((chunk, j) => out.push({ ...chunk, embedding: vectors[j] }));
    onProgress?.(Math.min(i + BATCH_SIZE, chunks.length), chunks.length);
  }
  return out;
};
