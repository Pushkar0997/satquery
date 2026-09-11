/* ---------------------------------------------------------------------------
 * ui/map.js — the imagery viewer
 *
 * Owns the viewport (zoom, pan, animated flights), the layer and date
 * selection, the before/after swipe, and everything drawn on the vector
 * overlay: the AOI, the road network coloured by measured status, settlement
 * markers, and the evidence highlight an answer points at.
 *
 * The overlay is a separate canvas drawn in screen space and repainted every
 * frame of a viewport change, which is what keeps the vectors locked to the
 * imagery instead of sliding against it.
 * ------------------------------------------------------------------------- */

import { buildScene, analyzeScene, GRID, GSD_M } from '../scene.js';
import { renderLayer, LAYERS, waterMethodFor } from '../render.js';

const MIN_ZOOM = 0.92;
const MAX_ZOOM = 9;
const FLIGHT_MS = 720;

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function createMap(opts) {
  const el = {
    stage: document.getElementById('stage'),
    after: document.getElementById('canvasAfter'),
    before: document.getElementById('canvasBefore'),
    layerBefore: document.getElementById('layerBefore'),
    overlay: document.getElementById('overlay'),
    handle: document.getElementById('compareHandle'),
    tagL: document.getElementById('compareTagL'),
    tagR: document.getElementById('compareTagR'),
    legend: document.getElementById('legend'),
    scaleBar: document.getElementById('scaleBar'),
    scaleText: document.getElementById('scaleText'),
    footer: document.getElementById('mapFooter'),
  };
  const octx = el.overlay.getContext('2d');

  const state = {
    scenario: 'flood',
    layer: 'sar',
    date: 'after',
    compare: false,
    vectors: true,
    aoiMode: false,
    split: 0.5,                 // compare reveal, 0..1
    view: { cx: GRID / 2, cy: GRID / 2, z: 1 },
    evidence: [],               // [{bbox, label, note, t}] t = draw progress
    focusMask: 0,               // 0..1 dim outside the focused evidence box
    customAoi: null,            // {x0,y0,x1,y1} in grid coords
    drawing: null,
    scene: null,
    measures: null,
    roadStates: new Map(),
    cutOff: new Set(),
  };

  /* ---- geometry ---------------------------------------------------------- */

  let W = 0, H = 0, fit = 1, ox0 = 0, oy0 = 0, dpr = 1;

  function measure() {
    const r = el.stage.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    fit = Math.min(W, H) / GRID;
    const base = GRID * fit;
    ox0 = (W - base) / 2;
    oy0 = (H - base) / 2;

    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    el.overlay.width = Math.round(W * dpr);
    el.overlay.height = Math.round(H * dpr);
    el.overlay.style.width = W + 'px';
    el.overlay.style.height = H + 'px';

    for (const c of [el.after, el.before]) {
      c.style.left = ox0 + 'px';
      c.style.top = oy0 + 'px';
      c.style.width = base + 'px';
      c.style.height = base + 'px';
    }
  }

  function transformOf(v) {
    const tx = W / 2 - ox0 - v.z * v.cx * fit;
    const ty = H / 2 - oy0 - v.z * v.cy * fit;
    return { tx, ty };
  }

  function project(gx, gy) {
    const { tx, ty } = transformOf(state.view);
    return [
      ox0 + tx + state.view.z * gx * fit,
      oy0 + ty + state.view.z * gy * fit,
    ];
  }

  function unproject(sx, sy) {
    const { tx, ty } = transformOf(state.view);
    return [
      (sx - ox0 - tx) / (state.view.z * fit),
      (sy - oy0 - ty) / (state.view.z * fit),
    ];
  }

  function applyTransform() {
    const { tx, ty } = transformOf(state.view);
    const t = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${state.view.z})`;
    el.after.style.transform = t;
    el.before.style.transform = t;
  }

  /* ---- imagery ----------------------------------------------------------- */

  function paintImagery() {
    const afterCanvas = renderLayer(state.scenario, state.layer, state.date);
    // The "before" plate is the same layer at the other date, so the swipe
    // always compares like with like.
    const otherDate = state.date === 'after' ? 'before' : 'after';
    const beforeCanvas = renderLayer(state.scenario, state.layer, otherDate);

    blit(el.after, afterCanvas);
    blit(el.before, beforeCanvas);

    const sc = opts.getScenarioMeta(state.scenario);
    const [lLabel, rLabel] = state.date === 'after'
      ? [sc.before_label, sc.after_label]
      : [sc.after_label, sc.before_label];
    el.tagL.textContent = lLabel;
    el.tagR.textContent = rLabel;
  }

  function blit(target, source) {
    if (target.width !== source.width) {
      target.width = source.width;
      target.height = source.height;
    }
    const c = target.getContext('2d');
    c.clearRect(0, 0, target.width, target.height);
    c.drawImage(source, 0, 0);
  }

  function applyCompare() {
    const on = state.compare;
    el.handle.hidden = !on;
    el.tagL.hidden = !on;
    el.tagR.hidden = !on;
    if (!on) {
      el.layerBefore.style.clipPath = 'inset(0 100% 0 0)';
      return;
    }
    const p = state.split * 100;
    el.layerBefore.style.clipPath = `inset(0 ${(100 - p).toFixed(3)}% 0 0)`;
    el.handle.style.left = p + '%';
    el.handle.setAttribute('aria-valuenow', Math.round(p));
  }

  /* ---- vector overlay ---------------------------------------------------- */

  const STATUS_STYLE = {
    open: { color: '#74D06D', dash: [], label: 'Open' },
    restricted: { color: '#EAB84A', dash: [11, 5], label: 'Restricted' },
    impassable: { color: '#FF6F55', dash: [3, 4], label: 'Impassable' },
  };

  function drawOverlay() {
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, W, H);

    drawAoiFootprint();
    if (state.vectors) drawVectors();
    if (state.focusMask > 0.01) drawFocusMask();
    drawEvidence();
    if (state.customAoi) drawCustomAoi();
    if (state.drawing) drawDrawing();
    updateScaleBar();
  }

  function drawAoiFootprint() {
    const [x0, y0] = project(0, 0);
    const [x1, y1] = project(GRID, GRID);
    octx.save();
    octx.strokeStyle = 'rgba(238,232,218,.42)';
    octx.lineWidth = 1;
    octx.setLineDash([6, 5]);
    octx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    octx.setLineDash([]);
    // Corner ticks read as a survey frame rather than as a plain border.
    const L = 16;
    octx.strokeStyle = 'rgba(238,232,218,.75)';
    octx.lineWidth = 1.5;
    for (const [cx, cy, dx, dy] of [
      [x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1],
    ]) {
      octx.beginPath();
      octx.moveTo(cx + dx * L, cy);
      octx.lineTo(cx, cy);
      octx.lineTo(cx, cy + dy * L);
      octx.stroke();
    }
    octx.restore();
  }

  function drawVectors() {
    const scene = state.scene;
    if (!scene) return;

    octx.save();
    octx.lineCap = 'round';
    octx.lineJoin = 'round';

    // Roads, coloured and dashed by measured status.
    for (const road of scene.roads || []) {
      const st = state.roadStates.get(road.id);
      const style = st ? STATUS_STYLE[st.status] : { color: 'rgba(230,225,212,.55)', dash: [] };
      const width = road.cls === 'national' ? 3.2 : road.cls === 'state' ? 2.6 : 2;

      // A dark casing under every line keeps it legible over both the bright
      // urban returns in SAR and the pale cloud in optical.
      octx.strokeStyle = 'rgba(8,11,15,.55)';
      octx.lineWidth = width + 2.4;
      octx.setLineDash([]);
      strokePath(road.pts);

      octx.strokeStyle = style.color;
      octx.lineWidth = width;
      octx.setLineDash(style.dash);
      strokePath(road.pts);
      octx.setLineDash([]);

      // Mark where the centreline first enters water, so "impassable" has a
      // visible cause and not just a colour.
      if (st && st.breach_at) {
        const p = pointOnPath(road.pts, st.breach_at[0]);
        const [sx, sy] = project(p[0], p[1]);
        octx.strokeStyle = '#FF6F55';
        octx.lineWidth = 2;
        const r = 5;
        octx.beginPath();
        octx.moveTo(sx - r, sy - r); octx.lineTo(sx + r, sy + r);
        octx.moveTo(sx + r, sy - r); octx.lineTo(sx - r, sy + r);
        octx.stroke();
      }
    }

    // Settlements.
    for (const s of scene.settlements || []) {
      const [sx, sy] = project(s.x, s.y);
      if (sx < -60 || sy < -60 || sx > W + 60 || sy > H + 60) continue;
      const cut = state.cutOff.has(s.id);

      octx.beginPath();
      octx.arc(sx, sy, 4.5, 0, Math.PI * 2);
      octx.fillStyle = cut ? '#FF6F55' : '#EDE7D9';
      octx.strokeStyle = 'rgba(8,11,15,.7)';
      octx.lineWidth = 1.5;
      octx.fill();
      octx.stroke();

      if (cut) {
        // A second ring, so isolation is not carried by colour alone.
        octx.beginPath();
        octx.arc(sx, sy, 9, 0, Math.PI * 2);
        octx.strokeStyle = '#FF6F55';
        octx.lineWidth = 1.4;
        octx.setLineDash([3, 3]);
        octx.stroke();
        octx.setLineDash([]);
      }

      label(sx + 11, sy + 3.5, cut ? s.name + '  · CUT OFF' : s.name,
        cut ? '#FFD9CF' : '#E6E0D0', cut);
    }

    if (scene.hub) {
      const [sx, sy] = project(scene.hub.x, scene.hub.y);
      octx.save();
      octx.translate(sx, sy);
      octx.rotate(Math.PI / 4);
      octx.fillStyle = '#3ADCE8';
      octx.strokeStyle = 'rgba(8,11,15,.7)';
      octx.lineWidth = 1.5;
      octx.fillRect(-5, -5, 10, 10);
      octx.strokeRect(-5, -5, 10, 10);
      octx.restore();
      label(sx + 12, sy + 3.5, 'Relief staging', '#B9F0F4', false);
    }

    octx.restore();
  }

  function strokePath(pts) {
    octx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const [sx, sy] = project(pts[i][0], pts[i][1]);
      if (i === 0) octx.moveTo(sx, sy);
      else octx.lineTo(sx, sy);
    }
    octx.stroke();
  }

  function pointOnPath(pts, t) {
    const idx = clamp(t * (pts.length - 1), 0, pts.length - 1.001);
    const i = Math.floor(idx), f = idx - i;
    return [
      pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f,
      pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f,
    ];
  }

  function label(x, y, text, color, strong) {
    octx.font = (strong ? '600 ' : '') + '11px "Cascadia Mono", Consolas, monospace';
    const w = octx.measureText(text).width;
    octx.fillStyle = 'rgba(8,11,15,.62)';
    octx.fillRect(x - 3, y - 11, w + 6, 15);
    octx.fillStyle = color;
    octx.fillText(text, x, y);
  }

  /* Dim everything outside the focused evidence box. This is the single change
   * that makes "the answer said X, here is X" unmissable across a room. */
  function drawFocusMask() {
    const ev = state.evidence[0];
    if (!ev) return;
    const [x0, y0] = project(ev.bbox.x0, ev.bbox.y0);
    const [x1, y1] = project(ev.bbox.x1, ev.bbox.y1);
    octx.save();
    octx.fillStyle = `rgba(9,12,16,${0.55 * state.focusMask})`;
    octx.beginPath();
    octx.rect(0, 0, W, H);
    octx.rect(x0, y0, x1 - x0, y1 - y0);
    octx.fill('evenodd');
    octx.restore();
  }

  function drawEvidence() {
    for (const ev of state.evidence) {
      if (ev.t <= 0) continue;
      const [x0, y0] = project(ev.bbox.x0, ev.bbox.y0);
      const [x1, y1] = project(ev.bbox.x1, ev.bbox.y1);
      const w = x1 - x0, h = y1 - y0;
      const perim = 2 * (w + h);

      octx.save();
      octx.strokeStyle = '#3ADCE8';
      octx.lineWidth = 2;
      octx.shadowColor = 'rgba(58,220,232,.55)';
      octx.shadowBlur = 10;
      // Draw the box on progressively, starting from the top-left corner.
      octx.setLineDash([perim, perim]);
      octx.lineDashOffset = perim * (1 - ev.t);
      octx.strokeRect(x0, y0, w, h);
      octx.setLineDash([]);
      octx.shadowBlur = 0;

      if (ev.t > 0.98) {
        // Corner brackets, drawn once the box has landed.
        const L = Math.min(18, Math.min(w, h) * 0.3);
        octx.lineWidth = 3;
        for (const [cx, cy, dx, dy] of [
          [x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1],
        ]) {
          octx.beginPath();
          octx.moveTo(cx + dx * L, cy);
          octx.lineTo(cx, cy);
          octx.lineTo(cx, cy + dy * L);
          octx.stroke();
        }

        const text = ev.label;
        octx.font = '600 11.5px "Cascadia Mono", Consolas, monospace';
        const tw = octx.measureText(text).width;
        const ly = y0 - 9 < 16 ? y1 + 20 : y0 - 9;
        octx.fillStyle = 'rgba(10,107,117,.95)';
        octx.fillRect(x0, ly - 13, tw + 14, 19);
        octx.fillStyle = '#EAFBFC';
        octx.fillText(text, x0 + 7, ly);
      }
      octx.restore();
    }
  }

  function drawCustomAoi() {
    const a = state.customAoi;
    const [x0, y0] = project(a.x0, a.y0);
    const [x1, y1] = project(a.x1, a.y1);
    octx.save();
    octx.strokeStyle = '#E39A44';
    octx.lineWidth = 2;
    octx.setLineDash([7, 4]);
    octx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    octx.setLineDash([]);
    octx.fillStyle = 'rgba(227,154,68,.10)';
    octx.fillRect(x0, y0, x1 - x0, y1 - y0);

    const km = Math.abs((a.x1 - a.x0) * GSD_M) / 1000;
    const km2 = km * (Math.abs((a.y1 - a.y0) * GSD_M) / 1000);
    label(Math.min(x0, x1) + 4, Math.min(y0, y1) - 7,
      `AOI-USER · ${km2.toFixed(1)} km²`, '#F6D9AE', true);
    octx.restore();
  }

  function drawDrawing() {
    const d = state.drawing;
    const [x0, y0] = project(d.x0, d.y0);
    const [x1, y1] = project(d.x1, d.y1);
    octx.save();
    octx.strokeStyle = '#E39A44';
    octx.lineWidth = 1.5;
    octx.setLineDash([4, 4]);
    octx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    octx.restore();
  }

  function updateScaleBar() {
    const mPerPx = GSD_M / (state.view.z * fit);
    const target = 92 * mPerPx;
    const pow = Math.pow(10, Math.floor(Math.log10(target)));
    const n = target / pow;
    const rounded = (n >= 5 ? 5 : n >= 2 ? 2 : 1) * pow;
    el.scaleBar.style.width = Math.round(rounded / mPerPx) + 'px';
    el.scaleText.textContent = rounded >= 1000
      ? (rounded / 1000) + ' km'
      : Math.round(rounded) + ' m';
  }

  /* ---- legend ------------------------------------------------------------ */

  function updateLegend() {
    const showRoads = state.vectors && state.scene && state.scene.roads
      && state.roadStates.size > 0;
    if (!showRoads) {
      el.legend.hidden = true;
      return;
    }
    const counts = { open: 0, restricted: 0, impassable: 0 };
    for (const st of state.roadStates.values()) counts[st.status]++;
    el.legend.hidden = false;
    el.legend.innerHTML = '<h4>Road status</h4>' + Object.entries(STATUS_STYLE)
      .map(([k, s]) => `<div class="row"><span class="swatch${s.dash.length ? ' dashed' : ''}" style="${s.dash.length ? 'color:' + s.color : 'background:' + s.color}"></span>${s.label} · ${counts[k]}</div>`)
      .join('') + '<div class="row" style="margin-top:4px;opacity:.75">&times; first breach point</div>';
  }

  /* ---- footer ------------------------------------------------------------ */

  function updateFooter() {
    const sc = opts.getScenarioMeta(state.scenario);
    const layerMeta = LAYERS.find((l) => l.id === state.layer);
    const wm = waterMethodFor(state.scenario, state.date);
    const dateLabel = state.date === 'after' ? sc.after_label : sc.before_label;
    const hint = state.layer === 'water' ? wm.label : layerMeta.hint;
    const cloud = state.date === 'after'
      ? state.measures.cloud_after_pct : state.measures.cloud_before_pct;

    el.footer.innerHTML = [
      kv('AOI', sc.aoi),
      kv('PASS', dateLabel),
      kv('LAYER', hint),
      kv('CLOUD', cloud + '%'),
      kv('GSD', GSD_M + ' m'),
      kv('EXTENT', (GRID * GSD_M / 1000).toFixed(1) + ' km'),
      '<span class="spacer"></span>',
      kv('ZOOM', state.view.z.toFixed(2) + '×'),
    ].join('');
  }

  function kv(k, v) {
    return `<span class="kv"><span class="k">${k}</span><span class="v">${v}</span></span>`;
  }

  /* ---- render loop ------------------------------------------------------- */

  let raf = null;
  function invalidate() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = null;
      applyTransform();
      drawOverlay();
      updateFooter();
    });
  }

  /* ---- viewport flights -------------------------------------------------- */

  let flight = null;
  function flyTo(target, ms = FLIGHT_MS) {
    const from = { ...state.view };
    const to = {
      cx: clamp(target.cx, 0, GRID),
      cy: clamp(target.cy, 0, GRID),
      z: clamp(target.z, MIN_ZOOM, MAX_ZOOM),
    };
    const start = performance.now();
    flight = { from, to, start, ms };
    step();

    function step() {
      const now = performance.now();
      const t = clamp((now - start) / ms, 0, 1);
      const e = easeInOut(t);
      state.view.cx = from.cx + (to.cx - from.cx) * e;
      state.view.cy = from.cy + (to.cy - from.cy) * e;
      state.view.z = from.z + (to.z - from.z) * e;
      applyTransform();
      drawOverlay();
      updateFooter();
      if (t < 1 && flight && flight.start === start) requestAnimationFrame(step);
      else if (flight && flight.start === start) flight = null;
    }
  }

  function zoomToBbox(bbox, pad = 0.62) {
    const bw = Math.max(8, Math.max(bbox.x1 - bbox.x0, bbox.y1 - bbox.y0));
    flyTo({
      cx: (bbox.x0 + bbox.x1) / 2,
      cy: (bbox.y0 + bbox.y1) / 2,
      z: clamp((GRID * pad) / bw, MIN_ZOOM, MAX_ZOOM),
    });
  }

  /* Animate a value from 0 to 1 and repaint each frame. */
  function tween(ms, onFrame, onDone) {
    const start = performance.now();
    (function step() {
      const t = clamp((performance.now() - start) / ms, 0, 1);
      onFrame(easeInOut(t));
      drawOverlay();
      if (t < 1) requestAnimationFrame(step);
      else if (onDone) onDone();
    })();
  }

  /* ---- interaction ------------------------------------------------------- */

  let drag = null;

  el.stage.addEventListener('pointerdown', (e) => {
    if (e.target === el.handle || el.handle.contains(e.target)) return;
    el.stage.setPointerCapture(e.pointerId);
    const rect = el.stage.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;

    if (state.aoiMode) {
      const [gx, gy] = unproject(sx, sy);
      state.drawing = { x0: gx, y0: gy, x1: gx, y1: gy };
      el.stage.classList.add('drawing');
    } else {
      drag = { sx, sy, cx: state.view.cx, cy: state.view.cy };
      el.stage.classList.add('dragging');
    }
  });

  el.stage.addEventListener('pointermove', (e) => {
    const rect = el.stage.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;

    if (state.drawing) {
      const [gx, gy] = unproject(sx, sy);
      state.drawing.x1 = clamp(gx, 0, GRID);
      state.drawing.y1 = clamp(gy, 0, GRID);
      invalidate();
      return;
    }
    if (!drag) return;
    flight = null;
    const k = state.view.z * fit;
    state.view.cx = clamp(drag.cx - (sx - drag.sx) / k, 0, GRID);
    state.view.cy = clamp(drag.cy - (sy - drag.sy) / k, 0, GRID);
    invalidate();
  });

  function endPointer(e) {
    if (state.drawing) {
      const d = state.drawing;
      const box = {
        x0: Math.min(d.x0, d.x1), y0: Math.min(d.y0, d.y1),
        x1: Math.max(d.x0, d.x1), y1: Math.max(d.y0, d.y1),
      };
      state.drawing = null;
      el.stage.classList.remove('drawing');
      // Ignore an accidental click; only a real drag defines an AOI.
      if (box.x1 - box.x0 > 6 && box.y1 - box.y0 > 6) {
        state.customAoi = box;
        if (opts.onAoi) opts.onAoi(box);
      }
      setAoiMode(false);
      invalidate();
    }
    drag = null;
    el.stage.classList.remove('dragging');
    if (e && e.pointerId != null && el.stage.hasPointerCapture(e.pointerId)) {
      el.stage.releasePointerCapture(e.pointerId);
    }
  }
  el.stage.addEventListener('pointerup', endPointer);
  el.stage.addEventListener('pointercancel', endPointer);

  el.stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    flight = null;
    const rect = el.stage.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    const [gx, gy] = unproject(sx, sy);
    const factor = Math.exp(-e.deltaY * 0.0016);
    const z = clamp(state.view.z * factor, MIN_ZOOM, MAX_ZOOM);
    // Keep the grid point under the cursor pinned while zooming.
    const k = z * fit;
    state.view.cx = clamp(gx - (sx - W / 2) / k, 0, GRID);
    state.view.cy = clamp(gy - (sy - H / 2) / k, 0, GRID);
    state.view.z = z;
    invalidate();
  }, { passive: false });

  /* Compare handle drag */
  let splitDrag = false;
  function setSplitFromClientX(clientX) {
    const rect = el.stage.getBoundingClientRect();
    state.split = clamp((clientX - rect.left) / rect.width, 0.02, 0.98);
    applyCompare();
  }
  el.handle.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    splitDrag = true;
    el.handle.setPointerCapture(e.pointerId);
  });
  el.handle.addEventListener('pointermove', (e) => {
    if (splitDrag) setSplitFromClientX(e.clientX);
  });
  el.handle.addEventListener('pointerup', (e) => {
    splitDrag = false;
    if (el.handle.hasPointerCapture(e.pointerId)) el.handle.releasePointerCapture(e.pointerId);
  });
  el.handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === 'ArrowLeft') { state.split = clamp(state.split - step, 0.02, 0.98); applyCompare(); e.preventDefault(); }
    if (e.key === 'ArrowRight') { state.split = clamp(state.split + step, 0.02, 0.98); applyCompare(); e.preventDefault(); }
  });

  const ro = new ResizeObserver(() => {
    measure();
    applyCompare();
    invalidate();
  });
  ro.observe(el.stage);

  /* ---- public API -------------------------------------------------------- */

  function loadScenario(scenarioId) {
    state.scenario = scenarioId;
    state.scene = buildScene(scenarioId);
    state.measures = analyzeScene(scenarioId);
    state.roadStates = new Map();
    for (const r of state.measures.roads || []) state.roadStates.set(r.id, r);
    state.cutOff = new Set(
      (state.measures.reachability || []).filter((r) => !r.reachable).map((r) => r.id)
    );
    state.evidence = [];
    state.focusMask = 0;
    state.customAoi = null;
    state.view = { cx: GRID / 2, cy: GRID / 2, z: 1 };
    measure();
    paintImagery();
    applyCompare();
    updateLegend();
    invalidate();
  }

  function setLayer(id) {
    if (state.layer === id) return;
    state.layer = id;
    // Cross-fade rather than cut, so a layer change reads as the same place
    // seen differently rather than as a new picture.
    el.after.style.transition = 'opacity .22s ease';
    el.after.style.opacity = '0.15';
    setTimeout(() => {
      paintImagery();
      el.after.style.opacity = '1';
      setTimeout(() => { el.after.style.transition = ''; }, 240);
    }, 130);
    invalidate();
    if (opts.onChange) opts.onChange(getState());
  }

  function setDate(d) {
    if (state.date === d) return;
    state.date = d;
    paintImagery();
    invalidate();
    if (opts.onChange) opts.onChange(getState());
  }

  function setCompare(on) {
    state.compare = on;
    applyCompare();
    if (opts.onChange) opts.onChange(getState());
  }

  function setVectors(on) {
    state.vectors = on;
    updateLegend();
    invalidate();
    if (opts.onChange) opts.onChange(getState());
  }

  function setAoiMode(on) {
    state.aoiMode = on;
    el.stage.classList.toggle('drawing', on);
    if (opts.onChange) opts.onChange(getState());
  }

  function clearAoi() {
    state.customAoi = null;
    invalidate();
  }

  /** Highlight one or more evidence regions, drawing each box on. */
  function showEvidence(regions, { fly = true, dim = true } = {}) {
    state.evidence = (regions || []).filter((r) => r && r.bbox)
      .map((r) => ({ bbox: r.bbox, label: r.label, note: r.note, t: 0 }));
    if (!state.evidence.length) {
      state.focusMask = 0;
      invalidate();
      return;
    }
    if (fly) zoomToBbox(state.evidence[0].bbox);
    tween(560, (e) => {
      for (const ev of state.evidence) ev.t = e;
      state.focusMask = dim ? e : 0;
    });
  }

  function clearEvidence() {
    tween(300, (e) => {
      for (const ev of state.evidence) ev.t = 1 - e;
      state.focusMask = state.focusMask * (1 - e);
    }, () => {
      state.evidence = [];
      state.focusMask = 0;
      drawOverlay();
    });
  }

  /** Apply the map_directive an answer carries. */
  function applyDirective(d) {
    if (!d) return;
    if (d.layer && d.layer !== state.layer) setLayer(d.layer);
    if (d.date && d.date !== state.date) setDate(d.date);
    setCompare(!!d.compare);
    if (opts.onChange) opts.onChange(getState());
  }

  function resetView() { flyTo({ cx: GRID / 2, cy: GRID / 2, z: 1 }); }
  function zoomBy(f) {
    flyTo({ cx: state.view.cx, cy: state.view.cy, z: state.view.z * f }, 260);
  }

  function getState() {
    return {
      scenario: state.scenario, layer: state.layer, date: state.date,
      compare: state.compare, vectors: state.vectors, aoiMode: state.aoiMode,
      customAoi: state.customAoi,
    };
  }

  return {
    loadScenario, setLayer, setDate, setCompare, setVectors, setAoiMode,
    clearAoi, showEvidence, clearEvidence, applyDirective, resetView, zoomBy,
    zoomToBbox, getState,
  };
}
