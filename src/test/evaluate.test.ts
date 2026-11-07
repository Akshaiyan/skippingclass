import { describe, expect, it } from "vitest";
import { evaluate, isConditionComplete } from "@/lib/evaluate";
import { SEED_CLAIMS, V1_RULES, buildV2Rules } from "@/data/seed";
import { deriveClaims, exhaustiveChecks, flipList } from "@/lib/report";
import { validateGate, validateOverride } from "@/lib/guards";
import { REFUSAL } from "@/copy";

const byId = (id: string) => SEED_CLAIMS.find((c) => c.case_id === id)!;

describe("evaluator v1 seed", () => {
  it("produces the documented rule strings", () => {
    expect(byId("PRA-001").rule_v1).toBe("R1.quote_over_limit+R1.duplicate");
    expect(byId("PRA-002").rule_v1).toBe("R1.liability_disputed+R1.evidence_conflict");
    expect(byId("PRA-003").rule_v1).toBe("R1.policy_inactive+R1.incident_before_start");
    expect(byId("PRA-005").rule_v1).toBe("ABSENT(quote_eur,incident_report_present)");
    expect(byId("PRA-006").rule_v1).toBe("ABSENT(liability_disputed)");
    expect(byId("PRA-008").rule_v1).toBe("R2.itemized_quote_missing");
    expect(byId("PRA-009").rule_v1).toBe("ABSENT(evidence_conflict)");
    expect(byId("PRA-007").rule_v1).toBe("R3.routine");
  });
  it("treats a blank as unknown, never as no", () => {
    const ev = evaluate(V1_RULES, { ...byId("PRA-007").facts, liability_disputed: null });
    expect(ev.recommendation).toBe("request_information");
    expect(ev.checklist.find((c) => c.id === "R1.liability_disputed")?.result).toBe("unknown");
  });
  it("a fired red flag beats unknowns", () => {
    const ev = evaluate(V1_RULES, { ...byId("PRA-005").facts, duplicate_flag: true });
    expect(ev.recommendation).toBe("human_review");
  });
});

describe("draft v2", () => {
  const d = deriveClaims(SEED_CLAIMS, buildV2Rules(1200));
  const rec = (id: string) => d.find((c) => c.case_id === id)!;
  it("flips the expected claims", () => {
    expect(rec("PRA-007").recommendation_v2).toBe("human_review");
    expect(rec("PRA-010").recommendation_v2).toBe("human_review");
    expect(rec("PRA-008").recommendation_v2).toBe("routine_processing");
    expect(rec("PRA-011").recommendation_v2).toBe("routine_processing");
  });
  it("closed claims are never flagged for recheck", () => {
    expect(rec("PRA-012").needs_recheck).toBe(false);
    expect(flipList(d).find((f) => f.claim.case_id === "PRA-012")?.status).toBe("locked");
  });
  it("PRA-011 flips at a 1,000 limit", () => {
    const d2 = deriveClaims(SEED_CLAIMS, buildV2Rules(1000));
    expect(d2.find((c) => c.case_id === "PRA-011")!.recommendation_v2).toBe("human_review");
  });
  it("all five checks pass for the seeded draft", () => {
    expect(exhaustiveChecks(SEED_CLAIMS, V1_RULES, buildV2Rules(1200)).every((c) => c.pass)).toBe(true);
  });
  it("an incomplete rule fails check 3", () => {
    const rules = [...buildV2Rules(1200), { id: "R1.x", outcome: "human_review" as const, description: "x", condition: { all: [] } }];
    expect(isConditionComplete({ all: [] })).toBe(false);
    const c3 = exhaustiveChecks(SEED_CLAIMS, V1_RULES, rules)[2];
    expect(c3.pass).toBe(false);
    expect(c3.message).toBe("Rule R1.x has an incomplete condition");
  });
});

describe("guards", () => {
  it("override needs a different step, reason, note and actor", () => {
    expect(validateOverride({ from: "human_review", to: "human_review", reason: "judgement", note: "x", actor: "a" }).to).toBe(REFUSAL.same);
    expect(validateOverride({ from: "human_review", to: "routine_processing", reason: "judgement", note: "  ", actor: "a" }).note).toBe(REFUSAL.note);
    expect(validateOverride({ from: "human_review", to: "routine_processing", reason: "judgement", note: "x", actor: "" }).actor).toBe(REFUSAL.actor);
    expect(validateOverride({ from: "human_review", to: "bogus", reason: "judgement", note: "x", actor: "a" }).to).toBe(REFUSAL.unknownRec);
    expect(Object.keys(validateOverride({ from: "human_review", to: "routine_processing", reason: "judgement", note: "x", actor: "a" }))).toHaveLength(0);
  });
  it("four-eyes: approver must differ from author", () => {
    expect(validateGate({ author: "Lena Vogt", approver: " lena vogt ", reason: "ok", checksPass: true }).approverErr).toBe(REFUSAL.fourEyes);
    expect(validateGate({ author: "Lena Vogt", approver: "Jonas Weber", reason: "ok", checksPass: true }).canRelease).toBe(true);
    expect(validateGate({ author: "Lena Vogt", approver: "Jonas Weber", reason: "ok", checksPass: false }).canRelease).toBe(false);
  });
});
