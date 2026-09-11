/* ---------------------------------------------------------------------------
 * main.js — wiring
 *
 * Owns the toolbar, the scenario switcher, keyboard shortcuts, and the one
 * path a question takes: composer -> api.queryStream -> trace steps into the
 * chat -> answer -> map directive applied -> evidence drawn.
 *
 * The only module that talks to the data layer is api/mock.js. Swapping that
 * import for a real client is the whole migration; nothing here knows what is
 * behind it beyond the response shape.
 * ------------------------------------------------------------------------- */

import {
  queryStream, SCENARIOS, getScenario, suggestions, indexStats,
  LAYERS, CONTRACT_VERSION, IS_MOCK,
} from './api/mock.js';
import { prewarm } from './render.js';
import { createMap } from './ui/map.js';
import { createChat } from './ui/chat.js';
import { createVoiceRecorder } from './voice.js';

const el = {
  scenarios: document.getElementById('scenarios'),
  layerSeg: document.getElementById('layerSeg'),
  dateSeg: document.getElementById('dateSeg'),
  compareBtn: document.getElementById('compareBtn'),
  vectorsBtn: document.getElementById('vectorsBtn'),
  aoiBtn: document.getElementById('aoiBtn'),
  zoomIn: document.getElementById('zoomIn'),
  zoomOut: document.getElementById('zoomOut'),
  zoomReset: document.getElementById('zoomReset'),
  veil: document.getElementById('veil'),
  veilInner: document.getElementById('veilInner'),
  progressFill: document.getElementById('progressFill'),
  veilStep: document.getElementById('veilStep'),
  form: document.getElementById('composerForm'),
  input: document.getElementById('queryInput'),
  voiceBtn: document.getElementById('voiceBtn'),
  voiceLanguage: document.getElementById('voiceLanguage'),
  voiceStatus: document.getElementById('voiceStatus'),
  askBtn: document.getElementById('askBtn'),
  chips: document.getElementById('chips'),
  chatTitle: document.getElementById('chatTitle'),
  chatBlurb: document.getElementById('chatBlurb'),
  indexLine: document.getElementById('indexLine'),
  topbarMeta: document.getElementById('topbarMeta'),
};

const app = {
  scenario: 'flood',
  busy: false,
  lastQuery: null,
  lastResponse: null,
};

/* ---- map + chat ---------------------------------------------------------- */

const map = createMap({
  getScenarioMeta: getScenario,
  onChange: syncToolbar,
  onAoi: (box) => {
    // A drawn AOI is a real interaction, so acknowledge it in the log rather
    // than silently changing state.
    const km = ((box.x1 - box.x0) * 33.3 / 1000) * ((box.y1 - box.y0) * 33.3 / 1000);
    chat.addUserMessage(`Set area of interest — ${km.toFixed(1)} km² sub-region of ${getScenario(app.scenario).aoi}`);
    syncToolbar();
  },
});

const chat = createChat({
  onViewEvidence: (r) => {
    if (r.map_directive) map.applyDirective(r.map_directive);
    map.showEvidence(r.evidence, { fly: true, dim: true });
  },
  onViewAllEvidence: (r) => {
    if (r.map_directive) map.applyDirective(r.map_directive);
    map.showEvidence(r.all_evidence, { fly: true, dim: false });
  },
  onCompare: (r) => {
    if (r.map_directive) map.applyDirective(r.map_directive);
    map.setCompare(true);
    map.clearEvidence();
    map.resetView();
    syncToolbar();
  },
  onRetry: () => {
    if (app.lastQuery) ask(app.lastQuery);
  },
});

const voiceRecorder = createVoiceRecorder({
  button: el.voiceBtn,
  language: el.voiceLanguage,
  status: el.voiceStatus,
  onTranscript: (transcript) => {
    el.input.value = transcript;
    el.input.focus();
  },
});

/* ---- chrome -------------------------------------------------------------- */

function buildScenarioNav() {
  el.scenarios.innerHTML = '';
  for (const s of SCENARIOS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'scenario-btn';
    b.setAttribute('aria-pressed', String(s.id === app.scenario));
    b.dataset.id = s.id;
    b.append(document.createTextNode(s.name));
    if (s.flag) {
      const f = document.createElement('span');
      f.className = 'flag';
      f.textContent = s.flag.toUpperCase();
      b.appendChild(f);
    }
    b.addEventListener('click', () => selectScenario(s.id));
    el.scenarios.appendChild(b);
  }
}

