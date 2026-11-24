const db = require('../db');
const { supabase } = require('../db/supabase');
const orderStore = require('../db/orderStore');
const localProductStore = require('../db/localProductStore');
const { enqueuePreorder, removePreorder, getQueue } = require('../engines/e1-preorder');
const { withLock, runInTransaction } = require('../engines/e2-safety');
const { recordAudit, listAudit } = require('../engines/e3-audit');
const supabaseConfigured = () =>
  Boolean((process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ));

const NEXT = {
  Placed: ['Confirmed', 'Cancelled'],
  Confirmed: ['Preparing', 'Cancelled'],
  Preparing: ['Shipped', 'Cancelled'],
  'Shipped': ['Delivered'],
  Delivered: [],
};
const lockKey = id => 'product:' + id;

function validatePaymentSubmission(input, totalAmount) {
  const payment = input || {};
  const reference = typeof payment.reference === 'string' ? payment.reference.trim() : '';
  const amountPaid = payment.amountPaid === undefined ? totalAmount : Number(payment.amountPaid);
  const proofValue = payment.proof || '';
  let proof = '';
  if (proofValue) {
    const match = typeof proofValue === 'string'
      ? proofValue.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/)
      : null;
    if (!match) return { error: 'Payment proof must be a JPG, PNG, or WebP image.' };
    const image = Buffer.from(match[2], 'base64');
    if (!image.length || image.length > 2 * 1024 * 1024)
      return { error: 'Payment proof must be 2 MB or smaller.' };
    proof = `data:image/${match[1]};base64,${image.toString('base64')}`;
  }
  if (reference.length > 120 || !Number.isFinite(amountPaid) || amountPaid <= 0 ||
      (!reference && !proof))
    return { error: 'Enter the amount paid and a transaction reference or payment screenshot.' };
  return {
    value: {
      method: typeof payment.method === 'string' ? payment.method.trim().slice(0, 40) || 'UPI' : 'UPI',
      reference,
      amountPaid,
      proof,
      submittedAt: new Date().toISOString(),
    },
  };
}

function addCustomerUpdate(order, message, type = 'Order update') {
  order.customerUpdates = order.customerUpdates || [];
  order.customerUpdates.push({ type, message, at: new Date().toISOString() });
}

function addStatusHistory(order, status) {
  order.statusHistory = order.statusHistory || [];
  order.statusHistory.push({ status, at: new Date().toISOString() });
}

function isValidDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function setProductStock(product, stock) {
  if (supabaseConfigured()) {
    const { error } = await supabase.from('products').update({ stock }).eq('id', product.id);
    if (error) throw error;
  } else {
    const previousStock = product.stock;
    product.stock = stock;
    try {
      await localProductStore.save(db.products);
    } catch (error) {
      product.stock = previousStock;
      throw error;
    }
    return;
  }
  product.stock = stock;
}

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
  const body = req.body || {};
  const { productId, qty = 1, color, giftWrap = false, giftMessage = '' } = body;
  const p = db.products.find(x => x.id === productId);
  if (!p || !Number.isInteger(qty) || qty < 1 || qty > 20) return res.status(400).json({ error: 'Invalid request' });
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
  const order = await withLock(lockKey(productId), () =>
    runInTransaction(async () => {
      const id = db.orders.reduce((max, existing) => Math.max(max, Number(existing.id) || 0), 0) + 1;
      const totalAmount = Number(p.price) * qty;
      const o = {
        id,
        productId,
        productName: p.name,
        customerId,
        customerName: req.user.name,
        customerEmail: req.user.email || '',
        qty,
        unitPrice: Number(p.price),
        totalAmount,
        paymentStatus: paymentSubmission ? 'Awaiting Verification' : 'Payment Pending',
        ...(paymentSubmission ? { paymentSubmission } : {}),
        ...(deliveryDetails ? {
          deliveryDetails: {
            name: deliveryDetails.name.trim().slice(0, 100),
            phone: deliveryDetails.phone,
            address: deliveryDetails.address.trim().slice(0, 500),
            pincode: deliveryDetails.pincode,
          }
        } : {}),
        color: typeof color === 'string' ? color.slice(0, 40) : '',
        giftWrap,
        giftMessage: giftWrap ? giftMessage.trim() : '',
        createdAt: new Date().toISOString(),
      };
      if (p.stock >= qty) {
        await setProductStock(p, p.stock - qty);
        o.stockReserved = true;
        o.status = 'Placed';
        addCustomerUpdate(o, 'Your order was placed and is waiting for confirmation.');
      } else {
        Object.assign(o, enqueuePreorder({ productId, customerId, qty }), {
          isPreorder: true,
          preorderStatus: 'Pending',
          expectedAvailability: '',
          status: 'Pre-order Pending',
        });
        addCustomerUpdate(o, 'Your pre-order was received and is waiting for confirmation.', 'Pre-order update');
      }
      o.statusHistory = [{ status: o.status, at: o.createdAt }];
      db.orders.push(o);
      try {
        await orderStore.save(db.orders);
      } catch (error) {
        db.orders.pop();
        if (o.isPreorder) removePreorder(productId, o.preorderId);
        else await setProductStock(p, p.stock + qty);
        throw error;
      }
      await recordAudit({ actor: customerId, action: o.isPreorder ? 'PREORDER_PLACED' : 'ORDER_PLACED',
                          entity: 'order', entityId: o.id, details: { productId, qty } });
      return o;
    }));
  res.status(201).json(order);
};

