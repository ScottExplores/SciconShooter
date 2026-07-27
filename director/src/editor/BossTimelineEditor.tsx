import { useMemo, useState } from 'react';
import type {
  BossEvent,
  BossTimelineClip,
  BossTimelineConfig,
  BossTimelineMotionCue,
  BossTimelinePrimitiveId,
  BossTimelineRotationDirection,
  BossTimelineTrigger,
  EnemyId,
  MovementPathId,
  MovementPatternId,
  SpawnPatternId
} from '../../../game-config/types';
import {
  BOSS_TIMELINE_PRIMITIVES,
  BOSS_TIMELINE_TRACKS
} from '../../../game-config/bossTimeline';
import {
  BOSS_TIMELINE_TEMPLATES,
  createBossTimelineTemplate,
  type BossTimelineTemplateId
} from '../../../game-config/bossTimelineTemplates';
import {
  ENEMY_CATALOG,
  MOVEMENT_PATTERN_CATALOG,
  SPAWN_PATTERN_CATALOG
} from '../../../game-config/catalog';
import { MOVEMENT_PATH_CATALOG } from '../../../game-config/movementPaths';

interface BossTimelineEditorProps {
  boss: BossEvent;
  onChange: (boss: BossEvent) => void;
}

const uid = (prefix: string) => (
  `${prefix}-${globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10)}`
);

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum))
);

const primitiveDefaults = (
  primitiveId: BossTimelinePrimitiveId
): BossTimelineClip['parameters'] => {
  switch (primitiveId) {
    case 'telegraph':
      return { warningSeconds: 0.75, telegraphStyle: 'ring', color: '#ffb454' };
    case 'aimed-burst':
    case 'gap-ring':
    case 'tail-fan':
    case 'inward-collapse':
    case 'rotating-cross':
      return { projectileCount: 6 };
    case 'rotor-hazard-sentence':
      return {
        projectileCount: 6,
        sequence: 0,
        pulseIntervalSeconds: 1,
        motionCue: 'rotor-volley'
      };
    case 'radial-beam-array':
      return {
        sequence: 0,
        motionCue: 'radial-beam',
        rotationDirection: 'seeded-random'
      };
    case 'pod-volley':
      return { projectileCount: 6, sequence: 0 };
    case 'weave-wall':
      return { projectileCount: 18, sequence: 0 };
    case 'helix-volley':
      return { projectileCount: 8, handedness: 'left' };
    case 'side-barrage':
      return { projectileCount: 6, side: 'port', motionCue: 'heavy-cannon' };
    case 'paired-cannon-burst':
      return {
        projectileCount: 6,
        sequence: 0,
        motionCue: 'paired-crossfire',
        shotIntervalFrames: 3,
        projectileSpeedScale: 1,
        channelWidthPixels: 116,
        sweepRangeRatio: 0.34,
        sweepPasses: 1
      };
    case 'summon-formation':
      return {
        summonCount: 4,
        enemyId: 'drone',
        formationPatternId: 'v'
      };
    case 'set-shield':
      return { shieldCount: 3, enabled: true };
    case 'set-weak-point':
      return { componentId: 'helmet', enabled: true };
    case 'set-movement':
      return { movementPatternId: 'gatekeeper-cycle', speedMultiplier: 1 };
    case 'follow-path':
      return { movementPathId: 'sweep-bank-reentry' };
    case 'camera-cue':
      return { strength: 1 };
    case 'effect-cue':
      return { color: '#67e8f9' };
  }
};

const makeClip = (
  primitiveId: BossTimelinePrimitiveId,
  startSeconds: number,
  phaseId?: string
): BossTimelineClip => {
  const descriptor = BOSS_TIMELINE_PRIMITIVES[primitiveId];
  const durationSeconds = primitiveId === 'telegraph'
    ? 0.75
    : primitiveId === 'follow-path'
      ? MOVEMENT_PATH_CATALOG['sweep-bank-reentry'].defaultDurationSeconds
      : 0.2;
  return {
    id: uid(primitiveId),
    label: descriptor.label,
    track: descriptor.track,
    primitiveId,
    trigger: 'time',
    startSeconds,
    durationSeconds,
    phaseId,
    parameters: primitiveDefaults(primitiveId)
  };
};

