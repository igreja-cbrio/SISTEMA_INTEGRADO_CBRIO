// Registro de handlers de DOMÍNIO, indexados por `pag_cobrancas.origem_tipo`.
//
// É a inversão que mantém o núcleo provider-agnostic E domínio-agnostic: o
// núcleo sabe que o dinheiro entrou; o que isso SIGNIFICA (confirmar inscrição,
// liberar vaga, avisar a pessoa) é do módulo. Nenhum `if (origem_tipo === ...)`
// mora no núcleo.
//
// ── CONTRATO DE UM HANDLER ────────────────────────────────────────────────
//
//   origem_tipo: string (casa com pag_cobrancas.origem_tipo)
//   async aoPagar(cobranca, ctx)      // dinheiro entrou (total)
//   async aoPagarParcial(cobranca, ctx)
//   async aoExpirar(cobranca, ctx)    // prazo venceu sem pagar → liberar vaga
//   async aoCancelar(cobranca, ctx)
//   async aoEstornar(cobranca, ctx)   // inclui chargeback
//
// Todos opcionais. Todos recebem a linha completa da cobrança.
//
// ⚠️ TODO HANDLER É IDEMPOTENTE, sem exceção. Ele vai rodar mais de uma vez:
// o PSP reentrega o webhook por design, e o cron de reconciliação chega na
// mesma conclusão de novo. "Confirmar inscrição já confirmada" tem que ser
// no-op, não erro nem efeito duplicado (dois WhatsApps, duas vagas).
//
// ⚠️ HANDLER NÃO LANÇA por regra de negócio. Exception aqui sobe até o webhook
// e o PSP passa a reentregar pra sempre. Erro de verdade (banco fora) pode
// lançar — aí a reentrega é desejável.

const inscricao = require('./inscricao');
const generosidade = require('./generosidade');

const REGISTRO = new Map();

function registrar(handler) {
  if (!handler?.origem_tipo) throw new Error('handler sem origem_tipo');
  REGISTRO.set(handler.origem_tipo, handler);
}

registrar(inscricao);
registrar(generosidade);

/**
 * Handler da origem, ou null. Ausência é legítima (`origem_tipo:'manual'` =
 * cobrança solta, sem domínio a notificar) — daí retornar null em vez de lançar.
 */
function obter(origemTipo) {
  return REGISTRO.get(origemTipo) || null;
}

/**
 * Dispara o gancho do domínio. Loga e ENGOLE erro de propósito: o estado da
 * cobrança já foi persistido pelo núcleo e não pode ser desfeito porque o
 * módulo de domínio falhou. A reconciliação (cron) chama de novo — é pra isso
 * que o handler é idempotente.
 */
async function disparar(gancho, cobranca, ctx = {}) {
  const handler = obter(cobranca?.origem_tipo);
  if (!handler || typeof handler[gancho] !== 'function') return { executado: false };
  try {
    await handler[gancho](cobranca, ctx);
    return { executado: true };
  } catch (e) {
    console.error(`[pagamentos] handler ${cobranca.origem_tipo}.${gancho} falhou (cobranca ${cobranca.id}):`, e.message);
    return { executado: false, erro: e.message };
  }
}

module.exports = { obter, disparar, registrar };
