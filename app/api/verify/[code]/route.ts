import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function maskName(name: string): string {
  return name
    .split(" ")
    .map((part) =>
      part.length <= 1 ? part : `${part[0]}${"*".repeat(part.length - 1)}`
    )
    .join(" ");
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const attempt = await prisma.attempt.findFirst({
    relationLoadStrategy: "join",
    where: {
      verificationCode: { equals: code, mode: "insensitive" },
    },
    include: {
      exam: { select: { code: true, title: true, resultsPublished: true } },
      candidate: { select: { name: true } },
    },
  });

  if (!attempt) {
    return NextResponse.json(
      { valid: false, error: "Verification code not found" },
      { status: 404 }
    );
  }

  if (!attempt.exam.resultsPublished) {
    return NextResponse.json(
      { valid: false, error: "Result has not been published" },
      { status: 403 }
    );
  }

  return NextResponse.json({
    valid: true,
    verificationCode: attempt.verificationCode,
    examCode: attempt.exam.code,
    examTitle: attempt.exam.title,
    candidateMaskedName: maskName(attempt.candidate.name),
    totalAwardedMarks: attempt.totalAwardedMarks,
    totalPossibleMarks: attempt.totalPossibleMarks,
    gradingState: attempt.gradingState,
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
  });
}
