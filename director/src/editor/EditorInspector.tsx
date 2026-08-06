import { useEffect, useState } from 'react';
import type {
  AssetCatalogEntry,
  AssetKey,
  AsteroidEvent,
  BackgroundId,
  BossEvent,
  BossHealthPhase,
  BossId,
  BossRigId,
  BossWeaponSetting,
  EnemyAttackPatternId,
  EnemyId,
  EnemyRank,
  GameCampaignConfig,
  GeneratedAssetRole,
  LevelDefinition,
  MovementPatternId,
  PowerupId,
  RecordCardArtRegion,
  RecordCardConfig,
  SpawnEnemySetting,
  SpawnEvent,
  SpawnPatternId,
  SpawnPositionId,
  WaveDefinition,
  WaveEvent,
  WeaponId
} from '../../../game-config/types';
import {
  ASSET_CATALOG,
  BOSS_CATALOG,
  ENEMY_CATALOG,
  getAssetKeysForRole,
  getBossEncounterClass,
  isMajorBossId,
  SPAWN_PATTERN_CATALOG
} from '../../../game-config/catalog';
import { DEFAULT_RECORD_CARD_CONFIG } from '../../../game-config/recordCard';
import { EditorIcon } from './EditorIcon';
import { BossTimelineEditor } from './BossTimelineEditor';
import {
  SPRITE_ASSET_DRAG_MIME,
  SpriteWorkshop,
  type SpriteStyle
} from './SpriteWorkshop';

export type InspectorTab = 'wave' | 'boss' | 'level' | 'card';

interface EditorInspectorProps {
  recordCard: RecordCardConfig;
  hudAssets: GameCampaignConfig['hudAssets'];
  level: LevelDefinition;
  wave: WaveDefinition;
  selectedEventId: string;
  tab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  onSelectEvent: (eventId: string) => void;
  onUpdateRecordCard: (recordCard: RecordCardConfig) => void;
  onUpdateHudAssets: (hudAssets: GameCampaignConfig['hudAssets']) => void;
  onUpdateLevel: (patch: Partial<LevelDefinition>) => void;
  onUpdateWave: (patch: Partial<WaveDefinition>) => void;
  onUpdateEvent: (nextEvent: WaveEvent) => void;
  onAddEvent: (kind: 'spawn' | 'boss') => void;
  onDeleteEvent: (eventId: string) => void;
}

const ENEMIES: Array<{ id: EnemyId; label: string; spriteKey: AssetKey }> = Object.values(ENEMY_CATALOG).map((enemy) => ({
  id: enemy.id,
  label: enemy.label,
  spriteKey: enemy.defaultSpriteKey
}));

const BOSSES: Array<{ id: BossId; label: string; spriteKey: AssetKey; movement: MovementPatternId }> = Object.values(BOSS_CATALOG).map((boss) => ({
  id: boss.id,
  label: `${getBossEncounterClass(boss.id) === 'boss' ? 'BOSS' : 'ELITE ENEMY'} · ${boss.label}`,
  spriteKey: boss.defaultSpriteKey,
  movement: boss.defaultMovementPatternId
}));

const BOSS_RIGS: Array<{ value: BossRigId; label: string }> = [
  { value: 'open-orbit', label: 'Open Orbit railgun rig' },
  { value: 'citation-storm', label: 'Citation Storm claw rig' },
  { value: 'paywall-siege', label: 'Paywall Siege layered rig' },
  { value: 'crown-claw', label: 'Open Galaxy Crownclaw rig' }
];

const toAssetOptions = (keys: readonly AssetKey[]) => [...new Set(keys)].map((value) => ({
  value,
  label: ASSET_CATALOG[value].label
}));

const ENEMY_SPRITES = toAssetOptions(getAssetKeysForRole('enemy'));
const BOSS_SPRITES = toAssetOptions(getAssetKeysForRole('boss'));
const ASTEROID_SPRITES = toAssetOptions(getAssetKeysForRole('asteroid'));
const HUD_ASSETS = toAssetOptions(getAssetKeysForRole('hud'));
const CARD_ASSETS = toAssetOptions(getAssetKeysForRole('scorecard'));

const PATTERNS: Array<{ value: SpawnPatternId; label: string }> = Object.values(SPAWN_PATTERN_CATALOG)
  .map((pattern) => ({ value: pattern.id, label: pattern.label }));

const POSITIONS: Array<{ value: SpawnPositionId; label: string }> = [
  { value: 'random-top', label: 'Random at top' },
  { value: 'formation-top', label: 'Formation at top' },
  { value: 'center-top', label: 'Top center' },
  { value: 'lane-top', label: 'Top lanes' }
];

const MOVEMENTS: Array<{ value: MovementPatternId; label: string }> = [
  { value: 'drift-down', label: 'Drift down' },
  { value: 'sine-drift', label: 'Sine drift' },
  { value: 'track-player', label: 'Track player' },
  { value: 'wall-march', label: 'Wall march' },
  { value: 'asteroid-drift', label: 'Asteroid drift' },
  { value: 'gatekeeper-cycle', label: 'Gatekeeper cycle' },
  { value: 'arena-roam', label: 'Arena roam' }
];

const ENEMY_RANKS: Array<{ value: EnemyRank; label: string }> = [
  { value: 'standard', label: 'Standard enemy' },
  { value: 'elite', label: 'ELITE UNIT' }
];

const ENEMY_ATTACKS: Array<{ value: EnemyAttackPatternId; label: string }> = [
  { value: 'aimed-burst', label: 'Aimed burst' }
];

const WEAPONS: Array<{ value: WeaponId; label: string }> = [
  { value: 'aimed-shot', label: 'Aimed shot' },
  { value: 'wall-bolt', label: 'Wall bolt' },
  { value: 'burst-volley', label: 'Burst volley' },
  { value: 'lane-beam', label: 'Lane beam' }
];

const BACKGROUNDS: Array<{ value: BackgroundId; label: string }> = [
  { value: 'open-orbit', label: 'Open Orbit' },
  { value: 'citation-storm', label: 'Citation Storm' },
  { value: 'paywall-siege', label: 'Paywall Siege' },
  { value: 'open-galaxy', label: 'Open Galaxy' },
  { value: 'bastion-protocol', label: 'Bastion Protocol' },
  { value: 'helix-redline', label: 'Helix Redline' },
  { value: 'shattered-void', label: 'Shattered Void' },
  { value: 'gravity-rift', label: 'Gravity Rift' },
  { value: 'ion-eclipse', label: 'Ion Eclipse' },
  { value: 'terminus-frontier', label: 'Terminus Frontier' }
];

