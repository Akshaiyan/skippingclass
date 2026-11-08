import type { ReactNode } from "react";
import { Mic, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HoldToTalk } from "./HoldToTalk";
import { LiveAegisMark } from "./LiveAegisMark";
import { useVoice, voiceStatusLabel } from "./voice-context";

/**
 * The floating corner: the diagram panel (passed in as children) above the call controls. On the Talk to
 * Aegis page the page has its own controls, so only the diagram stays.
 */
export function VoiceDock({
  children,
  hideControls,
}: {
  children?: ReactNode;
  hideControls?: boolean;
}) {
  const { status, mode, talking, error, lines, start, stop, clearError } = useVoice();
  const active = status !== "idle";

  return (
    <div
      data-voice-dock
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-3"
    >
      {children}

      {hideControls ? null : active ? (
        <section
          aria-label="Aegis voice assistant"
          className="pointer-events-auto w-[min(340px,calc(100vw-2rem))] border border-border-strong bg-background p-3 shadow-sheet"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <LiveAegisMark
                className="w-9 shrink-0"
                active={talking || status === "speaking"}
                connecting={status === "connecting"}
              />
              <div className="min-w-0">
                <div className="eyebrow">Aegis</div>
                <div className="text-sm font-medium" role="status" aria-live="polite">
                  {voiceStatusLabel(status, mode, talking)}
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={stop}>
              <X aria-hidden /> End
            </Button>
          </div>
          {mode === "push" && status !== "connecting" && (
            <HoldToTalk
              className={cn(
                buttonVariants({ variant: talking ? "default" : "outline" }),
                "mt-3 w-full",
              )}
            >
              <Mic aria-hidden /> {talking ? "Listening to you…" : "Hold to talk (or hold Space)"}
            </HoldToTalk>
          )}
          <div className="mt-3 h-1 w-full bg-surface-2" aria-hidden>
            <div
              className="h-full origin-left bg-foreground"
              style={{ transform: "scaleX(var(--voice-level, 0))" }}
            />
          </div>
          {lines.length > 0 && (
            <ul className="mt-3 max-h-40 space-y-1.5 overflow-auto text-sm">
              {lines.slice(-3).map((l, i) => (
                <li key={i} className={l.who === "you" ? "text-text-2" : "text-foreground"}>
                  <span className="eyebrow mr-2">
                    {l.who === "you" ? "You" : l.who === "action" ? "Did" : "Aegis"}
                  </span>
                  {l.text}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          {error && (
            <div
              role="alert"
              className="flex w-[min(340px,calc(100vw-2rem))] items-start gap-2 border border-border-strong bg-background p-3 text-sm shadow-sheet"
            >
              <p className="flex-1">{error}</p>
              <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={clearError}>
                <X aria-hidden />
                <span className="sr-only">Dismiss</span>
              </Button>
            </div>
          )}
          <Button onClick={start} className="shadow-sheet">
            <Mic aria-hidden /> Talk to Aegis
          </Button>
        </div>
      )}
    </div>
  );
}
