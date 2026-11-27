import { computeStratifiedQuotas } from "@/lib/grading";
import { prisma } from "@/lib/prisma";
import { getOrLoadCached } from "@/lib/serverCache";
import { sanitizeUser } from "@/lib/auth";
import type {
  Difficulty,
  ExamStatus,
  QuestionOption,
  QuestionType,
  SafeUser,
} from "@/lib/types";

export interface DifficultyCounts {
  easy: number;
  medium: number;
  hard: number;
}

export interface ExaminerExam {
  id: string;
  code: string;
  title: string;
  instructions: string;
  status: ExamStatus;
  durationMinutes: number;
  totalMarks: number;
  windowStart: string;
  windowEnd: string;
  questionsPerPaper: number;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  stratifiedBalanced?: boolean;
  poolDifficultyCounts?: DifficultyCounts;
  stratifiedQuotas?: DifficultyCounts;
  resultsPublished: boolean;
  questionIds: string[];
  enrolledCandidateIds: string[];
  attemptCount?: number;
}

export interface ExaminerQuestion {
  id: string;
  title: string;
  prompt: string;
  type: QuestionType;
  topic: string;
  difficulty: Difficulty;
  marks: number;
  partialCredit: boolean;
  options: QuestionOption[];
  correctOptionIds: string[];
  rubric?: string | null;
  createdById?: string;
}

export interface ExaminerWorkspaceData {
  exams: ExaminerExam[];
  questions: ExaminerQuestion[];
  candidates: SafeUser[];
}

const SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

export async function loadExaminerWorkspaceData(
  user: SafeUser
): Promise<ExaminerWorkspaceData> {
  return getOrLoadCached(
    `examiner:workspace:${user.role}:${user.id}`,
    ["exams", "questions", "users"],
    20_000,
    async () => {
      const [rawExams, rawQuestions, rawCandidates] = await Promise.all([
        prisma.exam.findMany({
          relationLoadStrategy: "join",
          where:
            user.role === "admin" ? undefined : { createdById: user.id },
          include: {
            examQuestions: {
              orderBy: { position: "asc" },
              select: {
                questionId: true,
                question: { select: { difficulty: true } },
              },
            },
            enrollments: { select: { candidateId: true } },
            _count: { select: { attempts: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.question.findMany({
          select: {
            id: true,
            title: true,
            prompt: true,
            type: true,
            topic: true,
            difficulty: true,
            marks: true,
            partialCredit: true,
            options: true,
            correctOptionIds: true,
            rubric: true,
            createdById: true,
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.user.findMany({
          where: { role: "candidate" },
          select: SAFE_USER_SELECT,
          orderBy: { createdAt: "desc" },
        }),
      ]);

      const exams: ExaminerExam[] = rawExams.map((e) => {
        const paperCount = e.questionsPerPaper ?? e.examQuestions.length;
        const poolQuestions = e.examQuestions.map((eq) => eq.question);
        const poolDifficultyCounts = computeStratifiedQuotas(
          poolQuestions,
          poolQuestions.length
        );
        const stratifiedQuotas = computeStratifiedQuotas(
          poolQuestions,
          paperCount
        );
        return {
          id: e.id,
          code: e.code,
          title: e.title,
          instructions: e.instructions,
          status: e.status,
          durationMinutes: e.durationMinutes,
          totalMarks: e.totalMarks,
          windowStart: e.windowStart.toISOString(),
          windowEnd: e.windowEnd.toISOString(),
          questionsPerPaper: paperCount,
          randomizeQuestions: e.randomizeQuestions,
          randomizeOptions: e.randomizeOptions,
          stratifiedBalanced:
            e.randomizeQuestions && paperCount < e.examQuestions.length,
          poolDifficultyCounts,
          stratifiedQuotas,
          resultsPublished: e.resultsPublished,
          questionIds: e.examQuestions.map((eq) => eq.questionId),
          enrolledCandidateIds: e.enrollments.map((en) => en.candidateId),
          attemptCount: e._count.attempts,
        };
      });

      const questions: ExaminerQuestion[] = rawQuestions.map((q) => ({
        id: q.id,
        title: q.title,
        prompt: q.prompt,
        type: q.type,
        topic: q.topic,
        difficulty: q.difficulty,
        marks: q.marks,
        partialCredit: q.partialCredit,
        options: Array.isArray(q.options)
          ? (q.options as unknown as QuestionOption[])
          : [],
        correctOptionIds: Array.isArray(q.correctOptionIds)
          ? (q.correctOptionIds as unknown as string[])
          : [],
        rubric: q.rubric,
        createdById: q.createdById,
      }));

      const candidates: SafeUser[] = rawCandidates.map(sanitizeUser);

      return { exams, questions, candidates };
    }
  );
}
