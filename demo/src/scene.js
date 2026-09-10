/* ---------------------------------------------------------------------------
 * scene.js — procedural scene model
 *
 * Builds a deterministic, seeded synthetic landscape for each demo scenario and
 * exposes it as plain typed arrays + vector features. Nothing here is scripted
 * copy or a hand-authored number: the scene is generated, and every figure the
 * UI later shows is measured back off these arrays by analyzeScene().
 *
 * That separation is deliberate. CONTRACT.md INV-2 says an answer may not state
 * a specific number that was not actually computed. In the real system those
 * numbers come from the retrieval pipeline; here they come from measuring the
 * same raster the user is looking at. Either way the number on screen traces to
 * pixels on screen, which is the property that matters.
 *
 * No rendering happens in this file. See render.js.
 * ------------------------------------------------------------------------- */

export const GRID = 384;                       // cells per side
export const GSD_M = 33.3;                     // ground sample distance, m/cell
export const AOI_KM = (GRID * GSD_M) / 1000;   // approx 12.8 km across

/* Land cover classes rasterised into scene.cover */
export const COVER = {
  SOIL: 0,
  CROP_A: 1,
  CROP_B: 2,
  FOREST: 3,
  URBAN: 4,
  WATER: 5,
  ROAD: 6,
  BARE_ROCK: 7,
};

/* ---- deterministic randomness ------------------------------------------- */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* Value noise with bilinear interpolation, then fBm on top of it. Cheap, and
 * smooth enough that the terrain reads as terrain rather than as static. */
function makeNoise(seed) {
  const rnd = mulberry32(seed);
  const SIZE = 256;
  const grad = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < grad.length; i++) grad[i] = rnd();

  function at(ix, iy) {
    return grad[((iy & (SIZE - 1)) * SIZE) + (ix & (SIZE - 1))];
  }

  return function noise2(x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    // smoothstep the interpolant so cell boundaries do not show as creases
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0), b = at(x0 + 1, y0);
    const c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    const top = a + (b - a) * sx;
    const bot = c + (d - c) * sx;
    return top + (bot - top) * sy;
  };
}

function makeFbm(seed) {
  const n = makeNoise(seed);
  return function fbm(x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += n(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  };
}

/* ---- small geometry helpers --------------------------------------------- */

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

function polylineLengthKm(pts) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) {
    d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return (d * GSD_M) / 1000;
}

/* Walk a polyline at roughly one-cell steps, calling fn(x, y, t) at each sample. */
function samplePolyline(pts, fn, stepCells = 1) {
  const total = pts.length - 1;
  for (let i = 0; i < total; i++) {
    const p0 = pts[i], p1 = pts[i + 1];
    const seg = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const steps = Math.max(1, Math.round(seg / stepCells));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      fn(lerp(p0[0], p1[0], t), lerp(p0[1], p1[1], t), (i + t) / total);
    }
  }
  fn(pts[total][0], pts[total][1], 1);
}

function stampDisc(arr, cx, cy, r, value) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(GRID - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(GRID - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) arr[y * GRID + x] = value;
    }
  }
}

function stampRect(arr, cx, cy, w, h, angle, value) {
  const ca = Math.cos(-angle), sa = Math.sin(-angle);
  const rad = Math.ceil(Math.hypot(w, h) / 2) + 1;
  const x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(GRID - 1, Math.ceil(cx + rad));
  const y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(GRID - 1, Math.ceil(cy + rad));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      const rx = dx * ca - dy * sa, ry = dx * sa + dy * ca;
      if (Math.abs(rx) <= w / 2 && Math.abs(ry) <= h / 2) arr[y * GRID + x] = value;
    }
  }
}

/* ---- terrain ------------------------------------------------------------- */

/* A meandering channel from top to bottom of the AOI, built from summed sines
 * so it is smooth and reproducible rather than a random walk. */
function meanderPath(seed, xCentre, amplitude, steps = 48) {
  const rnd = mulberry32(seed);
  const waves = [];
  for (let k = 0; k < 3; k++) {
    waves.push({
      f: 0.6 + rnd() * 2.2,
      p: rnd() * Math.PI * 2,
      a: amplitude * (0.6 - k * 0.16) * (0.7 + rnd() * 0.6),
    });
  }
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let x = xCentre;
    for (const w of waves) x += Math.sin(t * Math.PI * 2 * w.f + w.p) * w.a;
    pts.push([x, t * (GRID - 1)]);
  }
  return pts;
}

/* Distance-to-feature field, in cells. Computed by stamping the feature into a
 * grid and running a two-pass chamfer transform — much cheaper than testing
 * every cell against every segment, and accurate enough at this scale. */
