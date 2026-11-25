const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { query } = require('../db/pool');
const { runInTransaction } = require('../engines/e2-safety');

const recordsPath = path.join(__dirname, '..', 'data', 'customer-messages.json');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stableUuid(value) {
  const bytes = crypto.createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function legacyMessages(record) {
  return [
    {
      id: `${record.id}:customer`,
      sender: 'customer',
      text: record.message,
      subject: record.subject || '',
      at: record.createdAt,
      readByAdmin: record.status !== 'New',
      readByCustomer: true,
    },
    ...(record.adminReplies || []).map((reply, index) => ({
      id: `${record.id}:admin:${index}`,
      sender: 'admin',
      text: reply.text,
      at: reply.at,
      readByAdmin: true,
      readByCustomer: true,
    })),
  ];
}

function groupRecords(records) {
  const threads = new Map();
  records.forEach(record => {
    const customerId = String(record.customerId || '');
    if (!UUID.test(customerId)) throw new Error('Legacy message has an invalid customer id.');
    let thread = threads.get(customerId);
    if (!thread) {
      thread = {
        customerId,
        status: record.status === 'Closed' ? 'Closed' : 'Open',
        createdAt: record.createdAt || new Date().toISOString(),
        updatedAt: record.updatedAt || record.createdAt || new Date().toISOString(),
        messages: [],
      };
      threads.set(customerId, thread);
    }
    thread.messages.push(...(Array.isArray(record.messages) ? record.messages : legacyMessages(record)));
    if (new Date(record.createdAt) < new Date(thread.createdAt)) thread.createdAt = record.createdAt;
    if (new Date(record.updatedAt || record.createdAt) > new Date(thread.updatedAt))
      thread.updatedAt = record.updatedAt || record.createdAt;
  });
  return [...threads.values()];
}

async function importThread(thread) {
  return runInTransaction(async conn => {
    let [saved] = await query(
      `insert into message_thread (thread_id, customer_id, status, created_at, updated_at)
       values ($1,$2,$3,$4,$5)
       on conflict (customer_id) do nothing
       returning thread_id`,
      [crypto.randomUUID(), thread.customerId, thread.status, thread.createdAt, thread.updatedAt],
      conn,
    );
    if (!saved) {
      [saved] = await query(
        'select thread_id from message_thread where customer_id = $1 for update',
        [thread.customerId],
        conn,
      );
    }
    if (!saved) throw new Error('Could not create or find a legacy customer conversation.');

    let imported = 0;
    for (const [index, message] of thread.messages.entries()) {
      if (!['customer', 'admin'].includes(message.sender) || typeof message.text !== 'string')
        throw new Error('Legacy conversation contains an invalid message.');
      const sourceId = message.id || `${index}:${message.sender}:${message.at || ''}`;
      const id = UUID.test(String(sourceId))
        ? sourceId
        : stableUuid(`${thread.customerId}:${sourceId}`);
      const rows = await query(
        `insert into message
           (message_id, thread_id, sender, subject, body, sent_at, read_by_admin, read_by_customer)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (message_id) do nothing
         returning message_id`,
        [
          id,
          saved.thread_id,
          message.sender,
          message.subject || '',
          message.text,
          message.at || thread.createdAt,
          typeof message.readByAdmin === 'boolean' ? message.readByAdmin : message.sender === 'admin',
          typeof message.readByCustomer === 'boolean' ? message.readByCustomer : message.sender === 'customer',
        ],
        conn,
      );
      imported += rows.length;
    }
    return imported;
  });
}

async function main() {
  let records;
  try {
    records = JSON.parse(await fs.readFile(recordsPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('No legacy customer messages found; nothing to import.');
      return;
    }
    throw error;
  }
  if (!Array.isArray(records)) throw new Error('Legacy customer message data must be an array.');

  const threads = groupRecords(records);
  let importedMessages = 0;
  for (const thread of threads) importedMessages += await importThread(thread);
  console.log(`Imported legacy history for ${threads.length} customer conversation(s); ${importedMessages} message(s) added.`);
}

main()
  .catch(error => {
    console.error('Could not import legacy customer messages:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { pool } = require('../db/pool');
    if (pool) await pool.end();
  });
