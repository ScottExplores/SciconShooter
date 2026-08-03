export const ONBOARDING_VERSION = 2 as const;

export const ONBOARDING_STEP_IDS = [
  'welcome-home',
  'campaign-entry',
  'campaign-mission',
  'campaign-launch',
  'flight-controls',
  'campaign-reward',
  'hangar-entry',
  'hangar-upgrades',
  'hangar-ships',
  'hangar-wings',
  'return-home',
  'weekly-run',
  'weekly-funding',
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

export interface OnboardingProgressState {
  version: typeof ONBOARDING_VERSION;
  profileId: string;
  completedStepIds: OnboardingStepId[];
  skipped: boolean;
}

export interface OnboardingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const ONBOARDING_STORAGE_PREFIX = `scicon:onboarding:v${ONBOARDING_VERSION}`;

const ONBOARDING_STEP_ID_SET = new Set<string>(ONBOARDING_STEP_IDS);

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
  completedStepIds: [],
  skipped: false,
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

  return {
    ...fallback,
    completedStepIds: ONBOARDING_STEP_IDS.filter((stepId) => completedSet.has(stepId)),
    skipped: value.skipped === true,
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

export const getNextOnboardingStepId = (
  state: OnboardingProgressState,
): OnboardingStepId | null => {
  const sanitized = sanitizeOnboardingProgress(state, state.profileId);
  if (sanitized.skipped) return null;
  const completedSet = new Set<OnboardingStepId>(sanitized.completedStepIds);
  return ONBOARDING_STEP_IDS.find((stepId) => !completedSet.has(stepId)) ?? null;
};

export const isOnboardingComplete = (state: OnboardingProgressState): boolean =>
  getNextOnboardingStepId(state) === null;

export const completeOnboardingStep = (
  state: OnboardingProgressState,
  stepId: OnboardingStepId,
): OnboardingProgressState => {
  const sanitized = sanitizeOnboardingProgress(state, state.profileId);
  if (sanitized.skipped || sanitized.completedStepIds.includes(stepId)) return sanitized;

  const completedSet = new Set<OnboardingStepId>([...sanitized.completedStepIds, stepId]);
  return {
    ...sanitized,
    completedStepIds: ONBOARDING_STEP_IDS.filter((candidate) => completedSet.has(candidate)),
  };
};

export const skipOnboarding = (
  state: OnboardingProgressState,
): OnboardingProgressState => {
  const sanitized = sanitizeOnboardingProgress(state, state.profileId);
  return {
    ...sanitized,
    completedStepIds: [...ONBOARDING_STEP_IDS],
    skipped: true,
  };
};

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