function distanceField(seedPts) {
  const INF = 1e6;
  const d = new Float32Array(GRID * GRID).fill(INF);
  samplePolyline(seedPts, (x, y) => {
    const ix = Math.round(x), iy = Math.round(y);
    if (ix >= 0 && ix < GRID && iy >= 0 && iy < GRID) d[iy * GRID + ix] = 0;
  }, 0.5);

  const D1 = 1, D2 = 1.41421356;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const i = y * GRID + x;
      let v = d[i];
      if (y > 0) {
        v = Math.min(v, d[i - GRID] + D1);
        if (x > 0) v = Math.min(v, d[i - GRID - 1] + D2);
        if (x < GRID - 1) v = Math.min(v, d[i - GRID + 1] + D2);
      }
      if (x > 0) v = Math.min(v, d[i - 1] + D1);
      d[i] = v;
    }
  }
  for (let y = GRID - 1; y >= 0; y--) {
    for (let x = GRID - 1; x >= 0; x--) {
      const i = y * GRID + x;
      let v = d[i];
      if (y < GRID - 1) {
        v = Math.min(v, d[i + GRID] + D1);
        if (x > 0) v = Math.min(v, d[i + GRID - 1] + D2);
        if (x < GRID - 1) v = Math.min(v, d[i + GRID + 1] + D2);
      }
      if (x < GRID - 1) v = Math.min(v, d[i + 1] + D1);
      d[i] = v;
    }
  }
  return d;
}

/* Flood fill from cells already wet, spreading only into cells below `level`.
 * Water that is not hydrologically connected to the channel does not fill —
 * which is what stops the flood extent looking like a threshold artefact. */
function connectedFill(elev, seedMask, level) {
  const out = new Uint8Array(GRID * GRID);
  const stack = [];
  for (let i = 0; i < seedMask.length; i++) {
    if (seedMask[i]) { out[i] = 1; stack.push(i); }
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % GRID, y = (i / GRID) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
      const j = ny * GRID + nx;
      if (out[j] || elev[j] >= level) continue;
      out[j] = 1;
      stack.push(j);
    }
  }
  return out;
}

/* ---- cloud ---------------------------------------------------------------
 * The single best beat in the flood story is "the optical pass is unusable, so
 * route to SAR". That claim is only worth making if the cloud figure behind it
 * is real, so clouds are generated as a mask here and the percentage the UI
 * quotes is counted off that mask rather than typed into a script.
 * ------------------------------------------------------------------------ */

function buildCloudMask(seed, targetFraction) {
  const fbm = makeFbm(seed);
  const field = new Float32Array(GRID * GRID);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      // Two scales: broad cloud masses, plus ragged detail at the edges.
      const broad = fbm(x / 90, y / 90, 3);
      const detail = fbm(x / 22 + 300, y / 22 + 300, 4);
      field[y * GRID + x] = broad * 0.72 + detail * 0.28;
    }
  }
  // Pick the threshold that lands nearest the requested coverage, then report
  // whatever coverage that actually produced.
  const sample = Array.from({ length: 4096 }, (_, k) => field[(k * 977) % field.length]).sort((a, b) => a - b);
  const cut = sample[Math.floor(clamp(1 - targetFraction, 0, 0.999) * (sample.length - 1))];

  const mask = new Uint8Array(GRID * GRID);
  const alpha = new Float32Array(GRID * GRID);
  let n = 0;
  for (let i = 0; i < field.length; i++) {
    const d = field[i] - cut;
    if (d > 0) { mask[i] = 1; n++; }
    // Soft edge: opacity ramps over a narrow band around the threshold so the
    // cloud margin is feathered rather than cut with a cookie cutter.
    alpha[i] = clamp((d + 0.035) / 0.075, 0, 1);
  }
  return { mask, alpha, field, fraction: n / mask.length };
}

/* ---- scenario: flood ----------------------------------------------------- */

