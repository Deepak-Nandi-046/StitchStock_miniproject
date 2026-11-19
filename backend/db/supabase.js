const { createClient } = require('@supabase/supabase-js');
const url = process.env.SUPABASE_URL;
const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Set SUPABASE_URL and a Supabase publishable key in backend/.env');
module.exports = { supabase: createClient(url, key, { auth: { persistSession: false } }) };