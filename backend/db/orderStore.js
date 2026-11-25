// Orders = orders + order_item + payment + pre_order (+ history/updates).
// Reads go through the order_overview view and are mapped back to the SAME
// object shape the frontend already uses, so no frontend changes are needed.
// Write helpers take a `conn` so controllers can run them inside one transaction.
const { query } = require('./pool');
const storage = require('./storage');
const { isUuid } = require('./customerStore');
const { getQueue } = require('../engines/e1-preorder');

const PROOF_BUCKET = 'payment-proofs';

// pre_order columns -> app status
function preorderStatus(row) {
  if (!row.preorder_id) return undefined;
  if (row.allocation_status === 'Allocated') return 'Available';
  if (row.allocation_status === 'Cancelled') return row.eligibility_status === 'Rejected' ? 'Rejected' : 'Cancelled';
  return row.eligibility_status;                       // 'Pending' | 'Confirmed'
}

function toApi(row, history, updates, proofUrls, positions) {
  const order = {
    id: row.order_id,
    productId: row.product_id,
    productName: row.product_name,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email || '',
    qty: row.quantity,
    unitPrice: row.agreed_unit_price,
    totalAmount: row.total_amount,
    paidAmount: row.paid_amount,
    remainingAmount: row.remaining_amount,
    paymentStatus: row.payment_status,
    color: row.color || '',
    giftWrap: row.gift_wrap,
    giftMessage: row.gift_message || '',
    createdAt: row.order_date,
    stockReserved: row.stock_reserved,
    status: row.order_status,
    trackingNumber: row.tracking_number || '',
    carrier: row.carrier || '',
    paymentRejectionReason: row.rejection_reason || '',
    paymentVerifiedAt: row.payment_status === 'Verified / Paid' ? row.verified_at : null,
    statusHistory: history.map(h => ({ status: h.status, at: h.changed_at })),
    customerUpdates: updates.map(u => ({ type: u.update_type, message: u.message, at: u.created_at })),
  };
  if (row.delivery_name) {
    order.deliveryDetails = {
      name: row.delivery_name, phone: row.delivery_phone,
      address: row.delivery_address, pincode: row.delivery_pincode,
    };
  }
  if (row.payment_id) {
    order.paymentSubmission = {
      method: row.payment_method || 'UPI',
      reference: row.upi_transaction_reference || '',
      amountPaid: row.amount_paid,
      proof: (row.proof_path && proofUrls.get(row.proof_path)) || '',
      submittedAt: row.payment_date,
    };
  }
  if (row.preorder_id) {
    order.isPreorder = true;
    order.preorderId = row.preorder_id;
    order.preorderStatus = preorderStatus(row);
    order.expectedAvailability = row.expected_availability || '';
    order.queuePosition = positions.get(row.preorder_id);
    if (row.ready_at) order.readyAt = row.ready_at;
  }
  return order;
}

async function hydrate(rows, conn) {
  if (!rows.length) return [];
  const ids = rows.map(row => row.order_id);
  const [history, updates, proofUrls] = await Promise.all([
    query('select order_id, status, changed_at from order_status_history where order_id = any($1) order by changed_at, id', [ids], conn),
    query('select order_id, update_type, message, created_at from order_update where order_id = any($1) order by created_at, id', [ids], conn),
    storage.signedUrls(PROOF_BUCKET, rows.map(row => row.proof_path)),
  ]);
  const positions = new Map();
  [...new Set(rows.filter(row => row.preorder_id).map(row => row.product_id))]
    .forEach(productId => getQueue(productId).forEach(item => positions.set(item.preorderId, item.position)));
  const group = (list, id) => list.filter(item => item.order_id === id);
  return rows.map(row => toApi(row, group(history, row.order_id), group(updates, row.order_id), proofUrls, positions));
}

// ---------- reads ----------
async function getById(id, conn) {
  const orderId = Number(id);
  if (!Number.isInteger(orderId)) return null;
  const rows = await query('select * from order_overview where order_id = $1', [orderId], conn);
  return (await hydrate(rows, conn))[0] || null;
}
async function listForCustomer(customerId) {
  if (!isUuid(customerId)) return [];
  return hydrate(await query('select * from order_overview where customer_id = $1 order by order_id desc', [customerId]));
}
async function listAll() {
  return hydrate(await query('select * from order_overview order by order_id desc'));
}
// Map(preorderId -> orderId) for the confirmed, still-waiting pre-orders in the given ids.
async function confirmedFromQueue(preorderIds) {
  if (!preorderIds.length) return new Map();
  const rows = await query(
    `select preorder_id, order_id from pre_order
      where preorder_id = any($1) and eligibility_status = 'Confirmed' and allocation_status = 'Waiting'`, [preorderIds]);
  return new Map(rows.map(row => [row.preorder_id, row.order_id]));
}

