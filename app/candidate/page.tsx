"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Play,
  Lock,
  FileDown,
  QrCode,
  CheckCircle2,
  Clock,
  ShieldAlert,
  FileText,
  X,
} from "lucide-react";
import TopNav from "@/components/TopNav";
import { fetchSessionUser, getCachedSessionUser } from "@/lib/clientSession";
import type { QuestionOption, QuestionType, SafeUser } from "@/lib/types";

interface CandidateExamItem {
  id: string;
  code: string;
  title: string;
  instructions: string;
  status: string;
  durationMinutes: number;
  totalMarks: number;
  windowStart: string;
  windowEnd: string;
  questionsPerPaper: number;
  resultsPublished: boolean;
  canEnter: boolean;
  myAttempt: {
    id: string;
    status: string;
    gradingState: string;
    startedAt: string;
    submittedAt: string | null;
    totalPossibleMarks: number;
    totalAwardedMarks: number | null;
    verificationCode: string | null;
  } | null;
}

interface BreakdownPayload {
  id: string;
  examCode: string;
  examTitle: string;
  candidateName: string;
  status: string;
  gradingState: string;
  submittedAt: string | null;
  totalAwardedMarks: number;
  totalPossibleMarks: number;
  verificationCode: string | null;
  breakdown: Array<{
    questionId: string;
    order: number;
    title: string;
    prompt: string;
    type: QuestionType;
    marks: number;
    options: QuestionOption[];
    selectedOptionIds: string[];
    writtenText: string;
    autoScore: number | null;
    manualScore: number | null;
    manualFeedback: string | null;
  }>;
}

