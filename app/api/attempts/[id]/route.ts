import { NextResponse } from "next/server";
import { canManageExam, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { AttemptItemSnapshot } from "@/lib/types";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: attemptId } = await params;
  const auth = await requireRole(["admin", "examiner", "candidate"]);
  if (auth.error) return auth.error;

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    include: {
      exam: true,
      candidate: true,
      answers: true,
    },
  });

  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }

  if (auth.user.role === "candidate") {
    if (attempt.candidateId !== auth.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (attempt.status === "in_progress") {
      return NextResponse.json(
        { error: "Breakdown is unavailable while attempt is in progress" },
        { status: 403 }
      );
    }
    if (!attempt.exam.resultsPublished) {
      return NextResponse.json(
        { error: "Results have not been published yet" },
        { status: 403 }
      );
    }
  } else if (!canManageExam(auth.user, attempt.exam.createdById)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const items = attempt.itemsSnapshot as unknown as AttemptItemSnapshot[];
  const answerMap = new Map(attempt.answers.map((a) => [a.questionId, a]));

  const breakdown = items.map((item) => {
    const ans = answerMap.get(item.questionId);
    const selectedOptionIds = Array.isArray(ans?.selectedOptionIds)
      ? (ans.selectedOptionIds as string[])
      : [];
    return {
      questionId: item.questionId,
      order: item.order,
      title: item.title,
      prompt: item.prompt,
      type: item.type,
      marks: item.marks,
      options: item.options,
      selectedOptionIds,
      writtenText: ans?.writtenText ?? "",
      autoScore: ans?.autoScore ?? null,
      manualScore: ans?.manualScore ?? null,
      manualFeedback: ans?.manualFeedback ?? null,
    };
  });

  return NextResponse.json({
    attempt: {
      id: attempt.id,
      examCode: attempt.exam.code,
      examTitle: attempt.exam.title,
      candidateName: attempt.candidate.name,
      status: attempt.status,
      gradingState: attempt.gradingState,
      submittedAt: attempt.submittedAt?.toISOString() ?? null,
      totalAwardedMarks: attempt.totalAwardedMarks,
      totalPossibleMarks: attempt.totalPossibleMarks,
      verificationCode: attempt.verificationCode,
      breakdown,
    },
  });
}
