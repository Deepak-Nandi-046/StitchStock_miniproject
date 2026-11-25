const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { query } = require('./pool');
const { runInTransaction } = require('../engines/e2-safety');

const uploadDirectory = path.join(__dirname, '..', 'data', 'custom-requests');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const extensionByType = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

const REQUEST_SELECT = `
  select request.customization_id as id,
         request.customer_id as "customerId",
         coalesce(nullif(request.requested_details->>'customerName', ''), customer.full_name) as "customerName",
         request.customer_email as "customerEmail",
         coalesce(request.customer_phone, '') as "customerPhone",
         request.requested_details as details,
         request.agreed_price as "quotedPrice",
         request.admin_reply as "adminReply",
         request.estimated_completion as "estimatedCompletion",
         request.customization_status as status,
         request.advance_amount as "paymentAmount",
         request.advance_status as "paymentStatus",
         request.advance_confirmed_at as "paymentConfirmedAt",
         request.admin_viewed_at as "adminViewedAt",
         request.created_at as "createdAt",
         request.updated_at as "updatedAt"
    from customization_request request
    join customer on customer.customer_id = request.customer_id`;

function mapStatus(status) {
  return ({
    Received: 'Submitted',
    Reviewing: 'Under Review',
    'In Progress': 'Order Confirmed',
    Completed: 'Order Confirmed',
    Declined: 'Rejected',
  })[status] || status;
}

function publicRequest(row, attachments = []) {
  const details = typeof row.details === 'string' ? JSON.parse(row.details) : row.details || {};
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: row.customerName || 'Customer',
    customerEmail: row.customerEmail || '',
    customerPhone: row.customerPhone || '',
    productType: details.productType || '',
    color: details.color || '',
    size: details.size || '',
    budget: details.budget || '',
    occasion: details.occasion || '',
    description: details.description || '',
    attachments: attachments.map(file => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
    })),
    status: mapStatus(row.status),
    adminReply: row.adminReply || '',
    quotedPrice: row.quotedPrice == null ? null : Number(row.quotedPrice),
    estimatedCompletion: row.estimatedCompletion || '',
    paymentMethod: row.paymentAmount == null ? '' : 'advance',
    paymentAmount: row.paymentAmount == null ? null : Number(row.paymentAmount),
    paymentStatus: row.paymentStatus || '',
    ...(row.paymentConfirmedAt ? { paymentConfirmedAt: row.paymentConfirmedAt } : {}),
    createdAt: row.createdAt,
    ...(row.updatedAt ? { updatedAt: row.updatedAt } : {}),
    adminViewedAt: row.adminViewedAt || null,
  };
}

async function hydrate(rows, conn) {
  if (!rows.length) return [];
  const ids = rows.map(row => row.id);
  const files = await query(
    `select attachment_id as id,
            customization_id as "requestId",
            file_name as name,
            mime_type as "mimeType",
            size_bytes as size,
            storage_path as "storageName"
       from customization_attachment
      where customization_id = any($1::uuid[])
      order by attachment_id`,
    [ids],
    conn,
  );
  const grouped = new Map(ids.map(id => [id, []]));
  files.forEach(file => grouped.get(file.requestId).push(file));
  return rows.map(row => publicRequest(row, grouped.get(row.id)));
}

async function getById(id, conn) {
  const rows = await query(`${REQUEST_SELECT} where request.customization_id = $1`, [id], conn);
  return (await hydrate(rows, conn))[0] || null;
}

async function create(record) {
  await fs.mkdir(uploadDirectory, { recursive: true });
  const requestId = crypto.randomUUID();
  const savedAttachments = [];
  try {
    for (const attachment of record.attachments) {
      const extension = extensionByType[attachment.mimeType];
      if (!extension) throw new Error('Unsupported customization attachment type.');
      const fileId = crypto.randomUUID();
      const storageName = `${requestId}-${fileId}.${extension}`;
      await fs.writeFile(path.join(uploadDirectory, storageName), attachment.buffer, { flag: 'wx' });
      savedAttachments.push({ ...attachment, id: fileId, storageName });
    }

    return await runInTransaction(async conn => {
      await query(
        `insert into customization_request
           (customization_id, customer_id, customer_email, customer_phone, requested_details,
            customization_status)
         values ($1,$2,$3,$4,$5::jsonb,'Submitted')`,
        [
          requestId,
          record.customerId,
          record.customerEmail,
          record.customerPhone,
          JSON.stringify({
            customerName: record.customerName,
            productType: record.productType,
            color: record.color,
            size: record.size,
            budget: record.budget,
            occasion: record.occasion,
            description: record.description,
          }),
        ],
        conn,
      );
      for (const file of savedAttachments) {
        await query(
          `insert into customization_attachment
             (attachment_id, customization_id, file_name, mime_type, size_bytes, storage_path)
           values ($1,$2,$3,$4,$5,$6)`,
          [file.id, requestId, file.name, file.mimeType, file.buffer.length, file.storageName],
          conn,
        );
      }
      return getById(requestId, conn);
    });
  } catch (error) {
    await Promise.all(savedAttachments.map(file =>
      fs.unlink(path.join(uploadDirectory, file.storageName)).catch(unlinkError => {
        if (unlinkError.code !== 'ENOENT') throw unlinkError;
      })
    ));
    throw error;
  }
}

