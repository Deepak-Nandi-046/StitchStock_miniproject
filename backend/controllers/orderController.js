const crypto = require('crypto');
const productStore = require('../db/productStore');
const orderStore = require('../db/orderStore');
const storage = require('../db/storage');
const { isUuid } = require('../db/customerStore');
const { enqueuePreorder, removePreorder, getQueue } = require('../engines/e1-preorder');
const { withLock, runInTransaction } = require('../engines/e2-safety');
const { recordAudit, listAudit } = require('../engines/e3-audit');

const NEXT = {
  Placed: ['Confirmed', 'Cancelled'],
  Confirmed: ['Preparing', 'Cancelled'],
  Preparing: ['Shipped', 'Cancelled'],
  'Shipped': ['Delivered'],
  Delivered: [],
};
const lockKey = id => 'product:' + id;
const PROOF_BUCKET = 'payment-proofs';
const EXTENSIONS = { jpeg: 'jpg', png: 'png', webp: 'webp' };

function validatePaymentSubmission(input, totalAmount) {
  const payment = input || {};
  const reference = typeof payment.reference === 'string' ? payment.reference.trim() : '';
  const amountPaid = payment.amountPaid === undefined ? totalAmount : Number(payment.amountPaid);
  const proofValue = payment.proof || '';
  let proofBuffer = null;
  let proofType = '';
  if (proofValue) {
    const match = typeof proofValue === 'string'
      ? proofValue.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/)
      : null;
    if (!match) return { error: 'Payment proof must be a JPG, PNG, or WebP image.' };
    const image = Buffer.from(match[2], 'base64');
    if (!image.length || image.length > 2 * 1024 * 1024)
      return { error: 'Payment proof must be 2 MB or smaller.' };
    proofBuffer = image;
    proofType = match[1];
  }
  if (reference.length > 120 || !Number.isFinite(amountPaid) || amountPaid <= 0 ||
      (!reference && !proofBuffer))
    return { error: 'Enter the amount paid and a transaction reference or payment screenshot.' };
  return {
    value: {
      method: typeof payment.method === 'string' ? payment.method.trim().slice(0, 40) || 'UPI' : 'UPI',
      reference,
      amountPaid,
      proofBuffer,
      proofType,
    },
  };
}

// Uploads the screenshot to the private Storage bucket and returns its path.
// Uploads the screenshot to the private Storage bucket and returns its path.
// If storage is unavailable the order is still placed using the transaction reference.
async function saveProof(customerId, value) {
  if (!value.proofBuffer) return null;
  const path = `${customerId}/${crypto.randomUUID()}.${EXTENSIONS[value.proofType]}`;
  const send = () => storage.upload(PROOF_BUCKET, path, value.proofBuffer, `image/${value.proofType}`);
  try {
    await send();
    return path;
  } catch (first) {
    try {
      await storage.ensureBucket(PROOF_BUCKET);   // bucket may simply not exist yet
      await send();
      return path;
    } catch (error) {
      console.error('Payment proof upload failed:', error.message || first.message);
      if (!value.reference)
        throw Object.assign(new Error('Could not store the payment screenshot. Please enter the transaction reference and try again.'), { status: 503 });
      return null;                                  // reference is enough for the admin to verify
    }
  }
}

const discardProof = path => (path ? storage.remove(PROOF_BUCKET, [path]) : null);

function isValidDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

exports.listProducts = async (req, res) => {
  res.json(await productStore.list());
};

