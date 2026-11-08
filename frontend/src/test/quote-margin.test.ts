import { describe, expect, it } from "vitest";
import { marginPhrase, quoteMargins } from "@/lib/quote-margin";

describe("how far a quote is from the limit", () => {
  it("EUR 1,201 is EUR 1 over the v2 limit and EUR 299 under the v1 limit", () => {
    expect(quoteMargins(1201, { v1: 1500, v2: 1200 })).toEqual([
      "EUR 299 under the v1 limit of EUR 1,500",
      "EUR 1 over the v2 limit of EUR 1,200",
    ]);
  });

  it("exactly at the v2 limit stays within it", () => {
    expect(marginPhrase(1200, 1200, "v2")).toContain("exactly at the v2 limit");
    expect(marginPhrase(1200, 1200, "v2")).toContain("stays within");
  });

  it("a quote that cannot be read as an amount gets no margin", () => {
    for (const bad of ["not-a-number", "-5", "1e3", "", null, undefined, NaN]) {
      expect(quoteMargins(bad, { v1: 1500, v2: 1200 })).toEqual([]);
    }
  });

  it("a readable quote as text works, and an unknown limit is skipped", () => {
    expect(quoteMargins(" 650 ", { v1: 1500, v2: null })).toEqual(["EUR 850 under the v1 limit of EUR 1,500"]);
  });

  it("the same limit in both versions is said once", () => {
    expect(quoteMargins(800, { v1: 1500, v2: 1500 })).toHaveLength(1);
  });
});
