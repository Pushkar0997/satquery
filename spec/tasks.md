# tasks.md — Backlog

**Rewritten 2026-09-10 after the mentor meeting.** See `spec/decisions.md` D-005 to D-008.

One task = one change = one commit. Task ID format: `M<milestone>-<area>-<number>`.

## Six tracks, one per person

| # | Owner | Track | Blocked by? |
|---|---|---|---|
| 1 | Pipeline | Port the ISRO_Hackathon FAISS index + metadata | No — start here, everything depends on it |
| 2 | Retrieval | Swap SAR-image query for CLIP text query | Needs T1's index loaded; can prep the encoder immediately |
| 3 | Map | Real tiles into the demo's map panel | No — needs tiles, not the query path |
| 4 | Chat/API | Wire chat panel to real retrieval | No, if built against `CONTRACT.md`'s pinned shape first |
| 5 | Scenario | Curate the flood story: before/after pair, NDWI, the narrative | No — fully independent |
| 6 | Demo | Talk track, trace panel, recording, mentor walkthrough | Only the recording needs something working |

---

## Track 1 — Pipeline (build the index for real)

See `spec/decisions.md` D-009 — the old repo's index is unusable (untrained weights), so this track builds a real one. The old repo's *structure* is the guide, not its artefacts.

- [ ] **M0-PIPE-01** Get a SEN1-2 / SEN12MS subset (free, paired SAR + optical over the same scenes). A few hundred tiles is plenty. Prefer scenes with water/flooding if available.
- [ ] **M0-PIPE-02** Embed the optical tiles with CLIP's **image** encoder (real pretrained weights — this is what the old repo lacked) and build a fresh FAISS index.
- [ ] **M0-PIPE-03** Generate a real metadata store using the old repo's schema shape (`file_path`, `sensor`, `year`, `cloud_cover_pct`) — but with values actually derived from the data, not randomised.
- [ ] **M0-PIPE-04** Report in `AGENT_LOG.md`: tile count, what's depicted, whether any show water. Shapes every other track's plan.

## Track 2 — Text query

- [ ] **M1-RET-01** Decide and record: re-embed the archive with CLIP's image encoder, or keep the old dual-tower index alongside a new CLIP one. Write the choice and reasoning in `AGENT_LOG.md`. Do this on Day 1 — it blocks everything downstream.
- [ ] **M1-RET-02** Wire CLIP text encoder → FAISS search → top-k tiles with metadata attached.
- [ ] **M1-RET-03** Parse year and cloud-cover constraints out of query text and apply them as filters (the old repo's metadata store already has these fields — reuse, don't rebuild).
- [ ] **M1-RET-04** Run 10 test queries, record real results in `spec/evals.md`.

## Track 3 — Map panel

- [ ] **M2-MAP-01** Replace `satquery_demo.html`'s synthetic canvas shapes with real archive tiles rendered as the map layer.
- [ ] **M2-MAP-02** Wire the before/after compare slider to two genuinely different dated tiles of the same area.
- [ ] **M2-MAP-03** Make the AOI box and evidence overlay reflect the actual retrieved tile, not a fixed position.

## Track 4 — Chat + API

- [ ] **M2-API-01** Scaffold the `/query` endpoint per `CONTRACT.md`'s pinned shape, against a stub. Start immediately, don't wait for Track 2.
- [ ] **M2-API-02** Swap the stub for Track 2's real retrieval.
- [ ] **M2-API-03** Wire the demo's chat panel to call it; confirm a genuinely new question (not a preset chip) returns a real result.

## Track 5 — Flood scenario

- [ ] **M0-SCEN-01** Build the flood narrative: which event, which area, what a responder would actually ask. Concrete and specific — "Kerala, monsoon, which villages are cut off" beats "a flood."
- [ ] **M0-SCEN-02** Source a before/after tile pair for that area if the ported archive lacks one (Sentinel-1 via Copernicus is free; one pair is enough).
- [ ] **M0-SCEN-03** Compute NDWI (water index) on the pair — cheap, explainable, and gives the map a real overlay rather than a drawn one.

## Track 6 — Demo & narrative

- [ ] **M3-DEMO-01** Draft the talk track. Open on the flood scenario; defence framing stays at monitoring/situational awareness only (D-008). Start now, needs no code.
- [ ] **M3-DEMO-02** Make the agent-trace panel show what actually ran — real model names, real confidence. This is the single most convincing element for a technical judge and it's cheap once Track 2 works.
- [ ] **M3-DEMO-03** Screen-record a working run as fallback.
- [ ] **M3-DEMO-04** Mentor walkthrough before presentation day.

---

## Backlog — do not start

- Google Earth Engine / Sentinel Hub live ingestion — D-006, post-round.
- Hyperspectral ingestion — D-007, slide only.
- LangGraph five-agent orchestration — see `spec/plan.md` anti-goals.
- PostGIS + pgvector — FAISS already works.
- Agri-insurance / land-records / mining as built demos — D-005, pitch generalisation only.
