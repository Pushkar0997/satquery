# SatQuery AI — Implementation Architecture Blueprint

This is the foundation for **SIH26167: SatQuery AI**. It is intentionally designed around the functions the problem statement will score: remote-sensing adaptation, single-image VQA, a second single-image task, change understanding, optical–SAR analysis, GeoTIFF/TIFF support, and an observable agentic controller.

The guiding rule is simple: **one reliable, end-to-end flood / land-cover demo is more valuable than five incomplete AI features.** Build the platform so that each model can initially be a deterministic placeholder and can later be replaced without changing the UI or agent workflow.

---

## 1. What the final product does

A user uploads one image, an aligned temporal pair, or an aligned optical–SAR pair; chooses or writes a question; and receives:

1. an input compatibility result (format, bands, CRS, dimensions, alignment);
2. a selected task and the tools/models used;
3. a concise answer with confidence and limitations;
4. visual evidence — bounding box, change mask, or land-cover overlay;
5. an auditable execution trace; and
6. a downloadable JSON/PDF report.

The system must **not** pretend that one generic VLM solves every satellite task. It routes the query to specialised tools and reports what was actually executed.

## 2. Final architecture

```text
Browser (React + Leaflet)
    │ REST API + uploaded files
    ▼
FastAPI application
    ├── API layer — validation, job creation, response schema
    ├── Agent controller — interpret → validate → route → execute → synthesise
    ├── Geospatial tools — GeoTIFF metadata, alignment, indices, visual overlays
    ├── Model adapters — VQA / captioning-or-grounding / change / optical–SAR
    └── Report service — execution trace, evidence links, downloadable results
    │
    ├── local object storage (MVP) → MinIO/S3 (deployment)
    ├── SQLite (MVP) → PostgreSQL + PostGIS (deployment)
    └── model weights / cached demo scenes
```

### Why this design is right for a student team

- The frontend only knows a stable API response; it does not care whether an answer comes from a mock tool, a baseline model, or a fine-tuned model.
- Each AI task is an isolated adapter, so four people can work without overwriting each other’s code.
- Raster processing is kept outside the agent. The agent selects safe, pre-defined tools; it never generates arbitrary GIS commands.
- GeoTIFF support is a named service, not an afterthought.
- The same response structure powers the visual answer, trace, and report.

---

## 3. Mandatory MVP decisions

| Requirement | MVP choice | Later upgrade |
|---|---|---|
| Single-image baseline | Remote-sensing VQA | Fine-tuned VQA on RSVQA/VRSBench |
| Second single-image task | Scene captioning **or** grounding; choose captioning first if time is short | Add text-guided bounding-box grounding |
| Bi-temporal analysis | Change-VQA with change-map overlay | Fine-tuned CDVQA model + calibrated mask |
| Cross-modal analysis | Rule-based indices plus paired optical/SAR encoder | BigEarthNet-MM fine-tuned late-fusion encoder |
| Remote-sensing adaptation | Fine-tune/adapt one encoder using BigEarthNet or an open remote-sensing dataset | Sensor-agnostic BigEarthNet-MM fusion adaptation |
| Agentic workflow | Transparent deterministic state machine | LLM-assisted JSON parser with same safe state machine |
| Input formats | GeoTIFF/TIFF validator plus PNG/JPEG only for benchmark demos | Full CRS reprojection and co-registration pipeline |
| Storage | local folders + SQLite metadata | MinIO/S3 + PostgreSQL/PostGIS |

**Do not make hyperspectral a core build item.** It is outside the mandatory scope and high-dimensional imagery introduces separate processing and training work. Only add it after every required capability works. If it becomes necessary, add it as a fifth `hyperspectral_adapter.py`; it must not change the rest of the architecture.

---

## 4. Repository structure

Create a single repository named `satquery-ai`. Every path below is deliberate; do not create empty folders merely for decoration.

