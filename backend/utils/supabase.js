const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[Supabase] SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY não configurados. Rotas que usam Supabase podem falhar.');
}

/**
 * ⚠️⚠️ FETCH QUE ANOTA A FALHA DO BANCO (27/08/2026 · caminho 3, decisão do
 * Matheus): é o ponto ÚNICO por onde passa toda consulta ao PostgREST, então é
 * aqui que o motivo real de um 500 pode ser capturado **sem editar os 791 blocos
 * `catch` mudos** do backend. Sem isso, o agente de incidente só recebia o
 * status HTTP e não tinha como diagnosticar nada além de "falha silenciosa".
 *
 * ⚠️ `global.fetch` é ponto de extensão OFICIAL do supabase-js — não é
 * monkey-patch de builder. O corpo da requisição é repassado INTOCADO (upload de
 * Storage manda stream/blob por aqui).
 * ⚠️ Só clona a resposta quando ela FALHA: `clone()` bufferiza, e o caminho felizb
 * é 99,9% das chamadas.
 * ⚠️ Envolvido em try/catch inteiro: exceção aqui derrubaria a consulta de quem
 * está usando o sistema por causa de TELEMETRIA.
 */
function fetchQueAnotaFalha(url, opcoes) {
  const nativo = globalThis.fetch;
  const p = nativo(url, opcoes);
  return p.then((resposta) => {
    try {
      if (!resposta || resposta.ok || resposta.status < 400) return resposta;
      const { registrarFalhaDb } = require('./contextoFalha');
      const { motivoDeErroPostgrest } = require('./motivoFalha');
      resposta.clone().text().then((txt) => {
        let corpo = null;
        try { corpo = txt ? JSON.parse(txt) : null; } catch { /* não-JSON */ }
        registrarFalhaDb({
          motivo: motivoDeErroPostgrest(corpo) || String(txt || '').slice(0, 400),
          codigo: corpo?.code || '',
          status: resposta.status,
          // ⚠️ Só o CAMINHO, nunca a query string: ela carrega valor de filtro
          // (cpf, e-mail, id de pessoa) e isto vira linha de telemetria.
          rota: (() => { try { return new URL(String(url)).pathname; } catch { return ''; } })(),
        });
      }).catch(() => { /* corpo ilegível: fica sem motivo, como antes */ });
    } catch { /* telemetria nunca atrapalha a requisição */ }
    return resposta;
  });
}

const supabase = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: fetchQueAnotaFalha },
    })
  : null;

// Pool pg direto no Supabase Postgres (para queries complexas com RLS bypassada)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_POOL_MAX) || (process.env.VERCEL === '1' ? 1 : 10),
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
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

// ⚠️ `fetchQueAnotaFalha` é exportado pra TESTE (`src/test/fetchFalhaDb.test.ts`).
// É a peça de maior risco do backend — ela está no caminho de TODA consulta ao
// banco —, e o que o teste garante é o essencial: a resposta e o CORPO chegam
// intactos a quem chamou, mesmo quando a anotação falha.
module.exports = { supabase, pool, query, transaction, fetchQueAnotaFalha };
