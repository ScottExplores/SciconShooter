import type {
  BossAttackSentence,
  BossAttackSentenceVariant,
  BossTimelineClip,
  BossTimelineConfig,
  BossTimelineTrigger
} from '../../../game-config/types';

export interface BossTimelineCue {
  readonly clip: Readonly<BossTimelineClip>;
  readonly executionIndex: number;
  readonly timelineFrame: number;
}

export interface ResolvedBossTimelineAttackVariant {
  readonly attack: Readonly<BossAttackSentence>;
  readonly variant: Readonly<BossAttackSentenceVariant>;
}

export interface BossTimelineAttackWindow {
  readonly attackId: string;
  readonly phaseId?: string;
  /** First warning/action frame, inclusive. */
  readonly startFrame: number;
  /** First frame after recovery/action, exclusive. */
  readonly endFrame: number;
}

export type BossTimelineAttackStage =
  | 'warning'
  | 'fire'
  | 'transition'
  | 'recovery';

/**
 * A deterministic, presentation-friendly view of the authored attack sentence
 * active on one phase-relative simulation frame. Repeated clip executions are
 * expanded into separate one-based beats so diagnostics and preview controls
 * describe what the player is learning rather than exposing raw clip IDs.
 */
export interface ActiveBossTimelineAttack {
  readonly attack: Readonly<BossAttackSentence>;
  readonly variant: Readonly<BossAttackSentenceVariant>;
  readonly phaseId: string;
  readonly stage: BossTimelineAttackStage;
  readonly beatIndex: number;
  readonly beatCount: number;
  /** The damaging clip that owns this beat, including during its warning. */
  readonly beatClip: Readonly<BossTimelineClip>;
  /** The clip currently presenting; transitions continue to name beatClip. */
  readonly activeClip: Readonly<BossTimelineClip>;
  /** Zero-based repeat execution index on beatClip. */
  readonly executionIndex: number;
  readonly timelineFrame: number;
}

const toFrame = (seconds: number, fps: number) => Math.max(
  1,
  Math.round(Math.max(0, Number(seconds) || 0) * Math.max(1, fps))
);

const clipMatchesPhase = (clip: BossTimelineClip, phaseId?: string) => (
  clip.phaseId === undefined || clip.phaseId === phaseId
);

const getRepeatCount = (clip: BossTimelineClip) => Math.max(
  1,
  Math.min(8, Math.floor(clip.repeat?.count ?? 1))
);

const getRepeatIntervalFrames = (clip: BossTimelineClip, fps: number) => (
  clip.repeat ? toFrame(clip.repeat.intervalSeconds, fps) : 0
);

const getClipExecutionStartFrame = (
  clip: BossTimelineClip,
  executionIndex: number,
  fps: number
) => (
  toFrame(clip.startSeconds, fps)
  + (executionIndex * getRepeatIntervalFrames(clip, fps))
);

const normalizeTimelineFrame = (
  timeline: BossTimelineConfig,
  phaseFrame: number,
  fps: number
): number | null => {
  const safeFrame = Math.max(0, Math.floor(Number(phaseFrame) || 0));
  const durationFrames = getBossTimelineDurationFrames(timeline, fps);
  if (!timeline.loop && safeFrame > durationFrames) return null;
  return timeline.loop ? safeFrame % durationFrames : safeFrame;
};

/**
 * Resolves one high-level Boss Factory attack to the exact phase variant that
 * owns its executable clips. An omitted phase is accepted only when there is
 * one unambiguous variant.
 */
export const resolveBossTimelineAttackVariant = (
  timeline: BossTimelineConfig,
  attackId: string,
  phaseId?: string
): ResolvedBossTimelineAttackVariant | null => {
  const attack = timeline.attacks?.find((candidate) => candidate.id === attackId);
  if (!attack) return null;
  const variant = phaseId === undefined
    ? (attack.variants.length === 1 ? attack.variants[0] : undefined)
    : attack.variants.find((candidate) => candidate.phaseId === phaseId);
  return variant ? { attack, variant } : null;
};

