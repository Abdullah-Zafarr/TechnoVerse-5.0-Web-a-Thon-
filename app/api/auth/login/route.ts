import { NextResponse } from "next/server";
import { attachSessionCookie, sanitizeUser, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { loginSchema, safeParseJson } from "@/lib/validation";

const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 20;
const loginAttempts = new Map<string, number[]>();

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "local";
}

function isRateLimited(key: string, now: number): boolean {
  const cutoff = now - LOGIN_WINDOW_MS;
  const recent = (loginAttempts.get(key) ?? []).filter((t) => t > cutoff);
  if (recent.length >= LOGIN_MAX_ATTEMPTS) {
    loginAttempts.set(key, recent);
    return true;
  }
  recent.push(now);
  loginAttempts.set(key, recent);
  if (loginAttempts.size > 500) {
    for (const [k, times] of loginAttempts) {
      if (times.every((t) => t <= cutoff)) loginAttempts.delete(k);
    }
  }
  return false;
}

export async function POST(req: Request) {
  try {
    const json = await safeParseJson(req);
    if (!json.ok) return json.error;

    const parsed = loginSchema.safeParse(json.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid login input" },
        { status: 400 }
      );
    }

    const email = parsed.data.email.toLowerCase();
    const rateKey = `${getClientIp(req)}:${email}`;
    if (isRateLimited(rateKey, Date.now())) {
      return NextResponse.json(
        { error: "Too many login attempts. Try again in a few minutes." },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }
    if (!user.active) {
      return NextResponse.json(
        { error: "Account is deactivated by administrator" },
        { status: 403 }
      );
    }

    if (!verifyPassword(parsed.data.password, user.passwordHash)) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorEmail: user.email,
        action: "PASSWORD_LOGIN",
        target: `Role ${user.role}`,
      },
    });

    const res = NextResponse.json({ user: sanitizeUser(user) });
    attachSessionCookie(res, user.id);
    return res;
  } catch {
    return NextResponse.json(
      { error: "Unable to process login request" },
      { status: 500 }
    );
  }
}
