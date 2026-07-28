import {
  FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES,
  normalizeFrontierCrownclawAttackTuning,
  type FrontierCrownclawAttackTuning,
  type FrontierCrownclawCrabwalkTuning,
  type FrontierCrownclawHarpoonTuning,
  type FrontierCrownclawNumericTuningRange,
  type FrontierCrownclawReactorTuning
} from './frontierCrownclawAttackTuning';

export interface FrontierCrownclawAttackTuningPanelProps {
  readonly value: Readonly<FrontierCrownclawAttackTuning>;
  readonly onChange: (value: Readonly<FrontierCrownclawAttackTuning>) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

function NumericControl({
  id,
  label,
  value,
  range,
  disabled,
  onChange
}: {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly range: FrontierCrownclawNumericTuningRange;
  readonly disabled: boolean;
  readonly onChange: (value: number) => void;
}) {
  return (
    <label className="frontier-crownclaw-attack-tuning__control" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        type="number"
        inputMode={range.step < 1 ? 'decimal' : 'numeric'}
        min={range.minimum}
        max={range.maximum}
        step={range.step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function FrontierCrownclawAttackTuningPanel({
  value,
  onChange,
  disabled = false,
  className
}: FrontierCrownclawAttackTuningPanelProps) {
  const emitHarpoon = (patch: Partial<FrontierCrownclawHarpoonTuning>) => {
    onChange(normalizeFrontierCrownclawAttackTuning({
      ...value,
      harpoon: { ...value.harpoon, ...patch }
    }));
  };
  const emitReactor = (patch: Partial<FrontierCrownclawReactorTuning>) => {
    onChange(normalizeFrontierCrownclawAttackTuning({
      ...value,
      reactor: { ...value.reactor, ...patch }
    }));
  };
  const emitCrabwalk = (patch: Partial<FrontierCrownclawCrabwalkTuning>) => {
    onChange(normalizeFrontierCrownclawAttackTuning({
      ...value,
      crabwalk: { ...value.crabwalk, ...patch }
    }));
  };

  return (
    <section
      className={['frontier-crownclaw-attack-tuning', className]
        .filter(Boolean)
        .join(' ')}
      aria-label="Frontier Crownclaw attack tuning"
    >
      <fieldset data-frontier-attack="harpoon" disabled={disabled}>
        <legend>Attack 1 - Chainclaw Harpoon + Cross-Link</legend>
        <NumericControl
          id="frontier-harpoon-target-lock"
          label="Target lock (frames)"
          value={value.harpoon.targetLockFrames}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.harpoon.targetLockFrames}
          disabled={disabled}
          onChange={(targetLockFrames) => emitHarpoon({ targetLockFrames })}
        />
        <NumericControl
          id="frontier-harpoon-launch-speed"
          label="Launch speed multiplier"
          value={value.harpoon.launchSpeedMultiplier}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.harpoon.launchSpeedMultiplier}
          disabled={disabled}
          onChange={(launchSpeedMultiplier) => emitHarpoon({ launchSpeedMultiplier })}
        />
        <NumericControl
          id="frontier-harpoon-extension"
          label="Max extension (arena ratio)"
          value={value.harpoon.maxExtensionRatio}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.harpoon.maxExtensionRatio}
          disabled={disabled}
          onChange={(maxExtensionRatio) => emitHarpoon({ maxExtensionRatio })}
        />
        <NumericControl
          id="frontier-harpoon-tension"
          label="Tension hold (frames)"
          value={value.harpoon.tensionFrames}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.harpoon.tensionFrames}
          disabled={disabled}
          onChange={(tensionFrames) => emitHarpoon({ tensionFrames })}
        />
        <NumericControl
          id="frontier-harpoon-close-delay"
          label="Claw close delay (frames)"
          value={value.harpoon.closeDelayFrames}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.harpoon.closeDelayFrames}
          disabled={disabled}
          onChange={(closeDelayFrames) => emitHarpoon({ closeDelayFrames })}
        />
        <NumericControl
          id="frontier-harpoon-retract-speed"
          label="Retract speed multiplier"
          value={value.harpoon.retractSpeedMultiplier}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.harpoon.retractSpeedMultiplier}
          disabled={disabled}
          onChange={(retractSpeedMultiplier) => emitHarpoon({ retractSpeedMultiplier })}
        />
        <NumericControl
          id="frontier-harpoon-launch-count"
          label="Launch count per cast"
          value={value.harpoon.launchCount}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.harpoon.launchCount}
          disabled={disabled}
          onChange={(launchCount) => emitHarpoon({ launchCount })}
        />
        <NumericControl
          id="frontier-harpoon-launch-angle"
          label="Launch angle (degrees)"
          value={value.harpoon.launchAngleDegrees}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.harpoon.launchAngleDegrees}
          disabled={disabled}
          onChange={(launchAngleDegrees) => emitHarpoon({ launchAngleDegrees })}
        />
        <NumericControl
          id="frontier-cross-link-spacing"
          label="Cross-Link spacing (frames)"
          value={value.harpoon.crossLinkSpacingFrames}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.harpoon.crossLinkSpacingFrames}
          disabled={disabled}
          onChange={(crossLinkSpacingFrames) => emitHarpoon({ crossLinkSpacingFrames })}
        />
        <NumericControl
          id="frontier-cross-link-opening"
          label="Cross-Link safe opening (px)"
          value={value.harpoon.crossLinkSafeOpeningPixels}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.harpoon.crossLinkSafeOpeningPixels}
          disabled={disabled}
          onChange={(crossLinkSafeOpeningPixels) => emitHarpoon({
            crossLinkSafeOpeningPixels
          })}
        />
      </fieldset>

      <fieldset data-frontier-attack="reactor" disabled={disabled}>
        <legend>Attack 2 - Crown Reactor Beam</legend>
        <NumericControl
          id="frontier-reactor-charge"
          label="Reactor charge (frames)"
          value={value.reactor.chargeFrames}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.reactor.chargeFrames}
          disabled={disabled}
          onChange={(chargeFrames) => emitReactor({ chargeFrames })}
        />
        <NumericControl
          id="frontier-reactor-pulses"
          label="Pulse count per sweep"
          value={value.reactor.pulseCount}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.reactor.pulseCount}
          disabled={disabled}
          onChange={(pulseCount) => emitReactor({ pulseCount })}
        />
        <NumericControl
          id="frontier-reactor-beam-width"
          label="Beam width safety budget (px)"
          value={value.reactor.beamWidthPixels}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.reactor.beamWidthPixels}
          disabled={disabled}
          onChange={(beamWidthPixels) => emitReactor({ beamWidthPixels })}
        />
        <NumericControl
          id="frontier-reactor-beam-duration"
          label="Beam duration (frames)"
          value={value.reactor.beamDurationFrames}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.reactor.beamDurationFrames}
          disabled={disabled}
          onChange={(beamDurationFrames) => emitReactor({ beamDurationFrames })}
        />
        <NumericControl
          id="frontier-reactor-sweep-speed"
          label="Sweep speed multiplier"
          value={value.reactor.sweepSpeedMultiplier}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.reactor.sweepSpeedMultiplier}
          disabled={disabled}
          onChange={(sweepSpeedMultiplier) => emitReactor({ sweepSpeedMultiplier })}
        />
        <NumericControl
          id="frontier-reactor-sweep-range"
          label="Sweep range (arena ratio)"
          value={value.reactor.sweepRangeRatio}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.reactor.sweepRangeRatio}
          disabled={disabled}
          onChange={(sweepRangeRatio) => emitReactor({ sweepRangeRatio })}
        />
        <NumericControl
          id="frontier-reactor-recovery"
          label="Reactor recovery (frames)"
          value={value.reactor.recoveryFrames}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.reactor.recoveryFrames}
          disabled={disabled}
          onChange={(recoveryFrames) => emitReactor({ recoveryFrames })}
        />
        <NumericControl
          id="frontier-reactor-safe-region"
          label="Safe region (arena ratio)"
          value={value.reactor.safeRegionRatio}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.reactor.safeRegionRatio}
          disabled={disabled}
          onChange={(safeRegionRatio) => emitReactor({ safeRegionRatio })}
        />
      </fieldset>

      <fieldset data-frontier-attack="crabwalk" disabled={disabled}>
        <legend>Attack 3 - Bastion Crabwalk Barrage</legend>
        <NumericControl
          id="frontier-crabwalk-speed"
          label="Crabwalk speed multiplier"
          value={value.crabwalk.speedMultiplier}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.crabwalk.speedMultiplier}
          disabled={disabled}
          onChange={(speedMultiplier) => emitCrabwalk({ speedMultiplier })}
        />
        <NumericControl
          id="frontier-crabwalk-range"
          label="Crabwalk range (arena ratio)"
          value={value.crabwalk.rangeRatio}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.crabwalk.rangeRatio}
          disabled={disabled}
          onChange={(rangeRatio) => emitCrabwalk({ rangeRatio })}
        />
        <NumericControl
          id="frontier-crabwalk-directions"
          label="Direction changes"
          value={value.crabwalk.directionChanges}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.crabwalk.directionChanges}
          disabled={disabled}
          onChange={(directionChanges) => emitCrabwalk({ directionChanges })}
        />
        <NumericControl
          id="frontier-crabwalk-projectiles"
          label="Projectile count"
          value={value.crabwalk.projectileCount}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.crabwalk.projectileCount}
          disabled={disabled}
          onChange={(projectileCount) => emitCrabwalk({ projectileCount })}
        />
        <NumericControl
          id="frontier-crabwalk-cadence"
          label="Projectile cadence (frames)"
          value={value.crabwalk.projectileCadenceFrames}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.crabwalk.projectileCadenceFrames}
          disabled={disabled}
          onChange={(projectileCadenceFrames) => emitCrabwalk({
            projectileCadenceFrames
          })}
        />
        <NumericControl
          id="frontier-crabwalk-formation-spacing"
          label="Formation spacing (frames)"
          value={value.crabwalk.formationSpacingFrames}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.crabwalk.formationSpacingFrames}
          disabled={disabled}
          onChange={(formationSpacingFrames) => emitCrabwalk({
            formationSpacingFrames
          })}
        />
        <NumericControl
          id="frontier-crabwalk-formation-beats"
          label="Formation beats"
          value={value.crabwalk.formationBeats}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.crabwalk.formationBeats}
          disabled={disabled}
          onChange={(formationBeats) => emitCrabwalk({ formationBeats })}
        />
        <NumericControl
          id="frontier-crabwalk-recovery"
          label="Crabwalk recovery (frames)"
          value={value.crabwalk.recoveryFrames}
          range={FRONTIER_CROWNCLAW_ATTACK_TUNING_RANGES.crabwalk.recoveryFrames}
          disabled={disabled}
          onChange={(recoveryFrames) => emitCrabwalk({ recoveryFrames })}
        />
      </fieldset>
    </section>
  );
}
