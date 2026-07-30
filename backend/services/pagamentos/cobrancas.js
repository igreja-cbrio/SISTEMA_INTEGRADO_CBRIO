// Orquestração + persistência de cobrança. É a camada que fala com o banco;
// os módulos de domínio entram por `index.js` (a fachada).
//
// Duas regras que moldam este arquivo:
//
//  1. `valor_pago_centavos` é DERIVADO da soma de `pag_pagamentos`, nunca
//     copiado do payload do PSP. Se o PSP mandar dois eventos com valores
//     diferentes, a razão auxiliar é a fonte e ela é auditável linha a linha.
//     `tarifa` fica fora da soma: é custo nosso, não redução do que o pagador
//     pagou.
//
//  2. Todo `UPDATE` de status passa por `aplicarTransicao` antes. O trigger no
//     banco é a autoridade final, mas checar aqui dá motivo legível no log e
//     evita gravar uma linha inútil.

const { supabase } = require('../../utils/supabase');
const providers = require('./providers');
const handlers = require('./handlers');
const { STATUS, TIPO_PAGAMENTO, STATUS_ABERTOS } = require('./tipos');
const { aplicarTransicao, statusPorValor, podeExpirar, estaTerminal } = require('./maquinaEstados');

const SELECT_COBRANCA = `
  id, public_token, origem_tipo, origem_id, referencia, idempotency_key,
  valor_centavos, valor_pago_centavos, moeda,
  provider, provider_cobranca_id, provider_cliente_id,
  metodo, metodos_ofertados, parcelas_total, parcelas_max, juros_repassados,
  checkout_url, pix_payload, pix_qrcode_base64, boleto_linha_digitavel, boleto_url,
  vencimento, status, expira_em, pago_em,
  pagador_nome, pagador_cpf, pagador_email, pagador_telefone, membro_id,
  cartao_brand, cartao_last4, descricao, metadata, ultimo_erro,
  criado_por, created_at, updated_at
`.replace(/\s+/g, ' ').trim();

function centavos(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
}

