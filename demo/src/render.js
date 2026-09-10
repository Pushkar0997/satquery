/* ---------------------------------------------------------------------------
 * render.js — turns a scene into imagery
 *
 * Three layers, two dates, one place. The whole point of the layer toggle is
 * that a judge can see for themselves that different sensors answer different
 * questions: the optical pass during the storm is cloud, the SAR pass through
 * the same cloud is not, and water is unmistakable in SAR because a flat water
 * surface reflects the radar away from the sensor.
 *
 * So the renderers here are physically motivated rather than decorative:
 *   - optical   natural-colour composite, hillshaded, cloud where cloud is
 *   - sar       backscatter by surface type, with multiplicative speckle
 *   - water     NDWI when the optical pass is usable, SAR-derived water mask
 *               when it is not — chosen per date, and labelled with whichever
 *               it actually used
 *
 * Nothing in this file decides what the answer says. See api/mock.js.
 * ------------------------------------------------------------------------- */

import { buildScene, GRID, COVER } from './scene.js';

export const LAYERS = [
  { id: 'optical', name: 'Optical', hint: 'Sentinel-2 true colour' },
  { id: 'sar', name: 'SAR', hint: 'Sentinel-1 VV backscatter' },
  { id: 'water', name: 'Water index', hint: 'NDWI / SAR water mask' },
];

export const RENDER_PX = 1024;

/* A small tile of hash noise, sampled with wrap. Calling fBm a million times
 * per layer would be the one genuinely slow thing in this app; a repeating
 * tile at this scale is indistinguishable and effectively free. */
const NOISE_N = 256;
const noiseTile = (() => {
  const a = new Float32Array(NOISE_N * NOISE_N);
  let s = 0x2f6e2b1;
  for (let i = 0; i < a.length; i++) {
    s = (Math.imul(s ^ (s >>> 15), s | 1) + 0x6d2b79f5) >>> 0;
    a[i] = ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  }
  return a;
})();
function tileNoise(x, y) {
  return noiseTile[((y & (NOISE_N - 1)) * NOISE_N) + (x & (NOISE_N - 1))];
}
/* Sum of four decorrelated samples, giving something roughly Gaussian around
 * 0.5 — used for speckle, which is what SAR noise actually looks like. */
