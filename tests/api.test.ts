import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
const prisma = new PrismaClient();
const TEST_PORT = 3099;
const BASE_URL = process.env.TEST_BASE_URL || `http://127.0.0.1:${TEST_PORT}`;

let serverProc: ChildProcess | null = null;
const createdExamIds: string[] = [];
const createdQuestionIds: string[] = [];
const createdUserEmails: string[] = [];

async function waitForServer(url: string, timeoutMs = 45_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Timed out waiting for server at ${url}`);
}

async function loginAs(email: string, password = "demo1234"): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200, `Login failed for ${email}`);
  const setCookie = res.headers.get("set-cookie");
  assert.ok(setCookie, "Expected session cookie on login");
  return setCookie.split(";")[0];
}

before(async () => {
  if (!process.env.TEST_BASE_URL) {
    const nextCli = require.resolve("next/dist/bin/next");
    serverProc = spawn(
      process.execPath,
      [nextCli, "start", "-p", String(TEST_PORT), "-H", "127.0.0.1"],
      { stdio: "ignore" }
    );
    await waitForServer(BASE_URL);
  }
});

after(async () => {
  for (const examId of createdExamIds) {
    await prisma.exam.deleteMany({ where: { id: examId } }).catch(() => {});
  }
  for (const qId of createdQuestionIds) {
    await prisma.question.deleteMany({ where: { id: qId } }).catch(() => {});
  }
  if (createdUserEmails.length > 0) {
    await prisma.user
      .deleteMany({ where: { email: { in: createdUserEmails } } })
      .catch(() => {});
  }
  await prisma.$disconnect();
  if (serverProc && serverProc.pid) {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(serverProc.pid), "/t", "/f"], {
        stdio: "ignore",
      });
    } else if (!serverProc.killed) {
      serverProc.kill("SIGTERM");
    }
  }
});

test("API: health check, authentication, and RBAC enforcement", async () => {
  const health = await fetch(`${BASE_URL}/api/health`);
  assert.equal(health.status, 200);
  const hJson = (await health.json()) as { ok: boolean; database: string };
  assert.equal(hJson.ok, true);
  assert.equal(hJson.database, "connected");

  // Unauthenticated access blocked
  const unauthAdmin = await fetch(`${BASE_URL}/api/admin/users`);
  assert.equal(unauthAdmin.status, 401);

  const candCookie = await loginAs("candidate1@examguard.edu");
  const candToAdmin = await fetch(`${BASE_URL}/api/admin/users`, {
    headers: { cookie: candCookie },
  });
  assert.equal(candToAdmin.status, 403);

  const candToQuestions = await fetch(`${BASE_URL}/api/questions`, {
    headers: { cookie: candCookie },
  });
  assert.equal(candToQuestions.status, 403);
});

test("API: admin user creation, update, and audit log", async () => {
  const adminCookie = await loginAs("admin@examguard.edu");
  const email = `e2e.user.${Date.now()}@examguard.edu`;
  createdUserEmails.push(email);

  const createRes = await fetch(`${BASE_URL}/api/admin/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: adminCookie },
    body: JSON.stringify({
      name: "E2E Test User",
      email,
      role: "candidate",
      password: "password123",
    }),
  });
  assert.equal(createRes.status, 201);
  const { user } = (await createRes.json()) as { user: { id: string } };

  const patchRes = await fetch(`${BASE_URL}/api/admin/users`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: adminCookie },
    body: JSON.stringify({ userId: user.id, active: false }),
  });
  assert.equal(patchRes.status, 200);

  // Deactivated user cannot log in
  const blockedLogin = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123" }),
  });
  assert.equal(blockedLogin.status, 403);
});

