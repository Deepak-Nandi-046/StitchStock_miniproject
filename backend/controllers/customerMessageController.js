const store = require('../db/customerMessageStore');
const users = require('../auth/users');
const profileStore = require('../db/profileStore');
const customerStore = require('../db/customerStore');
const { recordAudit } = require('../engines/e3-audit');

exports.create = async (req, res) => {
  const body = req.body || {};
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const message = typeof (body.text || body.message) === 'string' ? (body.text || body.message).trim() : '';
  const demoUser = users.findById(req.user.id);
  const [profile, customers] = await Promise.all([
    profileStore.get(req.user.id, {}),
    customerStore.list(),
  ]);
  const customerProfile = customers.find(customer => String(customer.id) === String(req.user.id)) || {};
  const email = typeof body.email === 'string'
    ? body.email.trim().toLowerCase()
    : req.user.email || (demoUser && demoUser.email) || '';
  if (subject.length > 120 || message.length < 1 || message.length > 3000 ||
      !/^\S+@\S+\.\S+$/.test(email))
    return res.status(400).json({ error: 'Enter a subject, valid email, and message up to 3,000 characters.' });

  const saved = await store.create({
    customerId: req.user.id,
    customerName: req.user.name,
    customerEmail: email,
    customerPhone: profile.phone || customerProfile.phone || '',
    customerAvatar: profile.avatarUrl || customerProfile.avatarUrl || '',
    subject,
    message,
  });
  await recordAudit({ actor: req.user.id, action: 'CUSTOMER_MESSAGE', entity: 'message', entityId: saved.id });
  res.status(201).json(saved);
};

exports.mine = async (req, res) => res.json(await store.listForCustomer(req.user.id));
exports.unread = async (req, res) => res.json({ count: await store.unreadForCustomer(req.user.id) });
exports.list = async (req, res) => {
  const [threads, customers] = await Promise.all([store.listAll(), customerStore.list()]);
  const customerById = new Map(customers.map(customer => [String(customer.id), customer]));
  res.json(await Promise.all(threads.map(async thread => {
    const savedProfile = await profileStore.get(thread.customerId, {});
    const customer = customerById.get(String(thread.customerId)) || {};
    return {
      ...thread,
      customerPhone: savedProfile.phone || customer.phone || thread.customerPhone || '',
      customerAvatar: savedProfile.avatarUrl || customer.avatarUrl || thread.customerAvatar || '',
    };
  })));
};

exports.reply = async (req, res) => {
  const body = req.body || {};
  const reply = typeof body.reply === 'string' ? body.reply.trim() : '';
  const status = body.status;
  if (reply.length > 3000 || (status && !['Open', 'Closed'].includes(status)) ||
      (body.markRead !== undefined && typeof body.markRead !== 'boolean'))
    return res.status(400).json({ error: 'Enter a valid message reply or message status.' });
  const message = await store.reply(req.params.messageId, { reply, status, markRead: body.markRead });
  if (!message) return res.status(404).json({ error: 'Customer message not found.' });
  await recordAudit({
    actor: req.user.id,
    action: 'CUSTOMER_MESSAGE_UPDATED',
    entity: 'message',
    entityId: message.id,
    details: { status: message.status },
  });
  res.json(message);
};
