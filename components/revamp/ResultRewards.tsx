// REVAMP(H): Presentation reads settled receipts; reveal effects never grant rewards.
import React from 'react';
import type { RevampMedal, RevampMissionSettlement } from '../../services/revamp/progression/types';
import { AnimatedNumber } from './UiMotion';

const MEDALS: Array<{ id: RevampMedal; label: string; hint: string }> = [
  { id: 'clear', label: 'Clear', hint: 'Mission completed' },
  { id: 'kills', label: 'Ace', hint: 'At least 90% of enemies defeated' },
  { id: 'noHit', label: 'No hit', hint: 'Mission cleared without damage' },
];

export const ResultMedals: React.FC<{
  settlement?: RevampMissionSettlement | null;
  observedMedals: RevampMedal[];
}> = ({ settlement, observedMedals }) => (
  <section className="result-medals" aria-label="Mission research medals">
    {MEDALS.map((medal, index) => {
      const earned = (settlement?.medals ?? observedMedals).includes(medal.id);
      const isNew = settlement?.newMedals.includes(medal.id);
      return (
        <div className={`result-medal${earned ? ' is-earned' : ''}${isNew ? ' is-new' : ''}`}
          key={medal.id} style={{ '--reveal-delay': `${650 + index * 160}ms` } as React.CSSProperties}
          aria-label={`${medal.label}: ${medal.hint}. ${earned ? isNew ? 'New medal' : 'Earned' : 'Not earned'}`}>
          <span className="result-medal__star" aria-hidden="true">★</span>
          <strong>{medal.label}</strong>
          <small>{isNew ? 'NEW' : earned ? 'EARNED' : 'NEXT TIME'}</small>
        </div>
      );
    })}
  </section>
);

export const ResultRewards: React.FC<{
  credits: number;
  settlement?: RevampMissionSettlement | null;
}> = ({ credits, settlement }) => (
  <section className="result-rewards" aria-label="Rewards earned">
    <div className="result-rewards__cards">
      <div className="result-reward result-reward--credits" aria-label={`${credits} Tokens earned`}>
        <i className="result-reward__coin" aria-hidden="true" />
        <div><span>Tokens</span><strong>+<AnimatedNumber value={credits} delay={1050} duration={650} /></strong></div>
        <div className="result-coin-burst" aria-hidden="true">
          {Array.from({ length: 7 }, (_, index) => <i key={index} style={{ '--coin-x': `${(index - 3) * 11}px`, '--coin-delay': `${1150 + index * 55}ms` } as React.CSSProperties} />)}
        </div>
      </div>
      <div className="result-reward result-reward--data" aria-label={`${settlement?.researchAwarded ?? 0} Research Data earned`}>
        <i className="result-reward__data" aria-hidden="true">◆</i>
        <div><span>Research Data</span><strong>+<AnimatedNumber value={settlement?.researchAwarded ?? 0} delay={1200} duration={650} /></strong></div>
      </div>
    </div>
    {settlement && settlement.unlocks.length > 0 ? (
      <div className="result-unlock" role="status">
        <span aria-hidden="true">✦</span>
        <div><small>NEW DISCOVERY</small><strong>{settlement.unlocks.map(unlock => unlock.label).join(' · ')}</strong></div>
      </div>
    ) : null}
  </section>
);
