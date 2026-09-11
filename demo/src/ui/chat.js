/* ---------------------------------------------------------------------------
 * ui/chat.js — the conversation panel
 *
 * Owns the message list, the streaming reveal of an answer, the confidence
 * readout, the evidence citation, and the provenance table that lets anyone
 * check where each number in an answer came from without reading the source.
 *
 * It holds no scripted content of its own: everything it displays arrives on
 * the response object from api/mock.js.
 * ------------------------------------------------------------------------- */

import { createTrace } from './trace.js';

const TYPE_MS_PER_CHAR = 9;      // reveal speed; word-chunked, so this is a floor

export function createChat(opts) {
  const list = document.getElementById('messages');

  function scrollToEnd(smooth = true) {
    list.scrollTo({ top: list.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  /* ---- empty state ------------------------------------------------------- */

  function showEmptyState(scenario, stats) {
    list.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'msg empty';
    el.innerHTML = `
      <h3></h3>
      <p></p>
      <p class="hint">
        Pick a starter question below, or type your own.<br>
        <kbd>C</kbd> compare &middot; <kbd>V</kbd> vectors &middot; <kbd>A</kbd> draw AOI &middot;
        <kbd>1</kbd>&ndash;<kbd>3</kbd> layer &middot; <kbd>0</kbd> reset view
      </p>`;
    el.querySelector('h3').textContent = scenario.name + ' · ' + scenario.aoi;
    el.querySelector('p').textContent = scenario.summary;
    list.appendChild(el);
  }

  /* ---- user turn --------------------------------------------------------- */

  function addUserMessage(text) {
    const el = document.createElement('div');
    el.className = 'msg msg-user';
    el.textContent = text;
    list.appendChild(el);
    scrollToEnd();
    return el;
  }

  /* ---- assistant turn ---------------------------------------------------- */

  function beginAgentMessage() {
    // Clear the empty state on the first real turn.
    const empty = list.querySelector('.empty');
    if (empty) empty.remove();

    const el = document.createElement('div');
    el.className = 'msg msg-agent';
    list.appendChild(el);

    const trace = createTrace(el, { open: true });
    const wrap = document.createElement('div');
    wrap.className = 'answer-wrap';
    el.appendChild(wrap);
    scrollToEnd();

    let stopped = false;

    return {
      root: el,

      onTraceStep(step) {
        trace.addStep(step);
        scrollToEnd();
      },

      async complete(response) {
        trace.finish(response);

        const headline = document.createElement('h3');
        headline.className = 'answer-headline' + (response.answerable ? '' : ' alert');
        headline.textContent = response.headline;
        wrap.appendChild(headline);

        const p = document.createElement('p');
        p.className = 'answer-text';
        wrap.appendChild(p);
        scrollToEnd();

        await typeInto(p, response.answer, () => stopped);

        renderConfidence(wrap, response);
        renderMeta(wrap, response);
        if (response.answerable) renderEvidence(wrap, response);
        renderActions(wrap, response);
        renderProvenance(wrap, response);

        // Collapse the trace once the answer is readable, leaving the summary.
        setTimeout(() => trace.collapse(), 900);
        scrollToEnd();
      },

      fail(err) {
        trace.finish({ answerable: false, latency_ms: 0, trace: [] });
        const card = document.createElement('div');
        card.className = 'err-card';
        card.innerHTML = `
          <h4>That query could not be completed</h4>
          <p>The scene analysis or the renderer raised an error. Nothing was lost — the map still holds the last good state.</p>
          <code></code>
          <button class="act" type="button">Retry</button>`;
        card.querySelector('code').textContent = String(err && err.message ? err.message : err);
        card.querySelector('button').addEventListener('click', () => {
          if (opts.onRetry) opts.onRetry();
        });
        wrap.appendChild(card);
        scrollToEnd();
      },

      stop() { stopped = true; },
    };
  }

  /* ---- pieces ------------------------------------------------------------ */

  function renderConfidence(wrap, r) {
    const row = document.createElement('div');
    row.className = 'confidence';
    row.innerHTML = `
      <span class="label">Confidence</span>
      <span class="conf-track"><span class="conf-fill"></span></span>
      <span class="conf-num"></span>
      <span class="conf-band"></span>`;
    const fill = row.querySelector('.conf-fill');
    fill.dataset.tone = r.confidence_band.tone;
    const num = row.querySelector('.conf-num');
    // CONTRACT.md: two decimal places displayed, four in logs.
    num.textContent = r.confidence.toFixed(2);
    num.style.color = toneColor(r.confidence_band.tone);
    row.querySelector('.conf-band').textContent = r.confidence_band.label;
    wrap.appendChild(row);
    requestAnimationFrame(() => {
      fill.style.width = Math.max(2, Math.min(100, r.confidence * 100)) + '%';
    });
  }

  function toneColor(tone) {
    return {
      high: 'var(--ok)', moderate: 'var(--cyan)',
      low: 'var(--amber)', floor: 'var(--alert)',
    }[tone] || 'var(--ink)';
  }

  function renderMeta(wrap, r) {
    const meta = document.createElement('div');
    meta.className = 'answer-meta';
    const parts = [
      ['TILE', r.tile_id],
      ['ACQUIRED', r.acquired_pretty],
      ['INTENT', r.intent],
      ['SEARCH', `${r.prefiltered_tiles}/${r.indexed_tiles} tiles`],
      ['LATENCY', r.latency_ms + ' ms'],
    ];
    meta.innerHTML = parts
      .map(([k, v]) => `<span>${k} <span class="v">${escapeHtml(String(v))}</span></span>`)
      .join('');
    wrap.appendChild(meta);
  }

  function renderEvidence(wrap, r) {
    const ev = r.evidence && r.evidence[0];
    if (!ev) return;
    const strip = document.createElement('div');
    strip.className = 'evidence-strip';
    strip.innerHTML = `
      <img class="thumb" alt="Cited evidence tile crop">
      <span class="body">
        <span class="cap">Evidence &middot; ${escapeHtml(ev.id)}</span>
        <div class="title"></div>
        <div class="note"></div>
      </span>`;
    const img = strip.querySelector('.thumb');
    img.src = r.image_url;
    img.addEventListener('click', () => opts.onViewEvidence(r));
    strip.querySelector('.title').textContent = ev.label;
    strip.querySelector('.note').textContent = ev.note;
    wrap.appendChild(strip);
  }

  function renderActions(wrap, r) {
    const row = document.createElement('div');
    row.className = 'answer-actions';

    if (r.answerable && r.evidence && r.evidence.length) {
      row.appendChild(button('View evidence on map', 'primary', '&#9678;', () => {
        opts.onViewEvidence(r);
      }));
    }
    if (r.map_directive && r.map_directive.compare) {
      row.appendChild(button('Compare passes', '', '&#8646;', () => {
        opts.onCompare(r);
      }));
    }
    if (r.all_evidence && r.all_evidence.length > 1) {
      row.appendChild(button(`All ${r.all_evidence.length} regions`, '', '&#9707;', () => {
        opts.onViewAllEvidence(r);
      }));
    }

    const provBtn = button('How this was computed', '', '&#402;', () => {
      const table = wrap.querySelector('.provenance');
      const showing = !table.hidden;
      table.hidden = showing;
      provBtn.textContent = '';
      provBtn.append(glyph('&#402;'), document.createTextNode(
        showing ? 'How this was computed' : 'Hide computation'
      ));
      if (!showing) scrollToEnd();
    });
    row.appendChild(provBtn);
    wrap.appendChild(row);
  }

  function button(text, cls, glyphHtml, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'act' + (cls ? ' ' + cls : '');
    b.append(glyph(glyphHtml), document.createTextNode(text));
    b.addEventListener('click', onClick);
    return b;
  }

  function glyph(html) {
    const s = document.createElement('span');
    s.className = 'glyph';
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = html;
    return s;
  }

  /* The provenance table is the honesty mechanism made checkable: every figure
   * quoted in the answer, with the measurement that produced it. */
  function renderProvenance(wrap, r) {
    const box = document.createElement('div');
    box.className = 'provenance';
    box.hidden = true;
    const rows = (r.provenance || []).map((p) => `
      <tr>
        <td class="f">${escapeHtml(p.field)}</td>
        <td class="v">${escapeHtml(String(p.value))}</td>
        <td>${escapeHtml(p.method)}</td>
      </tr>`).join('');
    box.innerHTML = `<table>
      <thead><tr><th>Field</th><th>Value</th><th>How it was measured</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
    wrap.appendChild(box);
  }

  /* ---- typing reveal ----------------------------------------------------- */

  /* Reveals by word rather than by character: character-by-character at a
   * readable speed is too slow to sit through, and word chunks still read as
   * generation rather than as a paste. */
  function typeInto(node, text, isStopped) {
    return new Promise((resolve) => {
      const words = text.split(/(\s+)/);
      let i = 0;
      const caret = document.createElement('span');
      caret.className = 'caret';
      node.appendChild(caret);

      function step() {
        if (isStopped && isStopped()) {
          node.textContent = text;
          return resolve();
        }
        let budget = 3;
        while (budget-- > 0 && i < words.length) {
          caret.before(document.createTextNode(words[i]));
          i++;
        }
        if (i >= words.length) {
          caret.remove();
          return resolve();
        }
        const chunk = words.slice(Math.max(0, i - 3), i).join('');
        setTimeout(step, Math.max(24, chunk.length * TYPE_MS_PER_CHAR));
      }
      setTimeout(step, 90);
    });
  }

  return { showEmptyState, addUserMessage, beginAgentMessage, scrollToEnd };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
