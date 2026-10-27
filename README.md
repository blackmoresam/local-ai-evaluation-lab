# Local AI Evaluation Lab

**Status: complete (portfolio experiment, 27 October 2026).** See [EVALUATION_REPORT.md](EVALUATION_REPORT.md) for the verified closeout.

A small local experiment for classifying 20 fictional telecom enquiries by **primary customer intent**. The approved `dataset.json` is frozen: four cases each for Billing, Technical, Cancellation, Sales, and Other; cases 13–20 are challenging. Other means a genuine intent outside the four named categories. It is never a fallback for uncertainty.

The completed real `gpt-6-luna` comparison scored 19/20 for Prompt A and 20/20 for Prompt B. Case 12 changed from Sales to its approved Other label, with zero observed regressions. These are observations from one run per prompt on a reused test set; see [EVALUATION_REPORT.md](EVALUATION_REPORT.md) for the evidence and limits.

## Run locally

Requires Node.js 20 or newer. No package installation is needed.

```powershell
npm test
npm start
```

Open <http://127.0.0.1:3000>. The server binds to your own computer only. If port 3000 is in use, set `PORT` in the shell before starting.

Without a key, the interface selects **Explicit mock**. This uses fixed demonstration predictions for all 20 cases. It saves the prompt for inspection, but the prompt does **not** affect those predictions. Mock scores and comparisons are simulated and should not be presented as real model performance.

## Use a real model

Set `OPENAI_API_KEY` in the environment of the terminal that starts the server, then run `npm start`.

Do not paste the key into the web page or save it in this repository. The browser never receives the key; only the local server sends it to the OpenAI API. The `.gitignore` excludes `.env` files and `runs.json`. You may optionally set `OPENAI_MODEL` to another Responses API model; the default is `gpt-6-luna`. Each real evaluation makes 20 individual API requests and may incur charges. An API failure stops the run and does not save a partial result. The app never silently switches to mock.

## Evaluate and compare

1. Edit the classifier prompt and choose **Real model** or **Explicit mock**.
2. Run the fixed 20 cases. Inspect overall accuracy, per-category recall and precision, incorrect predictions, and the confusion matrix.
3. Edit the prompt and run again. Choose an earlier and later saved run to inspect observed case-level improvements, regressions, and other changed predictions.

Complete runs are saved locally in `runs.json`, including prompt, mode, model, dataset fingerprint, timestamp, and predictions. The same frozen dataset is used each time. The saved file may contain the prompts you wrote, so handle it accordingly. A single run per prompt cannot rule out model variability; case-level changes are observations, not proven prompt effects. A higher overall score alone does not establish a better business outcome.

## Scope

One dependency-free Node server, one static web page, one frozen JSON dataset, and deterministic tests. No accounts, database, cloud deployment, or background services.

## Architecture

- `dataset.json` holds the approved labels; `lib/evaluation.js` validates balance and IDs, scores accuracy, category recall and precision, and compares case-level predictions.
- `server.js` binds to `127.0.0.1`, fingerprints the dataset with SHA-256, exposes the local API, and saves only complete runs with a temporary file and rename.
- `lib/classifier.js` supplies fixed mock predictions or makes 20 sequential server-side OpenAI Responses API calls with a strict five-category output schema and `store: false`.
- `public/` presents the run controls, saved prompts, results, mistakes, confusion matrix, and comparison. `test/evaluation.test.js` has five deterministic tests; it does not call the live model.

## Limits and production considerations

This is a completed portfolio experiment, not a deployed classifier. Prompt B was informed by the same small, fictional test set, and each prompt had one real run. The observed 20/20 is not an independent holdout result, a repeatability estimate, or a measured business outcome.

Before production use, define routing costs and review procedures; obtain representative, permissioned examples and adjudicated labels; reserve a separate holdout set; repeat runs to measure variability; assess category-specific harms and drift; and add authentication, key management, privacy and retention rules, rate and cost controls, failure handling, and monitoring. The local server has no user authentication or deployment safeguards.
