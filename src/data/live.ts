// Live adapter to the triage JSON API (server.py). Recommendations, rules and the decision log come from the
// engine; the browser only displays them and sends reviewer actions back. If the API is unreachable, the app
// stays on its seed data and says so (see store.provider.tsx).
import type {
  Claim,
  LogEntry,
  Policy,
  PolicyRule,
  Rec,
  ReviewerOverride,
  PolicyDecision,
} from "@/types";

// Base URL of the triage JSON API, no trailing slash. Default is "" = same origin, so calls go to /api/...:
//   - `npm run dev`: Vite proxies /api to the backend (VITE_PROXY_TARGET, default http://127.0.0.1:8000).
//   - hosted: the host rewrites /api/* to the deployed backend (see vercel.json / netlify.toml), or set
//     VITE_API_BASE=https://your-backend.example.com at build time to call it directly (needs CORS on the backend).
export const API_BASE: string = (
  (import.meta.env["VITE_API_BASE"] as string | undefined) ?? ""
).replace(/\/+$/, "");

export interface LiveSnapshot {
  claims: Claim[];
  v1: Policy;
  draft: Policy;
  log: LogEntry[];
  integrity: {
    intact: boolean;
    broken_at: number | null;
    reason: string | null;
    checkedAt: string;
  };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_BASE + path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new Error("The triage service is not reachable. Start server.py and reload.");
  }
  // A static host answers unknown paths (like /api/cases with no backend behind it) with the HTML shell and a 200.
  // Treat anything that is not JSON as "no backend", so the app falls back to demo data instead of crashing.
  const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
  if (!isJson) throw new Error("The triage service is not reachable. Start server.py and reload.");
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`);
  return body as T;
}

export async function fetchLive(): Promise<LiveSnapshot> {
  const [claims, v1, v2, log] = await Promise.all([
    call<Claim[]>("/api/cases"),
    call<{ version: string; hash: string; rules: PolicyRule[] }>("/api/policy/ui?name=v1"),
    call<{ version: string; hash: string; rules: PolicyRule[] }>("/api/policy/ui?name=v2"),
    call<{ intact: boolean; broken_at: number | null; reason: string | null; entries: LogEntry[] }>(
      "/api/log",
    ),
  ]);
  return {
    claims,
    v1: { version: v1.version, hash: v1.hash, author: "policy file", rules: v1.rules },
    draft: { version: v2.version, hash: v2.hash, author: "policy file", rules: v2.rules },
    log: log.entries,
    integrity: {
      intact: log.intact,
      broken_at: log.broken_at,
      reason: log.reason,
      checkedAt: new Date().toISOString(),
    },
  };
}

export interface OverrideResult {
  correction: { from: Rec; to: Rec };
  reason: string;
  reviewer: string;
  policy_version: string;
  timestamp: string;
  hash: string;
}

export function postOverride(record: Omit<ReviewerOverride, "timestamp">): Promise<OverrideResult> {
  return call<OverrideResult>("/api/override", {
    method: "POST",
    body: JSON.stringify({
      case_id: record.case_id,
      actor: record.actor,
      note: record.note,
      reason_code: record.reason_code,
      from_rec: record.from_rec,
      to_rec: record.to_rec,
      policy_version: record.policy_version,
      policy_hash: record.policy_hash,
    }),
  });
}

export function postPolicyDecision(
  record: Omit<PolicyDecision, "timestamp" | "type"> & {
    decision: "approved" | "rejected";
    proposed_by: string;
    signoff_for?: string[];
  },
) {
  return call<{ recorded: unknown }>("/api/policy-decision", {
    method: "POST",
    body: JSON.stringify(record),
  });
}

export interface EngineChange {
  open_total: number;
  open_changed: number;
  open_unchanged: number;
  closed_kept_as_v1: number;
  transitions: Record<string, number>;
  by_rule: Record<string, number>;
  flips: { case_id: string; from: Rec; to: Rec; rule_from: string; rule_to: string }[];
  into_routine: string[];
  requires_signoff: boolean;
  note: string;
}

export function fetchChange(): Promise<EngineChange> {
  return call<EngineChange>("/api/policy/change");
}
