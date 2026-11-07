# Design: claims triage engine (Taktile thinc! case)

Written for: the team building and judging this prototype. All methods here are general
techniques; the code, parameters and test data are our own. No value or formula is taken from
any other team's repository.

## 1. Decision (policy v1, as written)

Rules in order, first match wins:
1. Known review trigger -> human_review
2. Missing or unknown evidence -> request_information
3. Otherwise -> routine_processing (this does not approve payment)

Blank fields are absent facts. They are never filled in.

## 2. Methods we use

### M1. Replay before release
Re-run a proposed policy version against every stored decision and list each one that changes,
with the old rule, the new rule and the facts behind the change.
- Open claims that change -> flagged `needs_recheck`.
- Closed claims -> never recomputed for the decision; the retained v1 decision is kept.
- A change that moves any claim into routine_processing requires a named sign-off before release.
- Test: a made-up v2 that changes one threshold must flip exactly the claims on either side of it.

### M2. Monotone guard
An extra check (for example a learned risk score) may only move a claim from routine to review.
It can never move a claim out of review or into routine.
- Test: for every input, guard_output is never more permissive than rule_output.

### M3. Proven vs suspicious rule health
A rule that references a retired clause or field is PROVEN_STALE and needs action now.
A rule that has not matched any claim after enough claims is only SUSPICIOUS.
Each verdict carries a reason string that names the clause or the count.
- Test: an unknown clause id is always PROVEN_STALE; zero matches on fewer claims than the
  minimum is never SUSPICIOUS.

### M4. Unknown is not "never"
When there are too few claims to judge, the verdict is UNKNOWN, not NEVER_MATCHED.
The minimum sample size is our own labelled decision, written in the design, not derived.
- Test: a rule with three claims and no match is UNKNOWN, not SUSPICIOUS.

### M5. Failure does not blame the rule
If the policy file or a lookup fails, the affected claims go to human_review with an error
message. No rule is reported as broken.
- Test: a missing policy file produces error + human_review for every claim, never a rule verdict.

### M6. Validator before upload
Before any results CSV is written or submitted, check: exact column names, no duplicate
case_id, one row per input case, every decision is one of the three allowed values, every
explanation is non-empty, and a SHA-256 checksum is saved next to the file.
- Test: a file with a missing column or a duplicate id fails the validator.

### M7. Per-claim trace
Each decision stores: case_id, policy version, rule id, facts used (with their values), blank
fields, and the explanation. The trace is written beside the results CSV.
- Test: reading the trace back reproduces the same decision (round trip).

### M8. Metrics per subgroup
Report separately: changed cases, blank-field cases, closed claims, and each rule's cases.
A good overall number cannot hide a failure in one group.
- Test: the subgroup counts add up to the total.

### M9. Measure before assuming
Before choosing how to treat blanks or thresholds, report the blank rate of every field and the
count of cases near each threshold, from our own data.
- Test: the report exists, and any field above our blank limit is listed as a risk.

### M10. Disagreement as uncertainty
Two independent implementations of the same policy are run on every case. Any disagreement
sends the claim to human_review and is shown in the output. Both implementations are written
by us from the policy text.
- Test: a deliberately broken second implementation must produce disagreements.

## 3. What we will not use

- Any other team's formula, weight, bandwidth or threshold.
- Any text copied from another repository's documentation.

## 4. Parameters (ours, to be stated in the README)

| Parameter | Value | Basis |
|---|---|---|
| Quote review limit | 1500 EUR | policy v1 |
| Minimum claims before SUSPICIOUS | to be set by us | our decision, documented |
| Blank-rate risk limit | to be set by us | our decision, documented |

## 5. Test plan

- Unit tests for each method above, using the labelled dev cases and the adversarial suite.
- Replay test with a made-up v2 (M1).
- Guard test over the synthetic set (M2).
- Validator tests with deliberately broken files (M6).
