"""Hands the browser a short-lived ElevenLabs conversation token, so the API key stays on the server.

This is the only part of the engine that talks to the internet, and only when the Talk to Aegis button is used
and a key is configured. The batch runtime (run.py), the policy engine and the checks never import it.

Settings (environment variables on Railway; locally they are read from voice-agent/.env as a fallback):
  ELEVENLABS_API_KEY   the account key. Never sent to the browser and never put in an error message.
  AGENT_ID             the Aegis agent, written by `npm run setup` in voice-agent/.
  VOICE_MAX_PER_HOUR   cap on tokens handed out per hour, whole service (default 200). A token starts a call that
                       spends credits and the engine has no login, so this keeps a leaked link from draining them.
  ELEVENLABS_API_BASE  only for tests, to point at a fake server.
"""
import json
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import deque
from pathlib import Path

ENV_FILE = Path(__file__).parent / "voice-agent" / ".env"
TIMEOUT_SECONDS = 10

_lock = threading.Lock()
_issued = deque()  # monotonic times of recent tokens


def _file_values():
    """KEY=value pairs from voice-agent/.env, for local runs. Missing file means no values."""
    out = {}
    try:
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            out[key.strip()] = value.strip().strip("'\"")
    except OSError:
        pass
    return out


def config():
    """(api_key, agent_id), each empty when not set. The environment wins over the local file."""
    file_values = None
    found = []
    for name in ("ELEVENLABS_API_KEY", "AGENT_ID"):
        value = os.environ.get(name, "").strip()
        if not value:
            file_values = file_values if file_values is not None else _file_values()
            value = file_values.get(name, "")
        found.append("" if value.startswith("your_") else value)
    return found[0], found[1]


def _over_limit():
    try:
        cap = int(os.environ.get("VOICE_MAX_PER_HOUR", "200"))
    except ValueError:
        cap = 200
    now = time.monotonic()
    with _lock:
        while _issued and now - _issued[0] > 3600:
            _issued.popleft()
        if len(_issued) >= cap:
            return True
        _issued.append(now)
        return False


def _readable(status, body, key):
    """One plain line about an ElevenLabs error. The key is removed even if ElevenLabs echoed it back."""
    detail = ""
    try:
        parsed = json.loads(body)
        d = parsed.get("detail", parsed) if isinstance(parsed, dict) else parsed
        detail = d.get("message") if isinstance(d, dict) and d.get("message") else (d if isinstance(d, str) else "")
    except (ValueError, AttributeError):
        pass
    detail = str(detail).replace(key, "[key]") if detail and key else detail
    hint = " Check ELEVENLABS_API_KEY, and that the key has ElevenLabs Agents access." if status in (401, 403) else ""
    return f"ElevenLabs answered {status}{': ' + str(detail) if detail else ''}.{hint}"


def token():
    """(status, payload) for GET /api/voice/token."""
    key, agent_id = config()
    if not key or not agent_id:
        return 503, {"error": "Voice isn't set up on this server. Set ELEVENLABS_API_KEY and AGENT_ID (see DEPLOY.md)."}
    if _over_limit():
        return 429, {"error": "Too many voice sessions started this hour. Try again later."}
    base = os.environ.get("ELEVENLABS_API_BASE", "https://api.elevenlabs.io").rstrip("/")
    url = f"{base}/v1/convai/conversation/token?{urllib.parse.urlencode({'agent_id': agent_id})}"
    request = urllib.request.Request(url, headers={"xi-api-key": key, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        return 502, {"error": _readable(err.code, err.read().decode("utf-8", "replace"), key)}
    except (urllib.error.URLError, TimeoutError, OSError):
        return 502, {"error": "Couldn't reach ElevenLabs. Check the server's internet access and try again."}
    except ValueError:
        return 502, {"error": "ElevenLabs sent a reply this server couldn't read."}
    if not isinstance(data, dict) or not isinstance(data.get("token"), str) or not data["token"]:
        return 502, {"error": "ElevenLabs didn't send a conversation token."}
    return 200, {"token": data["token"]}
