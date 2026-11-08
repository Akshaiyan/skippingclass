// What the dashboard says about a pending policy change, derived from the claims alone. Rule-derived text, not a model:
// every number is a count of claims, and the sentence never claims a decision was made.
import type { Rec } from "@/types";
import { REC_LABEL } from "@/copy";

export interface ChangeInput {
  case_status: "open" | "closed";
  recommendation_v1: Rec;
  recommendation_v2: Rec;
  needs_recheck: boolean;
}

export interface ChangeGroup {
  from: Rec;
  to: Rec;
  n: number;
}

/** Open claims whose recommendation differs under the draft, grouped by the move, largest first. */
export function changeGroups(claims: ChangeInput[]): ChangeGroup[] {
  const m = new Map<string, ChangeGroup>();
  for (const c of claims) {
    if (c.case_status !== "open" || !c.needs_recheck) continue;
    const key = `${c.recommendation_v1}>${c.recommendation_v2}`;
    const g = m.get(key) ?? { from: c.recommendation_v1, to: c.recommendation_v2, n: 0 };
    g.n += 1;
    m.set(key, g);
  }
  return [...m.values()].sort((a, b) => b.n - a.n);
}

const lower = (r: Rec) => REC_LABEL[r].toLowerCase();

/** `label` is "the draft" before a release and "v2" after it. */
export function changeSentence(openTotal: number, groups: ChangeGroup[], label = "the draft"): string {
  const changed = groups.reduce((s, g) => s + g.n, 0);
  if (changed === 0) return `No open claim has a recommendation that changes under ${label}.`;
  const moves = groups.map((g) => `${g.n} ${lower(g.from)} → ${lower(g.to)}`).join(", ");
  return `${changed} of ${openTotal} open ${openTotal === 1 ? "claim changes" : "claims change"} under ${label}: ${moves}. No claim is re-decided until a reviewer acts.`;
}
