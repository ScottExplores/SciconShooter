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
  acceptOnboarding,
  completeOnboardingStep,
  declineOnboarding,
  getNextOnboardingStepId,
  loadOnboardingProgress,
  restartOnboarding,
  saveOnboardingProgress,
  type OnboardingProgressState,
  type OnboardingStepId
} from '../services/onboardingProgress';

export type OnboardingSurface = 'menu' | 'campaign-map' | 'gameplay' | 'mission-complete' | 'other';

type OnboardingStepDefinition = {
  id: OnboardingStepId;
  surface: OnboardingSurface;
  target: string;
  fallbackSurface?: OnboardingSurface;
  fallbackTarget?: string;
  title: string;
  body: string;
  instruction: string;
  activationEvent: 'click' | 'pointerdown' | 'drag';
};

/**
 * First-flight training deliberately stays short. Every lesson advances from
 * the highlighted game control itself; the guide never activates controls on
 * the player's behalf.
 */
export const SCICON_ONBOARDING_STEPS: readonly OnboardingStepDefinition[] = [
  {
    id: 'flight-steer',
    surface: 'gameplay',
    target: 'flight-stage',
    title: 'Steer the ship',
    body: 'Drag anywhere in the flight area. Your main weapon fires automatically.',
    instruction: 'Touch and drag the flight area',
    activationEvent: 'drag'
  },
  {
    id: 'flight-bomb',
    surface: 'gameplay',
    target: 'flight-bomb',
    title: 'Use a bomb',
    body: 'Bombs clear danger around you. You can press this with a second finger while steering.',
    instruction: 'Press the highlighted bomb',
    activationEvent: 'pointerdown'
  },
  {
    id: 'mission-hangar',
    surface: 'mission-complete',
    target: 'mission-hangar',
    fallbackSurface: 'menu',
    fallbackTarget: 'hangar-nav',
    title: 'Bank the reward',
    body: 'Mission Tokens are saved for permanent ship and support upgrades. Open the Hangar now.',
    instruction: 'Press Hangar',
    activationEvent: 'click'
  },
  {
    id: 'hangar-upgrades',
    surface: 'menu',
    target: 'hangar-upgrades',
    title: 'Inspect upgrades',
    body: 'Each ship keeps its own permanent firepower, handling, and survival upgrades.',
    instruction: 'Press Upgrade',
    activationEvent: 'click'
  },
  {
    id: 'hangar-fleet',
    surface: 'menu',
    target: 'hangar-fleet',
    title: 'Choose a ship',
    body: 'Return to the fleet to compare your ships. Selecting one does not spend Tokens.',
    instruction: 'Press Fleet',
    activationEvent: 'click'
  },
  {
    id: 'hangar-wings',
    surface: 'menu',
    target: 'hangar-wings',
    title: 'Add support',
    body: 'Support ships fill the left and right wing slots and bring their own combat roles.',
    instruction: 'Touch a support slot',
    activationEvent: 'click'
  }
] as const;

const STEP_BY_ID = new Map(SCICON_ONBOARDING_STEPS.map((step) => [step.id, step]));

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
  panelHeight = 142
): OnboardingPlacement => {
  const gutter = 10;
  const gap = 12;
  const width = Math.max(0, Math.min(328, root.width - gutter * 2));

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
    pointerLeft: clamp(targetCenter - left, 22, Math.max(22, width - 22)),
    pointerDirection: placeAbove ? 'down' : 'up'
  };
};

