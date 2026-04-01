import { useMemo, useState } from "react";
import { hasSupabaseEnv, supabase } from "../lib/supabase";

type AuthPanelProps = {
  onContinueOffline: () => void;
};

export function AuthPanel({ onContinueOffline }: AuthPanelProps) {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [fullName, setFullName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  const heading = useMemo(
    () => (otpSent ? "Enter the OTP from your phone" : "Sign in with your phone number"),
    [otpSent]
  );

  const normalizedPhone = phone.trim();

  const requestOtp = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!supabase) {
      setMessage("Add Supabase keys in .env to turn on phone OTP and cloud sync.");
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: normalizedPhone,
        options: {
          data: {
            full_name: fullName
          }
        }
      });

      if (error) {
        throw error;
      }

      setOtpSent(true);
      setMessage("OTP sent. Enter the code you received on your phone.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to send OTP.");
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!supabase) {
      setMessage("Supabase is not configured.");
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: normalizedPhone,
        token: otp.trim(),
        type: "sms"
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "OTP verification failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card auth-card auth-layout">
      <aside className="auth-showcase">
        <img src="/bluetab-logo.png" alt="BlueTab logo" className="auth-logo" />
        <div className="auth-showcase-copy">
          <p className="eyebrow">BlueTab Journey Planner</p>
          <h2>Plan once, travel calmly.</h2>
          <p className="muted">
            Save itineraries, places, shared budgets, and group plans that stay usable even in low
            network areas.
          </p>
        </div>
        <div className="auth-feature-list">
          <div className="auth-feature-item">
            <strong>Offline-first</strong>
            <span>Trips remain available on weak or unstable connections.</span>
          </div>
          <div className="auth-feature-item">
            <strong>Phone OTP</strong>
            <span>Quick sign in for mobile-first travelers and shared groups.</span>
          </div>
          <div className="auth-feature-item">
            <strong>Group ready</strong>
            <span>Invite friends, split costs, and sync the journey to the cloud.</span>
          </div>
        </div>
      </aside>

      <div className="auth-panel">
        <div>
          <p className="eyebrow">{otpSent ? "Step 2 of 2" : "Step 1 of 2"}</p>
          <h2>{heading}</h2>
          <p className="muted">
            {otpSent
              ? "We sent a one-time password to your phone. Enter it below to continue into BlueTab."
              : "Use your mobile number to sign up or sign in. The same flow works for both."}
          </p>
        </div>

        {!otpSent ? (
          <form className="auth-form" onSubmit={requestOtp}>
            <label>
              Full name
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
              />
            </label>

            <label>
              Phone number
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                required
              />
            </label>

            <button className="primary-button" type="submit" disabled={busy || !hasSupabaseEnv}>
              {busy ? "Sending OTP..." : "Send OTP"}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={verifyOtp}>
            <label>
              Phone number
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </label>

            <label>
              OTP code
              <input
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="6-digit code"
                required
              />
            </label>

            <button className="primary-button" type="submit" disabled={busy || !hasSupabaseEnv}>
              {busy ? "Verifying..." : "Verify OTP"}
            </button>
          </form>
        )}

        {message ? <p className="notice">{message}</p> : null}

        <div className="auth-actions">
          {otpSent ? (
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                setOtp("");
                setOtpSent(false);
                setMessage(null);
              }}
            >
              Change number
            </button>
          ) : null}
          <button type="button" className="ghost-button" onClick={onContinueOffline}>
            Continue offline
          </button>
        </div>

        {!hasSupabaseEnv ? (
          <p className="helper">
            Cloud sync is waiting for `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
          </p>
        ) : (
          <p className="helper">Use full international format, for example `+91` followed by your number.</p>
        )}
      </div>
    </section>
  );
}
