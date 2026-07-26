import { useEffect, useState, type FormEvent } from 'react';
import {
  MAX_PREVIEW_HEALTH_BUDGET,
  clampPreviewBossHealthRatio,
  clampPreviewHealthBudget,
  type PreviewBossSnapshot
} from '@game/services/gameplay/previewSession';
import './boss-health-tuning.css';

interface BossHealthTuningPanelProps {
  boss: PreviewBossSnapshot | null;
  onBossHealthRatioChange: (healthRatio: number) => void;
  onBossMaxHealthChange: (maxHealth: number) => void;
  onComponentMaxHealthChange: (componentId: string, maxHealth: number) => void;
  onBossInvincibilityChange: (enabled: boolean) => void;
  onComponentInvincibilityChange: (componentId: string, enabled: boolean) => void;
}

interface HealthBudgetRowProps {
  id: string;
  label: string;
  health: number;
  maxHealth: number;
  invincible: boolean;
  status: 'Hull' | 'Active' | 'Protected' | 'Destroyed';
  currentHealthEditable?: boolean;
  onCurrentHealthCommit?: (health: number) => void;
  onCommit: (maxHealth: number) => void;
  onInvincibilityChange: (enabled: boolean) => void;
}

const formatHealth = (value: number) => Math.max(0, Math.round(value)).toLocaleString();

function HealthBudgetRow({
  id,
  label,
  health,
  maxHealth,
  invincible,
  status,
  currentHealthEditable = false,
  onCurrentHealthCommit,
  onCommit,
  onInvincibilityChange
}: HealthBudgetRowProps) {
  const [draft, setDraft] = useState(String(Math.round(maxHealth)));
  const [currentDraft, setCurrentDraft] = useState(String(Math.round(health)));

  useEffect(() => {
    setDraft(String(Math.round(maxHealth)));
  }, [maxHealth]);

  useEffect(() => {
    setCurrentDraft(String(Math.round(health)));
  }, [health]);

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(Math.round(maxHealth)));
      return;
    }
    const budget = clampPreviewHealthBudget(parsed);
    setDraft(String(budget));
    onCommit(budget);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    commit();
  };

  const commitCurrentHealth = () => {
    const parsed = Number(currentDraft);
    if (!Number.isFinite(parsed)) {
      setCurrentDraft(String(Math.round(health)));
      return;
    }
    const nextHealth = Math.max(
      1,
      Math.round(maxHealth * clampPreviewBossHealthRatio(parsed / Math.max(1, maxHealth)))
    );
    setCurrentDraft(String(nextHealth));
    onCurrentHealthCommit?.(nextHealth);
  };

  const submitCurrentHealth = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    commitCurrentHealth();
  };

  return (
    <article
      className="boss-health-tuning__row"
      data-invincible={invincible ? 'true' : 'false'}
      data-status={status.toLowerCase()}
    >
      <header>
        <div className="boss-health-tuning__identity">
          <strong>{label}</strong>
          <span className="boss-health-tuning__status">{status}</span>
        </div>
        <button
          className="boss-health-tuning__invincibility"
          type="button"
          role="switch"
          aria-checked={invincible}
          aria-label={`${label} health invincibility`}
          disabled={status === 'Destroyed'}
          onClick={() => onInvincibilityChange(!invincible)}
        >
          <span className="boss-health-tuning__invincibility-label">Invincible</span>
          <span className="boss-health-tuning__switch-track" aria-hidden="true">
            <span className="boss-health-tuning__switch-knob" />
          </span>
        </button>
      </header>
      <output aria-label={`${label} current health`}>
        {formatHealth(health)} <span>/ {formatHealth(maxHealth)} HP</span>
      </output>
      {currentHealthEditable ? (
        <form onSubmit={submitCurrentHealth}>
          <label htmlFor={`boss-current-health-${id}`}>Current test HP (1% min)</label>
          <div>
            <input
              id={`boss-current-health-${id}`}
              type="number"
              inputMode="numeric"
              min={Math.max(1, Math.ceil(maxHealth * 0.01))}
              max={Math.max(1, Math.round(maxHealth))}
              step={1}
              value={currentDraft}
              onChange={(event) => setCurrentDraft(event.target.value)}
              onFocus={(event) => {
                event.currentTarget.select();
              }}
            />
            <button type="submit">Set</button>
          </div>
        </form>
      ) : null}
      <form onSubmit={submit}>
        <label htmlFor={`boss-health-budget-${id}`}>Test max HP</label>
        <div>
          <input
            id={`boss-health-budget-${id}`}
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_PREVIEW_HEALTH_BUDGET}
            step={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={(event) => {
              event.currentTarget.select();
            }}
          />
          <button type="submit">Set</button>
        </div>
      </form>
    </article>
  );
}

export function BossHealthTuningPanel({
  boss,
  onBossHealthRatioChange,
  onBossMaxHealthChange,
  onComponentMaxHealthChange,
  onBossInvincibilityChange,
  onComponentInvincibilityChange
}: BossHealthTuningPanelProps) {
  return (
    <section className="boss-health-tuning" aria-label="Boss test health">
      <header className="boss-health-tuning__title">
        <span>Health - test balancing</span>
        <small>This fight only · resets on restart</small>
      </header>

      {boss ? (
        <div className="boss-health-tuning__rows">
          <HealthBudgetRow
            key={`hull:${boss.eventId ?? boss.bossId ?? 'boss'}`}
            id="boss-hull"
            label="Boss hull"
            health={boss.health}
            maxHealth={boss.maxHealth}
            invincible={boss.invincible}
            status="Hull"
            currentHealthEditable
            onCurrentHealthCommit={(health) => (
              onBossHealthRatioChange(health / Math.max(1, boss.maxHealth))
            )}
            onCommit={onBossMaxHealthChange}
            onInvincibilityChange={onBossInvincibilityChange}
          />
          {boss.components.map((component) => (
            <HealthBudgetRow
              key={component.id}
              id={component.id}
              label={component.label}
              health={component.health}
              maxHealth={component.maxHealth}
              invincible={component.invincible}
              status={component.destroyed
                ? 'Destroyed'
                : component.exposed
                  ? 'Active'
                  : 'Protected'}
              onCommit={(maxHealth) => (
                onComponentMaxHealthChange(component.id, maxHealth)
              )}
              onInvincibilityChange={(enabled) => (
                onComponentInvincibilityChange(component.id, enabled)
              )}
            />
          ))}
        </div>
      ) : (
        <p className="boss-health-tuning__empty">
          Spawn the boss to see its hull and destructible-part health.
        </p>
      )}
    </section>
  );
}
