# Cognivo RAG Evaluation
Compares retrieval variants on a reviewed golden set. This measures retrieval, **not generated-answer faithfulness**.

## Setup (backend folder)
- `npm run eval:selftest` — offline metric sanity check
- `npm run eval:list` — list document IDs/users from Mongo
- `npm run eval:draft -- --documentId ID --userId ID --n 40` — draft dataset (LLM questions; manually review!)
- `npm run eval:rag` — vector, BM25, hybrid RRF, hybrid+rerank

Dataset fields: `documentId`, `userId`, and `items[]` with `question`, `goldPages` (pages that answer it), optional `mustContain`, `type`. Aim for 30–50 reviewed questions, including paraphrase, multi-page, numeric and hard questions; test multiple PDFs.

Reports/raw JSON are saved under `results/` (gitignored). Use `--modes bm25,hybrid`, `--ks 1,3,4,5`, `--primary 4`, `--delay 500` to customize.

Metrics: Hit@K, gold-page recall, precision, nDCG, MRR, p50/p95 retrieval latency, errors. One question changes Hit@40 by 2.5 percentage points. Report only actual run values.

Resume template (fill from report): "Built a reviewed N-question golden set and benchmarked vector, BM25, RRF hybrid and reranked retrieval using Hit@4/MRR/nDCG and p50/p95 latency; observed [actual delta] and selected [design] based on quality-latency trade-off."

Note: vector baseline uses exact cosine on stored embeddings (ANN upper-bound-ish baseline), not Atlas ANN latency. LLM reranking invokes Gemini and may cost/quota.
