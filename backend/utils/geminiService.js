// backend/utils/geminiService.js

// Facade with the SAME exported names as before, so controllers don't change.
//
// Generation now goes through LangChain
// (ChatGoogleGenerativeAI + zod structured output).
//
// The chat pipeline is implemented using LangChain +
// normal async JavaScript flow in ./ai/lc/rag.js.

import {
  askText,
  askStructured,
  getChatModel,
} from "./ai/lc/models.js";

import {
  flashcardsSchema,
  quizSchema,
} from "./ai/lc/schemas.js";

import {
  runRagPipeline,
  rewriteQuery,
  sampleText,
  answerPrompt,
  formatContext,
  formatHistory,
  extractSources,
} from "./ai/lc/rag.js";

import { StringOutputParser } from "@langchain/core/output_parsers";

export { sampleText, rewriteQuery, runRagPipeline };

const DIFFICULTIES = ["easy", "medium", "hard"];

const cleanDifficulty = (d) =>
  DIFFICULTIES.includes(String(d).toLowerCase())
    ? String(d).toLowerCase()
    : "medium";

/* ---------------------------- Flashcards ---------------------------- */

export const generateFlashcards = async (text, count = 10) => {
  const prompt = `Create exactly ${count} study flashcards from the text below.

Cover the whole text (not only the beginning). Questions must be specific and self-contained;
answers concise and accurate. Mix easy, medium and hard difficulty.

Text:

${sampleText(text)}`;

  try {
    const { cards } = await askStructured(
      prompt,
      flashcardsSchema,
      { name: "flashcards" }
    );

    const clean = (Array.isArray(cards) ? cards : [])
      .map((c) => ({
        question: String(c.question || "").trim(),
        answer: String(c.answer || "").trim(),
        difficulty: cleanDifficulty(c.difficulty),
      }))
      .filter((c) => c.question && c.answer)
      .slice(0, count);

    if (!clean.length) {
      throw new Error("No flashcards returned");
    }

    return clean;
  } catch (error) {
    console.error("Flashcards error:", error);
    throw new Error("Failed to generate flashcards");
  }
};

/* ------------------------------- Quiz ------------------------------- */

export const generateQuiz = async (text, numQuestions = 5) => {
  const prompt = `Create exactly ${numQuestions} multiple-choice questions from the text below.

Rules: exactly 4 distinct options per question, exactly one correct option
(give its 0-based index in correctOptionIndex), plausible wrong options,
a short explanation, and a mix of difficulties.

Cover the whole text, not only the beginning.

Text:

${sampleText(text)}`;

  try {
    const { questions: raw } = await askStructured(
      prompt,
      quizSchema,
      { name: "quiz" }
    );

    const questions = (Array.isArray(raw) ? raw : [])
      .map((q) => {
        const original = (q.options || []).map((o) => String(o).trim());
        const options = [...new Set(original.filter(Boolean))];
        const idx = Number(q.correctOptionIndex);

        return {
          question: String(q.question || "").trim(),
          options,

          // correctAnswer is derived from the index,
          // so it ALWAYS matches one option exactly
          correctAnswer: Number.isInteger(idx)
            ? original[idx]
            : undefined,

          explanation: String(q.explanation || "").trim(),
          difficulty: cleanDifficulty(q.difficulty),
        };
      })
      .filter(
        (q) =>
          q.question &&
          q.options.length === 4 &&
          q.correctAnswer &&
          q.options.includes(q.correctAnswer)
      )
      .slice(0, numQuestions);

    if (!questions.length) {
      throw new Error("No valid questions returned");
    }

    return questions;
  } catch (error) {
    console.error("Quiz error:", error);
    throw new Error("Failed to generate quiz");
  }
};

/* ------------------------------ Summary ------------------------------ */

export const generateSummary = async (text) => {
  const prompt = `Write a clear, structured summary of the document below in Markdown:

a one-paragraph overview, then the key concepts and main ideas as bullet points
(group them under short headings if the document has several topics).

Document:

${sampleText(text, 80000)}`;

  try {
    return await askText(prompt);
  } catch (error) {
    console.error("Summary error:", error);
    throw new Error("Failed to generate summary");
  }
};

/* --------------------------- Explain concept -------------------------- */

export const explainConcept = async (concept, context) => {
  const prompt = `Explain the concept "${concept}" clearly for a student, using the document excerpts below as the primary source.

Start with a simple definition, then explain in more depth, and add a short example. Use Markdown.

If the excerpts do not mention it, say so briefly and then give a short general explanation.

Document excerpts:

${context || "(no relevant excerpts found)"}`;

  try {
    return await askText(prompt);
  } catch (error) {
    console.error("Explain error:", error);
    throw new Error("Failed to explain concept");
  }
};

/* ------------------------------- Chat -------------------------------- */

// Old signature kept:
// chatWithContext(question, chunks) -> { answer, sources }

export const chatWithContext = async (
  question,
  chunks,
  history = []
) => {
  const chain = answerPrompt
    .pipe(getChatModel({ temperature: 0.3 }))
    .pipe(new StringOutputParser());

  const answer = await chain.invoke({
    history: formatHistory(history),
    context: formatContext(chunks),
    question,
  });

  return {
    answer,
    sources: extractSources(answer, chunks),
  };
};