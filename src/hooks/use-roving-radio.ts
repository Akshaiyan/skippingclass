import { useRef, type KeyboardEvent } from "react";

const NEXT = ["ArrowRight", "ArrowDown"];
const PREV = ["ArrowLeft", "ArrowUp"];

/**
 * Roving tabindex for a radio group: the group is one tab stop, arrow keys move and select,
 * Home and End jump to the ends. Disabled options are skipped.
 */
export function useRovingRadio<T extends string>(
  values: readonly T[],
  value: T | null | undefined,
  onChange: (v: T) => void,
  isDisabled?: (v: T) => boolean,
) {
  const refs = useRef<Partial<Record<T, HTMLElement | null>>>({});
  const enabled = values.filter((v) => !isDisabled?.(v));
  const tabTarget = value && enabled.includes(value) ? value : enabled[0];

  const itemProps = (v: T) => ({
    ref: (el: HTMLElement | null) => {
      refs.current[v] = el;
    },
    role: "radio" as const,
    "aria-checked": value === v,
    tabIndex: v === tabTarget ? 0 : -1,
    onClick: () => onChange(v),
    onKeyDown: (e: KeyboardEvent) => {
      const i = enabled.indexOf(v);
      if (i < 0 || !enabled.length) return;
      let n: number;
      if (NEXT.includes(e.key)) n = (i + 1) % enabled.length;
      else if (PREV.includes(e.key)) n = (i - 1 + enabled.length) % enabled.length;
      else if (e.key === "Home") n = 0;
      else if (e.key === "End") n = enabled.length - 1;
      else return;
      e.preventDefault();
      const next = enabled[n]!;
      onChange(next);
      refs.current[next]?.focus();
    },
  });

  return { itemProps };
}
