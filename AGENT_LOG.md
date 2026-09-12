# AGENT_LOG — SatQuery AI

Append-only. **Newest entry at the top.** Every entry: milestone, tasks touched, what didn't get finished, anything noticed but not fixed, and a specific next action.

## 2026-09-12 — Add "village" as a fourth, real-data demo scenario

**Milestone:** M2/M3 demo build. Additive, low-risk, done under time pressure with a live
evaluation imminent — did not touch `scene.js`, `render.js`, `chat.js` or `trace.js`, and did
not touch anything voice-to-text related (see flag below).

**Finished**
- `demo/village_demo_manifest.json` — a copy of `backend/village_demo_manifest.json` (the real
  4-entry manifest: real 163M-point Khapreta village scan, real `open_clip ViT-B-32` zero-shot
  cosine similarities, real JPEG crops as base64). Copied into `demo/` so `demo/serve.js` — which
  is jailed to serving only inside `demo/` — can serve it; `backend/` is a sibling directory it
  cannot reach. **Two copies of the same file now exist; keep them in sync if the manifest is
  regenerated**, or move to a single served location later.
- `demo/src/api/mock.js` — added `village` to `SCENARIOS`; added `queryVillage()`, a self-contained
  path that does NOT go through the TF-IDF vectoriser or `analyzeScene()`. It fetches the manifest
  at runtime (`fetch()`, not a static/JSON import — `demo/build.js`'s linker wraps every module in
  a plain function body, where a static `import` statement is a syntax error) and matches the
  question against the manifest's own `entries[].query` strings by plain keyword overlap, with a
  small local stopword list (deliberately separate from the TF-IDF module's `STOPWORDS`/`SYNONYMS`
  — first version had no stopword filter at all and "what is the weather forecast for tomorrow"
  wrongly matched a real entry via shared "is"/"the"; caught by scripted verification, fixed).
  Zero token overlap declines rather than confidently citing whichever entry ranks highest, per the
  task's "don't imply open-ended search" instruction. `confidence`, `tile_id`, `image_url` and
  `n_points` are the manifest's values, unmodified — see INV-1/INV-2 below.
- `demo/src/ui/map.js` — village skips `buildScene`/`analyzeScene` entirely (`state.scene`/
  `state.measures` stay `null`); `drawOverlay()` returns immediately for this scenario; the layer/
  date/compare/vectors/AOI setters no-op for it; the map-footer readout is cleared instead of
  showing the previous scenario's stale AOI/CLOUD/GSD figures (a bug caught in verification — see
  below). The real image is shown via the existing evidence-thumbnail path in the chat panel,
  unchanged.
- `demo/src/main.js` — `loadScene()` skips the procedural veil/prewarm for village; `selectScenario()`
  toggles a `.real-data` class on `.panel-map` and awaits `ensureVillageStarters()` (wrapped in
  try/catch, so a fetch failure degrades to empty chips instead of an uncaught rejection) before
  building the chip row, so the four starter chips are the manifest's own `entries[].query` values,
  not hand-typed copy.