function buildSegs() {
  el.layerSeg.innerHTML = '';
  for (const l of LAYERS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = l.name;
    b.title = l.hint;
    b.dataset.id = l.id;
    b.addEventListener('click', () => { map.setLayer(l.id); syncToolbar(); });
    el.layerSeg.appendChild(b);
  }
  renderDateSeg();
}

function renderDateSeg() {
  const sc = getScenario(app.scenario);
  el.dateSeg.innerHTML = '';
  for (const [id, label] of [['before', sc.before_label], ['after', sc.after_label]]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.dataset.id = id;
    b.addEventListener('click', () => { map.setDate(id); syncToolbar(); });
    el.dateSeg.appendChild(b);
  }
}

function syncToolbar() {
  const s = map.getState();
  for (const b of el.layerSeg.children) {
    b.setAttribute('aria-pressed', String(b.dataset.id === s.layer));
  }
  for (const b of el.dateSeg.children) {
    b.setAttribute('aria-pressed', String(b.dataset.id === s.date));
  }
  el.compareBtn.setAttribute('aria-pressed', String(s.compare));
  el.vectorsBtn.setAttribute('aria-pressed', String(s.vectors));
  el.aoiBtn.setAttribute('aria-pressed', String(s.aoiMode));
  el.aoiBtn.lastChild.textContent = s.customAoi && !s.aoiMode ? ' AOI set' : ' Draw AOI';
}

function renderChips() {
  el.chips.innerHTML = '';
  for (const q of suggestions(app.scenario)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = q;
    b.addEventListener('click', () => ask(q));
    el.chips.appendChild(b);
  }
}

function renderChatHead() {
  const sc = getScenario(app.scenario);
  const stats = indexStats();
  el.chatTitle.textContent = sc.district;
  el.chatBlurb.textContent = sc.summary;
  el.indexLine.textContent =
    `INDEX ${stats.tiles} tiles · ${stats.scenarios} AOIs · ${stats.vocabulary}-term ${stats.space}`;
  el.topbarMeta.innerHTML =
    `contract ${CONTRACT_VERSION}<br>${IS_MOCK ? 'mock data layer' : 'live backend'}`;
}

/* ---- scenario loading ---------------------------------------------------- */

async function selectScenario(id) {
  if (app.busy || id === app.scenario) return;
  app.scenario = id;
  for (const b of el.scenarios.children) {
    b.setAttribute('aria-pressed', String(b.dataset.id === id));
  }
  renderDateSeg();
  renderChips();
  renderChatHead();
  await loadScene(id);
}

async function loadScene(id) {
  showVeil('Generating scene',
    'Rendering optical, SAR and water-index layers for both passes.');
  try {
    await prewarm(id, (frac, combo) => {
      el.progressFill.style.width = Math.round(frac * 100) + '%';
      el.veilStep.textContent = `${combo[0]} · ${combo[1]}`;
    });
    map.loadScenario(id);
    const sc = getScenario(id);
    // Flood opens on SAR, because that is the sensor the story is about.
    map.setLayer(id === 'flood' ? 'sar' : 'optical');
    map.setDate('after');
    map.setCompare(false);
    syncToolbar();
    chat.showEmptyState(sc, indexStats());
    hideVeil();
  } catch (err) {
    showError(err);
  }
}

function showVeil(title, body) {
  el.veil.hidden = false;
  el.veil.classList.remove('fading', 'veil-error');
  el.veilInner.innerHTML = `
    <div class="veil-title"></div>
    <div class="veil-body"></div>
    <div class="progress-track"><div class="progress-fill" id="progressFill"></div></div>
    <div class="veil-step" id="veilStep">&nbsp;</div>`;
  el.veilInner.querySelector('.veil-title').textContent = title;
  el.veilInner.querySelector('.veil-body').textContent = body;
  el.progressFill = el.veilInner.querySelector('#progressFill');
  el.veilStep = el.veilInner.querySelector('#veilStep');
}

function hideVeil() {
  el.veil.classList.add('fading');
  setTimeout(() => { el.veil.hidden = true; }, 380);
}

