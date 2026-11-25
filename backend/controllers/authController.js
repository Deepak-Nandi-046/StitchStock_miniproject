const { sign } = require('../auth/token');
const { recordAudit } = require('../engines/e3-audit');
const supabase = require('../config/supabaseClient');
const users = require('../auth/users');
const customerStore = require('../db/customerStore');
const profileStore = require('../db/profileStore');
const { createClient } = require('@supabase/supabase-js');
const passwordResetTokens = require('../auth/passwordResetTokens');
const { sendPasswordResetLink } = require('../auth/mailer');

const seedDemoUsers = () => {
  if (process.env.DEMO_LOGIN === 'false') return;
  if (!users.findByEmail('admin@example.com'))
    users.register('Admin', 'admin@example.com', 'Admin@123', 'owner');
  if (!users.findByEmail('customer@example.com'))
    users.register('Customer', 'customer@example.com', 'Customer@123', 'customer');
};
seedDemoUsers();

// Role comes ONLY from public.user_profile (set by a DB trigger / promoted manually in SQL).
const view = async u => ({
  id: u.id,
  name: u.user_metadata?.name || u.email?.split('@')[0] || 'User',
  email: u.email,
  role: (await customerStore.getRole(u.id)) || 'customer',
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

const passwordResetMessage = 'If an account exists for this role, a password reset link will be sent to that email address.';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
}

function getPasswordResetBaseUrl() {
  const configuredUrl = process.env.APP_BASE_URL ||
    (process.env.NODE_ENV === 'production' ? '' : `http://localhost:${process.env.PORT || 3000}`);
  let url;
  try {
    url = new URL(configuredUrl);
  } catch (error) {
    throw new Error('APP_BASE_URL must be a valid public HTTP(S) URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:'))
    throw new Error('APP_BASE_URL must be a secure public HTTPS URL in production.');
  return url.origin;
}

exports.login = async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Please enter your email and password.' });
  if (process.env.DEMO_LOGIN !== 'false') {
    seedDemoUsers();
    const demoUser = users.findByEmail(email.trim());
    if (demoUser) {
      if (!users.check(password, demoUser.pw))
        return res.status(401).json({ error: 'Wrong email or password' });
      const savedProfile = await profileStore.get(demoUser.id, {});
      const u = {
        id: demoUser.id,
        name: savedProfile.name || demoUser.name,
        email: savedProfile.email || demoUser.email,
        role: demoUser.role,
        avatarUrl: savedProfile.avatarUrl || '',
      };
      await customerStore.upsert({ ...u, createdAt: demoUser.createdAt }, true);
      await recordAudit({ actor: u.id, action: 'LOGIN', entity: 'user', entityId: u.id });
      return res.json({ token: sign({ id: u.id, role: u.role, name: u.name, email: u.email }), user: u });
    }
  }

  if (!supabase) return res.status(503).json({ error: 'Backend is not configured for Supabase login.' });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error || !data.user || !data.session)
    return res.status(401).json({ error: 'Wrong email or password' });

  await customerStore.ensureFromAuth(data.user);     // creates user_profile/customer rows if missing
  const savedProfile = await profileStore.get(data.user.id, {});
  const u = await view(data.user);
  if (savedProfile.name) u.name = savedProfile.name;
  if (savedProfile.email) u.email = savedProfile.email;
  if (savedProfile.avatarUrl) u.avatarUrl = savedProfile.avatarUrl;
  await customerStore.upsert({ ...u, createdAt: data.user.created_at }, true);
  await recordAudit({ actor: u.id, action: 'LOGIN', entity: 'user', entityId: u.id });
  res.json({
    token: sign({ id: u.id, role: u.role, name: u.name, email: u.email }),
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
  if (process.env.DEMO_LOGIN !== 'false') {
    const normalizedEmail = email.trim().toLowerCase();
    if (users.findByEmail(normalizedEmail))
      return res.status(409).json({ error: 'Email already registered' });
    const user = users.register(name, normalizedEmail, password, 'customer');
    await customerStore.upsert(user);
    return res.status(201).json({ message: 'Account created. Please log in to continue.' });
  }

  if (!supabase) return res.status(503).json({ error: 'Backend is not configured for Supabase registration.' });
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { data: { name: name.trim() } },
  });
  if (error) {
    if (error.status === 422 || /already/i.test(error.message))
      return res.status(409).json({ error: 'Email already registered' });
    return res.status(400).json({ error: error.message });
  }
  if (data.user) await customerStore.upsert({
    id: data.user.id,
    name: data.user.user_metadata?.name || name.trim(),
    email: data.user.email,
    role: 'customer',
    createdAt: data.user.created_at,
  });
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
  const { email, role } = req.body || {};
  if (!/^\S+@\S+\.\S+$/.test(email || ''))
    return res.status(400).json({ error: 'Enter a valid email address.' });
  if (!['customer', 'owner'].includes(role))
    return res.status(400).json({ error: 'Choose a valid account type.' });

  const normalizedEmail = email.trim().toLowerCase();
  const localUser = users.findByEmail(normalizedEmail);
  const admin = getSupabaseAdmin();

  try {
    let account = null;
    if (localUser) {
      if (localUser.role === role)
        account = { userId: localUser.id, role: localUser.role, provider: 'local' };
    } else if (admin) {
      const { data, error } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email: normalizedEmail,
      });
      if (error && !/user not found/i.test(error.message)) throw error;
      if (data?.user && (await customerStore.getRole(data.user.id)) === role)
        account = { userId: data.user.id, role, provider: 'supabase' };
    } else {
      console.error('Supabase password reset is unavailable without SUPABASE_SERVICE_ROLE_KEY.');
    }

    if (account) {
      const token = passwordResetTokens.issue(account);
      try {
        const resetLink = `${getPasswordResetBaseUrl()}/reset-password.html#token=${encodeURIComponent(token)}&role=${encodeURIComponent(role)}`;
        await sendPasswordResetLink(normalizedEmail, resetLink);
      } catch (error) {
        passwordResetTokens.revoke(token);
        console.error('Password reset email delivery failed:', error.code || error.message);
      }
    }
  } catch (error) {
    console.error('Password reset account lookup failed:', error.code || error.message);
  }

  res.json({ message: passwordResetMessage });
};
exports.completePasswordReset = async (req, res) => {
  const { token, role, password, confirmPassword } = req.body || {};
  if (!['customer', 'owner'].includes(role))
    return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new link.' });
  if (!isValidPassword(password)) return res.status(400).json({ error: PASSWORD_ERROR });
  if (password !== confirmPassword)
    return res.status(400).json({ error: 'Passwords do not match.' });

  const account = passwordResetTokens.reserve(token, role);
  if (!account)
    return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new link.' });

  try {
    if (account.provider === 'local') {
      const user = users.findById(account.userId);
      if (!user || user.role !== role) {
        passwordResetTokens.finish(token, true);
        return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new link.' });
      }
      users.updatePassword(account.userId, password);
    } else {
      const admin = getSupabaseAdmin();
      if (!admin) throw new Error('Supabase password reset requires SUPABASE_SERVICE_ROLE_KEY.');
      const { data, error: lookupError } = await admin.auth.admin.getUserById(account.userId);
      if (lookupError) throw lookupError;
      if (!data.user || (await customerStore.getRole(data.user.id)) !== role) {
        passwordResetTokens.finish(token, true);
        return res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new link.' });
      }
      const { error } = await admin.auth.admin.updateUserById(account.userId, { password });
      if (error) throw error;
    }
    passwordResetTokens.finish(token, true);
    return res.json({ message: 'Your password has been reset successfully.' });
  } catch (error) {
    passwordResetTokens.finish(token, false);
    throw error;
  }
};
exports.me = (req, res) => res.json({ id: req.user.id, name: req.user.name, role: req.user.role });

