import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AuthPanel } from "./components/AuthPanel";
import { TripPlanner } from "./components/TripPlanner";
import { supabase } from "./lib/supabase";

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [offlineOnly, setOfflineOnly] = useState(false);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [preferredEntryMode, setPreferredEntryMode] = useState<"choose" | "create">("choose");

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setPreferredEntryMode("choose");
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="app-shell">
      <div className="background-orb orb-one" />
      <div className="background-orb orb-two" />
      <div className="background-orb orb-three" />

      <div className="page-frame">
        {session ? (
          <div className="topbar topbar-actions">
            <button className="ghost-button" type="button" onClick={() => void supabase?.auth.signOut()}>
              Sign out
            </button>
          </div>
        ) : null}

        {loading ? (
          <section className="card">
            <p className="muted">Checking your BlueTab space...</p>
          </section>
        ) : session || offlineOnly || !supabase ? (
          <TripPlanner
            session={session}
            offlineOnly={offlineOnly || !supabase}
            preferredEntryMode={preferredEntryMode}
          />
        ) : (
          <AuthPanel
            onContinueOffline={() => setOfflineOnly(true)}
            onSignedUp={() => setPreferredEntryMode("create")}
          />
        )}
      </div>
    </div>
  );
}
