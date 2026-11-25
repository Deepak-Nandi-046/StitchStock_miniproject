// Single PostgreSQL pool (Supabase "Session pooler" connection string).
// Used for every table read/write and for real transactions (E2/E3 contract).
require('dotenv').config();
const { Pool, types } = require('pg');

// pg returns bigint / numeric / date as strings by default. The app (and frontend)
// expect plain JS numbers for ids and prices and 'YYYY-MM-DD' strings for dates.
types.setTypeParser(20, value => parseInt(value, 10));     // int8  (bigint ids)
types.setTypeParser(1700, value => parseFloat(value));     // numeric (prices)
types.setTypeParser(1082, value => value);                 // date -> 'YYYY-MM-DD'

const connectionString = process.env.DATABASE_URL;
const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },   // Supabase requires TLS
      max: 10,
      idleTimeoutMillis: 30000,
    })
  : null;

if (pool) pool.on('error', error => console.error('Postgres pool error:', error.message));

const isConfigured = () => Boolean(pool);

function target(conn) {
  if (conn) return conn;
  if (!pool) throw Object.assign(new Error('DATABASE_URL is not configured.'), { status: 503 });
  return pool;
}

// db.query(sql, params, conn?) -> rows   (signature from engines/CONTRACT.md)
async function query(sql, params = [], conn) {
  const result = await target(conn).query(sql, params);
  return result.rows;
}

async function getClient() {
  return target().connect();
}

module.exports = { pool, isConfigured, query, getClient };
