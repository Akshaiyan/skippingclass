# Taktile claims triage: submission

**Read this first.** One command runs every check: `python run_checks.py`. It exits 0 only if all of them pass.

## Run it (judges)

```
python run_checks.py                                  # every check
python run.py <claims.csv> results.csv --policy policies/v2.json   # your file, v2
```

The results file has the columns the policy document names: `case_id, recommendation_v1, recommendation_v2, needs_recheck, rule_v1, rule_v2, explanation`. Rows that could not be read are listed as QUARANTINED with their line and field, and decided as request information, never guessed.

The batch runtime (`run.py`) and the checks make no web calls. The one exception is the optional voice token endpoint in `server.py`, which contacts ElevenLabs only when the Talk to Aegis button is used and a key is configured (`voice.py`). It needs Python 3.10 or newer and the standard library only.

## Walkthrough

`docs/walkthrough/index.html` shows five captioned screenshots of the running app: the dashboard, the claims queue, a claim with its decision memory, the decision log, and the policy change screen. It works without the hosted app. The app itself is in `frontend/`, the engine contract is in `API.md`, and `DEPLOY.md` shows how to host the app and the engine behind one URL (Railway) with a log that survives redeploys.

## Criteria map

| Judged criterion | Where the evidence is | What it shows | What it does not show |
|---|---|---|---|
| Accurate results for most claims | `quality_metrics.py`, `test_v2.py`, `exhaustive_shapes.py` | v1 agrees with the 14 organiser labels (14 of 14, precision and recall 1.0; with only 14 cases the 95% lower bound on accuracy is 78%, so this shows no error found, not high accuracy). v2 agrees with our reading of the change notice on 118,098 field combinations. | Accuracy on the hidden cases. Hidden results come from the judges. |
| Human in the loop for complicated cases | `server.py` (overrides, four-eyes sign-off), `test_ui_view.py`, the reviewer screen | Every review case goes to a person. Overrides need a name and a reason. A policy release that moves a claim into routine needs a named second person. | That reviewers decide well. We have no reviewer data yet. |
| Measuring the quality of what happens | `quality_report.py`, `quality_metrics.py`, `MONITORING.md`, `monitor_report.py` | Changed claims, incorrect-routine and unnecessary-review counts, precision, recall and F1 per class, and the signals to watch after deployment. | Post-deployment results. Those need real outcomes. |
| A solid business case | `BUSINESS_CASE.md`, `business_model.py`, `assumptions.json` | Annual triage costs EUR 180,000 today and EUR 63,750 with the system, a year-1 net benefit of EUR 56,250 and payback in 6.2 months on the practice mix (EUR 34,801 and 7.6 months on the synthetic mix; it pays back only if more than 36.4% of claims are routine). A policy change costs about EUR 78,750 to re-review by hand and about EUR 12,423 with the system. A wrong routine decision costs about 240 times an unnecessary escalation, so a claim goes to a person above a 0.41% chance of error, and the net benefit is used up if more than 0.24% of routine decisions are wrong. Every input is labelled ASSUMED or MEASURED-PROXY. | Real handling times, real claim volume, or a measured wrong-routine rate on real claims. |
| Design prize (UI, design, message) | `frontend/` (team app), `reviewer.html` (fallback) | One clear recommendation per claim with its rule, facts, blanks and next step; decision memory per claim; a policy-change check before release. | A user study. |

## Honest limits

- No independent labels beyond the 14 organiser cases. The 12 practice claims have a reviewer check by a non-expert and two model checks, all on the same source text.
- A blank repair type and a blank or unknown case status both ask for information. The organiser has not confirmed this.
- An unquoted comma that leaves the cell count unchanged cannot be detected without guessing. The advice to the organiser is to quote commas in claim summaries.
- The decision log is protected against tampering and torn writes within one server process. Several processes writing one log file need a file lock, which is not built.

## Questions for the organiser

1. Should a blank repair type request information under v1 as well as v2?
2. Should a negative or non-numeric quote be unreadable (our reading) or refuse the file?
3. Are claim summaries allowed to contain commas, and should they be quoted?
4. Does the change notice move the v1 threshold from 1,500 to 1,200, or only add a trigger? We read it as moving the threshold.


---

# Taktile claims triage: thinc! Munich submission

A rules-based triage prototype for motor claims. It recommends one of three next steps
(routine processing, request information, human review) and shows the rule, facts and policy
version behind each one.

## Status (evidence labels)