exports.placeOrder = async (req, res) => {
  const body = req.body || {};
  const { productId, qty = 1, color, giftWrap = false, giftMessage = '' } = body;
  const p = await productStore.getById(productId);
  if (!p || !p.is_active || !Number.isInteger(qty) || qty < 1 || qty > 20)
    return res.status(400).json({ error: 'Invalid request' });
  if (typeof giftWrap !== 'boolean' || typeof giftMessage !== 'string' || giftMessage.length > 300)
    return res.status(400).json({ error: 'Invalid gift options' });
  const deliveryDetails = body.deliveryDetails;
  if (deliveryDetails != null && (
    typeof deliveryDetails.name !== 'string' || !deliveryDetails.name.trim() ||
    typeof deliveryDetails.phone !== 'string' || !/^[0-9]{10}$/.test(deliveryDetails.phone) ||
    typeof deliveryDetails.address !== 'string' || !deliveryDetails.address.trim() ||
    typeof deliveryDetails.pincode !== 'string' || !/^[0-9]{6}$/.test(deliveryDetails.pincode)
  )) return res.status(400).json({ error: 'Enter valid delivery details.' });
  let paymentSubmission = null;
  if (body.paymentSubmission) {
    const validated = validatePaymentSubmission(body.paymentSubmission, Number(p.price) * qty);
    if (validated.error) return res.status(400).json({ error: validated.error });
    paymentSubmission = validated.value;
  }
  const customerId = req.user.id;
  if (!isUuid(customerId))
    return res.status(403).json({ error: 'Please log in with a registered account to place orders.' });

  const proofPath = paymentSubmission ? await saveProof(customerId, paymentSubmission) : null;
  let created;
  try {
    created = await withLock(lockKey(p.id), () => runInTransaction(async conn => {
      const product = await productStore.getById(p.id, conn, true);      // row-locks the inventory
      const inStock = product.stock >= qty;
      const status = inStock ? 'Placed' : 'Pre-order Pending';
      const orderId = await orderStore.insertOrder(conn, {
        customerId, productId: product.id, qty,
        unitPrice: Number(product.price),
        totalAmount: Number(product.price) * qty,
        status, stockReserved: inStock,
        color: typeof color === 'string' ? color.slice(0, 40) : '',
        giftWrap, giftMessage: giftWrap ? giftMessage.trim() : '',
        delivery: deliveryDetails ? {
          name: deliveryDetails.name.trim().slice(0, 100),
          phone: deliveryDetails.phone,
          address: deliveryDetails.address.trim().slice(0, 500),
          pincode: deliveryDetails.pincode,
        } : null,
      });
      let preorderId = null;
      if (inStock) {
        await productStore.adjustStock(product.id, -qty, conn);
        await orderStore.addUpdate(conn, orderId, 'Your order was placed and is waiting for confirmation.');
      } else {
        preorderId = await orderStore.insertPreorder(conn, { customerId, productId: product.id, orderId, qty });
        await orderStore.addUpdate(conn, orderId, 'Your pre-order was received and is waiting for confirmation.', 'Pre-order update');
      }
      await orderStore.addHistory(conn, orderId, status);
      if (paymentSubmission) await orderStore.insertPayment(conn, orderId, { ...paymentSubmission, proofPath });
      await recordAudit({
        actor: customerId, action: inStock ? 'ORDER_PLACED' : 'PREORDER_PLACED',
        entity: 'order', entityId: orderId, details: { productId: product.id, qty },
      }, conn);
      return { orderId, preorderId, productId: product.id };
    }));
  } catch (error) {
    await discardProof(proofPath);
    throw error;
  }
  // E1 keeps the FIFO queue in memory; update it only after the DB commit succeeded.
  if (created.preorderId)
    enqueuePreorder({ productId: created.productId, customerId, qty, preorderId: created.preorderId });
  res.status(201).json(await orderStore.getById(created.orderId));
};

exports.myOrders = async (req, res) => res.json(await orderStore.listForCustomer(req.user.id));

// ---------- owner ----------
exports.summary = async (req, res) => {
  const [products, orders, audit] = await Promise.all([
    productStore.list({ includeInactive: true }), orderStore.listAll(), listAudit(30),
  ]);
  res.json({
    products: products.map(p => ({ ...p, queue: getQueue(p.id).length })),
    orders,
    audit,
    nextMoves: NEXT,
  });
};

exports.submitPayment = async (req, res) => {
  const order = await orderStore.getById(req.params.orderId);
  if (!order || String(order.customerId) !== String(req.user.id))
    return res.status(404).json({ error: 'Order not found.' });
  if (order.paymentStatus === 'Verified / Paid')
    return res.status(409).json({ error: 'This order payment has already been verified.' });
  const validated = validatePaymentSubmission(req.body, Number(order.totalAmount));
  if (validated.error) return res.status(400).json({ error: validated.error });

  const proofPath = await saveProof(req.user.id, validated.value);
  let result;
  try {
    result = await runInTransaction(async conn => {
      await orderStore.lockOrder(conn, order.id);
      const latest = await orderStore.latestPayment(conn, order.id);
      if (latest && latest.payment_status === 'Verified / Paid')
        return { error: 'This order payment has already been verified.', status: 409 };
      await orderStore.insertPayment(conn, order.id, { ...validated.value, proofPath });
      await orderStore.addUpdate(conn, order.id, 'Payment submitted and awaiting admin verification.', 'Payment update');
      return {};
    });
  } catch (error) {
    await discardProof(proofPath);
    throw error;
  }
  if (result.error) {
    await discardProof(proofPath);
    return res.status(result.status).json({ error: result.error });
  }
  res.json(await orderStore.getById(order.id));
};

