import Papa from "papaparse";
import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageExam, hashPassword, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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

interface ValidatedQuestionRow {
  title: string;
  prompt: string;
  type: QuestionType;
  topic: string;
  difficulty: Difficulty;
  marks: number;
  partialCredit: boolean;
  options: Array<{ id: string; text: string }>;
  correctOptionIds: string[];
  rubric: string | null;
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

  let rows: Array<Record<string, string> | null> = [];
  const errors: string[] = [];

  if (format === "json") {
    try {
      const parsed = JSON.parse(content) as unknown;
      if (!Array.isArray(parsed)) {
        return NextResponse.json(
          { error: "JSON payload must be an array of records" },
          { status: 400 }
        );
      }
      rows = parsed.map((item) => {
        if (typeof item !== "object" || item === null || Array.isArray(item)) {
          return null;
        }
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(item)) {
          out[k.toLowerCase()] = Array.isArray(v)
            ? v.join("|")
            : String(v ?? "");
        }
        return out;
      });
    } catch {
      return NextResponse.json({ error: "Invalid JSON syntax" }, { status: 400 });
    }
  } else {
    const csv = Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    });
    if (csv.errors.length > 0) {
      csv.errors.forEach((e) => {
        errors.push(`CSV line ${(e.row ?? 0) + 1}: ${e.message}`);
      });
    }
    rows = csv.data;
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No data rows found in import input", errors },
      { status: 400 }
    );
  }

  let importedCount = 0;

  if (kind === "questions") {
    const validQuestions: ValidatedQuestionRow[] = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const rowNum = index + 1;
      if (!row) {
        errors.push(`Row ${rowNum}: record must be a JSON object`);
        continue;
      }

      const title = (row.title ?? "").trim();
      const prompt = (row.prompt ?? "").trim();
      const type = (row.type ?? "single_mcq").trim() as QuestionType;
      const topic = (row.topic ?? "Imported").trim() || "Imported";
      const difficulty = (row.difficulty ?? "medium").trim() as Difficulty;
      const marks = Number(row.marks ?? 2);
      const rubric = (row.rubric ?? "").trim();

      if (!title || !prompt) {
        errors.push(`Row ${rowNum}: missing title or prompt`);
        continue;
      }
      if (!["single_mcq", "multi_select", "written"].includes(type)) {
        errors.push(`Row ${rowNum}: invalid type '${type}'`);
        continue;
      }
      if (!["easy", "medium", "hard"].includes(difficulty)) {
        errors.push(`Row ${rowNum}: invalid difficulty '${difficulty}'`);
        continue;
      }
      if (!Number.isFinite(marks) || marks <= 0 || marks > 100) {
        errors.push(`Row ${rowNum}: marks must be between 1 and 100`);
        continue;
      }

      const rawOpts = (row.options ?? "")
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
      const rawCorrect = (row.correct ?? "")
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);

      if (
        type !== "written" &&
        (rawOpts.length < 2 || rawCorrect.length === 0)
      ) {
        errors.push(
          `Row ${rowNum}: objective questions need pipe-separated options and correct 1-based indices`
        );
        continue;
      }

      if (type === "single_mcq" && rawCorrect.length !== 1) {
        errors.push(
          `Row ${rowNum}: single_mcq requires exactly 1 valid correct index`
        );
        continue;
      }

      const options = rawOpts.map((text, idx) => ({ id: `o${idx + 1}`, text }));
      const mappedCorrect: string[] = [];
      let hasInvalidIndex = false;

      if (type !== "written") {
        for (const idxStr of rawCorrect) {
          const parsedIdx = Number(idxStr);
          if (
            !Number.isInteger(parsedIdx) ||
            parsedIdx < 1 ||
            parsedIdx > options.length
          ) {
            hasInvalidIndex = true;
            break;
          }
          mappedCorrect.push(options[parsedIdx - 1].id);
        }
      }

      if (hasInvalidIndex) {
        errors.push(`Row ${rowNum}: correct option index out of range`);
        continue;
      }

      const correctOptionIds = Array.from(new Set(mappedCorrect));
      if (
        type !== "written" &&
        correctOptionIds.length !== rawCorrect.length
      ) {
        errors.push(`Row ${rowNum}: duplicate correct option index`);
        continue;
      }

      validQuestions.push({
        title,
        prompt,
        type,
        topic,
        difficulty,
        marks,
        partialCredit: type === "multi_select",
        options: type === "written" ? [] : options,
        correctOptionIds: type === "written" ? [] : correctOptionIds,
        rubric: type === "written" ? rubric || null : null,
      });
    }

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
    const defaultPwd = hashPassword("demo1234");
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const rowNum = index + 1;
      if (!row) {
        errors.push(`Row ${rowNum}: record must be a JSON object`);
        continue;
      }

      const name = (row.name ?? "").trim();
      const email = (row.email ?? "").trim().toLowerCase();

      if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push(`Row ${rowNum}: valid name and email required`);
        continue;
      }

      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser && existingUser.role !== "candidate") {
        errors.push(
          `Row ${rowNum}: email belongs to staff account and cannot be imported as candidate`
        );
        continue;
      }

      const user =
        existingUser ??
        (await prisma.user.create({
          data: {
            name,
            email,
            passwordHash: defaultPwd,
            role: "candidate",
            active: true,
          },
        }));

      if (examId) {
        await prisma.enrollment
          .upsert({
            where: {
              examId_candidateId: { examId, candidateId: user.id },
            },
            update: {},
            create: { examId, candidateId: user.id },
          })
          .catch(() => {});
      }
      importedCount++;
    }
  }

  if (importedCount > 0) {
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
