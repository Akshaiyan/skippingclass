import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import type { Flow } from "@/types";
import { useStore } from "@/store";
import { fetchVoiceToken } from "@/data/voice";
import { CaseSheet } from "@/components/CaseSheet";
import { DiagramPanel } from "./DiagramPanel";
import type { DiagramSpec } from "./diagrams";
import { safeTools, type AppPath, type OverrideDraft, type VoiceEnv } from "./tools";
import { onAppEvent } from "@/lib/app-events";
import { APP_EVENT_MARK, overrideFollowUp } from "./follow-up";
import { VoiceDock } from "./VoiceDock";
import {
  readVoiceMode,
  VOICE_MODE_KEY,
  VoiceContext,
  type VoiceCtx,
  type VoiceLine,
  type VoiceMode,
  type VoiceStatus,
} from "./voice-context";

interface Session {
  endSession(): Promise<void>;
  getInputVolume(): number;
  getOutputVolume(): number;
  sendContextualUpdate(text: string): void;
  sendUserMessage(text: string): void;
  setMicMuted(muted: boolean): void;
}
interface Sheet {
  id: string;
  nonce: number;
  draft?: OverrideDraft;
}

const MAX_LINES = 80;
/** Keeps the mic open a moment after release so the end of a sentence isn't clipped. */
const RELEASE_TAIL_MS = 300;

/** Space is the push-to-talk key, but never when it would also press a button or type into a field. */
const isInteractive = (t: EventTarget | null) =>
  t instanceof Element &&
  !!t.closest(
    "input, textarea, select, button, a, summary, [contenteditable='true'], [role='button']",
  );

/**
 * Owns the voice call for the whole app, so the Talk to Aegis page and the floating button share one session.
 * The voice itself runs in ElevenLabs; this connects the microphone, hands the agent the tools in ./tools.ts
 * (navigate, open a claim, draw a diagram, draft an override) and shows what those tools put on screen.
 * It can never record a decision: only the reviewer can.
 */