exports.verifyPayment = async (req, res) => {
  const order = await orderStore.getById(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const body = req.body || {};
  if (!['approve', 'reject'].includes(body.action))
    return res.status(400).json({ error: 'Choose approve or reject.' });
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (body.action === 'reject' && (!reason || reason.length > 500))
    return res.status(400).json({ error: 'Add a rejection reason of up to 500 characters.' });

  const approve = body.action === 'approve';
  const result = await runInTransaction(async conn => {
    await orderStore.lockOrder(conn, order.id);
    const latest = await orderStore.latestPayment(conn, order.id);
    if (!latest || latest.payment_status !== 'Awaiting Verification')
      return { error: 'This order has no payment awaiting verification.', status: 409 };
    await orderStore.reviewPayment(conn, latest.payment_id, {
      status: approve ? 'Verified / Paid' : 'Rejected', reason: approve ? null : reason,
    });
    if (approve) await orderStore.setOrderFields(conn, order.id, { paidAmount: latest.amount });
    await orderStore.addUpdate(conn, order.id, approve
      ? 'Payment Verified / Paid. Your order can proceed to processing.'
      : `Payment rejected: ${reason}. Please update your payment details and submit again.`, 'Payment update');
    await recordAudit({
      actor: req.user.id, action: approve ? 'PAYMENT_VERIFIED' : 'PAYMENT_REJECTED',
      entity: 'order', entityId: order.id, details: approve ? {} : { reason },
    }, conn);
    return {};
  });
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(await orderStore.getById(order.id));
};

exports.addProduct = async (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const price = Number(body.price);
  const stock = Number(body.stock);
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const imageUrl = typeof body.image_url === 'string' ? body.image_url.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';

  if (!name || !Number.isFinite(price) || price < 0 ||
      !Number.isInteger(stock) || stock < 0) {
    return res.status(400).json({ error: 'Name, valid price, and valid stock are required' });
  }
  const added = await productStore.create({ name, price, stock, category, image_url: imageUrl, description });
  await recordAudit({
    actor: req.user.id, action: 'PRODUCT_ADDED', entity: 'product', entityId: added.id,
    details: { name, stock, price },
  });
  res.status(201).json(added);
};

exports.queue = (req, res) => res.json(getQueue(Number(req.params.productId)));

exports.restock = async (req, res) => {
  const id = Number(req.params.productId), add = req.body && req.body.add;
  const p = await productStore.getById(id);
  if (!p || !Number.isInteger(add) || add < 1) return res.status(400).json({ error: 'Invalid request' });
  await withLock(lockKey(id), () => runInTransaction(async conn => {
    await productStore.getById(id, conn, true);
    await productStore.adjustStock(id, add, conn);
    await recordAudit({ actor: req.user.id, action: 'RESTOCK', entity: 'product', entityId: id, details: { add } }, conn);
  }));
  res.json(await productStore.getById(id));
};

exports.reduceStock = async (req, res) => {
  const id = Number(req.params.productId), remove = req.body && req.body.remove;
  const p = await productStore.getById(id);
  if (!p || !Number.isInteger(remove) || remove < 1) return res.status(400).json({ error: 'Invalid request' });
  const result = await withLock(lockKey(id), () => runInTransaction(async conn => {
    await productStore.getById(id, conn, true);
    const left = await productStore.adjustStock(id, -remove, conn);
    if (left === null) return { error: `Only ${p.stock} in stock; cannot remove ${remove}.` };
    await recordAudit({ actor: req.user.id, action: 'STOCK_REDUCED', entity: 'product', entityId: id, details: { remove } }, conn);
    return {};
  }));
  if (result.error) return res.status(409).json({ error: result.error });
  res.json(await productStore.getById(id));
};

exports.deleteProduct = async (req, res) => {
  const id = Number(req.params.productId);
  const p = await productStore.getById(id);
  if (!p || !p.is_active) return res.status(404).json({ error: 'Product not found' });
  await productStore.deactivate(id);
  await recordAudit({
    actor: req.user.id, action: 'PRODUCT_DELETED', entity: 'product', entityId: id,
    details: { name: p.name },
  });
  res.json({ ok: true, id });
};

async function makePreorderReady(orderRef, actor) {
  const first = await orderStore.getById(orderRef);
  if (!first) return { error: 'Pre-order not found.', status: 404 };
  const result = await withLock(lockKey(first.productId), () => runInTransaction(async conn => {
    const product = await productStore.getById(first.productId, conn, true);
    if (!product) return { error: 'Product not found.', status: 404 };
    await orderStore.lockOrder(conn, first.id);
    const order = await orderStore.getById(first.id, conn);
    if (!order.isPreorder || order.preorderStatus !== 'Confirmed')
      return { error: 'Confirm this pre-order before marking it ready.', status: 409 };
    if (Number(product.stock) < order.qty)
      return { error: `Only ${product.stock} item(s) are in stock; ${order.qty} are required.`, status: 409 };

    await productStore.adjustStock(product.id, -order.qty, conn);
    await orderStore.setPreorder(conn, order.id, { eligibility: 'Confirmed', allocation: 'Allocated', readyAt: new Date() });
    await orderStore.setOrderFields(conn, order.id, { status: 'Preparing', stockReserved: true });
    await orderStore.addHistory(conn, order.id, 'Preparing');
    await orderStore.addUpdate(conn, order.id, `${order.productName} is available and preparation has started.`, 'Pre-order available');
    await recordAudit({ actor, action: 'PREORDER_READY', entity: 'order', entityId: order.id }, conn);
    return { productId: order.productId, preorderId: order.preorderId };
  }));
  if (result.error) return result;
  removePreorder(result.productId, result.preorderId);     // leaves the E1 queue only after commit
  return { order: await orderStore.getById(first.id) };
}

exports.allocate = async (req, res) => {
  const productId = Number(req.params.productId);
  const queue = getQueue(productId);                        // E1 decides FIFO order
  const confirmed = await orderStore.confirmedFromQueue(queue.map(item => item.preorderId));
  const nextOrderId = queue.map(item => confirmed.get(item.preorderId)).find(Boolean);
  if (!nextOrderId) return res.status(409).json({ error: 'There are no confirmed pre-orders waiting for this product.' });
  const result = await makePreorderReady(nextOrderId, req.user.id);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result.order);
};

