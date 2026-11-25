const { query } = require('./pool');
const storage = require('./storage');
const { runInTransaction } = require('../engines/e2-safety');

const EVIDENCE_BUCKET = 'return-evidence';

function mapRequest(row, urls) {
  const evidence = Array.isArray(row.evidence) ? row.evidence : [];
  return {
    id: row.request_id,
    orderId: row.order_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    type: row.type,
    productName: row.product_name,
    quantity: row.quantity,
    orderStatus: row.order_status,
    message: row.message,
    status: row.status,
    rejectionReason: row.rejection_reason || '',
    createdAt: row.created_at,
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
    evidence: evidence.map(file => ({
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      url: urls.get(file.path) || '',
    })),
  };
}

async function hydrate(rows) {
  const evidence = rows.flatMap(row => Array.isArray(row.evidence) ? row.evidence : []);
  const urls = await storage.signedUrls(EVIDENCE_BUCKET, evidence.map(file => file.path));
  return rows.map(row => mapRequest(row, urls));
}

async function create(record) {
  try {
    const result = await runInTransaction(async conn => {
      const [order] = await query(
        'select order_id from orders where order_id = $1 and customer_id = $2 for update',
        [record.orderId, record.customerId],
        conn,
      );
      if (!order) return { error: 'Order not found.' };

      if (record.type === 'Return') {
        const [count] = await query(
          `select count(*)::integer as total
             from return_request
            where order_id = $1 and customer_id = $2 and type = 'Return'`,
          [record.orderId, record.customerId],
          conn,
        );
        if (count.total >= 3)
          return { error: 'You have reached the maximum of 3 return requests for this order.' };
      }

      const [row] = await query(
        `insert into return_request
           (request_id, order_id, customer_id, customer_name, customer_email, type,
            product_name, quantity, order_status, message, status, evidence)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Pending',$11::jsonb)
         returning *`,
        [
          record.id,
          record.orderId,
          record.customerId,
          record.customerName,
          record.customerEmail,
          record.type,
          record.productName,
          record.quantity,
          record.orderStatus,
          record.message,
          JSON.stringify(record.evidence || []),
        ],
        conn,
      );
      return { row };
    });
    if (result.error) return result;
    return (await hydrate([result.row]))[0];
  } catch (error) {
    if (error.code === '23505') return { error: 'There is already an open request for this order.' };
    throw error;
  }
}

async function listAll() {
  return hydrate(await query('select * from return_request order by created_at desc, request_id'));
}

async function listForCustomer(customerId) {
  return hydrate(await query(
    'select * from return_request where customer_id = $1 order by created_at desc, request_id',
    [customerId],
  ));
}

async function update(id, status, rejectionReason = '') {
  const [row] = await query(
    `update return_request
        set status = $2,
            rejection_reason = case when $2 = 'Rejected' then $3 else null end,
            updated_at = now()
      where request_id = $1
      returning *`,
    [id, status, rejectionReason],
  );
  return row ? (await hydrate([row]))[0] : null;
}

module.exports = { create, listAll, listForCustomer, update };
