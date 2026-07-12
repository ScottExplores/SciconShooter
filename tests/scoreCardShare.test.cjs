const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '../services/scoreCardShareService.ts'),
  'utf8'
);

test('sharing converts the canonical SVG to PNG and prefers copying that image', () => {
  const clipboardBranch = source.indexOf('navigator.clipboard?.write');
  const nativeShareBranch = source.indexOf('if (canShareFile)');

  assert.match(source, /const response = await fetch\(cardUrl/);
  assert.match(source, /new ClipboardItem\(\{ 'image\/png': pngBlob \}\)/);
  assert.ok(clipboardBranch >= 0 && clipboardBranch < nativeShareBranch);
});
