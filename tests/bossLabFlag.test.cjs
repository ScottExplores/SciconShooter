const assert = require('node:assert/strict');
const test = require('node:test');

const loadFlag = async () => import('../services/gameplay/bossLabFlag.mjs');

test('boss lab query flag is off unless bosslab is present', async () => {
  const { isBossLabQueryEnabled } = await loadFlag();
  assert.equal(isBossLabQueryEnabled(''), false);
  assert.equal(isBossLabQueryEnabled('?view=campaign-map'), false);
  assert.equal(isBossLabQueryEnabled('?boss=lab'), false);
  assert.equal(isBossLabQueryEnabled('?bosslab'), true);
  assert.equal(isBossLabQueryEnabled('?bosslab='), true);
  assert.equal(isBossLabQueryEnabled('?display=mobile-frame&bosslab=1'), true);
});

test('boss lab dev key is Ctrl+Shift+B and ignores typing targets', async () => {
  const { isBossLabDevKey } = await loadFlag();
  const input = { tagName: 'INPUT', isContentEditable: false };
  const editable = { tagName: 'DIV', isContentEditable: true };

  assert.equal(isBossLabDevKey({
    ctrlKey: true,
    shiftKey: true,
    altKey: false,
    metaKey: false,
    code: 'KeyB',
    key: 'B',
    target: { tagName: 'BODY', isContentEditable: false }
  }), true);
  assert.equal(isBossLabDevKey({
    ctrlKey: false,
    shiftKey: true,
    altKey: false,
    metaKey: false,
    code: 'KeyB',
    key: 'b',
    target: { tagName: 'BODY', isContentEditable: false }
  }), false);
  assert.equal(isBossLabDevKey({
    ctrlKey: true,
    shiftKey: true,
    altKey: true,
    metaKey: false,
    code: 'KeyB',
    key: 'B',
    target: { tagName: 'BODY', isContentEditable: false }
  }), false);
  assert.equal(isBossLabDevKey({
    ctrlKey: true,
    shiftKey: true,
    altKey: false,
    metaKey: false,
    code: 'KeyB',
    key: 'B',
    target: input
  }), false);
  assert.equal(isBossLabDevKey({
    ctrlKey: true,
    shiftKey: true,
    altKey: false,
    metaKey: false,
    code: 'KeyC',
    key: 'b',
    target: editable
  }), false);
});
