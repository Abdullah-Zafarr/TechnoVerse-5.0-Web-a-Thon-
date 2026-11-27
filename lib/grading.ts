import crypto from "crypto";
import { Prisma, type Answer, type Attempt, type Question } from "@prisma/client";
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

export type DifficultyCounts = Record<Question["difficulty"], number>;

export function computeStratifiedQuotas(
  questions: Array<{ difficulty: Question["difficulty"] }>,
  limit: number
): DifficultyCounts {
  const difficulties: Array<Question["difficulty"]> = ["easy", "medium", "hard"];
  const available: DifficultyCounts = {
    easy: questions.filter((q) => q.difficulty === "easy").length,
    medium: questions.filter((q) => q.difficulty === "medium").length,
    hard: questions.filter((q) => q.difficulty === "hard").length,
  };
  const total = questions.length;
  const counts: DifficultyCounts = { easy: 0, medium: 0, hard: 0 };
  if (total === 0 || limit <= 0) return counts;

  const target = Math.min(limit, total);
  const remainders: Array<{ diff: Question["difficulty"]; rem: number }> = [];

  let assigned = 0;
  for (const diff of difficulties) {
    const exact = (available[diff] / total) * target;
    const base = Math.min(available[diff], Math.floor(exact));
    counts[diff] = base;
    assigned += base;
    remainders.push({ diff, rem: exact - base });
  }

  // Distribute leftover slots by largest fractional remainder so every paper
  // matches the pool's difficulty proportions as closely as possible.
  remainders.sort((a, b) => b.rem - a.rem);
  while (assigned < target) {
    let progressed = false;
    for (const entry of remainders) {
      if (assigned >= target) break;
      if (counts[entry.diff] < available[entry.diff]) {
        counts[entry.diff]++;
        assigned++;
        progressed = true;
      }
    }
    if (!progressed) break;
  }

  return counts;
}

function selectStratifiedQuestions(
  questions: Question[],
  limit: number
): Question[] {
  const difficulties: Array<Question["difficulty"]> = ["easy", "medium", "hard"];
  const pools: Record<Question["difficulty"], Question[]> = {
    easy: shuffleArray(questions.filter((q) => q.difficulty === "easy")),
    medium: shuffleArray(questions.filter((q) => q.difficulty === "medium")),
    hard: shuffleArray(questions.filter((q) => q.difficulty === "hard")),
  };
  const counts = computeStratifiedQuotas(questions, limit);

  const chosen = difficulties.flatMap((diff) =>
    pools[diff].slice(0, counts[diff])
  );
  return shuffleArray(chosen);
}

export function buildAttemptSnapshots(
  questions: Question[],
  options: {
    questionsPerPaper?: number | null;
    randomizeQuestions: boolean;
    randomizeOptions: boolean;
    balancedRandomization?: boolean;
  }
): AttemptItemSnapshot[] {
  const limit =
    options.questionsPerPaper && options.questionsPerPaper > 0
      ? Math.min(options.questionsPerPaper, questions.length)
      : questions.length;

  let selected: Question[];
  if (!options.randomizeQuestions) {
    selected = questions.slice(0, limit);
  } else if (
    limit < questions.length &&
    options.balancedRandomization !== false
  ) {
    selected = selectStratifiedQuestions(questions, limit);
  } else {
    selected = shuffleArray(questions).slice(0, limit);
  }

  return selected.map((q, idx) => {
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
    const autoScoreUpdates: Array<{ id: string; score: number }> = [];

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
          autoScoreUpdates.push({ id: ans.id, score });
        }
      }
    }

    if (autoScoreUpdates.length > 0) {
      const valueTuples = autoScoreUpdates.map(
        (u) => Prisma.sql`(${u.id}, ${u.score}::double precision)`
      );
      await tx.$executeRaw(
        Prisma.sql`UPDATE answers AS a SET auto_score = v.score FROM (VALUES ${Prisma.join(
          valueTuples
        )}) AS v(id, score) WHERE a.id = v.id`
      );
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
  }, { maxWait: 10_000, timeout: 20_000 });
}

export async function finalizeAttemptInTx(
  attemptId: string,
  reason: "submitted" | "expired"
) {
  const { attempt } = await finalizeAttemptAtomic(attemptId, reason);
  return attempt;
}

