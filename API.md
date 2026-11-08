# Engine API

The engine is a stdlib JSON server: `python server.py --port 8000`. It serves the claims, the policy versions, the decision log and the reviewer decisions. It never re-decides a claim on its own.

## Hosting: set the origin first

By default the engine listens on 127.0.0.1 only. Set `HOST=0.0.0.0` (and `PORT`) to serve others; `DEPLOY.md` shows the Railway setup, where it also serves the built app from one URL (`STATIC_DIR`) and keeps the log on a volume (`DECISION_LOG`). The engine has no authentication: anyone who can reach it can record decisions, so host it only for people you mean to give that access, or put a proxy with authentication in front of it that forwards the original `Host` and `Origin` headers.

Browser access is limited by two headers, checked on every request:

- **Origin.** Without one (curl, the judges' scripts) the request is allowed. With one, only local origins (`http://localhost:*`, `http://127.0.0.1:*`) are allowed by default. Set `ALLOWED_ORIGIN` to the app's exact origin when you host the app.
- **Host.** Must be `localhost` or `127.0.0.1` by default. Set `ALLOWED_HOST` to the public host name when hosting.

A refused request gets `403`. CORS headers only let a browser *read* a response; they do not stop a page from sending a write. The origin and host checks are what stop a page on another site from recording decisions or approving policy changes.

Writes must be sent as `application/json` (otherwise `415`).

```
ALLOWED_ORIGIN=https://your-app.example ALLOWED_HOST=engine.your-app.example python server.py --port 8000
```

## Conventions

- Bodies are JSON objects. Bodies over 64 KB, malformed bodies and fields of the wrong type get `400`. `policy_version` must be `v1` or `v2`.
- Unknown claims get `404 {"error": "unknown case"}`.
- A damaged decision log gets `503` with the line that broke and the repair command. Nothing is repaired silently.
- Every write appends one hash-chained record to `decision_log.ndjson`. Records are never edited.

## Reading

| Method and path | Returns |
|---|---|
| `GET /api/cases` | All claims with the v1 recommendation and the v1 policy hash |
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
| `POST /api/documents/check` | `case_id`, `text` (up to 20,000 characters) | Read-only. Returns the facts a document proposes (with the source line and page) and whether each agrees with the claim form, disagrees with it, or proposes a value for a blank field. Changes no field, no decision and writes no log record. |
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
