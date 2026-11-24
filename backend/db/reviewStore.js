const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { writeJson } = require('./jsonFile');

const dataDirectory = path.join(__dirname, '..', 'data');
const recordsPath = path.join(dataDirectory, 'reviews.json');
let reviews;

async function load() {
  if (reviews) return reviews;
  try {
    reviews = JSON.parse(await fs.readFile(recordsPath, 'utf8'));
    if (!Array.isArray(reviews)) throw new Error('Review data must be an array');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    reviews = [];
  }
  return reviews;
}

async function save() {
  await writeJson(recordsPath, reviews);
}

async function list(productId) {
  return (await load()).filter(review => String(review.productId) === String(productId));
}

async function create(review) {
  await load();
  const saved = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...review };
  reviews.unshift(saved);
  await save();
  return saved;
}

async function listAll() {
  return [...await load()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

module.exports = { list, listAll, create };