async function update(requestId, changes) {
  if (!UUID.test(String(requestId))) return null;
  return runInTransaction(async conn => {
    const [existing] = await query(
      `select customization_status as status
         from customization_request
        where customization_id = $1
        for update`,
      [requestId],
      conn,
    );
    if (!existing) return null;

    const resetAdvance = changes.status === 'Rejected' ||
      (changes.status === 'Offer Sent' && existing.status !== 'Offer Sent');
    await query(
      `update customization_request
          set customization_status = $2,
              admin_reply = $3,
              agreed_price = $4,
              estimated_completion = $5,
              advance_amount = case when $6 then null else advance_amount end,
              advance_status = case when $6 then null else advance_status end,
              advance_confirmed_at = case when $6 then null else advance_confirmed_at end,
              updated_at = now()
        where customization_id = $1`,
      [
        requestId,
        changes.status,
        changes.adminReply,
        changes.quotedPrice,
        changes.estimatedCompletion,
        resetAdvance,
      ],
      conn,
    );
    return getById(requestId, conn);
  });
}

async function respondToOffer(requestId, customerId, decision, paymentMethod) {
  if (!UUID.test(String(requestId)) || !UUID.test(String(customerId))) return null;
  return runInTransaction(async conn => {
    const [request] = await query(
      `select customization_status as status, agreed_price as "quotedPrice"
         from customization_request
        where customization_id = $1 and customer_id = $2
        for update`,
      [requestId, customerId],
      conn,
    );
    if (!request) return null;
    if (request.status !== 'Offer Sent' || request.quotedPrice == null)
      return { error: 'There is no active offer to respond to.' };
    if (decision === 'accept' && paymentMethod !== 'advance')
      return { error: 'Choose a valid advance payment method.' };

    const accepted = decision === 'accept';
    await query(
      `update customization_request
          set customization_status = $3,
              advance_amount = $4,
              advance_status = $5,
              advance_confirmed_at = null,
              updated_at = now()
        where customization_id = $1 and customer_id = $2`,
      [
        requestId,
        customerId,
        accepted ? 'Accepted' : 'Rejected',
        accepted ? Math.ceil(Number(request.quotedPrice) / 2) : null,
        accepted ? 'Pending' : null,
      ],
      conn,
    );
    return getById(requestId, conn);
  });
}

async function confirmAdvancePayment(requestId, customerId) {
  if (!UUID.test(String(requestId)) || !UUID.test(String(customerId))) return null;
  return runInTransaction(async conn => {
    const [request] = await query(
      `select customization_status as status, advance_status as "paymentStatus",
              advance_amount as "paymentAmount"
         from customization_request
        where customization_id = $1 and customer_id = $2
        for update`,
      [requestId, customerId],
      conn,
    );
    if (!request) return null;
    if (request.status !== 'Accepted' || request.paymentStatus !== 'Pending' ||
        request.paymentAmount == null)
      return { error: 'This request is not awaiting an advance payment.' };

    await query(
      `update customization_request
          set customization_status = 'Order Confirmed',
              advance_status = 'Customer marked advance paid',
              advance_confirmed_at = now(),
              updated_at = now()
        where customization_id = $1 and customer_id = $2`,
      [requestId, customerId],
      conn,
    );
    return getById(requestId, conn);
  });
}

async function listAll() {
  return hydrate(await query(
    `${REQUEST_SELECT} order by request.created_at desc, request.customization_id`,
  ));
}

async function listForCustomer(customerId) {
  if (!UUID.test(String(customerId))) return [];
  return (await hydrate(await query(
    `${REQUEST_SELECT}
      where request.customer_id = $1
      order by request.created_at desc, request.customization_id`,
    [customerId],
  ))).map(({ adminViewedAt, ...request }) => request);
}

async function markViewed(requestIds) {
  const ids = [...new Set(requestIds.filter(id => UUID.test(String(id))))];
  if (!ids.length) return 0;
  const rows = await query(
    `update customization_request
        set admin_viewed_at = now()
      where customization_id = any($1::uuid[])
        and admin_viewed_at is null
      returning customization_id`,
    [ids],
  );
  return rows.length;
}

async function getFile(requestId, fileId) {
  if (!UUID.test(String(requestId)) || !UUID.test(String(fileId))) return null;
  const request = await getById(requestId);
  if (!request) return null;
  const [file] = await query(
    `select attachment_id as id,
            file_name as name,
            mime_type as "mimeType",
            size_bytes as size,
            storage_path as "storageName"
       from customization_attachment
      where customization_id = $1 and attachment_id = $2`,
    [requestId, fileId],
  );
  if (!file) return null;
  if (path.basename(file.storageName) !== file.storageName)
    throw new Error('Invalid customization attachment storage path.');
  return { request, attachment: file, path: path.join(uploadDirectory, file.storageName) };
}

module.exports = {
  create,
  listAll,
  listForCustomer,
  getFile,
  update,
  respondToOffer,
  confirmAdvancePayment,
  markViewed,
};
