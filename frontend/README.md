# Aegis frontend (motor claims triage UI)

React + TanStack Start/Router + Tailwind + shadcn/ui. Talks to the Python JSON API in `../server.py`.
Originally generated in Lovable; still compatible with it (the default `build` is unchanged).

## Run it

```sh
cd frontend
npm install
npm run dev            # http://localhost:5173, /api/* is proxied to http://127.0.0.1:8000
```

In another terminal, start the backend from the repo root: `python server.py`.
If the backend is not running the app shows a "Demo data" banner and uses `src/data/seed.ts`.

Other backend on your network or deployed? `VITE_PROXY_TARGET=http://host:8000 npm run dev` (see `.env.example`).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with `/api` proxy |
| `npm run build:static` | Static site in `dist/client` (any static host). Use this for hosting |
| `npm run preview:static` | Serve that folder locally on :4173 with SPA fallback |
| `npm run build` | Original Lovable/Cloudflare SSR build (`.output/`) |
| `npm test` / `npm run typecheck` | Vitest / `tsc --noEmit` |

## Talking to the backend

Everything the UI sends or receives goes through **`src/data/live.ts`** (HTTP calls) and the types in
**`src/types.ts`**. To add or change an endpoint, change those two files; the rest of the app never calls `fetch`.

- Base URL: same origin `/api/...` by default. Hosted: the host rewrites `/api/*` to the backend
  (`vercel.json` / `netlify.toml`), or build with `VITE_API_BASE=https://backend.example.com`
  (backend already sends `Access-Control-Allow-Origin: *`).
- A non-JSON response counts as "backend not reachable" and drops to demo data instead of crashing.
- Endpoints used: `GET /api/cases`, `/api/policy/ui?name=v1|v2`, `/api/log`, `/api/policy/change`;
  `POST /api/override`, `/api/policy-decision`. Full list in the docstring at the top of `../server.py`.
- Recommendations are computed by the engine; `src/lib/evaluate.ts` only mirrors it for the live draft preview
  (parity is tested in `src/test/engine-parity.test.ts`).

## Hosting

`vercel.json` and `netlify.toml` are ready: connect the repo, set the root directory to `frontend`, done.
Lockfiles: `package-lock.json` (npm, used by hosts) and `bun.lock` (Lovable). Keep both when adding a dependency.

## Voice assistant (Aegis)

A **Talk to Aegis** page and a floating call button, on every page once you are signed in. The browser only
connects the microphone and gives the agent tools; the agent itself lives on ElevenLabs and is defined in
`../voice-agent/`.

- Run it: `python server.py` in the repo root (it also hands out the voice token at `/api/voice/token`) and
  `npm run dev` here. Put `ELEVENLABS_API_KEY` and `AGENT_ID` in `../voice-agent/.env` (see `../voice-agent/README.md`);
  the engine reads them from there locally and from its environment when hosted (`../DEPLOY.md`).
- Tools (`src/voice/tools.ts`, `src/voice/page-tools.ts`) must match `tools` in `../voice-agent/aegis.config.js` by name
  and parameters, then run `npm run setup` in `voice-agent/` to push the change to ElevenLabs.
- Diagrams (`src/voice/diagrams.ts`, drawn by `DiagramPanel.tsx`) are built from the live claims and rules.
- The assistant can look, navigate, open claims, draw, **draft** an override, and try what-ifs on the draft policy
  and the cost assumptions (session only). It cannot record, release, approve or sign off anything: a named person
  does that. Page access follows the signed-in role (`src/lib/roles.ts`).
