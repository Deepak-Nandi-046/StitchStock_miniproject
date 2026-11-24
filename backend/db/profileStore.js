const fs = require('fs/promises');
const path = require('path');
const { writeJson } = require('./jsonFile');

const recordsPath = path.join(__dirname, '..', 'data', 'profiles.json');
let profiles;
let writes = Promise.resolve();

async function load() {
  if (profiles) return profiles;
  try {
    profiles = JSON.parse(await fs.readFile(recordsPath, 'utf8'));
    if (!Array.isArray(profiles)) throw new Error('Profile data must be an array');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    profiles = [];
  }
  return profiles;
}

async function get(id, defaults = {}) {
  const record = (await load()).find(profile => String(profile.id) === String(id));
  return { ...defaults, ...(record || {}) };
}

async function update(id, updates) {
  const records = await load();
  let profile = records.find(item => String(item.id) === String(id));
  if (!profile) {
    profile = { id };
    records.push(profile);
  }
  Object.assign(profile, updates);
  writes = writes.then(() => writeJson(recordsPath, records));
  await writes;
  return { ...profile };
}

module.exports = { get, update };
