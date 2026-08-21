const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.resolve(__dirname, '../services/xScoreShareService.ts'),
  'utf8'
);
const previewSource = fs.readFileSync(
  path.resolve(__dirname, '../components/MissionRecordPreview.tsx'),
  'utf8'
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS
  }
});
const moduleScope = { exports: {} };
vm.runInNewContext(compiled.outputText, {
  module: moduleScope,
  exports: moduleScope.exports,
  URL,
  Number,
  Math
});

test('score share builds a bounded X intent with an attributed game URL', () => {
  const intent = new URL(moduleScope.exports.buildXScoreShareUrl({ score: 12345.9, wave: 7 }));
  assert.equal(intent.origin, 'https://x.com');
  assert.equal(intent.pathname, '/intent/post');
  assert.equal(intent.searchParams.get('text'), 'I scored 12,345 in Scicon Shooter and reached Wave 7. Beat it.');

  const gameUrl = new URL(intent.searchParams.get('url'));
  assert.equal(gameUrl.origin, 'https://www.sciconshooter.xyz');
  assert.equal(gameUrl.searchParams.get('utm_source'), 'x');
  assert.equal(gameUrl.searchParams.get('utm_medium'), 'social');
  assert.equal(gameUrl.searchParams.get('utm_campaign'), 'player-score-share');
  assert.equal(gameUrl.searchParams.get('utm_content'), 'mission-record');
  assert.match(previewSource, /onClick=\{shareScoreToX\}[\s\S]*?Post score on X/);
  assert.match(previewSource, /method: 'x_intent'/);
});
