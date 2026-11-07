"""API abuse: oversized bodies, malformed JSON, wrong types, unknown cases, path tricks in policy names, repeated
approvals, same-person approval, missing fields. Uses a temporary log only. Run: python test_api_abuse.py"""
import json
import socket
import sys
import tempfile
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).parent))
import decision_log as dl  # noqa: E402
import server  # noqa: E402

FAILS = []


def check(name, ok, detail=""):
    print(("PASS" if ok else "FAIL") + ": " + name + ("" if ok else f"  ({detail})"))
    if not ok:
        FAILS.append(name)


server.LOG_PATH = Path(tempfile.mkdtemp()) / "log.ndjson"
OVERRIDE = {"case_id": "PRA-001", "actor": "Jonas Weber", "note": "checked", "to_rec": "human_review", "policy_version": "v1"}

# Wrong types and missing fields reach the handler as-is; they must be refused, not recorded.
for name, body in [
    ("case_id as a list", {**OVERRIDE, "case_id": ["PRA-001"]}),
    ("to_rec not a recommendation", {**OVERRIDE, "to_rec": "approve_payment"}),
    ("empty actor", {**OVERRIDE, "actor": "   "}),
    ("missing note and reason", {k: v for k, v in OVERRIDE.items() if k != "note"}),
    ("unchanged recommendation", {**OVERRIDE, "to_rec": "human_review", "case_id": "PRA-007"}),
]:
    st, out = server.handle("POST", "/api/override", {}, body)
    check(f"override refused: {name}", st in (400, 404), (st, out))

st, out = server.handle("POST", "/api/override", {}, {**OVERRIDE, "case_id": "NOPE"})
check("override for an unknown case answers 404 JSON", st == 404 and "error" in out, (st, out))

# Path tricks in policy names: only letters, digits, underscore and hyphen, and only existing policies
for name in ["../policies/v1", "..\policies\v1", "v1/../../x", "", "v1.json", "a" * 60]:
    st, out = server.handle("GET", "/api/policy/diff", {"a": [name], "b": ["v1"]}, {})
    check(f"policy name refused: {name!r}", st == 400 and "error" in out, (st, out))
st, out = server.handle("POST", "/api/replay", {}, {"policy": "../../etc/passwd"})
check("replay refuses a path outside the policies folder", st == 400, (st, out))

# Approval rules: four-eyes and repeated decisions
st, out = server.handle("POST", "/api/policy-decision", {}, {"decision": "approved", "actor": "Lena", "proposed_by": "Lena",
                                                              "reason": "self", "policy_version": "v2"})
check("same person cannot approve their own change", st == 400 and "four-eyes" in out.get("error", ""), (st, out))
st, out = server.handle("POST", "/api/policy-decision", {}, {"decision": "maybe", "actor": "Jonas", "proposed_by": "Lena",
                                                              "reason": "x", "policy_version": "v2"})
check("a decision other than approved or rejected is refused", st == 400, (st, out))
st, out = server.handle("POST", "/api/policy-decision", {}, {"decision": "approved", "actor": "Jonas", "proposed_by": "",
                                                              "reason": "x", "policy_version": "v2"})
check("an approval with no proposer is refused", st == 400, (st, out))
for _ in range(3):
    st, out = server.handle("POST", "/api/policy-decision", {}, {"decision": "rejected", "actor": "Jonas", "proposed_by": "Lena",
                                                                  "reason": "again", "policy_version": "v2"})
check("repeated rejections are each recorded, not merged", st == 200 and len(dl.DecisionLog(server.LOG_PATH).read()) >= 3)

# Unknown routes and methods
st, out = server.handle("DELETE", "/api/cases", {}, {})
check("an unknown method answers 404 JSON", st == 404 and "error" in out, (st, out))
st, out = server.handle("GET", "/api/does-not-exist", {}, {})
check("an unknown route answers 404 JSON", st == 404 and "error" in out, (st, out))

# Real socket: oversized body, malformed JSON, and a body that is not an object
httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
port = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{port}"


def post_raw(path, data):
    req = Request(base + path, data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read())
    except HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


st, out = post_raw("/api/override", b"x" * 70000)
check("a body over 64 KB is refused with JSON", st == 400 and "error" in out, (st, out))
st, out = post_raw("/api/override", b"{not json")
check("malformed JSON is refused with JSON", st == 400 and "error" in out, (st, out))
st, out = post_raw("/api/override", b"[1, 2, 3]")
check("a JSON list instead of an object is refused, not a crash", st in (400, 500) and "error" in out, (st, out))
httpd.shutdown()

print("ALL API ABUSE TESTS PASSED" if not FAILS else f"FAILED: {FAILS}")
sys.exit(1 if FAILS else 0)
