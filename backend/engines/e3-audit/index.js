const log = [];
async function recordAudit(ev) { log.push({ ...ev, at: new Date().toISOString() }); }
async function listAudit(limit = 50) { return log.slice(-limit).reverse(); }
module.exports = { recordAudit, listAudit };