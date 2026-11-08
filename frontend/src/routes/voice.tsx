import { createFileRoute } from "@tanstack/react-router";
import { Mic, Square, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { PageHeader } from "@/components/status";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SegmentedControl } from "@/components/SegmentedControl";
import { HoldToTalk } from "@/voice/HoldToTalk";
import { LiveAegisMark } from "@/voice/LiveAegisMark";
import { useVoice, VOICE_MODE_OPTIONS, voiceStatusLabel } from "@/voice/voice-context";

export const Route = createFileRoute("/voice")({
  head: () => ({
    meta: [
      { title: "Talk to Aegis · Motor claims triage" },
      {
        name: "description",
        content:
          "Talk to Aegis: ask about the claims and the policy, see diagrams, and have it take you around the app.",
      },
    ],
  }),
  component: VoicePage,
});

const TRY = [
  "Which claims need human review, and why?",
  "Open practice three.",
  "Draw how practice three was decided.",
  "What would the draft policy change?",
  "Take me to the decision log.",
  "Send practice three to human review because the quote looks inflated.",
];

function VoicePage() {
  const { status, mode, talking, error, lines, start, stop, setMode, clearLines } = useVoice();
  const active = status !== "idle";
  const holdable = active && mode === "push" && status !== "connecting";
  const end = useRef<HTMLLIElement>(null);

  // Keep the newest line in view as the conversation grows.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [lines.length]);

  const mark = (
    <LiveAegisMark
      className="w-56"
      active={talking || status === "speaking"}
      connecting={status === "connecting"}
      dim={holdable && !talking && status !== "speaking"}
    />
  );
  const markButton =
    "rounded-lg p-6 outline-none focus-visible:ring-2 focus-visible:ring-foreground";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Talk to Aegis"
        description="Ask about the claims and the policy, see a diagram, or have Aegis take you somewhere in the app. It can look, navigate and draft; it can't record a decision."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <section aria-label="Call" className="card-panel flex flex-col items-center gap-6 p-8">
          <div className="flex flex-col items-center gap-2">
            <SegmentedControl
              label="How you talk to Aegis"
              options={VOICE_MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              value={mode}
              onChange={setMode}
            />
            <p className="text-center text-xs text-text-2">
              {VOICE_MODE_OPTIONS.find((o) => o.value === mode)?.help}
            </p>
          </div>

          <div className="grid h-60 place-items-center">
            {holdable ? (
              <HoldToTalk aria-label="Hold to talk" className={markButton}>
                {mark}
              </HoldToTalk>
            ) : active ? (
              <div aria-hidden className="p-6">
                {mark}
              </div>
            ) : (
              <button
                type="button"
                aria-label="Start call"
                onClick={start}
                className={cn(markButton, "hover:opacity-80")}
              >
                {mark}
              </button>
            )}
          </div>

          <div className="text-center">
            <div className="font-display text-xl font-semibold" role="status" aria-live="polite">
              {voiceStatusLabel(status, mode, talking)}
            </div>
            <p className="mt-1 text-sm text-text-2">
              {!active
                ? "Your browser will ask for the microphone the first time."
                : mode === "push"
                  ? "Hold the circle or the Space bar while you talk. Let go and Aegis answers. Talk over it to cut it off."
                  : "Just talk. You can interrupt Aegis at any time."}
            </p>
          </div>

          {active ? (
            <Button variant="outline" size="lg" onClick={stop}>
              <Square aria-hidden /> End call
            </Button>
          ) : (
            <Button size="lg" onClick={start}>
              <Mic aria-hidden /> Start call
            </Button>
          )}

          {error && (
            <p role="alert" className="w-full border border-border-strong bg-surface p-3 text-sm">
              {error}
            </p>
          )}
        </section>

        <div className="space-y-6">
          <section aria-label="Conversation" className="card-panel">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
              <h2 className="eyebrow">Conversation</h2>
              {lines.length > 0 && !active && (
                <Button variant="ghost" size="sm" onClick={clearLines}>
                  <Trash2 aria-hidden /> Clear
                </Button>
              )}
            </div>
            {lines.length === 0 ? (
              <p className="px-5 py-8 text-sm text-text-2">
                Nothing yet. Start a call and what you and Aegis say shows up here.
              </p>
            ) : (
              <ol
                aria-live="polite"
                className="max-h-[46dvh] space-y-4 overflow-auto px-5 py-4 text-sm"
              >
                {lines.map((l, i) => (
                  <li key={i} className="grid grid-cols-[4.5rem_1fr] gap-3">
                    <span className="eyebrow pt-0.5">
                      {l.who === "you" ? "You" : l.who === "action" ? "Did" : "Aegis"}
                    </span>
                    <span
                      className={
                        l.who === "you"
                          ? "text-text-2"
                          : l.who === "action"
                            ? "font-mono text-xs leading-5 text-text-2"
                            : "text-foreground"
                      }
                    >
                      {l.text}
                    </span>
                  </li>
                ))}
                <li ref={end} aria-hidden />
              </ol>
            )}
          </section>

          <section aria-label="Things to try" className="card-panel px-5 py-4">
            <h2 className="eyebrow mb-3">Things to try saying</h2>
            <ul className="space-y-1.5 text-sm text-text-2">
              {TRY.map((t) => (
                <li key={t}>“{t}”</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
