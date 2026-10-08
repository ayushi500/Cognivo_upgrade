
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

import { getChatModel, askStructured } from "./models.js";
import { rewriteSchema } from "./schemas.js";
import { HybridRetriever, docToChunk } from "./retriever.js";


export const NOT_FOUND =
  "The information is not available in the document.";


// ------------------------------------------------------------------
// Utility: sampleText
// ------------------------------------------------------------------

export const sampleText = (
  text = "",
  max = Number(process.env.MAX_CONTEXT_CHARS || 60000)
) => {
  if (text.length <= max) return text;

  // Evenly spaced slices so quizzes/summaries cover
  // the whole document instead of only the first pages.

  const parts = 6;
  const size = Math.floor(max / parts);
  const step = Math.floor((text.length - size) / (parts - 1));

  return Array.from(
    { length: parts },
    (_, i) => text.slice(i * step, i * step + size)
  ).join("\n\n[...]\n\n");
};


// ------------------------------------------------------------------
// Prompt
// ------------------------------------------------------------------

const SYSTEM = `You are an AI learning assistant that answers ONLY from the provided context blocks.

Rules:

- Never invent facts. If the answer is not in the context, reply exactly: "${NOT_FOUND}"

- Every context block starts with an authoritative tag like [Source: Page 7]. Use ONLY that number as the page.

- Cite claims inline as [Page 7]. If several pages support a claim, cite all of them: [Page 3] [Page 7].

- NEVER use page numbers that appear inside the document text, and NEVER write "[Source: Page X]".

- Use clear Markdown (short paragraphs, bullet points, code blocks) and keep the answer focused.`;


export const answerPrompt = ChatPromptTemplate.fromMessages([
  ["system", SYSTEM],

  [
    "human",
    "{history}Context:\n{context}\n\nQuestion: {question}\n\nAnswer:"
  ],
]);


// ------------------------------------------------------------------
// Context formatting
// ------------------------------------------------------------------

export const formatContext = (chunks) =>
  chunks
    .map(
      (c) =>
        `[Source: Page ${c.pageNumber}]${
          c.heading ? ` (Section: ${c.heading})` : ""
        }\n${c.content}`
    )
    .join("\n\n---\n\n");


// ------------------------------------------------------------------
// Conversation history formatting
// ------------------------------------------------------------------

export const formatHistory = (history = []) => {
  const lines = history
    .slice(-4)
    .map(
      (m) =>
        `${m.role === "user" ? "User" : "Assistant"}: ${String(
          m.content
        ).slice(0, 400)}`
    )
    .join("\n");

  return lines
    ? `Previous conversation:\n${lines}\n\n`
    : "";
};


// ------------------------------------------------------------------
// Extract cited sources
// ------------------------------------------------------------------

export const extractSources = (answer, chunks) => {
  const cited = new Set(
    [
      ...answer.matchAll(/\[Page\s+(\d+)\]/gi)
    ].map((m) => Number(m[1]))
  );

  const seen = new Set();

  return chunks
    .filter((c) => cited.has(c.pageNumber))
    .filter((c) =>
      seen.has(c.chunkIndex)
        ? false
        : seen.add(c.chunkIndex)
    )
    .map((c) => ({
      pageNumber: c.pageNumber,
      chunkIndex: c.chunkIndex,
      heading: c.heading || "",
      score: c.score,
      snippet: c.content
        .replace(/\s+/g, " ")
        .slice(0, 180),
    }));
};


// ------------------------------------------------------------------
// Query rewriting
// ------------------------------------------------------------------

export const rewriteQuery = async (
  question,
  chatHistory = []
) => {

  // No conversation history means this cannot
  // be a follow-up question.

  if (!chatHistory?.length) {
    return {
      searchQuery: question,
      isFollowUp: false,
    };
  }


  const historyText = chatHistory
    .slice(-6)
    .map(
      (m) =>
        `${m.role}: ${String(m.content).slice(0, 500)}`
    )
    .join("\n");


  const prompt = `Decide whether the latest question depends on the previous conversation

(pronouns like "it", "that", "this", "explain more", "its advantages"...).

Then write a standalone search query that contains the missing context.

If it does not depend on the conversation, keep the question as the search query.

Conversation:

${historyText}

Latest question: ${question}`;


  try {

    const out = await askStructured(
      prompt,
      rewriteSchema,
      {
        name: "query_rewrite",
        temperature: 0,
      }
    );


    return {
      isFollowUp: Boolean(out.isFollowUp),

      searchQuery:
        String(out.searchQuery || question).trim() ||
        question,
    };

  } catch (error) {

    console.warn(
      "Query rewrite failed, using the raw question:",
      error.message
    );

    return {
      searchQuery: question,
      isFollowUp: false,
    };
  }
};


// ------------------------------------------------------------------
// Main RAG pipeline
// ------------------------------------------------------------------

export const runRagPipeline = async ({
  question,
  history = [],
  documentId,
  userId,
  onToken,
  onStatus,
  signal,
  cacheLookup,
}) => {

  // ================================================================
  // STEP 1 — REWRITE
  // ================================================================

  onStatus?.("Understanding your question…");


  const {
    searchQuery,
    isFollowUp,
  } = await rewriteQuery(
    question,
    history
  );


  // ================================================================
  // STEP 2 — CACHE
  // ================================================================

  let cached = null;


  if (cacheLookup) {

    cached = await cacheLookup({
      isFollowUp,
      searchQuery,
    });

  }


  // ------------------------------------------------
  // CACHE HIT
  // ------------------------------------------------

  if (cached) {

    return {
      answer: cached.answer || "",

      sources: cached.sources || [],

      chunks: [],

      searchQuery,

      isFollowUp,

      ...cached,

      answer: cached.answer || "",

      sources: cached.sources || [],

      fromCache: true,
    };

  }


  // ================================================================
  // STEP 3 — RETRIEVE
  // ================================================================

  const retriever = new HybridRetriever({

    documentId: String(documentId),

    userId: String(userId),

    topK: 4,

    onStep: onStatus,
  });


  const docs = await retriever.invoke(
    searchQuery
  );


  const chunks = docs.map(docToChunk);


  // ================================================================
  // STEP 4 — NO DOCUMENTS FOUND
  // ================================================================

  if (!chunks.length) {

    onToken?.(NOT_FOUND);

    return {
      answer: NOT_FOUND,

      sources: [],

      chunks: [],

      searchQuery,

      isFollowUp,
    };

  }


  // ================================================================
  // STEP 5 — GENERATE ANSWER
  // ================================================================

  onStatus?.("Writing the answer…");


  const chain = answerPrompt
    .pipe(
      getChatModel({
        temperature: 0.3,
      })
    )
    .pipe(
      new StringOutputParser()
    );


  const input = {

    history: isFollowUp
      ? formatHistory(history)
      : "",

    context: formatContext(chunks),

    question: isFollowUp
      ? searchQuery
      : question,
  };


  // ================================================================
  // STEP 6 — STREAM ANSWER
  // ================================================================

  let answer = "";


  if (onToken) {

    for await (
      const piece of await chain.stream(
        input,
        { signal }
      )
    ) {

      if (signal?.aborted) {
        break;
      }


      answer += piece;

      onToken(piece);
    }

  } else {

    answer = await chain.invoke(
      input,
      { signal }
    );

  }


  // ================================================================
  // STEP 7 — EXTRACT SOURCES
  // ================================================================

  const sources = extractSources(
    answer,
    chunks
  );


  // ================================================================
  // STEP 8 — RETURN RESULT
  // ================================================================

  return {

    answer,

    sources,

    chunks,

    searchQuery,

    isFollowUp,
  };
};

