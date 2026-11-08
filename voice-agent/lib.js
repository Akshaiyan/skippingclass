import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ENV_PATH = new URL("./.env", import.meta.url);

/** Reads .env (values there win over the shell environment). */
export function loadEnv() {
  const fromFile = {};
  if (existsSync(ENV_PATH)) {
    for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m && m[2] !== "") fromFile[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  return { ...process.env, ...fromFile };
}

/** Sets KEY=value in .env, replacing an existing line or appending one. */
export function setEnvVar(key, value) {
  const text = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : "";
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
  const next = pattern.test(text)
    ? text.replace(pattern, line)
    : text + (text === "" || text.endsWith("\n") ? "" : "\n") + line + "\n";
  writeFileSync(ENV_PATH, next);
}

export function hasRealKey(key) {
  return Boolean(key) && !key.startsWith("your_");
}

/** Turns an ElevenLabs error response into one readable line. */
export function describeError(status, body) {
  const detail = body?.detail;
  let msg;
  if (typeof detail === "string") msg = detail;
  else if (Array.isArray(detail)) msg = detail.map((d) => `${(d.loc || []).join(".")}: ${d.msg}`).join("; ");
  else if (detail?.message) msg = detail.message;
  else msg = JSON.stringify(body);

  if (status === 401 || status === 403) {
    msg += " (check ELEVENLABS_API_KEY in .env, and that the key has ElevenLabs Agents access)";
  }
  return `${status}: ${msg}`;
}
