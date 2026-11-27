import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

async function upsertSeedUser(input: {
  id: string;
  name: string;
  email: string;
  role: "admin" | "examiner" | "candidate";
}) {
  const passwordHash = hashPassword("demo1234");
  return prisma.user.upsert({
    where: { email: input.email },
    update: { passwordHash },
    create: {
      id: input.id,
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      active: true,
    },
  });
}

async function main() {
  const now = Date.now();

  const admin = await upsertSeedUser({
    id: "usr-admin",
    name: "Tariq Mahmood (Admin)",
    email: "admin@examguard.edu",
    role: "admin",
  });

  const examiner = await upsertSeedUser({
    id: "usr-examiner",
    name: "Dr. Ayesha Tariq",
    email: "examiner@examguard.edu",
    role: "examiner",
  });

  const cand1 = await upsertSeedUser({
    id: "usr-cand-1",
    name: "Bilal Ahmed",
    email: "candidate1@examguard.edu",
    role: "candidate",
  });

  const cand2 = await upsertSeedUser({
    id: "usr-cand-2",
    name: "Sana Khan",
    email: "candidate2@examguard.edu",
    role: "candidate",
  });

  const cand3 = await upsertSeedUser({
    id: "usr-cand-3",
    name: "Hamza Raza",
    email: "candidate3@examguard.edu",
    role: "candidate",
  });

  const seedQuestions = [
    {
      id: "q-1",
      title: "Server-Authoritative Timer",
      prompt:
        "Why must an online examination system compute remaining exam time on the backend instead of trusting the candidate browser clock?",
      type: "single_mcq" as const,
      topic: "Security",
      difficulty: "easy" as const,
      marks: 2,
      partialCredit: false,
      options: [
        {
          id: "o1",
          text: "Client clocks can be modified locally to gain extra exam time.",
        },
        {
          id: "o2",
          text: "Browsers cannot update countdown displays in JavaScript.",
        },
        { id: "o3", text: "HTTP cookies expire every 60 seconds." },
        { id: "o4", text: "PostgreSQL cannot parse browser ISO dates." },
      ],
      correctOptionIds: ["o1"],
    },
    {
      id: "q-2",
      title: "Backend RBAC Enforcement",
      prompt:
        "Select ALL controls required to protect exam answer keys and restricted endpoints from unauthorized candidates.",
      type: "multi_select" as const,
      topic: "Security",
      difficulty: "medium" as const,
      marks: 4,
      partialCredit: true,
      options: [
        {
          id: "o1",
          text: "Verify signed session identity and user role on every API handler.",
        },
        {
          id: "o2",
          text: "Strip correctOptionIds from active candidate question payloads.",
        },
        { id: "o3", text: "Hide examiner buttons with CSS display: none." },
        {
          id: "o4",
          text: "Enforce candidate enrollment and exam window on the server.",
        },
      ],
      correctOptionIds: ["o1", "o2", "o4"],
    },
    {
      id: "q-3",
      title: "Immutable Attempt Snapshots",
      prompt:
        "An examiner edits a question's marks in the question bank while students are mid-exam. What preserves grading consistency for active attempts?",
      type: "single_mcq" as const,
      topic: "Data Integrity",
      difficulty: "medium" as const,
      marks: 3,
      partialCredit: false,
      options: [
        {
          id: "o1",
          text: "Freezing a question and marking-scheme snapshot inside each active attempt when started.",
        },
        {
          id: "o2",
          text: "Clearing active answers and restarting candidate timers.",
        },
        { id: "o3", text: "Storing the question bank only in localStorage." },
        { id: "o4", text: "Letting candidates select their own mark weights." },
      ],
      correctOptionIds: ["o1"],
    },
    {
      id: "q-4",
      title: "Transactional Submission Guard",
      prompt:
        "Which database mechanisms prevent duplicate submissions or race conditions when a candidate double-clicks Submit?",
      type: "multi_select" as const,
      topic: "Databases",
      difficulty: "hard" as const,
      marks: 4,
      partialCredit: true,
      options: [
        { id: "o1", text: "Unique constraint on (exam_id, candidate_id)" },
        { id: "o2", text: "Atomic status transition inside a DB transaction" },
        { id: "o3", text: "Disabling button CSS hover state only" },
        { id: "o4", text: "Checking status = in_progress before finalizing" },
      ],
      correctOptionIds: ["o1", "o2", "o4"],
    },
    {
      id: "q-5",
      title: "Verifiable Report Privacy",
      prompt:
        "Explain in 2-4 sentences how a public verification endpoint should prove a result report is authentic without leaking sensitive candidate personal data.",
      type: "written" as const,
      topic: "Security",
      difficulty: "medium" as const,
      marks: 5,
      partialCredit: false,
      options: [],
      correctOptionIds: [],
      rubric:
        "Must cover unique verification code / QR link, masking candidate email/PII, omitting private answer sheets, and returning only validity, exam title, and score.",
    },
    {
      id: "q-6",
      title: "Binary Search Time Complexity",
      prompt:
        "What is the worst-case time complexity of binary search on a sorted array of n items?",
      type: "single_mcq" as const,
      topic: "Algorithms",
      difficulty: "easy" as const,
      marks: 2,
      partialCredit: false,
      options: [
        { id: "o1", text: "O(log n)" },
        { id: "o2", text: "O(n)" },
        { id: "o3", text: "O(n log n)" },
        { id: "o4", text: "O(1)" },
      ],
      correctOptionIds: ["o1"],
    },
  ];

  for (const q of seedQuestions) {
    await prisma.question.upsert({
      where: { id: q.id },
      update: {},
      create: {
        ...q,
        createdById: examiner.id,
      },
    });
  }

  const cs301 = await prisma.exam.upsert({
    where: { code: "CS-301" },
    update: {
      questionsPerPaper: 6,
      totalMarks: 20,
    },
    create: {
      id: "exam-cs301",
      code: "CS-301",
      title: "CS-301: Secure Examination Systems Midterm",
      instructions:
        "Complete all questions before the server timer expires. Answers auto-save automatically and survive page refreshes.",
      status: "ongoing",
      durationMinutes: 30,
      totalMarks: 20,
      windowStart: new Date(now - 3600_000),
      windowEnd: new Date(now + 3600_000 * 8),
      questionsPerPaper: 6,
      randomizeQuestions: true,
      randomizeOptions: true,
      resultsPublished: false,
      createdById: examiner.id,
    },
  });

  const se402 = await prisma.exam.upsert({
    where: { code: "SE-402" },
    update: {},
    create: {
      id: "exam-se402",
      code: "SE-402",
      title: "SE-402: Distributed Systems Readiness Quiz",
      instructions:
        "Upcoming scheduled exam. Access remains restricted until the availability window opens.",
      status: "published",
      durationMinutes: 20,
      totalMarks: 9,
      windowStart: new Date(now + 86400_000),
      windowEnd: new Date(now + 86400_000 * 2),
      questionsPerPaper: 3,
      randomizeQuestions: true,
      randomizeOptions: true,
      resultsPublished: false,
      createdById: examiner.id,
    },
  });

  const db201 = await prisma.exam.upsert({
    where: { code: "DB-201" },
    update: {},
    create: {
      id: "exam-db201",
      code: "DB-201",
      title: "DB-201: Data Integrity & Reporting Assessment",
      instructions: "Completed assessment with published verified reports.",
      status: "completed",
      durationMinutes: 25,
      totalMarks: 11,
      windowStart: new Date(now - 86400_000 * 2),
      windowEnd: new Date(now - 86400_000),
      questionsPerPaper: 3,
      randomizeQuestions: false,
      randomizeOptions: false,
      resultsPublished: true,
      createdById: examiner.id,
    },
  });

  const eng105 = await prisma.exam.upsert({
    where: { code: "ENG-105" },
    update: {},
    create: {
      id: "exam-eng105",
      code: "ENG-105",
      title: "ENG-105: Technical & Ethics Writing Draft",
      instructions:
        "Draft assessment under preparation by examiner before publication.",
      status: "draft",
      durationMinutes: 30,
      totalMarks: 5,
      windowStart: new Date(now + 86400_000 * 5),
      windowEnd: new Date(now + 86400_000 * 6),
      questionsPerPaper: 1,
      randomizeQuestions: false,
      randomizeOptions: false,
      resultsPublished: false,
      createdById: examiner.id,
    },
  });

  const linkPairs: [string, string[]][] = [
    [cs301.id, ["q-1", "q-2", "q-3", "q-4", "q-5", "q-6"]],
    [se402.id, ["q-3", "q-4", "q-6"]],
    [db201.id, ["q-1", "q-4", "q-5"]],
    [eng105.id, ["q-5"]],
  ];
  for (const [examId, qIds] of linkPairs) {
    for (let i = 0; i < qIds.length; i++) {
      await prisma.examQuestion.upsert({
        where: { examId_questionId: { examId, questionId: qIds[i] } },
        update: { position: i + 1 },
        create: { examId, questionId: qIds[i], position: i + 1 },
      });
    }
  }

  for (const cand of [cand1, cand2, cand3]) {
    await prisma.enrollment.upsert({
      where: { examId_candidateId: { examId: cs301.id, candidateId: cand.id } },
      update: {},
      create: { examId: cs301.id, candidateId: cand.id },
    });
  }
  for (const cand of [cand1, cand2]) {
    await prisma.enrollment.upsert({
      where: { examId_candidateId: { examId: se402.id, candidateId: cand.id } },
      update: {},
      create: { examId: se402.id, candidateId: cand.id },
    });
    await prisma.enrollment.upsert({
      where: { examId_candidateId: { examId: db201.id, candidateId: cand.id } },
      update: {},
      create: { examId: db201.id, candidateId: cand.id },
    });
  }

  const dbSnapshot = ["q-1", "q-4", "q-5"].map((id, idx) => {
    const q = seedQuestions.find((x) => x.id === id)!;
    return {
      questionId: q.id,
      order: idx + 1,
      title: q.title,
      prompt: q.prompt,
      type: q.type,
      topic: q.topic,
      difficulty: q.difficulty,
      marks: q.marks,
      partialCredit: q.partialCredit,
      options: q.options,
      correctOptionIds: q.correctOptionIds,
      rubric: q.rubric ?? null,
    };
  });

  const att1StartedAt = now - 86400_000 * 1.5;
  const att1SubmittedAt = att1StartedAt + 1100_000;
  const att1LastHeartbeatAt = att1StartedAt + 1095_000;

  const existingAtt1 = await prisma.attempt.findUnique({
    where: { examId_candidateId: { examId: db201.id, candidateId: cand1.id } },
  });
  if (!existingAtt1) {
    await prisma.attempt.create({
      data: {
        id: "att-seed-1",
        examId: db201.id,
        candidateId: cand1.id,
        status: "submitted",
        gradingState: "graded",
        startedAt: new Date(att1StartedAt),
        serverExpiresAt: new Date(att1StartedAt + 1500_000),
        submittedAt: new Date(att1SubmittedAt),
        lastHeartbeatAt: new Date(att1LastHeartbeatAt),
        itemsSnapshot: dbSnapshot,
        totalPossibleMarks: 11,
        totalAwardedMarks: 11,
        verificationCode: "EG-DEMO2026",
        answers: {
          create: [
            {
              questionId: "q-1",
              selectedOptionIds: ["o1"],
              autoScore: 2,
              revision: 1,
            },
            {
              questionId: "q-4",
              selectedOptionIds: ["o1", "o2", "o4"],
              autoScore: 4,
              revision: 1,
            },
            {
              questionId: "q-5",
              writtenText:
                "Issue a unique verification code and QR URL returning validity, exam title, masked candidate name, and score while hiding email and raw responses.",
              manualScore: 5,
              manualFeedback: "Complete privacy-preserving design.",
              revision: 2,
            },
          ],
        },
      },
    });
  } else {
    await prisma.attempt.update({
      where: { id: existingAtt1.id },
      data: {
        lastHeartbeatAt: new Date(
          existingAtt1.submittedAt
            ? existingAtt1.submittedAt.getTime() - 5_000
            : att1LastHeartbeatAt
        ),
      },
    });
  }

  const att2StartedAt = now - 86400_000 * 1.4;
  const att2SubmittedAt = att2StartedAt + 1250_000;
  const att2LastHeartbeatAt = att2StartedAt + 1245_000;

  const existingAtt2 = await prisma.attempt.findUnique({
    where: { examId_candidateId: { examId: db201.id, candidateId: cand2.id } },
  });
  if (!existingAtt2) {
    await prisma.attempt.create({
      data: {
        id: "att-seed-2",
        examId: db201.id,
        candidateId: cand2.id,
        status: "submitted",
        gradingState: "graded",
        startedAt: new Date(att2StartedAt),
        serverExpiresAt: new Date(att2StartedAt + 1500_000),
        submittedAt: new Date(att2SubmittedAt),
        lastHeartbeatAt: new Date(att2LastHeartbeatAt),
        itemsSnapshot: dbSnapshot,
        totalPossibleMarks: 11,
        totalAwardedMarks: 7,
        verificationCode: "EG-SANA2026",
        answers: {
          create: [
            {
              questionId: "q-1",
              selectedOptionIds: ["o2"],
              autoScore: 0,
              revision: 1,
            },
            {
              questionId: "q-4",
              selectedOptionIds: ["o1", "o2", "o4"],
              autoScore: 4,
              revision: 1,
            },
            {
              questionId: "q-5",
              writtenText:
                "Use a QR code linking to a verification page that checks the report ID without showing email.",
              manualScore: 3,
              manualFeedback: "Correct approach; mention masking raw answer data.",
              revision: 1,
            },
          ],
        },
        incidents: {
          create: [
            {
              type: "offline_gap",
              detail: "Network dropped for 12s; answer synced on reconnect.",
              createdAt: new Date(att2StartedAt + 600_000),
            },
            {
              type: "reconnected",
              detail:
                "Connection restored; queued answer revision 1 flushed to server.",
              createdAt: new Date(att2StartedAt + 612_000),
            },
          ],
        },
      },
    });
  } else {
    const att2BaseStart = existingAtt2.startedAt.getTime();
    await prisma.attempt.update({
      where: { id: existingAtt2.id },
      data: {
        lastHeartbeatAt: new Date(
          existingAtt2.submittedAt
            ? existingAtt2.submittedAt.getTime() - 5_000
            : att2LastHeartbeatAt
        ),
      },
    });
    const reconnectedCount = await prisma.incident.count({
      where: { attemptId: existingAtt2.id, type: "reconnected" },
    });
    if (reconnectedCount === 0) {
      await prisma.incident.create({
        data: {
          attemptId: existingAtt2.id,
          type: "reconnected",
          detail:
            "Connection restored; queued answer revision 1 flushed to server.",
          createdAt: new Date(att2BaseStart + 612_000),
        },
      });
    }
  }

  const annCount = await prisma.announcement.count({
    where: { examId: cs301.id },
  });
  if (annCount === 0) {
    await prisma.announcement.create({
      data: {
        examId: cs301.id,
        message:
          "Welcome to CS-301. Answers save automatically; keep working through brief network drops.",
        createdBy: examiner.name,
      },
    });
  }

  const audCount = await prisma.auditLog.count();
  if (audCount === 0) {
    await prisma.auditLog.create({
      data: {
        actorId: admin.id,
        actorEmail: admin.email,
        action: "SEED_DATABASE",
        target: "Initial ExamGuard seed completed",
      },
    });
  }

  console.log("Seed completed successfully.");
}

main()
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
