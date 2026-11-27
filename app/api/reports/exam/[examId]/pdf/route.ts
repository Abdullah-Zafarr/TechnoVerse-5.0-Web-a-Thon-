import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { canManageExam, requireRole } from "@/lib/auth";
import { computeExamAnalytics, finalizeAttemptInTx } from "@/lib/grading";
import { sanitizePdfFilename, sanitizePdfText, wrapPdfText } from "@/lib/pdf";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ examId: string }> }
) {
  const { examId } = await params;
  const auth = await requireRole(["admin", "examiner"]);
  if (auth.error) return auth.error;

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      examQuestions: {
        include: { question: true },
        orderBy: { position: "asc" },
      },
      _count: { select: { enrollments: true } },
      attempts: {
        include: {
          candidate: { select: { name: true, email: true } },
          answers: true,
        },
        orderBy: { totalAwardedMarks: "desc" },
      },
    },
  });

  if (!exam) {
    return NextResponse.json({ error: "Exam not found" }, { status: 404 });
  }
  if (!canManageExam(auth.user, exam.createdById)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const staleIds = exam.attempts
    .filter((a) => a.status === "in_progress" && now >= a.serverExpiresAt)
    .map((a) => a.id);

  let attempts = exam.attempts;
  if (staleIds.length > 0) {
    await Promise.all(
      staleIds.map((id) => finalizeAttemptInTx(id, "expired"))
    );
    attempts = await prisma.attempt.findMany({
      where: { examId: exam.id },
      include: {
        candidate: { select: { name: true, email: true } },
        answers: true,
      },
      orderBy: { totalAwardedMarks: "desc" },
    });
  }

  const { summary, questionRows } = computeExamAnalytics(
    exam.examQuestions.map((eq) => eq.question),
    exam._count.enrollments,
    attempts
  );

  const pdfDoc = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const ink = rgb(0.06, 0.09, 0.16);
  const muted = rgb(0.35, 0.42, 0.5);
  const cobalt = rgb(0.11, 0.31, 0.85);

  let page = pdfDoc.addPage([595, 842]);
  let pageNumber = 1;
  let y = 780;

  const drawFooter = (targetPage: typeof page, num: number) => {
    targetPage.drawText(
      sanitizePdfText(`Generated ${new Date().toISOString()} - ExamGuard`),
      { x: 42, y: 40, size: 8.5, font: fontRegular, color: muted }
    );
    targetPage.drawText(`Page ${num}`, {
      x: 520,
      y: 40,
      size: 8.5,
      font: fontRegular,
      color: muted,
    });
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < 88) {
      drawFooter(page, pageNumber);
      page = pdfDoc.addPage([595, 842]);
      pageNumber++;
      y = 790;
    }
  };

  page.drawRectangle({ x: 40, y: 745, width: 515, height: 56, color: ink });
  page.drawText("EXAMINATION PERFORMANCE SUMMARY REPORT", {
    x: 56,
    y: 777,
    size: 13,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText(sanitizePdfText(`${exam.code} - ${exam.title}`), {
    x: 56,
    y: 759,
    size: 10,
    font: fontRegular,
    color: rgb(0.85, 0.9, 0.98),
  });

  y = 716;
  const headerLines = [
    `Status: ${exam.status.toUpperCase()} | Duration: ${exam.durationMinutes} min | Results Published: ${exam.resultsPublished ? "Yes" : "No"}`,
    `Enrolled: ${summary.totalEnrolled} | Submitted: ${summary.submittedCount} | Expired: ${summary.expiredCount} | In Progress: ${summary.inProgressCount}`,
    `Mean: ${summary.averageScore} | Median: ${summary.medianScore} | Highest: ${summary.highestScore} | Lowest: ${summary.lowestScore} | Pass Rate: ${summary.passRatePercent}%`,
  ];
  for (const h of headerLines) {
    for (const line of wrapPdfText(h, 88)) {
      page.drawText(line, { x: 42, y, size: 10, font: fontRegular, color: ink });
      y -= 16;
    }
  }

  y -= 10;
  page.drawText("Candidate Scores", {
    x: 42,
    y,
    size: 12,
    font: fontBold,
    color: cobalt,
  });
  y -= 18;

  if (attempts.length === 0) {
    page.drawText("No candidate attempts recorded yet.", {
      x: 42,
      y,
      size: 10,
      font: fontRegular,
      color: muted,
    });
    y -= 20;
  } else {
    for (const att of attempts) {
      ensureSpace(22);
      page.drawText(
        sanitizePdfText(`${att.candidate.name} (${att.candidate.email})`).slice(
          0,
          48
        ),
        { x: 42, y, size: 9.5, font: fontRegular, color: ink }
      );
      page.drawText(sanitizePdfText(att.status), {
        x: 360,
        y,
        size: 9.5,
        font: fontRegular,
        color: muted,
      });
      page.drawText(
        sanitizePdfText(`${att.totalAwardedMarks} / ${att.totalPossibleMarks}`),
        { x: 470, y, size: 9.5, font: fontBold, color: ink }
      );
      y -= 16;
    }
  }

  y -= 14;
  ensureSpace(40);
  page.drawText("Question Analytics", {
    x: 42,
    y,
    size: 12,
    font: fontBold,
    color: cobalt,
  });
  y -= 18;

  for (const q of questionRows) {
    ensureSpace(24);
    page.drawText(sanitizePdfText(`${q.title} (${q.type})`).slice(0, 46), {
      x: 42,
      y,
      size: 9.5,
      font: fontBold,
      color: ink,
    });
    page.drawText(
      sanitizePdfText(
        `Skip: ${q.skipRatePercent}% | Avg: ${q.avgScorePercent}% | ${q.observedDifficulty}`
      ),
      { x: 315, y, size: 9, font: fontRegular, color: muted }
    );
    y -= 16;
  }

  drawFooter(page, pageNumber);

  const pdfBytes = await pdfDoc.save();
  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${sanitizePdfFilename(
        `ExamGuard-${exam.code}-Summary.pdf`
      )}"`,
    },
  });
}
