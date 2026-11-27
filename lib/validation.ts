import { NextResponse } from "next/server";
import { z } from "zod";
import type { QuestionOption, QuestionType } from "./types";

export async function safeParseJson<T = unknown>(
  req: Request
): Promise<{ ok: true; data: T } | { ok: false; error: NextResponse }> {
  try {
    const data = (await req.json()) as T;
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      error: NextResponse.json(
        { error: "Invalid JSON request body" },
        { status: 400 }
      ),
    };
  }
}

export const loginSchema = z.object({
  email: z.string().trim().email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
});

export const createUserSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().trim().email("Valid email is required"),
  role: z.enum(["admin", "examiner", "candidate"]),
  password: z.string().min(6, "Password must be at least 6 characters").max(100),
});

export const updateUserSchema = z.object({
  userId: z.string().min(1),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100).optional(),
  role: z.enum(["admin", "examiner", "candidate"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6, "Password must be at least 6 characters").max(100).optional(),
});

export const questionOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1, "Option text cannot be empty"),
});

export const createQuestionSchema = z.object({
  title: z.string().trim().min(2, "Title is required").max(160),
  prompt: z.string().trim().min(5, "Prompt is required").max(4000),
  type: z.enum(["single_mcq", "multi_select", "written"]),
  topic: z.string().trim().min(1).max(80).default("General"),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  marks: z.number().positive("Marks must be positive").max(100),
  partialCredit: z.boolean().default(false),
  options: z.array(questionOptionSchema).default([]),
  correctOptionIds: z.array(z.string()).default([]),
  rubric: z.string().max(2000).optional(),
});

export const updateQuestionSchema = createQuestionSchema.partial().extend({
  questionId: z.string().min(1),
  type: z.enum(["single_mcq", "multi_select", "written"]).optional(),
});

export function validateQuestionLogic(
  type: QuestionType,
  options: QuestionOption[],
  correctOptionIds: string[]
): { ok: true } | { ok: false; error: string } {
  if (type === "written") {
    return { ok: true };
  }
  if (options.length < 2) {
    return { ok: false, error: "Objective questions require at least 2 options" };
  }
  const optionIds = new Set(options.map((o) => o.id));
  if (optionIds.size !== options.length) {
    return { ok: false, error: "Option IDs must be unique" };
  }
  if (correctOptionIds.length === 0) {
    return { ok: false, error: "Select at least one correct option" };
  }
  const uniqueCorrect = new Set(correctOptionIds);
  for (const cid of uniqueCorrect) {
    if (!optionIds.has(cid)) {
      return { ok: false, error: `Correct option '${cid}' does not exist in options` };
    }
  }
  if (type === "single_mcq" && (correctOptionIds.length !== 1 || uniqueCorrect.size !== 1)) {
    return {
      ok: false,
      error: "Single-choice MCQ must have exactly 1 correct option",
    };
  }
  return { ok: true };
}

export const createExamSchema = z.object({
  code: z.string().trim().min(2, "Exam code is required").max(32),
  title: z.string().trim().min(3, "Title is required").max(180),
  instructions: z.string().trim().max(4000).default(""),
  durationMinutes: z.number().int().min(1).max(360),
  windowStart: z.string().datetime().optional(),
  windowEnd: z.string().datetime().optional(),
  questionIds: z.array(z.string().min(1)).min(1, "Select at least 1 question"),
  questionsPerPaper: z.number().int().min(1).optional(),
  randomizeQuestions: z.boolean().default(true),
  randomizeOptions: z.boolean().default(true),
  enrolledCandidateIds: z.array(z.string().min(1)).default([]),
});

export const updateExamSchema = z.object({
  examId: z.string().min(1),
  code: z.string().trim().min(2).max(32).optional(),
  title: z.string().trim().min(3).max(180).optional(),
  instructions: z.string().trim().max(4000).optional(),
  status: z.enum(["draft", "published", "ongoing", "completed"]).optional(),
  durationMinutes: z.number().int().min(1).max(360).optional(),
  windowStart: z.string().datetime().optional(),
  windowEnd: z.string().datetime().optional(),
  questionsPerPaper: z.number().int().min(1).optional(),
  randomizeQuestions: z.boolean().optional(),
  randomizeOptions: z.boolean().optional(),
  resultsPublished: z.boolean().optional(),
  questionIds: z.array(z.string().min(1)).min(1).optional(),
  enrolledCandidateIds: z.array(z.string().min(1)).optional(),
});

export const answerUpdateSchema = z.object({
  updates: z
    .array(
      z.object({
        questionId: z.string().min(1),
        selectedOptionIds: z.array(z.string()).optional(),
        writtenText: z.string().max(20000).optional(),
        markedForReview: z.boolean().optional(),
        revision: z.number().int().min(1).default(1),
      })
    )
    .default([]),
  incident: z
    .object({
      type: z.enum([
        "tab_blur",
        "offline_gap",
        "reconnected",
        "sync_conflict",
        "auto_expired",
      ]),
      detail: z.string().trim().min(1).max(240),
    })
    .optional(),
});

export const manualGradeSchema = z.object({
  attemptId: z.string().min(1),
  questionId: z.string().min(1),
  score: z.number().min(0),
  feedback: z.string().max(1000).optional(),
});

export const graceGrantSchema = z.object({
  graceMinutes: z
    .number()
    .int("Grace duration must be a whole number of minutes")
    .min(1, "Grant at least 1 minute")
    .max(30, "Grace grant cannot exceed 30 minutes per approval"),
  reason: z
    .string()
    .trim()
    .min(5, "Verification reason must be at least 5 characters")
    .max(240, "Verification reason cannot exceed 240 characters"),
});
