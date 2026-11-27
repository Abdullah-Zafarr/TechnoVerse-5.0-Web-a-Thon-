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
  const [user, setUser] = useState<SafeUser | null>(null);
  const [exams, setExams] = useState<CandidateExamItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [breakdownData, setBreakdownData] = useState<BreakdownPayload | null>(
    null
  );
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const meRes = await fetch("/api/auth/me");
      const meData = (await meRes.json()) as { user: SafeUser | null };
      setUser(meData.user);

      const res = await fetch("/api/exams");
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        setError(err.error ?? "Sign in as a candidate to view examinations.");
        setLoading(false);
        return;
      }
      const data = (await res.json()) as { exams: CandidateExamItem[] };
      setExams(data.exams);
      setLoading(false);
    }
    load();
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

  function renderExamCard(exam: CandidateExamItem) {
    return (
      <article
        key={exam.id}
        className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-[#0F172A] px-2 py-0.5 font-mono text-xs font-medium text-white">
                {exam.code}
              </span>
              <span className="rounded-md border border-[rgba(15,23,42,0.14)] bg-[#F6F8FA] px-2 py-0.5 text-xs font-medium capitalize text-[#0F172A]">
                {exam.status}
              </span>
            </div>
            <h3 className="mt-2 text-lg font-semibold text-[#0F172A]">
              {exam.title}
            </h3>
            <p className="mt-1 max-w-[68ch] text-sm text-[#475569]">
              {exam.instructions}
            </p>
            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[#64748B]">
              <div>
                <dt className="inline">Duration: </dt>
                <dd className="inline font-mono font-medium tabular-nums text-[#0F172A]">
                  {exam.durationMinutes} min
                </dd>
              </div>
              <div>
                <dt className="inline">Total marks: </dt>
                <dd className="inline font-mono font-medium tabular-nums text-[#0F172A]">
                  {exam.totalMarks}
                </dd>
              </div>
              <div>
                <dt className="inline">Questions: </dt>
                <dd className="inline font-mono font-medium tabular-nums text-[#0F172A]">
                  {exam.questionsPerPaper}
                </dd>
              </div>
              <div>
                <dt className="inline">Window: </dt>
                <dd className="inline font-mono tabular-nums text-[#0F172A]">
                  {new Date(exam.windowStart).toLocaleString()} to{" "}
                  {new Date(exam.windowEnd).toLocaleString()}
                </dd>
              </div>
            </dl>
          </div>

          <div className="flex flex-col items-end gap-2">
            {exam.canEnter ? (
              <Link
                href={`/exam/${exam.id}`}
                className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg bg-[#1D4ED8] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF]"
              >
                <Play className="h-4 w-4" aria-hidden="true" />
                <span>
                  {exam.myAttempt?.status === "in_progress"
                    ? "Resume exam"
                    : "Start exam"}
                </span>
              </Link>
            ) : exam.myAttempt && exam.myAttempt.status !== "in_progress" ? (
              <div className="text-right">
                <div className="inline-flex items-center gap-1.5 text-xs font-medium capitalize text-[#0F766E]">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  <span>{exam.myAttempt.status}</span>
                </div>
                {exam.resultsPublished ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-sm font-medium text-[#475569]">
                      Score{" "}
                      <span className="font-mono text-lg font-semibold tabular-nums text-[#0F172A]">
                        {exam.myAttempt.totalAwardedMarks} /{" "}
                        {exam.myAttempt.totalPossibleMarks}
                      </span>
                    </p>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        disabled={breakdownLoading}
                        onClick={() => openBreakdown(exam.myAttempt!.id)}
                        className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg border border-[rgba(15,23,42,0.14)] bg-white px-3 py-2 text-xs font-medium text-[#0F172A] transition-colors hover:bg-[#EEF2F6]"
                      >
                        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>View breakdown</span>
                      </button>
                      <a
                        href={`/api/reports/${exam.myAttempt.id}/pdf`}
                        className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg border border-[rgba(15,23,42,0.14)] bg-[#F6F8FA] px-3 py-2 text-xs font-medium text-[#0F172A] transition-colors hover:bg-[#EEF2F6]"
                      >
                        <FileDown className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Download PDF</span>
                      </a>
                      {exam.myAttempt.verificationCode && (
                        <Link
                          href={`/verify/${exam.myAttempt.verificationCode}`}
                          className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg border border-[#1D4ED8]/30 bg-[#EFF6FF] px-3 py-2 font-mono text-xs font-medium text-[#1D4ED8] transition-colors hover:bg-[#DBEAFE]"
                        >
                          <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{exam.myAttempt.verificationCode}</span>
                        </Link>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 flex items-center justify-end gap-1 text-xs text-[#64748B]">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Awaiting examiner publication</span>
                  </p>
                )}
              </div>
            ) : (
              <span className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[rgba(15,23,42,0.14)] bg-[#F6F8FA] px-3 py-2 text-xs font-medium text-[#64748B]">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {new Date(exam.windowEnd).getTime() < nowMs
                    ? "Window closed (no attempt)"
                    : "Unavailable outside exam window"}
                </span>
              </span>
            )}
          </div>
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
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[#1D4ED8]">
              Candidate workspace
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#0F172A]">
              Examinations and published results
            </h1>
          </div>
          <Link
            href="/"
            className="inline-flex min-h-[40px] cursor-pointer items-center rounded-lg border border-[rgba(15,23,42,0.12)] bg-white px-3.5 py-2 text-sm font-medium text-[#0F172A] transition-colors hover:bg-[#EEF2F6]"
          >
            Switch account
          </Link>
        </div>

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
          <div className="mt-6 space-y-8">
            <section>
              <h2 className="text-base font-semibold text-[#0F172A]">
                Available now{" "}
                <span className="font-mono text-sm font-medium tabular-nums text-[#64748B]">
                  ({available.length})
                </span>
              </h2>
              <div className="mt-3 space-y-3">
                {available.length === 0 ? (
                  <p className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-5 text-sm text-[#64748B]">
                    No active examinations open right now.
                  </p>
                ) : (
                  available.map(renderExamCard)
                )}
              </div>
            </section>

            <section>
              <h2 className="text-base font-semibold text-[#0F172A]">
                Upcoming{" "}
                <span className="font-mono text-sm font-medium tabular-nums text-[#64748B]">
                  ({upcoming.length})
                </span>
              </h2>
              <div className="mt-3 space-y-3">
                {upcoming.length === 0 ? (
                  <p className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-5 text-sm text-[#64748B]">
                    No upcoming scheduled examinations.
                  </p>
                ) : (
                  upcoming.map(renderExamCard)
                )}
              </div>
            </section>

            <section>
              <h2 className="text-base font-semibold text-[#0F172A]">
                Completed{" "}
                <span className="font-mono text-sm font-medium tabular-nums text-[#64748B]">
                  ({completed.length})
                </span>
              </h2>
              <div className="mt-3 space-y-3">
                {completed.length === 0 ? (
                  <p className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-5 text-sm text-[#64748B]">
                    No completed attempts recorded yet.
                  </p>
                ) : (
                  completed.map(renderExamCard)
                )}
              </div>
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
