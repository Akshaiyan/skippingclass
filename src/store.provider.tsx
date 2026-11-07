import { useEffect, useMemo, useReducer, useState, type ReactNode } from "react";

import { getAccount } from "@/data/api";
import { fetchLive } from "@/data/live";
import { hashRules } from "@/lib/evaluate";
import { deriveClaims } from "@/lib/report";
import { initialStoreState, StoreCtx, storeReducer } from "@/store";

const SESSION_KEY = "aegis.session";

// Component-only module: keeping the provider separate from the hook and reducer
// lets edits to either side hot-swap without leaving a stale context behind.
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(storeReducer, undefined, initialStoreState);
  const [hydrated, setHydrated] = useState(false);

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

  // Restore the signed-in profile. Only its id is stored; the role is read from the profile.
  useEffect(() => {
    try {
      const id = window.localStorage.getItem(SESSION_KEY);
      const account = id ? getAccount(id) : null;
      if (account) dispatch({ type: "signIn", account });
    } catch {
      /* storage can be blocked; the user signs in again */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      if (state.user) window.localStorage.setItem(SESSION_KEY, state.user.id);
      else window.localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }, [hydrated, state.user]);

  const derived = useMemo(
    () => deriveClaims(state.claims, state.draftRules),
    [state.claims, state.draftRules],
  );
  const draftHash = useMemo(() => hashRules(state.draftRules), [state.draftRules]);
  return (
    <StoreCtx.Provider
      value={{
        state,
        dispatch,
        hydrated,
        derived,
        v1Rules: state.v1Rules,
        v1Hash: state.v1Hash,
        draftHash,
      }}
    >
      {children}
    </StoreCtx.Provider>
  );
}
