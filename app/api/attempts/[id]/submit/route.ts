import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import {
  finalizeAttemptAtomic,
  reconcileAttemptHeartbeat,
} from "@/lib/grading";
import { prisma } from "@/lib/prisma";
import { broadcastExamEvent } from "@/lib/realtime";
import { invalidateCacheTags } from "@/lib/serverCache";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: attemptId } = await params;
  const auth = await requireRole(["candidate"]);
  if (auth.error) return auth.error;

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
  });
  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }
  if (attempt.candidateId !== auth.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (attempt.status !== "in_progress") {
    return NextResponse.json(
      { error: `Attempt already ${attempt.status}` },
      { status: 409 }
    );
  }

  const now = new Date();
  const reconciled = await reconcileAttemptHeartbeat(attempt.id, now);
  const effectiveExpiresAt =
    reconciled.kind === "ok" || reconciled.kind === "expired"
      ? reconciled.serverExpiresAt
      : attempt.serverExpiresAt;
  const reason = now > effectiveExpiresAt ? "expired" : "submitted";
  const { attempt: finalized, finalizedNow } = await finalizeAttemptAtomic(
    attempt.id,
    reason
  );
  if (!finalized) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }
  if (!finalizedNow) {
    return NextResponse.json(
      { error: `Attempt already ${finalized.status}` },
      { status: 409 }
    );
  }

  invalidateCacheTags("exams", "monitor", "grading", "verify");
  await broadcastExamEvent(attempt.examId, "attempt_submitted", {
    attemptId: attempt.id,
  });

  return NextResponse.json({
    attempt: {
      id: finalized.id,
      status: finalized.status,
      gradingState: finalized.gradingState,
      submittedAt: finalized.submittedAt?.toISOString() ?? null,
      totalPossibleMarks: finalized.totalPossibleMarks,
    },
  });
}