```text
satquery-ai/
├── README.md                         # One-page project setup, demo instructions, architecture diagram
├── .env.example                      # No secrets; names of required environment variables only
├── .gitignore                        # Excludes weights, uploaded scenes, .env, build output
├── docker-compose.yml                # Starts frontend, backend and optional database/object storage
├── Makefile                          # Optional shortcuts: make dev, test, demo-data
├── docs/
│   ├── architecture.md               # This blueprint, adapted as the project evolves
│   ├── api-contract.md               # Request/response examples and error codes
│   ├── data-contract.md              # Raster conventions, CRS/alignment requirements, benchmark I/O
│   ├── demo-script.md                # Exact 3–4 minute judging demonstration sequence
│   ├── model-cards.md                # Data, limitations and metrics for every model
│   └── decisions/                    # Short architecture decision records: why a major choice was made
│       ├── 001-agent-state-machine.md
│       └── 002-late-fusion.md
├── frontend/                         # React + TypeScript + Vite application
│   ├── package.json                  # Frontend packages and npm scripts
│   ├── vite.config.ts                # Development server and API proxy
│   ├── tsconfig.json                 # TypeScript settings
│   ├── index.html                    # Vite entry HTML only
│   ├── public/
│   │   └── demo/                     # Small public preview images only, never large raw data
│   └── src/
│       ├── main.tsx                  # React app bootstrap
│       ├── App.tsx                   # Page composition and app-level state
│       ├── api/
│       │   ├── client.ts             # Fetch wrapper, base URL and typed error handling
│       │   └── analysis.ts           # upload(), createAnalysis(), getJob() calls
│       ├── components/
│       │   ├── AppShell.tsx          # Sidebar/top-level layout
│       │   ├── InputModeTabs.tsx     # Single / change / fusion selection
│       │   ├── ImageUploader.tsx     # File slots and validation results
│       │   ├── QueryComposer.tsx     # Natural-language input and example prompts
│       │   ├── MapCanvas.tsx         # Leaflet map and raster preview layer
│       │   ├── EvidenceOverlay.tsx   # Bounding boxes, masks and legend
│       │   ├── BeforeAfterSlider.tsx # Change-analysis comparison view
│       │   ├── AnswerCard.tsx        # Answer, confidence, caveat and findings
│       │   ├── AgentTrace.tsx        # Observable selected tools and parameters
│       │   ├── ReportButton.tsx      # Download final report
│       │   └── LoadingState.tsx      # Honest progress state; never fake a finished model run
│       ├── features/
│       │   └── analysis/
│       │       ├── types.ts          # Shared frontend types matching backend schemas
│       │       ├── useAnalysis.ts    # Hook that submits a job and manages loading/error/result
│       │       └── demoPrompts.ts    # Curated, reliable demo questions
│       ├── styles/
│       │   ├── tokens.css            # Colours, spacing, typography
│       │   └── globals.css           # Global styles only
│       └── tests/
│           └── App.test.tsx          # UI behaviour test for mode, request, result and error states
├── backend/                          # Python FastAPI service
│   ├── pyproject.toml                # Python dependencies and lint/test configuration
│   ├── Dockerfile                    # Reproducible backend runtime
│   ├── app/
│   │   ├── main.py                   # Creates FastAPI app, routers, middleware and static health endpoint
│   │   ├── core/
│   │   │   ├── config.py             # Environment settings, paths and model configuration
│   │   │   ├── logging.py            # Structured request/job logging
│   │   │   └── errors.py             # Domain exceptions converted to consistent API errors
│   │   ├── api/
│   │   │   ├── router.py             # Combines all API routers under /api/v1
│   │   │   ├── health.py             # /health for deployment and demo checks
│   │   │   ├── uploads.py            # /uploads: accepts files and returns metadata/validation
│   │   │   ├── analyses.py           # /analyses: creates an analysis run
│   │   │   ├── jobs.py               # /jobs/{id}: job/result polling (needed when inference is slow)
│   │   │   └── reports.py            # /reports/{id}: generated JSON/PDF report download
│   │   ├── schemas/
│   │   │   ├── analysis.py           # Pydantic request/result, evidence and trace schemas
│   │   │   ├── upload.py             # Upload and raster metadata schemas
│   │   │   └── common.py             # API error and pagination schemas
│   │   ├── services/
│   │   │   ├── analysis_service.py   # Main application use-case: run one validated analysis
│   │   │   ├── upload_service.py     # Secure local storage, filename normalisation, checksum
│   │   │   ├── preview_service.py    # Raster-to-browser preview PNG and colour stretch
│   │   │   ├── report_service.py     # Turns result, trace and evidence into report artifacts
│   │   │   └── demo_service.py       # Loads pre-cached scenes / responses for judge-safe demo mode
│   │   ├── agent/
│   │   │   ├── controller.py         # Explicit workflow orchestration; no hidden chain-of-thought
│   │   │   ├── query_parser.py       # Text → constrained TaskSpec JSON
│   │   │   ├── validator.py          # Ensures number/type/alignment of images matches requested task
│   │   │   ├── router.py             # TaskSpec → registered tool sequence
│   │   │   ├── synthesizer.py        # Makes concise response from tool outputs; attaches caveats
│   │   │   └── trace.py              # Adds observable tool names, safe parameters and statuses
│   │   ├── geospatial/
│   │   │   ├── raster_reader.py      # Rasterio open, metadata extraction, band-safe reads
│   │   │   ├── compatibility.py      # TIFF/GeoTIFF checks: CRS, bands, size, transform, nodata
│   │   │   ├── alignment.py          # Same-grid test; later reproject/resample to common grid
│   │   │   ├── indices.py            # NDVI/NDWI and simple explainable baseline operations
│   │   │   ├── masks.py              # Converts binary/probability arrays to PNG/GeoJSON evidence
│   │   │   └── types.py              # RasterAsset, PairAsset, GeographicBounds dataclasses
│   │   ├── models/
│   │   │   ├── registry.py           # One safe registry of every permitted tool/model and version
│   │   │   ├── base.py               # Abstract ModelAdapter contract
│   │   │   ├── vqa_adapter.py        # `run(image, question) → VQAOutput`
│   │   │   ├── caption_adapter.py    # `run(image) → CaptionOutput`; alternate: grounding_adapter.py
│   │   │   ├── change_adapter.py     # `run(before, after, question) → ChangeOutput`
│   │   │   ├── fusion_adapter.py     # `run(optical, sar, question) → FusionOutput`
│   │   │   ├── mock_adapters.py      # Deterministic demo outputs while models are being trained
│   │   │   └── postprocess.py        # Confidence normalisation and backend-independent result conversion
│   │   ├── repositories/
│   │   │   ├── assets.py             # Saves and loads upload metadata
│   │   │   ├── analyses.py           # Saves analysis state, result and trace
│   │   │   └── database.py           # SQLite now; database session abstraction for Postgres later
│   │   └── workers/
│   │       ├── queue.py              # In-process MVP queue; replace with Celery/RQ only if needed
│   │       └── tasks.py              # Long-running inference and preview tasks
│   └── tests/
│       ├── api/                      # Endpoint contract tests
│       ├── agent/                    # Query-to-route and invalid-input tests
│       ├── geospatial/               # GeoTIFF metadata/alignment/index tests using tiny fixtures
│       └── models/                   # Adapter contracts; mock models only in normal CI
├── ml/                               # Training and offline inference experiments; never imported directly by frontend
│   ├── README.md                     # Dataset setup, hardware expectation and reproducible commands
│   ├── common/
│   │   ├── config.py                 # Shared experiment configuration
│   │   ├── metrics.py                # VQA/caption/change/fusion metrics
│   │   ├── preprocessing.py          # Sensor-aware normalisation and patch loading
│   │   └── export.py                 # Exports a verified checkpoint to backend model path
│   ├── vqa/
│   │   ├── dataset.py                # RSVQA/VRSBench loader and answer normalisation
│   │   ├── train.py                  # Fine-tuning entry point
│   │   ├── evaluate.py               # Held-out benchmark evaluation only
│   │   └── inference.py              # Thin wrapper used by backend vqa_adapter.py
│   ├── captioning/
│   │   ├── dataset.py                # VRSBench caption data loader
│   │   ├── train.py
│   │   └── inference.py
│   ├── change/
│   │   ├── dataset.py                # CDVQA pair/question loader; preserves expected answer format
│   │   ├── train.py
│   │   ├── evaluate.py
│   │   └── inference.py
│   ├── fusion/
│   │   ├── dataset.py                # BigEarthNet-MM optical/SAR paired loader
│   │   ├── train.py                  # Late-fusion training; logs sensor normalisation
│   │   ├── evaluate.py
│   │   └── inference.py
│   └── experiments/                  # YAML configs; never commit checkpoints or raw data
│       ├── vqa_baseline.yaml
│       ├── change_baseline.yaml
│       └── fusion_baseline.yaml
├── data/                             # Git ignores the contents except small manifest/examples
│   ├── README.md                     # Download rules, licenses, expected disk layout
│   ├── manifests/                    # CSV/JSON list of scene IDs and split names
│   ├── raw/                          # Original benchmark/downloaded scenes — never commit
│   ├── interim/                      # Converted/reprojected scenes — never commit
│   ├── processed/                    # Tiled model-ready samples — never commit
│   └── demo/                         # 2–3 curated tiny cached AOIs + answer/evidence fixtures
├── storage/                          # Runtime-created and Git ignored
│   ├── uploads/                      # User-uploaded original files
│   ├── previews/                     # Browser-ready preview images
│   ├── evidence/                     # Generated masks, bounding boxes and GeoJSON
│   ├── reports/                      # Downloadable result reports
│   └── satquery.db                   # MVP SQLite DB
├── scripts/
│   ├── bootstrap_demo_data.py        # Validates/copies small demo assets to storage
│   ├── check_geotiff.py              # CLI diagnostic for CRS/band/alignment issues
│   ├── build_model_registry.py       # Verifies model files and writes versions/checksums
│   └── seed_demo.py                  # Seeds known demo analyses for offline presentation
├── infra/
│   ├── nginx.conf                    # Optional reverse proxy in final deployment
│   └── deployment.md                 # Local laptop/Docker deployment guide
└── .github/workflows/
    └── ci.yml                        # Runs backend unit tests and frontend checks on every push
```