const POWERUPS: Array<{ id: PowerupId; label: string }> = [
  { id: 'projectile-upgrade', label: 'Projectile Upgrade' },
  { id: 'max-shot', label: 'Max Shot' },
  { id: 'magnet', label: 'Magnet' },
  { id: 'shield', label: 'Shield' },
  { id: 'research-beam', label: 'Research beam' },
  { id: 'extra-life', label: 'Extra life' }
];

const uid = (prefix: string) => `${prefix}-${globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10)}`;

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  unit,
  disabled = false
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
}) {
  return (
    <label className="le-field">
      <span>{label}</span>
      <span className="le-field__unit">
        <input type="number" value={Number.isFinite(value) ? value : 0} min={min} max={max} step={step} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
        {unit ? <small>{unit}</small> : null}
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
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="le-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function AssetSelectField({
  label,
  value,
  options,
  onChange,
  assetRole,
  style = {},
  onStyleChange
}: {
  label: string;
  value: AssetKey;
  options: Array<{ value: AssetKey; label: string }>;
  onChange: (value: AssetKey) => void;
  assetRole?: GeneratedAssetRole;
  style?: SpriteStyle;
  onStyleChange?: (style: SpriteStyle) => void;
}) {
  const [workshopOpen, setWorkshopOpen] = useState(false);
  const [generatedOverride, setGeneratedOverride] = useState<AssetCatalogEntry | null>(null);
  const selected = ASSET_CATALOG[value]
    ?? (generatedOverride?.id === value ? generatedOverride : undefined)
    ?? ASSET_CATALOG[options[0].value];
  const visibleOptions = options.some((option) => option.value === selected.id)
    ? options
    : [{ value: selected.id, label: `${selected.label} · generated` }, ...options];
  return (
    <div className="le-field le-asset-field">
      <span>{label}</span>
      <span
        className="le-asset-field__preview"
        draggable
        title="Drag this real game sprite onto the preview in Place mode"
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'copy';
          event.dataTransfer.setData(SPRITE_ASSET_DRAG_MIME, value);
        }}
      >
        {selected.paths.map((path, index) => (
          <img key={path} src={path} alt="" loading="lazy" decoding="async" draggable={false} title={`${selected.label} frame ${index + 1}`} />
        ))}
      </span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value as AssetKey)}>
        {visibleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <small className="le-asset-field__meta">
        {selected.paths.length === 1 ? 'Single image' : `${selected.paths.length} animation frames`} / {selected.id}
      </small>
      {assetRole || onStyleChange ? (
        <button className="le-button le-sprite-workshop-button" type="button" onClick={() => setWorkshopOpen(true)}>
          <EditorIcon name="edit" /> {assetRole ? 'Open Sprite Generator' : 'Open Sprite Workshop'}
        </button>
      ) : null}
      {workshopOpen && (assetRole || onStyleChange) ? (
        <SpriteWorkshop
          assetKey={value}
          allowedAssetKeys={options.map((option) => option.value)}
          assetRole={assetRole}
          styleEditingEnabled={Boolean(onStyleChange)}
          style={style}
          onAssetChange={(nextAssetKey, generatedAsset) => {
            if (generatedAsset) setGeneratedOverride(generatedAsset);
            onChange(nextAssetKey);
          }}
          onStyleChange={onStyleChange ?? (() => undefined)}
          onClose={() => setWorkshopOpen(false)}
        />
      ) : null}
    </div>
  );
}

function TextField({ label, value, onChange, multiline = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean }) {
  return (
    <label className="le-field">
      <span>{label}</span>
      {multiline
        ? <textarea value={value} onChange={(event) => onChange(event.target.value)} />
        : <input type="text" value={value} onChange={(event) => onChange(event.target.value)} />}
    </label>
  );
}

function EventTiming({ event, onChange }: { event: WaveEvent; onChange: (next: WaveEvent) => void }) {
  return (
    <fieldset className="le-fieldset">
      <legend>Timeline</legend>
      <TextField label="Phase name" value={event.label} onChange={(label) => onChange({ ...event, label })} />
      <div className="le-field-row">
        <NumberField label="Starts at" value={event.startSeconds} onChange={(startSeconds) => onChange({ ...event, startSeconds })} min={0} max={600} step={0.5} unit="s" />
        <NumberField label="Duration" value={event.durationSeconds} onChange={(durationSeconds) => onChange({ ...event, durationSeconds })} min={0.1} max={600} step={0.5} unit="s" />
      </div>
      <NumberField label="Delay after phase" value={event.delayAfterSeconds} onChange={(delayAfterSeconds) => onChange({ ...event, delayAfterSeconds })} min={0} max={60} step={0.25} unit="s" />
      <label className="le-check-row">
        <input type="checkbox" checked={event.blocksWaveClock} onChange={(change) => onChange({ ...event, blocksWaveClock: change.target.checked })} />
        <span>Pause the wave clock until cleared</span>
      </label>
    </fieldset>
  );
}

