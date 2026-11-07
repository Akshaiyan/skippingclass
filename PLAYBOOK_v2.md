# Playbook: applying a policy change (v2) in under one hour

Written for the team member who runs the change. The policy is a data file; no code changes are needed for a change expressible with the supported operators.

## Supported operators (policies/TEMPLATE.json shows the format)
is_true, is_false, eq, ne, gt, gte, lt, lte, blank, in, not_in, gt_field, lt_field.
Outcomes: human_review, request_information, routine_processing. Rules are checked in order; the first trigger that fires wins.
If a change needs something not in this list (a date window, a percentage), stop and ask the author: adding an operator is a code change and needs the full test run.

## Steps
1. **Read the notice and write it down as rules.** One rule per sentence. Note the rule's outcome and the fields it reads. Anything ambiguous: ask the policy owner before writing it.
2. **Copy the template.** `copy policies\TEMPLATE.json policies\v2.json`. Set `name`. Add or edit `review_triggers` in the order the notice gives.
3. **Validate the file.** `python -c "import policy; policy.load('policies/v2.json'); print('valid')"`. A refusal names the defect: fix and repeat.
4. **Replay on both data sets.** `python compare_policies.py` (add the new file to its list), then `python run.py unlabelled_practice_cases.csv out.csv --policy policies/v2.json`. Record: open flips, claims moving into routine, closed claims (kept as v1 by design).
5. **Read every flip.** Each flip names the rule that changed it (`rule_v2`). Check that each flip is explained by a changed rule (the attribution check). Any flip not explained is a defect in the file, not a surprise to accept.
6. **Name any move into routine.** These need the second, named sign-off in step 8. If there are none, say so.
7. **Second person reviews.** A different person from the author reads the file, the flip list and the notice. They confirm the rules say what the notice says.
8. **Record the decision.** Through the decision log: `policy_decision`, `decision` = approved or rejected, `actor` (approver), `proposed_by` (author), `policy_version`, and a reason. The approver must differ from the author, or the log refuses the record.
9. **Rerun the judges' command.** `python run_checks.py` must pass before anything is shown.
10. **Update the README policy table** and the business figures (`python business_model.py --policy policies/v2.json` once item 5 is built).

## Rollback
Re-run with the previous file: `python run.py ... --policy policies/v1.json`. The decision log keeps every decision; a rollback is a new `policy_decision` (rejected), never an edit of history.

## Known ceilings
- Closed claims are never recomputed. A change that should affect closed claims needs a separate decision, stated in the reason.
- The replay uses stored claim fields. Anything the policy reads that the claim file does not carry shows as blank (absent), never guessed.
