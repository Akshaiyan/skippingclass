# Specs for the additions (final)

**Written for:** the frontend developer and the backend developer. These are final decisions. Each spec says what to build, what data it uses, and how to check it is done.

## Why these specs are shaped this way (from the brief)

- The reviewer must "inspect evidence, correct a recommendation and record why."
- Judges do one live override and check the correction, its reason, the reviewer and the policy version are recorded.
- The policy owner approves changes, and the system never approves or pays a claim.
- The supplied data contains no reviewer corrections, so overrides can only be tested with constructed cases.

---

## Spec A: Reviewer actions (frontend)

**Rule:** the reviewer can do two things on any case (green, yellow or red): confirm the recommendation, or override it. Overriding means choosing a different one of the three next steps and giving a reason.

| Action | Where | What it does | Logged? |
|---|---|---|---|
| Confirm recommendation | Any case | Marks the case "reviewed" in the UI workflow status | No (UI status only) |
| Override recommendation | Any case | Reviewer picks a different next step and enters a required reason | Yes, one `reviewer_override` record |
| Prepare information request | Yellow only | Shows a draft that lists the missing items from the engine's explanation. The reviewer copies and sends it outside the tool. The system never sends it. | No |

**Words:** on claim-level controls, never show "Approve", "Decline", "Pay", "Reject" or "Settle". Check whole words, case-sensitive, in UI labels only. (Policy-owner controls are covered in Spec D.)

**Acceptance**
- An override cannot be submitted without a reason and a different next step.
- After an override, the log has exactly one new record with all fields in Spec D.
- A green case shows "Routing: routine" and the two actions above, with no other buttons.

---

## Spec B: Problem statement (frontend)

**Text (verbatim, final)**
"Insurers spend reviewer time triaging claims by hand, and can't see which claims a policy change will affect until after it is live."

**Rules**
- This is the first sentence on the overview.
- No headline carries a saving figure. A saving may appear lower on the screen only with its assumptions shown beside it (from `business_results.json`, with the ASSUMED / MEASURED-PROXY labels).
- Do not write "prove", "guarantee" or "accurate". We show what a change would affect; we do not prove it safe.

**Acceptance:** the exact sentence is on the overview, and no headline contains a time or money figure.

---

## Spec C: Suggestion panel (frontend + backend)

**Where it shows:** yellow cases only. Hide it on green and red cases.

**Backend:** `suggest(row)` in `suggest.py` returns:

```json
{
  "case_id": "T",
  "current": "request_information",
  "blank_fields": ["incident_report_present", "injury_reported"],
  "decision_changing_single_answers": [
    {"field": "injury_reported", "possible_outcomes": ["human_review", "request_information"]}
  ],
  "needs_two_or_more_answers": false,
  "note": "Ask for the decision-changing field(s) first."
}
```

**Frontend behaviour (show `note` as the heading, then)**
- List each decision-changing field with a plain-language name and its possible outcomes.
- If `needs_two_or_more_answers` is true: "More than one answer is needed. Ask for the blank fields together."
- If `blank_fields` is empty: the backend note already says "No blank fields: the missing item is a document or a False value. Request it." Show it as is.
- Never call this a prediction. Show no percentages.

**Known limit (put in the panel's help text):** it covers blank fields only. A False value, such as a missing incident report, is handled by the information request.

**Acceptance:** with injury and incident report both blank, the panel lists injury and does not list the incident report alone. A yellow case with no blank fields shows the document message.

---

## Spec D: Decision log (backend + frontend)

**Rule:** every human action that changes an outcome is recorded. Nothing else changes the rules. Overrides never change the rules by themselves.

**Record 1: reviewer override** (one JSON object per line, append only)

```json
{
  "type": "reviewer_override",
  "case_id": "PRA-007",
  "actor": "reviewer name",
  "reason": "required, not empty",
  "policy_version": "v1",
  "original_recommendation": "routine_processing",
  "corrected_recommendation": "human_review",
  "timestamp": "added by the log (UTC)"
}
```

**Record 2: policy decision** (policy owner)

```json
{
  "type": "policy_decision",
  "actor": "policy owner name",
  "reason": "required, not empty",
  "policy_version": "v2",
  "decision": "approved",
  "timestamp": "added by the log (UTC)"
}
```

**Backend rules (built and tested in `decision_log.py`)**
- Append only. No update or delete.
- Refused: unknown type; missing or empty reason, actor or policy version; an override whose corrected recommendation equals the original; a recommendation outside the three allowed values; a policy decision other than `approved` or `rejected`.
- The correction is stored as `original_recommendation` and `corrected_recommendation`, because the brief requires the correction to be recorded.

**Frontend rules**
- The override button stays disabled until a different next step and a non-empty reason are entered.
- Policy-owner controls are labelled "Release v2" and "Hold v2" (not "Approve"), each with a required reason. They write a `policy_decision` record. A change that moves any claim into routine processing needs this record before release.
- Never show text that says the system learns or improves from decisions.

**Acceptance**
- After one override, the log has one new record containing the correction, the reason, the reviewer and the policy version.
- Earlier records are unchanged after a new one is written (checked by `test_all.py`).
- A record with an empty reason, or an override that changes nothing, is refused and the UI shows an error.

---

## Backend status

| Item | Status |
|---|---|
| `decision_log.py` with both record types and refusals | BUILT + TESTED (12 log tests) |
| `suggest.py` including the no-blank-fields note | BUILT + TESTED |
| Reviewer screen, suggestion panel, policy-owner controls | NOT BUILT (frontend) |
