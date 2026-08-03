import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import PixelActionButton from './PixelActionButton';
import {
  completeOnboardingStep,
  getNextOnboardingStepId,
  loadOnboardingProgress,
  resetOnboardingProgress,
  saveOnboardingProgress,
  skipOnboarding,
  type OnboardingProgressState,
  type OnboardingStepId
} from '../services/onboardingProgress';

export type OnboardingSurface = 'menu' | 'campaign-map' | 'gameplay' | 'mission-complete' | 'other';

type OnboardingStepDefinition = {
  id: OnboardingStepId;
  surface: OnboardingSurface;
  target: string;
  phase: string;
  phaseStep: number;
  phaseTotal: number;
  title: string;
  body: string;
  primaryLabel: string;
  action?: 'activate';
};

export const SCICON_ONBOARDING_STEPS: readonly OnboardingStepDefinition[] = [
  {
    id: 'welcome-home',
    surface: 'menu',
    target: 'home-flight-deck',
    phase: 'Flight Deck',
    phaseStep: 1,
    phaseTotal: 2,
    title: 'Welcome aboard',
    body: 'I’m Nova, your flight guide. Campaign builds permanent squad strength; Weekly Run is the weekly score challenge. We’ll learn one system at a time.',
    primaryLabel: 'Show me around'
  },
  {
    id: 'campaign-entry',
    surface: 'menu',
    target: 'campaign-map',
    phase: 'Flight Deck',
    phaseStep: 2,
    phaseTotal: 2,
    title: 'Choose a Campaign mission',
    body: 'Start Mission launches your current checkpoint. Campaign Map lets you inspect every unlocked mission and its waves before deployment.',
    primaryLabel: 'Open Campaign Map',
    action: 'activate'
  },
  {
    id: 'campaign-mission',
    surface: 'campaign-map',
    target: 'campaign-mission',
    phase: 'Campaign',
    phaseStep: 1,
    phaseTotal: 3,
    title: 'Missions contain waves',
    body: 'Each Campaign mission is a route made of combat waves, elite threats, and a final encounter. Select the highlighted mission to inspect its launch plan.',
    primaryLabel: 'Select Mission',
    action: 'activate'
  },
  {
    id: 'campaign-launch',
    surface: 'campaign-map',
    target: 'campaign-launch',
    phase: 'Campaign',
    phaseStep: 2,
    phaseTotal: 3,
    title: 'Deploy for permanent progress',
    body: 'Campaign first-clears bank Research Coins and unlock the next route. Your selected main ship and support wing enter together.',
    primaryLabel: 'Launch Mission',
    action: 'activate'
  },
  {
    id: 'flight-controls',
    surface: 'gameplay',
    target: 'flight-stage',
    phase: 'Campaign',
    phaseStep: 3,
    phaseTotal: 3,
    title: 'Fly, fire, and react',
    body: 'Drag anywhere to steer; your main guns fire automatically. Bomb and signature-move buttons work with a second finger. Mission drops boost this flight.',
    primaryLabel: 'Begin Flight'
  },
  {
    id: 'campaign-reward',
    surface: 'mission-complete',
    target: 'mission-rewards',
    phase: 'Rewards',
    phaseStep: 1,
    phaseTotal: 2,
    title: 'Research Coins secured',
    body: 'Campaign rewards are banked for your permanent Hangar loadout. Stronger ships and support wings make later Campaign missions—and the Weekly Run—more survivable.',
    primaryLabel: 'Got it'
  },
  {
    id: 'hangar-entry',
    surface: 'menu',
    target: 'hangar-nav',
    phase: 'Rewards',
    phaseStep: 2,
    phaseTotal: 2,
    title: 'Spend coins in the Hangar',
    body: 'The Hangar is your permanent squad workshop. Let’s inspect the systems your Campaign rewards can improve.',
    primaryLabel: 'Open Hangar',
    action: 'activate'
  },
  {
    id: 'hangar-upgrades',
    surface: 'menu',
    target: 'hangar-upgrades',
    phase: 'Hangar',
    phaseStep: 1,
    phaseTotal: 3,
    title: 'Upgrade with intent',
    body: 'Upgrade fire rate, handling, and survivability with Research Coins. Main-ship upgrade levels belong to that hull, so every ship can develop differently.',
    primaryLabel: 'Next system'
  },
  {
    id: 'hangar-ships',
    surface: 'menu',
    target: 'hangar-ships',
    phase: 'Hangar',
    phaseStep: 2,
    phaseTotal: 3,
    title: 'Build a fleet, not one ship',
    body: 'Select a hull to inspect it, then equip it when you are ready. Each main ship has its own weapon identity and keeps its own permanent upgrades.',
    primaryLabel: 'Show support wings'
  },
  {
    id: 'hangar-wings',
    surface: 'menu',
    target: 'hangar-wings',
    phase: 'Hangar',
    phaseStep: 3,
    phaseTotal: 3,
    title: 'Add left and right support',
    body: 'Support slots unlock separately. Mini ships bring distinct roles—coin magnetism, piercing fire, missiles, angled volleys, and more—and improve as you upgrade them.',
    primaryLabel: 'Return to Flight Deck'
  },
  {
    id: 'return-home',
    surface: 'menu',
    target: 'home-nav',
    phase: 'Weekly Run',
    phaseStep: 1,
    phaseTotal: 3,
    title: 'Your squad is ready',
    body: 'Campaign remains available for coins and progression. Now return Home to see where that stronger loadout competes each week.',
    primaryLabel: 'Return Home',
    action: 'activate'
  },
  {
    id: 'weekly-run',
    surface: 'menu',
    target: 'weekly-run',
    phase: 'Weekly Run',
    phaseStep: 2,
    phaseTotal: 3,
    title: 'One endless weekly gauntlet',
    body: 'Weekly Run starts with 10 lives and two attempts. Waves keep escalating, bosses arrive every few waves, and the enemy order reshuffles each week. Leaving forfeits that run’s score.',
    primaryLabel: 'See weekly funding'
  },
  {
    id: 'weekly-funding',
    surface: 'menu',
    target: 'weekly-funding',
    phase: 'Weekly Run',
    phaseStep: 3,
    phaseTotal: 3,
    title: 'Fly for research funding',
    body: 'The verified No. 1 Weekly Run pilot selects an eligible ResearchHub proposal. This board tracks the leader, chosen research, and live funding progress.',
    primaryLabel: 'Complete Training'
  }
] as const;

