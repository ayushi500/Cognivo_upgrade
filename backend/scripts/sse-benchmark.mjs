import { performance } from "node:perf_hooks";

const base = "http://localhost:8000";
const token = process.env.COGNIVO_TOKEN;

if (!token) throw new Error("COGNIVO_TOKEN missing");

const body = {
  documentId: "6ac7d948e95dae0ef3c65a18",
  question: "Explain the main objective of this TMS project."
};

const start = performance.now();
let firstToken = null;
let tokenEvents = 0;
let chars = 0;
let answer = "";

const response = await fetch(`${base}/api/ai/chat/stream`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(body)
});

console.log("HTTP:", response.status);

if (!response.ok) {
  console.log(await response.text());
  process.exit(1);
}

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";

while (true) {
  const { value, done } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });

  const events = buffer.split("\n\n");
  buffer = events.pop();

  for (const event of events) {
    const lines = event.split("\n");
    const eventName = lines.find(l => l.startsWith("event:"))?.slice(6).trim();
    const dataLine = lines.find(l => l.startsWith("data:"))?.slice(5).trim();

    if (!eventName || !dataLine) continue;

    const data = JSON.parse(dataLine);
    const now = performance.now();

    if (eventName === "token") {
      if (firstToken === null) firstToken = now - start;
      tokenEvents++;
      chars += data.text?.length || 0;
      answer += data.text || "";
    }

    if (eventName === "done") {
      console.log("DONE received");
    }

    if (eventName === "error") {
      console.log("ERROR:", data.message);
    }
  }
}

const total = performance.now() - start;

console.log("\n--- SSE BENCHMARK ---");
console.log("TTFT:", firstToken?.toFixed(2), "ms");
console.log("Total time:", total.toFixed(2), "ms");
console.log("Token events:", tokenEvents);
console.log("Answer characters:", chars);
console.log("Throughput:", (chars / (total / 1000)).toFixed(2), "chars/sec");
console.log("Answer preview:", answer.slice(0, 150));
