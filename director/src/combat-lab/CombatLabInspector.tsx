import {
  BOSS_CATALOG,
  ENEMY_CATALOG,
  MOVEMENT_PATTERN_CATALOG,
  POWERUP_CATALOG,
  SPAWN_PATTERN_CATALOG,
  WEAPON_CATALOG
} from '@game/game-config/catalog';
import type {
  BossEvent,
  BossHealthPhase,
  BossWeaponSetting,
  EnemyId,
  FormationPackDefinition,
  MovementPatternId,
  PowerupId,
  SpawnEvent,
  SpawnPatternId,
  WaveEvent,
  WeaponId
} from '@game/game-config/types';
import { EditorIcon } from '@director/editor/EditorIcon';
import { FormationBehaviorFields } from './FormationBehaviorFields';

interface CombatLabInspectorProps {
  event: WaveEvent | null;
  selectedPhaseId: string | null;
  onSelectedPhaseIdChange: (phaseId: string | null) => void;
  onChange: (event: WaveEvent) => void;
  onReset: () => void;
  onReplay: () => void;
  formationPack?: FormationPackDefinition;
}

const clampNumber = (value: number, min: number, max: number) => (
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))
);

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="cl-field cl-field--number">
      <span>{label}</span>
      <span className="cl-number-input">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(clampNumber(value - step, min, max))}>−</button>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number.isInteger(value) ? value : Number(value.toFixed(3))}
          onChange={(input) => onChange(clampNumber(Number(input.target.value), min, max))}
        />
        {suffix ? <small>{suffix}</small> : null}
        <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(clampNumber(value + step, min, max))}>+</button>
      </span>
    </label>
  );
}

function SelectField<T extends string>({
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
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
  );
}

const updatePrimaryEnemy = (
  event: SpawnEvent,
  update: (enemy: SpawnEvent['enemies'][number]) => SpawnEvent['enemies'][number]
): SpawnEvent => ({
  ...event,
  enemies: event.enemies.map((enemy, index) => index === 0 ? update(enemy) : enemy)
});

