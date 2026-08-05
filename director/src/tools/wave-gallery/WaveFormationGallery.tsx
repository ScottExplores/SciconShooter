import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  GameCampaignConfig,
  LevelDefinition
} from '@game/game-config/types';
import { fetchGameCampaign } from '@director/api/directorClient';
import {
  buildWaveGallerySectors,
  buildWaveGallerySummary,
  describeSupportEvent,
  getMissionBackgroundPaths,
  type SpawnEventGallerySummary,
  type SupportWaveEvent,
  type WaveGallerySector
} from './waveGalleryModel';
import './wave-formation-gallery.css';

const readQuerySelection = () => {
  const query = new URLSearchParams(window.location.search);
  return {
    missionId: query.get('mission') ?? '',
    waveId: query.get('wave') ?? ''
  };
};

const syncQuerySelection = (missionId: string, waveId: string) => {
  const url = new URL(window.location.href);
  url.searchParams.set('mission', missionId);
  url.searchParams.set('wave', waveId);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
};

const formatNumber = (value: number) => Number.isInteger(value)
  ? String(value)
  : value.toFixed(1).replace(/\.0$/, '');

const getMissionNumber = (mission: LevelDefinition) => Math.max(1, mission.order);

function MiniRoster({ paths }: { paths: readonly string[] }) {
  return (
    <span className="wfg-mini-roster" aria-hidden="true">
      {paths.slice(0, 4).map((path) => <img src={path} alt="" key={path} draggable={false} />)}
    </span>
  );
}

function FormationBoard({
  summary,
  backgroundPaths
}: {
  summary: SpawnEventGallerySummary;
  backgroundPaths: readonly string[];
}) {
  return (
    <div className="wfg-formation-board" aria-label={`${summary.formationLabel} layout preview`}>
      <div className="wfg-formation-board__space" aria-hidden="true">
        {backgroundPaths.map((path, index) => (
          <img className={`wfg-formation-board__background wfg-formation-board__background--${index}`} src={path} alt="" key={path} draggable={false} />
        ))}
        <span className="wfg-formation-board__entry">{summary.entryDirection} entrance</span>
        <span className="wfg-formation-board__lane" />
        {summary.members.map((member) => (
          <img
            className="wfg-formation-board__enemy"
            src={member.assetPath}
            alt=""
            key={member.id}
            draggable={false}
            style={{ left: `${member.leftPercent}%`, top: `${member.topPercent}%` }}
          />
        ))}
      </div>
      <footer>
        <span><b>{summary.members.length}</b> enemies</span>
        <span><b>{summary.formationLabel}</b> shape</span>
        <span><b>{summary.entrance}</b> path</span>
      </footer>
    </div>
  );
}

function EnemyRoster({ summary }: { summary: SpawnEventGallerySummary }) {
  return (
    <div className="wfg-roster" aria-label="Enemy roster">
      {summary.allocations.map((allocation) => (
        <article className="wfg-roster__enemy" key={`${summary.event.id}-${allocation.enemy.roleId ?? allocation.enemy.spriteKey}`}>
          <span className="wfg-roster__sprite">
            {allocation.assetPath ? <img src={allocation.assetPath} alt="" draggable={false} /> : null}
            <b title={`${Math.round(allocation.weightPercent)}% spawn weight`}>≈{formatNumber(allocation.expectedCount)}</b>
          </span>
          <div>
            <strong>{allocation.label}</strong>
            <small>{allocation.assetLabel}</small>
            <span>
              {allocation.role?.durabilityClass ?? allocation.enemy.rank ?? 'standard'}
              {' · '}{formatNumber(allocation.enemy.health)} HP
              {allocation.enemy.rank === 'elite' ? ' · elite meter' : ''}
            </span>
          </div>
          <dl>
            <div><dt>Role</dt><dd>{allocation.role?.characteristic ?? allocation.role?.role ?? 'standard unit'}</dd></div>
            <div><dt>Fire</dt><dd>{allocation.role?.specialAttack ?? allocation.role?.fireBehavior ?? allocation.enemy.attackPatternId ?? 'none'}</dd></div>
          </dl>
        </article>
      ))}
    </div>
  );
}

function SpawnEventCard({
  summary,
  backgroundPaths
}: {
  summary: SpawnEventGallerySummary;
  backgroundPaths: readonly string[];
}) {
  return (
    <article className="wfg-encounter-card">
      <header className="wfg-encounter-card__header">
        <div>
          <small>Formation at {formatNumber(summary.event.startSeconds)}s</small>
          <h3>{summary.event.label}</h3>
        </div>
        <span>{summary.pack?.label ?? 'Custom formation'}</span>
      </header>
      <div className="wfg-encounter-card__body">
        <FormationBoard summary={summary} backgroundPaths={backgroundPaths} />
        <div className="wfg-encounter-card__details">
          <dl className="wfg-choreography">
            <div><dt>Entrance</dt><dd>{summary.entryDirection} · {summary.entrance}</dd></div>
            <div><dt>Movement</dt><dd>{summary.movement}</dd></div>
            <div><dt>Attack</dt><dd>{summary.attack}</dd></div>
            <div><dt>Firing</dt><dd>{summary.firing}</dd></div>
            <div><dt>Return</dt><dd>{summary.returnBehavior}</dd></div>
            <div><dt>Spawn pace</dt><dd>{formatNumber(summary.event.spawnIntervalSeconds)}s apart</dd></div>
          </dl>
          <EnemyRoster summary={summary} />
        </div>
      </div>
    </article>
  );
}

