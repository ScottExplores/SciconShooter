import type { CombatImpactBuffer, CombatImpactEvent } from '../gameplay/CombatImpactBuffer';

/** Each renderer has its own cursor; rendering never drains simulation evidence. */
export class CombatImpactPresentation {
  private source: CombatImpactBuffer | null = null;
  private sequence = 0;

  reset() {
    this.source = null;
    this.sequence = 0;
  }

  visitNew(source: CombatImpactBuffer, frame: number, reducedEffects: boolean, visit: (event: CombatImpactEvent) => void) {
    if (this.source !== source) {
      this.source = source;
      this.sequence = 0;
    }
    if (this.sequence >= source.latestSequence) return;
    const previousSequence = this.sequence;
    this.sequence = source.latestSequence;
    let remaining = reducedEffects ? 4 : 8;
    // Prefer current hits over a backlog after a slow render or tab restoration.
    for (let index = source.events.length - 1; index >= 0 && remaining > 0; index--) {
      const event = source.events[index];
      if (event.sequence <= previousSequence) break;
      const age = frame - event.frame;
      if (age < 0 || age > 8) continue;
      visit(event);
      remaining--;
    }
  }
}