function SpawnInspector({
  event,
  formationPack,
  onChange
}: {
  event: SpawnEvent;
  formationPack?: FormationPackDefinition;
  onChange: (event: SpawnEvent) => void;
}) {
  const enemy = event.enemies[0];
  if (!enemy) return <p className="cl-empty-copy">This spawn has no enemy setting. Reset it or choose an enemy from the Library.</p>;
  const secondaryEnemyIds = new Set(event.enemies.slice(1).map((item) => item.enemyId));
  const enemyOptions = Object.values(ENEMY_CATALOG).filter((item) => (
    item.id === enemy.enemyId || !secondaryEnemyIds.has(item.id)
  ));
  const updateSpawnTiming = (count: number, spawnIntervalSeconds: number): SpawnEvent => ({
    ...event,
    count,
    spawnIntervalSeconds,
    durationSeconds: Math.max(event.durationSeconds, Math.max(0, count - 1) * spawnIntervalSeconds)
  });
  const maximumCount = Math.min(96, Math.floor(600 / event.spawnIntervalSeconds) + 1);
  const maximumSpawnGap = event.count > 1 ? Math.min(10, 600 / (event.count - 1)) : 10;

  const selectEnemy = (enemyId: EnemyId) => {
    const catalog = ENEMY_CATALOG[enemyId];
    onChange(updatePrimaryEnemy(event, (previous) => ({
      ...previous,
      enemyId,
      spriteKey: catalog.defaultSpriteKey,
      health: catalog.baseHealth,
      speed: catalog.baseSpeed,
      damage: catalog.baseDamage,
      scoreValue: catalog.baseScoreValue,
      powerupDropChance: catalog.basePowerupDropChance
    })));
  };

  return (
    <>
      <div className="cl-inspector-grid">
        <NumberField label="Count" value={event.count} min={1} max={maximumCount} onChange={(count) => onChange(updateSpawnTiming(Math.round(count), event.spawnIntervalSeconds))} />
        <NumberField label="Spawn gap" value={event.spawnIntervalSeconds} min={0.03} max={maximumSpawnGap} step={0.05} suffix="s" onChange={(spawnIntervalSeconds) => onChange(updateSpawnTiming(event.count, spawnIntervalSeconds))} />
        <SelectField label="Formation" value={event.patternId} options={Object.values(SPAWN_PATTERN_CATALOG)} onChange={(patternId: SpawnPatternId) => onChange({ ...event, patternId })} />
        <SelectField label="Enemy" value={enemy.enemyId} options={enemyOptions} onChange={selectEnemy} />
        <NumberField label="Health" value={enemy.health} min={0.1} max={10000} step={1} onChange={(health) => onChange(updatePrimaryEnemy(event, (item) => ({ ...item, health })))} />
        <NumberField label="Speed" value={enemy.speed} min={0.1} max={20} step={0.1} onChange={(speed) => onChange(updatePrimaryEnemy(event, (item) => ({ ...item, speed })))} />
        <NumberField label="Damage" value={enemy.damage} min={1} max={20} step={1} onChange={(damage) => onChange(updatePrimaryEnemy(event, (item) => ({ ...item, damage })))} />
        <NumberField label="Drop chance" value={enemy.powerupDropChance} min={0} max={1} step={0.05} onChange={(powerupDropChance) => onChange(updatePrimaryEnemy(event, (item) => ({ ...item, powerupDropChance })))} />
        <NumberField label="Score" value={enemy.scoreValue} min={0} max={100000} step={5} onChange={(scoreValue) => onChange(updatePrimaryEnemy(event, (item) => ({ ...item, scoreValue: Math.round(scoreValue) })))} />
        <NumberField label="Scale" value={enemy.sizeMultiplier ?? 1} min={0.5} max={2.5} step={0.05} onChange={(sizeMultiplier) => onChange(updatePrimaryEnemy(event, (item) => ({ ...item, sizeMultiplier })))} />
      </div>
      <label className="cl-check-row">
        <input
          type="checkbox"
          checked={enemy.rank === 'elite'}
          onChange={(input) => onChange(updatePrimaryEnemy(event, (item) => input.target.checked ? {
            ...item,
            rank: 'elite',
            attackPatternId: 'aimed-burst',
            attackIntervalSeconds: item.attackIntervalSeconds ?? 1.5,
            projectileSpeed: item.projectileSpeed ?? 5,
            burstCount: item.burstCount ?? 3
          } : {
            ...item,
            rank: 'standard',
            attackPatternId: undefined,
            attackIntervalSeconds: undefined,
            projectileSpeed: undefined,
            burstCount: undefined
          }))}
        />
        <span><strong>Elite fire pattern</strong><small>Aimed bursts and an overhead health meter.</small></span>
      </label>
      {enemy.rank === 'elite' ? (
        <div className="cl-inspector-grid">
          <NumberField label="Attack gap" value={enemy.attackIntervalSeconds ?? 1.5} min={0.15} max={20} step={0.05} suffix="s" onChange={(attackIntervalSeconds) => onChange(updatePrimaryEnemy(event, (item) => ({ ...item, attackIntervalSeconds })))} />
          <NumberField label="Projectile" value={enemy.projectileSpeed ?? 5} min={0.1} max={30} step={0.1} onChange={(projectileSpeed) => onChange(updatePrimaryEnemy(event, (item) => ({ ...item, projectileSpeed })))} />
          <NumberField label="Burst" value={enemy.burstCount ?? 3} min={1} max={8} onChange={(burstCount) => onChange(updatePrimaryEnemy(event, (item) => ({ ...item, burstCount: Math.round(burstCount) })))} />
        </div>
      ) : null}
      {event.patternId !== 'single-random' && event.patternId !== 'asteroid-lanes' ? (
        <FormationBehaviorFields event={event} pack={formationPack} onChange={onChange} />
      ) : null}
    </>
  );
}

const updateBossWeapon = (event: BossEvent, id: string, update: (weapon: BossWeaponSetting) => BossWeaponSetting): BossEvent => ({
  ...event,
  weapons: event.weapons.map((weapon) => weapon.id === id ? update(weapon) : weapon)
});

const updateBossPhase = (event: BossEvent, id: string, update: (phase: BossHealthPhase) => BossHealthPhase): BossEvent => ({
  ...event,
  phases: event.phases.map((phase) => phase.id === id ? update(phase) : phase)
});

