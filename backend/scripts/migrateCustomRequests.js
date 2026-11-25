const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { query, pool } = require('../db/pool');
const { runInTransaction } = require('../engines/e2-safety');

const dataDirectory = path.join(__dirname, '..', 'data');
const recordsPath = path.join(dataDirectory, 'custom-requests.json');
const uploadDirectory = path.join(dataDirectory, 'custom-requests');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stableUuid(value) {
  const bytes = crypto.createHash('sha256').update(value).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizeStatus(status) {
  return ({
    Received: 'Submitted',
    Reviewing: 'Under Review',
    'In Progress': 'Order Confirmed',
    Completed: 'Order Confirmed',
    Declined: 'Rejected',
  })[status] || status || 'Submitted';
}

async function importRequest(record) {
  const customerId = String(record.customerId || '');
  if (!UUID.test(customerId)) throw new Error('Legacy custom request has an invalid customer id.');
  const requestId = UUID.test(String(record.id))
    ? record.id
    : stableUuid(`custom-request:${record.id || customerId}`);
  const attachments = Array.isArray(record.attachments) ? record.attachments : [];

  for (const attachment of attachments) {
    if (!UUID.test(String(attachment.id)) || typeof attachment.name !== 'string' ||
        typeof attachment.mimeType !== 'string' || !Number.isInteger(attachment.size))
      throw new Error('Legacy custom request contains invalid attachment metadata.');
    if (typeof attachment.storageName !== 'string' ||
        path.basename(attachment.storageName) !== attachment.storageName)
      throw new Error('Legacy custom request contains an invalid attachment path.');
    await fs.access(path.join(uploadDirectory, attachment.storageName));
  }

  return runInTransaction(async conn => {
    const [inserted] = await query(
      `insert into customization_request
         (customization_id, customer_id, customer_email, customer_phone, requested_details,
          agreed_price, admin_reply, estimated_completion, customization_status,
          advance_amount, advance_status, advance_confirmed_at, created_at, updated_at)
       values ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       on conflict (customization_id) do nothing
       returning customization_id`,
      [
        requestId,
        customerId,
        record.customerEmail || '',
        record.customerPhone || '',
        JSON.stringify({
          customerName: record.customerName || '',
          productType: record.productType || '',
          color: record.color || '',
          size: record.size || '',
          budget: record.budget || '',
          occasion: record.occasion || '',
          description: record.description || '',
        }),
        record.quotedPrice != null && Number.isFinite(Number(record.quotedPrice))
          ? Number(record.quotedPrice)
          : null,
        record.adminReply || '',
        record.estimatedCompletion || '',
        normalizeStatus(record.status),
        record.paymentAmount != null && Number.isFinite(Number(record.paymentAmount))
          ? Number(record.paymentAmount)
          : null,
        record.paymentStatus || null,
        record.paymentConfirmedAt || null,
        record.createdAt || new Date().toISOString(),
        record.updatedAt || null,
      ],
      conn,
    );
    if (!inserted) return { requests: 0, attachments: 0 };

    for (const attachment of attachments) {
      await query(
        `insert into customization_attachment
           (attachment_id, customization_id, file_name, mime_type, size_bytes, storage_path)
         values ($1,$2,$3,$4,$5,$6)`,
        [
          attachment.id,
          requestId,
          attachment.name,
          attachment.mimeType,
          attachment.size,
          attachment.storageName,
        ],
        conn,
      );
    }
    return { requests: 1, attachments: attachments.length };
  });
}

async function main() {
  let records;
  try {
    records = JSON.parse(await fs.readFile(recordsPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('No legacy custom requests found; nothing to import.');
      return;
    }
    throw error;
  }
  if (!Array.isArray(records)) throw new Error('Legacy custom request data must be an array.');

  let importedRequests = 0;
  let importedAttachments = 0;
  for (const record of records) {
    const result = await importRequest(record);
    importedRequests += result.requests;
    importedAttachments += result.attachments;
  }
  console.log(`Imported ${importedRequests} custom request(s) and ${importedAttachments} attachment record(s).`);
}

main()
  .catch(error => {
    console.error('Could not import legacy custom requests:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (pool) await pool.end();
  });
