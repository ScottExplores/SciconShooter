import type {
  FormationAttackBehaviorId,
  FormationEntryPathId,
  FormationFiringBehaviorId,
  FormationMovementId,
  FormationPackDefinition,
  FormationReturnBehaviorId,
  SpawnEvent
} from '@game/game-config/types';
import {
  clearFormationBehavior,
  FORMATION_ATTACK_OPTIONS,
  FORMATION_ENTRY_OPTIONS,
  FORMATION_FIRING_OPTIONS,
  FORMATION_MOVEMENT_OPTIONS,
  FORMATION_RETURN_OPTIONS,
  resolveEditableFormationBehavior,
  updateFormationBehavior
} from './formationBehaviorModel';

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum))
);

function BehaviorSelect<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ id: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="cl-field">
      <span>{label}</span>
      <select value={value} onChange={(input) => onChange(input.target.value as T)}>
        {options.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}
      </select>
    </label>
  );
}

function BehaviorNumber({
  label,
  value,
  minimum,
  maximum,
  step,
  suffix,
  onChange
}: {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="cl-field">
      <span>{label}</span>
      <span className="cl-number-input cl-behavior-number">
        <input
          type="number"
          min={minimum}
          max={maximum}
          step={step}
          value={Number.isInteger(value) ? value : Number(value.toFixed(2))}
          onChange={(input) => onChange(clamp(Number(input.target.value), minimum, maximum))}
        />
        {suffix ? <small>{suffix}</small> : null}
      </span>
    </label>
  );
}

export function FormationBehaviorFields({
  event,
  pack,
  onChange
}: {
  event: SpawnEvent;
  pack?: FormationPackDefinition;
  onChange: (event: SpawnEvent) => void;
}) {
  const behavior = resolveEditableFormationBehavior(event, pack);
  const source = event.formationBehavior ? 'Wave overrides' : pack ? `Pack · ${pack.label}` : 'Pattern defaults';
  const patch = (next: Parameters<typeof updateFormationBehavior>[1]) => onChange(updateFormationBehavior(event, next));

  return (
    <section className="cl-formation-behavior-fields">
      <header>
        <div><p>Modular choreography</p><strong>Formation behavior</strong></div>
        <span>{source}</span>
      </header>
      <p>Entry, group movement, attack, firing window, and return are independently authored. Changes here override only this encounter.</p>
      <div className="cl-inspector-grid">
        <BehaviorSelect label="Entry path" value={behavior.entryPathId} options={FORMATION_ENTRY_OPTIONS} onChange={(entryPathId: FormationEntryPathId) => patch({ entryPathId })} />
        <BehaviorSelect label="Group movement" value={behavior.movementId} options={FORMATION_MOVEMENT_OPTIONS} onChange={(movementId: FormationMovementId) => patch({ movementId })} />
        <BehaviorSelect label="Attack behavior" value={behavior.attackId} options={FORMATION_ATTACK_OPTIONS} onChange={(attackId: FormationAttackBehaviorId) => patch({ attackId })} />
        <BehaviorSelect label="Formation fire" value={behavior.firingBehavior} options={FORMATION_FIRING_OPTIONS} onChange={(firingBehavior: FormationFiringBehaviorId) => patch({ firingBehavior })} />
        <BehaviorSelect label="Return / exit" value={behavior.returnId} options={FORMATION_RETURN_OPTIONS} onChange={(returnId: FormationReturnBehaviorId) => patch({ returnId })} />
        <BehaviorNumber label="Assembled hold" value={behavior.holdSeconds} minimum={0.35} maximum={12} step={0.05} suffix="s" onChange={(holdSeconds) => patch({ holdSeconds })} />
        <BehaviorNumber label="Attack telegraph" value={behavior.telegraphSeconds} minimum={0.2} maximum={4} step={0.05} suffix="s" onChange={(telegraphSeconds) => patch({ telegraphSeconds })} />
        <BehaviorNumber label="Attack duration" value={behavior.attackDurationSeconds} minimum={0.3} maximum={8} step={0.05} suffix="s" onChange={(attackDurationSeconds) => patch({ attackDurationSeconds })} />
        <BehaviorNumber label="Reform recovery" value={behavior.recoverySeconds} minimum={0.35} maximum={12} step={0.05} suffix="s" onChange={(recoverySeconds) => patch({ recoverySeconds })} />
        <BehaviorNumber label="Attack group size" value={behavior.attackGroupSize} minimum={1} maximum={Math.min(48, event.count)} step={1} onChange={(attackGroupSize) => patch({ attackGroupSize: Math.round(attackGroupSize) })} />
        <BehaviorNumber label="Attack cycles (0 repeats)" value={behavior.attackCycles} minimum={0} maximum={20} step={1} onChange={(attackCycles) => patch({ attackCycles: Math.round(attackCycles) })} />
      </div>
      {event.formationBehavior ? <button className="cl-button" type="button" onClick={() => onChange(clearFormationBehavior(event))}>Use pack / pattern defaults</button> : null}
    </section>
  );
}

export default FormationBehaviorFields;
