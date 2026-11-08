// A search box that understands GitHub-style qualifiers: `actor:jonas case:PRA-006 policy:v2 type:override reason words`.
// Qualifiers narrow by one field each; anything else is free text matched against the case, the person and the reason.
import type { LogEntry } from "@/types";

export interface LogQuery {
  actor?: string;
  case?: string;
  policy?: string;
  type?: string;
  text: string;
}

const QUALIFIER = /^(actor|author|case|policy|type):(.+)$/i;

export function parseLogQuery(raw: string): LogQuery {
  const out: LogQuery = { text: "" };
  const rest: string[] = [];
  for (const token of raw.trim().split(/\s+/).filter(Boolean)) {
    const m = token.match(QUALIFIER);
    if (!m) {
      rest.push(token);
      continue;
    }
    const key = m[1].toLowerCase();
    out[key === "author" ? "actor" : (key as "actor" | "case" | "policy" | "type")] = m[2].toLowerCase();
  }
  out.text = rest.join(" ").toLowerCase();
  return out;
}

const has = (haystack: string | undefined | null, needle?: string) =>
  !needle || (haystack ?? "").toLowerCase().includes(needle);

export function matchesLogQuery(e: LogEntry, q: LogQuery): boolean {
  const reason = "reason" in e ? e.reason : "note" in e ? e.note : "";
  const caseId = "case_id" in e ? (e.case_id ?? "") : "";
  if (!has(e.actor, q.actor) || !has(caseId, q.case) || !has(e.policy_version, q.policy) || !has(e.type, q.type))
    return false;
  if (!q.text) return true;
  return [caseId, e.actor, reason ?? ""].some((s) => s.toLowerCase().includes(q.text));
}
