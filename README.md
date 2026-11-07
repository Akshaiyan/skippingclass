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
| Document fact check (documents propose, never decide) | DEMONSTRATION | Constructed cases in `test_doc_facts.py`; no accuracy claim |
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
