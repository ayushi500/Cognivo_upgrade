import redisClient from "../config/redis.js";

export const getCache = async (key) => {
  if (!redisClient.isReady) return null; // Redis is optional
  try {
    const data = await redisClient.get(key);

    if (!data) {
      return null;
    }

    return JSON.parse(data);
  } catch (error) {
    console.error("Redis GET error:", error);
    return null;
  }
};

export const setCache = async (key, data, ttl = 1800) => {
  if (!redisClient.isReady) return; // Redis is optional
  try {
    await redisClient.setEx(
      key,
      ttl,
      JSON.stringify(data)
    );
  } catch (error) {
    console.error("Redis SET error:", error);
  }
};