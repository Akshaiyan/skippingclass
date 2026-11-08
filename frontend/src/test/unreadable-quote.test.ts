// The screen must reach the same decision as the engine's log when a quote cannot be read as an amount.
// Engine rule (triage.amount_or_none): only a plain non-negative decimal is an amount; anything else is unreadable,
// which the rules treat as absent, so a claim that is otherwise clean asks for information instead of passing.
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/engine_parity.json";
import { evaluate, type Facts } from "@/lib/evaluate";
import type { PolicyRule } from "@/types";

const rulesV1 = fixture.rules_v1 as unknown as PolicyRule[];
const rulesV2 = fixture.rules_v2 as unknown as PolicyRule[];
const clean = fixture.cases.find(
  (c) => c.expected_v1 === "routine_processing" && c.open && c.expected_v2 === "routine_processing",
);

describe("an unreadable quote is unknown, never a pass", () => {
  it("the fixture has a clean routine claim to start from", () => {
    expect(clean).toBeTruthy();
  });

  for (const bad of ["not-a-number", "-5", "1e3", "NaN", "12,5", "1.2.3"]) {
    it(`quote ${JSON.stringify(bad)} asks for information under v1 and v2`, () => {
      const facts = { ...(clean!.facts as Facts), quote_eur: bad };
      expect(evaluate(rulesV1, facts).recommendation).toBe("request_information");
      expect(evaluate(rulesV2, facts).recommendation).toBe("request_information");
    });
  }

  it("a readable quote is still routine, including padded text", () => {
    for (const ok of [650, "650", " 650 ", "650.5"]) {
      const facts = { ...(clean!.facts as Facts), quote_eur: ok };
      expect(evaluate(rulesV1, facts).recommendation).toBe("routine_processing");
    }
  });
});
