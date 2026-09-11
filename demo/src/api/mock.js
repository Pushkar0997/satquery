/* ---------------------------------------------------------------------------
 * api/mock.js — the ONLY module containing scripted demo data
 *
 * Everything the app knows that did not come out of a measurement lives here:
 * the tile index, the scenario fixtures, the answer templates, the starter
 * questions, the trace step wording. Nothing else in the codebase hardcodes a
 * response value. Replacing this file with a real client is the whole swap.
 *
 * The exported surface matches the shape pinned in CONTRACT.md:
 *
 *     query(text) -> { tile_id, confidence, answer, image_url, ... }
 *
 * Two things here are real rather than scripted, on purpose:
 *
 *   1. CONFIDENCE. CONTRACT.md INV-1 forbids a confidence number that was not
 *      computed at request time. So the demo does not fake one: it runs an
 *      actual TF-IDF vectoriser over the tile index and returns a real cosine
 *      similarity between the query vector and the retrieved tile vector. The
 *      vector space is lexical rather than CLIP, which is a much weaker model
 *      than the real pipeline — but the number on screen is genuinely the
 *      similarity that ranked that tile, and it moves when the query moves.
 *      Type something off-topic and the confidence drops and the app says so.
 *
 *   2. EVERY FIGURE IN AN ANSWER. CONTRACT.md INV-2 forbids stating a specific
 *      number the system did not compute. Every number interpolated into an
 *      answer below comes from analyzeScene(), which measures the same raster
 *      the user is looking at. There are no invented percentages in this file,
 *      and the `provenance` array on each response says where each one came
 *      from so a reviewer can check that claim without reading the source.
 *
 * What IS scripted: which scenarios exist, what the tiles are called, the
 * sentence frames the numbers are dropped into, and the labels on the trace
 * steps. That is the part a real backend replaces.
 * ------------------------------------------------------------------------- */

import { analyzeScene, GRID, AOI_KM, GSD_M } from '../scene.js';
import { renderThumb, waterMethodFor, LAYER_IDS } from '../render.js';

export const IS_MOCK = true;
export const CONTRACT_VERSION = '1.1-demo';

/* Below this cosine similarity the system declines to answer rather than
 * guessing. A demo that says "I do not have evidence for that" when it does not
 * is worth more than one that always produces a confident paragraph. */
export const CONFIDENCE_FLOOR = 0.17;

/* ---- dates ---------------------------------------------------------------
 * Derived from the clock so the demo never quotes a stale acquisition date.
 * The "after" pass is recent enough that "in the last week" is literally true
 * whenever this is presented. */

