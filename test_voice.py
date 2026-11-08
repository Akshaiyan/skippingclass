"""The Talk to Aegis token endpoint: the key stays on the server, a missing setup is a clear 503, upstream
failures become one readable line without the key, the hourly cap holds, and the engine never imports the
network code until voice is used. Real sockets, with a fake ElevenLabs behind it. Run: python test_voice.py"""
import http.client
import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

FAILS = []
SECRET = "sk_test_SECRET_KEY_123"


def check(name, ok, detail=""):
    print(("PASS" if ok else "FAIL") + ": " + name + ("" if ok else f"  ({detail})"))
    if not ok:
        FAILS.append(name)


# The engine must not import the network code at start-up.
import server  # noqa: E402

check("the engine does not import voice.py until voice is used", "voice" not in sys.modules)
import voice  # noqa: E402


class FakeElevenLabs(BaseHTTPRequestHandler):
    mode = "ok"
    seen = []

    def do_GET(self):
        FakeElevenLabs.seen.append((self.path, self.headers.get("xi-api-key")))
        if FakeElevenLabs.mode == "ok":
            body, status = json.dumps({"token": "tok_abc"}).encode(), 200
        elif FakeElevenLabs.mode == "unauthorized":
            body, status = json.dumps({"detail": {"message": f"invalid key {SECRET}"}}).encode(), 401
        elif FakeElevenLabs.mode == "notoken":
            body, status = json.dumps({"nope": 1}).encode(), 200
        else:
            body, status = b"<html>not json</html>", 200
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


fake = ThreadingHTTPServer(("127.0.0.1", 0), FakeElevenLabs)
threading.Thread(target=fake.serve_forever, daemon=True).start()

with tempfile.TemporaryDirectory() as d:
    server.LOG_PATH = Path(d) / "log.ndjson"
    voice.ENV_FILE = Path(d) / "no-such.env"  # keep the developer's real voice-agent/.env out of the test
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    def get(path="/api/voice/token"):
        c = http.client.HTTPConnection("127.0.0.1", port, timeout=10)
        c.request("GET", path)
        r = c.getresponse()
        body = r.read().decode("utf-8", "replace")
        c.close()
        return r.status, body

    def setup(key=SECRET, agent="agent_123", cap="200"):
        for name, value in (("ELEVENLABS_API_KEY", key), ("AGENT_ID", agent), ("VOICE_MAX_PER_HOUR", cap)):
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value
        os.environ["ELEVENLABS_API_BASE"] = f"http://127.0.0.1:{fake.server_address[1]}"
        voice._issued.clear()
        FakeElevenLabs.seen.clear()
        FakeElevenLabs.mode = "ok"

    # Not configured: a clear 503, and nothing is sent anywhere.
    setup(key=None, agent=None)
    st, body = get()
    check("without a key or agent the answer is a clear 503", st == 503 and "ELEVENLABS_API_KEY" in body and "AGENT_ID" in body, (st, body))
    check("and nothing was sent to ElevenLabs", FakeElevenLabs.seen == [])
    setup(key="your_key_here")
    check("the placeholder key from .env.example counts as not set", get()[0] == 503)

    # Configured: the token comes back, the key is sent upstream and never to the browser.
    setup()
    st, body = get()
    check("with a key and agent the browser gets a token", st == 200 and json.loads(body) == {"token": "tok_abc"}, (st, body))
    check("the agent id and key went upstream", FakeElevenLabs.seen == [("/v1/convai/conversation/token?agent_id=agent_123", SECRET)], FakeElevenLabs.seen)
    check("the key is not in the reply", SECRET not in body)

    # Upstream failures.
    FakeElevenLabs.mode = "unauthorized"
    st, body = get()
    check("a refused key becomes a readable 502", st == 502 and "401" in body and "Agents access" in body, (st, body))
    check("and the error never repeats the key, even if ElevenLabs echoed it", SECRET not in body, body)
    FakeElevenLabs.mode = "notoken"
    check("a reply with no token is a 502", get()[0] == 502)
    FakeElevenLabs.mode = "garbage"
    check("a reply that is not JSON is a 502", get()[0] == 502)
    os.environ["ELEVENLABS_API_BASE"] = "http://127.0.0.1:1"
    st, body = get()
    check("an unreachable ElevenLabs is a 502 that says so", st == 502 and "reach" in body, (st, body))

    # The hourly cap.
    setup(cap="2")
    codes = [get()[0] for _ in range(3)]
    check("the hourly cap stops a runaway client", codes == [200, 200, 429], codes)

    # Local fallback file.
    setup(key=None, agent=None)
    envfile = Path(d) / "voice.env"
    envfile.write_text(f"ELEVENLABS_API_KEY={SECRET}\nAGENT_ID='agent_file'\n# comment\n", encoding="utf-8")
    voice.ENV_FILE = envfile
    check("local runs fall back to voice-agent/.env", get()[0] == 200 and FakeElevenLabs.seen[-1][0].endswith("agent_id=agent_file"))
    os.environ["AGENT_ID"] = "agent_env"
    get()
    check("the environment wins over the file", FakeElevenLabs.seen[-1][0].endswith("agent_id=agent_env"), FakeElevenLabs.seen[-1])

    httpd.shutdown()
fake.shutdown()

print("ALL VOICE TESTS PASSED" if not FAILS else f"FAILED: {FAILS}")
sys.exit(1 if FAILS else 0)
