process.env.GEMINI_API_KEY = "test";
process.env.JWT_SECRET = "s";
import express from "express";
import mongoose from "mongoose";
import { __setClientForTests } from "../utils/ai/genai.js";
import { HybridRetriever } from "../utils/ai/lc/retriever.js";
import DocumentChunk from "../models/DocumentChunk.js";
import Document from "../models/Document.js";
import ChatHistory from "../models/ChatHistory.js";
import Quiz from "../models/Quiz.js";
import FlashCard from "../models/Flashcard.js";
import { chunkPages } from "../utils/textChunker.js";
import { bm25Rank } from "../utils/ai/bm25.js";
import { reciprocalRankFusion } from "../utils/ai/retrieval.js";
import * as geminiService from "../utils/geminiService.js";
import { chat, chatStream, agent } from "../controllers/aiController.js";

let pass = 0, fail = 0;
const ok = (c, name) => { c ? pass++ : (fail++, console.log("FAIL:", name)); console.log(c ? "ok  " : "FAIL", name); };

// ---------- fake Gemini ----------
// 1) embeddings go through our own @google/genai client -> replaced by a tiny fake
// 2) chat/structured/agent calls go through the REAL LangChain ChatGoogleGenerativeAI,
//    pointed (GEMINI_BASE_URL) at a local mock of the Gemini REST API.
import http from "http";
const dim = 768;
const vec = (text) => { const v = new Array(dim).fill(0); for (const w of text.toLowerCase().split(/\W+/)) { let h = 0; for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) % dim; v[h] += 1; } return v; };
__setClientForTests({ models: { embedContent: async ({ contents }) => ({ embeddings: contents.map((t) => ({ values: vec(typeof t === "string" ? t : t.parts[0].text) })) }) } });

const reqLog = [];
const reply = (parts) => ({ candidates: [{ content: { role: "model", parts }, finishReason: "STOP", index: 0 }], usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 } });
const mock = http.createServer((req, res) => {
  let raw = ""; req.on("data", (d) => (raw += d)); req.on("end", () => {
    const body = JSON.parse(raw || "{}");
    const streaming = req.url.includes("streamGenerateContent");
    const decls = body.tools?.flatMap((t) => t.functionDeclarations || []) || [];
    const lastParts = body.contents?.[body.contents.length - 1]?.parts || [];
    const lastText = lastParts.map((p) => p.text || "").join(" ");
    const toolRounds = (body.contents || []).filter((c) => c.parts?.some((p) => p.functionResponse)).length;
    let out;
    const names = decls.map((d) => d.name);
    // LangChain's withStructuredOutput may use function-calling OR Gemini's JSON-schema mode - support both
    const schema = body.generationConfig?.responseJsonSchema || body.generationConfig?.responseSchema;
    const keys = Object.keys(schema?.properties || {});
    const jsonKind = keys.includes("questions") ? "quiz" : keys.includes("cards") ? "flashcards" : keys.includes("searchQuery") ? "query_rewrite" : keys.includes("scores") ? "rerank" : null;
    const structured = jsonKind || (names.length === 1 && ["quiz", "flashcards", "query_rewrite", "rerank"].includes(names[0]) ? names[0] : null);
    reqLog.push({ url: req.url, tools: structured ? [structured] : names, mode: jsonKind ? "json" : decls.length ? "tools" : "text" });
    if (structured) {
      const n = structured;
      const args = n === "quiz" ? { questions: [
        { question: "What is a circular list?", options: ["A", "B", "C", "D"], correctOptionIndex: 2, explanation: "x", difficulty: "easy" },
        { question: "bad one", options: ["A", "A", "B"], correctOptionIndex: 0, explanation: "x", difficulty: "weird" },
        { question: "Q3", options: ["1", "2", "3", "4"], correctOptionIndex: 9, explanation: "x", difficulty: "hard" },
        { question: "Q4", options: ["w", "x", "y", "z"], correctOptionIndex: 0, explanation: "x", difficulty: "hard" }] }
        : n === "flashcards" ? { cards: [{ question: "Q", answer: "A", difficulty: "nope" }, { question: "", answer: "x", difficulty: "easy" }] }
        : n === "query_rewrite" ? { isFollowUp: /\bit\b/i.test(lastText), searchQuery: "circular linked list advantages" }
        : { scores: Array.from({ length: (lastText.match(/^\[\d+\]/gm) || []).length }, (_, i) => ({ id: i, score: 10 - i })) };
      out = jsonKind ? reply([{ text: JSON.stringify(args) }]) : reply([{ functionCall: { name: n, args } }]);
    } else if (names.length) {
      if (!toolRounds) out = reply([{ functionCall: { name: "create_quiz", args: { numQuestions: 2 } } }]);
      else if (toolRounds === 1) out = reply([{ functionCall: { name: "create_flashcards", args: { count: 3 } } }]);
      else out = reply([{ text: "I created a quiz and flashcards for you." }]);
    } else {
      out = reply([{ text: "Circular lists form a loop [Page 1]. Operations are insertion and deletion [Page 2]." }]);
    }
    if (streaming) {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const text = out.candidates[0].content.parts[0].text || "";
      const pieces = text.match(/.{1,20}/g) || [""];
      pieces.forEach((t) => res.write(`data: ${JSON.stringify(reply([{ text: t }]))}\r\n\r\n`));
      res.end();
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
    }
  });
});
await new Promise((r) => mock.listen(0, r));
process.env.GEMINI_BASE_URL = `http://localhost:${mock.address().port}`;
process.env.GEMINI_API_KEY = "test";

