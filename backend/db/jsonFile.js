const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(value, null, 2), 'utf8');
  try {
    try {
      await fs.rename(temporaryPath, filePath);
    } catch (error) {
      if (process.platform !== 'win32' || !['EPERM', 'EEXIST', 'ENOTEMPTY'].includes(error.code))
        throw error;
      await fs.copyFile(temporaryPath, filePath);
    }
  } finally {
    await fs.unlink(temporaryPath).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

module.exports = { writeJson };
