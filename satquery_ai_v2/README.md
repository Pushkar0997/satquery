# SatQuery AI — V2 Flask Demo

This version replaces the FastAPI + separate frontend-server setup with one simple Flask application. The supplied HTML demo has been preserved as the visual basis and wired to Flask.

## Why Flask in V2

- One Python app serves both UI and backend.
- No Uvicorn command.
- No `python-multipart` dependency.
- No separate frontend server.
- Run one command: `python run.py`.
- The frontend calls relative endpoints such as `/api/query`, so there is no CORS setup for the local demo.

## Windows / VS Code setup

Open PowerShell in this folder:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python run.py
```

Then open:

http://127.0.0.1:5000

Health check:

http://127.0.0.1:5000/health

### Even easier

Double-click `run.bat`. It creates the virtual environment, installs dependencies, and starts Flask.

## What works in V2

- The supplied SatQuery visual design is the main frontend.
- Interactive before/after comparison slider.
- AOI demo control.
- Optical / SAR / NDVI layer chips.
- Suggested natural-language queries.
- Free-form query box.
- Frontend-to-Flask API connection.
- Scenario routing for flood, crop/NDVI, and construction/change questions.
- Confidence display and agent trace UI.
- Image upload endpoint for TIFF/GeoTIFF, PNG, and JPEG.
- `/health` backend check.

## What is still simulated

The answers and map evidence in this V2 are demo data. Real Sentinel/ISRO imagery, embeddings, vector retrieval, VQA, grounding, change-detection models, optical-SAR fusion, and production confidence scoring are not yet connected.

The intended next step is to replace the scenario function in `app.py` with the actual specialist-model pipeline without changing the frontend contract.

## Project structure

```text
satquery_ai_v2/
├── app.py
├── run.py
├── run.bat
├── requirements.txt
├── README.md
├── app/
│   └── templates/
│       └── index.html
├── uploads/
├── data/
│   ├── raw/
│   ├── processed/
│   └── index/
├── models/
└── docs/
```
