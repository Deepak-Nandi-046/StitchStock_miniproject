const queues = new Map(); let nextId = 1;
function q(p) { if (!queues.has(p)) queues.set(p, []); return queues.get(p); }
function enqueuePreorder({ productId, customerId, qty, preorderId }) {
  const id = preorderId == null ? nextId : Number(preorderId);
  nextId = Math.max(nextId, id + 1);
  const item = { preorderId: id, customerId, qty };
  q(productId).push(item);
  return { preorderId: item.preorderId, queuePosition: q(productId).length };
}
function allocateNext(productId) { return q(productId).shift() || null; }
function removePreorder(productId, preorderId) {
  const queue = q(productId);
  const index = queue.findIndex(item => String(item.preorderId) === String(preorderId));
  if (index < 0) return null;
  return queue.splice(index, 1)[0];
}
function getQueue(productId) { return q(productId).map((x, i) => ({ ...x, position: i + 1 })); }
function restorePreorders(orders) {
  queues.clear();
  nextId = 1;
  orders.forEach(order => {
    if (order.isPreorder && Number.isInteger(Number(order.preorderId)))
      nextId = Math.max(nextId, Number(order.preorderId) + 1);
  });
  const pending = orders
    .filter(order => order.isPreorder && ['Pending', 'Confirmed'].includes(order.preorderStatus))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  pending.forEach(order => {
    const queued = enqueuePreorder({
      productId: order.productId,
      customerId: order.customerId,
      qty: order.qty,
      preorderId: order.preorderId,
    });
    order.preorderId = queued.preorderId;
    order.queuePosition = queued.queuePosition;
  });
}
function clearQueues() { queues.clear(); nextId = 1; }
module.exports = { enqueuePreorder, allocateNext, removePreorder, getQueue, restorePreorders, clearQueues };