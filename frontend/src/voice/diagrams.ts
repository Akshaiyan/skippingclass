// Diagram specs for the voice assistant. Pure functions: they read the live claims and rules and return a
// description of a diagram (nodes, edges); layout.ts places it and DiagramPanel.tsx draws it.
import type { Claim, PolicyRule, Rec } from "@/types";
import { REC_LABEL, REC_ORDER } from "@/copy";
import { conditionText, flipList, removedRules, ruleStatus, type DerivedClaim } from "@/lib/report";
import { ruleChangeNote } from "@/lib/policy-view";

export type Tone = "red" | "yellow" | "green" | "dark" | "neutral";

export interface DNode {
  id: string;
  label: string;
  /** Small text under the label. */
  sub?: string;
  /** Small text above the label. Colour never stands alone, so toned nodes always carry one. */
  tag?: string;
  tone: Tone;
  /** Position along the flow direction, and across it. Left out = placed automatically. */
  layer?: number;
  slot?: number;
  /** Scales the node's size across the flow (claim counts). */
  weight?: number;
  muted?: boolean;
}
export interface DEdge {
  from: string;
  to: string;
  label?: string;
  weight?: number;
  muted?: boolean;
}
export interface DiagramSpec {
  kind: string;
  title: string;
  caption?: string;
  /** "auto" lets the layout choose: tall flows run top to bottom, short ones left to right. */
  direction: "right" | "down" | "auto";
  nodes: DNode[];
  edges: DEdge[];
}

export const TONE_OF_REC: Record<Rec, Tone> = {
  human_review: "red",
  request_information: "yellow",
  routine_processing: "green",
};
export const TAG_OF_TONE: Partial<Record<Tone, string>> = {
  red: "Human review",
  yellow: "Request information",
  green: "Routine processing",
};
const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const idList = (ids: string[], max = 4) =>
  ids.length <= max ? ids.join(", ") : `${ids.slice(0, max).join(", ")} +${ids.length - max}`;

/** "ABSENT(quote_eur)" is the engine's way of saying a needed fact is blank. */
export const ruleText = (rule: string) => {
  const m = /^ABSENT\((.*)\)$/.exec(rule);
  return m ? `blank fact: ${m[1]!.split(",").join(", ")}` : rule.split("+").join(" + ");
};

/** One claim: every rule is checked against its facts, and the fired ones decide. */
export function claimPathDiagram(c: Claim): DiagramSpec {
  const rec = c.recommendation_v1;
  const nodes: DNode[] = [
    {
      id: "claim",
      label: c.case_id,
      sub: short(c.claim_summary || "Claim facts", 70),
      tone: "dark",
      layer: 0,
      slot: 0,
    },
  ];
  const edges: DEdge[] = [];
  const deciding: string[] = [];
  c.checklist.forEach((k, i) => {
    const fired = k.result === "true";
    const blank = k.result === "unknown";
    if ((fired && k.outcome === rec) || (blank && rec === "request_information"))
      deciding.push(k.id);
    nodes.push({
      id: k.id,
      label: k.description,
      sub: short(k.evidence || k.id, 60),
      tag: fired ? "Fired" : blank ? "Can't tell: a fact is blank" : "Passed",
      tone: fired ? TONE_OF_REC[k.outcome] : blank ? "yellow" : "neutral",
      muted: !fired && !blank,
      layer: 1,
      slot: i,
    });
    edges.push({ from: "claim", to: k.id, muted: true });
  });
  nodes.push({
    id: "result",
    label: REC_LABEL[rec],
    sub: `Decided by ${ruleText(c.rule_v1)}`,
    tag: "Recommendation",
    tone: TONE_OF_REC[rec],
    layer: 2,
    slot: Math.max(0, (c.checklist.length - 1) / 2),
  });
  if (deciding.length) deciding.forEach((id) => edges.push({ from: id, to: "result" }));
  else
    // Routine: nothing fired. The fallback rule (or every passed rule) leads to the result.
    c.checklist
      .filter((k) => k.id.startsWith("R3") || c.rule_v1.split("+").includes(k.id))
      .forEach((k) => edges.push({ from: k.id, to: "result", label: "nothing else fired" }));
  return {
    kind: "claim_path",
    title: `${c.case_id}: how the rules decided`,
    caption:
      "Every rule is checked. Red flags outrank missing information; otherwise routine processing.",
    direction: "right",
    nodes,
    edges,
  };
}

