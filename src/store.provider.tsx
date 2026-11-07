import { useMemo, useReducer, type ReactNode } from "react";

import { getPolicy } from "@/data/api";
import { hashRules } from "@/lib/evaluate";
import { deriveClaims } from "@/lib/report";
import { initialStoreState, StoreCtx, storeReducer } from "@/store";

// Component-only module: keeping the provider separate from the hook and reducer
// lets edits to either side hot-swap without leaving a stale context behind.
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(storeReducer, undefined, initialStoreState);
  const v1 = useMemo(() => getPolicy(), []);
  const derived = useMemo(() => deriveClaims(state.claims, state.draftRules), [state.claims, state.draftRules]);
  const draftHash = useMemo(() => hashRules(state.draftRules), [state.draftRules]);
  return (
    <StoreCtx.Provider value={{ state, dispatch, derived, v1Rules: v1.rules, v1Hash: v1.hash, draftHash }}>
      {children}
    </StoreCtx.Provider>
  );
}
