// backend/utils/ai/lc/retriever.js
// Our hybrid search (vector + BM25 + RRF + rerank) exposed as a standard LangChain Retriever.
// Anything in the LangChain ecosystem (chains, graphs) can now call:
//     const docs = await new HybridRetriever({ documentId, userId }).invoke("what is MQTT?")
// and gets LangChain `Document`s with page numbers in metadata.

import { BaseRetriever } from "@langchain/core/retrievers";
import { Document } from "@langchain/core/documents";
import { hybridSearch } from "../retrieval.js";

export class HybridRetriever extends BaseRetriever {
  static lc_name() {
    return "HybridRetriever";
  }
  lc_namespace = ["cognivo", "retrievers"];

  constructor({ documentId, userId, topK = 4, onStep } = {}) {
    super({});
    this.documentId = documentId;
    this.userId = userId;
    this.topK = topK;
    this.onStep = onStep;
  }

  async _getRelevantDocuments(query) {
    const chunks = await hybridSearch({
      query,
      documentId: this.documentId,
      userId: this.userId,
      topK: this.topK,
      onStep: this.onStep,
    });
    return chunks.map(
      (c) =>
        new Document({
          pageContent: c.content,
          metadata: {
            pageNumber: c.pageNumber,
            chunkIndex: c.chunkIndex,
            heading: c.heading || "",
            score: c.score,
          },
        })
    );
  }
}

/** LangChain Document -> the plain chunk shape the rest of the app uses. */
export const docToChunk = (d) => ({ content: d.pageContent, ...d.metadata });
