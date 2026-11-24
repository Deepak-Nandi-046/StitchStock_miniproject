const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { writeJson } = require('./jsonFile');

const recordsPath = path.join(__dirname, '..', 'data', 'customer-messages.json');
let conversations;
let writes = Promise.resolve();

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

async function load() {
  if (conversations) return conversations;
  try {
    const records = JSON.parse(await fs.readFile(recordsPath, 'utf8'));
    if (!Array.isArray(records)) throw new Error('Customer message data must be an array');
    const byCustomer = new Map();
    records.forEach(record => {
      const customerId = String(record.customerId);
      let thread = byCustomer.get(customerId);
      if (!thread) {
        thread = {
          id: record.id,
          customerId: record.customerId,
          customerName: record.customerName || 'Customer',
          customerEmail: record.customerEmail || '',
          status: record.status === 'Closed' ? 'Closed' : 'Open',
          createdAt: record.createdAt,
          updatedAt: record.updatedAt || record.createdAt,
          messages: [],
        };
        byCustomer.set(customerId, thread);
      }
      thread.messages.push(...(Array.isArray(record.messages) ? record.messages : legacyMessages(record)));
      if (new Date(record.createdAt) < new Date(thread.createdAt)) thread.createdAt = record.createdAt;
      if (new Date(record.updatedAt || record.createdAt) > new Date(thread.updatedAt))
        thread.updatedAt = record.updatedAt || record.createdAt;
    });
    conversations = [...byCustomer.values()];
    conversations.forEach(thread => thread.messages.sort((a, b) => new Date(a.at) - new Date(b.at)));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    conversations = [];
  }
  return conversations;
}

function save() {
  writes = writes.then(() => writeJson(recordsPath, conversations));
  return writes;
}

async function create({ customerId, customerName, customerEmail, customerPhone, customerAvatar, subject, message }) {
  await load();
  let record = conversations.find(item => String(item.customerId) === String(customerId));
  const now = new Date().toISOString();
  if (!record) {
    record = {
      id: crypto.randomUUID(),
      customerId,
      customerName,
      customerEmail,
      customerPhone: customerPhone || '',
      customerAvatar: customerAvatar || '',
      status: 'Open',
      createdAt: now,
      messages: [],
    };
    conversations.unshift(record);
  }
  record.customerName = customerName || record.customerName;
  record.customerEmail = customerEmail || record.customerEmail;
  record.customerPhone = customerPhone || record.customerPhone || '';
  record.customerAvatar = customerAvatar || record.customerAvatar || '';
  record.status = 'Open';
  record.updatedAt = now;
  record.messages.push({
    id: crypto.randomUUID(),
    sender: 'customer',
    text: message,
    subject: subject || '',
    at: now,
    readByAdmin: false,
    readByCustomer: true,
  });
  await save();
  return record;
}

async function listAll() {
  return [...await load()].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}

async function listForCustomer(customerId) {
  const thread = (await load()).find(message => String(message.customerId) === String(customerId));
  if (!thread) return null;
  const unreadCount = thread.messages.filter(message => message.sender === 'admin' && !message.readByCustomer).length;
  thread.messages.forEach(message => {
    if (message.sender === 'admin') message.readByCustomer = true;
  });
  await save();
  return { ...thread, unreadCount };
}

async function unreadForCustomer(customerId) {
  const thread = (await load()).find(message => String(message.customerId) === String(customerId));
  return thread ? thread.messages.filter(message => message.sender === 'admin' && !message.readByCustomer).length : 0;
}

async function reply(id, { reply, status, markRead }) {
  await load();
  const message = conversations.find(item => item.id === id);
  if (!message) return null;
  if (reply) {
    const now = new Date().toISOString();
    message.messages.push({
      id: crypto.randomUUID(),
      sender: 'admin',
      text: reply,
      at: now,
      readByAdmin: true,
      readByCustomer: false,
    });
    message.status = 'Open';
    message.updatedAt = now;
  }
  if (status) {
    message.status = status;
  }
  if (markRead) {
    message.messages.forEach(item => {
      if (item.sender === 'customer') item.readByAdmin = true;
    });
  }
  message.updatedAt = new Date().toISOString();
  await save();
  return message;
}

module.exports = { create, listAll, listForCustomer, unreadForCustomer, reply };
