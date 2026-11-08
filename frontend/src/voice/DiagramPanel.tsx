import { useId, useMemo } from "react";
import { X } from "lucide-react";
import type { DiagramSpec, Tone } from "./diagrams";
import { layoutDiagram, LINE, PAD_X, PAD_Y, SUB_LINE, TAG_LINE } from "./layout";
import { Button } from "@/components/ui/button";

const TONE_VAR: Record<Exclude<Tone, "dark" | "neutral">, string> = {
  red: "var(--red)",
  yellow: "var(--yellow)",
  green: "var(--green)",
};
const TINT_VAR: Record<Exclude<Tone, "dark" | "neutral">, string> = {
  red: "var(--red-tint)",
  yellow: "var(--yellow-tint)",
  green: "var(--green-tint)",
};

/** A diagram drawn as inline SVG, themed with the app's own colour tokens. Every coloured box also says what it is in words. */
export function DiagramPanel({ spec, onClose }: { spec: DiagramSpec; onClose: () => void }) {
  const placed = useMemo(() => layoutDiagram(spec), [spec]);
  const uid = useId().replace(/:/g, "");
  const names = new Map(spec.nodes.map((n) => [n.id, n.label]));
  const description = spec.edges
    .map((e) => `${names.get(e.from)} to ${names.get(e.to)}${e.label ? ` (${e.label})` : ""}`)
    .join("; ");

  return (
    <section
      aria-label={spec.title}
      className="pointer-events-auto flex max-h-[62dvh] w-[min(680px,calc(100vw-2rem))] flex-col border border-border-strong bg-background shadow-sheet"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold leading-tight">{spec.title}</h2>
          {spec.caption && <p className="mt-1 text-sm text-text-2">{spec.caption}</p>}
        </div>
        <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={onClose}>
          <X aria-hidden />
          <span className="sr-only">Close diagram</span>
        </Button>
      </header>
      <div className="overflow-auto p-2">
        <svg
          role="img"
          aria-labelledby={`${uid}t ${uid}d`}
          width={placed.width}
          height={placed.height}
          viewBox={`0 0 ${placed.width} ${placed.height}`}
          className="mx-auto block max-w-none"
          fontFamily="inherit"
        >
          <title id={`${uid}t`}>{spec.title}</title>
          <desc id={`${uid}d`}>{description || "A single step."}</desc>
          <defs>
            {(["a", "m"] as const).map((k) => (
              <marker
                key={k}
                id={`${uid}${k}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerUnits="userSpaceOnUse"
                markerWidth="10"
                markerHeight="10"
                orient="auto-start-reverse"
              >
                <path
                  d="M0,1 L9,5 L0,9 z"
                  fill={k === "a" ? "var(--text-2)" : "var(--border-strong)"}
                />
              </marker>
            ))}
          </defs>

          {placed.edges.map((e, i) => (
            <path
              key={i}
              d={e.path}
              fill="none"
              stroke={e.muted ? "var(--border-strong)" : "var(--text-2)"}
              strokeWidth={e.muted ? Math.max(1.5, e.width - 0.5) : e.width}
              markerEnd={`url(#${uid}${e.muted ? "m" : "a"})`}
            />
          ))}

          {placed.nodes.map((n) => {
            const dark = n.tone === "dark";
            const coloured = n.tone === "red" || n.tone === "yellow" || n.tone === "green";
            const fg = dark ? "var(--primary-foreground)" : "var(--foreground)";
            const soft = dark ? "var(--primary-foreground)" : "var(--text-2)";
            let y = n.y + PAD_Y;
            const text: { y: number; node: React.ReactNode }[] = [];
            if (n.tag) {
              text.push({
                y: y + 10,
                node: (
                  <text
                    fontSize="10"
                    letterSpacing="0.06em"
                    fill={soft}
                    opacity={dark ? 0.8 : 1}
                    style={{ textTransform: "uppercase" }}
                  >
                    {n.tag}
                  </text>
                ),
              });
              y += TAG_LINE;
            }
            n.lines.forEach((l) => {
              text.push({
                y: y + 12,
                node: (
                  <text fontSize="13" fontWeight="600" fill={fg}>
                    {l}
                  </text>
                ),
              });
              y += LINE;
            });
            n.subLines.forEach((l) => {
              text.push({
                y: y + 10,
                node: (
                  <text fontSize="11" fill={soft} opacity={dark ? 0.85 : 1}>
                    {l}
                  </text>
                ),
              });
              y += SUB_LINE;
            });
            return (
              <g key={n.id} opacity={n.muted ? 0.62 : 1}>
                <rect
                  x={n.x}
                  y={n.y}
                  width={n.w}
                  height={n.h}
                  fill={
                    dark
                      ? "var(--primary)"
                      : coloured
                        ? TINT_VAR[n.tone as keyof typeof TINT_VAR]
                        : "var(--surface)"
                  }
                  stroke={
                    coloured ? TONE_VAR[n.tone as keyof typeof TONE_VAR] : "var(--border-strong)"
                  }
                  strokeWidth={coloured ? 1.5 : 1}
                />
                {coloured && (
                  <rect
                    x={n.x}
                    y={n.y}
                    width={4}
                    height={n.h}
                    fill={TONE_VAR[n.tone as keyof typeof TONE_VAR]}
                  />
                )}
                {text.map((t, i) => (
                  <g key={i} transform={`translate(${n.x + PAD_X}, ${t.y})`}>
                    {t.node}
                  </g>
                ))}
              </g>
            );
          })}

          {placed.edges.map(
            (e, i) =>
              e.label && (
                <text
                  key={`l${i}`}
                  x={e.lx}
                  y={e.ly + 4}
                  textAnchor="middle"
                  fontSize="11"
                  fill="var(--text-2)"
                  stroke="var(--background)"
                  strokeWidth="4"
                  paintOrder="stroke"
                >
                  {e.label}
                </text>
              ),
          )}
        </svg>
      </div>
    </section>
  );
}
