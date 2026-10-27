const DEFAULT_PROMPT = `Classify the customer's PRIMARY intent: what they are asking the company to do.

Return one category:
Billing — charges, payments, invoices, refunds.
Technical — service or equipment faults.
Cancellation — ending a service or contract.
Sales — buying, upgrading, or enquiring about products or services.
Other — a genuine primary intent outside those four categories. Never use Other just because you are uncertain.

If a message mentions several topics, focus on the requested action rather than background context.`;

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const pct = value => value == null ? '—' : `${Math.round(value * 100)}%`;
const dateLabel = value => new Date(value).toLocaleString();
let state;

async function api(url, options) {
  const response = await fetch(url, options);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function setStatus(message, working = false) {
  $('#status').textContent = message;
  $('#status').classList.toggle('working', working);
}

function selectedMode() { return document.querySelector('input[name="mode"]:checked').value; }

function updateModeNote() {
  $('#modeNote').textContent = selectedMode() === 'mock'
    ? 'EXPLICIT MOCK · Fixed demonstration predictions. The prompt is saved but does not affect mock predictions. Scores are simulated and are not model evidence.'
    : `REAL MODEL · 20 individual server-side API calls to ${state.model}. The API key never enters this page. API usage may incur charges.`;
}

function fillSelect(select, runs, placeholder) {
  const previous = select.value;
  select.replaceChildren();
  if (!runs.length) {
    const option = new Option(placeholder, '');
    select.add(option);
    return;
  }
  for (const run of runs) {
    const shortPrompt = run.prompt.replace(/\s+/g, ' ').slice(0, 38);
    select.add(new Option(`${dateLabel(run.createdAt)} · ${run.mode.toUpperCase()} · ${run.score.correct}/20 · ${shortPrompt}…`, run.id));
  }
  if (runs.some(run => run.id === previous)) select.value = previous;
}

function refreshSelectors(newRunId) {
  const runs = [...state.runs].reverse();
  fillSelect($('#runSelect'), runs, 'No runs yet');
  fillSelect($('#firstRun'), runs, 'No earlier run');
  fillSelect($('#secondRun'), runs, 'No later run');
  if (newRunId) {
    $('#runSelect').value = newRunId;
    $('#secondRun').value = newRunId;
    if (runs.length > 1) $('#firstRun').value = runs[1].id;
  } else if (runs.length > 1 && $('#firstRun').value === $('#secondRun').value) {
    $('#firstRun').value = runs[1].id;
  }
  renderSelectedRun();
}

function table(headers, rows, className = '') {
  return `<div class="table-wrap"><table class="${className}"><thead><tr>${headers.map(head => `<th>${escapeHtml(head)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

function renderSelectedRun() {
  const run = state.runs.find(item => item.id === $('#runSelect').value);
  if (!run) return;
  const score = run.score;
  const categoryRows = Object.entries(score.categories).map(([name, metric]) => `<tr><td>${name}</td><td class="metric">${metric.correct} / ${metric.expected}</td><td class="metric">${pct(metric.recall)}</td><td class="metric">${pct(metric.precision)}</td><td class="metric">${metric.predicted}</td></tr>`);
  const names = Object.keys(score.matrix);
  const matrixRows = names.map(expected => `<tr><th>${expected}</th>${names.map(predicted => `<td class="${expected === predicted ? 'diagonal' : ''}">${score.matrix[expected][predicted]}</td>`).join('')}</tr>`);
  const mistakes = score.incorrect.map(row => `<tr><td class="number">${row.id}</td><td class="message">${escapeHtml(row.message)}</td><td>${row.expected}</td><td><span class="tag bad">${row.predicted}</span></td><td>${row.challenging ? 'Challenging' : 'Straightforward'}</td></tr>`);
  $('#results').className = '';
  $('#results').innerHTML = `
    <div class="result-banner"><div class="big-score">${pct(score.accuracy)}</div><div class="score-caption">${score.correct} of ${score.total} correct<br>${escapeHtml(dateLabel(run.createdAt))}</div><span class="tag ${run.mode === 'mock' ? 'mock' : ''}">${run.mode === 'mock' ? 'EXPLICIT MOCK · SIMULATED' : 'REAL MODEL'}</span><span class="meta">${escapeHtml(run.model)}</span></div>
    <p class="fineprint">${run.mode === 'mock' ? 'These are fixed demonstration predictions. The prompt did not influence them.' : 'One model pass per case. Repeating the same prompt could produce different predictions.'} Dataset fingerprint: ${escapeHtml(run.datasetHash.slice(0, 12))}…</p>
    <details class="prompt-detail"><summary>Prompt saved with this run</summary><pre>${escapeHtml(run.prompt)}</pre></details>
    <h3 class="subheading">Category performance</h3>
    ${table(['Expected category','Correct / 4','Recall','Precision','Predicted count'], categoryRows)}
    <h3 class="subheading">Incorrect predictions (${mistakes.length})</h3>
    ${mistakes.length ? table(['Case','Customer enquiry','Expected','Predicted','Case type'], mistakes) : '<p class="fineprint">No incorrect predictions in this run.</p>'}
    <h3 class="subheading">Confusion matrix</h3><p class="fineprint">Rows are approved labels; columns are predictions. The shaded diagonal shows correct classifications.</p>
    ${table(['Expected ↓ / Predicted →', ...names], matrixRows, 'matrix')}`;
}

async function runEvaluation() {
  const button = $('#runButton');
  button.disabled = true;
  setStatus(selectedMode() === 'real' ? 'Running 20 real model classifications. This can take a few minutes…' : 'Creating an explicit mock run…', true);
  try {
    const run = await api('/api/run', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ prompt: $('#prompt').value, mode: selectedMode() }) });
    state.runs.push(run);
    refreshSelectors(run.id);
    setStatus(`Saved ${run.mode === 'mock' ? 'explicit mock' : 'real model'} run: ${run.score.correct}/20 correct.`);
    $('#resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) { setStatus(error.message); }
  finally { button.disabled = false; }
}

async function compare() {
  const first = $('#firstRun').value;
  const second = $('#secondRun').value;
  if (!first || !second || first === second) {
    $('#comparison').className = 'empty';
    $('#comparison').textContent = 'Choose two distinct saved runs.';
    return;
  }
  try {
    const result = await api(`/api/compare?first=${encodeURIComponent(first)}&second=${encodeURIComponent(second)}`);
    const earlier = state.runs.find(run => run.id === first);
    const later = state.runs.find(run => run.id === second);
    const improvements = result.changes.filter(change => change.status === 'improvement').length;
    const regressions = result.changes.filter(change => change.status === 'regression').length;
    const changed = result.changes.filter(change => change.predictionChanged);
    const rows = changed.map(change => `<tr><td class="number">${change.id}</td><td class="message">${escapeHtml(change.message)}</td><td>${change.expected}</td><td>${change.before}</td><td>${change.after}</td><td><span class="tag ${change.status === 'improvement' ? 'good' : change.status === 'regression' ? 'bad' : 'neutral'}">${change.status === 'neither' ? 'Changed; neither' : change.status}</span></td></tr>`);
    $('#comparison').className = '';
    $('#comparison').innerHTML = `<div class="comparison-summary"><strong>${result.before.correct}/20 → ${result.after.correct}/20</strong> · ${improvements} observed improvement${improvements === 1 ? '' : 's'} · ${regressions} observed regression${regressions === 1 ? '' : 's'} · ${changed.length} changed prediction${changed.length === 1 ? '' : 's'}</div>
      <p class="fineprint">Earlier: ${escapeHtml(earlier.mode.toUpperCase())} · Later: ${escapeHtml(later.mode.toUpperCase())}. A single run per prompt cannot establish that the prompt caused these changes; model variability may contribute. A higher score alone does not settle the business trade-off. ${earlier.mode === 'mock' || later.mode === 'mock' ? 'Mock predictions are fixed and ignore the prompt; comparisons involving mock runs are demonstration only.' : ''}</p>
      <details class="prompt-detail"><summary>Prompts used in this comparison</summary><p><strong>Earlier</strong></p><pre>${escapeHtml(earlier.prompt)}</pre><p><strong>Later</strong></p><pre>${escapeHtml(later.prompt)}</pre></details>
      ${changed.length ? table(['Case','Customer enquiry','Expected','Earlier','Later','Observed change'], rows) : '<p class="fineprint">No case predictions changed between these runs.</p>'}`;
  } catch (error) {
    $('#comparison').className = 'empty';
    $('#comparison').textContent = error.message;
  }
}

async function initialize() {
  $('#prompt').value = DEFAULT_PROMPT;
  try {
    state = await api('/api/state');
    $('#keyStatus').textContent = state.hasApiKey ? `API key configured · ${state.model}` : 'No server API key · mock available';
    $('#keyStatus').classList.add(state.hasApiKey ? 'ok' : 'off');
    if (!state.hasApiKey) document.querySelector('input[value="mock"]').checked = true;
    updateModeNote();
    refreshSelectors();
  } catch (error) { setStatus(error.message); }
}

document.querySelectorAll('input[name="mode"]').forEach(input => input.addEventListener('change', updateModeNote));
$('#runButton').addEventListener('click', runEvaluation);
$('#runSelect').addEventListener('change', renderSelectedRun);
$('#compareButton').addEventListener('click', compare);
initialize();