exports.myOrders = (req, res) =>
  res.json(db.orders.filter(o => o.customerId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));

// ---------- owner ----------
exports.summary = async (req, res) => {
  res.json({
    products: db.products.map(p => ({ ...p, queue: getQueue(p.id).length })),
    orders: [...db.orders].reverse(),
    audit: await listAudit(30),
    nextMoves: NEXT,
  });
};

exports.submitPayment = async (req, res) => {
  const order = findOrder(req.params.orderId);
  if (!order || String(order.customerId) !== String(req.user.id))
    return res.status(404).json({ error: 'Order not found.' });
  if (order.paymentStatus === 'Verified / Paid')
    return res.status(409).json({ error: 'This order payment has already been verified.' });
  const validated = validatePaymentSubmission(req.body, Number(order.totalAmount));
  if (validated.error) return res.status(400).json({ error: validated.error });
  const previous = JSON.parse(JSON.stringify(order));
  try {
    order.paymentSubmission = validated.value;
    order.paymentStatus = 'Awaiting Verification';
    order.paymentRejectionReason = '';
    addCustomerUpdate(order, 'Payment submitted and awaiting admin verification.', 'Payment update');
    await orderStore.save(db.orders);
    res.json(order);
  } catch (error) {
    Object.assign(order, previous);
    throw error;
  }
};

