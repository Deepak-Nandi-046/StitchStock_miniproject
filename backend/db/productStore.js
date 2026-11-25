// Products = public.product + public.inventory (1:1). API shape stays { id, name, stock, price, ... }.
const { pool, query } = require('./pool');

const COLUMNS = `
  p.product_id as id, p.product_name as name, p.price, p.category,
  p.image_url, p.description, p.is_active, coalesce(i.quantity_available, 0) as stock`;
const FROM = `from product p left join inventory i on i.product_id = p.product_id`;

const list = ({ includeInactive = false } = {}) =>
  query(`select ${COLUMNS} ${FROM} ${includeInactive ? '' : 'where p.is_active'} order by p.product_id`);

// forUpdate locks the inventory row until the surrounding transaction ends.
async function getById(id, conn, forUpdate = false) {
  const productId = Number(id);
  if (!Number.isInteger(productId)) return null;
  // Postgres cannot lock the nullable side of a LEFT JOIN, so lock the inventory row on its own
  // first; the read below then sees the latest committed quantity.
  if (forUpdate) await query('select 1 from inventory where product_id = $1 for update', [productId], conn);
  const rows = await query(`select ${COLUMNS} ${FROM} where p.product_id = $1`, [productId], conn);
  return rows[0] || null;
}

async function create({ name, price, stock, category, image_url, description }) {
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    const [row] = (await conn.query(
      `insert into product (product_name, price, category, image_url, description)
       values ($1, $2, $3, $4, $5) returning product_id`,
      [name, price, category || null, image_url || null, description || null])).rows;
    await conn.query('insert into inventory (product_id, quantity_available) values ($1, $2)', [row.product_id, stock]);
    await conn.query('COMMIT');
    return getById(row.product_id);
  } catch (error) {
    await conn.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
}

// Atomic stock change. Returns the new quantity, or null if it would go below zero.
async function adjustStock(productId, delta, conn) {
  const rows = await query(
    `update inventory set quantity_available = quantity_available + $2, updated_at = now()
      where product_id = $1 and quantity_available + $2 >= 0
      returning quantity_available`, [productId, delta], conn);
  return rows[0] ? rows[0].quantity_available : null;
}

// Soft delete: hides the product from the shop but keeps order/review history intact.
async function deactivate(productId, conn) {
  const rows = await query(
    `update product set is_active = false where product_id = $1 and is_active returning product_id`,
    [productId], conn);
  return rows.length > 0;
}

module.exports = { list, getById, create, adjustStock, deactivate };