const warningParametersFor = (
  primitiveId: BossTimelinePrimitiveId
): NonNullable<BossTimelineClip['parameters']> => {
  if (primitiveId === 'cross-beam' || primitiveId === 'rail-sweep') {
    return { warningSeconds: 0.75, telegraphStyle: 'lane', color: '#fb7185' };
  }
  if (primitiveId === 'weave-wall') {
    return { warningSeconds: 0.75, telegraphStyle: 'lane', color: '#67e8f9' };
  }
  if (primitiveId === 'aimed-burst' || primitiveId === 'inward-collapse') {
    return { warningSeconds: 0.75, telegraphStyle: 'target', color: '#facc15' };
  }
  if (primitiveId === 'gap-ring' || primitiveId === 'rotating-cross') {
    return { warningSeconds: 0.75, telegraphStyle: 'ring', color: '#67e8f9' };
  }
  if (primitiveId === 'radial-beam-array') {
    return { warningSeconds: 0.75, telegraphStyle: 'spokes', color: '#f97316' };
  }
  return { warningSeconds: 0.75, telegraphStyle: 'warning', color: '#fb7185' };
};

const sortClips = (clips: BossTimelineClip[]) => [...clips].sort((left, right) => (
  left.startSeconds - right.startSeconds || left.id.localeCompare(right.id)
));

