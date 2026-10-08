// backend/config/searchIndexes.js
// Creates the Atlas Vector Search index automatically on startup, so nobody has to click
// through the Atlas UI. Safe to run every time: it only creates the index if it is missing.
// On a non-Atlas MongoDB it just logs a note - retrieval then falls back to in-app
// cosine similarity, so the app still works.

import mongoose from "mongoose";
import DocumentChunk from "../models/DocumentChunk.js";
import { EMBEDDING_DIMENSIONS } from "../utils/ai/genai.js";

export const VECTOR_INDEX_NAME = "vector_index";

export const ensureSearchIndexes = async () => {
  try {
    await DocumentChunk.createCollection().catch(() => {});
    const collection = mongoose.connection.db.collection(DocumentChunk.collection.collectionName);

    const existing = await collection.listSearchIndexes().toArray();
    if (existing.some((i) => i.name === VECTOR_INDEX_NAME)) {
      console.log(`Atlas vector index "${VECTOR_INDEX_NAME}" found`);
      return;
    }

    await collection.createSearchIndex({
      name: VECTOR_INDEX_NAME,
      type: "vectorSearch",
      definition: {
        fields: [
          { type: "vector", path: "embedding", numDimensions: EMBEDDING_DIMENSIONS, similarity: "cosine" },
          { type: "filter", path: "documentId" },
          { type: "filter", path: "userId" },
        ],
      },
    });
    console.log(`Atlas vector index "${VECTOR_INDEX_NAME}" created (it can take ~1 minute to become queryable)`);
  } catch (error) {
    console.warn(
      "Could not create/check the Atlas vector index (are you on Atlas?). " +
        "Search will use the built-in cosine fallback. Reason:",
      error.message
    );
  }
};