exports.updateOrder = async (req, res) => {
  const order = await orderStore.getById(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.isPreorder && order.preorderStatus !== 'Available')
    return res.status(409).json({ error: 'Manage this order from Pre-orders.' });

  const body = req.body || {};
  const status = body.status;
  if (body.paymentStatus !== undefined)
    return res.status(400).json({ error: 'Payments must be approved or rejected in Payment Verification.' });
  const trackingNumber = body.trackingNumber;
  const carrier = body.carrier;
  if (status && !['Placed', 'Confirmed', 'Preparing', 'Shipped', 'Delivered', 'Cancelled'].includes(status))
    return res.status(400).json({ error: 'Choose a valid order status.' });
  if (status && status !== order.status && !(NEXT[order.status] || []).includes(status))
    return res.status(409).json({ error: `Cannot move from "${order.status}" to "${status}".` });
  if (status && status !== order.status && status !== 'Cancelled' && order.paymentStatus !== 'Verified / Paid')
    return res.status(409).json({ error: 'Verify the payment before moving this order into processing.' });
  if (trackingNumber !== undefined &&
      (typeof trackingNumber !== 'string' || trackingNumber.trim().length > 120))
    return res.status(400).json({ error: 'Tracking number must be 120 characters or fewer.' });
  if (carrier !== undefined && (typeof carrier !== 'string' || carrier.trim().length > 80))
    return res.status(400).json({ error: 'Carrier must be 80 characters or fewer.' });

  if (status === 'Cancelled' && order.status !== 'Cancelled') {
    const result = await exports.cancelConfirmedOrder(order.id, req.user.id);
    if (result.error) return res.status(result.status).json({ error: result.error });
  }

  await runInTransaction(async conn => {
    await orderStore.lockOrder(conn, order.id);
    if (status && status !== order.status && status !== 'Cancelled') {
      await orderStore.setOrderFields(conn, order.id, { status });
      await orderStore.addHistory(conn, order.id, status);
      await orderStore.addUpdate(conn, order.id, `Your order status is now ${status}.`);
      await recordAudit({ actor: req.user.id, action: 'ORDER_STATUS_CHANGED', entity: 'order', entityId: order.id,
                          details: { from: order.status, to: status } }, conn);
    }
    if (trackingNumber !== undefined && trackingNumber.trim() !== (order.trackingNumber || '')) {
      const value = trackingNumber.trim();
      await orderStore.setOrderFields(conn, order.id, { trackingNumber: value });
      await orderStore.addUpdate(conn, order.id, value
        ? `Shipping tracking number: ${value}.`
        : 'Shipping tracking information was removed.', 'Shipping update');
    }
    if (carrier !== undefined && carrier.trim() !== (order.carrier || '')) {
      const value = carrier.trim();
      await orderStore.setOrderFields(conn, order.id, { carrier: value });
      if (value) await orderStore.addUpdate(conn, order.id, `Your parcel will ship with ${value}.`, 'Shipping update');
    }
  });
  res.json(await orderStore.getById(order.id));
};

