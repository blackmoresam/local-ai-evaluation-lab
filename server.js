import http from 'node:http';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validateDataset, scoreRun, compareRuns } from './lib/evaluation.js';
import { mockClassify, realClassify } from './lib/classifier.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const datasetBytes = await readFile(path.join(root, 'dataset.json'));
const dataset = validateDataset(JSON.parse(datasetBytes));
const datasetHash = createHash('sha256').update(datasetBytes).digest('hex');
const runsPath = path.join(root, 'runs.json');
const model = process.env.OPENAI_MODEL || 'gpt-6-luna';
let busy = false;

async function loadRuns() {
  try {
    const runs = JSON.parse(await readFile(runsPath, 'utf8'));
    if (!Array.isArray(runs)) throw new Error('runs.json must contain an array');
    return runs;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function saveRuns(runs) {
  const temporary = `${runsPath}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(runs, null, 2), { flag: 'wx' });
  await rename(temporary, runsPath);
}

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 20000) throw new Error('Request is too large');
  }
  try { return JSON.parse(body); } catch { throw new Error('Invalid JSON request'); }
}

async function runEvaluation(prompt, mode) {
  const predictions = [];
  for (const item of dataset) {
    const category = mode === 'mock'
      ? mockClassify(item.id)
      : await realClassify(item.message, prompt, { apiKey: process.env.OPENAI_API_KEY, model });
    predictions.push({ id: item.id, category });
  }
  const run = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    mode,
    model: mode === 'real' ? model : 'Fixed demonstration predictions; prompt ignored',
    prompt,
    datasetHash,
    predictions
  };
  const runs = await loadRuns();
  runs.push(run);
  await saveRuns(runs);
  return { ...run, score: scoreRun(dataset, predictions) };
}

async function serveStatic(url, res) {
  const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'] };
  const entry = files[url];
  if (!entry) return json(res, 404, { error: 'Not found' });
  const contents = await readFile(path.join(root, 'public', entry[0]));
  res.writeHead(200, { 'Content-Type': `${entry[1]}; charset=utf-8`, 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'" });
  res.end(contents);
}

export function createAppServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/api/state') {
        const runs = await loadRuns();
        return json(res, 200, { dataset, datasetHash, hasApiKey: Boolean(process.env.OPENAI_API_KEY), model, runs: runs.map(run => ({ ...run, score: scoreRun(dataset, run.predictions) })) });
      }
      if (req.method === 'POST' && url.pathname === '/api/run') {
        if (busy) return json(res, 409, { error: 'An evaluation is already running' });
        if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'Expected an application/json request' });
        const { prompt, mode } = await readJson(req);
        if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 10000) return json(res, 400, { error: 'Enter a prompt of 1–10,000 characters' });
        if (!['real', 'mock'].includes(mode)) return json(res, 400, { error: 'Choose real or explicit mock mode' });
        if (mode === 'real' && !process.env.OPENAI_API_KEY) return json(res, 400, { error: 'OPENAI_API_KEY is not configured on the server' });
        busy = true;
        try { return json(res, 200, await runEvaluation(prompt.trim(), mode)); }
        finally { busy = false; }
      }
      if (req.method === 'GET' && url.pathname === '/api/compare') {
        const runs = await loadRuns();
        const first = runs.find(run => run.id === url.searchParams.get('first'));
        const second = runs.find(run => run.id === url.searchParams.get('second'));
        if (!first || !second || first.id === second.id) return json(res, 400, { error: 'Choose two distinct saved runs' });
        return json(res, 200, compareRuns(dataset, first, second));
      }
      if (req.method === 'GET') return await serveStatic(url.pathname, res);
      return json(res, 405, { error: 'Method not allowed' });
    } catch (error) {
      console.error('Request failed:', error.message);
      return json(res, 500, { error: error.message });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  createAppServer().listen(port, '127.0.0.1', () => console.log(`Evaluation Lab: http://127.0.0.1:${port}`));
}
