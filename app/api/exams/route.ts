import { NextResponse } from "next/server";
import { canManageExam, requireRole } from "@/lib/auth";
import {
  computeStratifiedQuotas,
  finalizeAttemptInTx,
  shouldAutoExpireAttempt,
} from "@/lib/grading";
import { prisma } from "@/lib/prisma";
import { getOrLoadCached, invalidateCacheTags } from "@/lib/serverCache";
import type { ExamStatus } from "@/lib/types";
import {
  createExamSchema,
  safeParseJson,
  updateExamSchema,
} from "@/lib/validation";

const ALLOWED_TRANSITIONS: Record<ExamStatus, ExamStatus[]> = {
  draft: ["draft", "published", "ongoing"],
  published: ["published", "ongoing", "completed", "draft"],
  ongoing: ["ongoing", "completed"],
  completed: ["completed"],
};

async function validateEnrolledCandidates(
  candidateIds: string[]
): Promise<NextResponse | null> {
  if (candidateIds.length === 0) return null;
  const candidates = await prisma.user.findMany({
    where: { id: { in: candidateIds }, role: "candidate" },
    select: { id: true },
  });
  if (candidates.length !== candidateIds.length) {
    return NextResponse.json(
      {
        error:
          "One or more enrolled users do not exist or do not have candidate role",
      },
      { status: 400 }
    );
  }
  return null;
}

