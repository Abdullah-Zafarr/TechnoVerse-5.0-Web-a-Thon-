"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Wifi,
  WifiOff,
  Flag,
  Clock,
  SlidersHorizontal,
  PenTool,
  Bell,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  ShieldAlert,
  RefreshCw,
  Lock,
} from "lucide-react";
import {
  clearOfflineState,
  loadOfflineState,
  saveOfflineState,
  type QueuedAnswerDelta,
} from "@/lib/offlineQueue";
import { getSupabaseBrowserClient } from "@/lib/realtime";
import type { QuestionOption, QuestionType } from "@/lib/types";

interface SanitizedItem {
  questionId: string;
  order: number;
  title: string;
  prompt: string;
  type: QuestionType;
  topic: string;
  difficulty: string;
  marks: number;
  partialCredit: boolean;
  options: QuestionOption[];
}

interface LocalAnswerState {
  selectedOptionIds: string[];
  writtenText: string;
  markedForReview: boolean;
  revision: number;
}

interface WorkspacePrefs {
  fontSize: "sm" | "md" | "lg";
  theme: "paper" | "dark" | "high-contrast";
  navSide: "left" | "right";
  compactNav: boolean;
}

interface AnnouncementItem {
  id: string;
  message: string;
  createdBy: string;
  createdAt: string;
}

interface AnswerConflictInfo {
  serverRevision: number;
  selectedOptionIds: string[];
  writtenText: string;
  markedForReview: boolean;
  updatedAt: string;
}

