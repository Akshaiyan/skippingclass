import type { Flow } from "@/types";
import type { DerivedClaim } from "@/lib/report";
import { FLOW_OF } from "@/copy";

export type HandlingRates = Record<Flow, number | null>;
export const IMPACT_FLOWS: Flow[] = ["green", "yellow", "red"];

export function policyImpact(claims: DerivedClaim[], rates?: Partial<HandlingRates> | null) {
  const open = claims.filter((claim) => claim.case_status === "open");
  const counts = IMPACT_FLOWS.map((flow) => ({
    flow,
    live: open.filter((claim) => FLOW_OF[claim.recommendation_v1] === flow).length,
    expected: open.filter((claim) => FLOW_OF[claim.recommendation_v2] === flow).length,
  }));
  const average = (version: "live" | "expected") => {
    if (!open.length) return null;
    let total = 0;
    for (const row of counts) {
      if (!row[version]) continue;
      const rate = rates?.[row.flow];
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0) return null;
      total += row[version] * rate;
    }
    return total / open.length;
  };
  return { counts, total: open.length, liveCost: average("live"), expectedCost: average("expected") };
}