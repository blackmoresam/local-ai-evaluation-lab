import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CATEGORIES, normalizeCategory, validateDataset, scoreRun, compareRuns } from '../lib/evaluation.js';
import { mockClassify, realClassify } from '../lib/classifier.js';

const dataset = validateDataset(JSON.parse(await readFile(new URL('../dataset.json', import.meta.url))));

test('approved dataset has 20 fixed cases, including the approved replacements', () => {
  assert.equal(dataset.length, 20);
  assert.deepEqual(dataset.filter(item => item.challenging).map(item => item.id), ['13','14','15','16','17','18','19','20']);
  for (const category of CATEGORIES) assert.equal(dataset.filter(item => item.expected === category).length, 4);
  assert.deepEqual(['03','09','12'].map(id => dataset.find(item => item.id === id).expected), ['Other','Other','Other']);
  assert.equal(dataset.find(item => item.id === '03').message, 'How do I update the postal address associated with my customer account?');
  assert.equal(dataset.find(item => item.id === '09').message, 'Can you tell me how to submit a formal complaint about my experience in your store?');
  assert.equal(dataset.find(item => item.id === '12').message, 'What accessibility support do you provide for customers with hearing impairments?');
});

test('category mapping accepts only the five categories, never uncertainty as Other', () => {
  assert.equal(normalizeCategory(' billing '), 'Billing');
  assert.equal(normalizeCategory('OTHER'), 'Other');
  assert.throws(() => normalizeCategory('uncertain'), /Invalid category/);
  assert.throws(() => normalizeCategory(''), /Invalid category/);
});

test('scoring computes accuracy, category recall and precision, and matrix', () => {
  const predictions = dataset.map(item => ({ id: item.id, category: item.expected }));
  predictions.find(item => item.id === '13').category = 'Technical';
  predictions.find(item => item.id === '15').category = 'Billing';
  const score = scoreRun(dataset, predictions);
  assert.equal(score.correct, 18);
  assert.equal(score.accuracy, .9);
  assert.equal(score.categories.Billing.recall, .75);
  assert.equal(score.categories.Billing.precision, .75);
  assert.equal(score.matrix.Billing.Technical, 1);
  assert.equal(score.matrix.Technical.Billing, 1);
  assert.deepEqual(score.incorrect.map(row => row.id), ['13','15']);
  assert.throws(() => scoreRun(dataset, predictions.slice(1)), /exactly once/);
});

test('comparison distinguishes observed improvements, regressions and changed wrong answers', () => {
  const base = dataset.map(item => ({ id: item.id, category: item.expected }));
  const later = structuredClone(base);
  base.find(item => item.id === '13').category = 'Technical';
  later.find(item => item.id === '15').category = 'Cancellation';
  base.find(item => item.id === '20').category = 'Technical';
  later.find(item => item.id === '20').category = 'Billing';
  const comparison = compareRuns(dataset, { datasetHash:'frozen', predictions:base }, { datasetHash:'frozen', predictions:later });
  assert.equal(comparison.changes.find(row => row.id === '13').status, 'improvement');
  assert.equal(comparison.changes.find(row => row.id === '15').status, 'regression');
  assert.equal(comparison.changes.find(row => row.id === '20').status, 'neither');
  assert.equal(comparison.changes.find(row => row.id === '20').predictionChanged, true);
  assert.throws(() => compareRuns(dataset, { datasetHash:'a', predictions:base }, { datasetHash:'b', predictions:later }), /different datasets/);
});

test('mock predictions are fixed and real response mapping rejects invalid outputs', async () => {
  assert.equal(mockClassify('03'), 'Other');
  assert.equal(mockClassify('13'), 'Technical');
  let request;
  const fetchImpl = async (_url, options) => {
    request = options;
    return { ok:true, json:async () => ({ status:'completed', output:[{ content:[{ type:'output_text', text:'{"category":"Sales"}' }] }] }) };
  };
  assert.equal(await realClassify('A customer enquiry', 'Classify primary intent', { apiKey:'test-only-key', model:'test-model', fetchImpl }), 'Sales');
  const body = JSON.parse(request.body);
  assert.equal(body.store, false);
  assert.equal(body.input, 'A customer enquiry');
  assert.equal(body.text.format.schema.properties.category.enum.length, 5);
  const invalidFetch = async () => ({ ok:true, json:async () => ({ status:'completed', output:[{ content:[{ type:'output_text', text:'{"category":"uncertain"}' }] }] }) });
  await assert.rejects(realClassify('A customer enquiry', 'Classify primary intent', { apiKey:'test-only-key', model:'test-model', fetchImpl:invalidFetch }), /Invalid category/);
});
