export type Role = "insurance_claimer" | "operations_lead";

/** A user profile. The role is stored on the profile and never chosen at sign-in. */
export interface Account {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export type Rec = "routine_processing" | "request_information" | "human_review";
export type Flow = "green" | "yellow" | "red";
export type Tri = "true" | "false" | "unknown"; // fired / passed / undecidable

export interface RuleCheck {
  id: string;
  description: string;
  outcome: Rec;
  result: Tri;
  evidence: string;
}

export interface Claim {
  case_id: string;
  case_status: "open" | "closed";
  claim_summary: string;
  recommendation_v1: Rec;
  recommendation_v2?: Rec;
  flow: Flow;
  rule_v1: string;
  rule_v2?: string;
  explanation: string;
  checklist: RuleCheck[];
  facts: Record<string, string | number | boolean | null>;
  blank_fields: string[];
  policy_version: string;
  policy_hash: string;
  needs_recheck: boolean;
  ui_status?: "reviewed";
}

export type ReasonCode = "policy_wrong" | "data_wrong" | "judgement";

export interface ReviewerOverride {
  type: "reviewer_override";
  case_id: string;
  actor: string;
  from_rec: Rec;
  to_rec: Rec;
  reason_code: ReasonCode;
  note: string;
  policy_version: string;
  policy_hash: string;
  timestamp: string;
}

export interface PolicyDecision {
  type: "policy_approved" | "policy_rejected";
  actor: string;
  reason: string;
  policy_version: string;
  policy_hash: string;
  timestamp: string;
}

export interface SystemRecord {
  type: "system_decision" | "reviewer_accept" | "policy_proposed" | "final_decision";
  case_id?: string;
  actor: string;
  from_rec?: Rec;
  to_rec?: Rec;
  note?: string;
  policy_version: string;
  policy_hash: string;
  timestamp: string;
}

export type LogEntry = (ReviewerOverride | PolicyDecision | SystemRecord) & { seq: number };

export type Op =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "not_in"
  | "is_blank"
  | "is_not_blank"
  | "before"
  | "after";
export type Operand =
  | { kind: "value"; value: string | number | boolean | string[] }
  | { kind: "field"; field: string; factor?: number };
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { field: string; op: Op; right?: Operand };
export interface PolicyRule {
  id: string;
  outcome: Rec;
  description: string;
  condition: Condition | null;
  /** Missing means active, keeping existing API and seed payloads compatible. */
  active?: boolean;
}
export interface Policy {
  version: string;
  hash: string;
  author: string;
  rules: PolicyRule[];
}
