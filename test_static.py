"""The engine can serve the built app next to the API (one URL for judges): deep links load, assets are served,
a missing asset is a 404, nothing outside the app folder is ever served, the API still answers, and a foreign Host
header is refused. Real socket. Run: python test_static.py"""
import http.client
import json
import sys
import tempfile
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import server  # noqa: E402

FAILS = []


def check(name, ok, detail=""):
    print(("PASS" if ok else "FAIL") + ": " + name + ("" if ok else f"  ({detail})"))
    if not ok:
        FAILS.append(name)


with tempfile.TemporaryDirectory() as d:
    root = Path(d) / "app"
    (root / "assets").mkdir(parents=True)
    (root / "index.html").write_text("<html>INDEX</html>", encoding="utf-8")
    (root / "assets" / "a.js").write_text("console.log(1)", encoding="utf-8")
    (Path(d) / "secret.txt").write_text("SECRET", encoding="utf-8")
    server.STATIC_DIR = str(root)
    server.LOG_PATH = Path(d) / "log.ndjson"
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    def get(path, host=None):
        c = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
        c.putrequest("GET", path, skip_host=host is not None)
        if host is not None:
            c.putheader("Host", host)
        c.endheaders()
        r = c.getresponse()
        body = r.read().decode("utf-8", "replace")
        out = (r.status, body, r.getheader("Content-Type") or "")
        c.close()
        return out

    st, body, _ = get("/")
    check("the root serves the app", st == 200 and "INDEX" in body, (st, body))
    st, body, _ = get("/claims")
    check("a deep link loads the app", st == 200 and "INDEX" in body, (st, body))
    st, body, ctype = get("/assets/a.js")
    check("an asset is served with its type", st == 200 and "console.log" in body and "javascript" in ctype, (st, ctype))
    st, body, _ = get("/assets/missing.js")
    check("a missing asset is a 404, not the app page", st == 404 and "INDEX" not in body, (st, body))
    for evil in ("/../secret.txt", "/%2e%2e/secret.txt", "/assets/../../secret.txt"):
        st, body, _ = get(evil)
        check(f"{evil} never serves a file outside the app folder", "SECRET" not in body, (st, body))
    st, body, _ = get("/api/cases")
    check("the API still answers next to the app", st == 200 and isinstance(json.loads(body), (list, dict)), (st, body[:80]))
    st, _, _ = get("/", host="evil.example")
    check("a foreign Host header is refused", st == 403, st)
    httpd.shutdown()

print("ALL STATIC TESTS PASSED" if not FAILS else f"FAILED: {FAILS}")
sys.exit(1 if FAILS else 0)
