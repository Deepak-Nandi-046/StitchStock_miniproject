const crypto = require('crypto');
const hash = (pw, salt = crypto.randomBytes(16).toString('hex')) =>
  salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex');
const check = (pw, stored) => {
  const [salt, h] = stored.split(':');
  const x = Buffer.from(hash(pw, salt).split(':')[1], 'hex');
  return crypto.timingSafeEqual(x, Buffer.from(h, 'hex'));
};
const users = [];
module.exports = {
  findByEmail: e => users.find(u => u.email === String(e).toLowerCase()),
  findById: id => users.find(u => u.id === id),
  hashPassword: hash,
  hasOwner: () => users.some(user => user.role === 'owner'),
  removeById(id) {
    const index = users.findIndex(user => user.id === id);
    if (index === -1) return false;
    users.splice(index, 1);
    return true;
  },
  updatePassword(id, password) {
    const u = users.find(user => user.id === id);
    if (!u) return false;
    u.pw = password;
    return true;
  },
  register(name, email, password, role = 'customer') {
    const allowedRole = role === 'owner' && !users.some(user => user.role === 'owner') ? 'owner' : 'customer';
    const u = { id: 'u' + (users.length + 1), name, email: email.toLowerCase(), role: allowedRole, pw: hash(password) };
    users.push(u); return u;
  },
  check,
};