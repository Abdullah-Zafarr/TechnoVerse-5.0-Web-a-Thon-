import test from "node:test";
import assert from "node:assert/strict";
import type { Question } from "@prisma/client";
import {
  canManageExam,
  hashPassword,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from "../lib/auth";
import {
  buildAttemptSnapshots,
  computeExamAnalytics,
  computeStratifiedQuotas,
  gradeObjectiveItem,
} from "../lib/grading";
import { sanitizePdfFilename, sanitizePdfText, wrapPdfText } from "../lib/pdf";
import type { AttemptItemSnapshot, SafeUser } from "../lib/types";
import {
  announcementSchema,
  answerUpdateSchema,
  createExamSchema,
  graceGrantSchema,
  manualGradeSchema,
  validateQuestionLogic,
} from "../lib/validation";

function makeQuestion(overrides: Partial<Question> & { id: string }): Question {
  return {
    title: `Q ${overrides.id}`,
    prompt: "Sample prompt",
    type: "single_mcq",
    topic: "General",
    difficulty: "medium",
    marks: 2,
    partialCredit: false,
    options: [
      { id: "o1", text: "Option 1" },
      { id: "o2", text: "Option 2" },
      { id: "o3", text: "Option 3" },
    ],
    correctOptionIds: ["o1"],
    rubric: null,
    createdById: "usr-examiner",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

test("auth: scrypt password hashing and verification", () => {
  const hash = hashPassword("demo1234");
  assert.ok(hash.startsWith("scrypt:"));
  assert.equal(verifyPassword("demo1234", hash), true);
  assert.equal(verifyPassword("wrongpass", hash), false);
  assert.equal(verifyPassword("demo1234", "invalid-format"), false);
});

test("auth: HMAC session token signing and tamper detection", () => {
  const token = signSessionToken("usr-123");
  const payload = verifySessionToken(token);
  assert.ok(payload);
  assert.equal(payload.uid, "usr-123");

  const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
  assert.equal(verifySessionToken(tampered), null);
  assert.equal(verifySessionToken("malformed"), null);
});

test("auth: canManageExam enforces admin or owner", () => {
  const admin: SafeUser = {
    id: "u1",
    name: "Admin",
    email: "a@test.edu",
    role: "admin",
    active: true,
    createdAt: new Date().toISOString(),
  };
  const examiner: SafeUser = { ...admin, id: "u2", role: "examiner" };
  assert.equal(canManageExam(admin, "other"), true);
  assert.equal(canManageExam(examiner, "u2"), true);
  assert.equal(canManageExam(examiner, "other"), false);
});

test("validation: validateQuestionLogic covers single_mcq, multi_select, and written", () => {
  const opts = [
    { id: "o1", text: "A" },
    { id: "o2", text: "B" },
  ];
  assert.deepEqual(validateQuestionLogic("written", [], []), { ok: true });
  assert.equal(validateQuestionLogic("single_mcq", [opts[0]], ["o1"]).ok, false);
  assert.equal(
    validateQuestionLogic("single_mcq", opts, ["o1", "o2"]).ok,
    false
  );
  assert.equal(validateQuestionLogic("single_mcq", opts, ["o3"]).ok, false);
  assert.equal(validateQuestionLogic("single_mcq", opts, ["o1"]).ok, true);
  assert.equal(
    validateQuestionLogic("multi_select", opts, ["o1", "o2"]).ok,
    true
  );
});

test("validation: schemas reject invalid inputs", () => {
  assert.equal(
    createExamSchema.safeParse({
      code: "C",
      title: "Valid Title",
      durationMinutes: 30,
      questionIds: ["q1"],
    }).success,
    false
  );
  assert.equal(
    manualGradeSchema.safeParse({
      attemptId: "a1",
      questionId: "q1",
      score: -1,
    }).success,
    false
  );
  assert.equal(
    graceGrantSchema.safeParse({
      graceMinutes: 45,
      reason: "Power outage",
    }).success,
    false
  );
  assert.equal(
    answerUpdateSchema.safeParse({
      updates: [{ questionId: "q1", revision: 2, markedForReview: true }],
    }).success,
    true
  );
});

test("grading: gradeObjectiveItem handles single_mcq, multi_select exact & partial, written", () => {
  const base: Omit<AttemptItemSnapshot, "type" | "partialCredit" | "correctOptionIds"> = {
    questionId: "q1",
    order: 1,
    title: "Test",
    prompt: "Prompt",
    topic: "Sec",
    difficulty: "medium",
    marks: 4,
    options: [
      { id: "o1", text: "1" },
      { id: "o2", text: "2" },
      { id: "o3", text: "3" },
      { id: "o4", text: "4" },
    ],
  };

  assert.equal(
    gradeObjectiveItem(
      { ...base, type: "written", partialCredit: false, correctOptionIds: [] },
      ["o1"]
    ),
    null
  );
  assert.equal(
    gradeObjectiveItem(
      { ...base, type: "single_mcq", partialCredit: false, correctOptionIds: ["o1"] },
      ["o1"]
    ),
    4
  );
  assert.equal(
    gradeObjectiveItem(
      { ...base, type: "single_mcq", partialCredit: false, correctOptionIds: ["o1"] },
      ["o2"]
    ),
    0
  );
  assert.equal(
    gradeObjectiveItem(
      {
        ...base,
        type: "multi_select",
        partialCredit: false,
        correctOptionIds: ["o1", "o2"],
      },
      ["o1"]
    ),
    0
  );
  assert.equal(
    gradeObjectiveItem(
      {
        ...base,
        type: "multi_select",
        partialCredit: true,
        correctOptionIds: ["o1", "o2"],
      },
      ["o1"]
    ),
    2
  );
  // 1 hit (0.5) - 1 miss (0.25) = 0.25 * 4 = 1
  assert.equal(
    gradeObjectiveItem(
      {
        ...base,
        type: "multi_select",
        partialCredit: true,
        correctOptionIds: ["o1", "o2"],
      },
      ["o1", "o3"]
    ),
    1
  );
});

test("grading: buildAttemptSnapshots preserves stratified difficulty balance", () => {
  const pool: Question[] = [
    makeQuestion({ id: "e1", difficulty: "easy" }),
    makeQuestion({ id: "e2", difficulty: "easy" }),
    makeQuestion({ id: "e3", difficulty: "easy" }),
    makeQuestion({ id: "m1", difficulty: "medium" }),
    makeQuestion({ id: "m2", difficulty: "medium" }),
    makeQuestion({ id: "m3", difficulty: "medium" }),
    makeQuestion({ id: "h1", difficulty: "hard" }),
    makeQuestion({ id: "h2", difficulty: "hard" }),
    makeQuestion({ id: "h3", difficulty: "hard" }),
  ];

  const paper = buildAttemptSnapshots(pool, {
    questionsPerPaper: 6,
    randomizeQuestions: true,
    randomizeOptions: true,
  });

  assert.equal(paper.length, 6);
  const counts = paper.reduce<Record<string, number>>((acc, item) => {
    acc[item.difficulty] = (acc[item.difficulty] ?? 0) + 1;
    return acc;
  }, {});
  assert.equal(counts.easy, 2);
  assert.equal(counts.medium, 2);
  assert.equal(counts.hard, 2);

  const ordered = buildAttemptSnapshots(pool, {
    questionsPerPaper: 3,
    randomizeQuestions: false,
    randomizeOptions: false,
  });
  assert.deepEqual(
    ordered.map((i) => i.questionId),
    ["e1", "e2", "e3"]
  );
});

test("grading: computeExamAnalytics calculates summary and question difficulty", () => {
  const q1 = makeQuestion({ id: "q1", marks: 10 });
  const snap: AttemptItemSnapshot[] = [
    {
      questionId: "q1",
      order: 1,
      title: "Q q1",
      prompt: "Prompt",
      type: "single_mcq",
      topic: "General",
      difficulty: "medium",
      marks: 10,
      partialCredit: false,
      options: [
        { id: "o1", text: "Right" },
        { id: "o2", text: "Wrong" },
      ],
      correctOptionIds: ["o1"],
    },
  ];

  const { summary, questionRows } = computeExamAnalytics([q1], 3, [
    {
      status: "submitted",
      gradingState: "graded",
      totalPossibleMarks: 10,
      totalAwardedMarks: 10,
      itemsSnapshot: snap,
      answers: [
        {
          id: "a1",
          attemptId: "att1",
          questionId: "q1",
          selectedOptionIds: ["o1"],
          writtenText: "",
          markedForReview: false,
          revision: 1,
          autoScore: 10,
          manualScore: null,
          manualFeedback: null,
          updatedAt: new Date(),
        },
      ],
    },
    {
      status: "expired",
      gradingState: "graded",
      totalPossibleMarks: 10,
      totalAwardedMarks: 0,
      itemsSnapshot: snap,
      answers: [
        {
          id: "a2",
          attemptId: "att2",
          questionId: "q1",
          selectedOptionIds: ["o2"],
          writtenText: "",
          markedForReview: false,
          revision: 1,
          autoScore: 0,
          manualScore: null,
          manualFeedback: null,
          updatedAt: new Date(),
        },
      ],
    },
  ]);

  assert.equal(summary.totalEnrolled, 3);
  assert.equal(summary.submittedCount, 1);
  assert.equal(summary.expiredCount, 1);
  assert.equal(summary.averageScore, 5);
  assert.equal(summary.medianScore, 5);
  assert.equal(summary.passRatePercent, 50);
  assert.equal(questionRows[0].avgScorePercent, 50);
  assert.equal(questionRows[0].observedDifficulty, "Moderate");
  assert.equal(questionRows[0].mostCommonWrongOption, "Wrong");
});

test("pdf: sanitizes WinAnsi characters, wraps lines, and cleans filenames", () => {
  assert.equal(sanitizePdfText("Hello \u2014 \u201Cworld\u201D\nnext"), "Hello - \"world\" next");
  assert.deepEqual(wrapPdfText("one two three four", 9), ["one two", "three", "four"]);
  assert.equal(sanitizePdfFilename("Report: CS/301?.pdf"), "Report-CS-301-.pdf");
});

test("grading & validation: stratified quotas and announcement bounds", () => {
  const pool = [
    { difficulty: "easy" as const },
    { difficulty: "easy" as const },
    { difficulty: "easy" as const },
    { difficulty: "medium" as const },
    { difficulty: "medium" as const },
    { difficulty: "medium" as const },
    { difficulty: "hard" as const },
    { difficulty: "hard" as const },
    { difficulty: "hard" as const },
  ];
  assert.deepEqual(computeStratifiedQuotas(pool, 6), {
    easy: 2,
    medium: 2,
    hard: 2,
  });
  assert.equal(
    announcementSchema.safeParse({ examId: "ex-1", message: "5 min left" })
      .success,
    true
  );
  assert.equal(
    announcementSchema.safeParse({
      examId: "ex-1",
      message: "x".repeat(501),
    }).success,
    false
  );
});
