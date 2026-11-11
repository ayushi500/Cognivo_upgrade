import redisClient, { connectRedis } from "../config/redis.js";
import { getCache, setCache } from "../utils/cache.js";
import { performance } from "node:perf_hooks";

const key = "cognivo:cache-comparison:test";
const payload = { answer: "Mock cached answer", sources: [] };
const N = 100;

async function measure(fn) {
  const times = [];
  for (let i = 0; i < N; i++) {
    const start = performance.now();
    await fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return {
    avg: times.reduce((a, b) => a + b, 0) / N,
    p50: times[49],
    p95: times[94],
  };
}

try {
  await connectRedis();
  if (!redisClient.isReady) throw new Error("Redis not connected");

  await setCache(key, payload, 600);

  // Redis OFF: cache lookup returns null immediately
  await redisClient.disconnect();
  const off = await measure(() => getCache(key));

  // Redis ON: actual cached response retrieval
  await connectRedis();
  for (let i = 0; i < 10; i++) await getCache(key);

  const result = await measure(() => getCache(key));

  console.log("\n--- Cache Lookup Comparison ---");
  console.log("Redis OFF:", JSON.stringify(off));
  console.log("Redis ON:", JSON.stringify(result));
  console.log("Cached value verified:", JSON.stringify(await getCache(key)) === JSON.stringify(payload));

} catch (error) {
  console.error("Benchmark failed:", error.message);
} finally {
  if (redisClient.isReady) {
    await redisClient.del(key);
  }
  if (redisClient.isOpen) await redisClient.quit();
}
