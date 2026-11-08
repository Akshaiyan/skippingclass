# Engine API

The engine is a stdlib JSON server: `python server.py --port 8000`. It serves the claims, the policy versions, the decision log and the reviewer decisions. It never re-decides a claim on its own.

## Hosting: set the origin first

CORS is open (`*`) by default so the demo runs locally. Before anyone hosts the engine, set the app's origin:

```
ALLOWED_ORIGIN=https://your-app.example python server.py --port 8000
```

The engine has no authentication. Run it only on a network you trust.

## Conventions

- Bodies are JSON objects. Bodies over 64 KB, and bodies that are not JSON objects, get `400`.
- Unknown claims get `404 {"error": "unknown case"}`.
- A damaged decision log gets `503` with the line that broke and the repair command. Nothing is repaired silently.
- Every write appends one hash-chained record to `decision_log.ndjson`. Records are never edited.

## Reading

| Method and path | Returns |
|---|---|
| `GET /api/cases` | All claims with the v1 and v2 recommendation and the policy hashes |
| `GET /api/case/<id>` | One claim: facts, blanks, v1 explanation, next-best-information suggestion, timeline |
| `GET /api/cases/<id>/memory` | The claim's reviewer decisions (newest first), the approved policy changes that moved it, and log integrity |
| `GET /api/log` | Every log entry in readable form, plus integrity |
| `GET /api/history/verify` | Whether the hash chain is intact, and where it breaks |
| `GET /api/policy/ui?name=v1\|v2` | A policy version as rules, with its hash |
| `GET /api/policy/change` | The v1 to v2 change summary: open claims that flip, grouped by transition and rule; claims that would move into routine |
| `GET /api/policy/diff?a=v1&b=v2` | Rule-level diff between two policy versions |
| `GET /api/business` | Business case results (requires `business_model.py` to have run) |

## Writing

| Method and path | Body | Effect |
|---|---|---|
| `POST /api/override` | `case_id`, `actor`, `to_rec`, `note`, `reason_code`, `policy_version` | Records one reviewer decision. Returns the correction, reviewer, reason, timestamp and hash. |
| `POST /api/replay` | `policy` | Read-only replay of a policy against the open claims. Returns the flips and the claims that would move into routine. |
| `POST /api/policy-decision` | `decision` (`approved` or `rejected`), `actor`, `proposed_by`, `policy_version`, `reason`, `signoff_for` | Records a policy decision. An approval recomputes the change server-side and refuses unless every claim moving into routine is named in `signoff_for`. |

## What a policy approval does

1. The engine recomputes the v1 to v2 change from the claims file. The client's view of the change is never trusted.
2. It records the affected claims (`from`, `to`) in the log, with the proposer and the approver.
3. It refuses the approval if a claim moves into routine without a named sign-off.
4. It does not change any claim's decision. The affected claims show as "awaiting reviewer" until a person decides them.

## Verifying the log

```
python decision_log.py verify decision_log.ndjson
python decision_log.py repair decision_log.ndjson   # only if verify reports damage
```