function SupportEventCard({ event }: { event: SupportWaveEvent }) {
  const description = describeSupportEvent(event);
  return (
    <article className="wfg-support-card">
      <span className="wfg-support-card__art">
        {description.assetPath ? <img src={description.assetPath} alt="" draggable={false} /> : <b>{event.kind.slice(0, 2).toUpperCase()}</b>}
      </span>
      <div>
        <small>{event.kind.replaceAll('-', ' ')} at {formatNumber(event.startSeconds)}s</small>
        <strong>{event.label || description.heading}</strong>
        <span>{description.heading} · {description.detail}</span>
      </div>
    </article>
  );
}

function SelectionControls({
  sectors,
  selectedSector,
  selectedMission,
  onSectorChange,
  onMissionChange,
  onPreviousMission,
  onNextMission
}: {
  sectors: WaveGallerySector[];
  selectedSector: WaveGallerySector;
  selectedMission: LevelDefinition;
  onSectorChange: (sectorId: string) => void;
  onMissionChange: (missionId: string) => void;
  onPreviousMission: () => void;
  onNextMission: () => void;
}) {
  return (
    <section className="wfg-controls" aria-label="Mission selection">
      <label>
        <span>Sector</span>
        <select value={selectedSector.id} onChange={(event) => onSectorChange(event.target.value)}>
          {sectors.map((sector) => (
            <option value={sector.id} key={sector.id}>Sector {sector.order} · {sector.name}</option>
          ))}
        </select>
      </label>
      <label className="wfg-controls__mission">
        <span>Mission</span>
        <select value={selectedMission.id} onChange={(event) => onMissionChange(event.target.value)}>
          {selectedSector.missions.map((mission) => (
            <option value={mission.id} key={mission.id}>
              M{getMissionNumber(mission)} · {mission.name}{selectedSector.primaryMissionIds.includes(mission.id) ? '' : ' · ALT ROUTE'}
            </option>
          ))}
        </select>
      </label>
      <div className="wfg-controls__step">
        <button type="button" onClick={onPreviousMission} aria-label="Previous mission">←</button>
        <button type="button" onClick={onNextMission} aria-label="Next mission">→</button>
      </div>
    </section>
  );
}