function isoDate(d) { return d.toISOString().slice(0, 10); }
function quarterOf(d) { return d.getUTCFullYear() + '-Q' + (Math.floor(d.getUTCMonth() / 3) + 1); }
function daysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}
function prettyDate(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

const DATE_AFTER = daysAgo(2);
const DATE_BEFORE = daysAgo(101);

/* ---- scenario fixtures ---------------------------------------------------
 * Place names, framing copy and starter questions. Per spec/decisions.md D-008
 * the infrastructure scenario stays at monitoring and situational awareness. */

export const SCENARIOS = [
  {
    id: 'flood',
    name: 'Flood response',
    flag: 'Flagship',
    aoi: 'AOI-01 · Periyar delta',
    district: 'Lower delta district cell',
    summary: 'Monsoon flood in a delta district. Optical is blind through the storm; SAR is not.',
    state_code: 'KL',
    tile_no: '114',
    before_label: 'Pre-monsoon baseline',
    after_label: 'Peak event pass',
    starters: [
      'Which areas are underwater right now?',
      'Which roads are still passable to the relief staging point?',
      'Why are you not using the optical imagery?',
      'Which villages are cut off?',
    ],
  },
  {
    id: 'quake',
    name: 'Earthquake damage',
    aoi: 'AOI-02 · District town',
    district: 'State disaster response cell',
    summary: 'Structural damage assessment across a dense district town after a shallow event.',
    state_code: 'UK',
    tile_no: '207',
    before_label: 'Pre-event baseline',
    after_label: 'Post-event pass',
    starters: [
      'How much of the built-up area is severely damaged?',
      'Is the arterial highway blocked?',
      'Where is the damage concentrated?',
    ],
  },
  {
    id: 'infra',
    name: 'Infrastructure change',
    aoi: 'AOI-03 · Border sector terrain',
    district: 'Terrain monitoring cell',
    summary: 'Change monitoring over remote terrain: new alignments and cleared ground between passes.',
    state_code: 'AR',
    tile_no: '052',
    before_label: 'Q1 baseline pass',
    after_label: 'Current pass',
    starters: [
      'What has changed in this sector since the last pass?',
      'How much new road has been built?',
      'How much vegetation was cleared?',
    ],
  },
];

export function getScenario(id) {
  return SCENARIOS.find((s) => s.id === id) || SCENARIOS[0];
}

/* ---- display copy for the imagery layers ---------------------------------
 * render.js knows how to draw each layer; what each one is called, and which
 * instrument it stands for, is scripted content and belongs here. In a real
 * build these come from the tile metadata for the AOI. */

const LAYER_LABELS = {
  optical: { name: 'Optical', hint: 'Sentinel-2 true colour' },
  sar: { name: 'SAR', hint: 'Sentinel-1 VV backscatter' },
  water: { name: 'Water index', hint: 'NDWI / SAR water mask' },
};

const WATER_METHOD_LABELS = {
  sar_mask: {
    label: 'SAR water mask · Sentinel-1 VV',
    reason: 'optical index unusable under cloud',
  },
  ndwi: {
    label: 'NDWI · (green − NIR) / (green + NIR)',
    reason: 'optical pass usable',
  },
};

/** The imagery layers, in toolbar order, with their display names. */
export const LAYERS = LAYER_IDS.map((id) => ({ id, ...LAYER_LABELS[id] }));

/**
 * Which index actually answered the water question for this pass, and why.
 * The choice is measured in render.js from the cloud mask; the wording is here.
 */
export function waterMethod(scenarioId, date) {
  const m = waterMethodFor(scenarioId, date);
  return { ...m, ...WATER_METHOD_LABELS[m.method] };
}

/* ---- gazetteer -----------------------------------------------------------
 * Every human-readable place name in the app. scene.js generates geometry with
 * opaque ids (S1, R4, HUB) and measures it; the names those ids are displayed
 * under are scripted content, so they live here with the rest of it. A real
 * build resolves these from a gazetteer or from the tile metadata instead.
 */

export const PLACES = {
  flood: {
    HUB: 'Relief staging point',
    S1: 'Kadapra', S2: 'Neelamperoor', S3: 'Cheruthana',
    S4: 'Mankombu', S5: 'Veeyapuram', S6: 'Thakazhi',
    R1: 'SH-11 Kadapra link',
    R2: 'NH-183 river crossing',
    R3: 'Cheruthana approach',
    R4: 'Mankombu bund road',
    R5: 'Veeyapuram causeway',
    R6: 'Thakazhi ferry road',
    R7: 'Delta ring road',
    R8: 'Upland bypass',
    R9: 'Kadapra-Neelamperoor link',
    R10: 'Eastern trunk road',
  },
  quake: {
    S1: 'District town',
    A1: 'Arterial highway',
  },
  infra: {
    E1: 'Existing metalled track',
    N1: 'New graded alignment',
    P1: 'Graded platform',
    P2: 'Secondary hardstanding',
  },
};

/** Display name for a scene feature id, falling back to the id itself. */
export function placeName(scenarioId, id) {
  const table = PLACES[scenarioId];
  return (table && table[id]) || id;
}

function names(scenarioId, ids) {
  return (ids || []).map((id) => placeName(scenarioId, id));
}

/* Evidence regions arrive from scene.js as a bbox, a reference and the numbers
 * behind them. The sentence describing one is written here. */
function describeEvidence(scenarioId, ev) {
  const m = ev.metrics || {};
  const of = (id) => placeName(scenarioId, id);
  switch (ev.kind) {
    case 'extent':
      return {
        label: 'Peak inundation window',
        note: `${m.km2} km² of new water inside a ${m.window_km} km window`,
      };
    case 'settlement':
      return {
        label: of(ev.ref) + ' built-up area',
        note: `${m.inundated_pct}% of mapped built-up cells under water`,
      };
    case 'breach':
      return {
        label: of(ev.ref) + ' — first breach',
        note: `${m.submerged_km} km of ${m.length_km} km submerged`,
      };
    case 'damage_extent':
      return {
        label: 'Peak damage concentration',
        note: `${m.km2} km² classed severe within the window`,
      };
    case 'block':
      return {
        label: 'Worst-affected block ' + ev.ref,
        note: `mean severity ${m.severity} across the block footprint`,
      };
    case 'alignment':
      return {
        label: 'New alignment corridor',
        note: `${m.km} km of new graded surface`,
      };
    case 'site':
      return {
        label: of(ev.ref),
        note: `${m.area_ha} ha of cleared hardstanding`,
      };
    default:
      return { label: ev.id, note: '' };
  }
}

/** Attach display strings to the measured evidence regions. */
function dressEvidence(scenarioId, list) {
  return (list || []).map((ev) => ({ ...ev, ...describeEvidence(scenarioId, ev) }));
}

/* ---- tile index ----------------------------------------------------------
 * The retrievable corpus. `terms` is the searchable descriptor for each tile —
 * in the real system this is replaced by a CLIP image embedding; here it is the
 * text the lexical vectoriser indexes. Tile IDs follow the format pinned in
 * CONTRACT.md: <STATE>-<NNN> · <YYYY>-Q<N> · <sensor>
 */

function tileId(sc, date, sensor) {
  return sc.state_code + '-' + sc.tile_no + ' · ' + quarterOf(date) + ' · ' + sensor;
}

/* Descriptors are written in canonical terms, and a term repeated is a term
 * weighted — the vectoriser uses sublinear term frequency, so listing `flood`
 * three times makes this the tile a flood question should land on rather than
 * merely a tile that mentions flooding. Without that, the shortest descriptor
 * wins every query, because cosine normalises by document length. */
const TILE_INDEX = [
  {
    key: 'flood-s1-after',
    scenario: 'flood', date: 'after', sensor: 'Sentinel-1', layer: 'sar',
    acquired: isoDate(DATE_AFTER),
    terms: `flood flood flood water water extent extent access access road road
            village village sar sar relief crop mask delta river`,
  },
  {
    key: 'flood-s2-after',
    scenario: 'flood', date: 'after', sensor: 'Sentinel-2', layer: 'optical',
    acquired: isoDate(DATE_AFTER),
    terms: `optical optical optical cloud cloud cloud explain explain sensor monsoon`,
  },
  {
    key: 'flood-s2-before',
    scenario: 'flood', date: 'before', sensor: 'Sentinel-2', layer: 'optical',
    acquired: isoDate(DATE_BEFORE),
    terms: `baseline baseline baseline optical crop crop village river water terrain road`,
  },
  {
    key: 'quake-s2-after',
    scenario: 'quake', date: 'after', sensor: 'Sentinel-2', layer: 'optical',
    acquired: isoDate(DATE_AFTER),
    terms: `damage damage damage quake quake quake optical village road access
            extent change`,
  },
  {
    key: 'quake-s1-after',
    scenario: 'quake', date: 'after', sensor: 'Sentinel-1', layer: 'sar',
    acquired: isoDate(DATE_AFTER),
    terms: `sar sar sar damage damage quake change extent`,
  },
  {
    key: 'infra-s2-after',
    scenario: 'infra', date: 'after', sensor: 'Sentinel-2', layer: 'optical',
    acquired: isoDate(DATE_AFTER),
    terms: `change change change alignment alignment vegetation vegetation terrain
            border optical road extent`,
  },
  {
    key: 'infra-s2-before',
    scenario: 'infra', date: 'before', sensor: 'Sentinel-2', layer: 'optical',
    acquired: isoDate(DATE_BEFORE),
    terms: `baseline baseline baseline terrain terrain vegetation border optical alignment`,
  },
];

/* ---- lexical vector space ------------------------------------------------
 * A small TF-IDF model over the tile descriptors. This stands in for the CLIP
 * embedding space and exists so that the confidence number is an actual
 * similarity rather than a constant.
 *
 * Descriptors above are short and written in canonical terms, and the tokeniser
 * below folds an analyst's vocabulary onto those canonical terms. That is a
 * plain thesaurus, and it does the job an embedding model would otherwise do:
 * recognising that "underwater", "submerged" and "inundated" are one concept.
 * Keeping documents short also keeps a good match scoring high — a cosine over
 * a sixty-term descriptor is diluted to the point where nothing clears a
 * sensible threshold. */

const STOPWORDS = new Set(`a an the is are was were be been being of in on at to for from by with
  and or but if then than that this these those it its as into over about
  do does did doing have has had can could should would will shall may might must
  i we you he she they them us me my our your their there here what which who whom
  whose when where any some all no not now still right just show me tell
  give get find please currently today good bad thing things also
  image imagery images picture photo tile tiles scene scenes data area areas
  region place look looking see seeing need want know say says like
  how use used using pass passes acquisition currently please give`.split(/\s+/).filter(Boolean));

/* Analyst vocabulary folded onto the canonical terms used in the descriptors.
 * Keys are matched before stemming and again after, so both "inundated" and
 * "inundation" land on `flood`. */
const SYNONYMS = {
  // water and flooding
  underwater: 'flood', submerged: 'flood', submerg: 'flood', inundated: 'flood',
  inundation: 'flood', inundat: 'flood', flooded: 'flood', flooding: 'flood',
  deluge: 'flood', waterlogged: 'flood', spate: 'flood', overflow: 'flood',
  swamped: 'flood', drowned: 'flood', standing: 'water', wet: 'water',
  waterbody: 'water', ndwi: 'water', submersion: 'flood',
  // extent
  coverage: 'extent', spread: 'extent', much: 'extent', many: 'extent',
  hectare: 'extent', hectares: 'extent', km2: 'extent', size: 'extent',
  worst: 'extent', concentrated: 'extent', concentration: 'extent', hotspot: 'extent',
  total: 'extent', proportion: 'extent', percentage: 'extent', percent: 'extent',
  // roads and access
  highway: 'road', route: 'road', routes: 'road', street: 'road', link: 'road',
  links: 'road', carriageway: 'road', lane: 'road', bridge: 'road',
  causeway: 'road', crossing: 'road', track: 'alignment',
  passable: 'access', impassable: 'access', reachable: 'access', unreachable: 'access',
  blocked: 'access', closed: 'access', open: 'access', reach: 'access',
  connectivity: 'access', cutoff: 'access', isolated: 'access', stranded: 'access',
  marooned: 'access', severed: 'access', drive: 'access', driveable: 'access',
  trafficable: 'access', accessible: 'access', cut: 'access', off: 'access',
  // settlements and response
  settlement: 'village', settlements: 'village', habitation: 'village',
  town: 'village', hamlet: 'village', villages: 'village', people: 'village',
  population: 'village', community: 'village', residents: 'village',
  rescue: 'relief', evacuation: 'relief', evacuate: 'relief', logistics: 'relief',
  staging: 'relief', supply: 'relief', convoy: 'relief', aid: 'relief',
  responder: 'relief', response: 'relief',
  // sensors
  radar: 'sar', sentinel1: 'sar', backscatter: 'sar', microwave: 'sar',
  sentinel2: 'optical', visible: 'optical', truecolour: 'optical',
  truecolor: 'optical', multispectral: 'optical', colour: 'optical', color: 'optical',
  sentinel: 'sar', instrument: 'sensor', band: 'sensor', bands: 'sensor',
  // cloud and weather
  cloudy: 'cloud', overcast: 'cloud', obscured: 'cloud', blind: 'cloud',
  unusable: 'cloud', storm: 'cloud', rain: 'cloud', weather: 'cloud',
  atmospheric: 'cloud', haze: 'cloud', monsoonal: 'monsoon',
  // reasoning
  why: 'explain', reason: 'explain', because: 'explain', instead: 'explain',
  trust: 'explain', confidence: 'explain', reliable: 'explain', certain: 'explain',
  confident: 'explain', accurate: 'explain', sure: 'explain', verify: 'explain',
  provenance: 'explain', evidence: 'explain', computed: 'explain',
  // damage
  damaged: 'damage', destroyed: 'damage', destruction: 'damage', collapse: 'damage',
  collapsed: 'damage', rubble: 'damage', debris: 'damage', structural: 'damage',
  ruined: 'damage', severe: 'damage', severity: 'damage', building: 'damage',
  buildings: 'damage', block: 'damage', blocks: 'damage', builtup: 'damage',
  earthquake: 'quake', seismic: 'quake', tremor: 'quake', aftershock: 'quake',
  rupture: 'quake', fault: 'quake', epicentre: 'quake', epicenter: 'quake',
  shaking: 'quake',
  // change detection
  changed: 'change', changes: 'change', new: 'change', construction: 'change',
  constructed: 'change', built: 'change', appeared: 'change', different: 'change',
  development: 'change', activity: 'change', since: 'change', recent: 'change',
  graded: 'alignment', hardstanding: 'alignment', platform: 'alignment',
  corridor: 'alignment', earthworks: 'alignment', path: 'alignment',
  // land cover
  cropland: 'crop', farm: 'crop', farmland: 'crop', agriculture: 'crop',
  agricultural: 'crop', paddy: 'crop', field: 'crop', fields: 'crop',
  harvest: 'crop', forest: 'vegetation', tree: 'vegetation', trees: 'vegetation',
  green: 'vegetation', clearing: 'vegetation', cleared: 'vegetation',
  deforestation: 'vegetation', canopy: 'vegetation',
  ridge: 'terrain', valley: 'terrain', slope: 'terrain', elevation: 'terrain',
  topography: 'terrain', ground: 'terrain', land: 'terrain',
  frontier: 'border', sector: 'border',
  // temporal
  before: 'baseline', previous: 'baseline', prior: 'baseline', earlier: 'baseline',
  reference: 'baseline', historical: 'baseline', past: 'baseline', last: 'baseline',
  compare: 'baseline', comparison: 'baseline',
};

/* Place names inside each AOI are part of the searchable vocabulary — an
 * analyst asking "can we still get to Mankombu" is asking about access to a
 * village, and the index should know that. Derived from the gazetteer above, so
 * the names the map labels and the names the index matches cannot drift. */
for (const [scenarioId, table] of Object.entries(PLACES)) {
  for (const [id, name] of Object.entries(table)) {
    const canonical = id === 'HUB' ? 'relief'
      : /^S\d+$/.test(id) ? 'village'
        : /^[RAENVH]\d+$/.test(id) ? 'road'
          : /^P\d+$/.test(id) ? 'alignment' : null;
    if (!canonical) continue;
    // Index the whole name and each distinctive word in it, so both "Mankombu"
    // and "Mankombu bund road" resolve.
    for (const w of [name.toLowerCase(), ...name.toLowerCase().split(/[\s-]+/)]) {
      if (w.length > 3 && !SYNONYMS[w]) SYNONYMS[w] = canonical;
    }
  }
}
/* Things an analyst moves along a road. */
Object.assign(SYNONYMS, {
  truck: 'access', trucks: 'access', vehicle: 'access', vehicles: 'access',
  lorry: 'access', ambulance: 'access', boat: 'access', boats: 'access',
  traffic: 'access', transport: 'access',
});

/* Deliberately crude suffix stripping. It only has to make "floods" collide
 * with "flood" for the words the thesaurus does not already cover. */
function stem(t) {
  if (t.length > 5 && t.endsWith('ing')) return t.slice(0, -3);
  if (t.length > 5 && t.endsWith('ed')) return t.slice(0, -2);
  if (t.length > 4 && t.endsWith('es')) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

function normalise(raw) {
  if (SYNONYMS[raw]) return SYNONYMS[raw];
  const s = stem(raw);
  return SYNONYMS[s] || s;
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(normalise)
    .filter((t) => !STOPWORDS.has(t));
}

const N_DOCS = TILE_INDEX.length;
const DF = new Map();
for (const tile of TILE_INDEX) {
  tile.tokens = tokenize(tile.terms);
  for (const t of new Set(tile.tokens)) DF.set(t, (DF.get(t) || 0) + 1);
}
const MAX_IDF = Math.log((N_DOCS + 1) / 1) + 1;
function idf(term) {
  const df = DF.get(term);
  return df ? Math.log((N_DOCS + 1) / (df + 1)) + 1 : MAX_IDF;
}

/* A sparse, L2-normalised TF-IDF vector. Out-of-vocabulary query terms are kept
 * and given maximum idf: they match nothing, but they do count towards the
 * norm, so an off-topic question genuinely scores lower instead of being
 * silently discarded to flatter the result. */
function vectorize(tokens) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  const vec = new Map();
  let norm = 0;
  for (const [t, f] of tf) {
    const w = (1 + Math.log(f)) * idf(t);
    vec.set(t, w);
    norm += w * w;
  }
  norm = Math.sqrt(norm) || 1;
  for (const [t, w] of vec) vec.set(t, w / norm);
  return vec;
}

function cosine(a, b) {
  // Iterate the smaller map; the vectors are already unit length.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [t, w] of small) {
    const o = large.get(t);
    if (o) dot += w * o;
  }
  return dot;
}

