// Customers live in public.customer (id = Supabase Auth user id). Roles live in public.user_profile.
const { query } = require('./pool');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = value => UUID.test(String(value || ''));

const toApi = row => ({
  id: row.customer_id,
  name: row.full_name,
  email: row.email,
  phone: row.phone || '',
  address: row.address || '',
  pincode: row.pincode || '',
  avatarUrl: row.avatar_url || '',
  registeredAt: row.created_at,
  lastSeenAt: row.last_seen_at,
});

async function getRole(userId) {
  if (!isUuid(userId)) return null;
  const rows = await query('select role from user_profile where user_id = $1', [userId]);
  return rows[0] ? rows[0].role : null;
}

// Makes sure rows exist for users who signed up before the trigger was created.
async function ensureFromAuth(authUser) {
  const name = (authUser.user_metadata && authUser.user_metadata.name) || String(authUser.email || '').split('@')[0];
  await query(
    `insert into user_profile (user_id, full_name, role) values ($1, $2, 'customer') on conflict (user_id) do nothing`,
    [authUser.id, name]);
  if ((await getRole(authUser.id)) === 'customer') {
    await query(
      `insert into customer (customer_id, full_name, email) values ($1, $2, lower($3)) on conflict (customer_id) do nothing`,
      [authUser.id, name, authUser.email]);
  }
}

// Only the fields that are provided are changed (same behaviour as the old JSON store).
async function upsert(user, lastSeen = false) {
  if (!user || !isUuid(user.id) || user.role !== 'customer') return null;
  const fields = {
    full_name: user.name || undefined,
    email: user.email ? String(user.email).trim().toLowerCase() : undefined,
    phone: user.phone, address: user.address, pincode: user.pincode, avatar_url: user.avatarUrl,
  };
  const provided = Object.entries(fields).filter(([, value]) => value !== undefined);
  const insertCols = ['customer_id', 'full_name', 'email', ...provided.map(([k]) => k).filter(k => !['full_name', 'email'].includes(k))];
  const values = [user.id, fields.full_name || 'Customer', fields.email || `${user.id}@unknown.invalid`,
    ...provided.filter(([k]) => !['full_name', 'email'].includes(k)).map(([, v]) => v)];
  const updates = provided.map(([key]) => `${key} = excluded.${key}`);
  if (lastSeen) updates.push('last_seen_at = now()');
  const rows = await query(
    `insert into customer (${insertCols.join(', ')}) values (${values.map((_, i) => `$${i + 1}`).join(', ')})
     on conflict (customer_id) do update set ${updates.length ? updates.join(', ') : 'customer_id = customer.customer_id'}
     returning *`, values);
  return toApi(rows[0]);
}

async function list() {
  return (await query('select * from customer order by created_at')).map(toApi);
}

async function get(id) {
  if (!isUuid(id)) return null;
  const rows = await query('select * from customer where customer_id = $1', [id]);
  return rows[0] ? toApi(rows[0]) : null;
}

module.exports = { upsert, list, get, getRole, ensureFromAuth, isUuid };
