from pathlib import Path
from flask import Flask, jsonify, render_template, request
from werkzeug.utils import secure_filename

BASE = Path(__file__).resolve().parent
UPLOADS = BASE / 'uploads'
UPLOADS.mkdir(exist_ok=True)

app = Flask(__name__, template_folder='app/templates')
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024
ALLOWED = {'.tif', '.tiff', '.png', '.jpg', '.jpeg'}

SCENARIOS = {
    'flood': {
        'answer': 'Comparing Sentinel-1 SAR passes, water extent near the settlement grew from roughly 4 hectares to 31 hectares between March 2023 and July 2025 — the village marked on the map is now partially within the flood boundary.',
        'confidence': 87, 'reveal_flood': True,
        'task': 'Bi-temporal change detection using SAR imagery'
    },
    'crop': {
        'answer': 'NDVI over the two farmland plots south of the river shows healthy, stable vegetation vigour — no sign of stress in this pass. The northern plot reads slightly lower, consistent with a recent harvest rather than damage.',
        'confidence': 79, 'reveal_flood': False,
        'task': 'Vegetation analysis / NDVI interpretation'
    },
    'border': {
        'answer': 'Change detection between the two most recent optical passes shows a small new structure near the forest edge, roughly 60m² in footprint. Recommend a higher-resolution follow-up pass to confirm.',
        'confidence': 68, 'reveal_flood': False,
        'task': 'Bi-temporal optical change detection'
    },
    'default': {
        'answer': 'This v2 demo has a working Flask backend and the interactive SatQuery interface. Open-ended model inference is still a demo layer; the next step is connecting the specialist models and real satellite imagery.',
        'confidence': 74, 'reveal_flood': False,
        'task': 'General remote-sensing query'
    }
}

def infer_scenario(query: str, hint: str | None = None) -> str:
    if hint in SCENARIOS and hint != 'default':
        return hint
    q = query.lower()
    if any(w in q for w in ('flood', 'water extent', 'inundat', 'river', '2023', '2025')):
        return 'flood'
    if any(w in q for w in ('crop', 'cropland', 'ndvi', 'vegetation', 'healthy')):
        return 'crop'
    if any(w in q for w in ('construction', 'structure', 'forest edge', 'border', 'building')):
        return 'border'
    return 'default'

@app.get('/')
def home():
    return render_template('index.html')

@app.get('/health')
def health():
    return jsonify({'status': 'ok', 'service': 'SatQuery AI Flask backend'})

@app.post('/api/query')
def query():
    payload = request.get_json(silent=True) or {}
    query_text = str(payload.get('query', '')).strip()
    if not query_text:
        return jsonify({'error': 'Query cannot be empty.'}), 400
    scenario = infer_scenario(query_text, payload.get('scenario'))
    result = SCENARIOS[scenario]
    return jsonify({
        'scenario': scenario,
        'answer': result['answer'],
        'confidence': result['confidence'],
        'reveal_flood': result['reveal_flood'],
        'task': result['task'],
        'backend': 'flask'
    })

@app.post('/api/upload')
def upload():
    if 'file' not in request.files:
        return jsonify({'error': 'No file field supplied.'}), 400
    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'No file selected.'}), 400
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED:
        return jsonify({'error': f'Unsupported file type: {ext}. Use GeoTIFF/TIFF, PNG, or JPEG.'}), 400
    name = secure_filename(file.filename)
    destination = UPLOADS / name
    file.save(destination)
    return jsonify({'message': 'Upload received.', 'filename': name, 'type': ext, 'size_bytes': destination.stat().st_size})

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
