import { createContext, useContext } from "react";
import type {
  Account,
  Claim,
  Flow,
  LogEntry,
  PolicyDecision,
  PolicyRule,
  Rec,
  ReviewerOverride,
} from "@/types";
import {
  appendLog,
  getClaims,
  getDraftPolicy,
  getLog,
  getPolicy,
  getHandlingRates,
} from "@/data/api";
import type { LiveSnapshot } from "@/data/live";
import type { HandlingRates } from "@/lib/policy-impact";
import { DEFAULT_ASSUMPTIONS, sanitizeAssumption, type SavingsAssumptions } from "@/lib/savings";
import { FLOW_OF } from "@/copy";
import type { DerivedClaim } from "@/lib/report";

export type QuoteLimit = number;

export type DataSource = "connecting" | "live" | "demo";

interface State {
  /** Signed-in profile; null shows the sign-in screen. The role comes from this profile. */
  user: Account | null;
  claims: Claim[];
  draftRules: PolicyRule[];
  log: LogEntry[];
  reviewer: string;
  quoteLimit: QuoteLimit;
  gateOpen: boolean;
  handlingRates: HandlingRates;
  /** Inputs of the savings view, editable for the session. */
  assumptions: SavingsAssumptions;
  /** "live": everything comes from the triage API. "demo": the team's seed data, because the API was unreachable. */
  source: DataSource;
  sourceError: string | null;
  v1Rules: PolicyRule[];
  v1Hash: string;
  integrity: LiveSnapshot["integrity"] | null;
  /** The engine's v2 rules and hash, so the approval screen can tell whether the draft is what the engine checks. */
  engineV2: string | null;
  engineV2Hash: string | null;
}

type Action =
  | { type: "live"; snapshot: LiveSnapshot }
  | { type: "sourceError"; message: string }
  | { type: "setHandlingRate"; flow: Flow; rate: number | null }
  | { type: "setAssumption"; key: keyof SavingsAssumptions; value: number }
  | { type: "resetAssumptions" }
  | { type: "confirm"; case_id: string; timestamp: string }
  | {
      type: "undoConfirm";
      case_id: string;
      timestamp: string;
      confirmationTimestamp: string;
      previousStatus?: "reviewed";
    }
  | { type: "override"; record: Omit<ReviewerOverride, "timestamp">; timestamp: string }
  | { type: "prepareInfo"; case_id: string; timestamp: string }
  | { type: "markInfoSent"; case_id: string; timestamp: string }
  | { type: "signIn"; account: Account }
  | { type: "signOut" }
  | { type: "setRules"; rules: PolicyRule[] }
  | { type: "resetDraft" }
  | { type: "setQuoteLimit"; limit: QuoteLimit }
  | { type: "policyDecision"; record: PolicyDecision };

