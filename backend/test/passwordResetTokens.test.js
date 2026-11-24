const test = require('node:test');
const assert = require('node:assert/strict');
const resetTokens = require('../auth/passwordResetTokens');

test('reset token is role-bound, expires, and cannot be reused', () => {
  const originalNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    const token = resetTokens.issue({ userId: 'customer-1', role: 'customer', provider: 'local' });
    assert.match(token, /^[a-f0-9]{64}$/);
    assert.equal(resetTokens.reserve(token, 'owner'), null);
    assert.deepEqual(resetTokens.reserve(token, 'customer'), {
      userId: 'customer-1',
      role: 'customer',
      provider: 'local',
    });
    assert.equal(resetTokens.reserve(token, 'customer'), null);
    resetTokens.finish(token, true);
    assert.equal(resetTokens.reserve(token, 'customer'), null);

    const expiringToken = resetTokens.issue({ userId: 'customer-2', role: 'customer', provider: 'local' });
    now += 15 * 60 * 1000;
    assert.equal(resetTokens.reserve(expiringToken, 'customer'), null);
  } finally {
    Date.now = originalNow;
  }
});

test('a failed password update can retry its reserved token', () => {
  const token = resetTokens.issue({ userId: 'owner-1', role: 'owner', provider: 'local' });
  assert.ok(resetTokens.reserve(token, 'owner'));
  resetTokens.finish(token, false);
  assert.ok(resetTokens.reserve(token, 'owner'));
  resetTokens.finish(token, true);
});