exports.setStatus = exports.updateOrder;

exports.updatePreorder = async (req, res) => {
  const order = await orderStore.getById(req.params.orderId);
  if (!order || !order.isPreorder) return res.status(404).json({ error: 'Pre-order not found.' });
  const body = req.body || {};
  const status = body.status;
  if (status === 'Confirmed' && order.paymentStatus !== 'Verified / Paid')
    return res.status(409).json({ error: 'Verify the payment before confirming this pre-order.' });
  if (status && !['Confirmed', 'Rejected'].includes(status))
    return res.status(400).json({ error: 'Pre-orders can only be confirmed or rejected here.' });
  if (status && status !== order.preorderStatus &&
      !(order.preorderStatus === 'Pending' && ['Confirmed', 'Rejected'].includes(status)) &&
      !(order.preorderStatus === 'Confirmed' && status === 'Rejected'))
    return res.status(409).json({ error: `Cannot move pre-order from "${order.preorderStatus}" to "${status}".` });
  if (body.expectedAvailability !== undefined &&
      body.expectedAvailability !== '' &&
      !isValidDateOnly(body.expectedAvailability))
    return res.status(400).json({ error: 'Enter a valid expected availability date.' });

  let leaveQueue = false;
  await runInTransaction(async conn => {
    await orderStore.lockOrder(conn, order.id);
    if (status && status !== order.preorderStatus) {
      const [eligibility, allocation] = status === 'Confirmed' ? ['Confirmed', 'Waiting'] : ['Rejected', 'Cancelled'];
      await orderStore.setPreorder(conn, order.id, { eligibility, allocation });
      await orderStore.setOrderFields(conn, order.id, { status: `Pre-order ${status}` });
      await orderStore.addHistory(conn, order.id, `Pre-order ${status}`);
      await orderStore.addUpdate(conn, order.id,
        status === 'Confirmed' ? 'Your pre-order has been confirmed.' : 'Your pre-order was rejected. Please contact us about payment.',
        'Pre-order update');
      await recordAudit({ actor: req.user.id, action: `PREORDER_${status.toUpperCase()}`, entity: 'order', entityId: order.id,
                          details: { from: order.preorderStatus, to: status } }, conn);
      leaveQueue = status === 'Rejected';
    }
    if (body.expectedAvailability !== undefined && body.expectedAvailability !== order.expectedAvailability) {
      await orderStore.setPreorder(conn, order.id, { expectedAvailability: body.expectedAvailability || null });
      if (body.expectedAvailability)
        await orderStore.addUpdate(conn, order.id, `Expected availability is ${body.expectedAvailability}.`, 'Pre-order availability');
    }
  });
  if (leaveQueue) removePreorder(order.productId, order.preorderId);
  res.json(await orderStore.getById(order.id));
};

exports.markPreorderReady = async (req, res) => {
  const result = await makePreorderReady(req.params.orderId, req.user.id);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result.order);
};

exports.cancelConfirmedOrder = async (orderId, actor) => {
  const first = await orderStore.getById(orderId);
  if (!first) return { error: 'Order not found in the current order records.', status: 404 };
  const result = await withLock(lockKey(first.productId), () => runInTransaction(async conn => {
    await productStore.getById(first.productId, conn, true);
    await orderStore.lockOrder(conn, first.id);
    const order = await orderStore.getById(first.id, conn);          // re-read under the lock
    if ((order.isPreorder && order.preorderStatus !== 'Available') ||
        !(NEXT[order.status] || []).includes('Cancelled'))
      return { error: `Cannot cancel an order in "${order.status}" status.`, status: 409 };
    if (order.stockReserved) await productStore.adjustStock(order.productId, order.qty, conn);
    await orderStore.setOrderFields(conn, order.id, { status: 'Cancelled', stockReserved: false });
    if (order.isPreorder) await orderStore.setPreorder(conn, order.id, { allocation: 'Cancelled' });
    await orderStore.addHistory(conn, order.id, 'Cancelled');
    await orderStore.addUpdate(conn, order.id, 'Your order was cancelled.', 'Order update');
    await recordAudit({ actor, action: 'ORDER_CANCELLED', entity: 'order', entityId: order.id,
                        details: { from: order.status, to: 'Cancelled' } }, conn);
    return {};
  }));
  if (result.error) return result;
  return { order: await orderStore.getById(first.id) };
};