export const getBossTimelineDurationFrames = (
  timeline: BossTimelineConfig,
  fps = 60
) => toFrame(timeline.durationSeconds, fps);

/**
 * Resolves the first frame that must run when a preview manually starts one
 * authored attack. A linked warning is part of the attack sentence, so the
 * preview begins at the warning even when the damaging clip itself is only a
 * single simulation frame long.
 */
export const getBossTimelineAttackStartFrame = (
  timeline: BossTimelineConfig,
  attackId: string,
  phaseId?: string,
  fps = 60
): number | null => {
  const resolvedAttack = resolveBossTimelineAttackVariant(timeline, attackId, phaseId);
  if (resolvedAttack) {
    const sentenceStartFrames = resolvedAttack.variant.beatClipIds.flatMap((beatClipId) => {
      const beatClip = timeline.clips.find((clip) => (
        clip.id === beatClipId
        && clip.trigger === 'time'
        && clipMatchesPhase(clip, resolvedAttack.variant.phaseId)
      ));
      if (!beatClip) return [];
      const telegraphClip = beatClip.telegraphClipId
        ? timeline.clips.find((clip) => (
            clip.id === beatClip.telegraphClipId
            && clip.trigger === 'time'
            && clipMatchesPhase(clip, resolvedAttack.variant.phaseId)
          ))
        : undefined;
      return [
        Math.min(
          toFrame(beatClip.startSeconds, fps),
          telegraphClip
            ? toFrame(telegraphClip.startSeconds, fps)
            : Number.POSITIVE_INFINITY
        )
      ];
    });
    return sentenceStartFrames.length > 0
      ? Math.min(...sentenceStartFrames)
      : null;
  }

  // Compatibility path for timelines that still expose one damaging clip per
  // attack button instead of Boss Factory attack-sentence metadata.
  const attack = timeline.clips.find((clip) => (
    clip.id === attackId
    && clip.trigger === 'time'
    && clipMatchesPhase(clip, phaseId)
  ));
  if (!attack) return null;

  const warning = attack.telegraphClipId
    ? timeline.clips.find((clip) => (
        clip.id === attack.telegraphClipId
        && clip.trigger === 'time'
        && clipMatchesPhase(clip, phaseId)
      ))
    : undefined;
  return Math.min(
    toFrame(attack.startSeconds, fps),
    warning ? toFrame(warning.startSeconds, fps) : Number.POSITIVE_INFINITY
  );
};

const getBossTimelineClipEndFrame = (
  clip: Readonly<BossTimelineClip>,
  fps: number
) => (
  getClipExecutionStartFrame(clip, getRepeatCount(clip) - 1, fps)
  + toFrame(clip.durationSeconds, fps)
);

/**
 * Resolves the bounded deterministic playback window for one selected attack.
 * Boss Factory sentences run through their authored recovery. Compatibility
 * timelines fall back to one damaging clip plus its linked warning/repeats.
 */
export const getBossTimelineAttackWindow = (
  timeline: BossTimelineConfig,
  attackId: string,
  phaseId?: string,
  fps = 60
): BossTimelineAttackWindow | null => {
  const startFrame = getBossTimelineAttackStartFrame(timeline, attackId, phaseId, fps);
  if (startFrame === null) return null;

  const resolved = resolveBossTimelineAttackVariant(timeline, attackId, phaseId);
  if (resolved) {
    const recovery = timeline.clips.find((clip) => (
      clip.id === resolved.variant.recoveryClipId
      && clip.trigger === 'time'
      && clipMatchesPhase(clip, resolved.variant.phaseId)
    ));
    if (!recovery) return null;
    return Object.freeze({
      attackId: resolved.attack.id,
      phaseId: resolved.variant.phaseId,
      startFrame,
      endFrame: Math.max(startFrame + 1, getBossTimelineClipEndFrame(recovery, fps))
    });
  }

  const clip = timeline.clips.find((candidate) => (
    candidate.id === attackId
    && candidate.trigger === 'time'
    && clipMatchesPhase(candidate, phaseId)
  ));
  if (!clip) return null;
  const warning = clip.telegraphClipId
    ? timeline.clips.find((candidate) => (
        candidate.id === clip.telegraphClipId
        && candidate.trigger === 'time'
        && clipMatchesPhase(candidate, phaseId)
      ))
    : undefined;
  const unclampedEndFrame = Math.max(
    getBossTimelineClipEndFrame(clip, fps),
    warning ? getBossTimelineClipEndFrame(warning, fps) : 0
  );
  const endFrame = timeline.loop
    ? Math.min(getBossTimelineDurationFrames(timeline, fps), unclampedEndFrame)
    : unclampedEndFrame;
  return Object.freeze({
    attackId: clip.id,
    phaseId: clip.phaseId ?? phaseId,
    startFrame,
    endFrame: Math.max(startFrame + 1, endFrame)
  });
};

