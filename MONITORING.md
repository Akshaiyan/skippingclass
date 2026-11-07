# Monitoring after deployment

Reviewer corrections and final claim outcomes arrive after the decision. This page says what we would watch, what each signal means, and what we would do. Signals marked BUILT are produced now by `monitor_report.py`. Signals marked PLANNED need data we do not yet collect.

| Signal | Status | Meaning | Threshold to act | Action |
|---|---|---|---|---|
| Overrides to routine processing (incorrect routine) | BUILT | A reviewer decided a claim routed to routine should not have been | Any in a week is reviewed the same day; a rise of 2x over the previous week | Review the rule in the override; hold any policy change that touches it |
| Overrides to human review (unnecessary review) | BUILT | A reviewer sent a routine claim to a human | Rate above 10% of routine claims in a week | Check whether a rule is too broad; check the quote and EV triggers first |
| Decision-log integrity | BUILT | The hash chain shows no edits, deletions or reordering | Any break | Stop releases; restore from the last verified copy; find the edit before anything else |
| Policy sign-offs | BUILT | Each policy release has a second person who is not the proposer | Any release without a sign-off | Refused by the server; investigate the client |
| Blank rate per field | PLANNED | Missing values in incoming claims | Above the rate seen in the development file | Raise with the source system |
| Flip volume per policy change | PLANNED as a live metric | Open claims that change under a new policy | A flip share far above the replay estimate | Re-check the replay inputs before release |
| Distribution shift (EV share, quote size) | PLANNED | Incoming claims look unlike the file the rules were tested on | Shift beyond the interval in `evaluate_v2.py` | Re-run the evaluation before trusting the rates |

## How to read the BUILT signals

Run `python monitor_report.py` against the decision log. It prints the number of overrides in each direction, the integrity result, and the policy sign-offs. It reads the log only; it never changes a decision.

A quiet week is not evidence of correctness. Overrides only happen when a reviewer disagrees, so a rule that is wrong in a way reviewers do not notice produces no signal. For that reason the blank-rate and distribution-shift signals matter, and the planned sample audit (a reviewer re-decides a random sample each month) is the only check that can see a silent error.
