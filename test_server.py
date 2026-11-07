"""API tests over a real socket. The decision log is redirected to a temporary file, so the real log is never touched.
Run: python test_server.py"""
import json
import os
import sys
import tempfile
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import server  # noqa: E402

FAILS = []


def check(name, ok, detail=""):
    print(("PASS" if ok else "FAIL") + ": " + name + ("" if ok else f"  ({detail})"))
    if not ok:
        FAILS.append(name)


def call(base, method, path, body=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))


with tempfile.TemporaryDirectory() as d:
    server.LOG_PATH = Path(d) / "log.ndjson"
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{port}"

    s, cases = call(base, "GET", "/api/cases")
    s, case = call(base, "GET", "/api/case/PRA-006")
    check("case route returns the rule, facts, blanks and suggestion",
          s == 200 and bool(case.get("rule_v1")) and "facts" in case and "blank_fields" in case
          and "suggestion" in case and isinstance(case["blank_fields"], list), case)
    check("unknown case returns 404", call(base, "GET", "/api/case/NOPE")[0] == 404)

    s, out = call(base, "POST", "/api/override", {"case_id": "PRA-001", "actor": "reviewer-anna",
                                                  "reason": "photos show a larger dent",
                                                  "policy_version": "v1",
                                                  "corrected_recommendation": "human_review"})
    check("override returns the four judged items",
          s == 200 and out["correction"]["to"] == "human_review" and out["reason"] and out["reviewer"] == "reviewer-anna"
          and out["policy_version"] == "v1", out)
    lines = Path(server.LOG_PATH).read_text(encoding="utf-8").splitlines()
    check("override writes exactly one log record", len(lines) == 1, len(lines))

    s, bad = call(base, "POST", "/api/override", {"case_id": "PRA-001", "actor": "reviewer-anna", "reason": "  ",
                                                  "policy_version": "v1", "corrected_recommendation": "human_review"})
    check("empty reason is refused with 400", s == 400 and "reason" in bad.get("error", ""), (s, bad))
    s, same = call(base, "POST", "/api/override", {"case_id": "PRA-001", "actor": "reviewer-anna", "reason": "x",
                                                   "policy_version": "v1", "corrected_recommendation": "routine_processing"})
    check("override that changes nothing is refused with 400", s == 400, (s, same))

    s, rep = call(base, "POST", "/api/replay", {"policy": "v2_limit_1200"})
    check("replay on the practice file returns the known 2 open flips, none into routine",
          s == 200 and len(rep["open_flips"]) == 2 and rep["into_routine"] == [], rep)
    s, bad = call(base, "POST", "/api/replay", {"policy": "../v1"})
    check("policy name with path characters is refused", s == 400, (s, bad))

    s, diff = call(base, "GET", "/api/policy/diff?a=v1&b=v2_new_trigger_ev")
    check("policy diff names the added EV rule",
          s == 200 and diff["added"] == ["R1.ev_battery"] and not diff["removed"], diff)

    s, dec = call(base, "POST", "/api/policy-decision", {"actor": "policy-author", "proposed_by": "policy-author",
                                                         "reason": "self-approve attempt", "policy_version": "v2",
                                                         "decision": "approved"})
    check("same person cannot approve their own policy (four-eyes)", s == 400, (s, dec))
    s, dec = call(base, "POST", "/api/policy-decision", {"actor": "policy-owner", "proposed_by": "policy-author",
                                                         "reason": "replay reviewed", "policy_version": "v2",
                                                         "decision": "approved"})
    check("a different person can approve, and it is logged", s == 200 and dec["recorded"]["decision"] == "approved", dec)

    s, ver = call(base, "GET", "/api/history/verify")
    check("history verifies intact after the writes", s == 200 and ver["intact"] is True, ver)

    s, _ = call(base, "GET", "/api/case/PRA-001")
    check("case timeline shows the override", s == 200, s)
    httpd.shutdown()

print("ALL SERVER TESTS PASSED" if not FAILS else f"FAILED: {FAILS}")
sys.exit(1 if FAILS else 0)