export const HEARTBEAT_INTERVAL_MS = 5_000;
export const OUTAGE_THRESHOLD_MS = 12_000;
export const MAX_AUTO_PAUSE_MS = 5 * 60_000;

/**
 * Returns the maximum cumulative milliseconds that can be auto-credited
 * for connection outages on an attempt (bounded at 5 min, or 25% of duration
 * with a 1 min floor for short exams).
 */
export function getAttemptAutoPauseCapMs(durationMinutes: number): number {
  return Math.min(
    MAX_AUTO_PAUSE_MS,
    Math.max(60_000, Math.floor(durationMinutes * 60_000 * 0.25))
  );
}

/**
 * Computes bounded server-side outage credit strictly from server timestamps.
 * Credits time only when a real gap (> OUTAGE_THRESHOLD_MS) occurs after a
 * heartbeat that was alive before the prior server deadline.
 */
export function computeAutoPauseCredit(params: {
  nowMs: number;
  lastHeartbeatAtMs: number;
  serverExpiresAtMs: number;
  autoPausedMs: number;
  capMs: number;
}): {
  creditedMs: number;
  newExpiresAtMs: number;
  newAutoPausedMs: number;
  remainingCapMs: number;
} {
  const { nowMs, lastHeartbeatAtMs, serverExpiresAtMs, autoPausedMs, capMs } =
    params;
  const remainingCapMs = Math.max(0, capMs - autoPausedMs);
  const gapMs = nowMs - lastHeartbeatAtMs;

  if (
    lastHeartbeatAtMs >= serverExpiresAtMs ||
    gapMs <= OUTAGE_THRESHOLD_MS ||
    remainingCapMs <= 0
  ) {
    return {
      creditedMs: 0,
      newExpiresAtMs: serverExpiresAtMs,
      newAutoPausedMs: autoPausedMs,
      remainingCapMs,
    };
  }

  const rawCreditMs = Math.max(0, gapMs - HEARTBEAT_INTERVAL_MS);
  const creditedMs = Math.min(rawCreditMs, remainingCapMs);
  return {
    creditedMs,
    newExpiresAtMs: serverExpiresAtMs + creditedMs,
    newAutoPausedMs: autoPausedMs + creditedMs,
    remainingCapMs: remainingCapMs - creditedMs,
  };
}

/**
 * Determines whether an in-progress attempt should be auto-expired at `now`,
 * holding off up to its remaining auto-pause cap when a mid-exam outage is
 * still in progress.
 */
export function shouldAutoExpireAttempt(params: {
  nowMs: number;
  lastHeartbeatAtMs: number;
  serverExpiresAtMs: number;
  autoPausedMs: number;
  durationMinutes: number;
}): boolean {
  const {
    nowMs,
    lastHeartbeatAtMs,
    serverExpiresAtMs,
    autoPausedMs,
    durationMinutes,
  } = params;
  if (nowMs < serverExpiresAtMs) return false;
  const capMs = getAttemptAutoPauseCapMs(durationMinutes);
  const remainingCapMs = Math.max(0, capMs - autoPausedMs);
  const inOutageHold =
    nowMs - lastHeartbeatAtMs > OUTAGE_THRESHOLD_MS &&
    lastHeartbeatAtMs < serverExpiresAtMs;
  const effectiveDeadlineMs =
    serverExpiresAtMs + (inOutageHold ? remainingCapMs : 0);
  return nowMs >= effectiveDeadlineMs;
}

export type ReconcileHeartbeatResult =
  | { kind: "not_found" }
  | { kind: "already_finalized"; status: Attempt["status"] }
  | {
      kind: "expired";
      serverExpiresAt: Date;
      autoPausedMs: number;
      capMs: number;
    }
  | {
      kind: "ok";
      now: Date;
      serverExpiresAt: Date;
      autoPausedMs: number;
      capMs: number;
      creditedMs: number;
    };

/**
 * Atomically records a candidate heartbeat inside a transaction, applying
 * bounded server-side outage credit if a connection gap exceeded the threshold.
 * Uses optimistic matching on lastHeartbeatAt so concurrent calls never double-credit.
 */
