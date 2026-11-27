import { NextResponse } from "next/server";
import { canManageExam, requireRole } from "@/lib/auth";
import {
  finalizeAttemptInTx,
  getAttemptAutoPauseCapMs,
  shouldAutoExpireAttempt,
} from "@/lib/grading";
import { prisma } from "@/lib/prisma";
import { broadcastExamEvent } from "@/lib/realtime";
import { getOrLoadCached, invalidateCacheTags } from "@/lib/serverCache";
import type { AttemptItemSnapshot } from "@/lib/types";
import { announcementSchema, safeParseJson } from "@/lib/validation";

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
              autoPausedMs: true,
              exam: { select: { durationMinutes: true } },
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
            autoPausedMs: attemptState.autoPausedMs,
            autoPauseCapMs: getAttemptAutoPauseCapMs(
              attemptState.exam.durationMinutes
            ),
          }
        : null,
      serverNow: new Date().toISOString(),
    });
  }

  const examScope = examId
    ? { id: examId }
    : auth.user.role === "admin"
      ? undefined
      : { createdById: auth.user.id };

  const cacheKey = `monitor:${auth.user.role}:${auth.user.id}:${examId ?? "all"}`;
  const result = await getOrLoadCached(
    cacheKey,
    ["monitor"],
    10_000,
    async () => {
      const [examRecord, rawAttempts, announcements] = await Promise.all([
        examId
          ? prisma.exam.findUnique({
              where: { id: examId },
              select: { id: true, createdById: true },
            })
          : Promise.resolve(null),
        prisma.attempt.findMany({
          relationLoadStrategy: "join",
          where: examScope ? { exam: examScope } : undefined,
          select: {
            id: true,
            examId: true,
            status: true,
            gradingState: true,
            startedAt: true,
            serverExpiresAt: true,
            lastHeartbeatAt: true,
            autoPausedMs: true,
            itemsSnapshot: true,
            candidate: { select: { name: true, email: true } },
            exam: { select: { code: true, durationMinutes: true } },
            answers: {
              select: {
                questionId: true,
                selectedOptionIds: true,
                writtenText: true,
              },
            },
            incidents: {
              orderBy: { createdAt: "desc" },
              take: 8,
              select: { id: true, type: true, detail: true, createdAt: true },
            },
          },
          orderBy: { startedAt: "desc" },
        }),
        prisma.announcement.findMany({
          where: examScope ? { exam: examScope } : undefined,
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
      ]);

      if (examId) {
        if (!examRecord) {
          return {
            status: 404 as const,
            body: { error: "Exam not found" },
            activeExpiresAt: [] as number[],
          };
        }
        if (!canManageExam(auth.user, examRecord.createdById)) {
          return {
            status: 403 as const,
            body: { error: "Forbidden" },
            activeExpiresAt: [] as number[],
          };
        }
      }

      const loadNow = new Date();
      const staleAttempts = rawAttempts.filter(
        (att) =>
          att.status === "in_progress" &&
          shouldAutoExpireAttempt({
            nowMs: loadNow.getTime(),
            lastHeartbeatAtMs: att.lastHeartbeatAt.getTime(),
            serverExpiresAtMs: att.serverExpiresAt.getTime(),
            autoPausedMs: att.autoPausedMs,
            durationMinutes: att.exam.durationMinutes,
          })
      );
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

      const activeExpiresAt: number[] = [];
      const attempts = rawAttempts.map((att) => {
        const done = finalizedById.get(att.id);
        const status = done?.status ?? att.status;
        const gradingState = done?.gradingState ?? att.gradingState;
        if (status === "in_progress") {
          activeExpiresAt.push(att.serverExpiresAt.getTime());
        }

        const items = att.itemsSnapshot as unknown as AttemptItemSnapshot[];
        const answerByQ = new Map(att.answers.map((a) => [a.questionId, a]));
        const answeredCount = items.filter((item) => {
          const ans = answerByQ.get(item.questionId);
          if (!ans) return false;
          if (item.type === "written") return ans.writtenText.trim().length > 0;
          const sel = Array.isArray(ans.selectedOptionIds)
            ? (ans.selectedOptionIds as string[])
            : [];
          return sel.length > 0;
        }).length;

        return {
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
          autoPausedMs: att.autoPausedMs,
          autoPauseCapMs: getAttemptAutoPauseCapMs(att.exam.durationMinutes),
          incidents: att.incidents.map((i) => ({
            id: i.id,
            type: i.type,
            detail: i.detail,
            timestamp: i.createdAt.toISOString(),
          })),
        };
      });

      return {
        status: 200 as const,
        activeExpiresAt,
        body: {
          attempts,
          announcements: announcements.map((a) => ({
            ...a,
            createdAt: a.createdAt.toISOString(),
          })),
        },
      };
    },
    (cached) => {
      const nowMs = Date.now();
      return cached.activeExpiresAt.every((exp) => exp > nowMs);
    }
  );

  if (result.status !== 200) {
    return NextResponse.json(result.body, { status: result.status });
  }

  return NextResponse.json({
    ...result.body,
    serverNow: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  const auth = await requireRole(["admin", "examiner"]);
  if (auth.error) return auth.error;

  const json = await safeParseJson(req);
  if (!json.ok) return json.error;
  const parsed = announcementSchema.safeParse(json.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid announcement payload" },
      { status: 400 }
    );
  }
  const { examId, message } = parsed.data;

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

  invalidateCacheTags("monitor");
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
