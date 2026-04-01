import { useMemo, useState } from "react";
import { hasSupabaseEnv, supabase } from "../lib/supabase";

type AuthMode = "signin" | "signup";

type AuthPanelProps = {
  onContinueOffline: () => void;
  onSignedUp: () => void;
};

export function AuthPanel({ onContinueOffline, onSignedUp }: AuthPanelProps) {
  const [mode, setMode] = useState<AuthMode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const heading = useMemo(
    () => (mode === "signup" ? "Create your account" : "Sign in"),
    [mode]
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!supabase) {
      setMessage("Add Supabase keys in .env to turn on sign in and cloud sync.");
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim()
            }
          }
        });

        if (error) {
          throw error;
        }

        onSignedUp();
        setMessage("Account created. Sign in to create your first trip if you are not redirected automatically.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password
        });

        if (error) {
          throw error;
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card auth-card auth-layout">
      <aside className="auth-showcase">
        <img src="/bluetab-logo.png" alt="BlueTab logo" className="auth-logo" />
        <div className="auth-showcase-copy">
          <h2>BlueTab</h2>
          <p className="eyebrow">Journey Planner</p>
        </div>
      </aside>

      <div className="auth-panel">
        <div>
          <p className="eyebrow">{mode === "signup" ? "Create Account" : "Welcome Back"}</p>
          <h2>{heading}</h2>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "signup" ? (
            <label>
              Full name
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </label>
          ) : null}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </label>

          <button className="primary-button" type="submit" disabled={busy || !hasSupabaseEnv}>
            {busy ? "Please wait..." : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        {message ? <p className="notice">{message}</p> : null}

        <div className="auth-actions">
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              setMode((current) => (current === "signup" ? "signin" : "signup"));
              setMessage(null);
            }}
          >
            {mode === "signup" ? "Already have an account?" : "Create a new account"}
          </button>
          <button type="button" className="ghost-button" onClick={onContinueOffline}>
            Continue offline
          </button>
        </div>

        {!hasSupabaseEnv ? (
          <p className="helper">
            Cloud sync is waiting for `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
          </p>
        ) : null}
      </div>
    </section>
  );
}
