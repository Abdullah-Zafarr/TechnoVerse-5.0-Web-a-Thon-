"use client";

import type { SafeUser } from "./types";

const SESSION_CACHE_TTL_MS = 30_000;

let cachedUser: SafeUser | null | undefined;
let cachedAt = 0;
let inflight: Promise<SafeUser | null> | null = null;

export function getCachedSessionUser(): SafeUser | null {
  if (cachedUser !== undefined && Date.now() - cachedAt < SESSION_CACHE_TTL_MS) {
    return cachedUser;
  }
  return null;
}

export function setCachedSessionUser(user: SafeUser | null): void {
  cachedUser = user;
  cachedAt = Date.now();
}

export function clearCachedSessionUser(): void {
  cachedUser = null;
  cachedAt = Date.now();
  inflight = null;
}

export async function fetchSessionUser(force = false): Promise<SafeUser | null> {
  if (
    !force &&
    cachedUser !== undefined &&
    Date.now() - cachedAt < SESSION_CACHE_TTL_MS
  ) {
    return cachedUser;
  }
  if (!force && inflight) {
    return inflight;
  }
  inflight = fetch("/api/auth/me")
    .then((r) => (r.ok ? r.json() : { user: null }))
    .then((d: { user: SafeUser | null }) => {
      cachedUser = d.user ?? null;
      cachedAt = Date.now();
      return cachedUser;
    })
    .catch(() => null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