function showError(err) {
  el.veil.hidden = false;
  el.veil.classList.remove('fading');
  el.veil.classList.add('veil-error');
  el.veilInner.innerHTML = `
    <div class="veil-title">Scene could not be generated</div>
    <div class="veil-body"></div>
    <button class="veil-retry" type="button">Try again</button>`;
  el.veilInner.querySelector('.veil-body').textContent =
    String(err && err.message ? err.message : err);
  el.veilInner.querySelector('.veil-retry')
    .addEventListener('click', () => loadScene(app.scenario));
  // eslint-disable-next-line no-console
  console.error('[satquery] scene generation failed', err);
}

/* ---- the query path ------------------------------------------------------ */

async function ask(text) {
  const q = String(text || '').trim();
  if (!q || app.busy) return;

  app.busy = true;
  app.lastQuery = q;
  setBusy(true);
  el.input.value = '';

  chat.addUserMessage(q);
  map.clearEvidence();
  const turn = chat.beginAgentMessage();

  try {
    const response = await queryStream(q, { scenario: app.scenario }, (event) => {
      if (event.type === 'trace') turn.onTraceStep(event.step);
    });

    app.lastResponse = response;
    await turn.complete(response);

    // The answer moves the map: layer, date and compare first, then the
    // evidence box, so the reroute to SAR is visible before the highlight
    // lands on it.
    if (response.map_directive) {
      map.applyDirective(response.map_directive);
      syncToolbar();
      if (response.answerable && response.evidence && response.evidence.length) {
        setTimeout(() => map.showEvidence(response.evidence), 260);
      }
    }
  } catch (err) {
    turn.fail(err);
    // eslint-disable-next-line no-console
    console.error('[satquery] query failed', err);
  } finally {
    app.busy = false;
    setBusy(false);
    el.input.focus();
  }
}

function setBusy(busy) {
  el.askBtn.disabled = busy;
  voiceRecorder.setBusy(busy);
  el.askBtn.textContent = busy ? 'Working' : 'Ask';
  for (const c of el.chips.children) c.disabled = busy;
}

/* ---- events -------------------------------------------------------------- */

el.form.addEventListener('submit', (e) => {
  e.preventDefault();
  ask(el.input.value);
});

el.compareBtn.addEventListener('click', () => {
  const on = el.compareBtn.getAttribute('aria-pressed') !== 'true';
  map.setCompare(on);
  if (on) map.clearEvidence();
  syncToolbar();
});
el.vectorsBtn.addEventListener('click', () => {
  map.setVectors(el.vectorsBtn.getAttribute('aria-pressed') !== 'true');
  syncToolbar();
});
el.aoiBtn.addEventListener('click', () => {
  const on = el.aoiBtn.getAttribute('aria-pressed') !== 'true';
  if (!on) map.clearAoi();
  map.setAoiMode(on);
  syncToolbar();
});
el.zoomIn.addEventListener('click', () => map.zoomBy(1.5));
el.zoomOut.addEventListener('click', () => map.zoomBy(1 / 1.5));
el.zoomReset.addEventListener('click', () => { map.clearEvidence(); map.resetView(); });

/* Keyboard shortcuts, ignored while typing a question. */
window.addEventListener('keydown', (e) => {
  const typing = e.target === el.input || e.metaKey || e.ctrlKey || e.altKey;
  if (typing) return;
  const k = e.key.toLowerCase();
  if (k === 'c') { el.compareBtn.click(); e.preventDefault(); }
  else if (k === 'v') { el.vectorsBtn.click(); e.preventDefault(); }
  else if (k === 'a') { el.aoiBtn.click(); e.preventDefault(); }
  else if (k === '1' || k === '2' || k === '3') {
    const l = LAYERS[Number(k) - 1];
    if (l) { map.setLayer(l.id); syncToolbar(); }
    e.preventDefault();
  } else if (k === '0') { map.clearEvidence(); map.resetView(); e.preventDefault(); }
  else if (k === '+' || k === '=') { map.zoomBy(1.5); e.preventDefault(); }
  else if (k === '-') { map.zoomBy(1 / 1.5); e.preventDefault(); }
  else if (k === '/') { el.input.focus(); e.preventDefault(); }
});

/* ---- boot ---------------------------------------------------------------- */

buildScenarioNav();
buildSegs();
renderChips();
renderChatHead();
loadScene(app.scenario).then(() => el.input.focus());