test("API: full exam lifecycle, sandbox, bulk import, sync conflict, grace, grading, PDF, and verify", async () => {
  const examinerCookie = await loginAs("examiner@examguard.edu");
  const candCookie = await loginAs("candidate1@examguard.edu");
  const cand3Cookie = await loginAs("candidate3@examguard.edu");

  // 1. Create MCQ + Written question
  const q1Res = await fetch(`${BASE_URL}/api/questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: examinerCookie },
    body: JSON.stringify({
      title: "E2E HTTP Status",
      prompt: "Which status code indicates a conflict?",
      type: "single_mcq",
      topic: "HTTP",
      difficulty: "easy",
      marks: 3,
      options: [
        { id: "o1", text: "409" },
        { id: "o2", text: "200" },
      ],
      correctOptionIds: ["o1"],
    }),
  });
  assert.equal(q1Res.status, 201);
  const q1 = ((await q1Res.json()) as { question: { id: string } }).question;
  createdQuestionIds.push(q1.id);

  const q2Res = await fetch(`${BASE_URL}/api/questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: examinerCookie },
    body: JSON.stringify({
      title: "E2E Written Explanation",
      prompt: "Describe idempotency in one sentence.",
      type: "written",
      topic: "Architecture",
      difficulty: "medium",
      marks: 5,
      rubric: "Mentions repeated requests yield same state.",
    }),
  });
  assert.equal(q2Res.status, 201);
  const q2 = ((await q2Res.json()) as { question: { id: string } }).question;
  createdQuestionIds.push(q2.id);

  // 2. Create draft exam enrolled only for candidate1
  const cand1 = await prisma.user.findUniqueOrThrow({
    where: { email: "candidate1@examguard.edu" },
  });
  const code = `E2E-${Date.now().toString().slice(-5)}`;
  const now = Date.now();
  const examRes = await fetch(`${BASE_URL}/api/exams`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: examinerCookie },
    body: JSON.stringify({
      code,
      title: "E2E Integration Exam",
      instructions: "Complete all questions.",
      durationMinutes: 15,
      windowStart: new Date(now - 60_000).toISOString(),
      windowEnd: new Date(now + 3600_000).toISOString(),
      questionIds: [q1.id, q2.id],
      questionsPerPaper: 2,
      randomizeQuestions: false,
      randomizeOptions: false,
      enrolledCandidateIds: [cand1.id],
    }),
  });
  assert.equal(examRes.status, 201);
  const exam = ((await examRes.json()) as { exam: { id: string } }).exam;
  createdExamIds.push(exam.id);

  // 3. Bulk import CSV question into draft exam (plus invalid row check)
  const importRes = await fetch(`${BASE_URL}/api/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: examinerCookie },
    body: JSON.stringify({
      kind: "questions",
      format: "csv",
      examId: exam.id,
      content: [
        "title,prompt,type,topic,difficulty,marks,options,correct,rubric",
        "Imported Q,Pick A,single_mcq,Test,easy,2,Alpha|Beta,1,",
        ",Missing title row,single_mcq,Test,easy,2,A|B,1,",
      ].join("\n"),
    }),
  });
  assert.equal(importRes.status, 200);
  const impJson = (await importRes.json()) as {
    importedCount: number;
    errors: string[];
  };
  assert.equal(impJson.importedCount, 1);
  assert.equal(impJson.errors.length, 1);

  const linkedQs = await prisma.examQuestion.findMany({
    where: { examId: exam.id },
  });
  for (const eq of linkedQs) {
    if (!createdQuestionIds.includes(eq.questionId)) {
      createdQuestionIds.push(eq.questionId);
    }
  }

  // 3b. Warm GET /api/questions cache, then JSON import and verify cache invalidated
  const preCacheQRes = await fetch(`${BASE_URL}/api/questions`, {
    headers: { cookie: examinerCookie },
  });
  assert.equal(preCacheQRes.status, 200);

  const jsonImportTitle = `JSON-Cache-Check-${Date.now()}`;
  const jsonImportRes = await fetch(`${BASE_URL}/api/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: examinerCookie },
    body: JSON.stringify({
      kind: "questions",
      format: "json",
      examId: exam.id,
      content: JSON.stringify([
        {
          title: jsonImportTitle,
          prompt: "Verify JSON import invalidates cached question bank.",
          type: "single_mcq",
          topic: "Testing",
          difficulty: "easy",
          marks: 2,
          options: [
            { id: "o1", text: "Invalidates cache" },
            { id: "o2", text: "Stale forever" },
          ],
          correctOptionIds: ["o1"],
        },
      ]),
    }),
  });
  assert.equal(jsonImportRes.status, 200);
  const jsonImpBody = (await jsonImportRes.json()) as {
    importedCount: number;
    errors: string[];
  };
  assert.equal(jsonImpBody.importedCount, 1);
  assert.equal(jsonImpBody.errors.length, 0);

  const postCacheQRes = await fetch(`${BASE_URL}/api/questions`, {
    headers: { cookie: examinerCookie },
  });
  assert.equal(postCacheQRes.status, 200);
  const postCacheQJson = (await postCacheQRes.json()) as {
    questions: Array<{ id: string; title: string }>;
  };
  const importedQRecord = postCacheQJson.questions.find(
    (q) => q.title === jsonImportTitle
  );
  assert.ok(importedQRecord, "JSON-imported question must appear immediately in /api/questions");
  createdQuestionIds.push(importedQRecord.id);

  // 3c. Warm candidate directory cache, then CSV candidate import and verify cache invalidated
  const preCandRes = await fetch(`${BASE_URL}/api/admin/users`, {
    headers: { cookie: examinerCookie },
  });
  assert.equal(preCandRes.status, 200);

  const candImportEmail = `imp.cand.${Date.now()}@examguard.edu`;
  createdUserEmails.push(candImportEmail);
  const candImportRes = await fetch(`${BASE_URL}/api/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: examinerCookie },
    body: JSON.stringify({
      kind: "candidates",
      format: "csv",
      examId: exam.id,
      content: `name,email\nImported Candidate,${candImportEmail}`,
    }),
  });
  assert.equal(candImportRes.status, 200);
  const candImpBody = (await candImportRes.json()) as {
    importedCount: number;
    errors: string[];
  };
  assert.equal(candImpBody.importedCount, 1);
  assert.equal(candImpBody.errors.length, 0);

  const postCandRes = await fetch(`${BASE_URL}/api/admin/users`, {
    headers: { cookie: examinerCookie },
  });
  assert.equal(postCandRes.status, 200);
  const postCandJson = (await postCandRes.json()) as {
    users: Array<{ email: string }>;
  };
  assert.ok(
    postCandJson.users.some((u) => u.email === candImportEmail),
    "CSV-imported candidate must appear immediately in /api/admin/users"
  );

  // 4. Sandbox preview as examiner (creates no DB attempt)
  const sandboxRes = await fetch(
    `${BASE_URL}/api/exams/${exam.id}/start?sandbox=1`,
    { method: "POST", headers: { cookie: examinerCookie } }
  );
  assert.equal(sandboxRes.status, 200);
  const sandboxJson = (await sandboxRes.json()) as {
    sandbox: boolean;
    attempt: { id: string; items: Array<{ correctOptionIds?: unknown }> };
  };
  assert.equal(sandboxJson.sandbox, true);
  assert.ok(sandboxJson.attempt.id.startsWith("sandbox-"));
  assert.equal(sandboxJson.attempt.items[0].correctOptionIds, undefined);

  // 5. Draft exam cannot be started by candidate
  const draftStart = await fetch(`${BASE_URL}/api/exams/${exam.id}/start`, {
    method: "POST",
    headers: { cookie: candCookie },
  });
  assert.equal(draftStart.status, 403);

  // 6. Publish -> Ongoing
  const pubRes = await fetch(`${BASE_URL}/api/exams`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: examinerCookie },
    body: JSON.stringify({ examId: exam.id, status: "published" }),
  });
  assert.equal(pubRes.status, 200);

  const ongRes = await fetch(`${BASE_URL}/api/exams`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: examinerCookie },
    body: JSON.stringify({ examId: exam.id, status: "ongoing" }),
  });
  assert.equal(ongRes.status, 200);

  // Unenrolled candidate3 blocked
  const unenrolledRes = await fetch(`${BASE_URL}/api/exams/${exam.id}/start`, {
    method: "POST",
    headers: { cookie: cand3Cookie },
  });
  assert.equal(unenrolledRes.status, 403);

  // 7. Enrolled candidate1 starts attempt; answer keys stripped
  const startRes = await fetch(`${BASE_URL}/api/exams/${exam.id}/start`, {
    method: "POST",
    headers: { cookie: candCookie },
  });
  assert.equal(startRes.status, 200);
  const startJson = (await startRes.json()) as {
    attempt: { id: string; items: Array<{ correctOptionIds?: unknown }> };
  };
  const attemptId = startJson.attempt.id;
  assert.equal(startJson.attempt.items[0].correctOptionIds, undefined);

  // 8. Save revision 2 then send stale revision 1 -> conflict returned
  const save2 = await fetch(`${BASE_URL}/api/attempts/${attemptId}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: candCookie },
    body: JSON.stringify({
      updates: [
        { questionId: q1.id, selectedOptionIds: ["o1"], revision: 2 },
        {
          questionId: q2.id,
          writtenText: "Idempotent requests produce the same result.",
          revision: 1,
        },
      ],
    }),
  });
  assert.equal(save2.status, 200);

  const staleSave = await fetch(`${BASE_URL}/api/attempts/${attemptId}/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: candCookie },
    body: JSON.stringify({
      updates: [{ questionId: q1.id, selectedOptionIds: ["o2"], revision: 1 }],
    }),
  });
  assert.equal(staleSave.status, 200);
  const staleJson = (await staleSave.json()) as {
    conflicts: Record<string, { serverRevision: number }>;
  };
  assert.equal(staleJson.conflicts[q1.id]?.serverRevision, 2);

  // 9. Heartbeat + bounded outage auto-pause + examiner grace + announcement
  const hbNormal = await fetch(`${BASE_URL}/api/attempts/${attemptId}/heartbeat`, {
    method: "POST",
    headers: { cookie: candCookie },
  });
  assert.equal(hbNormal.status, 200);
  const hbNormalJson = (await hbNormal.json()) as {
    creditedMs: number;
    serverExpiresAt: string;
    autoPauseCapMs: number;
  };
  assert.equal(hbNormalJson.creditedMs, 0);

  // Simulate a 40s connection drop before deadline -> server auto-credits bounded gap
  const beforeOutageExpMs = new Date(hbNormalJson.serverExpiresAt).getTime();
  await prisma.attempt.update({
    where: { id: attemptId },
    data: { lastHeartbeatAt: new Date(Date.now() - 40_000) },
  });
  const hbRecovered = await fetch(
    `${BASE_URL}/api/attempts/${attemptId}/heartbeat`,
    { method: "POST", headers: { cookie: candCookie } }
  );
  assert.equal(hbRecovered.status, 200);
  const hbRecoveredJson = (await hbRecovered.json()) as {
    creditedMs: number;
    autoPausedMs: number;
    autoPauseCapMs: number;
    serverExpiresAt: string;
  };
  assert.ok(hbRecoveredJson.creditedMs >= 30_000);
  assert.equal(hbRecoveredJson.autoPausedMs, hbRecoveredJson.creditedMs);
  assert.ok(
    new Date(hbRecoveredJson.serverExpiresAt).getTime() > beforeOutageExpMs
  );

  // Exhaust auto-pause cap -> further outage grants zero extra time
  await prisma.attempt.update({
    where: { id: attemptId },
    data: {
      autoPausedMs: hbRecoveredJson.autoPauseCapMs,
      lastHeartbeatAt: new Date(Date.now() - 40_000),
    },
  });
  const expAtCapMs = new Date(hbRecoveredJson.serverExpiresAt).getTime();
  const hbCapped = await fetch(
    `${BASE_URL}/api/attempts/${attemptId}/heartbeat`,
    { method: "POST", headers: { cookie: candCookie } }
  );
  assert.equal(hbCapped.status, 200);
  const hbCappedJson = (await hbCapped.json()) as {
    creditedMs: number;
    serverExpiresAt: string;
  };
  assert.equal(hbCappedJson.creditedMs, 0);
  assert.equal(new Date(hbCappedJson.serverExpiresAt).getTime(), expAtCapMs);

  // Examiner grants outage grace (+5 min) & sends announcement
  const graceRes = await fetch(`${BASE_URL}/api/attempts/${attemptId}/grace`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: examinerCookie },
    body: JSON.stringify({
      graceMinutes: 5,
      reason: "Verified lab router outage",
    }),
  });
  assert.equal(graceRes.status, 200);

  const annRes = await fetch(`${BASE_URL}/api/monitor`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: examinerCookie },
    body: JSON.stringify({ examId: exam.id, message: "5 min grace applied." }),
  });
  assert.equal(annRes.status, 201);

  // 10. Submit attempt + duplicate submit blocked with 409
  const subRes = await fetch(`${BASE_URL}/api/attempts/${attemptId}/submit`, {
    method: "POST",
    headers: { cookie: candCookie },
  });
  assert.equal(subRes.status, 200);
  const dupSub = await fetch(`${BASE_URL}/api/attempts/${attemptId}/submit`, {
    method: "POST",
    headers: { cookie: candCookie },
  });
  assert.equal(dupSub.status, 409);

  // 11. Manual grade written question (reject out-of-range, accept valid)
  const badGrade = await fetch(`${BASE_URL}/api/grading`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: examinerCookie },
    body: JSON.stringify({ attemptId, questionId: q2.id, score: 99 }),
  });
  assert.equal(badGrade.status, 400);

  const goodGrade = await fetch(`${BASE_URL}/api/grading`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: examinerCookie },
    body: JSON.stringify({
      attemptId,
      questionId: q2.id,
      score: 4,
      feedback: "Clear answer.",
    }),
  });
  assert.equal(goodGrade.status, 200);
  const gradeJson = (await goodGrade.json()) as {
    gradingState: string;
    totalAwardedMarks: number;
  };
  assert.equal(gradeJson.gradingState, "graded");
  assert.equal(gradeJson.totalAwardedMarks, 7);

  // 12. Unpublished results blocked for candidate & verify endpoint
  const unpubBreakdown = await fetch(`${BASE_URL}/api/attempts/${attemptId}`, {
    headers: { cookie: candCookie },
  });
  assert.equal(unpubBreakdown.status, 403);

  const gradedAtt = await prisma.attempt.findUniqueOrThrow({
    where: { id: attemptId },
  });
  const unpubVerify = await fetch(
    `${BASE_URL}/api/verify/${gradedAtt.verificationCode}`
  );
  assert.equal(unpubVerify.status, 403);

  // 13. Publish results -> candidate breakdown, PDFs, and public verification succeed
  const publishRes = await fetch(`${BASE_URL}/api/exams`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: examinerCookie },
    body: JSON.stringify({ examId: exam.id, resultsPublished: true }),
  });
  assert.equal(publishRes.status, 200);

  const pubBreakdown = await fetch(`${BASE_URL}/api/attempts/${attemptId}`, {
    headers: { cookie: candCookie },
  });
  assert.equal(pubBreakdown.status, 200);

  const pdfRes = await fetch(`${BASE_URL}/api/reports/${attemptId}/pdf`, {
    headers: { cookie: candCookie },
  });
  assert.equal(pdfRes.status, 200);
  assert.equal(pdfRes.headers.get("content-type"), "application/pdf");

  const summaryPdf = await fetch(`${BASE_URL}/api/reports/exam/${exam.id}/pdf`, {
    headers: { cookie: examinerCookie },
  });
  assert.equal(summaryPdf.status, 200);
  assert.equal(summaryPdf.headers.get("content-type"), "application/pdf");

  const verifyRes = await fetch(
    `${BASE_URL}/api/verify/${gradedAtt.verificationCode}`
  );
  assert.equal(verifyRes.status, 200);
  const verifyJson = (await verifyRes.json()) as {
    valid: boolean;
    candidateMaskedName: string;
    totalAwardedMarks: number;
  };
  assert.equal(verifyJson.valid, true);
  assert.ok(verifyJson.candidateMaskedName.includes("*"));
  assert.equal(verifyJson.totalAwardedMarks, 7);
});
