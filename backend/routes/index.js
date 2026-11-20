const r = require('express').Router();
const o = require('../controllers/orderController');
const a = require('../controllers/authController');
const { requireAuth, requireRole } = require('../middleware/auth');
const wrap = f => (q, s, n) => Promise.resolve(f(q, s, n)).catch(n);
const owner = [requireAuth, requireRole('owner')];

r.get('/health', wrap(async (req, res) => {
  const { supabase } = require('../db/supabase');
  const { error } = await supabase.from('products').select('id').limit(1);
  res.json({
    status: error ? 'degraded' : 'ok',
    service: 'stitchstock-backend',
    database: error ? 'disconnected' : 'connected',
    timestamp: new Date().toISOString(),
    ...(error ? { databaseError: error.message } : {})
  });
}));

r.post('/auth/login', wrap(a.login));
r.post('/auth/login/verify', wrap(a.verifyLogin));
r.post('/auth/register', wrap(a.register));
r.post('/auth/password-reset/request', wrap(a.requestPasswordReset));
r.post('/auth/password-reset/complete', wrap(a.completePasswordReset));
r.get('/auth/me', requireAuth, a.me);
r.get('/auth/registration-options', a.registrationOptions);
r.delete('/auth/account', requireAuth, wrap(a.deleteAccount));

r.get('/products', wrap(o.listProducts));

r.get('/db-check', wrap(async (req, res) => {
  const { supabase } = require('../db/supabase');
  const { data, error } = await supabase.from('products').select('*').limit(3);
  if (error) return res.status(500).json({ connected: false, error: error.message });
  res.json({ connected: true, rows: data });
}));                          // public
r.post('/orders', requireAuth, requireRole('customer'), wrap(o.placeOrder));
r.get('/orders/mine', requireAuth, requireRole('customer'), o.myOrders);

r.get('/owner/summary', ...owner, wrap(o.summary));
r.post('/owner/products', ...owner, wrap(o.addProduct));
r.get('/owner/queue/:productId', ...owner, o.queue);
r.post('/owner/products/:productId/restock', ...owner, wrap(o.restock));
r.post('/owner/queue/:productId/allocate', ...owner, wrap(o.allocate));
r.post('/owner/orders/:orderId/status', ...owner, wrap(o.setStatus));
module.exports = r;