import React, { useEffect, useMemo, useState } from 'react';
import type { LeaderboardEntry } from '../../types';
import { findPilotStanding, weeklyCountdown, weeklyStandings } from '../../services/revamp/weekly/presentation';
import './weeklyCompetition.css';

interface Props {
  entries: LeaderboardEntry[];
  walletAddress?: string | null;
  runIds?: string[];
  loading?: boolean;
  bossNames?: string[];
  onViewLeaderboard: () => void;
}

export default function WeeklyCompetitionCard({ entries, walletAddress, runIds = [], loading, bossNames = [], onViewLeaderboard }: Props) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const tick = window.setInterval(() => { if (!document.hidden) setNow(Date.now()); }, 1000);
    return () => window.clearInterval(tick);
  }, []);
  const countdown = weeklyCountdown(now);
  const board = useMemo(() => weeklyStandings(entries, now), [entries, countdown.weekKey]);
  const standing = findPilotStanding(board, walletAddress, runIds);
  return (
    <section className="revamp-weekly-card" aria-label="Weekly competition briefing">
      <div className="revamp-weekly-card__heading">
        <span className="revamp-weekly-eyebrow">Weekly Run · skill only</span>
        <time dateTime={countdown.endsAt.toISOString()} title="Resets Sunday at 12:00 noon Pacific Time">{countdown.label}</time>
      </div>
      <h3>Top score this week picks which proposal gets the prize.</h3>
      <p className="revamp-weekly-copy">Five attempts. Standard ship & gear. One shared route. Reset Sunday, 12 PM PT.</p>
      {bossNames.length ? <p className="revamp-weekly-bosses"><span>This week’s bosses</span>{bossNames.join(' · ')}</p> : null}
      <details className="revamp-weekly-board">
        <summary><span>Live weekly board</span><strong>{standing ? `Your rank #${standing.rank}` : 'Top 5 + your rank'}</strong></summary>
        {loading && !board.length ? <p className="revamp-weekly-copy" role="status">Contacting the leaderboard…</p> : board.length ? (
          <ol aria-label="Top five weekly scores">
            {board.slice(0, 5).map((entry, index) => (
              <li key={entry.runId || `${entry.name}-${entry.date}-${index}`} data-you={standing?.rank === index + 1}>
                <span className="revamp-weekly-rank">{String(index + 1).padStart(2, '0')}</span>
                <span className="revamp-weekly-pilot">{entry.name}{standing?.rank === index + 1 ? ' · YOU' : ''}</span>
                <strong>{entry.score.toLocaleString('en-US')}</strong>
              </li>
            ))}
          </ol>
        ) : <p className="revamp-weekly-copy">No scores received yet. Fly a Weekly Run to join the board.</p>}
        {standing && standing.rank > 5 ? <p className="revamp-weekly-own">#{standing.rank} · {standing.entry.name}<strong>{standing.entry.score.toLocaleString('en-US')} pts</strong></p> : null}
        {!standing && board.length ? <p className="revamp-weekly-copy">Submit a verified run to see your rank in the top 100.</p> : null}
        <button type="button" onClick={onViewLeaderboard}>View leaderboard & past winners <span aria-hidden="true">↗</span></button>
      </details>
    </section>
  );
}
