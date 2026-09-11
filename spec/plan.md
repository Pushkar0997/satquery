# plan.md — Milestones

**Rewritten 2026-09-10 after the mentor meeting.** See `spec/decisions.md` D-005 to D-008 for what changed and why.

Sequential. **Currently active: M0.**

The mentor's two explicit asks are the spine of this plan: (1) a working end-to-end data pipeline on real data, (2) a frontend demo that is genuinely promising and built on that real work. Everything here serves one of those two.

---

## M0 — Port the working pipeline ⏱ Day 1 AM · cost ₹0

The fastest route to "a working end-to-end pipeline" is the one that already exists. See D-006.

**Deliverables**
- `ISRO_Hackathon`'s FAISS index, metadata store, and encoder code pulled into `backend/` and confirmed loading
- One retrieval confirmed working end-to-end in its original form (SAR image in → ranked optical matches out)

**Exit criteria**
- [ ] The FAISS index loads and returns ranked results with metadata (sensor, year, cloud cover) attached
- [ ] Archive size and content confirmed — how many tiles, of what, is it enough for a convincing demo
- [ ] A flood/water-visible subset identified inside the archive, or flagged as missing if it isn't there

**Risk:** the archive may not contain good flood imagery (it's SEN1-2 agricultural/general scenes). If so, that's known on Day 1 morning, not Day 2 night — and M1 adapts by sourcing a handful of flood tiles rather than rebuilding anything.

---

## M1 — Text query replaces image query ⏱ Day 1 PM · cost ₹0

This is the actual new engineering, and it's deliberately the only new engineering. See D-006.

**Deliverables**
- CLIP text encoder wired as the query path into the existing FAISS index
- Metadata filters (year, cloud cover) parsed from the query text and applied to results

**Exit criteria**
- [ ] Typing "flooded area near a river" returns sensible ranked tiles from the ported archive
- [ ] Confidence returned is the real similarity score (`CONTRACT.md` INV-1 — unchanged by the pivot)
- [ ] At least 8 of 10 test queries return a defensible top result

**Note:** the old repo's dual-tower encoder and CLIP embed into *different* spaces. Either re-embed the archive with CLIP's image encoder (simpler, likely right for 2 days) or keep both indexes. Whoever picks this up decides on Day 1 and records it in `AGENT_LOG.md`.

---

## M2 — Frontend on real data ⏱ Day 2 AM · cost ₹0

`satquery_demo.html` already has the right shape — two-panel map + chat, AOI draw, SAR/NDVI toggles, before/after slider. Its map is currently drawn vector shapes. The job is to put real tiles behind that interface, not to redesign it.

**Deliverables**
- Real archive tiles rendered in the map panel instead of synthetic shapes
- Chat panel calling the real M1 retrieval
- Before/after slider showing two real dated tiles of the same area

**Exit criteria**
- [ ] A question typed live returns a real tile and a real confidence, visible on screen
- [ ] The agent-trace panel shows what actually ran, not a scripted sequence
- [ ] Nothing on screen claims a specific number that wasn't computed (`CONTRACT.md` INV-2)

---

## M3 — Rehearsal-ready ⏱ Day 2 PM · cost ₹0

**Deliverables**
- Screen recording of the working demo as fallback
- Talk track connecting the flood story to what's on screen
- Mentor walkthrough before the actual slot

**Exit criteria**
- [ ] Recorded fallback exists and plays
- [ ] One full run-through by someone who didn't build it
- [ ] Mentor has seen it before presentation day

---

## Sequencing rules

- M0 blocks M1 — no text-query work until we know what's actually in the archive.
- M2's map work can start immediately in parallel (it needs tiles, not the query path).
- Do not skip M3. A live demo with no fallback is the most avoidable failure in a hackathon.

## Anti-goals for the current stage

Things that will feel productive right now and are not:

- **Building fresh Google Earth Engine / Sentinel Hub ingestion.** See D-006 — weeks of work to arrive where the old repo already is.
- **Hyperspectral anything.** See D-007 — it's a slide.
- **A five-agent LangGraph orchestration layer.** The team's plan document itself notes agents 1/2/3/5 collapse into one LLM with different schemas. For this sprint, even that is optional — the *trace panel* showing real routing matters more to a judge than genuinely distributed agents.
- **PostGIS + pgvector.** FAISS is already built, already populated, already works.
- **Redesigning `satquery_demo.html`.** It's good. It needs real data behind it, not more design.

If you find yourself doing one of these, check which milestone is active.