export function withLimit(rules: PolicyRule[], limit: number): PolicyRule[] {
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
    case "live":
      return {
        ...s,
        source: "live",
        sourceError: null,
        claims: a.snapshot.claims,
        draftRules: a.snapshot.draft.rules,
        v1Rules: a.snapshot.v1.rules,
        v1Hash: a.snapshot.v1.hash,
        log: a.snapshot.log,
        integrity: a.snapshot.integrity,
        engineV2: JSON.stringify(a.snapshot.draft.rules),
        engineV2Hash: a.snapshot.draft.hash,
      };
    case "sourceError":
      return { ...s, source: "demo", sourceError: a.message };
    case "setHandlingRate":
      if (a.rate !== null && (!Number.isFinite(a.rate) || a.rate < 0)) return s;
      return {
        ...s,
        handlingRates: { ...getHandlingRates(), ...s.handlingRates, [a.flow]: a.rate },
      };
    case "setAssumption": {
      const value = sanitizeAssumption(a.key, a.value);
      if (value === null) return s;
      return { ...s, assumptions: { ...DEFAULT_ASSUMPTIONS, ...s.assumptions, [a.key]: value } };
    }
    case "resetAssumptions":
      return { ...s, assumptions: { ...DEFAULT_ASSUMPTIONS } };
    case "confirm": {
      const claim = s.claims.find((c) => c.case_id === a.case_id);
      if (
        !claim ||
        claim.case_status === "closed" ||
        claim.ui_status === "reviewed" ||
        !s.reviewer.trim()
      )
        return s;
      return {
        ...s,
        claims: s.claims.map((c) =>
          c.case_id === a.case_id ? { ...c, ui_status: "reviewed" } : c,
        ),
        log: appendLog(s.log, {
          type: "reviewer_accept",
          case_id: claim.case_id,
          actor: s.reviewer.trim(),
          from_rec: claim.recommendation_v1,
          to_rec: claim.recommendation_v1,
          note: "Recommendation confirmed",
          policy_version: claim.policy_version,
          policy_hash: claim.policy_hash,
          timestamp: a.timestamp,
        }),
      };
    }
    case "undoConfirm": {
      const claim = s.claims.find((c) => c.case_id === a.case_id);
      const latest = [...s.log]
        .reverse()
        .find((entry) => "case_id" in entry && entry.case_id === a.case_id);
      if (
        !claim ||
        claim.case_status === "closed" ||
        latest?.type !== "reviewer_accept" ||
        latest.timestamp !== a.confirmationTimestamp
      )
        return s;
      return {
        ...s,
        claims: s.claims.map((c) =>
          c.case_id === a.case_id ? { ...c, ui_status: a.previousStatus } : c,
        ),
        log: appendLog(s.log, {
          type: "final_decision",
          case_id: claim.case_id,
          actor: s.reviewer.trim(),
          from_rec: claim.recommendation_v1,
          to_rec: claim.recommendation_v1,
          note: `Confirmation undone; original record retained (${a.confirmationTimestamp})`,
          policy_version: latest.policy_version,
          policy_hash: latest.policy_hash,
          timestamp: a.timestamp,
        }),
      };
    }
    case "override": {
      const c = s.claims.find((x) => x.case_id === a.record.case_id);
      if (
        !c ||
        c.case_status === "closed" ||
        a.record.from_rec !== c.recommendation_v1 ||
        !["routine_processing", "request_information", "human_review"].includes(a.record.to_rec) ||
        !["policy_wrong", "data_wrong", "judgement"].includes(a.record.reason_code) ||
        a.record.from_rec === a.record.to_rec ||
        !a.record.note.trim() ||
        !a.record.actor.trim()
      )
        return s;
      return {
        ...s,
        claims: s.claims.map((x) =>
          x.case_id === c.case_id
            ? {
                ...x,
                recommendation_v1: a.record.to_rec,
                flow: FLOW_OF[a.record.to_rec],
                ui_status: "reviewed",
              }
            : x,
        ),
        log: appendLog(s.log, { ...a.record, timestamp: a.timestamp }),
      };
    }
    case "prepareInfo": {
      // Records that a reviewer drafted an information request. Nothing is sent from this tool.
      const claim = s.claims.find((c) => c.case_id === a.case_id);
      const latest = [...s.log]
        .reverse()
        .find((e) => "case_id" in e && e.case_id === a.case_id && e.type !== "system_decision");
      if (!claim || claim.case_status === "closed" || latest?.type === "info_request_prepared")
        return s;
      return {
        ...s,
        log: appendLog(s.log, {
          type: "info_request_prepared",
          case_id: claim.case_id,
          actor: s.reviewer.trim(),
          note: "Information request drafted for copying; not sent by this tool",
          policy_version: claim.policy_version,
          policy_hash: claim.policy_hash,
          timestamp: a.timestamp,
        }),
      };
    }
    case "markInfoSent": {
      // The reviewer says the email went out from their own mailbox. This tool cannot know that itself.
      const claim = s.claims.find((c) => c.case_id === a.case_id);
      const latest = [...s.log]
        .reverse()
        .find((e) => "case_id" in e && e.case_id === a.case_id && e.type !== "system_decision");
      if (!claim || claim.case_status === "closed" || latest?.type === "info_request_sent") return s;
      return {
        ...s,
        log: appendLog(s.log, {
          type: "info_request_sent",
          case_id: claim.case_id,
          actor: s.reviewer.trim(),
          note: "Reviewer marked the information request as sent from their own mailbox",
          policy_version: claim.policy_version,
          policy_hash: claim.policy_hash,
          timestamp: a.timestamp,
        }),
      };
    }
    case "signIn":
      return { ...s, user: a.account, reviewer: a.account.name };
    case "signOut":
      return { ...s, user: null };
    case "setRules":
      return { ...s, draftRules: a.rules };
    case "resetDraft":
      return { ...s, draftRules: s.v1Rules, quoteLimit: 1500 };
    case "setQuoteLimit":
      return { ...s, quoteLimit: a.limit, draftRules: withLimit(s.draftRules, a.limit) };
    case "policyDecision":
      return {
        ...s,
        log: appendLog(s.log, a.record),
        gateOpen: s.gateOpen || a.record.type === "policy_approved",
      };
  }
}

interface Ctx {
  state: State;
  /** False until the saved session has been read on the client, so SSR never flashes sign-in. */
  hydrated: boolean;
  dispatch: (a: Action) => void;
  derived: DerivedClaim[];
  v1Rules: PolicyRule[];
  v1Hash: string;
  draftHash: string;
}
export const StoreCtx = createContext<Ctx | null>(null);

export function initialStoreState(): State {
  // Seed data first, so the first paint never waits on the network. StoreProvider replaces it with the live snapshot.
  return {
    user: null,
    claims: getClaims(),
    draftRules: getDraftPolicy().rules,
    log: getLog(),
    reviewer: "Jonas Weber",
    quoteLimit: 1200,
    gateOpen: false,
    handlingRates: getHandlingRates(),
    assumptions: { ...DEFAULT_ASSUMPTIONS },
    source: "connecting",
    sourceError: null,
    v1Rules: getPolicy().rules,
    v1Hash: getPolicy().hash,
    integrity: null,
    engineV2: null,
    engineV2Hash: null,
  };
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("StoreProvider missing");
  return c;
}

export type { Rec };
