const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('[Supabase] SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios no .env');
}

// Cliente com service_role — uso exclusivo no backend
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Pool pg direto no Supabase Postgres (para queries complexas com RLS bypassada)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // postgres://postgres.[ref]:[password]@aws-0-*.pooler.supabase.com:6543/postgres
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Erro inesperado no pool:', err.message);
});

const query = async (text, params) => {
  const start = Date.now();
  const result = await pool.query(text, params);
  if (process.env.NODE_ENV === 'development') {
    const ms = Date.now() - start;
    if (ms > 200) console.warn(`[DB] Query lenta (${ms}ms):`, text.slice(0, 80));
  }
  return result;
};

const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { supabase, pool, query, transaction };
