"""Thin JSON API over the triage modules, for the UI team. Stdlib only. Binds to 127.0.0.1 by default.

Endpoints (see API.md):
  GET  /api/cases                 list of practice cases with v1 recommendation
  GET  /api/case/<id>             decision, rule, facts, blanks, explanation, suggestion, timeline
  POST /api/override              reviewer override; writes one log record, echoes the four judged items
  POST /api/replay                flips for a named policy in policies/
  POST /api/policy-decision       approve or reject a policy (four-eyes enforced by the log)
  GET  /api/policy/diff?a=&b=     rules added, removed, changed between two named policies
  GET  /api/history/verify        hash-chain check of the decision log
  GET  /api/business              latest business_results.json
Errors are JSON: 400 for refused input, 404 for unknown route or case.
"""
import json
import triage
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import engine  # noqa: E402
import io_csv  # noqa: E402
import policy  # noqa: E402
import suggest  # noqa: E402
import ui_view  # noqa: E402
import history  # noqa: E402
import decision_log  # noqa: E402
from decision_log import DecisionLog, verify_chain  # noqa: E402

LOG_PATH = HERE / "decision_log.ndjson"
CASES_FILE = HERE / "unlabelled_practice_cases.csv"
NAME = re.compile(r"^[A-Za-z0-9_\-]{1,40}$")
FACT_FIELDS = ["policy_active_on_incident", "claim_type", "quote_eur", "incident_report_present",
               "itemized_quote_present", "injury_reported", "liability_disputed", "duplicate_flag",
               "evidence_conflict"]


def _cases():
    rows, _ = io_csv.read_claims(CASES_FILE)
    return {r["case_id"]: r for r in rows}


def _policy(name):
    if not NAME.match(name or ""):
        raise ValueError("policy name must be letters, digits, _ or - only")
    path = HERE / "policies" / f"{name}.json"
    if not path.exists():
        raise ValueError(f"no policy named {name}")
    return policy.load(path)


def _case_view(cid):
    row = _cases().get(cid)
    if row is None:
        return None
    rec, rule, why = engine.decide(row)
    blanks = [k for k in FACT_FIELDS if (row.get(k) or "").strip() == ""]
    return {"case_id": cid, "recommendation_v1": rec, "rule_v1": rule, "explanation": why,
            "facts": {k: v for k, v in row.items() if k not in ui_view.NOT_FACTS}, "blank_fields": blanks,
            "policy_version": "v1", "suggestion": suggest.suggest(row),
            "timeline": history.timeline(cid, LOG_PATH)}


def _memory(case_id):
    """A claim's decision memory: its own corrections newest first, the policy changes that moved it, and whether the
    log is intact. Read-only. A damaged log raises LogDamaged, which the outer handler answers with 503."""
    if _cases().get(case_id) is None:
        return 404, {"error": "unknown case"}
    entries = DecisionLog(LOG_PATH).read()
    bad = verify_chain(LOG_PATH)
    decisions = [
        {"seq": i + 1, "actor": e.get("actor", ""), "from_rec": e.get("original_recommendation"),
         "to_rec": e.get("corrected_recommendation"), "reason": e.get("reason", ""), "reason_code": e.get("reason_code", ""),
         "policy_version": e.get("policy_version", ""), "timestamp": e.get("timestamp", ""), "hash": e.get("hash", "")}
        for i, e in enumerate(entries) if e.get("type") == "reviewer_override" and e.get("case_id") == case_id
    ]
    decisions.reverse()
    policy_events = []
    for i, e in enumerate(entries):
        if e.get("type") != "policy_decision" or e.get("decision") != "approved":
            continue
        for item in e.get("affected", []):
            if item.get("case_id") == case_id:
                policy_events.append({"seq": i + 1, "policy_version": e.get("policy_version", ""), "actor": e.get("actor", ""),
                                      "proposed_by": e.get("proposed_by", ""), "timestamp": e.get("timestamp", ""),
                                      "hash": e.get("hash", ""), "changed": {"from": item["from"], "to": item["to"]}})
    policy_events.reverse()
    return 200, {"case_id": case_id, "decisions": decisions, "policy_events": policy_events,
                 "integrity": {"intact": bad is None, "broken_at": None if bad is None else bad[0],
                               "reason": None if bad is None else bad[1]}}