export interface SciconOnboardingProps {
  profileId: string;
  surface: OnboardingSurface;
  /**
   * Increment after Brian's first-Mission transmission completes. The guide
   * remains completely dormant until this signal arrives.
   */
  invitationNonce?: number;
  /** Retained while App migrates from the previous guide contract. */
  hasCampaignClear?: boolean;
  suspended?: boolean;
  /** More -> Flight Guide increments this to restart without another invite. */
  restartNonce?: number;
  onGameplayFreezeChange?: (frozen: boolean) => void;
  onInvitationDecision?: (accepted: boolean) => void;
  onStepChange?: (stepId: OnboardingStepId | null) => void;
  onComplete?: () => void;
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
  invitationNonce = 0,
  suspended = false,
  restartNonce = 0,
  onGameplayFreezeChange,
  onInvitationDecision,
  onStepChange,
  onComplete
}) => {
  const [progress, setProgress] = useState<OnboardingProgressState>(() => (
    loadOnboardingProgress(profileId)
  ));
  const [inviteOpen, setInviteOpen] = useState(false);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [rootRect, setRootRect] = useState<RectLike | null>(null);
  const [targetRect, setTargetRect] = useState<RectLike | null>(null);
  const [panelHeight, setPanelHeight] = useState(142);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const invitationNonceRef = useRef(0);
  const latestInvitationNonceRef = useRef(invitationNonce);
  const restartNonceRef = useRef(restartNonce);
  const scrollStepRef = useRef<string | null>(null);
  const handledActionRef = useRef<string | null>(null);

  latestInvitationNonceRef.current = invitationNonce;

  useEffect(() => {
    setInviteOpen(false);
    setProgress(loadOnboardingProgress(profileId));
    // A signal raised for the previous profile must never invite the next
    // profile after a wallet/account switch.
    invitationNonceRef.current = latestInvitationNonceRef.current;
  }, [profileId]);

  useEffect(() => {
    if (invitationNonce <= 0 || invitationNonceRef.current === invitationNonce) return;
    invitationNonceRef.current = invitationNonce;
    setInviteOpen(progress.decision === 'unasked');
  }, [invitationNonce, progress.decision]);

  useEffect(() => {
    if (restartNonceRef.current === restartNonce) return;
    restartNonceRef.current = restartNonce;
    setInviteOpen(false);
    setProgress(restartOnboarding(profileId));
  }, [profileId, restartNonce]);

  const persist = useCallback((next: OnboardingProgressState) => {
    saveOnboardingProgress(next);
    setProgress(next);
  }, []);

  const currentStepId = getNextOnboardingStepId(progress);
  const currentStep = currentStepId ? STEP_BY_ID.get(currentStepId) ?? null : null;
  const currentTarget = currentStep?.surface === surface
    ? currentStep.target
    : currentStep?.fallbackSurface === surface
      ? currentStep.fallbackTarget ?? null
      : null;
  const shouldShow = Boolean(
    currentStep
    && currentTarget
    && !suspended
    && !inviteOpen
  );

  useEffect(() => {
    onStepChange?.(currentStepId);
    return () => onStepChange?.(null);
  }, [currentStepId, onStepChange]);

  const locateTarget = useCallback(() => {
    if (!currentStep || !shouldShow) {
      setTargetElement(null);
      return;
    }

    const resolved = currentTarget ? getVisibleTarget(currentTarget) : null;
    setTargetElement((previous) => previous === resolved ? previous : resolved);
  }, [currentStep, currentTarget, shouldShow]);

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

  useEffect(() => {
    if (!currentStep || !shouldShow || !targetElement) return undefined;
    const actionKey = `${currentStep.id}:${currentStep.activationEvent}`;
    handledActionRef.current = null;
    const handleTargetAction = () => {
      if (handledActionRef.current === actionKey) return;
      handledActionRef.current = actionKey;
      const next = completeOnboardingStep(progress, currentStep.id);
      persist(next);
      if (next.decision === 'complete') onComplete?.();
    };

    if (currentStep.activationEvent === 'drag') {
      let activePointerId: number | null = null;
      let startX = 0;
      let startY = 0;
      const handlePointerDown = (event: PointerEvent) => {
        activePointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
      };
      const handlePointerMove = (event: PointerEvent) => {
        if (activePointerId !== event.pointerId) return;
        if (Math.hypot(event.clientX - startX, event.clientY - startY) < 12) return;
        activePointerId = null;
        handleTargetAction();
      };
      const handlePointerEnd = (event: PointerEvent) => {
        if (activePointerId === event.pointerId) activePointerId = null;
      };
      targetElement.addEventListener('pointerdown', handlePointerDown, true);
      window.addEventListener('pointermove', handlePointerMove, true);
      window.addEventListener('pointerup', handlePointerEnd, true);
      window.addEventListener('pointercancel', handlePointerEnd, true);
      return () => {
        targetElement.removeEventListener('pointerdown', handlePointerDown, true);
        window.removeEventListener('pointermove', handlePointerMove, true);
        window.removeEventListener('pointerup', handlePointerEnd, true);
        window.removeEventListener('pointercancel', handlePointerEnd, true);
      };
    }

    targetElement.addEventListener(currentStep.activationEvent, handleTargetAction, true);
    return () => targetElement.removeEventListener(currentStep.activationEvent, handleTargetAction, true);
  }, [currentStep, onComplete, persist, progress, shouldShow, targetElement]);

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root || (!shouldShow && !inviteOpen)) {
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

    if (!targetElement || inviteOpen) {
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
  }, [inviteOpen, shouldShow, targetElement]);

  useLayoutEffect(() => {
    measure();
    if (!shouldShow && !inviteOpen) return undefined;

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
  }, [inviteOpen, measure, shouldShow]);

  useLayoutEffect(() => {
    if (!panelRef.current || (!shouldShow && !inviteOpen)) return;
    const nextHeight = panelRef.current.getBoundingClientRect().height;
    if (nextHeight > 0 && Math.abs(nextHeight - panelHeight) > 1) setPanelHeight(nextHeight);
  }, [currentStepId, inviteOpen, panelHeight, shouldShow, targetElement]);

  useEffect(() => {
    if (!shouldShow || !targetElement || !rootRect || !targetRect || !currentStep) return;
    if (scrollStepRef.current === currentStep.id) return;
    scrollStepRef.current = currentStep.id;
    const targetOutsideView = targetRect.top < 8 || targetRect.bottom > rootRect.height - 8;
    if (targetOutsideView) {
      targetElement.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  }, [currentStep, prefersReducedMotion, rootRect, shouldShow, targetElement, targetRect]);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return undefined;
    const update = () => setPrefersReducedMotion(query.matches);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    onGameplayFreezeChange?.(inviteOpen);
    return () => onGameplayFreezeChange?.(false);
  }, [inviteOpen, onGameplayFreezeChange]);

  const handleInvitation = useCallback((accepted: boolean) => {
    const next = accepted ? acceptOnboarding(progress) : declineOnboarding(progress);
    persist(next);
    setInviteOpen(false);
    onInvitationDecision?.(accepted);
  }, [onInvitationDecision, persist, progress]);

  const handleSkip = useCallback(() => {
    persist(declineOnboarding(progress));
    onInvitationDecision?.(false);
  }, [onInvitationDecision, persist, progress]);

  const placement = useMemo(() => (
    computeOnboardingPlacement(
      rootRect ?? { width: window.innerWidth, height: window.innerHeight },
      targetRect,
      panelHeight
    )
  ), [panelHeight, rootRect, targetRect]);

  if (inviteOpen) {
    return (
      <div ref={rootRef} className="sci-onboarding sci-onboarding--invitation">
        <div className="sci-onboarding__invite-scrim" aria-hidden="true" />
        <section
          ref={panelRef}
          className="sci-onboarding__invite"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sci-onboarding-invite-title"
          aria-describedby="sci-onboarding-invite-body"
        >
          <p className="sci-onboarding__eyebrow">Flight Assist</p>
          <h2 id="sci-onboarding-invite-title">Want quick guidance?</h2>
          <p id="sci-onboarding-invite-body">
            A short, hands-on guide can point out steering, bombs, rewards, and the Hangar.
          </p>
          <div className="sci-onboarding__invite-actions">
            <PixelActionButton tone="neutral" onClick={() => handleInvitation(false)}>
              No thanks
            </PixelActionButton>
            <PixelActionButton tone="green" ready shine onClick={() => handleInvitation(true)}>
              Guide me
            </PixelActionButton>
          </div>
        </section>
      </div>
    );
  }

  if (!currentStep || !shouldShow) return null;

  return (
    <div
      ref={rootRef}
      className="sci-onboarding sci-onboarding--lesson"
      data-onboarding-step={currentStep.id}
      data-onboarding-surface={surface}
      data-reduced-motion={prefersReducedMotion ? 'true' : 'false'}
    >
      {targetRect ? (
        <div
          className="sci-onboarding__spotlight"
          style={{
            left: targetRect.left - 6,
            top: targetRect.top - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12
          }}
          aria-hidden="true"
        />
      ) : null}

      <section
        ref={panelRef}
        className="sci-onboarding__panel"
        role="status"
        aria-live="polite"
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
        <div className="sci-onboarding__copy">
          <div className="sci-onboarding__meta">
            <span>Flight Assist</span>
            <b>{SCICON_ONBOARDING_STEPS.findIndex((step) => step.id === currentStep.id) + 1}/{SCICON_ONBOARDING_STEPS.length}</b>
          </div>
          <h2>{currentStep.title}</h2>
          <p>{targetElement ? currentStep.body : 'Preparing the next control…'}</p>
        </div>

        <div className="sci-onboarding__actions">
          <button type="button" className="sci-onboarding__skip" onClick={handleSkip}>
            End guide
          </button>
          <strong className="sci-onboarding__instruction">
            {targetElement ? currentStep.instruction : 'Locating…'}
          </strong>
        </div>
      </section>
    </div>
  );
};

export default SciconOnboarding;
