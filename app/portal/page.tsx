"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Clock,
  CheckCircle2,
  QrCode,
  Flag,
  ShieldCheck,
  Lock,
  FileCheck2,
  LogOut,
} from "lucide-react";
import type { SafeUser } from "@/lib/types";
import {
  clearCachedSessionUser,
  fetchSessionUser,
  getCachedSessionUser,
} from "@/lib/clientSession";

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

const CAPABILITIES = [
  {
    icon: ShieldCheck,
    title: "Role-isolated workspaces",
    detail: "Separate portals for admins, examiners, and candidates with server-enforced RBAC.",
  },
  {
    icon: Lock,
    title: "Immutable attempt snapshots",
    detail: "Questions, timers, and marking schemes freeze at attempt start with monotonic save guards.",
  },
  {
    icon: FileCheck2,
    title: "QR-verified transcripts",
    detail: "Issue tamper-evident PDF score reports verifiable without exposing private candidate data.",
  },
];

export default function PortalPage() {
  const router = useRouter();
  const [user, setUser] = useState<SafeUser | null>(() => getCachedSessionUser());

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
    fetchSessionUser().then((u) => setUser(u)).catch(() => {});
  }, []);

  function routeForUser(u: SafeUser) {
    if (u.role === "admin") router.push("/admin");
    else if (u.role === "examiner") router.push("/examiner");
    else router.push("/candidate");
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    clearCachedSessionUser();
    setUser(null);
    router.refresh();
  }

  const activePreview = PREVIEW_QUESTIONS[previewIdx];
  const selectedOpt = previewChoice[previewIdx] ?? -1;
  const isFlagged = Boolean(previewFlagged[previewIdx]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#F4F7FB]">
      {/* Split deep-navy architectural canvas on desktop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute inset-0 bg-[#071947] lg:w-[60%]" />
        {/* Subtle curved transition edge on large screens */}
        <svg
          className="absolute inset-y-0 left-[54%] hidden h-full w-48 lg:block"
          viewBox="0 0 180 900"
          preserveAspectRatio="none"
        >
          <path
            d="M0,0 L70,0 C170,260 155,640 25,900 L0,900 Z"
            fill="#071947"
          />
        </svg>
        {/* Subtle architectural grid on navy side */}
        <div
          className="absolute inset-y-0 left-0 w-full opacity-[0.07] lg:w-[58%]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #93C5FD 1px, transparent 1px), linear-gradient(to bottom, #93C5FD 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "linear-gradient(to bottom, #000 55%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, #000 55%, transparent 100%)",
          }}
        />
      </div>

      {/* Top Navigation */}
      <header className="relative z-20 border-b border-white/10 lg:border-b-0">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="inline-flex min-h-[40px] items-center gap-2 text-base font-semibold tracking-tight text-white"
            >
              <ShieldCheck
                className="h-5 w-5 text-[#38BDF8]"
                aria-hidden="true"
              />
              <span>ExamGuard</span>
            </Link>

            <nav aria-label="Primary navigation" className="flex items-center gap-2">
              <Link
                href="/verify"
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-[#CBD5E1] transition-colors hover:bg-white/10 hover:text-white"
              >
                <QrCode className="h-4 w-4" aria-hidden="true" />
                <span>Verify report</span>
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <div className="text-right">
                  <p className="text-sm font-medium text-white lg:text-[#0F172A]">
                    {user.name}
                  </p>
                  <p className="text-xs capitalize text-[#CBD5E1] lg:text-[#64748B]">
                    {user.role}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20 lg:border-[rgba(15,23,42,0.14)] lg:bg-white lg:text-[#0F172A] lg:hover:bg-[#EEF2F6]"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  <span>Sign out</span>
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="inline-flex min-h-[40px] items-center rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20 lg:border-[rgba(15,23,42,0.14)] lg:bg-white lg:text-[#0F172A] lg:hover:bg-[#EEF2F6]"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main
        id="main-content"
        className="relative z-10 mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:py-12"
      >
        <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
          {/* Left column on deep navy */}
          <section className="space-y-6 lg:col-span-6 lg:pr-6">
            <div>
              <h1 className="max-w-[22ch] text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-[42px] lg:leading-[1.12]">
                Secure examinations from{" "}
                <span className="text-[#38BDF8]">
                  authoring to verified report
                </span>
              </h1>
              <p className="mt-4 max-w-[54ch] text-base leading-relaxed text-[#CBD5E1]">
                Role-isolated examination delivery with backend authorization,
                server-enforced timers, immutable attempt snapshots, live
                monitoring, and QR-verified PDF transcripts.
              </p>
            </div>

            {user ? (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#38BDF8]/30 bg-white/10 p-4 backdrop-blur-sm">
                <div>
                  <p className="text-sm font-medium text-white">
                    Active session: {user.name} ({user.role})
                  </p>
                  <p className="text-xs text-[#CBD5E1]">
                    Continue to your workspace or switch accounts
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href="/login"
                    className="inline-flex min-h-[40px] items-center rounded-lg border border-white/20 bg-white/10 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
                  >
                    Switch account
                  </Link>
                  <button
                    type="button"
                    onClick={() => routeForUser(user)}
                    className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1D4ED8]"
                  >
                    <span>Open workspace</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/login"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#2563EB] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1D4ED8]"
                >
                  <span>Sign in to workspace</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href="/verify"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/15"
                >
                  <QrCode className="h-4 w-4 text-[#38BDF8]" aria-hidden="true" />
                  <span>Verify a report</span>
                </Link>
              </div>
            )}

            <div className="grid gap-3 pt-2">
              {CAPABILITIES.map(({ icon: Icon, title, detail }) => (
                <div
                  key={title}
                  className="flex items-start gap-3 rounded-xl border border-white/12 bg-white/[0.06] p-4"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#38BDF8]/15 text-[#38BDF8]">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-white">
                      {title}
                    </h2>
                    <p className="mt-0.5 text-xs text-[#CBD5E1]">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Right column: Live coded Exam Desk Preview on crisp off-white */}
          <aside className="space-y-4 lg:col-span-6">
            <div className="rounded-2xl border border-[rgba(15,23,42,0.12)] bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(15,23,42,0.10)] pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="rounded-md bg-[#0B162C] px-2.5 py-1 font-mono text-xs font-medium text-white">
                    CS-301
                  </span>
                  <span className="text-sm font-semibold text-[#0F172A]">
                    Exam desk preview
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(15,23,42,0.12)] bg-[#F4F7FB] px-2.5 py-1 text-xs font-medium text-[#334155]">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      Saved{" "}
                      <span className="font-mono tabular-nums">11:24:18</span>
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-[#0B162C] px-2.5 py-1 font-mono text-xs font-medium tabular-nums text-white">
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
                            ? "border-[#2563EB] bg-[#2563EB] text-white"
                            : flagged
                              ? "border-[#B45309]/40 bg-[#FFFBEB] text-[#B45309]"
                              : answered
                                ? "border-[#0F766E]/30 bg-[#F0FDFA] text-[#0F766E]"
                                : "border-[rgba(15,23,42,0.12)] bg-[#F4F7FB] text-[#64748B] hover:bg-[#E2E8F0]"
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

              {/* High-contrast dark question desk surface */}
              <div className="mt-4 rounded-xl border border-[#1E293B] bg-[#0B162C] p-5 text-white">
                <div className="flex items-center justify-between text-xs text-[#94A3B8]">
                  <span>
                    Question{" "}
                    <span className="font-mono tabular-nums text-white">
                      {activePreview.num} / 05
                    </span>
                  </span>
                  <span className="font-mono tabular-nums text-[#CBD5E1]">
                    {activePreview.marks} marks
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-white">
                  {activePreview.title}
                </p>
                <p className="mt-1 text-sm text-[#CBD5E1]">
                  {activePreview.prompt}
                </p>
                <div className="mt-4 space-y-2.5 text-xs">
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
                        className={`block w-full cursor-pointer rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                          isPicked
                            ? "border-[#38BDF8] bg-[#132952] font-medium text-white"
                            : "border-white/10 bg-white/[0.04] text-[#94A3B8] hover:border-white/25 hover:text-white"
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-[#94A3B8]">
                  <span>Interactive preview</span>
                  <div className="hidden items-center gap-2 sm:flex">
                    <kbd className="rounded-md border border-white/15 bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-[#E2E8F0]">
                      Alt+Left
                    </kbd>
                    <kbd className="rounded-md border border-white/15 bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-[#E2E8F0]">
                      Alt+Right
                    </kbd>
                  </div>
                </div>
              </div>

              {/* Direct verification entry */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(15,23,42,0.10)] pt-4">
                <div className="flex items-center gap-2 text-xs text-[#475569]">
                  <QrCode
                    className="h-4 w-4 shrink-0 text-[#2563EB]"
                    aria-hidden="true"
                  />
                  <span>
                    Have a report code? Verify authenticity without exposing
                    private details.
                  </span>
                </div>
                <Link
                  href="/verify"
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[rgba(15,23,42,0.14)] bg-white px-3.5 py-2 text-xs font-medium text-[#0F172A] transition-colors hover:bg-[#EEF2F6]"
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
