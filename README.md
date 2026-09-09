# SatQuery AI

Natural-language query interface over satellite imagery — SIH26167, ISRO. Ask a plain-language question about a region, get an answer grounded in retrieved evidence.

**Building this?** Start at `BRIEF.md`, not here — this file is for anyone arriving from outside the build (the mentor, a judge browsing the repo). `BRIEF.md` is the working dashboard for the team.

## Quick links

- `docs/` — the submitted idea presentation (pptx + pdf)
- `frontend/index.html` — the presentation UX prototype (open directly in a browser, no setup)
- `notebooks/satquery_pipeline.ipynb` — the real retrieval pipeline (run in Google Colab with GPU)
- `spec/` — the full project spec: product, architecture, plan, tasks, evals

## What's real vs. illustrative right now

`frontend/index.html` currently ships with scripted example responses for the presentation. `notebooks/satquery_pipeline.ipynb` is the real thing — actual retrieval over actual image embeddings. See `CONTRACT.md` for exactly what that distinction means and why it matters.
