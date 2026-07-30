const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('Campaign Test Boss promotion is deterministic and current', () => {
  const result = spawnSync(
    process.execPath,
    ['tools/promote-test-bosses-to-campaign.mjs', '--check'],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 60_000
    }
  );

  assert.equal(
    result.status,
    0,
    `${result.stdout}\n${result.stderr}`
  );
  assert.match(result.stdout, /Campaign Test Boss promotion is current/);
});
