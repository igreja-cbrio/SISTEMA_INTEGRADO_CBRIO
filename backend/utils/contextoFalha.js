// ============================================================================
// Contexto POR REQUISIÇÃO pra guardar a última falha de banco vista.
//
// ⚠️ POR QUE `AsyncLocalStorage` e não `res.locals`: quem enxerga o erro do
// PostgREST é o cliente do Supabase (`utils/supabase.js`), e ele não tem o `res`
// na mão — ele é um singleton importado por 298 arquivos. Passar o `res` até lá
// seria reescrever todas as chamadas; o ALS é o mecanismo do Node pra
// exatamente isto.
//
// ⚠️ Guarda a ÚLTIMA falha, não uma lista: numa rota que faz 5 consultas e
// responde 500, a que interessa é a que derrubou — e lista viraria payload
// grande numa tabela de telemetria.
// ============================================================================
const { AsyncLocalStorage } = require('node:async_hooks');

const als = new AsyncLocalStorage();

/** Roda `fn` com um contexto novo. Chamado UMA vez por requisição. */
function comContextoDeFalha(fn) {
  return als.run({ falhaDb: null }, fn);
}

/**
 * Registra a falha de banco vista agora.
 *
 * ⚠️ NUNCA lança: isto roda dentro do caminho de I/O do Supabase, e uma exceção
 * aqui derrubaria a consulta da pessoa por causa de TELEMETRIA. Fora de
 * requisição (cron, script, boot) o store é `undefined` e a função é no-op.
 */
function registrarFalhaDb(info) {
  try {
    const store = als.getStore();
    if (!store) return;
    store.falhaDb = {
      motivo: info?.motivo || '',
      codigo: info?.codigo || '',
      status: info?.status || null,
      rota: info?.rota || '',
      em: Date.now(),
    };
  } catch { /* telemetria nunca atrapalha a requisição */ }
}

function falhaDbDaRequisicao() {
  try { return als.getStore()?.falhaDb || null; } catch { return null; }
}

module.exports = { comContextoDeFalha, registrarFalhaDb, falhaDbDaRequisicao };
