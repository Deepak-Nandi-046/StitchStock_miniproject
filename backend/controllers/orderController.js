const db = require('../db');
const { supabase } = require('../db/supabase');
const { enqueuePreorder, allocateNext, getQueue } = require('../engines/e1-preorder');
const { withLock, runInTransaction } = require('../engines/e2-safety');
const { recordAudit, listAudit } = require('../engines/e3-audit');

// Allowed status moves (owner). Confirm the cancellation rule with the team.
const NEXT = {
  'Confirmed': ['Payment Completed', 'Cancelled'],
  'In Production': ['Ready for Balance Payment'],
  'Ready for Balance Payment': ['Payment Completed'],
  'Payment Completed': ['Shipped'],
};
const lockKey = id => 'product:' + id;

exports.listProducts = async (req, res) => {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('id', { ascending: true });
  if (error) {
    console.error('Supabase product read failed:', error.message);
    return res.json(db.products);
  }
  db.products.splice(0, db.products.length, ...(data || []));
  res.json(db.products);
};

exports.placeOrder = async (req, res) => {
  const { productId, qty = 1 } = req.body || {};
  const p = db.products.find(x => x.id === productId);
  if (!p || !Number.isInteger(qty) || qty < 1 || qty > 20) return res.status(400).json({ error: 'Invalid request' });
  const customerId = req.user.id;
  const order = await withLock(lockKey(productId), () =>
    runInTransaction(async () => {
      const o = { id: db.orders.length + 1, productId, customerId, qty, createdAt: new Date().toISOString() };
      if (p.stock >= qty) { p.stock -= qty; o.status = 'Confirmed'; }
      else { Object.assign(o, enqueuePreorder({ productId, customerId, qty }), { status: 'Pre-order Queued' }); }
      db.orders.push(o);
      await recordAudit({ actor: customerId, action: o.status === 'Confirmed' ? 'ORDER_CONFIRMED' : 'PREORDER_QUEUED',
                          entity: 'order', entityId: o.id, details: { productId, qty } });
      return o;
    }));
  res.status(201).json(order);
};

exports.myOrders = (req, res) =>
  res.json(db.orders.filter(o => o.customerId === req.user.id).reverse());

// ---------- owner ----------
exports.summary = async (req, res) => {
  res.json({
    products: db.products.map(p => ({ ...p, queue: getQueue(p.id).length })),
    orders: [...db.orders].reverse(),
    audit: await listAudit(30),
    nextMoves: NEXT,
  });
};
exports.queue = (req, res) => res.json(getQueue(Number(req.params.productId)));

exports.restock = async (req, res) => {
  const id = Number(req.params.productId), add = req.body && req.body.add;
  const p = db.products.find(x => x.id === id);
  if (!p || !Number.isInteger(add) || add < 1) return res.status(400).json({ error: 'Invalid request' });
  const out = await withLock(lockKey(id), async () => {
    p.stock += add;
    const { error } = await supabase
      .from('products')
      .update({ stock: p.stock })
      .eq('id', id);
    if (error) throw error;
    await recordAudit({ actor: req.user.id, action: 'RESTOCK', entity: 'product', entityId: id, details: { add } });
    return p;
  });
  res.json(out);
};

exports.allocate = async (req, res) => {
  const id = Number(req.params.productId);
  const result = await withLock(lockKey(id), async () => {
    const next = allocateNext(id);
    if (!next) return null;
    const o = db.orders.find(x => x.preorderId === next.preorderId);
    if (o) o.status = 'In Production';
    await recordAudit({ actor: req.user.id, action: 'ALLOCATED', entity: 'order', entityId: o && o.id });
    return o;
  });
  if (!result) return res.status(404).json({ error: 'Queue is empty' });
  res.json(result);
};

exports.setStatus = async (req, res) => {
  const o = db.orders.find(x => x.id === Number(req.params.orderId));
  const to = req.body && req.body.status;
  if (!o) return res.status(404).json({ error: 'Order not found' });
  if (!(NEXT[o.status] || []).includes(to))
    return res.status(409).json({ error: `Cannot move from "${o.status}" to "${to}"` });
  await withLock(lockKey(o.productId), async () => {
    if (to === 'Cancelled') db.products.find(p => p.id === o.productId).stock += o.qty;
    await recordAudit({ actor: req.user.id, action: 'STATUS_CHANGED', entity: 'order', entityId: o.id, details: { from: o.status, to } });
    o.status = to;
  });
  res.json(o);
};