const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { writeJson } = require('./jsonFile');

const recordsPath = path.join(__dirname, '..', 'data', 'return-requests.json');
let requests;
let writes = Promise.resolve();

async function load() {
  if (requests) return requests;
  try {
    requests = JSON.parse(await fs.readFile(recordsPath, 'utf8'));
    if (!Array.isArray(requests)) throw new Error('Return request data must be an array');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    requests = [];
  }
  return requests;
}

function save() {
  writes = writes.then(() => writeJson(recordsPath, requests));
  return writes;
}

async function create(record) {
  await load();
  const existing = requests.find(item =>
    String(item.orderId) === String(record.orderId) &&
    item.customerId === record.customerId &&
    ['Pending', 'Under Review', 'Approved'].includes(item.status)
  );
  if (existing) return { error: 'There is already an open request for this order.' };
  const request = {
    id: crypto.randomUUID(),
    ...record,
    status: 'Pending',
    createdAt: new Date().toISOString(),
  };
  requests.unshift(request);
  await save();
  return request;
}

async function listAll() {
  return [...await load()];
}

async function listForCustomer(customerId) {
  return (await load()).filter(request => request.customerId === customerId);
}

async function update(id, status) {
  await load();
  const request = requests.find(item => item.id === id);
  if (!request) return null;
  request.status = status;
  request.updatedAt = new Date().toISOString();
  await save();
  return request;
}

module.exports = { create, listAll, listForCustomer, update };
