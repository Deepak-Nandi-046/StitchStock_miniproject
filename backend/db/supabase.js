const { createClient } = require('@supabase/supabase-js');
const url = process.env.SUPABASE_URL;
const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const supabase = url && key
    ? createClient(url, key, { auth: { persistSession: false } })
    : {
        from: () => ({
            select: () => ({
                order: async () => ({ data: null, error: { message: 'Supabase is not configured' } }),
                limit: async () => ({ data: null, error: { message: 'Supabase is not configured' } })
            }),
            insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'Supabase is not configured' } }) }) }),
            update: () => ({ eq: async () => ({ data: null, error: { message: 'Supabase is not configured' } }) }),
            eq: async () => ({ data: null, error: { message: 'Supabase is not configured' } })
        })
    };

module.exports = { supabase };