for (const tile of TILE_INDEX) tile.vec = vectorize(tile.tokens);

/* ---- intent classification ----------------------------------------------- */

/* Intent descriptors are written directly in canonical terms — they are matched
 * against the same normalised query vector, so writing them in raw English
 * would just fold them onto these terms anyway, less legibly. Repetition is
 * weighting: a term listed twice carries more of that intent. */
const INTENTS = [
  { id: 'flood_extent', terms: 'flood flood flood extent extent water water crop terrain' },
  { id: 'road_access', terms: 'access access access road road road relief alignment' },
  { id: 'settlement_status', terms: 'village village village access access relief relief' },
  { id: 'sensor_rationale', terms: 'explain explain explain optical optical cloud cloud sar sensor' },
  { id: 'damage_assessment', terms: 'damage damage damage quake quake extent' },
  { id: 'change_detection', terms: 'change change change alignment vegetation baseline' },
];
for (const it of INTENTS) it.vec = vectorize(tokenize(it.terms));

function classifyIntent(qvec, scenarioId) {
  const scored = INTENTS
    .map((it) => ({ id: it.id, score: cosine(qvec, it.vec) }))
    .sort((a, b) => b.score - a.score);
  const top = scored[0];
  if (!top || top.score < 0.05) {
    // Nothing matched; fall back to the scenario default question.
    return {
      id: scenarioId === 'quake' ? 'damage_assessment'
        : scenarioId === 'infra' ? 'change_detection' : 'flood_extent',
      score: top ? top.score : 0,
      weak: true,
    };
  }
  return { id: top.id, score: top.score, weak: false, runners: scored.slice(1, 3) };
}