export async function GET() {
  const auth = await requireRole(["admin", "examiner", "candidate"]);
  if (auth.error) return auth.error;

  const now = new Date();

  if (auth.user.role === "candidate") {
    const payload = await getOrLoadCached(
      `exams:cand:${auth.user.id}`,
      ["exams"],
      20_000,
      async () => {
        const loadNow = new Date();
        const enrollments = await prisma.enrollment.findMany({
          relationLoadStrategy: "join",
          where: {
            candidateId: auth.user.id,
            exam: { status: { not: "draft" } },
          },
          include: {
            exam: {
              include: {
                examQuestions: { select: { id: true } },
                attempts: {
                  where: { candidateId: auth.user.id },
                  select: {
                    id: true,
                    status: true,
                    gradingState: true,
                    startedAt: true,
                    submittedAt: true,
                    serverExpiresAt: true,
                    lastHeartbeatAt: true,
                    autoPausedMs: true,
                    totalPossibleMarks: true,
                    totalAwardedMarks: true,
                    verificationCode: true,
                  },
                },
              },
            },
          },
          orderBy: { exam: { windowStart: "asc" } },
        });

        const staleAttempts = enrollments
          .map(({ exam }) => ({
            att: exam.attempts[0],
            durationMinutes: exam.durationMinutes,
          }))
          .filter(
            (
              entry
            ): entry is {
              att: NonNullable<typeof entry.att>;
              durationMinutes: number;
            } =>
              Boolean(entry.att) &&
              entry.att.status === "in_progress" &&
              shouldAutoExpireAttempt({
                nowMs: loadNow.getTime(),
                lastHeartbeatAtMs: entry.att.lastHeartbeatAt.getTime(),
                serverExpiresAtMs: entry.att.serverExpiresAt.getTime(),
                autoPausedMs: entry.att.autoPausedMs,
                durationMinutes: entry.durationMinutes,
              })
          )
          .map((entry) => entry.att);

        const finalizedById = new Map<
          string,
          NonNullable<Awaited<ReturnType<typeof finalizeAttemptInTx>>>
        >();
        if (staleAttempts.length > 0) {
          const doneList = await Promise.all(
            staleAttempts.map((att) => finalizeAttemptInTx(att.id, "expired"))
          );
          for (const done of doneList) {
            if (done) finalizedById.set(done.id, done);
          }
        }

        const exams = enrollments.map(({ exam }) => {
          const rawAttempt = exam.attempts[0] ?? null;
          const myAttempt =
            rawAttempt && finalizedById.has(rawAttempt.id)
              ? finalizedById.get(rawAttempt.id)!
              : rawAttempt;
          const hasActiveGraceAttempt =
            myAttempt?.status === "in_progress" &&
            loadNow < myAttempt.serverExpiresAt;
          const canEnter =
            exam.status === "ongoing" &&
            ((loadNow >= exam.windowStart && loadNow <= exam.windowEnd) ||
              hasActiveGraceAttempt) &&
            (!myAttempt || myAttempt.status === "in_progress");

          return {
            id: exam.id,
            code: exam.code,
            title: exam.title,
            instructions: exam.instructions,
            status: exam.status,
            durationMinutes: exam.durationMinutes,
            totalMarks: exam.totalMarks,
            windowStart: exam.windowStart.toISOString(),
            windowEnd: exam.windowEnd.toISOString(),
            questionsPerPaper:
              exam.questionsPerPaper ?? exam.examQuestions.length,
            resultsPublished: exam.resultsPublished,
            canEnter,
            myAttempt: myAttempt
              ? {
                  id: myAttempt.id,
                  status: myAttempt.status,
                  gradingState: myAttempt.gradingState,
                  startedAt: myAttempt.startedAt.toISOString(),
                  submittedAt: myAttempt.submittedAt?.toISOString() ?? null,
                  serverExpiresAt: myAttempt.serverExpiresAt.toISOString(),
                  totalPossibleMarks: myAttempt.totalPossibleMarks,
                  totalAwardedMarks: exam.resultsPublished
                    ? myAttempt.totalAwardedMarks
                    : null,
                  verificationCode: exam.resultsPublished
                    ? myAttempt.verificationCode
                    : null,
                }
              : null,
          };
        });

        return { exams };
      },
      (cached) => {
        const nowMs = Date.now();
        return cached.exams.every(
          (e) =>
            !(
              e.myAttempt?.status === "in_progress" &&
              new Date(e.myAttempt.serverExpiresAt).getTime() <= nowMs
            )
        );
      }
    );

    return NextResponse.json({
      exams: payload.exams,
      serverNow: now.toISOString(),
    });
  }

  const staffExams = await getOrLoadCached(
    `exams:staff:${auth.user.role}:${auth.user.id}`,
    ["exams"],
    20_000,
    async () => {
      const exams = await prisma.exam.findMany({
        relationLoadStrategy: "join",
        where:
          auth.user.role === "admin"
            ? undefined
            : { createdById: auth.user.id },
        include: {
          examQuestions: {
            orderBy: { position: "asc" },
            select: {
              questionId: true,
              question: { select: { difficulty: true } },
            },
          },
          enrollments: { select: { candidateId: true } },
          attempts: { select: { id: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return exams.map((e) => {
        const paperCount = e.questionsPerPaper ?? e.examQuestions.length;
        const poolQuestions = e.examQuestions.map((eq) => eq.question);
        const poolDifficultyCounts = computeStratifiedQuotas(
          poolQuestions,
          poolQuestions.length
        );
        const stratifiedQuotas = computeStratifiedQuotas(
          poolQuestions,
          paperCount
        );
        return {
          id: e.id,
          code: e.code,
          title: e.title,
          instructions: e.instructions,
          status: e.status,
          durationMinutes: e.durationMinutes,
          totalMarks: e.totalMarks,
          windowStart: e.windowStart.toISOString(),
          windowEnd: e.windowEnd.toISOString(),
          questionsPerPaper: paperCount,
          randomizeQuestions: e.randomizeQuestions,
          randomizeOptions: e.randomizeOptions,
          stratifiedBalanced:
            e.randomizeQuestions && paperCount < e.examQuestions.length,
          poolDifficultyCounts,
          stratifiedQuotas,
          resultsPublished: e.resultsPublished,
          questionIds: e.examQuestions.map((eq) => eq.questionId),
          enrolledCandidateIds: e.enrollments.map((en) => en.candidateId),
          attemptCount: e.attempts.length,
        };
      });
    }
  );

  return NextResponse.json({
    exams: staffExams,
    serverNow: now.toISOString(),
  });
}

export async function POST(req: Request) {
  const auth = await requireRole(["admin", "examiner"]);
  if (auth.error) return auth.error;

  const json = await safeParseJson(req);
  if (!json.ok) return json.error;
  const parsed = createExamSchema.safeParse(json.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid exam payload" },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const dup = await prisma.exam.findUnique({ where: { code: d.code } });
  if (dup) {
    return NextResponse.json(
      { error: `Exam code '${d.code}' already exists` },
      { status: 409 }
    );
  }

  const uniqueQuestionIds = Array.from(new Set(d.questionIds));
  const uniqueCandidateIds = Array.from(new Set(d.enrolledCandidateIds));

  const questions = await prisma.question.findMany({
    where: { id: { in: uniqueQuestionIds } },
  });
  if (questions.length !== uniqueQuestionIds.length) {
    return NextResponse.json(
      { error: "One or more selected questions were not found" },
      { status: 400 }
    );
  }
  const candidateErr = await validateEnrolledCandidates(uniqueCandidateIds);
  if (candidateErr) return candidateErr;

  const now = Date.now();
  const windowStart = d.windowStart
    ? new Date(d.windowStart)
    : new Date(now - 600_000);
  const windowEnd = d.windowEnd
    ? new Date(d.windowEnd)
    : new Date(now + 3600_000 * 6);
  if (windowEnd <= windowStart) {
    return NextResponse.json(
      { error: "Availability windowEnd must be after windowStart" },
      { status: 400 }
    );
  }

  const totalMarks = questions.reduce((s, q) => s + q.marks, 0);
  const clampedPaperCount = Math.min(
    questions.length,
    Math.max(1, d.questionsPerPaper ?? questions.length)
  );

  const created = await prisma.exam.create({
    data: {
      code: d.code,
      title: d.title,
      instructions:
        d.instructions || "Answer all items before the server timer expires.",
      status: "draft",
      durationMinutes: d.durationMinutes,
      totalMarks,
      windowStart,
      windowEnd,
      questionsPerPaper: clampedPaperCount,
      randomizeQuestions: d.randomizeQuestions,
      randomizeOptions: d.randomizeOptions,
      createdById: auth.user.id,
      examQuestions: {
        create: uniqueQuestionIds.map((qId, idx) => ({
          questionId: qId,
          position: idx + 1,
        })),
      },
      enrollments: {
        create: uniqueCandidateIds.map((cId) => ({
          candidateId: cId,
        })),
      },
    },
  });

  invalidateCacheTags("exams", "grading", "monitor");
  return NextResponse.json({ exam: created }, { status: 201 });
}

export async function PATCH(req: Request) {
  const auth = await requireRole(["admin", "examiner"]);
  if (auth.error) return auth.error;

  const json = await safeParseJson(req);
  if (!json.ok) return json.error;
  const parsed = updateExamSchema.safeParse(json.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid exam update" },
      { status: 400 }
    );
  }

  const { examId, enrolledCandidateIds, questionIds, ...fields } = parsed.data;
  const existing = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      examQuestions: true,
      _count: { select: { attempts: true } },
    },
  });
  if (!existing) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }
  if (!canManageExam(auth.user, existing.createdById)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (fields.code && fields.code !== existing.code) {
    const codeCollision = await prisma.exam.findUnique({
      where: { code: fields.code },
    });
    if (codeCollision) {
      return NextResponse.json(
        { error: `Exam code '${fields.code}' already exists` },
        { status: 409 }
      );
    }
  }

  const nextStatus = fields.status ?? existing.status;
  if (fields.status) {
    const validTargets = ALLOWED_TRANSITIONS[existing.status];
    if (!validTargets.includes(fields.status)) {
      return NextResponse.json(
        {
          error: `Invalid lifecycle transition from '${existing.status}' to '${fields.status}'`,
        },
        { status: 400 }
      );
    }
    if (
      existing.status === "published" &&
      fields.status === "draft" &&
      existing._count.attempts > 0
    ) {
      return NextResponse.json(
        { error: "Cannot revert exam to draft after candidate attempts exist" },
        { status: 409 }
      );
    }
  }

  const now = new Date();
  let effectiveStart = fields.windowStart
    ? new Date(fields.windowStart)
    : existing.windowStart;
  let effectiveEnd = fields.windowEnd
    ? new Date(fields.windowEnd)
    : existing.windowEnd;
  if ((fields.windowStart || fields.windowEnd) && effectiveEnd <= effectiveStart) {
    return NextResponse.json(
      { error: "Availability windowEnd must be after windowStart" },
      { status: 400 }
    );
  }
  const effectiveDuration = fields.durationMinutes ?? existing.durationMinutes;

  if (fields.status === "ongoing") {
    if (effectiveStart > now) effectiveStart = new Date(now.getTime() - 60_000);
    if (effectiveEnd <= now) effectiveEnd = new Date(now.getTime() + 3600_000 * 4);
  }

  const uniqueQuestionIds = questionIds
    ? Array.from(new Set(questionIds))
    : undefined;
  const uniqueCandidateIds = enrolledCandidateIds
    ? Array.from(new Set(enrolledCandidateIds))
    : undefined;

  const effectiveQuestionIds =
    uniqueQuestionIds ?? existing.examQuestions.map((eq) => eq.questionId);

  if (nextStatus === "published" || nextStatus === "ongoing") {
    if (effectiveQuestionIds.length === 0) {
      return NextResponse.json(
        { error: "Exam must contain at least 1 question before publication" },
        { status: 400 }
      );
    }
    if (effectiveEnd <= effectiveStart) {
      return NextResponse.json(
        { error: "Availability windowEnd must be after windowStart" },
        { status: 400 }
      );
    }
    if (effectiveDuration < 1) {
      return NextResponse.json(
        { error: "Duration must be at least 1 minute" },
        { status: 400 }
      );
    }
  }

  if (uniqueCandidateIds) {
    const candidateErr = await validateEnrolledCandidates(uniqueCandidateIds);
    if (candidateErr) return candidateErr;
  }

  let nextTotalMarks: number | undefined;
  let nextPaperCount = fields.questionsPerPaper ?? existing.questionsPerPaper;
  if (uniqueQuestionIds) {
    const qs = await prisma.question.findMany({
      where: { id: { in: uniqueQuestionIds } },
    });
    if (qs.length !== uniqueQuestionIds.length) {
      return NextResponse.json(
        { error: "One or more selected questions were not found" },
        { status: 400 }
      );
    }
    nextTotalMarks = qs.reduce((s, q) => s + q.marks, 0);
    nextPaperCount = Math.min(
      qs.length,
      Math.max(1, nextPaperCount ?? qs.length)
    );
  } else if (fields.questionsPerPaper !== undefined) {
    nextPaperCount = Math.min(
      Math.max(1, effectiveQuestionIds.length),
      Math.max(1, fields.questionsPerPaper)
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (uniqueQuestionIds) {
      await tx.examQuestion.deleteMany({ where: { examId } });
      await tx.examQuestion.createMany({
        data: uniqueQuestionIds.map((qId, idx) => ({
          examId,
          questionId: qId,
          position: idx + 1,
        })),
      });
    }
    if (uniqueCandidateIds) {
      await tx.enrollment.deleteMany({ where: { examId } });
      if (uniqueCandidateIds.length > 0) {
        await tx.enrollment.createMany({
          data: uniqueCandidateIds.map((cId) => ({
            examId,
            candidateId: cId,
          })),
        });
      }
    }

    const exam = await tx.exam.update({
      where: { id: examId },
      data: {
        ...(fields.code !== undefined ? { code: fields.code } : {}),
        ...(fields.title !== undefined ? { title: fields.title } : {}),
        ...(fields.instructions !== undefined
          ? { instructions: fields.instructions }
          : {}),
        ...(fields.status !== undefined ? { status: fields.status } : {}),
        ...(fields.durationMinutes !== undefined
          ? { durationMinutes: fields.durationMinutes }
          : {}),
        ...(fields.randomizeQuestions !== undefined
          ? { randomizeQuestions: fields.randomizeQuestions }
          : {}),
        ...(fields.randomizeOptions !== undefined
          ? { randomizeOptions: fields.randomizeOptions }
          : {}),
        ...(typeof fields.resultsPublished === "boolean"
          ? { resultsPublished: fields.resultsPublished }
          : {}),
        ...(nextTotalMarks !== undefined ? { totalMarks: nextTotalMarks } : {}),
        ...(nextPaperCount !== null && nextPaperCount !== undefined
          ? { questionsPerPaper: nextPaperCount }
          : {}),
        windowStart: effectiveStart,
        windowEnd: effectiveEnd,
      },
    });

    if (
      fields.status !== undefined ||
      typeof fields.resultsPublished === "boolean"
    ) {
      const action =
        typeof fields.resultsPublished === "boolean" &&
        fields.status === undefined
          ? fields.resultsPublished
            ? "PUBLISH_RESULTS"
            : "UNPUBLISH_RESULTS"
          : "UPDATE_EXAM_STATUS";
      await tx.auditLog.create({
        data: {
          actorId: auth.user.id,
          actorEmail: auth.user.email,
          action,
          target: `${exam.code}: status=${exam.status}, resultsPublished=${exam.resultsPublished}`,
        },
      });
    }

    return exam;
  }, { maxWait: 10_000, timeout: 20_000 });

  invalidateCacheTags("exams", "grading", "monitor", "verify");
  return NextResponse.json({ exam: updated });
}