interface ExpandedBossTimelineBeat {
  readonly clip: Readonly<BossTimelineClip>;
  readonly executionIndex: number;
  readonly fireStartFrame: number;
  readonly fireEndFrame: number;
  readonly warningClip?: Readonly<BossTimelineClip>;
  readonly warningStartFrame?: number;
  readonly warningEndFrame?: number;
}

const expandBossTimelineAttackBeats = (
  timeline: BossTimelineConfig,
  variant: Readonly<BossAttackSentenceVariant>,
  fps: number
): readonly ExpandedBossTimelineBeat[] => variant.beatClipIds
  .flatMap((beatClipId, sourceIndex) => {
    const clip = timeline.clips.find((candidate) => (
      candidate.id === beatClipId
      && candidate.trigger === 'time'
      && clipMatchesPhase(candidate, variant.phaseId)
    ));
    if (!clip) return [];
    const warningClip = clip.telegraphClipId
      ? timeline.clips.find((candidate) => (
          candidate.id === clip.telegraphClipId
          && candidate.trigger === 'time'
          && clipMatchesPhase(candidate, variant.phaseId)
        ))
      : undefined;
    const warningRepeatCount = warningClip ? getRepeatCount(warningClip) : 0;
    return Array.from({ length: getRepeatCount(clip) }, (_, executionIndex) => {
      const hasWarningExecution = warningClip !== undefined && (
        warningClip.repeat !== undefined
          ? executionIndex < warningRepeatCount
          : executionIndex === 0
      );
      const warningStartFrame = hasWarningExecution && warningClip
        ? getClipExecutionStartFrame(warningClip, executionIndex, fps)
        : undefined;
      return {
        clip,
        executionIndex,
        fireStartFrame: getClipExecutionStartFrame(clip, executionIndex, fps),
        fireEndFrame: (
          getClipExecutionStartFrame(clip, executionIndex, fps)
          + toFrame(clip.durationSeconds, fps)
        ),
        ...(warningClip && warningStartFrame !== undefined
          ? {
              warningClip,
              warningStartFrame,
              warningEndFrame: warningStartFrame + toFrame(warningClip.durationSeconds, fps)
            }
          : {}),
        sourceIndex
      };
    });
  })
  .sort((left, right) => (
    left.fireStartFrame - right.fireStartFrame
    || left.sourceIndex - right.sourceIndex
    || left.executionIndex - right.executionIndex
  ))
  .map(({ sourceIndex: _sourceIndex, ...beat }) => beat);

/**
 * Reports the authored attack sentence active at one phase-relative frame.
 * This helper performs no mutation and consumes no randomness, making it safe
 * for deterministic preview diagnostics and replay assertions.
 */