---

## 5. The API contract — the wall between frontend and ML

This contract lets everyone integrate independently. Freeze it early; new fields may be added, but existing fields should not be renamed casually.

### Upload

```text
POST /api/v1/uploads
multipart/form-data: file=<raster>

Response
{
  "asset_id": "ast_01H...",
  "filename": "before.tif",
  "validation": {
    "accepted": true,
    "format": "GeoTIFF",
    "crs": "EPSG:32643",
    "width": 1024,
    "height": 1024,
    "band_count": 4,
    "nodata": null,
    "warnings": []
  },
  "preview_url": "/storage/previews/ast_01H.png"
}
```

### Create an analysis

```text
POST /api/v1/analyses
{
  "mode": "single | change | fusion",
  "query": "What changed between these dates?",
  "assets": {
    "image": "ast_...",                 // single mode
    "before": "ast_...", "after": "ast_...", // change mode
    "optical": "ast_...", "sar": "ast_..."    // fusion mode
  },
  "demo_mode": false
}
```

### Unified analysis result

```json
{
  "analysis_id": "ana_01H...",
  "status": "completed",
  "task": "change_vqa",
  "answer": "Built-up area increased in the eastern corridor.",
  "confidence": 0.88,
  "caveats": ["Change confidence is lower in no-data pixels."],
  "findings": [
    {"label": "built_up_increase", "value": "increase", "confidence": 0.88}
  ],
  "evidence": [
    {"type": "mask", "label": "probable change", "url": "/storage/evidence/ana_01H_mask.png", "bounds": [72.1, 22.5, 72.2, 22.6]}
  ],
  "trace": [
    {"step": 1, "tool": "raster_compatibility", "status": "completed", "parameters": {"require_same_grid": true}, "summary": "Both images aligned."},
    {"step": 2, "tool": "change_adapter_v1", "status": "completed", "parameters": {"threshold": 0.55}, "summary": "Generated change probabilities."},
    {"step": 3, "tool": "cdvqa_formatter", "status": "completed", "parameters": {}, "summary": "Produced answer."}
  ],
  "report_url": "/api/v1/reports/ana_01H"
}
```

