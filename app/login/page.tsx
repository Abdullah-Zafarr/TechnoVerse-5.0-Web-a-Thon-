"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ShieldAlert } from "lucide-react";
import TopNav from "@/components/TopNav";
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
    <div className="min-h-screen bg-[#F6F8FA]">
      <TopNav user={user} />

      <main
        id="main-content"
        className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:py-12"
      >
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A] sm:text-3xl">
              Sign in to ExamGuard
            </h1>
            <p className="mt-1 text-sm text-[#475569]">
              Use your account credentials or launch a role workspace directly.
            </p>
          </div>
          <Link
            href="/portal"
            className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg border border-[rgba(15,23,42,0.12)] bg-white px-3.5 py-2 text-sm font-medium text-[#0F172A] transition-colors hover:bg-[#EEF2F6]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Back to overview</span>
          </Link>
        </div>

        {user && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#1D4ED8]/30 bg-[#EFF6FF] p-4">
            <div>
              <p className="text-sm font-medium text-[#0F172A]">
                Active session: {user.name} ({user.role})
              </p>
              <p className="text-xs text-[#475569]">
                Continue to your workspace or sign in as another role below
              </p>
            </div>
            <button
              type="button"
              onClick={() => routeForUser(user)}
              className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF]"
            >
              <span>Open workspace</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-6">
            <h2 className="text-base font-semibold text-[#0F172A]">
              Sign in with credentials
            </h2>
            <p className="mt-1 text-xs text-[#64748B]">
              Demo password{" "}
              <code className="rounded-md bg-[#EEF2F6] px-1.5 py-0.5 font-mono text-[#0F172A]">
                demo1234
              </code>
            </p>

            {error && (
              <div
                role="alert"
                className="mt-3 flex items-center gap-2 rounded-lg border border-[#B91C1C]/30 bg-[#FEF2F2] p-3 text-sm text-[#B91C1C]"
              >
                <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="mt-4 space-y-3" noValidate>
              <div>
                <label
                  htmlFor="login-email"
                  className="block text-xs font-medium text-[#0F172A]"
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
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] bg-white px-3 py-2 text-sm text-[#0F172A]"
                />
                {emailError && (
                  <p className="mt-1 text-xs text-[#B91C1C]">{emailError}</p>
                )}
              </div>
              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-medium text-[#0F172A]"
                >
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] bg-white px-3 py-2 text-sm text-[#0F172A]"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="min-h-[40px] w-full cursor-pointer rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF] disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-6">
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
                  className="flex min-h-[44px] w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-[rgba(15,23,42,0.10)] bg-[#F6F8FA] px-3 py-2 text-left transition-colors hover:border-[#1D4ED8] hover:bg-white disabled:opacity-60"
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
                    className="h-4 w-4 shrink-0 text-[#1D4ED8]"
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