function buildFloodScene(seed) {
  const fbm = makeFbm(seed);
  const rnd = mulberry32(seed ^ 0x9e3779b9);

  const river = meanderPath(seed + 11, GRID * 0.46, GRID * 0.13);
  const distRiver = distanceField(river);

  // A tributary joining from the east, so the flood extent reads as dendritic
  // rather than as a single ribbon.
  const trib = [];
  {
    const jx = GRID * 0.62, jy = GRID * 0.58;
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      trib.push([
        lerp(GRID * 0.98, jx, t) + Math.sin(t * 7.1) * 9 * (1 - t),
        lerp(GRID * 0.30, jy, t) + Math.sin(t * 4.3 + 1.2) * 12 * (1 - t),
      ]);
    }
  }
  const distTrib = distanceField(trib);

  const elev = new Float32Array(GRID * GRID);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const i = y * GRID + x;
      const d = Math.min(distRiver[i], distTrib[i] * 1.15);
      // Valley cross-section: rises with distance from the channel, capped so
      // the uplands read as broadly flat rather than as a cone.
      const valley = Math.pow(clamp(d / (GRID * 0.30), 0, 1), 0.72);
      const relief = fbm(x / 46, y / 46, 5) - 0.5;
      const regional = (y / GRID) * 0.06;          // gentle downstream gradient
      elev[i] = clamp(valley * 0.78 + relief * 0.30 + regional, 0, 1);
    }
  }

  // Baseline channel and monsoon flood extent, as two water levels.
  const channelSeed = new Uint8Array(GRID * GRID);
  for (let i = 0; i < elev.length; i++) if (elev[i] < 0.055) channelSeed[i] = 1;
  const waterBefore = connectedFill(elev, channelSeed, 0.075);
  const waterAfter = connectedFill(elev, waterBefore, 0.235);

  /* --- land cover ------------------------------------------------------- */
  const cover = new Uint8Array(GRID * GRID);
  const parcel = new Int16Array(GRID * GRID).fill(-1);
  const parcels = [];

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const i = y * GRID + x;
      const e = elev[i];
      const veg = fbm(x / 28 + 40, y / 28 + 40, 3);
      if (e > 0.78) cover[i] = COVER.BARE_ROCK;
      else if (e > 0.60 && veg > 0.50) cover[i] = COVER.FOREST;
      else cover[i] = COVER.SOIL;
    }
  }

  // Agricultural parcels on the floodplain: jittered rotated rectangles laid
  // out in loose bands.
  {
    let id = 0;
    for (let by = 0; by < 13; by++) {
      for (let bx = 0; bx < 13; bx++) {
        const cx = (bx + 0.5) * (GRID / 13) + (rnd() - 0.5) * 12;
        const cy = (by + 0.5) * (GRID / 13) + (rnd() - 0.5) * 12;
        const ix = clamp(Math.round(cx), 0, GRID - 1);
        const iy = clamp(Math.round(cy), 0, GRID - 1);
        const e = elev[iy * GRID + ix];
        if (e > 0.55 || e < 0.06) continue;         // farm the low ground only
        const w = 16 + rnd() * 13, h = 11 + rnd() * 10;
        const ang = (rnd() - 0.5) * 0.5;
        const kind = rnd() < 0.55 ? COVER.CROP_A : COVER.CROP_B;
        stampRect(cover, cx, cy, w, h, ang, kind);
        stampRect(parcel, cx, cy, w, h, ang, id);
        parcels.push({ id, cx, cy, kind, tone: rnd() });
        id++;
      }
    }
  }

  /* --- settlements ------------------------------------------------------- */
  const names = ['Kadapra', 'Neelamperoor', 'Cheruthana', 'Mankombu', 'Veeyapuram', 'Thakazhi'];
  const placements = [
    [0.22, 0.20], [0.70, 0.24], [0.30, 0.55],
    [0.63, 0.62], [0.20, 0.84], [0.78, 0.86],
  ];
  const settlements = placements.map((w, k) => {
    const cx = w[0] * GRID, cy = w[1] * GRID;
    const r = 8 + rnd() * 5;
    const blocks = 16 + Math.floor(rnd() * 10);
    for (let b = 0; b < blocks; b++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.pow(rnd(), 0.6) * r;
      stampRect(cover, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr,
        2 + rnd() * 3, 2 + rnd() * 3, (rnd() - 0.5) * 0.6, COVER.URBAN);
    }
    return { id: 'S' + (k + 1), name: names[k], x: cx, y: cy, r };
  });

  /* --- roads -------------------------------------------------------------- */
  // A relief hub on high ground plus a link per settlement. Several links cross
  // low ground, which is what makes the connectivity result interesting once
  // the water rises.
  const hub = { id: 'HUB', name: 'Relief staging point', x: GRID * 0.90, y: GRID * 0.08 };

  function quadPath(a, b, mx, my) {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, u = 1 - t;
      pts.push([
        u * u * a.x + 2 * u * t * mx + t * t * b.x,
        u * u * a.y + 2 * u * t * my + t * t * b.y,
      ]);
    }
    return pts;
  }

  function lowestElevOnPath(pts) {
    let lo = 1;
    samplePolyline(pts, (x, y) => {
      const i = clamp(Math.round(y), 0, GRID - 1) * GRID + clamp(Math.round(x), 0, GRID - 1);
      if (elev[i] < lo) lo = elev[i];
    }, 2);
    return lo;
  }

  /* Highways get built on the highest alignment available; district roads
   * follow the valley because that is where the villages are. Routing them
   * differently is not decoration — it is why the connectivity answer comes
   * out with a mix of open and cut links rather than all-or-nothing. */
  function bend(a, b, cls) {
    const candidates = [];
    for (let k = 0; k < 14; k++) {
      const mx = (a.x + b.x) / 2 + (rnd() - 0.5) * 90;
      const my = (a.y + b.y) / 2 + (rnd() - 0.5) * 90;
      candidates.push(quadPath(a, b, clamp(mx, 4, GRID - 5), clamp(my, 4, GRID - 5)));
    }
    if (cls === 'district') return candidates[0];
    return candidates.reduce((best, p) =>
      lowestElevOnPath(p) > lowestElevOnPath(best) ? p : best);
  }

  // Deliberately redundant: a real district network has more than one way into
  // most places, so a cut link does not automatically strand a village. That
  // redundancy is what makes the computed reachability result interesting
  // rather than a foregone conclusion.
  const roadDefs = [
    ['R1', 'SH-11 Kadapra link', hub, settlements[0], 'state'],
    ['R2', 'NH-183 river crossing', hub, settlements[1], 'national'],
    ['R3', 'Cheruthana approach', settlements[0], settlements[2], 'district'],
    ['R4', 'Mankombu bund road', settlements[1], settlements[3], 'district'],
    ['R5', 'Veeyapuram causeway', settlements[2], settlements[4], 'district'],
    ['R6', 'Thakazhi ferry road', settlements[3], settlements[5], 'district'],
    ['R7', 'Delta ring road', settlements[4], settlements[5], 'district'],
    ['R8', 'Upland bypass', settlements[1], settlements[2], 'state'],
    ['R9', 'Kadapra-Neelamperoor link', settlements[0], settlements[1], 'district'],
    ['R10', 'Eastern trunk road', hub, settlements[5], 'state'],
  ];

  const roads = roadDefs.map((d) => ({
    id: d[0], name: d[1], cls: d[4],
    pts: bend(d[2], d[3], d[4]),
    from: d[2].id, to: d[3].id,
  }));

  for (const r of roads) {
    samplePolyline(r.pts, (x, y) => {
      stampDisc(cover, x, y, r.cls === 'national' ? 1.4 : 1.0, COVER.ROAD);
    }, 0.6);
  }

  // Baseline channel written last so water always wins over anything drawn
  // across it.
  for (let i = 0; i < cover.length; i++) if (waterBefore[i]) cover[i] = COVER.WATER;

  const changeMask = new Uint8Array(GRID * GRID);
  for (let i = 0; i < changeMask.length; i++) {
    changeMask[i] = waterAfter[i] && !waterBefore[i] ? 1 : 0;
  }

  return {
    id: 'flood',
    seed,
    elev, cover, parcel, parcels,
    waterBefore, waterAfter,
    river, trib,
    settlements, roads, hub,
    changeMask,
    // Pre-monsoon pass is near clear; the peak-event pass is under the storm.
    cloudBefore: buildCloudMask(seed + 71, 0.04),
    cloudAfter: buildCloudMask(seed + 72, 0.93),
  };
}