export async function reconcileAttemptHeartbeatInTx(
  tx: Prisma.TransactionClient,
  attemptId: string,
  now: Date
): Promise<ReconcileHeartbeatResult> {
  const attempt = await tx.attempt.findUnique({
    where: { id: attemptId },
    include: { exam: { select: { durationMinutes: true } } },
  });
  if (!attempt) return { kind: "not_found" };
  if (attempt.status !== "in_progress") {
    return { kind: "already_finalized", status: attempt.status };
  }

  const capMs = getAttemptAutoPauseCapMs(attempt.exam.durationMinutes);
  const credit = computeAutoPauseCredit({
    nowMs: now.getTime(),
    lastHeartbeatAtMs: attempt.lastHeartbeatAt.getTime(),
    serverExpiresAtMs: attempt.serverExpiresAt.getTime(),
    autoPausedMs: attempt.autoPausedMs,
    capMs,
  });

  if (now.getTime() >= credit.newExpiresAtMs) {
    return {
      kind: "expired",
      serverExpiresAt: attempt.serverExpiresAt,
      autoPausedMs: attempt.autoPausedMs,
      capMs,
    };
  }

  const newExpiresAt = new Date(credit.newExpiresAtMs);
  const claimed = await tx.attempt.updateMany({
    where: {
      id: attempt.id,
      status: "in_progress",
      lastHeartbeatAt: attempt.lastHeartbeatAt,
    },
    data: {
      lastHeartbeatAt: now,
      ...(credit.creditedMs > 0
        ? {
            serverExpiresAt: newExpiresAt,
            autoPausedMs: credit.newAutoPausedMs,
          }
        : {}),
    },
  });

  if (claimed.count === 0) {
    const latest = await tx.attempt.findUnique({
      where: { id: attempt.id },
      select: { status: true, serverExpiresAt: true, autoPausedMs: true },
    });
    if (!latest) return { kind: "not_found" };
    if (latest.status !== "in_progress") {
      return { kind: "already_finalized", status: latest.status };
    }
    if (now.getTime() >= latest.serverExpiresAt.getTime()) {
      return {
        kind: "expired",
        serverExpiresAt: latest.serverExpiresAt,
        autoPausedMs: latest.autoPausedMs,
        capMs,
      };
    }
    return {
      kind: "ok",
      now,
      serverExpiresAt: latest.serverExpiresAt,
      autoPausedMs: latest.autoPausedMs,
      capMs,
      creditedMs: 0,
    };
  }

  if (credit.creditedMs > 0) {
    const creditedSec = Math.max(1, Math.round(credit.creditedMs / 1000));
    const totalSec = Math.round(credit.newAutoPausedMs / 1000);
    const capSec = Math.round(capMs / 1000);
    await tx.incident.create({
      data: {
        attemptId: attempt.id,
        type: "offline_gap",
        detail: `Auto-paused ${creditedSec}s during outage (${totalSec}s / ${capSec}s cap); deadline extended.`.slice(
          0,
          240
        ),
      },
    });
  }

  return {
    kind: "ok",
    now,
    serverExpiresAt: newExpiresAt,
    autoPausedMs: credit.newAutoPausedMs,
    capMs,
    creditedMs: credit.creditedMs,
  };
}

export async function reconcileAttemptHeartbeat(
  attemptId: string,
  now = new Date()
): Promise<ReconcileHeartbeatResult> {
  return prisma.$transaction(
    (tx) => reconcileAttemptHeartbeatInTx(tx, attemptId, now),
    { maxWait: 10_000, timeout: 15_000 }
  );
}

export async function expireStaleAttempts(examId?: string): Promise<void> {
  const now = new Date();
  const inProgress = await prisma.attempt.findMany({
    where: {
      ...(examId ? { examId } : {}),
      status: "in_progress",
      serverExpiresAt: { lte: now },
    },
    select: {
      id: true,
      lastHeartbeatAt: true,
      serverExpiresAt: true,
      autoPausedMs: true,
      exam: { select: { durationMinutes: true } },
    },
  });
  const stale = inProgress.filter((att) =>
    shouldAutoExpireAttempt({
      nowMs: now.getTime(),
      lastHeartbeatAtMs: att.lastHeartbeatAt.getTime(),
      serverExpiresAtMs: att.serverExpiresAt.getTime(),
      autoPausedMs: att.autoPausedMs,
      durationMinutes: att.exam.durationMinutes,
    })
  );
  await Promise.all(
    stale.map((att) => finalizeAttemptInTx(att.id, "expired"))
  );
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
