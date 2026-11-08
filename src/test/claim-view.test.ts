import { describe, expect, it } from "vitest";
import { initialStoreState, storeReducer } from "@/store";
import { byUrgency, incidentDate, nextStep, quoteOf, shortReason } from "@/lib/claim-view";

const state = initialStoreState();
const claim = (id: string) => state.claims.find((c) => c.case_id === id)!;

describe("claim summaries", () => {
  it("sorts human review, then request information, then routine; open before closed", () => {
    const order = [...state.claims].sort(byUrgency).map((c) => c.flow);
    const rank = { red: 0, yellow: 1, green: 2 };
    expect(order.map((f) => rank[f])).toEqual([...order.map((f) => rank[f])].sort());
    const reds = [...state.claims].sort(byUrgency).filter((c) => c.flow === "red");
    const statuses = reds.map((c) => c.case_status);
    expect(statuses).toEqual([...statuses].sort((a, b) => (a === b ? 0 : a === "open" ? -1 : 1)));
  });
  it("gives a short reason from the rules, and names missing facts", () => {
    expect(shortReason(claim("PRA-001"), state.log)).toMatch(/quote above/i);
    expect(shortReason(claim("PRA-005"), state.log)).toMatch(/^Missing: /);
    expect(shortReason(claim("PRA-011"), state.log)).toBe("No rule raised a concern");
    expect(shortReason(claim("PRA-012"), state.log)).toMatch(/Reviewer changed this/);
  });
  it("shows the suggested step until something is recorded, then the latest record", () => {
    expect(nextStep(claim("PRA-011"), state.log)).toMatchObject({ kind: "suggested" });
    expect(nextStep(claim("PRA-005"), state.log).label).toBe(
      "Customer emailed for the repair quote",
    );
    const ts = "2026-11-08T10:00:00.000Z";
    const confirmed = storeReducer(state, { type: "confirm", case_id: "PRA-011", timestamp: ts });
    const c = confirmed.claims.find((x) => x.case_id === "PRA-011")!;
    expect(nextStep(c, confirmed.log)).toMatchObject({
      label: "Recommendation confirmed",
      kind: "done",
    });
  });
  it("never invents an amount or a date", () => {
    expect(quoteOf(claim("PRA-005"))).toBeNull();
    expect(quoteOf(claim("PRA-001"))).toBe(4800);
    expect(incidentDate(claim("PRA-001"))).toBe("4 Oct 2026");
    expect(incidentDate({ ...claim("PRA-001"), facts: {} })).toBeNull();
  });
});

describe("information request steps", () => {
  const at = (n: number) => new Date(Date.UTC(2026, 10, 8, 9, n)).toISOString();
  it("moves from drafted to sent and does not record sent twice", () => {
    let s = initialStoreState();
    s = storeReducer(s, { type: "prepareInfo", case_id: "PRA-005", timestamp: at(1) });
    const drafted = s.claims.find((c) => c.case_id === "PRA-005")!;
    expect(nextStep(drafted, s.log).label).toBe("Information request drafted");
    s = storeReducer(s, { type: "markInfoSent", case_id: "PRA-005", timestamp: at(2) });
    expect(nextStep(drafted, s.log).label).toBe("Email sent, waiting for reply");
    const length = s.log.length;
    s = storeReducer(s, { type: "markInfoSent", case_id: "PRA-005", timestamp: at(3) });
    expect(s.log.length).toBe(length);
  });
  it("ignores closed claims", () => {
    const s = initialStoreState();
    const closed = s.claims.find((c) => c.case_status === "closed")!;
    const next = storeReducer(s, { type: "markInfoSent", case_id: closed.case_id, timestamp: at(1) });
    expect(next.log).toEqual(s.log);
  });
});
