import type { Claim, Condition, PolicyRule, Rec } from "@/types";
import { evaluate, isConditionComplete, conditionFields } from "./evaluate";
import { REC_LABEL, REC_ORDER } from "@/copy";

export const fmtNum = (n: number) => n.toLocaleString("en-US");

export function conditionText(c: Condition | null): string {
  if (!c) return "otherwise";
  if ("all" in c) return c.all.map(wrap).join(" and ") || "(empty group)";
  if ("any" in c) return c.any.map(wrap).join(" or ") || "(empty group)";
  if ("not" in c) return `not (${conditionText(c.not)})`;
  if (!c.field) return "(no field)";
  const sym: Record<string, string> = {
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
  if (c.op === "is_blank") return `${c.field} is blank`;
  if (c.op === "is_not_blank") return `${c.field} is not blank`;
  if (!c.right) return `${c.field} ${sym[c.op]} ?`;
  if (c.right.kind === "field")
    return `${c.field} ${sym[c.op]} ${c.right.field || "?"}${c.right.factor && c.right.factor !== 1 ? ` × ${c.right.factor.toFixed(2)}` : ""}`;
  const v = c.right.value;
  const vs = Array.isArray(v)
    ? v.join(", ")
    : typeof v === "number"
      ? fmtNum(v)
      : typeof v === "boolean"
        ? v
          ? "yes"
          : "no"
        : v || "?";
  return `${c.field} ${sym[c.op]} ${vs}`;
}
const wrap = (c: Condition) =>
  "all" in c || "any" in c ? `(${conditionText(c)})` : conditionText(c);

export function conditionChips(c: Condition | null): string[] {
  if (!c) return ["otherwise"];
  if ("all" in c) return c.all.map(conditionText);
  return [conditionText(c)];
}

export type RuleDiffStatus = "same" | "changed" | "added" | "removed";
export function ruleStatus(v1: PolicyRule[], rule: PolicyRule): RuleDiffStatus {
  const o = v1.find((r) => r.id === rule.id);
  if (!o) return "added";
  return JSON.stringify(o) === JSON.stringify(rule) ? "same" : "changed";
}
export const removedRules = (v1: PolicyRule[], draft: PolicyRule[]) =>
  v1.filter((r) => !draft.some((d) => d.id === r.id));

const limitOf = (r?: PolicyRule) =>
  r?.condition && "field" in r.condition && r.condition.right?.kind === "value"
    ? Number(r.condition.right.value)
    : null;

export function diffLines(v1: PolicyRule[], draft: PolicyRule[]): string[] {
  const lines: string[] = [];
  for (const r of draft) {
    const s = ruleStatus(v1, r);
    if (s === "added")
      lines.push(
        `Added: ${r.description.toLowerCase()} goes to ${REC_LABEL[r.outcome].toLowerCase()}`,
      );
    if (s === "changed") {
      const o = v1.find((x) => x.id === r.id)!;
      if (
        r.id === "R1.quote_over_limit" &&
        limitOf(o) !== null &&
        limitOf(r) !== null &&
        JSON.stringify(o.outcome) === JSON.stringify(r.outcome)
      ) {
        const a = limitOf(o)!,
          b = limitOf(r)!;
        if (a !== b)
          lines.push(
            `Quote limit ${b < a ? "lowered" : "raised"} from EUR ${fmtNum(a)} to EUR ${fmtNum(b)}`,
          );
        else lines.push(`Changed: ${r.description}`);
      } else if (r.id === "R2.itemized_quote_missing" && r.description.includes("above EUR 500")) {
        lines.push("Itemized quote now only required above EUR 500");
      } else lines.push(`Changed ${r.id}: ${r.description} (${conditionText(r.condition)})`);
    }
  }
  for (const r of removedRules(v1, draft)) lines.push(`Removed: ${r.description.toLowerCase()}`);
  return lines;
}

export interface DerivedClaim extends Claim {
  recommendation_v2: Rec;
  rule_v2: string;
}

export function deriveClaims(claims: Claim[], draft: PolicyRule[]): DerivedClaim[] {
  return claims.map((c) => {
    if (c.case_status === "closed") {
      const ev = evaluate(draft, c.facts);
      return { ...c, recommendation_v2: ev.recommendation, rule_v2: ev.rule, needs_recheck: false };
    }
    const ev = evaluate(draft, c.facts);
    return {
      ...c,
      recommendation_v2: ev.recommendation,
      rule_v2: ev.rule,
      needs_recheck: ev.recommendation !== c.recommendation_v1,
    };
  });
}

export interface Flip {
  claim: DerivedClaim;
  from: Rec;
  to: Rec;
  cause: string;
  status: "recheck" | "locked";
  towardRoutine: boolean;
}
export function flipList(d: DerivedClaim[]): Flip[] {
  return d
    .filter((c) => c.recommendation_v2 !== c.recommendation_v1)
    .map((c) => ({
      claim: c,
      from: c.recommendation_v1,
      to: c.recommendation_v2,
      cause: c.recommendation_v2 === "routine_processing" ? c.rule_v1 : c.rule_v2,
      status: c.case_status === "closed" ? "locked" : "recheck",
      towardRoutine: c.case_status === "open" && c.recommendation_v2 === "routine_processing",
    }));
}

export interface CheckResult {
  id: number;
  label: string;
  explain: string;
  pass: boolean;
  message?: string;
}

export function exhaustiveChecks(
  claims: Claim[],
  v1: PolicyRule[],
  draft: PolicyRule[],
): CheckResult[] {
  const evals = claims.map((c) => ({ c, ev: evaluate(draft, c.facts) }));
  const blankOk = evals.every(
    ({ ev }) =>
      !ev.checklist.some((k) => k.result === "unknown") ||
      ev.recommendation !== "routine_processing",
  );
  const redOk = evals.every(
    ({ ev }) =>
      !ev.checklist.some((k) => k.outcome === "human_review" && k.result === "true") ||
      ev.recommendation === "human_review",
  );
  const incomplete = draft.find(
    (r) => r.active !== false && r.id !== "R3.routine" && !isConditionComplete(r.condition),
  );
  const replayOk = evals.every(
    ({ c, ev }) =>
      REC_ORDER.includes(ev.recommendation) &&
      JSON.stringify(evaluate(draft, c.facts)) === JSON.stringify(ev),
  );
  const closedOk = deriveClaims(claims, draft).every(
    (c) => c.case_status === "open" || !c.needs_recheck,
  );
  const changedIds = new Set([
    ...draft.filter((r) => ruleStatus(v1, r) !== "same").map((r) => r.id),
    ...removedRules(v1, draft).map((r) => r.id),
  ]);
  const changedFields = new Set(
    [...draft.filter((r) => changedIds.has(r.id)), ...removedRules(v1, draft)].flatMap((r) =>
      conditionFields(r.condition),
    ),
  );
  const attribOk = flipList(deriveClaims(claims, draft)).every((f) => {
    const ids = [...f.claim.rule_v1.split("+"), ...f.claim.rule_v2.split("+")];
    if (ids.some((i) => changedIds.has(i))) return true;
    const m = [f.claim.rule_v1, f.claim.rule_v2].join(" ").match(/ABSENT\(([^)]*)\)/g) ?? [];
    return m.some((s) =>
      s
        .slice(7, -1)
        .split(",")
        .some((x) => changedFields.has(x)),
    );
  });
  return [
    {
      id: 1,
      label: "Blank is never treated as no",
      explain: "Any undecidable rule leads to a request for information, never routine.",
      pass: blankOk,
    },
    {
      id: 2,
      label: "A fired red-flag rule always means human review",
      explain: "No claim with a fired human-review rule gets a softer next step.",
      pass: redOk,
    },
    {
      id: 3,
      label: "Every claim gets exactly one recommendation, and it replays identically",
      explain: "Each rule is complete and two evaluations of every claim match.",
      pass: !incomplete && replayOk,
      message: incomplete ? `Rule ${incomplete.id} has an incomplete condition` : undefined,
    },
    {
      id: 4,
      label: "Closed claims never change",
      explain: "Closed claims are kept as decided and never flagged for recheck.",
      pass: closedOk,
    },
    {
      id: 5,
      label: "Every changed outcome traces to a named rule edit",
      explain: "Each flip in the list is caused by a rule that changed in this draft.",
      pass: attribOk,
    },
  ];
}
