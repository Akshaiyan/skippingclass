import type { Flow } from "@/types";
import type { DerivedClaim } from "@/lib/report";
import { FLOW_OF } from "@/copy";

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
  growthPercent: 8,
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

export interface CostFigures {
  /** Human review cost per claim at your volume: share in Human review × cost of one review. */
  perClaim: number;
  /** Share of open claims in Human review, 0..1. */
  reviewShare: number;
  /** Human review cost over the next 12 months, with volume growth applied. */
  twelveMonths: number;
}

/**
 * The three key figures for the live rules and the draft. Null when no claim is open:
 * there is no share to project from, and a blank is never treated as zero.
 */
export function costFigures(
  live: FlowShares,
  draft: FlowShares,
  months: MonthPoint[],
  openClaims: number,
  a: SavingsAssumptions,
): { live: CostFigures; draft: CostFigures } | null {
  if (!openClaims) return null;
  const sum = (k: "live" | "draft") => months.reduce((t, m) => t + m[k], 0);
  return {
    live: { perClaim: live.red * reviewCost(a), reviewShare: live.red, twelveMonths: sum("live") },
    draft: {
      perClaim: draft.red * reviewCost(a),
      reviewShare: draft.red,
      twelveMonths: sum("draft"),
    },
  };
}
