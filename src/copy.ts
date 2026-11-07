// Every user-facing string that carries a copy rule lives here so it can be audited in one place.
import type { Flow, Rec, ReasonCode, LogEntry } from "./types";

export const PROBLEM_STATEMENT =
  "Insurers spend reviewer time triaging claims that clear rules could route, and cannot see which claims a policy change will affect until after it is live.";
export const PROBLEM_SUBLINE =
  "This tool recommends a next step for each claim. A person always makes the call.";

export const REC_LABEL: Record<Rec, string> = {
  human_review: "Human review",
  request_information: "Request information",
  routine_processing: "Routine processing",
};
export const FLOW_OF: Record<Rec, Flow> = {
  human_review: "red",
  request_information: "yellow",
  routine_processing: "green",
};
export const REC_OF: Record<Flow, Rec> = {
  red: "human_review",
  yellow: "request_information",
  green: "routine_processing",
};
export const REC_ORDER: Rec[] = ["human_review", "request_information", "routine_processing"];

export const NOT_PROVIDED = "not provided, not assumed";
export const LOCKED = "Locked";
export const LOCKED_TOOLTIP = "Locked: closed claims cannot change";
export const LOCKED_BANNER = "Locked: this claim is closed and is not affected by policy changes.";
export const RULE_BASED = "Rule-based, not a prediction";
export const CASE_OVERVIEW = "Case overview";
export const CASE_DETAILS = "Rules and evidence";
export const REVIEW_COPY = {
  why: "Why this recommendation",
  evidence: "Why / Rules and evidence",
  audit: "Your decision will be recorded in the audit log.",
  reviewed: "Reviewed",
  undo: "Undo",
  undone: "Confirmation undone — recorded",
};
export const confirmAction = (rec: Rec) => `Confirm: ${REC_LABEL[rec]}`;
export const IMPACT_COPY = {
  title: "Expected impact",
  subtitle: "If you release v2 · rule-based, not a prediction",
  delta: "Δ",
  assumed: "ASSUMED",
  session:
    "Draft edits are session only. Release records your decision for this session; Reset restores live rules.",
  locked: "Closed claims stay locked.",
  releaseSummary: "Review v2 before release",
  volume: "Claim volume",
  live: "Live",
  expected: "Expected",
  cost: "Handling cost per claim",
  rates: "Handling cost by flow · EUR / claim",
  flows: { green: "Green flow", yellow: "Yellow flow", red: "Red flow" },
};

export const CONFIRM_REC = "Confirm recommendation";
export const OVERRIDE_REC = "Override recommendation";
export const CHANGE_REC = "Change recommendation";
export const PREPARE_INFO = "Prepare information request";
export const COPY_TEXT = "Copy text";
export const CONFIRM_TOAST = "Recommendation confirmed — recorded";
export const changeTo = (r: Rec) => `Change to ${REC_LABEL[r]}`;

export const REASON_LABEL: Record<ReasonCode, { label: string; help: string }> = {
  policy_wrong: { label: "Policy wrong", help: "The rule itself is wrong" },
  data_wrong: { label: "Data wrong", help: "A fact on file is wrong" },
  judgement: { label: "Judgement", help: "Reviewer judgement" },
};

export const REFUSAL = {
  note: "Add a note. Overrides need a reason in words.",
  actor: "Add your name. Every override has a named reviewer.",
  same: "This override changes nothing. Pick a different next step.",
  unknownRec: "Unknown recommendation. Choose one of the three next steps.",
  fourEyes: "Four-eyes rule: the approver must be a different person from the author.",
  reason: "Add a sign-off reason.",
};

export const RELEASE_V2 = "Release v2";
export const HOLD_V2 = "Hold v2";
export const ADD_RULE = "Add rule";
export const SORT_RECENT = "Sorted most recent to oldest";

export const INFO_FOOTNOTE =
  "Copy and send from your usual channel. This tool never sends anything.";
export const EMAIL_LABEL = "AI-drafted placeholder text. Nothing is generated or sent here.";
export const CONSISTENCY_CAPTION =
  "Consistency, not accuracy. Labels are past reviewer outcomes, not ground truth.";

export const LOG_TYPE_LABEL: Record<LogEntry["type"], string> = {
  system_decision: "System decision",
  reviewer_accept: "Reviewer accepted",
  reviewer_override: "Reviewer override",
  policy_proposed: "Policy proposed",
  policy_approved: "Policy released",
  policy_rejected: "Policy held",
  final_decision: "Final decision",
  info_request_prepared: "Information request prepared",
};
