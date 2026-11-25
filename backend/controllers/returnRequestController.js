const crypto = require('crypto');
const path = require('path');
const productStore = require('../db/productStore');
const orderStore = require('../db/orderStore');
const orderController = require('./orderController');
const store = require('../db/returnRequestStore');
const storage = require('../db/storage');
const { recordAudit } = require('../engines/e3-audit');

const EVIDENCE_BUCKET = 'return-evidence';
const evidenceTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp',
  'video/mp4', 'video/webm', 'video/quicktime',
]);
const extensionByType = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

function parseEvidence(input) {
  if (input == null) return [];
  if (!Array.isArray(input) || input.length > 4)
    throw Object.assign(new Error('Choose up to 3 photos and 1 video.'), { status: 400 });

  let photoCount = 0;
  let videoCount = 0;
  return input.map(file => {
    const match = file && typeof file.data === 'string'
      ? file.data.match(/^data:([^;]+);base64,([A-Za-z0-9+/]+={0,2})$/)
      : null;
    if (!match || !evidenceTypes.has(match[1]))
      throw Object.assign(new Error('Evidence must be JPG, PNG, WebP, MP4, WebM, or MOV.'), { status: 400 });

    const mimeType = match[1];
    const isVideo = mimeType.startsWith('video/');
    photoCount += isVideo ? 0 : 1;
    videoCount += isVideo ? 1 : 0;
    if (photoCount > 3 || videoCount > 1)
      throw Object.assign(new Error('Choose up to 3 photos and 1 video.'), { status: 400 });

    const buffer = Buffer.from(match[2], 'base64');
    const limit = isVideo ? 8 * 1024 * 1024 : 2 * 1024 * 1024;
    if (!buffer.length || buffer.length > limit)
      throw Object.assign(new Error(isVideo ? 'Videos must be 8 MB or smaller.' : 'Photos must be 2 MB or smaller.'), { status: 400 });

    const name = typeof file.name === 'string'
      ? path.basename(file.name).replace(/[\u0000-\u001f"]/g, '').slice(0, 150)
      : '';
    return { name: name || `evidence.${extensionByType[mimeType]}`, mimeType, buffer };
  });
}

function parseRejectionReason(status, input) {
  const reason = typeof input === 'string' ? input.trim() : '';
  if (status === 'Rejected' && (!reason || reason.length > 1000))
    throw Object.assign(new Error('Enter a rejection reason up to 1,000 characters.'), { status: 400 });
  return reason;
}

async function uploadEvidence(customerId, file) {
  const filePath = `${customerId}/${crypto.randomUUID()}.${extensionByType[file.mimeType]}`;
  const upload = () => storage.upload(EVIDENCE_BUCKET, filePath, file.buffer, file.mimeType);
  try {
    await upload();
  } catch (firstError) {
    try {
      await storage.ensureBucket(EVIDENCE_BUCKET);
      await upload();
    } catch (error) {
      error.message = `Could not store return evidence: ${error.message || firstError.message}`;
      throw error;
    }
  }
  return { path: filePath, name: file.name, mimeType: file.mimeType, size: file.buffer.length };
}

exports.create = async (req, res) => {
  const body = req.body || {};
  const found = await orderStore.getById(body.orderId);
  const order = found && found.customerId === req.user.id ? found : null;
  if (!order) return res.status(404).json({ error: 'Order not found in your current orders.' });
  const type = body.type;
  if ((type === 'Cancellation' && !['Placed', 'Confirmed'].includes(order.status)) ||
      (type === 'Return' && order.status !== 'Delivered') ||
      !['Cancellation', 'Return'].includes(type))
    return res.status(409).json({ error: 'This order is not eligible for that request.' });
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message || message.length > 1000)
    return res.status(400).json({ error: 'Add a reason up to 1,000 characters.' });

  let evidence;
  try {
    evidence = parseEvidence(body.evidence);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }
  if (type !== 'Return' && evidence.length)
    return res.status(400).json({ error: 'Photos or videos can only be attached to a return request.' });

  const product = await productStore.getById(order.productId);
  const uploaded = [];
  try {
    for (const file of evidence) uploaded.push(await uploadEvidence(req.user.id, file));
    const request = await store.create({
      id: crypto.randomUUID(),
      orderId: order.id,
      customerId: req.user.id,
      customerName: order.customerName || req.user.name,
      customerEmail: order.customerEmail || req.user.email || '',
      type,
      productName: product ? product.name : 'Handmade item',
      quantity: order.qty,
      orderStatus: order.status,
      message,
      evidence: uploaded,
    });
    if (request.error) {
      await storage.remove(EVIDENCE_BUCKET, uploaded.map(file => file.path));
      return res.status(409).json({ error: request.error });
    }
    await recordAudit({ actor: req.user.id, action: 'RETURN_REQUEST_CREATED', entity: 'return', entityId: request.id });
    res.status(201).json(request);
  } catch (error) {
    await storage.remove(EVIDENCE_BUCKET, uploaded.map(file => file.path));
    throw error;
  }
};

exports.mine = async (req, res) => res.json(await store.listForCustomer(req.user.id));
exports.list = async (req, res) => res.json(await store.listAll());

exports.update = async (req, res) => {
  const status = req.body && req.body.status;
  if (!['Under Review', 'Approved', 'Rejected', 'Completed'].includes(status))
    return res.status(400).json({ error: 'Choose a valid return or cancellation status.' });
  let rejectionReason;
  try {
    rejectionReason = parseRejectionReason(status, req.body && req.body.rejectionReason);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }

  const requests = await store.listAll();
  const request = requests.find(item => item.id === req.params.requestId);
  if (!request) return res.status(404).json({ error: 'Request not found.' });
  if (request.type === 'Cancellation' && status === 'Approved') {
    const result = await orderController.cancelConfirmedOrder(request.orderId, req.user.id);
    if (result.error) return res.status(result.status).json({ error: result.error });
  }
  const updated = await store.update(request.id, status, rejectionReason);
  if (!updated) return res.status(404).json({ error: 'Request not found.' });
  await recordAudit({
    actor: req.user.id,
    action: 'RETURN_REQUEST_UPDATED',
    entity: 'return',
    entityId: updated.id,
    details: { status },
  });
  res.json(updated);
};

exports.parseEvidence = parseEvidence;
exports.parseRejectionReason = parseRejectionReason;
