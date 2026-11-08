# Deploying for judges (Railway, one URL)

The engine serves the built app and the API from one address, so judges open one link and every override is written to a real log. There is no second service to connect.

## Steps

1. In Railway, create a project and choose **Deploy from GitHub repo**. Pick this repository and the `main` branch. Railway finds the `Dockerfile` and builds the app and the engine together.
2. Add a **Volume** to the service and mount it at `/data`. The decision log lives there (`/data/decision_log.ndjson`), so it survives redeploys and restarts. Without a volume the log is lost on every redeploy.
3. Under **Settings, Networking**, click **Generate Domain**. Railway sets `RAILWAY_PUBLIC_DOMAIN` for the service; the engine accepts requests for that domain only. If the variable was missing at the first deploy, redeploy once after generating the domain.
4. Open the domain. You should see the sign-in screen. Sign in with a demo account.

No other setting is needed to run the app. `PORT` is supplied by Railway.

## Voice (Talk to Aegis)

The voice assistant runs on ElevenLabs, and the same service hands the browser its call token, so there is still one URL and no second service. It needs two variables on the Railway service (**Variables** tab). Mark the key as a secret:

| Variable | Value |
|---|---|
| `ELEVENLABS_API_KEY` | Your ElevenLabs key. It stays on the server and is never sent to the browser. |
| `AGENT_ID` | The agent's id. Run `npm run setup` in `voice-agent/` once (see its README) and copy `AGENT_ID` from `voice-agent/.env`. |

Without them the rest of the app works as before, and the Talk to Aegis button says voice isn't set up. Check it: `https://<domain>/api/voice/token` returns `{"token": ...}`, and the button on the page connects. Browsers only allow the microphone on https, which Railway gives you.

Calls spend ElevenLabs credits and the engine has no login, so anyone with the link can start one. The engine caps this at 200 sessions an hour (`VOICE_MAX_PER_HOUR`). Use a key with a spending limit for the judging link.

## Check it before sending the link

- `https://<domain>/api/history/verify` returns `{"intact": true, ...}`.
- In the app, the sidebar shows a live policy hash and the decision log page shows "Hash chain intact". If it shows "Demo data", the app is not reaching the engine.
- Make one override. It appears in the decision log with your name, the reason and the policy version. Redeploy, and it is still there.

## What it does and does not do

- The log is append-only and hash-chained, and each record is forced to disk before the reviewer is told it is saved.
- There is no login on the engine. Anyone with the link can record decisions, so use a fresh volume for the judging link, not one with records you want to keep clean.
- To start a clean log, delete `/data/decision_log.ndjson` from the volume and restart.

## Settings the engine reads

| Variable | Meaning |
|---|---|
| `PORT`, `HOST` | Where it listens. The image sets `HOST=0.0.0.0`; Railway sets `PORT`. |
| `STATIC_DIR` | The built app to serve. The image sets it to `/app/static`. |
| `DECISION_LOG` | Path of the log file. The image sets it to `/data/decision_log.ndjson`. |
| `RAILWAY_PUBLIC_DOMAIN` | Set by Railway. Used as the allowed host and origin. |
| `ALLOWED_HOST`, `ALLOWED_ORIGIN` | For any other host. See `API.md`. |
| `ELEVENLABS_API_KEY`, `AGENT_ID` | Voice only. See the Voice section above. |
| `VOICE_MAX_PER_HOUR` | Cap on voice sessions started per hour. Default 200. |
