// backend/utils/ai/lc/rag.js
// The RAG pipeline as a LangGraph state machine:
//
//   START -> rewrite -> cache -> (hit? END) -> retrieve -> (nothing found? END) -> generate -> END
//
// * rewrite   : LangChain structured output (zod) turns follow-ups into standalone queries
// * cache     : optional Redis lookup injected by the controller
// * retrieve  : HybridRetriever (LangChain Retriever)
// * generate  : ChatPromptTemplate | ChatGoogleGenerativeAI | StringOutputParser, streamed
// Progress + tokens are reported through config.configurable callbacks (SSE in the controller).

import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { getChatModel, askStructured } from "./models.js";
import { rewriteSchema } from "./schemas.js";
import { HybridRetriever, docToChunk } from "./retriever.js";

export const NOT_FOUND = "The information is not available in the document.";

export const sampleText = (text = "", max = Number(process.env.MAX_CONTEXT_CHARS || 60000)) => {
  if (text.length <= max) return text;
  // evenly spaced slices so quizzes/summaries cover the WHOLE document, not just the first pages
  const parts = 6;
  const size = Math.floor(max / parts);
  const step = Math.floor((text.length - size) / (parts - 1));
  return Array.from({ length: parts }, (_, i) => text.slice(i * step, i * step + size)).join("\n\n[...]\n\n");
};

/* ------------------------------------------------------------------ */
/* Prompts                                                              */
/* ------------------------------------------------------------------ */
const SYSTEM = `You are an AI learning assistant that answers ONLY from the provided context blocks.

Rules:
- Never invent facts. If the answer is not in the context, reply exactly: "${NOT_FOUND}"
- Every context block starts with an authoritative tag like [Source: Page 7]. Use ONLY that number as the page.
- Cite claims inline as [Page 7]. If several pages support a claim, cite all of them: [Page 3] [Page 7].
- NEVER use page numbers that appear inside the document text, and NEVER write "[Source: Page X]".
- Use clear Markdown (short paragraphs, bullet points, code blocks) and keep the answer focused.`;

// Values are passed as template VARIABLES, so { } characters in code/PDF text are safe.
export const answerPrompt = ChatPromptTemplate.fromMessages([
  ["system", SYSTEM],
  ["human", "{history}Context:\n{context}\n\nQuestion: {question}\n\nAnswer:"],
]);

export const formatContext = (chunks) =>
  chunks
    .map((c) => `[Source: Page ${c.pageNumber}]${c.heading ? ` (Section: ${c.heading})` : ""}\n${c.content}`)
    .join("\n\n---\n\n");

