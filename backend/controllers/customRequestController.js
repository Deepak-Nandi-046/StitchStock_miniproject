const path = require('path');
const store = require('../db/customRequestStore');
const users = require('../auth/users');

const allowedTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime',
]);
const imageLimit = 2 * 1024 * 1024;
const videoLimit = 8 * 1024 * 1024;
const productTypes = new Set(['Bags', 'Flowers or bouquet', 'Home decor', 'Accessory', 'Keychain', 'Other custom design']);
const colors = new Set(['No preference', 'Blush pink', 'Cream', 'Lavender', 'Sage green', 'Other (describe below)']);
const sizes = new Set(['Small', 'Medium', 'Large', 'Custom size (describe below)', 'No preference']);
const budgets = new Set(['Under ₹500', '₹500–₹1,000', '₹1,000–₹2,500', '₹2,500–₹5,000', 'Flexible']);
const occasions = new Set(['Birthday', 'Anniversary', 'Festival', 'Thank you', 'Wedding', 'Just because', 'Other']);
const requestStatuses = new Set([
  'Submitted', 'Under Review', 'Need More Details', 'Offer Sent',
  'Accepted', 'Rejected', 'Order Confirmed',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseAttachments(input) {
  if (input == null) return [];
  if (!Array.isArray(input) || input.length > 4)
    throw Object.assign(new Error('Choose up to 3 photos and 1 video.'), { status: 400 });

  let photoCount = 0;
  let videoCount = 0;
  return input.map(file => {
    const match = file && typeof file.data === 'string'
      ? file.data.match(/^data:([^;]+);base64,([A-Za-z0-9+/]+={0,2})$/)
      : null;
    if (!match || !allowedTypes.has(match[1]))
      throw Object.assign(new Error('Unsupported attachment. Use JPG, PNG, WebP, GIF, MP4, WebM, or MOV.'), { status: 400 });

    const mimeType = match[1];
    const isVideo = mimeType.startsWith('video/');
    photoCount += isVideo ? 0 : 1;
    videoCount += isVideo ? 1 : 0;
    if (photoCount > 3 || videoCount > 1)
      throw Object.assign(new Error('Choose up to 3 photos and 1 video.'), { status: 400 });

    const buffer = Buffer.from(match[2], 'base64');
    const limit = isVideo ? videoLimit : imageLimit;
    if (!buffer.length || buffer.length > limit)
      throw Object.assign(new Error(isVideo ? 'The video must be 8 MB or smaller.' : 'Each photo must be 2 MB or smaller.'), { status: 400 });

    const name = typeof file.name === 'string' ? path.basename(file.name).replace(/[\u0000-\u001f"]/g, '').slice(0, 150) : '';
    return { name: name || `attachment.${mimeType.split('/')[1]}`, mimeType, buffer };
  });
}

exports.create = async (req, res) => {
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
  if (!description || description.length > 3000)
    return res.status(400).json({ error: 'Describe your request in 1 to 3,000 characters.' });
  const preferences = {
    productType: req.body.productType,
    color: req.body.color,
    size: req.body.size,
    budget: req.body.budget,
    occasion: req.body.occasion,
  };
  if (!productTypes.has(preferences.productType) || !colors.has(preferences.color) ||
      !sizes.has(preferences.size) || !budgets.has(preferences.budget) ||
      !occasions.has(preferences.occasion))
    return res.status(400).json({ error: 'Choose a product type, colour, size, budget, and occasion.' });
  const demoUser = users.findById(req.user.id);
  const customerEmail = typeof req.body.customerEmail === 'string'
    ? req.body.customerEmail.trim().toLowerCase()
    : req.user.email || (demoUser && demoUser.email) || '';
  if (!/^\S+@\S+\.\S+$/.test(customerEmail))
    return res.status(400).json({ error: 'Enter a valid contact email address.' });

  let attachments;
  try {
    attachments = parseAttachments(req.body.attachments);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }

  const request = await store.create({
    customerId: req.user.id,
    customerName: req.user.name,
    customerEmail,
    customerPhone: typeof req.body.customerPhone === 'string' ? req.body.customerPhone.trim().slice(0, 30) : '',
    ...preferences,
    description,
    attachments,
  });
  res.status(201).json(request);
};

exports.mine = async (req, res) => {
  res.json(await store.listForCustomer(req.user.id));
};

exports.list = async (req, res) => {
  res.json(await store.listAll());
};

exports.markViewed = async (req, res) => {
  const { requestIds } = req.body || {};
  if (!Array.isArray(requestIds) || requestIds.some(id => typeof id !== 'string' || !UUID.test(id)))
    return res.status(400).json({ error: 'Provide valid custom request IDs to mark as viewed.' });
  res.json({ marked: await store.markViewed(requestIds) });
};

exports.update = async (req, res) => {
  const body = req.body || {};
  const status = body.status;
  if (!requestStatuses.has(status))
    return res.status(400).json({ error: 'Choose a valid custom request status.' });
  const adminReply = typeof body.adminReply === 'string' ? body.adminReply.trim() : '';
  const estimatedCompletion = typeof body.estimatedCompletion === 'string' ? body.estimatedCompletion.trim() : '';
  const quotedPrice = body.quotedPrice === '' || body.quotedPrice == null
    ? null
    : Number(body.quotedPrice);
  if (adminReply.length > 3000)
    return res.status(400).json({ error: 'The reply must be 3,000 characters or fewer.' });
  if (estimatedCompletion.length > 100)
    return res.status(400).json({ error: 'The estimated completion must be 100 characters or fewer.' });
  if (quotedPrice !== null && (!Number.isFinite(quotedPrice) || quotedPrice < 1 || quotedPrice > 10000000))
    return res.status(400).json({ error: 'Enter a valid quotation amount.' });
  if (status === 'Offer Sent' && quotedPrice === null)
    return res.status(400).json({ error: 'Add a quotation before sending an offer.' });

  const request = await store.update(req.params.requestId, {
    status,
    adminReply,
    quotedPrice,
    estimatedCompletion,
  });
  if (!request) return res.status(404).json({ error: 'Custom request not found.' });
  res.json(request);
};

exports.respondToOffer = async (req, res) => {
  const { decision, paymentMethod } = req.body || {};
  if (!['accept', 'reject'].includes(decision) ||
      (decision === 'accept' && paymentMethod !== 'advance'))
    return res.status(400).json({ error: 'Choose to accept with an advance payment or reject the offer.' });
  const request = await store.respondToOffer(req.params.requestId, req.user.id, decision, paymentMethod);
  if (!request) return res.status(404).json({ error: 'Custom request not found.' });
  if (request.error) return res.status(409).json({ error: request.error });
  res.json(request);
};

exports.confirmAdvancePayment = async (req, res) => {
  const request = await store.confirmAdvancePayment(req.params.requestId, req.user.id);
  if (!request) return res.status(404).json({ error: 'Custom request not found.' });
  if (request.error) return res.status(409).json({ error: request.error });
  res.json(request);
};

exports.file = async (req, res) => {
  const result = await store.getFile(req.params.requestId, req.params.fileId);
  if (!result || (req.user.role !== 'owner' && result.request.customerId !== req.user.id))
    return res.status(404).json({ error: 'Attachment not found.' });

  res.setHeader('X-Content-Type-Options', 'nosniff');
  const disposition = req.query.inline === 'true' ? 'inline' : 'attachment';
  res.setHeader('Content-Disposition', `${disposition}; filename="${result.attachment.id}${path.extname(result.attachment.storageName)}"`);
  res.type(result.attachment.mimeType).sendFile(result.path, error => {
    if (error && !res.headersSent) res.status(error.statusCode || 500).json({ error: 'Could not load attachment.' });
  });
};
