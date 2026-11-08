// A tiny event channel for things a person does in the app that other parts may want to react to. The voice
// assistant listens for it so Aegis can follow up after a recorded decision. Nothing here changes any data.
import type { ReviewerOverride } from "@/types";

export type AppEvent = { type: "override_recorded"; record: ReviewerOverride };

const NAME = "aegis:app-event";

export function emitAppEvent(event: AppEvent) {
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent<AppEvent>(NAME, { detail: event }));
}

/** Subscribes to app events; returns the unsubscribe function. */
export function onAppEvent(handler: (event: AppEvent) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<AppEvent>).detail);
  window.addEventListener(NAME, listener);
  return () => window.removeEventListener(NAME, listener);
}
