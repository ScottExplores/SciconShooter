import React, { useEffect, useState } from 'react';
import { getUpgradeNodes, getRevampGoals, getRevampSpendableCredits, REVAMP_BRANCHES, REVAMP_UNLOCK_CADENCE } from '../../services/revamp/progression';
import type { RevampBranch, RevampGoal, RevampProgress } from '../../services/revamp/progression/types';
import { FRONTIER_FIELD_LOGS } from '../../services/storyBeats';
import './progression.css';

export interface ProgressionPanelProps {
  state: RevampProgress;
  credits: number;
  onPurchase: (branch: RevampBranch) => void;
  onClaim: (goalId: string) => void;
  onCosmeticChange?: (id: string | null) => void;
}

const BRANCH_SYMBOLS: Record<RevampBranch, string> = { firepower: '✦', survival: '◇', support: '⋈', fortune: '✧', overdrive: 'ϟ' };
const COSMETICS = REVAMP_UNLOCK_CADENCE.filter((entry) => entry.kind === 'skin' || entry.kind === 'trail');

const GoalRow: React.FC<{ goal: RevampGoal; onClaim: (id: string) => void }> = ({ goal, onClaim }) => (
  <li className={`revamp-goal${goal.claimed ? ' is-claimed' : goal.complete ? ' is-ready' : ''}`}>
    <div className="revamp-goal__copy">
      <strong>{goal.label}</strong>
      <div className="revamp-goal__progress" role="progressbar" aria-label={goal.label} aria-valuemin={0} aria-valuemax={goal.target} aria-valuenow={goal.progress}>
        <span style={{ width: `${Math.min(100, 100 * goal.progress / Math.max(1, goal.target))}%` }} />
      </div>
      <small>{goal.progress.toLocaleString()} / {goal.target.toLocaleString()}<span>+{goal.creditReward} Credits · +{goal.researchReward} Data</span></small>
    </div>
    <button type="button" disabled={!goal.complete || goal.claimed} onClick={() => onClaim(goal.id)} aria-label={goal.claimed ? `${goal.label}: reward claimed` : `Claim ${goal.label} reward`}>
      {goal.claimed ? '✓' : goal.complete ? 'Claim' : 'In flight'}
    </button>
  </li>
);

