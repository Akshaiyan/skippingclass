// Token adapter for the Aegis voice agent. The engine (server.py, voice.py) keeps the ElevenLabs API key and
// hands the browser a short-lived conversation token, so the key never reaches this app. It is the same server
// as the rest of the API, so there is nothing extra to run or host:
//   - `npm run dev`: Vite proxies /api to the engine, like every other call.
//   - hosted: the engine serves the app and /api from one URL (see ../DEPLOY.md); set ELEVENLABS_API_KEY and
//     AGENT_ID on it.
import { API_BASE } from "@/data/live";

const UNREACHABLE =
  "The voice service isn't reachable. Start the engine (python server.py) and try again.";

export async function fetchVoiceToken(): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/voice/token`, { cache: "no-store" });
  } catch {
    throw new Error(UNREACHABLE);
  }
  // A static host answers unknown paths with the HTML shell and a 200, which means no engine is behind it.
  if (!(res.headers.get("content-type") ?? "").includes("application/json"))
    throw new Error(UNREACHABLE);
  const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!res.ok || !body.token)
    throw new Error(body.error ?? `Couldn't start the voice session (${res.status}).`);
  return body.token;
}