/* ---- scenario: earthquake ------------------------------------------------ */

function buildQuakeScene(seed) {
  const fbm = makeFbm(seed);
  const rnd = mulberry32(seed ^ 0x51ed270b);

  const elev = new Float32Array(GRID * GRID);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      elev[y * GRID + x] = clamp(0.35 + (fbm(x / 70, y / 70, 4) - 0.5) * 0.55, 0, 1);
    }
  }

  const cover = new Uint8Array(GRID * GRID);
  for (let i = 0; i < cover.length; i++) cover[i] = COVER.SOIL;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const i = y * GRID + x;
      if (fbm(x / 26 + 7, y / 26 + 7, 3) > 0.58) cover[i] = COVER.FOREST;
    }
  }

  // A dense town laid out on an irregular street grid.
  const blocks = [];
  const originX = GRID * 0.14, originY = GRID * 0.16;
  const cols = 11, rows = 11, cell = (GRID * 0.72) / cols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rnd() < 0.08) continue;                    // open ground / maidan
      const cx = originX + (c + 0.5) * cell + (rnd() - 0.5) * 4;
      const cy = originY + (r + 0.5) * cell + (rnd() - 0.5) * 4;
      const w = cell * (0.60 + rnd() * 0.22);
      const h = cell * (0.60 + rnd() * 0.22);
      blocks.push({ id: 'B' + r + '-' + c, cx, cy, w, h });
      stampRect(cover, cx, cy, w, h, 0.04, COVER.URBAN);
    }
  }

  // Street grid between blocks.
  const roads = [];
  for (let c = 0; c <= cols; c++) {
    const x = originX + c * cell;
    roads.push({
      id: 'V' + c, name: 'Street ' + (c + 1), cls: 'street',
      pts: [[x, originY - cell * 0.4], [x, originY + rows * cell]],
    });
  }
  for (let r = 0; r <= rows; r++) {
    const y = originY + r * cell;
    roads.push({
      id: 'H' + r, name: 'Cross road ' + (r + 1), cls: 'street',
      pts: [[originX - cell * 0.4, y], [originX + cols * cell, y]],
    });
  }
  const arterialY = originY + Math.floor(rows / 2) * cell;
  roads.push({
    id: 'A1', name: 'Arterial highway', cls: 'national',
    pts: [[0, arterialY + 6], [GRID * 0.4, arterialY - 4], [GRID - 1, arterialY + 10]],
  });
  for (const r of roads) {
    samplePolyline(r.pts, (x, y) => {
      stampDisc(cover, x, y, r.cls === 'national' ? 1.5 : 0.9, COVER.ROAD);
    }, 0.6);
  }

  // Damage severity: strongest along a rupture trace, modulated by noise so it
  // is patchy rather than a clean band.
  const rupture = meanderPath(seed + 5, GRID * 0.52, GRID * 0.07);
  const distRupture = distanceField(rupture);
  const severity = new Float32Array(GRID * GRID);
  for (let i = 0; i < severity.length; i++) {
    if (cover[i] !== COVER.URBAN) continue;
    const x = i % GRID, y = (i / GRID) | 0;
    const near = Math.exp(-Math.pow(distRupture[i] / (GRID * 0.16), 2));
    const patch = fbm(x / 22 + 90, y / 22 + 90, 3);
    severity[i] = clamp(near * 1.25 * (0.35 + patch), 0, 1);
  }

  const changeMask = new Uint8Array(GRID * GRID);
  for (let i = 0; i < changeMask.length; i++) changeMask[i] = severity[i] > 0.55 ? 1 : 0;

  // Aggregate severity per block so the analysis can talk about blocks rather
  // than pixels.
  for (const b of blocks) {
    let sum = 0, n = 0;
    const x0 = Math.max(0, Math.round(b.cx - b.w / 2)), x1 = Math.min(GRID - 1, Math.round(b.cx + b.w / 2));
    const y0 = Math.max(0, Math.round(b.cy - b.h / 2)), y1 = Math.min(GRID - 1, Math.round(b.cy + b.h / 2));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) { sum += severity[y * GRID + x]; n++; }
    }
    b.severity = n ? sum / n : 0;
  }

  return {
    id: 'quake',
    seed,
    elev, cover, parcel: new Int16Array(GRID * GRID).fill(-1), parcels: [],
    waterBefore: new Uint8Array(GRID * GRID),
    waterAfter: new Uint8Array(GRID * GRID),
    severity, blocks, roads, rupture,
    settlements: [{ id: 'S1', name: 'District town', x: GRID * 0.5, y: GRID * 0.5, r: 20 }],
    hub: null,
    changeMask,
    cloudBefore: buildCloudMask(seed + 71, 0.03),
    cloudAfter: buildCloudMask(seed + 72, 0.11),
  };
}