/* ---- retrieval ------------------------------------------------------------ */

/* Hybrid search, in the shape spec/decisions.md D-009 settled on: a metadata
 * pre-filter narrows the candidate set, then vector similarity ranks within it.
 * The AOI on screen is the pre-filter — an analyst working a flood in one
 * district is not asking about a town two states away, and letting a shorter
 * descriptor from another AOI win on cosine alone is exactly the failure this
 * pattern exists to prevent.
 *
 * The similarity returned is the raw cosine against the selected tile. The
 * pre-filter changes which tiles are eligible; it never adjusts the number. */
function retrieve(queryText, scenarioId) {
  const qvec = vectorize(tokenize(queryText));
  const candidates = TILE_INDEX.filter((t) => t.scenario === scenarioId);
  const ranked = candidates
    .map((tile) => ({ tile, similarity: cosine(qvec, tile.vec) }))
    .sort((a, b) => b.similarity - a.similarity);
  return {
    qvec,
    ranked,
    prefiltered: candidates.length,
    indexed: TILE_INDEX.length,
  };
}

/* ---- answer composition --------------------------------------------------
 * Sentence frames are scripted. Every value dropped into them is measured.
 * `provenance` records how each one was obtained so the UI can show it. */

function pct(v) { return v + '%'; }

function composeFlood(intent, m, sc) {
  const cutOff = m.reachability.filter((r) => !r.reachable);
  const reach = m.reachability.filter((r) => r.reachable);
  const top = m.restoration_priority && m.restoration_priority[0];
  const nameOf = (id) => placeName('flood', id);
  const push = (field, value, method) => ({ field, value, method });

  if (intent === 'sensor_rationale') {
    return {
      answer:
        `The optical pass for ${prettyDate(isoDate(DATE_AFTER))} is ${pct(m.cloud_after_pct)} cloud, so it cannot see the ground — `
        + `the pre-monsoon optical baseline was ${pct(m.cloud_before_pct)} cloud by comparison. `
        + `Radar is not blocked by cloud, and open water is unusually easy to identify in it: a flat water surface reflects the pulse away from the sensor, `
        + `so flooded ground appears as very low backscatter. The water extent quoted here is thresholded from Sentinel-1 VV, not from an optical index. `
        + `Switch the layer to SAR to see the same area through the storm.`,
      provenance: [
        push('cloud_after_pct', m.cloud_after_pct, 'fraction of AOI cells flagged cloud in the event-date cloud mask'),
        push('cloud_before_pct', m.cloud_before_pct, 'same measurement over the baseline pass'),
      ],
      map: { layer: 'sar', date: 'after', compare: false, evidence: null },
      headline: 'Optical unusable — routed to SAR',
    };
  }

  if (intent === 'road_access') {
    const worst = m.worst_road;
    return {
      answer:
        `Of ${m.roads_total} mapped links in the AOI, ${m.roads_impassable} are impassable and ${m.roads_restricted} restricted; ${m.roads_open} are clear. `
        + `The worst is ${nameOf(worst.id)}, with ${worst.submerged_km} km of its ${worst.length_km} km submerged (${pct(worst.submerged_pct)}). `
        + (top
          ? `Restoring ${nameOf(top.road_id)} would reconnect ${top.settlements_reconnected} settlement${top.settlements_reconnected === 1 ? '' : 's'} `
            + `(${names('flood', top.settlement_ids).join(', ')}) and has ${top.submerged_km} km under water — the shortest bridging task of the options that reconnect anything.`
          : `No single link restoration reconnects an additional settlement.`),
      provenance: [
        push('roads_impassable', m.roads_impassable, 'centreline sampled at ~33 m; link classed impassable above 8% of samples inside the SAR water mask'),
        push('worst_road.submerged_km', worst.submerged_km, 'submerged sample fraction × polyline length'),
        top ? push('restoration_priority[0]', nameOf(top.road_id), 'BFS from the relief staging point re-run once per cut link, counting settlements regained') : null,
      ].filter(Boolean),
      map: { layer: 'sar', date: 'after', compare: false, evidence: 'E3' },
      headline: `${m.roads_impassable} of ${m.roads_total} links impassable`,
    };
  }

  if (intent === 'settlement_status') {
    const worst = m.worst_settlement;
    return {
      answer:
        `${cutOff.length} of ${m.reachability.length} settlements have no passable road route to the relief staging point: ${names('flood', cutOff.map((c) => c.id)).join(', ')}. `
        + `${reach.length === 1 ? nameOf(reach[0].id) + ' is' : names('flood', reach.map((r) => r.id)).join(', ') + ' are'} still reachable. `
        + (worst && worst.inundated_pct > 0
          ? `${nameOf(worst.id)} is also directly inundated — ${pct(worst.inundated_pct)} of its mapped built-up cells are under water. `
          : `No settlement footprint is itself substantially inundated; the problem is access rather than immersion. `)
        + `Isolation here is a routing result, not an observation: it is what the road graph gives once the cut links are removed.`,
      provenance: [
        push('cut_off_count', cutOff.length, 'breadth-first search from the relief staging point over links classed passable'),
        worst ? push(nameOf(worst.id) + '.inundated_pct', worst.inundated_pct, 'built-up cells inside the settlement footprint intersected with the water mask') : null,
      ].filter(Boolean),
      map: { layer: 'sar', date: 'after', compare: false, evidence: 'E2' },
      headline: `${cutOff.length} settlements without road access`,
    };
  }

  // flood_extent, and the default
  return {
    answer:
      `Water now covers ${m.water_after_km2} km² of the ${m.aoi_km2} km² AOI, against ${m.water_before_km2} km² at the pre-monsoon baseline — `
      + `${m.new_water_km2} km² of newly flooded ground, or ${pct(m.new_water_pct_of_aoi)} of the AOI. `
      + `${m.cropland_inundated_ha} ha of mapped cropland is under water (${pct(m.cropland_inundated_pct)} of cropland in the AOI). `
      + `The extent is derived from the Sentinel-1 pass, because the optical pass for the same date is ${pct(m.cloud_after_pct)} cloud. `
      + `Drag the compare slider to see the same frame before and during the event.`,
    provenance: [
      push('water_after_km2', m.water_after_km2, 'cells in the SAR water mask × (33.3 m)²'),
      push('new_water_km2', m.new_water_km2, 'event water mask minus baseline water mask, same cell area'),
      push('cropland_inundated_ha', m.cropland_inundated_ha, 'cells classed cropland intersected with the event water mask'),
      push('cloud_after_pct', m.cloud_after_pct, 'fraction of AOI cells flagged cloud in the event-date cloud mask'),
    ],
    map: { layer: 'sar', date: 'after', compare: true, evidence: 'E1' },
    headline: `${m.new_water_km2} km² newly inundated`,
  };
}

