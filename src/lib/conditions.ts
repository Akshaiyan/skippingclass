import type { Condition } from "@/types";

/** A blank comparison the rule editor starts from. */
export const emptyLeaf = (): Condition => ({ field: "", op: "eq" });
