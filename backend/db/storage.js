// Supabase Storage helper (private buckets; files are served through short-lived signed URLs).
const { supabase } = require('./supabase');

function client() {
  if (!supabase) throw Object.assign(new Error('Storage needs SUPABASE_SERVICE_ROLE_KEY.'), { status: 503 });
  return supabase.storage;
}

async function upload(bucket, path, buffer, contentType) {
  const { error } = await client().from(bucket).upload(path, buffer, { contentType, upsert: false });
  if (error) throw error;
  return path;
}

async function remove(bucket, paths) {
  if (!paths.length) return;
  await client().from(bucket).remove(paths).catch(() => {});
}

// -> Map(path -> signedUrl). Missing/failed paths are simply absent.
async function signedUrls(bucket, paths, expiresInSeconds = 3600) {
  const unique = [...new Set(paths.filter(Boolean))];
  const urls = new Map();
  if (!unique.length || !supabase) return urls;
  const { data, error } = await client().from(bucket).createSignedUrls(unique, expiresInSeconds);
  if (error) { console.error('Signed URL failure:', error.message); return urls; }
  (data || []).forEach(item => { if (item.signedUrl) urls.set(item.path, item.signedUrl); });
  return urls;
}
async function ensureBucket(bucket) {
  const { error } = await client().createBucket(bucket, { public: false });
  if (error && !/already exists|duplicate/i.test(error.message)) throw error;
}

module.exports = { upload, remove, signedUrls, ensureBucket };