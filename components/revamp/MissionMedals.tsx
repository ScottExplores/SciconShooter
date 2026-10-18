import React from 'react';
import type { RevampMedal, RevampMissionSettlement } from '../../services/revamp/progression/types';
import { useCountUp } from './useCountUp';
import './progression.css';

const MEDALS: Array<{ id: RevampMedal; title: string; hint: string; symbol: string }> = [
  { id: 'clear', title: 'Clear', hint: 'Mission complete', symbol: '★' },
  { id: 'kills', title: 'Ace', hint: 'At least 90% of enemies', symbol: '✦' },
  { id: 'noHit', title: 'Untouched', hint: 'Clear without a hit', symbol: '◇' }
];

export interface MissionMedalsProps { settlement: RevampMissionSettlement }

const MissionMedals: React.FC<MissionMedalsProps> = ({ settlement }) => {
  const research = useCountUp(settlement.researchAwarded);
  return (
    <section className="revamp-medals" aria-label="Mission research medals">
      <div className="revamp-medals__row">
        {MEDALS.map((medal, index) => {
          const earned = settlement.medals.includes(medal.id);
          const isNew = settlement.newMedals.includes(medal.id);
          return (
            <div key={medal.id} className={`revamp-medal${earned ? ' is-earned' : ''}${isNew ? ' is-new' : ''}`} style={{ animationDelay: `${index * 130}ms` }} title={medal.hint} aria-label={`${medal.title}: ${medal.hint}. ${earned ? isNew ? 'New medal' : 'Earned' : 'Not earned'}`}>
              <span aria-hidden="true">{medal.symbol}</span><strong>{medal.title}</strong><small>{isNew ? 'NEW' : earned ? 'EARNED' : '—'}</small>
            </div>
          );
        })}
      </div>
      <p className="revamp-medals__award" aria-label={`${settlement.researchAwarded} Research Data earned`}><span>Research Data</span><strong aria-hidden="true">+{research}</strong></p>
      {settlement.unlocks.length > 0 ? (
        <div className="revamp-unlock-toast" role="status">
          <span aria-hidden="true">✧</span>
          <div><small>NEW FRONTIER UNLOCK</small><strong>{settlement.unlocks.map((unlock) => unlock.label).join(' · ')}</strong></div>
        </div>
      ) : null}
    </section>
  );
};

export default MissionMedals;
