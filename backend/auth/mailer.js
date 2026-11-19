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

module.exports = { sendLoginOtp };