/* ---- scenario: infrastructure change ------------------------------------- */

function buildInfraScene(seed) {
  const fbm = makeFbm(seed);

  const elev = new Float32Array(GRID * GRID);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      // Ridge-and-valley terrain: a folded belt running NE to SW.
      const fold = Math.sin((x * 0.55 + y * 0.35) / 26) * 0.5 + 0.5;
      const relief = fbm(x / 40, y / 40, 5);
      elev[y * GRID + x] = clamp(fold * 0.45 + relief * 0.55, 0, 1);
    }
  }

  const cover = new Uint8Array(GRID * GRID);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const i = y * GRID + x;
      const e = elev[i];
      const veg = fbm(x / 24 + 12, y / 24 + 12, 3);
      if (e > 0.72) cover[i] = COVER.BARE_ROCK;
      else if (veg > 0.50 && e > 0.35) cover[i] = COVER.FOREST;
      else cover[i] = COVER.SOIL;
    }
  }

  // Existing alignment, present at both dates.
  const existing = {
    id: 'E1', name: 'Existing metalled track', cls: 'district',
    pts: Array.from({ length: 26 }, (_, i) => {
      const t = i / 25;
      return [
        lerp(GRID * 0.06, GRID * 0.44, t),
        lerp(GRID * 0.88, GRID * 0.52, t) + Math.sin(t * 6) * 10,
      ];
    }),
  };
  samplePolyline(existing.pts, (x, y) => stampDisc(cover, x, y, 1.0, COVER.ROAD), 0.6);

  // New alignment plus hardstanding, present only at the later date. This is
  // the change the scenario is about.
  const newRoad = {
    id: 'N1', name: 'New graded alignment', cls: 'new',
    pts: Array.from({ length: 30 }, (_, i) => {
      const t = i / 29;
      return [
        lerp(GRID * 0.44, GRID * 0.94, t),
        lerp(GRID * 0.52, GRID * 0.16, t) + Math.sin(t * 4.2 + 1) * 14,
      ];
    }),
  };
  const newSites = [
    { id: 'P1', name: 'Graded platform', cx: GRID * 0.72, cy: GRID * 0.34, w: 26, h: 18 },
    { id: 'P2', name: 'Secondary hardstanding', cx: GRID * 0.88, cy: GRID * 0.21, w: 17, h: 13 },
  ];

  const coverAfter = Uint8Array.from(cover);
  samplePolyline(newRoad.pts, (x, y) => stampDisc(coverAfter, x, y, 1.3, COVER.ROAD), 0.6);
  for (const s of newSites) stampRect(coverAfter, s.cx, s.cy, s.w, s.h, 0.12, COVER.BARE_ROCK);

  const changeMask = new Uint8Array(GRID * GRID);
  for (let i = 0; i < changeMask.length; i++) changeMask[i] = cover[i] !== coverAfter[i] ? 1 : 0;

  return {
    id: 'infra',
    seed,
    elev, cover, coverAfter,
    parcel: new Int16Array(GRID * GRID).fill(-1), parcels: [],
    waterBefore: new Uint8Array(GRID * GRID),
    waterAfter: new Uint8Array(GRID * GRID),
    roads: [existing, newRoad],
    newRoad, newSites,
    settlements: [],
    hub: null,
    changeMask,
    cloudBefore: buildCloudMask(seed + 71, 0.02),
    cloudAfter: buildCloudMask(seed + 72, 0.06),
  };
}

/* ---- public builder ------------------------------------------------------ */

const _sceneCache = new Map();

export function buildScene(scenarioId) {
  if (_sceneCache.has(scenarioId)) return _sceneCache.get(scenarioId);
  const seed = hashSeed('satquery::' + scenarioId);
  let scene;
  if (scenarioId === 'quake') scene = buildQuakeScene(seed);
  else if (scenarioId === 'infra') scene = buildInfraScene(seed);
  else scene = buildFloodScene(seed);
  _sceneCache.set(scenarioId, scene);
  return scene;
}

/* ---- measurement --------------------------------------------------------- */

const CELL_KM2 = (GSD_M * GSD_M) / 1e6;
const CELL_HA = (GSD_M * GSD_M) / 1e4;

function bboxOfMask(mask, minCells = 40) {
  let x0 = GRID, y0 = GRID, x1 = -1, y1 = -1, n = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    n++;
    const x = i % GRID, y = (i / GRID) | 0;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (n < minCells) return null;
  return { x0, y0, x1, y1, cells: n };
}

/* Largest connected component of a mask. Used to point the evidence overlay at
 * the main body of change rather than at the union of every speckle. */
