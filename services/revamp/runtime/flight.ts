import type { RevampBonuses, RevampEvent } from '../progression/types';
import { getRevampLocalDateKey } from '../progression';

export type RevampLoadout = RevampBonuses & {
  firstFlight?: boolean;
  wingAutoCast?: boolean;
  cosmeticId?: string;
};
export interface RevampFlightMetrics { spawned: number; kills: number; hits: number }
type QueuedEvent = RevampEvent & { profileId: string; runId: string; occurredAt: number; dateKey: string; total: number };
const events: QueuedEvent[] = [];
export const pendingRevampEvents = (profileId: string) => events.filter(event => event.profileId === profileId);
export const acknowledgeRevampEvents = (ids: readonly string[]) => {
  const done = new Set(ids);
  for (let i = events.length - 1; i >= 0; i--) if (done.has(events[i].id)) events.splice(i, 1);
};
/** Absolute simulation totals make retry safe even if a local commit succeeds
 * before its later cloud-dirty write throws. Never add queued deltas to saved totals. */
export const aggregateRevampEventTotals = (pending: readonly QueuedEvent[]) => {
  const groups = new Map<string, RevampEvent & { occurredAt: number }>();
  for (const event of pending) {
    const id = `${event.runId}:${event.dateKey}:${event.kind}`;
    const previous = groups.get(id);
    if (!previous || event.total > previous.amount) groups.set(id, {
      id, runId: event.runId, kind: event.kind, mode: 'total', amount: event.total, occurredAt: event.occurredAt
    });
  }
  return [...groups.values()];
};
const REGULAR_ENEMIES = new Set(['ENEMY_DRONE', 'ENEMY_SWARM', 'ENEMY_BRICK', 'ENEMY_JOURNAL', 'ENEMY_INVADER']);

/** Simulation-owned; never counts menus, pause time, supply caches or bullets as targets. */
export class RevampFlight {
  readonly runId = globalThis.crypto?.randomUUID?.() ?? `flight-${Date.now()}-${Math.random()}`;
  metrics: RevampFlightMetrics = { spawned: 0, kills: 0, hits: 0 };
  shield = 0;
  overdriveFrames = 0;
  private charge = 0;
  private creditRemainder = 0;
  private sequence = 0;
  private eventTotals = new Map<string, number>();
  private targets = new Set<string>();
  constructor(readonly profileId: string, readonly bonuses: RevampLoadout) { this.resetMission(); }
  resetMission() {
    this.metrics = { spawned: 0, kills: 0, hits: 0 };
    this.targets.clear();
    this.shield = this.bonuses.shieldBonus;
    this.overdriveFrames = 0;
    this.charge = 0;
  }
  observe(entities: readonly { id: string; type: string; campaignFiller?: boolean }[]) {
    for (const entity of entities) if (REGULAR_ENEMIES.has(entity.type) && !entity.campaignFiller && !this.targets.has(entity.id)) {
      this.targets.add(entity.id); this.metrics.spawned++;
    }
  }
  kill(type: string, id?: string) {
    if (id) this.observe([{ type, id }]);
    if (REGULAR_ENEMIES.has(type)) this.metrics.kills++;
    this.event('kills');
    this.charge += this.bonuses.overdriveChargeMultiplier;
    if (this.charge < 24 || this.bonuses.overdriveChargeMultiplier <= 1) return false;
    this.charge -= 24;
    this.overdriveFrames = Math.round(360 * this.bonuses.overdriveDurationMultiplier);
    return true;
  }
  tick() { this.overdriveFrames = Math.max(0, this.overdriveFrames - 1); }
  event(kind: RevampEvent['kind'], amount = 1) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const occurredAt = Date.now();
    const dateKey = getRevampLocalDateKey(new Date(occurredAt));
    const counterKey = `${dateKey}:${kind}`;
    const delta = Math.floor(amount);
    if (!delta) return;
    const total = (this.eventTotals.get(counterKey) ?? 0) + delta;
    this.eventTotals.set(counterKey, total);
    events.push({ profileId: this.profileId, runId: this.runId, id: `${this.runId}:${kind}:${++this.sequence}`,
      kind, amount: delta, occurredAt, dateKey, total });
  }
  absorb(damage: number) {
    this.metrics.hits++;
    const absorbed = Math.min(this.shield, damage);
    this.shield -= absorbed;
    return damage - absorbed;
  }
  credit() {
    this.creditRemainder += Math.max(0, this.bonuses.creditGainMultiplier - 1);
    const bonus = Math.floor(this.creditRemainder + 1e-9);
    this.creditRemainder -= bonus;
    return 1 + bonus;
  }
  damageMultiplier() { return this.bonuses.mainDamageMultiplier * (this.overdriveFrames > 0 ? 1.25 : 1); }
}

/** An extra round uses the hull's existing shot family and never changes the world size. */
export const addResearchRounds = <T extends { shots: Array<{ angle: number; damage: number; fireDelayFrames: number; barrel: number }> }>(burst: T | null, count: number): T | null => {
  if (!burst || count <= 0 || !burst.shots.length) return burst;
  const round = burst.shots[0];
  return { ...burst, shots: [...burst.shots, ...Array.from({ length: Math.min(2, count) }, (_, i) => ({
    ...round, angle: (i % 2 ? 1 : -1) * 0.09, damage: round.damage * 0.5, fireDelayFrames: 0
  }))] };
};
