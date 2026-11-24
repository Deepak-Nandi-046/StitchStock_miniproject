const db = require('../db');
const orderController = require('./orderController');
const store = require('../db/returnRequestStore');
const { recordAudit } = require('../engines/e3-audit');

exports.create = async (req, res) => {
  const body = req.body || {};
  const order = db.orders.find(item =>
    String(item.id) === String(body.orderId) && item.customerId === req.user.id
  );
  if (!order) return res.status(404).json({ error: 'Order not found in your current orders.' });
  const type = body.type;
  if ((type === 'Cancellation' && !['Placed', 'Confirmed'].includes(order.status)) ||
      (type === 'Return' && order.status !== 'Delivered') ||
      !['Cancellation', 'Return'].includes(type))
    return res.status(409).json({ error: 'This order is not eligible for that request.' });
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > 1000)
    return res.status(400).json({ error: 'Add a reason up to 1,000 characters.' });

  const product = db.products.find(item => item.id === order.productId);
  const request = await store.create({
    orderId: order.id,
    customerId: req.user.id,
    customerName: order.customerName || req.user.name,
    customerEmail: order.customerEmail || req.user.email || '',
    type,
    productName: product ? product.name : 'Handmade item',
    quantity: order.qty,
    orderStatus: order.status,
    message,
  });
  if (request.error) return res.status(409).json({ error: request.error });
  await recordAudit({ actor: req.user.id, action: 'RETURN_REQUEST_CREATED', entity: 'return', entityId: request.id });
  res.status(201).json(request);
};

exports.mine = async (req, res) => res.json(await store.listForCustomer(req.user.id));
exports.list = async (req, res) => res.json(await store.listAll());

exports.update = async (req, res) => {
  const status = req.body && req.body.status;
  if (!['Under Review', 'Approved', 'Rejected', 'Completed'].includes(status))
    return res.status(400).json({ error: 'Choose a valid return or cancellation status.' });
  const requests = await store.listAll();
  const request = requests.find(item => item.id === req.params.requestId);
  if (!request) return res.status(404).json({ error: 'Request not found.' });
  if (request.type === 'Cancellation' && status === 'Approved') {
    const result = await orderController.cancelConfirmedOrder(request.orderId, req.user.id);
    if (result.error) return res.status(result.status).json({ error: result.error });
  }
  const updated = await store.update(request.id, status);
  await recordAudit({
    actor: req.user.id,
    action: 'RETURN_REQUEST_UPDATED',
    entity: 'return',
    entityId: updated.id,
    details: { status },
  });
  res.json(updated);
};
