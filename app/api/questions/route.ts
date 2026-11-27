import { NextResponse } from "next/server";
import { canManageExam, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { QuestionOption } from "@/lib/types";
import {
  createQuestionSchema,
  safeParseJson,
  updateQuestionSchema,
  validateQuestionLogic,
} from "@/lib/validation";

export async function GET() {
  const auth = await requireRole(["admin", "examiner"]);
  if (auth.error) return auth.error;

  const questions = await prisma.question.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ questions });
}

export async function POST(req: Request) {
  const auth = await requireRole(["admin", "examiner"]);
  if (auth.error) return auth.error;

  const json = await safeParseJson(req);
  if (!json.ok) return json.error;
  const parsed = createQuestionSchema.safeParse(json.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid question payload" },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const check = validateQuestionLogic(d.type, d.options, d.correctOptionIds);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const created = await prisma.question.create({
    data: {
      title: d.title,
      prompt: d.prompt,
      type: d.type,
      topic: d.topic,
      difficulty: d.difficulty,
      marks: d.marks,
      partialCredit: d.type === "multi_select" ? d.partialCredit : false,
      options: d.type === "written" ? [] : d.options,
      correctOptionIds: d.type === "written" ? [] : d.correctOptionIds,
      rubric: d.rubric?.trim() || null,
      createdById: auth.user.id,
    },
  });

  return NextResponse.json({ question: created }, { status: 201 });
}

export async function PATCH(req: Request) {
  const auth = await requireRole(["admin", "examiner"]);
  if (auth.error) return auth.error;

  const json = await safeParseJson(req);
  if (!json.ok) return json.error;
  const parsed = updateQuestionSchema.safeParse(json.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid question update" },
      { status: 400 }
    );
  }

  const existing = await prisma.question.findUnique({
    where: { id: parsed.data.questionId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }
  if (!canManageExam(auth.user, existing.createdById)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { questionId, ...rest } = parsed.data;
  const effectiveType = rest.type ?? existing.type;
  const effectiveOptions =
    rest.options ??
    (Array.isArray(existing.options)
      ? (existing.options as unknown as QuestionOption[])
      : []);
  const effectiveCorrect =
    rest.correctOptionIds ??
    (Array.isArray(existing.correctOptionIds)
      ? (existing.correctOptionIds as unknown as string[])
      : []);

  const check = validateQuestionLogic(
    effectiveType,
    effectiveOptions,
    effectiveCorrect
  );
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const updated = await prisma.question.update({
    where: { id: questionId },
    data: {
      ...(rest.title !== undefined ? { title: rest.title } : {}),
      ...(rest.prompt !== undefined ? { prompt: rest.prompt } : {}),
      ...(rest.type !== undefined ? { type: rest.type } : {}),
      ...(rest.topic !== undefined ? { topic: rest.topic } : {}),
      ...(rest.difficulty !== undefined ? { difficulty: rest.difficulty } : {}),
      ...(rest.marks !== undefined ? { marks: rest.marks } : {}),
      partialCredit:
        effectiveType === "multi_select"
          ? (rest.partialCredit ?? existing.partialCredit)
          : false,
      options:
        effectiveType === "written"
          ? []
          : effectiveOptions.map((o) => ({ id: o.id, text: o.text })),
      correctOptionIds: effectiveType === "written" ? [] : effectiveCorrect,
      ...(rest.rubric !== undefined
        ? { rubric: rest.rubric?.trim() || null }
        : {}),
    },
  });

  return NextResponse.json({ question: updated });
}

export async function DELETE(req: Request) {
  const auth = await requireRole(["admin", "examiner"]);
  if (auth.error) return auth.error;

  const urlId = new URL(req.url).searchParams.get("id");
  let questionId = urlId;
  if (!questionId) {
    try {
      const body = (await req.json()) as { questionId?: string };
      questionId = body.questionId ?? null;
    } catch {
      questionId = null;
    }
  }
  if (!questionId) {
    return NextResponse.json(
      { error: "questionId is required" },
      { status: 400 }
    );
  }

  const existing = await prisma.question.findUnique({
    where: { id: questionId },
  });
  if (!existing) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }
  if (!canManageExam(auth.user, existing.createdById)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.question.delete({ where: { id: questionId } });
  return NextResponse.json({ ok: true, deletedId: questionId });
}
