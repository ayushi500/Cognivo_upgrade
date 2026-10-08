// backend/utils/vectorSearch.js
// Same export as before (findRelevantChunks) so existing callers keep working,
// but it is now hybrid search (vector + BM25 + RRF + rerank) - see utils/ai/retrieval.js
import { hybridSearch } from "./ai/retrieval.js";

export const findRelevantChunks = async (query, documentId, userId, maxChunks = 4, options = {}) =>
  hybridSearch({ query, documentId, userId, topK: maxChunks, ...options });
