// backend/utils/ai/lc/models.js
// LangChain chat model factory + small helpers. All "thinking" calls (chat answers, quiz,
// flashcards, rewrite, rerank) go through LangChain models created here.
// (Embeddings and OCR vision still use our own @google/genai client in ../genai.js.)

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { MODELS, withRetry } from "../genai.js";

let override = null;
// tests inject a fake model here
export const __setChatModelForTests = (m) => {
  override = m;
};

const cache = new Map();

/** A LangChain chat model for Gemini. Retries (429/5xx) are handled by LangChain's maxRetries. */
export const getChatModel = ({ temperature = 0.3 } = {}) => {
  if (override) return override;
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set in backend/.env");
  const key = String(temperature);
  if (!cache.has(key)) {
    cache.set(
      key,
      new ChatGoogleGenerativeAI({
        model: MODELS.text,
        apiKey: process.env.GEMINI_API_KEY,
        temperature,
        maxRetries: 4,
        ...(process.env.GEMINI_BASE_URL ? { baseUrl: process.env.GEMINI_BASE_URL } : {}),
      })
    );
  }
  return cache.get(key);
};

const textOf = (msg) => {
  if (typeof msg === "string") return msg;
  if (typeof msg?.text === "string") return msg.text;
  if (typeof msg?.content === "string") return msg.content;
  if (Array.isArray(msg?.content)) return msg.content.map((p) => p?.text || "").join("");
  return "";
};
export { textOf };

/** Free-text answer from a prompt string (optionally with a system prompt). */
export const askText = async (prompt, { system, temperature } = {}) => {
  const model = getChatModel({ temperature });
  const messages = [...(system ? [["system", system]] : []), ["human", prompt]];
  return textOf(await withRetry(() => model.invoke(messages)));
};

/**
 * Structured answer: LangChain's withStructuredOutput(zodSchema) makes Gemini return
 * an object that already matches the schema (function-calling under the hood).
 * NOTE: the schema root must be an object, e.g. z.object({ cards: z.array(...) }).
 */
export const askStructured = async (prompt, schema, { name = "result", system, temperature = 0.3 } = {}) => {
  const model = getChatModel({ temperature }).withStructuredOutput(schema, { name });
  const messages = [...(system ? [["system", system]] : []), ["human", prompt]];
  return withRetry(() => model.invoke(messages));
};
