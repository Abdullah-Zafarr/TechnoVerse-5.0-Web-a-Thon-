import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { canManageExam, requireRole } from "@/lib/auth";
import { sanitizePdfFilename, sanitizePdfText, wrapPdfText } from "@/lib/pdf";
import { prisma } from "@/lib/prisma";
import type { AttemptItemSnapshot } from "@/lib/types";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ attemptId: string }> }
) {
  const { attemptId } = await params;
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
        { error: "Report is unavailable while attempt is in progress" },
        { status: 403 }
      );
    }
    if (!attempt.exam.resultsPublished) {
      return NextResponse.json(
        { error: "Results are not published yet" },
        { status: 403 }
      );
    }
  } else if (!canManageExam(auth.user, attempt.exam.createdById)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const origin = new URL(req.url).origin;
  const verifyCode = attempt.verificationCode ?? "PENDING";
  const verifyUrl = `${origin}/verify/${verifyCode}`;

  const qrPngBuffer = await QRCode.toBuffer(verifyUrl, {
    type: "png",
    width: 140,
    margin: 1,
  });

  const pdfDoc = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const qrImage = await pdfDoc.embedPng(qrPngBuffer);

  const ink = rgb(0.06, 0.09, 0.16);
  const muted = rgb(0.35, 0.42, 0.5);
  const cobalt = rgb(0.11, 0.31, 0.85);

  let page = pdfDoc.addPage([595, 842]);
  let pageNumber = 1;

  const drawFooter = (
    targetPage: typeof page,
    num: number
  ) => {
    targetPage.drawText(
      sanitizePdfText(`Public Verification URL: ${verifyUrl}`),
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

  page.drawRectangle({ x: 40, y: 745, width: 515, height: 60, color: ink });
  page.drawText("EXAMGUARD OFFICIAL RESULT REPORT", {
    x: 56,
    y: 778,
    size: 14,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText(sanitizePdfText(`Verification Code: ${verifyCode}`), {
    x: 56,
    y: 760,
    size: 10,
    font: fontRegular,
    color: rgb(0.85, 0.9, 0.98),
  });

  page.drawImage(qrImage, { x: 445, y: 635, width: 96, height: 96 });
  page.drawText("Scan to verify", {
    x: 462,
    y: 622,
    size: 8.5,
    font: fontRegular,
    color: muted,
  });

  let y = 708;
  const metaLines = [
    `Examination: ${attempt.exam.title}`,
    `Candidate: ${attempt.candidate.name}`,
    `Status: ${attempt.status.toUpperCase()} (${attempt.gradingState.replace("_", " ")})`,
    `Submitted At: ${attempt.submittedAt?.toISOString() ?? "In Progress"}`,
  ];
  for (const line of metaLines) {
    for (const wrapped of wrapPdfText(line, 66)) {
      page.drawText(wrapped, {
        x: 42,
        y,
        size: 10.5,
        font: fontRegular,
        color: ink,
      });
      y -= 17;
    }
  }

  y -= 8;
  page.drawText(
    sanitizePdfText(
      `Total Score: ${attempt.totalAwardedMarks} / ${attempt.totalPossibleMarks}`
    ),
    { x: 42, y, size: 16, font: fontBold, color: cobalt }
  );

  y -= 24;
  page.drawLine({
    start: { x: 42, y },
    end: { x: 553, y },
    thickness: 1,
    color: rgb(0.82, 0.84, 0.86),
  });

  y -= 22;
  page.drawText("Question Breakdown", {
    x: 42,
    y,
    size: 12,
    font: fontBold,
    color: ink,
  });
  y -= 20;

  const ensureSpace = (needed: number) => {
    if (y - needed < 88) {
      drawFooter(page, pageNumber);
      page = pdfDoc.addPage([595, 842]);
      pageNumber++;
      y = 790;
      page.drawText(
        sanitizePdfText(
          `${attempt.exam.code} - Question Breakdown (continued)`
        ),
        { x: 42, y, size: 10, font: fontBold, color: muted }
      );
      y -= 24;
    }
  };

  const items = attempt.itemsSnapshot as unknown as AttemptItemSnapshot[];
  for (const item of items) {
    ensureSpace(44);
    const ans = attempt.answers.find((a) => a.questionId === item.questionId);
    const awarded =
      item.type === "written"
        ? ans?.manualScore ?? "Pending"
        : ans?.autoScore ?? 0;

    const titleLines = wrapPdfText(
      `Q${item.order}. ${item.title} [${item.type}]`,
      66
    );
    page.drawText(titleLines[0] ?? "", {
      x: 42,
      y,
      size: 10,
      font: fontBold,
      color: ink,
    });
    page.drawText(sanitizePdfText(`${awarded} / ${item.marks}`), {
      x: 485,
      y,
      size: 10,
      font: fontBold,
      color: ink,
    });
    y -= 15;
    for (let i = 1; i < titleLines.length; i++) {
      ensureSpace(16);
      page.drawText(titleLines[i], {
        x: 42,
        y,
        size: 10,
        font: fontBold,
        color: ink,
      });
      y -= 14;
    }

    if (ans?.manualFeedback) {
      const fbLines = wrapPdfText(`Note: ${ans.manualFeedback}`, 80);
      for (const line of fbLines) {
        ensureSpace(16);
        page.drawText(line, {
          x: 54,
          y,
          size: 9,
          font: fontRegular,
          color: muted,
        });
        y -= 14;
      }
    }
    y -= 6;
  }

  drawFooter(page, pageNumber);

  const pdfBytes = await pdfDoc.save();
  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${sanitizePdfFilename(
        `ExamGuard-${attempt.exam.code}-${verifyCode}.pdf`
      )}"`,
    },
  });
}
