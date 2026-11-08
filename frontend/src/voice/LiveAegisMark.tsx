import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

// The same four shapes as AegisMark in components/AegisLogo.tsx, drawn separately so each can move.
// --voice-level (0 to 1, set by VoiceProvider) pushes the pieces apart and lets them settle again.
const PIECES: { d: string; move: string }[] = [
  { d: "M526 284 619 448H432Z", move: "translate(0px, calc(var(--l) * -34px))" },
  { d: "M410 487H641L685 565H366Z", move: "scale(calc(1 + var(--l) * 0.07))" },
  {
    d: "M344 603H506L446 710H284Z",
    move: "translate(calc(var(--l) * -30px), calc(var(--l) * 20px))",
  },
  {
    d: "M545 603H707L768 710H606Z",
    move: "translate(calc(var(--l) * 30px), calc(var(--l) * 20px))",
  },
];

/**
 * The Aegis mark as the voice indicator. `active` keeps the pieces slightly apart while someone is talking,
 * even in a quiet moment. Motion is removed for people who ask for reduced motion; the status text beside it
 * always says what is happening, so the movement never carries the meaning alone.
 */
export function LiveAegisMark({
  className,
  active,
  connecting,
  dim,
}: {
  className?: string;
  active?: boolean;
  connecting?: boolean;
  /** The mic is off (push to talk, not held). */
  dim?: boolean;
}) {
  return (
    <svg
      viewBox="284 284 484 426"
      fill="currentColor"
      aria-hidden
      className={cn(
        "overflow-visible transition-opacity duration-150",
        dim && "opacity-55",
        connecting && "motion-safe:animate-pulse",
        className,
      )}
      style={
        {
          "--l": active ? "max(var(--voice-level, 0), 0.1)" : "var(--voice-level, 0)",
        } as CSSProperties
      }
    >
      {PIECES.map((p) => (
        <path
          key={p.d}
          d={p.d}
          className="motion-reduce:transform-none!"
          style={{ transformBox: "fill-box", transformOrigin: "center", transform: p.move }}
        />
      ))}
    </svg>
  );
}
