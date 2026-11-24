const fs = require('fs/promises');
const path = require('path');
const { writeJson } = require('./jsonFile');

const recordsPath = path.join(__dirname, '..', 'data', 'customers.json');
let customers;
let writes = Promise.resolve();

async function load() {
  if (customers) return customers;
  try {
    customers = JSON.parse(await fs.readFile(recordsPath, 'utf8'));
    if (!Array.isArray(customers)) throw new Error('Customer data must be an array');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    customers = [];
  }
  return customers;
}

async function save() {
  writes = writes.then(() => writeJson(recordsPath, customers));
  return writes;
}

async function upsert(user, lastSeen = false) {
  if (!user || !user.id || user.role !== 'customer') return null;
  await load();
  let customer = customers.find(item => String(item.id) === String(user.id));
  if (!customer) {
    customer = {
      id: user.id,
      registeredAt: user.createdAt || user.registeredAt || null,
    };
    customers.push(customer);
  }
  if (user.name) customer.name = user.name;
  if (user.email) customer.email = String(user.email).trim().toLowerCase();
  if (user.phone !== undefined) customer.phone = user.phone;
  if (user.address !== undefined) customer.address = user.address;
  if (user.pincode !== undefined) customer.pincode = user.pincode;
  if (user.avatarUrl !== undefined) customer.avatarUrl = user.avatarUrl;
  if (!customer.registeredAt && (user.createdAt || user.registeredAt))
    customer.registeredAt = user.createdAt || user.registeredAt;
  if (lastSeen) customer.lastSeenAt = new Date().toISOString();
  await save();
  return { ...customer };
}

async function list() {
  return [...await load()].map(customer => ({ ...customer }));
}

module.exports = { upsert, list };
