"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Clock,
  CheckCircle2,
  ShieldAlert,
  QrCode,
  Flag,
} from "lucide-react";
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

interface PreviewQuestion {
  num: string;
  marks: number;
  title: string;
  prompt: string;
  options: string[];
  defaultSelected: number;
  initialState: "done" | "active" | "review" | "empty";
}

const PREVIEW_QUESTIONS: PreviewQuestion[] = [
  {
    num: "01",
    marks: 2,
    title: "Server-enforced attempt deadline",
    prompt: "Which timestamp governs automatic expiration when a client tab disconnects?",
    options: [
      "Server-persisted expiration timestamp computed at attempt start",
      "Local browser countdown interval stored in memory",
    ],
    defaultSelected: 0,
    initialState: "done",
  },
  {
    num: "02",
    marks: 2,
    title: "Role isolation on grading routes",
    prompt: "How does the backend prevent cross-examiner grading access?",
    options: [
      "Verify session role and exam ownership on every handler",
      "Hide restricted buttons in the client navigation rail",
    ],
    defaultSelected: 0,
    initialState: "done",
  },
  {
    num: "03",
    marks: 3,
    title: "Immutable attempt snapshots",
    prompt:
      "An examiner updates marks in the bank while candidates are active. What keeps grading consistent for running attempts?",
    options: [
      "Freeze the question and marking scheme snapshot at attempt start",
      "Restart all active timers and discard saved answers",
    ],
    defaultSelected: 0,
    initialState: "active",
  },
  {
    num: "04",
    marks: 3,
    title: "Monotonic answer revision guard",
    prompt: "Why does each saved response carry an incrementing revision integer?",
    options: [
      "Reject stale out-of-order network flushes without overwriting newer edits",
      "Compress JSON payloads before local storage writes",
    ],
    defaultSelected: 0,
    initialState: "review",
  },
  {
    num: "05",
    marks: 4,
    title: "Privacy-preserving public verification",
    prompt: "Which fields appear on the public QR verification ledger?",
    options: [
      "Masked candidate name, exam title, score, and submission timestamp",
      "Full written scripts and candidate email address",
    ],
    defaultSelected: -1,
    initialState: "empty",
  },
];