### Hard validation rules

| Mode | Required assets | Reject when |
|---|---|---|
| `single` | one optical/multispectral or SAR image | format unsupported or file unreadable |
| `change` | `before` and `after` | same CRS/grid requirement fails, pair uses incompatible dimensions, images cannot be reprojected |
| `fusion` | `optical` and `sar` | pair is not co-registered or metadata says different AOIs/times beyond configured tolerance |

For benchmark PNG/JPEG files, allow a `benchmark_mode` manifest that supplies geographic metadata. Never pretend normal JPEGs are fully georeferenced.

---

## 6. The agent workflow (what “agentic” should mean)

Use a **state machine**, not a free-form autonomous agent. The controller may use an LLM only to convert the question into constrained JSON. The tools, parameters, and transitions are fixed and observable.

```text
RECEIVED
  → PARSED                 query_parser creates TaskSpec
  → VALIDATED              validator checks assets and metadata
  → ROUTED                 router selects registered tools
  → RUNNING                tools execute in permitted order
  → SYNTHESISED            answer/evidence/caveats are combined
  → COMPLETED | FAILED     result is stored and returned
```

### `TaskSpec` produced by `query_parser.py`

```json
{
  "intent": "change_vqa",
  "requested_concepts": ["built_up"],
  "requires": ["before", "after"],
  "preferred_evidence": "change_mask",
  "language": "en",
  "confidence": 0.96
}
```

