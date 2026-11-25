require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

console.log('SUPABASE_URL =', process.env.SUPABASE_URL);
console.log('Publishable key starts with:', (process.env.SUPABASE_PUBLISHABLE_KEY || '').slice(0, 15));
console.log('DEMO_LOGIN =', process.env.DEMO_LOGIN);

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY);
sb.auth.signInWithPassword({ email: 'admin@example.com', password: 'Admin@123' })
  .then(({ data, error }) => console.log(error ? 'ERROR: ' + error.message : 'LOGIN OK: ' + data.user.email));