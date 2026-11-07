"""50 concurrent overrides and policy decisions against the threaded server on a temporary log.
Checks: chain intact, every accepted record present exactly once. Run: python test_concurrency.py"""
import concurrent.futures as cf
import json
import sys
import tempfile
import threading
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import server  # noqa: E402
import decision_log  # noqa: E402

tmp = Path(tempfile.mkdtemp()) / "log.ndjson"
server.LOG_PATH = tmp
httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
port = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{port}"

def post(path, body):
    req = urllib.request.Request(base + path, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")

cases = ["PRA-001", "PRA-002", "PRA-003", "PRA-004", "PRA-005", "PRA-006", "PRA-007", "PRA-008", "PRA-011", "PRA-012"]
jobs = []
for i in range(40):
    cid = cases[i % len(cases)]
    jobs.append(("/api/override", {"case_id": cid, "actor": f"reviewer-{i}", "note": f"stress note {i}", "reason_code": "judgement",
                                   "policy_version": "v1", "to_rec": "human_review" if i % 2 else "routine_processing"}))
for i in range(10):
    jobs.append(("/api/policy-decision", {"decision": "rejected", "actor": f"approver-{i}", "proposed_by": "proposer",
                                          "reason": f"stress {i}", "policy_version": "v2"}))
with cf.ThreadPoolExecutor(max_workers=20) as ex:
    results = list(ex.map(lambda j: post(*j), jobs))
codes = [c for c, _ in results]
expected_ok = sum(1 for c in codes if c == 200)
print(f"requests {len(jobs)}; 200s {expected_ok}; other codes {sorted(set(codes) - {200})}")
bad = decision_log.verify_chain(tmp)
entries = decision_log.DecisionLog(tmp).read()
print(f"log records {len(entries)}; chain {'intact' if bad is None else f'BROKEN at {bad}'}")
print("PASS: chain intact under concurrency" if bad is None else "FAIL: chain broken")
print("PASS: every accepted request is in the log exactly once" if len(entries) == expected_ok else f"FAIL: {len(entries)} records for {expected_ok} accepted")
httpd.shutdown()
sys.exit(0 if bad is None and len(entries) == expected_ok else 1)
