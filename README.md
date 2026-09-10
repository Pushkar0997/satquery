# SatQuery AI

The Week 1 foundation for SIH26167. It includes a working frontend shell, a FastAPI backend, mock specialist tools, upload validation and an observable agent trace. The mock tools make the demo reliable while the real VQA, change and fusion models are developed independently.

## Start in development

### Backend

```bash
cd backend
python -m pip install -e .
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite development server forwards `/api` to FastAPI on port 8000.

### Verify the Week 1 workflow

```bash
cd backend
python -m unittest discover -s tests
```

## Week 1 demo contract

The UI is complete enough to demonstrate all three analysis modes using deterministic, clearly labelled mock adapters. In single-image mode, both VQA and scene-caption adapters execute so the required second single-image capability is visible in the trace. `POST /api/v1/analyses` returns an answer, confidence, evidence overlay and execution trace. Later ML code replaces only files in `backend/app/models/`; it must preserve the response contract in `backend/app/schemas/analysis.py`.

Read [docs/api-contract.md](docs/api-contract.md) before changing a request or response field.
