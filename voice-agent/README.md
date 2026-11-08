# Aegis voice agent

The voice side of the app: who Aegis is, what it knows, and which tools it can use in the app. It runs on ElevenLabs.
The browser side is in `frontend/src/voice/`, and the engine hands the browser its call token (`voice.py`,
`GET /api/voice/token`). Nothing here is deployed: this folder is only used to create or update the agent.

## First time

1. `cd voice-agent` and `npm install`.
2. Get an ElevenLabs key into `.env`: copy `.env.example` to `.env` and paste the key (or run
   `npx -y @elevenlabs/cli@latest onboard init`). `.env` is git-ignored. Never commit it.
3. `npm run setup`. It creates the agent on ElevenLabs, saves `AGENT_ID` to `.env`, and prints which tools it has.

## Change Aegis

Edit `aegis.config.js` (personality, rules, tools, model, voice), then run `npm run setup` again. Refresh the app and
start a new call. The tools' names and parameters must match `frontend/src/voice/tools.ts` and `page-tools.ts`.

## What Aegis knows

The policy text (`knowledge/policy_v1.md`) and every case in `../labelled_development_cases.csv` and
`../unlabelled_practice_cases.csv`, with the v1 result already computed by `claims.js` and checked against the labelled
cases (setup prints the score). It uses the repo's own case files, so there is one copy of the data. While the app is
running it also reads the live state through the `get_app_context` tool.

## Run it locally

`python server.py` in the repo root and `npm run dev` in `frontend/`. The engine reads `ELEVENLABS_API_KEY` and
`AGENT_ID` from `voice-agent/.env` when they are not in the environment.

## Hosting

Set `ELEVENLABS_API_KEY` and `AGENT_ID` as variables on the Railway service. See `../DEPLOY.md`.
