import { useEffect, useMemo, useReducer, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchLive } from "@/data/live";
import { hashRules } from "@/lib/evaluate";
import { deriveClaims } from "@/lib/report";
import { initialStoreState, StoreCtx, storeReducer } from "@/store";

// Component-only module: keeping the provider separate from the hook and reducer
// lets edits to either side hot-swap without leaving a stale context behind.
//
// The live snapshot is fetched with the query library the project already uses (React and TanStack docs: prefer
// a framework or query library over fetching in effects). The query handles loading, errors, retries and caching.
// If the API is unreachable, the app stays on its seed data and says so (see the sourceError action).
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(storeReducer, undefined, initialStoreState);

  const live = useQuery({
    queryKey: ["live-snapshot"],
    queryFn: fetchLive,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // Copy the query result into the reducer, which owns the screen state and the reviewer's own changes.
  useEffect(() => {
    if (live.data) dispatch({ type: "live", snapshot: live.data });
  }, [live.data]);

  useEffect(() => {
    if (live.error) dispatch({ type: "sourceError", message: live.error instanceof Error ? live.error.message : "Unknown error" });
  }, [live.error]);

  const derived = useMemo(() => deriveClaims(state.claims, state.draftRules), [state.claims, state.draftRules]);
  const draftHash = useMemo(() => hashRules(state.draftRules), [state.draftRules]);
  return (
    <StoreCtx.Provider value={{ state, dispatch, derived, v1Rules: state.v1Rules, v1Hash: state.v1Hash, draftHash }}>
      {children}
    </StoreCtx.Provider>
  );
}
