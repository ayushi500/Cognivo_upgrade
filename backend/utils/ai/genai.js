// backend/utils/ai/genai.js
// Direct @google/genai client. Used for embeddings and the OCR (vision) fallback, and for the
// shared model names + retry helper. Chat / quiz  logic goes through LangChain (see ./lc/).

import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

export const MODELS = {
  text: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
  embedding: process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001",
  vision: process.env.GEMINI_VISION_MODEL || process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
};

export const EMBEDDING_DIMENSIONS = 768; // must match the Atlas vector index

let client = null;
export const getClient = () => {
  if (!client) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set in backend/.env");
    }
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
};
// used by tests only
export const __setClientForTests = (c) => {
  client = c;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isRetryable = (error) => {
  const status = error?.status ?? error?.code;
  const msg = String(error?.message || "");
  return (
    [429, 500, 502, 503, 504].includes(Number(status)) ||
    /\b(429|500|502|503|504)\b|overloaded|UNAVAILABLE|RESOURCE_EXHAUSTED|fetch failed|ECONNRESET/i.test(msg)
  );
};

/** Retry with exponential backoff on 429 / 5xx (Gemini free tier throws these a lot). */
export const withRetry = async (fn, { retries = 4, baseDelay = 800, label = "Gemini" } = {}) => {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (attempt < retries && isRetryable(error)) {
        const delay = baseDelay * 2 ** attempt + Math.floor(Math.random() * 250);
        console.warn(`${label}: transient error, retry ${attempt + 1}/${retries} in ${delay}ms`);
        await sleep(delay);
        attempt++;
        continue;
      }
      throw error;
    }
  }
};

/** Multimodal call used by the OCR fallback (image + instruction). */
export const generateFromImage = async (pngBuffer, instruction, { model = MODELS.vision } = {}) => {
  const res = await withRetry(() =>
    getClient().models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "image/png", data: Buffer.from(pngBuffer).toString("base64") } },
            { text: instruction },
          ],
        },
      ],
    })
  );
  return res.text ?? "";
};
