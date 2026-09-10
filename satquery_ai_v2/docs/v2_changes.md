# V2 Changes

1. FastAPI/Uvicorn removed from the local demo path.
2. Flask now serves the HTML page and JSON API from the same process.
3. The supplied `satquery_demo.html` was used as the frontend baseline.
4. External Google Fonts were removed so the demo does not depend on a network font request; the visual typography falls back to Georgia/Inter-compatible system fonts.
5. The original visual sections remain: sticky navigation, hero, two-panel map/chat demo, use cases, pipeline, and footer.
6. The original scenario interactions are now sent to `/api/query` instead of being entirely simulated in browser JavaScript.
7. A simple `/api/upload` endpoint accepts GeoTIFF/TIFF/PNG/JPEG files for the next ingestion stage.
8. The current map is intentionally the demo illustration from the supplied HTML, not live satellite imagery.
