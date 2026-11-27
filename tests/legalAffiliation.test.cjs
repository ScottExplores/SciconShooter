const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Terms of Use & Privacy has a dedicated ResearchHub non-affiliation section', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'components', 'StartScreen.tsx'), 'utf8');
  assert.match(source, /data-legal-affiliation="true"/);
  assert.match(source, /Not affiliated with ResearchHub/);
  assert.match(source, /community-driven, open-source project\. It is not affiliated with, endorsed by, or an official product of ResearchHub\./);
});
