const r = require('express').Router();
const o = require('../controllers/orderController');
const a = require('../controllers/authController');
const c = require('../controllers/customRequestController');
const reviews = require('../controllers/reviewController');
const ownerData = require('../controllers/ownerDataController');
const messages = require('../controllers/customerMessageController');
const returns = require('../controllers/returnRequestController');
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
r.get('/auth/profile', requireAuth, wrap(a.profile));
r.patch('/auth/profile', requireAuth, wrap(a.updateProfile));
r.post('/auth/password/change', requireAuth, wrap(a.changePassword));
r.get('/auth/registration-options', a.registrationOptions);
r.delete('/auth/account', requireAuth, wrap(a.deleteAccount));

r.post('/custom-requests', requireAuth, requireRole('customer'), wrap(c.create));
r.get('/custom-requests/mine', requireAuth, requireRole('customer'), wrap(c.mine));
r.post('/custom-requests/:requestId/offer-response', requireAuth, requireRole('customer'), wrap(c.respondToOffer));
r.post('/custom-requests/:requestId/confirm-advance-payment', requireAuth, requireRole('customer'), wrap(c.confirmAdvancePayment));
r.get('/owner/custom-requests', ...owner, wrap(c.list));
r.patch('/owner/custom-requests/:requestId', ...owner, wrap(c.update));
r.get('/custom-requests/:requestId/files/:fileId', requireAuth, wrap(c.file));

r.post('/messages', requireAuth, requireRole('customer'), wrap(messages.create));
r.get('/messages/mine', requireAuth, requireRole('customer'), wrap(messages.mine));
r.get('/messages/unread', requireAuth, requireRole('customer'), wrap(messages.unread));
r.get('/owner/messages', ...owner, wrap(messages.list));
r.patch('/owner/messages/:messageId', ...owner, wrap(messages.reply));
r.post('/returns', requireAuth, requireRole('customer'), wrap(returns.create));
r.get('/returns/mine', requireAuth, requireRole('customer'), wrap(returns.mine));
r.get('/owner/returns', ...owner, wrap(returns.list));
r.patch('/owner/returns/:requestId', ...owner, wrap(returns.update));

r.get('/products', wrap(o.listProducts));
r.get('/products/:productId/reviews', wrap(reviews.list));
r.post('/products/:productId/reviews', requireAuth, requireRole('customer'), wrap(reviews.create));

r.get('/db-check', wrap(async (req, res) => {
  const { supabase } = require('../db/supabase');
  const { data, error } = await supabase.from('products').select('*').limit(3);
  if (error) return res.status(500).json({ connected: false, error: error.message });
  res.json({ connected: true, rows: data });
}));                          // public
r.post('/orders', requireAuth, requireRole('customer'), wrap(o.placeOrder));
r.get('/orders/mine', requireAuth, requireRole('customer'), o.myOrders);
r.post('/orders/:orderId/payment', requireAuth, requireRole('customer'), wrap(o.submitPayment));

r.get('/owner/summary', ...owner, wrap(o.summary));
r.get('/owner/customers', ...owner, wrap(ownerData.customers));
r.get('/owner/customers/:customerId', ...owner, wrap(ownerData.customer));
r.get('/owner/reviews', ...owner, wrap(ownerData.reviews));
r.get('/owner/notifications', ...owner, wrap(ownerData.notifications));
r.post('/owner/products', ...owner, wrap(o.addProduct));
r.get('/owner/queue/:productId', ...owner, o.queue);
r.post('/owner/products/:productId/restock', ...owner, wrap(o.restock));
r.post('/owner/queue/:productId/allocate', ...owner, wrap(o.allocate));
r.post('/owner/orders/:orderId/status', ...owner, wrap(o.setStatus));
r.patch('/owner/orders/:orderId', ...owner, wrap(o.updateOrder));
r.post('/owner/orders/:orderId/payment-verification', ...owner, wrap(o.verifyPayment));
r.patch('/owner/preorders/:orderId', ...owner, wrap(o.updatePreorder));
r.post('/owner/preorders/:orderId/ready', ...owner, wrap(o.markPreorderReady));
module.exports = r;