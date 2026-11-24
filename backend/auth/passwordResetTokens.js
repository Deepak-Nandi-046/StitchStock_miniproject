const crypto = require('crypto');

const TOKEN_TTL_MS = 15 * 60 * 1000;
const tokens = new Map();

const digest = token => crypto.createHash('sha256').update(token).digest('hex');

function removeExpired(now = Date.now()) {
  for (const [key, record] of tokens) {
    if (record.expiresAt <= now) tokens.delete(key);
  }
}

function issue({ userId, role, provider }) {
  removeExpired();
  for (const [key, record] of tokens) {
    if (record.userId === userId) tokens.delete(key);
  }
  const token = crypto.randomBytes(32).toString('hex');
  tokens.set(digest(token), {
    userId,
    role,
    provider,
    expiresAt: Date.now() + TOKEN_TTL_MS,
    reserved: false,
  });
  return token;
}

function reserve(token, role) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  removeExpired();
  const record = tokens.get(digest(token));
  if (!record || record.role !== role || record.reserved) return null;
  record.reserved = true;
  return { userId: record.userId, role: record.role, provider: record.provider };
}

function finish(token, succeeded) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return;
  const key = digest(token);
  const record = tokens.get(key);
  if (!record) return;
  if (succeeded) tokens.delete(key);
  else record.reserved = false;
}

function revoke(token) {
  if (typeof token === 'string' && /^[a-f0-9]{64}$/.test(token))
    tokens.delete(digest(token));
}

module.exports = { issue, reserve, finish, revoke };
