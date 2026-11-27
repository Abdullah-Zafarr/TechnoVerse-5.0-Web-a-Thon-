import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { finalizeAttemptInTx } from "@/lib/grading";
import { prisma } from "@/lib/prisma";
import { broadcastExamEvent } from "@/lib/realtime";
import type { AttemptItemSnapshot } from "@/lib/types";
import { answerUpdateSchema, safeParseJson } from "@/lib/validation";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: attemptId } = await params;
  const auth = await requireRole(["candidate"]);
  if (auth.error) return auth.error;

  const json = await safeParseJson(req);
  if (!json.ok) return json.error;
  const parsed = answerUpdateSchema.safeParse(json.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid answer payload" },
      { status: 400 }
    );
  }

  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
  });
  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }
  if (attempt.candidateId !== auth.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  if (attempt.status === "in_progress" && now > attempt.serverExpiresAt) {
    await finalizeAttemptInTx(attempt.id, "expired");
    return NextResponse.json(
      {
        error: "Server time expired; attempt finalized with accepted answers.",
        expired: true,
        serverNow: now.toISOString(),
      },
      { status: 409 }
    );
  }
  if (attempt.status !== "in_progress") {
    return NextResponse.json(
      { error: `Attempt already ${attempt.status}` },
      { status: 409 }
    );
  }

  const items = attempt.itemsSnapshot as unknown as AttemptItemSnapshot[];
  const itemMap = new Map(items.map((i) => [i.questionId, i]));

  for (const u of parsed.data.updates) {
    const item = itemMap.get(u.questionId);
    if (!item) continue;
    if (u.selectedOptionIds !== undefined) {
      if (item.type === "single_mcq" && u.selectedOptionIds.length > 1) {
        return NextResponse.json(
          {
            error: `Single-choice question '${item.title}' accepts at most 1 selected option`,
          },
          { status: 400 }
        );
      }
      const validOptIds = new Set(item.options.map((o) => o.id));
      for (const optId of u.selectedOptionIds) {
        if (!validOptIds.has(optId)) {
          return NextResponse.json(
            {
              error: `Invalid option '${optId}' for question '${item.title}'`,
            },
            { status: 400 }
          );
        }
      }
    }
  }

  const dedupedMap = new Map<string, (typeof parsed.data.updates)[number]>();
  for (const u of parsed.data.updates) {
    if (!itemMap.has(u.questionId)) continue;
    const prev = dedupedMap.get(u.questionId);
    if (!prev || u.revision >= prev.revision) {
      dedupedMap.set(u.questionId, u);
    }
  }
  const dedupedUpdates = Array.from(dedupedMap.values());

  const acceptedRevisions: Record<string, number> = {};
  const conflicts: Record<
    string,
    {
      serverRevision: number;
      selectedOptionIds: string[];
      writtenText: string;
      markedForReview: boolean;
      updatedAt: string;
    }
  > = {};

  const txResult = await prisma.$transaction(async (tx) => {
    const txNow = new Date();
    const alive = await tx.attempt.updateMany({
      where: {
        id: attempt.id,
        status: "in_progress",
        serverExpiresAt: { gte: txNow },
      },
      data: { lastHeartbeatAt: txNow },
    });
    if (alive.count === 0) {
      const latest = await tx.attempt.findUnique({
        where: { id: attempt.id },
        select: { status: true, serverExpiresAt: true },
      });
      if (!latest) return { kind: "not_found" as const };
      if (latest.status !== "in_progress") {
        return { kind: "already_finalized" as const, status: latest.status };
      }
      return { kind: "expired" as const };
    }

    for (const u of dedupedUpdates) {
      const updateData = {
        ...(u.selectedOptionIds !== undefined
          ? { selectedOptionIds: u.selectedOptionIds }
          : {}),
        ...(u.writtenText !== undefined ? { writtenText: u.writtenText } : {}),
        ...(u.markedForReview !== undefined
          ? { markedForReview: u.markedForReview }
          : {}),
        revision: u.revision,
      };

      const updated = await tx.answer.updateMany({
        where: {
          attemptId: attempt.id,
          questionId: u.questionId,
          revision: { lt: u.revision },
        },
        data: updateData,
      });
      if (updated.count > 0) {
        acceptedRevisions[u.questionId] = u.revision;
        continue;
      }

      const created = await tx.answer.createMany({
        data: [
          {
            attemptId: attempt.id,
            questionId: u.questionId,
            selectedOptionIds: u.selectedOptionIds ?? [],
            writtenText: u.writtenText ?? "",
            markedForReview: u.markedForReview ?? false,
            revision: u.revision,
          },
        ],
        skipDuplicates: true,
      });
      if (created.count > 0) {
        acceptedRevisions[u.questionId] = u.revision;
        continue;
      }

      const retried = await tx.answer.updateMany({
        where: {
          attemptId: attempt.id,
          questionId: u.questionId,
          revision: { lt: u.revision },
        },
        data: updateData,
      });
      if (retried.count > 0) {
        acceptedRevisions[u.questionId] = u.revision;
        continue;
      }

      const existing = await tx.answer.findUnique({
        where: {
          attemptId_questionId: {
            attemptId: attempt.id,
            questionId: u.questionId,
          },
        },
      });
      if (existing) {
        conflicts[u.questionId] = {
          serverRevision: existing.revision,
          selectedOptionIds: Array.isArray(existing.selectedOptionIds)
            ? (existing.selectedOptionIds as string[])
            : [],
          writtenText: existing.writtenText,
          markedForReview: existing.markedForReview,
          updatedAt: existing.updatedAt.toISOString(),
        };
        if (u.revision < existing.revision) {
          const title = itemMap.get(u.questionId)?.title ?? u.questionId;
          await tx.incident.create({
            data: {
              attemptId: attempt.id,
              type: "sync_conflict",
              detail: `Resolved stale revision ${u.revision} against server revision ${existing.revision} for "${title}".`.slice(
                0,
                240
              ),
            },
          });
        }
      }
    }

    if (parsed.data.incident) {
      await tx.incident.create({
        data: {
          attemptId: attempt.id,
          type: parsed.data.incident.type,
          detail: parsed.data.incident.detail,
        },
      });
    }

    return { kind: "ok" as const, txNow };
  }, { maxWait: 10_000, timeout: 20_000 });

  if (txResult.kind === "not_found") {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }
  if (txResult.kind === "already_finalized") {
    return NextResponse.json(
      { error: `Attempt already ${txResult.status}` },
      { status: 409 }
    );
  }
  if (txResult.kind === "expired") {
    await finalizeAttemptInTx(attempt.id, "expired");
    return NextResponse.json(
      {
        error: "Server time expired; attempt finalized with accepted answers.",
        expired: true,
        serverNow: new Date().toISOString(),
      },
      { status: 409 }
    );
  }

  await broadcastExamEvent(attempt.examId, "attempt_updated", {
    attemptId: attempt.id,
  });

  return NextResponse.json({
    ok: true,
    acceptedRevisions,
    conflicts,
    serverNow: txResult.txNow.toISOString(),
    serverExpiresAt: attempt.serverExpiresAt.toISOString(),
  });
}
