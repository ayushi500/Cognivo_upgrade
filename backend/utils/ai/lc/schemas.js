// backend/utils/ai/lc/schemas.js
// Zod schemas used with LangChain's withStructuredOutput().
import { z } from "zod";

// lenient on purpose: the service normalises the value, so one odd answer never fails the whole request
const difficulty = z.string().describe("one of: easy, medium, hard");

export const flashcardsSchema = z.object({
  cards: z.array(
    z.object({
      question: z.string().describe("A specific, self-contained question"),
      answer: z.string().describe("A concise, accurate answer"),
      difficulty,
    })
  ),
});

export const quizSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      options: z.array(z.string()).describe("Exactly 4 distinct answer options"),
      correctOptionIndex: z.number().int().describe("0-based index of the single correct option"),
      explanation: z.string().describe("One or two sentences explaining the answer"),
      difficulty,
    })
  ),
});

export const rewriteSchema = z.object({
  isFollowUp: z.boolean().describe("true if the latest question depends on the previous conversation"),
  searchQuery: z.string().describe("A standalone search query containing all needed context"),
});

export const rerankSchema = z.object({
  scores: z.array(
    z.object({
      id: z.number().int().describe("Passage number"),
      score: z.number().int().describe("0 (irrelevant) to 10 (directly answers the question)"),
    })
  ),
});
