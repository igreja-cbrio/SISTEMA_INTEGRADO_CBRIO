// Handler de domínio da ESPINHA de inscrições (`origem_tipo = 'inscricao'`).
//
// Traduz o estado do dinheiro pro estado da inscrição:
//
//   pago      → inscricoes.status 'recebida' → 'confirmada'  (a vaga vira dela)
//   expirada  → 'recebida' → 'cancelada'                     (libera a vaga)
//   cancelada → idem
//   estornado → NÃO cancela sozinho: vai pra revisão humana (ver aoEstornar)
//
// A ponte com o painel de inscrições é `insc_pagamentos.cobranca_id` (migration
// 20260729020000): o ESTADO canônico vive em `pag_cobrancas`; a linha de
// `insc_pagamentos` é o espelho que a UI de inscrições já lê. Quem quiser as
// duas coisas juntas usa a view `vw_insc_pagamento_estado`.
//
// ⚠️ Tudo aqui é IDEMPOTENTE por construção: cada UPDATE é condicionado ao
// status de ORIGEM esperado (`.eq('status', 'recebida')`), então rodar de novo
// não faz nada. É o que permite o PSP reentregar o webhook e o cron de
// reconciliação chegar na mesma conclusão sem efeito duplicado.

const { supabase } = require('../../../utils/supabase');
const { notificar } = require('../../notificar');
const { enviarConfirmacaoInscricao } = require('../../inscricaoWhatsapp');
const { STATUS } = require('../tipos');

const origem_tipo = 'inscricao';

// Espelho pro vocabulário de `insc_pagamentos.status`, que é mais curto que o
// do núcleo (5 valores contra 10). Perda de resolução aceita: o estado fino
// está sempre em pag_cobrancas, e a view devolve o do motor quando há cobrança.
const STATUS_ESPELHO = Object.freeze({
  [STATUS.CRIADA]: 'pendente',
  [STATUS.AGUARDANDO]: 'aguardando',
  [STATUS.PAGO_PARCIAL]: 'aguardando',
  [STATUS.PAGO]: 'pago',
  [STATUS.EXPIRADA]: 'expirado',
  [STATUS.CANCELADA]: 'expirado',
  [STATUS.FALHOU]: 'expirado',
  [STATUS.ESTORNADO]: 'estornado',
  [STATUS.ESTORNADO_PARCIAL]: 'estornado',
  [STATUS.CHARGEBACK]: 'estornado',
});

/** Atualiza o espelho em `insc_pagamentos`. Best-effort: nunca decide nada. */
async function espelhar(cobranca, extra = {}) {
  const patch = {
    status: STATUS_ESPELHO[cobranca.status] || 'pendente',
    ...extra,
  };
  if (cobranca.pago_em) patch.pago_em = cobranca.pago_em;
  const { error } = await supabase.from('insc_pagamentos')
    .update(patch).eq('cobranca_id', cobranca.id);
  if (error) console.error('[pagamentos/inscricao] espelho insc_pagamentos:', error.message);
}

