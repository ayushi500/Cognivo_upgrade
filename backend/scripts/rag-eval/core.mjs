
export const mean = (values) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;

export const percentile = (values, p) => {
  if (!values.length) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );

  return sorted[index];
};

export const relevant = (chunk, question) =>
  (!question.goldPages?.length ||
    question.goldPages.includes(Number(chunk.pageNumber))) &&
  (!question.mustContain?.length ||
    question.mustContain.some((term) =>
      String(chunk.content || "")
        .toLowerCase()
        .includes(term.toLowerCase())
    ));

export function metrics(ranked, question, allChunks, ks) {
  const relevance = ranked.map((chunk) => relevant(chunk, question));
  const totalRelevant = allChunks.filter((chunk) =>
    relevant(chunk, question)
  ).length;

  const firstRelevant = relevance.indexOf(true);
  const atK = {};

  for (const k of ks) {
    const top = ranked.slice(0, k);
    const rel = relevance.slice(0, k);

    const hits = rel.filter(Boolean).length;

    const dcg = rel.reduce(
      (sum, isRelevant, index) =>
        sum + (isRelevant ? 1 / Math.log2(index + 2) : 0),
      0
    );

    let idcg = 0;
    for (let i = 0; i < Math.min(k, totalRelevant); i++) {
      idcg += 1 / Math.log2(i + 2);
    }

    const relevantPages = new Set(
      top.filter((chunk, i) => rel[i]).map((chunk) => chunk.pageNumber)
    );

    atK[k] = {
      hit: Number(hits > 0),
      precision: hits / k,
      recall: question.goldPages?.length
        ? relevantPages.size / question.goldPages.length
        : Number(hits > 0),
      ndcg: idcg ? dcg / idcg : 0,
    };
  }

  return {
    mrr: firstRelevant < 0 ? 0 : 1 / (firstRelevant + 1),
    atK,
    firstRank: firstRelevant < 0 ? null : firstRelevant + 1,
  };
}

export const summarize = (rows, modes, ks) =>
  Object.fromEntries(
    modes.map((mode) => {
      // evaluate.mjs stores results inside row.modes
      const results = rows
        .map((row) => row.modes?.[mode] ?? row[mode])
        .filter((result) => result && !result.error);

      return [
        mode,
        {
          n: results.length,
          errors: rows.length - results.length,
          mrr: mean(results.map((result) => result.mrr)),
          latency: {
            p50: percentile(results.map((result) => result.ms), 50),
            p95: percentile(results.map((result) => result.ms), 95),
          },
          atK: Object.fromEntries(
            ks.map((k) => [
              k,
              Object.fromEntries(
                ["hit", "recall", "precision", "ndcg"].map((metric) => [
                  metric,
                  mean(results.map((result) => result.atK[k][metric])),
                ])
              ),
            ])
          ),
        },
      ];
    })
  );