exports.verifyPayment = async (req, res) => {
  const order = findOrder(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  const body = req.body || {};
  if (!['approve', 'reject'].includes(body.action))
    return res.status(400).json({ error: 'Choose approve or reject.' });
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (body.action === 'reject' && (!reason || reason.length > 500))
    return res.status(400).json({ error: 'Add a rejection reason of up to 500 characters.' });
  if (order.paymentStatus !== 'Awaiting Verification' || !order.paymentSubmission)
    return res.status(409).json({ error: 'This order has no payment awaiting verification.' });

  const previous = JSON.parse(JSON.stringify(order));
  try {
    const now = new Date().toISOString();
    order.paymentStatus = body.action === 'approve' ? 'Verified / Paid' : 'Rejected';
    order.paymentVerifiedAt = body.action === 'approve' ? now : null;
    order.paymentRejectionReason = body.action === 'reject' ? reason : '';
    addCustomerUpdate(order, body.action === 'approve'
      ? 'Payment Verified / Paid. Your order can proceed to processing.'
      : `Payment rejected: ${reason}. Please update your payment details and submit again.`, 'Payment update');
    await orderStore.save(db.orders);
    await recordAudit({
      actor: req.user.id,
      action: body.action === 'approve' ? 'PAYMENT_VERIFIED' : 'PAYMENT_REJECTED',
      entity: 'order',
      entityId: order.id,
      details: body.action === 'reject' ? { reason } : {},
    });
    res.json(order);
  } catch (error) {
    Object.assign(order, previous);
    throw error;
  }
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

  const payload = {
    name,
    price,
    stock,
    ...(category ? { category } : {}),
    ...(imageUrl ? { image_url: imageUrl } : {}),
    ...(description ? { description } : {})
  };

  if (!supabaseConfigured()) {
    const id = db.products.reduce((max, product) => Math.max(max, Number(product.id) || 0), 0) + 1;
    const added = { id, ...payload };
    db.products.push(added);
    try {
      await localProductStore.save(db.products);
      await recordAudit({
        actor: req.user.id,
        action: 'PRODUCT_ADDED',
        entity: 'product',
        entityId: id,
        details: { name, stock, price }
      });
    } catch (error) {
      db.products.pop();
      throw error;
    }
    return res.status(201).json(added);
  }

  let data = null;
  let error = null;

  const extendedInsert = await supabase
    .from('products')
    .insert(payload)
    .select('*')
    .single();
  data = extendedInsert.data;
  error = extendedInsert.error;

  if (error) {
    // Existing databases may not have the optional category/image/description columns yet.
    const baseInsert = await supabase
      .from('products')
      .insert({ name, price, stock })
      .select('*')
      .single();
    data = baseInsert.data;
    error = baseInsert.error;
  }

  if (error) {
    console.error('Supabase product insert failed:', error.message);
    return res.status(500).json({ error: 'Could not add the product' });
  }

  const addedProduct = {
    ...data,
    ...(category ? { category } : {}),
    ...(imageUrl ? { image_url: imageUrl } : {}),
    ...(description ? { description } : {})
  };
  db.products.push(addedProduct);
  await recordAudit({
    actor: req.user.id,
    action: 'PRODUCT_ADDED',
    entity: 'product',
    entityId: data.id,
    details: { name, stock, price }
  });
  res.status(201).json(data);
};
exports.queue = (req, res) => res.json(getQueue(Number(req.params.productId)));

exports.restock = async (req, res) => {
  const id = Number(req.params.productId), add = req.body && req.body.add;
  const p = db.products.find(x => x.id === id);
  if (!p || !Number.isInteger(add) || add < 1) return res.status(400).json({ error: 'Invalid request' });
  const out = await withLock(lockKey(id), async () => {
    const stock = Number(p.stock) + add;
    await setProductStock(p, stock);
    await recordAudit({ actor: req.user.id, action: 'RESTOCK', entity: 'product', entityId: id, details: { add } });
    return p;
  });
  res.json(out);
};

function findOrder(orderId) {
  return db.orders.find(order => String(order.id) === String(orderId));
}

function updateQueuePositions(productId) {
  getQueue(productId).forEach(item => {
    const queuedOrder = db.orders.find(order => String(order.preorderId) === String(item.preorderId));
    if (queuedOrder) queuedOrder.queuePosition = item.position;
  });
}

async function makePreorderReady(order, actor) {
  return withLock(lockKey(order.productId), async () => {
    const product = db.products.find(item => String(item.id) === String(order.productId));
    if (!product) return { error: 'Product not found.', status: 404 };
    if (!order.isPreorder || order.preorderStatus !== 'Confirmed')
      return { error: 'Confirm this pre-order before marking it ready.', status: 409 };
    if (Number(product.stock) < order.qty)
      return { error: `Only ${product.stock} item(s) are in stock; ${order.qty} are required.`, status: 409 };

    const previousOrder = JSON.parse(JSON.stringify(order));
    const previousStock = Number(product.stock);
    const removed = removePreorder(order.productId, order.preorderId);
    updateQueuePositions(order.productId);
    try {
      await setProductStock(product, previousStock - order.qty);
      order.stockReserved = true;
      order.preorderStatus = 'Available';
      order.status = 'Preparing';
      order.readyAt = new Date().toISOString();
      addStatusHistory(order, order.status);
      addCustomerUpdate(order, `${order.productName} is available and preparation has started.`, 'Pre-order available');
      await orderStore.save(db.orders);
      await recordAudit({ actor, action: 'PREORDER_READY', entity: 'order', entityId: order.id });
      return { order };
    } catch (error) {
      Object.assign(order, previousOrder);
      if (removed) {
        const restored = enqueuePreorder({
          productId: order.productId,
          customerId: order.customerId,
          qty: order.qty,
          preorderId: previousOrder.preorderId,
        });
        order.preorderId = restored.preorderId;
        order.queuePosition = restored.queuePosition;
        updateQueuePositions(order.productId);
      }
      if (Number(product.stock) !== previousStock) await setProductStock(product, previousStock);
      throw error;
    }
  });
}

exports.allocate = async (req, res) => {
  const productId = Number(req.params.productId);
  const nextConfirmed = getQueue(productId).find(item => {
    const order = db.orders.find(record => String(record.preorderId) === String(item.preorderId));
    return order && order.preorderStatus === 'Confirmed';
  });
  if (!nextConfirmed) return res.status(409).json({ error: 'There are no confirmed pre-orders waiting for this product.' });
  const order = db.orders.find(record => String(record.preorderId) === String(nextConfirmed.preorderId));
  const result = await makePreorderReady(order, req.user.id);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result.order);
};

