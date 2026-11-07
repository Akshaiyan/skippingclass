import { AlertCircle, Check, Lock, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import type { Flow, Rec, Tri } from "@/types";
import { FLOW_OF, LOCKED, NOT_PROVIDED, REC_LABEL } from "@/copy";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FLOW_DOT, FLOW_TINT } from "@/lib/flow-styles";

export function Dot({ flow, className }: { flow: Flow; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", FLOW_DOT[flow], className)}
    />
  );
}

export function FlowBadge({ rec, size = "md" }: { rec: Rec; size?: "sm" | "md" }) {
  const flow = FLOW_OF[rec];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap rounded-full font-medium text-foreground",
        FLOW_TINT[flow],
        size === "sm" ? "px-2 py-1 text-xs leading-4" : "px-3 py-1 text-xs leading-5",
      )}
    >
      <Dot flow={flow} className={size === "sm" ? "size-1.5" : undefined} />
      {REC_LABEL[rec]}
    </span>
  );
}

export function Chip({
  children,
  className,
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  tone?: "neutral" | "outline" | "unknown" | "amber" | "solid";
}) {
  const tones = {
    neutral: "bg-surface-2 text-text-2",
    outline: "border border-border-strong text-text-2",
    unknown: "bg-unknown-tint text-unknown",
    amber: "border border-flow-yellow text-foreground",
    solid: "bg-primary text-primary-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium leading-4",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PolicyStamp({
  version,
  hash,
  className,
}: {
  version: string;
  hash: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-border bg-surface px-2 py-1 font-mono text-xs leading-4 text-text-2",
        className,
      )}
    >
      <span className="font-semibold text-foreground">{version}</span>
      <span className="text-faint">·</span>
      {hash}
    </span>
  );
}

export function LockedChip() {
  return (
    <Chip>
      <Lock className="size-3" aria-hidden /> {LOCKED}
    </Chip>
  );
}
export function StatusChip({ status }: { status: "open" | "closed" }) {
  return status === "closed" ? (
    <LockedChip />
  ) : (
    <Chip tone="outline">
      <span className="size-1.5 rounded-full bg-foreground" aria-hidden /> Open
    </Chip>
  );
}

export function RuleChips({ rule }: { rule: string }) {
  const parts = rule.startsWith("ABSENT(") ? [rule] : rule.split("+");
  return (
    <span className="inline-flex flex-wrap gap-1">
      {parts.map((p) => (
        <span
          key={p}
          className={cn(
            "break-all rounded-md px-2 py-1 font-mono text-xs leading-4",
            p.startsWith("ABSENT")
              ? "bg-unknown-tint text-unknown"
              : p === "R3.routine"
                ? "bg-surface-2 text-muted-foreground"
                : "border border-border bg-background text-foreground",
          )}
        >
          {p}
        </span>
      ))}
    </span>
  );
}

export function UnknownMarker({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-full border border-dashed border-unknown",
        className,
      )}
    />
  );
}

export function NotProvided() {
  return (
    <span className="inline-flex items-center gap-2 italic text-muted-foreground">
      <UnknownMarker /> {NOT_PROVIDED}
    </span>
  );
}

export function TriGlyph({ result, outcome }: { result: Tri; outcome: Rec }) {
  if (result === "true")
    return (
      <span className="inline-flex items-center gap-2 text-xs font-medium text-foreground">
        <Dot flow={FLOW_OF[outcome]} /> Fired
      </span>
    );
  if (result === "unknown")
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-unknown-tint px-2 py-1 text-xs font-medium text-unknown">
        <span
          aria-hidden
          className="grid size-3.5 place-items-center rounded-full border border-dashed border-unknown text-xs font-bold leading-none"
        >
          ?
        </span>
        Unknown
      </span>
    );
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <Check className="size-3.5" aria-hidden /> Passed
    </span>
  );
}

export function RecheckChip({ from, to }: { from: Rec; to: Rec }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Chip tone="outline">
        <RefreshCw className="size-3" aria-hidden /> Needs recheck
      </Chip>
      <span className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground">
        v1 <Dot flow={FLOW_OF[from]} className="size-1.5" /> → v2{" "}
        <Dot flow={FLOW_OF[to]} className="size-1.5" />
      </span>
    </span>
  );
}

/** Wraps a disabled control so its tooltip still explains why. */
export function WhyDisabled({
  reason,
  children,
  disabled,
}: {
  reason?: string;
  children: ReactNode;
  disabled: boolean;
}) {
  if (!disabled || !reason) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-md" aria-label={reason}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </header>
  );
}

export function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Refusal({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      aria-live="polite"
      className="mt-2 flex items-center gap-2 text-xs font-medium text-destructive"
    >
      <AlertCircle className="size-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  );
}
