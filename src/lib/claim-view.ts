// Plain-language summaries of a claim for lists and headers. Pure functions: they read the claim and
// the decision log and never change either.
import type { Claim, Flow, LogEntry } from "@/types";
import { REC_LABEL } from "@/copy";
import { fieldLabel } from "@/lib/fields";

export const FLOW_RANK: Record<Flow, number> = { red: 0, yellow: 1, green: 2 };

/** Human review first, then request information, then routine; open before closed; then by case id. */
export function byUrgency(a: Claim, b: Claim): number {
  return (
    FLOW_RANK[a.flow] - FLOW_RANK[b.flow] ||
    (a.case_status === b.case_status ? 0 : a.case_status === "open" ? -1 : 1) ||
    a.case_id.localeCompare(b.case_id)
  );
}

const caseEntries = (log: LogEntry[], caseId: string) =>
  log.filter((e) => "case_id" in e && e.case_id === caseId && e.type !== "system_decision");

export function lastOverride(log: LogEntry[], caseId: string) {
  const hits = caseEntries(log, caseId).filter((e) => e.type === "reviewer_override");
  const last = hits.at(-1);
  return last && last.type === "reviewer_override" ? last : null;
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function listOf(items: string[], max = 2): string {
  if (items.length <= max) return items.join(", ");
  return `${items.slice(0, max).join(", ")} and ${items.length - max} more`;
}

const DOC_FIELD: Record<string, string> = {
  itemized: "itemized_quote_present",
  incident_report: "incident_report_present",
};

/**
 * Facts the claimant still has to provide: blank fields, documents a rule found missing, and fields
 * the engine's explanation names as false or blank. Returned as field names, never guessed.
 */
export function missingFacts(c: Claim): string[] {
  const out = new Set<string>(c.blank_fields);
  for (const k of c.checklist) {
    if (k.result !== "true" || k.outcome !== "request_information") continue;
    const hit = Object.entries(DOC_FIELD).find(([key]) => k.id.includes(key));
    if (hit) out.add(hit[1]);
  }
  if (c.recommendation_v1 === "request_information")
    for (const m of c.explanation.matchAll(/\b([a-z]+(?:_[a-z]+)+) is (?:false|blank)/g))
      out.add(m[1]!);
  return [...out];
}

/** One short line: why the claim has its current recommendation. */
export function shortReason(c: Claim, log: LogEntry[] = []): string {
  const override = lastOverride(log, c.case_id);
  if (override && override.to_rec === c.recommendation_v1)
    return `Reviewer changed this from ${lower(REC_LABEL[override.from_rec])}`;
  const fired = c.checklist.filter((k) => k.result === "true" && k.outcome === c.recommendation_v1);
  if (c.recommendation_v1 === "human_review" && fired.length)
    return capital(
      listOf(
        fired.map((k) => lower(k.description)),
        1,
      ),
    );
  if (c.recommendation_v1 === "request_information") {
    const missing = missingFacts(c);
    if (missing.length) return `Missing: ${listOf(missing.map((f) => lower(fieldLabel(f))))}`;
    if (fired.length)
      return capital(
        listOf(
          fired.map((k) => lower(k.description)),
          1,
        ),
      );
  }
  if (c.recommendation_v1 === "routine_processing") return "No rule raised a concern";
  return c.explanation;
}

export interface NextStep {
  /** What happens next, or what already happened. */
  label: string;
  /** "done" for a recorded action, "suggested" when nothing has happened yet. */
  kind: "done" | "suggested";
  timestamp?: string;
}

/** The latest recorded step on a claim, or the suggested next step when nothing is recorded yet. */
export function nextStep(c: Claim, log: LogEntry[] = []): NextStep {
  const events: NextStep[] = [];
  for (const e of caseEntries(log, c.case_id)) {
    if (e.type === "reviewer_override")
      events.push({
        label: `Changed to ${lower(REC_LABEL[e.to_rec])}`,
        kind: "done",
        timestamp: e.timestamp,
      });
    else if (e.type === "reviewer_accept")
      events.push({ label: "Recommendation confirmed", kind: "done", timestamp: e.timestamp });
    else if (e.type === "info_request_prepared")
      events.push({ label: "Information request drafted", kind: "done", timestamp: e.timestamp });
    else if (e.type === "final_decision")
      events.push({
        label: e.note?.startsWith("Confirmation undone")
          ? "Confirmation undone"
          : "Closed after review",
        kind: "done",
        timestamp: e.timestamp,
      });
  }
  for (const a of c.activity ?? [])
    events.push({ label: a.label, kind: "done", timestamp: a.timestamp });
  events.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  const latest = events.at(-1);
  // An undone confirmation leaves the claim waiting for a decision again.
  if (latest && latest.label !== "Confirmation undone") return latest;
  if (c.case_status === "closed") return { label: "Closed", kind: "done" };
  return { label: `Suggested: ${lower(REC_LABEL[c.recommendation_v1])}`, kind: "suggested" };
}

/** The repair quote in EUR, or null when it is blank or unreadable. */
export function quoteOf(c: Claim): number | null {
  const v = c.facts["quote_eur"];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export const eur = (n: number) => `EUR ${Math.round(n).toLocaleString("en-US")}`;

/** Incident date as "24 Oct 2026", or null when the claim has none. */
export function incidentDate(c: Claim): string | null {
  const v = c.facts["incident_date"];
  if (typeof v !== "string" || !v) return null;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
