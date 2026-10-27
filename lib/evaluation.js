export const CATEGORIES = Object.freeze(['Billing', 'Technical', 'Cancellation', 'Sales', 'Other']);

export function normalizeCategory(value) {
  if (typeof value !== 'string') throw new Error('Prediction must be a category string');
  const match = CATEGORIES.find(category => category.toLowerCase() === value.trim().toLowerCase());
  if (!match) throw new Error(`Invalid category: ${value}`);
  return match;
}

export function validateDataset(cases) {
  if (!Array.isArray(cases) || cases.length !== 20) throw new Error('The frozen dataset must contain exactly 20 cases');
  const ids = new Set();
  const counts = Object.fromEntries(CATEGORIES.map(category => [category, 0]));
  for (const item of cases) {
    if (!/^\d{2}$/.test(item.id) || ids.has(item.id)) throw new Error('Case IDs must be unique two-digit strings');
    if (typeof item.message !== 'string' || !item.message.trim()) throw new Error(`Case ${item.id} needs a message`);
    if (typeof item.challenging !== 'boolean') throw new Error(`Case ${item.id} needs a challenging flag`);
    if (!CATEGORIES.includes(item.expected)) throw new Error(`Case ${item.id} has an invalid expected category`);
    ids.add(item.id);
    counts[item.expected]++;
  }
  if (CATEGORIES.some(category => counts[category] !== 4)) throw new Error('Each category must have four expected cases');
  if (cases.filter(item => item.challenging).length !== 8) throw new Error('Exactly eight cases must be marked challenging');
  for (let number = 1; number <= 20; number++) {
    if (!ids.has(String(number).padStart(2, '0'))) throw new Error(`Missing case ${number}`);
  }
  return cases;
}

export function scoreRun(cases, predictions) {
  const byId = new Map(predictions.map(item => [item.id, normalizeCategory(item.category)]));
  if (byId.size !== cases.length || predictions.length !== cases.length) throw new Error('Predictions must cover each case exactly once');
  const matrix = Object.fromEntries(CATEGORIES.map(expected => [expected, Object.fromEntries(CATEGORIES.map(predicted => [predicted, 0]))]));
  const rows = cases.map(item => {
    const predicted = byId.get(item.id);
    if (!predicted) throw new Error(`Missing prediction for case ${item.id}`);
    matrix[item.expected][predicted]++;
    return { ...item, predicted, correct: predicted === item.expected };
  });
  const correct = rows.filter(row => row.correct).length;
  const categories = Object.fromEntries(CATEGORIES.map(category => {
    const truePositive = matrix[category][category];
    const expectedCount = rows.filter(row => row.expected === category).length;
    const predictedCount = rows.filter(row => row.predicted === category).length;
    return [category, {
      correct: truePositive,
      expected: expectedCount,
      predicted: predictedCount,
      recall: expectedCount ? truePositive / expectedCount : 0,
      precision: predictedCount ? truePositive / predictedCount : null
    }];
  }));
  return { correct, total: cases.length, accuracy: correct / cases.length, categories, matrix, rows, incorrect: rows.filter(row => !row.correct) };
}

export function compareRuns(cases, first, second) {
  if (first.datasetHash !== second.datasetHash) throw new Error('Runs use different datasets');
  const before = scoreRun(cases, first.predictions);
  const after = scoreRun(cases, second.predictions);
  const changes = before.rows.map((row, index) => {
    const next = after.rows[index];
    const status = !row.correct && next.correct ? 'improvement' : row.correct && !next.correct ? 'regression' : 'neither';
    return { id: row.id, message: row.message, expected: row.expected, before: row.predicted, after: next.predicted, status, predictionChanged: row.predicted !== next.predicted };
  });
  return { before, after, changes, deltaCorrect: after.correct - before.correct };
}
