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
