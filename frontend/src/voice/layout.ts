// Places a DiagramSpec on a grid and returns pixel positions. No dependencies: the diagrams are small
// (a dozen nodes), so a layered layout with a barycenter ordering pass is plenty.
import type { DEdge, DiagramSpec, DNode } from "./diagrams";

export interface PlacedNode extends DNode {
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
  subLines: string[];
  layer: number;
  slot: number;
}
export interface PlacedEdge extends DEdge {
  path: string;
  lx: number;
  ly: number;
  width: number;
}
export interface Placed {
  width: number;
  height: number;
  nodes: PlacedNode[];
  edges: PlacedEdge[];
  direction: "right" | "down";
}

const CHAR = 6.9; // average glyph width at 13px
const SUB_CHAR = 6.1; // at 11px
export const LINE = 17;
export const SUB_LINE = 14;
export const TAG_LINE = 14;
export const PAD_X = 14;
export const PAD_Y = 10;
const GAP_LAYER = 70;
const GAP_SLOT = 18;
const MARGIN = 16;

export function wrap(text: string, max: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > max) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]!.replace(/.$/, "")}…`;
    return kept;
  }
  return lines.length ? lines : [""];
}

/** Longest-path layering with cycles broken by ignoring back edges; slots ordered by their parents' slots. */
function autoPlace(spec: DiagramSpec) {
  const ids = spec.nodes.map((n) => n.id);
  const out = new Map<string, string[]>(ids.map((i) => [i, []]));
  for (const e of spec.edges)
    if (out.has(e.from) && out.has(e.to) && e.from !== e.to) out.get(e.from)!.push(e.to);
  const state = new Map<string, 1 | 2>();
  const back = new Set<string>();
  const visit = (id: string) => {
    state.set(id, 1);
    for (const t of out.get(id)!) {
      if (state.get(t) === 1) back.add(`${id}>${t}`);
      else if (!state.get(t)) visit(t);
    }
    state.set(id, 2);
  };
  ids.forEach((i) => {
    if (!state.get(i)) visit(i);
  });
  const layer = new Map<string, number>(ids.map((i) => [i, 0]));
  for (let pass = 0; pass < ids.length; pass++) {
    let moved = false;
    for (const [from, tos] of out)
      for (const to of tos)
        if (!back.has(`${from}>${to}`) && layer.get(to)! < layer.get(from)! + 1) {
          layer.set(to, layer.get(from)! + 1);
          moved = true;
        }
    if (!moved) break;
  }
  const byLayer = new Map<number, string[]>();
  for (const id of ids) byLayer.set(layer.get(id)!, [...(byLayer.get(layer.get(id)!) ?? []), id]);
  const slot = new Map<string, number>();
  [...byLayer.keys()]
    .sort((a, b) => a - b)
    .forEach((l) => {
      const score = (id: string) => {
        const p = spec.edges
          .filter((e) => e.to === id && slot.has(e.from))
          .map((e) => slot.get(e.from)!);
        return p.length ? p.reduce((a, b) => a + b, 0) / p.length : Number.POSITIVE_INFINITY;
      };
      byLayer
        .get(l)!
        .map((id, i) => ({ id, i, s: score(id) }))
        .sort((a, b) => (a.s === b.s ? a.i - b.i : a.s - b.s))
        .forEach((m, i) => slot.set(m.id, i));
    });
  return {
    layer,
    slot,
    layers: byLayer.size,
    widest: Math.max(...[...byLayer.values()].map((m) => m.length)),
  };
}

export function layoutDiagram(spec: DiagramSpec): Placed {
  const explicit = spec.nodes.every((n) => n.layer !== undefined && n.slot !== undefined);
  const auto = explicit ? null : autoPlace(spec);
  // Tall flows read better top to bottom; wide ones left to right.
  const direction: "right" | "down" =
    spec.direction === "auto"
      ? auto && auto.layers > 4 && auto.widest <= 3
        ? "down"
        : "right"
      : spec.direction;

  const sized: PlacedNode[] = spec.nodes.map((n) => {
    const lines = wrap(n.label, n.weight !== undefined ? 22 : 26, 3);
    const subLines = n.sub ? wrap(n.sub, 34, 3) : [];
    const textW = Math.max(
      ...lines.map((l) => l.length * CHAR),
      ...subLines.map((l) => l.length * SUB_CHAR),
      n.tag ? n.tag.length * SUB_CHAR : 0,
    );
    const w = Math.max(110, Math.min(260, Math.ceil(textW) + PAD_X * 2 + 8));
    let h = PAD_Y * 2 + lines.length * LINE + subLines.length * SUB_LINE + (n.tag ? TAG_LINE : 0);
    // Counts scale the box across the flow, so a bigger group reads as bigger.
    if (n.weight !== undefined) h += Math.min(n.weight, 8) * 7;
    return {
      ...n,
      layer: auto ? auto.layer.get(n.id)! : n.layer!,
      slot: auto ? auto.slot.get(n.id)! : n.slot!,
      w,
      h,
      lines,
      subLines,
      x: 0,
      y: 0,
    };
  });

  const horiz = direction === "right";
  // Boxes that line up share a width: a column when flowing right, a lane when flowing down.
  const group = (n: PlacedNode) => (horiz ? n.layer : n.slot);
  const widest = new Map<number, number>();
  for (const n of sized) widest.set(group(n), Math.max(widest.get(group(n)) ?? 0, n.w));
  for (const n of sized) n.w = widest.get(group(n))!;
  const primary = (n: PlacedNode) => (horiz ? n.w : n.h);
  const secondary = (n: PlacedNode) => (horiz ? n.h : n.w);
  const layerSize = new Map<number, number>();
  const slotSize = new Map<number, number>();
  for (const n of sized) {
    layerSize.set(n.layer, Math.max(layerSize.get(n.layer) ?? 0, primary(n)));
    slotSize.set(n.slot, Math.max(slotSize.get(n.slot) ?? 0, secondary(n)));
  }
  const offsets = (sizes: Map<number, number>, gap: number) => {
    const o = new Map<number, number>();
    let at = MARGIN;
    [...sizes.keys()]
      .sort((a, b) => a - b)
      .forEach((k) => {
        o.set(k, at);
        at += sizes.get(k)! + gap;
      });
    return { o, end: at - gap + MARGIN };
  };
  // Leave room between layers for the longest arrow label.
  const labelRoom = Math.max(0, ...spec.edges.map((e) => (e.label?.length ?? 0) * 6.2 + 36));
  const L = offsets(layerSize, horiz ? Math.max(GAP_LAYER, labelRoom) : GAP_LAYER);
  const S = offsets(slotSize, GAP_SLOT);
  for (const n of sized) {
    const p = L.o.get(n.layer)! + (layerSize.get(n.layer)! - primary(n)) / 2;
    const s = S.o.get(n.slot)! + (slotSize.get(n.slot)! - secondary(n)) / 2;
    n.x = horiz ? p : s;
    n.y = horiz ? s : p;
  }
  const byId = new Map(sized.map((n) => [n.id, n]));

  const edges: PlacedEdge[] = [];
  for (const e of spec.edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const dx = bc.x - ac.x;
    const dy = bc.y - ac.y;
    // Leave through the side facing the target, along the flow when the nodes sit in different layers.
    const useX = horiz
      ? a.layer !== b.layer || Math.abs(dy) < 1
      : a.layer === b.layer && Math.abs(dx) >= 1;
    const sign = (useX ? dx : dy) >= 0 ? 1 : -1;
    const p0 = useX
      ? { x: sign > 0 ? a.x + a.w : a.x, y: ac.y }
      : { x: ac.x, y: sign > 0 ? a.y + a.h : a.y };
    const p1 = useX
      ? { x: sign > 0 ? b.x : b.x + b.w, y: bc.y }
      : { x: bc.x, y: sign > 0 ? b.y : b.y + b.h };
    const mid = useX ? (p0.x + p1.x) / 2 : (p0.y + p1.y) / 2;
    edges.push({
      ...e,
      path: useX
        ? `M${p0.x},${p0.y} C${mid},${p0.y} ${mid},${p1.y} ${p1.x},${p1.y}`
        : `M${p0.x},${p0.y} C${p0.x},${mid} ${p1.x},${mid} ${p1.x},${p1.y}`,
      lx: (p0.x + p1.x) / 2,
      ly: (p0.y + p1.y) / 2,
      width: 1.5 + Math.min(e.weight ?? 0, 8) * 1.1,
    });
  }

  return {
    width: horiz ? L.end : S.end,
    height: horiz ? S.end : L.end,
    nodes: sized,
    edges,
    direction,
  };
}
