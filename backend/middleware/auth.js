const { verify } = require('../auth/token');
exports.requireAuth = (req, res, next) => {
  const t = (req.headers.authorization || '').replace(/^Bearer /, '');
  const user = verify(t);
  if (!user) return res.status(401).json({ error: 'Please log in' });
  req.user = user; next();
};
exports.requireRole = role => (req, res, next) =>
  req.user && req.user.role === role ? next() : res.status(403).json({ error: 'Not allowed for your role' });