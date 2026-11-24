const test = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');

const sentEmails = [];
nodemailer.createTransport = () => ({
  sendMail: async message => sentEmails.push(message),
});

process.env.DEMO_LOGIN = 'true';
process.env.SMTP_HOST = 'smtp.example.test';
process.env.SMTP_PORT = '587';
process.env.SMTP_USER = 'sender@example.test';
process.env.SMTP_PASS = 'test-password';
process.env.APP_BASE_URL = 'http://localhost:3000';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_PUBLISHABLE_KEY;
delete process.env.SUPABASE_KEY;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const auth = require('../controllers/authController');
const users = require('../auth/users');

function response() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('reset request is role-scoped, generic, and its link changes the password once', async () => {
  const genericMessage = 'If an account exists for this role, a password reset link will be sent to that email address.';
  const mismatchResponse = response();
  await auth.requestPasswordReset({
    body: { email: 'customer@example.com', role: 'owner' },
  }, mismatchResponse);
  assert.deepEqual(mismatchResponse.body, { message: genericMessage });
  assert.equal(sentEmails.length, 0);

  const requestResponse = response();
  await auth.requestPasswordReset({
    body: { email: 'CUSTOMER@example.com', role: 'customer' },
  }, requestResponse);
  assert.deepEqual(requestResponse.body, { message: genericMessage });
  assert.equal(sentEmails.length, 1);
  const resetUrl = sentEmails[0].text.match(/http:\/\/localhost:3000\/reset-password\.html#token=([a-f0-9]{64})&role=customer/);
  assert.ok(resetUrl);

  const resetPayload = {
    token: resetUrl[1],
    role: 'customer',
    password: 'N3w!Password',
    confirmPassword: 'N3w!Password',
  };
  const wrongRole = response();
  await auth.completePasswordReset({ body: { ...resetPayload, role: 'owner' } }, wrongRole);
  assert.equal(wrongRole.statusCode, 400);

  const completed = response();
  await auth.completePasswordReset({ body: resetPayload }, completed);
  assert.deepEqual(completed.body, { message: 'Your password has been reset successfully.' });
  const customer = users.findByEmail('customer@example.com');
  assert.equal(users.check(resetPayload.password, customer.pw), true);
  assert.equal(customer.pw.includes(resetPayload.password), false);

  const reused = response();
  await auth.completePasswordReset({ body: resetPayload }, reused);
  assert.equal(reused.statusCode, 400);

  const changeResponse = response();
  await auth.changePassword({
    user: { id: customer.id, email: customer.email, role: 'customer' },
    body: {
      currentPassword: resetPayload.password,
      newPassword: 'N3w!Again',
      confirmPassword: 'N3w!Again',
    },
  }, changeResponse);
  assert.deepEqual(changeResponse.body, { message: 'Password updated successfully.' });
  assert.equal(users.check('N3w!Again', customer.pw), true);
});