const STEP_BY_ID = new Map(SCICON_ONBOARDING_STEPS.map((step) => [step.id, step]));
const GUIDE_ASSET = '/game-art/generated/ui/scicon-onboarding-guide-v1/scicon-guide.png';
const HANGAR_STEPS = new Set<OnboardingStepId>(['hangar-upgrades', 'hangar-ships', 'hangar-wings']);
const HOME_STEPS = new Set<OnboardingStepId>(['welcome-home', 'campaign-entry', 'weekly-run', 'weekly-funding']);

type RectLike = {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

export type OnboardingPlacement = {
  left: number;
  top: number;
  width: number;
  pointerLeft: number;
  pointerDirection: 'up' | 'down';
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Pure placement helper kept exportable for narrow-phone regression tests. */
export const computeOnboardingPlacement = (
  root: Pick<RectLike, 'width' | 'height'>,
  target: RectLike | null,
  panelHeight = 232
): OnboardingPlacement => {
  const gutter = 12;
  const gap = 18;
  const width = Math.max(0, Math.min(350, root.width - gutter * 2));

  if (!target) {
    return {
      left: Math.max(gutter, (root.width - width) / 2),
      top: Math.max(gutter, (root.height - panelHeight) / 2),
      width,
      pointerLeft: width / 2,
      pointerDirection: 'up'
    };
  }

  const targetCenter = target.left + target.width / 2;
  const left = clamp(targetCenter - width / 2, gutter, Math.max(gutter, root.width - width - gutter));
  const roomAbove = target.top - gap - gutter;
  const roomBelow = root.height - target.bottom - gap - gutter;
  const placeAbove = roomAbove >= panelHeight || roomAbove > roomBelow;
  const unclampedTop = placeAbove
    ? target.top - panelHeight - gap
    : target.bottom + gap;
  const top = clamp(unclampedTop, gutter, Math.max(gutter, root.height - panelHeight - gutter));

  return {
    left,
    top,
    width,
    pointerLeft: clamp(targetCenter - left, 24, Math.max(24, width - 24)),
    pointerDirection: placeAbove ? 'down' : 'up'
  };
};

interface SciconOnboardingProps {
  profileId: string;
  surface: OnboardingSurface;
  hasCampaignClear: boolean;
  suspended?: boolean;
  restartNonce?: number;
  onGameplayFreezeChange?: (frozen: boolean) => void;
}

const getVisibleTarget = (targetName: string): HTMLElement | null => {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(
    `[data-onboarding-target="${targetName}"]`
  ));

  return candidates.find((candidate) => {
    const rect = candidate.getBoundingClientRect();
    const style = window.getComputedStyle(candidate);
    return rect.width > 1
      && rect.height > 1
      && style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity || 1) > 0;
  }) ?? null;
};

