// What the app tells Aegis after the reviewer records something, so it can say one short thing back.
// The message is a user-style text message (the only way to make the agent speak), so it opens with a marker
// the agent's prompt knows, and it carries the facts and the instruction together.
import type { ReviewerOverride } from "@/types";
import { REC_LABEL } from "@/copy";
import { byUrgency } from "@/lib/claim-view";
import type { DerivedClaim } from "@/lib/report";

export const APP_EVENT_MARK = "[App event]";

export function overrideFollowUp(record: ReviewerOverride, claims: DerivedClaim[]): string {
  // The store has not re-rendered yet, so apply this override to the list by hand.
  const after = claims.map((c) =>
    c.case_id === record.case_id ? { ...c, recommendation_v1: record.to_rec, flow: c.flow } : c,
  );
  const waiting = after
    .filter((c) => c.case_status === "open" && c.recommendation_v1 === "human_review")
    .filter((c) => c.case_id !== record.case_id || record.to_rec === "human_review")
    .sort((a, b) => byUrgency(a, b));
  const left = waiting.length
    ? `${waiting.length} open human review ${waiting.length === 1 ? "claim is" : "claims are"} still waiting, starting with ${waiting[0]!.case_id}.`
    : "No open human review claims are waiting now.";
  return (
    `${APP_EVENT_MARK} ${record.actor} just recorded an override on ${record.case_id}: ` +
    `${REC_LABEL[record.from_rec].toLowerCase()} to ${REC_LABEL[record.to_rec].toLowerCase()}, ` +
    `reason code ${record.reason_code}, note "${record.note}". It is recorded in the decision log. ${left} ` +
    `Reply with one short spoken sentence confirming it is recorded, and at most one quick suggestion for what to do next. ` +
    `Do not repeat the details back and do not call any tool.`
  );
}
