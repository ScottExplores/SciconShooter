import defaultScorecardJson from '../../../director-data/fixtures/default-scorecard.json';
import defaultWaveCampaignJson from '../../../director-data/fixtures/default-wave-campaign.json';
import sampleRunsJson from '../../../director-data/fixtures/sample-runs.json';
import type { RunSnapshot, ScorecardConfig, WaveCampaignConfig } from './types';

export const defaultScorecard = defaultScorecardJson as ScorecardConfig;
export const defaultWaveCampaign = defaultWaveCampaignJson as WaveCampaignConfig;
export const sampleRuns = sampleRunsJson as RunSnapshot[];

export const cloneValue = <T,>(value: T): T => structuredClone(value);
