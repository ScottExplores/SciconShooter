import type { ChangeEvent } from 'react';
import {
  PRISM_MOTH_ACTIVATION_ORDERS,
  PRISM_MOTH_ATTACK_TUNING_RANGES,
  PRISM_MOTH_FORMATION_ROTATIONS,
  PRISM_MOTH_FORMATION_TEMPLATES,
  normalizePrismMothAttackTuning,
  type PrismMothActivationOrder,
  type PrismMothAttack1Tuning,
  type PrismMothAttack2Tuning,
  type PrismMothAttack3Tuning,
  type PrismMothAttack4Tuning,
  type PrismMothAttackTuning,
  type PrismMothFormationRotation,
  type PrismMothFormationTemplate,
  type PrismMothNumericTuningRange
} from './prismMothAttackTuning';

export interface PrismMothAttackTuningPanelProps {
  readonly value: Readonly<PrismMothAttackTuning>;
  readonly onChange: (value: Readonly<PrismMothAttackTuning>) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

interface NumericControlProps {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly range: PrismMothNumericTuningRange;
  readonly disabled: boolean;
  readonly onChange: (value: number) => void;
}

function NumericControl({
  id,
  label,
  value,
  range,
  disabled,
  onChange
}: NumericControlProps) {
  return (
    <label className="prism-moth-attack-tuning__control" htmlFor={id}>
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
const optionLabel = (value: string) => value
  .split('-')
  .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
  .join(' ');

export function PrismMothAttackTuningPanel({
  value,
  onChange,
  disabled = false,
  className
}: PrismMothAttackTuningPanelProps) {
  const emitAttack1 = (patch: Partial<PrismMothAttack1Tuning>) => {
    onChange(normalizePrismMothAttackTuning({
      ...value,
      attack1: { ...value.attack1, ...patch }
    }));
  };
  const emitAttack2 = (patch: Partial<PrismMothAttack2Tuning>) => {
    onChange(normalizePrismMothAttackTuning({
      ...value,
      attack2: { ...value.attack2, ...patch }
    }));
  };
  const emitAttack3 = (patch: Partial<PrismMothAttack3Tuning>) => {
    onChange(normalizePrismMothAttackTuning({
      ...value,
      attack3: { ...value.attack3, ...patch }
    }));
  };
  const emitAttack4 = (patch: Partial<PrismMothAttack4Tuning>) => {
    onChange(normalizePrismMothAttackTuning({
      ...value,
      attack4: { ...value.attack4, ...patch }
    }));
  };

  return (
    <section
      className={['prism-moth-attack-tuning', className].filter(Boolean).join(' ')}
      aria-label="Prism Moth attack tuning"
    >
      <fieldset data-prism-attack="attack1" disabled={disabled}>
        <legend>Attack 1 - Prism Wingbeat Weave</legend>
        <NumericControl
          id="prism-attack1-wingbeat-cadence"
          label="Wingbeat cadence (frames)"
          value={value.attack1.wingbeatCadenceFrames}
          range={PRISM_MOTH_ATTACK_TUNING_RANGES.attack1.wingbeatCadenceFrames}
          disabled={disabled}
          onChange={(wingbeatCadenceFrames) => emitAttack1({ wingbeatCadenceFrames })}
        />
        <NumericControl
          id="prism-attack1-feather-count"
          label="Feather count"
          value={value.attack1.featherCount}
          range={PRISM_MOTH_ATTACK_TUNING_RANGES.attack1.featherCount}
          disabled={disabled}
          onChange={(featherCount) => emitAttack1({ featherCount })}
        />
        <NumericControl
          id="prism-attack1-feather-spacing"
          label="Feather spacing (radians)"
          value={value.attack1.featherSpacingRadians}
          range={PRISM_MOTH_ATTACK_TUNING_RANGES.attack1.featherSpacingRadians}
          disabled={disabled}
          onChange={(featherSpacingRadians) => emitAttack1({ featherSpacingRadians })}
        />
        <NumericControl
          id="prism-attack1-fan-angle"
          label="Fan angle (radians)"
          value={value.attack1.fanAngleRadians}
          range={PRISM_MOTH_ATTACK_TUNING_RANGES.attack1.fanAngleRadians}
          disabled={disabled}
          onChange={(fanAngleRadians) => emitAttack1({ fanAngleRadians })}
        />
        <NumericControl
          id="prism-attack1-safe-lane"
          label="Safe lane width (viewport ratio)"
          value={value.attack1.safeLaneWidthRatio}
          range={PRISM_MOTH_ATTACK_TUNING_RANGES.attack1.safeLaneWidthRatio}
          disabled={disabled}
          onChange={(safeLaneWidthRatio) => emitAttack1({ safeLaneWidthRatio })}
        />
        <NumericControl
          id="prism-attack1-boss-drift"
          label="Boss drift (viewport ratio)"
          value={value.attack1.bossDriftRatio}
          range={PRISM_MOTH_ATTACK_TUNING_RANGES.attack1.bossDriftRatio}
          disabled={disabled}
          onChange={(bossDriftRatio) => emitAttack1({ bossDriftRatio })}
        />
        <NumericControl
          id="prism-attack1-sequence-length"
          label="Sequence length"
          value={value.attack1.sequenceLength}
          range={PRISM_MOTH_ATTACK_TUNING_RANGES.attack1.sequenceLength}
          disabled={disabled}
          onChange={(sequenceLength) => emitAttack1({ sequenceLength })}
        />
      </fieldset>

      <fieldset data-prism-attack="attack2" disabled={disabled}>
        <legend>Attack 2 - Brood Procession</legend>
        <NumericControl
          id="prism-attack2-node-count"
          label="Node count"
          value={value.attack2.nodeCount}
          range={PRISM_MOTH_ATTACK_TUNING_RANGES.attack2.nodeCount}
          disabled={disabled}
          onChange={(nodeCount) => emitAttack2({ nodeCount })}
        />
        <NumericControl
          id="prism-attack2-hatch-delay"
          label="Hatch delay (frames)"
          value={value.attack2.hatchDelayFrames}
          range={PRISM_MOTH_ATTACK_TUNING_RANGES.attack2.hatchDelayFrames}
          disabled={disabled}
          onChange={(hatchDelayFrames) => emitAttack2({ hatchDelayFrames })}
        />
        <label
          className="prism-moth-attack-tuning__control"
          htmlFor="prism-attack2-formation-template"
        >
          <span>Formation template</span>
          <select
            id="prism-attack2-formation-template"
            value={value.attack2.formationTemplate}
            disabled={disabled}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => emitAttack2({
              formationTemplate: event.target.value as PrismMothFormationTemplate
            })}
          >
            {PRISM_MOTH_FORMATION_TEMPLATES.map((template) => (
              <option key={template} value={template}>{optionLabel(template)}</option>
            ))}
          </select>
        </label>
        <NumericControl
          id="prism-attack2-brood-speed"
          label="Brood speed (viewport ratio/frame)"
          value={value.attack2.broodSpeedRatio}
          range={PRISM_MOTH_ATTACK_TUNING_RANGES.attack2.broodSpeedRatio}
          disabled={disabled}
          onChange={(broodSpeedRatio) => emitAttack2({ broodSpeedRatio })}
        />
        <NumericControl
          id="prism-attack2-spacing"
          label="Formation spacing (viewport ratio)"
          value={value.attack2.spacingRatio}
          range={PRISM_MOTH_ATTACK_TUNING_RANGES.attack2.spacingRatio}
          disabled={disabled}
          onChange={(spacingRatio) => emitAttack2({ spacingRatio })}
        />
        <NumericControl
          id="prism-attack2-route-width"
          label="Route width (viewport ratio)"
          value={value.attack2.routeWidthRatio}
          range={PRISM_MOTH_ATTACK_TUNING_RANGES.attack2.routeWidthRatio}
          disabled={disabled}
          onChange={(routeWidthRatio) => emitAttack2({ routeWidthRatio })}
        />
        <NumericControl
          id="prism-attack2-waves"
          label="Waves"
          value={value.attack2.waves}
          range={PRISM_MOTH_ATTACK_TUNING_RANGES.attack2.waves}
          disabled={disabled}
          onChange={(waves) => emitAttack2({ waves })}
        />
      </fieldset>

      <fieldset data-prism-attack="attack3" disabled={disabled}>
        <legend>Attack 3 - Lunar Prism Swoop</legend>
        <NumericControl
          id="prism-attack3-swoops"
          label="Swoops"
          value={value.attack3.swoopCount}
          range={PRISM_MOTH_ATTACK_TUNING_RANGES.attack3.swoopCount}
          disabled={disabled}
          onChange={(swoopCount) => emitAttack3({ swoopCount })}
        />
        <NumericControl
          id="prism-attack3-speed"
          label="Swoop speed multiplier"
          value={value.attack3.speedMultiplier}
          range={PRISM_MOTH_ATTACK_TUNING_RANGES.attack3.speedMultiplier}
          disabled={disabled}
          onChange={(speedMultiplier) => emitAttack3({ speedMultiplier })}
        />
        <NumericControl
          id="prism-attack3-curve-depth"
          label="Curve depth (viewport ratio)"
          value={value.attack3.curveDepthRatio}
          range={PRISM_MOTH_ATTACK_TUNING_RANGES.attack3.curveDepthRatio}
          disabled={disabled}
          onChange={(curveDepthRatio) => emitAttack3({ curveDepthRatio })}
        />
        <NumericControl
          id="prism-attack3-edge-telegraph"
          label="Edge telegraph (frames)"
          value={value.attack3.edgeTelegraphFrames}
          range={PRISM_MOTH_ATTACK_TUNING_RANGES.attack3.edgeTelegraphFrames}
          disabled={disabled}
          onChange={(edgeTelegraphFrames) => emitAttack3({ edgeTelegraphFrames })}
        />
        <NumericControl
          id="prism-attack3-trail"
          label="Trail cadence (frames)"
          value={value.attack3.trailCadenceFrames}
          range={PRISM_MOTH_ATTACK_TUNING_RANGES.attack3.trailCadenceFrames}
          disabled={disabled}
          onChange={(trailCadenceFrames) => emitAttack3({ trailCadenceFrames })}
        />
        <NumericControl
          id="prism-attack3-recovery"
          label="Recovery (frames)"
          value={value.attack3.recoveryFrames}
          range={PRISM_MOTH_ATTACK_TUNING_RANGES.attack3.recoveryFrames}
          disabled={disabled}
          onChange={(recoveryFrames) => emitAttack3({ recoveryFrames })}
        />
      </fieldset>

      <fieldset data-prism-attack="attack4" disabled={disabled}>
        <legend>Attack 4 - Kaleidoscope Brood</legend>
        <NumericControl
          id="prism-attack4-node-count"
          label="Node count"
          value={value.attack4.nodeCount}
          range={PRISM_MOTH_ATTACK_TUNING_RANGES.attack4.nodeCount}
          disabled={disabled}
          onChange={(nodeCount) => emitAttack4({ nodeCount })}
        />
        <label
          className="prism-moth-attack-tuning__control"
          htmlFor="prism-attack4-activation-order"
        >
          <span>Activation order</span>
          <select
            id="prism-attack4-activation-order"
            value={value.attack4.activationOrder}
            disabled={disabled}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => emitAttack4({
              activationOrder: event.target.value as PrismMothActivationOrder
            })}
          >
            {PRISM_MOTH_ACTIVATION_ORDERS.map((order) => (
              <option key={order} value={order}>{optionLabel(order)}</option>
            ))}
          </select>
        </label>
        <label
          className="prism-moth-attack-tuning__control"
          htmlFor="prism-attack4-formation-rotation"
        >
          <span>Formation rotation</span>
          <select
            id="prism-attack4-formation-rotation"
            value={value.attack4.formationRotation}
            disabled={disabled}
            onChange={(event: ChangeEvent<HTMLSelectElement>) => emitAttack4({
              formationRotation: event.target.value as PrismMothFormationRotation
            })}
          >
            {PRISM_MOTH_FORMATION_ROTATIONS.map((rotation) => (
              <option key={rotation} value={rotation}>{optionLabel(rotation)}</option>
            ))}
          </select>
        </label>
        <NumericControl
          id="prism-attack4-corridor-width"
          label="Corridor width (viewport ratio)"
          value={value.attack4.corridorWidthRatio}
          range={PRISM_MOTH_ATTACK_TUNING_RANGES.attack4.corridorWidthRatio}
          disabled={disabled}
          onChange={(corridorWidthRatio) => emitAttack4({ corridorWidthRatio })}
        />
        <NumericControl
          id="prism-attack4-beats"
          label="Pattern beats"
          value={value.attack4.beats}
          range={PRISM_MOTH_ATTACK_TUNING_RANGES.attack4.beats}
          disabled={disabled}
          onChange={(beats) => emitAttack4({ beats })}
        />
        <NumericControl
          id="prism-attack4-core-charge"
          label="Core charge (frames)"
          value={value.attack4.coreChargeFrames}
          range={PRISM_MOTH_ATTACK_TUNING_RANGES.attack4.coreChargeFrames}
          disabled={disabled}
          onChange={(coreChargeFrames) => emitAttack4({ coreChargeFrames })}
        />
        <NumericControl
          id="prism-attack4-recovery"
          label="Recovery (frames)"
          value={value.attack4.recoveryFrames}
          range={PRISM_MOTH_ATTACK_TUNING_RANGES.attack4.recoveryFrames}
          disabled={disabled}
          onChange={(recoveryFrames) => emitAttack4({ recoveryFrames })}
        />
      </fieldset>
    </section>
  );
}
