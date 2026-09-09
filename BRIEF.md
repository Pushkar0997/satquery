# BRIEF — SatQuery AI

**What this is:** a natural-language query interface over satellite imagery — ask a plain-language question about a region, get an answer grounded in retrieved evidence, not a GIS dashboard. Built for SIH26167 (ISRO), currently prepping the internal-round prototype demo.

**Team:** 6 people. Lead decides minor calls (with Claude's help); major calls need team consensus; mentor guidance overrides both. See `AGENTS.md` §7.

**Timeline:** 2 days, everyone building in parallel. This is the whole runway — do not let spec ceremony eat it. Read `spec/plan.md`, pick an unclaimed task in `spec/tasks.md`, go.

---

## Current milestone: M0 — Retrieval proven on real images

**Exit criteria:** `SatQuery-AI-Pipeline.ipynb` runs end-to-end in Colab on ≥15 real demo images across ≥2 verticals, and top-1 retrieval is visibly correct for ≥8 of 10 test queries.

**Done so far:**
- Deck finalized and submitted (`SIH26167-SatQuery-AI-Idea-Presentation.pptx`)
- UX prototype built (`SatQuery-AI-UX-Prototype.html`) — presentation mockup, scripted data, NOT the real backend
- Retrieval pipeline written (`SatQuery-AI-Pipeline.ipynb`) — not yet run against real data by the team

**Not done / next:**
- Nobody has run the notebook yet. First task for whoever picks up ML.
- 4 seed images already exist in `data/tiles/` (from the deck's own imagery) — enough to test the pipeline mechanics immediately, but M0 needs 15-20 across ≥2 verticals, so more curation is still required.

---

## Copy-paste prompt to hand an agent right now

```
Read AGENTS.md, then CONTRACT.md, then spec/plan.md and spec/tasks.md.
Current milestone is M0. Pick up task M0-DATA-01: curate 15-20 real
satellite/aerial demo images across at least 2 of the 4 verticals
(agri-insurance, land records, mining compliance, disaster response),
save them into /data/tiles/, and update AGENT_LOG.md when done.
```

---

## Three things most likely to break

1. **Nobody actually runs the notebook until the night before.** It's untested by the team — treat "the pipeline is written" and "the pipeline works" as different facts.
2. **The API contract in `CONTRACT.md` drifts** between whoever builds the backend and whoever wires the frontend, because they're working in parallel. Check the pinned response shape before writing either side.
3. **The live demo fails during the actual presentation.** M3 in `spec/plan.md` exists specifically to produce a recorded fallback — do not skip it to spend more time on features.

---

## Where everything else lives

- `CONTRACT.md` — what must never break (read this before writing any code)
- `spec/plan.md` — the 4 milestones for these 2 days, with exit criteria
- `spec/tasks.md` — the actual backlog, split by area so 6 people can grab tasks without colliding
- `spec/architecture.md` — stack, API shape, capability register
- `spec/decisions.md` — decisions already made; check before re-proposing something
- `AGENT_LOG.md` — newest entry first; read the top 3 before starting anything
