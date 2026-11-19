const crypto = require('crypto');
const SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const b64 = b => Buffer.from(b).toString('base64url');
const sig = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');

function sign(payload, ttlSec = 8 * 3600) {
  const body = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec }));
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  return `${head}.${body}.${sig(head + '.' + body)}`;
}
function verify(token) {
  const [h, b, s] = String(token || '').split('.');
  if (!h || !b || !s) return null;
  const good = Buffer.from(sig(h + '.' + b)), got = Buffer.from(s);
  if (good.length !== got.length || !crypto.timingSafeEqual(good, got)) return null;
  const p = JSON.parse(Buffer.from(b, 'base64url').toString());
  return p.exp > Date.now() / 1000 ? p : null;
}
module.exports = { sign, verify };