function WaveSettings({
  wave,
  selectedEventId,
  onSelectEvent,
  onUpdateWave,
  onUpdateEvent,
  onAddEvent,
  onDeleteEvent
}: Omit<EditorInspectorProps, 'level' | 'tab' | 'onTabChange' | 'onUpdateLevel'>) {
  const spawns = wave.events.filter((item): item is SpawnEvent => item.kind === 'spawn');
  const [enemyIndex, setEnemyIndex] = useState(0);
  const spawn = spawns.find((item) => item.id === selectedEventId) ?? spawns[0];
  const enemy = spawn?.enemies[Math.min(enemyIndex, Math.max(0, spawn.enemies.length - 1))];

  useEffect(() => setEnemyIndex(0), [spawn?.id]);

  const updateSpawn = (patch: Partial<SpawnEvent>) => {
    if (spawn) onUpdateEvent({ ...spawn, ...patch });
  };

  const updateEnemy = (patch: Partial<SpawnEnemySetting>) => {
    if (!spawn || !enemy) return;
    updateSpawn({ enemies: spawn.enemies.map((item, index) => index === enemyIndex ? { ...item, ...patch } : item) });
  };

  const addEnemy = () => {
    if (!spawn) return;
    const unused = ENEMIES.find((candidate) => !spawn.enemies.some((item) => item.enemyId === candidate.id));
    if (!unused) return;
    const next = [...spawn.enemies, {
      enemyId: unused.id,
      spriteKey: unused.spriteKey,
      weight: 1,
      health: 2,
      speed: 2.5,
      damage: 1,
      scoreValue: 100,
      powerupDropChance: 0.08
    } satisfies SpawnEnemySetting].map((item, _index, all) => ({ ...item, weight: 1 / all.length }));
    updateSpawn({ enemies: next });
    setEnemyIndex(next.length - 1);
  };

  const removeEnemy = () => {
    if (!spawn || spawn.enemies.length <= 1) return;
    const next = spawn.enemies.filter((_item, index) => index !== enemyIndex).map((item, _index, all) => ({ ...item, weight: 1 / all.length }));
    updateSpawn({ enemies: next });
    setEnemyIndex(Math.max(0, enemyIndex - 1));
  };

  return (
    <>
      <div className="le-inspector-title"><p>Selected wave</p><h2>{wave.name}</h2></div>
      <TextField label="Wave name" value={wave.name} onChange={(name) => onUpdateWave({ name })} />
      <div className="le-field-row">
        <NumberField label="Duration" value={wave.durationSeconds} onChange={(durationSeconds) => onUpdateWave({ durationSeconds })} min={5} max={600} step={1} unit="s" />
        <NumberField label="Delay after wave" value={wave.delayAfterSeconds} onChange={(delayAfterSeconds) => onUpdateWave({ delayAfterSeconds })} min={0} max={60} step={0.25} unit="s" />
      </div>
      <SelectField
        label="Completion rule"
        value={wave.completionRule}
        options={[
          { value: 'clear-after-duration', label: 'Clear threats after timer' },
          { value: 'boss-defeat', label: 'Defeat Gatekeeper' }
        ]}
        onChange={(completionRule) => onUpdateWave({ completionRule })}
      />
      <div className="le-field-row">
        <NumberField label="Starting difficulty" value={wave.difficultyMultiplier} onChange={(difficultyMultiplier) => onUpdateWave({ difficultyMultiplier })} min={0.1} max={10} step={0.05} unit="×" />
        <NumberField label="Score multiplier" value={wave.scoreMultiplier} onChange={(scoreMultiplier) => onUpdateWave({ scoreMultiplier })} min={0.1} max={1000} step={0.5} unit="×" />
      </div>
      <div className="le-field-row">
        <NumberField label="Intro" value={wave.introSeconds} onChange={(introSeconds) => onUpdateWave({ introSeconds })} min={0} max={30} step={0.25} unit="s" />
        <NumberField label="Threat cap" value={wave.threatCap} onChange={(threatCap) => onUpdateWave({ threatCap: Math.round(threatCap) })} min={1} max={300} step={1} />
      </div>

      <fieldset className="le-fieldset">
        <legend>Formation encounters</legend>
        <div className="le-event-select">
          <select value={spawn?.id ?? ''} aria-label="Formation encounter" onChange={(event) => onSelectEvent(event.target.value)}>
            {spawns.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <button className="le-icon-button" type="button" title="Add formation encounter" aria-label="Add formation encounter" onClick={() => onAddEvent('spawn')}><EditorIcon name="add" /></button>
        </div>
        {spawn && enemy ? (
          <>
            <EventTiming event={spawn} onChange={onUpdateEvent} />
            {spawn.formationSlots ? (
              <div className="le-formation-note">
                <strong>Custom formation · {spawn.formationSlots.length} numbered slots</strong>
                <span>The shape and slot count came from Combat Lab. You can still tune timing, enemies, and choreography here.</span>
                <button className="le-button" type="button" onClick={() => updateSpawn({ formationSlots: undefined })}>Switch back to a built-in layout</button>
              </div>
            ) : null}
            <div className="le-field-row">
              <NumberField label={spawn.formationSlots ? 'Enemy slots' : 'Enemy count'} value={spawn.count} onChange={(count) => updateSpawn({ count: Math.round(count) })} min={spawn.formationSlots ? 2 : 1} max={spawn.formationSlots ? 48 : 500} step={1} disabled={Boolean(spawn.formationSlots)} />
              <NumberField label="Spawn interval" value={spawn.spawnIntervalSeconds} onChange={(spawnIntervalSeconds) => updateSpawn({ spawnIntervalSeconds })} min={0.05} max={30} step={0.05} unit="s" />
            </div>
            <SelectField label={spawn.formationSlots ? 'Entry & attack choreography' : 'Spawn pattern'} value={spawn.patternId} options={spawn.formationSlots ? PATTERNS.filter((pattern) => pattern.value !== 'single-random' && pattern.value !== 'asteroid-lanes') : PATTERNS} onChange={(patternId) => updateSpawn({ patternId })} />
            {spawn.formationSlots ? null : <SelectField label="Spawn position" value={spawn.positionId} options={POSITIONS} onChange={(positionId) => updateSpawn({ positionId })} />}

            <div className="le-event-select">
              <select value={enemyIndex} aria-label="Enemy type row" onChange={(event) => setEnemyIndex(Number(event.target.value))}>
                {spawn.enemies.map((item, index) => <option key={`${item.enemyId}-${index}`} value={index}>{ENEMIES.find((entry) => entry.id === item.enemyId)?.label ?? item.enemyId}</option>)}
              </select>
              <button className="le-icon-button" type="button" title="Add enemy type" aria-label="Add enemy type" disabled={spawn.enemies.length >= ENEMIES.length} onClick={addEnemy}><EditorIcon name="add" /></button>
            </div>
            <SelectField label="Enemy type" value={enemy.enemyId} options={ENEMIES.map((item) => ({ value: item.id, label: item.label }))} onChange={(enemyId) => {
              const selected = ENEMIES.find((item) => item.id === enemyId)!;
              updateEnemy({ enemyId, spriteKey: selected.spriteKey });
            }} />
          <AssetSelectField
            label="Enemy sprite"
              value={enemy.spriteKey}
            options={ENEMY_SPRITES}
            assetRole="enemy"
              style={enemy.spriteStyle ?? {}}
              onChange={(spriteKey) => updateEnemy({ spriteKey })}
              onStyleChange={(spriteStyle) => updateEnemy({ spriteStyle })}
            />
            <div className="le-field-row">
              <NumberField label="Speed" value={enemy.speed} onChange={(speed) => updateEnemy({ speed })} min={0.1} max={20} step={0.1} unit="×" />
              <NumberField label="Health" value={enemy.health} onChange={(health) => updateEnemy({ health })} min={1} max={10000} step={1} unit="HP" />
            </div>
            <div className="le-field-row">
              <NumberField label="Damage" value={enemy.damage} onChange={(damage) => updateEnemy({ damage })} min={0} max={1000} step={1} />
              <NumberField label="Score value" value={enemy.scoreValue} onChange={(scoreValue) => updateEnemy({ scoreValue })} min={0} max={1000000} step={10} unit="pts" />
            </div>
            <div className="le-field-row">
              <NumberField label="Drop chance" value={enemy.powerupDropChance * 100} onChange={(value) => updateEnemy({ powerupDropChance: value / 100 })} min={0} max={100} step={1} unit="%" />
              <NumberField label="Mix weight" value={enemy.weight * 100} onChange={(value) => updateEnemy({ weight: value / 100 })} min={0} max={100} step={1} unit="%" />
            </div>
            <div className="le-field-row">
              <SelectField label="Enemy rank" value={enemy.rank ?? 'standard'} options={ENEMY_RANKS} onChange={(rank) => updateEnemy(rank === 'standard' ? {
                rank: undefined,
                attackPatternId: undefined,
                attackIntervalSeconds: undefined,
                projectileSpeed: undefined,
                burstCount: undefined
              } : { rank, attackPatternId: enemy.attackPatternId ?? 'aimed-burst' })} />
              <NumberField label="Visual size" value={enemy.sizeMultiplier ?? 1} onChange={(sizeMultiplier) => updateEnemy({ sizeMultiplier })} min={0.5} max={2.5} step={0.05} unit="×" />
            </div>
            {enemy.rank === 'elite' ? (
              <>
                <SelectField label="Elite unit attack" value={enemy.attackPatternId ?? 'aimed-burst'} options={ENEMY_ATTACKS} onChange={(attackPatternId) => updateEnemy({ attackPatternId })} />
                <div className="le-field-row">
                  <NumberField label="Attack interval" value={enemy.attackIntervalSeconds ?? 1.5} onChange={(attackIntervalSeconds) => updateEnemy({ attackIntervalSeconds })} min={0.3} max={10} step={0.05} unit="s" />
                  <NumberField label="Projectile speed" value={enemy.projectileSpeed ?? 4.8} onChange={(projectileSpeed) => updateEnemy({ projectileSpeed })} min={0.5} max={20} step={0.1} />
                </div>
                <NumberField label="Burst count" value={enemy.burstCount ?? 3} onChange={(burstCount) => updateEnemy({ burstCount: Math.round(burstCount) })} min={1} max={7} step={1} />
              </>
            ) : null}
            <button className="le-button le-button--danger" type="button" disabled={spawn.enemies.length <= 1} onClick={removeEnemy}><EditorIcon name="delete" /> Remove enemy type</button>
            <button className="le-button le-button--danger" type="button" disabled={spawns.length <= 1} onClick={() => onDeleteEvent(spawn.id)}><EditorIcon name="delete" /> Delete formation encounter</button>
          </>
        ) : <p className="le-validation">Add a formation encounter to configure regular enemies.</p>}
      </fieldset>
    </>
  );
}

function AsteroidSettings({
  wave,
  selectedEventId,
  onSelectEvent,
  onUpdateEvent,
  onAddEvent,
  onDeleteEvent
}: Pick<EditorInspectorProps, 'wave' | 'selectedEventId' | 'onSelectEvent' | 'onUpdateEvent' | 'onAddEvent' | 'onDeleteEvent'>) {
  const encounters = wave.events.filter((item): item is BossEvent | AsteroidEvent => item.kind === 'boss' || item.kind === 'asteroid-belt');
  const asteroid = encounters.find((item): item is AsteroidEvent => item.id === selectedEventId && item.kind === 'asteroid-belt');
  if (!asteroid) return null;

  const updateAsteroid = (patch: Partial<AsteroidEvent>) => onUpdateEvent({ ...asteroid, ...patch });

  return (
    <>
      <div className="le-inspector-title"><p>Between boss phases</p><h2>{asteroid.label}</h2></div>
      <div className="le-event-select">
        <select value={asteroid.id} aria-label="Boss or belt encounter" onChange={(event) => onSelectEvent(event.target.value)}>
          {encounters.map((item) => <option key={item.id} value={item.id}>{item.label}{item.kind === 'asteroid-belt' ? ' · Belt' : ''}</option>)}
        </select>
        <button className="le-icon-button" type="button" title="Add boss encounter" aria-label="Add boss encounter" onClick={() => onAddEvent('boss')}><EditorIcon name="add" /></button>
      </div>
      <EventTiming event={asteroid} onChange={onUpdateEvent} />
      <AssetSelectField
        label="Asteroid sprite"
        value={asteroid.spriteKey}
        options={ASTEROID_SPRITES}
        assetRole="asteroid"
        style={asteroid.spriteStyle ?? {}}
        onChange={(spriteKey) => updateAsteroid({ spriteKey })}
        onStyleChange={(spriteStyle) => updateAsteroid({ spriteStyle })}
      />
      <SelectField label="Belt pattern" value={asteroid.patternId} options={PATTERNS} onChange={(patternId) => updateAsteroid({ patternId })} />
      <SelectField label="Spawn position" value={asteroid.positionId} options={POSITIONS} onChange={(positionId) => updateAsteroid({ positionId })} />
      <div className="le-field-row">
        <NumberField label="Asteroid count" value={asteroid.count} onChange={(count) => updateAsteroid({ count: Math.round(count) })} min={1} max={300} step={1} />
        <NumberField label="Belt density" value={asteroid.density * 100} onChange={(value) => updateAsteroid({ density: value / 100 })} min={1} max={100} step={1} unit="%" />
      </div>
      <div className="le-field-row">
        <NumberField label="Spawn interval" value={asteroid.spawnIntervalSeconds} onChange={(spawnIntervalSeconds) => updateAsteroid({ spawnIntervalSeconds })} min={0.05} max={30} step={0.05} unit="s" />
        <NumberField label="Warning" value={asteroid.warningSeconds} onChange={(warningSeconds) => updateAsteroid({ warningSeconds })} min={0} max={30} step={0.25} unit="s" />
      </div>
      <div className="le-field-row">
        <NumberField label="Speed" value={asteroid.speed} onChange={(speed) => updateAsteroid({ speed })} min={0.1} max={30} step={0.1} />
        <NumberField label="Health" value={asteroid.health} onChange={(health) => updateAsteroid({ health })} min={1} max={100000} step={1} unit="HP" />
      </div>
      <div className="le-field-row">
        <NumberField label="Damage" value={asteroid.damage} onChange={(damage) => updateAsteroid({ damage })} min={0} max={1000} step={1} />
        <NumberField label="Score value" value={asteroid.scoreValue} onChange={(scoreValue) => updateAsteroid({ scoreValue })} min={0} max={1000000} step={10} unit="pts" />
      </div>
      <NumberField label="Power-up drop chance" value={asteroid.powerupDropChance * 100} onChange={(value) => updateAsteroid({ powerupDropChance: value / 100 })} min={0} max={100} step={1} unit="%" />
      <button className="le-button le-button--danger" type="button" onClick={() => onDeleteEvent(asteroid.id)}><EditorIcon name="delete" /> Delete asteroid belt</button>
    </>
  );
}

function BossSettings({
  wave,
  selectedEventId,
  onSelectEvent,
  onUpdateEvent,
  onAddEvent,
  onDeleteEvent
}: Pick<EditorInspectorProps, 'wave' | 'selectedEventId' | 'onSelectEvent' | 'onUpdateEvent' | 'onAddEvent' | 'onDeleteEvent'>) {
  const bosses = wave.events.filter((item): item is BossEvent => item.kind === 'boss');
  const boss = bosses.find((item) => item.id === selectedEventId) ?? bosses.at(-1);
  const bossEncounterClass = boss ? getBossEncounterClass(boss.bossId) : null;
  const bossClassLabel = bossEncounterClass === 'boss' ? 'BOSS' : 'ELITE ENEMY';
  const [weaponIndex, setWeaponIndex] = useState(0);
  const weapon = boss?.weapons[Math.min(weaponIndex, Math.max(0, boss.weapons.length - 1))];

  useEffect(() => setWeaponIndex(0), [boss?.id]);

  const updateBoss = (patch: Partial<BossEvent>) => {
    if (boss) onUpdateEvent({ ...boss, ...patch });
  };

  const updateWeapon = (patch: Partial<BossWeaponSetting>) => {
    if (!boss || !weapon) return;
    updateBoss({ weapons: boss.weapons.map((item, index) => index === weaponIndex ? { ...item, ...patch } : item) });
  };

  const addWeapon = () => {
    if (!boss) return;
    const next: BossWeaponSetting = { id: uid('weapon'), weaponId: 'aimed-shot', attackIntervalSeconds: 1.5, damage: 1, projectileSpeed: 4, burstCount: 1 };
    updateBoss({ weapons: [...boss.weapons, next] });
    setWeaponIndex(boss.weapons.length);
  };

  const removeWeapon = () => {
    if (!boss || boss.weapons.length <= 1 || !weapon) return;
    const weapons = boss.weapons.filter((_item, index) => index !== weaponIndex);
    const phases = boss.phases.map((phase) => {
      const weaponSettingIds = phase.weaponSettingIds.filter((id) => id !== weapon.id);
      return {
        ...phase,
        weaponSettingIds: weaponSettingIds.length > 0 ? weaponSettingIds : [weapons[0].id]
      };
    });
    updateBoss({ weapons, phases });
    setWeaponIndex(Math.max(0, weaponIndex - 1));
  };

  const updatePhase = (phaseId: string, patch: Partial<BossHealthPhase>) => {
    if (!boss) return;
    updateBoss({ phases: boss.phases.map((phase) => phase.id === phaseId ? { ...phase, ...patch } : phase) });
  };

  const addPhase = () => {
    if (!boss || !boss.weapons[0]) return;
    const lastThreshold = boss.phases.at(-1)?.triggerHealthRatio ?? 1;
    const phase: BossHealthPhase = {
      id: uid('phase'),
      label: `Phase ${boss.phases.length + 1}`,
      triggerHealthRatio: Math.max(0.05, lastThreshold - 0.25),
      movementPatternId: boss.movementPatternId,
      speedMultiplier: 1.2,
      weaponSettingIds: [boss.weapons[0].id]
    };
    updateBoss({ phases: [...boss.phases, phase] });
  };

  const removePhase = (phaseId: string) => {
    if (!boss || boss.phases.length <= 1) return;
    const phases = boss.phases.filter((phase) => phase.id !== phaseId);
    const fallbackPhaseId = phases[0]?.id;
    updateBoss({
      phases,
      timeline: boss.timeline ? {
        ...boss.timeline,
        clips: boss.timeline.clips.map((clip) => (
          clip.phaseId === phaseId
            ? { ...clip, phaseId: fallbackPhaseId }
            : clip
        ))
      } : undefined
    });
  };

  return (
    <>
      <div className="le-inspector-title"><p>{boss ? bossClassLabel : 'Encounter renderer'}</p><h2>{boss?.label ?? 'No encounter selected'}</h2></div>
      <div className="le-event-select">
        <select value={boss?.id ?? ''} aria-label="Boss encounter" onChange={(event) => onSelectEvent(event.target.value)}>
          {bosses.map((item) => <option key={item.id} value={item.id}>{getBossEncounterClass(item.bossId) === 'boss' ? 'BOSS' : 'ELITE ENEMY'} · {item.label}</option>)}
        </select>
        <button className="le-icon-button" type="button" title="Add boss encounter" aria-label="Add boss encounter" onClick={() => onAddEvent('boss')}><EditorIcon name="add" /></button>
      </div>
      {boss ? (
        <>
          <EventTiming event={boss} onChange={onUpdateEvent} />
          <SelectField label={`${bossClassLabel} encounter`} value={boss.bossId} options={BOSSES.map((item) => ({ value: item.id, label: item.label }))} onChange={(bossId) => {
            const selected = BOSSES.find((item) => item.id === bossId)!;
            updateBoss({
              bossId,
              rigId: isMajorBossId(bossId) ? (boss.rigId ?? 'open-orbit') : undefined,
              count: bossId === 'bottleneck-drone' ? (boss.count ?? 1) : 1,
              spriteKey: selected.spriteKey,
              movementPatternId: selected.movement
            });
          }} />
          {isMajorBossId(boss.bossId) ? (
            <SelectField label="Boss rig" value={boss.rigId ?? 'open-orbit'} options={BOSS_RIGS} onChange={(rigId) => updateBoss({ rigId })} />
          ) : null}
          <AssetSelectField
            label={`${bossClassLabel} sprite`}
            value={boss.spriteKey}
            options={BOSS_SPRITES}
            assetRole="boss"
            style={boss.spriteStyle ?? {}}
            onChange={(spriteKey) => updateBoss({ spriteKey })}
            onStyleChange={(spriteStyle) => updateBoss({ spriteStyle })}
          />
          <SelectField label="Movement pattern" value={boss.movementPatternId} options={MOVEMENTS} onChange={(movementPatternId) => updateBoss({ movementPatternId })} />
          <SelectField label="Spawn position" value={boss.positionId} options={POSITIONS} onChange={(positionId) => updateBoss({ positionId })} />
          {boss.bossId === 'bottleneck-drone' ? (
            <NumberField label="Elite enemy count" value={boss.count ?? 1} onChange={(count) => updateBoss({ count: Math.round(count) })} min={1} max={4} step={1} />
          ) : null}
          <div className="le-field-row">
            <NumberField label="Spawn warning" value={boss.warningSeconds} onChange={(warningSeconds) => updateBoss({ warningSeconds })} min={0} max={30} step={0.25} unit="s" />
            <NumberField label="Health" value={boss.health} onChange={(health) => updateBoss({ health })} min={1} max={1000000} step={10} unit="HP" />
          </div>
          <div className="le-field-row">
            <NumberField label="Speed" value={boss.speed} onChange={(speed) => updateBoss({ speed })} min={0} max={30} step={0.1} />
            <NumberField label="Contact damage" value={boss.damage} onChange={(damage) => updateBoss({ damage })} min={0} max={1000} step={1} />
          </div>
          <div className="le-field-row">
            <NumberField label="Score reward" value={boss.scoreReward} onChange={(scoreReward) => updateBoss({ scoreReward })} min={0} max={10000000} step={100} unit="pts" />
            <NumberField label="Drop chance" value={boss.powerupDropChance * 100} onChange={(value) => updateBoss({ powerupDropChance: value / 100 })} min={0} max={100} step={1} unit="%" />
          </div>
          <NumberField label="Orbiting shields" value={boss.shieldCount} onChange={(shieldCount) => updateBoss({ shieldCount: Math.round(shieldCount) })} min={0} max={12} step={1} />
          <NumberField label={`${bossClassLabel} visual size`} value={boss.sizeMultiplier ?? 1} onChange={(sizeMultiplier) => updateBoss({ sizeMultiplier })} min={0.5} max={1.5} step={0.05} unit="×" />

          <fieldset className="le-fieldset">
            <legend>Weapons</legend>
            <div className="le-event-select">
              <select value={weaponIndex} aria-label="Boss weapon" onChange={(event) => setWeaponIndex(Number(event.target.value))}>
                {boss.weapons.map((item, index) => <option key={item.id} value={index}>{WEAPONS.find((entry) => entry.value === item.weaponId)?.label ?? item.weaponId}</option>)}
              </select>
              <button className="le-icon-button" type="button" title="Add weapon" aria-label="Add boss weapon" onClick={addWeapon}><EditorIcon name="add" /></button>
            </div>
            {weapon ? (
              <>
                <SelectField label="Weapon" value={weapon.weaponId} options={WEAPONS} onChange={(weaponId) => updateWeapon({ weaponId })} />
                <div className="le-field-row">
                  <NumberField label="Attack frequency" value={weapon.attackIntervalSeconds} onChange={(attackIntervalSeconds) => updateWeapon({ attackIntervalSeconds })} min={0.05} max={30} step={0.05} unit="s" />
                  <NumberField label="Weapon damage" value={weapon.damage} onChange={(damage) => updateWeapon({ damage })} min={0} max={1000} step={1} />
                </div>
                <div className="le-field-row">
                  <NumberField label="Projectile speed" value={weapon.projectileSpeed} onChange={(projectileSpeed) => updateWeapon({ projectileSpeed })} min={0.1} max={40} step={0.1} />
                  <NumberField label="Burst count" value={weapon.burstCount} onChange={(burstCount) => updateWeapon({ burstCount: Math.round(burstCount) })} min={1} max={50} step={1} />
                </div>
                <button className="le-button le-button--danger" type="button" disabled={boss.weapons.length <= 1} onClick={removeWeapon}><EditorIcon name="delete" /> Remove weapon</button>
              </>
            ) : null}
          </fieldset>

          <fieldset className="le-fieldset">
            <legend>Health phases</legend>
            <div className="le-phase-list">
              {boss.phases.map((phase, index) => (
                <article className="le-phase-card" key={phase.id}>
                  <header><strong>{phase.label}</strong><button type="button" disabled={boss.phases.length <= 1} onClick={() => removePhase(phase.id)}>Remove</button></header>
                  <TextField label="Phase name" value={phase.label} onChange={(label) => updatePhase(phase.id, { label })} />
                  <NumberField label="Starts below health" value={phase.triggerHealthRatio * 100} onChange={(value) => updatePhase(phase.id, { triggerHealthRatio: value / 100 })} min={1} max={100} step={1} unit="%" />
                  <SelectField label="Movement" value={phase.movementPatternId} options={MOVEMENTS} onChange={(movementPatternId) => updatePhase(phase.id, { movementPatternId })} />
                  <NumberField label="Speed multiplier" value={phase.speedMultiplier} onChange={(speedMultiplier) => updatePhase(phase.id, { speedMultiplier })} min={0.1} max={10} step={0.1} unit="×" />
                  <div className="le-check-grid">
                    {boss.weapons.map((setting) => {
                      const selected = phase.weaponSettingIds.includes(setting.id);
                      return (
                        <label key={setting.id}>
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={selected && phase.weaponSettingIds.length === 1}
                            onChange={() => updatePhase(phase.id, {
                              weaponSettingIds: selected
                                ? phase.weaponSettingIds.filter((id) => id !== setting.id)
                                : [...phase.weaponSettingIds, setting.id]
                            })}
                          />
                          {WEAPONS.find((entry) => entry.value === setting.weaponId)?.label ?? setting.weaponId}
                        </label>
                      );
                    })}
                  </div>
                  <small>Phase {index + 1} uses {phase.weaponSettingIds.length} configured attack{phase.weaponSettingIds.length === 1 ? '' : 's'}.</small>
                </article>
              ))}
            </div>
            <button className="le-button" type="button" onClick={addPhase}><EditorIcon name="add" /> Add low-health phase</button>
          </fieldset>

          <BossTimelineEditor boss={boss} onChange={onUpdateEvent} />

          <button className="le-button le-button--danger" type="button" disabled={bosses.length <= 1} onClick={() => onDeleteEvent(boss.id)}><EditorIcon name="delete" /> Delete boss encounter</button>
        </>
      ) : <p className="le-validation">Add a boss encounter to preview and configure a real boss.</p>}
    </>
  );
}

function LevelSettings({
  level,
  hudAssets,
  onUpdateLevel,
  onUpdateHudAssets
}: Pick<EditorInspectorProps, 'level' | 'hudAssets' | 'onUpdateLevel' | 'onUpdateHudAssets'>) {
  const togglePowerup = (powerupId: PowerupId) => {
    const exists = level.availablePowerupIds.includes(powerupId);
    onUpdateLevel({ availablePowerupIds: exists ? level.availablePowerupIds.filter((id) => id !== powerupId) : [...level.availablePowerupIds, powerupId] });
  };

  return (
    <>
      <div className="le-inspector-title"><p>Selected mission</p><h2>{level.name}</h2></div>
      <TextField label="Mission name" value={level.name} onChange={(name) => onUpdateLevel({ name })} />
      <TextField label="Description" value={level.description} onChange={(description) => onUpdateLevel({ description })} multiline />
      <SelectField label="Background" value={level.backgroundId} options={BACKGROUNDS} onChange={(backgroundId) => onUpdateLevel({ backgroundId })} />
      <SelectField label="Music / sound preset" value={level.musicId} options={[{ value: 'procedural-main', label: 'Scicon procedural main' }]} onChange={(musicId) => onUpdateLevel({ musicId })} />
      <div className="le-field-row">
        <NumberField label="Starting difficulty" value={level.startingDifficulty} onChange={(startingDifficulty) => onUpdateLevel({ startingDifficulty })} min={0.1} max={10} step={0.05} unit="×" />
        <NumberField label="Score target" value={level.scoreTarget} onChange={(scoreTarget) => onUpdateLevel({ scoreTarget: Math.round(scoreTarget) })} min={0} max={100000000} step={100} unit="pts" />
      </div>
      <p className="le-reserved-field-note">
        Mission completion is currently driven by its ordered wave rules. Reserved
        mission-duration and loop fields are preserved in data but stay hidden until
        their runtime semantics have dedicated behavior tests.
      </p>

      <fieldset className="le-fieldset">
        <legend>Available power-ups</legend>
        <div className="le-check-grid">
          {POWERUPS.map((powerup) => (
            <label className="le-check-row" key={powerup.id}>
              <input type="checkbox" checked={level.availablePowerupIds.includes(powerup.id)} onChange={() => togglePowerup(powerup.id)} />
              <span>{powerup.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="le-fieldset">
        <legend>Gameplay HUD artwork</legend>
        <p className="le-inspector-note">This is the icon rendered by the real bomb control in both the editor and the game.</p>
        <AssetSelectField
          label="Bomb button icon"
          value={hudAssets.bombIconAssetKey}
          options={HUD_ASSETS}
          assetRole="hud"
          onChange={(bombIconAssetKey) => onUpdateHudAssets({ ...hudAssets, bombIconAssetKey })}
        />
      </fieldset>

      <fieldset className="le-fieldset">
        <legend>End-of-mission scorecard</legend>
        <SelectField label="Show scorecard" value={level.scorecard.trigger} options={[{ value: 'mission-end', label: 'When the full run ends' }, { value: 'level-complete', label: 'When this mission completes' }]} onChange={(trigger) => onUpdateLevel({ scorecard: { ...level.scorecard, trigger } })} />
        <TextField label="Title" value={level.scorecard.title} onChange={(title) => onUpdateLevel({ scorecard: { ...level.scorecard, title } })} />
        <TextField label="Subtitle" value={level.scorecard.subtitle} onChange={(subtitle) => onUpdateLevel({ scorecard: { ...level.scorecard, subtitle } })} />
        <TextField label="Score label" value={level.scorecard.scoreLabel} onChange={(scoreLabel) => onUpdateLevel({ scorecard: { ...level.scorecard, scoreLabel } })} />
        <label className="le-check-row">
          <input type="checkbox" checked={level.scorecard.showEncounterArt} onChange={(event) => onUpdateLevel({ scorecard: { ...level.scorecard, showEncounterArt: event.target.checked } })} />
          <span>Show encounter artwork</span>
        </label>
      </fieldset>
    </>
  );
}

function CardColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="le-field le-color-field">
      <span>{label}</span>
      <span>
        <input type="color" value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} />
        <code>{value.toUpperCase()}</code>
      </span>
    </label>
  );
}

function CardRegionSettings({
  label,
  region,
  onChange
}: {
  label: string;
  region: RecordCardArtRegion;
  onChange: (patch: Partial<RecordCardArtRegion>) => void;
}) {
  return (
    <fieldset className="le-fieldset">
      <legend>{label}</legend>
      <label className="le-check-row">
        <input type="checkbox" checked={region.visible} onChange={(event) => onChange({ visible: event.target.checked })} />
        <span>Show this artwork</span>
      </label>
      <div className="le-field-row">
        <NumberField label="X" value={region.x} onChange={(x) => onChange({ x: Math.round(x) })} min={0} max={1200 - region.width} unit="px" />
        <NumberField label="Y" value={region.y} onChange={(y) => onChange({ y: Math.round(y) })} min={0} max={1200 - region.height} unit="px" />
      </div>
      <div className="le-field-row">
        <NumberField label="Width" value={region.width} onChange={(width) => onChange({ width: Math.round(width), x: Math.min(region.x, 1200 - width) })} min={40} max={1200 - region.x} unit="px" />
        <NumberField label="Height" value={region.height} onChange={(height) => onChange({ height: Math.round(height), y: Math.min(region.y, 1200 - height) })} min={40} max={1200 - region.y} unit="px" />
      </div>
      <div className="le-field-row">
        <NumberField label="Rotation" value={region.rotation} onChange={(rotation) => onChange({ rotation })} min={-180} max={180} unit="°" />
        <NumberField label="Opacity" value={Math.round(region.opacity * 100)} onChange={(opacity) => onChange({ opacity: opacity / 100 })} min={0} max={100} unit="%" />
      </div>
    </fieldset>
  );
}

function CardSettings({ recordCard, onUpdateRecordCard }: Pick<EditorInspectorProps, 'recordCard' | 'onUpdateRecordCard'>) {
  const updateCopy = (patch: Partial<RecordCardConfig['copy']>) => onUpdateRecordCard({
    ...recordCard,
    copy: { ...recordCard.copy, ...patch }
  });
  const updateColors = (patch: Partial<RecordCardConfig['colors']>) => onUpdateRecordCard({
    ...recordCard,
    colors: { ...recordCard.colors, ...patch }
  });
  const updateRegion = (regionId: 'ship' | 'encounter', patch: Partial<RecordCardArtRegion>) => onUpdateRecordCard({
    ...recordCard,
    art: { ...recordCard.art, [regionId]: { ...recordCard.art[regionId], ...patch } }
  });

  return (
    <>
      <div className="le-inspector-title"><p>Shared production visual</p><h2>Mission / NFT card</h2></div>
      <p className="le-inspector-note">This is the same SVG used by the in-game mission record and generated share/NFT image. Only local sample data is shown here.</p>
      <TextField label="Title" value={recordCard.copy.title} onChange={(title) => updateCopy({ title })} />
      <TextField label="Subtitle" value={recordCard.copy.subtitle} onChange={(subtitle) => updateCopy({ subtitle })} />
      <div className="le-field-row">
        <TextField label="Callsign label" value={recordCard.copy.callsignLabel} onChange={(callsignLabel) => updateCopy({ callsignLabel })} />
        <TextField label="Score label" value={recordCard.copy.scoreLabel} onChange={(scoreLabel) => updateCopy({ scoreLabel })} />
      </div>
      <div className="le-field-row">
        <TextField label="Verified label" value={recordCard.copy.verifiedLabel} onChange={(verifiedLabel) => updateCopy({ verifiedLabel })} />
        <TextField label="Review label" value={recordCard.copy.reviewLabel} onChange={(reviewLabel) => updateCopy({ reviewLabel })} />
      </div>

      <fieldset className="le-fieldset">
        <legend>Artwork</legend>
        <AssetSelectField label="Ship art" value={recordCard.shipAssetKey} options={CARD_ASSETS} assetRole="scorecard" onChange={(shipAssetKey) => onUpdateRecordCard({ ...recordCard, shipAssetKey })} />
        <label className="le-field">
          <span>Encounter art</span>
          <select value={recordCard.encounterAssetKey} onChange={(event) => onUpdateRecordCard({ ...recordCard, encounterAssetKey: event.target.value as RecordCardConfig['encounterAssetKey'] })}>
            <option value="AUTO">Automatic from the real wave</option>
            {CARD_ASSETS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        {recordCard.encounterAssetKey !== 'AUTO' ? (
          <span
            className="le-asset-field__preview le-card-asset-preview"
            draggable
            title="Drag onto the encounter region"
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'copy';
              event.dataTransfer.setData(SPRITE_ASSET_DRAG_MIME, recordCard.encounterAssetKey);
            }}
          >
            <img src={ASSET_CATALOG[recordCard.encounterAssetKey].paths[0]} alt="" draggable={false} />
          </span>
        ) : null}
        <small className="le-asset-field__meta">Drag the selected asset preview onto either outlined card region.</small>
      </fieldset>

      <fieldset className="le-fieldset">
        <legend>Color system</legend>
        <div className="le-field-row"><CardColorField label="Background" value={recordCard.colors.background} onChange={(background) => updateColors({ background })} /><CardColorField label="Panel" value={recordCard.colors.panel} onChange={(panel) => updateColors({ panel })} /></div>
        <div className="le-field-row"><CardColorField label="Primary" value={recordCard.colors.primary} onChange={(primary) => updateColors({ primary })} /><CardColorField label="Secondary" value={recordCard.colors.secondary} onChange={(secondary) => updateColors({ secondary })} /></div>
        <div className="le-field-row"><CardColorField label="Success" value={recordCard.colors.success} onChange={(success) => updateColors({ success })} /><CardColorField label="Warning" value={recordCard.colors.warning} onChange={(warning) => updateColors({ warning })} /></div>
        <div className="le-field-row"><CardColorField label="Text" value={recordCard.colors.text} onChange={(text) => updateColors({ text })} /><CardColorField label="Muted" value={recordCard.colors.muted} onChange={(muted) => updateColors({ muted })} /></div>
        <label className="le-check-row"><input type="checkbox" checked={recordCard.showGrid} onChange={(event) => onUpdateRecordCard({ ...recordCard, showGrid: event.target.checked })} /><span>Show tactical grid</span></label>
      </fieldset>

      <CardRegionSettings label="Ship region" region={recordCard.art.ship} onChange={(patch) => updateRegion('ship', patch)} />
      <CardRegionSettings label="Encounter region" region={recordCard.art.encounter} onChange={(patch) => updateRegion('encounter', patch)} />
      <button className="le-button" type="button" onClick={() => onUpdateRecordCard({
        ...recordCard,
        art: {
          ship: { ...DEFAULT_RECORD_CARD_CONFIG.art.ship },
          encounter: { ...DEFAULT_RECORD_CARD_CONFIG.art.encounter }
        }
      })}><EditorIcon name="restart" /> Reset card layout</button>
    </>
  );
}

export function EditorInspector(props: EditorInspectorProps) {
  const selectedEvent = props.wave.events.find((event) => event.id === props.selectedEventId);
  const tabLabels: Record<InspectorTab, string> = { wave: 'Wave', boss: 'Boss', level: 'Mission', card: 'Card' };
  return (
    <aside className="le-inspector" aria-label="Mission and wave settings">
      <nav className="le-inspector-tabs" aria-label="Settings categories">
        {(['wave', 'boss', 'level', 'card'] as const).map((tab) => (
          <button key={tab} type="button" className={props.tab === tab ? 'is-selected' : ''} aria-current={props.tab === tab ? 'page' : undefined} onClick={() => props.onTabChange(tab)}>{tabLabels[tab]}</button>
        ))}
      </nav>
      <div className="le-inspector-body">
        {props.tab === 'wave' ? <WaveSettings {...props} /> : null}
        {props.tab === 'boss' && selectedEvent?.kind === 'asteroid-belt' ? <AsteroidSettings {...props} /> : null}
        {props.tab === 'boss' && selectedEvent?.kind !== 'asteroid-belt' ? <BossSettings {...props} /> : null}
        {props.tab === 'level' ? <LevelSettings {...props} /> : null}
        {props.tab === 'card' ? <CardSettings {...props} /> : null}
      </div>
    </aside>
  );
}