// ---------- writes (call inside runInTransaction, pass its conn) ----------
async function lockOrder(conn, orderId) {
  return (await query('select order_id from orders where order_id = $1 for update', [orderId], conn))[0] || null;
}

async function insertOrder(conn, o) {
  const d = o.delivery || {};
  const [row] = await query(
    `insert into orders (customer_id, total_amount, order_status, delivery_name, delivery_phone,
                         delivery_address, delivery_pincode, gift_wrap, gift_message, stock_reserved)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning order_id`,
    [o.customerId, o.totalAmount, o.status, d.name || null, d.phone || null, d.address || null,
     d.pincode || null, o.giftWrap, o.giftMessage, o.stockReserved], conn);
  await query(
    'insert into order_item (order_id, product_id, quantity, agreed_unit_price, color) values ($1,$2,$3,$4,$5)',
    [row.order_id, o.productId, o.qty, o.unitPrice, o.color || null], conn);
  return row.order_id;
}

const addHistory = (conn, orderId, status) =>
  query('insert into order_status_history (order_id, status) values ($1,$2)', [orderId, status], conn);
const addUpdate = (conn, orderId, message, type = 'Order update') =>
  query('insert into order_update (order_id, update_type, message) values ($1,$2,$3)', [orderId, type, message], conn);

const ORDER_COLUMNS = { status: 'order_status', trackingNumber: 'tracking_number', carrier: 'carrier',
                        stockReserved: 'stock_reserved', paidAmount: 'paid_amount' };
async function setOrderFields(conn, orderId, fields) {
  const sets = []; const values = [orderId];
  Object.entries(fields).forEach(([key, value]) => {
    if (!ORDER_COLUMNS[key]) throw new Error(`Unknown order field ${key}`);
    values.push(value); sets.push(`${ORDER_COLUMNS[key]} = $${values.length}`);
  });
  if (sets.length) await query(`update orders set ${sets.join(', ')} where order_id = $1`, values, conn);
}

async function insertPayment(conn, orderId, p) {
  const [row] = await query(
    `insert into payment (order_id, payment_method, upi_transaction_reference, amount, payment_status, proof_path)
     values ($1,$2,$3,$4,'Awaiting Verification',$5) returning payment_id`,
    [orderId, p.method || 'UPI', p.reference || null, p.amountPaid, p.proofPath || null], conn);
  return row.payment_id;
}
async function latestPayment(conn, orderId) {
  return (await query('select * from payment where order_id = $1 order by payment_id desc limit 1', [orderId], conn))[0] || null;
}
const reviewPayment = (conn, paymentId, { status, reason }) =>
  query(`update payment set payment_status = $2, rejection_reason = $3,
                verified_at = case when $2 = 'Verified / Paid' then now() else null end
          where payment_id = $1`, [paymentId, status, reason || null], conn);

async function insertPreorder(conn, { customerId, productId, orderId, qty }) {
  const [row] = await query(
    `insert into pre_order (customer_id, product_id, order_id, requested_quantity) values ($1,$2,$3,$4) returning preorder_id`,
    [customerId, productId, orderId, qty], conn);
  return row.preorder_id;
}
const PRE_COLUMNS = { eligibility: 'eligibility_status', allocation: 'allocation_status',
                      expectedAvailability: 'expected_availability', readyAt: 'ready_at' };
async function setPreorder(conn, orderId, fields) {
  const sets = []; const values = [orderId];
  Object.entries(fields).forEach(([key, value]) => {
    if (!PRE_COLUMNS[key]) throw new Error(`Unknown pre-order field ${key}`);
    values.push(value); sets.push(`${PRE_COLUMNS[key]} = $${values.length}`);
  });
  if (sets.length) await query(`update pre_order set ${sets.join(', ')} where order_id = $1`, values, conn);
}

module.exports = {
  getById, listForCustomer, listAll, confirmedFromQueue,
  lockOrder, insertOrder, addHistory, addUpdate, setOrderFields,
  insertPayment, latestPayment, reviewPayment, insertPreorder, setPreorder,
};