| Part | Status | Evidence |
|---|---|---|
| Rules engine, policy v1 | BUILT + TESTED | Matches the case-file labels on 14 of 14 dev cases; matches the written-policy oracle on 10,000 synthetic and 137 adversarial claims (consistency, not accuracy) |
| Batch command `run.py` | BUILT + TESTED | Runs on the practice file; output passes the validator |
| Output validator | BUILT + TESTED | Catches 5 defect types |
| Per-claim trace | BUILT + TESTED | Decision recomputes from stored facts |
| Policy-change replay | BUILT + TESTED | Never changes a closed claim; flips listed; moves into routine flagged for sign-off |
| Decision log (append-only) | BUILT + TESTED | Refuses invalid entries; never rewrites earlier ones |
| Release gate for routine processing | BUILT + TESTED | Closed until 149 clean audits; any error resets the count |
| Override report | BUILT + TESTED | Never shows override rate without the audit result |
| Business case model | BUILT (inputs ASSUMED) | Headline figures depend on labelled assumptions in `data/assumptions.json` |
| Reviewer screen | NOT BUILT | Owned by the UI/UX teammate |

## Not claimed

- Accuracy on real claims or on the hidden judging set. Not measured.
- That the synthetic results show correctness. Those labels come from the same policy text.
- That the replay idea is new. Replay before rollout is established practice.

## Run

    python test_all.py
    python test_release_gate.py
    python run.py unlabelled_practice_cases.csv practice_results.csv --trace practice_trace.jsonl

## Layout

Flat, so the tests run as-is. Policy and case data: `labelled_development_cases.csv`,
`unlabelled_practice_cases.csv`, `adversarial_claims.csv`. The synthetic file `final_synthetic_10k.csv` is not shipped:
`run_checks.py` regenerates it first with `gen_synthetic.py` (10,000 claims, seed 1).
Design: `DESIGN.md`. Architecture for the team: `Taktile_Architecture.pdf`.

## Constraints

No code copied from any other repository. No organiser data beyond the 14 dev cases.

## Added since the first version (evidence labels)

| Part | Status | Evidence |
|---|---|---|
| Policy as data (`policies/*.json`, operators incl. list and cross-field) | BUILT + TESTED | Matches the engine on 10,163 rows; bad policies refused at load |
| Unknown CSV columns kept and passed to the policy | BUILT + TESTED | Test in `test_policy.py` |
| Four-eyes release (approver must differ from proposer) | BUILT + TESTED | Log refuses same-person approval |
| Hash-chained decision log, tamper detection, policy diff | BUILT + TESTED | `test_history.py` pinpoints an edited line |
| JSON API for the UI (`server.py`, contract in `API.md`) | BUILT + TESTED | Real-socket tests in `test_server.py`; malformed input returns 400 |
| Document check (documents propose, never decide) | BUILT + TESTED, narrow | Paste a document's text on a claim: it proposes the labelled quote total with the exact source line and flags a disagreement with the claim form for a person. Read-only: no field, decision or log record changes. `test_doc_facts.py`, `test_documents_api.py`. It reads labelled lines only, so no accuracy claim on real documents |
| Business saving per policy change (`business_model.py --policy`) | BUILT (inputs ASSUMED) | EUR 69,722 for the EUR 1,200 test change, from the seeded generator (seed 1); synthetic data is regenerated, not shipped |
| Policy v2 from the change notice (limit EUR 1,200, EV battery trigger) | BUILT + TESTED | `test_v2.py`: 118,098 field combinations against a separate oracle, boundary cases, closed claims kept |
| Before-and-after quality report for the change | BUILT + TESTED | `quality_report.py`: fixed, worsened and still-wrong counts for open claims; agreement is with the notice, not with hidden labels |
| Evaluation practice: stratified split, Wilson and bootstrap intervals, leakage and shift checks | BUILT | `evaluate_v2.py`; the split is a consistency check because the rules are not fitted; no accuracy claim |
| Model-labelled checks on the 12 practice claims (Claude and gpt-oss-120b, policy text only) | MODEL-LABELLED, same source text, not human, not independent | Both agree with the engine's v1 recommendation on 12 of 12, and with each other on 12 of 12; too few cases for a kappa; no human labeller yet |
| Blinded labelling and agreement statistics | BUILT, awaiting a labeller | `agreement.py`, `test_agreement.py`; no numbers yet |
| Exhaustive check of 87,480 allowed field combinations | BUILT + TESTED | Engine agrees with the written-policy oracle on all |
| Mutation checks on new code | DONE | Each deliberate break is caught by a test |

Judges' command: `python run_checks.py` (runs every test and batch check; exit 0 only if all pass).
Playbook for the policy change: `PLAYBOOK_v2.md`. Blank policy template: `policies/TEMPLATE.json`.
The learned guard is not used: F1, cross-validation, distribution shift, learning curve and label noise were all measured, and the rules decide.
