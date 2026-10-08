// backend/utils/ai/bm25.js
// Tiny dependency-free BM25 keyword ranker. Documents are small (tens/hundreds of
// chunks), so doing this in memory is fast and needs no extra Atlas Search index.

const STOP = new Set(
  "a an and are as at be by for from has have in is it its of on or that the this to was were will with what which who how why when where do does did can could should would about into than then them they their there these those i you he she we not no yes if but so such".split(" ")
);

export const tokenize = (text = "") =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s+#.-]/gu, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((t) => t.length > 1 && !STOP.has(t));

export const bm25Rank = (query, docs, { k1 = 1.4, b = 0.75, limit = 20 } = {}) => {
  const qTokens = [...new Set(tokenize(query))];
  if (!qTokens.length || !docs.length) return [];

  const tokenized = docs.map((d) => tokenize(d.content));
  const avgLen = tokenized.reduce((s, t) => s + t.length, 0) / docs.length || 1;

  const df = new Map();
  for (const tokens of tokenized) {
    for (const t of new Set(tokens)) df.set(t, (df.get(t) || 0) + 1);
  }

  const N = docs.length;
  const scored = docs.map((doc, i) => {
    const tokens = tokenized[i];
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);

    let score = 0;
    for (const q of qTokens) {
      const f = tf.get(q);
      if (!f) continue;
      const n = df.get(q) || 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * tokens.length) / avgLen)));
    }
    return { doc, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => ({ ...s.doc, keywordScore: s.score }));
};
