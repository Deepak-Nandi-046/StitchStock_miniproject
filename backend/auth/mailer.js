const nodemailer = require('nodemailer');

let transport;

function getTransport() {
  if (transport) return transport;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS)
    throw new Error('SMTP_HOST, SMTP_USER and SMTP_PASS must be configured to send login OTPs');
  transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: String(SMTP_PORT || 587) === '465',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transport;
}

async function sendLoginOtp(email, code) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await getTransport().sendMail({
    from,
    to: email,
    subject: 'Your StitchStock login code',
    text: `Your StitchStock login code is ${code}. It expires in 10 minutes.`,
  });
}

async function sendPasswordResetLink(email, resetLink) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await getTransport().sendMail({
    from,
    to: email,
    subject: 'Reset your StitchStock password',
    text: `Use this link to reset your StitchStock password. It expires in 15 minutes and can only be used once:\n\n${resetLink}\n\nIf you did not request a reset, you can ignore this email.`,
    html: `<p>Use the link below to reset your StitchStock password. It expires in 15 minutes and can only be used once.</p><p><a href="${resetLink}">Reset your password</a></p><p>If you did not request a reset, you can ignore this email.</p>`,
  });
}

module.exports = { sendLoginOtp, sendPasswordResetLink };