### Fixed routing table

| Intent | Validator | Tool sequence | Evidence |
|---|---|---|---|
| `single_vqa` | one readable raster | preview → VQA adapter → caption/grounding adapter | bounding box or preview |
| `caption` | one readable raster | preview → caption adapter | preview |
| `change_vqa` | temporal pair compatibility | alignment → change adapter → answer formatter | change mask + before/after preview |
| `fusion_analysis` | optical/SAR pair compatibility | alignment → fusion adapter → indices fallback → formatter | paired overlay/mask |

The execution trace must expose the task, real tool/version name, safe parameters, duration, status, and output summary. It must never expose hidden model reasoning.

---

## 7. Model adapter contract

All model adapters use the same pattern so the agent does not become tied to any one framework.

```python
class ModelAdapter(Protocol):
    name: str
    version: str

    def can_run(self, assets: dict, task_spec: TaskSpec) -> bool: ...
    def run(self, assets: dict, task_spec: TaskSpec) -> ToolOutput: ...
```

`ToolOutput` must contain only structured information: `summary`, `confidence`, `findings`, `evidence`, `warnings`, `metrics`, and `model_version`.

### What each AI owner must hand over

| Adapter | Input | Required output | Primary evaluation data |
|---|---|---|---|
| `vqa_adapter.py` | one image + question | short answer, confidence, optional bbox | RSVQA / VRSBench |
| `caption_adapter.py` | one image | scene description, confidence | VRSBench |
| `change_adapter.py` | before + after + question | benchmark-compatible answer, change probability map/mask, confidence | CDVQA |
| `fusion_adapter.py` | optical + SAR + question | land/water/built-up findings, evidence mask, confidence | BigEarthNet-MM / open paired data |

The backend must be able to call `mock_adapters.py` with exactly the same input/output shape. That means UI work never waits for training.

---

## 8. Data and GeoTIFF pipeline

### Ingestion path

```text
upload → checksum + safe name → Rasterio metadata read → validation result
       → preview generation → storage record → asset_id returned to frontend
```

### Pair preparation path

```text
two assets → compare CRS / transform / dimensions / bounds
           → same-grid: continue
           → safely reproject/resample: create derived aligned assets and record parameters
           → impossible: return actionable validation error
```

### Required metadata to retain for every asset

- original filename and checksum;
- source type: user upload, benchmark, or cached demo;
- acquisition date if known;
- modality: optical, multispectral, SAR, or unknown;
- CRS, transform, bounds, width/height, band count, dtype and nodata;
- derived preview/evidence paths; and
- parent asset IDs for any reprojected or tiled derivative.

### Visual previews

Browser components cannot directly understand multi-band GeoTIFFs. `preview_service.py` creates a lightweight PNG/JPEG preview and records the stretch/band mapping. This preview is display-only; models always use the source raster or a explicitly recorded normalised derivative.

---

## 9. Build order — follow this, in order