function composeQuake(intent, m) {
  if (intent === 'road_access') {
    return {
      answer:
        `${pct(m.arterial_affected_pct)} of the ${placeName('quake', m.arterial_id)} centreline runs through a corridor with severe structural damage on at least one side, `
        + `so it should be treated as obstructed rather than closed — debris, not collapse of the carriageway itself. `
        + `Damage severity is measured over buildings; the road is inferred from what is standing beside it.`,
      provenance: [
        { field: 'arterial_affected_pct', value: m.arterial_affected_pct, method: 'centreline sampled at ~33 m, taking peak damage severity in a ±4-cell corridor' },
      ],
      map: { layer: 'optical', date: 'after', compare: true, evidence: 'E1' },
      headline: 'Arterial obstructed, not severed',
    };
  }
  return {
    answer:
      `${m.severe_damage_km2} km² of the ${m.builtup_km2} km² built-up footprint classes as severely damaged — ${pct(m.severe_damage_pct_of_builtup)} of built-up area. `
      + `That is ${m.blocks_severe} of ${m.blocks_total} mapped blocks above the severity threshold. `
      + `Damage is concentrated along the rupture trace rather than spread evenly; the worst block scores ${m.worst_blocks[0].severity} on the 0–1 severity index. `
      + `Optical is usable here — the post-event pass is only ${pct(m.cloud_after_pct)} cloud — so this is a true-colour assessment, not a radar one.`,
    provenance: [
      { field: 'severe_damage_km2', value: m.severe_damage_km2, method: 'built-up cells above severity 0.55 × (33.3 m)²' },
      { field: 'blocks_severe', value: m.blocks_severe, method: 'per-block mean severity over the block footprint, threshold 0.42' },
      { field: 'cloud_after_pct', value: m.cloud_after_pct, method: 'fraction of AOI cells flagged cloud in the post-event cloud mask' },
    ],
    map: { layer: 'optical', date: 'after', compare: true, evidence: 'E1' },
    headline: `${pct(m.severe_damage_pct_of_builtup)} of built-up area severely damaged`,
  };
}

