import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { prisma } from "./prisma";
import type { Role, SafeUser } from "./types";

const SESSION_COOKIE = "examguard_session";

function getSecret(): string {
  const configured = process.env.AUTH_SECRET?.trim();
  if (configured) return configured;
  if (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    throw new Error("AUTH_SECRET environment variable must be set in production");
  }
  return "examguard-dev-session-secret-change-in-prod";
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  const parts = passwordHash.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }
  const [, salt, storedHex] = parts;
  if (!salt || !storedHex) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const stored = Buffer.from(storedHex, "hex");
    return derived.length === stored.length && crypto.timingSafeEqual(derived, stored);
  } catch {
    return false;
  }
}

export function sanitizeUser(user: User): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt.toISOString(),
  };
}

export function canManageExam(user: SafeUser, createdById: string): boolean {
  return user.role === "admin" || createdById === user.id;
}

interface SessionPayload {
  uid: string;
  exp: number;
}

export function signSessionToken(userId: string): string {
  const payload: SessionPayload = {
    uid: userId,
    exp: Date.now() + 1000 * 60 * 60 * 12,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(encoded)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as SessionPayload;
    if (!parsed.uid || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SafeUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: payload.uid },
      });
      if (!user || !user.active) return null;
      return sanitizeUser(user);
    } catch {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 150));
      }
    }
  }
  return null;
}

export async function requireRole(
  allowedRoles: Role[]
): Promise<
  { user: SafeUser; error?: never } | { user?: never; error: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) {
    return {
      error: NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      ),
    };
  }
  if (!allowedRoles.includes(user.role)) {
    return {
      error: NextResponse.json(
        { error: `Forbidden: requires role ${allowedRoles.join(" or ")}` },
        { status: 403 }
      ),
    };
  }
  return { user };
}

export function attachSessionCookie(res: NextResponse, userId: string): void {
  const token = signSessionToken(userId);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
