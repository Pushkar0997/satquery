# Claude Code build prompt — SatQuery AI demo app

---

## Context

You are working in the `satquery` repo. Read `AGENTS.md`, `CONTRACT.md`, `spec/plan.md`, `spec/decisions.md` and `spec/tasks.md` first — they explain the project, the constraints, and the decisions already made. `frontend/index.html` and any `satquery_demo.html` in the repo are earlier prototypes; read them for design direction and reuse what's good, but you are building something substantially better.

**Project in one line:** SatQuery AI lets a disaster-response analyst ask a plain-language question about a region and get an answer grounded in satellite imagery evidence, instead of manually reviewing tiles in a GIS tool.

**What I need:** a genuinely impressive, presentation-ready demo web app I can show tomorrow. The data layer is **mocked** — you are not wiring real models or real satellite APIs. But everything else should be real: real interaction, real state management, real animation, real polish. This must feel like a product, not a slideshow.

Take your time. Quality matters far more than speed here. Work through it properly, verify as you go, and write up what you did at the end.

---

## Hard rules

1. **Do not push. Do not commit to `main`.** Work on a branch called `demo/prototype-v2`. Commit locally as you go with clear messages. I will review your report and verify before anything is pushed.

2. **Honest labelling is non-negotiable.** This is a demo with scripted data, and it must say so — a small, tasteful, permanently visible label in the footer or header, e.g. "Demo build — scripted scenarios, not live imagery." Do not hide it, do not make it a dismissible toast. `CONTRACT.md` INV-1 and INV-2 explain why this matters: our actual competitive edge is being real, and a demo caught overclaiming costs more than it gains. Make the app beautiful and make it honest — those are not in tension.

3. **Structure the mock so it can become real later.** All scripted data lives in exactly one module (e.g. `src/mockData.js` or `src/api/mock.js`) behind a single async function whose signature matches the real API contract pinned in `CONTRACT.md`:
   ```
   query(text) -> { tile_id, confidence, answer, image_url, ... }
   ```
   Swapping mock for real should be a one-file change. No scripted data scattered through components.

---

## The scenario to build around

**Flood response is the flagship** (see `spec/decisions.md` D-005). The story: a district disaster-response cell needs to know which areas are underwater and which roads are still passable, right now, during a monsoon event when optical satellites are blind through cloud cover and SAR is the only thing that sees.

Secondary scenarios to include as selectable examples: earthquake damage assessment, and infrastructure/terrain change monitoring.

**Framing constraint:** defence-adjacent use cases stay at *monitoring and situational awareness* only — border infrastructure change detection, terrain assessment, disaster-relief logistics. Nothing resembling targeting. See `spec/decisions.md` D-008.

---

## What to build

### Core layout: two panels

**Left — map/imagery viewer.** Should feel like a real geospatial tool:
- Satellite imagery tiles displayed as the base layer
- **Before/after comparison slider** — drag to reveal flood extent changing between two dates. This is the single most visually compelling element; make it smooth and satisfying.
- **Layer toggles**: Optical / SAR / NDWI (water index). Each should visibly change the imagery — SAR rendered in characteristic grayscale speckle, NDWI as a blue-cyan water mask overlay. The point is showing that different sensors reveal different things.
- **AOI selection** — let the user draw or select a region of interest
- **Evidence overlay** — when an answer references a specific area, highlight it on the map with an animated bounding box or heatmap. The link between "the answer said X" and "here is where X is" must be visually obvious.

**Right — chat panel:**
- Conversational query interface with suggested starter questions as clickable chips
- Streaming/typing answer animation (fake it with timed reveal — it should feel alive, not instant)
- Each answer carries: a confidence indicator, a "view evidence" action that moves the map, and a timestamp/tile citation
- Multi-turn: the conversation should build, with earlier messages staying visible

### The differentiator: agent trace panel

A collapsible panel showing what the system "did" to answer, revealed step by step as the answer generates:

```
01  Interpreting query        → intent: flood_extent · location: AOI-1 · window: last 7 days
02  Validating data           → optical 94% cloud → unusable · routing to SAR
03  Selecting model           → Sentinel-1 water-extent segmentation
04  Executing                 → 3 tiles processed
05  Synthesising              → confidence 0.86 · 2 evidence tiles cited
```

Animate these appearing sequentially with realistic timing. This is what makes a technical judge lean forward — it shows the system reasoning rather than just producing. The "optical is too cloudy → falling back to SAR" moment is the best single beat in the whole demo; make it land.

### Imagery

You do not have real satellite data. Generate convincing imagery programmatically — procedural canvas/SVG terrain (fields, rivers, settlements, roads), then a "flooded" variant of the same scene with water spread along the low ground. Consistency matters more than photorealism: the before and after must clearly be *the same place*, so the change reads instantly. If there are usable images already in `data/tiles/`, consider using them, but procedural is fine and probably more controllable.

---

## Design direction

The existing prototype uses a warm cream/amber palette with serif display type — that's a distinctive, good direction. Keep that DNA and elevate it. Read `frontend/index.html` before designing.

Push for:
- **Considered typography** — a real display face for headings, clean sans for UI, mono for technical/trace elements. Establish hierarchy properly.
- **Restraint in colour** — warm neutral base, one accent for interactive elements, one for data/evidence highlights (cyan reads well against terrain). Never rely on colour alone to carry meaning.
- **Motion with intent** — transitions that clarify what changed, not decoration. The trace panel revealing, the evidence box drawing itself, the compare slider tracking the cursor.
- **Density that reads as professional** — this is an analyst tool, not a landing page. Confident information density beats airy marketing whitespace.

Avoid: generic dashboard-template look, default Tailwind palette, emoji as UI icons, gradient-heavy hero sections.

Also handle: a loading/empty state, an error state, and responsive behaviour down to laptop size (it will likely be presented on a projector — check it looks right at 1280×720 and 1920×1080).

---

## Tech

Your call, but bias toward **something I can open and run with near-zero setup tomorrow**. A single self-contained HTML file, or a small Vite + React app with a clear `npm install && npm run dev`. If you choose a build step, also produce a built static version I can open directly as a fallback — assume the venue wifi fails and the laptop is unfamiliar.

No backend. No API keys. No external CDN dependency for anything critical to the demo working offline.

---

## Verify before you report

- Click every interactive element yourself and confirm it does something sensible
- Run through the full flood scenario end to end, as I would present it
- Check at 1280×720 and 1920×1080
- Confirm the demo label is visible
- Confirm no scripted data lives outside the single mock module
- Confirm it works with the network disconnected

---

## Report back

When done, write me a summary covering:
1. What you built and how to run it (exact commands)
2. The suggested demo walkthrough — what I should click, in what order, to tell the flood story in about 3 minutes
3. What's mocked vs. what's genuinely functional
4. Anything you tried that didn't work, or that you'd flag as weak
5. What it would take to swap the mock for the real retrieval pipeline later

Do not push. I will review this report and verify locally first.
