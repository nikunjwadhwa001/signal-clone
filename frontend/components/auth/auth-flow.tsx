"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login, register, verify } from "@/lib/api/auth";
import { getMe } from "@/lib/api/users";
import { useAuthStore } from "@/lib/stores/auth-store";

type Step = "welcome" | "register" | "otp";

export function AuthFlow() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [step, setStep] = useState<Step>("welcome");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [otpHint, setOtpHint] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");

  async function handleContinue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "register") {
        const res = await register({
          username,
          display_name: displayName || username,
          phone: phone || undefined,
          password,
        });
        setOtpHint(res.otp_hint);
      } else {
        const res = await login(username, password);
        setOtpHint(res.otp_hint);
      }
      setStep("otp");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const tokens = await verify(username, otp);
      // Set tokens first so the authenticated /me request carries them.
      useAuthStore.setState({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
      });
      const me = await getMe();
      setSession(tokens.access_token, tokens.refresh_token, me);
      router.push("/chat");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Invalid OTP, try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-bg-secondary px-4">
      <div className="w-full max-w-sm rounded-2xl bg-bg-primary p-8 shadow-xl border border-border">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-signal-blue text-2xl text-white">
            💬
          </div>
          <h1 className="text-xl font-semibold">Signal</h1>
          <p className="text-sm text-text-secondary">
            Simple. Private. Secure messaging.
          </p>
        </div>

        {step === "welcome" && (
          <div className="flex flex-col gap-3">
            <button
              className="rounded-full bg-signal-blue px-4 py-3 font-medium text-white transition hover:bg-signal-blue-dark"
              onClick={() => {
                setMode("login");
                setStep("register");
              }}
            >
              Continue
            </button>
            <p className="text-center text-xs text-text-tertiary">
              New here? Registering takes 10 seconds — verification is mocked
              for this demo.
            </p>
          </div>
        )}

        {step === "register" && (
          <form onSubmit={handleContinue} className="flex flex-col gap-3">
            <div className="mb-1 flex rounded-full bg-bg-tertiary p-1 text-sm">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={`flex-1 rounded-full py-1.5 transition ${
                  mode === "login" ? "bg-bg-primary shadow" : "text-text-secondary"
                }`}
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => setMode("register")}
                className={`flex-1 rounded-full py-1.5 transition ${
                  mode === "register" ? "bg-bg-primary shadow" : "text-text-secondary"
                }`}
              >
                Sign up
              </button>
            </div>
            <input
              required
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value.trim())}
              className="rounded-lg border border-border bg-bg-primary px-3 py-2.5 text-sm outline-none focus:border-signal-blue"
            />
            {mode === "register" && (
              <>
                <input
                  required
                  placeholder="Display name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="rounded-lg border border-border bg-bg-primary px-3 py-2.5 text-sm outline-none focus:border-signal-blue"
                />
                <input
                  placeholder="Phone (optional)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="rounded-lg border border-border bg-bg-primary px-3 py-2.5 text-sm outline-none focus:border-signal-blue"
                />
              </>
            )}
            <input
              required
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-border bg-bg-primary px-3 py-2.5 text-sm outline-none focus:border-signal-blue"
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              disabled={loading}
              className="mt-1 rounded-full bg-signal-blue px-4 py-3 font-medium text-white transition hover:bg-signal-blue-dark disabled:opacity-60"
            >
              {loading ? "Please wait…" : mode === "register" ? "Create account" : "Send code"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleVerify} className="flex flex-col gap-3">
            <p className="text-sm text-text-secondary">
              Enter the verification code sent to <b>{username}</b>.
            </p>
            {otpHint && (
              <p className="rounded-lg bg-bg-active px-3 py-2 text-xs text-signal-blue">
                Demo mode — your code is <b>{otpHint}</b>
              </p>
            )}
            <input
              required
              autoFocus
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value.trim())}
              maxLength={6}
              className="rounded-lg border border-border bg-bg-primary px-3 py-2.5 text-center text-lg tracking-[0.5em] outline-none focus:border-signal-blue"
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              disabled={loading}
              className="mt-1 rounded-full bg-signal-blue px-4 py-3 font-medium text-white transition hover:bg-signal-blue-dark disabled:opacity-60"
            >
              {loading ? "Verifying…" : "Verify & continue"}
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setOtp("");
                setStep("register");
              }}
              className="text-sm text-text-secondary hover:underline"
            >
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
