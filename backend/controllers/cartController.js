const store = require('../db/cartStore');
const customerStore = require('../db/customerStore');

// Demo accounts (DEMO_LOGIN=true) have ids like "u1", not Supabase UUIDs, so they have no
// customer row to attach a bag to. For them the frontend keeps using localStorage only.
const persisted = req => customerStore.isUuid(req.user.id);

exports.getCart = async (req, res) => {
  if (!persisted(req)) return res.json({ persisted: false, items: {}, colors: {} });
  res.json({ persisted: true, ...(await store.getCart(req.user.id)) });
};

exports.saveCart = async (req, res) => {
  const { items, colors } = req.body || {};
  if (!items || typeof items !== 'object' || Array.isArray(items))
    return res.status(400).json({ error: 'Send the bag as { items: { productId: quantity } }.' });
  if (!persisted(req)) return res.json({ persisted: false, items, colors: colors || {} });
  res.json({ persisted: true, ...(await store.saveCart(req.user.id, items, colors)) });
};

exports.getWishlist = async (req, res) => {
  if (!persisted(req)) return res.json({ persisted: false, ids: [] });
  res.json({ persisted: true, ids: await store.getWishlist(req.user.id) });
};

exports.saveWishlist = async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids))
    return res.status(400).json({ error: 'Send the wishlist as { ids: [productId, ...] }.' });
  if (!persisted(req)) return res.json({ persisted: false, ids: ids.map(String) });
  res.json({ persisted: true, ids: await store.saveWishlist(req.user.id, ids) });
};
