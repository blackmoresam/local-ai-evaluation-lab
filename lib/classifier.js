import { normalizeCategory } from './evaluation.js';

const MOCK_PREDICTIONS = Object.freeze({
  '01':'Billing', '02':'Billing', '03':'Other', '04':'Technical', '05':'Technical',
  '06':'Technical', '07':'Cancellation', '08':'Cancellation', '09':'Other', '10':'Sales',
  '11':'Sales', '12':'Other', '13':'Technical', '14':'Billing', '15':'Cancellation',
  '16':'Cancellation', '17':'Cancellation', '18':'Technical', '19':'Sales', '20':'Technical'
});

export function mockClassify(caseId) {
  const prediction = MOCK_PREDICTIONS[caseId];
  if (!prediction) throw new Error(`No mock prediction for case ${caseId}`);
  return prediction;
}

export async function realClassify(message, prompt, { apiKey, model, fetchImpl = fetch }) {
  if (!apiKey) throw new Error('OPENAI_API_KEY is missing. Choose Explicit mock mode or configure the server key.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  let response;
  try {
    response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        store: false,
        instructions: `${prompt}\n\nReturn only the category specified by the output schema. Other is for a genuine primary intent outside the four named categories, never uncertainty.`,
        input: message,
        text: { format: { type: 'json_schema', name: 'intent_classification', strict: true, schema: {
          type: 'object', additionalProperties: false,
          properties: { category: { type: 'string', enum: ['Billing', 'Technical', 'Cancellation', 'Sales', 'Other'] } },
          required: ['category']
        } } }
      })
    });
  } finally { clearTimeout(timeout); }
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(`OpenAI API ${response.status}: ${detail.error?.message || response.statusText}`);
  }
  const data = await response.json();
  const outputText = data.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text;
  if (!outputText) throw new Error(`OpenAI returned no classification (${data.status || 'unknown status'})`);
  let parsed;
  try { parsed = JSON.parse(outputText); } catch { throw new Error('OpenAI returned invalid JSON'); }
  return normalizeCategory(parsed.category);
}
