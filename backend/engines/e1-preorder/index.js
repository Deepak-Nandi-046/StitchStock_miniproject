const queues = new Map(); let nextId = 1;
function q(p) { if (!queues.has(p)) queues.set(p, []); return queues.get(p); }
function enqueuePreorder({ productId, customerId, qty }) {
  const item = { preorderId: nextId++, customerId, qty };
  q(productId).push(item);
  return { preorderId: item.preorderId, queuePosition: q(productId).length };
}
function allocateNext(productId) { return q(productId).shift() || null; }
function getQueue(productId) { return q(productId).map((x, i) => ({ ...x, position: i + 1 })); }
module.exports = { enqueuePreorder, allocateNext, getQueue };