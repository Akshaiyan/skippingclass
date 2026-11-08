import type { Flow, PolicyRule } from "@/types";
import type { DerivedClaim, Flip } from "@/lib/report";
import { FLOW_OF } from "@/copy";
import { evaluate } from "@/lib/evaluate";

export type AssumptionStatus = "ASSUMED" | "SOURCED";

/** Inputs of the cost view for one company. All are editable; none is measured on real claims. */
export interface SavingsAssumptions {
  /** Handler cost in EUR per minute. */
  eurPerMinute: number;
  /** Minutes one Human review takes. */
  reviewMinutes: number;
  /** The company's own volume. */
  claimsPerMonth: number;
  /** Yearly growth of claim volume, percent. Used only by the 12 month projection. */
  growthPercent: number;
  /** Share of Human reviews that were unnecessary (0 to 1). */
  unnecessaryReviewShare: number;
  /** Cost of one wrong routine decision, EUR. */
  wrongRoutineCost: number;
}

export const DEFAULT_ASSUMPTIONS: SavingsAssumptions = {
  eurPerMinute: 1,
  reviewMinutes: 10,
  claimsPerMonth: 2000,
  growthPercent: 0,
  unnecessaryReviewShare: 0.3,
  wrongRoutineCost: 2000,
};

export const ASSUMPTION_STATUS: Record<keyof SavingsAssumptions, AssumptionStatus> = {
  eurPerMinute: "ASSUMED",
  reviewMinutes: "ASSUMED",
  claimsPerMonth: "ASSUMED",
  growthPercent: "ASSUMED",
  unnecessaryReviewShare: "ASSUMED",
  wrongRoutineCost: "ASSUMED",
};

const valid = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;

/** Rejects negative or non numeric input; the review share is clamped to 0..1. */
export function sanitizeAssumption(key: keyof SavingsAssumptions, value: number): number | null {
  if (!valid(value)) return null;
  if (key === "unnecessaryReviewShare") return Math.min(1, value);
  return value;
}

/** Cost of one Human review in EUR. */
export const reviewCost = (a: SavingsAssumptions) => a.reviewMinutes * a.eurPerMinute;

/** Cost effect of one changed claim: +cost when it newly needs Human review, -cost when it leaves it, else 0. */
export function claimCostEffect(
  from: DerivedClaim["recommendation_v1"],
  to: DerivedClaim["recommendation_v2"],
  a: SavingsAssumptions,
): number {
  const wasRed = FLOW_OF[from] === "red";
  const isRed = FLOW_OF[to] === "red";
  if (!wasRed && isRed) return reviewCost(a);
  if (wasRed && !isRed) return -reviewCost(a);
  return 0;
}

export interface PolicySavings {
  openClaims: number;
  newlyEscalated: number;
  released: number;
  movedToRoutine: number;
  movedToInfo: number;
  /** Open claims in Human review: live and draft. */
  redLive: number;
  redDraft: number;
  /** Extra cost of Human review per month at the company volume. Negative means a saving. */
  extraReviewCostPerMonth: number;
  /** Secondary line: expected cost of wrong routine decisions per month. */
  wrongRoutineCostPerMonth: number;
}

/** Cost effect of the draft against the live rules, on open claims only. Missing information is not priced. */
export function policySavings(claims: DerivedClaim[], a: SavingsAssumptions): PolicySavings {
  const open = claims.filter((c) => c.case_status === "open");
  const n = open.length;
  const flow = (rec: DerivedClaim["recommendation_v1"]): Flow => FLOW_OF[rec];
  const newlyEscalated = open.filter(
    (c) => flow(c.recommendation_v1) !== "red" && flow(c.recommendation_v2) === "red",
  ).length;
  const released = open.filter(
    (c) => flow(c.recommendation_v1) === "red" && flow(c.recommendation_v2) !== "red",
  ).length;
  const movedToRoutine = open.filter(
    (c) => flow(c.recommendation_v1) !== "green" && flow(c.recommendation_v2) === "green",
  ).length;
  const movedToInfo = open.filter(
    (c) => flow(c.recommendation_v1) !== "yellow" && flow(c.recommendation_v2) === "yellow",
  ).length;
  const redLive = open.filter((c) => flow(c.recommendation_v1) === "red").length;
  const redDraft = open.filter((c) => flow(c.recommendation_v2) === "red").length;
  const netShare = n ? (newlyEscalated - released) / n : 0;
  return {
    openClaims: n,
    newlyEscalated,
    released,
    movedToRoutine,
    movedToInfo,
    redLive,
    redDraft,
    extraReviewCostPerMonth: netShare * a.claimsPerMonth * reviewCost(a),
    wrongRoutineCostPerMonth: n
      ? (movedToRoutine / n) *
        a.claimsPerMonth *
        (1 - a.unnecessaryReviewShare) *
        a.wrongRoutineCost
      : 0,
  };
}

