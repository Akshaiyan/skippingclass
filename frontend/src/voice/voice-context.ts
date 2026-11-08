// Context and hook for the voice session. Kept apart from VoiceProvider.tsx because a module exports either
// components or non-components, never both (see AGENTS.md).
import { createContext, useContext } from "react";

export type VoiceStatus = "idle" | "connecting" | "listening" | "speaking";

/** push: the mic is shut until you hold the button or Space. conversation: the mic is always open. */
export type VoiceMode = "push" | "conversation";

export interface VoiceLine {
  /** "action" is something Aegis did in the app (a tool call), so you can see what it really did. */
  who: "you" | "aegis" | "action";
  text: string;
}

export interface VoiceCtx {
  status: VoiceStatus;
  mode: VoiceMode;
  /** Push to talk only: true while the talk button or Space is held. */
  talking: boolean;
  /** Why the last attempt to connect failed, in words the user can act on. */
  error: string | null;
  /** The whole conversation so far, oldest first. */
  lines: VoiceLine[];
  start: () => void;
  stop: () => void;
  setMode: (m: VoiceMode) => void;
  pressTalk: () => void;
  releaseTalk: () => void;
  clearError: () => void;
  clearLines: () => void;
}

export const VoiceContext = createContext<VoiceCtx | null>(null);

export function useVoice() {
  const c = useContext(VoiceContext);
  if (!c) throw new Error("VoiceProvider missing");
  return c;
}

export const VOICE_MODE_KEY = "aegis.voiceMode";

export function readVoiceMode(): VoiceMode {
  try {
    return window.localStorage.getItem(VOICE_MODE_KEY) === "conversation" ? "conversation" : "push";
  } catch {
    return "push";
  }
}

/** What to tell the user right now, in words. Colour and animation never carry this alone. */
export function voiceStatusLabel(status: VoiceStatus, mode: VoiceMode, talking: boolean): string {
  if (status === "idle") return "Not on a call";
  if (status === "connecting") return "Connecting…";
  if (status === "speaking") return "Aegis is talking";
  if (mode === "conversation") return "Listening";
  return talking ? "Listening to you" : "Mic off: hold to talk";
}

export const VOICE_MODE_OPTIONS: { value: VoiceMode; label: string; help: string }[] = [
  {
    value: "push",
    label: "Push to talk",
    help: "The mic is only open while you hold the button or Space.",
  },
  {
    value: "conversation",
    label: "Conversation",
    help: "The mic stays open and Aegis replies when you stop talking.",
  },
];
