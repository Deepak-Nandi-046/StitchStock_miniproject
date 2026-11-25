// Rebuild the in-memory FIFO queues (E1) from the pre_order table at start-up.
const { query } = require('../../db/pool');
const { enqueuePreorder, clearQueues } = require('./index');

async function restoreQueuesFromDb() {
  const rows = await query(
    `select preorder_id, product_id, customer_id, requested_quantity
       from pre_order
      where allocation_status = 'Waiting' and eligibility_status in ('Pending','Confirmed')
      order by queue_timestamp, preorder_id`);
  clearQueues();
  rows.forEach(row => enqueuePreorder({
    productId: row.product_id, customerId: row.customer_id,
    qty: row.requested_quantity, preorderId: row.preorder_id,
  }));
  return rows.length;
}
module.exports = { restoreQueuesFromDb };
