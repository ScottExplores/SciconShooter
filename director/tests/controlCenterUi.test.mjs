import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const directorRoot = path.resolve(testDirectory, '..');
const read = (...segments) => readFile(path.join(directorRoot, ...segments), 'utf8');

test('Control Center report and project screens are local, read only, and owner friendly', async () => {
  const [api, reports, project, overview] = await Promise.all([
    read('src', 'api', 'controlCenter.ts'),
    read('src', 'tools', 'PlayerReportInbox.tsx'),
    read('src', 'tools', 'ProjectGuide.tsx'),
    read('src', 'tools', 'HubOverview.tsx')
  ]);

  assert.match(api, /\/__director\/api\/v1\/player-reports/);
  assert.match(api, /\/__director\/api\/v1\/project-status/);
  assert.match(reports, /Copy for Codex/);
  assert.match(reports, /No reports match these filters/);
  assert.match(reports, /Never paste a[\s\S]*database key into this page/);
  assert.doesNotMatch(reports, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(reports, /method:\s*['"](?:POST|PUT|PATCH|DELETE)/);
  assert.match(project, /Start here next time/);
  assert.match(project, /Copy context for Codex/);
  assert.match(overview, /Everything you need to pick the project back up/);
});