const NumberInput = ({
  label,
  value,
  min,
  max,
  step,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) => (
  <label className="le-field">
    <span>{label}</span>
    <input
      type="number"
      value={Number.isFinite(value) ? value : min}
      min={min}
      max={max}
      step={step}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  </label>
);

export function BossTimelineEditor({ boss, onChange }: BossTimelineEditorProps) {
  const timeline = boss.timeline;
  const [selectedClipId, setSelectedClipId] = useState<string | null>(
    timeline?.clips[0]?.id ?? null
  );
  const selectedClip = timeline?.clips.find((clip) => clip.id === selectedClipId)
    ?? timeline?.clips[0];
  const primitiveOptions = Object.values(BOSS_TIMELINE_PRIMITIVES);
  const priorTelegraphs = useMemo(() => {
    if (!timeline || !selectedClip) return [];
    return timeline.clips.filter((clip) => (
      clip.primitiveId === 'telegraph'
      && clip.startSeconds < selectedClip.startSeconds
      && (clip.phaseId === undefined || clip.phaseId === selectedClip.phaseId)
    ));
  }, [selectedClip, timeline]);

  const commitTimeline = (nextTimeline: BossTimelineConfig | undefined) => {
    onChange({ ...boss, timeline: nextTimeline });
  };

  const updateClip = (clipId: string, patch: Partial<BossTimelineClip>) => {
    if (!timeline) return;
    commitTimeline({
      ...timeline,
      clips: sortClips(timeline.clips.map((clip) => (
        clip.id === clipId ? { ...clip, ...patch } : clip
      )))
    });
  };

  const updateParameters = (patch: NonNullable<BossTimelineClip['parameters']>) => {
    if (!selectedClip) return;
    updateClip(selectedClip.id, {
      parameters: { ...(selectedClip.parameters ?? {}), ...patch }
    });
  };

  const updateRepeat = (repeat: BossTimelineClip['repeat']) => {
    if (!timeline || !selectedClip) return;
    const descriptor = BOSS_TIMELINE_PRIMITIVES[selectedClip.primitiveId];
    const linkedTelegraphId = descriptor.damaging
      ? selectedClip.telegraphClipId
      : undefined;
    const repeatSpan = repeat
      ? (Math.max(1, repeat.count) - 1) * repeat.intervalSeconds
      : 0;
    commitTimeline({
      ...timeline,
      durationSeconds: clamp(
        Math.max(timeline.durationSeconds, selectedClip.startSeconds + repeatSpan + 0.5),
        0.1,
        180
      ),
      clips: sortClips(timeline.clips.map((clip) => {
        if (clip.id === selectedClip.id) return { ...clip, repeat };
        if (linkedTelegraphId && clip.id === linkedTelegraphId) {
          return { ...clip, repeat };
        }
        return clip;
      }))
    });
  };

  const addClip = (primitiveId: BossTimelinePrimitiveId) => {
    if (!timeline) return;
    const descriptor = BOSS_TIMELINE_PRIMITIVES[primitiveId];
    const latestEnd = timeline.clips.reduce(
      (maximum, clip) => Math.max(maximum, clip.startSeconds + clip.durationSeconds),
      0
    );
    const nextStart = clamp(latestEnd + 0.35, 0, 179);
    const phaseId = boss.phases[0]?.id;
    const additions: BossTimelineClip[] = [];
    let clip = makeClip(primitiveId, nextStart, phaseId);

    if (descriptor.damaging) {
      const telegraph = {
        ...makeClip('telegraph', nextStart, phaseId),
        parameters: warningParametersFor(primitiveId)
      };
      clip = {
        ...clip,
        startSeconds: nextStart + telegraph.durationSeconds,
        telegraphClipId: telegraph.id
      };
      additions.push(telegraph);
    }

    additions.push(clip);
    const requiredDuration = clip.startSeconds + clip.durationSeconds + 0.5;
    commitTimeline({
      ...timeline,
      durationSeconds: clamp(Math.max(timeline.durationSeconds, requiredDuration), 0.1, 180),
      clips: sortClips([...timeline.clips, ...additions])
    });
    setSelectedClipId(clip.id);
  };

  const changePrimitive = (primitiveId: BossTimelinePrimitiveId) => {
    if (!timeline || !selectedClip) return;
    const descriptor = BOSS_TIMELINE_PRIMITIVES[primitiveId];
    let nextClip: BossTimelineClip = {
      ...selectedClip,
      label: descriptor.label,
      primitiveId,
      track: descriptor.track,
      trigger: descriptor.damaging || primitiveId === 'follow-path' ? 'time' : selectedClip.trigger,
      durationSeconds: primitiveId === 'follow-path'
        ? MOVEMENT_PATH_CATALOG['sweep-bank-reentry'].defaultDurationSeconds
        : selectedClip.durationSeconds,
      parameters: primitiveDefaults(primitiveId),
      repeat: descriptor.supportsRepeat ? selectedClip.repeat : undefined,
      telegraphClipId: descriptor.damaging ? selectedClip.telegraphClipId : undefined
    };
    const clips = [...timeline.clips];

    if (descriptor.damaging) {
      const linkedTelegraph = clips.find((clip) => clip.id === nextClip.telegraphClipId);
      const linkedElsewhere = linkedTelegraph
        ? clips.some((clip) => (
            clip.id !== nextClip.id
            && clip.telegraphClipId === linkedTelegraph.id
          ))
        : false;
      const attackStart = Math.max(0.75, nextClip.startSeconds);
      const warningPatch = {
        trigger: 'time' as const,
        startSeconds: Math.max(0, attackStart - 0.75),
        durationSeconds: 0.75,
        phaseId: nextClip.phaseId,
        repeat: nextClip.repeat,
        parameters: warningParametersFor(primitiveId)
      };

      if (linkedTelegraph?.primitiveId === 'telegraph' && !linkedElsewhere) {
        const linkedIndex = clips.findIndex((clip) => clip.id === linkedTelegraph.id);
        clips[linkedIndex] = { ...linkedTelegraph, ...warningPatch };
        nextClip = {
          ...nextClip,
          startSeconds: attackStart,
          telegraphClipId: linkedTelegraph.id
        };
      } else {
        const telegraph = {
          ...makeClip('telegraph', warningPatch.startSeconds, nextClip.phaseId),
          ...warningPatch
        };
        nextClip = {
          ...nextClip,
          startSeconds: attackStart,
          telegraphClipId: telegraph.id
        };
        clips.push(telegraph);
      }
    }

    commitTimeline({
      ...timeline,
      durationSeconds: clamp(
        Math.max(timeline.durationSeconds, nextClip.startSeconds + nextClip.durationSeconds + 0.5),
        0.1,
        180
      ),
      clips: sortClips(clips.map((clip) => (
        clip.id === nextClip.id ? nextClip : clip
      )))
    });
  };

  const deleteClip = () => {
    if (!timeline || !selectedClip) return;
    const clips = timeline.clips
      .filter((clip) => clip.id !== selectedClip.id)
      .map((clip) => (
        clip.telegraphClipId === selectedClip.id
          ? { ...clip, telegraphClipId: undefined }
          : clip
      ));
    commitTimeline({ ...timeline, clips });
    setSelectedClipId(clips[0]?.id ?? null);
  };

  if (!timeline) {
    return (
      <fieldset className="le-fieldset le-boss-timeline">
        <legend>Visual boss timeline</legend>
        <p className="le-formation-note">
          Compose movement, attacks, lasers, summons, defenses, and presentation
          from bounded engine primitives. Existing boss behavior is preserved until
          a timeline is enabled.
        </p>
        <div className="le-boss-timeline__templates">
          {BOSS_TIMELINE_TEMPLATES.map((template) => (
            <button
              className="le-button"
              type="button"
              key={template.id}
              title={template.description}
              onClick={() => {
                const nextTimeline = createBossTimelineTemplate(template.id, boss);
                commitTimeline(nextTimeline);
                setSelectedClipId(nextTimeline.clips.find((clip) => (
                  BOSS_TIMELINE_PRIMITIVES[clip.primitiveId].damaging
                ))?.id ?? nextTimeline.clips[0]?.id ?? null);
              }}
            >
              {template.label}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }

  const selectedDescriptor = selectedClip
    ? BOSS_TIMELINE_PRIMITIVES[selectedClip.primitiveId]
    : undefined;

  return (
    <fieldset className="le-fieldset le-boss-timeline">
      <legend>Visual boss timeline</legend>
      <div className="le-field-row">
        <NumberInput
          label="Loop duration"
          value={timeline.durationSeconds}
          min={0.1}
          max={180}
          step={0.25}
          onChange={(durationSeconds) => commitTimeline({
            ...timeline,
            durationSeconds: clamp(durationSeconds, 0.1, 180)
          })}
        />
        <label className="le-check-row">
          <input
            type="checkbox"
            checked={timeline.loop}
            onChange={(event) => commitTimeline({ ...timeline, loop: event.target.checked })}
          />
          <span>Loop within each phase</span>
        </label>
      </div>

      <div className="le-boss-timeline__tracks" aria-label="Boss timeline tracks">
        {BOSS_TIMELINE_TRACKS.map((track) => {
          const clips = timeline.clips.filter((clip) => clip.track === track.id);
          return (
            <div className="le-boss-timeline__track" key={track.id}>
              <strong>{track.label}</strong>
              <div>
                {clips.length === 0 ? <small>Empty</small> : clips.map((clip) => (
                  <button
                    className={clip.id === selectedClip?.id ? 'is-selected' : ''}
                    type="button"
                    key={clip.id}
                    onClick={() => setSelectedClipId(clip.id)}
                    style={{
                      '--clip-offset': `${clamp((clip.startSeconds / timeline.durationSeconds) * 100, 0, 96)}%`,
                      '--clip-width': `${clamp((clip.durationSeconds / timeline.durationSeconds) * 100, 3, 100)}%`
                    } as React.CSSProperties}
                    title={`${clip.label} at ${clip.startSeconds.toFixed(2)}s`}
                  >
                    {clip.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="le-boss-timeline__palette">
        <span>Add primitive</span>
        <div>
          {primitiveOptions.map((primitive) => (
            <button
              type="button"
              key={primitive.id}
              onClick={() => addClip(primitive.id)}
              title={primitive.description}
            >
              {primitive.label}
            </button>
          ))}
        </div>
      </div>

      <label className="le-field">
        <span>Replace with template</span>
        <select
          value=""
          onChange={(event) => {
            if (!event.target.value) return;
            const nextTimeline = createBossTimelineTemplate(
              event.target.value as BossTimelineTemplateId,
              boss
            );
            commitTimeline(nextTimeline);
            setSelectedClipId(nextTimeline.clips[0]?.id ?? null);
          }}
        >
          <option value="">Choose a safe template…</option>
          {BOSS_TIMELINE_TEMPLATES.map((template) => (
            <option value={template.id} key={template.id}>{template.label}</option>
          ))}
        </select>
      </label>

      {selectedClip && selectedDescriptor ? (
        <article className="le-boss-timeline__inspector">
          <header>
            <div>
              <small>{selectedDescriptor.track} primitive</small>
              <strong>{selectedClip.label}</strong>
            </div>
            <button type="button" onClick={deleteClip}>Remove</button>
          </header>

          <label className="le-field">
            <span>Primitive</span>
            <select
              value={selectedClip.primitiveId}
              onChange={(event) => changePrimitive(event.target.value as BossTimelinePrimitiveId)}
            >
              {primitiveOptions.map((primitive) => (
                <option value={primitive.id} key={primitive.id}>{primitive.label}</option>
              ))}
            </select>
          </label>
          <label className="le-field">
            <span>Clip name</span>
            <input
              value={selectedClip.label}
              maxLength={100}
              onChange={(event) => updateClip(selectedClip.id, { label: event.target.value })}
            />
          </label>
          <div className="le-field-row">
            <label className="le-field">
              <span>Trigger</span>
              <select
                value={selectedClip.trigger}
                onChange={(event) => updateClip(selectedClip.id, {
                  trigger: event.target.value as BossTimelineTrigger
                })}
              >
                <option value="time">Timeline time</option>
                {!selectedDescriptor.damaging ? <option value="phase-enter">Phase enter</option> : null}
                {!selectedDescriptor.damaging ? <option value="death">Boss death</option> : null}
              </select>
            </label>
            <label className="le-field">
              <span>Phase</span>
              <select
                value={selectedClip.phaseId ?? ''}
                onChange={(event) => updateClip(selectedClip.id, {
                  phaseId: event.target.value || undefined
                })}
              >
                <option value="">Every phase</option>
                {boss.phases.map((phase) => (
                  <option value={phase.id} key={phase.id}>{phase.label}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="le-field-row">
            <NumberInput
              label="Start"
              value={selectedClip.startSeconds}
              min={0}
              max={timeline.durationSeconds}
              step={0.05}
              onChange={(startSeconds) => updateClip(selectedClip.id, {
                startSeconds: clamp(startSeconds, 0, timeline.durationSeconds)
              })}
            />
            <NumberInput
              label="Duration"
              value={selectedClip.durationSeconds}
              min={0.01}
              max={60}
              step={0.05}
              onChange={(durationSeconds) => updateClip(selectedClip.id, {
                durationSeconds: clamp(durationSeconds, 0.01, 60)
              })}
            />
          </div>

          {selectedDescriptor.damaging ? (
            <label className="le-field">
              <span>Required warning</span>
              <select
                value={selectedClip.telegraphClipId ?? ''}
                onChange={(event) => updateClip(selectedClip.id, {
                  telegraphClipId: event.target.value || undefined
                })}
              >
                <option value="">Choose an earlier telegraph</option>
                {priorTelegraphs.map((clip) => (
                  <option value={clip.id} key={clip.id}>
                    {clip.label} at {clip.startSeconds.toFixed(2)}s
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {selectedDescriptor.supportsRepeat ? (
            <div className="le-field-row">
              <NumberInput
                label="Repeat count"
                value={selectedClip.repeat?.count ?? 1}
                min={1}
                max={8}
                step={1}
                onChange={(count) => updateRepeat(count <= 1
                  ? undefined
                  : {
                      count: Math.round(clamp(count, 1, 8)),
                      intervalSeconds: selectedClip.repeat?.intervalSeconds ?? 0.5
                    })}
              />
              <NumberInput
                label="Repeat interval"
                value={selectedClip.repeat?.intervalSeconds ?? 0.5}
                min={0.05}
                max={30}
                step={0.05}
                onChange={(intervalSeconds) => updateRepeat({
                    count: selectedClip.repeat?.count ?? 2,
                    intervalSeconds: clamp(intervalSeconds, 0.05, 30)
                  })}
              />
            </div>
          ) : null}

          {['aimed-burst', 'gap-ring', 'rotor-hazard-sentence', 'paired-cannon-burst', 'tail-fan', 'inward-collapse', 'rotating-cross', 'helix-volley', 'side-barrage', 'pod-volley', 'weave-wall'].includes(selectedClip.primitiveId) ? (
            <NumberInput
              label="Projectile / beam count"
              value={selectedClip.parameters?.projectileCount ?? 6}
              min={1}
              max={24}
              step={1}
              onChange={(projectileCount) => updateParameters({
                projectileCount: Math.round(clamp(projectileCount, 1, 24))
              })}
            />
          ) : null}
          {['gap-ring', 'rotor-hazard-sentence', 'radial-beam-array', 'paired-cannon-burst', 'rail-sweep', 'tail-fan', 'inward-collapse', 'rotating-cross', 'helix-volley', 'pod-volley', 'weave-wall'].includes(selectedClip.primitiveId) ? (
            <NumberInput
              label="Sequence variant"
              value={selectedClip.parameters?.sequence ?? 0}
              min={0}
              max={100000}
              step={1}
              onChange={(sequence) => updateParameters({
                sequence: Math.round(clamp(sequence, 0, 100000))
              })}
            />
          ) : null}
          {selectedClip.primitiveId === 'rotor-hazard-sentence' ? (
            <NumberInput
              label="Pulse interval"
              value={selectedClip.parameters?.pulseIntervalSeconds ?? 1}
              min={0.5}
              max={2}
              step={0.05}
              onChange={(pulseIntervalSeconds) => updateParameters({
                pulseIntervalSeconds: clamp(pulseIntervalSeconds, 0.5, 2)
              })}
            />
          ) : null}
          {selectedClip.primitiveId === 'paired-cannon-burst' ? (
            <>
              <label className="le-field">
                <span>Weapon motion</span>
                <select
                  value={selectedClip.parameters?.motionCue ?? 'paired-crossfire'}
                  onChange={(event) => updateParameters({
                    motionCue: event.target.value as BossTimelineMotionCue
                  })}
                >
                  <option value="paired-crossfire">Paired crossfire</option>
                  <option value="machinegun-channel">Moving machine-gun channel</option>
                </select>
              </label>
              <NumberInput
                label="Shot cadence (frames)"
                value={selectedClip.parameters?.shotIntervalFrames ?? 3}
                min={2}
                max={12}
                step={1}
                onChange={(shotIntervalFrames) => updateParameters({
                  shotIntervalFrames: Math.round(clamp(shotIntervalFrames, 2, 12))
                })}
              />
              <NumberInput
                label="Projectile speed"
                value={selectedClip.parameters?.projectileSpeedScale ?? 1}
                min={0.5}
                max={2}
                step={0.05}
                onChange={(projectileSpeedScale) => updateParameters({
                  projectileSpeedScale: clamp(projectileSpeedScale, 0.5, 2)
                })}
              />
              {selectedClip.parameters?.motionCue === 'machinegun-channel' ? (
                <>
                  <NumberInput
                    label="Safe channel width"
                    value={selectedClip.parameters?.channelWidthPixels ?? 116}
                    min={72}
                    max={320}
                    step={2}
                    onChange={(channelWidthPixels) => updateParameters({
                      channelWidthPixels: clamp(channelWidthPixels, 72, 320)
                    })}
                  />
                  <NumberInput
                    label="Boss sweep range"
                    value={selectedClip.parameters?.sweepRangeRatio ?? 0.34}
                    min={0.1}
                    max={0.8}
                    step={0.01}
                    onChange={(sweepRangeRatio) => updateParameters({
                      sweepRangeRatio: clamp(sweepRangeRatio, 0.1, 0.8)
                    })}
                  />
                  <NumberInput
                    label="Sweep passes"
                    value={selectedClip.parameters?.sweepPasses ?? 1}
                    min={1}
                    max={3}
                    step={1}
                    onChange={(sweepPasses) => updateParameters({
                      sweepPasses: Math.round(clamp(sweepPasses, 1, 3))
                    })}
                  />
                  <small>
                    Sweep speed is the selected range divided by this clip&apos;s duration.
                    Telegraph and recovery timing remain editable on their own clips.
                  </small>
                </>
              ) : null}
            </>
          ) : null}
          {selectedClip.primitiveId === 'radial-beam-array' ? (
            <label className="le-field">
              <span>Rotation direction</span>
              <select
                value={selectedClip.parameters?.rotationDirection ?? 'seeded-random'}
                onChange={(event) => updateParameters({
                  rotationDirection: event.target.value as BossTimelineRotationDirection
                })}
              >
                <option value="seeded-random">Seeded random</option>
                <option value="clockwise">Clockwise</option>
                <option value="counterclockwise">Counterclockwise</option>
              </select>
              <small>Seeded random varies each timeline loop while remaining replayable.</small>
            </label>
          ) : null}
          {selectedClip.primitiveId === 'telegraph' ? (
            <>
              <NumberInput
                label="Warning lead"
                value={selectedClip.parameters?.warningSeconds ?? 0.75}
                min={0.1}
                max={10}
                step={0.05}
                onChange={(warningSeconds) => updateParameters({
                  warningSeconds: clamp(warningSeconds, 0.1, 10)
                })}
              />
              <label className="le-field">
                <span>Warning shape</span>
                <select
                  value={selectedClip.parameters?.telegraphStyle ?? 'ring'}
                  onChange={(event) => updateParameters({
                    telegraphStyle: event.target.value as 'warning' | 'lane' | 'target' | 'ring' | 'spokes'
                  })}
                >
                  <option value="warning">Warning</option>
                  <option value="lane">Lane</option>
                  <option value="target">Target</option>
                  <option value="ring">Ring</option>
                  <option value="spokes">Spokes</option>
                </select>
              </label>
              <label className="le-field">
                <span>Warning color</span>
                <input
                  type="color"
                  value={selectedClip.parameters?.color ?? '#ffb454'}
                  onChange={(event) => updateParameters({ color: event.target.value })}
                />
              </label>
            </>
          ) : null}
          {selectedClip.primitiveId === 'summon-formation' ? (
            <>
              <NumberInput
                label="Summon count"
                value={selectedClip.parameters?.summonCount ?? 4}
                min={1}
                max={12}
                step={1}
                onChange={(summonCount) => updateParameters({
                  summonCount: Math.round(clamp(summonCount, 1, 12))
                })}
              />
              <label className="le-field">
                <span>Enemy</span>
                <select
                  value={selectedClip.parameters?.enemyId ?? 'drone'}
                  onChange={(event) => updateParameters({ enemyId: event.target.value as EnemyId })}
                >
                  {Object.values(ENEMY_CATALOG).map((enemy) => (
                    <option value={enemy.id} key={enemy.id}>{enemy.label}</option>
                  ))}
                </select>
              </label>
              <label className="le-field">
                <span>Formation</span>
                <select
                  value={selectedClip.parameters?.formationPatternId ?? 'v'}
                  onChange={(event) => updateParameters({
                    formationPatternId: event.target.value as SpawnPatternId
                  })}
                >
                  {Object.values(SPAWN_PATTERN_CATALOG).map((pattern) => (
                    <option value={pattern.id} key={pattern.id}>{pattern.label}</option>
                  ))}
                </select>
              </label>
            </>
          ) : null}
          {selectedClip.primitiveId === 'set-shield' ? (
            <>
              <NumberInput
                label="Shield count"
                value={selectedClip.parameters?.shieldCount ?? 0}
                min={0}
                max={12}
                step={1}
                onChange={(shieldCount) => updateParameters({
                  shieldCount: Math.round(clamp(shieldCount, 0, 12))
                })}
              />
              <label className="le-check-row">
                <input
                  type="checkbox"
                  checked={selectedClip.parameters?.enabled ?? true}
                  onChange={(event) => updateParameters({ enabled: event.target.checked })}
                />
                <span>Shield ring enabled</span>
              </label>
            </>
          ) : null}
          {selectedClip.primitiveId === 'set-weak-point' ? (
            <div className="le-field-row">
              <label className="le-field">
                <span>Component</span>
                <select
                  value={selectedClip.parameters?.componentId ?? 'helmet'}
                  onChange={(event) => updateParameters({
                    componentId: event.target.value as 'left-cannon' | 'right-cannon' | 'helmet'
                  })}
                >
                  <option value="left-cannon">Left cannon</option>
                  <option value="right-cannon">Right cannon</option>
                  <option value="helmet">Helmet</option>
                </select>
              </label>
              <label className="le-check-row">
                <input
                  type="checkbox"
                  checked={selectedClip.parameters?.enabled ?? true}
                  onChange={(event) => updateParameters({ enabled: event.target.checked })}
                />
                <span>Weak point enabled</span>
              </label>
            </div>
          ) : null}
          {selectedClip.primitiveId === 'set-movement' ? (
            <>
              <label className="le-field">
                <span>Movement</span>
                <select
                  value={selectedClip.parameters?.movementPatternId ?? boss.movementPatternId}
                  onChange={(event) => updateParameters({
                    movementPatternId: event.target.value as MovementPatternId
                  })}
                >
                  {Object.values(MOVEMENT_PATTERN_CATALOG).map((movement) => (
                    <option value={movement.id} key={movement.id}>{movement.label}</option>
                  ))}
                </select>
              </label>
              <NumberInput
                label="Speed multiplier"
                value={selectedClip.parameters?.speedMultiplier ?? 1}
                min={0.1}
                max={8}
                step={0.1}
                onChange={(speedMultiplier) => updateParameters({
                  speedMultiplier: clamp(speedMultiplier, 0.1, 8)
                })}
              />
            </>
          ) : null}
          {selectedClip.primitiveId === 'follow-path' ? (
            <label className="le-field">
              <span>Movement path</span>
              <select
                value={selectedClip.parameters?.movementPathId ?? 'sweep-bank-reentry'}
                onChange={(event) => updateParameters({
                  movementPathId: event.target.value as MovementPathId
                })}
              >
                {Object.values(MOVEMENT_PATH_CATALOG).map((movementPath) => (
                  <option value={movementPath.id} key={movementPath.id}>{movementPath.label}</option>
                ))}
              </select>
              <small>{MOVEMENT_PATH_CATALOG[
                selectedClip.parameters?.movementPathId ?? 'sweep-bank-reentry'
              ].description}</small>
            </label>
          ) : null}
          {selectedClip.primitiveId === 'helix-volley' ? (
            <label className="le-field">
              <span>Handedness</span>
              <select
                value={selectedClip.parameters?.handedness ?? 'left'}
                onChange={(event) => updateParameters({
                  handedness: event.target.value as 'left' | 'right'
                })}
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </label>
          ) : null}
          {selectedClip.primitiveId === 'side-barrage' ? (
            <>
              <label className="le-field">
                <span>Side</span>
                <select
                  value={selectedClip.parameters?.side ?? 'port'}
                  onChange={(event) => updateParameters({
                    side: event.target.value as 'port' | 'starboard'
                  })}
                >
                  <option value="port">Port</option>
                  <option value="starboard">Starboard</option>
                </select>
              </label>
              <label className="le-field">
                <span>Weapon motion</span>
                <select
                  value={selectedClip.parameters?.motionCue ?? 'heavy-cannon'}
                  onChange={(event) => updateParameters({
                    motionCue: event.target.value as BossTimelineMotionCue
                  })}
                >
                  <option value="heavy-cannon">Heavy cannon</option>
                  <option value="gatling-barrage">Gatling barrage</option>
                </select>
              </label>
            </>
          ) : null}
          {selectedClip.primitiveId === 'effect-cue' ? (
            <label className="le-field">
              <span>Effect color</span>
              <input
                type="color"
                value={selectedClip.parameters?.color ?? '#67e8f9'}
                onChange={(event) => updateParameters({ color: event.target.value })}
              />
            </label>
          ) : null}
          {selectedClip.primitiveId === 'camera-cue' ? (
            <NumberInput
              label="Camera strength"
              value={selectedClip.parameters?.strength ?? 1}
              min={0}
              max={10}
              step={0.1}
              onChange={(strength) => updateParameters({
                strength: clamp(strength, 0, 10)
              })}
            />
          ) : null}

          <p className="le-boss-timeline__description">{selectedDescriptor.description}</p>
        </article>
      ) : (
        <p className="le-formation-note">Add or select a primitive to edit its timing and parameters.</p>
      )}

      <button
        className="le-button le-button--danger"
        type="button"
        onClick={() => {
          commitTimeline(undefined);
          setSelectedClipId(null);
        }}
      >
        Disable timeline and use compatibility behavior
      </button>
    </fieldset>
  );
}
