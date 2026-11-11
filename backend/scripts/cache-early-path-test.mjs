import redisClient, { connectRedis } from "../config/redis.js";
import { getCache, setCache } from "../utils/cache.js";
import { createChatCacheKey } from "../utils/cacheKey.js";
import { runRagPipeline } from "../utils/ai/lc/rag.js";

const userId = "test-user-cache";
const documentId = "test-document-cache";
const question = "Standalone cache fast path test";

const key = createChatCacheKey(userId, documentId, question);

await connectRedis();

if (!redisClient.isReady) {
  throw new Error("Redis is not ready");
}

const expectedAnswer = "ISOLATED_REDIS_CACHE_TEST_OK";

await setCache(key, {
  answer: expectedAnswer,
  sources: [{ pageNumber: 1 }],
});

let cacheLookupCalls = 0;

const cacheLookup = async ({ isFollowUp }) => {
  cacheLookupCalls++;

  if (isFollowUp) return null;

  const cached = await getCache(key);

  return cached
    ? { ...cached, cachedData: cached }
    : null;
};

const result = await runRagPipeline({
  question,
  history: [],
  documentId,
  userId,
  cacheLookup,
});

console.log({
  answer: result.answer,
  fromCache: result.fromCache,
  isFollowUp: result.isFollowUp,
  cacheLookupCalls,
  passed: result.answer === expectedAnswer && result.fromCache === true,
});

await redisClient.quit();
