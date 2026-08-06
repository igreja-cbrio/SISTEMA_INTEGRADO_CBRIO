// Recepção de webhook do PSP.
//
// ═══ A IDEMPOTÊNCIA É A UNIQUE, NÃO UM `if` ═══
//
// `pag_webhook_eventos (provider, evento_id)` + `ON CONFLICT DO NOTHING`:
// processa só quem CONSEGUIU INSERIR. Dedup por SELECT-depois-INSERT não é
// dedup — duas entregas concorrentes (retry + entrega original, que o PSP faz
// rotineiramente) veem ambas "não existe" e ambas inserem. Foi exatamente esse
// furo que quebrou o `generosidade-webhook` do app.
//
// ═══ NUNCA RESPONDER ERRO POR REGRA DE NEGÓCIO ═══
//
// 4xx/5xx pro PSP = reentrega. Reentrega de algo que sempre vai falhar = retry
// eterno, e em alguns PSPs o webhook é DESATIVADO depois de N falhas — aí
// pagamento aprovado deixa de chegar, silenciosamente. Só assinatura inválida
// merece 4xx (é a única em que "não processar" é a resposta certa).
//
// O payload bruto é gravado SEMPRE, inclusive quando o processamento falha: é
// o que permite replay sem depender de reentrega do PSP.

const { supabase } = require('../../utils/supabase');
const { notificar } = require('../notificar');
const providers = require('./providers');
const cobrancas = require('./cobrancas');
const { STATUS, TIPO_PAGAMENTO } = require('./tipos');

/** Segredo de verificação do provider (env por provider, com fallback geral). */
function segredoDe(providerNome) {
  const especifico = process.env[`${String(providerNome).toUpperCase()}_WEBHOOK_SECRET`];
  return especifico || process.env.PAG_WEBHOOK_SECRET || null;
}

/**
 * Grava o evento. Devolve `{novo:false}` quando já existia — e aí NÃO se
 * processa nada. Essa é a linha que segura a idempotência inteira.
 */
async function registrarEvento({ provider, evento_id, tipo, payload, assinatura_ok }) {
  const { data, error } = await supabase.from('pag_webhook_eventos')
    .upsert({
      provider, evento_id, tipo: tipo || null,
      payload: payload || {}, assinatura_ok: assinatura_ok !== false,
    }, { onConflict: 'provider,evento_id', ignoreDuplicates: true })
    .select('id');

  if (error) throw error;
  // `ignoreDuplicates` devolve array vazio quando o conflito ocorreu: o insert
  // não criou linha, logo outra entrega ganhou a corrida e está processando.
  if (!data || data.length === 0) return { novo: false, id: null };
  return { novo: true, id: data[0].id };
}

async function marcarEvento(id, campos) {
  if (!id) return;
  const { error } = await supabase.from('pag_webhook_eventos')
    .update({ ...campos, processado_em: new Date().toISOString() }).eq('id', id);
  if (error) console.error('[pagamentos/webhook] marcar evento:', error.message);
}

/** Acha a cobrança pelo id do PSP, com fallback na nossa referência ecoada. */
async function acharCobranca(providerNome, evento) {
  let c = await cobrancas.porProviderId(providerNome, evento.provider_cobranca_id);
  if (!c && evento.referencia) c = await cobrancas.porReferencia(evento.referencia);
  return c;
}

const TIPO_POR_STATUS = {
  [STATUS.ESTORNADO]: TIPO_PAGAMENTO.ESTORNO,
  [STATUS.ESTORNADO_PARCIAL]: TIPO_PAGAMENTO.ESTORNO,
  [STATUS.CHARGEBACK]: TIPO_PAGAMENTO.CHARGEBACK,
};

/**
 * Processa uma entrega de webhook ponta a ponta.
 *
 * @returns {{http: number, corpo: object}} — o que a rota deve responder.
 *   Sempre 200, exceto assinatura inválida (401).
 */
