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
// ────────────────────────────────────────────────────────────────────────────
//  TETO DE TEMPO por requisição ao Supabase (incidente de 02/09/2026)
//
//  ⚠️⚠️ O cliente NÃO tinha timeout nenhum. Quando o banco morreu, cada
//  consulta ficava pendurada até os 300 s do `maxDuration` da Vercel — e cada
//  uma dessas seguraya uma conexão. Com o polling do front batendo de 30 em 30
//  segundos, cada aba aberta empilhava até 10 invocações vivas por endpoint.
//  Medido: 110 timeouts de 300 s em 30 minutos. Não foi a causa da queda, mas
//  foi o que transformou "banco fora" em "banco fora e afogado na volta".
//
//  ⚠️ Os tetos são GENEROSOS de propósito. O objetivo é impedir que uma
//  requisição MORTA custe 300 s — não é policiar consulta lenta legítima.
//  Apertar isto quebraria os crons pesados (`kpi_recalcular_todos`,
//  `recalcular_nsm`, paginação de milhares de linhas), e o estrago seria pior
//  que o problema: cron que falha em silêncio.
// ────────────────────────────────────────────────────────────────────────────
const TIMEOUT_PADRAO_MS = Number(process.env.SUPABASE_FETCH_TIMEOUT_MS) || 30000;
// ⚠️ RPC e Storage têm teto próprio: função SQL pesada e upload de arquivo
// demoram por natureza, e cortá-los em 30 s inventaria falha onde não há.
const TIMEOUT_LONGO_MS = Number(process.env.SUPABASE_FETCH_TIMEOUT_LONGO_MS) || 150000;

function tetoParaUrl(url) {
  const u = String(url || '');
  return (u.includes('/rpc/') || u.includes('/storage/')) ? TIMEOUT_LONGO_MS : TIMEOUT_PADRAO_MS;
}

/**
 * Compõe o teto com o `signal` que o chamador já passou.
 * ⚠️ Sobrescrever o signal alheio quebraria quem cancela por conta própria
 * (o `AbortController` do upload, por exemplo). `AbortSignal.any` existe no
 * Node 20+; sem ele, o teto é aplicado só quando não há signal — degradar
 * para o comportamento de hoje é melhor que estourar em runtime antigo.
 */
function comTeto(url, opcoes) {
  let teto;
  try { teto = AbortSignal.timeout(tetoParaUrl(url)); } catch { return opcoes; }
  const doChamador = opcoes && opcoes.signal;
  if (!doChamador) return { ...(opcoes || {}), signal: teto };
  if (typeof AbortSignal.any !== 'function') return opcoes;
  return { ...opcoes, signal: AbortSignal.any([doChamador, teto]) };
}

function fetchQueAnotaFalha(url, opcoes) {
  const nativo = globalThis.fetch;
  const p = nativo(url, comTeto(url, opcoes));
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
  }, (erro) => {
    // ⚠️ O teto estourando vira `TimeoutError`/`AbortError`. Sem anotar, ele
    // chegaria na rota como "fetch failed" genérico e o diagnóstico do agente
    // ficaria sem a causa — que é exatamente o buraco que a telemetria de
    // 27/08 existe para fechar.
    try {
      if (erro && (erro.name === 'TimeoutError' || erro.name === 'AbortError')) {
        const { registrarFalhaDb } = require('./contextoFalha');
        registrarFalhaDb({
          motivo: `Supabase nao respondeu em ${tetoParaUrl(url)}ms (teto do cliente)`,
          codigo: 'FETCH_TIMEOUT',
          status: 503,
          rota: (() => { try { return new URL(String(url)).pathname; } catch { return ''; } })(),
        });
      }
    } catch { /* telemetria nunca atrapalha a requisição */ }
    throw erro;
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