export const formatHistory = (history = []) => {
  const lines = history
    .slice(-4)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${String(m.content).slice(0, 400)}`)
    .join("\n");
  return lines ? `Previous conversation:\n${lines}\n\n` : "";
};

export const extractSources = (answer, chunks) => {
  const cited = new Set([...answer.matchAll(/\[Page\s+(\d+)\]/gi)].map((m) => Number(m[1])));
  const seen = new Set();
  return chunks
    .filter((c) => cited.has(c.pageNumber))
    .filter((c) => (seen.has(c.chunkIndex) ? false : seen.add(c.chunkIndex)))
    .map((c) => ({
      pageNumber: c.pageNumber,
      chunkIndex: c.chunkIndex,
      heading: c.heading || "",
      score: c.score,
      snippet: c.content.replace(/\s+/g, " ").slice(0, 180),
    }));
};

/* ------------------------------------------------------------------ */
/* Graph nodes                                                          */
/* ------------------------------------------------------------------ */
export const rewriteQuery = async (question, chatHistory = []) => {
  if (!chatHistory?.length) return { searchQuery: question, isFollowUp: false };

  const historyText = chatHistory
    .slice(-6)
    .map((m) => `${m.role}: ${String(m.content).slice(0, 500)}`)
    .join("\n");

  const prompt = `Decide whether the latest question depends on the previous conversation
(pronouns like "it", "that", "this", "explain more", "its advantages"...).
Then write a standalone search query that contains the missing context.
If it does not depend on the conversation, keep the question as the search query.

Conversation:
${historyText}

Latest question: ${question}`;

  try {
    const out = await askStructured(prompt, rewriteSchema, { name: "query_rewrite", temperature: 0 });
    return {
      isFollowUp: Boolean(out.isFollowUp),
      searchQuery: String(out.searchQuery || question).trim() || question,
    };
  } catch (error) {
    console.warn("Query rewrite failed, using the raw question:", error.message);
    return { searchQuery: question, isFollowUp: false };
  }
};

const State = Annotation.Root({
  question: Annotation(),
  history: Annotation(),
  documentId: Annotation(),
  userId: Annotation(),
  searchQuery: Annotation(),
  isFollowUp: Annotation(),
  cached: Annotation(),
  chunks: Annotation(),
  answer: Annotation(),
  sources: Annotation(),
});

const ui = (config) => config?.configurable || {};

const rewriteNode = async (state, config) => {
  ui(config).onStatus?.("Understanding your question…");
  return rewriteQuery(state.question, state.history);
};

const cacheNode = async (state, config) => {
  const { cacheLookup } = ui(config);
  if (!cacheLookup) return {};
  const hit = await cacheLookup({ isFollowUp: state.isFollowUp, searchQuery: state.searchQuery });
  return hit ? { cached: hit, answer: hit.answer, sources: hit.sources || [], chunks: [] } : {};
};

const retrieveNode = async (state, config) => {
  const retriever = new HybridRetriever({
    documentId: state.documentId,
    userId: state.userId,
    topK: 4,
    onStep: ui(config).onStatus,
  });
  const docs = await retriever.invoke(state.searchQuery);
  const chunks = docs.map(docToChunk);
  if (!chunks.length) {
    ui(config).onToken?.(NOT_FOUND);
    return { chunks, answer: NOT_FOUND, sources: [] };
  }
  return { chunks };
};

const generateNode = async (state, config) => {
  const { onToken, onStatus, signal } = ui(config);
  onStatus?.("Writing the answer…");

  const chain = answerPrompt.pipe(getChatModel({ temperature: 0.3 })).pipe(new StringOutputParser());
  const input = {
    history: state.isFollowUp ? formatHistory(state.history) : "",
    context: formatContext(state.chunks),
    question: state.isFollowUp ? state.searchQuery : state.question,
  };

  let answer = "";
  if (onToken) {
    for await (const piece of await chain.stream(input, { signal })) {
      if (signal?.aborted) break;
      answer += piece;
      onToken(piece);
    }
  } else {
    answer = await chain.invoke(input, { signal });
  }
  return { answer, sources: extractSources(answer, state.chunks) };
};

/* ------------------------------------------------------------------ */
/* The graph                                                            */
/* ------------------------------------------------------------------ */
export const ragGraph = new StateGraph(State)
  .addNode("rewrite", rewriteNode)
  .addNode("cache", cacheNode)
  .addNode("retrieve", retrieveNode)
  .addNode("generate", generateNode)
  .addEdge(START, "rewrite")
  .addEdge("rewrite", "cache")
  .addConditionalEdges("cache", (s) => (s.cached ? "done" : "search"), { done: END, search: "retrieve" })
  .addConditionalEdges("retrieve", (s) => (s.chunks?.length ? "answer" : "done"), { answer: "generate", done: END })
  .addEdge("generate", END)
  .compile();

/**
 * Same signature the controllers already used.
 * onToken(text)  -> streamed answer pieces        onStatus(text) -> progress messages
 * cacheLookup({isFollowUp, searchQuery}) -> cached result or null
 */
export const runRagPipeline = async ({ question, history = [], documentId, userId, onToken, onStatus, signal, cacheLookup }) => {
  const out = await ragGraph.invoke(
    { question, history, documentId: String(documentId), userId: String(userId) },
    { configurable: { onToken, onStatus, signal, cacheLookup } }
  );
  return {
    answer: out.answer || "",
    sources: out.sources || [],
    chunks: out.chunks || [],
    searchQuery: out.searchQuery,
    isFollowUp: Boolean(out.isFollowUp),
    ...(out.cached ? { ...out.cached, answer: out.answer, sources: out.sources, fromCache: true } : {}),
  };
};
