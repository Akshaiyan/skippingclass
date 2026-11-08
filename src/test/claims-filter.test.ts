import { describe, expect, it } from "vitest";
import { getClaims } from "@/data/api";
import { deriveClaims } from "@/lib/report";
import { getDraftPolicy } from "@/data/api";
import {
  applyBaseFilters,
  DEFAULT_FILTERS,
  flowCounts,
  isDefaultFilters,
} from "@/lib/claims-filter";

const claims = deriveClaims(getClaims(), getDraftPolicy().rules);

describe("Claims filters", () => {
  it("counts each flow as the list would show it after choosing that tab", () => {
    const base = applyBaseFilters(claims, DEFAULT_FILTERS);
    const counts = flowCounts(base);
    for (const f of ["red", "yellow", "green"] as const)
      expect(counts[f]).toBe(base.filter((c) => c.flow === f).length);
    expect(counts.all).toBe(base.length);
    expect(counts.red + counts.yellow + counts.green).toBe(counts.all);
  });
  it("lets status change the counts", () => {
    const open = flowCounts(applyBaseFilters(claims, DEFAULT_FILTERS)).all;
    const all = flowCounts(applyBaseFilters(claims, { ...DEFAULT_FILTERS, status: "all" })).all;
    expect(all).toBeGreaterThan(open);
  });
  it("searches case ids without caring about case or spaces", () => {
    const id = claims[0]!.case_id;
    const hit = applyBaseFilters(claims, { ...DEFAULT_FILTERS, status: "all", q: `  ${id.toLowerCase()} ` });
    expect(hit.map((c) => c.case_id)).toEqual([id]);
  });
  it("returns nothing when nothing matches", () => {
    expect(applyBaseFilters(claims, { ...DEFAULT_FILTERS, q: "zzz" })).toEqual([]);
  });
  it("knows when filters are at their defaults", () => {
    expect(isDefaultFilters("all", DEFAULT_FILTERS)).toBe(true);
    expect(isDefaultFilters("red", DEFAULT_FILTERS)).toBe(false);
    expect(isDefaultFilters("all", { ...DEFAULT_FILTERS, status: "all" })).toBe(false);
    expect(isDefaultFilters("all", { ...DEFAULT_FILTERS, q: "x" })).toBe(false);
    expect(isDefaultFilters("all", { ...DEFAULT_FILTERS, recheckOnly: true })).toBe(false);
  });
});
