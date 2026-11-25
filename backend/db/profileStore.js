// Profile = public.customer (customers) or public.user_profile (owner).
const { query } = require('./pool');
const customerStore = require('./customerStore');

async function get(id, defaults = {}) {
  if (!customerStore.isUuid(id)) return { ...defaults };
  const customer = await customerStore.get(id);
  if (customer) {
    return { ...defaults, id: customer.id, name: customer.name, email: customer.email, phone: customer.phone,
             address: customer.address, pincode: customer.pincode, avatarUrl: customer.avatarUrl };
  }
  const rows = await query('select full_name from user_profile where user_id = $1', [id]);
  return rows[0] ? { ...defaults, id, name: rows[0].full_name } : { ...defaults };
}

async function update(id, updates) {
  if (!customerStore.isUuid(id)) return { id, ...updates };
  if (updates.name) await query('update user_profile set full_name = $2 where user_id = $1', [id, updates.name]);
  const map = { name: 'full_name', email: 'email', phone: 'phone', address: 'address', pincode: 'pincode', avatarUrl: 'avatar_url' };
  const sets = []; const values = [id];
  Object.entries(map).forEach(([key, column]) => {
    if (updates[key] === undefined) return;
    values.push(key === 'email' ? String(updates[key]).toLowerCase() : updates[key]);
    sets.push(`${column} = $${values.length}`);
  });
  if (sets.length) await query(`update customer set ${sets.join(', ')} where customer_id = $1`, values);
  return get(id, { id });
}

module.exports = { get, update };