### Week 1: prove the shell

1. Create the repository structure and run frontend + backend locally.
2. Implement the API schemas, mock adapters, static demo images, and exact response contract.
3. Build the UI against mock responses: upload slots, mode tabs, query box, answer card, evidence overlay, trace.
4. Make one complete **cached demo scenario** work without internet.

**Exit criterion:** a judge can run the web app, choose each of the three modes, see an honest agent trace, and download a result — even with mock outputs.

### Week 2: real input safety and first real model

1. Add Rasterio GeoTIFF metadata extraction and PNG preview generation.
2. Add compatibility tests and friendly errors.
3. Integrate the first genuine remote-sensing VQA or caption model.
4. Create benchmark data manifests and a minimal evaluation script.

**Exit criterion:** one upload produces a real model result, and bad pair inputs are rejected with a clear reason.

### Week 3: mandatory pair tasks

1. Integrate change adapter using CDVQA-compatible input/output.
2. Add before/after comparison and mask overlay.
3. Integrate BigEarthNet-MM optical–SAR fusion baseline.
4. Make a short model card and metrics file for each real model.

**Exit criterion:** all required modes execute end-to-end with at least one real model/algorithm output each.

### Week 4: scoring, polish and resilience

1. Test prescribed test splits without leaking train data.
2. Calibrate confidence and show uncertainty/no-data warnings.
3. Cache two polished scenarios: flood/water and built-up change.
4. Write the demo script, report export, README, Docker run instructions, and a 3-minute fallback screen recording.

**Exit criterion:** another laptop can run the demo from the README and the agent trace proves each requirement.

---

## 10. Four-person ownership plan

| Person | Owns | First task | Definition of done |
|---|---|---|---|
| **A — Platform / agent owner** | `backend/app/api`, `agent`, `schemas`, `repositories`, Docker | Freeze the API schema and implement mock analysis end-to-end | Every mode receives a structured result and trace; no UI code depends on model internals |
| **B — Single-image owner** | `ml/vqa`, `ml/captioning`, `models/vqa_adapter.py`, `models/caption_adapter.py` | Get one VQA/caption benchmark sample through the adapter | Adapter handles documented input, produces contract-valid JSON, logs model/version and benchmark metric |
| **C — Change owner** | `ml/change`, `models/change_adapter.py`, `BeforeAfterSlider` support | Make CDVQA-format pair loader and baseline change result | Pair answer plus aligned mask are returned through same API; tests cover a known demo pair |
| **D — Fusion + geospatial/UI owner** | `ml/fusion`, `geospatial`, `models/fusion_adapter.py`, map/evidence UI | Implement Rasterio metadata read + a BigEarthNet-MM pair baseline | GeoTIFF compatibility and paired optical/SAR output are visible on map with a trace |

### Integration rules for all four people

1. No one edits another owner’s core module without a small issue/PR discussion.
2. Do not import training code into the backend directly. Export a small inference wrapper/checkpoint.
3. Every adapter must be callable with a mock fixture in a unit test.
4. No model writes directly to the database or frontend; only services/repositories do that.
5. A tool must return a warning when it cannot support a requested modality, instead of producing a confident invented answer.

---

## 11. What to postpone deliberately

- global satellite search and live Earth Engine/Sentinel downloads;
- general multilingual conversational ability;
- a vector database and semantic image retrieval;
- arbitrary AOI drawing and live geocoding;
- hyperspectral models;
- authentication, user accounts and collaboration;
- microservices, Kubernetes, and distributed queues.

These can be represented as “future work” in your presentation. None is needed to prove the mandatory workflow, and each carries enough complexity to endanger the deadline.

## 12. First meeting checklist

Before writing models, your team should answer these together:

1. Which one additional single-image task will you ship first: captioning or grounding? Choose one, document it, and finish it.
2. Which two cached demo AOIs will you use, and do you have rights to use their images?
3. What are the exact input band conventions for each demo asset?
4. What response field will represent confidence for each model, and what does it mean?
5. Who owns the `api-contract.md` and has final say on changing it? This should be Person A.

Then create the skeleton exactly as above, commit it, and make the Week 1 mock demo run before beginning serious training.