function BossInspector({
  event,
  selectedPhaseId,
  onSelectedPhaseIdChange,
  onChange
}: {
  event: BossEvent;
  selectedPhaseId: string | null;
  onSelectedPhaseIdChange: (phaseId: string | null) => void;
  onChange: (event: BossEvent) => void;
}) {
  const phase = event.phases.find((item) => item.id === selectedPhaseId) ?? event.phases[0];
  const primaryWeapon = event.weapons[0];
  const bossCatalog = BOSS_CATALOG[event.bossId];
  const weaponOptions = bossCatalog.allowedWeaponIds.map((id) => WEAPON_CATALOG[id]);
  const phaseIndex = phase ? event.phases.findIndex((item) => item.id === phase.id) : -1;
  const phaseMovementOptions = phase
    ? Array.from(new Set<MovementPatternId>([
      phase.movementPatternId,
      bossCatalog.defaultMovementPatternId,
      'arena-roam'
    ])).map((id) => MOVEMENT_PATTERN_CATALOG[id])
    : [];
  const previousPhase = phaseIndex > 0 ? event.phases[phaseIndex - 1] : null;
  const nextPhase = phaseIndex >= 0 ? event.phases[phaseIndex + 1] : null;
  const triggerMinimum = nextPhase ? Math.min(0.99, nextPhase.triggerHealthRatio + 0.01) : 0.01;
  const triggerMaximum = previousPhase ? Math.max(0.01, previousPhase.triggerHealthRatio - 0.01) : 1;
  return (
    <>
      <div className="cl-inspector-grid">
        <label className="cl-field" title="Choose another complete boss configuration from the Library"><span>Boss class</span><input value={bossCatalog.label} disabled readOnly /></label>
        <NumberField label="Health" value={event.health} min={1} max={100000} step={10} onChange={(health) => onChange({ ...event, health: Math.round(health) })} />
        <NumberField label="Speed" value={event.speed} min={0.1} max={20} step={0.1} onChange={(speed) => onChange({ ...event, speed })} />
        <NumberField label="Damage" value={event.damage} min={1} max={20} onChange={(damage) => onChange({ ...event, damage: Math.round(damage) })} />
        <NumberField label="Shields" value={event.shieldCount} min={0} max={16} onChange={(shieldCount) => onChange({ ...event, shieldCount: Math.round(shieldCount) })} />
        <NumberField label="Scale" value={event.sizeMultiplier ?? 1} min={0.5} max={1.5} step={0.05} onChange={(sizeMultiplier) => onChange({ ...event, sizeMultiplier })} />
        <NumberField label="Reward" value={event.scoreReward} min={0} max={1000000} step={50} onChange={(scoreReward) => onChange({ ...event, scoreReward: Math.round(scoreReward) })} />
      </div>

      <section className="cl-inspector-section">
        <header><div><p>Weapon rig</p><strong>{primaryWeapon ? WEAPON_CATALOG[primaryWeapon.weaponId]?.label : 'No weapon'}</strong></div><span>{event.weapons.length} slot{event.weapons.length === 1 ? '' : 's'}</span></header>
        {event.weapons.map((weapon) => (
          <div className="cl-weapon-card" key={weapon.id}>
            <SelectField label="Weapon" value={weapon.weaponId} options={weaponOptions} onChange={(weaponId: WeaponId) => onChange(updateBossWeapon(event, weapon.id, (item) => ({ ...item, weaponId })))} />
            <div className="cl-inspector-grid">
              <NumberField label="Attack gap" value={weapon.attackIntervalSeconds} min={0.1} max={30} step={0.05} suffix="s" onChange={(attackIntervalSeconds) => onChange(updateBossWeapon(event, weapon.id, (item) => ({ ...item, attackIntervalSeconds })))} />
              <NumberField label="Damage" value={weapon.damage} min={1} max={20} onChange={(damage) => onChange(updateBossWeapon(event, weapon.id, (item) => ({ ...item, damage: Math.round(damage) })))} />
              <NumberField label="Projectile" value={weapon.projectileSpeed} min={0.1} max={30} step={0.1} onChange={(projectileSpeed) => onChange(updateBossWeapon(event, weapon.id, (item) => ({ ...item, projectileSpeed })))} />
              <NumberField label="Burst" value={weapon.burstCount} min={1} max={24} onChange={(burstCount) => onChange(updateBossWeapon(event, weapon.id, (item) => ({ ...item, burstCount: Math.round(burstCount) })))} />
            </div>
          </div>
        ))}
      </section>

      <section className="cl-inspector-section">
        <header><div><p>Health phases</p><strong>Behavior by threshold</strong></div><span>{event.phases.length} phase{event.phases.length === 1 ? '' : 's'}</span></header>
        <div className="cl-phase-tabs" role="tablist" aria-label="Boss phases">
          {event.phases.map((item, index) => (
            <button key={item.id} type="button" role="tab" aria-selected={item.id === phase?.id} className={item.id === phase?.id ? 'is-selected' : ''} onClick={() => onSelectedPhaseIdChange(item.id)}>
              <span>{index + 1}</span>{item.label}
            </button>
          ))}
        </div>
        {phase && event.bossId === 'paywall-wall' ? (
          <div className="cl-phase-editor">
            <p className="cl-empty-copy">Paywall Wall phase rows are authored metadata only. Its fixed wall runtime uses the event-level Speed and first Weapon rig values above, so phase controls stay read-only here.</p>
          </div>
        ) : phase ? (
          <div className="cl-phase-editor">
            <label className="cl-field"><span>Phase label</span><input value={phase.label} maxLength={80} onChange={(input) => onChange(updateBossPhase(event, phase.id, (item) => ({ ...item, label: input.target.value })))} /></label>
            <div className="cl-inspector-grid">
              {phaseIndex === 0
                ? <label className="cl-field"><span>Trigger health</span><input value={1} disabled readOnly /></label>
                : <NumberField label="Trigger health" value={phase.triggerHealthRatio} min={triggerMinimum} max={triggerMaximum} step={0.01} onChange={(triggerHealthRatio) => onChange(updateBossPhase(event, phase.id, (item) => ({ ...item, triggerHealthRatio })))} />}
              <NumberField label="Speed scale" value={phase.speedMultiplier} min={0.1} max={5} step={0.05} onChange={(speedMultiplier) => onChange(updateBossPhase(event, phase.id, (item) => ({ ...item, speedMultiplier })))} />
              <SelectField label="Movement" value={phase.movementPatternId} options={phaseMovementOptions} onChange={(movementPatternId: MovementPatternId) => onChange(updateBossPhase(event, phase.id, (item) => ({ ...item, movementPatternId })))} />
            </div>
            <fieldset className="cl-weapon-checks">
              <legend>Active weapons</legend>
              {event.weapons.map((weapon) => (
                <label key={weapon.id}>
                  <input
                    type="checkbox"
                    checked={phase.weaponSettingIds.includes(weapon.id)}
                    disabled={phase.weaponSettingIds.length === 1 && phase.weaponSettingIds.includes(weapon.id)}
                    onChange={(input) => onChange(updateBossPhase(event, phase.id, (item) => ({
                      ...item,
                      weaponSettingIds: input.target.checked
                        ? [...item.weaponSettingIds, weapon.id]
                        : item.weaponSettingIds.filter((id) => id !== weapon.id)
                    })))}
                  />
                  {WEAPON_CATALOG[weapon.weaponId]?.label ?? weapon.weaponId}
                </label>
              ))}
            </fieldset>
          </div>
        ) : null}
      </section>
    </>
  );
}

