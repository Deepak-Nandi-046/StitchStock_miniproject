const { sign } = require('../auth/token');
const { recordAudit } = require('../engines/e3-audit');
const supabase = require('../config/supabaseClient');

const view = u => ({
  id: u.id,
  name: u.user_metadata?.name || u.email?.split('@')[0] || 'User',
  email: u.email,
  role: u.user_metadata?.role || u.app_metadata?.role ||
    (u.email?.toLowerCase() === (process.env.OWNER_EMAIL || 'admin@gmail.com').toLowerCase() ? 'owner' : 'customer'),
});
const PASSWORD_ERROR = 'Password must be 8-64 characters and include uppercase, lowercase, a number, and a special character.';

const isValidPassword = password =>
  typeof password === 'string' &&
  password.length >= 8 &&
  password.length <= 64 &&
  /[A-Z]/.test(password) &&
  /[a-z]/.test(password) &&
  /\d/.test(password) &&
  /[^A-Za-z0-9]/.test(password);

exports.login = async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Please enter your email and password.' });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error || !data.user || !data.session)
    return res.status(401).json({ error: 'Wrong email or password' });

  const u = view(data.user);
  await recordAudit({ actor: u.id, action: 'LOGIN', entity: 'user', entityId: u.id });
  res.json({
    token: sign({ id: u.id, role: u.role, name: u.name }),
    user: u,
  });
};

exports.verifyLogin = async (req, res) => {
  return res.status(410).json({ error: 'Password login is now handled directly by Supabase Authentication.' });
};
exports.register = async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !/^\S+@\S+\.\S+$/.test(email || ''))
    return res.status(400).json({ error: 'Enter a name and a valid email.' });
  if (!isValidPassword(password))
    return res.status(400).json({ error: PASSWORD_ERROR });

  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { name: name.trim(), role: 'customer' } },
  });
  if (error) {
    if (error.status === 422 || /already/i.test(error.message))
      return res.status(409).json({ error: 'Email already registered' });
    return res.status(400).json({ error: error.message });
  }
  if (!data.session) {
    return res.status(201).json({
      message: 'Account created. Check your email to confirm it before logging in.',
    });
  }

  res.status(201).json({ message: 'Account created. Please log in to continue.' });
};
exports.registrationOptions = (req, res) => {
  res.json({ canCreateOwner: false });
};
exports.deleteAccount = (req, res) => {
  return res.status(501).json({
    error: 'Account deletion must be performed in Supabase Authentication.',
  });
};
exports.requestPasswordReset = async (req, res) => {
  const { email } = req.body || {};
  if (!/^\S+@\S+\.\S+$/.test(email || ''))
    return res.status(400).json({ error: 'Enter a valid email address.' });

  const redirectTo = `${req.protocol}://${req.get('host')}/login.html`;
  await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
  res.json({
    message: 'If an account exists, a password reset link has been prepared.',
  });
};
exports.completePasswordReset = async (req, res) => {
  return res.status(410).json({
    error: 'Use the password reset link sent by Supabase to change your password.',
  });
};
exports.me = (req, res) => res.json({ id: req.user.id, name: req.user.name, role: req.user.role });