// ---------- 1. chunker ----------
const pages = [
  { num: 1, text: "Circular Linked List\nWhat is a circular linked list? It is a list in which the last node points to the first node. This makes it a circle.\n\n1. Insertion\nInsertion can happen at the beginning. It can happen at the end too. " + "Filler sentence number one. ".repeat(60) },
  { num: 2, text: "1. Deletion\nDeletion removes a node. Pointers must be updated carefully.\n-- 2 of 2 --" },
];
const ch = chunkPages(pages);
ok(ch.length >= 2, `chunker produced ${ch.length} chunks`);
ok(ch.every((c) => c.pageNumber === 1 || c.pageNumber === 2), "pageNumber kept");
ok(ch.some((c) => c.heading.includes("Insertion")), "heading tracked");
ok(!ch.some((c) => /-- 2 of 2 --/.test(c.content)), "page marker stripped");
ok(Math.max(...ch.map((c) => c.content.split(/\s+/).length)) <= 330, "chunk size bounded");

// ---------- 2. bm25 + rrf ----------
const docs = [{ content: "stack push pop", chunkIndex: 0 }, { content: "circular linked list insertion", chunkIndex: 1 }, { content: "queue enqueue", chunkIndex: 2 }];
ok(bm25Rank("circular list", docs)[0].chunkIndex === 1, "bm25 ranks best doc first");
const fused = reciprocalRankFusion([[{ chunkIndex: 5 }, { chunkIndex: 7 }], [{ chunkIndex: 7 }, { chunkIndex: 9 }]]);
ok(fused[0].chunkIndex === 7, "RRF favours doc ranked by both lists");

// ---------- 3. structured output ----------
const quiz = await geminiService.generateQuiz("text", 5);
ok(quiz.length === 2 && quiz[0].correctAnswer === "C", "quiz: invalid items dropped, correctAnswer derived from index");
const cards = await geminiService.generateFlashcards("text", 5);
ok(cards.length === 1 && cards[0].difficulty === "medium", "flashcards: bad difficulty normalised, empty dropped");