exports.updateOrder = async (req, res) => {
  const order = findOrder(req.params.orderId);
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

  const previous = JSON.parse(JSON.stringify(order));
  try {
    if (status && status !== order.status && status !== 'Cancelled') {
      const previousStatus = order.status;
      order.status = status;
      addStatusHistory(order, status);
      addCustomerUpdate(order, `Your order status is now ${status}.`);
      await recordAudit({ actor: req.user.id, action: 'ORDER_STATUS_CHANGED', entity: 'order', entityId: order.id, details: { from: previousStatus, to: status } });
    }
    if (trackingNumber !== undefined && trackingNumber.trim() !== (order.trackingNumber || '')) {
      order.trackingNumber = trackingNumber.trim();
      addCustomerUpdate(order, order.trackingNumber
        ? `Shipping tracking number: ${order.trackingNumber}.`
        : 'Shipping tracking information was removed.', 'Shipping update');
    }
    if (carrier !== undefined && carrier.trim() !== (order.carrier || '')) {
      order.carrier = carrier.trim();
      if (order.carrier) addCustomerUpdate(order, `Your parcel will ship with ${order.carrier}.`, 'Shipping update');
    }
    await orderStore.save(db.orders);
    res.json(order);
  } catch (error) {
    Object.assign(order, previous);
    throw error;
  }
};

exports.setStatus = exports.updateOrder;

exports.updatePreorder = async (req, res) => {
  const order = findOrder(req.params.orderId);
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

  const previous = JSON.parse(JSON.stringify(order));
  try {
    if (status && status !== order.preorderStatus) {
      const before = order.preorderStatus;
      order.preorderStatus = status;
      order.status = `Pre-order ${status}`;
      addStatusHistory(order, order.status);
      addCustomerUpdate(order,
        status === 'Confirmed' ? 'Your pre-order has been confirmed.' : 'Your pre-order was rejected. Please contact us about payment.',
        'Pre-order update');
      if (status === 'Rejected') {
        removePreorder(order.productId, order.preorderId);
        updateQueuePositions(order.productId);
      }
      await recordAudit({ actor: req.user.id, action: `PREORDER_${status.toUpperCase()}`, entity: 'order', entityId: order.id, details: { from: before, to: status } });
    }
    if (body.expectedAvailability !== undefined && body.expectedAvailability !== order.expectedAvailability) {
      order.expectedAvailability = body.expectedAvailability;
      if (body.expectedAvailability)
        addCustomerUpdate(order, `Expected availability is ${body.expectedAvailability}.`, 'Pre-order availability');
    }
    await orderStore.save(db.orders);
    res.json(order);
  } catch (error) {
    Object.assign(order, previous);
    if (status === 'Rejected' && ['Pending', 'Confirmed'].includes(previous.preorderStatus)) {
      enqueuePreorder({
        productId: previous.productId,
        customerId: previous.customerId,
        qty: previous.qty,
        preorderId: previous.preorderId,
      });
      updateQueuePositions(previous.productId);
    }
    throw error;
  }
};

exports.markPreorderReady = async (req, res) => {
  const order = findOrder(req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Pre-order not found.' });
  const result = await makePreorderReady(order, req.user.id);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result.order);
};

exports.cancelConfirmedOrder = async (orderId, actor) => {
  const order = findOrder(orderId);
  if (!order) return { error: 'Order not found in the current order records.', status: 404 };
  if ((order.isPreorder && order.preorderStatus !== 'Available') ||
      !(NEXT[order.status] || []).includes('Cancelled'))
    return { error: `Cannot cancel an order in "${order.status}" status.`, status: 409 };
  await withLock(lockKey(order.productId), async () => {
    const product = db.products.find(item => String(item.id) === String(order.productId));
    const previous = JSON.parse(JSON.stringify(order));
    const previousStock = product && Number(product.stock);
    try {
      if (product && order.stockReserved) await setProductStock(product, previousStock + order.qty);
      order.status = 'Cancelled';
      order.stockReserved = false;
      if (order.isPreorder) order.preorderStatus = 'Cancelled';
      addStatusHistory(order, 'Cancelled');
      addCustomerUpdate(order, 'Your order was cancelled.', 'Order update');
      await orderStore.save(db.orders);
      await recordAudit({
        actor,
        action: 'ORDER_CANCELLED',
        entity: 'order',
        entityId: order.id,
        details: { from: previous.status, to: 'Cancelled' },
      });
    } catch (error) {
      Object.assign(order, previous);
      if (product && Number(product.stock) !== previousStock) await setProductStock(product, previousStock);
      throw error;
    }
  });
  return { order };
};