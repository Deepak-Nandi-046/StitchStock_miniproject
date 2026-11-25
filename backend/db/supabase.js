// Server-side Supabase ADMIN client (service-role key). Never expose this key to the browser.
// Used for Storage and Auth admin calls. Table data goes through db/pool.js instead.
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = url && key
  ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

module.exports = { supabase };
