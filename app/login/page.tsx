"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ShieldAlert, QrCode } from "lucide-react";
import { LoginGlobe } from "@/components/LoginGlobe";
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
    <div className="relative flex h-dvh max-h-dvh flex-col overflow-hidden bg-[#071947]">
      <LoginGlobe />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #93C5FD 1px, transparent 1px), linear-gradient(to bottom, #93C5FD 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "linear-gradient(to bottom, #000 60%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, #000 60%, transparent 100%)",
        }}
      />

      <header className="relative z-10 mx-auto flex w-full max-w-5xl shrink-0 items-center justify-between px-4 pt-4 sm:px-6">
        <a
          href="/"
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3.5 py-2 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/20"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back to home</span>
        </a>
        <Link
          href="/verify"
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-medium text-[#CBD5E1] backdrop-blur-sm transition-colors hover:bg-white/10 hover:text-white"
        >
          <QrCode className="h-4 w-4" aria-hidden="true" />
          <span>Verify report</span>
        </Link>
      </header>

      <main
        id="main-content"
        className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 items-center px-4 py-4 sm:px-6"
      >
        <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-12 lg:items-center lg:gap-10">
          <div className="space-y-4 lg:col-span-6">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Sign in to <span className="text-[#38BDF8]">ExamGuard</span>
              </h1>
              <p className="mt-1.5 text-base text-[#CBD5E1]">
                Use your account credentials or launch a role workspace directly.
              </p>
            </div>

            {user && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#38BDF8]/30 bg-[#0A1F56]/75 p-4 backdrop-blur-md">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white sm:text-base">
                    Active session: {user.name} ({user.role})
                  </p>
                  <p className="text-xs text-[#CBD5E1] sm:text-sm">
                    Continue to your workspace or switch role below
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => routeForUser(user)}
                  className="inline-flex min-h-[44px] shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1D4ED8]"
                >
                  <span>Open workspace</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}

            <div className="rounded-2xl border border-white/15 bg-[#0A1F56]/65 p-4 backdrop-blur-md">
              <p className="mb-3 text-sm font-medium text-[#E2E8F0]">
                Quick role access
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {DEMO_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    disabled={loading}
                    onClick={() => handleDemoSignIn(acc.email, acc.route)}
                    className="group flex min-h-[52px] w-full cursor-pointer items-center justify-between gap-2.5 rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2.5 text-left transition-colors hover:border-[#38BDF8]/60 hover:bg-white/[0.12] disabled:opacity-60"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">
                        {acc.role}
                      </p>
                      <p className="truncate text-xs text-[#CBD5E1]">
                        {acc.email}
                      </p>
                    </div>
                    <ArrowRight
                      className="h-4 w-4 shrink-0 text-[#38BDF8] transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="rounded-2xl border border-white/15 bg-[#0A1F56]/80 p-6 backdrop-blur-md sm:p-7">
              <h2 className="text-lg font-semibold text-white">
                Sign in with credentials
              </h2>
              <p className="mt-1 text-sm text-[#CBD5E1]">
                Demo password{" "}
                <code className="rounded-md bg-white/15 px-2 py-0.5 font-mono text-xs text-white">
                  demo1234
                </code>
              </p>

              {error && (
                <div
                  role="alert"
                  className="mt-3.5 flex items-center gap-2 rounded-lg border border-[#FCA5A5]/40 bg-[#7F1D1D]/60 p-3 text-sm text-[#FEE2E2]"
                >
                  <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="mt-4 space-y-3.5" noValidate>
                <div>
                  <label
                    htmlFor="login-email"
                    className="block text-sm font-medium text-[#E2E8F0]"
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
                    className="mt-1.5 min-h-[44px] w-full rounded-lg border border-white/20 bg-white px-3.5 py-2 text-base text-[#0F172A] focus:border-[#38BDF8] focus:outline-none"
                  />
                  {emailError && (
                    <p className="mt-1 text-xs text-[#FCA5A5]">{emailError}</p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="login-password"
                    className="block text-sm font-medium text-[#E2E8F0]"
                  >
                    Password
                  </label>
                  <input
                    id="login-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1.5 min-h-[44px] w-full rounded-lg border border-white/20 bg-white px-3.5 py-2 text-base text-[#0F172A] focus:border-[#38BDF8] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="min-h-[46px] w-full cursor-pointer rounded-lg bg-[#2563EB] px-4 py-2.5 text-base font-medium text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-60"
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
