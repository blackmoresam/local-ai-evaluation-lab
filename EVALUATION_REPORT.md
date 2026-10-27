# Evaluation closeout

**Completed:** 27 October 2026. **Scope:** local portfolio experiment on fictional telecom customer enquiries. The approved, frozen dataset contains 20 cases, four for each of Billing, Technical, Cancellation, Sales, and Other. Eight cases (13–20) are marked challenging. Its SHA-256 fingerprint is `14496946bd0c8ec549a4fe9c6e75968f8adc4bb08a0377bd7f4b5359eae96084`; all four saved runs carry that fingerprint.

## Verified evidence

| Evidence | Saved result | Interpretation |
| --- | --- | --- |
| Deterministic checks | `npm test`: 5 passed, 0 failed | Tests cover approved dataset shape and replacements, category validation, scoring, comparison, and mocked API response handling. They do not measure live model accuracy. |
| Explicit fixed mock, two runs | 16/20 in each; identical predictions despite different saved prompts | Demonstration behavior only. The prompt is ignored in mock mode. Both miss cases 13, 15, 18, and 20. |
| Real `gpt-6-luna`, Prompt A | 19/20; run `babd04a1-e939-4974-8a69-4294a4114c06` | Case 12, an accessibility-support enquiry labelled Other, was predicted Sales. |
| Real `gpt-6-luna`, Prompt B | 20/20; run `8cd314df-2d45-49d9-9df7-491071b2f752` | All 20 approved labels matched on this saved run. |

The real run comparison shows **one observed fix**: case 12 changed from Sales to Other. There were **zero observed regressions** and no other changed predictions. Prompt B gives more explicit Other examples, including accessibility support, and was informed by this same test set. There was **one real run per prompt**. These observations cannot establish that the prompt change caused the difference, that 20/20 would recur, or that the result generalizes to new customer enquiries.

## Method and boundaries

The local server used the same frozen cases and label definitions for each run, sent each message separately to the selected model with a strict five-category output schema, and saved complete predictions with prompt, mode, model, timestamp, and dataset fingerprint in `runs.json`. The interface and scoring code calculate accuracy, category recall and precision, mistakes, and a confusion matrix. The two mock runs are separate from the two real model runs; the five passing tests are a third, deterministic form of evidence.

This set is small, fictional, and reused during prompt refinement. There is no independent holdout, repeated-run variability estimate, live traffic test, or measured business impact. The saved output verifies what happened in these runs only. See the [README](README.md) for setup, architecture, and production considerations.

## Portfolio summary

Built a dependency-free local evaluation lab that freezes a balanced 20-case telecom intent dataset, tests deterministic scoring, runs explicit mock or real model classifications, preserves complete run evidence, and compares changes case by case. The completed experiment surfaced an accessibility-support misclassification in Prompt A and recorded a matching label in Prompt B, while keeping mock results and statistical limits explicit.
