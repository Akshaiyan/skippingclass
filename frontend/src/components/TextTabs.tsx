import type { ReactNode } from "react";
import { useRovingRadio } from "@/hooks/use-roving-radio";
import { cn } from "@/lib/utils";

export interface Tab<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

/**
 * A single-choice filter drawn as open text with an underline under the active choice.
 * One tab stop, arrow keys move and select, same pattern as the dashboard overview.
 */
export function TextTabs<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: Tab<T>[];
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
    <div role="radiogroup" aria-label={label} className={cn("flex flex-wrap gap-x-6", className)}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            {...itemProps(o.value)}
            className={cn(
              "relative inline-flex min-h-11 touch-manipulation select-none items-baseline gap-2 py-2 text-sm transition-[color,opacity] duration-(--dur-fast) ease-(--ease-out) [-webkit-tap-highlight-color:transparent] active:opacity-70",
              active
                ? "font-semibold text-foreground"
                : "font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
            {o.count !== undefined && <span className="tnum text-xs font-normal">{o.count}</span>}
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-0 bottom-0 h-0.5 origin-left bg-foreground transition-transform duration-(--dur-fast) ease-(--ease-out)",
                active ? "scale-x-100" : "scale-x-0",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
