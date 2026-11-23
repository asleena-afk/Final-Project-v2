import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { api } from "./api";

// useSession: who is signed in (if anyone) and what the API says about them.
// loading=true only until Supabase has read the stored session.
const Ctx = createContext(null);

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [me, setMe] = useState(null);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") setMe(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;
  const refreshMe = useCallback(async () => {
    if (!userId) return setMe(null);
    try { setMe(await api.get("/me")); } catch { setMe(null); }
  }, [userId]);
  useEffect(() => { refreshMe(); }, [refreshMe]);

  const value = {
    session, loading, me, refreshMe, recovery, clearRecovery: () => setRecovery(false),
    signedIn: Boolean(session),
    signOut: () => supabase?.auth.signOut(),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
