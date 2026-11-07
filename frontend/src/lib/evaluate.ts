// Pure three-valued evaluator. The backend replaces this later; keep it side-effect free.
import type { Condition, Operand, PolicyRule, Rec, RuleCheck, Tri } from "@/types";
import { REC_LABEL } from "@/copy";

export type Facts = Record<string, string | number | boolean | null | undefined>;

export interface Evaluation {
  recommendation: Rec;
  rule: string;
  checklist: RuleCheck[];
  explanation: string;
  absentFields: string[];
}

const isBlank = (v: unknown) => v === null || v === undefined || v === "";

const fmt = (v: unknown) => (typeof v === "number" ? String(v) : Array.isArray(v) ? `[${v.join(",")}]` : String(v));
const OP_SYM: Record<string, string> = {
  eq: "=",
  neq: "≠",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  in: "in",
  not_in: "not in",
  before: "before",
  after: "after",
};

interface LeafOut {
  result: Tri;
  evidence: string[];
  blanks: string[];
}

function cmp(op: string, l: unknown, r: unknown): boolean {
  switch (op) {
    case "eq":
      return l === r;
    case "neq":
      return l !== r;
    case "gt":
      return Number(l) > Number(r);
    case "gte":
      return Number(l) >= Number(r);
    case "lt":
      return Number(l) < Number(r);
    case "lte":
      return Number(l) <= Number(r);
    case "in":
      return Array.isArray(r) && r.includes(String(l));
    case "not_in":
      return Array.isArray(r) && !r.includes(String(l));
    case "before":
      return String(l) < String(r);
    case "after":
      return String(l) > String(r);
  }
  return false;
}

function resolveRight(right: Operand | undefined, facts: Facts): { value: unknown; label: string; blank?: string } {
  if (!right) return { value: undefined, label: "" };
  if (right.kind === "value") return { value: right.value, label: fmt(right.value) };
  const raw = facts[right.field];
  if (isBlank(raw)) return { value: null, label: right.field, blank: right.field };
  const factor = right.factor ?? 1;
  if (factor !== 1 && typeof raw === "number") {
    const v = Math.round(raw * factor * 100) / 100;
    return { value: v, label: `${right.field}×${factor.toFixed(2)}=${v}` };
  }
  return { value: raw, label: `${right.field}=${fmt(raw)}` };
}

export function evalCondition(c: Condition, facts: Facts): LeafOut {
  if ("all" in c) {
    const parts = c.all.map((x) => evalCondition(x, facts));
    const result: Tri = parts.some((p) => p.result === "false")
      ? "false"
      : parts.some((p) => p.result === "unknown")
        ? "unknown"
        : "true";
    return merge(parts, result);
  }
  if ("any" in c) {
    const parts = c.any.map((x) => evalCondition(x, facts));
    const result: Tri = parts.some((p) => p.result === "true")
      ? "true"
      : parts.some((p) => p.result === "unknown")
        ? "unknown"
        : "false";
    return merge(parts, result);
  }
  if ("not" in c) {
    const p = evalCondition(c.not, facts);
    const result: Tri = p.result === "unknown" ? "unknown" : p.result === "true" ? "false" : "true";
    return { ...p, result, evidence: p.evidence.map((e) => `not(${e})`) };
  }
  const left = facts[c.field];
  if (c.op === "is_blank" || c.op === "is_not_blank") {
    const b = isBlank(left);
    const res = c.op === "is_blank" ? b : !b;
    return { result: res ? "true" : "false", evidence: [`${c.field} ${b ? "is blank" : "is not blank"}`], blanks: [] };
  }
  if (isBlank(left)) return { result: "unknown", evidence: [`${c.field}: not provided`], blanks: [c.field] };
  const r = resolveRight(c.right, facts);
  if (r.blank) return { result: "unknown", evidence: [`${r.blank}: not provided`], blanks: [r.blank] };
  const ok = cmp(c.op, left, r.value);
  return { result: ok ? "true" : "false", evidence: [`${c.field}=${fmt(left)} ${OP_SYM[c.op]} ${r.label}`], blanks: [] };
}

