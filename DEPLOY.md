# Deploying for judges (Railway, one URL)

The engine serves the built app and the API from one address, so judges open one link and every override is written to a real log. There is no second service to connect.

## Steps

1. In Railway, create a project and choose **Deploy from GitHub repo**. Pick this repository and the `main` branch. Railway finds the `Dockerfile` and builds the app and the engine together.
2. Add a **Volume** to the service and mount it at `/data`. The decision log lives there (`/data/decision_log.ndjson`), so it survives redeploys and restarts. Without a volume the log is lost on every redeploy.
3. Under **Settings, Networking**, click **Generate Domain**. Railway sets `RAILWAY_PUBLIC_DOMAIN` for the service; the engine accepts requests for that domain only. If the variable was missing at the first deploy, redeploy once after generating the domain.
4. Open the domain. You should see the sign-in screen. Sign in with a demo account.

No other setting is needed. `PORT` is supplied by Railway.

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
