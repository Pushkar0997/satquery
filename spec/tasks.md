# tasks.md — Backlog

One task = one change = one commit. Tick the box and add a one-line note when done. Task ID format: `M<milestone>-<area>-<number>`.

## How this is split for 6 people

Six ownership tracks, designed so each person can start **immediately, in parallel, without waiting on anyone else** for most of their work. The two places real coupling exists (backend <-> frontend, ML <-> backend) are decoupled by building against the **pinned contract in `CONTRACT.md`** first and integrating last -- see each track's "stay unblocked" note.

| # | Owner | Track | Genuinely blocked by anyone? |
|---|---|---|---|
| 1 | Data | Curate demo images + test query bank | No -- fully independent |
| 2 | ML | Get retrieval actually working, validate quality | Only the *final* full validation pass needs Track 1's images; the rest starts immediately on the 4 seed images already in `data/tiles/` |
| 3 | Backend | Wrap retrieval as a `/query` API | No, if built against a stub first -- see note |
| 4 | Frontend | Wire the real UI to real data | No, if built against a mock first -- see note |
| 5 | Research | Source RemoteCLIP, test if it's actually better | No -- fully independent until it's ready to swap in |
| 6 | Presentation | Talk track, mentor walkthrough, recorded fallback | Only the final recording step needs *something* working -- any track's output, even the Gradio fallback |

---

## Track 1 -- Data & Eval Set

**Goal:** the demo image set and the test query bank exist and are good.

- [ ] **M0-DATA-01** Curate 15-20 real satellite/aerial demo images across >=2 verticals (start with agri-insurance, add a second). Save to `data/tiles/`, named by vertical (`agri_05.jpg`, etc.). The 4 seed images already there count toward this.
- [ ] **M0-DATA-02** Write 10 test queries -- the 4 from the deck plus 6 new ones, including at least 2 intentionally hard/ambiguous ones. Fill the table skeleton in `spec/evals.md`.

**Stay unblocked:** nothing to wait for. Start here.

---

## Track 2 -- Retrieval Pipeline

**Goal:** `notebooks/satquery_pipeline.ipynb` runs end-to-end and retrieval quality is actually measured, not assumed.

- [ ] **M0-ML-01** Run notebook sections 1-3 in Colab against the 4 seed images already in the repo. Confirm the encoder loads and embeds with no errors. Do this immediately -- don't wait for Track 1.
- [ ] **M0-ML-02** Re-index against Track 1's fuller image set once it lands.
- [ ] **M0-ML-03** Run all 10 of Track 1's test queries, record actual results (retrieved tile + confidence) in `spec/evals.md`'s table. Flag in `AGENT_LOG.md` if below 8/10 correct.

**Stay unblocked:** M0-ML-01 needs nothing from anyone. Only M0-ML-02/03 need Track 1's output -- start those the moment Track 1 pushes images, don't idle waiting for a "finished" signal.

---

## Track 3 -- Backend API

**Goal:** a real `POST /query` endpoint matching the shape pinned in `CONTRACT.md`.

- [ ] **M1-API-01** Scaffold `backend/main.py` -- the FastAPI route, request/response validation against the pinned shape -- using **dummy/random embeddings as a stub**. Do not wait for Track 2 to "finish."
- [ ] **M1-API-02** Swap the stub for Track 2's real `query()` logic once it's confirmed working. This should be close to a straight import, not a rewrite, because the interface was agreed up front.
- [ ] **M1-API-03** Deploy reachable via a public URL (Colab + tunnel, or local + tunnel). Confirm with `curl` that it returns real, non-hardcoded data.

**Stay unblocked:** build and fully test the API shape and validation logic against a stub from hour one. The only real dependency is swapping the stub for the real thing in M1-API-02, which should be small if `CONTRACT.md`'s shape was followed on both sides.

---

## Track 4 -- Frontend Integration

**Goal:** `frontend/index.html` calls real data instead of the scripted `DATA` object.

- [ ] **M2-UI-01** Copy `SatQuery-AI-UX-Prototype.html` to `frontend/index.html` if not already done, and build a **local mock** matching `CONTRACT.md`'s exact response shape (a tiny mock server, or a hardcoded fetch stub) -- wire the UI to that first.
- [ ] **M2-UI-02** Swap the mock URL for Track 3's real deployed endpoint once it's live. Should be a one-line change if both sides built against the same pinned shape.
- [ ] **M2-UI-03** Confirm a genuinely new question (not one of the 4 pre-scripted ones) returns a real result end-to-end in the browser.

**Stay unblocked:** the mock-the-contract approach means the actual integration work -- the fetch call, the loading state, the error handling -- gets built and tested on day one, not blocked on Track 3's deployment.

---

## Track 5 -- RemoteCLIP & Accuracy

**Goal:** find out whether swapping in RemoteCLIP is worth doing, with evidence.

- [ ] **M0-ML-04** Source the RemoteCLIP checkpoint (author's release -- search for it, don't guess a URL). Load it in a **copy** of the notebook via `REMOTECLIP_PATH`, re-run Track 1's same 10 test queries, and compare accuracy against Track 2's general-CLIP baseline.
- [ ] Report the comparison in `AGENT_LOG.md`. If RemoteCLIP is clearly better, update `spec/decisions.md` D-002 and hand the swap to Track 2's owner -- don't merge it in yourself mid-stream while they're using the notebook.

**Stay unblocked:** entirely separate track until there's something worth merging. Doesn't touch the main notebook until the comparison is done.

---

## Track 6 -- Demo Reliability & Narrative

**Goal:** there's a working demo no matter what breaks, and a story that connects the deck to it.

- [ ] **M3-DEMO-04** Draft the talk track -- what gets said while a query runs, how the fallback gets introduced if it's needed. Start immediately; this doesn't need working code.
- [ ] **M3-DEMO-03** Schedule the mentor walkthrough -- logistics can be arranged now regardless of build status.
- [ ] **M3-DEMO-01** Screen-record a full working run once *any* track has something working (Gradio counts as a complete fallback on its own -- doesn't require Tracks 3/4 to finish).
- [ ] **M3-DEMO-02** Run `spec/smoke.md` cold, with someone who didn't build the piece they're checking.

**Stay unblocked:** the talk-track and scheduling half starts today with zero dependencies. Only the recording step needs *something* real to record -- it doesn't need every other track finished, just one working path.

---

## Backlog -- unscheduled, do not start

- Second vertical fully wired beyond the 2 minimum for M0 -- deferred, see `spec/plan.md` anti-goals.
- LLM-generated answer text -- deferred, see `spec/product.md` non-goals.
- Change detection / SAR fusion -- deferred, see `CONTRACT.md` "never do this."
- Persistent hosting beyond Colab -- not needed for this round.