export function VoiceProvider({ children }: { children: ReactNode }) {
  const { state, derived, v1Rules, v1Hash, draftHash } = useStore();
  const router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname });

  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<VoiceLine[]>([]);
  const [diagram, setDiagram] = useState<DiagramSpec | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [mode, setModeState] = useState<VoiceMode>(readVoiceMode);
  const [talking, setTalking] = useState(false);

  const session = useRef<Session | null>(null);
  const starting = useRef(false);
  const generation = useRef(0);
  const nonce = useRef(0);
  const lastPath = useRef<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const statusRef = useRef<VoiceStatus>("idle");
  statusRef.current = status;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const talkingRef = useRef(false);
  const releaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Push to talk keeps the mic muted unless the talk control is held; conversation never mutes. */
  const applyMic = () => {
    try {
      session.current?.setMicMuted(modeRef.current === "push" && !talkingRef.current);
    } catch {
      /* not connected yet */
    }
  };
  const setHeld = (held: boolean) => {
    talkingRef.current = held;
    setTalking(held);
    applyMic();
  };
  const pressTalk = () => {
    if (releaseTimer.current) clearTimeout(releaseTimer.current);
    releaseTimer.current = null;
    if (!session.current || modeRef.current !== "push" || talkingRef.current) return;
    setHeld(true);
  };
  const releaseTalk = () => {
    if (!talkingRef.current || releaseTimer.current) return;
    releaseTimer.current = setTimeout(() => {
      releaseTimer.current = null;
      setHeld(false);
    }, RELEASE_TAIL_MS);
  };
  const setMode = (m: VoiceMode) => {
    try {
      window.localStorage.setItem(VOICE_MODE_KEY, m);
    } catch {
      /* the choice just isn't remembered */
    }
    modeRef.current = m;
    setModeState(m);
    setHeld(false);
  };

  // The tools run long after the render that created them, so they read the latest app state through a ref.
  const env = useRef<VoiceEnv>(null as unknown as VoiceEnv);
  // Runs after every render on purpose: the ref must always hold the latest state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    env.current = {
      user: state.user,
      path,
      source: state.source,
      claims: derived,
      v1Rules,
      draftRules: state.draftRules,
      v1Hash,
      draftHash,
      log: state.log,
      openClaimId: sheet?.id ?? null,
      diagram,
      navigate: (to: AppPath, flow?: Flow) => {
        const go = router.navigate as (o: {
          to: string;
          search?: Record<string, unknown>;
        }) => unknown;
        void go({ to, ...(to === "/claims" ? { search: flow ? { flow } : {} } : {}) });
      },
      openClaim: (id, draft) => setSheet({ id, nonce: ++nonce.current, draft }),
      showDiagram: setDiagram,
    };
  });
  const pushLine = (line: VoiceLine) => setLines((l) => [...l, line].slice(-MAX_LINES));
  const tools = useMemo(
    () =>
      safeTools(
        () => env.current,
        (name, params, result) => {
          // Show what Aegis really did, so "I've drafted it" can be checked against the screen.
          const args = Object.values(params)
            .filter((v) => typeof v === "string" && v)
            .join(" · ");
          pushLine({
            who: "action",
            text: `${name}${args ? ` (${args})` : ""}: ${result.split(". ")[0]}`,
          });
        },
      ),
    // pushLine only uses the stable state setter.
    [],
  );

  const stop = async () => {
    generation.current++;
    const s = session.current;
    session.current = null;
    starting.current = false;
    talkingRef.current = false;
    setTalking(false);
    setStatus("idle");
    try {
      await s?.endSession();
    } catch {
      /* already closed */
    }
  };

  const start = async () => {
    if (session.current || starting.current) return;
    starting.current = true;
    // The button that was clicked turns into End call; leaving focus on it would make Space press it
    // (ending the call) instead of working as the push-to-talk key.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const mine = ++generation.current;
    setError(null);
    setStatus("connecting");
    try {
      const [{ Conversation }, token] = await Promise.all([
        import("@elevenlabs/client"),
        fetchVoiceToken(),
      ]);
      if (mine !== generation.current) return;
      const s = (await Conversation.startSession({
        conversationToken: token,
        connectionType: "webrtc",
        clientTools: tools,
        onConnect: () => {
          if (mine === generation.current)
            setStatus((cur) => (cur === "connecting" ? "listening" : cur));
        },
        onModeChange: ({ mode }) => {
          if (mine === generation.current)
            setStatus(mode === "speaking" ? "speaking" : "listening");
        },
        onMessage: ({ message, source }) => {
          if (mine !== generation.current || !message) return;
          // The app event we sent to make Aegis speak echoes back as a "user" message; it is not the person talking.
          if (source !== "ai" && message.startsWith(APP_EVENT_MARK)) return;
          const who: VoiceLine["who"] = source === "ai" ? "aegis" : "you";
          setLines((l) => [...l, { who, text: message }].slice(-MAX_LINES));
        },
        onDisconnect: (details) => {
          if (mine !== generation.current) return;
          session.current = null;
          setStatus("idle");
          if (details?.reason === "error")
            setError(details.message || "The voice connection dropped.");
        },
        onUnhandledClientToolCall: (call) => {
          console.warn("[voice] unhandled tool call", call);
          pushLine({
            who: "action",
            text: `Aegis tried to use "${call.tool_name}", which this app doesn't have. Check the tools in aegis.config.js.`,
          });
        },
        onError: (message) => console.error("[voice]", message),
      })) as unknown as Session;
      if (mine !== generation.current) {
        await s.endSession().catch(() => {});
        return;
      }
      session.current = s;
      lastPath.current = path;
      applyMic();
    } catch (err) {
      if (mine !== generation.current) return;
      setStatus("idle");
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        /permission|notallowed|denied/i.test(msg)
          ? "Aegis needs microphone access. Allow it in the address bar and try again."
          : msg,
      );
    } finally {
      if (mine === generation.current) starting.current = false;
    }
  };

  // Tell the agent when the person moves around by hand, so "this page" stays true.
  useEffect(() => {
    if (!session.current || lastPath.current === path) return;
    lastPath.current = path;
    session.current.sendContextualUpdate(`The user is now on the page ${path}.`);
  }, [path]);

  // Mic/voice level as a CSS variable on the wrapper, so the orb and the meter move without re-rendering the app.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (status === "idle") {
      el.style.setProperty("--voice-level", "0");
      return;
    }
    let raf = 0;
    let level = 0;
    const frame = () => {
      let target = 0;
      try {
        const s = session.current;
        const v = s
          ? statusRef.current === "speaking"
            ? s.getOutputVolume()
            : s.getInputVolume()
          : 0;
        target = Math.min(1, Math.sqrt(v) * 1.25);
      } catch {
        /* volume is unavailable until connected */
      }
      level += (target - level) * (target > level ? 0.45 : 0.12);
      el.style.setProperty("--voice-level", level.toFixed(3));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [status]);

  // After the reviewer records an override, Aegis says one short thing back (only while a call is on).
  useEffect(
    () =>
      onAppEvent((event) => {
        const s = session.current;
        if (!s || event.type !== "override_recorded") return;
        const { record } = event;
        try {
          s.sendUserMessage(overrideFollowUp(record, env.current.claims));
          pushLine({
            who: "action",
            text: `Reviewer recorded the override on ${record.case_id}; told Aegis.`,
          });
        } catch (err) {
          console.warn("[voice] couldn't tell Aegis about the override", err);
        }
      }),
    // pushLine only uses the stable state setter; session and env are refs.
    [],
  );

  // Push to talk: hold Space anywhere that isn't a field or a button.
  useEffect(() => {
    if (status === "idle" || mode !== "push") return;
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isInteractive(e.target)) return;
      e.preventDefault();
      pressTalk();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !talkingRef.current) return;
      if (isInteractive(e.target)) return;
      e.preventDefault();
      releaseTalk();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", releaseTalk);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", releaseTalk);
    };
    // pressTalk/releaseTalk only touch refs and stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, mode]);

  // Leaving the app (sign out) ends the call.
  useEffect(
    () => () => {
      generation.current++;
      if (releaseTimer.current) clearTimeout(releaseTimer.current);
      void session.current?.endSession().catch(() => {});
      session.current = null;
    },
    [],
  );

  const value: VoiceCtx = {
    status,
    mode,
    talking,
    setMode,
    pressTalk,
    releaseTalk,
    error,
    lines,
    start: () => void start(),
    stop: () => void stop(),
    clearError: () => setError(null),
    clearLines: () => setLines([]),
  };
  const sheetClaim = sheet ? (derived.find((c) => c.case_id === sheet.id) ?? null) : null;

  return (
    <VoiceContext.Provider value={value}>
      <div ref={root} className="contents">
        {children}
        <VoiceDock hideControls={path === "/voice"}>
          {diagram && <DiagramPanel spec={diagram} onClose={() => setDiagram(null)} />}
        </VoiceDock>
        <CaseSheet
          key={sheet?.nonce ?? 0}
          claim={sheetClaim}
          open={!!sheetClaim}
          onOpenChange={(o) => {
            if (!o) setSheet(null);
          }}
          initialOverride={sheet?.draft?.to}
          initialNote={sheet?.draft?.note}
          initialReason={sheet?.draft?.reason_code}
        />
      </div>
    </VoiceContext.Provider>
  );
}
