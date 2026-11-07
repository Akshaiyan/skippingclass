import type { Flow } from "@/types";

// Tailwind classes for the three flow signals. Kept out of component modules so
// hot reload works (a module exports components or non-components, never both).
export const FLOW_DOT: Record<Flow, string> = {
  red: "bg-flow-red",
  yellow: "bg-flow-yellow",
  green: "bg-flow-green",
};
export const FLOW_TINT: Record<Flow, string> = {
  red: "bg-flow-red-tint",
  yellow: "bg-flow-yellow-tint",
  green: "bg-flow-green-tint",
};
export const FLOW_BORDER: Record<Flow, string> = {
  red: "border-l-flow-red",
  yellow: "border-l-flow-yellow",
  green: "border-l-flow-green",
};
