/* ---------------------------------------------------------------------------
 * ui/trace.js — the agent trace block
 *
 * Renders the pipeline steps inside an assistant turn, one at a time, as the
 * answer is produced. The steps are labelled as a simulated trace because in
 * this build there is no pipeline behind them — but the values inside each
 * step are the ones the request actually produced, including the cloud figure
 * that drives the reroute and the confidence that ends it.
 * ------------------------------------------------------------------------- */

const STATUS_NOTE = {
  reroute: 'Sensor reroute — the pass this question would normally use cannot see the ground.',
  warn: 'Below the answer threshold — the response says so rather than guessing.',
};

export function createTrace(host, { open = true } = {}) {
  const root = document.createElement('div');
  root.className = 'trace';
  root.dataset.open = String(open);

  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'trace-head';
  head.setAttribute('aria-expanded', String(open));
  head.innerHTML = `
    <span class="live-dot" aria-hidden="true"></span>
    <span>Agent trace</span>
    <span class="summary" id="traceSummary"></span>
    <span class="chev" aria-hidden="true">&#9660;</span>`;

  const body = document.createElement('div');
  body.className = 'trace-body';

  const note = document.createElement('div');
  note.className = 'trace-note';
  note.textContent = 'Simulated pipeline trace · demo build';

  head.addEventListener('click', () => {
    const next = root.dataset.open !== 'true';
    root.dataset.open = String(next);
    head.setAttribute('aria-expanded', String(next));
  });

  root.append(head, body, note);
  host.appendChild(root);

  const summary = head.querySelector('#traceSummary');
  summary.removeAttribute('id');
  const dot = head.querySelector('.live-dot');
  let count = 0;

  return {
    root,

    addStep(step) {
      count++;
      const row = document.createElement('div');
      row.className = 'trace-step';
      row.dataset.status = step.status || 'ok';
      row.innerHTML = `
        <span class="trace-n">${escapeHtml(step.n)}</span>
        <span>
          <span class="trace-title"></span>
          <div class="trace-detail"></div>
          <div class="trace-sub"></div>
        </span>`;
      row.querySelector('.trace-title').textContent = step.title;
      row.querySelector('.trace-detail').textContent = step.detail;
      row.querySelector('.trace-sub').textContent = step.sub || '';
      body.appendChild(row);
      summary.textContent = step.title.toLowerCase() + '…';
      if (STATUS_NOTE[step.status]) note.textContent = STATUS_NOTE[step.status];
      return row;
    },

    /* Called once the answer has landed: stop the live indicator and leave a
     * one-line summary so the block can be collapsed without losing the point. */
    finish(response) {
      dot.style.animation = 'none';
      dot.style.background = response.answerable ? 'var(--ok)' : 'var(--alert)';
      const rerouted = response.trace.some((s) => s.status === 'reroute');
      summary.textContent = `${count} steps · ${response.latency_ms} ms`
        + (rerouted ? ' · rerouted to SAR' : '');
      if (!STATUS_NOTE.reroute || !rerouted) {
        note.textContent = 'Simulated pipeline trace · demo build';
      }
    },

    collapse() {
      root.dataset.open = 'false';
      head.setAttribute('aria-expanded', 'false');
    },
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
