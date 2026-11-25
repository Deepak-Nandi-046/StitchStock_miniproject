// E3 – DBMS: audit trail stored in public.audit_log.
const { query } = require('../../db/pool');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asId = value => (Number.isInteger(Number(value)) && value !== null && value !== '' ? Number(value) : null);

// recordAudit({ actor, action, entity, entityId, details }, conn?)
// Pass `conn` to make the audit row part of the same transaction as the change.
async function recordAudit({ actor, action, entity, entityId, details = {} }, conn) {
  const fk = { order: null, product: null, payment: null, preorder: null };
  if (entity in fk) fk[entity] = asId(entityId);
  const actorId = UUID.test(String(actor || '')) ? String(actor) : null;
  const sql = `
    insert into audit_log (actor_id, actor_role, order_id, payment_id, product_id, preorder_id, event_type, event_details)
    values (
      (select user_id from user_profile where user_id = $1::uuid),
      (select role    from user_profile where user_id = $1::uuid),
      $2, $3, $4, $5, $6, $7::jsonb)`;
  const params = [actorId, fk.order, fk.payment, fk.product, fk.preorder, action,
                  JSON.stringify({ entity, entityId, ...details })];
  if (conn) return query(sql, params, conn);           // inside a transaction: let errors abort it
  try { await query(sql, params); } catch (error) { console.error('Audit write failed:', error.message); }
}

async function listAudit(limit = 50) {
  const rows = await query(
    `select audit_id, actor_id, event_type, event_time, event_details
       from audit_log order by event_time desc, audit_id desc limit $1`, [limit]);
  return rows.map(row => {
    const { entity, entityId, ...details } = row.event_details || {};
    return { actor: row.actor_id, action: row.event_type, entity, entityId, details, at: row.event_time };
  });
}
module.exports = { recordAudit, listAudit };
