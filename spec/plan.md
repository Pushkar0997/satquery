# plan.md — Milestones

Sequential. Do not start M(n+1) before M(n)'s exit criteria are met — with 6 people and 2 days, the temptation to parallelize across milestones is high; resist it for anything that depends on M0's output (real embeddings) actually existing.

**Currently active: M0.**

---

## M0 — Retrieval proven on real images ⏱ Day 1, morning · cost ₹0

Nothing else can be honestly demoed until this is true. This is the one invariant the whole pitch rests on (see `CONTRACT.md` INV-1).

**Deliverables**
- 15–20 real demo images in `data/tiles/`, across at least 2 of the 4 verticals
- `notebooks/satquery_pipeline.ipynb` run top to bottom in Colab against those images, by an actual team member, not assumed to work because it was written

**Exit criteria**
- [ ] Notebook runs end-to-end with zero errors, on real (not placeholder) images
- [ ] Top-1 retrieval is visibly correct for at least 8 of 10 hand-written test queries
- [ ] The 10 test queries and their results are written down somewhere (`spec/evals.md`), not just eyeballed once and forgotten

**Risk:** general CLIP (not RemoteCLIP) may retrieve poorly on visually similar satellite tiles. Mitigation: curate visually distinctive images per vertical for the demo set (a farm field and a flood look very different even to a general model; two different farm fields might not). If retrieval quality is genuinely bad after curation, that's real signal — flag it in `AGENT_LOG.md` immediately, don't quietly ship a bad demo.

---

## M1 — Backend exposed as a callable API ⏱ Day 1, afternoon · cost ₹0

**Deliverables**
- `backend/main.py`: one FastAPI route, `POST /query`, matching the exact request/response shape pinned in `CONTRACT.md`
- Reachable via a public URL (Colab + a tunnel, or run locally if someone has GPU access outside Colab)

**Exit criteria**
- [ ] A `curl` or Postman call to `/query` with a real question returns a real (non-hardcoded) response matching the pinned shape
- [ ] Confidence in the response is verifiably the actual similarity score (spot-check against the notebook's own output for the same query)

**Fallback if this runs out of time:** the notebook's Gradio interface (already written) is a complete, working demo surface on its own. M1 and M2 are a stretch goal for a more polished demo, not a requirement — do not sacrifice M0's quality to force this through.

---

## M2 — Frontend wired to the real backend ⏱ Day 2, morning · cost ₹0

**Deliverables**
- `frontend/index.html` (copy of the existing UX prototype) with its scripted `DATA` object and `findMatch()` function replaced by a real `fetch('/query', ...)` call
- Same visual design, same interaction — only the data source changes from fake to real

**Exit criteria**
- [ ] Typing a genuinely new question (not one of the 4 pre-scripted ones) returns a real result, not a fallback to the nearest scripted match
- [ ] Confidence bar and answer text on screen match what the backend actually returned, byte for byte

**Blocked by:** M1. Do not start wiring the frontend to an endpoint that doesn't exist yet — agree the API shape (already pinned in `CONTRACT.md`) and build both sides against that shape in parallel instead, then connect them once both are ready.

---

## M3 — Rehearsal-ready ⏱ Day 2, afternoon · cost ₹0

**Deliverables**
- A screen recording of the working demo (M2's result, or M1's Gradio fallback if M2 didn't land), as a backup if the live version fails during presentation
- A run-through with the mentor
- `spec/smoke.md` checked once, cold, by someone who didn't build the demo

**Exit criteria**
- [ ] Recorded fallback exists and plays back correctly
- [ ] At least one full run-through happened with someone other than the builder driving it
- [ ] Mentor has seen it before the actual presentation, not for the first time during it

---

## Sequencing rules

- M0 blocks everything — no honest demo exists without it.
- M1 and M2 can be developed in parallel by different people once the API shape is agreed, but M2's integration step needs M1 actually deployed and reachable.
- Do not skip M3 to spend more time on features. A live demo with no fallback is the single most avoidable failure mode of a hackathon presentation.

## Anti-goals for the current stage

Things that will feel productive right now and are not, until M0–M2 are done:

- Adding a second or third vertical to the demo image set before the first one retrieves reliably.
- Building change detection or SAR fusion, even a toy version, to make the pitch look more advanced. It doesn't help the M3 exit criteria and directly contradicts the deck's own Feasibility slide.
- Polishing the frontend's visual design further. It's already built and reviewed — the risk right now is that it's beautiful and fake, not that it's insufficiently beautiful.
- Deploying anywhere beyond Colab. Nobody asked for persistent hosting at this stage.

If you find yourself doing one of these, check which milestone is actually active.
