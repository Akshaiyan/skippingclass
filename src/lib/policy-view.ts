// View helpers for the Policy change page: which rules a flip traces back to, how a rule differs from live,
// and which way a flip moves. Pure functions only; the page and its components render the results.
import type { PolicyRule, Rec } from "@/types";
import { POLICY_COPY, REC_LABEL } from "@/copy";
import { conditionFields } from "@/lib/evaluate";
import { quoteLimitOf, ruleStatus, fmtNum, removedRules } from "@/lib/report";

const SEVERITY: Record<Rec, number> = {
  routine_processing: 0,
  request_information: 1,
  human_review: 2,
};

/** True when a claim moves toward more human attention (Routine → Request information → Human review). */
export const isStricter = (from: Rec, to: Rec) => SEVERITY[to] > SEVERITY[from];

/**
 * The rule ids a flip's cause points to. A cause is either fired rule ids joined with "+", or
 * ABSENT(field,…) when a needed fact is blank; then every rule that reads one of those fields is a cause.
 */
export function causeRuleIds(cause: string, rules: PolicyRule[]): string[] {
  const absent = /^ABSENT\((.*)\)$/.exec(cause);
  if (!absent) return cause.split("+").filter(Boolean);
  const fields = absent[1]!.split(",").map((f) => f.trim());
  return rules
    .filter((r) => conditionFields(r.condition ?? null).some((f) => fields.includes(f)))
    .map((r) => r.id);
}

/** Plain-language cause: rule names, or the blank facts when the cause is ABSENT(…). */
export function causeLabel(cause: string, rules: PolicyRule[], fallback: PolicyRule[]): string {
  const absent = /^ABSENT\((.*)\)$/.exec(cause);
  if (absent) return POLICY_COPY.missingFacts(absent[1]!.split(",").join(", "));
  return cause
    .split("+")
    .filter(Boolean)
    .map(
      (id) =>
        rules.find((r) => r.id === id)?.description ||
        fallback.find((r) => r.id === id)?.description ||
        id,
    )
    .join(" + ");
}

/** A short note on what changed in a rule compared with live, e.g. "limit 1,500 → 1,200" or "was Human review". */
export function ruleChangeNote(v1: PolicyRule[], rule: PolicyRule): string | null {
  const old = v1.find((r) => r.id === rule.id);
  if (!old) return null;
  if (old.outcome !== rule.outcome) return `was ${REC_LABEL[old.outcome]}`;
  const a = quoteLimitOf([old]);
  const b = quoteLimitOf([rule]);
  if (a !== null && b !== null && a !== b) return `limit ${fmtNum(a)} → ${fmtNum(b)}`;
  if ((old.active !== false) !== (rule.active !== false))
    return rule.active === false ? "switched off" : "switched on";
  if (JSON.stringify(old.condition) !== JSON.stringify(rule.condition)) return "condition edited";
  if (old.description !== rule.description) return "renamed";
  return null;
}

/** Number of rules that differ from live: changed, added or removed (the always-on fallback excluded). */
export function changedRuleCount(v1: PolicyRule[], draft: PolicyRule[]): number {
  const touched = draft.filter((r) => ruleStatus(v1, r) !== "same").length;
  return touched + removedRules(v1, draft).length;
}