def _handle(method, path, query, body):
    """Return (status, payload). A pure function of its inputs, so tests can call it without a socket."""
    if method == "GET" and path == "/api/cases":
        v1, v2 = policy.load(ui_view.V1_PATH), policy.load(ui_view.V2_PATH)
        return 200, ui_view.cases(CASES_FILE, v1, v2, ui_view.policy_hash(ui_view.V1_PATH), ui_view.policy_hash(ui_view.V2_PATH))
    if method == "GET" and path.startswith("/api/case/"):
        view = _case_view(path.rsplit("/", 1)[1])
        return (200, view) if view else (404, {"error": "unknown case"})
    if method == "POST" and path == "/api/override":
        cid = str(body.get("case_id", ""))
        row = _cases().get(cid)
        if row is None:
            return 404, {"error": "unknown case"}
        original = engine.decide(row)[0]
        # The app sends note / to_rec / reason_code; the original API sends reason / corrected_recommendation. Accept both.
        record = {"type": "reviewer_override", "case_id": cid, "actor": body.get("actor", ""),
                  "reason": body.get("reason") or body.get("note", ""),
                  "reason_code": body.get("reason_code", ""),
                  "policy_version": body.get("policy_version", "v1"),
                  "policy_hash": body.get("policy_hash", ""),
                  "original_recommendation": original,
                  "corrected_recommendation": body.get("corrected_recommendation") or body.get("to_rec", "")}
        log = DecisionLog(LOG_PATH)
        try:
            entry = log.append(record)
        except decision_log.LogDamaged:
            raise
        except ValueError as exc:
            return 400, {"error": str(exc)}
        return 200, {"correction": {"from": original, "to": entry["corrected_recommendation"]},
                     "reason": entry["reason"], "reviewer": entry["actor"],
                     "policy_version": entry["policy_version"], "timestamp": entry["timestamp"],
                     "hash": entry["hash"]}
    if method == "POST" and path == "/api/replay":
        try:
            new = _policy(str(body.get("policy", "")))
        except decision_log.LogDamaged:
            raise
        except ValueError as exc:
            return 400, {"error": str(exc)}
        claims = list(_cases().values())
        base = policy.load(HERE / "policies" / "v1.json")
        flips = [c["case_id"] for c in claims
                 if triage.status_of(c) != "closed"
                 and policy.decide(c, base)[0] != policy.decide(c, new)[0]]
        into = [c["case_id"] for c in claims
                if c["case_id"] in flips and policy.decide(c, new)[0] == "routine_processing"]
        return 200, {"policy": new["name"], "open_flips": flips, "into_routine": into,
                     "closed_kept_as_v1": True}
    if method == "POST" and path == "/api/policy-decision":
        # Why this gate exists (decision record):
        # Source: vendor and practitioner write-ups on champion-challenger and rule change (secondary, WebSearch 2026-11-07):
        #   a policy change that looks reasonable can cause a portfolio spike; review before release, not after.
        #   Four-eyes approval for model and policy change appears in SR 11-7 summaries (secondary, not checked against the Fed text).
        # Validation: the shipped v2 only tightens rules, so no shipped change moves a claim into routine. The gate is
        #   proved on a temporary looser policy in test_ui_view.py, and it fails when the check is removed (mutation run).
        # Rule: a release that moves any claim into routine is refused unless each such claim is named in signoff_for.
        #   The change is recomputed here, never trusted from the client.
        # Consequences: a reviewer must name every claim moving into routine before release; rejecting a change never needs
        #   a sign-off; the rule is only as good as the change summary it reads, so the summary's tests guard it.
        named = sorted(set(body.get("signoff_for") or []))
        affected = []
        if body.get("decision") == "approved":
            v1, v2 = policy.load(ui_view.V1_PATH), policy.load(ui_view.V2_PATH)
            change = ui_view.change_summary(CASES_FILE, v1, v2, ui_view.policy_hash(ui_view.V1_PATH), ui_view.policy_hash(ui_view.V2_PATH))
            missing = [c for c in change["into_routine"] if c not in named]
            affected = [{"case_id": f["case_id"], "from": f["from"], "to": f["to"]} for f in change["flips"]]
            if missing:
                return 400, {"error": "claims moving into routine need a named sign-off: " + ", ".join(missing)}
        record = {"type": "policy_decision", "actor": body.get("actor", ""), "reason": body.get("reason", ""),
                  "policy_version": body.get("policy_version", ""), "decision": body.get("decision", ""),
                  "proposed_by": body.get("proposed_by", ""), "signoff_for": named, "affected": affected}
        log = DecisionLog(LOG_PATH)
        try:
            entry = log.append(record)
        except decision_log.LogDamaged:
            raise
        except ValueError as exc:
            return 400, {"error": str(exc)}
        return 200, {"recorded": entry}
    if method == "GET" and path == "/api/policy/diff":
        try:
            a, b = _policy(query.get("a", [""])[0]), _policy(query.get("b", [""])[0])
        except decision_log.LogDamaged:
            raise
        except ValueError as exc:
            return 400, {"error": str(exc)}
        return 200, history.diff(a, b)
    if method == "GET" and path == "/api/history/verify":
        bad = verify_chain(LOG_PATH)
        return 200, {"intact": bad is None, "broken_at": None if bad is None else bad[0],
                     "reason": None if bad is None else bad[1]}
    if method == "GET" and path == "/api/business":
        p = HERE / "business_results.json"
        if not p.exists():
            return 404, {"error": "run business_model.py first"}
        return 200, json.loads(p.read_text(encoding="utf-8"))
    if method == "GET" and path == "/api/policy/change":
        v1, v2 = policy.load(ui_view.V1_PATH), policy.load(ui_view.V2_PATH)
        return 200, ui_view.change_summary(CASES_FILE, v1, v2, ui_view.policy_hash(ui_view.V1_PATH), ui_view.policy_hash(ui_view.V2_PATH))
    if method == "GET" and path.startswith("/api/cases/") and path.endswith("/memory"):
        return _memory(path[len("/api/cases/"):-len("/memory")])
    if method == "GET" and path == "/api/policy/ui":
        name = query.get("name", ["v1"])[0]
        if name not in ("v1", "v2"):
            return 400, {"error": "name must be v1 or v2"}
        src = HERE / "policies" / f"{name}.json"
        return 200, {"version": name, "hash": ui_view.policy_hash(src),
                     "rules": ui_view.to_ui_rules(policy.load(src))}
    if method == "GET" and path == "/api/log":
        bad = verify_chain(LOG_PATH)
        entries = DecisionLog(LOG_PATH).read()
        return 200, {"intact": bad is None, "broken_at": None if bad is None else bad[0],
                     "reason": None if bad is None else bad[1],
                     "entries": [ui_view.ui_log_entry(e, i + 1) for i, e in enumerate(entries)]}
    return 404, {"error": "unknown route"}


def handle(method, path, query, body):
    """A damaged decision log answers 503 with the line, instead of crashing every endpoint that reads it."""
    try:
        return _handle(method, path, query, body)
    except decision_log.LogDamaged as exc:
        return 503, {"error": str(exc), "repair": "python decision_log.py repair <log>, then verify"}


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n > 65536:
            raise ValueError("body too large")
        return json.loads(self.rfile.read(n).decode("utf-8") or "{}") if n else {}

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _dispatch(self, method):
        u = urlparse(self.path)
        try:
            body = self._body() if method == "POST" else {}
        except (ValueError, json.JSONDecodeError):
            return self._send(400, {"error": "body must be JSON"})
        if not isinstance(body, dict):
            return self._send(400, {"error": "body must be a JSON object"})
        status, payload = handle(method, u.path, parse_qs(u.query), body)
        self._send(status, payload)

    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def log_message(self, *args):
        pass


def serve(host="127.0.0.1", port=8000):
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    port = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else 8000
    print(f"serving on http://127.0.0.1:{port}")
    serve(port=port)
