// Filtering for the claims list. Pure, so the counts shown on the tabs can be tested against the list.
import type { Claim, Flow } from "@/types";

export type FlowFilter = "all" | Flow;
export type StatusFilter = "open" | "closed" | "all";

export interface ClaimFilters {
  status: StatusFilter;
  q: string;
  recheckOnly: boolean;
}

export const DEFAULT_FILTERS: ClaimFilters = { status: "open", q: "", recheckOnly: false };

/** Claims matching status, search and recheck, before the flow is applied. */
export function applyBaseFilters<T extends Claim>(claims: T[], f: ClaimFilters): T[] {
  const q = f.q.trim().toLowerCase();
  return claims
    .filter((c) => f.status === "all" || c.case_status === f.status)
    .filter((c) => !q || c.case_id.toLowerCase().includes(q))
    .filter((c) => !f.recheckOnly || c.needs_recheck);
}

/** Faceted counts: each flow tab counts the claims the list would show if that tab were chosen. */
export function flowCounts(base: Claim[]): Record<FlowFilter, number> {
  const out: Record<FlowFilter, number> = { all: base.length, red: 0, yellow: 0, green: 0 };
  for (const c of base) out[c.flow]++;
  return out;
}

export const isDefaultFilters = (flow: FlowFilter, f: ClaimFilters) =>
  flow === "all" &&
  f.status === DEFAULT_FILTERS.status &&
  !f.q.trim() &&
  f.recheckOnly === DEFAULT_FILTERS.recheckOnly;
