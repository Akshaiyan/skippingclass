import { describe, expect, it } from "vitest";
import { initialStoreState, storeReducer } from "@/store";
import { validateGate, validateOverride } from "@/lib/guards";

describe("reviewer decisions", () => {
  const timestamp = "2026-11-07T19:19:00.000Z";
  it("confirmation records recommendation, reviewer and policy immediately", () => {
    const state = initialStoreState();
    const result = storeReducer(state, { type: "confirm", case_id: "PRA-001", timestamp });
    expect(result.claims.find((claim) => claim.case_id === "PRA-001")?.ui_status).toBe("reviewed");
    expect(result.log.at(-1)).toMatchObject({ type: "reviewer_accept", case_id: "PRA-001", to_rec: "human_review", actor: state.reviewer, timestamp, policy_version: state.claims[0].policy_version, policy_hash: state.claims[0].policy_hash });
    expect(result.log.length).toBe(state.log.length + 1);
  });
  it("Undo restores review status without removing the original audit record", () => {
    const state = initialStoreState();
    const confirmed = storeReducer(state, { type: "confirm", case_id: "PRA-001", timestamp });
    const undone = storeReducer(confirmed, { type: "undoConfirm", case_id: "PRA-001", confirmationTimestamp: timestamp, timestamp: "2026-11-07T19:19:01.000Z" });
    expect(undone.claims.find((claim) => claim.case_id === "PRA-001")?.ui_status).toBeUndefined();
    expect(undone.log.slice(0, -1)).toEqual(confirmed.log);
    expect(undone.log.at(-1)?.note).toContain(timestamp);
  });
  it("locked claims cannot be confirmed", () => {
    const state = initialStoreState();
    expect(storeReducer(state, { type: "confirm", case_id: "PRA-004", timestamp })).toBe(state);
  });
  it("repeated confirmation cannot duplicate an audit record", () => {
    const confirmed = storeReducer(initialStoreState(), { type: "confirm", case_id: "PRA-001", timestamp });
    expect(storeReducer(confirmed, { type: "confirm", case_id: "PRA-001", timestamp })).toBe(confirmed);
  });
  it("override requires a different step, reason and note", () => {
    const base = { from: "human_review" as const, to: "routine_processing" as const, reason: "judgement" as const, note: "Reviewed supporting evidence", actor: "Jonas Weber" };
    expect(validateOverride({ ...base, to: "human_review" }).to).toBeDefined();
    expect(validateOverride({ ...base, reason: null }).reason).toBeDefined();
    expect(validateOverride({ ...base, note: " " }).note).toBeDefined();
    expect(validateOverride(base)).toEqual({});
  });
  it("release requires checks, a reason, and an approver distinct from the current author", () => {
    const base = { author: "Jonas Weber", approver: "Lena Vogt", reason: "Reviewed routine moves", checksPass: true };
    expect(validateGate(base).canRelease).toBe(true);
    expect(validateGate({ ...base, approver: " jonas weber " }).canRelease).toBe(false);
    expect(validateGate({ ...base, reason: " " }).canRelease).toBe(false);
    expect(validateGate({ ...base, checksPass: false }).canRelease).toBe(false);
  });
});