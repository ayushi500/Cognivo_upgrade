import dotenv from "dotenv";
dotenv.config();

import { createClient } from "redis";

// Redis is only a cache. If it is missing or unreachable the app keeps working
// (answers just aren't cached), so a Redis problem can never stop the project from starting.
const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    connectTimeout: 5000,
    // try a few times, then give up quietly instead of crashing / spamming the console
    reconnectStrategy: (retries) => (retries >= 3 ? false : Math.min(retries * 500, 2000)),
  },
});

let warned = false;
redisClient.on("error", (error) => {
  if (!warned) {
    warned = true;
    console.warn("Redis unavailable - continuing without cache:", error.message);
  }
});

export const connectRedis = async () => {
  if (!process.env.REDIS_URL) {
    console.warn("REDIS_URL not set - continuing without cache");
    return;
  }
  if (!redisClient.isOpen) {
    try {
      await redisClient.connect();
      console.log("Redis connected successfully");
    } catch (error) {
      console.warn("Could not connect to Redis - continuing without cache:", error.message);
    }
  }
};

export default redisClient;