function composeInfra(intent, m) {
  const sites = m.new_sites.map((s) => `${placeName('infra', s.id)} (${s.area_ha} ha)`).join(' and ');
  return {
    answer:
      `${m.new_surface_ha} ha of new surface appears between the two passes, none of it present in the baseline. `
      + `That resolves into ${m.new_alignment_km} km of new graded alignment plus two cleared areas — ${sites}. `
      + `${m.vegetation_cleared_ha} ha of the new surface was vegetated in the baseline pass. `
      + `This is change detection over terrain, at the level of what is on the ground and how much of it — extent and activity, not intent.`,
    provenance: [
      { field: 'new_surface_ha', value: m.new_surface_ha, method: 'cells whose land-cover class differs between passes × (33.3 m)² ' },
      { field: 'new_alignment_km', value: m.new_alignment_km, method: 'polyline length of the new alignment × 33.3 m per cell' },
      { field: 'vegetation_cleared_ha', value: m.vegetation_cleared_ha, method: 'changed cells whose baseline class was vegetation' },
    ],
    map: { layer: 'optical', date: 'after', compare: true, evidence: 'E1' },
    headline: `${m.new_surface_ha} ha of new surface`,
  };
}

/* ---- trace ---------------------------------------------------------------
 * The step wording is scripted; the values inside each step are the ones the
 * request actually produced. The UI labels this panel as a simulated pipeline
 * trace, because in this build there is no pipeline behind it. */