/** The decision ladder: rules top to bottom, each with the outcome it leads to. v2 marks what changed. */
export function policyFlowDiagram(
  version: "v1" | "v2",
  v1: PolicyRule[],
  draft: PolicyRule[],
): DiagramSpec {
  const rules = version === "v2" ? draft : v1;
  const nodes: DNode[] = [];
  const edges: DEdge[] = [];
  let changed = 0;
  const rows: (PolicyRule & { gone?: boolean })[] = [
    ...rules,
    ...(version === "v2" ? removedRules(v1, draft).map((r) => ({ ...r, gone: true })) : []),
  ];
  rows.forEach((r, i) => {
    const off = r.active === false;
    let tag: string | undefined;
    if (r.gone) tag = "Removed in the draft";
    else if (off) tag = "Switched off";
    else if (version === "v2") {
      const status = ruleStatus(v1, r);
      const note = ruleChangeNote(v1, r);
      if (status === "added") tag = "Added";
      else if (status === "changed") tag = `Changed${note ? `: ${note}` : ""}`;
    }
    if (tag && version === "v2" && !off) changed++;
    nodes.push({
      id: r.id,
      label: r.description,
      sub: r.condition ? short(conditionText(r.condition), 70) : r.id,
      tag,
      tone: tag && version === "v2" && !off ? "dark" : "neutral",
      muted: off || r.gone,
      layer: i,
      slot: 0,
    });
    const out = `out:${r.id}`;
    nodes.push({
      id: out,
      label: REC_LABEL[r.outcome],
      tag: TAG_OF_TONE[TONE_OF_REC[r.outcome]],
      tone: TONE_OF_REC[r.outcome],
      muted: off || r.gone,
      layer: i,
      slot: 1,
    });
    edges.push({
      from: r.id,
      to: out,
      label: r.condition ? "yes" : "otherwise",
      muted: off || r.gone,
    });
    const next = rows[i + 1];
    if (next && r.condition && !r.gone)
      edges.push({ from: r.id, to: next.id, label: "no", muted: true });
  });
  return {
    kind: "policy_flow",
    title: version === "v2" ? "Draft policy v2 (not released)" : "Live policy v1",
    caption:
      version === "v2"
        ? changed
          ? `${changed} ${changed === 1 ? "rule differs" : "rules differ"} from the live policy. Dark boxes are the changes.`
          : "The draft is the same as the live policy."
        : "Rules are read top to bottom. Red flags come before missing information; otherwise routine.",
    direction: "down",
    nodes,
    edges,
  };
}

const openOnly = (claims: DerivedClaim[]) => claims.filter((c) => c.case_status === "open");

/** Where the open claims end up, sized by count. */
export function routingDiagram(claims: DerivedClaim[]): DiagramSpec {
  const o = openOnly(claims);
  const nodes: DNode[] = [
    {
      id: "all",
      label: "Open claims",
      sub: `${o.length} ${o.length === 1 ? "claim" : "claims"}`,
      tone: "dark",
      layer: 0,
      slot: 1,
    },
  ];
  const edges: DEdge[] = [];
  REC_ORDER.forEach((rec, i) => {
    const ids = o.filter((c) => c.recommendation_v1 === rec).map((c) => c.case_id);
    nodes.push({
      id: rec,
      label: `${REC_LABEL[rec]}: ${ids.length}`,
      sub: ids.length ? idList(ids, 6) : "none",
      tag: TAG_OF_TONE[TONE_OF_REC[rec]],
      tone: TONE_OF_REC[rec],
      weight: ids.length,
      muted: !ids.length,
      layer: 1,
      slot: i,
    });
    edges.push({ from: "all", to: rec, weight: ids.length, muted: !ids.length });
  });
  const closed = claims.length - o.length;
  return {
    kind: "routing_breakdown",
    title: "Where the open claims end up",
    caption: closed
      ? `${closed} closed ${closed === 1 ? "claim is" : "claims are"} not counted.`
      : undefined,
    direction: "right",
    nodes,
    edges,
  };
}

