import { useCallback, useEffect, useRef, useState } from 'react';
import {
  updateWorkspaceResource,
  type GameCampaignWorkspaceSummary,
  type WorkspaceMutationPreconditions
} from '@director/api/directorClient';
import {
  workspaceResourceKey,
  type WorkspaceSaveRequest
} from '@director/editor/workspaceDraftModel';

export type WorkspaceAutosaveStatus = 'saved' | 'unsaved' | 'saving' | 'stale' | 'error';

interface PendingWorkspaceSave extends WorkspaceSaveRequest {
  idempotencyKey: string;
  generation: number;
}

const cloneJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const createMutationKey = (label: string): string => {
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9._:-]+/g, '-').slice(0, 36) || 'mutation';
  const random = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `level-editor:${safeLabel}:${random}`.slice(0, 128);
};

export const useWorkspaceAutosave = (
  initialSummary: GameCampaignWorkspaceSummary,
  onError?: (error: Error) => void,
  debounceMilliseconds = 550
) => {
  const [summary, setSummary] = useState(initialSummary);
  const [status, setStatus] = useState<WorkspaceAutosaveStatus>(
    initialSummary.stale ? 'stale' : 'saved'
  );
  const [error, setError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const summaryRef = useRef(initialSummary);
  const pendingRef = useRef(new Map<string, PendingWorkspaceSave>());
  const retryRef = useRef<PendingWorkspaceSave | null>(null);
  const activeSaveRef = useRef<Promise<void> | null>(null);
  const timerRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const storeSummary = useCallback((next: GameCampaignWorkspaceSummary) => {
    summaryRef.current = next;
    setSummary(next);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const flush = useCallback(async (): Promise<void> => {
    clearTimer();
    if (activeSaveRef.current) return activeSaveRef.current;

    if (summaryRef.current.stale) {
      const staleError = new Error('The tracked campaign changed; rebase or revert this workspace before saving');
      setStatus('stale');
      setError(staleError.message);
      throw staleError;
    }

    if (pendingRef.current.size === 0 && !retryRef.current) {
      setStatus('saved');
      setError(null);
      return;
    }

    const run = async () => {
      while (pendingRef.current.size > 0 || retryRef.current) {
        const retry = retryRef.current;
        const nextPair = retry
          ? [workspaceResourceKey(retry.reference), retry] as [string, PendingWorkspaceSave]
          : pendingRef.current.entries().next().value as
            | [string, PendingWorkspaceSave]
            | undefined;
        if (!nextPair) break;
        const [key, pending] = nextPair;
        if (retry) retryRef.current = null;
        else pendingRef.current.delete(key);
        setPendingCount(pendingRef.current.size + (retryRef.current ? 1 : 0));
        setStatus('saving');
        setError(null);

        try {
          const result = await updateWorkspaceResource(
            pending.reference,
            pending.resource,
            {
              expectedBaseContentHash: summaryRef.current.baseContentHash,
              expectedDraftRevision: summaryRef.current.draftRevision,
              idempotencyKey: pending.idempotencyKey
            }
          );
          storeSummary(result.workspace);
        } catch (reason) {
          if (
            pending.generation === generationRef.current
            && !pendingRef.current.has(key)
          ) {
            retryRef.current = pending;
          }
          setPendingCount(pendingRef.current.size + (retryRef.current ? 1 : 0));
          const nextError = reason instanceof Error ? reason : new Error('Workspace autosave failed');
          setStatus(summaryRef.current.stale ? 'stale' : 'error');
          setError(nextError.message);
          onErrorRef.current?.(nextError);
          throw nextError;
        }
      }

      setStatus(summaryRef.current.stale ? 'stale' : 'saved');
      setError(null);
    };

    const active = run().finally(() => {
      activeSaveRef.current = null;
    });
    activeSaveRef.current = active;
    return active;
  }, [clearTimer, storeSummary]);

  const enqueue = useCallback((request: WorkspaceSaveRequest) => {
    const key = workspaceResourceKey(request.reference);
    if (retryRef.current && workspaceResourceKey(retryRef.current.reference) === key) {
      retryRef.current = null;
    }
    pendingRef.current.set(key, {
      reference: request.reference,
      resource: cloneJson(request.resource),
      idempotencyKey: createMutationKey(`autosave-${request.reference.kind}`),
      generation: generationRef.current
    });
    setPendingCount(pendingRef.current.size + (retryRef.current ? 1 : 0));
    setError(null);

    if (summaryRef.current.stale) {
      setStatus('stale');
      return;
    }

    setStatus('unsaved');
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void flush().catch(() => undefined);
    }, debounceMilliseconds);
  }, [clearTimer, debounceMilliseconds, flush]);

  const replaceSummary = useCallback((next: GameCampaignWorkspaceSummary) => {
    storeSummary(next);
    setError(null);
    setStatus(next.stale
      ? 'stale'
      : pendingRef.current.size > 0 || retryRef.current
        ? 'unsaved'
        : 'saved');
  }, [storeSummary]);

  const discardPending = useCallback(async () => {
    clearTimer();
    generationRef.current += 1;
    pendingRef.current.clear();
    retryRef.current = null;
    setPendingCount(0);
    try {
      await activeSaveRef.current;
    } catch {
      // An explicit reset/revert owns the next state, so an earlier autosave error is discarded.
    }
    setError(null);
    setStatus(summaryRef.current.stale ? 'stale' : 'saved');
  }, [clearTimer]);

  const mutationPreconditions = useCallback((label: string): WorkspaceMutationPreconditions => ({
    expectedBaseContentHash: summaryRef.current.baseContentHash,
    expectedDraftRevision: summaryRef.current.draftRevision,
    idempotencyKey: createMutationKey(label)
  }), []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  return {
    summary,
    status,
    error,
    pendingCount,
    enqueue,
    flush,
    replaceSummary,
    discardPending,
    mutationPreconditions
  };
};
