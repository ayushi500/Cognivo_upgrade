import redisClient from "../config/redis.js";
import { performance } from "node:perf_hooks";

const key = "cognivo:benchmark:test";
const value = JSON.stringify({ answer: "Redis benchmark test", timestamp: Date.now() });

try {
  if (!redisClient.isOpen) await redisClient.connect();

  // Write test
  await redisClient.set(key, value);

  // Verify
  const result = await redisClient.get(key);
  if (result !== value) throw new Error("Redis value mismatch");

  // Warm-up
  for (let i = 0; i < 10; i++) await redisClient.get(key);

  // Benchmark 100 GETs
  const times = [];
  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    await redisClient.get(key);
    times.push(performance.now() - start);
  }

  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;

  console.log("\n--- Redis Benchmark ---");
  console.log("SET + GET verification: PASS");
  console.log("GET operations: 100");
  console.log("Average latency:", avg.toFixed(3), "ms");
  console.log("p50:", times[49].toFixed(3), "ms");
  console.log("p95:", times[94].toFixed(3), "ms");

  await redisClient.del(key);
} catch (error) {
  console.error("Benchmark failed:", error.message);
} finally {
  if (redisClient.isOpen) await redisClient.quit();
}
