# tasks.md — Backlog

One task = one change = one commit. Tick the box and add a one-line note when done. Task ID format: `M<milestone>-<area>-<number>`.

Areas are split so 6 people can start in parallel without waiting on each other — check "Blocked by" before claiming a task.

---

## M0 — Retrieval proven on real images

### DATA
- [ ] **M0-DATA-01** Curate 15–20 real satellite/aerial demo images across ≥2 verticals; save to `data/tiles/`, named by vertical (e.g. `agri_01.jpg`). Not blocked — start immediately.
- [ ] **M0-DATA-02** Write 10 test queries by hand (mix of the 4 example queries already in the deck plus new ones), save to `spec/evals.md` §Test queries. Not blocked — can be done alongside DATA-01.

### ML
- [ ] **M0-ML-01** Run `notebooks/satquery_pipeline.ipynb` sections 1–3 in Colab, confirm the encoder loads and embeds a test image with no errors. Blocked by: nothing (can use placeholder images to test the pipeline mechanics before DATA-01 finishes).
- [ ] **M0-ML-02** Re-run indexing against the real `data/tiles/` set once M0-DATA-01 lands. Blocked by: M0-DATA-01.
- [ ] **M0-ML-03** Run all 10 test queries from `spec/evals.md`, record actual results (retrieved tile + confidence) next to expected results. Blocked by: M0-DATA-02, M0-ML-02.
- [ ] **M0-ML-04** (backlog, not blocking M0) If the RemoteCLIP checkpoint becomes available, swap `REMOTECLIP_PATH` in the notebook and re-run M0-ML-03 to compare.

---

## M1 — Backend exposed as an API

### BACKEND
- [ ] **M1-API-01** Extract the notebook's `query()` function into `backend/main.py` as a FastAPI route matching the shape pinned in `CONTRACT.md`. Blocked by: M0 (needs working embeddings to wrap).
- [ ] **M1-API-02** Deploy the backend reachable via a public URL (Colab + tunnel, or local + tunnel). Blocked by: M1-API-01.
- [ ] **M1-API-03** Confirm a `curl` call returns real, non-hardcoded data matching the pinned response shape. Blocked by: M1-API-02.

---

## M2 — Frontend wired to the real backend

### FRONTEND
- [ ] **M2-UI-01** Copy `SatQuery-AI-UX-Prototype.html` to `frontend/index.html`. Not blocked — can start immediately, in parallel with M0/M1.
- [ ] **M2-UI-02** Replace the scripted `DATA` object and `findMatch()` logic with a real `fetch('<backend-url>/query', ...)` call. Blocked by: M1-API-03 (needs a real, reachable endpoint to call).
- [ ] **M2-UI-03** Confirm a genuinely new question (not one of the 4 pre-scripted ones) returns a real result end-to-end in the browser. Blocked by: M2-UI-02.

---

## M3 — Rehearsal-ready

### DEMO
- [ ] **M3-DEMO-01** Screen-record a full working run of the demo (M2 if it landed, Gradio from the notebook if not). Blocked by: M2-UI-03 or M1-API-03 (whichever is ready).
- [ ] **M3-DEMO-02** Run `spec/smoke.md` cold, with someone who didn't build the demo driving. Blocked by: M3-DEMO-01.
- [ ] **M3-DEMO-03** Walk the mentor through it before the actual presentation slot. Blocked by: M3-DEMO-02.
- [ ] **M3-DEMO-04** (story, needs its own review, not just a checkbox) Draft the talk track connecting the deck's narrative to the live demo — what gets said while the query is typed, what gets said if it's slow, how the fallback recording gets introduced if needed.

---

## Backlog — unscheduled, do not start

- Second vertical fully wired (beyond the 2 minimum for M0) — deferred until M0–M3 are solid, per `spec/plan.md` anti-goals.
- LLM-generated answer text — deferred, see `spec/product.md` non-goals.
- Change detection / SAR fusion — deferred, see `CONTRACT.md` "never do this."
- Persistent hosting beyond Colab — not needed for this round.
