export type CacheTag =
  | "exams"
  | "questions"
  | "users"
  | "monitor"
  | "grading"
  | "verify";

interface CacheEntry {
  value: unknown;
  tags: CacheTag[];
  expiresAt: number;
}

interface CacheStore {
  entries: Map<string, CacheEntry>;
  inflight: Map<string, Promise<unknown>>;
  tagGen: Map<CacheTag, number>;
}

declare global {
  // eslint-disable-next-line no-var
  var __examguardServerCache: CacheStore | undefined;
}

const store: CacheStore =
  globalThis.__examguardServerCache ??
  (globalThis.__examguardServerCache = {
    entries: new Map(),
    inflight: new Map(),
    tagGen: new Map(),
  });

function getTagGen(tag: CacheTag): number {
  return store.tagGen.get(tag) ?? 0;
}

export function invalidateCacheTags(...tags: CacheTag[]): void {
  const tagSet = new Set(tags);
  for (const tag of tagSet) {
    store.tagGen.set(tag, getTagGen(tag) + 1);
  }
  for (const [key, entry] of store.entries) {
    if (entry.tags.some((t) => tagSet.has(t))) {
      store.entries.delete(key);
    }
  }
}

export async function getOrLoadCached<T>(
  key: string,
  tags: CacheTag[],
  ttlMs: number,
  loader: () => Promise<T>,
  isFresh?: (val: T) => boolean
): Promise<T> {
  const now = Date.now();
  const cached = store.entries.get(key);
  if (cached && cached.expiresAt > now) {
    const val = cached.value as T;
    if (!isFresh || isFresh(val)) {
      return val;
    }
    store.entries.delete(key);
  }

  const existingInflight = store.inflight.get(key);
  if (existingInflight) {
    return existingInflight as Promise<T>;
  }

  const startGens = tags.map((t) => getTagGen(t));
  const promise = loader()
    .then((value) => {
      const unchanged = tags.every((t, idx) => getTagGen(t) === startGens[idx]);
      if (unchanged) {
        store.entries.set(key, {
          value,
          tags,
          expiresAt: Date.now() + ttlMs,
        });
        if (store.entries.size > 200) {
          const cutoff = Date.now();
          for (const [k, v] of store.entries) {
            if (v.expiresAt <= cutoff) store.entries.delete(k);
          }
        }
      }
      return value;
    })
    .finally(() => {
      store.inflight.delete(key);
    });

  store.inflight.set(key, promise);
  return promise;
}