export const getBossTimelineActiveAttackAtFrame = (
  timeline: BossTimelineConfig,
  phaseFrame: number,
  phaseId?: string,
  fps = 60
): ActiveBossTimelineAttack | null => {
  const timelineFrame = normalizeTimelineFrame(timeline, phaseFrame, fps);
  if (timelineFrame === null) return null;

  for (const attack of timeline.attacks ?? []) {
    const resolved = resolveBossTimelineAttackVariant(timeline, attack.id, phaseId);
    if (!resolved) continue;
    const beats = expandBossTimelineAttackBeats(timeline, resolved.variant, fps);
    if (beats.length === 0) continue;
    const recoveryClip = timeline.clips.find((clip) => (
      clip.id === resolved.variant.recoveryClipId
      && clip.trigger === 'time'
      && clipMatchesPhase(clip, resolved.variant.phaseId)
    ));
    if (!recoveryClip) continue;

    const attackStartFrame = Math.min(...beats.map((beat) => (
      beat.warningStartFrame ?? beat.fireStartFrame
    )));
    const recoveryStartFrame = toFrame(recoveryClip.startSeconds, fps);
    const recoveryEndFrame = recoveryStartFrame + toFrame(recoveryClip.durationSeconds, fps);
    if (timelineFrame < attackStartFrame || timelineFrame >= recoveryEndFrame) continue;

    const makeActive = (
      beat: ExpandedBossTimelineBeat,
      stage: BossTimelineAttackStage,
      activeClip: Readonly<BossTimelineClip>
    ): ActiveBossTimelineAttack => ({
      attack: resolved.attack,
      variant: resolved.variant,
      phaseId: resolved.variant.phaseId,
      stage,
      beatIndex: beats.indexOf(beat) + 1,
      beatCount: beats.length,
      beatClip: beat.clip,
      activeClip,
      executionIndex: beat.executionIndex,
      timelineFrame
    });

    if (timelineFrame >= recoveryStartFrame) {
      return makeActive(beats[beats.length - 1], 'recovery', recoveryClip);
    }

    const firingBeat = [...beats].reverse().find((beat) => (
      timelineFrame >= beat.fireStartFrame && timelineFrame < beat.fireEndFrame
    ));
    if (firingBeat) return makeActive(firingBeat, 'fire', firingBeat.clip);

    const warningBeat = [...beats].reverse().find((beat) => (
      beat.warningClip !== undefined
      && beat.warningStartFrame !== undefined
      && beat.warningEndFrame !== undefined
      && timelineFrame >= beat.warningStartFrame
      && timelineFrame < beat.warningEndFrame
    ));
    if (warningBeat?.warningClip) {
      return makeActive(warningBeat, 'warning', warningBeat.warningClip);
    }

    const transitionBeat = beats.find((beat) => beat.fireStartFrame > timelineFrame)
      ?? beats[beats.length - 1];
    return makeActive(transitionBeat, 'transition', transitionBeat.clip);
  }

  return null;
};

/**
 * Returns only the cues due on this exact simulation frame. The caller owns
 * effects and mechanics; this module remains deterministic scheduling only.
 */
export const getBossTimelineCuesAtFrame = (
  timeline: BossTimelineConfig,
  phaseFrame: number,
  phaseId?: string,
  fps = 60
): readonly BossTimelineCue[] => {
  const safeFrame = Math.max(0, Math.floor(Number(phaseFrame) || 0));
  const durationFrames = getBossTimelineDurationFrames(timeline, fps);
  if (!timeline.loop && safeFrame > durationFrames) return [];
  const timelineFrame = timeline.loop
    ? safeFrame % durationFrames
    : safeFrame;
  const cues: BossTimelineCue[] = [];

  for (const clip of timeline.clips) {
    if (clip.trigger !== 'time' || !clipMatchesPhase(clip, phaseId)) continue;
    const startFrame = toFrame(clip.startSeconds, fps);
    const repeatCount = getRepeatCount(clip);
    const intervalFrames = getRepeatIntervalFrames(clip, fps);

    for (let executionIndex = 0; executionIndex < repeatCount; executionIndex += 1) {
      const cueFrame = startFrame + (executionIndex * intervalFrames);
      if (timelineFrame === cueFrame) {
        cues.push({ clip, executionIndex, timelineFrame });
      }
    }
  }

  return cues.slice(0, 8);
};

export const getBossTimelineTriggeredCues = (
  timeline: BossTimelineConfig,
  trigger: Exclude<BossTimelineTrigger, 'time'>,
  phaseId?: string
): readonly BossTimelineCue[] => timeline.clips
  .filter((clip) => clip.trigger === trigger && clipMatchesPhase(clip, phaseId))
  .slice(0, 8)
  .map((clip) => ({ clip, executionIndex: 0, timelineFrame: 0 }));
