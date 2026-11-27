import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageExam, hashPassword, requireRole } from "@/lib/auth";
import {
  parseImportRows,
  validateCandidateRows,
  validateQuestionRows,
} from "@/lib/importParser";
import { prisma } from "@/lib/prisma";
import { invalidateCacheTags } from "@/lib/serverCache";
import type { Difficulty, QuestionType } from "@/lib/types";
import { safeParseJson } from "@/lib/validation";

const importBodySchema = z.object({
  kind: z.enum(["questions", "candidates"]),
  format: z.enum(["csv", "json"]).default("csv"),
  content: z
    .string()
    .trim()
    .min(1, "Import kind and file content are required"),
  examId: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().min(1).optional()
  ),
});

class ImportExamConflictError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function POST(req: Request) {
  const auth = await requireRole(["admin", "examiner"]);
  if (auth.error) return auth.error;

  const json = await safeParseJson(req);
  if (!json.ok) return json.error;

  const parsedBody = importBodySchema.safeParse(json.data);
  if (!parsedBody.success) {
    return NextResponse.json(
      {
        error:
          parsedBody.error.issues[0]?.message ??
          "Invalid import request payload",
      },
      { status: 400 }
    );
  }

  const { kind, format, content, examId } = parsedBody.data;

  if (examId) {
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
      return NextResponse.json(
        { error: "Target exam not found" },
        { status: 404 }
      );
    }
    if (!canManageExam(auth.user, exam.createdById)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (
      kind === "questions" &&
      (exam.status === "ongoing" || exam.status === "completed")
    ) {
      return NextResponse.json(
        { error: `Cannot import questions into an ${exam.status} exam` },
        { status: 409 }
      );
    }
  }

  const parsedInput = parseImportRows(format, content, kind);
  if (!parsedInput.ok) {
    return NextResponse.json(
      { error: parsedInput.error, errors: parsedInput.errors },
      { status: parsedInput.status }
    );
  }

  const { rows, badRowIndices, errors } = parsedInput;
  let importedCount = 0;

  if (kind === "questions") {
    const validated = validateQuestionRows(rows, badRowIndices);
    errors.push(...validated.errors);
    const { validQuestions } = validated;

    if (validQuestions.length > 0) {
      try {
        importedCount = await prisma.$transaction(
          async (tx) => {
            let nextPos = 1;
            if (examId) {
              const txExam = await tx.exam.findUnique({
                where: { id: examId },
                select: { status: true },
              });
              if (!txExam) {
                throw new ImportExamConflictError("Target exam not found", 404);
              }
              if (txExam.status === "ongoing" || txExam.status === "completed") {
                throw new ImportExamConflictError(
                  `Cannot import questions into an ${txExam.status} exam`,
                  409
                );
              }
              const agg = await tx.examQuestion.aggregate({
                where: { examId },
                _max: { position: true },
              });
              nextPos = (agg._max.position ?? 0) + 1;
            }

            let count = 0;
            for (const q of validQuestions) {
              const created = await tx.question.create({
                data: {
                  title: q.title,
                  prompt: q.prompt,
                  type: q.type,
                  topic: q.topic,
                  difficulty: q.difficulty,
                  marks: q.marks,
                  partialCredit: q.partialCredit,
                  options: q.options,
                  correctOptionIds: q.correctOptionIds,
                  rubric: q.rubric,
                  createdById: auth.user.id,
                },
              });

              if (examId) {
                await tx.examQuestion.create({
                  data: {
                    examId,
                    questionId: created.id,
                    position: nextPos++,
                  },
                });
              }
              count++;
            }

            if (examId) {
              const linked = await tx.examQuestion.findMany({
                where: { examId },
                include: { question: { select: { marks: true } } },
              });
              const totalMarks = linked.reduce(
                (s, eq) => s + eq.question.marks,
                0
              );
              await tx.exam.update({
                where: { id: examId },
                data: { totalMarks },
              });
            }

            return count;
          },
          { maxWait: 10_000, timeout: 25_000 }
        );
      } catch (err) {
        if (err instanceof ImportExamConflictError) {
          return NextResponse.json(
            { error: err.message },
            { status: err.status }
          );
        }
        throw err;
      }
    }
  } else {
    const validated = validateCandidateRows(rows, badRowIndices);
    errors.push(...validated.errors);
    const defaultPwd = hashPassword("demo1234");

    for (const candidate of validated.validCandidates) {
      const existingUser = await prisma.user.findUnique({
        where: { email: candidate.email },
      });
      if (existingUser && existingUser.role !== "candidate") {
        errors.push(
          `Row ${candidate.rowNum}: email belongs to staff account and cannot be imported as candidate`
        );
        continue;
      }

      const user =
        existingUser ??
        (await prisma.user.create({
          data: {
            name: candidate.name,
            email: candidate.email,
            passwordHash: defaultPwd,
            role: "candidate",
            active: true,
          },
        }));

      if (examId) {
        try {
          await prisma.enrollment.upsert({
            where: {
              examId_candidateId: { examId, candidateId: user.id },
            },
            update: {},
            create: { examId, candidateId: user.id },
          });
        } catch {
          errors.push(
            `Row ${candidate.rowNum}: failed to enroll '${candidate.email}' in target exam`
          );
          continue;
        }
      }
      importedCount++;
    }
  }

  if (importedCount > 0) {
    if (kind === "questions") {
      invalidateCacheTags("questions", "exams", "grading", "monitor");
    } else {
      invalidateCacheTags("users", "exams", "grading", "monitor");
    }
    await prisma.auditLog.create({
      data: {
        actorId: auth.user.id,
        actorEmail: auth.user.email,
        action: "BULK_IMPORT",
        target: `${kind} (${format}): ${importedCount} imported${
          examId ? `, exam=${examId}` : ""
        }`,
      },
    });
  }

  return NextResponse.json({ importedCount, errors });
}