function merge(parts: LeafOut[], result: Tri): LeafOut {
  return {
    result,
    evidence: parts.flatMap((p) => p.evidence),
    blanks: result === "unknown" ? [...new Set(parts.flatMap((p) => p.blanks))] : [],
  };
}

export function evaluate(rules: PolicyRule[], facts: Facts): Evaluation {
  const checklist: RuleCheck[] = [];
  const absent: string[] = [];
  for (const rule of rules) {
    if (rule.active === false || rule.condition === null) continue;
    const out = evalCondition(rule.condition, facts);
    if (out.result === "unknown") out.blanks.forEach((b) => !absent.includes(b) && absent.push(b));
    checklist.push({
      id: rule.id,
      description: rule.description,
      outcome: rule.outcome,
      result: out.result,
      evidence: out.evidence.join("; "),
    });
  }
  const fallback = rules.find((r) => r.active !== false && r.condition === null);
  const firedRed = checklist.filter((c) => c.outcome === "human_review" && c.result === "true");
  const firedInfo = checklist.filter((c) => c.outcome === "request_information" && c.result === "true");
  const anyUnknown = checklist.some((c) => c.result === "unknown");

  let recommendation: Rec;
  let rule: string;
  let explanation: string;
  if (firedRed.length) {
    recommendation = "human_review";
    rule = firedRed.map((c) => c.id).join("+");
    explanation = `Sent to human review because: ${firedRed.map((c) => c.description.toLowerCase()).join("; ")}.`;
  } else if (anyUnknown) {
    recommendation = "request_information";
    rule = `ABSENT(${absent.join(",")})`;
    explanation = `Information needed: ${absent.join(", ")} not provided, so the rules cannot decide.`;
  } else if (firedInfo.length) {
    recommendation = "request_information";
    rule = firedInfo.map((c) => c.id).join("+");
    explanation = `Information needed: ${firedInfo.map((c) => c.description.toLowerCase()).join("; ")}.`;
  } else {
    recommendation = "routine_processing";
    rule = fallback?.id ?? "R3.routine";
    explanation = `No red-flag or missing-information rule applies, so the next step is ${REC_LABEL.routine_processing.toLowerCase()}.`;
  }
  if (fallback) {
    checklist.push({
      id: fallback.id,
      description: fallback.description,
      outcome: fallback.outcome,
      result: recommendation === "routine_processing" ? "true" : "false",
      evidence: recommendation === "routine_processing" ? "no other rule fired or was undecidable" : "another rule decided first",
    });
  }
  return { recommendation, rule, checklist, explanation, absentFields: absent };
}

/** Mock policy hash. The real hash comes from the backend. */
export function hashRules(rules: PolicyRule[]): string {
  const s = JSON.stringify(rules);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `sha256:${h.toString(16).padStart(8, "0").slice(0, 6)}…`;
}

/** A condition is incomplete when a group is empty, a leaf has no field, or a comparison has no right side. */
export function isConditionComplete(c: Condition | null): boolean {
  if (c === null) return false;
  if ("all" in c) return c.all.length > 0 && c.all.every(isConditionComplete);
  if ("any" in c) return c.any.length > 0 && c.any.every(isConditionComplete);
  if ("not" in c) return isConditionComplete(c.not);
  if (!c.field) return false;
  if (c.op === "is_blank" || c.op === "is_not_blank") return true;
  if (!c.right) return false;
  if (c.right.kind === "field") return !!c.right.field;
  const v = c.right.value;
  if (Array.isArray(v)) return v.length > 0;
  return v !== "" && v !== null && v !== undefined && !(typeof v === "number" && Number.isNaN(v));
}

export function conditionFields(c: Condition | null): string[] {
  if (!c) return [];
  if ("all" in c) return c.all.flatMap(conditionFields);
  if ("any" in c) return c.any.flatMap(conditionFields);
  if ("not" in c) return conditionFields(c.not);
  return [c.field, ...(c.right?.kind === "field" ? [c.right.field] : [])];
}