exports.profile = async (req, res) => {
  const savedCustomer = req.user.role === 'customer'
    ? (await customerStore.list()).find(item => String(item.id) === String(req.user.id)) || {}
    : {};
  const profile = await profileStore.get(req.user.id, {
    id: req.user.id,
    name: req.user.name,
    email: req.user.email || '',
    role: req.user.role,
    phone: savedCustomer.phone || '',
    address: savedCustomer.address || '',
    pincode: savedCustomer.pincode || '',
    avatarUrl: savedCustomer.avatarUrl || '',
  });
  res.json({
    ...profile,
    canUpdateEmail: Boolean(users.findById(req.user.id) || process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
};

exports.updateProfile = async (req, res) => {
  const body = req.body || {};
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const address = typeof body.address === 'string' ? body.address.trim() : '';
  const pincode = typeof body.pincode === 'string' ? body.pincode.trim() : '';
  const avatar = typeof body.avatarUrl === 'string' ? body.avatarUrl : '';
  if (!name || name.length > 100)
    return res.status(400).json({ error: 'Enter a name of up to 100 characters.' });
  if (email && (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254))
    return res.status(400).json({ error: 'Enter a valid email address.' });
  if (phone.length > 30 || (phone && !/^[+0-9() .-]{7,30}$/.test(phone)))
    return res.status(400).json({ error: 'Enter a valid phone number.' });
  if (address.length > 500) return res.status(400).json({ error: 'Address must be 500 characters or fewer.' });
  if (pincode && !/^[0-9]{6}$/.test(pincode))
    return res.status(400).json({ error: 'Enter a valid 6-digit delivery pincode.' });
  if (avatar) {
    const match = avatar.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match || Buffer.from(match[2], 'base64').length > 2 * 1024 * 1024)
      return res.status(400).json({ error: 'Profile pictures must be JPG, PNG, or WebP and 2 MB or smaller.' });
  }

  const demoUser = users.findById(req.user.id);
  const emailChanged = Boolean(email && email !== String(req.user.email || '').toLowerCase());
  if (demoUser) {
    const updated = users.updateProfile(req.user.id, { name, ...(emailChanged ? { email } : {}) });
    if (updated === false) return res.status(409).json({ error: 'Email already registered.' });
  } else {
    if (emailChanged && !process.env.SUPABASE_SERVICE_ROLE_KEY)
      return res.status(403).json({ error: 'Email changes are unavailable for this account. Contact the administrator.' });
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
      const { error } = await admin.auth.admin.updateUserById(req.user.id, {
        user_metadata: { name },
        ...(emailChanged ? { email } : {}),
      });
      if (error) return res.status(400).json({ error: error.message });
    }
  }

  const updates = {
    name,
    phone,
    avatarUrl: avatar,
    ...(req.user.role === 'customer' ? { address, pincode } : {}),
    ...(email ? { email } : {}),
  };
  const profile = await profileStore.update(req.user.id, updates);
  if (req.user.role === 'customer')
    await customerStore.upsert({ ...req.user, ...profile, role: 'customer' });
  const updatedUser = {
    id: req.user.id,
    name,
    email: email || req.user.email || '',
    role: req.user.role,
  };
  res.json({
    ...profile,
    ...updatedUser,
    canUpdateEmail: Boolean(demoUser || process.env.SUPABASE_SERVICE_ROLE_KEY),
    token: sign(updatedUser),
  });
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body || {};
  if (!['owner', 'customer'].includes(req.user.role))
    return res.status(403).json({ error: 'Not allowed for your role.' });
  if (!isValidPassword(newPassword)) return res.status(400).json({ error: PASSWORD_ERROR });
  if (newPassword !== confirmPassword)
    return res.status(400).json({ error: 'Passwords do not match.' });
  if (typeof currentPassword !== 'string' || !currentPassword)
    return res.status(400).json({ error: 'Enter your current password.' });
  const demoUser = users.findById(req.user.id);
  if (demoUser) {
    if (demoUser.role !== req.user.role)
      return res.status(403).json({ error: 'Not allowed for your role.' });
    if (!users.check(currentPassword, demoUser.pw))
      return res.status(400).json({ error: 'Current password is incorrect.' });
    users.updatePassword(req.user.id, newPassword);
    return res.json({ message: 'Password updated successfully.' });
  }
  if (!supabase) return res.status(503).json({ error: 'Password changes are unavailable while authentication is disconnected.' });
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signInWithPassword({
    email: req.user.email,
    password: currentPassword,
  });
  if (error || !data.session) return res.status(400).json({ error: 'Current password is incorrect.' });
  const result = await client.auth.updateUser({ password: newPassword });
  if (result.error) return res.status(400).json({ error: result.error.message });
  res.json({ message: 'Password updated successfully.' });
};