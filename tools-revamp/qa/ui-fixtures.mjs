import { readFile } from 'node:fs/promises';
import { REPO_ROOT } from './server.mjs';
import { renderRecordCardSvg } from '../../shared/record-card/renderRecordCardSvg.mjs';
// Synthetic long-copy records for UI coverage; never sent to a remote service.
export function uiFixture(url, { empty = false, now = new Date() } = {}) {
  const route = url.searchParams.get('route') || url.pathname.split('/').pop();
  const title = 'Open science across the frontier: reproducible cellular repair and transparent evidence for better health outcomes in underserved communities';
  const author = 'Dr. Alexandra Montgomery and the International Open Research Collaboration';
  const expires = new Date(now.getTime() + 30 * 86400000).toISOString();
  const results = empty ? [] : Array.from({ length: 8 }, (_, i) => ({
    id: String(17010 + i), title: i === 0 ? title : `${['Transparent clinical evidence', 'Mapping ocean biodiversity', 'Open tools for rare disease research', 'Community led reproducibility', 'Accessible science education', 'Sharing astronomy discoveries', 'Restoring research infrastructure'][i - 1]}: an open science expedition`,
    slug: `offline-ui-research-${i}`, authors: [{ first_name: 'Dr. Alexandra', last_name: 'Montgomery' }, { first_name: 'International Open', last_name: 'Research Collaboration' }],
    fundraise: { goal_currency: 'USD', goal_amount: { usd: 1234567 }, amount_raised: { usd: 987654 }, status: 'OPEN', end_date: expires, contributors: { total: 12345 } }, metrics: { votes: 1234, replies: 123 },
  }));
  const scores = empty ? [] : Array.from({length: 8},(_,i)=>({name: i === 0 ? 'MMMMMMMMMMMMMMM' : `EXPLORER-${String(i).padStart(6,'0')}`,score:987654321-i*1234567,wave:60-i,date:now.toISOString(),proposalId:'17010',proposalTitle:title,proposalAuthor:author,proposalUrl:'https://www.researchhub.com/post/17010/offline-ui-research-0',runId:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,verified:true}));
  if(route==='researchhub-proposals')return { results, referencedProposals:results, fetchedAt:now.toISOString() };
  if(route==='leaderboard')return {scores,monthlyScores:scores,weekScores:scores,weekKey:url.searchParams.get('weekKey')};
  if(route==='weekly-competitions')return {ok:true,competitions:empty?[]:[{week_key:'2026-10-04',starts_at:'2026-10-04T19:00:00Z',ends_at:'2026-10-11T19:00:00Z',winner_name:'MMMMMMMMMMMMMMM',winning_score:987654321,winning_wave:60,proposal_id:'17010',proposal_title:title,proposal_author:author,proposal_url:'https://www.researchhub.com/post/17010/offline-ui-research-0',allocation_rsc:1000,status:'funded'}],completedWeekKeys:[]};
  return null;
}

let recordArt;
export async function uiRecordCardFixture() {
  recordArt ??= Promise.all(['/game-art/branding/researchhub-ship.png','/game-art/record-card/mission-record-frame.png'].map(async file => `data:image/png;base64,${(await readFile(`${REPO_ROOT}/public${file}`)).toString('base64')}`));
  const [shipImage,frameImage] = await recordArt;
  return renderRecordCardSvg({ shipImage,frameImage, record: { pilotName:'MMMMMMMMMMMMMMM',score:987654321,wave:60,encounter:'SINGULARITY ARCHIVE',targetsDefeated:12345,coinsCollected:123456,durationLabel:'12:34',completedLabel:'OFFLINE UI FIXTURE',gameVersion:'UI audit',integrity:'local-unverified' } });
}