const SciconOnboarding: React.FC<SciconOnboardingProps> = ({
  profileId,
  surface,
  hasCampaignClear,
  suspended = false,
  restartNonce = 0,
  onGameplayFreezeChange
}) => {
  const [progress, setProgress] = useState<OnboardingProgressState>(() => (
    loadOnboardingProgress(profileId)
  ));
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [targetName, setTargetName] = useState<string | null>(null);
  const [rootRect, setRootRect] = useState<RectLike | null>(null);
  const [targetRect, setTargetRect] = useState<RectLike | null>(null);
  const [panelHeight, setPanelHeight] = useState(232);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const restartNonceRef = useRef(restartNonce);
  const scrollStepRef = useRef<string | null>(null);

  useEffect(() => {
    setProgress(loadOnboardingProgress(profileId));
  }, [profileId]);

  useEffect(() => {
    if (restartNonceRef.current === restartNonce) return;
    restartNonceRef.current = restartNonce;
    const reset = resetOnboardingProgress(profileId);
    setProgress(reset);
  }, [profileId, restartNonce]);

  const currentStepId = getNextOnboardingStepId(progress);
  const currentStep = currentStepId ? STEP_BY_ID.get(currentStepId) ?? null : null;
  const campaignRewardBlocked = currentStep?.id === 'campaign-reward' && !hasCampaignClear;
  const shouldShow = Boolean(
    currentStep
    && currentStep.surface === surface
    && !campaignRewardBlocked
    && !suspended
  );

  const locateTarget = useCallback(() => {
    if (!currentStep || !shouldShow) {
      setTargetElement(null);
      setTargetName(null);
      return;
    }

    let resolvedName = currentStep.target;
    let resolved = getVisibleTarget(resolvedName);
    if (!resolved && HANGAR_STEPS.has(currentStep.id)) {
      resolvedName = 'hangar-nav';
      resolved = getVisibleTarget(resolvedName);
    } else if (!resolved && HOME_STEPS.has(currentStep.id)) {
      resolvedName = 'home-nav';
      resolved = getVisibleTarget(resolvedName);
    }

    setTargetElement((previous) => previous === resolved ? previous : resolved);
    setTargetName(resolved ? resolvedName : null);
  }, [currentStep, shouldShow]);

  useEffect(() => {
    locateTarget();
    if (!shouldShow) return undefined;

    const observer = new MutationObserver(locateTarget);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'data-dashboard-tab']
    });
    return () => observer.disconnect();
  }, [locateTarget, shouldShow]);

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root || !shouldShow) {
      setRootRect(null);
      setTargetRect(null);
      return;
    }

    const measuredRoot = root.getBoundingClientRect();
    const nextRoot: RectLike = {
      left: 0,
      top: 0,
      width: measuredRoot.width,
      height: measuredRoot.height,
      right: measuredRoot.width,
      bottom: measuredRoot.height
    };
    setRootRect(nextRoot);

    if (!targetElement) {
      setTargetRect(null);
      return;
    }

    const measuredTarget = targetElement.getBoundingClientRect();
    setTargetRect({
      left: measuredTarget.left - measuredRoot.left,
      top: measuredTarget.top - measuredRoot.top,
      width: measuredTarget.width,
      height: measuredTarget.height,
      right: measuredTarget.right - measuredRoot.left,
      bottom: measuredTarget.bottom - measuredRoot.top
    });
  }, [shouldShow, targetElement]);

  useLayoutEffect(() => {
    measure();
    if (!shouldShow) return undefined;

    let frame = 0;
    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('scroll', scheduleMeasure, true);
    window.visualViewport?.addEventListener('resize', scheduleMeasure);
    window.visualViewport?.addEventListener('scroll', scheduleMeasure);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure, true);
      window.visualViewport?.removeEventListener('resize', scheduleMeasure);
      window.visualViewport?.removeEventListener('scroll', scheduleMeasure);
    };
  }, [measure, shouldShow]);

  useLayoutEffect(() => {
    if (!panelRef.current || !shouldShow) return;
    const nextHeight = panelRef.current.getBoundingClientRect().height;
    if (nextHeight > 0 && Math.abs(nextHeight - panelHeight) > 1) setPanelHeight(nextHeight);
  }, [currentStepId, panelHeight, shouldShow, targetElement]);

  useEffect(() => {
    if (!shouldShow || !targetElement || !rootRect || !targetRect || !currentStep) return;
    if (scrollStepRef.current === `${currentStep.id}:${targetName}`) return;
    scrollStepRef.current = `${currentStep.id}:${targetName}`;
    const targetOutsideView = targetRect.top < 8 || targetRect.bottom > rootRect.height - 8;
    if (targetOutsideView) {
      targetElement.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  }, [currentStep, prefersReducedMotion, rootRect, shouldShow, targetElement, targetName, targetRect]);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return undefined;
    const update = () => setPrefersReducedMotion(query.matches);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  const gameplayFrozen = shouldShow && currentStep?.id === 'flight-controls';
  useEffect(() => {
    onGameplayFreezeChange?.(gameplayFrozen);
    return () => onGameplayFreezeChange?.(false);
  }, [gameplayFrozen, onGameplayFreezeChange]);

  const persist = useCallback((next: OnboardingProgressState) => {
    saveOnboardingProgress(next);
    setProgress(next);
  }, []);

  const handlePrimary = useCallback(() => {
    if (!currentStep) return;

    const usingFallbackNavigation = targetName !== null && targetName !== currentStep.target;
    if (usingFallbackNavigation) {
      targetElement?.click();
      return;
    }

    const next = completeOnboardingStep(progress, currentStep.id);
    persist(next);
    if (currentStep.action === 'activate') {
      window.requestAnimationFrame(() => targetElement?.click());
    }
  }, [currentStep, persist, progress, targetElement, targetName]);

  const handleSkip = useCallback(() => {
    persist(skipOnboarding(progress));
  }, [persist, progress]);

  const placement = useMemo(() => (
    computeOnboardingPlacement(rootRect ?? { width: window.innerWidth, height: window.innerHeight }, targetRect, panelHeight)
  ), [panelHeight, rootRect, targetRect]);

  if (!currentStep || !shouldShow) return null;

  const usingFallbackNavigation = targetName !== null && targetName !== currentStep.target;
  const fallbackLabel = targetName === 'hangar-nav' ? 'Open Hangar' : 'Return Home';
  const missingTarget = !targetElement;

  return (
    <div
      ref={rootRef}
      className="sci-onboarding"
      data-onboarding-step={currentStep.id}
      data-onboarding-surface={surface}
      data-reduced-motion={prefersReducedMotion ? 'true' : 'false'}
    >
      {targetRect ? (
        <div
          className="sci-onboarding__spotlight"
          style={{
            left: targetRect.left - 7,
            top: targetRect.top - 7,
            width: targetRect.width + 14,
            height: targetRect.height + 14
          }}
          aria-hidden="true"
        />
      ) : (
        <div className="sci-onboarding__scrim" aria-hidden="true" />
      )}

      <section
        ref={panelRef}
        className="sci-onboarding__panel"
        role="dialog"
        aria-modal="false"
        aria-labelledby="sci-onboarding-title"
        aria-describedby="sci-onboarding-body"
        style={{
          left: placement.left,
          top: placement.top,
          width: placement.width
        }}
      >
        {targetRect ? (
          <span
            className={`sci-onboarding__pointer sci-onboarding__pointer--${placement.pointerDirection}`}
            style={{ left: placement.pointerLeft }}
            aria-hidden="true"
          />
        ) : null}

        <div className="sci-onboarding__chrome" aria-hidden="true" />
        <div className="sci-onboarding__guide" aria-hidden="true">
          <span className="sci-onboarding__guide-frame" />
          <img src={GUIDE_ASSET} alt="" draggable={false} />
        </div>

        <div className="sci-onboarding__copy">
          <div className="sci-onboarding__meta">
            <span>Nova // Flight Ops</span>
            <b>{currentStep.phase} {currentStep.phaseStep}/{currentStep.phaseTotal}</b>
          </div>
          <h2 id="sci-onboarding-title">{currentStep.title}</h2>
          <p id="sci-onboarding-body">
            {missingTarget
              ? 'Hold position—this lesson will lock onto the next control as soon as the screen is ready.'
              : currentStep.body}
          </p>
        </div>

        <div className="sci-onboarding__actions">
          <button type="button" className="sci-onboarding__skip" onClick={handleSkip}>
            Skip guidance
          </button>
          <PixelActionButton
            ref={primaryRef}
            tone="green"
            ready={!missingTarget}
            shine={!missingTarget}
            className="sci-onboarding__next"
            onClick={handlePrimary}
            disabled={missingTarget}
          >
            {missingTarget ? 'Locating…' : usingFallbackNavigation ? fallbackLabel : currentStep.primaryLabel}
          </PixelActionButton>
        </div>
      </section>
    </div>
  );
};

export default SciconOnboarding;