export function WaveFormationGallery() {
  const initialSelection = useMemo(readQuerySelection, []);
  const [campaign, setCampaign] = useState<GameCampaignConfig | null>(null);
  const [selectedMissionId, setSelectedMissionId] = useState(initialSelection.missionId);
  const [selectedWaveId, setSelectedWaveId] = useState(initialSelection.waveId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCampaign = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const state = await fetchGameCampaign<GameCampaignConfig>();
      setCampaign(state.campaign);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Campaign could not be opened.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCampaign(); }, [loadCampaign]);

  const sectors = useMemo(() => campaign ? buildWaveGallerySectors(campaign) : [], [campaign]);
  const flatMissions = useMemo(() => sectors.flatMap((sector) => sector.missions), [sectors]);
  const selectedMission = flatMissions.find((mission) => mission.id === selectedMissionId)
    ?? flatMissions[0];
  const selectedSector = sectors.find((sector) => (
    sector.missions.some((mission) => mission.id === selectedMission?.id)
  )) ?? sectors[0];
  const selectedWave = selectedMission?.waves.find((wave) => wave.id === selectedWaveId)
    ?? selectedMission?.waves[0];
  const waveSummary = useMemo(() => (
    campaign && selectedWave ? buildWaveGallerySummary(selectedWave, campaign) : null
  ), [campaign, selectedWave]);
  const backgroundPaths = useMemo(() => (
    selectedMission ? getMissionBackgroundPaths(selectedMission) : []
  ), [selectedMission]);

  useEffect(() => {
    if (!selectedMission || !selectedWave) return;
    if (selectedMission.id !== selectedMissionId) setSelectedMissionId(selectedMission.id);
    if (selectedWave.id !== selectedWaveId) setSelectedWaveId(selectedWave.id);
    syncQuerySelection(selectedMission.id, selectedWave.id);
  }, [selectedMission, selectedMissionId, selectedWave, selectedWaveId]);

  const chooseMission = (missionId: string) => {
    const mission = flatMissions.find((candidate) => candidate.id === missionId);
    if (!mission) return;
    setSelectedMissionId(mission.id);
    setSelectedWaveId(mission.waves[0]?.id ?? '');
  };

  const stepMission = (direction: -1 | 1) => {
    if (!selectedMission || flatMissions.length === 0) return;
    const currentIndex = flatMissions.findIndex((mission) => mission.id === selectedMission.id);
    const nextIndex = (currentIndex + direction + flatMissions.length) % flatMissions.length;
    chooseMission(flatMissions[nextIndex].id);
  };

  if (loading && !campaign) {
    return <section className="wfg-state" role="status"><span>Loading</span><h1>Opening the Wave Gallery…</h1></section>;
  }
  if (error || !campaign || !selectedSector || !selectedMission || !selectedWave || !waveSummary) {
    return (
      <section className="wfg-state wfg-state--error" role="alert">
        <span>Local campaign</span>
        <h1>The Wave Gallery could not open.</h1>
        <p>{error ?? 'No Campaign missions were found.'}</p>
        <button type="button" onClick={() => void loadCampaign()}>Try again</button>
      </section>
    );
  }

  const totalWaves = campaign.levels.reduce((sum, mission) => sum + mission.waves.length, 0);
  return (
    <div className="wfg-shell">
      <header className="wfg-heading">
        <div>
          <p>Read-only Campaign inspector</p>
          <h1>Wave &amp; Formation Gallery</h1>
          <span>Pick a mission, then click a wave. Everything below comes directly from the current Campaign file.</span>
        </div>
        <dl>
          <div><dt>Missions</dt><dd>{campaign.levels.length}</dd></div>
          <div><dt>Waves</dt><dd>{totalWaves}</dd></div>
          <div><dt>Enemy roles</dt><dd>{campaign.enemyRoles.length}</dd></div>
        </dl>
      </header>

      <SelectionControls
        sectors={sectors}
        selectedSector={selectedSector}
        selectedMission={selectedMission}
        onSectorChange={(sectorId) => {
          const sector = sectors.find((candidate) => candidate.id === sectorId);
          if (sector?.missions[0]) chooseMission(sector.missions[0].id);
        }}
        onMissionChange={chooseMission}
        onPreviousMission={() => stepMission(-1)}
        onNextMission={() => stepMission(1)}
      />

      <section className="wfg-mission-summary" aria-labelledby="wfg-mission-title">
        <div>
          <small>Sector {selectedSector.order} · Mission {getMissionNumber(selectedMission)} · {selectedMission.campaignProgression?.missionRole?.replaceAll('-', ' ') ?? 'campaign'}</small>
          <h2 id="wfg-mission-title">{selectedMission.name}</h2>
          <p>{selectedMission.description}</p>
        </div>
        <span>{selectedMission.waves.length} wave{selectedMission.waves.length === 1 ? '' : 's'}</span>
      </section>

      <nav className="wfg-wave-strip" aria-label={`${selectedMission.name} waves`}>
        {selectedMission.waves.map((wave) => {
          const summary = buildWaveGallerySummary(wave, campaign);
          return (
            <button
              type="button"
              className={wave.id === selectedWave.id ? 'is-selected' : ''}
              aria-current={wave.id === selectedWave.id ? 'true' : undefined}
              onClick={() => setSelectedWaveId(wave.id)}
              key={wave.id}
            >
              <span>Wave {wave.order}</span>
              <strong>{wave.name}</strong>
              <small>{summary.enemyCount} enemies · {summary.formationCount} formations</small>
              <MiniRoster paths={summary.uniqueAssetPaths} />
            </button>
          );
        })}
      </nav>

      <section className="wfg-wave-summary" aria-labelledby="wfg-wave-title">
        <div>
          <small>Wave {selectedWave.order} · {selectedWave.rhythm.replaceAll('-', ' ')}</small>
          <h2 id="wfg-wave-title">{selectedWave.name}</h2>
        </div>
        <dl>
          <div><dt>Enemies</dt><dd>{waveSummary.enemyCount}</dd></div>
          <div><dt>Types</dt><dd>{waveSummary.enemyTypeCount}</dd></div>
          <div><dt>Formations</dt><dd>{waveSummary.formationCount}</dd></div>
          <div><dt>Threat cap</dt><dd>{selectedWave.threatCap}</dd></div>
          <div><dt>Duration</dt><dd>{formatNumber(selectedWave.durationSeconds)}s</dd></div>
        </dl>
      </section>

      <main className="wfg-encounters">
        {waveSummary.spawnEvents.map((summary) => (
          <SpawnEventCard summary={summary} backgroundPaths={backgroundPaths} key={summary.event.id} />
        ))}
        {waveSummary.spawnEvents.length === 0 ? (
          <div className="wfg-empty"><strong>No regular formation in this wave.</strong><span>Bosses, hazards, and rewards are listed below.</span></div>
        ) : null}
      </main>

      {waveSummary.supportEvents.length > 0 ? (
        <section className="wfg-support" aria-labelledby="wfg-support-title">
          <header><small>Also in this wave</small><h2 id="wfg-support-title">Bosses, hazards &amp; rewards</h2></header>
          <div>{waveSummary.supportEvents.map((event) => <SupportEventCard event={event} key={event.id} />)}</div>
        </section>
      ) : null}

      <footer className="wfg-footer">
        <span>Read only · no save or publish controls</span>
        <button type="button" onClick={() => void loadCampaign()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh Campaign file'}</button>
      </footer>
    </div>
  );
}

export default WaveFormationGallery;