function buildTrace(ctx) {
  const { queryText, intent, scenario, measures, best, confidence, evidenceCount, routedToSar } = ctx;

  const steps = [
    {
      n: '01',
      title: 'Interpreting query',
      detail: `intent: ${intent.id} · AOI: ${scenario.aoi.split(' · ')[0]} · window: last 7 days`,
      sub: `${tokenize(queryText).length} content tokens after stopword removal`,
      ms: 210,
      status: 'ok',
    },
    {
      n: '02',
      title: 'Validating data',
      detail: routedToSar
        ? `optical ${measures.cloud_after_pct}% cloud → unusable · routing to SAR`
        : `optical ${measures.cloud_after_pct}% cloud → within tolerance · optical retained`,
      sub: routedToSar
        ? `cloud mask exceeds the 25% usability threshold for an optical index`
        : `cloud mask below the 25% usability threshold`,
      ms: 340,
      status: routedToSar ? 'reroute' : 'ok',
    },
    {
      n: '03',
      title: 'Selecting model',
      detail: routedToSar
        ? 'Sentinel-1 VV water-extent segmentation'
        : 'Sentinel-2 true-colour change segmentation',
      sub: routedToSar
        ? 'low-backscatter threshold, the operational rule for SAR flood mapping'
        : 'per-cell class comparison between passes',
      ms: 260,
      status: 'ok',
    },
    {
      n: '04',
      title: 'Executing',
      detail: `pre-filter ${scenario.aoi.split(' · ')[0]} → ${ctx.prefiltered} of ${ctx.indexed} tiles · ${best.tile.sensor} ${best.tile.acquired} selected`,
      sub: `${GRID}×${GRID} cells at ${GSD_M} m · ${AOI_KM.toFixed(1)} km across`,
      ms: 620,
      status: 'ok',
    },
    {
      n: '05',
      title: 'Synthesising',
      detail: `confidence ${confidence.toFixed(4)} · ${evidenceCount} evidence region${evidenceCount === 1 ? '' : 's'} cited`,
      sub: `cosine similarity between query vector and retrieved tile vector`,
      ms: 300,
      status: confidence < CONFIDENCE_FLOOR ? 'warn' : 'ok',
    },
  ];
  return steps;
}

/* ---- the API -------------------------------------------------------------- */

function confidenceBand(c) {
  if (c >= 0.45) return { label: 'High', tone: 'high' };
  if (c >= 0.28) return { label: 'Moderate', tone: 'moderate' };
  if (c >= CONFIDENCE_FLOOR) return { label: 'Low', tone: 'low' };
  return { label: 'Below threshold', tone: 'floor' };
}

/**
 * The demo's stand-in for POST /query.
 *
 * @param {string} text  the analyst's plain-language question
 * @param {object} ctx   { scenario } — which AOI is on screen
 * @returns {Promise<object>} CONTRACT.md response shape plus demo-only extras
 */
