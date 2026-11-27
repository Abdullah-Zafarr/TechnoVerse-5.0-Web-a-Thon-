"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  Eye,
  Radio,
  BarChart3,
  Upload,
  Check,
  ShieldAlert,
  Send,
  FileDown,
  Pencil,
  Trash2,
  X,
  Info,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import TopNav from "@/components/TopNav";
import { getSupabaseBrowserClient } from "@/lib/realtime";
import type {
  Difficulty,
  ExamStatus,
  ExamSummaryMetrics,
  QuestionAnalyticsRow,
  QuestionOption,
  QuestionType,
  SafeUser,
} from "@/lib/types";

type TabId = "exams" | "questions" | "import" | "monitor" | "grading";

interface ExaminerExam {
  id: string;
  code: string;
  title: string;
  instructions: string;
  status: ExamStatus;
  durationMinutes: number;
  totalMarks: number;
  windowStart: string;
  windowEnd: string;
  questionsPerPaper: number;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  resultsPublished: boolean;
  questionIds: string[];
  enrolledCandidateIds: string[];
  attemptCount?: number;
}

interface ExaminerQuestion {
  id: string;
  title: string;
  prompt: string;
  type: QuestionType;
  topic: string;
  difficulty: Difficulty;
  marks: number;
  partialCredit: boolean;
  options: QuestionOption[];
  correctOptionIds: string[];
  rubric?: string | null;
}

interface MonitorAttempt {
  id: string;
  examId: string;
  examCode: string;
  candidateName: string;
  candidateEmail: string;
  status: string;
  gradingState: string;
  answeredCount: number;
  totalQuestions: number;
  serverExpiresAt?: string;
  lastHeartbeatAt?: string;
  incidents: { id: string; type: string; detail: string; timestamp: string }[];
}

interface AnnouncementItem {
  id: string;
  examId: string;
  message: string;
  createdBy: string;
  createdAt: string;
}

interface GradingAttempt {
  id: string;
  candidateName: string;
  candidateEmail: string;
  status: string;
  gradingState: string;
  totalPossibleMarks: number;
  totalAwardedMarks: number;
  verificationCode: string | null;
  items: {
    questionId: string;
    order: number;
    title: string;
    prompt: string;
    type: QuestionType;
    marks: number;
    rubric?: string | null;
  }[];
  answers: Record<
    string,
    {
      selectedOptionIds: string[];
      writtenText: string;
      autoScore: number | null;
      manualScore: number | null;
      manualFeedback?: string;
    }
  >;
}

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single_mcq: "Single MCQ",
  multi_select: "Multi-select",
  written: "Written",
};

const SAMPLE_QUESTIONS_CSV = `title,prompt,type,topic,difficulty,marks,options,correct
Consistent Hashing,Why does consistent hashing limit key movement on node churn?,single_mcq,Distributed Systems,medium,3,Only O(K/n) keys remap|All keys rehash|Client clocks reset,1
Zero-Trust API Controls,Select valid server defenses against tampering.,multi_select,Security,hard,4,Re-check role on server|Validate bounds on backend|Rely on CSS display none,1|2`;

const SAMPLE_CANDIDATES_CSV = `name,email
Zainab Malik,zainab@examguard.edu
Usman Tariq,usman@examguard.edu`;

const SAMPLE_QUESTIONS_JSON = JSON.stringify(
  [
    {
      title: "Idempotent Finalize",
      prompt: "Which constraint prevents duplicate attempt submission?",
      type: "single_mcq",
      topic: "Databases",
      difficulty: "medium",
      marks: 2,
      options: [
        "Unique (exam_id, candidate_id) + transaction",
        "Client button disable only",
        "CSS pointer-events none",
      ],
      correct: "1",
    },
  ],
  null,
  2
);

function toLocalDatetimeInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function ExaminerPage() {
  const [me, setMe] = useState<SafeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("exams");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [exams, setExams] = useState<ExaminerExam[]>([]);
  const [questions, setQuestions] = useState<ExaminerQuestion[]>([]);
  const [candidates, setCandidates] = useState<SafeUser[]>([]);

  // Create exam form
  const [examCode, setExamCode] = useState("CS-399");
  const [examTitle, setExamTitle] = useState("");
  const [examInstructions, setExamInstructions] = useState(
    "Complete all items within the allotted time window."
  );
  const [examDuration, setExamDuration] = useState(25);
  const [questionsPerPaper, setQuestionsPerPaper] = useState(4);
  const [examWindowStart, setExamWindowStart] = useState(() =>
    toLocalDatetimeInput(new Date(Date.now() - 600_000).toISOString())
  );
  const [examWindowEnd, setExamWindowEnd] = useState(() =>
    toLocalDatetimeInput(new Date(Date.now() + 3600_000 * 6).toISOString())
  );
  const [randomizeQ, setRandomizeQ] = useState(true);
  const [randomizeOpts, setRandomizeOpts] = useState(true);
  const [selectedQIds, setSelectedQIds] = useState<string[]>([]);
  const [selectedCandIds, setSelectedCandIds] = useState<string[]>([]);

  // Edit Exam & Enrollments modal
  const [editingExam, setEditingExam] = useState<ExaminerExam | null>(null);
  const [editExTitle, setEditExTitle] = useState("");
  const [editExInstructions, setEditExInstructions] = useState("");
  const [editExDuration, setEditExDuration] = useState(25);
  const [editExQuestionsPerPaper, setEditExQuestionsPerPaper] = useState(4);
  const [editExWindowStart, setEditExWindowStart] = useState("");
  const [editExWindowEnd, setEditExWindowEnd] = useState("");
  const [editExRandomizeQ, setEditExRandomizeQ] = useState(true);
  const [editExRandomizeOpts, setEditExRandomizeOpts] = useState(true);
  const [editExQIds, setEditExQIds] = useState<string[]>([]);
  const [editExCandIds, setEditExCandIds] = useState<string[]>([]);

  // Pre-publish review modal
  const [reviewPublishExam, setReviewPublishExam] =
    useState<ExaminerExam | null>(null);

  // Question create/edit form & filters
  const [editingQId, setEditingQId] = useState<string | null>(null);
  const [qTitle, setQTitle] = useState("");
  const [qPrompt, setQPrompt] = useState("");
  const [qType, setQType] = useState<QuestionType>("single_mcq");
  const [qTopic, setQTopic] = useState("Algorithms");
  const [qDiff, setQDiff] = useState<Difficulty>("medium");
  const [qMarks, setQMarks] = useState(2);
  const [qPartialCredit, setQPartialCredit] = useState(true);
  const [qOptsText, setQOptsText] = useState("Option A\nOption B\nOption C");
  const [qCorrectIdx, setQCorrectIdx] = useState("1");
  const [qRubric, setQRubric] = useState("");

  const [qSearch, setQSearch] = useState("");
  const [qFilterTopic, setQFilterTopic] = useState<string>("all");
  const [qFilterType, setQFilterType] = useState<string>("all");
  const [qFilterDiff, setQFilterDiff] = useState<string>("all");

  // Bulk import
  const [importKind, setImportKind] = useState<"questions" | "candidates">(
    "questions"
  );
  const [importFormat, setImportFormat] = useState<"csv" | "json">("csv");
  const [importExamId, setImportExamId] = useState("");
  const [importContent, setImportContent] = useState(SAMPLE_QUESTIONS_CSV);
  const [importResult, setImportResult] = useState<{
    importedCount: number;
    errors: string[];
  } | null>(null);

  // Monitor
  const [monitorExamId, setMonitorExamId] = useState("");
  const [monitorAttempts, setMonitorAttempts] = useState<MonitorAttempt[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [annMessage, setAnnMessage] = useState("");
  const [graceTargetId, setGraceTargetId] = useState<string | null>(null);
  const [graceMinutes, setGraceMinutes] = useState("5");
  const [graceReason, setGraceReason] = useState("");
  const [graceSubmitting, setGraceSubmitting] = useState(false);

  // Grading & Analytics
  const [gradeExamId, setGradeExamId] = useState("");
  const [summary, setSummary] = useState<ExamSummaryMetrics | null>(null);
  const [gradingAttempts, setGradingAttempts] = useState<GradingAttempt[]>([]);
  const [analytics, setAnalytics] = useState<QuestionAnalyticsRow[]>([]);
  const [gradeInputs, setGradeInputs] = useState<
    Record<string, { score: string; feedback: string }>
  >({});
  const [confirmPublishWarning, setConfirmPublishWarning] = useState(false);

  const loadBase = useCallback(async () => {
    setLoading(true);
    setError(null);
    const meRes = await fetch("/api/auth/me");
    const meData = (await meRes.json()) as { user: SafeUser | null };
    setMe(meData.user);

    const [exRes, qRes, uRes] = await Promise.all([
      fetch("/api/exams"),
      fetch("/api/questions"),
      fetch("/api/admin/users"),
    ]);

    if (!exRes.ok || !qRes.ok) {
      setError("Sign in as Examiner or Administrator to manage examinations.");
      setLoading(false);
      return;
    }

    const exData = (await exRes.json()) as { exams: ExaminerExam[] };
    const qData = (await qRes.json()) as { questions: ExaminerQuestion[] };
    const uData = uRes.ok
      ? ((await uRes.json()) as { users: SafeUser[] })
      : { users: [] };

    setExams(exData.exams);
    setQuestions(qData.questions);
    const cands = uData.users.filter((u) => u.role === "candidate");
    setCandidates(cands);
    setLoading(false);

    if (selectedQIds.length === 0 && qData.questions.length > 0) {
      setSelectedQIds(qData.questions.slice(0, 4).map((q) => q.id));
    }
    if (selectedCandIds.length === 0 && cands.length > 0) {
      setSelectedCandIds(cands.map((c) => c.id));
    }
    if (!importExamId && exData.exams[0]) setImportExamId(exData.exams[0].id);
    if (!monitorExamId && exData.exams[0]) setMonitorExamId(exData.exams[0].id);
    if (!gradeExamId && exData.exams[0]) setGradeExamId(exData.exams[0].id);
  }, [
    gradeExamId,
    importExamId,
    monitorExamId,
    selectedCandIds.length,
    selectedQIds.length,
  ]);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  useEffect(() => {
    if (!editingExam && !reviewPublishExam) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEditingExam(null);
        setReviewPublishExam(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editingExam, reviewPublishExam]);

  const loadMonitor = useCallback(async () => {
    if (!monitorExamId) return;
    const res = await fetch(
      `/api/monitor?examId=${encodeURIComponent(monitorExamId)}`
    );
    if (!res.ok) return;
    const data = (await res.json()) as {
      attempts: MonitorAttempt[];
      announcements: AnnouncementItem[];
    };
    setMonitorAttempts(data.attempts);
    setAnnouncements(data.announcements);
  }, [monitorExamId]);

  const loadGrading = useCallback(async () => {
    if (!gradeExamId) return;
    setConfirmPublishWarning(false);
    const res = await fetch(
      `/api/grading?examId=${encodeURIComponent(gradeExamId)}`
    );
    if (!res.ok) return;
    const data = (await res.json()) as {
      summary: ExamSummaryMetrics | null;
      attempts: GradingAttempt[];
      analytics: QuestionAnalyticsRow[];
    };
    setSummary(data.summary);
    setGradingAttempts(data.attempts);
    setAnalytics(data.analytics);
  }, [gradeExamId]);

  useEffect(() => {
    if (tab !== "monitor" || !monitorExamId) return;
    loadMonitor();
    const timer = setInterval(loadMonitor, 4000);

    const supa = getSupabaseBrowserClient();
    const channel = supa
      ? supa
          .channel(`exam:${monitorExamId}:events`)
          .on("broadcast", { event: "*" }, () => loadMonitor())
          .subscribe()
      : null;

    return () => {
      clearInterval(timer);
      if (supa && channel) supa.removeChannel(channel);
    };
  }, [tab, monitorExamId, loadMonitor]);

  useEffect(() => {
    if (tab === "grading") loadGrading();
  }, [tab, loadGrading]);

  async function handleCreateExam(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    setError(null);
    if (!examCode.trim() || !examTitle.trim() || selectedQIds.length === 0) {
      setError("Exam code, title, and at least one question are required");
      return;
    }
    if (
      examWindowStart &&
      examWindowEnd &&
      new Date(examWindowEnd) <= new Date(examWindowStart)
    ) {
      setError("Availability window end must be after window start");
      return;
    }
    const res = await fetch("/api/exams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: examCode,
        title: examTitle,
        instructions: examInstructions,
        durationMinutes: examDuration,
        questionsPerPaper,
        ...(examWindowStart
          ? { windowStart: new Date(examWindowStart).toISOString() }
          : {}),
        ...(examWindowEnd
          ? { windowEnd: new Date(examWindowEnd).toISOString() }
          : {}),
        randomizeQuestions: randomizeQ,
        randomizeOptions: randomizeOpts,
        questionIds: selectedQIds,
        enrolledCandidateIds: selectedCandIds,
      }),
    });
    const data = (await res.json()) as { exam?: ExaminerExam; error?: string };
    if (!res.ok) {
      setError(data.error ?? "Failed to create exam");
      return;
    }
    setExamTitle("");
    setNotice(`Created ${data.exam?.code} in draft state.`);
    await loadBase();
  }

  async function patchExam(examId: string, patch: Record<string, unknown>) {
    setError(null);
    setNotice(null);
    const res = await fetch("/api/exams", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ examId, ...patch }),
    });
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      setError(err.error ?? "Exam update failed");
      return false;
    }
    setNotice("Examination updated");
    await loadBase();
    if (tab === "grading") await loadGrading();
    return true;
  }

  function openEditExam(exam: ExaminerExam) {
    setEditingExam(exam);
    setEditExTitle(exam.title);
    setEditExInstructions(exam.instructions);
    setEditExDuration(exam.durationMinutes);
    setEditExQuestionsPerPaper(exam.questionsPerPaper);
    setEditExWindowStart(toLocalDatetimeInput(exam.windowStart));
    setEditExWindowEnd(toLocalDatetimeInput(exam.windowEnd));
    setEditExRandomizeQ(exam.randomizeQuestions);
    setEditExRandomizeOpts(exam.randomizeOptions);
    setEditExQIds(exam.questionIds);
    setEditExCandIds(exam.enrolledCandidateIds);
  }

  async function saveEditExam(e: React.FormEvent) {
    e.preventDefault();
    if (!editingExam) return;
    if (editExQIds.length === 0) {
      setError("Select at least one question for the exam");
      return;
    }
    const patch: Record<string, unknown> = {
      title: editExTitle,
      instructions: editExInstructions,
      durationMinutes: editExDuration,
      questionsPerPaper: editExQuestionsPerPaper,
      randomizeQuestions: editExRandomizeQ,
      randomizeOptions: editExRandomizeOpts,
      questionIds: editExQIds,
      enrolledCandidateIds: editExCandIds,
    };
    if (editExWindowStart) {
      patch.windowStart = new Date(editExWindowStart).toISOString();
    }
    if (editExWindowEnd) {
      patch.windowEnd = new Date(editExWindowEnd).toISOString();
    }
    const ok = await patchExam(editingExam.id, patch);
    if (ok) setEditingExam(null);
  }

  function startEditQuestion(q: ExaminerQuestion) {
    setEditingQId(q.id);
    setQTitle(q.title);
    setQPrompt(q.prompt);
    setQType(q.type);
    setQTopic(q.topic);
    setQDiff(q.difficulty);
    setQMarks(q.marks);
    setQPartialCredit(q.partialCredit);
    setQOptsText(q.options.map((o) => o.text).join("\n"));
    const indices = q.correctOptionIds
      .map((cid) => q.options.findIndex((o) => o.id === cid) + 1)
      .filter((n) => n > 0);
    setQCorrectIdx(indices.join(",") || "1");
    setQRubric(q.rubric ?? "");
  }

  async function handleSaveQuestion(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    setError(null);

    const rawLines = qOptsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const options = rawLines.map((text, idx) => ({ id: `o${idx + 1}`, text }));
    const correctOptionIds = qCorrectIdx
      .split(",")
      .map((s) => Number(s.trim()))
      .map((oneBased) => options[oneBased - 1]?.id)
      .filter((id): id is string => Boolean(id));

    const method = editingQId ? "PATCH" : "POST";
    const payload = {
      ...(editingQId ? { questionId: editingQId } : {}),
      title: qTitle,
      prompt: qPrompt,
      type: qType,
      topic: qTopic,
      difficulty: qDiff,
      marks: qMarks,
      partialCredit: qType === "multi_select" ? qPartialCredit : false,
      options: qType === "written" ? [] : options,
      correctOptionIds: qType === "written" ? [] : correctOptionIds,
      rubric: qType === "written" ? qRubric : undefined,
    };

    const res = await fetch("/api/questions", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Failed to save question");
      return;
    }

    setEditingQId(null);
    setQTitle("");
    setQPrompt("");
    setQRubric("");
    setNotice(editingQId ? "Updated question." : "Added question to bank.");
    await loadBase();
  }

  async function handleDeleteQuestion(qId: string) {
    setError(null);
    setNotice(null);
    const res = await fetch(`/api/questions?id=${encodeURIComponent(qId)}`, {
      method: "DELETE",
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Delete failed");
      return;
    }
    setNotice(
      "Deleted question from bank (active attempt snapshots stay protected)."
    );
    await loadBase();
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setImportResult(null);
    setError(null);
    const res = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: importKind,
        format: importFormat,
        content: importContent,
        examId: importExamId || undefined,
      }),
    });
    const data = (await res.json()) as {
      importedCount?: number;
      errors?: string[];
      error?: string;
    };
    if (!res.ok) {
      setError(data.error ?? "Import failed");
      return;
    }
    setImportResult({
      importedCount: data.importedCount ?? 0,
      errors: data.errors ?? [],
    });
    await loadBase();
  }

  async function handleSendAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    if (!annMessage.trim() || !monitorExamId) return;
    await fetch("/api/monitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ examId: monitorExamId, message: annMessage }),
    });
    setAnnMessage("");
    await loadMonitor();
  }

  async function handleGrantOutageGrace(
    e: React.FormEvent,
    att: MonitorAttempt
  ) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const mins = Number(graceMinutes);
    if (!Number.isInteger(mins) || mins < 1 || mins > 30) {
      setError("Grace duration must be a whole number between 1 and 30 minutes.");
      return;
    }
    if (graceReason.trim().length < 5) {
      setError("Enter a verification reason of at least 5 characters.");
      return;
    }

    setGraceSubmitting(true);
    try {
      const res = await fetch(
        `/api/attempts/${encodeURIComponent(att.id)}/grace`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            graceMinutes: mins,
            reason: graceReason.trim(),
          }),
        }
      );
      const data = (await res.json()) as {
        error?: string;
        resumed?: boolean;
        attempt?: { serverExpiresAt: string };
      };
      if (!res.ok) {
        setError(data.error ?? "Unable to grant outage grace.");
        return;
      }
      setNotice(
        data.resumed
          ? `Granted +${mins} min outage grace and resumed attempt for ${att.candidateName}.`
          : `Extended deadline by +${mins} min for ${att.candidateName}.`
      );
      setGraceTargetId(null);
      setGraceReason("");
      await loadMonitor();
    } catch {
      setError("Network error while granting outage grace.");
    } finally {
      setGraceSubmitting(false);
    }
  }

  async function handleGradeWritten(
    attemptId: string,
    questionId: string,
    maxMarks: number
  ) {
    const key = `${attemptId}:${questionId}`;
    const entry = gradeInputs[key];
    const existingAns = gradingAttempts.find((a) => a.id === attemptId)?.answers[
      questionId
    ];
    const rawScore =
      entry?.score !== undefined
        ? entry.score
        : existingAns?.manualScore !== null &&
            existingAns?.manualScore !== undefined
          ? String(existingAns.manualScore)
          : "";
    const score = Number(rawScore);
    if (rawScore.trim() === "" || !Number.isFinite(score) || score < 0 || score > maxMarks) {
      setError(`Score must be between 0 and ${maxMarks}`);
      return;
    }
    setError(null);
    const res = await fetch("/api/grading", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId,
        questionId,
        score,
        feedback: entry?.feedback ?? "",
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Grading failed");
      return;
    }
    setNotice("Manual score saved and total updated.");
    await loadGrading();
  }

  const uniqueTopics = Array.from(new Set(questions.map((q) => q.topic))).sort();

  const filteredQuestions = questions.filter((q) => {
    const matchesSearch =
      !qSearch.trim() ||
      q.title.toLowerCase().includes(qSearch.toLowerCase()) ||
      q.topic.toLowerCase().includes(qSearch.toLowerCase()) ||
      q.prompt.toLowerCase().includes(qSearch.toLowerCase());
    const matchesTopic = qFilterTopic === "all" || q.topic === qFilterTopic;
    const matchesType = qFilterType === "all" || q.type === qFilterType;
    const matchesDiff = qFilterDiff === "all" || q.difficulty === qFilterDiff;
    return matchesSearch && matchesTopic && matchesType && matchesDiff;
  });

  const maxBucketCount = Math.max(
    1,
    ...(summary?.scoreBuckets.map((b) => b.count) ?? [1])
  );

  return (
    <div className="min-h-screen bg-[#F6F8FA]">
      <TopNav user={me} />

      <main
        id="main-content"
        className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[#1D4ED8]">
              Examiner workspace
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#0F172A]">
              Examination control center
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
        {notice && (
          <div className="mt-4 rounded-lg border border-[#0F766E]/30 bg-[#F0FDFA] p-3 text-sm text-[#0F766E]">
            {notice}
          </div>
        )}

        {loading && (
          <div className="mt-6 rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-6 text-sm text-[#475569]">
            Loading examination workspace...
          </div>
        )}

        {!loading &&
          me &&
          (me.role === "examiner" || me.role === "admin") && (
        <div className="mt-6 flex flex-col gap-6 lg:flex-row">
          {/* Responsive navigation rail (240px on lg+) */}
          <aside className="shrink-0 space-y-4 lg:w-[240px]">
            <nav
              role="tablist"
              aria-label="Examiner modules"
              className="flex flex-row gap-1.5 overflow-x-auto rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-2 lg:flex-col"
            >
              {(
                [
                  ["exams", "Exams and sandbox"],
                  ["questions", "Question bank"],
                  ["import", "Bulk CSV/JSON import"],
                  ["monitor", "Live monitor"],
                  ["grading", "Grading and analytics"],
                ] as [TabId, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`min-h-[40px] shrink-0 cursor-pointer rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                    tab === id
                      ? "bg-[#1D4ED8] text-white"
                      : "text-[#475569] hover:bg-[#EEF2F6] hover:text-[#0F172A]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>

            <dl className="hidden space-y-3 rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-4 text-xs lg:block">
              <div className="flex items-center justify-between">
                <dt className="text-[#64748B]">Managed exams</dt>
                <dd className="font-mono font-semibold tabular-nums text-[#0F172A]">
                  {exams.length}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[#64748B]">Question bank</dt>
                <dd className="font-mono font-semibold tabular-nums text-[#0F172A]">
                  {questions.length}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[#64748B]">Candidates</dt>
                <dd className="font-mono font-semibold tabular-nums text-[#0F172A]">
                  {candidates.length}
                </dd>
              </div>
            </dl>
          </aside>

          <div className="min-w-0 flex-1">
            {tab === "exams" && (
              <div className="grid gap-6 xl:grid-cols-12">
                <section className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-6 xl:col-span-5">
                  <div className="flex items-center gap-2 text-base font-semibold text-[#0F172A]">
                    <Plus className="h-4 w-4 text-[#1D4ED8]" aria-hidden="true" />
                    <h2>Create examination</h2>
                  </div>
                  <form
                    onSubmit={handleCreateExam}
                    className="mt-4 space-y-3"
                    noValidate
                  >
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label
                          htmlFor="ex-code"
                          className="block text-xs font-medium text-[#0F172A]"
                        >
                          Code
                        </label>
                        <input
                          id="ex-code"
                          required
                          value={examCode}
                          onChange={(e) => setExamCode(e.target.value)}
                          className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-2.5 py-2 font-mono text-sm"
                        />
                      </div>
                      <div className="col-span-2">
                        <label
                          htmlFor="ex-title"
                          className="block text-xs font-medium text-[#0F172A]"
                        >
                          Title
                        </label>
                        <input
                          id="ex-title"
                          required
                          value={examTitle}
                          onChange={(e) => setExamTitle(e.target.value)}
                          className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-2.5 py-2 text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="ex-inst"
                        className="block text-xs font-medium text-[#0F172A]"
                      >
                        Instructions
                      </label>
                      <textarea
                        id="ex-inst"
                        rows={2}
                        value={examInstructions}
                        onChange={(e) => setExamInstructions(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-2.5 py-2 text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="ex-dur"
                          className="block text-xs font-medium text-[#0F172A]"
                        >
                          Duration (minutes)
                        </label>
                        <input
                          id="ex-dur"
                          type="number"
                          min={1}
                          max={360}
                          value={examDuration}
                          onChange={(e) =>
                            setExamDuration(Number(e.target.value))
                          }
                          className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-2.5 py-2 font-mono text-sm"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="ex-qcnt"
                          className="block text-xs font-medium text-[#0F172A]"
                        >
                          Questions per paper
                        </label>
                        <input
                          id="ex-qcnt"
                          type="number"
                          min={1}
                          max={100}
                          value={questionsPerPaper}
                          onChange={(e) =>
                            setQuestionsPerPaper(Number(e.target.value))
                          }
                          className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-2.5 py-2 font-mono text-sm"
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="ex-wstart"
                          className="block text-xs font-medium text-[#0F172A]"
                        >
                          Window start
                        </label>
                        <input
                          id="ex-wstart"
                          type="datetime-local"
                          value={examWindowStart}
                          onChange={(e) => setExamWindowStart(e.target.value)}
                          className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-2.5 py-2 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="ex-wend"
                          className="block text-xs font-medium text-[#0F172A]"
                        >
                          Window end
                        </label>
                        <input
                          id="ex-wend"
                          type="datetime-local"
                          value={examWindowEnd}
                          onChange={(e) => setExamWindowEnd(e.target.value)}
                          className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-2.5 py-2 font-mono text-xs"
                        />
                      </div>
                    </div>

                    <p className="text-xs text-[#64748B]">
                      Selected pool marks:{" "}
                      <span className="font-mono font-medium tabular-nums text-[#0F172A]">
                        {questions
                          .filter((q) => selectedQIds.includes(q.id))
                          .reduce((sum, q) => sum + q.marks, 0)}
                      </span>
                    </p>

                    <div className="flex flex-wrap gap-4 text-xs font-medium text-[#0F172A]">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={randomizeQ}
                          onChange={(e) => setRandomizeQ(e.target.checked)}
                        />
                        <span>Randomize questions</span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={randomizeOpts}
                          onChange={(e) => setRandomizeOpts(e.target.checked)}
                        />
                        <span>Randomize options</span>
                      </label>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-[#0F172A]">
                        Questions (
                        <span className="font-mono tabular-nums">
                          {selectedQIds.length}
                        </span>{" "}
                        selected)
                      </p>
                      <div className="mt-1 max-h-36 space-y-1.5 overflow-y-auto rounded-lg border border-[rgba(15,23,42,0.12)] p-2.5 text-xs">
                        {questions.length === 0 ? (
                          <p className="py-1 text-[#64748B]">
                            No questions in bank yet.
                          </p>
                        ) : (
                          questions.map((q) => (
                            <label
                              key={q.id}
                              className="flex cursor-pointer items-center gap-2"
                            >
                              <input
                                type="checkbox"
                                checked={selectedQIds.includes(q.id)}
                                onChange={(e) =>
                                  setSelectedQIds((prev) =>
                                    e.target.checked
                                      ? [...prev, q.id]
                                      : prev.filter((id) => id !== q.id)
                                  )
                                }
                              />
                              <span className="truncate font-medium text-[#0F172A]">
                                {q.title}
                              </span>
                              <span className="ml-auto shrink-0 text-[#64748B]">
                                <span className="capitalize">
                                  {q.difficulty}
                                </span>{" "}
                                <span className="font-mono tabular-nums">
                                  ({q.marks}m)
                                </span>
                              </span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-medium text-[#0F172A]">
                        Enroll candidates (
                        <span className="font-mono tabular-nums">
                          {selectedCandIds.length}
                        </span>{" "}
                        selected)
                      </p>
                      <div className="mt-1 max-h-28 space-y-1.5 overflow-y-auto rounded-lg border border-[rgba(15,23,42,0.12)] p-2.5 text-xs">
                        {candidates.length === 0 ? (
                          <p className="py-1 text-[#64748B]">
                            No candidates registered yet.
                          </p>
                        ) : (
                          candidates.map((c) => (
                            <label
                              key={c.id}
                              className="flex cursor-pointer items-center gap-2"
                            >
                              <input
                                type="checkbox"
                                checked={selectedCandIds.includes(c.id)}
                                onChange={(e) =>
                                  setSelectedCandIds((prev) =>
                                    e.target.checked
                                      ? [...prev, c.id]
                                      : prev.filter((id) => id !== c.id)
                                  )
                                }
                              />
                              <span className="text-[#0F172A]">{c.name}</span>
                              <span className="ml-auto truncate text-[#64748B]">
                                {c.email}
                              </span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="min-h-[40px] w-full cursor-pointer rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF]"
                    >
                      Create draft exam
                    </button>
                  </form>
                </section>

                <section className="space-y-4 xl:col-span-7">
                  {exams.length === 0 ? (
                    <div className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-6 text-sm text-[#64748B]">
                      No examinations created yet. Create a draft exam on the
                      left to begin.
                    </div>
                  ) : (
                    exams.map((exam) => (
                      <article
                        key={exam.id}
                        className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-md bg-[#0F172A] px-2 py-0.5 font-mono text-xs font-medium text-white">
                                {exam.code}
                              </span>
                              <span className="rounded-md border border-[rgba(15,23,42,0.14)] bg-[#F6F8FA] px-2 py-0.5 text-xs font-medium capitalize text-[#0F172A]">
                                {exam.status}
                              </span>
                            </div>
                            <h3 className="mt-2 text-base font-semibold text-[#0F172A]">
                              {exam.title}
                            </h3>
                            <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#64748B]">
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
                                <dt className="inline">Pool / paper: </dt>
                                <dd className="inline font-mono font-medium tabular-nums text-[#0F172A]">
                                  {exam.questionIds.length} /{" "}
                                  {exam.questionsPerPaper}
                                </dd>
                              </div>
                              <div>
                                <dt className="inline">Enrolled: </dt>
                                <dd className="inline font-mono font-medium tabular-nums text-[#0F172A]">
                                  {exam.enrolledCandidateIds.length}
                                </dd>
                              </div>
                              {typeof exam.attemptCount === "number" && (
                                <div>
                                  <dt className="inline">Attempts: </dt>
                                  <dd className="inline font-mono font-medium tabular-nums text-[#0F172A]">
                                    {exam.attemptCount}
                                  </dd>
                                </div>
                              )}
                            </dl>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEditExam(exam)}
                              className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg border border-[rgba(15,23,42,0.14)] bg-white px-3 py-2 text-xs font-medium text-[#0F172A] transition-colors hover:bg-[#EEF2F6]"
                            >
                              <Pencil
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              <span>Edit exam</span>
                            </button>
                            <Link
                              href={`/exam/${exam.id}?sandbox=1`}
                              className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg border border-[rgba(15,23,42,0.14)] bg-[#F6F8FA] px-3 py-2 text-xs font-medium text-[#0F172A] transition-colors hover:bg-[#EEF2F6]"
                            >
                              <Eye
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              <span>Sandbox preview</span>
                            </Link>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[rgba(15,23,42,0.08)] pt-3">
                          <span className="text-xs font-medium text-[#64748B]">
                            Lifecycle:
                          </span>
                          {(
                            [
                              "draft",
                              "published",
                              "ongoing",
                              "completed",
                            ] as ExamStatus[]
                          ).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => {
                                if (
                                  exam.status === "draft" &&
                                  st === "published"
                                ) {
                                  setReviewPublishExam(exam);
                                } else {
                                  patchExam(exam.id, { status: st });
                                }
                              }}
                              className={`min-h-[36px] cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                                exam.status === st
                                  ? "border-[#0F172A] bg-[#0F172A] text-white"
                                  : "border-[rgba(15,23,42,0.14)] bg-white text-[#0F172A] hover:bg-[#EEF2F6]"
                              }`}
                            >
                              {st}
                            </button>
                          ))}

                          <button
                            type="button"
                            onClick={() =>
                              patchExam(exam.id, {
                                resultsPublished: !exam.resultsPublished,
                              })
                            }
                            className={`ml-auto inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                              exam.resultsPublished
                                ? "border-[#0F766E]/30 bg-[#F0FDFA] text-[#0F766E]"
                                : "border-[rgba(15,23,42,0.14)] bg-white text-[#0F172A] hover:bg-[#EEF2F6]"
                            }`}
                          >
                            {exam.resultsPublished && (
                              <Check
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                            )}
                            <span>
                              {exam.resultsPublished
                                ? "Results published"
                                : "Publish results"}
                            </span>
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </section>
              </div>
            )}

            {tab === "questions" && (
              <div className="grid gap-6 xl:grid-cols-12">
                <section className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-6 xl:col-span-5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-[#0F172A]">
                      {editingQId ? "Edit question" : "Add question to bank"}
                    </h2>
                    {editingQId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingQId(null);
                          setQTitle("");
                          setQPrompt("");
                          setQRubric("");
                        }}
                        className="cursor-pointer text-xs font-medium text-[#1D4ED8] underline"
                      >
                        Cancel edit
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[#64748B]">
                    Bank edits apply to future papers. Active attempt snapshots
                    remain locked.
                  </p>
                  <form onSubmit={handleSaveQuestion} className="mt-4 space-y-3">
                    <div>
                      <label
                        htmlFor="q-title"
                        className="block text-xs font-medium text-[#0F172A]"
                      >
                        Title
                      </label>
                      <input
                        id="q-title"
                        required
                        value={qTitle}
                        onChange={(e) => setQTitle(e.target.value)}
                        className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="q-prompt"
                        className="block text-xs font-medium text-[#0F172A]"
                      >
                        Prompt
                      </label>
                      <textarea
                        id="q-prompt"
                        required
                        rows={3}
                        value={qPrompt}
                        onChange={(e) => setQPrompt(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label
                          htmlFor="q-type"
                          className="block text-xs font-medium text-[#0F172A]"
                        >
                          Type
                        </label>
                        <select
                          id="q-type"
                          value={qType}
                          onChange={(e) =>
                            setQType(e.target.value as QuestionType)
                          }
                          className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] bg-white px-2 py-2 text-xs"
                        >
                          <option value="single_mcq">Single MCQ</option>
                          <option value="multi_select">Multi-select</option>
                          <option value="written">Written</option>
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor="q-diff"
                          className="block text-xs font-medium text-[#0F172A]"
                        >
                          Difficulty
                        </label>
                        <select
                          id="q-diff"
                          value={qDiff}
                          onChange={(e) =>
                            setQDiff(e.target.value as Difficulty)
                          }
                          className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] bg-white px-2 py-2 text-xs"
                        >
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor="q-marks"
                          className="block text-xs font-medium text-[#0F172A]"
                        >
                          Marks
                        </label>
                        <input
                          id="q-marks"
                          type="number"
                          min={1}
                          max={100}
                          value={qMarks}
                          onChange={(e) => setQMarks(Number(e.target.value))}
                          className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-2 py-2 font-mono text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <label
                        htmlFor="q-topic"
                        className="block text-xs font-medium text-[#0F172A]"
                      >
                        Topic or category
                      </label>
                      <input
                        id="q-topic"
                        value={qTopic}
                        onChange={(e) => setQTopic(e.target.value)}
                        className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-3 py-2 text-sm"
                      />
                    </div>

                    {qType === "multi_select" && (
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-[#0F172A]">
                        <input
                          type="checkbox"
                          checked={qPartialCredit}
                          onChange={(e) => setQPartialCredit(e.target.checked)}
                        />
                        <span>Award partial credit for multi-select</span>
                      </label>
                    )}

                    {qType === "written" ? (
                      <div>
                        <label
                          htmlFor="q-rubric"
                          className="block text-xs font-medium text-[#0F172A]"
                        >
                          Grading rubric (hidden from candidates)
                        </label>
                        <textarea
                          id="q-rubric"
                          rows={3}
                          value={qRubric}
                          onChange={(e) => setQRubric(e.target.value)}
                          placeholder="Expected points for manual evaluation"
                          className="mt-1 w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-3 py-2 text-xs"
                        />
                      </div>
                    ) : (
                      <>
                        <div>
                          <label
                            htmlFor="q-opts"
                            className="block text-xs font-medium text-[#0F172A]"
                          >
                            Options (one per line)
                          </label>
                          <textarea
                            id="q-opts"
                            rows={4}
                            value={qOptsText}
                            onChange={(e) => setQOptsText(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-3 py-2 text-xs"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="q-corr"
                            className="block text-xs font-medium text-[#0F172A]"
                          >
                            Correct option index (1-based, comma-separated)
                          </label>
                          <input
                            id="q-corr"
                            value={qCorrectIdx}
                            onChange={(e) => setQCorrectIdx(e.target.value)}
                            className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-3 py-2 font-mono text-xs"
                          />
                        </div>
                      </>
                    )}

                    <button
                      type="submit"
                      className="min-h-[40px] w-full cursor-pointer rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF]"
                    >
                      {editingQId ? "Update question" : "Save question"}
                    </button>
                  </form>
                </section>

                <section className="space-y-3 xl:col-span-7">
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-3">
                    <input
                      type="search"
                      aria-label="Search questions"
                      placeholder="Search title, topic, or prompt"
                      value={qSearch}
                      onChange={(e) => setQSearch(e.target.value)}
                      className="min-h-[40px] min-w-[180px] flex-1 rounded-lg border border-[rgba(15,23,42,0.14)] px-3 py-2 text-sm"
                    />
                    <select
                      aria-label="Filter by topic"
                      value={qFilterTopic}
                      onChange={(e) => setQFilterTopic(e.target.value)}
                      className="min-h-[40px] rounded-lg border border-[rgba(15,23,42,0.14)] bg-white px-2.5 py-2 text-xs"
                    >
                      <option value="all">All topics</option>
                      {uniqueTopics.map((topic) => (
                        <option key={topic} value={topic}>
                          {topic}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Filter by type"
                      value={qFilterType}
                      onChange={(e) => setQFilterType(e.target.value)}
                      className="min-h-[40px] rounded-lg border border-[rgba(15,23,42,0.14)] bg-white px-2.5 py-2 text-xs"
                    >
                      <option value="all">All types</option>
                      <option value="single_mcq">Single MCQ</option>
                      <option value="multi_select">Multi-select</option>
                      <option value="written">Written</option>
                    </select>
                    <select
                      aria-label="Filter by difficulty"
                      value={qFilterDiff}
                      onChange={(e) => setQFilterDiff(e.target.value)}
                      className="min-h-[40px] rounded-lg border border-[rgba(15,23,42,0.14)] bg-white px-2.5 py-2 text-xs"
                    >
                      <option value="all">All difficulties</option>
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>

                  {filteredQuestions.length === 0 ? (
                    <div className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-6 text-center">
                      <p className="text-sm text-[#475569]">
                        No questions match the current filters.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setQSearch("");
                          setQFilterTopic("all");
                          setQFilterType("all");
                          setQFilterDiff("all");
                        }}
                        className="mt-3 min-h-[40px] cursor-pointer rounded-lg border border-[rgba(15,23,42,0.14)] px-3.5 py-2 text-xs font-medium text-[#0F172A] transition-colors hover:bg-[#EEF2F6]"
                      >
                        Reset filters
                      </button>
                    </div>
                  ) : (
                    filteredQuestions.map((q) => (
                      <div
                        key={q.id}
                        className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="space-y-1">
                            <span className="text-sm font-semibold text-[#0F172A]">
                              {q.title}
                            </span>
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="rounded-md bg-[#EEF2F6] px-2 py-0.5 text-[#0F172A]">
                                {q.topic}
                              </span>
                              <span className="rounded-md border border-[rgba(15,23,42,0.12)] px-2 py-0.5 text-[#475569]">
                                {QUESTION_TYPE_LABELS[q.type]}
                              </span>
                              <span className="rounded-md border border-[rgba(15,23,42,0.12)] px-2 py-0.5 capitalize text-[#475569]">
                                {q.difficulty}
                              </span>
                              <span className="rounded-md bg-[#EFF6FF] px-2 py-0.5 font-mono font-medium tabular-nums text-[#1D4ED8]">
                                {q.marks}m
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => startEditQuestion(q)}
                              className="inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-md border border-[rgba(15,23,42,0.14)] px-2.5 py-1 text-xs font-medium transition-colors hover:bg-[#EEF2F6]"
                            >
                              <Pencil
                                className="h-3 w-3"
                                aria-hidden="true"
                              />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteQuestion(q.id)}
                              className="inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-md border border-[#B91C1C]/30 px-2.5 py-1 text-xs font-medium text-[#B91C1C] transition-colors hover:bg-[#FEF2F2]"
                            >
                              <Trash2
                                className="h-3 w-3"
                                aria-hidden="true"
                              />
                              <span>Delete</span>
                            </button>
                          </div>
                        </div>
                        <p className="mt-2 text-sm text-[#475569]">{q.prompt}</p>
                        {q.type === "written" && q.rubric && (
                          <p className="mt-2 rounded-lg bg-[#F6F8FA] px-3 py-2 text-xs text-[#475569]">
                            Rubric: {q.rubric}
                          </p>
                        )}
                      </div>
                    ))
                  )}
                </section>
              </div>
            )}

            {tab === "import" && (
              <section className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-base font-semibold text-[#0F172A]">
                    <Upload
                      className="h-4 w-4 text-[#1D4ED8]"
                      aria-hidden="true"
                    />
                    <h2>Bulk import questions or candidates</h2>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setImportKind("questions");
                        setImportFormat("csv");
                        setImportContent(SAMPLE_QUESTIONS_CSV);
                      }}
                      className="min-h-[36px] cursor-pointer rounded-md border border-[rgba(15,23,42,0.14)] px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[#EEF2F6]"
                    >
                      Load questions CSV sample
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setImportKind("candidates");
                        setImportFormat("csv");
                        setImportContent(SAMPLE_CANDIDATES_CSV);
                      }}
                      className="min-h-[36px] cursor-pointer rounded-md border border-[rgba(15,23,42,0.14)] px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[#EEF2F6]"
                    >
                      Load candidates CSV sample
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setImportKind("questions");
                        setImportFormat("json");
                        setImportContent(SAMPLE_QUESTIONS_JSON);
                      }}
                      className="min-h-[36px] cursor-pointer rounded-md border border-[rgba(15,23,42,0.14)] px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[#EEF2F6]"
                    >
                      Load JSON sample
                    </button>
                  </div>
                </div>

                <form onSubmit={handleImport} className="mt-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <label
                        htmlFor="imp-kind"
                        className="block text-xs font-medium text-[#0F172A]"
                      >
                        Data type
                      </label>
                      <select
                        id="imp-kind"
                        value={importKind}
                        onChange={(e) => {
                          const val = e.target.value as
                            | "questions"
                            | "candidates";
                          setImportKind(val);
                          setImportContent(
                            val === "questions"
                              ? SAMPLE_QUESTIONS_CSV
                              : SAMPLE_CANDIDATES_CSV
                          );
                        }}
                        className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] bg-white px-3 py-2 text-sm"
                      >
                        <option value="questions">Questions</option>
                        <option value="candidates">Candidate enrollments</option>
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="imp-fmt"
                        className="block text-xs font-medium text-[#0F172A]"
                      >
                        Format
                      </label>
                      <select
                        id="imp-fmt"
                        value={importFormat}
                        onChange={(e) =>
                          setImportFormat(e.target.value as "csv" | "json")
                        }
                        className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] bg-white px-3 py-2 text-sm"
                      >
                        <option value="csv">CSV</option>
                        <option value="json">JSON</option>
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="imp-exam"
                        className="block text-xs font-medium text-[#0F172A]"
                      >
                        Attach to exam (optional)
                      </label>
                      <select
                        id="imp-exam"
                        value={importExamId}
                        onChange={(e) => setImportExamId(e.target.value)}
                        className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] bg-white px-3 py-2 text-sm"
                      >
                        <option value="">None</option>
                        {exams.map((ex) => (
                          <option key={ex.id} value={ex.id}>
                            {ex.code}: {ex.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="imp-file"
                      className="block text-xs font-medium text-[#0F172A]"
                    >
                      Upload CSV/JSON file or paste content
                    </label>
                    <input
                      id="imp-file"
                      type="file"
                      accept=".csv,.json,.txt"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          if (file.name.toLowerCase().endsWith(".json")) {
                            setImportFormat("json");
                          } else if (file.name.toLowerCase().endsWith(".csv")) {
                            setImportFormat("csv");
                          }
                          setImportContent(await file.text());
                        }
                      }}
                      className="mt-1.5 block w-full cursor-pointer rounded-lg border border-dashed border-[rgba(15,23,42,0.22)] bg-[#F6F8FA] p-2.5 text-xs text-[#475569]"
                    />
                    <textarea
                      aria-label="Bulk import content"
                      rows={6}
                      value={importContent}
                      onChange={(e) => setImportContent(e.target.value)}
                      className="mt-2 w-full rounded-lg border border-[rgba(15,23,42,0.16)] p-3 font-mono text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    className="min-h-[40px] cursor-pointer rounded-lg bg-[#1D4ED8] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF]"
                  >
                    Validate and import
                  </button>
                </form>

                {importResult && (
                  <div className="mt-4 rounded-xl border border-[rgba(15,23,42,0.12)] bg-[#F6F8FA] p-4 text-sm">
                    <p className="font-semibold text-[#0F766E]">
                      Imported{" "}
                      <span className="font-mono tabular-nums">
                        {importResult.importedCount}
                      </span>{" "}
                      record(s).
                    </p>
                    {importResult.errors.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[#B91C1C]">
                        {importResult.errors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </section>
            )}

            {tab === "monitor" && (
              <div className="space-y-4">
                <div className="flex items-start gap-2.5 rounded-xl border border-[#B45309]/30 bg-[#FFFBEB] p-4 text-sm text-[#0F172A]">
                  <Info
                    className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]"
                    aria-hidden="true"
                  />
                  <p>
                    Monitoring indicators (tab switches, offline gaps,
                    reconnections) are informational signals only and must not be
                    treated as conclusive evidence of misconduct.
                  </p>
                </div>

                <div className="grid gap-6 xl:grid-cols-12">
                  <section className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-6 xl:col-span-8">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Radio
                          className="h-4 w-4 text-[#1D4ED8]"
                          aria-hidden="true"
                        />
                        <h2 className="text-base font-semibold text-[#0F172A]">
                          Live attempt monitor
                        </h2>
                      </div>
                      <select
                        aria-label="Filter monitored exam"
                        value={monitorExamId}
                        onChange={(e) => setMonitorExamId(e.target.value)}
                        className="min-h-[40px] rounded-lg border border-[rgba(15,23,42,0.16)] bg-white px-3 py-2 text-xs"
                      >
                        {exams.map((ex) => (
                          <option key={ex.id} value={ex.id}>
                            {ex.code} ({ex.status})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="mt-4 space-y-3">
                      {monitorAttempts.length === 0 ? (
                        <p className="py-6 text-center text-sm text-[#64748B]">
                          No candidate attempts recorded for this exam yet.
                        </p>
                      ) : (
                        monitorAttempts.map((att) => (
                          <div
                            key={att.id}
                            className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-[#F6F8FA] p-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-[#0F172A]">
                                  {att.candidateName}
                                </p>
                                <p className="text-xs text-[#64748B]">
                                  {att.candidateEmail}
                                </p>
                              </div>
                              <div className="text-right text-xs">
                                <span className="rounded-md bg-[#0F172A] px-2 py-0.5 font-medium capitalize text-white">
                                  {att.status}
                                </span>
                                <p className="mt-1 text-[#475569]">
                                  Progress{" "}
                                  <span className="font-mono font-medium tabular-nums text-[#0F172A]">
                                    {att.answeredCount} / {att.totalQuestions}
                                  </span>
                                </p>
                                {att.lastHeartbeatAt && (
                                  <p className="mt-0.5 text-[#64748B]">
                                    Last active{" "}
                                    <span className="font-mono tabular-nums">
                                      {new Date(
                                        att.lastHeartbeatAt
                                      ).toLocaleTimeString()}
                                    </span>
                                  </p>
                                )}
                                {att.serverExpiresAt && (
                                  <p className="mt-0.5 text-[#64748B]">
                                    Deadline{" "}
                                    <span className="font-mono tabular-nums text-[#0F172A]">
                                      {new Date(
                                        att.serverExpiresAt
                                      ).toLocaleTimeString()}
                                    </span>
                                  </p>
                                )}
                              </div>
                            </div>

                            {att.status !== "submitted" && (
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[rgba(15,23,42,0.08)] pt-3">
                                <span className="text-xs text-[#475569]">
                                  {att.status === "expired"
                                    ? "Auto-expired at server deadline"
                                    : "Active attempt"}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (graceTargetId === att.id) {
                                      setGraceTargetId(null);
                                    } else {
                                      setGraceTargetId(att.id);
                                      setGraceMinutes("5");
                                      setGraceReason("");
                                    }
                                  }}
                                  className="inline-flex min-h-[40px] cursor-pointer items-center rounded-lg border border-[#1D4ED8]/35 bg-[#EFF6FF] px-3 py-1.5 text-xs font-medium text-[#1D4ED8] transition-colors hover:bg-[#DBEAFE]"
                                >
                                  {att.status === "expired"
                                    ? "Grant outage grace and resume"
                                    : "Grant outage grace"}
                                </button>
                              </div>
                            )}

                            {graceTargetId === att.id && (
                              <form
                                onSubmit={(e) => handleGrantOutageGrace(e, att)}
                                className="mt-3 space-y-2.5 rounded-lg border border-[#1D4ED8]/25 bg-white p-3"
                              >
                                <p className="text-xs font-semibold text-[#0F172A]">
                                  Verified outage grace
                                </p>
                                <div className="grid gap-2 sm:grid-cols-4">
                                  <div>
                                    <label
                                      htmlFor={`grace-mins-${att.id}`}
                                      className="block text-xs text-[#475569]"
                                    >
                                      Minutes (1 to 30)
                                    </label>
                                    <input
                                      id={`grace-mins-${att.id}`}
                                      type="number"
                                      min={1}
                                      max={30}
                                      required
                                      value={graceMinutes}
                                      onChange={(e) =>
                                        setGraceMinutes(e.target.value)
                                      }
                                      className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-2.5 py-1.5 font-mono text-xs tabular-nums"
                                    />
                                  </div>
                                  <div className="sm:col-span-3">
                                    <label
                                      htmlFor={`grace-reason-${att.id}`}
                                      className="block text-xs text-[#475569]"
                                    >
                                      Verified outage reason
                                    </label>
                                    <input
                                      id={`grace-reason-${att.id}`}
                                      type="text"
                                      required
                                      minLength={5}
                                      maxLength={240}
                                      placeholder="Campus Wi-Fi drop verified in Lab 2"
                                      value={graceReason}
                                      onChange={(e) =>
                                        setGraceReason(e.target.value)
                                      }
                                      className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-2.5 py-1.5 text-xs"
                                    />
                                  </div>
                                </div>
                                <div className="flex flex-wrap justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setGraceTargetId(null)}
                                    className="min-h-[40px] cursor-pointer rounded-lg border border-[rgba(15,23,42,0.14)] px-3 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#EEF2F6]"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="submit"
                                    disabled={graceSubmitting}
                                    className="min-h-[40px] cursor-pointer rounded-lg bg-[#1D4ED8] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1E40AF] disabled:opacity-60"
                                  >
                                    {graceSubmitting
                                      ? "Applying..."
                                      : att.status === "expired"
                                        ? "Confirm grace and resume"
                                        : "Confirm deadline extension"}
                                  </button>
                                </div>
                              </form>
                            )}

                            {att.incidents.length > 0 && (
                              <div className="mt-3 border-t border-[rgba(15,23,42,0.08)] pt-2">
                                <p className="text-xs font-medium text-[#B45309]">
                                  Recorded signals (
                                  <span className="font-mono tabular-nums">
                                    {att.incidents.length}
                                  </span>
                                  )
                                </p>
                                <ul className="mt-1 space-y-1 text-xs text-[#475569]">
                                  {att.incidents.map((inc) => (
                                    <li
                                      key={inc.id}
                                      className="flex flex-wrap items-center justify-between gap-2"
                                    >
                                      <span>
                                        <span className="rounded bg-[#FFFBEB] px-1.5 py-0.5 font-mono text-[#B45309]">
                                          {inc.type}
                                        </span>{" "}
                                        {inc.detail}
                                      </span>
                                      <span className="font-mono tabular-nums text-[#64748B]">
                                        {new Date(
                                          inc.timestamp
                                        ).toLocaleTimeString()}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  <section className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-6 xl:col-span-4">
                    <h2 className="text-base font-semibold text-[#0F172A]">
                      Announcements
                    </h2>
                    <form
                      onSubmit={handleSendAnnouncement}
                      className="mt-3 space-y-2"
                    >
                      <label htmlFor="ann-msg" className="sr-only">
                        Announcement message
                      </label>
                      <textarea
                        id="ann-msg"
                        rows={3}
                        placeholder="Send message to active candidates"
                        value={annMessage}
                        onChange={(e) => setAnnMessage(e.target.value)}
                        className="w-full rounded-lg border border-[rgba(15,23,42,0.16)] p-2.5 text-sm"
                      />
                      <button
                        type="submit"
                        className="inline-flex min-h-[40px] w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF]"
                      >
                        <Send className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Send announcement</span>
                      </button>
                    </form>

                    <ul className="mt-4 divide-y divide-[rgba(15,23,42,0.08)] text-xs">
                      {announcements.map((a) => (
                        <li key={a.id} className="py-2.5">
                          <p className="text-[#0F172A]">{a.message}</p>
                          <p className="mt-1 text-[#64748B]">
                            {a.createdBy} at{" "}
                            <span className="font-mono tabular-nums">
                              {new Date(a.createdAt).toLocaleTimeString()}
                            </span>
                          </p>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              </div>
            )}

            {tab === "grading" && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <label
                      htmlFor="grade-exam-sel"
                      className="text-sm font-medium text-[#0F172A]"
                    >
                      Examination
                    </label>
                    <select
                      id="grade-exam-sel"
                      value={gradeExamId}
                      onChange={(e) => setGradeExamId(e.target.value)}
                      className="min-h-[40px] rounded-lg border border-[rgba(15,23,42,0.16)] bg-white px-3 py-2 text-sm"
                    >
                      {exams.map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          {ex.code}: {ex.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {gradeExamId && (
                      <a
                        href={`/api/reports/exam/${encodeURIComponent(
                          gradeExamId
                        )}/pdf`}
                        className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg border border-[rgba(15,23,42,0.14)] bg-[#F6F8FA] px-3.5 py-2 text-xs font-medium text-[#0F172A] transition-colors hover:bg-[#EEF2F6]"
                      >
                        <FileDown
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                        <span>Download Exam Summary PDF</span>
                      </a>
                    )}
                    {(() => {
                      const ex = exams.find((x) => x.id === gradeExamId);
                      if (!ex) return null;
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              !ex.resultsPublished &&
                              summary &&
                              summary.needsManualCount > 0 &&
                              !confirmPublishWarning
                            ) {
                              setConfirmPublishWarning(true);
                              return;
                            }
                            setConfirmPublishWarning(false);
                            patchExam(ex.id, {
                              resultsPublished: !ex.resultsPublished,
                            });
                          }}
                          className={`min-h-[40px] cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                            ex.resultsPublished
                              ? "border-[#0F766E]/30 bg-[#F0FDFA] text-[#0F766E]"
                              : "border-[#1D4ED8] bg-[#1D4ED8] text-white hover:bg-[#1E40AF]"
                          }`}
                        >
                          {ex.resultsPublished
                            ? "Results published (Unpublish)"
                            : "Publish results"}
                        </button>
                      );
                    })()}
                  </div>
                </div>

                {confirmPublishWarning && summary && (
                  <div
                    role="alert"
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#B45309]/40 bg-[#FFFBEB] p-4 text-sm text-[#0F172A]"
                  >
                    <span>
                      <span className="font-mono font-semibold tabular-nums">
                        {summary.needsManualCount}
                      </span>{" "}
                      submission(s) still need manual written grading. Publish
                      partial scores anyway?
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmPublishWarning(false);
                          patchExam(gradeExamId, { resultsPublished: true });
                        }}
                        className="min-h-[40px] cursor-pointer rounded-lg bg-[#B45309] px-3.5 py-2 text-xs font-medium text-white"
                      >
                        Confirm publish
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmPublishWarning(false)}
                        className="min-h-[40px] cursor-pointer rounded-lg border border-[rgba(15,23,42,0.16)] bg-white px-3.5 py-2 text-xs font-medium transition-colors hover:bg-[#EEF2F6]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {summary && (
                  <div className="grid gap-6 xl:grid-cols-12">
                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:col-span-7">
                      {[
                        ["Enrolled", summary.totalEnrolled, false],
                        ["Submitted", summary.submittedCount, false],
                        ["Mean score", summary.averageScore, false],
                        ["Median score", summary.medianScore, false],
                        ["Highest", summary.highestScore, false],
                        ["Lowest", summary.lowestScore, false],
                        ["Pass rate", `${summary.passRatePercent}%`, false],
                        [
                          "Needs grading",
                          summary.needsManualCount,
                          summary.needsManualCount > 0,
                        ],
                      ].map(([label, value, warn]) => (
                        <div
                          key={String(label)}
                          className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-4"
                        >
                          <dt className="text-xs text-[#64748B]">{label}</dt>
                          <dd
                            className={`mt-1 font-mono text-xl font-semibold tabular-nums ${
                              warn ? "text-[#B45309]" : "text-[#0F172A]"
                            }`}
                          >
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>

                    {/* SVG Score Distribution Chart */}
                    <div className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-5 xl:col-span-5">
                      <h2 className="text-sm font-semibold text-[#0F172A]">
                        Score distribution
                      </h2>
                      <p className="text-xs text-[#64748B]">
                        Finished attempts across percentage bands
                      </p>
                      <svg
                        viewBox="0 0 360 176"
                        role="img"
                        aria-label="Score distribution bar chart"
                        className="mt-3 w-full"
                      >
                        {[0, 0.5, 1].map((frac, idx) => {
                          const y = 132 - frac * 96;
                          return (
                            <line
                              key={idx}
                              x1="20"
                              y1={y}
                              x2="344"
                              y2={y}
                              stroke="rgba(15,23,42,0.10)"
                              strokeWidth="1"
                            />
                          );
                        })}
                        {summary.scoreBuckets.map((bucket, idx) => {
                          const barWidth = 44;
                          const gap = 20;
                          const x = 30 + idx * (barWidth + gap);
                          const height =
                            bucket.count === 0
                              ? 2
                              : Math.max(
                                  6,
                                  Math.round(
                                    (bucket.count / maxBucketCount) * 96
                                  )
                                );
                          const y = 132 - height;
                          return (
                            <g key={bucket.label}>
                              <rect
                                x={x}
                                y={y}
                                width={barWidth}
                                height={height}
                                rx={bucket.count === 0 ? "1" : "4"}
                                fill={
                                  bucket.count === 0 ? "#CBD5E1" : "#1D4ED8"
                                }
                              />
                              <text
                                x={x + barWidth / 2}
                                y={y - 6}
                                textAnchor="middle"
                                fontSize="11"
                                fontFamily="var(--font-mono), monospace"
                                fill="#0F172A"
                              >
                                {bucket.count}
                              </text>
                              <text
                                x={x + barWidth / 2}
                                y="154"
                                textAnchor="middle"
                                fontSize="11"
                                fontFamily="var(--font-mono), monospace"
                                fill="#64748B"
                              >
                                {bucket.label}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  </div>
                )}

                <section className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-6">
                  <div className="flex items-center gap-2 text-base font-semibold text-[#0F172A]">
                    <BarChart3
                      className="h-4 w-4 text-[#1D4ED8]"
                      aria-hidden="true"
                    />
                    <h2>Question performance analytics</h2>
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-[rgba(15,23,42,0.12)] text-xs text-[#64748B]">
                          <th className="py-2 pr-3 font-medium">Question</th>
                          <th className="py-2 pr-3 font-medium">Attempts</th>
                          <th className="py-2 pr-3 font-medium">Skip rate</th>
                          <th className="py-2 pr-3 font-medium">Avg score</th>
                          <th className="py-2 pr-3 font-medium">
                            Observed difficulty
                          </th>
                          <th className="py-2 font-medium">
                            Common wrong option
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.map((row) => (
                          <tr
                            key={row.questionId}
                            className="border-b border-[rgba(15,23,42,0.08)] last:border-0"
                          >
                            <td className="py-2.5 pr-3 font-medium text-[#0F172A]">
                              {row.title}
                            </td>
                            <td className="py-2.5 pr-3 font-mono tabular-nums">
                              {row.attemptCount}
                            </td>
                            <td className="py-2.5 pr-3 font-mono tabular-nums">
                              {row.skipRatePercent}%
                            </td>
                            <td className="py-2.5 pr-3 font-mono tabular-nums">
                              {row.avgScorePercent}%
                            </td>
                            <td className="py-2.5 pr-3 text-xs text-[#0F172A]">
                              {row.observedDifficulty}{" "}
                              <span className="capitalize text-[#64748B]">
                                (set: {row.configuredDifficulty})
                              </span>
                            </td>
                            <td className="py-2.5 text-xs text-[#64748B]">
                              {row.mostCommonWrongOption ?? "None"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="space-y-4">
                  {gradingAttempts.map((att) => (
                    <article
                      key={att.id}
                      className="rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-6"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-[#0F172A]">
                            {att.candidateName}{" "}
                            <span className="text-xs font-normal text-[#64748B]">
                              ({att.candidateEmail})
                            </span>
                          </h3>
                          <p className="mt-0.5 text-xs capitalize text-[#64748B]">
                            Status: {att.status} / Grading:{" "}
                            {att.gradingState.replace("_", " ")}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-lg font-semibold tabular-nums text-[#1D4ED8]">
                            {att.totalAwardedMarks} / {att.totalPossibleMarks}
                          </span>
                          {att.status !== "in_progress" && (
                            <a
                              href={`/api/reports/${att.id}/pdf`}
                              className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-lg border border-[rgba(15,23,42,0.14)] bg-[#F6F8FA] px-3 py-2 text-xs font-medium text-[#0F172A] transition-colors hover:bg-[#EEF2F6]"
                            >
                              <FileDown
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              <span>Download PDF</span>
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 space-y-3 border-t border-[rgba(15,23,42,0.08)] pt-4">
                        {att.items.map((item) => {
                          const ans = att.answers[item.questionId];
                          const key = `${att.id}:${item.questionId}`;
                          return (
                            <div
                              key={item.questionId}
                              className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-[#F6F8FA] p-3.5 text-sm"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-medium text-[#0F172A]">
                                  <span className="font-mono tabular-nums">
                                    {String(item.order).padStart(2, "0")}.
                                  </span>{" "}
                                  {item.title}{" "}
                                  <span className="ml-1 rounded bg-[#EEF2F6] px-1.5 py-0.5 text-xs font-normal text-[#475569]">
                                    {QUESTION_TYPE_LABELS[item.type]}
                                  </span>
                                </span>
                                <span className="font-mono text-xs font-semibold tabular-nums text-[#0F172A]">
                                  {item.type === "written"
                                    ? `${ans?.manualScore ?? "Pending"} / ${
                                        item.marks
                                      }`
                                    : `${ans?.autoScore ?? 0} / ${item.marks}`}
                                </span>
                              </div>

                              {item.type === "written" && (
                                <div className="mt-2 space-y-2">
                                  {item.rubric && (
                                    <p className="text-xs text-[#64748B]">
                                      Rubric: {item.rubric}
                                    </p>
                                  )}
                                  <p className="rounded-lg border border-[rgba(15,23,42,0.08)] bg-white p-2.5 text-xs text-[#0F172A]">
                                    {ans?.writtenText?.trim() ||
                                      "No written answer submitted"}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <input
                                      type="number"
                                      aria-label={`Score for ${att.candidateName} ${item.title}`}
                                      min={0}
                                      max={item.marks}
                                      step={0.5}
                                      placeholder={`0 - ${item.marks}`}
                                      value={
                                        gradeInputs[key]?.score ??
                                        (ans?.manualScore !== null &&
                                        ans?.manualScore !== undefined
                                          ? String(ans.manualScore)
                                          : "")
                                      }
                                      onChange={(e) =>
                                        setGradeInputs((prev) => ({
                                          ...prev,
                                          [key]: {
                                            score: e.target.value,
                                            feedback:
                                              prev[key]?.feedback ??
                                              ans?.manualFeedback ??
                                              "",
                                          },
                                        }))
                                      }
                                      className="min-h-[40px] w-24 rounded-md border border-[rgba(15,23,42,0.16)] bg-white px-2.5 py-1.5 font-mono text-xs"
                                    />
                                    <input
                                      type="text"
                                      aria-label={`Feedback for ${att.candidateName} ${item.title}`}
                                      placeholder="Optional grader feedback"
                                      value={
                                        gradeInputs[key]?.feedback ??
                                        ans?.manualFeedback ??
                                        ""
                                      }
                                      onChange={(e) =>
                                        setGradeInputs((prev) => ({
                                          ...prev,
                                          [key]: {
                                            score:
                                              prev[key]?.score ??
                                              String(ans?.manualScore ?? ""),
                                            feedback: e.target.value,
                                          },
                                        }))
                                      }
                                      className="min-h-[40px] min-w-[180px] flex-1 rounded-md border border-[rgba(15,23,42,0.16)] bg-white px-2.5 py-1.5 text-xs"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleGradeWritten(
                                          att.id,
                                          item.questionId,
                                          item.marks
                                        )
                                      }
                                      className="min-h-[40px] cursor-pointer rounded-md bg-[#1D4ED8] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-[#1E40AF]"
                                    >
                                      Save grade
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </article>
                  ))}
                </section>
              </div>
            )}
          </div>
        </div>
          )}

        {/* Edit Exam & Enrollments Modal */}
        {editingExam && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-exam-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/40 p-4"
          >
            <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[rgba(15,23,42,0.14)] bg-white p-6">
              <div className="flex items-center justify-between">
                <h2
                  id="edit-exam-title"
                  className="text-base font-semibold text-[#0F172A]"
                >
                  Edit{" "}
                  <span className="font-mono">{editingExam.code}</span> and
                  enrollments
                </h2>
                <button
                  type="button"
                  aria-label="Close modal"
                  onClick={() => setEditingExam(null)}
                  className="inline-flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#EEF2F6]"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <form onSubmit={saveEditExam} className="mt-4 space-y-3">
                <div>
                  <label
                    htmlFor="ed-ex-title"
                    className="block text-xs font-medium text-[#0F172A]"
                  >
                    Title
                  </label>
                  <input
                    id="ed-ex-title"
                    required
                    value={editExTitle}
                    onChange={(e) => setEditExTitle(e.target.value)}
                    className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label
                    htmlFor="ed-ex-inst"
                    className="block text-xs font-medium text-[#0F172A]"
                  >
                    Instructions
                  </label>
                  <textarea
                    id="ed-ex-inst"
                    rows={2}
                    value={editExInstructions}
                    onChange={(e) => setEditExInstructions(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-3 py-2 text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="ed-ex-dur"
                      className="block text-xs font-medium text-[#0F172A]"
                    >
                      Duration (minutes)
                    </label>
                    <input
                      id="ed-ex-dur"
                      type="number"
                      min={1}
                      max={360}
                      value={editExDuration}
                      onChange={(e) =>
                        setEditExDuration(Number(e.target.value))
                      }
                      className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-3 py-2 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="ed-ex-qpp"
                      className="block text-xs font-medium text-[#0F172A]"
                    >
                      Questions per paper
                    </label>
                    <input
                      id="ed-ex-qpp"
                      type="number"
                      min={1}
                      max={100}
                      value={editExQuestionsPerPaper}
                      onChange={(e) =>
                        setEditExQuestionsPerPaper(Number(e.target.value))
                      }
                      className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-3 py-2 font-mono text-sm"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="ed-ex-start"
                      className="block text-xs font-medium text-[#0F172A]"
                    >
                      Window start
                    </label>
                    <input
                      id="ed-ex-start"
                      type="datetime-local"
                      value={editExWindowStart}
                      onChange={(e) => setEditExWindowStart(e.target.value)}
                      className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-2.5 py-2 font-mono text-xs"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="ed-ex-end"
                      className="block text-xs font-medium text-[#0F172A]"
                    >
                      Window end
                    </label>
                    <input
                      id="ed-ex-end"
                      type="datetime-local"
                      value={editExWindowEnd}
                      onChange={(e) => setEditExWindowEnd(e.target.value)}
                      className="mt-1 min-h-[40px] w-full rounded-lg border border-[rgba(15,23,42,0.16)] px-2.5 py-2 font-mono text-xs"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 text-xs font-medium text-[#0F172A]">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editExRandomizeQ}
                      onChange={(e) => setEditExRandomizeQ(e.target.checked)}
                    />
                    <span>Randomize questions</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editExRandomizeOpts}
                      onChange={(e) =>
                        setEditExRandomizeOpts(e.target.checked)
                      }
                    />
                    <span>Randomize options</span>
                  </label>
                </div>
                <div>
                  <p className="text-xs font-medium text-[#0F172A]">
                    Assigned questions (
                    <span className="font-mono tabular-nums">
                      {editExQIds.length}
                    </span>
                    )
                  </p>
                  <div className="mt-1 max-h-36 space-y-1.5 overflow-y-auto rounded-lg border border-[rgba(15,23,42,0.12)] p-2.5 text-xs">
                    {questions.length === 0 ? (
                      <p className="py-1 text-[#64748B]">
                        No questions in bank yet.
                      </p>
                    ) : (
                      questions.map((q) => (
                        <label
                          key={q.id}
                          className="flex cursor-pointer items-center gap-2"
                        >
                          <input
                            type="checkbox"
                            checked={editExQIds.includes(q.id)}
                            onChange={(e) =>
                              setEditExQIds((prev) =>
                                e.target.checked
                                  ? [...prev, q.id]
                                  : prev.filter((id) => id !== q.id)
                              )
                            }
                          />
                          <span>{q.title}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-[#0F172A]">
                    Enrolled candidates (
                    <span className="font-mono tabular-nums">
                      {editExCandIds.length}
                    </span>
                    )
                  </p>
                  <div className="mt-1 max-h-32 space-y-1.5 overflow-y-auto rounded-lg border border-[rgba(15,23,42,0.12)] p-2.5 text-xs">
                    {candidates.length === 0 ? (
                      <p className="py-1 text-[#64748B]">
                        No candidates registered yet.
                      </p>
                    ) : (
                      candidates.map((c) => (
                        <label
                          key={c.id}
                          className="flex cursor-pointer items-center gap-2"
                        >
                          <input
                            type="checkbox"
                            checked={editExCandIds.includes(c.id)}
                            onChange={(e) =>
                              setEditExCandIds((prev) =>
                                e.target.checked
                                  ? [...prev, c.id]
                                  : prev.filter((id) => id !== c.id)
                              )
                            }
                          />
                          <span>
                            {c.name} ({c.email})
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingExam(null)}
                    className="min-h-[40px] cursor-pointer rounded-lg border border-[rgba(15,23,42,0.14)] px-4 py-2 text-sm font-medium text-[#0F172A] transition-colors hover:bg-[#EEF2F6]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="min-h-[40px] cursor-pointer rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF]"
                  >
                    Save exam
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Review and Publish Checklist Modal */}
        {reviewPublishExam && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-publish-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/40 p-4"
          >
            <div className="w-full max-w-md rounded-2xl border border-[rgba(15,23,42,0.14)] bg-white p-6">
              <div className="flex items-center justify-between gap-3">
                <h2
                  id="review-publish-title"
                  className="text-base font-semibold text-[#0F172A]"
                >
                  Pre-publication checklist:{" "}
                  <span className="font-mono">{reviewPublishExam.code}</span>
                </h2>
                <button
                  type="button"
                  aria-label="Close checklist"
                  onClick={() => setReviewPublishExam(null)}
                  className="inline-flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#EEF2F6]"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              {(() => {
                const hasQuestions = reviewPublishExam.questionIds.length >= 1;
                const validWindow =
                  new Date(reviewPublishExam.windowEnd).getTime() >
                  new Date(reviewPublishExam.windowStart).getTime();
                const validDuration = reviewPublishExam.durationMinutes >= 1;
                const hasEnrolled =
                  reviewPublishExam.enrolledCandidateIds.length >= 1;
                const readyToPublish =
                  hasQuestions && validWindow && validDuration;

                return (
                  <>
                    <ul className="mt-4 space-y-2 rounded-xl border border-[rgba(15,23,42,0.10)] bg-[#F6F8FA] p-4 text-xs">
                      <li className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[#0F172A]">
                          {hasQuestions ? (
                            <CheckCircle2
                              className="h-4 w-4 text-[#0F766E]"
                              aria-hidden="true"
                            />
                          ) : (
                            <AlertCircle
                              className="h-4 w-4 text-[#B91C1C]"
                              aria-hidden="true"
                            />
                          )}
                          Questions assigned
                        </span>
                        <span className="font-mono font-semibold tabular-nums text-[#0F172A]">
                          {reviewPublishExam.questionIds.length}
                        </span>
                      </li>
                      <li className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[#0F172A]">
                          {validDuration ? (
                            <CheckCircle2
                              className="h-4 w-4 text-[#0F766E]"
                              aria-hidden="true"
                            />
                          ) : (
                            <AlertCircle
                              className="h-4 w-4 text-[#B91C1C]"
                              aria-hidden="true"
                            />
                          )}
                          Duration valid
                        </span>
                        <span className="font-mono font-semibold tabular-nums text-[#0F172A]">
                          {reviewPublishExam.durationMinutes} min
                        </span>
                      </li>
                      <li className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[#0F172A]">
                          {validWindow ? (
                            <CheckCircle2
                              className="h-4 w-4 text-[#0F766E]"
                              aria-hidden="true"
                            />
                          ) : (
                            <AlertCircle
                              className="h-4 w-4 text-[#B91C1C]"
                              aria-hidden="true"
                            />
                          )}
                          Availability window valid
                        </span>
                        <span className="font-mono font-semibold tabular-nums text-[#0F172A]">
                          {reviewPublishExam.totalMarks} marks
                        </span>
                      </li>
                      <li className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[#0F172A]">
                          {hasEnrolled ? (
                            <CheckCircle2
                              className="h-4 w-4 text-[#0F766E]"
                              aria-hidden="true"
                            />
                          ) : (
                            <Info
                              className="h-4 w-4 text-[#B45309]"
                              aria-hidden="true"
                            />
                          )}
                          Enrolled candidates
                        </span>
                        <span className="font-mono font-semibold tabular-nums text-[#0F172A]">
                          {reviewPublishExam.enrolledCandidateIds.length}
                        </span>
                      </li>
                    </ul>

                    <div className="mt-6 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setReviewPublishExam(null)}
                        className="min-h-[40px] cursor-pointer rounded-lg border border-[rgba(15,23,42,0.14)] px-4 py-2 text-sm font-medium text-[#0F172A] transition-colors hover:bg-[#EEF2F6]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={!readyToPublish}
                        onClick={async () => {
                          const id = reviewPublishExam.id;
                          setReviewPublishExam(null);
                          await patchExam(id, { status: "published" });
                        }}
                        className="min-h-[40px] cursor-pointer rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Publish exam
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
