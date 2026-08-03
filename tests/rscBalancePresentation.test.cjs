const test = require('node:test');
const assert = require('node:assert/strict');

test('wallet RSC balance presentation truncates fractions and groups whole units', async () => {
  const { formatWholeRscBalance } = await import('../services/rscBalancePresentation.ts');

  assert.equal(formatWholeRscBalance({
    raw: 54_432_000_000_000_000_000n,
    decimals: 18
  }), '54');
  assert.equal(formatWholeRscBalance({
    raw: 54_321_999_999_999_999_999_999n,
    decimals: 18
  }), '54,321');
  assert.equal(formatWholeRscBalance({
    raw: 12_345n,
    decimals: 0
  }), '12,345');
});
