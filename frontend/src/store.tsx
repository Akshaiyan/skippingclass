import { createContext, useContext } from "react";
import type { Claim, LogEntry, PolicyDecision, PolicyRule, Rec, ReviewerOverride } from "@/types";
import { appendLog, getClaims, getDraftPolicy, getLog, getPolicy } from "@/data/api";
import type { LiveSnapshot } from "@/data/live";
import { FLOW_OF } from "@/copy";
import type { DerivedClaim } from "@/lib/report";

export type QuoteLimit = number;

export type DataSource = "connecting" | "live" | "demo";

interface State {
  claims: Claim[];
  draftRules: PolicyRule[];
  log: LogEntry[];
  reviewer: string;
  quoteLimit: QuoteLimit;
  gateOpen: boolean;
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
  | { type: "confirm"; case_id: string }
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
    case "confirm":
      return { ...s, claims: s.claims.map((c) => (c.case_id === a.case_id ? { ...c, ui_status: "reviewed" } : c)) };
    case "override": {
      const c = s.claims.find((x) => x.case_id === a.record.case_id);
      if (!c || c.case_status === "closed" || a.record.from_rec === a.record.to_rec || !a.record.note.trim() || !a.record.actor.trim()) return s;
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
      return { ...s, draftRules: s.v1Rules, quoteLimit: 1500 };
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
  // Seed data first, so the first paint never waits on the network. StoreProvider replaces it with the live snapshot.
  return {
    claims: getClaims(),
    draftRules: getDraftPolicy().rules,
    log: getLog(),
    reviewer: "Jonas Weber",
    quoteLimit: 1200,
    gateOpen: false,
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
