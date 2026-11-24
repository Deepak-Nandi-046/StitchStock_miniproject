const fs = require('fs/promises');
const path = require('path');
const { writeJson } = require('./jsonFile');

const recordsPath = path.join(__dirname, '..', 'data', 'orders.json');
let writes = Promise.resolve();

async function load() {
  try {
    const orders = JSON.parse(await fs.readFile(recordsPath, 'utf8'));
    if (!Array.isArray(orders)) throw new Error('Order data must be an array');
    orders.forEach(order => {
      if (order.paymentStatus === 'Customer reported paid (UPI)') {
        order.paymentStatus = 'Awaiting Verification';
        order.paymentSubmission = order.paymentSubmission || {
          method: 'UPI',
          reference: '',
          amountPaid: Number(order.totalAmount) || 0,
          proof: '',
          submittedAt: order.createdAt,
        };
      }
    });
    return orders;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return [];
  }
}

function save(orders) {
  const snapshot = JSON.parse(JSON.stringify(orders));
  writes = writes.then(() => writeJson(recordsPath, snapshot));
  return writes;
}

module.exports = { load, save };
