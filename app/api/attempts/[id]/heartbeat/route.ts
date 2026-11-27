import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { finalizeAttemptInTx, reconcileAttemptHeartbeat } from "@/lib/grading";
import { prisma } from "@/lib/prisma";
import { broadcastExamEvent } from "@/lib/realtime";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: attemptId } = await params;
  const auth = await requireRole(["candidate"]);
  if (auth.error) return auth.error;

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: { id: true, examId: true, candidateId: true, status: true },
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

  const res = await reconcileAttemptHeartbeat(attempt.id, new Date());
  if (res.kind === "not_found") {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }
  if (res.kind === "already_finalized") {
    return NextResponse.json(
      { error: `Attempt already ${res.status}` },
      { status: 409 }
    );
  }
  if (res.kind === "expired") {
    await finalizeAttemptInTx(attempt.id, "expired");
    return NextResponse.json(
      {
        error: "Server time expired; attempt finalized with accepted answers.",
        expired: true,
        serverNow: new Date().toISOString(),
      },
      { status: 409 }
    );
  }

  if (res.creditedMs > 0) {
    await broadcastExamEvent(attempt.examId, "attempt_updated", {
      attemptId: attempt.id,
    });
  }

  return NextResponse.json({
    ok: true,
    serverNow: res.now.toISOString(),
    serverExpiresAt: res.serverExpiresAt.toISOString(),
    autoPausedMs: res.autoPausedMs,
    autoPauseCapMs: res.capMs,
    creditedMs: res.creditedMs,
  });
}