/** Which open claims would move under the draft policy, and where. */
export function policyChangeDiagram(claims: DerivedClaim[]): DiagramSpec {
  const o = openOnly(claims);
  const nodes: DNode[] = [];
  REC_ORDER.forEach((rec, i) => {
    const now = o.filter((c) => c.recommendation_v1 === rec).length;
    const next = o.filter((c) => c.recommendation_v2 === rec).length;
    nodes.push(
      {
        id: `a:${rec}`,
        label: REC_LABEL[rec],
        sub: `${now} now`,
        tag: "Live policy",
        tone: TONE_OF_REC[rec],
        layer: 0,
        slot: i,
      },
      {
        id: `b:${rec}`,
        label: REC_LABEL[rec],
        sub: `${next} under the draft`,
        tag: "Draft v2",
        tone: TONE_OF_REC[rec],
        layer: 1,
        slot: i,
      },
    );
  });
  const edges: DEdge[] = [];
  let moved = 0;
  for (const from of REC_ORDER)
    for (const to of REC_ORDER) {
      const ids = o
        .filter((c) => c.recommendation_v1 === from && c.recommendation_v2 === to)
        .map((c) => c.case_id);
      if (!ids.length) continue;
      if (from !== to) moved += ids.length;
      edges.push({
        from: `a:${from}`,
        to: `b:${to}`,
        label: from === to ? `${ids.length} stay` : idList(ids, 3),
        weight: ids.length,
        muted: from === to,
      });
    }
  const locked = flipList(claims).filter((f) => f.status === "locked").length;
  return {
    kind: "policy_change",
    title: "What the draft v2 policy would change",
    caption:
      (moved
        ? `${moved} of ${o.length} open claims would move. Grey arrows stay put.`
        : `No open claim would move: the draft gives the same result for all ${o.length}.`) +
      (locked
        ? ` ${locked} closed ${locked === 1 ? "claim stays" : "claims stay"} as decided.`
        : "") +
      " The draft is not released.",
    direction: "right",
    nodes,
    edges,
  };
}

export const MAX_CUSTOM_STEPS = 14;
const COLOURS = new Set(["red", "yellow", "green", "dark"]);

/**
 * Parses the agent's own flow text: one connection per line (or per ";") as "step > next step | arrow label",
 * with an optional " #red" / "#green" / "#yellow" / "#dark" after a step. Chains like "a > b > c" work too.
 */
export function customDiagram(
  title: string | undefined,
  flow: string,
  direction?: string,
): DiagramSpec | { error: string } {
  const nodes = new Map<string, DNode>();
  const edges: DEdge[] = [];
  const step = (raw: string): string | null => {
    let text = raw.trim();
    let tone: Tone | null = null;
    const m = /\s#([a-z]+)\s*$/i.exec(text);
    if (m && COLOURS.has(m[1]!.toLowerCase())) {
      tone = m[1]!.toLowerCase() as Tone;
      text = text.slice(0, m.index).trim();
    }
    if (!text) return null;
    const key = text.toLowerCase().replace(/\s+/g, " ");
    const node = nodes.get(key) ?? { id: key, label: short(text, 48), tone: "neutral" as Tone };
    if (tone) {
      node.tone = tone;
      node.tag = TAG_OF_TONE[tone];
    }
    nodes.set(key, node);
    return key;
  };
  for (const line of String(flow ?? "").split(/\r?\n|;/)) {
    if (!line.trim()) continue;
    const bar = line.lastIndexOf("|");
    const label = bar >= 0 ? line.slice(bar + 1).trim() : "";
    const chain = (bar >= 0 ? line.slice(0, bar) : line).split(">").map(step);
    for (let i = 0; i + 1 < chain.length; i++) {
      const from = chain[i];
      const to = chain[i + 1];
      if (!from || !to) continue;
      const edge: DEdge = { from, to };
      if (label && i === chain.length - 2) edge.label = short(label, 30);
      edges.push(edge);
    }
  }
  if (nodes.size === 0)
    return { error: "The flow had no steps. Write one connection per line as 'step > next step'." };
  if (nodes.size > MAX_CUSTOM_STEPS)
    return {
      error: `That flow has ${nodes.size} steps; keep it to ${MAX_CUSTOM_STEPS} or fewer and try again.`,
    };
  return {
    kind: "custom",
    title: short(title?.trim() || "Diagram", 60),
    direction: direction === "down" || direction === "right" ? direction : "auto",
    nodes: [...nodes.values()],
    edges,
  };
}
