import { NextResponse } from "next/server";
import { canManageExam, requireRole } from "@/lib/auth";
import { finalizeAttemptInTx } from "@/lib/grading";
import { prisma } from "@/lib/prisma";
import { broadcastExamEvent } from "@/lib/realtime";
import type { AttemptItemSnapshot } from "@/lib/types";
import { safeParseJson } from "@/lib/validation";

export async function GET(req: Request) {
  const auth = await requireRole(["admin", "examiner", "candidate"]);
  if (auth.error) return auth.error;

  const url = new URL(req.url);
  const examId = url.searchParams.get("examId") || undefined;
  const attemptId = url.searchParams.get("attemptId") || undefined;

  if (auth.user.role === "candidate") {
    const [announcements, attemptState] = await Promise.all([
      prisma.announcement.findMany({
        where: {
          ...(examId ? { examId } : {}),
          exam: {
            status: { not: "draft" },
            enrollments: { some: { candidateId: auth.user.id } },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      attemptId
        ? prisma.attempt.findFirst({
            where: {
              id: attemptId,
              candidateId: auth.user.id,
            },
            select: {
              id: true,
              status: true,
              serverExpiresAt: true,
            },
          })
        : Promise.resolve(null),
    ]);
    return NextResponse.json({
      announcements: announcements.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      })),
      attemptState: attemptState
        ? {
            id: attemptState.id,
            status: attemptState.status,
            serverExpiresAt: attemptState.serverExpiresAt.toISOString(),
          }
        : null,
      serverNow: new Date().toISOString(),
    });
  }

  if (examId) {
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }
    if (!canManageExam(auth.user, exam.createdById)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const examScope = examId
    ? { id: examId }
    : auth.user.role === "admin"
      ? undefined
      : { createdById: auth.user.id };

  const rawAttempts = await prisma.attempt.findMany({
    where: examScope ? { exam: examScope } : undefined,
    include: {
      candidate: true,
      exam: true,
      answers: true,
      incidents: { orderBy: { createdAt: "desc" }, take: 8 },
    },
    orderBy: { startedAt: "desc" },
  });

  const now = new Date();
  const attempts = [];

  for (const att of rawAttempts) {
    let status = att.status;
    let gradingState = att.gradingState;
    if (att.status === "in_progress" && now > att.serverExpiresAt) {
      const done = await finalizeAttemptInTx(att.id, "expired");
      if (done) {
        status = done.status;
        gradingState = done.gradingState;
      }
    }

    const items = att.itemsSnapshot as unknown as AttemptItemSnapshot[];
    const answeredCount = items.filter((item) => {
      const ans = att.answers.find((a) => a.questionId === item.questionId);
      if (!ans) return false;
      if (item.type === "written") return ans.writtenText.trim().length > 0;
      const sel = Array.isArray(ans.selectedOptionIds)
        ? (ans.selectedOptionIds as string[])
        : [];
      return sel.length > 0;
    }).length;

    attempts.push({
      id: att.id,
      examId: att.examId,
      examCode: att.exam.code,
      candidateName: att.candidate.name,
      candidateEmail: att.candidate.email,
      status,
      gradingState,
      answeredCount,
      totalQuestions: items.length,
      startedAt: att.startedAt.toISOString(),
      serverExpiresAt: att.serverExpiresAt.toISOString(),
      lastHeartbeatAt: att.lastHeartbeatAt.toISOString(),
      incidents: att.incidents.map((i) => ({
        id: i.id,
        type: i.type,
        detail: i.detail,
        timestamp: i.createdAt.toISOString(),
      })),
    });
  }

  const announcements = await prisma.announcement.findMany({
    where: examScope ? { exam: examScope } : undefined,
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({
    attempts,
    announcements: announcements.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    })),
    serverNow: now.toISOString(),
  });
}

export async function POST(req: Request) {
  const auth = await requireRole(["admin", "examiner"]);
  if (auth.error) return auth.error;

  const json = await safeParseJson<{ examId?: string; message?: string }>(req);
  if (!json.ok) return json.error;
  const body = json.data ?? {};
  const examId = (body.examId ?? "").trim();
  const message = (body.message ?? "").trim();

  if (!examId || !message) {
    return NextResponse.json(
      { error: "examId and message are required" },
      { status: 400 }
    );
  }

  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }
  if (!canManageExam(auth.user, exam.createdById)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const created = await prisma.announcement.create({
    data: {
      examId,
      message,
      createdBy: auth.user.name,
    },
  });

  await broadcastExamEvent(examId, "announcement", {
    id: created.id,
    message: created.message,
    createdBy: created.createdBy,
    createdAt: created.createdAt.toISOString(),
  });

  return NextResponse.json(
    {
      announcement: {
        ...created,
        createdAt: created.createdAt.toISOString(),
      },
    },
    { status: 201 }
  );
}
