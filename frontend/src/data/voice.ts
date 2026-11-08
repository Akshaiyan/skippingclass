// Token adapter for the Aegis voice agent. The agent's own server (elevenlabstest, `npm start`) keeps the
// ElevenLabs API key and hands the browser a short-lived conversation token; the key never reaches this app.
//   - `npm run dev`: Vite proxies /voice-api/* to that server (VITE_VOICE_PROXY_TARGET, default http://127.0.0.1:3001).
//   - hosted: set VITE_VOICE_API_BASE at build time to the deployed voice server's /api URL (it needs CORS for this origin).
export const VOICE_API_BASE: string = (
  (import.meta.env["VITE_VOICE_API_BASE"] as string | undefined) ?? "/voice-api"
).replace(/\/+$/, "");

const UNREACHABLE =
  "The voice service isn't running. In the elevenlabstest folder, run npm start, then try again.";

export async function fetchVoiceToken(): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${VOICE_API_BASE}/token`, { cache: "no-store" });
  } catch {
    throw new Error(UNREACHABLE);
  }
  // A static host answers unknown paths with the HTML shell and a 200, which means no voice server is behind it.
  if (!(res.headers.get("content-type") ?? "").includes("application/json"))
    throw new Error(UNREACHABLE);
  const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!res.ok || !body.token)
    throw new Error(body.error ?? `Couldn't start the voice session (${res.status}).`);
  return body.token;
}
