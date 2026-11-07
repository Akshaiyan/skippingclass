import { useEffect, useMemo, useReducer, type ReactNode } from "react";

import { fetchLive } from "@/data/live";
import { hashRules } from "@/lib/evaluate";
import { deriveClaims } from "@/lib/report";
import { initialStoreState, StoreCtx, storeReducer } from "@/store";

// Component-only module: keeping the provider separate from the hook and reducer
// lets edits to either side hot-swap without leaving a stale context behind.
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(storeReducer, undefined, initialStoreState);

  // Replace the seed with the live engine output once the API answers. If it does not, the app stays on seed data
  // and reports that in the header, so a reviewer never mistakes demo data for live decisions.
  useEffect(() => {
    let cancelled = false;
    fetchLive()
      .then((snapshot) => {
        if (!cancelled) dispatch({ type: "live", snapshot });
      })
      .catch((e: unknown) => {
        if (!cancelled)
          dispatch({
            type: "sourceError",
            message: e instanceof Error ? e.message : "Unknown error",
          });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const derived = useMemo(
    () => deriveClaims(state.claims, state.draftRules),
    [state.claims, state.draftRules],
  );
  const draftHash = useMemo(() => hashRules(state.draftRules), [state.draftRules]);
  return (
    <StoreCtx.Provider
      value={{ state, dispatch, derived, v1Rules: state.v1Rules, v1Hash: state.v1Hash, draftHash }}
    >
      {children}
    </StoreCtx.Provider>
  );
}