- `demo/styles.css`, `demo/index.html` — a `#stageNote` placeholder ("real point-cloud data, see
  chat panel") shown only for this scenario; toolbar/badges/legend/zoom-controls hidden.

**A real CSS/layout bug found and fixed during verification, not just claimed:**
hiding `.toolbar` with `display: none` collapses `.stage` (the imagery canvas area, an
`auto 1fr auto` grid row sibling) to **0 height** in Chrome — reproduced and isolated with a
scripted CDP session (toggling one style property at a time). The grid's resolved
`grid-template-rows` reports the `1fr` row got the full leftover space, but the element's own
box measures 0 anyway; `visibility: hidden` (plus zeroing height/padding/border on the same rule)
does not trigger it. Fixed by using `visibility: hidden` for `.toolbar` specifically; the other
three hidden elements (`stage-badges`, `stage-controls`, `map-legend`) are absolutely positioned
inside `.stage`, not grid-row siblings, and plain `display: none` on those is confirmed safe.
**Flagging this because the same `display: none`-on-a-toolbar-row pattern could resurface this
bug anywhere else in the app that reuses `.panel-map`'s grid.**

**Verified, not just asserted** (no interactive browser tool was available in this session, so a
minimal Chrome DevTools Protocol driver was scripted over Node's built-in `fetch`/`WebSocket`):
all 4 village chips return the exact manifest entry (confidence, tile_id, image byte length
matched against the raw manifest); an off-topic typed question declines; flood/quake/infra were
re-tested afterward with real chip clicks and produce their normal computed headlines/confidence;
zero console errors and zero uncaught exceptions across the whole flow, in both dev-server mode
and after `node demo/build.js` (offline bundle also builds clean, all its self-checks pass).

**Noticed but not fixed / needs a decision from the lead**

1. **Tile ID format conflicts with `CONTRACT.md`'s pinned convention.** The pinned table says
   `<STATE-CODE>-<NNN> · <YYYY>-Q<N> · <sensor>`; the real manifest's tile IDs are `tile_1_1` etc.
   — a point-cloud tile grid, not a satellite pass. Per `AGENTS.md` §1 ("if a task conflicts with
   `CONTRACT.md`, the contract wins... flag it, do not silently resolve it"): I used the manifest's
   real value as-is rather than inventing a compliant-looking `KH-001 · ...` string, because
   fabricating a satellite-style ID for point-cloud data seemed like the larger honesty violation
   given INV-1/INV-2. This needs an explicit call: either `CONTRACT.md` gets a documented exception
   for non-satellite retrieval verticals, or the village tile IDs get reformatted (real data either
   way — the confidence/points/image are untouched regardless of ID string).
2. **The offline single-file build (`satquery-demo.html`, "the artefact to present from" per the
   2026-09-11 entry) does not have working village data.** `demo/build.js` inlines only the 7
   `MODULES` it's told about, not `village_demo_manifest.json`, and the runtime `fetch()` path is
   relative to wherever `index.html`/`satquery-demo.html` is served from — correct for `demo/`
   (dev server) but not for the repo root (where the built file lives). Clicking "Village
   retrieval" in the built offline file will show empty starter chips (the try/catch added in
   `main.js` prevents a crash, but there is no data). **If the village scenario needs to work in
   the presented artifact, this needs either an offline-data-embedding step in `build.js` or a
   decision to present from the dev server (`npm run dev`) instead for this scenario.** I did not
   attempt this myself — extending the bundler felt like exactly the kind of change that
   contradicts "must be additive and low-risk" this close to an evaluation.
3. **`demo/village_demo_manifest.json` duplicates `backend/village_demo_manifest.json`.** See above.
4. **Voice-to-text / API-key check requested by the lead, reported here as asked:** `requirements.txt`
   lists `faster-whisper==1.2.1` and `streamlit-mic-recorder==0.0.8` (plus a `streamlit`/`langgraph`/
   `transformers`/`peft`/`accelerate` stack) — a voice-input feature on a separate track from
   anything touched here. No `.env` file exists (only the placeholder `.env.example`, which is
   clean), and no API key or secret was found anywhere in the tree. The "OPENAI" hits elsewhere
   (`spec/decisions.md`, `spec/architecture.md`, the notebooks) are all `open_clip`'s
   `pretrained="openai"` checkpoint name, unrelated to any API or credential.
5. **`indexStats()` (the "INDEX N tiles · N AOIs..." line) still reports the TF-IDF index's counts
   while the village scenario is open**, not the manifest's 4 entries — cosmetic, not incorrect
   (it is truthfully describing the app's other index), left alone to keep this change scoped to
   what was asked.

**Next action:** get a decision on items 1 and 2 above before presenting village as part of the
same offline file as the other three scenarios; otherwise this scenario is ready to demo from
`npm run dev`.

---

## 2026-09-11 — Make the demo source entry local-server friendly

**Milestone:** M2 frontend development workflow.
**Tasks touched:** none of the numbered tasks directly.

**Finished**
- Added CORS response and preflight headers to `demo/serve.js` for local embedding.
- Added `demo/open-local.bat` so Windows opens the HTTP-served source entry instead of `file://`.
- Documented why `demo/index.html` cannot be opened directly and preserved the offline `satquery-demo.html` path.

**Not finished / noticed**
- The browser cannot be made to import ES modules from `file://` with CORS headers; this is a browser security restriction. The source workflow therefore requires HTTP, while the generated root HTML remains double-clickable.

**Next action:** run the local launcher or `npm run dev`, then verify `http://127.0.0.1:5173/` in a browser.

---

## 2026-09-11 — Demo app v2 built on a mocked data layer (branch `demo/prototype-v2`)

**Milestone:** serves M2 (frontend) and M3 (rehearsal-ready). Does **not** touch M0/M1 — no pipeline work here.
**Tasks touched:** none of the numbered tasks directly. This is the lead's separate brief for a
presentation-ready demo app, built on scripted data by design, on its own branch. Closest relatives are
M2-MAP-01..03 and M3-DEMO-02, but those are about wiring the *real* pipeline and remain open.

**Finished**
- `demo/` — two-panel analyst app: imagery viewer (pan/zoom, optical/SAR/water-index layers, before/after
  swipe, drawable AOI, animated evidence overlay) plus a conversational panel with streaming answers,
  confidence, tile citation and an inline agent-trace block.
- `demo/src/api/mock.js` — the single module holding scripted data, behind `query()` in `CONTRACT.md`'s
  pinned shape. Swapping it for a live client is a one-import change in `main.js`.
- `demo/build.js` — zero-dependency linker producing `satquery-demo.html` at the repo root: one
  self-contained file, no server, no network, no fonts or scripts from anywhere. This is the artefact to
  present from, and the fallback if a venue laptop has no toolchain.
- `demo/serve.js`, `package.json` — `npm run dev` / `npm run build`, neither needing `npm install`.
- `demo/README.md` — what is scripted vs computed, the additive response fields, and the swap procedure.

**Two invariant decisions worth checking**

- **INV-1.** A demo could have hardcoded a confidence number. This one does not: `mock.js` runs a real
  TF-IDF vectoriser over the tile index and returns the actual cosine similarity that ranked the tile,
  computed per request. It moves with the query, and off-topic questions score 0.00, fall below
  `CONFIDENCE_FLOOR`, and are declined rather than answered. The vector space is lexical, not CLIP — far
  weaker than the real pipeline — but the number displayed is genuinely the similarity behind the result.
- **INV-2.** No answer states a number that was not computed. Every figure comes from `analyzeScene()`,
  which measures the procedurally generated rasters the user is looking at (flood extent, road
  submergence by centreline sampling, settlement reachability by BFS over the road graph, cloud fraction
  from the cloud mask). Each response carries a `provenance` array naming every quoted figure and the
  measurement behind it, surfaced in the UI under "How this was computed" — so the claim is checkable
  from the running app without reading source.

**Noticed but not fixed / needs a decision from the lead**

1. **`spec/plan.md` lists "Redesigning `satquery_demo.html`" as an anti-goal**, and this work rebuilds the
   frontend. The lead's brief overrides it and the lead has that authority (`AGENTS.md` §7), but the
   contradiction is currently unrecorded. It needs a decision entry. Proposed, to paste into
   `spec/decisions.md` once the pending edits there are committed:

   > ## D-010 — Rebuild the demo frontend rather than wire the existing prototype
   >
   > **Status:** decided (lead direction, 2026-09-11 — overrides the `spec/plan.md` anti-goal)
   > **Decision:** build a new demo app in `demo/` against a mocked data layer, instead of wiring
   > `frontend/index.html` to real retrieval.
   > **Rationale:** the prototype is a single-question form, not an analyst tool — it has no map, no
   > layers, no compare, no trace panel, so "wire it to real data" could not produce the demo the mentor
   > asked for. Building against a mock also decouples the demo from M0/M1 finishing, which is the actual
   > schedule risk.
   > **Rejected:** wiring the existing prototype — rejected because the shape is wrong, not the data.
   > **Cost accepted:** the demo shows scripted data, so it is labelled as such, permanently and
   > non-dismissibly, per INV-1/INV-2.
   > **Revisit if:** M1 lands before the demo slot — then swap `src/api/mock.js` for a live client and
   > remove the label. That is a one-file change by construction.

2. **`CONTRACT.md`'s pinned response table should get an additive-fields note.** The demo returns the four
   pinned fields unchanged and never renamed, plus optional extras (`trace`, `evidence`, `provenance`,
   `map_directive`, `measurements`, …) documented in `demo/README.md`. I did not edit `CONTRACT.md`
   because that file's own rule reserves changes to the lead or mentor. Proposed one-line addition under
   *Pinned conventions*:

   > Additional response fields may be added so long as the four pinned fields keep their exact names,
   > types and meanings, and any consumer works correctly when only those four are present.

3. **`spec/decisions.md`, `spec/plan.md` and `spec/tasks.md` had uncommitted edits in the working tree
   before this work started** (D-005 to D-009, the mentor-pivot decisions). I deliberately left all three
   untouched and did not stage them, so nobody's in-flight spec work gets swept into a frontend commit.
   They are still uncommitted — whoever wrote them should commit them.

4. **The flood scene currently computes 5 of 6 settlements cut off.** That is a measured result of the
   generated terrain, not a chosen one, and it is defensible — but it is bleak, and every settlement
   label on screen reads CUT OFF. If a less relentless picture is wanted, lower the flood level in
   `buildFloodScene` (`connectedFill(elev, waterBefore, 0.235)`); everything downstream recomputes.

5. **The retrieval model is lexical, so it matches words rather than meaning.** "Is the ground saturated"
   scores 0 because "saturated" is not in the thesaurus. Real CLIP would not have this failure mode.
   Adding synonyms in `mock.js` is the stopgap; the fix is M1.

**Next action:** review `satquery-demo.html` locally, then decide on items 1 and 2 above. If the demo is
approved as the presentation surface, `spec/tasks.md` Track 3 and Track 6 should be re-scoped — the map
panel and trace panel exist now, and what remains on those tracks is putting real retrieval behind them.

---

## 2026-09-09 — Repo initialized

**Milestone:** M0 (not yet started)
**Tasks touched:** none — this is the spec-system bootstrap, no product code yet.
**Finished:** `BRIEF.md`, `CONTRACT.md`, `AGENTS.md`, `spec/*`, pointer files, repo skeleton.
**Not finished:** everything in `spec/tasks.md` M0 onward.
**Noticed but not fixed:** the UX prototype (`SatQuery-AI-UX-Prototype.html`) has scripted/fake confidence numbers and an invented specific percentage in one answer ("12% of the field"). This is fine for its purpose (a presentation mockup) but flagged loudly in `CONTRACT.md` INV-1/INV-2 so it doesn't quietly become the real backend logic.
**Next action:** pick up `M0-DATA-01` or `M0-ML-01` from `spec/tasks.md` — both are unblocked and can start immediately, in parallel.

