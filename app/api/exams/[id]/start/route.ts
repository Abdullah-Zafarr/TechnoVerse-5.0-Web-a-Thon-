import { NextResponse } from "next/server";
import { Prisma, type Answer, type Attempt, type Exam } from "@prisma/client";
import { canManageExam, requireRole } from "@/lib/auth";
import { buildAttemptSnapshots, finalizeAttemptInTx } from "@/lib/grading";
import { prisma } from "@/lib/prisma";
import { broadcastExamEvent } from "@/lib/realtime";
import type { AttemptItemSnapshot } from "@/lib/types";

function stripAnswerKeys(items: AttemptItemSnapshot[]) {
  return items.map((item) => ({
    questionId: item.questionId,
    order: item.order,
    title: item.title,
    prompt: item.prompt,
    type: item.type,
    topic: item.topic,
    difficulty: item.difficulty,
    marks: item.marks,
    partialCredit: item.partialCredit,
    options: item.options,
  }));
}

async function resumeExistingAttempt(
  exam: Exam,
  initialAttempt: (Attempt & { answers: Answer[] }) | null,
  now: Date
): Promise<NextResponse> {
  let attempt = initialAttempt;
  if (attempt && attempt.status === "in_progress" && now >= attempt.serverExpiresAt) {
    attempt = (await finalizeAttemptInTx(attempt.id, "expired"))
      ? await prisma.attempt.findUnique({
          where: { id: attempt.id },
          include: { answers: true },
        })
      : attempt;
  }
  if (!attempt || attempt.status !== "in_progress") {
    return NextResponse.json(
      { error: `Attempt already ${attempt?.status ?? "closed"}` },
      { status: 409 }
    );
  }

  void prisma.attempt
    .update({
      where: { id: attempt.id },
      data: { lastHeartbeatAt: now },
    })
    .catch(() => {});

  const snapItems = attempt.itemsSnapshot as unknown as AttemptItemSnapshot[];
  const answerMap = Object.fromEntries(
    attempt.answers.map((a) => [
      a.questionId,
      {
        questionId: a.questionId,
        selectedOptionIds: Array.isArray(a.selectedOptionIds)
          ? (a.selectedOptionIds as string[])
          : [],
        writtenText: a.writtenText,
        markedForReview: a.markedForReview,
        revision: a.revision,
        updatedAt: a.updatedAt.toISOString(),
      },
    ])
  );

  return NextResponse.json({
    sandbox: false,
    serverNow: now.toISOString(),
    exam: {
      id: exam.id,
      code: exam.code,
      title: exam.title,
      instructions: exam.instructions,
      durationMinutes: exam.durationMinutes,
    },
    attempt: {
      id: attempt.id,
      examId: attempt.examId,
      status: attempt.status,
      startedAt: attempt.startedAt.toISOString(),
      serverExpiresAt: attempt.serverExpiresAt.toISOString(),
      totalPossibleMarks: attempt.totalPossibleMarks,
      items: stripAnswerKeys(snapItems),
      answers: answerMap,
    },
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: examId } = await params;
  const isSandbox = new URL(req.url).searchParams.get("sandbox") === "1";

  if (isSandbox) {
    const auth = await requireRole(["admin", "examiner"]);
    if (auth.error) return auth.error;

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        examQuestions: {
          include: { question: true },
          orderBy: { position: "asc" },
        },
      },
    });
    if (!exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }
    if (!canManageExam(auth.user, exam.createdById)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const items = buildAttemptSnapshots(
      exam.examQuestions.map((eq) => eq.question),
      {
        questionsPerPaper: exam.questionsPerPaper,
        randomizeQuestions: exam.randomizeQuestions,
        randomizeOptions: exam.randomizeOptions,
      }
    );
    const now = new Date();
    const expires = new Date(now.getTime() + exam.durationMinutes * 60_000);

    return NextResponse.json({
      sandbox: true,
      serverNow: now.toISOString(),
      exam: {
        id: exam.id,
        code: exam.code,
        title: exam.title,
        instructions: exam.instructions,
        durationMinutes: exam.durationMinutes,
      },
      attempt: {
        id: `sandbox-${exam.id}`,
        examId: exam.id,
        status: "in_progress",
        startedAt: now.toISOString(),
        serverExpiresAt: expires.toISOString(),
        totalPossibleMarks: items.reduce((s, i) => s + i.marks, 0),
        items: stripAnswerKeys(items),
        answers: {},
      },
    });
  }

  const auth = await requireRole(["candidate"]);
  if (auth.error) return auth.error;

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      examQuestions: {
        include: { question: true },
        orderBy: { position: "asc" },
      },
      enrollments: {
        where: { candidateId: auth.user.id },
        select: { id: true },
      },
      attempts: {
        where: { candidateId: auth.user.id },
        include: { answers: true },
      },
    },
  });

  if (!exam) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }
  if (exam.enrollments.length === 0) {
    return NextResponse.json(
      { error: "You are not enrolled in this examination" },
      { status: 403 }
    );
  }
  if (exam.status !== "ongoing") {
    return NextResponse.json(
      { error: `Exam is '${exam.status}' and unavailable` },
      { status: 403 }
    );
  }

  const now = new Date();
  const existingAttempt = exam.attempts[0] ?? null;

  if (existingAttempt) {
    // Allow resuming an active attempt with examiner-granted grace past windowEnd
    const hasActiveGrace =
      existingAttempt.status === "in_progress" &&
      now < existingAttempt.serverExpiresAt;
    if (!hasActiveGrace && (now < exam.windowStart || now > exam.windowEnd)) {
      return NextResponse.json(
        { error: "Outside availability window" },
        { status: 403 }
      );
    }
    return resumeExistingAttempt(exam, existingAttempt, now);
  }

  if (now < exam.windowStart || now > exam.windowEnd) {
    return NextResponse.json(
      { error: "Outside availability window" },
      { status: 403 }
    );
  }

  const snapshots = buildAttemptSnapshots(
    exam.examQuestions.map((eq) => eq.question),
    {
      questionsPerPaper: exam.questionsPerPaper,
      randomizeQuestions: exam.randomizeQuestions,
      randomizeOptions: exam.randomizeOptions,
    }
  );
  const expiresAtMs = Math.min(
    exam.windowEnd.getTime(),
    now.getTime() + exam.durationMinutes * 60_000
  );
  const totalPossibleMarks = snapshots.reduce((s, i) => s + i.marks, 0);

  let created;
  try {
    created = await prisma.attempt.create({
      data: {
        examId: exam.id,
        candidateId: auth.user.id,
        status: "in_progress",
        gradingState: "pending",
        startedAt: now,
        serverExpiresAt: new Date(expiresAtMs),
        lastHeartbeatAt: now,
        itemsSnapshot: snapshots as unknown as object,
        totalPossibleMarks,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const racedAttempt = await prisma.attempt.findUnique({
        where: {
          examId_candidateId: { examId: exam.id, candidateId: auth.user.id },
        },
        include: { answers: true },
      });
      return resumeExistingAttempt(exam, racedAttempt, now);
    }
    throw err;
  }

  await broadcastExamEvent(exam.id, "attempt_started", {
    attemptId: created.id,
    candidateName: auth.user.name,
  });

  return NextResponse.json({
    sandbox: false,
    serverNow: now.toISOString(),
    exam: {
      id: exam.id,
      code: exam.code,
      title: exam.title,
      instructions: exam.instructions,
      durationMinutes: exam.durationMinutes,
    },
    attempt: {
      id: created.id,
      examId: created.examId,
      status: created.status,
      startedAt: created.startedAt.toISOString(),
      serverExpiresAt: created.serverExpiresAt.toISOString(),
      totalPossibleMarks,
      items: stripAnswerKeys(snapshots),
      answers: {},
    },
  });
}
