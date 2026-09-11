# AGENT_LOG — SatQuery AI

Append-only. **Newest entry at the top.** Every entry: milestone, tasks touched, what didn't get finished, anything noticed but not fixed, and a specific next action.

## 2026-09-11 — Fix browser-audio transcription root cause

**Milestone:** voice-query reliability; no numbered task changed.

**Finished**
- Fixed the root cause in `tools/speech_to_text.py`: Streamlit microphone input is often browser-native audio, not RIFF/WAV bytes, so the app wrote the wrong payload format to disk before Whisper saw it.
- Added a normalisation step that preserves valid WAV recordings and converts other browser formats to WAV before transcription when `ffmpeg` is available.
- Added a focused regression test in `tests/test_speech_to_text.py` covering both WAV and non-WAV payload handling.
- The app now fails gracefully with a clear typed-query fallback when the mic payload cannot be decoded on a machine without `ffmpeg`.

**Not finished / noticed**
- This workspace does not currently have `ffmpeg` installed, so a real browser mic recording still needs a local system install before live voice transcription can be validated in-browser here.

**Next action:** install `ffmpeg` on the host machine, open the Streamlit app, and record a short spoken query to confirm the transcription text appears in the UI.

---

## 2026-09-11 — Stabilise local voice-query transcription

**Milestone:** prototype usability; no numbered task changed.

**Finished**
- Consolidated local Faster-Whisper code in `tools/speech_to_text.py`; `app.py` now uses that one implementation.
- Added a clear first-run download message and a typed-query fallback if the model cannot initialise or audio cannot be transcribed.
- Normalised non-WAV browser audio to 16 kHz mono WAV when FFmpeg is available; Streamlit's `audio_input` itself returns `audio/wav`, so the normal microphone path does not depend on FFmpeg.
- Confirmed the installed environment has Streamlit audio input, Faster-Whisper 1.2.1 and CTranslate2 4.8.2. Downloaded and loaded the public `small` model locally using the standard Hugging Face transfer route.
- Pinned Faster-Whisper and excluded `.venv/` and `.env*` from version control while retaining `.env.example`.
- Added/ran local audio-normalisation tests: 2 passed. The Streamlit app starts successfully and its local health check returns `ok`.

**Not finished / noticed**
- A real microphone recording still needs a manual browser test; do not treat an empty test audio file as a speech-recognition result.

**Next action:** start Streamlit, record a short English or Hindi query, verify the recognised query appears, then run the normal image-analysis smoke path.

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
