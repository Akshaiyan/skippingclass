import type { ReactNode } from "react";
import { useRovingRadio } from "@/hooks/use-roving-radio";
import { cn } from "@/lib/utils";

export interface Segment<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

/** A single-choice filter: one tab stop, arrow keys to move, the selection follows focus. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: Segment<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const { itemProps } = useRovingRadio(
    options.map((o) => o.value),
    value,
    onChange,
  );
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex flex-wrap rounded-lg border border-border bg-surface p-0.5",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          {...itemProps(o.value)}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors duration-150",
            value === o.value
              ? "bg-background text-foreground shadow-card"
              : "text-text-2 hover:text-foreground",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="tnum text-muted-foreground">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
