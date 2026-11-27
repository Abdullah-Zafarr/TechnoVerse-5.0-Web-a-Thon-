import type {
  AttemptStatus,
  Difficulty,
  ExamStatus,
  GradingState,
  IncidentType,
  QuestionType,
  Role,
} from "@prisma/client";

export type {
  AttemptStatus,
  Difficulty,
  ExamStatus,
  GradingState,
  IncidentType,
  QuestionType,
  Role,
};

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

export type QuestionOption = {
  id: string;
  text: string;
};

export interface AttemptItemSnapshot {
  questionId: string;
  order: number;
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
}

export interface QuestionAnalyticsRow {
  questionId: string;
  title: string;
  type: QuestionType;
  configuredDifficulty: Difficulty;
  maxMarks: number;
  attemptCount: number;
  skippedCount: number;
  skipRatePercent: number;
  avgScorePercent: number;
  observedDifficulty: "Easy" | "Moderate" | "Hard" | "No Data";
  mostCommonWrongOption: string | null;
}

export interface ScoreBucket {
  label: string;
  count: number;
}

export interface ExamSummaryMetrics {
  totalEnrolled: number;
  submittedCount: number;
  expiredCount: number;
  inProgressCount: number;
  gradedCount: number;
  needsManualCount: number;
  averageScore: number;
  medianScore: number;
  highestScore: number;
  lowestScore: number;
  maxPossibleMarks: number;
  passRatePercent: number;
  scoreBuckets: ScoreBucket[];
}
