import crypto from "crypto";
import type { Answer, Attempt, Question } from "@prisma/client";
import type {
  AttemptItemSnapshot,
  ExamSummaryMetrics,
  QuestionAnalyticsRow,
  QuestionOption,
  ScoreBucket,
} from "./types";
import { prisma } from "./prisma";

function shuffleArray<T>(input: T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function buildAttemptSnapshots(
  questions: Question[],
  options: {
    questionsPerPaper?: number | null;
    randomizeQuestions: boolean;
    randomizeOptions: boolean;
  }
): AttemptItemSnapshot[] {
  const ordered = options.randomizeQuestions
    ? shuffleArray(questions)
    : [...questions];
  const limit =
    options.questionsPerPaper && options.questionsPerPaper > 0
      ? Math.min(options.questionsPerPaper, ordered.length)
      : ordered.length;

  return ordered.slice(0, limit).map((q, idx) => {
    const parsedOptions = Array.isArray(q.options)
      ? (q.options as unknown as QuestionOption[])
      : [];
    const parsedCorrect = Array.isArray(q.correctOptionIds)
      ? (q.correctOptionIds as unknown as string[])
      : [];

    return {
      questionId: q.id,
      order: idx + 1,
      title: q.title,
      prompt: q.prompt,
      type: q.type,
      topic: q.topic,
      difficulty: q.difficulty,
      marks: q.marks,
      partialCredit: q.partialCredit,
      options:
        options.randomizeOptions && parsedOptions.length > 1
          ? shuffleArray(parsedOptions)
          : [...parsedOptions],
      correctOptionIds: [...parsedCorrect],
      rubric: q.rubric,
    };
  });
}

export function gradeObjectiveItem(
  item: AttemptItemSnapshot,
  selectedOptionIds: string[]
): number | null {
  if (item.type === "written") return null;
  if (selectedOptionIds.length === 0) return 0;

  const selected = new Set(selectedOptionIds);
  const correct = new Set(item.correctOptionIds);

  if (item.type === "single_mcq") {
    return selected.size === 1 && correct.has(selectedOptionIds[0])
      ? item.marks
      : 0;
  }

  if (!item.partialCredit) {
    const exactMatch =
      selected.size === correct.size &&
      [...selected].every((id) => correct.has(id));
    return exactMatch ? item.marks : 0;
  }

  let hits = 0;
  let misses = 0;
  for (const id of selected) {
    if (correct.has(id)) hits++;
    else misses++;
  }
  const rawFraction =
    correct.size > 0
      ? hits / correct.size - misses / Math.max(1, item.options.length)
      : 0;
  const clamped = Math.max(0, Math.min(1, rawFraction));
  return Number((clamped * item.marks).toFixed(2));
}

export async function finalizeAttemptAtomic(
  attemptId: string,
  reason: "submitted" | "expired"
): Promise<{ attempt: Attempt | null; finalizedNow: boolean }> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.attempt.updateMany({
      where: { id: attemptId, status: "in_progress" },
      data: { status: reason },
    });
    if (claimed.count === 0) {
      const existing = await tx.attempt.findUnique({
        where: { id: attemptId },
      });
      return { attempt: existing, finalizedNow: false };
    }

    const attempt = await tx.attempt.findUnique({
      where: { id: attemptId },
      include: { answers: true },
    });
    if (!attempt) {
      return { attempt: null, finalizedNow: false };
    }

    const items = attempt.itemsSnapshot as unknown as AttemptItemSnapshot[];
    const answerMap = new Map<string, Answer>(
      attempt.answers.map((a) => [a.questionId, a])
    );

    let totalAwarded = 0;
    let needsManual = false;

    for (const item of items) {
      const ans = answerMap.get(item.questionId);
      if (item.type === "written") {
        if (ans && typeof ans.manualScore === "number") {
          totalAwarded += ans.manualScore;
        } else {
          needsManual = true;
        }
      } else {
        const selected = Array.isArray(ans?.selectedOptionIds)
          ? (ans.selectedOptionIds as string[])
          : [];
        const score = gradeObjectiveItem(item, selected) ?? 0;
        totalAwarded += score;
        if (ans) {
          await tx.answer.update({
            where: { id: ans.id },
            data: { autoScore: score },
          });
        }
      }
    }

    const now = new Date();
    if (reason === "expired") {
      await tx.incident.create({
        data: {
          attemptId: attempt.id,
          type: "auto_expired",
          detail:
            "Server deadline reached; attempt auto-finalized with accepted answers.",
        },
      });
    }

    const code =
      attempt.verificationCode ||
      `EG-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

    const updated = await tx.attempt.update({
      where: { id: attempt.id },
      data: {
        status: reason,
        submittedAt: now,
        gradingState: needsManual ? "needs_manual" : "graded",
        totalAwardedMarks: Number(totalAwarded.toFixed(2)),
        verificationCode: code,
      },
    });

    return { attempt: updated, finalizedNow: true };
  });
}

export async function finalizeAttemptInTx(
  attemptId: string,
  reason: "submitted" | "expired"
) {
  const { attempt } = await finalizeAttemptAtomic(attemptId, reason);
  return attempt;
}

export async function expireStaleAttempts(examId?: string): Promise<void> {
  const now = new Date();
  const stale = await prisma.attempt.findMany({
    where: {
      ...(examId ? { examId } : {}),
      status: "in_progress",
      serverExpiresAt: { lte: now },
    },
    select: { id: true },
  });
  for (const att of stale) {
    await finalizeAttemptInTx(att.id, "expired");
  }
}

export function computeExamAnalytics(
  questions: Question[],
  enrolledCount: number,
  attempts: Array<{
    status: string;
    gradingState: string;
    totalPossibleMarks: number;
    totalAwardedMarks: number;
    itemsSnapshot: unknown;
    answers: Answer[];
  }>
): { summary: ExamSummaryMetrics; questionRows: QuestionAnalyticsRow[] } {
  const finished = attempts.filter((a) => a.status !== "in_progress");
  const submittedCount = finished.filter((a) => a.status === "submitted").length;
  const expiredCount = finished.filter((a) => a.status === "expired").length;
  const inProgressCount = attempts.filter(
    (a) => a.status === "in_progress"
  ).length;
  const gradedCount = finished.filter((a) => a.gradingState === "graded").length;
  const needsManualCount = finished.filter(
    (a) => a.gradingState === "needs_manual"
  ).length;

  const scores = finished
    .map((a) => a.totalAwardedMarks)
    .sort((a, b) => a - b);

  const averageScore =
    scores.length > 0
      ? Number(
          (scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(2)
        )
      : 0;

  let medianScore = 0;
  if (scores.length > 0) {
    const mid = Math.floor(scores.length / 2);
    medianScore =
      scores.length % 2 === 1
        ? scores[mid]
        : Number(((scores[mid - 1] + scores[mid]) / 2).toFixed(2));
  }

  const highestScore = scores.length > 0 ? scores[scores.length - 1] : 0;
  const lowestScore = scores.length > 0 ? scores[0] : 0;
  const maxPossibleMarks =
    finished.length > 0
      ? Math.max(...finished.map((a) => a.totalPossibleMarks))
      : questions.reduce((s, q) => s + q.marks, 0);

  const passedCount = finished.filter(
    (a) =>
      a.totalPossibleMarks > 0 &&
      a.totalAwardedMarks / a.totalPossibleMarks >= 0.5
  ).length;

  const scoreBuckets: ScoreBucket[] = [
    { label: "0-19%", count: 0 },
    { label: "20-39%", count: 0 },
    { label: "40-59%", count: 0 },
    { label: "60-79%", count: 0 },
    { label: "80-100%", count: 0 },
  ];

  for (const att of finished) {
    const pct =
      att.totalPossibleMarks > 0
        ? Math.max(
            0,
            Math.min(100, (att.totalAwardedMarks / att.totalPossibleMarks) * 100)
          )
        : 0;
    if (pct < 20) scoreBuckets[0].count++;
    else if (pct < 40) scoreBuckets[1].count++;
    else if (pct < 60) scoreBuckets[2].count++;
    else if (pct < 80) scoreBuckets[3].count++;
    else scoreBuckets[4].count++;
  }

  const summary: ExamSummaryMetrics = {
    totalEnrolled: enrolledCount,
    submittedCount,
    expiredCount,
    inProgressCount,
    gradedCount,
    needsManualCount,
    averageScore,
    medianScore,
    highestScore,
    lowestScore,
    maxPossibleMarks,
    passRatePercent:
      finished.length > 0
        ? Math.round((passedCount / finished.length) * 100)
        : 0,
    scoreBuckets,
  };

  const questionRows: QuestionAnalyticsRow[] = questions.map((q) => {
    let attemptCount = 0;
    let skippedCount = 0;
    let totalAwarded = 0;
    const wrongCounts: Record<string, number> = {};

    for (const att of finished) {
      const items = att.itemsSnapshot as AttemptItemSnapshot[];
      const snap = items.find((i) => i.questionId === q.id);
      if (!snap) continue;
      attemptCount++;

      const ans = att.answers.find((a) => a.questionId === q.id);
      const selected = Array.isArray(ans?.selectedOptionIds)
        ? (ans.selectedOptionIds as string[])
        : [];
      const isSkipped =
        !ans ||
        (snap.type === "written"
          ? ans.writtenText.trim().length === 0
          : selected.length === 0);

      if (isSkipped) {
        skippedCount++;
      } else {
        const earned =
          snap.type === "written" ? ans.manualScore ?? 0 : ans.autoScore ?? 0;
        totalAwarded += earned;

        if (snap.type !== "written") {
          for (const optId of selected) {
            if (!snap.correctOptionIds.includes(optId)) {
              const label =
                snap.options.find((o) => o.id === optId)?.text ?? optId;
              wrongCounts[label] = (wrongCounts[label] ?? 0) + 1;
            }
          }
        }
      }
    }

    const avgScorePercent =
      attemptCount > 0 && q.marks > 0
        ? Math.round((totalAwarded / (attemptCount * q.marks)) * 100)
        : 0;
    const skipRatePercent =
      attemptCount > 0 ? Math.round((skippedCount / attemptCount) * 100) : 0;

    let observedDifficulty: QuestionAnalyticsRow["observedDifficulty"] =
      "No Data";
    if (attemptCount > 0) {
      if (avgScorePercent >= 75) observedDifficulty = "Easy";
      else if (avgScorePercent >= 40) observedDifficulty = "Moderate";
      else observedDifficulty = "Hard";
    }

    const topWrong = Object.entries(wrongCounts).sort((a, b) => b[1] - a[1]);

    return {
      questionId: q.id,
      title: q.title,
      type: q.type,
      configuredDifficulty: q.difficulty,
      maxMarks: q.marks,
      attemptCount,
      skippedCount,
      skipRatePercent,
      avgScorePercent,
      observedDifficulty,
      mostCommonWrongOption: topWrong[0]?.[0] ?? null,
    };
  });

  return { summary, questionRows };
}
