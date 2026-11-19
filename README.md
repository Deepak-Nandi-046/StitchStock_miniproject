# StitchStock (skeleton)
Run: `cd backend && npm install && npm start` → http://localhost:3000
Layers: routes → controllers (E4) → engines (E1 DSA, E2 OS, E3 audit) → db (E3).
Each owner replaces ONLY their stub; signatures are in backend/engines/CONTRACT.md.

Supabase setup: run `backend/supabase/schema.sql` in the Supabase SQL Editor before opening `/api/test-supabase`.

Login OTP email configuration: replace the sample SMTP values in `backend/.env`
with a real SMTP account to enable email OTP login. In local development, every
account uses the demo OTP `123456` without email delivery when `DEMO_LOGIN=true`;
this flag is ignored in production. Registration does not require OTP verification.
Forgot password currently uses a short-lived, one-time reference reset link shown
in the UI for local development; it does not send an email. New and reset
passwords must be 8-64 characters and include uppercase, lowercase, a number,
and a special character.
