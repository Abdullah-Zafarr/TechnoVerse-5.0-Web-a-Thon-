"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ShieldAlert, ShieldCheck, QrCode } from "lucide-react";
import type { SafeUser } from "@/lib/types";

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
  const [user, setUser] = useState<SafeUser | null>(null);
  const [email, setEmail] = useState("candidate1@examguard.edu");
  const [password, setPassword] = useState("demo1234");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d: { user: SafeUser | null }) => setUser(d.user))
      .catch(() => {});
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
    router.refresh();
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
      setUser(data.user);
      router.push(targetRoute);
      router.refresh();
    } catch {
      setError("Network error");
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#071947]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #93C5FD 1px, transparent 1px), linear-gradient(to bottom, #93C5FD 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "linear-gradient(to bottom, #000 60%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, #000 60%, transparent 100%)",
        }}
      />

      <header className="relative z-10 border-b border-white/10">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            href="/portal"
            className="inline-flex min-h-[40px] items-center gap-2 text-base font-semibold tracking-tight text-white"
          >
            <ShieldCheck
              className="h-5 w-5 text-[#38BDF8]"
              aria-hidden="true"
            />
            <span>ExamGuard</span>
          </Link>

          <Link
            href="/verify"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-[#CBD5E1] transition-colors hover:bg-white/10 hover:text-white"
          >
            <QrCode className="h-4 w-4" aria-hidden="true" />
            <span>Verify report</span>
          </Link>
        </div>
      </header>

      <main
        id="main-content"
        className="relative z-10 mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:py-12"
      >
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Sign in to <span className="text-[#38BDF8]">ExamGuard</span>
            </h1>
            <p className="mt-1 text-sm text-[#CBD5E1]">
              Use your account credentials or launch a role workspace directly.
            </p>
          </div>
          <Link
            href="/portal"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Back to overview</span>
          </Link>
        </div>

        {user && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#38BDF8]/30 bg-white/10 p-4 backdrop-blur-sm">
            <div>
              <p className="text-sm font-medium text-white">
                Active session: {user.name} ({user.role})
              </p>
              <p className="text-xs text-[#CBD5E1]">
                Continue to your workspace or sign in as another role below
              </p>
            </div>
            <button
              type="button"
              onClick={() => routeForUser(user)}
              className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1D4ED8]"
            >
              <span>Open workspace</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-white/15 bg-white/[0.08] p-6 backdrop-blur-md">
            <h2 className="text-base font-semibold text-white">
              Sign in with credentials
            </h2>
            <p className="mt-1 text-xs text-[#CBD5E1]">
              Demo password{" "}
              <code className="rounded-md bg-white/15 px-1.5 py-0.5 font-mono text-white">
                demo1234
              </code>
            </p>

            {error && (
              <div
                role="alert"
                className="mt-3 flex items-center gap-2 rounded-lg border border-[#FCA5A5]/40 bg-[#7F1D1D]/60 p-3 text-sm text-[#FEE2E2]"
              >
                <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="mt-4 space-y-3" noValidate>
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-xs font-medium text-[#E2E8F0]"
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
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-white/20 bg-white px-3 py-2 text-sm text-[#0F172A] focus:border-[#38BDF8] focus:outline-none"
                />
                {emailError && (
                  <p className="mt-1 text-xs text-[#FCA5A5]">{emailError}</p>
                )}
              </div>
              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-medium text-[#E2E8F0]"
                >
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-white/20 bg-white px-3 py-2 text-sm text-[#0F172A] focus:border-[#38BDF8] focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="min-h-[42px] w-full cursor-pointer rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-[rgba(15,23,42,0.12)] bg-white p-6">
            <h2 className="text-base font-semibold text-[#0F172A]">
              Quick role access
            </h2>
            <p className="mt-1 text-xs text-[#475569]">
              Launch a role workspace directly for evaluation
            </p>
            <div className="mt-3 space-y-2">
              {DEMO_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  disabled={loading}
                  onClick={() => handleDemoSignIn(acc.email, acc.route)}
                  className="flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-[rgba(15,23,42,0.10)] bg-[#F4F7FB] px-3 py-2 text-left transition-colors hover:border-[#2563EB] hover:bg-white disabled:opacity-60"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#0F172A]">
                      {acc.role}
                    </p>
                    <p className="truncate text-xs text-[#475569]">
                      {acc.email}
                    </p>
                  </div>
                  <ArrowRight
                    className="h-4 w-4 shrink-0 text-[#2563EB]"
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
