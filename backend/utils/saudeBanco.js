// ════════════════════════════════════════════════════════════════════════════
//  "O banco está vivo?" — a pergunta que o /api/health NÃO respondia
//
//  Incidente de 02/09/2026: o Postgres morreu às 14:58 UTC e ficou 1h34 fora.
//  O `/api/health` — catalogado como `critical`, vigiado a cada 5 min —
//  respondeu **200 `ok`** o tempo todo, porque só olhava se as variáveis de
//  ambiente existiam e se um objeto tinha sido construído. O painel do
//  Supabase dizia `ACTIVE_HEALTHY` em paralelo.
//
//  ⚠️⚠️ DOIS sinais verdes medindo a coisa errada é PIOR que nenhum sinal:
//  ensina o time a não olhar. Ninguém foi avisado; o dono descobriu 1h25
//  depois, usando o sistema.
//
//  A régua vive aqui, pura, porque é o que decide se um monitor externo vai
//  acordar alguém às 7h de domingo — e isso precisa ser testável sem banco.
// ════════════════════════════════════════════════════════════════════════════

const TIMEOUT_MS = 5000;
const CACHE_MS = 10000;

/**
 * Consulta MÍNIMA que prova que o Postgres respondeu.
 * ⚠️ `head: true` não traz linha nenhuma — o health check não pode virar carga
 * sobre o banco que ele vigia, nem devolver dado numa rota pública.
 */
async function sondar(client, { timeoutMs = TIMEOUT_MS, agora = Date.now() } = {}) {
  if (!client) return { ok: false, ms: 0, erro: 'sem_client' };
  const t0 = agora;
  try {
    const { error } = await Promise.race([
      client.from('modulos').select('id', { count: 'exact', head: true }).limit(1),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout do health check')), timeoutMs)),
    ]);
    if (error) throw error;
    return { ok: true, ms: Date.now() - t0, erro: null };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, erro: String(e?.message || e).slice(0, 200) };
  }
}

/**
 * Traduz a sonda no par (HTTP, corpo) que o monitor externo lê.
 *
 * ⚠️⚠️ Banco fora TEM que ser **503**, nunca 200 com um campo dizendo `false`.
 * Monitor externo (UptimeRobot, BetterStack) decide por STATUS HTTP — um 200
 * com `{"status":"down"}` no corpo é exatamente o health check que mente, só
 * que com mais passos.
 */
function respostaSaude(sonda) {
  if (sonda && sonda.ok) {
    return { status: 200, corpo: { status: 'ok', latencia_ms: sonda.ms } };
  }
  return {
    status: 503,
    corpo: { status: 'down', latencia_ms: sonda?.ms ?? 0, erro: sonda?.erro || 'desconhecido' },
    retryApos: 30,
  };
}

module.exports = { sondar, respostaSaude, TIMEOUT_MS, CACHE_MS };
