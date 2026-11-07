import { createContext, useContext } from "react";
import type { Claim, Flow, LogEntry, PolicyDecision, PolicyRule, Rec, ReviewerOverride } from "@/types";
import { appendLog, getClaims, getDraftPolicy, getLog, getPolicy, getHandlingRates } from "@/data/api";
import type { HandlingRates } from "@/lib/policy-impact";
import { FLOW_OF } from "@/copy";
import type { DerivedClaim } from "@/lib/report";

export type QuoteLimit = number;

interface State {
  claims: Claim[];
  draftRules: PolicyRule[];
  log: LogEntry[];
  reviewer: string;
  quoteLimit: QuoteLimit;
  gateOpen: boolean;
  handlingRates: HandlingRates;
}

type Action =
  | { type: "setHandlingRate"; flow: Flow; rate: number | null }
  | { type: "confirm"; case_id: string; timestamp: string }
  | { type: "undoConfirm"; case_id: string; timestamp: string; confirmationTimestamp: string; previousStatus?: "reviewed" }
  | { type: "override"; record: Omit<ReviewerOverride, "timestamp">; timestamp: string }
  | { type: "setReviewer"; name: string }
  | { type: "setRules"; rules: PolicyRule[] }
  | { type: "resetDraft" }
  | { type: "setQuoteLimit"; limit: QuoteLimit }
  | { type: "policyDecision"; record: PolicyDecision };

function withLimit(rules: PolicyRule[], limit: number): PolicyRule[] {
  return rules.map((r) =>
    r.id === "R1.quote_over_limit" && r.condition && "field" in r.condition
      ? {
          ...r,
          description: `Quote above the EUR ${limit.toLocaleString("en-US")} routine limit`,
          condition: { ...r.condition, right: { kind: "value", value: limit } },
        }
      : r,
  );
}

export function storeReducer(s: State, a: Action): State {
  switch (a.type) {
    case "setHandlingRate":
      if (a.rate !== null && (!Number.isFinite(a.rate) || a.rate < 0)) return s;
      return { ...s, handlingRates: { ...getHandlingRates(), ...s.handlingRates, [a.flow]: a.rate } };
    case "confirm": {
      const claim = s.claims.find((c) => c.case_id === a.case_id);
      if (!claim || claim.case_status === "closed" || claim.ui_status === "reviewed" || !s.reviewer.trim()) return s;
      return {
        ...s,
        claims: s.claims.map((c) => c.case_id === a.case_id ? { ...c, ui_status: "reviewed" } : c),
        log: appendLog(s.log, { type: "reviewer_accept", case_id: claim.case_id, actor: s.reviewer.trim(), from_rec: claim.recommendation_v1, to_rec: claim.recommendation_v1, note: "Recommendation confirmed", policy_version: claim.policy_version, policy_hash: claim.policy_hash, timestamp: a.timestamp }),
      };
    }
    case "undoConfirm": {
      const claim = s.claims.find((c) => c.case_id === a.case_id);
      const latest = [...s.log].reverse().find((entry) => "case_id" in entry && entry.case_id === a.case_id);
      if (!claim || claim.case_status === "closed" || latest?.type !== "reviewer_accept" || latest.timestamp !== a.confirmationTimestamp) return s;
      return {
        ...s,
        claims: s.claims.map((c) => c.case_id === a.case_id ? { ...c, ui_status: a.previousStatus } : c),
        log: appendLog(s.log, { type: "final_decision", case_id: claim.case_id, actor: s.reviewer.trim(), from_rec: claim.recommendation_v1, to_rec: claim.recommendation_v1, note: `Confirmation undone; original record retained (${a.confirmationTimestamp})`, policy_version: latest.policy_version, policy_hash: latest.policy_hash, timestamp: a.timestamp }),
      };
    }
    case "override": {
      const c = s.claims.find((x) => x.case_id === a.record.case_id);
      if (!c || c.case_status === "closed" || a.record.from_rec !== c.recommendation_v1 || !["routine_processing", "request_information", "human_review"].includes(a.record.to_rec) || !["policy_wrong", "data_wrong", "judgement"].includes(a.record.reason_code) || a.record.from_rec === a.record.to_rec || !a.record.note.trim() || !a.record.actor.trim()) return s;
      return {
        ...s,
        claims: s.claims.map((x) =>
          x.case_id === c.case_id ? { ...x, recommendation_v1: a.record.to_rec, flow: FLOW_OF[a.record.to_rec], ui_status: "reviewed" } : x,
        ),
        log: appendLog(s.log, { ...a.record, timestamp: a.timestamp }),
      };
    }
    case "setReviewer":
      return { ...s, reviewer: a.name };
    case "setRules":
      return { ...s, draftRules: a.rules };
    case "resetDraft":
      return { ...s, draftRules: getPolicy().rules, quoteLimit: 1500 };
    case "setQuoteLimit":
      return { ...s, quoteLimit: a.limit, draftRules: withLimit(s.draftRules, a.limit) };
    case "policyDecision":
      return { ...s, log: appendLog(s.log, a.record), gateOpen: s.gateOpen || a.record.type === "policy_approved" };
  }
}

interface Ctx {
  state: State;
  dispatch: (a: Action) => void;
  derived: DerivedClaim[];
  v1Rules: PolicyRule[];
  v1Hash: string;
  draftHash: string;
}
export const StoreCtx = createContext<Ctx | null>(null);

export function initialStoreState(): State {
  return {
    claims: getClaims(),
    draftRules: getDraftPolicy().rules,
    log: getLog(),
    reviewer: "Jonas Weber",
    quoteLimit: 1200,
    gateOpen: false,
    handlingRates: getHandlingRates(),
  };
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("StoreProvider missing");
  return c;
}

export type { Rec };