function softNoise(x, y) {
  return (tileNoise(x, y) + tileNoise(x * 3 + 7, y * 5 + 11)
    + tileNoise(x * 7 + 31, y * 2 + 59) + tileNoise(x * 11 + 97, y * 13 + 3)) / 4;
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/* Hillshade from the elevation grid. Vertical exaggeration is large on purpose:
 * across 12.8 km the real relief here would be almost invisible, and terrain
 * that reads as terrain is worth more to the demo than a defensible z-scale. */
function hillshadeAt(elev, x, y, exaggeration) {
  const xm = x > 0 ? x - 1 : x, xp = x < GRID - 1 ? x + 1 : x;
  const ym = y > 0 ? y - 1 : y, yp = y < GRID - 1 ? y + 1 : y;
  const dzdx = (elev[y * GRID + xp] - elev[y * GRID + xm]) * exaggeration;
  const dzdy = (elev[yp * GRID + x] - elev[ym * GRID + x]) * exaggeration;
  // Light from the north-west at roughly 45 degrees, the cartographic default.
  const nz = 1 / Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
  const nx = -dzdx * nz, ny = -dzdy * nz;
  const lx = -0.5735, ly = 0.5735, lz = 0.5848;
  return clamp01((nx * lx + ny * ly + nz * lz) * 0.85 + 0.30);
}

/* ---- palettes ------------------------------------------------------------ */

/* Natural-colour reflectances, deliberately desaturated and slightly warm —
 * true-colour Sentinel-2 over a wet-season Indian delta is muted, not vivid. */
const OPTICAL = {
  [COVER.SOIL]:      [138, 121, 92],
  [COVER.CROP_A]:    [ 86, 112,  60],
  [COVER.CROP_B]:    [140, 137,  78],
  [COVER.FOREST]:    [ 52,  76,  46],
  [COVER.URBAN]:     [150, 143, 131],
  [COVER.WATER]:     [ 44,  68,  76],
  [COVER.ROAD]:      [163, 154, 139],
  [COVER.BARE_ROCK]: [163, 154, 141],
};

/* Radar backscatter by surface, roughly ordered the way sigma-nought is:
 * smooth surfaces scatter away from the sensor and read dark, volume
 * scatterers read mid, and built-up double-bounce reads very bright. */
const BACKSCATTER = {
  [COVER.SOIL]:      0.30,
  [COVER.CROP_A]:    0.44,
  [COVER.CROP_B]:    0.39,
  [COVER.FOREST]:    0.56,
  [COVER.URBAN]:     0.86,
  [COVER.WATER]:     0.045,
  [COVER.ROAD]:      0.11,
  [COVER.BARE_ROCK]: 0.47,
};

/* Synthetic green and NIR reflectance per surface, so NDWI is computed from
 * band values rather than assigned from a lookup of "is this water". */
const BANDS = {
  [COVER.SOIL]:      { g: 0.14, nir: 0.25 },
  [COVER.CROP_A]:    { g: 0.08, nir: 0.40 },
  [COVER.CROP_B]:    { g: 0.10, nir: 0.35 },
  [COVER.FOREST]:    { g: 0.05, nir: 0.38 },
  [COVER.URBAN]:     { g: 0.17, nir: 0.20 },
  [COVER.WATER]:     { g: 0.09, nir: 0.02 },
  [COVER.ROAD]:      { g: 0.13, nir: 0.16 },
  [COVER.BARE_ROCK]: { g: 0.21, nir: 0.27 },
};

/* ---- per-date scene view ------------------------------------------------- */

/* The cover array plus whichever water mask and cloud mask belong to the
 * requested date. Everything else about the place is identical between dates,
 * which is what makes the compare slider legible. */
function viewFor(scene, date) {
  const after = date === 'after';
  return {
    cover: after && scene.coverAfter ? scene.coverAfter : scene.cover,
    water: after ? scene.waterAfter : scene.waterBefore,
    baselineWater: scene.waterBefore,
    cloud: after ? scene.cloudAfter : scene.cloudBefore,
    severity: after ? scene.severity : null,
    after,
  };
}

/* ---- optical ------------------------------------------------------------- */

function drawOptical(scene, view, px) {
  const img = new ImageData(px, px);
  const d = img.data;
  const scale = GRID / px;
  const { elev } = scene;
  const { cover, water, baselineWater, cloud } = view;

  for (let py = 0; py < px; py++) {
    const gy = Math.min(GRID - 1, (py * scale) | 0);
    for (let pxi = 0; pxi < px; pxi++) {
      const gx = Math.min(GRID - 1, (pxi * scale) | 0);
      const gi = gy * GRID + gx;
      const o = (py * px + pxi) * 4;

      let r, g, b;
      const isWater = water && water[gi];

      if (isWater) {
        // Depth proxy: how far below the surface level this cell sits. Deeper
        // water reads darker and less turbid.
        const depth = clamp01((0.235 - elev[gi]) * 5.2);
        const fresh = baselineWater && !baselineWater[gi];
        if (fresh) {
          // Newly flooded ground carries suspended sediment, so it reads as a
          // muddy olive-brown rather than as clean water.
          r = 96 - depth * 34;
          g = 92 - depth * 30;
          b = 68 - depth * 18;
        } else {
          r = 48 - depth * 18;
          g = 72 - depth * 26;
          b = 82 - depth * 24;
        }
        const ripple = softNoise(pxi >> 1, py >> 1);
        r += (ripple - 0.5) * 14;
        g += (ripple - 0.5) * 14;
        b += (ripple - 0.5) * 12;
      } else {
        const c = cover[gi];
        const base = OPTICAL[c] || OPTICAL[COVER.SOIL];
        // Per-parcel tone so neighbouring fields differ the way real ones do.
        const pid = scene.parcel ? scene.parcel[gi] : -1;
        const parcelTone = pid >= 0 && scene.parcels[pid]
          ? (scene.parcels[pid].tone - 0.5) * 0.30 : 0;
        const grain = (softNoise(pxi, py) - 0.5) * 0.13
          + (tileNoise(pxi, py) - 0.5) * 0.07;
        const shade = hillshadeAt(elev, gx, gy, 26);
        const k = (0.72 + shade * 0.52) * (1 + parcelTone + grain);
        r = base[0] * k;
        g = base[1] * k;
        b = base[2] * k;

        // Earthquake damage reads in optical as rubble: desaturated, brighter,
        // with the block texture broken up.
        if (view.severity && view.severity[gi] > 0.35) {
          const s = clamp01((view.severity[gi] - 0.35) / 0.55);
          const rub = 150 + (softNoise(pxi * 2, py * 2) - 0.5) * 60;
          r += (rub - r) * s * 0.85;
          g += (rub * 0.95 - g) * s * 0.85;
          b += (rub * 0.88 - b) * s * 0.85;
        }
      }

      // Atmospheric haze: a slight warm lift across the whole frame, which is
      // what stops a synthetic composite looking like a screenshot of a map.
      r = r * 0.94 + 15;
      g = g * 0.94 + 15;
      b = b * 0.94 + 17;

      if (cloud) {
        const a = cloud.alpha[gi];
        if (a > 0) {
          // Cloud shadow falls offset from the cloud itself, to the south-east.
          const sx = Math.min(GRID - 1, gx + 7), sy = Math.min(GRID - 1, gy + 9);
          const shadow = cloud.alpha[sy * GRID + sx] * 0.30;
          r *= 1 - shadow; g *= 1 - shadow; b *= 1 - shadow;

          const lumps = 0.82 + softNoise(pxi >> 1, py >> 1) * 0.34;
          const cr = 236 * lumps, cg = 238 * lumps, cb = 242 * lumps;
          r += (cr - r) * a; g += (cg - g) * a; b += (cb - b) * a;
        }
      }

      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
    }
  }
  return img;
}

/* ---- SAR ----------------------------------------------------------------- */

function drawSar(scene, view, px) {
  const img = new ImageData(px, px);
  const d = img.data;
  const scale = GRID / px;
  const { elev } = scene;
  const { cover, water } = view;

  for (let py = 0; py < px; py++) {
    const gy = Math.min(GRID - 1, (py * scale) | 0);
    for (let pxi = 0; pxi < px; pxi++) {
      const gx = Math.min(GRID - 1, (pxi * scale) | 0);
      const gi = gy * GRID + gx;
      const o = (py * px + pxi) * 4;

      let sigma = water && water[gi]
        ? BACKSCATTER[COVER.WATER]
        : (BACKSCATTER[cover[gi]] ?? BACKSCATTER[COVER.SOIL]);

      // Terrain modulation in the range direction: slopes tilted towards the
      // sensor brighten, slopes tilted away darken. This is what gives real SAR
      // over relief its characteristic ribbed look.
      const xm = gx > 0 ? gx - 1 : gx, xp = gx < GRID - 1 ? gx + 1 : gx;
      const slopeRange = (elev[gy * GRID + xp] - elev[gy * GRID + xm]) * 34;
      sigma *= clamp01(1 - slopeRange * 0.55) * 0.75 + 0.42;

      // Built-up areas throw occasional very bright corner returns.
      if (cover[gi] === COVER.URBAN && tileNoise(pxi * 5, py * 7) > 0.965) {
        sigma = Math.min(1.35, sigma * 1.9);
      }

      // Speckle is multiplicative, not additive — this is the single detail
      // that makes synthetic SAR read as SAR.
      const speck = 0.55 + softNoise(pxi, py) * 0.92;
      sigma *= speck;

      // Damaged built-up scatters more chaotically and slightly brighter.
      if (view.severity && view.severity[gi] > 0.4) {
        sigma *= 1 + (softNoise(pxi * 3, py * 3) - 0.4) * 0.7;
      }

      // Log-ish stretch, the way a GRD product is normally displayed.
      const v = clamp01(Math.pow(clamp01(sigma), 0.62)) * 255;
      // A very slight cool cast; pure neutral grey reads as "unstyled" on a
      // projector, and every SAR viewer in the wild has some tint.
      d[o] = v * 0.985;
      d[o + 1] = v * 0.995;
      d[o + 2] = Math.min(255, v * 1.02 + 3);
      d[o + 3] = 255;
    }
  }
  return img;
}

/* ---- water index --------------------------------------------------------- */

/* Which instrument can actually answer the water question on this date. Above
 * roughly a quarter cloud, an optical index is not worth trusting, so the layer
 * falls back to the SAR-derived mask and says so. */
export function waterMethodFor(scenarioId, date) {
  const scene = buildScene(scenarioId);
  const cloud = date === 'after' ? scene.cloudAfter : scene.cloudBefore;
  return cloud.fraction > 0.25
    ? { method: 'sar_mask', label: 'SAR water mask · Sentinel-1 VV', reason: 'optical index unusable under cloud' }
    : { method: 'ndwi', label: 'NDWI · (green − NIR) / (green + NIR)', reason: 'optical pass usable' };
}

function drawWater(scene, view, px, method) {
  const img = new ImageData(px, px);
  const d = img.data;
  const scale = GRID / px;
  const { elev } = scene;
  const { cover, water, baselineWater } = view;

  for (let py = 0; py < px; py++) {
    const gy = Math.min(GRID - 1, (py * scale) | 0);
    for (let pxi = 0; pxi < px; pxi++) {
      const gx = Math.min(GRID - 1, (pxi * scale) | 0);
      const gi = gy * GRID + gx;
      const o = (py * px + pxi) * 4;

      let index;      // -1 .. 1, positive means water
      let base;       // greyscale backdrop

      if (method === 'sar_mask') {
        const sigma = water && water[gi]
          ? BACKSCATTER[COVER.WATER]
          : (BACKSCATTER[cover[gi]] ?? BACKSCATTER[COVER.SOIL]);
        const speck = 0.6 + softNoise(pxi, py) * 0.8;
        const obs = sigma * speck;
        // Thresholding low backscatter is exactly how operational SAR flood
        // mapping works, so the layer is showing the real decision rule.
        index = obs < 0.11 ? 0.55 - obs : -0.4;
        base = clamp01(Math.pow(clamp01(obs), 0.62)) * 210 + 12;
      } else {
        const b = water && water[gi] ? BANDS[COVER.WATER] : (BANDS[cover[gi]] || BANDS[COVER.SOIL]);
        const jitter = (softNoise(pxi, py) - 0.5) * 0.06;
        const g = b.g + jitter, nir = b.nir + jitter * 0.6;
        index = (g - nir) / (g + nir + 1e-6);
        const shade = hillshadeAt(elev, gx, gy, 26);
        base = (0.42 + shade * 0.5) * 190;
      }

      let r = base * 0.96, gg = base * 0.95, bb = base * 0.99;

      if (index > 0) {
        const t = clamp01(index / 0.6);
        // Baseline water in a steadier blue, newly detected water in cyan, so
        // "what is new" is separable from "what is always wet" without relying
        // on colour alone — the compare slider carries the same information.
        const fresh = baselineWater && !baselineWater[gi];
        const cr = fresh ? 34 : 26;
        const cg = fresh ? 200 + t * 40 : 112 + t * 40;
        const cb = fresh ? 214 + t * 34 : 178 + t * 42;
        const a = 0.42 + t * 0.52;
        r += (cr - r) * a; gg += (cg - gg) * a; bb += (cb - bb) * a;
      }

      d[o] = r; d[o + 1] = gg; d[o + 2] = bb; d[o + 3] = 255;
    }
  }
  return img;
}

/* ---- public surface ------------------------------------------------------ */

const _cache = new Map();

function cacheKey(scenarioId, layer, date, px) {
  return scenarioId + '|' + layer + '|' + date + '|' + px;
}

/**
 * Render one layer of one date to a canvas. Cached: a given combination is
 * generated once per session and reused for every subsequent paint, which is
 * what keeps the compare slider at full frame rate.
 */
export function renderLayer(scenarioId, layer, date, px = RENDER_PX) {
  const key = cacheKey(scenarioId, layer, date, px);
  if (_cache.has(key)) return _cache.get(key);

  const scene = buildScene(scenarioId);
  const view = viewFor(scene, date);

  let img;
  if (layer === 'sar') img = drawSar(scene, view, px);
  else if (layer === 'water') img = drawWater(scene, view, px, waterMethodFor(scenarioId, date).method);
  else img = drawOptical(scene, view, px);

  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  canvas.getContext('2d').putImageData(img, 0, 0);
  _cache.set(key, canvas);
  return canvas;
}

/**
 * A cropped thumbnail as a data URL, used as the `image_url` on an API
 * response so the evidence citation carries the pixels it is citing.
 */
export function renderThumb(scenarioId, layer, date, bbox, outPx = 208) {
  const src = renderLayer(scenarioId, layer, date);
  const s = src.width / GRID;
  const c = document.createElement('canvas');
  c.width = outPx;
  c.height = outPx;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';

  if (bbox) {
    // Square off the crop so the thumbnail is not distorted.
    const w = Math.max(bbox.x1 - bbox.x0, bbox.y1 - bbox.y0) || GRID;
    const cx = (bbox.x0 + bbox.x1) / 2, cy = (bbox.y0 + bbox.y1) / 2;
    const half = (w * 0.72);
    ctx.drawImage(src, (cx - half) * s, (cy - half) * s, half * 2 * s, half * 2 * s,
      0, 0, outPx, outPx);
  } else {
    ctx.drawImage(src, 0, 0, outPx, outPx);
  }
  return c.toDataURL('image/jpeg', 0.72);
}

/**
 * Render everything a scenario needs, yielding between layers so the loading
 * indicator can actually paint. Returns the number of layers rendered.
 */
export async function prewarm(scenarioId, onProgress) {
  const combos = [];
  for (const l of LAYERS) for (const date of ['before', 'after']) combos.push([l.id, date]);
  for (let i = 0; i < combos.length; i++) {
    renderLayer(scenarioId, combos[i][0], combos[i][1]);
    if (onProgress) onProgress((i + 1) / combos.length, combos[i]);
    await new Promise((r) => requestAnimationFrame(() => r()));
  }
  return combos.length;
}

export function isRendered(scenarioId, layer, date, px = RENDER_PX) {
  return _cache.has(cacheKey(scenarioId, layer, date, px));
}