/** Inscrição da cobrança + dados do evento, ou null. */
async function carregarInscricao(cobranca) {
  if (!cobranca.origem_id) return null;
  const { data, error } = await supabase.from('inscricoes')
    .select('id, evento_id, nome_completo, telefone, whatsapp_optin, status, membro_id, evento:insc_eventos(id, nome, data, hora)')
    .eq('id', cobranca.origem_id).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function aoPagar(cobranca) {
  const insc = await carregarInscricao(cobranca);
  if (!insc) {
    console.error(`[pagamentos/inscricao] cobrança ${cobranca.id} paga sem inscrição (origem_id ${cobranca.origem_id})`);
    return;
  }

  await espelhar(cobranca);

  // Condicionado a 'recebida': reentrega em inscrição já confirmada é no-op, e
  // uma inscrição CANCELADA (expirou e a vaga já foi de outra pessoa) NÃO é
  // ressuscitada por pagamento atrasado — isso é caso pra humano, não pra
  // automação decidir que alguém perdeu o lugar.
  const { data, error } = await supabase.from('inscricoes')
    .update({ status: 'confirmada' })
    .eq('id', insc.id).eq('status', 'recebida')
    .select('id');
  if (error) throw error;

  const confirmouAgora = Array.isArray(data) && data.length > 0;
  if (!confirmouAgora) {
    if (insc.status === 'cancelada') {
      // Pagou depois de a vaga ser liberada. Ninguém é confirmado nem estornado
      // automaticamente — a liderança decide (abrir exceção ou devolver).
      await notificar({
        modulo: 'inscricoes', tipo: 'pagamento_apos_cancelamento',
        titulo: `Pagamento de inscrição já cancelada · ${insc.evento?.nome || 'evento'}`,
        mensagem: `${insc.nome_completo} pagou, mas a inscrição já estava cancelada (a vaga pode ter ido pra outra pessoa). Precisa de decisão: abrir exceção ou devolver.`,
        link: '/inscricoes',
      }).catch((e) => console.error('[pagamentos/inscricao] notificar:', e.message));
    }
    return; // já confirmada → nada a fazer (idempotência)
  }

  await notificar({
    modulo: 'inscricoes', tipo: 'inscricao_paga',
    titulo: `Inscrição paga · ${insc.evento?.nome || 'evento'}`,
    mensagem: `${insc.nome_completo} pagou a inscrição (R$ ${(cobranca.valor_pago_centavos / 100).toFixed(2)}) e está confirmado(a).`,
    link: '/inscricoes',
  }).catch((e) => console.error('[pagamentos/inscricao] notificar:', e.message));

  // Confirmação por WhatsApp pro INSCRITO (SPEC-07) — dentro do gate
  // `confirmouAgora`, então a reentrega do webhook/reconciliação NÃO reenvia
  // (o UPDATE condicionado já foi no-op e retornou antes). Opt-in (D4) e
  // kill-switch (env do template) são checados no serviço. Fire-and-forget:
  // handler de pagamento nunca falha porque o WhatsApp soluçou.
  enviarConfirmacaoInscricao({
    inscricaoId: insc.id, nome: insc.nome_completo, telefone: insc.telefone,
    optin: !!insc.whatsapp_optin, evento: insc.evento,
  }).catch((e) => console.error('[pagamentos/inscricao] confirmação WhatsApp:', e.message));
}

async function aoPagarParcial(cobranca) {
  // Vaga segue reservada ('recebida'): o dinheiro entrou em parte, então não se
  // libera nem se confirma. Precisa de gente olhando.
  await espelhar(cobranca);
  const insc = await carregarInscricao(cobranca);
  await notificar({
    modulo: 'inscricoes', tipo: 'pagamento_parcial',
    titulo: `Pagamento parcial · ${insc?.evento?.nome || 'inscrição'}`,
    mensagem: `${insc?.nome_completo || 'Inscrito'} pagou R$ ${(cobranca.valor_pago_centavos / 100).toFixed(2)} de R$ ${(cobranca.valor_centavos / 100).toFixed(2)}. A vaga segue reservada — confira antes de confirmar.`,
    link: '/inscricoes',
  }).catch((e) => console.error('[pagamentos/inscricao] notificar:', e.message));
}

/** Prazo venceu sem pagar → libera a vaga. */
async function aoExpirar(cobranca, ctx = {}) {
  await espelhar(cobranca);
  // ⚠️ `preservar_inscricao` existe pra UM caso: a cobrança foi cancelada por
  // DECISÃO NOSSA (bolsa/isenção concedida, valor corrigido), não porque a
  // pessoa deixou de pagar. Sem isso, conceder gratuidade cancelaria a
  // inscrição de quem acabou de ganhar a vaga — o oposto da intenção.
  if (ctx.preservar_inscricao) return;
  const { error } = await supabase.from('inscricoes')
    .update({ status: 'cancelada' })
    .eq('id', cobranca.origem_id).eq('status', 'recebida');
  if (error) throw error;
}

async function aoCancelar(cobranca, ctx = {}) {
  await aoExpirar(cobranca, ctx);
}

/**
 * Estorno / chargeback.
 *
 * ⚠️ NÃO cancela a inscrição automaticamente. Quem já foi ao evento (ou já tem
 * o lugar contado na logística: ônibus, quarto, comida) não sai da lista por um
 * chargeback — decisão é da liderança. O handler marca e chama gente.
 */
async function aoEstornar(cobranca) {
  await espelhar(cobranca);
  const insc = await carregarInscricao(cobranca);
  await notificar({
    modulo: 'inscricoes', tipo: 'pagamento_estornado',
    titulo: `Pagamento estornado · ${insc?.evento?.nome || 'inscrição'}`,
    mensagem: `A inscrição de ${insc?.nome_completo || '(sem nome)'} teve o pagamento estornado/contestado. A inscrição NÃO foi cancelada automaticamente — decidam se mantém a vaga.`,
    link: '/inscricoes',
  }).catch((e) => console.error('[pagamentos/inscricao] notificar:', e.message));
}

module.exports = {
  origem_tipo,
  STATUS_ESPELHO,
  aoPagar,
  aoPagarParcial,
  aoExpirar,
  aoCancelar,
  aoEstornar,
};