function PowerupChecks({
  selected,
  onChange,
  allowEmpty = false
}: {
  selected: PowerupId[];
  onChange: (ids: PowerupId[]) => void;
  allowEmpty?: boolean;
}) {
  return (
    <fieldset className="cl-powerup-grid">
      <legend>Available pickups</legend>
      {Object.values(POWERUP_CATALOG).map((powerup) => (
        <label key={powerup.id}>
          <input
            type="checkbox"
            checked={selected.includes(powerup.id)}
            disabled={!allowEmpty && selected.length === 1 && selected.includes(powerup.id)}
            onChange={(input) => onChange(input.target.checked
              ? [...selected, powerup.id]
              : selected.filter((id) => id !== powerup.id))}
          />
          <span><strong>{powerup.label}</strong><small>{Math.round(powerup.defaultWeight * 100)}% base drop weight</small></span>
        </label>
      ))}
    </fieldset>
  );
}

export function CombatLabInspector({
  event,
  selectedPhaseId,
  onSelectedPhaseIdChange,
  onChange,
  onReset,
  onReplay,
  formationPack
}: CombatLabInspectorProps) {
  if (!event) {
    return <div className="cl-empty-state"><EditorIcon name="spawn" /><strong>Select something to test</strong><p>Choose a wave, enemy, formation, boss, weapon, movement pattern, or powerup from the Library.</p></div>;
  }
  const minimumDuration = event.kind === 'spawn'
    ? Math.max(0.1, Math.max(0, event.count - 1) * event.spawnIntervalSeconds)
    : event.kind === 'boss' || event.kind === 'asteroid-belt'
      ? Math.max(0.1, event.warningSeconds)
      : 0.1;

  return (
    <div className="cl-inspector-body">
      <div className="cl-selection-title">
        <span className={`cl-kind-badge cl-kind-badge--${event.kind}`}>{event.kind.replace('-', ' ')}</span>
        <label><span>Experiment label</span><input value={event.label} maxLength={80} onChange={(input) => onChange({ ...event, label: input.target.value })} /></label>
      </div>

      <details className="cl-details" open>
        <summary>Encounter timing</summary>
        <div className="cl-inspector-grid">
          <NumberField label="Start" value={event.startSeconds} min={0} max={600} step={0.1} suffix="s" onChange={(startSeconds) => onChange({ ...event, startSeconds })} />
          <NumberField label="Duration" value={event.durationSeconds} min={minimumDuration} max={600} step={0.1} suffix="s" onChange={(durationSeconds) => onChange({ ...event, durationSeconds })} />
          <NumberField label="After delay" value={event.delayAfterSeconds} min={0} max={60} step={0.1} suffix="s" onChange={(delayAfterSeconds) => onChange({ ...event, delayAfterSeconds })} />
        </div>
        <label className="cl-check-row cl-check-row--compact">
          <input type="checkbox" checked={event.blocksWaveClock} onChange={(input) => onChange({ ...event, blocksWaveClock: input.target.checked })} />
          <span><strong>Block wave clock</strong><small>Wait for this encounter to resolve.</small></span>
        </label>
      </details>

      {event.kind === 'spawn' ? <SpawnInspector event={event} formationPack={formationPack} onChange={onChange} /> : null}
      {event.kind === 'boss' ? <BossInspector event={event} selectedPhaseId={selectedPhaseId} onSelectedPhaseIdChange={onSelectedPhaseIdChange} onChange={onChange} /> : null}
      {event.kind === 'asteroid-belt' ? (
        <div className="cl-inspector-grid">
          <NumberField label="Asteroids" value={event.count} min={1} max={120} onChange={(count) => onChange({ ...event, count: Math.round(count) })} />
          <NumberField label="Density" value={event.density} min={0.05} max={1} step={0.05} onChange={(density) => onChange({ ...event, density })} />
          <NumberField label="Spawn gap" value={event.spawnIntervalSeconds} min={0.03} max={10} step={0.05} suffix="s" onChange={(spawnIntervalSeconds) => onChange({ ...event, spawnIntervalSeconds })} />
          <NumberField label="Warning" value={event.warningSeconds} min={0} max={30} step={0.1} suffix="s" onChange={(warningSeconds) => onChange({ ...event, warningSeconds, durationSeconds: Math.max(event.durationSeconds, warningSeconds) })} />
          <NumberField label="Health" value={event.health} min={0.1} max={10000} step={1} onChange={(health) => onChange({ ...event, health })} />
          <NumberField label="Speed" value={event.speed} min={0.1} max={30} step={0.1} onChange={(speed) => onChange({ ...event, speed })} />
          <NumberField label="Damage" value={event.damage} min={1} max={20} onChange={(damage) => onChange({ ...event, damage: Math.round(damage) })} />
          <NumberField label="Drop chance" value={event.powerupDropChance} min={0} max={1} step={0.05} onChange={(powerupDropChance) => onChange({ ...event, powerupDropChance })} />
        </div>
      ) : null}
      {event.kind === 'powerup' ? <PowerupChecks selected={event.powerupIds} onChange={(powerupIds) => powerupIds.length > 0 && onChange({ ...event, powerupIds })} /> : null}
      {event.kind === 'recovery' ? (
        <>
          <NumberField label="Coins" value={event.coinCount} min={event.powerupIds.length === 0 ? 1 : 0} max={1000} onChange={(coinCount) => onChange({ ...event, coinCount: Math.round(coinCount) })} />
          <PowerupChecks selected={event.powerupIds} allowEmpty={event.coinCount > 0} onChange={(powerupIds) => onChange({ ...event, powerupIds })} />
        </>
      ) : null}

      <div className="cl-inspector-actions">
        <button className="cl-button" type="button" onClick={onReset}><EditorIcon name="undo" /> Reset selection</button>
        <button className="cl-button cl-button--cyan" type="button" onClick={onReplay}><EditorIcon name="play" /> Replay changes</button>
      </div>
    </div>
  );
}

export default CombatLabInspector;