async function porId(id) {
  const { data, error } = await supabase.from('pag_cobrancas')
    .select(SELECT_COBRANCA).eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function porToken(token) {
  const { data, error } = await supabase.from('pag_cobrancas')
    .select(SELECT_COBRANCA).eq('public_token', token).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function porReferencia(referencia) {
  if (!referencia) return null;
  const { data, error } = await supabase.from('pag_cobrancas')
    .select(SELECT_COBRANCA).eq('referencia', referencia).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function porProviderId(provider, providerCobrancaId) {
  if (!providerCobrancaId) return null;
  const { data, error } = await supabase.from('pag_cobrancas')
    .select(SELECT_COBRANCA)
    .eq('provider', provider).eq('provider_cobranca_id', providerCobrancaId)
    .is('deleted_at', null).maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Cria (ou recupera) uma cobrança.
 *
 * `referencia` é a chave de NEGÓCIO idempotente (ex.: `inscricao:<uuid>`):
 * reenvio de formulário e duplo clique devolvem a MESMA cobrança em vez de
 * criar uma segunda — que é como a pessoa acabaria pagando duas vezes.
 *
 * Ordem deliberada: grava a linha ANTES de falar com o PSP. Se a chamada
 * externa falhar no meio, a cobrança existe em `criada` com `ultimo_erro` e o
 * cron/humano retoma; o inverso (PSP cria e a gente perde a linha) deixaria
 * cobrança órfã cobrável no PSP sem rastro aqui.
 */
async function criarCobranca({
  origem_tipo, origem_id, referencia,
  valor_centavos, descricao,
  provider: providerNome, metodo, metodos_ofertados,
  parcelas_max, juros_repassados,
  expira_em, vencimento,
  pagador_nome, pagador_cpf, pagador_email, pagador_telefone, membro_id,
  metadata, criado_por,
}) {
  if (!origem_tipo) throw new Error('origem_tipo é obrigatório');
  const valor = centavos(valor_centavos);
  if (valor <= 0) throw new Error('valor_centavos deve ser maior que zero');

  const adapter = providers.obter(providerNome);

  const existente = await porReferencia(referencia);
  if (existente) {
    // ⚠️ Cobrança MEIO-CRIADA: a linha existe mas a chamada ao PSP falhou, então
    // ela não tem `provider_cobranca_id` nem checkout. Devolvê-la como está
    // seria um beco sem saída — a pessoa reenviaria o formulário pra sempre e
    // receberia a mesma cobrança sem link de pagamento (e o cron de
    // reconciliação também não a pega, porque filtra por provider_cobranca_id).
    // Aqui retomamos: chama o PSP de novo sobre a MESMA linha.
    const incompleta = !existente.provider_cobranca_id && existente.status === STATUS.CRIADA;
    if (!incompleta) return { cobranca: existente, reaproveitada: true };
    const retomada = await pedirAoProvider(adapter, existente);
    return { cobranca: retomada, reaproveitada: true, retomada: true };
  }

  const { data: nova, error: eIns } = await supabase.from('pag_cobrancas').insert({
    origem_tipo,
    origem_id: origem_id || null,
    referencia: referencia || null,
    valor_centavos: valor,
    descricao: descricao || null,
    provider: adapter.nome,
    metodo: metodo || null,
    metodos_ofertados: Array.isArray(metodos_ofertados) ? metodos_ofertados : [],
    parcelas_max: parcelas_max || null,
    juros_repassados: juros_repassados === undefined ? true : !!juros_repassados,
    expira_em: expira_em || null,
    vencimento: vencimento || null,
    pagador_nome: pagador_nome || null,
    pagador_cpf: pagador_cpf || null,
    pagador_email: pagador_email || null,
    pagador_telefone: pagador_telefone || null,
    membro_id: membro_id || null,
    metadata: metadata || {},
    criado_por: criado_por || null,
    status: STATUS.CRIADA,
  }).select(SELECT_COBRANCA).single();

  if (eIns) {
    // Corrida na UNIQUE de `referencia`: outra requisição criou primeiro.
    // Devolver a dela é o comportamento certo — o objetivo é UMA cobrança.
    if (eIns.code === '23505') {
      const dela = await porReferencia(referencia);
      if (dela) return { cobranca: dela, reaproveitada: true };
    }
    throw eIns;
  }

  const atualizada = await pedirAoProvider(adapter, nova);
  return { cobranca: atualizada, reaproveitada: false };
}

/**
 * Pede a cobrança ao PSP e grava o que ele devolveu na linha JÁ existente.
 *
 * Extraído porque serve dois caminhos: a criação normal e a retomada de uma
 * cobrança meio-criada (PSP fora do ar na primeira tentativa).
 */
async function pedirAoProvider(adapter, linha) {
  let resposta;
  try {
    resposta = await adapter.criarCobranca(linha);
  } catch (e) {
    // ⚠️ Guarda o motivo mas NÃO marca `falhou`. Na máquina de estados `falhou`
    // é TERMINAL e significa "este pagamento não pode mais ser feito" — um
    // timeout na nossa chamada ao PSP não é isso. Marcar falhou aqui tornaria a
    // cobrança irrecuperável (terminal não transiciona, e o trigger do banco
    // recusaria a retomada). Fica em `criada`, que é retomável.
    await supabase.from('pag_cobrancas')
      .update({ ultimo_erro: String(e.message).slice(0, 500) })
      .eq('id', linha.id);
    throw e;
  }

  const patch = {
    provider_cobranca_id: resposta.provider_cobranca_id || null,
    provider_cliente_id: resposta.provider_cliente_id || null,
    checkout_url: resposta.checkout_url || null,
    pix_payload: resposta.pix_payload || null,
    pix_qrcode_base64: resposta.pix_qrcode_base64 || null,
    boleto_linha_digitavel: resposta.boleto_linha_digitavel || null,
    boleto_url: resposta.boleto_url || null,
    ultimo_erro: null,
  };
  if (resposta.metodo) patch.metodo = resposta.metodo;
  if (resposta.vencimento) patch.vencimento = resposta.vencimento;
  if (resposta.status && resposta.status !== linha.status) {
    const t = aplicarTransicao(linha.status, resposta.status);
    if (t.ok) patch.status = resposta.status;
    else console.error(`[pagamentos] provider devolveu status inválido na criação: ${t.motivo}`);
  }

  const { data, error } = await supabase.from('pag_cobrancas')
    .update(patch).eq('id', linha.id).select(SELECT_COBRANCA).single();
  if (error) throw error;
  return data;
}

/**
 * Registra a forma de pagamento ESCOLHIDA pelo pagador e guarda o artefato que
 * o PSP devolveu (QR do Pix, linha digitável, checkout).
 *
 * ⚠️ Não é enfeite de tela: até a escolha existir, o PSP pode não ter gerado o
 * meio de pagamento nenhum (ver `definirMetodo` no adapter do Asaas). Só o
 * `metodo` e os artefatos mudam — **valor, status e vaga não se mexem aqui**;
 * trocar de forma de pagamento não é pagar nem cancelar.
 *
 * Cobrança que já recebeu dinheiro (ou terminal) não troca de forma: o método
 * ali é fato consumado, e reescrevê-lo apagaria como o dinheiro entrou.
 */
async function definirMetodo(cobrancaOuId, metodo) {
  const c = typeof cobrancaOuId === 'string' ? await porId(cobrancaOuId) : cobrancaOuId;
  if (!c) throw new Error('Cobrança não encontrada');
  if (c.valor_pago_centavos > 0 || estaTerminal(c.status)) {
    return { cobranca: c, alterada: false, motivo: 'cobranca_nao_editavel' };
  }

  const adapter = providers.obter(c.provider);
  if (!adapter.capacidades.metodos.includes(metodo)) {
    throw new Error(`Forma de pagamento "${metodo}" não é oferecida por ${adapter.nome}.`);
  }
  if (typeof adapter.definirMetodo !== 'function') {
    // Provider que não sabe fixar a forma (o `manual`, por exemplo) só registra
    // a intenção — o artefato dele é humano, não é uma URL.
    const { data, error } = await supabase.from('pag_cobrancas')
      .update({ metodo }).eq('id', c.id).select(SELECT_COBRANCA).single();
    if (error) throw error;
    return { cobranca: data, alterada: true };
  }

  let r;
  try {
    r = await adapter.definirMetodo(c, metodo);
  } catch (e) {
    // Guarda o motivo e propaga: aqui a pessoa PEDIU esta forma, então engolir
    // o erro em silêncio a deixaria olhando uma aba vazia sem explicação.
    await supabase.from('pag_cobrancas')
      .update({ ultimo_erro: String(e.message).slice(0, 500) })
      .eq('id', c.id);
    throw e;
  }

  const patch = {
    metodo: r.metodo || metodo,
    ultimo_erro: null,
  };
  // Só sobrescreve artefato quando veio algo — trocar pra cartão não pode
  // apagar o QR do Pix que a pessoa talvez volte a usar.
  if (r.checkout_url) patch.checkout_url = r.checkout_url;
  if (r.pix_payload) patch.pix_payload = r.pix_payload;
  if (r.pix_qrcode_base64) patch.pix_qrcode_base64 = r.pix_qrcode_base64;
  if (r.boleto_linha_digitavel) patch.boleto_linha_digitavel = r.boleto_linha_digitavel;
  if (r.boleto_url) patch.boleto_url = r.boleto_url;

  const { data, error } = await supabase.from('pag_cobrancas')
    .update(patch).eq('id', c.id).select(SELECT_COBRANCA).single();
  if (error) throw error;
  return { cobranca: data, alterada: true };
}

/** Soma da razão auxiliar. `tarifa` fora: é custo nosso, não pagamento. */
async function somaPago(cobrancaId) {
  const { data, error } = await supabase.from('pag_pagamentos')
    .select('valor_centavos, tipo').eq('cobranca_id', cobrancaId);
  if (error) throw error;
  return (data || [])
    .filter((p) => p.tipo !== TIPO_PAGAMENTO.TARIFA)
    .reduce((acc, p) => acc + centavos(p.valor_centavos), 0);
}

/**
 * Muda o status da cobrança e dispara o gancho do domínio.
 *
 * Transição inválida NÃO lança: devolve `{aplicado:false, motivo}`. Quem chama
 * (webhook) precisa responder 200 pro PSP mesmo assim — 4xx/5xx viram retry
 * eterno.
 */
async function aplicarStatus(cobranca, novoStatus, extra = {}) {
  const t = aplicarTransicao(cobranca.status, novoStatus);
  if (!t.ok) return { aplicado: false, motivo: t.motivo, cobranca };
  if (t.noop) return { aplicado: false, noop: true, cobranca };

  const patch = { status: novoStatus, ...extra };
  if (novoStatus === STATUS.PAGO && !cobranca.pago_em && !patch.pago_em) {
    patch.pago_em = new Date().toISOString();
  }

  const { data, error } = await supabase.from('pag_cobrancas')
    .update(patch).eq('id', cobranca.id).select(SELECT_COBRANCA).single();
  if (error) throw error;

  // ⚠️ O trigger do banco pode ter RECUSADO a transição (ele avisa com WARNING
  // e mantém o status antigo, sem abortar). Só chamamos o domínio se o banco
  // confirmou — senão a inscrição seria confirmada com a cobrança não-paga.
  if (data.status !== novoStatus) {
    return { aplicado: false, motivo: `banco recusou a transição para ${novoStatus}`, cobranca: data };
  }

  const gancho = {
    [STATUS.PAGO]: 'aoPagar',
    [STATUS.PAGO_PARCIAL]: 'aoPagarParcial',
    [STATUS.EXPIRADA]: 'aoExpirar',
    [STATUS.CANCELADA]: 'aoCancelar',
    [STATUS.ESTORNADO]: 'aoEstornar',
    [STATUS.ESTORNADO_PARCIAL]: 'aoEstornar',
    [STATUS.CHARGEBACK]: 'aoEstornar',
  }[novoStatus];
  if (gancho) await handlers.disparar(gancho, data, extra.ctx || {});

  return { aplicado: true, cobranca: data };
}

/**
 * Registra um evento financeiro (liquidação/estorno/tarifa) e reavalia o
 * status pela soma.
 *
 * Idempotente por `provider_pagamento_id` (UNIQUE parcial no banco): a mesma
 * liquidação reentregue não é contada duas vezes. Sem esse id — pagamento
 * manual — a chamada é sempre nova, e é por isso que "marcar como pago" tem
 * confirmação humana na frente.
 */
async function registrarPagamento(cobranca, {
  tipo = TIPO_PAGAMENTO.LIQUIDACAO,
  valor_centavos,
  liquido_centavos, taxa_centavos,
  metodo, parcelas,
  provider_pagamento_id, e2e_id,
  pago_em, repassado_em,
  payload,
  // Quando o ADAPTER sabe que este pagamento quita a cobrança inteira mesmo
  // sem a soma fechar. É o caso do parcelado no cartão: o PSP cria N cobranças
  // (uma por parcela) mas o pagador pagou tudo na primeira autorização. Sem
  // isto a cobrança ficaria `pago_parcial` por 12 meses.
  statusFinal,
}) {
  const valor = centavos(valor_centavos);
  const negativo = tipo === TIPO_PAGAMENTO.ESTORNO
    || tipo === TIPO_PAGAMENTO.CHARGEBACK
    || tipo === TIPO_PAGAMENTO.TARIFA;

  const linha = {
    cobranca_id: cobranca.id,
    tipo,
    // Sinal é derivado do tipo, não confiado ao chamador: um estorno gravado
    // positivo somaria como pagamento.
    valor_centavos: negativo ? -Math.abs(valor) : Math.abs(valor),
    liquido_centavos: liquido_centavos === undefined || liquido_centavos === null
      ? null : centavos(liquido_centavos),
    taxa_centavos: taxa_centavos === undefined || taxa_centavos === null
      ? null : centavos(taxa_centavos),
    metodo: metodo || cobranca.metodo || null,
    parcelas: parcelas || cobranca.parcelas_total || null,
    provider_pagamento_id: provider_pagamento_id || null,
    e2e_id: e2e_id || null,
    pago_em: pago_em || new Date().toISOString(),
    repassado_em: repassado_em || null,
    payload: payload || null,
  };

  const { error } = await supabase.from('pag_pagamentos').insert(linha);
  if (error && error.code !== '23505') throw error;
  const duplicado = !!error; // 23505 = mesma liquidação já registrada

  // Reentrega do MESMO pagamento trazendo a data de repasse: o dinheiro ficou
  // disponível. É o caso normal do Asaas (CONFIRMED chega primeiro, RECEIVED
  // depois — no cartão, ~32 dias depois) e é o que amarra o repasse ao crédito
  // no extrato. Atualiza em vez de duplicar a linha.
  if (duplicado && repassado_em && provider_pagamento_id) {
    const { error: eRep } = await supabase.from('pag_pagamentos')
      .update({
        repassado_em,
        ...(liquido_centavos != null ? { liquido_centavos: centavos(liquido_centavos) } : {}),
        ...(taxa_centavos != null ? { taxa_centavos: centavos(taxa_centavos) } : {}),
      })
      .eq('provider_pagamento_id', provider_pagamento_id)
      .is('repassado_em', null);
    if (eRep) console.error('[pagamentos] marcar repasse:', eRep.message);
  }

  const pago = await somaPago(cobranca.id);
  const patch = { valor_pago_centavos: Math.max(0, pago) };
  if (metodo && !cobranca.metodo) patch.metodo = metodo;
  if (parcelas && !cobranca.parcelas_total) patch.parcelas_total = parcelas;

  const { data: comValor, error: eUp } = await supabase.from('pag_cobrancas')
    .update(patch).eq('id', cobranca.id).select(SELECT_COBRANCA).single();
  if (eUp) throw eUp;

  // Estorno/chargeback têm status próprio e não são derivados da soma (pagar e
  // devolver não é "não ter pagado").
  if (negativo) return { duplicado, cobranca: comValor };

  // `statusFinal` do adapter vence a derivação pela soma. Aplicar o derivado
  // primeiro disparia `aoPagarParcial` (notificação de "pagamento parcial")
  // antes de `aoPagar` — dois avisos para um pagamento só.
  const derivado = statusFinal || statusPorValor(comValor);
  if (!derivado) return { duplicado, cobranca: comValor };
  const r = await aplicarStatus(comValor, derivado, { pago_em: linha.pago_em });
  return { duplicado, cobranca: r.cobranca, aplicado: r.aplicado, motivo: r.motivo };
}

/** Cobranças abertas e vencidas (cron de expiração). */
async function listarParaExpirar(limite = 200) {
  const { data, error } = await supabase.from('pag_cobrancas')
    .select(SELECT_COBRANCA)
    .in('status', [STATUS.CRIADA, STATUS.AGUARDANDO])
    .lte('expira_em', new Date().toISOString())
    .is('deleted_at', null)
    .order('expira_em', { ascending: true })
    .limit(limite);
  if (error) throw error;
  // `podeExpirar` refaz a checagem incluindo a que o SQL não faz: quem já pagou
  // algo NUNCA expira, mesmo vencido.
  return (data || []).filter(podeExpirar);
}

/**
 * Cobranças não-finais dos últimos N dias (cron de reconciliação).
 *
 * ⚠️ Ordena por `updated_at` ASC, não `created_at`: com limite menor que a fila
 * (o tick usa 50), ordenar pela criação re-checaria PARA SEMPRE as 50 mais
 * antigas e as novas nunca seriam consultadas. Como `reconciliar` toca a linha
 * ao fim de cada tentativa, "menos recentemente verificada primeiro" vira
 * round-robin e a fila inteira rotaciona.
 */
async function listarParaReconciliar({ dias = 30, limite = 200 } = {}) {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data, error } = await supabase.from('pag_cobrancas')
    .select(SELECT_COBRANCA)
    .in('status', STATUS_ABERTOS)
    .gte('created_at', desde)
    .not('provider_cobranca_id', 'is', null)
    .is('deleted_at', null)
    .order('updated_at', { ascending: true })
    .limit(limite);
  if (error) throw error;
  return data || [];
}

/**
 * Marca "conferi esta cobrança agora" sem mudar nada de negócio — é o que faz
 * a rotação de `listarParaReconciliar` avançar quando o PSP não trouxe novidade.
 * O trigger de `updated_at` cuida do carimbo.
 */
async function tocarReconciliacao(cobrancaId) {
  const { error } = await supabase.from('pag_cobrancas')
    .update({ updated_at: new Date().toISOString() }).eq('id', cobrancaId);
  if (error) console.error('[pagamentos] tocar reconciliação:', error.message);
}

module.exports = {
  SELECT_COBRANCA,
  porId, porToken, porReferencia, porProviderId,
  criarCobranca,
  definirMetodo,
  aplicarStatus,
  registrarPagamento,
  somaPago,
  listarParaExpirar,
  listarParaReconciliar,
  tocarReconciliacao,
};
