import crypto from "crypto";

export const createChatCacheKey = (
  userId,
  documentId,
  question
) => {
  const normalizedQuestion = question
    .trim()
    .toLowerCase();

  const questionHash = crypto
    .createHash("sha256")
    .update(normalizedQuestion)
    .digest("hex");

  return `cognivo:chat:${userId}:${documentId}:${questionHash}`;
};