/** Human review cost per month for a given share of claims in Human review. */
export const monthlyReviewCost = (redShare: number, a: SavingsAssumptions) =>
  redShare * a.claimsPerMonth * reviewCost(a);

export interface FlowShares {
  green: number;
  yellow: number;
  red: number;
}

/** Share of open claims per flow, for the live rules or the draft. Zero when nothing is open. */
export function flowShares(claims: DerivedClaim[], version: "live" | "draft"): FlowShares {
  const open = claims.filter((c) => c.case_status === "open");
  const out: FlowShares = { green: 0, yellow: 0, red: 0 };
  if (!open.length) return out;
  for (const c of open)
    out[FLOW_OF[version === "live" ? c.recommendation_v1 : c.recommendation_v2]] += 1;
  return {
    green: out.green / open.length,
    yellow: out.yellow / open.length,
    red: out.red / open.length,
  };
}

export interface MonthPoint {
  month: number;
  live: number;
  draft: number;
}

/** Human review cost for the next 12 months, volume growing by growthPercent per year, shares held constant. */
export function projectTwelveMonths(
  live: FlowShares,
  draft: FlowShares,
  a: SavingsAssumptions,
): MonthPoint[] {
  const monthly = Math.pow(1 + a.growthPercent / 100, 1 / 12);
  return Array.from({ length: 12 }, (_, i) => {
    const scaled = { ...a, claimsPerMonth: a.claimsPerMonth * Math.pow(monthly, i) };
    return {
      month: i + 1,
      live: monthlyReviewCost(live.red, scaled),
      draft: monthlyReviewCost(draft.red, scaled),
    };
  });
}

export interface LimitPoint {
  limit: number;
  cost: number;
}

/** Human review cost per month for each quote limit, evaluating the open sample claims against the draft rules. */
export function sweepQuoteLimit(
  claims: DerivedClaim[],
  draftRules: PolicyRule[],
  limits: number[],
  a: SavingsAssumptions,
  applyLimit: (rules: PolicyRule[], limit: number) => PolicyRule[],
): LimitPoint[] {
  const open = claims.filter((c) => c.case_status === "open");
  return limits.map((limit) => {
    const rules = applyLimit(draftRules, limit);
    const red = open.filter(
      (c) => FLOW_OF[evaluate(rules, c.facts).recommendation] === "red",
    ).length;
    return { limit, cost: open.length ? monthlyReviewCost(red / open.length, a) : 0 };
  });
}

export interface RuleEffect {
  rule: string;
  /** Human reviews added minus removed by this rule, on open claims. */
  net: number;
}

/** Which rules add or remove Human reviews, from the open flips, largest effect first. */
export function ruleEffects(flips: Flip[]): RuleEffect[] {
  const by = new Map<string, number>();
  for (const f of flips) {
    if (f.claim.case_status !== "open") continue;
    const wasRed = FLOW_OF[f.from] === "red";
    const isRed = FLOW_OF[f.to] === "red";
    if (wasRed === isRed) continue;
    by.set(f.cause, (by.get(f.cause) ?? 0) + (isRed ? 1 : -1));
  }
  return [...by.entries()]
    .map(([rule, net]) => ({ rule, net }))
    .sort((x, y) => Math.abs(y.net) - Math.abs(x.net));
}