const ProgressionPanel: React.FC<ProgressionPanelProps> = ({ state, credits, onPurchase, onClaim, onCosmeticChange }) => {
  const [view, setView] = useState<'daily' | 'weekly' | 'research'>('daily');
  const [selectedNodeId, setSelectedNodeId] = useState('firepower:1');
  const [calendar, setCalendar] = useState(() => new Date());
  // A menu left open across midnight must rotate without requiring a reload.
  useEffect(() => {
    const refresh = () => setCalendar(new Date());
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const goals = getRevampGoals(state, calendar);
  const nodes = getUpgradeNodes(state);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0];
  const readyCount = [...goals.daily, ...goals.weekly].filter((goal) => goal.complete && !goal.claimed).length;
  const dailyComplete = goals.daily.filter((goal) => goal.complete).length;
  const spendableCredits = getRevampSpendableCredits(state, credits);
  const canBuy = selectedNode.available && !selectedNode.purchased && spendableCredits >= selectedNode.creditCost && state.researchData >= selectedNode.researchCost && !state.researchDebt;
  const lockedMinutes = Math.max(0, Math.ceil(selectedNode.unlockMinutes - state.playTimeMs / 60000));
  const purchaseLabel = selectedNode.purchased ? 'Researched'
    : lockedMinutes > 0 ? `${lockedMinutes} min flight to unlock`
    : !selectedNode.available ? 'Research previous node'
    : spendableCredits < selectedNode.creditCost ? 'Earn Science Credits in flight'
    : state.researchDebt || state.researchData < selectedNode.researchCost ? 'Need Research Data'
    : 'Research upgrade';
  const nextUnlock = REVAMP_UNLOCK_CADENCE.find((unlock) => !state.unlockIds.includes(unlock.id));
  const weeklyCosmetic = COSMETICS.find((unlock) => unlock.assetId === goals.weeklyCosmeticId);

  return (
    <details className="revamp-progression">
      <summary>
        <span className="revamp-progression__sigil" aria-hidden="true">✧</span>
        <span className="revamp-progression__title"><strong>Frontier log</strong><small>{dailyComplete}/3 daily goals · {goals.streak} day login streak</small></span>
        <span className={`revamp-progression__badge${readyCount ? ' is-ready' : ''}`}>{readyCount ? `${readyCount} to claim` : `${state.researchData} Data`}</span>
      </summary>
      <div className="revamp-progression__contents">
        <nav className="revamp-progression__tabs" aria-label="Frontier log pages">
          {(['daily', 'weekly', 'research'] as const).map((page) => <button type="button" key={page} aria-pressed={view === page} onClick={() => setView(page)}>{page === 'daily' ? 'Daily · 3' : page === 'weekly' ? 'Weekly · 5' : 'Research'}</button>)}
        </nav>
        {view !== 'research' ? (
          <>
            <p className="revamp-progression__intro">{view === 'daily' ? 'Small discoveries. New goals each local day.' : 'A fresh expedition every ISO week. Claim all five for a cosmetic.'}</p>
            <ul className="revamp-goals">{goals[view].map((goal) => <GoalRow key={goal.id} goal={goal} onClaim={onClaim} />)}</ul>
            <p className="revamp-progression__footnote">{view === 'daily' ? `${goals.streak} day streak · Best ${goals.bestStreak}. Your unlocks always stay yours.` : `Weekly bonus: ${weeklyCosmetic?.label ?? 'frontier cosmetic'}. No missed-day penalties.`}</p>
          </>
        ) : (
          <>
            <div className="revamp-research__wallet"><span><strong>{spendableCredits.toLocaleString()}</strong> Earned Science Credits</span><span><strong>{state.researchData}</strong> Research Data</span></div>
            <div className="revamp-tree" aria-label="Upgrade tree: five branches with five nodes each">
              {REVAMP_BRANCHES.map((branch) => {
                const branchNodes = nodes.filter((node) => node.branch === branch);
                return <div className={`revamp-tree__branch revamp-tree__branch--${branch}`} key={branch}>
                  <span className="revamp-tree__label"><i aria-hidden="true">{BRANCH_SYMBOLS[branch]}</i>{branchNodes[0].branchLabel}</span>
                  {branchNodes.map((node) => <button type="button" key={node.id} aria-pressed={node.id === selectedNode.id} aria-label={`${node.branchLabel} ${node.level}: ${node.name}, ${node.purchased ? 'researched' : node.available ? 'available' : 'locked'}`} className={`${node.purchased ? 'is-purchased' : node.available ? 'is-available' : 'is-locked'}`} onClick={() => setSelectedNodeId(node.id)}><span>{node.purchased ? '✓' : node.level === 5 ? '★' : node.level}</span></button>)}
                </div>;
              })}
            </div>
            <div className="revamp-node-detail" aria-live="polite">
              <div><small>{selectedNode.branchLabel} · Node {selectedNode.level}/5</small><strong>{selectedNode.name}</strong><p>{selectedNode.description}</p></div>
              <span className="revamp-node-detail__cost">{selectedNode.creditCost} Credits + {selectedNode.researchCost} Data</span>
              <button type="button" disabled={!canBuy} onClick={() => onPurchase(selectedNode.branch)}>{purchaseLabel}</button>
            </div>
            <p className="revamp-progression__footnote">Earned Science Credits share your Token balance. Purchased Tokens cannot buy research. Research Data comes from medals and goals. Weekly Run has no research bonuses.</p>
            <fieldset className="revamp-cosmetics"><legend>Flight signature</legend>
              <button type="button" aria-pressed={!state.equippedCosmeticId} disabled={!onCosmeticChange} onClick={() => onCosmeticChange?.(null)}>Original</button>
              {COSMETICS.map((cosmetic) => {
                const owned = state.unlockIds.includes(cosmetic.id);
                return <button key={cosmetic.id} type="button" disabled={!owned || !onCosmeticChange} aria-pressed={state.equippedCosmeticId === cosmetic.assetId} onClick={() => onCosmeticChange?.(cosmetic.assetId ?? null)}><span className={`revamp-cosmetic-dot revamp-cosmetic-dot--${cosmetic.id}`} aria-hidden="true" />{cosmetic.label}{!owned ? <small>{cosmetic.atMinutes} min</small> : null}</button>;
              })}
            </fieldset>
            {FRONTIER_FIELD_LOGS.filter((log) => state.unlockIds.includes(log.unlockId)).map((log) => (
              <details className="revamp-field-log" key={log.unlockId}>
                <summary><span><strong>{log.speaker} · Field log</strong><small>{log.title}</small></span></summary>
                <p>{log.text}</p>
              </details>
            ))}
          </>
        )}
        {nextUnlock ? <div className="revamp-next-unlock"><span>Next discovery</span><strong>{nextUnlock.label}</strong><small>{nextUnlock.id === 'wing-right' ? 'Clear Mission 1' : `${Math.max(0, Math.ceil(nextUnlock.atMinutes - state.playTimeMs / 60000))} min more flight`}</small></div> : <div className="revamp-next-unlock"><strong>First-hour discoveries complete</strong><small>The frontier keeps growing.</small></div>}
      </div>
    </details>
  );
};

export default ProgressionPanel;