export default function CandidatePage() {
  const [user, setUser] = useState<SafeUser | null>(() => getCachedSessionUser());
  const [exams, setExams] = useState<CandidateExamItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"available" | "upcoming" | "completed">("available");

  const [breakdownData, setBreakdownData] = useState<BreakdownPayload | null>(
    null
  );
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const [meUser, res] = await Promise.all([
        fetchSessionUser(),
        fetch("/api/exams"),
      ]);
      if (!active) return;
      setUser(meUser);

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        if (!active) return;
        setError(err.error ?? "Sign in as a candidate to view examinations.");
        setLoading(false);
        return;
      }
      const data = (await res.json()) as { exams: CandidateExamItem[] };
      if (!active) return;
      setExams(data.exams);
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!breakdownData) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBreakdownData(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [breakdownData]);

  async function openBreakdown(attemptId: string) {
    setError(null);
    setBreakdownLoading(true);
    try {
      const res = await fetch(`/api/attempts/${encodeURIComponent(attemptId)}`);
      const data = (await res.json()) as {
        attempt?: BreakdownPayload;
        error?: string;
      };
      if (!res.ok || !data.attempt) {
        setError(data.error ?? "Unable to load attempt breakdown");
        setBreakdownLoading(false);
        return;
      }
      setBreakdownData(data.attempt);
    } catch {
      setError("Network error while loading breakdown");
    }
    setBreakdownLoading(false);
  }

  const nowMs = Date.now();
  const available = exams.filter((e) => e.canEnter);
  const upcoming = exams.filter(
    (e) =>
      !e.canEnter &&
      (!e.myAttempt || e.myAttempt.status === "in_progress") &&
      e.status !== "completed" &&
      new Date(e.windowEnd).getTime() >= nowMs
  );
  const completed = exams.filter(
    (e) =>
      (e.myAttempt && e.myAttempt.status !== "in_progress") ||
      e.status === "completed" ||
      new Date(e.windowEnd).getTime() < nowMs
  );

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  const closingSoon = [...available].sort(
    (a, b) =>
      new Date(a.windowEnd).getTime() - new Date(b.windowEnd).getTime()
  )[0];
  const nextUp = [...upcoming]
    .filter((e) => new Date(e.windowStart).getTime() > nowMs)
    .sort(
      (a, b) =>
        new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime()
    )[0];
  const scored = completed.filter(
    (e) =>
      e.resultsPublished &&
      e.myAttempt &&
      e.myAttempt.totalAwardedMarks !== null &&
      e.myAttempt.totalPossibleMarks > 0
  );
  const avgPct = scored.length
    ? Math.round(
        (scored.reduce(
          (sum, e) =>
            sum +
            (e.myAttempt!.totalAwardedMarks! / e.myAttempt!.totalPossibleMarks) *
              100,
          0
        ) /
          scored.length) *
          10
      ) / 10
    : null;
  const submittedCount = exams.filter(
    (e) => e.myAttempt && e.myAttempt.status !== "in_progress"
  ).length;
  const inProgress = exams.find((e) => e.myAttempt?.status === "in_progress");

  const summaryCards = [
    {
      label: inProgress ? "Resume your exam" : "Ready for you now",
      value: inProgress
        ? inProgress.code
        : `${available.length} exam${available.length === 1 ? "" : "s"}`,
      detail: inProgress
        ? "Attempt in progress"
        : closingSoon
          ? `${closingSoon.code} closes ${fmt(closingSoon.windowEnd)}`
          : "Nothing open right now",
    },
    {
      label: "Your next exam",
      value: nextUp ? nextUp.code : "None scheduled",
      detail: nextUp
        ? `Opens ${fmt(nextUp.windowStart)}`
        : "You're all caught up",
    },
    {
      label: "Your results",
      value: avgPct !== null ? `${avgPct}% avg` : "No scores yet",
      detail:
        avgPct !== null
          ? `Across ${scored.length} published result${scored.length === 1 ? "" : "s"}`
          : `${submittedCount} submitted, awaiting results`,
    },
  ];

  const subjects: Record<string, string> = {
    CS: "Computer Science",
    SE: "Software Engineering",
    DB: "Databases",
    ENG: "English",
  };
  const subjectOf = (code: string) =>
    subjects[code.split("-")[0].toUpperCase()] ?? code.split("-")[0];
  const fmtFull = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  const tabs = [
    { key: "available", label: "Available", items: available, empty: "No active examinations open right now." },
    { key: "upcoming", label: "Upcoming", items: upcoming, empty: "No upcoming scheduled examinations." },
    { key: "completed", label: "Completed", items: completed, empty: "No completed attempts recorded yet." },
  ] as const;
  const activeTab = tabs.find((t) => t.key === tab) ?? tabs[0];

  function renderExamCard(exam: CandidateExamItem) {
    const attempt = exam.myAttempt;
    const done = attempt && attempt.status !== "in_progress";
    const pill = done
      ? "Submitted"
      : exam.canEnter
        ? attempt ? "In progress" : "Available"
        : new Date(exam.windowEnd).getTime() < nowMs
          ? "Closed"
          : "Upcoming";
    const pillCls =
      pill === "Available" || pill === "In progress"
        ? "border-[#86EFAC] bg-[#ECFDF5] text-[#047857]"
        : pill === "Upcoming"
          ? "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]"
          : "border-[rgba(15,23,42,0.14)] bg-[#F6F8FA] text-[#475569]";
    const btn =
      "inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors";
    return (
      <article
        key={exam.id}
        className="flex flex-col overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.08)] border-t-2 border-t-[#38BDF8] bg-white shadow-sm"
      >
        <div className="flex-1 p-6">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-[#475569]">
              {exam.code} · {subjectOf(exam.code)}
            </p>
            <span className={`rounded-full border px-3 py-0.5 text-xs font-medium ${pillCls}`}>
              {pill}
            </span>
          </div>
          <h3 className="mt-3 text-xl font-bold text-[#0F172A]">{exam.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-[#475569]">
            {exam.instructions}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-[rgba(15,23,42,0.08)] bg-[#F6F8FA] px-4 py-3 text-sm text-[#475569]">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4" aria-hidden="true" />
              {exam.durationMinutes} mins
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FileText className="h-4 w-4" aria-hidden="true" />
              {exam.questionsPerPaper} questions
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {exam.totalMarks} marks
            </span>
          </div>
          <p className="mt-4 text-sm text-[#475569]">
            Window: {fmtFull(exam.windowStart)} – {fmtFull(exam.windowEnd)}
          </p>
        </div>

        <div className="border-t border-[rgba(15,23,42,0.08)] bg-[#FAFBFD] p-4">
          {exam.canEnter ? (
            <Link
              href={`/exam/${exam.id}`}
              className={`${btn} w-full bg-gradient-to-r from-[#1E3A8A] to-[#2563EB] text-white hover:opacity-90`}
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {attempt?.status === "in_progress"
                ? "Resume Exam"
                : "View Instructions & Enter"}
            </Link>
          ) : done && attempt ? (
            exam.resultsPublished ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-[#475569]">
                  Score{" "}
                  <span className="font-mono text-lg font-semibold tabular-nums text-[#0F172A]">
                    {attempt.totalAwardedMarks} / {attempt.totalPossibleMarks}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={breakdownLoading}
                    onClick={() => openBreakdown(attempt.id)}
                    className={`${btn} border border-[rgba(15,23,42,0.14)] bg-white text-[#0F172A] hover:bg-[#EEF2F6]`}
                  >
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    Breakdown
                  </button>
                  <a
                    href={`/api/reports/${attempt.id}/pdf`}
                    className={`${btn} border border-[rgba(15,23,42,0.14)] bg-white text-[#0F172A] hover:bg-[#EEF2F6]`}
                  >
                    <FileDown className="h-4 w-4" aria-hidden="true" />
                    PDF
                  </a>
                  {attempt.verificationCode && (
                    <Link
                      href={`/verify/${attempt.verificationCode}`}
                      className={`${btn} border border-[#1D4ED8]/30 bg-[#EFF6FF] font-mono text-[#1D4ED8] hover:bg-[#DBEAFE]`}
                    >
                      <QrCode className="h-4 w-4" aria-hidden="true" />
                      {attempt.verificationCode}
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <p className="flex min-h-[44px] items-center justify-center gap-2 text-sm text-[#64748B]">
                <Clock className="h-4 w-4" aria-hidden="true" />
                Submitted · awaiting examiner publication
              </p>
            )
          ) : (
            <p className="flex min-h-[44px] items-center justify-center gap-2 text-sm text-[#64748B]">
              <Lock className="h-4 w-4" aria-hidden="true" />
              {new Date(exam.windowEnd).getTime() < nowMs
                ? "Window closed (no attempt)"
                : `Opens ${fmtFull(exam.windowStart)}`}
            </p>
          )}
        </div>
      </article>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F8FA]">
      <TopNav user={user} />

      <main
        id="main-content"
        className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6"
      >
        <section
          aria-label="Candidate welcome"
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1E3A8A] via-[#1D4ED8] to-[#38BDF8] p-6 text-white sm:p-8"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10"
          />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#BFDBFE]">
                Candidate examination dashboard
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                Welcome back{user ? `, ${user.name}` : ""}
              </h1>
              <p className="mt-2 text-sm text-white/85">
                {user ? (
                  <>
                    <span>{user.email}</span>
                    <span aria-hidden="true"> &middot; </span>
                    <span>
                      Member since{" "}
                      {new Date(user.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </>
                ) : (
                  "Your examinations and published results"
                )}
              </p>
              <Link
                href="/login"
                className="mt-4 inline-flex min-h-[36px] cursor-pointer items-center rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
              >
                Switch account
              </Link>
            </div>
            <div className="flex flex-wrap gap-3">
              {summaryCards.map((s) => (
                <div
                  key={s.label}
                  className="w-[190px] rounded-xl border border-white/25 bg-white/15 px-4 py-3"
                >
                  <div className="text-xs text-white/80">{s.label}</div>
                  <div className="mt-1 truncate font-mono text-xl font-bold tabular-nums">
                    {s.value}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-white/85">
                    {s.detail}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="mt-4 flex items-center gap-2 rounded-lg border border-[#B91C1C]/30 bg-[#FEF2F2] p-3 text-sm text-[#B91C1C]"
          >
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {loading && (
          <div className="mt-6 rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-6 text-sm text-[#475569]">
            Loading assigned examinations...
          </div>
        )}

        {!loading && !error && (
          <div className="mt-8 space-y-10">
            <section aria-label="Your examinations">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-2xl font-bold tracking-tight text-[#0F172A]">
                  Your Examinations
                </h2>
                <div role="tablist" className="inline-flex gap-1 rounded-xl border border-[rgba(15,23,42,0.10)] bg-white/80 p-1">
                  {tabs.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={tab === t.key}
                      onClick={() => setTab(t.key)}
                      className={`min-h-[40px] cursor-pointer rounded-lg px-4 text-sm font-medium transition-colors ${
                        tab === t.key
                          ? "bg-white text-[#1E40AF] shadow-sm"
                          : "text-[#475569] hover:text-[#0F172A]"
                      }`}
                    >
                      {t.label} ({t.items.length})
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-5 grid gap-6 md:grid-cols-2">
                {activeTab.items.length === 0 ? (
                  <p className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-5 text-sm text-[#64748B] md:col-span-2">
                    {activeTab.empty}
                  </p>
                ) : (
                  activeTab.items.map(renderExamCard)
                )}
              </div>
            </section>

            <section aria-label="Recent published results">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-[#0F172A]">
                    Recent Published Results
                  </h2>
                  <p className="mt-1 text-sm text-[#64748B]">
                    Verified scores, question breakdowns, and downloadable PDF reports.
                  </p>
                </div>
                {scored.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setTab("completed")}
                    className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl border border-[rgba(15,23,42,0.12)] bg-white px-4 text-sm font-medium text-[#0F172A] transition-colors hover:bg-[#EEF2F6]"
                  >
                    View all in Completed ({completed.length})
                  </button>
                )}
              </div>
              {scored.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white p-6 text-sm text-[#64748B]">
                  No published results yet. Once an examiner publishes your graded attempt, your score and report will appear here.
                </div>
              ) : (
                <div className="mt-5 grid gap-6 md:grid-cols-2">
                  {scored.map((e) => {
                    const attempt = e.myAttempt!;
                    const awarded = attempt.totalAwardedMarks ?? 0;
                    const possible = attempt.totalPossibleMarks;
                    const pct =
                      possible > 0 ? Math.round((awarded / possible) * 1000) / 10 : 0;
                    const tier =
                      pct >= 80
                        ? {
                            badge: "border-[#86EFAC] bg-[#ECFDF5] text-[#047857]",
                            bar: "bg-[#10B981]",
                          }
                        : pct >= 50
                          ? {
                              badge: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]",
                              bar: "bg-[#2563EB]",
                            }
                          : {
                              badge: "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
                              bar: "bg-[#EF4444]",
                            };
                    const submittedLabel = attempt.submittedAt
                      ? fmt(attempt.submittedAt)
                      : fmt(e.windowEnd);

                    return (
                      <article
                        key={e.id}
                        className="flex flex-col overflow-hidden rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white shadow-sm"
                      >
                        <div className="flex-1 p-6">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
                              <span className="rounded-md border border-[#BFDBFE] bg-[#EFF6FF] px-2 py-0.5 font-mono font-semibold text-[#1D4ED8]">
                                {e.code}
                              </span>
                              <span className="font-medium text-[#475569]">
                                {subjectOf(e.code)}
                              </span>
                              <span aria-hidden="true">&middot;</span>
                              <span>{submittedLabel}</span>
                            </div>
                            <span
                              className={`rounded-full border px-2.5 py-0.5 font-mono text-xs font-semibold tabular-nums ${tier.badge}`}
                            >
                              {pct}%
                            </span>
                          </div>

                          <div className="mt-4 flex items-baseline justify-between gap-4">
                            <h3 className="min-w-0 text-lg font-bold leading-snug text-[#0F172A]">
                              {e.title}
                            </h3>
                            <div className="shrink-0 text-right font-mono tabular-nums">
                              <span className="text-2xl font-bold text-[#0F172A]">
                                {awarded}
                              </span>
                              <span className="text-sm text-[#64748B]">
                                {" "}
                                / {possible}
                              </span>
                            </div>
                          </div>

                          <div
                            className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[#EEF2F6]"
                            role="progressbar"
                            aria-valuenow={Math.round(pct)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${e.title} score ${pct}%`}
                          >
                            <div
                              className={`h-full rounded-full transition-[width] duration-300 ${tier.bar}`}
                              style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(15,23,42,0.08)] bg-[#FAFBFD] px-5 py-3">
                          {attempt.verificationCode ? (
                            <Link
                              href={`/verify/${attempt.verificationCode}`}
                              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[#1D4ED8]/25 bg-[#EFF6FF] px-2.5 font-mono text-xs font-medium text-[#1D4ED8] transition-colors hover:bg-[#DBEAFE]"
                            >
                              <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                              {attempt.verificationCode}
                            </Link>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#047857]">
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                              Published
                            </span>
                          )}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={breakdownLoading}
                              onClick={() => openBreakdown(attempt.id)}
                              className="inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg border border-[rgba(15,23,42,0.14)] bg-white px-3 text-xs font-semibold text-[#0F172A] transition-colors hover:bg-[#EEF2F6]"
                            >
                              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                              Breakdown
                            </button>
                            <a
                              href={`/api/reports/${attempt.id}/pdf`}
                              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-[rgba(15,23,42,0.14)] bg-white px-3 text-xs font-semibold text-[#0F172A] transition-colors hover:bg-[#EEF2F6]"
                            >
                              <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                              PDF
                            </a>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* Attempt Breakdown Modal */}
        {breakdownData && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="breakdown-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/40 p-4"
          >
            <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[rgba(15,23,42,0.14)] bg-white p-6">
              <div className="flex items-start justify-between gap-4 border-b border-[rgba(15,23,42,0.10)] pb-4">
                <div>
                  <h2
                    id="breakdown-title"
                    className="text-lg font-semibold text-[#0F172A]"
                  >
                    <span className="font-mono">{breakdownData.examCode}</span>{" "}
                    score breakdown
                  </h2>
                  <p className="mt-1 text-sm text-[#475569]">
                    Total score{" "}
                    <span className="font-mono font-semibold tabular-nums text-[#1D4ED8]">
                      {breakdownData.totalAwardedMarks} /{" "}
                      {breakdownData.totalPossibleMarks}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close breakdown"
                  onClick={() => setBreakdownData(null)}
                  className="inline-flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#EEF2F6]"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {breakdownData.breakdown.map((item) => {
                  const awarded =
                    item.type === "written"
                      ? item.manualScore ?? "Pending"
                      : item.autoScore ?? 0;
                  const selectedLabels = item.selectedOptionIds
                    .map(
                      (id) =>
                        item.options.find((o) => o.id === id)?.text ?? id
                    )
                    .join("; ");

                  return (
                    <div
                      key={item.questionId}
                      className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-[#F6F8FA] p-4 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#0F172A]">
                          <span className="font-mono tabular-nums">
                            {String(item.order).padStart(2, "0")}.
                          </span>{" "}
                          {item.title}
                        </span>
                        <span className="font-mono text-xs font-semibold tabular-nums text-[#0F172A]">
                          {awarded} / {item.marks}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[#475569]">
                        {item.prompt}
                      </p>
                      <p className="mt-2 rounded-lg border border-[rgba(15,23,42,0.10)] bg-white p-2.5 text-xs text-[#0F172A]">
                        Your response:{" "}
                        {item.type === "written"
                          ? item.writtenText.trim() || "No written response"
                          : selectedLabels || "Not answered"}
                      </p>
                      {item.manualFeedback && (
                        <p className="mt-2 text-xs text-[#0F766E]">
                          Examiner feedback: {item.manualFeedback}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
