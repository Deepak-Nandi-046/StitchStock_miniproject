// Shopping bag (public.cart_item) and wishlist (public.wishlist_item), one set of rows per customer.
// The frontend keeps its working copy in localStorage and saves the whole state here after each change.
const { pool, query } = require('./pool');

const MAX_QTY = 20;

async function getCart(customerId) {
  const rows = await query(
    `select product_id, quantity, color from cart_item where customer_id = $1 order by updated_at, product_id`,
    [customerId]);
  const items = {}; const colors = {};
  rows.forEach(row => {
    items[String(row.product_id)] = row.quantity;
    if (row.color) colors[String(row.product_id)] = row.color;
  });
  return { items, colors };
}

// Replaces the customer's whole bag. Unknown product ids are ignored.
async function saveCart(customerId, items = {}, colors = {}) {
  const ids = []; const qtys = []; const cols = [];
  Object.entries(items || {}).forEach(([id, qty]) => {
    const productId = Number(id);
    const quantity = Math.floor(Number(qty));
    if (!Number.isSafeInteger(productId) || productId < 1 || !(quantity > 0)) return;
    ids.push(productId);
    qtys.push(Math.min(MAX_QTY, quantity));
    const color = colors && typeof colors[id] === 'string' ? colors[id].trim().slice(0, 60) : '';
    cols.push(color || null);
  });

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    await conn.query('delete from cart_item where customer_id = $1', [customerId]);
    if (ids.length) {
      await conn.query(
        `insert into cart_item (customer_id, product_id, quantity, color)
         select $1, p.product_id, x.qty, x.color
           from unnest($2::bigint[], $3::int[], $4::text[]) as x(pid, qty, color)
           join product p on p.product_id = x.pid`,
        [customerId, ids, qtys, cols]);
    }
    await conn.query('COMMIT');
  } catch (error) {
    await conn.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
  return getCart(customerId);
}

async function getWishlist(customerId) {
  const rows = await query(
    `select product_id from wishlist_item where customer_id = $1 order by created_at, product_id`,
    [customerId]);
  return rows.map(row => String(row.product_id));
}

async function saveWishlist(customerId, productIds = []) {
  const ids = [...new Set((Array.isArray(productIds) ? productIds : [])
    .map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];

  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    await conn.query('delete from wishlist_item where customer_id = $1', [customerId]);
    if (ids.length) {
      await conn.query(
        `insert into wishlist_item (customer_id, product_id)
         select $1, p.product_id from product p where p.product_id = any($2::bigint[])`,
        [customerId, ids]);
    }
    await conn.query('COMMIT');
  } catch (error) {
    await conn.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
  return getWishlist(customerId);
}

module.exports = { getCart, saveCart, getWishlist, saveWishlist };
