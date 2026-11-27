"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ShieldAlert, QrCode } from "lucide-react";
import type { SafeUser } from "@/lib/types";
import {
  fetchSessionUser,
  getCachedSessionUser,
  setCachedSessionUser,
} from "@/lib/clientSession";

const DEMO_ACCOUNTS = [
  {
    email: "admin@examguard.edu",
    role: "Administrator",
    route: "/admin",
  },
  {
    email: "examiner@examguard.edu",
    role: "Examiner",
    route: "/examiner",
  },
  {
    email: "candidate1@examguard.edu",
    role: "Candidate (Bilal)",
    route: "/candidate",
  },
  {
    email: "candidate2@examguard.edu",
    role: "Candidate (Sana)",
    route: "/candidate",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [user, setUser] = useState<SafeUser | null>(() => getCachedSessionUser());
  const [email, setEmail] = useState("candidate1@examguard.edu");
  const [password, setPassword] = useState("demo1234");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSessionUser().then((u) => setUser(u)).catch(() => {});
  }, []);

  function validateEmailField(val: string) {
    if (!val.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())) {
      setEmailError("Enter a valid email address");
      return false;
    }
    setEmailError(null);
    return true;
  }

  function routeForUser(u: SafeUser) {
    if (u.role === "admin") router.push("/admin");
    else if (u.role === "examiner") router.push("/examiner");
    else router.push("/candidate");
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validateEmailField(email) || !password.trim()) {
      setError("Fix highlighted fields before signing in");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json()) as { user?: SafeUser; error?: string };
      if (!res.ok || !data.user) {
        setError(data.error ?? "Sign-in failed");
        setLoading(false);
        return;
      }
      setCachedSessionUser(data.user);
      routeForUser(data.user);
    } catch {
      setError("Network error while signing in");
      setLoading(false);
    }
  }

  async function handleDemoSignIn(targetEmail: string, targetRoute: string) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail, password: "demo1234" }),
      });
      const data = (await res.json()) as { user?: SafeUser; error?: string };
      if (!res.ok || !data.user) {
        setError(data.error ?? "Sign-in failed");
        setLoading(false);
        return;
      }
      setCachedSessionUser(data.user);
      setUser(data.user);
      router.push(targetRoute);
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden bg-[#040C1E] lg:h-dvh lg:max-h-dvh lg:overflow-hidden">
      {/* Ambient gradient orbs matching dark glassmorphic backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 -right-24 h-[460px] w-[460px] rounded-full opacity-60 blur-[90px]"
        style={{
          background:
            "radial-gradient(circle at 40% 40%, #0EA5E9 0%, #1D4ED8 45%, transparent 75%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-24 h-[440px] w-[440px] rounded-full opacity-55 blur-[95px]"
        style={{
          background:
            "radial-gradient(circle at 55% 45%, #3B82F6 0%, #312E81 50%, transparent 78%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #93C5FD 1px, transparent 1px), linear-gradient(to bottom, #93C5FD 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse at center, #000 40%, transparent 85%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at center, #000 40%, transparent 85%)",
        }}
      />

      <header className="relative z-10 mx-auto flex w-full max-w-[1060px] shrink-0 items-center justify-between gap-2 px-4 pt-5 sm:px-6">
        <a
          href="/"
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/15 bg-white/[0.06] px-3.5 py-2 text-xs font-medium text-[#E2E8F0] backdrop-blur-md transition-colors hover:bg-white/[0.12] hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Back to home</span>
        </a>
        <Link
          href="/verify"
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-3.5 py-2 text-xs font-medium text-[#E2E8F0] backdrop-blur-md transition-colors hover:bg-white/[0.12] hover:text-white"
        >
          <QrCode className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Verify report</span>
        </Link>
      </header>

      <main
        id="main-content"
        className="relative z-10 mx-auto flex w-full max-w-[1060px] flex-1 items-center px-4 py-6 pb-10 sm:px-6 lg:py-4"
      >
        <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center lg:gap-8">
          <div className="space-y-4 lg:col-span-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-[32px]">
                Sign in to <span className="text-[#38BDF8]">ExamGuard</span>
              </h1>
              <p className="mt-1 text-sm text-[#94A3B8]">
                Use your account credentials or launch a role workspace directly.
              </p>
            </div>

            {user && (
              <div className="rounded-2xl border border-white/15 bg-gradient-to-br from-[#0F234B]/80 via-[#122552]/75 to-[#1E2758]/70 p-5 shadow-[0_12px_36px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    Active session: {user.name} ({user.role})
                  </p>
                  <p className="mt-0.5 text-xs text-[#CBD5E1]">
                    Continue to your workspace or switch role below
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => routeForUser(user)}
                  className="mt-4 inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#0284C7] to-[#0EA5E9] px-4 py-2 text-xs font-semibold text-white shadow-[0_4px_18px_rgba(14,165,233,0.4)] transition-all hover:brightness-110"
                >
                  <span>Open workspace</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )}

            <div className="rounded-2xl border border-white/12 bg-[#0A1734]/75 p-5 shadow-[0_12px_36px_rgba(0,0,0,0.3)] backdrop-blur-xl">
              <p className="mb-3 text-xs font-medium text-[#CBD5E1]">
                Quick role access
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {DEMO_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    disabled={loading}
                    onClick={() => handleDemoSignIn(acc.email, acc.route)}
                    className="group flex min-h-[54px] w-full cursor-pointer items-center justify-between gap-2.5 rounded-xl border border-white/12 bg-white/[0.04] px-3.5 py-2.5 text-left transition-all hover:border-[#38BDF8]/50 hover:bg-white/[0.09] disabled:opacity-60"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-white">
                        {acc.role}
                      </p>
                      <p className="truncate text-[11px] text-[#94A3B8]">
                        {acc.email}
                      </p>
                    </div>
                    <ArrowRight
                      className="h-3.5 w-3.5 shrink-0 text-[#38BDF8] transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="rounded-2xl border border-white/15 bg-gradient-to-b from-[#0E2148]/85 to-[#081533]/90 p-6 shadow-[0_20px_56px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-7">
              <h2 className="text-base font-semibold text-white">
                Sign in with credentials
              </h2>
              <p className="mt-1 text-xs text-[#94A3B8]">
                Demo password{" "}
                <code className="ml-1 rounded-md border border-white/10 bg-white/10 px-2 py-0.5 font-mono text-[11px] text-[#E2E8F0]">
                  demo1234
                </code>
              </p>

              {error && (
                <div
                  role="alert"
                  className="mt-3.5 flex items-center gap-2 rounded-lg border border-[#FCA5A5]/40 bg-[#7F1D1D]/60 p-3 text-xs text-[#FEE2E2]"
                >
                  <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="mt-4 space-y-4" noValidate>
                <div>
                  <label
                    htmlFor="login-email"
                    className="block text-xs font-medium text-[#CBD5E1]"
                  >
                    Email address
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    required
                    value={email}
                    onBlur={() => validateEmailField(email)}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) validateEmailField(e.target.value);
                    }}
                    className="mt-1.5 min-h-[42px] w-full rounded-lg border border-[#38BDF8]/40 bg-[#07132C]/85 px-3.5 py-2 text-sm text-white placeholder-[#64748B] shadow-[0_0_0_1px_rgba(56,189,248,0.12)] transition-all focus:border-[#0EA5E9] focus:ring-2 focus:ring-[#0EA5E9]/30 focus:outline-none"
                  />
                  {emailError && (
                    <p className="mt-1 text-xs text-[#FCA5A5]">{emailError}</p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-medium text-[#CBD5E1]"
                  >
                    Password
                  </label>
                  <input
                    id="login-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1.5 min-h-[42px] w-full rounded-lg border border-white/15 bg-[#07132C]/85 px-3.5 py-2 text-sm text-white placeholder-[#64748B] transition-all focus:border-[#0EA5E9] focus:ring-2 focus:ring-[#0EA5E9]/30 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-[44px] w-full cursor-pointer rounded-lg bg-gradient-to-r from-[#0284C7] via-[#0EA5E9] to-[#0284C7] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_6px_24px_rgba(14,165,233,0.45)] transition-all hover:brightness-110 disabled:opacity-60"
                >
                  {loading ? "Signing in..." : "Sign in"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
