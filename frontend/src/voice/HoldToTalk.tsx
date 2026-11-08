import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { useVoice } from "./voice-context";

/**
 * A button that opens the mic while it is held: pointer or touch down to talk, up to stop, or hold Enter or
 * Space while it has focus. Space also works anywhere on the page (see VoiceProvider).
 */
export function HoldToTalk({
  className,
  children,
  ...rest
}: Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onPointerDown" | "onPointerUp" | "onPointerCancel" | "onKeyDown" | "onKeyUp" | "aria-pressed"
>) {
  const { talking, pressTalk, releaseTalk } = useVoice();
  return (
    <button
      type="button"
      aria-pressed={talking}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        pressTalk();
      }}
      onPointerUp={releaseTalk}
      onPointerCancel={releaseTalk}
      onLostPointerCapture={releaseTalk}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          pressTalk();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          releaseTalk();
        }
      }}
      onBlur={releaseTalk}
      className={cn("touch-none select-none", className)}
      {...rest}
    >
      {children}
    </button>
  );
}