function largestComponent(mask) {
  const seen = new Uint8Array(mask.length);
  let best = null;
  const stack = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    stack.length = 0;
    stack.push(s);
    seen[s] = 1;
    const cells = [];
    while (stack.length) {
      const i = stack.pop();
      cells.push(i);
      const x = i % GRID, y = (i / GRID) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
        const j = ny * GRID + nx;
        if (!mask[j] || seen[j]) continue;
        seen[j] = 1;
        stack.push(j);
      }
    }
    if (!best || cells.length > best.length) best = cells;
  }
  if (!best) return null;
  const m = new Uint8Array(mask.length);
  for (const i of best) m[i] = 1;
  return { mask: m, bbox: bboxOfMask(m, 1) };
}

function countMask(mask) {
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) n++;
  return n;
}

/* The densest window of a mask, via a summed-area table. The largest connected
 * component of a flood is usually the entire flood, which is useless as a
 * pointer; what an analyst actually wants highlighted is where the change is
 * most concentrated. This finds that. */
function hotspotWindow(mask, win) {
  const S = GRID + 1;
  const sat = new Int32Array(S * S);
  for (let y = 0; y < GRID; y++) {
    let rowSum = 0;
    for (let x = 0; x < GRID; x++) {
      rowSum += mask[y * GRID + x] ? 1 : 0;
      sat[(y + 1) * S + (x + 1)] = sat[y * S + (x + 1)] + rowSum;
    }
  }
  const area = (x0, y0, x1, y1) =>
    sat[(y1 + 1) * S + (x1 + 1)] - sat[y0 * S + (x1 + 1)] - sat[(y1 + 1) * S + x0] + sat[y0 * S + x0];

  let best = null;
  const step = Math.max(2, Math.floor(win / 8));
  for (let y = 0; y + win < GRID; y += step) {
    for (let x = 0; x + win < GRID; x += step) {
      const c = area(x, y, x + win, y + win);
      if (!best || c > best.cells) best = { x0: x, y0: y, x1: x + win, y1: y + win, cells: c };
    }
  }
  return best && best.cells > 0 ? best : null;
}

/* Bounding box around a point, clipped to the grid. */
function boxAround(cx, cy, half) {
  return {
    x0: Math.max(0, Math.round(cx - half)),
    y0: Math.max(0, Math.round(cy - half)),
    x1: Math.min(GRID - 1, Math.round(cx + half)),
    y1: Math.min(GRID - 1, Math.round(cy + half)),
  };
}

/* Point on a polyline at normalised position t. */
function pointAt(pts, t) {
  let found = pts[0];
  samplePolyline(pts, (x, y, tt) => {
    if (tt <= t) found = [x, y];
  }, 1);
  return found;
}

/* Road status is measured, not assigned: sample the centreline and count how
 * many samples fall inside the water mask. */
function roadStatus(road, mask) {
  let wet = 0, total = 0;
  let firstWet = null, lastWet = null;
  samplePolyline(road.pts, (x, y, t) => {
    total++;
    const ix = clamp(Math.round(x), 0, GRID - 1);
    const iy = clamp(Math.round(y), 0, GRID - 1);
    if (mask[iy * GRID + ix]) {
      wet++;
      if (firstWet === null) firstWet = t;
      lastWet = t;
    }
  }, 1);
  const pct = total ? wet / total : 0;
  const lengthKm = polylineLengthKm(road.pts);
  return {
    id: road.id, name: road.name, cls: road.cls,
    length_km: +lengthKm.toFixed(2),
    submerged_pct: +(pct * 100).toFixed(1),
    submerged_km: +(lengthKm * pct).toFixed(2),
    status: pct >= 0.08 ? 'impassable' : pct >= 0.02 ? 'restricted' : 'open',
    breach_at: firstWet === null ? null : [+firstWet.toFixed(3), +lastWet.toFixed(3)],
  };
}

/* BFS over the road graph from the relief hub, using only links whose measured
 * submergence leaves them passable. */
function reachableSet(scene, passableIds) {
  const adj = new Map();
  const add = (a, b) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push(b);
  };
  for (const r of scene.roads) {
    if (!passableIds.has(r.id)) continue;
    add(r.from, r.to);
    add(r.to, r.from);
  }
  const seen = new Set([scene.hub.id]);
  const q = [scene.hub.id];
  while (q.length) {
    const n = q.shift();
    for (const to of adj.get(n) || []) {
      if (seen.has(to)) continue;
      seen.add(to);
      q.push(to);
    }
  }
  return seen;
}

function reachability(scene, roadStates) {
  if (!scene.hub) return null;
  const passable = new Set(
    roadStates.filter((r) => r.status !== 'impassable').map((r) => r.id)
  );
  const seen = reachableSet(scene, passable);
  return scene.settlements.map((s) => ({
    id: s.id, name: s.name, reachable: seen.has(s.id),
  }));
}

/* For each cut link, how many additional settlements would reconnect if that
 * one link were restored. This is the output an actual relief cell wants — not
 * "here is the damage" but "here is where to put the first bridging unit" —
 * and it is a plain re-run of the BFS per candidate edge, not a judgement. */
function restorationPriority(scene, roadStates) {
  if (!scene.hub) return null;
  const passable = new Set(
    roadStates.filter((r) => r.status !== 'impassable').map((r) => r.id)
  );
  const base = reachableSet(scene, passable);
  const cut = roadStates.filter((r) => r.status === 'impassable');

  return cut
    .map((r) => {
      const trial = new Set(passable);
      trial.add(r.id);
      const after = reachableSet(scene, trial);
      const gained = scene.settlements
        .filter((s) => !base.has(s.id) && after.has(s.id))
        .map((s) => s.name);
      return {
        road_id: r.id,
        road_name: r.name,
        submerged_km: r.submerged_km,
        settlements_reconnected: gained.length,
        names: gained,
      };
    })
    .sort((a, b) => b.settlements_reconnected - a.settlements_reconnected
      || a.submerged_km - b.submerged_km);
}