export default function HomePage() {
  const router = useRouter();
  const [user, setUser] = useState<SafeUser | null>(null);
  const [email, setEmail] = useState("candidate1@examguard.edu");
  const [password, setPassword] = useState("demo1234");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [previewIdx, setPreviewIdx] = useState(2);
  const [previewChoice, setPreviewChoice] = useState<Record<number, number>>({
    0: 0,
    1: 0,
    2: 0,
    3: 0,
  });
  const [previewFlagged, setPreviewFlagged] = useState<Record<number, boolean>>({
    3: true,
  });

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

  const activePreview = PREVIEW_QUESTIONS[previewIdx];
  const selectedOpt = previewChoice[previewIdx] ?? -1;
  const isFlagged = Boolean(previewFlagged[previewIdx]);

  return (
    <div className="min-h-screen bg-[#F6F8FA]">
      <TopNav user={user} />

      <main
        id="main-content"
        className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:py-10"
      >
        <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
          {/* Left column: Headline, value statement, sign-in & quick role switch */}
          <section className="space-y-6 lg:col-span-6">
            <div>
              <h1 className="max-w-[26ch] text-3xl font-semibold tracking-tight text-[#0F172A] sm:text-4xl">
                Secure examinations from authoring to verified report
              </h1>
              <p className="mt-3 max-w-[56ch] text-base text-[#475569]">
                Role-isolated examination delivery with backend authorization,
                server-enforced timers, immutable attempt snapshots, live
                monitoring, and QR-verified PDF transcripts.
              </p>
            </div>

            {user && (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#1D4ED8]/30 bg-[#EFF6FF] p-4">
                <div>
                  <p className="text-sm font-medium text-[#0F172A]">
                    Active session: {user.name} ({user.role})
                  </p>
                  <p className="text-xs text-[#475569]">
                    Continue to your workspace or choose another role below
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
              <div className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-5">
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

              <div className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-5">
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
          </section>

          {/* Right column: Live coded Exam Desk Preview */}
          <aside className="space-y-4 lg:col-span-6">
            <div className="rounded-xl border border-[rgba(15,23,42,0.12)] bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(15,23,42,0.10)] pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="rounded-md bg-[#0F172A] px-2 py-1 font-mono text-xs font-medium text-white">
                    CS-301
                  </span>
                  <span className="text-sm font-semibold text-[#0F172A]">
                    Exam desk preview
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-[#0F766E]/25 bg-[#F0FDFA] px-2.5 py-1 text-xs font-medium text-[#0F766E]">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      Saved{" "}
                      <span className="font-mono tabular-nums">11:24:18</span>
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[#0F172A] px-2.5 py-1 font-mono text-xs font-medium tabular-nums text-white">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>24:18</span>
                  </span>
                </div>
              </div>

              {/* Calibrated index strip */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-[#64748B]">
                    Questions
                  </span>
                  {PREVIEW_QUESTIONS.map((q, idx) => {
                    const isActive = idx === previewIdx;
                    const flagged = Boolean(previewFlagged[idx]);
                    const answered =
                      previewChoice[idx] !== undefined &&
                      previewChoice[idx] >= 0;

                    return (
                      <button
                        key={q.num}
                        type="button"
                        onClick={() => setPreviewIdx(idx)}
                        aria-label={`Preview question ${q.num}`}
                        aria-pressed={isActive}
                        className={`inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-md border font-mono text-xs font-medium tabular-nums transition-colors ${
                          isActive
                            ? "border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8] ring-1 ring-[#1D4ED8]"
                            : flagged
                              ? "border-[#B45309]/40 bg-[#FFFBEB] text-[#B45309]"
                              : answered
                                ? "border-[#0F766E]/30 bg-[#F0FDFA] text-[#0F766E]"
                                : "border-[rgba(15,23,42,0.12)] bg-[#F6F8FA] text-[#64748B] hover:bg-[#EEF2F6]"
                        }`}
                      >
                        {q.num}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setPreviewFlagged((prev) => ({
                      ...prev,
                      [previewIdx]: !prev[previewIdx],
                    }))
                  }
                  className={`inline-flex min-h-[32px] cursor-pointer items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    isFlagged
                      ? "border-[#B45309]/40 bg-[#FFFBEB] text-[#B45309]"
                      : "border-[rgba(15,23,42,0.12)] bg-white text-[#475569] hover:bg-[#EEF2F6]"
                  }`}
                >
                  <Flag className="h-3 w-3" aria-hidden="true" />
                  <span>{isFlagged ? "Flagged" : "Flag"}</span>
                </button>
              </div>

              {/* Sample Question */}
              <div className="mt-4 rounded-lg border border-[rgba(15,23,42,0.10)] bg-[#F6F8FA] p-4">
                <div className="flex items-center justify-between text-xs text-[#64748B]">
                  <span>
                    Question{" "}
                    <span className="font-mono tabular-nums text-[#0F172A]">
                      {activePreview.num} / 05
                    </span>
                  </span>
                  <span className="font-mono tabular-nums text-[#0F172A]">
                    {activePreview.marks} marks
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-[#0F172A]">
                  {activePreview.title}
                </p>
                <p className="mt-1 text-sm text-[#475569]">
                  {activePreview.prompt}
                </p>
                <div className="mt-3 space-y-2 text-xs">
                  {activePreview.options.map((opt, optIdx) => {
                    const isPicked = selectedOpt === optIdx;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() =>
                          setPreviewChoice((prev) => ({
                            ...prev,
                            [previewIdx]: optIdx,
                          }))
                        }
                        className={`block w-full cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-colors ${
                          isPicked
                            ? "border-[#1D4ED8] bg-white font-medium text-[#0F172A]"
                            : "border-[rgba(15,23,42,0.10)] bg-white text-[#475569] hover:border-[rgba(15,23,42,0.25)]"
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-[#64748B]">
                  <span>Interactive preview</span>
                  <div className="hidden items-center gap-2 sm:flex">
                    <kbd className="rounded-md border border-[rgba(15,23,42,0.14)] bg-white px-1.5 py-0.5 font-mono text-[11px] text-[#0F172A]">
                      Alt+Left
                    </kbd>
                    <kbd className="rounded-md border border-[rgba(15,23,42,0.14)] bg-white px-1.5 py-0.5 font-mono text-[11px] text-[#0F172A]">
                      Alt+Right
                    </kbd>
                  </div>
                </div>
              </div>

              {/* Direct verification entry */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(15,23,42,0.10)] pt-4">
                <div className="flex items-center gap-2 text-xs text-[#475569]">
                  <QrCode className="h-4 w-4 shrink-0 text-[#1D4ED8]" aria-hidden="true" />
                  <span>
                    Have a report code? Verify authenticity without exposing
                    private details.
                  </span>
                </div>
                <Link
                  href="/verify"
                  className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg border border-[rgba(15,23,42,0.14)] bg-white px-3.5 py-2 text-xs font-medium text-[#0F172A] transition-colors hover:bg-[#EEF2F6]"
                >
                  <span>Verify a report</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