function toQueuedRecord(
  queue: Record<string, LocalAnswerState>
): Record<string, QueuedAnswerDelta> {
  const now = Date.now();
  return Object.fromEntries(
    Object.entries(queue).map(([qId, ans]) => [
      qId,
      {
        selectedOptionIds: ans.selectedOptionIds,
        writtenText: ans.writtenText,
        markedForReview: ans.markedForReview,
        revision: ans.revision,
        updatedAtMs: now,
      },
    ])
  );
}

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function ExamWorkspaceContent() {
  const params = useParams<{ examId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const isSandbox = searchParams.get("sandbox") === "1";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [examMeta, setExamMeta] = useState<{
    id: string;
    code: string;
    title: string;
    instructions: string;
  } | null>(null);

  const [attemptId, setAttemptId] = useState<string>("");
  const [items, setItems] = useState<SanitizedItem[]>([]);
  const [answers, setAnswers] = useState<Record<string, LocalAnswerState>>({});
  const [activeIndex, setActiveIndex] = useState(0);

  const [expiresAtMs, setExpiresAtMs] = useState<number>(0);
  const expiresAtMsRef = useRef<number>(0);
  const [serverDeltaMs, setServerDeltaMs] = useState<number>(0);
  const [remainingMs, setRemainingMs] = useState<number>(0);

  const [online, setOnline] = useState(true);
  const [connectionLost, setConnectionLost] = useState(false);
  const [disconnectReason, setDisconnectReason] = useState<
    "offline" | "timeout" | "sync_error" | null
  >(null);
  const [autoPausedMs, setAutoPausedMs] = useState<number>(0);
  const [autoPauseCapMs, setAutoPauseCapMs] = useState<number>(300_000);
  const [pendingQueue, setPendingQueue] = useState<
    Record<string, LocalAnswerState>
  >({});
  const pendingQueueRef = useRef<Record<string, LocalAnswerState>>({});
  const flushInFlightRef = useRef(false);
  const heartbeatInFlightRef = useRef(false);
  const needsReflushRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offlineSinceRef = useRef<number | null>(null);
  const retryDelayRef = useRef<number>(3000);

  const isLocked = !isSandbox && (!online || connectionLost);
  const isLockedRef = useRef(false);
  isLockedRef.current = isLocked;

  const [syncStatus, setSyncStatus] = useState<
    "synced" | "syncing" | "offline_queued" | "error"
  >("synced");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);
  const [graceNotice, setGraceNotice] = useState<string | null>(null);

  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [showAllAnnouncements, setShowAllAnnouncements] = useState(false);
  const [prefs, setPrefs] = useState<WorkspacePrefs>({
    fontSize: "md",
    theme: "paper",
    navSide: "left",
    compactNav: false,
  });
  const [showPrefs, setShowPrefs] = useState(false);

  const [showScratchpad, setShowScratchpad] = useState(false);
  const [scratchNotes, setScratchNotes] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  const [showReviewModal, setShowReviewModal] = useState(false);
  const [submittedNotice, setSubmittedNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("examguard_prefs");
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<WorkspacePrefs>;
        setPrefs((prev) => ({ ...prev, ...parsed }));
      }
    } catch {}
  }, []);

  function updatePrefs(next: WorkspacePrefs) {
    setPrefs(next);
    try {
      localStorage.setItem("examguard_prefs", JSON.stringify(next));
    } catch {}
  }

  const applyServerTiming = useCallback(
    (payload: {
      serverNow?: string;
      serverExpiresAt?: string;
      autoPausedMs?: number;
      autoPauseCapMs?: number;
      creditedMs?: number;
      graceMinutes?: number;
    }) => {
      if (payload.serverNow) {
        setServerDeltaMs(new Date(payload.serverNow).getTime() - Date.now());
      }
      if (typeof payload.autoPausedMs === "number") {
        setAutoPausedMs(payload.autoPausedMs);
      }
      if (typeof payload.autoPauseCapMs === "number") {
        setAutoPauseCapMs(payload.autoPauseCapMs);
      }
      if (payload.serverExpiresAt) {
        const nextExp = new Date(payload.serverExpiresAt).getTime();
        if (nextExp > expiresAtMsRef.current) {
          expiresAtMsRef.current = nextExp;
          setExpiresAtMs(nextExp);
          setSubmittedNotice(null);
          if (payload.creditedMs && payload.creditedMs > 0) {
            const creditedSec = Math.max(
              1,
              Math.round(payload.creditedMs / 1000)
            );
            const usedSec = Math.round((payload.autoPausedMs ?? 0) / 1000);
            const capSec = Math.round((payload.autoPauseCapMs ?? 300_000) / 1000);
            setGraceNotice(
              `Connection restored. Auto-paused ${creditedSec}s credited (${usedSec}s / ${capSec}s outage budget used).`
            );
          } else if (payload.graceMinutes) {
            setGraceNotice(
              `Examiner granted +${payload.graceMinutes} min verified outage grace. Your deadline has been updated.`
            );
          }
        }
      }
    },
    []
  );

  const enterOutageLock = useCallback(
    (reason: "offline" | "timeout" | "sync_error") => {
      setConnectionLost(true);
      setDisconnectReason(reason);
      setShowReviewModal(false);
      if (offlineSinceRef.current === null) {
        offlineSinceRef.current = Date.now();
      }
      if (attemptId && !isSandbox) {
        void saveOfflineState({
          attemptId,
          queue: toQueuedRecord(pendingQueueRef.current),
          offlineSinceMs: offlineSinceRef.current,
          lastSyncError: reason === "timeout" ? "Request timed out" : "Offline",
          updatedAtMs: Date.now(),
        });
      }
      setSyncStatus("offline_queued");
    },
    [attemptId, isSandbox]
  );

  const goToQuestion = useCallback(
    (nextIndex: number) => {
      if (isLockedRef.current) return;
      setActiveIndex(Math.max(0, Math.min(items.length - 1, nextIndex)));
    },
    [items.length]
  );

  useEffect(() => {
    async function init() {
      setLoading(true);
      const url = `/api/exams/${encodeURIComponent(params.examId)}/start${
        isSandbox ? "?sandbox=1" : ""
      }`;
      const res = await fetch(url, { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        serverNow?: string;
        exam?: { id: string; code: string; title: string; instructions: string };
        attempt?: {
          id: string;
          serverExpiresAt: string;
          autoPausedMs?: number;
          autoPauseCapMs?: number;
          creditedMs?: number;
          items: SanitizedItem[];
          answers: Record<string, LocalAnswerState>;
        };
      };

      if (!res.ok || !data.attempt || !data.exam) {
        setError(data.error ?? "Unable to access examination.");
        setLoading(false);
        return;
      }

      setExamMeta(data.exam);
      setAttemptId(data.attempt.id);
      setItems(data.attempt.items);

      const serverNowMs = data.serverNow
        ? new Date(data.serverNow).getTime()
        : Date.now();
      const delta = serverNowMs - Date.now();
      const expMs = new Date(data.attempt.serverExpiresAt).getTime();
      setServerDeltaMs(delta);
      expiresAtMsRef.current = expMs;
      setExpiresAtMs(expMs);
      setRemainingMs(Math.max(0, expMs - (Date.now() + delta)));
      applyServerTiming({
        serverNow: data.serverNow,
        serverExpiresAt: data.attempt.serverExpiresAt,
        autoPausedMs: data.attempt.autoPausedMs,
        autoPauseCapMs: data.attempt.autoPauseCapMs,
        creditedMs: data.attempt.creditedMs,
      });

      const merged: Record<string, LocalAnswerState> = { ...data.attempt.answers };
      try {
        const persisted = await loadOfflineState(data.attempt.id);
        if (persisted?.offlineSinceMs) {
          offlineSinceRef.current = persisted.offlineSinceMs;
        }
        if (persisted?.queue && Object.keys(persisted.queue).length > 0) {
          const rehydratedQueue: Record<string, LocalAnswerState> = {};
          for (const [qId, qAns] of Object.entries(persisted.queue)) {
            const srv = merged[qId];
            if (!srv || qAns.revision > srv.revision) {
              const localAns: LocalAnswerState = {
                selectedOptionIds: qAns.selectedOptionIds,
                writtenText: qAns.writtenText,
                markedForReview: qAns.markedForReview,
                revision: qAns.revision,
              };
              merged[qId] = localAns;
              rehydratedQueue[qId] = localAns;
            }
          }
          if (Object.keys(rehydratedQueue).length > 0) {
            pendingQueueRef.current = rehydratedQueue;
            setPendingQueue(rehydratedQueue);
            setSyncStatus("offline_queued");
          } else {
            await saveOfflineState({
              attemptId: data.attempt.id,
              queue: {},
              offlineSinceMs: offlineSinceRef.current,
              lastSyncError: null,
              updatedAtMs: Date.now(),
            });
          }
        }
        const savedNotes = localStorage.getItem(
          `examguard_scratch_${data.attempt.id}`
        );
        if (savedNotes) setScratchNotes(savedNotes);
      } catch {}

      setAnswers(merged);
      setLoading(false);
    }
    init();
  }, [params.examId, isSandbox]);

  // Restore saved scratchpad drawing whenever scratchpad opens or unlocks
  useEffect(() => {
    if (!showScratchpad || isLocked || !attemptId || !canvasRef.current) return;
    try {
      const dataUrl = localStorage.getItem(
        `examguard_scratch_canvas_${attemptId}`
      );
      if (dataUrl) {
        const img = new Image();
        img.onload = () => {
          const ctx = canvasRef.current?.getContext("2d");
          if (ctx && canvasRef.current) {
            ctx.clearRect(
              0,
              0,
              canvasRef.current.width,
              canvasRef.current.height
            );
            ctx.drawImage(img, 0, 0);
          }
        };
        img.src = dataUrl;
      }
    } catch {}
  }, [showScratchpad, isLocked, attemptId]);

  useEffect(() => {
    if (!showReviewModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowReviewModal(false);
        setError(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showReviewModal]);

  const flushQueue = useCallback(async (): Promise<boolean> => {
    if (!attemptId || isSandbox) {
      pendingQueueRef.current = {};
      setPendingQueue({});
      setSyncStatus("synced");
      return true;
    }

    if (flushInFlightRef.current) {
      needsReflushRef.current = true;
      return false;
    }

    const snapshot = { ...pendingQueueRef.current };
    const entries = Object.entries(snapshot);
    if (entries.length === 0) {
      setSyncStatus("synced");
      return true;
    }

    flushInFlightRef.current = true;
    setSyncStatus("syncing");
    const offlineStartedAt = offlineSinceRef.current;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(`/api/attempts/${attemptId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          updates: entries.map(([questionId, ans]) => ({
            questionId,
            selectedOptionIds: ans.selectedOptionIds,
            writtenText: ans.writtenText,
            markedForReview: ans.markedForReview,
            revision: ans.revision,
          })),
          ...(offlineStartedAt
            ? {
                incident: {
                  type: "reconnected",
                  detail: `Recovered after ${Math.max(
                    1,
                    Math.round((Date.now() - offlineStartedAt) / 1000)
                  )}s offline; replayed ${entries.length} queued update(s).`,
                },
              }
            : {}),
        }),
      });
      if (res.status === 409) {
        const d = (await res.json()) as { error?: string };
        pendingQueueRef.current = {};
        setPendingQueue({});
        offlineSinceRef.current = null;
        setConnectionLost(false);
        setDisconnectReason(null);
        await clearOfflineState(attemptId);
        setSubmittedNotice(d.error ?? "Time limit expired; attempt finalized.");
        setSyncStatus("error");
        return false;
      }
      if (!res.ok) {
        if (res.status >= 500) {
          enterOutageLock("sync_error");
        } else {
          await saveOfflineState({
            attemptId,
            queue: toQueuedRecord(pendingQueueRef.current),
            offlineSinceMs: offlineSinceRef.current,
            lastSyncError: `HTTP ${res.status}`,
            updatedAtMs: Date.now(),
          });
          setSyncStatus("error");
        }
        return false;
      }

      const data = (await res.json()) as {
        conflicts?: Record<string, AnswerConflictInfo>;
        serverNow?: string;
        serverExpiresAt?: string;
        autoPausedMs?: number;
        autoPauseCapMs?: number;
        creditedMs?: number;
      };

      setOnline(true);
      setConnectionLost(false);
      setDisconnectReason(null);
      applyServerTiming(data);

      const conflicts = data.conflicts ?? {};
      const supersededIds: string[] = [];
      for (const [qId, srvAns] of Object.entries(conflicts)) {
        const sentAns = snapshot[qId];
        if (sentAns && srvAns.serverRevision > sentAns.revision) {
          supersededIds.push(qId);
        }
      }
      if (supersededIds.length > 0) {
        setAnswers((curr) => {
          const next = { ...curr };
          for (const qId of supersededIds) {
            const srvAns = conflicts[qId];
            if (!srvAns) continue;
            if (
              !pendingQueueRef.current[qId] ||
              pendingQueueRef.current[qId].revision < srvAns.serverRevision
            ) {
              next[qId] = {
                selectedOptionIds: srvAns.selectedOptionIds,
                writtenText: srvAns.writtenText,
                markedForReview: srvAns.markedForReview,
                revision: srvAns.serverRevision,
              };
            }
          }
          return next;
        });
        setConflictNotice(
          "A newer answer saved from another session was kept for one or more questions."
        );
      }

      const remaining = { ...pendingQueueRef.current };
      for (const [qId, sentAns] of entries) {
        const floorRev = Math.max(
          sentAns.revision,
          conflicts[qId]?.serverRevision ?? 0
        );
        if (remaining[qId] && remaining[qId].revision <= floorRev) {
          delete remaining[qId];
        }
      }
      pendingQueueRef.current = remaining;
      setPendingQueue(remaining);

      offlineSinceRef.current = null;
      retryDelayRef.current = 3000;

      if (Object.keys(remaining).length === 0) {
        await clearOfflineState(attemptId);
        setSyncStatus("synced");
      } else {
        await saveOfflineState({
          attemptId,
          queue: toQueuedRecord(remaining),
          offlineSinceMs: null,
          lastSyncError: null,
          updatedAtMs: Date.now(),
        });
        setSyncStatus("offline_queued");
      }
      setLastSyncedAt(new Date().toLocaleTimeString());
      return Object.keys(remaining).length === 0;
    } catch (err) {
      const reason =
        err instanceof DOMException && err.name === "AbortError"
          ? "timeout"
          : "offline";
      enterOutageLock(reason);
      return false;
    } finally {
      clearTimeout(timeoutId);
      flushInFlightRef.current = false;
      if (needsReflushRef.current) {
        needsReflushRef.current = false;
        void flushQueue();
      }
    }
  }, [attemptId, isSandbox, applyServerTiming, enterOutageLock]);

  const sendHeartbeat = useCallback(async () => {
    if (
      !attemptId ||
      isSandbox ||
      submittedNotice ||
      heartbeatInFlightRef.current
    ) {
      return;
    }
    heartbeatInFlightRef.current = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(`/api/attempts/${attemptId}/heartbeat`, {
        method: "POST",
        signal: controller.signal,
      });
      if (res.status === 409) {
        const d = (await res.json()) as { error?: string };
        pendingQueueRef.current = {};
        setPendingQueue({});
        offlineSinceRef.current = null;
        setConnectionLost(false);
        setDisconnectReason(null);
        await clearOfflineState(attemptId);
        setSubmittedNotice(d.error ?? "Time limit expired; attempt finalized.");
        return;
      }
      if (!res.ok) {
        enterOutageLock("sync_error");
        return;
      }
      const data = (await res.json()) as {
        serverNow?: string;
        serverExpiresAt?: string;
        autoPausedMs?: number;
        autoPauseCapMs?: number;
        creditedMs?: number;
      };
      setOnline(true);
      setConnectionLost(false);
      setDisconnectReason(null);
      applyServerTiming(data);
      if (Object.keys(pendingQueueRef.current).length > 0) {
        void flushQueue();
      }
    } catch (err) {
      const reason =
        err instanceof DOMException && err.name === "AbortError"
          ? "timeout"
          : "offline";
      enterOutageLock(reason);
    } finally {
      clearTimeout(timeoutId);
      heartbeatInFlightRef.current = false;
    }
  }, [
    attemptId,
    isSandbox,
    submittedNotice,
    applyServerTiming,
    enterOutageLock,
    flushQueue,
  ]);

  useEffect(() => {
    if (loading || isSandbox || !attemptId || submittedNotice) return;
    const intervalMs = isLocked ? 3000 : 5000;
    const timer = setInterval(() => {
      void sendHeartbeat();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [loading, isSandbox, attemptId, submittedNotice, isLocked, sendHeartbeat]);

  useEffect(() => {
    if (
      !loading &&
      !isSandbox &&
      attemptId &&
      navigator.onLine &&
      Object.keys(pendingQueueRef.current).length > 0
    ) {
      void flushQueue();
    }
  }, [loading, isSandbox, attemptId, flushQueue]);

  useEffect(() => {
    const isNowOnline = navigator.onLine;
    setOnline(isNowOnline);
    if (!isNowOnline && !isSandbox) {
      enterOutageLock("offline");
    }
    const onOnline = () => {
      setOnline(true);
      retryDelayRef.current = 3000;
      void sendHeartbeat();
    };
    const onOffline = () => {
      setOnline(false);
      if (!isSandbox) {
        enterOutageLock("offline");
      }
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [attemptId, isSandbox, enterOutageLock, sendHeartbeat]);

  // Exponential backoff retry for silent WAN drops when navigator.onLine stays true
  useEffect(() => {
    if (
      isSandbox ||
      !attemptId ||
      !online ||
      Object.keys(pendingQueue).length === 0 ||
      (syncStatus !== "offline_queued" && syncStatus !== "error")
    ) {
      return;
    }
    const delay = retryDelayRef.current;
    const timer = setTimeout(() => {
      retryDelayRef.current = Math.min(15_000, delay * 2);
      void flushQueue();
    }, delay);
    return () => clearTimeout(timer);
  }, [online, syncStatus, attemptId, isSandbox, pendingQueue, flushQueue]);

  // Non-punitive tab-blur visibility signal
  useEffect(() => {
    if (!attemptId || isSandbox) return;
    const onVisibility = () => {
      if (document.hidden && navigator.onLine && !isLockedRef.current) {
        fetch(`/api/attempts/${attemptId}/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            updates: [],
            incident: {
              type: "tab_blur",
              detail: "Candidate switched away from examination tab.",
            },
          }),
        }).catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [attemptId, isSandbox]);

  // Keyboard shortcuts Alt+ArrowLeft / Alt+ArrowRight (blocked while connection locked)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || isLockedRef.current) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToQuestion(activeIndex - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goToQuestion(activeIndex + 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, goToQuestion]);

  useEffect(() => {
    if (!expiresAtMs || submittedNotice || isLocked) return;
    let preExpiryFlushed = false;
    const tick = () => {
      const ms = Math.max(0, expiresAtMs - (Date.now() + serverDeltaMs));
      setRemainingMs(ms);
      if (
        !preExpiryFlushed &&
        ms <= 1500 &&
        ms > 0 &&
        !isSandbox &&
        attemptId &&
        !isLockedRef.current &&
        Object.keys(pendingQueueRef.current).length > 0
      ) {
        preExpiryFlushed = true;
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        void flushQueue();
      }
      if (ms === 0) {
        clearInterval(timer);
        if (!isSandbox && attemptId) {
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          const finalize = async () => {
            if (!isLockedRef.current && Object.keys(pendingQueueRef.current).length > 0) {
              await flushQueue();
            }
            const res = await fetch(`/api/attempts/${attemptId}/submit`, {
              method: "POST",
            });
            if (res.ok || res.status === 409) {
              setShowReviewModal(false);
              setSubmittedNotice(
                "Time expired. Attempt finalized using accepted answers."
              );
            }
          };
          finalize().catch(() => {});
        } else if (isSandbox) {
          setShowReviewModal(false);
          setSubmittedNotice("Sandbox preview timer completed.");
        }
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [
    expiresAtMs,
    serverDeltaMs,
    attemptId,
    isSandbox,
    submittedNotice,
    isLocked,
    flushQueue,
  ]);

  useEffect(() => {
    if (!examMeta) return;
    const applyServerDeadline = (
      serverExpiresIso: string | undefined,
      serverNowIso?: string,
      graceMinutes?: number,
      nextAutoPausedMs?: number,
      nextAutoPauseCapMs?: number
    ) => {
      applyServerTiming({
        serverNow: serverNowIso,
        serverExpiresAt: serverExpiresIso,
        graceMinutes,
        autoPausedMs: nextAutoPausedMs,
        autoPauseCapMs: nextAutoPauseCapMs,
      });
    };

    const loadAnn = () => {
      const qs = new URLSearchParams({ examId: examMeta.id });
      if (attemptId && !isSandbox) qs.set("attemptId", attemptId);
      fetch(`/api/monitor?${qs.toString()}`)
        .then((r) => (r.ok ? r.json() : null))
        .then(
          (
            d: {
              announcements?: AnnouncementItem[];
              serverNow?: string;
              attemptState?: {
                id: string;
                status: string;
                serverExpiresAt: string;
                autoPausedMs?: number;
                autoPauseCapMs?: number;
              } | null;
            } | null
          ) => {
            if (d?.announcements) setAnnouncements(d.announcements);
            if (d?.attemptState) {
              applyServerDeadline(
                d.attemptState.serverExpiresAt,
                d.serverNow,
                undefined,
                d.attemptState.autoPausedMs,
                d.attemptState.autoPauseCapMs
              );
            }
          }
        )
        .catch(() => {});
    };
    loadAnn();
    const t = setInterval(loadAnn, 6000);

    const supa = getSupabaseBrowserClient();
    const channel = supa
      ? supa
          .channel(`exam:${examMeta.id}:events`)
          .on("broadcast", { event: "announcement" }, () => loadAnn())
          .on(
            "broadcast",
            { event: "attempt_grace_granted" },
            (msg: {
              payload?: {
                attemptId?: string;
                serverExpiresAt?: string;
                graceMinutes?: number;
              };
            }) => {
              const p = msg.payload;
              if (p?.attemptId === attemptId && p.serverExpiresAt) {
                applyServerDeadline(
                  p.serverExpiresAt,
                  undefined,
                  p.graceMinutes
                );
              }
            }
          )
          .subscribe()
      : null;

    return () => {
      clearInterval(t);
      if (supa && channel) supa.removeChannel(channel);
    };
  }, [examMeta, attemptId, isSandbox, applyServerTiming]);

  function commitAnswerChange(
    questionId: string,
    updater: (prev: LocalAnswerState) => LocalAnswerState,
    debounceMs = 0
  ) {
    if (!isSandbox && isLockedRef.current) return;
    setAnswers((curr) => {
      const prev = curr[questionId] ?? {
        selectedOptionIds: [],
        writtenText: "",
        markedForReview: false,
        revision: 0,
      };
      const nextAns: LocalAnswerState = {
        ...updater(prev),
        revision: prev.revision + 1,
      };

      if (!isSandbox) {
        const nextQueue = { ...pendingQueueRef.current, [questionId]: nextAns };
        pendingQueueRef.current = nextQueue;
        setPendingQueue(nextQueue);
        void saveOfflineState({
          attemptId,
          queue: toQueuedRecord(nextQueue),
          offlineSinceMs: offlineSinceRef.current,
          lastSyncError: null,
          updatedAtMs: Date.now(),
        });

        if (online) {
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          if (debounceMs > 0) {
            debounceTimerRef.current = setTimeout(() => {
              void flushQueue();
            }, debounceMs);
          } else {
            void flushQueue();
          }
        } else {
          if (offlineSinceRef.current === null) {
            offlineSinceRef.current = Date.now();
          }
          setSyncStatus("offline_queued");
        }
      }

      return { ...curr, [questionId]: nextAns };
    });
  }

  async function handleSubmitAttempt() {
    setError(null);
    if (isSandbox) {
      setShowReviewModal(false);
      setSubmittedNotice(
        `Sandbox preview completed (${answeredTotal} of ${items.length} answered). Zero records were saved.`
      );
      return;
    }
    if (isLocked) {
      setError("Restore network connection to sync answers before submitting.");
      return;
    }
    try {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (Object.keys(pendingQueueRef.current).length > 0) {
        const flushed = await flushQueue();
        if (!flushed || Object.keys(pendingQueueRef.current).length > 0) {
          setError(
            "Unsynced answers remain queued locally. Wait for sync before submitting."
          );
          return;
        }
      }
      const res = await fetch(`/api/attempts/${attemptId}/submit`, {
        method: "POST",
      });
      if (res.ok) {
        await clearOfflineState(attemptId);
        router.push("/candidate");
      } else {
        let message = "Submission failed";
        try {
          const err = (await res.json()) as { error?: string };
          if (err.error) message = err.error;
        } catch {}
        setError(message);
      }
    } catch {
      setError("Network error while submitting attempt.");
    }
  }

  function persistCanvas() {
    if (!canvasRef.current || !attemptId) return;
    try {
      localStorage.setItem(
        `examguard_scratch_canvas_${attemptId}`,
        canvasRef.current.toDataURL("image/png")
      );
    } catch {}
  }

  function getCanvasCoords(
    canvas: HTMLCanvasElement,
    e: React.PointerEvent<HTMLCanvasElement>
  ) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / (rect.width || 1);
    const scaleY = canvas.height / (rect.height || 1);
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { x, y } = getCanvasCoords(canvas, e);
    ctx.strokeStyle =
      prefs.theme === "dark" || prefs.theme === "high-contrast"
        ? "#FFFFFF"
        : "#0F172A";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawingRef.current = true;
  }

  function moveDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCanvasCoords(canvasRef.current, e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function endDraw() {
    if (drawingRef.current) {
      drawingRef.current = false;
      persistCanvas();
    }
  }

  function clearCanvas() {
    const c = canvasRef.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    if (attemptId) {
      try {
        localStorage.removeItem(`examguard_scratch_canvas_${attemptId}`);
      } catch {}
    }
  }

  function clearNotes() {
    setScratchNotes("");
    if (attemptId) {
      try {
        localStorage.removeItem(`examguard_scratch_${attemptId}`);
      } catch {}
    }
  }

  const currentItem = items[activeIndex];
  const currentAns = currentItem
    ? answers[currentItem.questionId] ?? {
        selectedOptionIds: [],
        writtenText: "",
        markedForReview: false,
        revision: 0,
      }
    : null;

  const answeredTotal = items.filter((item) => {
    const a = answers[item.questionId];
    if (!a) return false;
    return item.type === "written"
      ? a.writtenText.trim().length > 0
      : a.selectedOptionIds.length > 0;
  }).length;
  const reviewTotal = items.filter(
    (item) => answers[item.questionId]?.markedForReview
  ).length;
  const unansweredTotal = items.length - answeredTotal;

  const isDark = prefs.theme === "dark";
  const isHC = prefs.theme === "high-contrast";
  const shellBg = isHC
    ? "bg-black text-white"
    : isDark
      ? "bg-[#0F172A] text-[#F8FAFC]"
      : "bg-[#F6F8FA] text-[#0F172A]";
  const cardBg = isHC
    ? "border-white/50 bg-[#0A0A0A] text-white"
    : isDark
      ? "border-white/15 bg-[#1E293B] text-[#F8FAFC]"
      : "border-[rgba(15,23,42,0.10)] bg-white text-[#0F172A]";
  const fontSizeClass =
    prefs.fontSize === "lg"
      ? "text-lg"
      : prefs.fontSize === "sm"
        ? "text-sm"
        : "text-base";

  if (loading) {
    return (
      <main
        id="main-content"
        className="flex min-h-screen flex-col items-center justify-center bg-[#F6F8FA] px-4 text-center"
      >
        <h1 className="text-lg font-semibold text-[#0F172A]">
          Preparing examination workspace
        </h1>
        <p className="mt-1 text-sm text-[#475569]">
          Loading snapshot items and server timer...
        </p>
      </main>
    );
  }

  if (error && !examMeta) {
    return (
      <main id="main-content" className="mx-auto max-w-xl px-4 py-16">
        <div className="rounded-xl border border-[#B91C1C]/30 bg-white p-6">
          <div className="flex items-center gap-2 text-[#B91C1C]">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
            <h1 className="text-lg font-semibold">Access restricted</h1>
          </div>
          <p className="mt-2 text-sm text-[#475569]">{error}</p>
          <Link
            href="/"
            className="mt-4 inline-flex min-h-[40px] cursor-pointer items-center rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF]"
          >
            Return home
          </Link>
        </div>
      </main>
    );
  }

  const navOrderClass =
    prefs.navSide === "right" ? "lg:order-3" : "lg:order-1";
  const mainOrderClass = "lg:order-2";

  return (
    <div data-theme={prefs.theme} className={`min-h-screen ${shellBg}`}>
      <header
        className={`sticky top-0 z-30 border-b ${
          isHC
            ? "border-white/40 bg-black"
            : isDark
              ? "border-white/15 bg-[#0F172A]"
              : "border-[rgba(15,23,42,0.10)] bg-white"
        }`}
      >
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-3 py-2.5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-3 lg:py-3">
          <div className="flex min-w-0 items-center justify-between gap-2 lg:flex-1 lg:justify-start">
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 rounded-md bg-[#1D4ED8] px-2 py-0.5 font-mono text-xs font-semibold text-white">
                {examMeta?.code}
              </span>
              {isSandbox && (
                <span className="hidden shrink-0 rounded-md border border-[#B45309]/40 bg-[#FFFBEB] px-2 py-0.5 text-xs font-medium text-[#B45309] sm:inline-block">
                  Sandbox preview
                </span>
              )}
              <h1 className="truncate text-sm font-semibold sm:text-base">
                {examMeta?.title}
              </h1>
            </div>

            {/* Timer always pinned top-right on mobile */}
            <div
              aria-live="polite"
              className={`inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-mono text-sm font-semibold tabular-nums lg:hidden ${
                isLocked
                  ? "bg-[#B45309] text-white"
                  : remainingMs < 120_000
                    ? "bg-[#B91C1C] text-white"
                    : "bg-[#0F172A] text-white"
              }`}
            >
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{formatCountdown(remainingMs)}</span>
              {isLocked && (
                <span className="rounded bg-black/25 px-1.5 py-0.5 text-[10px] font-bold tracking-wide">
                  PAUSED
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <div
              role="status"
              aria-live="polite"
              className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium sm:min-h-[40px] sm:py-1.5 ${
                isLocked ||
                syncStatus === "offline_queued" ||
                syncStatus === "error"
                  ? "border-[#B91C1C]/40 bg-[#FEF2F2] text-[#B91C1C]"
                  : syncStatus === "syncing"
                    ? "border-[#B45309]/40 bg-[#FFFBEB] text-[#B45309]"
                    : "border-[#0F766E]/30 bg-[#F0FDFA] text-[#0F766E]"
              }`}
            >
              {!isLocked ? (
                <Wifi className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>
                {isLocked ? (
                  <>
                    {disconnectReason === "timeout"
                      ? "Timed out"
                      : "Offline locked"}{" "}
                    (
                    <span className="font-mono tabular-nums">
                      {Object.keys(pendingQueue).length}
                    </span>{" "}
                    queued)
                  </>
                ) : syncStatus === "syncing" ? (
                  "Saving..."
                ) : syncStatus === "offline_queued" || syncStatus === "error" ? (
                  <>
                    Pending (
                    <span className="font-mono tabular-nums">
                      {Object.keys(pendingQueue).length}
                    </span>
                    )
                  </>
                ) : lastSyncedAt ? (
                  <>
                    Saved{" "}
                    <span className="hidden font-mono tabular-nums sm:inline">
                      {lastSyncedAt}
                    </span>
                  </>
                ) : (
                  "Saved"
                )}
              </span>
            </div>

            {(isLocked ||
              syncStatus === "offline_queued" ||
              syncStatus === "error") &&
              !isSandbox && (
                <button
                  type="button"
                  onClick={() => (isLocked ? sendHeartbeat() : flushQueue())}
                  className="inline-flex min-h-[38px] cursor-pointer items-center gap-1 rounded-lg border border-[#1D4ED8]/40 bg-[#EFF6FF] px-2.5 py-1 text-xs font-medium text-[#1D4ED8] sm:min-h-[40px] sm:px-3 sm:py-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{isLocked ? "Check" : "Retry"}</span>
                </button>
              )}

            <button
              type="button"
              aria-expanded={showScratchpad}
              disabled={isLocked}
              onClick={() => setShowScratchpad((v) => !v)}
              className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-lg border border-current/20 px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-[40px] sm:px-3 sm:py-1.5"
            >
              <PenTool className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Scratchpad</span>
            </button>

            <button
              type="button"
              aria-expanded={showPrefs}
              onClick={() => setShowPrefs((v) => !v)}
              className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-lg border border-current/20 px-2.5 py-1 text-xs font-medium sm:min-h-[40px] sm:px-3 sm:py-1.5"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Display</span>
            </button>

            <div
              aria-live="polite"
              className={`hidden min-h-[40px] items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-sm font-semibold tabular-nums lg:inline-flex ${
                isLocked
                  ? "bg-[#B45309] text-white"
                  : remainingMs < 120_000
                    ? "bg-[#B91C1C] text-white"
                    : "bg-[#0F172A] text-white"
              }`}
            >
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{formatCountdown(remainingMs)}</span>
              {isLocked && (
                <span className="rounded bg-black/25 px-1.5 py-0.5 text-[10px] font-bold tracking-wide">
                  PAUSED
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      {isLocked && (
        <div
          role="alert"
          className="border-b border-[#B91C1C]/30 bg-[#FEF2F2] px-4 py-2 text-xs text-[#B91C1C] sm:px-6"
        >
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2">
            <span>
              {disconnectReason === "timeout"
                ? "Server connection timed out."
                : "Connection lost."}{" "}
              Timer paused and question switching locked until connection
              returns. Buffered answers remain saved in your local queue.
            </span>
            <span className="font-mono tabular-nums font-medium">
              Outage budget:{" "}
              {Math.round(autoPausedMs / 1000)}s /{" "}
              {Math.round(autoPauseCapMs / 1000)}s
            </span>
          </div>
        </div>
      )}

      {showPrefs && (
        <div
          className={`border-b px-4 py-3 sm:px-6 ${
            isDark || isHC
              ? "border-white/15 bg-[#1E293B] text-white"
              : "border-[rgba(15,23,42,0.10)] bg-[#EEF2F6] text-[#0F172A]"
          }`}
        >
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 text-xs sm:gap-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">Text size</span>
              {(
                [
                  ["sm", "Small"],
                  ["md", "Medium"],
                  ["lg", "Large"],
                ] as const
              ).map(([sz, label]) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => updatePrefs({ ...prefs, fontSize: sz })}
                  className={`min-h-[36px] cursor-pointer rounded-md border px-2.5 py-1 font-medium ${
                    prefs.fontSize === sz
                      ? "border-[#1D4ED8] bg-[#1D4ED8] text-white"
                      : "border-current/20"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">Theme</span>
              {(
                [
                  ["paper", "Paper"],
                  ["dark", "Dark"],
                  ["high-contrast", "High contrast"],
                ] as const
              ).map(([th, label]) => (
                <button
                  key={th}
                  type="button"
                  onClick={() => updatePrefs({ ...prefs, theme: th })}
                  className={`min-h-[36px] cursor-pointer rounded-md border px-2.5 py-1 font-medium ${
                    prefs.theme === th
                      ? "border-[#1D4ED8] bg-[#1D4ED8] text-white"
                      : "border-current/20"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="hidden items-center gap-2 lg:flex">
              <span className="font-semibold">Navigator side</span>
              {(["left", "right"] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => updatePrefs({ ...prefs, navSide: side })}
                  className={`min-h-[36px] cursor-pointer rounded-md border px-2.5 py-1 font-medium capitalize ${
                    prefs.navSide === side
                      ? "border-[#1D4ED8] bg-[#1D4ED8] text-white"
                      : "border-current/20"
                  }`}
                >
                  {side}
                </button>
              ))}
            </div>
            <label className="hidden cursor-pointer items-center gap-1.5 font-medium lg:flex">
              <input
                type="checkbox"
                checked={prefs.compactNav}
                onChange={(e) =>
                  updatePrefs({ ...prefs, compactNav: e.target.checked })
                }
              />
              <span>Compact navigator</span>
            </label>
          </div>
        </div>
      )}

      {announcements.length > 0 && (
        <div className="border-b border-[#1D4ED8]/20 bg-[#EFF6FF] px-4 py-2 text-xs text-[#0F172A] sm:px-6">
          <div className="mx-auto max-w-[1440px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bell
                  className="h-3.5 w-3.5 shrink-0 text-[#1D4ED8]"
                  aria-hidden="true"
                />
                <span>
                  <span className="font-semibold">Announcement:</span>{" "}
                  {announcements[0].message}
                </span>
              </div>
              {announcements.length > 1 && (
                <button
                  type="button"
                  onClick={() => setShowAllAnnouncements((v) => !v)}
                  className="cursor-pointer font-medium text-[#1D4ED8] underline"
                >
                  {showAllAnnouncements
                    ? "Hide earlier"
                    : `+${announcements.length - 1} earlier`}
                </button>
              )}
            </div>
            {showAllAnnouncements && announcements.length > 1 && (
              <ul className="mt-2 space-y-1 border-t border-[#1D4ED8]/15 pt-2 text-xs text-[#334155]">
                {announcements.slice(1).map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span>{a.message}</span>
                    <span className="font-mono tabular-nums text-[#64748B]">
                      {new Date(a.createdAt).toLocaleTimeString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <main
        id="main-content"
        className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6"
      >
        {error && (
          <div
            role="alert"
            className="mb-4 flex items-center gap-2 rounded-lg border border-[#B91C1C]/30 bg-[#FEF2F2] p-3 text-sm text-[#B91C1C]"
          >
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}
        {graceNotice && (
          <div
            role="status"
            className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-[#0F766E]/30 bg-[#F0FDFA] p-3 text-sm text-[#0F766E]"
          >
            <span>{graceNotice}</span>
            <button
              type="button"
              onClick={() => setGraceNotice(null)}
              className="cursor-pointer text-xs font-medium underline"
            >
              Dismiss
            </button>
          </div>
        )}
        {conflictNotice && (
          <div
            role="status"
            className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-[#B45309]/30 bg-[#FFFBEB] p-3 text-sm text-[#B45309]"
          >
            <span>{conflictNotice}</span>
            <button
              type="button"
              onClick={() => setConflictNotice(null)}
              className="cursor-pointer text-xs font-medium underline"
            >
              Dismiss
            </button>
          </div>
        )}
        {submittedNotice ? (
          <div className="mx-auto max-w-xl rounded-xl border border-[#0F766E]/30 bg-white p-8 text-[#0F172A]">
            <div className="flex items-center gap-2 text-[#0F766E]">
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              <h2 className="text-lg font-semibold">Examination concluded</h2>
            </div>
            <p className="mt-2 text-sm text-[#475569]">{submittedNotice}</p>
            <Link
              href={isSandbox ? "/examiner" : "/candidate"}
              className="mt-5 inline-flex min-h-[40px] cursor-pointer items-center rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF]"
            >
              Return to portal
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-12">
            <aside
              className={`order-2 rounded-xl border p-4 ${navOrderClass} ${
                prefs.compactNav ? "lg:col-span-3" : "lg:col-span-4"
              } ${cardBg}`}
            >
              <h2 className="text-xs font-semibold opacity-80">
                Questions (
                <span className="font-mono tabular-nums">
                  {answeredTotal}/{items.length}
                </span>{" "}
                answered)
              </h2>
              <div className="mt-3 grid grid-cols-5 gap-2">
                {items.map((item, idx) => {
                  const ans = answers[item.questionId];
                  const hasAnswer =
                    ans &&
                    (item.type === "written"
                      ? ans.writtenText.trim().length > 0
                      : ans.selectedOptionIds.length > 0);
                  const isReview = ans?.markedForReview;
                  const isCurrent = idx === activeIndex;
                  const statusLabel = isReview
                    ? "marked for review"
                    : hasAnswer
                      ? "answered"
                      : "unanswered";

                  return (
                    <button
                      key={item.questionId}
                      type="button"
                      disabled={isLocked}
                      aria-label={`Question ${item.order}, ${statusLabel}`}
                      aria-current={isCurrent ? "step" : undefined}
                      onClick={() => goToQuestion(idx)}
                      className={`min-h-[40px] cursor-pointer rounded-md border font-mono text-xs font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                        isCurrent
                          ? "border-[#1D4ED8] ring-2 ring-[#1D4ED8]"
                          : "border-current/20"
                      } ${
                        isReview
                          ? "bg-[#FFFBEB] text-[#B45309]"
                          : hasAnswer
                            ? "bg-[#0F766E] text-white"
                            : ""
                      }`}
                    >
                      {String(item.order).padStart(2, "0")}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap gap-3 text-xs opacity-80">
                <span>Teal: Answered</span>
                <span>Amber: Review</span>
              </div>

              {isLocked && (
                <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-[#B45309]/35 bg-[#FFFBEB] px-2.5 py-2 text-xs text-[#B45309]">
                  <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Question switching locked while offline.</span>
                </p>
              )}

              <button
                type="button"
                disabled={isLocked}
                onClick={() => setShowReviewModal(true)}
                className="mt-6 min-h-[42px] w-full cursor-pointer rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isSandbox ? "Finish sandbox" : "Review and submit"}
              </button>
            </aside>

            <section
              className={`order-1 rounded-xl border p-4 sm:p-6 ${mainOrderClass} ${
                showScratchpad && !isLocked
                  ? "lg:col-span-5"
                  : prefs.compactNav
                    ? "lg:col-span-9"
                    : "lg:col-span-8"
              } ${cardBg}`}
            >
              {isLocked ? (
                <div
                  role="alert"
                  className="mx-auto max-w-lg py-10 text-center"
                >
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#B91C1C]/30 bg-[#FEF2F2] text-[#B91C1C]">
                    <Lock className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold">
                    Connection lost — workspace locked
                  </h2>
                  <p className="mt-2 text-sm opacity-80">
                    {disconnectReason === "timeout"
                      ? "Your connection timed out waiting for the server."
                      : "Your internet connection dropped."}{" "}
                    Your countdown timer is paused and question navigation is
                    locked until the server connection returns.
                  </p>
                  <p className="mt-3 text-xs opacity-75">
                    Local safety queue:{" "}
                    <span className="font-mono font-semibold tabular-nums">
                      {Object.keys(pendingQueue).length}
                    </span>{" "}
                    pending update(s) preserved in IndexedDB.
                  </p>
                  <p className="mt-1 text-xs opacity-75">
                    Auto-pause budget:{" "}
                    <span className="font-mono font-semibold tabular-nums">
                      {Math.round(autoPausedMs / 1000)}s /{" "}
                      {Math.round(autoPauseCapMs / 1000)}s
                    </span>
                    {autoPausedMs >= autoPauseCapMs
                      ? " (budget exhausted — contact examiner for verified outage grace)"
                      : ""}
                  </p>
                  <button
                    type="button"
                    onClick={() => sendHeartbeat()}
                    className="mt-5 inline-flex min-h-[42px] cursor-pointer items-center gap-2 rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF]"
                  >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    <span>Reconnect now</span>
                  </button>
                </div>
              ) : (
                currentItem &&
                currentAns && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-current/15 pb-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-semibold tabular-nums">
                        {String(currentItem.order).padStart(2, "0")} /{" "}
                        {String(items.length).padStart(2, "0")}
                      </span>
                      <span className="rounded-md border border-current/15 px-2 py-0.5 opacity-85">
                        {currentItem.topic}
                      </span>
                      <span className="rounded-md border border-current/15 px-2 py-0.5 capitalize opacity-85">
                        {currentItem.difficulty}
                      </span>
                      <span className="font-mono font-semibold tabular-nums">
                        {currentItem.marks} marks
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        commitAnswerChange(currentItem.questionId, (prev) => ({
                          ...prev,
                          markedForReview: !prev.markedForReview,
                        }))
                      }
                      className={`inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${
                        currentAns.markedForReview
                          ? "border-[#B45309]/40 bg-[#FFFBEB] text-[#B45309]"
                          : "border-current/20"
                      }`}
                    >
                      <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        {currentAns.markedForReview
                          ? "Marked for review"
                          : "Mark for review"}
                      </span>
                    </button>
                  </div>

                  <h2 className="mt-4 text-lg font-semibold">
                    {currentItem.title}
                  </h2>
                  <p className={`mt-2 max-w-[68ch] ${fontSizeClass}`}>
                    {currentItem.prompt}
                  </p>

                  {currentItem.type === "written" ? (
                    <div className="mt-5">
                      <label
                        htmlFor="written-ans"
                        className="block text-xs font-medium opacity-80"
                      >
                        Written response
                      </label>
                      <textarea
                        id="written-ans"
                        rows={7}
                        value={currentAns.writtenText}
                        onChange={(e) => {
                          const val = e.target.value;
                          commitAnswerChange(
                            currentItem.questionId,
                            (prev) => ({
                              ...prev,
                              writtenText: val,
                            }),
                            500
                          );
                        }}
                        placeholder="Type your response here. Edits save automatically."
                        className={`mt-1.5 w-full rounded-lg border border-current/25 bg-transparent p-3 ${fontSizeClass}`}
                      />
                    </div>
                  ) : (
                    <div className="mt-5 space-y-2.5">
                      {currentItem.options.map((opt) => {
                        const checked = currentAns.selectedOptionIds.includes(
                          opt.id
                        );
                        return (
                          <label
                            key={opt.id}
                            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors ${
                              checked
                                ? "border-[#1D4ED8] bg-[#1D4ED8]/10"
                                : "border-current/20 hover:border-current/40"
                            }`}
                          >
                            <input
                              type={
                                currentItem.type === "single_mcq"
                                  ? "radio"
                                  : "checkbox"
                              }
                              name={`q-${currentItem.questionId}`}
                              checked={checked}
                              onChange={() => {
                                commitAnswerChange(
                                  currentItem.questionId,
                                  (prev) => {
                                    if (currentItem.type === "single_mcq") {
                                      return {
                                        ...prev,
                                        selectedOptionIds: [opt.id],
                                      };
                                    }
                                    const exists =
                                      prev.selectedOptionIds.includes(opt.id);
                                    return {
                                      ...prev,
                                      selectedOptionIds: exists
                                        ? prev.selectedOptionIds.filter(
                                            (id) => id !== opt.id
                                          )
                                        : [...prev.selectedOptionIds, opt.id],
                                    };
                                  }
                                );
                              }}
                              className="mt-1"
                            />
                            <span className={fontSizeClass}>{opt.text}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-6 flex items-center justify-between gap-2 border-t border-current/15 pt-4">
                    <button
                      type="button"
                      disabled={activeIndex === 0 || isLocked}
                      onClick={() => goToQuestion(activeIndex - 1)}
                      className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-lg border border-current/20 px-3.5 py-2 text-sm font-medium disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                      <span>Previous</span>
                      <kbd className="hidden rounded-md border border-current/20 px-1.5 py-0.5 font-mono text-xs sm:inline">
                        Alt+Left
                      </kbd>
                    </button>
                    <button
                      type="button"
                      disabled={activeIndex === items.length - 1 || isLocked}
                      onClick={() => goToQuestion(activeIndex + 1)}
                      className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-lg border border-current/20 px-3.5 py-2 text-sm font-medium disabled:opacity-40"
                    >
                      <span>Next</span>
                      <kbd className="hidden rounded-md border border-current/20 px-1.5 py-0.5 font-mono text-xs sm:inline">
                        Alt+Right
                      </kbd>
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                )
              )}
            </section>

            {showScratchpad && !isLocked && (
              <aside
                className={`rounded-xl border p-4 lg:order-4 ${
                  prefs.compactNav ? "lg:col-span-4" : "lg:col-span-3"
                } ${cardBg}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xs font-semibold">Digital scratchpad</h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={clearNotes}
                      className="cursor-pointer text-xs underline opacity-80"
                    >
                      Clear notes
                    </button>
                    <button
                      type="button"
                      onClick={clearCanvas}
                      className="cursor-pointer text-xs underline opacity-80"
                    >
                      Clear drawing
                    </button>
                  </div>
                </div>
                <textarea
                  aria-label="Scratchpad notes"
                  rows={5}
                  value={scratchNotes}
                  onChange={(e) => {
                    const val = e.target.value;
                    setScratchNotes(val);
                    try {
                      localStorage.setItem(
                        `examguard_scratch_${attemptId}`,
                        val
                      );
                    } catch {}
                  }}
                  placeholder="Rough notes (persisted locally)"
                  className="mt-2 w-full rounded-lg border border-current/20 bg-transparent p-2 text-xs"
                />
                <canvas
                  ref={canvasRef}
                  aria-label="Scratchpad drawing canvas"
                  width={260}
                  height={200}
                  onPointerDown={startDraw}
                  onPointerMove={moveDraw}
                  onPointerUp={endDraw}
                  onPointerLeave={endDraw}
                  className="mt-2 w-full cursor-crosshair touch-none rounded-lg border border-current/20"
                />
              </aside>
            )}
          </div>
        )}

        {/* Pre-Submission Review Modal */}
        {showReviewModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-submit-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/45 p-4"
          >
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[rgba(15,23,42,0.14)] bg-white p-4 text-[#0F172A] sm:p-6">
              <h2
                id="review-submit-title"
                className="text-lg font-semibold text-[#0F172A]"
              >
                {isSandbox
                  ? "Finish sandbox preview"
                  : "Review before final submission"}
              </h2>
              <p className="mt-1 text-sm text-[#475569]">
                Click any question index to jump back before finalizing
              </p>

              {error && (
                <div
                  role="alert"
                  className="mt-4 flex items-center gap-2 rounded-lg border border-[#B91C1C]/30 bg-[#FEF2F2] p-3 text-xs text-[#B91C1C]"
                >
                  <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg border border-[#0F766E]/25 bg-[#F0FDFA] p-3">
                  <dt className="text-xs text-[#0F766E]">Answered</dt>
                  <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-[#0F766E]">
                    {answeredTotal}
                  </dd>
                </div>
                <div className="rounded-lg border border-[rgba(15,23,42,0.12)] bg-[#F6F8FA] p-3">
                  <dt className="text-xs text-[#475569]">Unanswered</dt>
                  <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-[#0F172A]">
                    {unansweredTotal}
                  </dd>
                </div>
                <div className="rounded-lg border border-[#B45309]/25 bg-[#FFFBEB] p-3">
                  <dt className="text-xs text-[#B45309]">Review flagged</dt>
                  <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-[#B45309]">
                    {reviewTotal}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-6">
                {items.map((item, idx) => {
                  const ans = answers[item.questionId];
                  const hasAnswer =
                    ans &&
                    (item.type === "written"
                      ? ans.writtenText.trim().length > 0
                      : ans.selectedOptionIds.length > 0);
                  const isRev = ans?.markedForReview;
                  return (
                    <button
                      key={item.questionId}
                      type="button"
                      disabled={isLocked}
                      onClick={() => {
                        goToQuestion(idx);
                        setShowReviewModal(false);
                        setError(null);
                      }}
                      className={`min-h-[40px] cursor-pointer rounded-md border font-mono text-xs font-medium tabular-nums ${
                        isRev
                          ? "border-[#B45309]/40 bg-[#FFFBEB] text-[#B45309]"
                          : hasAnswer
                            ? "border-[#0F766E]/30 bg-[#F0FDFA] text-[#0F766E]"
                            : "border-[rgba(15,23,42,0.14)] bg-[#F6F8FA] text-[#64748B]"
                      }`}
                    >
                      {String(item.order).padStart(2, "0")}
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowReviewModal(false);
                    setError(null);
                  }}
                  className="min-h-[44px] w-full cursor-pointer rounded-lg border border-[rgba(15,23,42,0.14)] px-4 py-2 text-sm font-medium text-[#0F172A] transition-colors hover:bg-[#EEF2F6] sm:min-h-[40px] sm:w-auto"
                >
                  Back to exam
                </button>
                <button
                  type="button"
                  onClick={handleSubmitAttempt}
                  className="min-h-[44px] w-full cursor-pointer rounded-lg bg-[#1D4ED8] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1E40AF] sm:min-h-[40px] sm:w-auto"
                >
                  {isSandbox ? "Exit sandbox" : "Confirm submission"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ExamWorkspacePage() {
  return (
    <Suspense
      fallback={
        <main
          id="main-content"
          className="flex min-h-screen flex-col items-center justify-center bg-[#F6F8FA] px-4 text-center"
        >
          <h1 className="text-lg font-semibold text-[#0F172A]">
            Preparing examination workspace
          </h1>
          <p className="mt-1 text-sm text-[#475569]">
            Loading snapshot items and server timer...
          </p>
        </main>
      }
    >
      <ExamWorkspaceContent />
    </Suspense>
  );
}