export async function query(text, ctx = {}) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const scenarioId = ctx.scenario || 'flood';
  const scenario = getScenario(scenarioId);

  const { qvec, ranked, prefiltered, indexed } = retrieve(text, scenarioId);
  const best = ranked[0];
  const confidence = best.similarity;         // the real cosine similarity, unmodified
  const intent = classifyIntent(qvec, scenarioId);
  const measures = analyzeScene(scenarioId);

  const routedToSar = scenarioId === 'flood' && measures.cloud_after_pct > 25;

  let composed;
  if (confidence < CONFIDENCE_FLOOR) {
    composed = {
      answer:
        `I do not have evidence in this AOI that supports an answer to that. The closest tile in the index scored `
        + `${confidence.toFixed(2)} cosine similarity against the question, below the ${CONFIDENCE_FLOOR} floor this build will answer above. `
        + `The index currently holds ${TILE_INDEX.length} tiles across ${SCENARIOS.length} AOIs — try a question about water extent, road access or damage in this AOI, `
        + `or switch scenario in the header.`,
      provenance: [
        { field: 'confidence', value: +confidence.toFixed(4), method: 'cosine similarity, query TF-IDF vector against best tile vector' },
      ],
      map: null,
      headline: 'No supporting evidence',
    };
  } else if (scenarioId === 'quake') {
    composed = composeQuake(intent.id, measures);
  } else if (scenarioId === 'infra') {
    composed = composeInfra(intent.id, measures);
  } else {
    composed = composeFlood(intent.id, measures, scenario);
  }

  // Resolve the cited evidence region, if the answer names one.
  const evidence = dressEvidence(scenarioId, measures.evidence);
  const cited = composed.map && composed.map.evidence
    ? evidence.filter((e) => e.id === composed.map.evidence)
    : [];
  const focus = cited[0] || null;

  const mapDirective = composed.map
    ? {
      layer: composed.map.layer,
      date: composed.map.date,
      compare: !!composed.map.compare,
      evidence_id: composed.map.evidence,
      bbox: focus ? focus.bbox : null,
    }
    : null;

  const thumbLayer = mapDirective ? mapDirective.layer : 'optical';
  const thumbDate = mapDirective ? mapDirective.date : 'after';

  const trace = buildTrace({
    queryText: text, intent, scenario, measures, best, confidence,
    evidenceCount: cited.length, routedToSar, prefiltered, indexed,
  });

  const elapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;

  return {
    /* --- the shape pinned in CONTRACT.md --- */
    tile_id: tileId(scenario, best.tile.date === 'after' ? DATE_AFTER : DATE_BEFORE, best.tile.sensor),
    confidence,                                   // float 0–1, real cosine similarity
    answer: composed.answer,
    image_url: renderThumb(scenarioId, thumbLayer, thumbDate, focus ? focus.bbox : null),

    /* --- additive, demo-only; see demo/README.md --- */
    query: text,
    scenario: scenarioId,
    intent: intent.id,
    intent_confidence: +intent.score.toFixed(4),
    headline: composed.headline,
    confidence_band: confidenceBand(confidence),
    answerable: confidence >= CONFIDENCE_FLOOR,
    sensor: best.tile.sensor,
    acquired: best.tile.acquired,
    acquired_pretty: prettyDate(best.tile.acquired),
    water_method: waterMethod(scenarioId, thumbDate),
    trace,
    evidence: cited.length ? cited : evidence.slice(0, 1),
    all_evidence: evidence,
    provenance: composed.provenance,
    map_directive: mapDirective,
    measurements: measures,
    prefiltered_tiles: prefiltered,
    indexed_tiles: indexed,
    ranked: ranked.slice(0, 4).map((r) => ({
      tile_id: tileId(getScenario(r.tile.scenario), r.tile.date === 'after' ? DATE_AFTER : DATE_BEFORE, r.tile.sensor),
      scenario: r.tile.scenario,
      sensor: r.tile.sensor,
      similarity: +r.similarity.toFixed(4),
    })),
    latency_ms: elapsed < 1 ? +elapsed.toFixed(2) : Math.round(elapsed),
    contract_version: CONTRACT_VERSION,
    is_mock: true,
  };
}

/**
 * Streaming wrapper. A real backend would emit these over SSE as the pipeline
 * progresses; here the result is computed up front and the trace is played back
 * against the timings each step reported, so the sequencing the analyst sees
 * matches the sequencing the response describes.
 *
 * onEvent receives:
 *   { type: 'trace', step }        one pipeline step completed
 *   { type: 'answer', response }   the full response object
 */
export async function queryStream(text, ctx = {}, onEvent = () => {}, opts = {}) {
  const speed = opts.speed || 1;
  const response = await query(text, ctx);

  for (const step of response.trace) {
    await new Promise((r) => setTimeout(r, Math.max(60, step.ms / speed)));
    onEvent({ type: 'trace', step });
  }
  onEvent({ type: 'answer', response });
  return response;
}

export async function listScenarios() {
  return SCENARIOS;
}

export function suggestions(scenarioId) {
  return getScenario(scenarioId).starters;
}

/** Index size, for the honest "what is actually in here" readout in the UI. */
export function indexStats() {
  return {
    tiles: TILE_INDEX.length,
    scenarios: SCENARIOS.length,
    vocabulary: DF.size,
    space: 'lexical TF-IDF (stands in for CLIP image/text embeddings)',
  };
}
