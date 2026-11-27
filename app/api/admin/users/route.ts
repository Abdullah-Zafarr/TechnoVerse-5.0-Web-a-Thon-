import { NextResponse } from "next/server";
import {
  hashPassword,
  invalidateUserCache,
  primeUserCache,
  requireRole,
  sanitizeUser,
} from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrLoadCached, invalidateCacheTags } from "@/lib/serverCache";
import { createUserSchema, safeParseJson, updateUserSchema } from "@/lib/validation";

const SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
} as const;

export async function GET() {
  const auth = await requireRole(["admin", "examiner"]);
  if (auth.error) return auth.error;

  if (auth.user.role === "examiner") {
    const users = await getOrLoadCached(
      "users:candidates",
      ["users"],
      25_000,
      async () => {
        const candidates = await prisma.user.findMany({
          where: { role: "candidate" },
          select: SAFE_USER_SELECT,
          orderBy: { createdAt: "desc" },
        });
        return candidates.map(sanitizeUser);
      }
    );
    return NextResponse.json({
      users,
      auditLogs: [],
    });
  }

  const data = await getOrLoadCached(
    "users:admin_all",
    ["users"],
    15_000,
    async () => {
      const [users, auditLogs] = await Promise.all([
        prisma.user.findMany({
          select: SAFE_USER_SELECT,
          orderBy: { createdAt: "desc" },
        }),
        prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
      ]);
      return {
        users: users.map(sanitizeUser),
        auditLogs: auditLogs.map((l) => ({
          ...l,
          timestamp: l.createdAt.toISOString(),
        })),
      };
    }
  );

  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const auth = await requireRole(["admin"]);
  if (auth.error) return auth.error;

  const json = await safeParseJson(req);
  if (!json.ok) return json.error;
  const parsed = createUserSchema.safeParse(json.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid user payload" },
      { status: 400 }
    );
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Email already exists" }, { status: 409 });
  }

  const created = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        name: parsed.data.name,
        email,
        role: parsed.data.role,
        passwordHash: hashPassword(parsed.data.password),
        active: true,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: auth.user.id,
        actorEmail: auth.user.email,
        action: "CREATE_USER",
        target: `${u.email} (${u.role})`,
      },
    });
    return u;
  }, { maxWait: 10_000, timeout: 15_000 });

  invalidateCacheTags("users");
  return NextResponse.json({ user: sanitizeUser(created) }, { status: 201 });
}

export async function PATCH(req: Request) {
  const auth = await requireRole(["admin"]);
  if (auth.error) return auth.error;

  const json = await safeParseJson(req);
  if (!json.ok) return json.error;
  const parsed = updateUserSchema.safeParse(json.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid update payload" },
      { status: 400 }
    );
  }

  if (parsed.data.userId === auth.user.id && parsed.data.active === false) {
    return NextResponse.json(
      { error: "Cannot deactivate your own active admin session" },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: target.id },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(parsed.data.role ? { role: parsed.data.role } : {}),
        ...(typeof parsed.data.active === "boolean"
          ? { active: parsed.data.active }
          : {}),
        ...(parsed.data.password
          ? { passwordHash: hashPassword(parsed.data.password) }
          : {}),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: auth.user.id,
        actorEmail: auth.user.email,
        action: "UPDATE_USER",
        target: `${u.email} -> name:${u.name} role:${u.role} active:${u.active}${
          parsed.data.password ? " pwd:reset" : ""
        }`,
      },
    });
    return u;
  }, { maxWait: 10_000, timeout: 15_000 });

  const safeUpdated = sanitizeUser(updated);
  if (safeUpdated.active) {
    primeUserCache(safeUpdated);
  } else {
    invalidateUserCache(safeUpdated.id);
  }

  invalidateCacheTags("users");
  return NextResponse.json({ user: safeUpdated });
}
