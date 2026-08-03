export const ONBOARDING_VERSION = 3 as const;

export const ONBOARDING_STEP_IDS = [
  'flight-steer',
  'flight-bomb',
  'mission-hangar',
  'hangar-upgrades',
  'hangar-fleet',
  'hangar-wings',
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];
export type OnboardingDecision = 'unasked' | 'active' | 'declined' | 'complete';

export interface OnboardingProgressState {
  version: typeof ONBOARDING_VERSION;
  profileId: string;
  decision: OnboardingDecision;
  completedStepIds: OnboardingStepId[];
}

export interface OnboardingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const ONBOARDING_STORAGE_PREFIX = `scicon:onboarding:v${ONBOARDING_VERSION}`;

const ONBOARDING_STEP_ID_SET = new Set<string>(ONBOARDING_STEP_IDS);
const ONBOARDING_DECISIONS = new Set<OnboardingDecision>([
  'unasked',
  'active',
  'declined',
  'complete',
]);

const resolveBrowserStorage = (): OnboardingStorage | null => {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
};

export const normalizeOnboardingProfileId = (profileId?: string | null): string => {
  const normalized = typeof profileId === 'string' ? profileId.trim().toLowerCase() : '';
  return normalized || 'guest';
};

export const onboardingStorageKey = (profileId?: string | null): string =>
  `${ONBOARDING_STORAGE_PREFIX}:${encodeURIComponent(normalizeOnboardingProfileId(profileId))}`;

export const createOnboardingProgress = (
  profileId?: string | null,
): OnboardingProgressState => ({
  version: ONBOARDING_VERSION,
  profileId: normalizeOnboardingProfileId(profileId),
  decision: 'unasked',
  completedStepIds: [],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Repairs persisted onboarding data without trusting its shape, step order, or
 * profile ownership. Unknown and duplicate step IDs are discarded, and known
 * steps are always restored in the canonical progression order.
 */
export const sanitizeOnboardingProgress = (
  value: unknown,
  profileId?: string | null,
): OnboardingProgressState => {
  const fallback = createOnboardingProgress(profileId);
  if (!isRecord(value) || value.version !== ONBOARDING_VERSION) return fallback;

  const storedProfileId = normalizeOnboardingProfileId(
    typeof value.profileId === 'string' ? value.profileId : null,
  );
  if (storedProfileId !== fallback.profileId) return fallback;

  const completedValues = Array.isArray(value.completedStepIds)
    ? value.completedStepIds.filter(
        (stepId): stepId is OnboardingStepId =>
          typeof stepId === 'string' && ONBOARDING_STEP_ID_SET.has(stepId),
      )
    : [];
  const completedSet = new Set<OnboardingStepId>(completedValues);
  const completedStepIds = ONBOARDING_STEP_IDS.filter((stepId) => completedSet.has(stepId));
  const rawDecision = typeof value.decision === 'string'
    && ONBOARDING_DECISIONS.has(value.decision as OnboardingDecision)
    ? value.decision as OnboardingDecision
    : 'unasked';
  const decision = completedStepIds.length === ONBOARDING_STEP_IDS.length
    ? rawDecision === 'declined' ? 'declined' : 'complete'
    : rawDecision === 'complete' ? 'active' : rawDecision;

  return {
    ...fallback,
    decision,
    completedStepIds,
  };
};

export const loadOnboardingProgress = (
  profileId?: string | null,
  storage: OnboardingStorage | null = resolveBrowserStorage(),
): OnboardingProgressState => {
  const fallback = createOnboardingProgress(profileId);
  if (!storage) return fallback;

  try {
    const saved = storage.getItem(onboardingStorageKey(fallback.profileId));
    if (!saved) return fallback;
    return sanitizeOnboardingProgress(JSON.parse(saved), fallback.profileId);
  } catch {
    return fallback;
  }
};

export const saveOnboardingProgress = (
  state: OnboardingProgressState,
  storage: OnboardingStorage | null = resolveBrowserStorage(),
): boolean => {
  if (!storage) return false;

  const sanitized = sanitizeOnboardingProgress(state, state.profileId);
  try {
    storage.setItem(onboardingStorageKey(sanitized.profileId), JSON.stringify(sanitized));
    return true;
  } catch {
    return false;
  }
};

export const acceptOnboarding = (
  state: OnboardingProgressState,
): OnboardingProgressState => {
  const sanitized = sanitizeOnboardingProgress(state, state.profileId);
  if (sanitized.decision === 'complete') return sanitized;
  return { ...sanitized, decision: 'active' };
};

export const declineOnboarding = (
  state: OnboardingProgressState,
): OnboardingProgressState => ({
  ...sanitizeOnboardingProgress(state, state.profileId),
  decision: 'declined',
  completedStepIds: [...ONBOARDING_STEP_IDS],
});

export const getNextOnboardingStepId = (
  state: OnboardingProgressState,
): OnboardingStepId | null => {
  const sanitized = sanitizeOnboardingProgress(state, state.profileId);
  if (sanitized.decision !== 'active') return null;
  const completedSet = new Set<OnboardingStepId>(sanitized.completedStepIds);
  return ONBOARDING_STEP_IDS.find((stepId) => !completedSet.has(stepId)) ?? null;
};

export const isOnboardingComplete = (state: OnboardingProgressState): boolean => {
  const sanitized = sanitizeOnboardingProgress(state, state.profileId);
  return sanitized.decision === 'complete' || sanitized.decision === 'declined';
};

export const completeOnboardingStep = (
  state: OnboardingProgressState,
  stepId: OnboardingStepId,
): OnboardingProgressState => {
  const sanitized = sanitizeOnboardingProgress(state, state.profileId);
  if (sanitized.decision !== 'active' || sanitized.completedStepIds.includes(stepId)) {
    return sanitized;
  }

  const completedSet = new Set<OnboardingStepId>([...sanitized.completedStepIds, stepId]);
  const completedStepIds = ONBOARDING_STEP_IDS.filter((candidate) => completedSet.has(candidate));
  return {
    ...sanitized,
    completedStepIds,
    decision: completedStepIds.length === ONBOARDING_STEP_IDS.length ? 'complete' : 'active',
  };
};

/** Backward-compatible semantic alias for callers that still say "skip". */
export const skipOnboarding = declineOnboarding;

export const resetOnboardingProgress = (
  profileId?: string | null,
  storage: OnboardingStorage | null = resolveBrowserStorage(),
): OnboardingProgressState => {
  const reset = createOnboardingProgress(profileId);
  if (!storage) return reset;

  try {
    storage.removeItem(onboardingStorageKey(reset.profileId));
  } catch {
    // Reset still succeeds in memory when storage is unavailable or read-only.
  }
  return reset;
};

/** Restarts the guide from More without showing the first-flight invitation. */
export const restartOnboarding = (
  profileId?: string | null,
  storage: OnboardingStorage | null = resolveBrowserStorage(),
): OnboardingProgressState => {
  const restarted = acceptOnboarding(resetOnboardingProgress(profileId, storage));
  saveOnboardingProgress(restarted, storage);
  return restarted;
};
