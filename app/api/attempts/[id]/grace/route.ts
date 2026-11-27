import { NextResponse } from "next/server";
import { canManageExam, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { broadcastExamEvent } from "@/lib/realtime";
import { invalidateCacheTags } from "@/lib/serverCache";
import { graceGrantSchema, safeParseJson } from "@/lib/validation";

/**
 * Examiner-controlled verified outage grace and resume endpoint.
 * Extends serverExpiresAt by bounded minutes and reopens auto-expired attempts
 * without allowing candidates to self-extend or alter manually submitted attempts.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: attemptId } = await params;
  const auth = await requireRole(["admin", "examiner"]);
  if (auth.error) return auth.error;

  const json = await safeParseJson(req);
  if (!json.ok) return json.error;
  const parsed = graceGrantSchema.safeParse(json.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid grace payload" },
      { status: 400 }
    );
  }

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: { exam: true },
  });
  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }
  if (!canManageExam(auth.user, attempt.exam.createdById)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (attempt.status === "submitted") {
    return NextResponse.json(
      { error: "Cannot grant outage grace to a submitted attempt" },
      { status: 409 }
    );
  }
  if (attempt.exam.status !== "ongoing") {
    return NextResponse.json(
      { error: "Outage grace can only be granted while the exam is ongoing" },
      { status: 409 }
    );
  }

  const { graceMinutes, reason } = parsed.data;
  const now = new Date();
  const baseMs = Math.max(now.getTime(), attempt.serverExpiresAt.getTime());
  const newExpiresAt = new Date(baseMs + graceMinutes * 60_000);
  const wasExpired = attempt.status === "expired";

  const updated = await prisma.$transaction(async (tx) => {
    const saved = await tx.attempt.update({
      where: { id: attempt.id },
      data: {
        serverExpiresAt: newExpiresAt,
        ...(wasExpired
          ? {
              status: "in_progress",
              gradingState: "pending",
              submittedAt: null,
              verificationCode: null,
              lastHeartbeatAt: now,
            }
          : {}),
      },
    });

    const prefix = wasExpired
      ? `Verified outage grace (+${graceMinutes} min, resumed)`
      : `Verified outage grace (+${graceMinutes} min)`;

    await tx.incident.create({
      data: {
        attemptId: attempt.id,
        type: "offline_gap",
        detail: `${prefix}: ${reason}`.slice(0, 240),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: auth.user.id,
        actorEmail: auth.user.email,
        action: wasExpired ? "OUTAGE_GRACE_RESUME" : "OUTAGE_GRACE_EXTEND",
        target: `${attempt.id} (+${graceMinutes}m): ${reason}`.slice(0, 240),
      },
    });

    return saved;
  }, { maxWait: 10_000, timeout: 15_000 });

  invalidateCacheTags("exams", "monitor", "grading");
  await broadcastExamEvent(attempt.examId, "attempt_grace_granted", {
    attemptId: updated.id,
    status: updated.status,
    serverExpiresAt: updated.serverExpiresAt.toISOString(),
    graceMinutes,
    resumed: wasExpired,
    reason,
  });

  return NextResponse.json({
    attempt: {
      id: updated.id,
      status: updated.status,
      serverExpiresAt: updated.serverExpiresAt.toISOString(),
    },
    graceMinutes,
    resumed: wasExpired,
    serverNow: new Date().toISOString(),
  });
}
