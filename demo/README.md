# demo/ — SatQuery AI presentation build

A two-panel analyst interface over a **mocked** data layer. Built to be shown,
and built so the mock can be swapped for the real retrieval pipeline without
touching anything except one file.

> **This is a demo.** Scenario data is scripted and the imagery is procedurally
> generated, not real satellite imagery. The app says so permanently in the
> header and on the map, and that label is not dismissible. See `CONTRACT.md`
> INV-1 and INV-2 for why that matters more than the demo looking impressive.

---

## Running it

**To present it** — no server, no install, no network:

```
node demo/build.js         # writes satquery-demo.html at the repo root
```

Then open `satquery-demo.html` in any browser. Double-clicking it works. It is
one self-contained file with no external fonts, scripts, styles or images.

**To work on it** — the unbundled source needs an HTTP origin, because ES
modules cannot be imported over `file://`:

```
npm run dev                # or: node demo/serve.js
```

Then open `http://127.0.0.1:5173`. There are no dependencies — `npm install`
is not required for either command.

On Windows, double-click `demo/open-local.bat` to start the same server and
open the correct URL automatically. Do not double-click `demo/index.html`:
that source entry intentionally imports ES modules, which browsers block from
`file://` pages. The local server includes CORS headers for embedding the demo
from another local development origin.

---

## Layout

```
demo/
├── index.html          markup; the build splices CSS and JS into a copy of this
├── styles.css          design system + all component styles
├── build.js            zero-dependency linker -> ../satquery-demo.html
├── serve.js            zero-dependency static server for development
└── src/
    ├── scene.js        procedural scene model + measurement   (no rendering)
    ├── render.js       scene -> optical / SAR / water imagery (no data)
    ├── api/
    │   └── mock.js     ** the only module with scripted data **
    └── ui/
        ├── map.js      viewport, layers, compare, AOI, evidence overlay
        ├── chat.js     message list, streaming reveal, confidence, provenance
        └── trace.js    the agent trace block
```

The dependency direction is one-way: `scene -> render -> mock -> ui -> main`.
No UI module imports another UI module except `chat -> trace`.

---

## What is scripted and what is computed

This distinction is the point of the whole structure, so it is worth being
precise about.

**Scripted** (all of it inside `src/api/mock.js`):

- which scenarios exist, their names, AOI labels and framing copy
- the tile index: tile IDs, sensors, acquisition dates, and the text descriptor
  each tile is retrieved by
- the sentence frames answers are built from
- the wording of the five trace step titles
- the starter questions

**Computed at request time** (nothing below is a literal anywhere):

- **Confidence.** A real cosine similarity between the query vector and the
  retrieved tile vector, over a TF-IDF space built from the tile descriptors.
  It moves when the question moves. Ask something off-topic and it goes to
  0.00 and the app declines to answer instead of producing a paragraph.
  `CONTRACT.md` INV-1.
- **Every figure in every answer.** Flood extent, newly inundated area,
  cropland under water, road submergence, which settlements have no route to
  the relief staging point, which single link restoration reconnects the most
  settlements, cloud cover percentage, damage severity, new surface area — all
  measured by `analyzeScene()` off the same rasters being displayed.
  `CONTRACT.md` INV-2.
- **The evidence regions.** Found by searching the change mask for its densest
  window, not placed by hand.
- **The optical-to-SAR reroute.** Triggered by the measured cloud fraction
  crossing a usability threshold, not by a flag in a script.

Every answer carries a `provenance` array naming each figure and the
measurement that produced it. The **How this was computed** button in the UI
renders it as a table, so the claim above is checkable from the running app
without reading source.

The trace block is labelled *simulated pipeline trace* in the UI, because in
this build there is no pipeline behind it — only the values inside each step
are real.

---

## The API shape

`mock.js` exports the shape pinned in `CONTRACT.md`:

```js
query(text, { scenario }) -> {
  tile_id,      // "KL-114 · 2026-Q3 · Sentinel-1"
  confidence,   // float 0–1, real cosine similarity
  answer,       // string
  image_url,    // data: URI, a crop of the cited evidence region
  ...           // additive demo fields, see below
}
```

Plus `queryStream(text, ctx, onEvent)`, which emits `{type:'trace', step}` per
pipeline step then `{type:'answer', response}` — the shape an SSE endpoint
would stream.

### Additive fields

The four pinned fields are unchanged and never renamed. The demo adds the
following, all optional from a consumer's point of view:

| Field | Purpose |
|---|---|
| `intent`, `intent_confidence` | classified query intent |
| `headline` | one-line summary above the answer |
| `confidence_band` | `{label, tone}` for display only |
| `answerable` | false when below `CONFIDENCE_FLOOR` |
| `sensor`, `acquired`, `acquired_pretty` | acquisition metadata |
| `water_method` | which instrument answered the water question, and why |
| `trace[]` | pipeline steps |
| `evidence[]`, `all_evidence[]` | cited regions with bboxes |
| `provenance[]` | `{field, value, method}` per quoted figure |
| `map_directive` | layer / date / compare / bbox the answer wants shown |
| `measurements` | the full `analyzeScene()` result |
| `ranked[]` | top tiles with their similarities |
| `prefiltered_tiles`, `indexed_tiles` | hybrid search counts |
| `latency_ms`, `contract_version`, `is_mock` | request metadata |

A real backend can return only the four pinned fields; the UI degrades to a
plain answer with a confidence number.

---

## Swapping the mock for the real pipeline

`src/api/mock.js` is the only file that needs to change. Nothing else in the
app imports scripted data, and `main.js` is the only module that imports the
API at all.

1. Write `src/api/live.js` exporting the same surface — `query`, `queryStream`,
   `SCENARIOS`, `getScenario`, `suggestions`, `indexStats`, `CONTRACT_VERSION`,
   `IS_MOCK` — with `query()` doing `POST /query` per `CONTRACT.md`.
2. Change the import in `src/main.js`. That is the swap.
3. Set `IS_MOCK = false`. The header reads "live backend" instead of "mock
   data layer" on its own.
4. Remove the demo label from `index.html` **only once the data is genuinely
   live** — that is the one edit outside the API module, and it should be the
   last thing done, not the first.

Two things to keep when the backend becomes real:

- **The provenance array.** It is what makes INV-2 checkable rather than
  aspirational. The real pipeline knows how it computed each number; have it
  say so.
- **The confidence floor.** Declining to answer below a threshold is a feature.
  The real cosine similarities from CLIP will sit in a different range, so
  recalibrate `CONFIDENCE_FLOOR` against `spec/evals.md` rather than keeping
  0.17.

`scene.js` and `render.js` become unnecessary once imagery is real: the map
would load actual tiles instead of generating them. `map.js` reads its imagery
through `renderLayer(scenario, layer, date)`, so that is the seam to replace —
one function returning a canvas or an image.

---

## Keyboard

| Key | Action |
|---|---|
| `C` | compare passes |
| `V` | vector overlay |
| `A` | draw AOI |
| `1` `2` `3` | optical / SAR / water index |
| `0` | reset view |
| `+` `-` | zoom |
| `/` | focus the question box |

While comparing, dragging anywhere on the image moves the swipe. Otherwise
dragging pans and the wheel zooms.
