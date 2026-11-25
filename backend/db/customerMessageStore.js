const { query } = require('./pool');
const { runInTransaction } = require('../engines/e2-safety');

const THREAD_SELECT = `
  select mt.thread_id as id,
         mt.customer_id as "customerId",
         c.full_name as "customerName",
         c.email as "customerEmail",
         coalesce(c.phone, '') as "customerPhone",
         coalesce(c.avatar_url, '') as "customerAvatar",
         mt.status,
         mt.created_at as "createdAt",
         mt.updated_at as "updatedAt"
    from message_thread mt
    join customer c on c.customer_id = mt.customer_id`;

async function hydrate(rows, conn) {
  if (!rows.length) return [];
  const ids = rows.map(thread => thread.id);
  const messages = await query(
    `select message_id as id,
            thread_id as "threadId",
            sender,
            subject,
            body as text,
            sent_at as at,
            read_by_admin as "readByAdmin",
            read_by_customer as "readByCustomer"
       from message
      where thread_id = any($1::uuid[])
      order by sent_at, message_id`,
    [ids],
    conn,
  );
  const grouped = new Map(ids.map(id => [id, []]));
  messages.forEach(message => grouped.get(message.threadId).push({
    id: message.id,
    sender: message.sender,
    text: message.text,
    subject: message.subject || '',
    at: message.at,
    readByAdmin: message.readByAdmin,
    readByCustomer: message.readByCustomer,
  }));
  return rows.map(thread => ({
    ...thread,
    customerName: thread.customerName || 'Customer',
    customerEmail: thread.customerEmail || '',
    customerPhone: thread.customerPhone || '',
    customerAvatar: thread.customerAvatar || '',
    messages: grouped.get(thread.id) || [],
  }));
}

async function getById(id, conn) {
  const rows = await query(`${THREAD_SELECT} where mt.thread_id = $1`, [id], conn);
  return (await hydrate(rows, conn))[0] || null;
}

async function create({ customerId, subject, message }) {
  return runInTransaction(async conn => {
    const [thread] = await query(
      `insert into message_thread (customer_id, status)
       values ($1, 'Open')
       on conflict (customer_id) do update
         set status = 'Open', updated_at = now()
       returning thread_id`,
      [customerId],
      conn,
    );
    await query(
      `insert into message
         (thread_id, sender, subject, body, read_by_admin, read_by_customer)
       values ($1, 'customer', $2, $3, false, true)`,
      [thread.thread_id, subject || '', message],
      conn,
    );
    await query('update message_thread set updated_at = now() where thread_id = $1', [thread.thread_id], conn);
    return getById(thread.thread_id, conn);
  });
}

async function listAll() {
  const threads = await query(`${THREAD_SELECT} order by mt.updated_at desc, mt.thread_id`);
  return hydrate(threads);
}

async function listForCustomer(customerId) {
  return runInTransaction(async conn => {
    const threads = await query(`${THREAD_SELECT} where mt.customer_id = $1`, [customerId], conn);
    if (!threads.length) return null;
    const threadId = threads[0].id;
    const [unread] = await query(
      `select count(*)::integer as count
         from message
        where thread_id = $1 and sender = 'admin' and read_by_customer = false`,
      [threadId],
      conn,
    );
    await query(
      `update message set read_by_customer = true
        where thread_id = $1 and sender = 'admin' and read_by_customer = false`,
      [threadId],
      conn,
    );
    const [thread] = await hydrate(threads, conn);
    thread.unreadCount = unread.count;
    return thread;
  });
}

async function unreadForCustomer(customerId) {
  const [row] = await query(
    `select count(*)::integer as count
       from message m
       join message_thread t on t.thread_id = m.thread_id
      where t.customer_id = $1 and m.sender = 'admin' and m.read_by_customer = false`,
    [customerId],
  );
  return row.count;
}

async function reply(id, { reply, status, markRead }) {
  return runInTransaction(async conn => {
    const [thread] = await query(
      'select thread_id from message_thread where thread_id = $1 for update',
      [id],
      conn,
    );
    if (!thread) return null;

    if (reply) {
      await query(
        `insert into message
           (thread_id, sender, subject, body, read_by_admin, read_by_customer)
         values ($1, 'admin', '', $2, true, false)`,
        [id, reply],
        conn,
      );
      await query("update message_thread set status = 'Open' where thread_id = $1", [id], conn);
    }
    if (status)
      await query('update message_thread set status = $2 where thread_id = $1', [id, status], conn);
    if (markRead)
      await query(
        `update message set read_by_admin = true
          where thread_id = $1 and sender = 'customer' and read_by_admin = false`,
        [id],
        conn,
      );

    await query('update message_thread set updated_at = now() where thread_id = $1', [id], conn);
    return getById(id, conn);
  });
}

module.exports = { create, listAll, listForCustomer, unreadForCustomer, reply };