// ---------- 4. mock Mongo models ----------
const uid = new mongoose.Types.ObjectId(), did = new mongoose.Types.ObjectId();
const stored = chunkPages([
  { num: 1, text: "Circular Linked List\nA circular linked list connects the last node to the first node. There is no null pointer at the end." },
  { num: 2, text: "Operations\nInsertion and deletion are the main operations. Traversal stops when we return to the head node." },
  { num: 3, text: "Stack\nA stack is LIFO. Push and pop run in constant time." },
]).map((c, i) => ({ _id: new mongoose.Types.ObjectId(), ...c, chunkIndex: i, embedding: vec(`${c.heading} ${c.content}`), documentId: did, userId: uid }));
const q = (rows) => { const o = { select: () => o, sort: () => o, lean: async () => rows, then: (r) => r(rows) }; return o; };
DocumentChunk.find = () => q(stored);
DocumentChunk.aggregate = async () => { throw new Error("not Atlas"); }; // forces cosine fallback
const docRow = { _id: did, title: "DS", extractedText: "Circular linked list text. ".repeat(20), status: "ready" };
Document.findOne = async () => docRow;
const hist = { messages: [], save: async function () {} , _id: "h1" };
ChatHistory.findOne = async () => hist;
ChatHistory.create = async () => hist;
let savedQuiz, savedCards;
Quiz.create = async (d) => (savedQuiz = { _id: "q1", ...d });
FlashCard.create = async (d) => (savedCards = { _id: "f1", ...d });

// ---------- 5. controllers over real HTTP ----------
const app = express(); app.use(express.json());
app.use((req, _res, next) => { req.user = { _id: uid }; next(); });
app.post("/chat", chat); app.post("/chat/stream", chatStream); app.post("/agent", agent);
const server = app.listen(0); const base = `http://localhost:${server.address().port}`;
const post = (p, body) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

let r = await post("/chat", { documentId: String(did), question: "What is a circular linked list?" });
let j = await r.json();
ok(r.status === 200 && j.success && /\[Page 1\]/.test(j.data.answer), "POST /chat JSON works");
ok(j.data.sources.length >= 1 && j.data.sources[0].snippet, "chat returns cited sources with snippet");

r = await post("/chat/stream", { documentId: String(did), question: "What is a circular linked list?" });
ok(/text\/event-stream/.test(r.headers.get("content-type")), "stream content-type is SSE");
const body = await r.text();
const events = [...body.matchAll(/event: (\w+)\ndata: (.*)\n\n/g)].map((m) => [m[1], JSON.parse(m[2])]);
ok(events.some(([e]) => e === "status"), "SSE status events");
ok(events.filter(([e]) => e === "token").length >= 3, "SSE token events (streamed in pieces)");
const done = events.find(([e]) => e === "done");
ok(done && done[1].answer.includes("form a loop") && Array.isArray(done[1].sources), "SSE done event has full answer + sources");

r = await post("/chat/stream", { documentId: String(did) });
ok(r.status === 400, "stream validates input (400)");

r = await post("/agent", { documentId: String(did), question: "make me a quiz and flashcards" });
j = await r.json();
ok(j.success && j.data.actions.length === 2 && j.data.actions[0].link === "/quizzes/q1", "agent chained create_quiz -> create_flashcards");
ok(savedQuiz?.questions.length === 2 && savedCards?.cards.length === 1, "agent saved quiz + flashcards to DB models");
ok(/created a quiz/.test(j.data.answer), "agent final answer returned");

// LangChain-specific checks
const docsOut = await new HybridRetriever({ documentId: String(did), userId: String(uid), topK: 2 }).invoke("circular linked list");
ok(docsOut.length > 0 && docsOut[0].pageContent && docsOut[0].metadata.pageNumber, "HybridRetriever returns LangChain Documents with pageNumber metadata");
ok(reqLog.some((r) => r.tools.includes("create_quiz")), "agent bound tools via real ChatGoogleGenerativeAI.bindTools");
ok(reqLog.some((r) => r.url.includes("streamGenerateContent")), "chat used real LangChain streaming");
ok(reqLog.some((r) => r.tools.includes("rerank")), "rerank used withStructuredOutput");

console.log(`\n${pass} passed, ${fail} failed`);
server.close(); mock.close(); process.exit(fail ? 1 : 0);
