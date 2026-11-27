import { NextResponse } from "next/server";
import { canManageExam, requireRole } from "@/lib/auth";
import {
  computeExamAnalytics,
  expireStaleAttempts,
  gradeObjectiveItem,
} from "@/lib/grading";
import { prisma } from "@/lib/prisma";
import type { AttemptItemSnapshot } from "@/lib/types";
import { manualGradeSchema, safeParseJson } from "@/lib/validation";

export async function GET(req: Request) {
  const auth = await requireRole(["admin", "examiner"]);
  if (auth.error) return auth.error;

  const examIdParam = new URL(req.url).searchParams.get("examId");

  const exam = examIdParam
    ? await prisma.exam.findUnique({
        where: { id: examIdParam },
        include: {
          examQuestions: { include: { question: true } },
          enrollments: true,
        },
      })
    : await prisma.exam.findFirst({
        where:
          auth.user.role === "admin"
            ? undefined
            : { createdById: auth.user.id },
        orderBy: { createdAt: "desc" },
        include: {
          examQuestions: { include: { question: true } },
          enrollments: true,
        },
      });

  if (!exam) {
    return NextResponse.json({
      exam: null,
      attempts: [],
      summary: null,
      analytics: [],
    });
  }

  if (!canManageExam(auth.user, exam.createdById)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await expireStaleAttempts(exam.id);

  const attempts = await prisma.attempt.findMany({
    where: { examId: exam.id },
    include: {
      candidate: true,
      answers: true,
      incidents: true,
    },
    orderBy: { startedAt: "desc" },
  });

  const { summary, questionRows } = computeExamAnalytics(
    exam.examQuestions.map((eq) => eq.question),
    exam.enrollments.length,
    attempts
  );

  return NextResponse.json({
    exam: {
      id: exam.id,
      code: exam.code,
      title: exam.title,
      resultsPublished: exam.resultsPublished,
    },
    summary,
    analytics: questionRows,
    attempts: attempts.map((att) => ({
      id: att.id,
      candidateId: att.candidateId,
      candidateName: att.candidate.name,
      candidateEmail: att.candidate.email,
      status: att.status,
      gradingState: att.gradingState,
      submittedAt: att.submittedAt?.toISOString() ?? null,
      totalPossibleMarks: att.totalPossibleMarks,
      totalAwardedMarks: att.totalAwardedMarks,
      verificationCode: att.verificationCode,
      items: att.itemsSnapshot as unknown as AttemptItemSnapshot[],
      answers: Object.fromEntries(
        att.answers.map((a) => [
          a.questionId,
          {
            selectedOptionIds: Array.isArray(a.selectedOptionIds)
              ? (a.selectedOptionIds as string[])
              : [],
            writtenText: a.writtenText,
            autoScore: a.autoScore,
            manualScore: a.manualScore,
            manualFeedback: a.manualFeedback,
          },
        ])
      ),
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireRole(["admin", "examiner"]);
  if (auth.error) return auth.error;

  const json = await safeParseJson(req);
  if (!json.ok) return json.error;
  const parsed = manualGradeSchema.safeParse(json.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid grading input" },
      { status: 400 }
    );
  }

  const { attemptId, questionId, score, feedback } = parsed.data;
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { answers: true, exam: true },
  });
  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }
  if (!canManageExam(auth.user, attempt.exam.createdById)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (attempt.status === "in_progress") {
    return NextResponse.json(
      { error: "Cannot grade an attempt while it is still in progress" },
      { status: 409 }
    );
  }

  const items = attempt.itemsSnapshot as unknown as AttemptItemSnapshot[];
  const item = items.find((i) => i.questionId === questionId);
  if (!item || item.type !== "written") {
    return NextResponse.json(
      { error: "Manual grading applies only to written questions" },
      { status: 400 }
    );
  }
  if (score < 0 || score > item.marks) {
    return NextResponse.json(
      { error: `Score must be between 0 and ${item.marks}` },
      { status: 400 }
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.answer.upsert({
      where: { attemptId_questionId: { attemptId, questionId } },
      update: {
        manualScore: Number(score.toFixed(2)),
        manualFeedback: feedback?.trim() || null,
      },
      create: {
        attemptId,
        questionId,
        manualScore: Number(score.toFixed(2)),
        manualFeedback: feedback?.trim() || null,
      },
    });

    const latestAnswers = await tx.answer.findMany({ where: { attemptId } });
    const ansMap = new Map(latestAnswers.map((a) => [a.questionId, a]));

    let totalAwarded = 0;
    let needsManual = false;
    for (const qItem of items) {
      const ans = ansMap.get(qItem.questionId);
      if (qItem.type === "written") {
        if (ans && typeof ans.manualScore === "number") {
          totalAwarded += ans.manualScore;
        } else {
          needsManual = true;
        }
      } else {
        const selected = Array.isArray(ans?.selectedOptionIds)
          ? (ans.selectedOptionIds as string[])
          : [];
        totalAwarded += gradeObjectiveItem(qItem, selected) ?? 0;
      }
    }

    const updated = await tx.attempt.update({
      where: { id: attemptId },
      data: {
        totalAwardedMarks: Number(totalAwarded.toFixed(2)),
        gradingState: needsManual ? "needs_manual" : "graded",
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: auth.user.id,
        actorEmail: auth.user.email,
        action: "MANUAL_GRADE",
        target: `Attempt ${attemptId} Q ${questionId} -> ${Number(score.toFixed(2))}/${item.marks}`,
      },
    });

    return updated;
  }, { maxWait: 10_000, timeout: 20_000 });

  return NextResponse.json({
    ok: true,
    gradingState: result.gradingState,
    totalAwardedMarks: result.totalAwardedMarks,
  });
}