/* Fraction of each settlement built-up footprint under water. */
function settlementInundation(scene, mask) {
  return scene.settlements.map((s) => {
    let wet = 0, built = 0;
    const r = Math.ceil(s.r);
    const y0 = Math.max(0, Math.floor(s.y - r)), y1 = Math.min(GRID - 1, Math.ceil(s.y + r));
    const x0 = Math.max(0, Math.floor(s.x - r)), x1 = Math.min(GRID - 1, Math.ceil(s.x + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if ((x - s.x) * (x - s.x) + (y - s.y) * (y - s.y) > r * r) continue;
        const i = y * GRID + x;
        if (scene.cover[i] === COVER.URBAN) {
          built++;
          if (mask[i]) wet++;
        }
      }
    }
    return {
      id: s.id, name: s.name,
      built_cells: built,
      inundated_pct: built ? +((wet / built) * 100).toFixed(1) : 0,
    };
  });
}

/**
 * Measure a scene. Everything returned here is derived from the arrays above —
 * no figure in this object is authored by hand. The mock API turns these into
 * answer text; a real API would return the equivalent from the pipeline.
 */
const _analysisCache = new Map();

export function analyzeScene(scenarioId) {
  if (_analysisCache.has(scenarioId)) return _analysisCache.get(scenarioId);
  const scene = buildScene(scenarioId);
  let out;

  if (scenarioId === 'flood') {
    const beforeCells = countMask(scene.waterBefore);
    const afterCells = countMask(scene.waterAfter);
    const newCells = countMask(scene.changeMask);
    const roadStates = scene.roads.map((r) => roadStatus(r, scene.waterAfter));

    let cropFlooded = 0, cropTotal = 0;
    for (let i = 0; i < scene.cover.length; i++) {
      const c = scene.cover[i];
      if (c === COVER.CROP_A || c === COVER.CROP_B) {
        cropTotal++;
        if (scene.waterAfter[i]) cropFlooded++;
      }
    }

    const inund = settlementInundation(scene, scene.waterAfter);
    const worstSettlement = inund.slice().sort((a, b) => b.inundated_pct - a.inundated_pct)[0];
    const worstRoad = roadStates.slice().sort((a, b) => b.submerged_pct - a.submerged_pct)[0];
    const hot = hotspotWindow(scene.changeMask, 96);

    /* Evidence regions are derived, not placed by hand: the densest window of
     * new water, the worst-inundated settlement, and the point on the worst
     * road where the centreline first enters the water. */
    const evidence = [];
    if (hot) {
      evidence.push({
        id: 'E1', kind: 'extent',
        label: 'Peak inundation window',
        bbox: hot,
        note: (+(hot.cells * CELL_KM2).toFixed(2)) + ' km2 of new water in a '
          + (+((hot.x1 - hot.x0) * GSD_M / 1000).toFixed(1)) + ' km window',
      });
    }
    if (worstSettlement && worstSettlement.inundated_pct > 0) {
      const s = scene.settlements.find((x) => x.id === worstSettlement.id);
      evidence.push({
        id: 'E2', kind: 'settlement',
        label: worstSettlement.name + ' built-up area',
        bbox: boxAround(s.x, s.y, s.r * 1.9),
        note: worstSettlement.inundated_pct + '% of mapped built-up cells under water',
      });
    }
    if (worstRoad && worstRoad.breach_at) {
      const road = scene.roads.find((r) => r.id === worstRoad.id);
      const p = pointAt(road.pts, worstRoad.breach_at[0]);
      evidence.push({
        id: 'E3', kind: 'breach',
        label: worstRoad.name + ' — first breach',
        bbox: boxAround(p[0], p[1], 26),
        note: worstRoad.submerged_km + ' km of ' + worstRoad.length_km + ' km submerged',
      });
    }

    out = {
      scenario: 'flood',
      cloud_before_pct: +(scene.cloudBefore.fraction * 100).toFixed(1),
      cloud_after_pct: +(scene.cloudAfter.fraction * 100).toFixed(1),
      aoi_km2: +(GRID * GRID * CELL_KM2).toFixed(1),
      water_before_km2: +(beforeCells * CELL_KM2).toFixed(2),
      water_after_km2: +(afterCells * CELL_KM2).toFixed(2),
      new_water_km2: +(newCells * CELL_KM2).toFixed(2),
      new_water_pct_of_aoi: +((newCells / (GRID * GRID)) * 100).toFixed(1),
      cropland_inundated_ha: +(cropFlooded * CELL_HA).toFixed(0),
      cropland_inundated_pct: cropTotal ? +((cropFlooded / cropTotal) * 100).toFixed(1) : 0,
      roads: roadStates,
      roads_impassable: roadStates.filter((r) => r.status === 'impassable').length,
      roads_restricted: roadStates.filter((r) => r.status === 'restricted').length,
      roads_open: roadStates.filter((r) => r.status === 'open').length,
      roads_total: roadStates.length,
      worst_road: worstRoad,
      reachability: reachability(scene, roadStates),
      restoration_priority: restorationPriority(scene, roadStates),
      settlements: inund,
      worst_settlement: worstSettlement,
      evidence,
      full_extent: bboxOfMask(scene.changeMask),
    };
  } else if (scenarioId === 'quake') {
    let urbanCells = 0, severeCells = 0;
    for (let i = 0; i < scene.cover.length; i++) {
      if (scene.cover[i] === COVER.URBAN) {
        urbanCells++;
        if (scene.severity[i] > 0.55) severeCells++;
      }
    }
    const severeBlocks = scene.blocks.filter((b) => b.severity > 0.42);
    const arterial = scene.roads.find((r) => r.cls === 'national');

    /* The arterial itself carries no damage value — roads are not buildings.
     * What blocks a road after a quake is debris from what stood beside it, so
     * sample a corridor either side of the centreline instead. */
    let arterialAffected = 0, arterialTotal = 0;
    const CORRIDOR = 4;
    samplePolyline(arterial.pts, (x, y) => {
      arterialTotal++;
      let worst = 0;
      for (let dy = -CORRIDOR; dy <= CORRIDOR; dy++) {
        for (let dx = -CORRIDOR; dx <= CORRIDOR; dx++) {
          const ix = clamp(Math.round(x + dx), 0, GRID - 1);
          const iy = clamp(Math.round(y + dy), 0, GRID - 1);
          const s = scene.severity[iy * GRID + ix];
          if (s > worst) worst = s;
        }
      }
      if (worst > 0.55) arterialAffected++;
    }, 1);

    const hot = hotspotWindow(scene.changeMask, 88);
    const worstBlock = severeBlocks.slice().sort((a, b) => b.severity - a.severity)[0];
    const evidence = [];
    if (hot) {
      evidence.push({
        id: 'E1', kind: 'extent',
        label: 'Peak damage concentration',
        bbox: hot,
        note: (+(hot.cells * CELL_KM2).toFixed(2)) + ' km2 classed severe within the window',
      });
    }
    if (worstBlock) {
      evidence.push({
        id: 'E2', kind: 'block',
        label: 'Worst-affected block ' + worstBlock.id,
        bbox: boxAround(worstBlock.cx, worstBlock.cy, Math.max(worstBlock.w, worstBlock.h)),
        note: 'mean severity ' + worstBlock.severity.toFixed(2) + ' across the block footprint',
      });
    }

    out = {
      scenario: 'quake',
      cloud_before_pct: +(scene.cloudBefore.fraction * 100).toFixed(1),
      cloud_after_pct: +(scene.cloudAfter.fraction * 100).toFixed(1),
      aoi_km2: +(GRID * GRID * CELL_KM2).toFixed(1),
      builtup_km2: +(urbanCells * CELL_KM2).toFixed(2),
      severe_damage_km2: +(severeCells * CELL_KM2).toFixed(2),
      severe_damage_pct_of_builtup: urbanCells ? +((severeCells / urbanCells) * 100).toFixed(1) : 0,
      blocks_total: scene.blocks.length,
      blocks_severe: severeBlocks.length,
      worst_blocks: severeBlocks.slice().sort((a, b) => b.severity - a.severity).slice(0, 3)
        .map((b) => ({ id: b.id, severity: +b.severity.toFixed(3) })),
      arterial_affected_pct: arterialTotal ? +((arterialAffected / arterialTotal) * 100).toFixed(1) : 0,
      arterial_name: arterial.name,
      evidence,
      full_extent: bboxOfMask(scene.changeMask),
    };
  } else {
    let newCells = 0, forestLost = 0;
    for (let i = 0; i < scene.cover.length; i++) {
      if (scene.changeMask[i]) {
        newCells++;
        if (scene.cover[i] === COVER.FOREST) forestLost++;
      }
    }
    const evidence = [{
      id: 'E1', kind: 'alignment',
      label: 'New alignment corridor',
      bbox: bboxOfMask(scene.changeMask, 1),
      note: (+polylineLengthKm(scene.newRoad.pts).toFixed(2)) + ' km of new graded surface',
    }];
    for (const s of scene.newSites) {
      evidence.push({
        id: s.id, kind: 'site',
        label: s.name,
        bbox: boxAround(s.cx, s.cy, Math.max(s.w, s.h) * 0.9),
        note: (+((s.w * s.h) * CELL_HA).toFixed(1)) + ' ha of cleared hardstanding',
      });
    }

    out = {
      scenario: 'infra',
      cloud_before_pct: +(scene.cloudBefore.fraction * 100).toFixed(1),
      cloud_after_pct: +(scene.cloudAfter.fraction * 100).toFixed(1),
      aoi_km2: +(GRID * GRID * CELL_KM2).toFixed(1),
      new_surface_ha: +(newCells * CELL_HA).toFixed(1),
      new_alignment_km: +polylineLengthKm(scene.newRoad.pts).toFixed(2),
      vegetation_cleared_ha: +(forestLost * CELL_HA).toFixed(1),
      new_sites: scene.newSites.map((s) => ({
        id: s.id, name: s.name, area_ha: +((s.w * s.h) * CELL_HA).toFixed(1),
      })),
      evidence,
      full_extent: bboxOfMask(scene.changeMask),
    };
  }

  _analysisCache.set(scenarioId, out);
  return out;
}

export { samplePolyline, polylineLengthKm, clamp, mulberry32, makeFbm, largestComponent };
