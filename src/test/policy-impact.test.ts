import { describe, expect, it } from "vitest";
import { getClaims, getDraftPolicy } from "@/data/api";
import { deriveClaims } from "@/lib/report";
import { policyImpact } from "@/lib/policy-impact";
import { initialStoreState, storeReducer } from "@/store";

describe("Policy comparisons", () => {
  const claims = deriveClaims(getClaims(), getDraftPolicy().rules);
  it("counts the three flow shares on the same open portfolio", () => {
    const impact = policyImpact(claims, { green: null, yellow: null, red: null });
    expect(impact.total).toBe(9);
    expect(impact.counts).toEqual([
      { flow: "green", live: 3, expected: 2 },
      { flow: "yellow", live: 3, expected: 2 },
      { flow: "red", live: 3, expected: 5 },
    ]);
  });
  it("uses handling rates weighted by claim count, not repair quotes", () => {
    const impact = policyImpact(claims, { green: 10, yellow: 20, red: 40 });
    expect(impact.liveCost).toBe(210 / 9);
    expect(impact.expectedCost).toBe(260 / 9);
  });
  it("does not invent a missing handling cost", () => {
    expect(policyImpact(claims, { green: 10, yellow: null, red: 40 }).expectedCost).toBeNull();
  });
  it("handles an older session with no handling-rate fields", () => {
    const impact = policyImpact(claims, undefined);
    expect(impact.total).toBe(9);
    expect(impact.liveCost).toBeNull();
    expect(impact.expectedCost).toBeNull();
  });
  it("keeps live counts unchanged when a draft rule changes", () => {
    const draft = getDraftPolicy().rules.map((rule) => ({ ...rule, active: rule.condition === null }));
    const impact = policyImpact(deriveClaims(getClaims(), draft), { green: 10, yellow: 20, red: 40 });
    expect(impact.counts.map((row) => row.live)).toEqual([3, 3, 3]);
    expect(impact.expectedCost).toBe(10);
  });
  it("accepts zero handling cost and refuses negative rates", () => {
    const state = initialStoreState();
    expect(storeReducer(state, { type: "setHandlingRate", flow: "green", rate: 0 }).handlingRates.green).toBe(0);
    expect(storeReducer(state, { type: "setHandlingRate", flow: "green", rate: -1 })).toBe(state);
  });
});