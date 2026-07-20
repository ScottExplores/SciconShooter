const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (...segments) => fs.readFileSync(path.join(__dirname, '..', ...segments), 'utf8');

const eligibilitySource = read('api', '_lib', 'researchHubEligibility.js');
const leaderboardSource = read('api', 'leaderboard.js');
const competitionSource = read('api', '_lib', 'weeklyCompetitionService.js');
const claimSource = read('api', 'weekly-claim.js');
const archiveSource = read('services', 'winnerArchiveService.ts');
const leaderboardSql = read('supabase', 'leaderboard.sql');
const readinessSql = read('supabase', 'base-native-readiness.sql');

test('the server snapshots the validated proposal image with the weekly-leading run', () => {
  assert.match(eligibilitySource, /imageUrl:\s*asHttpUrl\(content\.image_url\)/);
  assert.match(leaderboardSource, /proposal_image_url:\s*proposal\.imageUrl/);
  assert.match(leaderboardSource, /proposalImageUrl:\s*row\.proposal_image_url/);
});

test('finalization and late claims carry the same image into the winner archive', () => {
  assert.match(competitionSource, /proposal_image_url:\s*winner\.proposal_image_url/);
  assert.match(claimSource, /proposal_image_url:\s*proposal\.imageUrl/);
  assert.match(archiveSource, /proposalImageUrl:\s*safeUrl\(winner\.proposal_image_url\)/);
});

test('database migrations add durable image columns to leaderboard and weekly competitions', () => {
  assert.match(leaderboardSql, /scicon_leaderboard[\s\S]*proposal_image_url text/);
  assert.match(readinessSql, /scicon_weekly_competitions[\s\S]*proposal_image_url text/);
  assert.match(readinessSql, /alter table public\.scicon_weekly_competitions[\s\S]*add column if not exists proposal_image_url text/);
});

test('API writes retain a no-image compatibility path during migration rollout', () => {
  assert.match(leaderboardSource, /VERIFIED_SUPABASE_SELECT/);
  assert.match(leaderboardSource, /proposal_image_url:\s*_proposalImageUrl/);
  assert.match(competitionSource, /proposal_image_url:\s*_proposalImageUrl/);
  assert.match(claimSource, /proposal_image_url:\s*_proposalImageUrl/);
});
