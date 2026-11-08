import { describe, expect, it } from "vitest";
import { getClaims, getDraftPolicy } from "@/data/api";
import { deriveClaims } from "@/lib/report";
import {
  DEFAULT_ASSUMPTIONS,
  claimCostEffect,
  costFigures,
  flowShares,
  monthlyReviewCost,
  policySavings,
  projectTwelveMonths,
  sanitizeAssumption,
} from "@/lib/savings";

const claims = deriveClaims(getClaims(), getDraftPolicy().rules);
const A = DEFAULT_ASSUMPTIONS;

describe("Per claim cost of a flip", () => {
  it("costs 10 EUR when a claim newly needs Human review", () => {
    expect(claimCostEffect("routine_processing", "human_review", A)).toBe(10);
    expect(claimCostEffect("request_information", "human_review", A)).toBe(10);
  });
  it("saves 10 EUR when a claim leaves Human review", () => {
    expect(claimCostEffect("human_review", "routine_processing", A)).toBe(-10);
  });
  it("is zero when Human review is not involved", () => {
    expect(claimCostEffect("routine_processing", "request_information", A)).toBe(0);
    expect(claimCostEffect("human_review", "human_review", A)).toBe(0);
  });
});

describe("Monthly total", () => {
  it("scales the net Human review change to the company volume", () => {
    const s = policySavings(claims, A);
    const net = (s.newlyEscalated - s.released) / s.openClaims;
    expect(s.extraReviewCostPerMonth).toBeCloseTo(net * 2000 * 10);
    const doubled = policySavings(claims, { ...A, claimsPerMonth: 4000 });
    expect(doubled.extraReviewCostPerMonth).toBeCloseTo(s.extraReviewCostPerMonth * 2);
  });
  it("matches the difference of the two policy costs", () => {
    const live = flowShares(claims, "live");
    const draft = flowShares(claims, "draft");
    const s = policySavings(claims, A);
    expect(monthlyReviewCost(draft.red, A) - monthlyReviewCost(live.red, A)).toBeCloseTo(
      s.extraReviewCostPerMonth,
    );
  });
  it("projects 12 months and grows with the growth input", () => {
    const live = flowShares(claims, "live");
    const draft = flowShares(claims, "draft");
    const flat = projectTwelveMonths(live, draft, { ...A, growthPercent: 0 });
    expect(flat).toHaveLength(12);
    expect(flat[11]!.live).toBeCloseTo(flat[0]!.live);
    const grown = projectTwelveMonths(live, draft, { ...A, growthPercent: 12 });
    expect(grown[11]!.live).toBeGreaterThan(grown[0]!.live);
  });
});

describe("Zero change case", () => {
  it("is zero when nothing flips", () => {
    const same = claims.map((c) => ({ ...c, recommendation_v2: c.recommendation_v1 }));
    const s = policySavings(same, A);
    expect(s.extraReviewCostPerMonth).toBe(0);
    expect(s.newlyEscalated + s.released + s.movedToRoutine + s.movedToInfo).toBe(0);
  });
  it("handles no open claims", () => {
    expect(policySavings([], A).extraReviewCostPerMonth).toBe(0);
    expect(flowShares([], "live")).toEqual({ green: 0, yellow: 0, red: 0 });
  });
});

describe("Key figures", () => {
  const live = flowShares(claims, "live");
  const draft = flowShares(claims, "draft");
  const months = projectTwelveMonths(live, draft, A);
  const open = claims.filter((c) => c.case_status === "open").length;
  const f = costFigures(live, draft, months, open, A)!;
  it("cost per claim is the monthly Human review cost divided by claims per month", () => {
    expect(f.draft.perClaim).toBeCloseTo(monthlyReviewCost(draft.red, A) / A.claimsPerMonth);
    expect(f.live.perClaim).toBeCloseTo(monthlyReviewCost(live.red, A) / A.claimsPerMonth);
  });
  it("flow shares add up to 100% for both versions", () => {
    for (const s of [live, draft]) expect(s.red + s.yellow + s.green).toBeCloseTo(1);
  });
  it("12-month cost is the sum of the monthly projection", () => {
    expect(f.draft.twelveMonths).toBeCloseTo(months.reduce((t, m) => t + m.draft, 0));
  });
  it("is not provided when no claim is open, never divided by zero", () => {
    expect(costFigures(live, draft, months, 0, A)).toBeNull();
  });
});

describe("Inputs", () => {
  it("rejects invalid input and clamps the share", () => {
    expect(sanitizeAssumption("eurPerMinute", -1)).toBeNull();
    expect(sanitizeAssumption("eurPerMinute", Number.NaN)).toBeNull();
    expect(sanitizeAssumption("unnecessaryReviewShare", 3)).toBe(1);
  });
});
