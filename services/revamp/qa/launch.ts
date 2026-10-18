import { useEffect, useRef } from 'react';
import { readQAConfig, type QAConfig } from './config';

export interface QAMission {
  readonly id: string;
  readonly waveIds: readonly string[];
}

export interface QABoss {
  readonly eventId: string;
  readonly bossId?: string;
  readonly missionId: string;
  readonly waveId: string;
}

export interface QALaunchRequest {
  readonly missionId: string;
  readonly waveId: string;
  readonly kind: 'mission';
}

/** Resolve authored content only: malformed QA links never silently play another level. */
export const resolveQALaunch = (
  config: QAConfig,
  missions: readonly QAMission[],
  bosses: readonly QABoss[]
): QALaunchRequest | null => {
  if (!config.enabled) return null;
  if (config.bosslab) {
    const boss = config.bosslab === 'first'
      ? bosses[0]
      : bosses.find((entry) => entry.eventId === config.bosslab || entry.bossId === config.bosslab);
    const mission = boss && missions.find((entry) => entry.id === boss.missionId);
    return boss && mission?.waveIds.includes(boss.waveId)
      ? { missionId: boss.missionId, waveId: boss.waveId, kind: 'mission' }
      : null;
  }
  const mission = missions.find((entry) => entry.id === config.mission);
  return mission?.waveIds[0]
    ? { missionId: mission.id, waveId: mission.waveIds[0], kind: 'mission' }
    : null;
};

/** The ref prevents React StrictMode's effect replay from launching twice. */
export const useQAMissionLaunch = (
  ready: boolean,
  missions: readonly QAMission[],
  bosses: readonly QABoss[],
  launch: (request: QALaunchRequest) => void
) => {
  const launched = useRef(false);
  useEffect(() => {
    if (!ready || launched.current) return;
    const config = readQAConfig();
    if (!config.enabled || (!config.mission && !config.bosslab)) return;
    launched.current = true;
    const request = resolveQALaunch(config, missions, bosses);
    if (request) launch(request);
    else console.error('QA launch rejected: unknown mission or boss event.');
  }, [ready, missions, bosses, launch]);
};
