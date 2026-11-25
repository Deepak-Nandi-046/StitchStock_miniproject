// E2 – OS: mutual exclusion + real database transactions.
const { getClient } = require('../../db/pool');

const tails = new Map();
async function withLock(key, fn) {           // simple promise-chain mutex (one Node process)
  const prev = tails.get(key) || Promise.resolve();
  let release; const next = new Promise(r => (release = r));
  tails.set(key, prev.then(() => next));
  await prev;
  try { return await fn(); } finally { release(); }
}

const RETRYABLE = new Set(['40P01', '40001']);   // deadlock_detected, serialization_failure
const MAX_ATTEMPTS = 3;

// runInTransaction(async conn => ...) -> result of fn. BEGIN / COMMIT / ROLLBACK + deadlock retry.
async function runInTransaction(fn) {
  for (let attempt = 1; ; attempt++) {
    const conn = await getClient();
    try {
      await conn.query('BEGIN');
      const result = await fn(conn);
      await conn.query('COMMIT');
      return result;
    } catch (error) {
      await conn.query('ROLLBACK').catch(() => {});
      if (RETRYABLE.has(error.code) && attempt < MAX_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, 50 * attempt));
        continue;
      }
      throw error;
    } finally {
      conn.release();
    }
  }
}
module.exports = { withLock, runInTransaction };