async function processar({ providerNome, rawBody, headers, payload, query }) {
  let adapter;
  try {
    adapter = providers.obter(providerNome);
  } catch (e) {
    // Provider desconhecido na URL: não é reentregável, então 200 + log. Um
    // 404 aqui só faria o PSP (ou o scanner) insistir.
    console.error('[pagamentos/webhook]', e.message);
    return { http: 200, corpo: { ok: true, ignorado: 'provider desconhecido' } };
  }

  // ⚠️ O 4º argumento (`{ query, payload }`) existe porque nem todo PSP assina o
  // CORPO: o manifesto do Mercado Pago é montado com o `data.id` que vem no
  // QUERY STRING da URL, mais o header `x-request-id`. Sem passar a query, a
  // assinatura dele nunca fecharia — e o sintoma seria 401 em toda entrega
  // legítima. Adapter que assina o corpo (Asaas) simplesmente ignora o extra.
  const assinatura = adapter.verificarAssinatura(
    rawBody, headers, segredoDe(adapter.nome), { query: query || {}, payload },
  );
  if (!assinatura.ok) {
    console.error(`[pagamentos/webhook] assinatura inválida (${adapter.nome}): ${assinatura.motivo}`);
    // ⚠️ Seguimos recusando (quem posta sem o segredo não pode ser aceito), MAS
    // isto conta como falha pro PSP — e o Asaas INTERROMPE a fila de
    // sincronização depois de 15 falhas consecutivas, guardando as pendências
    // por só 14 dias. Token mal configurado, sem aviso, viraria pagamento
    // aprovado que nunca chega. Então chamamos gente na PRIMEIRA ocorrência.
    notificar({
      modulo: 'inscricoes', tipo: 'webhook_pagamento_recusado',
      titulo: `Webhook de pagamento recusado · ${adapter.nome}`,
      mensagem: `O webhook do ${adapter.nome} chegou com token inválido (${assinatura.motivo}). `
        + 'Confira o token cadastrado no painel do provedor contra a env do sistema. '
        + 'ATENÇÃO: após 15 falhas seguidas o provedor pausa a fila e pagamentos deixam de chegar.',
      link: '/inscricoes',
      severidade: 'alta',
      // Dedup por dia: 15 entregas recusadas viram 1 aviso, não 15.
      chaveDedup: `pag_token_invalido_${adapter.nome}_${new Date().toISOString().slice(0, 10)}`,
    }).catch((e) => console.error('[pagamentos/webhook] notificar token inválido:', e.message));
    return { http: 401, corpo: { error: 'assinatura inválida' } };
  }

  // ⚠️ `await` mesmo o Asaas sendo SÍNCRONO aqui: `await` sobre valor que não é
  // promise é no-op, e há PSP cujo webhook não traz o pagamento — o do Mercado
  // Pago manda só `{ data: { id } }`, então o adapter precisa BUSCAR o
  // pagamento pra saber status e valor. Sem o await, o `evento` seria uma
  // Promise e o `!evento.evento_id` abaixo mandaria tudo pro ramo "sem id".
  const evento = await adapter.normalizarEvento(payload, headers);
  if (!evento || !evento.evento_id) {
    // Sem id de evento não há chave de idempotência — processar seria apostar
    // que o PSP não reentrega. Guardamos pro replay manual.
    await registrarEvento({
      provider: adapter.nome,
      evento_id: `sem-id:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
      tipo: 'nao_reconhecido', payload, assinatura_ok: true,
    }).catch((e) => console.error('[pagamentos/webhook] registrar sem-id:', e.message));
    return { http: 200, corpo: { ok: true, ignorado: 'evento sem id' } };
  }

  const reg = await registrarEvento({
    provider: adapter.nome,
    evento_id: evento.evento_id,
    tipo: evento.tipo,
    payload,
    assinatura_ok: true,
  });
  if (!reg.novo) {
    // Reentrega. Caso comum, não erro.
    return { http: 200, corpo: { ok: true, duplicado: true } };
  }

  try {
    const cobranca = await acharCobranca(adapter.nome, evento);
    if (!cobranca) {
      await marcarEvento(reg.id, {
        status_processamento: 'ignorado',
        erro: `cobrança não encontrada (provider_cobranca_id=${evento.provider_cobranca_id || '-'})`,
      });
      return { http: 200, corpo: { ok: true, ignorado: 'cobrança desconhecida' } };
    }

    await supabase.from('pag_webhook_eventos')
      .update({ cobranca_id: cobranca.id }).eq('id', reg.id);

    const extra = {};
    if (evento.cartao_brand) extra.cartao_brand = evento.cartao_brand;
    if (evento.cartao_last4) extra.cartao_last4 = evento.cartao_last4;
    if (evento.metodo) extra.metodo = evento.metodo;
    if (evento.parcelas) extra.parcelas_total = evento.parcelas;

    // Dinheiro entrou (ou voltou) → razão auxiliar primeiro. É ela que redefine
    // valor_pago_centavos e, por consequência, o status.
    if (Number(evento.valor_pago_centavos || 0) > 0) {
      const r = await cobrancas.registrarPagamento(cobranca, {
        tipo: TIPO_POR_STATUS[evento.status] || TIPO_PAGAMENTO.LIQUIDACAO,
        valor_centavos: evento.valor_pago_centavos,
        liquido_centavos: evento.liquido_centavos,
        taxa_centavos: evento.taxa_centavos,
        metodo: evento.metodo, parcelas: evento.parcelas,
        provider_pagamento_id: evento.provider_pagamento_id,
        e2e_id: evento.e2e_id,
        repassado_em: evento.repassado_em,
        payload,
        // Parcelado: o adapter sabe que o pagador quitou tudo na primeira
        // autorização, mesmo que a soma das parcelas só feche em meses.
        statusFinal: evento.quita_cobranca ? STATUS.PAGO : undefined,
      });
      // Estorno/chargeback não saem da soma — precisam do status explícito.
      if (TIPO_POR_STATUS[evento.status]) {
        await cobrancas.aplicarStatus(r.cobranca, evento.status, extra);
      } else if (Object.keys(extra).length) {
        await supabase.from('pag_cobrancas').update(extra).eq('id', cobranca.id);
      }
      await marcarEvento(reg.id, { status_processamento: 'processado' });
      return { http: 200, corpo: { ok: true } };
    }

    // Evento só de estado (expirou, cancelou, falhou).
    if (evento.status) {
      const r = await cobrancas.aplicarStatus(cobranca, evento.status, extra);
      await marcarEvento(reg.id, {
        status_processamento: r.aplicado ? 'processado' : 'ignorado',
        erro: r.aplicado ? null : (r.motivo || null),
      });
      return { http: 200, corpo: { ok: true, aplicado: r.aplicado } };
    }

    await marcarEvento(reg.id, { status_processamento: 'ignorado', erro: 'evento sem status mapeado' });
    return { http: 200, corpo: { ok: true, ignorado: 'sem status' } };
  } catch (e) {
    // Erro DE VERDADE (banco fora, bug). Guardamos como 'erro' pra replay e
    // ainda assim respondemos 200: reentrega não conserta bug nosso, e o cron
    // de reconciliação chega na mesma conclusão depois.
    console.error('[pagamentos/webhook] processar:', e.message);
    await marcarEvento(reg.id, {
      status_processamento: 'erro',
      erro: String(e.message).slice(0, 500),
    });
    return { http: 200, corpo: { ok: true, erro_registrado: true } };
  }
}

/** Reprocessa eventos marcados como `erro` (replay sem depender do PSP). */
async function reprocessarPendentes({ limite = 50 } = {}) {
  const { data, error } = await supabase.from('pag_webhook_eventos')
    .select('id, provider, evento_id, payload, tentativas')
    .eq('status_processamento', 'erro')
    .order('created_at', { ascending: true })
    .limit(limite);
  if (error) throw error;

  const resultado = { total: (data || []).length, processados: 0, falhas: 0 };
  for (const ev of data || []) {
    try {
      const adapter = providers.obter(ev.provider);
      const evento = await adapter.normalizarEvento(ev.payload, {});
      if (!evento) { resultado.falhas += 1; continue; }
      const cobranca = await acharCobranca(ev.provider, evento);
      if (!cobranca) {
        await marcarEvento(ev.id, { status_processamento: 'ignorado', erro: 'cobrança desconhecida' });
        continue;
      }
      if (Number(evento.valor_pago_centavos || 0) > 0) {
        await cobrancas.registrarPagamento(cobranca, {
          tipo: TIPO_POR_STATUS[evento.status] || TIPO_PAGAMENTO.LIQUIDACAO,
          valor_centavos: evento.valor_pago_centavos,
          liquido_centavos: evento.liquido_centavos,
          taxa_centavos: evento.taxa_centavos,
          metodo: evento.metodo, parcelas: evento.parcelas,
          provider_pagamento_id: evento.provider_pagamento_id,
          e2e_id: evento.e2e_id, repassado_em: evento.repassado_em,
          payload: ev.payload,
          statusFinal: evento.quita_cobranca ? STATUS.PAGO : undefined,
        });
      } else if (evento.status) {
        await cobrancas.aplicarStatus(cobranca, evento.status);
      }
      await marcarEvento(ev.id, { status_processamento: 'processado', erro: null });
      resultado.processados += 1;
    } catch (e) {
      resultado.falhas += 1;
      await supabase.from('pag_webhook_eventos')
        .update({ tentativas: (ev.tentativas || 0) + 1, erro: String(e.message).slice(0, 500) })
        .eq('id', ev.id);
    }
  }
  return resultado;
}

module.exports = { processar, reprocessarPendentes, registrarEvento, segredoDe };
