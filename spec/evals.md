# evals.md — How correctness is proven

## EVAL-1 — Confidence is real (proves CONTRACT.md INV-1)

**How to run:** for any `/query` response (or notebook `query()` call), independently recompute `cosine_similarity(query_embedding, tile_embedding)` for the returned tile and compare to the returned confidence.
**Pass condition:** equal to at least 4 decimal places.
**This is a negative test in spirit** — it exists to catch someone reverting to a hardcoded number under time pressure, not to prove the happy path works.

## EVAL-2 — Answers don't state unobserved specifics (proves CONTRACT.md INV-2)

**How to run:** manual review. Read every answer template in the codebase. For each specific number or claim, confirm there's a corresponding computed value in the response object it could have come from.
**Pass condition:** zero invented specifics. A qualitative claim ("shows visible damage") is fine; a specific unverified percentage is not, unless something actually computed that percentage.
**Known current violation:** `SatQuery-AI-UX-Prototype.html`'s scripted answer for the agri-insurance example states "roughly 12% of the field" — this is illustrative copy for a presentation mockup, not a claim from the real system. Do not carry this pattern into `backend/main.py`'s real answer templates.

## Test queries (M0-DATA-02 / M0-ML-03)

Fill this table in as the team runs M0. Ten rows, real results, not assumed.

| # | Query | Expected vertical | Retrieved tile | Confidence | Correct? (Y/N) |
|---|---|---|---|---|---|
| 1 | "Does this field show crop damage?" | agri | | | |
| 2 | "Show construction beyond this boundary." | land | | | |
| 3 | "What changed around this mining lease?" | mining | | | |
| 4 | "Which areas changed after the flood?" | flood | | | |
| 5 | | | | | |
| 6 | | | | | |
| 7 | | | | | |
| 8 | | | | | |
| 9 | | | | | |
| 10 | | | | | |

M0's exit criteria requires ≥8/10 "Y" in the last column. Queries 5–10 should be written by whoever picks up M0-DATA-02, ideally including a couple of intentionally ambiguous or hard ones — a demo that's only ever tested on easy inputs teaches you nothing about what will happen live.

## Pre-demo gate

Before M3's rehearsal (`spec/smoke.md`), confirm:
- [ ] EVAL-1 passes for at least 3 spot-checked queries
- [ ] EVAL-2 review completed for whatever answer logic is actually shipping
- [ ] The test query table above has ≥8/10 correct
