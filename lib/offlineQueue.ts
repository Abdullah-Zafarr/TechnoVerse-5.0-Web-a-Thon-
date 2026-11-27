/**
 * Local-first IndexedDB persistence for unsynced candidate answer deltas and
 * offline outage timestamps, with automatic localStorage fallback when
 * IndexedDB is unavailable.
 */

export interface QueuedAnswerDelta {
  selectedOptionIds: string[];
  writtenText: string;
  markedForReview: boolean;
  revision: number;
  updatedAtMs: number;
}

export interface PersistedOfflineState {
  attemptId: string;
  queue: Record<string, QueuedAnswerDelta>;
  offlineSinceMs: number | null;
  lastSyncError: string | null;
  updatedAtMs: number;
}

const DB_NAME = "examguard_offline_v1";
const DB_VERSION = 1;
const STORE_NAME = "attempt_queues";

function lsQueueKey(attemptId: string): string {
  return `examguard_queue_${attemptId}`;
}

function lsOfflineSinceKey(attemptId: string): string {
  return `examguard_offline_since_${attemptId}`;
}

function openOfflineDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "attemptId" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function readLocalStorageFallback(
  attemptId: string
): PersistedOfflineState | null {
  if (typeof window === "undefined") return null;
  try {
    const rawQueue = window.localStorage.getItem(lsQueueKey(attemptId));
    const rawOffline = window.localStorage.getItem(lsOfflineSinceKey(attemptId));
    if (!rawQueue && !rawOffline) return null;

    const queue = rawQueue
      ? (JSON.parse(rawQueue) as Record<string, QueuedAnswerDelta>)
      : {};
    const offlineSinceMs = rawOffline ? Number(rawOffline) : null;

    return {
      attemptId,
      queue,
      offlineSinceMs:
        offlineSinceMs && Number.isFinite(offlineSinceMs)
          ? offlineSinceMs
          : null,
      lastSyncError: null,
      updatedAtMs: Date.now(),
    };
  } catch {
    return null;
  }
}

function writeLocalStorageFallback(state: PersistedOfflineState): void {
  if (typeof window === "undefined") return;
  try {
    if (Object.keys(state.queue).length > 0) {
      window.localStorage.setItem(
        lsQueueKey(state.attemptId),
        JSON.stringify(state.queue)
      );
    } else {
      window.localStorage.removeItem(lsQueueKey(state.attemptId));
    }

    if (state.offlineSinceMs !== null) {
      window.localStorage.setItem(
        lsOfflineSinceKey(state.attemptId),
        String(state.offlineSinceMs)
      );
    } else {
      window.localStorage.removeItem(lsOfflineSinceKey(state.attemptId));
    }
  } catch {}
}

/**
 * Loads persisted offline deltas and outage start time for an attempt.
 * Merges with any legacy localStorage state if IndexedDB has no record yet.
 */
export async function loadOfflineState(
  attemptId: string
): Promise<PersistedOfflineState | null> {
  if (!attemptId) return null;
  const db = await openOfflineDb();
  if (!db) {
    return readLocalStorageFallback(attemptId);
  }

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(attemptId);
      req.onsuccess = () => {
        const record = req.result as PersistedOfflineState | undefined;
        db.close();
        if (record) {
          resolve(record);
          return;
        }
        resolve(readLocalStorageFallback(attemptId));
      };
      req.onerror = () => {
        db.close();
        resolve(readLocalStorageFallback(attemptId));
      };
    } catch {
      db.close();
      resolve(readLocalStorageFallback(attemptId));
    }
  });
}

/**
 * Persists the current offline queue and outage timestamp to IndexedDB,
 * falling back to localStorage if IndexedDB writes fail.
 */
export async function saveOfflineState(
  state: PersistedOfflineState
): Promise<void> {
  if (!state.attemptId) return;
  // Mirror to localStorage as synchronous crash-safe backup on rapid tab close
  writeLocalStorageFallback(state);

  const db = await openOfflineDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(state);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

/**
 * Deletes all locally persisted queue and outage metadata for an attempt.
 */
export async function clearOfflineState(attemptId: string): Promise<void> {
  if (!attemptId) return;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(lsQueueKey(attemptId));
      window.localStorage.removeItem(lsOfflineSinceKey(attemptId));
    } catch {}
  }

  const db = await openOfflineDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(attemptId);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}
