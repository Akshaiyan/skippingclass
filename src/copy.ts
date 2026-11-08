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
export const LOCKED = "Closed";
export const LOCKED_TOOLTIP = "Closed claims cannot change";
export const LOCKED_BANNER = "This claim is closed. Policy changes do not affect it.";
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
  subtitle: "If you release v2. Rule-based, not a prediction.",
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
  flows: { green: "Routine processing", yellow: "Missing information", red: "Human review" },
};

// Policy change page. Rule tags say "Added", never "new" (copy rule).
export const POLICY_COPY = {
  title: "Policy change",
  subtitle: "Edit triage rules and preview their expected impact.",
  rulesChanged: (n: number) => `${n} ${n === 1 ? "rule" : "rules"} changed`,
  notReleased: "not released",
  noChanges: "No changes · live rules apply",
  released: "v2 is live",
  discard: "Discard",
  reviewChanges: "Review changes",
  rules: "Rules",
  rulesHelp:
    "What decides each claim's flow. Red flags decide before missing information; otherwise routine.",
  quoteLimit: "Quote limit",
  tagChanged: "Changed",
  tagAdded: "Added",
  tagInactive: "Inactive",
  removed: "Removed from draft",
  expectations: "Expectations",
  expectationsHelp: "How open claims would flow under the draft. Rule-based, not a prediction.",
  preview: "Preview · unreleased",
  nowLiveTag: "Live",
  distribution: "Case distribution",
  live: "Live",
  expected: "Expected",
  nowLive: "Now live",
  openClaims: (n: number) => `${n} open claims`,
  changedClaims: "Claims that changed",
  changedOf: (n: number, total: number) => `${n} of ${total}`,
  causedBy: "Caused by",
  stricter: "Stricter",
  lessScrutiny: "Less scrutiny",
  noChangesYet: "No changes yet — edit a rule to preview impact",
  blankCaption: "Blank fields shown as not provided — never assumed.",
  handlingCost: "Handling cost / claim",
  extraReviewCost: "Extra Human review cost / month",
  missingFacts: (fields: string) => `Missing facts: ${fields}`,
  reviewRelease: "Review & release",
  reasonLabel: "Reason for this change",
  reasonPlaceholder: "Why release v2 now? (visible in the audit log)",
  approverLabel: "Second approver required",
  approverPlaceholder: "Select approver",
  routedDifferently: (n: number) =>
    `${n} ${n === 1 ? "claim" : "claims"} would be routed differently.`,
  intoRoutine: (n: number) => `${n} ${n === 1 ? "moves" : "move"} into Routine processing.`,
  needReasonApprover: "Add a reason and approver to release",
  needChange: "Edit a rule to enable release — the draft matches the live rules",
  statusNotReleased: "Not released",
  statusReleased: "Released",
  statusHeld: "Held",
  releasedToast: "v2 is live. Incoming claims use these rules from now.",
  heldToast: "v2 held. The live rules stay in place.",
  confirmTitle: "Release v2?",
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
