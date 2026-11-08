import type { Flow } from "@/types";

// Tailwind classes for the three flow signals. Kept out of component modules so
// hot reload works (a module exports components or non-components, never both).
export const FLOW_DOT: Record<Flow, string> = {
  red: "bg-flow-red",
  yellow: "bg-flow-yellow",
  green: "bg-flow-green",
};
export const FLOW_BORDER: Record<Flow, string> = {
  red: "border-l-flow-red",
  yellow: "border-l-flow-yellow",
  green: "border-l-flow-green",
};

// Names for the three flows, used wherever a flow is a category (cards, filters, group headings).
export const FLOW_NAME: Record<Flow, string> = {
  red: "Human review",
  yellow: "Missing information",
  green: "Routine processing",
};
// The colour edge under a button that moves a claim into that flow. Full class names so Tailwind finds them.
export const FLOW_EDGE: Record<Flow, string> = {
  red: "border-b-flow-red",
  yellow: "border-b-flow-yellow",
  green: "border-b-flow-green",
};
