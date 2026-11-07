import type { Rec, ReasonCode } from "@/types";
import { REFUSAL, REC_ORDER } from "@/copy";

export interface OverrideInput {
  from: Rec;
  to: Rec | null | string;
  reason: ReasonCode | null;
  note: string;
  actor: string;
}
export type OverrideErrors = Partial<Record<"to" | "note" | "actor" | "reason", string>>;

export function validateOverride(i: OverrideInput): OverrideErrors {
  const e: OverrideErrors = {};
  if (!i.to || !REC_ORDER.includes(i.to as Rec)) e.to = REFUSAL.unknownRec;
  else if (i.to === i.from) e.to = REFUSAL.same;
  if (!i.reason) e.reason = "Choose a reason code.";
  if (!i.note.trim()) e.note = REFUSAL.note;
  if (!i.actor.trim()) e.actor = REFUSAL.actor;
  return e;
}

export const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export interface GateInput {
  author: string;
  approver: string;
  reason: string;
  checksPass: boolean;
}
export function validateGate(g: GateInput) {
  const approverErr = !g.approver.trim()
    ? "Add the approver's name."
    : sameName(g.author, g.approver)
      ? REFUSAL.fourEyes
      : null;
  const reasonErr = g.reason.trim() ? null : REFUSAL.reason;
  return {
    approverErr,
    reasonErr,
    canRelease: !approverErr && !reasonErr && g.checksPass,
    canHold: !approverErr && !reasonErr,
  };
}
