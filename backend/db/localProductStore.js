const fs = require('fs/promises');
const path = require('path');
const { writeJson } = require('./jsonFile');

const recordsPath = path.join(__dirname, '..', 'data', 'products.json');
let writes = Promise.resolve();

async function load(fallbackProducts) {
  try {
    const products = JSON.parse(await fs.readFile(recordsPath, 'utf8'));
    if (!Array.isArray(products)) throw new Error('Product data must be an array');
    return products;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return fallbackProducts;
  }
}

function save(products) {
  const snapshot = JSON.parse(JSON.stringify(products));
  writes = writes.then(() => writeJson(recordsPath, snapshot));
  return writes;
}

module.exports = { load, save };
