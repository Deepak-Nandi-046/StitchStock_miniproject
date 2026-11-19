const tails = new Map();
async function withLock(key, fn) {           // simple promise-chain mutex
  const prev = tails.get(key) || Promise.resolve();
  let release; const next = new Promise(r => (release = r));
  tails.set(key, prev.then(() => next));
  await prev;
  try { return await fn(); } finally { release(); }
}
async function runInTransaction(fn) { return fn(null); } // TODO real BEGIN/COMMIT
module.exports = { withLock, runInTransaction };