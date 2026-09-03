// Service de contas correntes Santander
// Endpoints cobertos: lista contas, saldo, extrato (com fatia automática de 30d)
const { callApi, BANK_ID, AGENCIA, CONTA } = require('./httpClient');
const { supabase } = require('../../utils/supabase');
const { avaliarPagina } = require('../../utils/paginacaoExtrato');

const BASE = '/bank_account_information/v1';

// Santander exige formato AGENCIA.CONTA · 4 digitos de agência + 12 de conta
// Ex: 3957.000130004222 (zero-padding a esquerda na conta se vier curta)
function padAgencia(a) { return String(a || '').padStart(4, '0'); }
function padConta(c) { return String(c || '').padStart(12, '0'); }

function balanceId() {
  if (!AGENCIA || !CONTA) throw new Error('SANTANDER_AGENCIA / SANTANDER_CONTA não configurados');
  return `${padAgencia(AGENCIA)}.${padConta(CONTA)}`;
}

function transactionsPath({ agencia = AGENCIA, conta = CONTA } = {}) {
  if (!agencia || !conta) throw new Error('SANTANDER_AGENCIA / SANTANDER_CONTA nao configurados');
  const transactionId = padAgencia(agencia) + '.' + padConta(conta);
  return BASE + '/transactions/' + transactionId;
}

async function listarContas({ userId } = {}) {
  return callApi(`${BASE}/banks/${BANK_ID}/accounts`, { userId });
}

// Busca info de limite de cheque especial via endpoint /accounts
// (o endpoint /balances retorna so saldo, sem limite)
// Retorna 0 silenciosamente se a chamada falhar ou a conta não tiver limite
async function buscarLimiteOverdraft({ userId } = {}) {
  try {
    const raw = await callApi(`${BASE}/banks/${BANK_ID}/accounts`, { userId });
    const accounts = Array.isArray(raw) ? raw : (raw?.accounts || raw?.data || []);
    const myAccount = accounts.find(a => {
      const ag = String(a.branchCode || '').padStart(4, '0');
      const ct = String(a.accountNumber || a.accountId || '').padStart(12, '0');
      return ag === padAgencia(AGENCIA) && ct.includes(padConta(CONTA));
    }) || accounts[0];

    if (!myAccount) {
      // Salva o raw mesmo sem account · ajuda debug (snapshot persiste rawAccount)
      return {
        overdraftLimit: 0,
        overdraftUsed: 0,
        rawAccount: { _debug_no_account: true, _accountsResponse: raw },
      };
    }

    return {
      overdraftLimit: Number(
        myAccount.overdraftLimitAmount
        || myAccount.overdraftContractedLimit
        || myAccount.checkSpecialContractedLimit
        || myAccount.contractedOverdraft
        || myAccount.overdraftLimit
        || 0
      ),
      overdraftUsed: Number(
        myAccount.overdraftUsedAmount
        || myAccount.checkSpecialUsedAmount
        || myAccount.overdraftUsed
        || 0
      ),
      rawAccount: myAccount,
    };
  } catch (e) {
    // Best-effort · não quebra a chamada de saldo. Persiste erro pra debug.
    console.warn('[Santander] /accounts falhou:', e.message);
    return {
      overdraftLimit: 0,
      overdraftUsed: 0,
      rawAccount: { _debug_error: e.message, _debug_status: e.status, _debug_body: e.body },
    };
  }
}

async function consultarSaldo({ userId } = {}) {
  // Em paralelo: saldo + limite (via endpoint /accounts)
  const [raw, limite] = await Promise.all([
    callApi(`${BASE}/banks/${BANK_ID}/balances/${balanceId()}`, { userId }),
    buscarLimiteOverdraft({ userId }),
  ]);

  // Normaliza · API retorna campos como string
  const available = Number(raw.availableAmount || 0);
  const blocked = Number(raw.blockedAmount || 0);
  const invested = Number(raw.automaticallyInvestedAmount || 0);
  const { overdraftLimit, overdraftUsed, rawAccount } = limite;

  return {
    available,
    blocked,
    invested,
    overdraftLimit,
    overdraftUsed,
    overdraftAvailable: overdraftLimit > 0 ? overdraftLimit - overdraftUsed : 0,
    // saldo "real" do dashboard = available_amount (campo oficial do Santander).
    // NUNCA somar invested_amount aqui · em alguns retornos o campo
    // automaticallyInvestedAmount vem com valores anomalos (ex: negativo)
    // que distorcem o saldo. Bug visto em 2026-05-22.
    total: available,
    currency: raw.availableAmountCurrency || 'BRL',
    raw: { balance: raw, account: rawAccount },
  };
}

async function snapshotSaldoDoDia({ userId } = {}) {
  const saldo = await consultarSaldo({ userId });
  const hoje = new Date().toISOString().slice(0, 10);
  if (!supabase) return saldo;
  await supabase
    .from('santander_saldo_snapshot')
    .upsert({
      data: hoje,
      available_amount: saldo.available,
      blocked_amount: saldo.blocked,
      invested_amount: saldo.invested,
      overdraft_limit: saldo.overdraftLimit,
      overdraft_used: saldo.overdraftUsed,
      currency: saldo.currency,
      raw_response: saldo.raw,
      capturado_em: new Date().toISOString(),
    }, { onConflict: 'data' });
  return saldo;
}

async function historicoSaldo({ dias = 30 } = {}) {
  if (!supabase) return [];
  const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from('santander_saldo_snapshot')
    .select('data, available_amount, blocked_amount, invested_amount, currency')
    .gte('data', desde)
    .order('data', { ascending: true });
  return data || [];
}

// ⚠️ NOME MENTE: o corpo faz `proxFim.setDate(proxFim.getDate())`, que é NO-OP
// — as fatias são de UM DIA, não de 30. Medido no log de chamadas (uma janela
// de 3 dias produz 4 chamadas, uma por dia). NÃO "consertar" pra 30 dias sem
// antes provar que a paginação funciona: hoje a página 2 é o caminho quebrado,
// e fatia de 30 dias tornaria a página 2 a norma — trocaria falha rara por
// falha diária.
// Fatiar período (o comentário histórico dizia 30 dias)
function fatiarPeriodo(inicio, fim) {
  const fatias = [];
  let cursor = new Date(inicio);
  const fimDate = new Date(fim);
  while (cursor <= fimDate) {
    const proxFim = new Date(cursor);
    proxFim.setDate(proxFim.getDate());
    const fimFatia = proxFim > fimDate ? fimDate : proxFim;
    fatias.push({
      inicio: cursor.toISOString().slice(0, 10),
      fim: fimFatia.toISOString().slice(0, 10),
    });
    cursor = new Date(fimFatia);
    cursor.setDate(cursor.getDate() + 1);
  }
  return fatias;
}

async function buscarExtratoSantander({ inicio, fim, userId }) {
  const limit = 50;
  let offset = 0;
  const content = [];
  // ⚠️ O Set serve SÓ pra decidir se a página trouxe novidade. O que entra em
  // `content` continua sendo a página inteira: a régua decide QUANDO PARAR,
  // nunca o que é importado (ver o cabeçalho de `utils/paginacaoExtrato`).
  const vistos = new Set();

  for (let page = 0; page < 100; page += 1) {
    const response = await callApi(transactionsPath(), {
      query: { initialDate: inicio, finalDate: fim, _limit: limit, _offset: offset },
      userId,
    });
    const pageContent = Array.isArray(response?._content) ? response._content : [];
    content.push(...pageContent);

    // O gateway nem sempre sinaliza _moreElements corretamente. Uma pagina
    // cheia exige consultar o proximo offset; pagina parcial encerra o lote.
    const { encerrar, travou, motivo } = avaliarPagina({
      itens: pageContent, vistos, limite: limit, inicio, fim,
    });
    if (encerrar) {
      return { ...response, _content: content };
    }
    // ⚠️⚠️ MEDIDO em 01–02/09: o gateway devolve 200 com página CHEIA até o
    // offset 4950, latência plana. Sem esta guarda são 100 chamadas e ~60 s pra
    // então culpar o "limite de paginação" (nosso teto) em vez do gateway.
    // Agora são 2 chamadas e a mensagem nomeia a causa.
    if (travou) {
      throw new Error(motivo);
    }
    offset += pageContent.length;
  }

  throw new Error('Limite de paginacao do extrato Santander excedido (100 páginas cheias e ainda com lançamento novo)');
}

async function consultarExtrato({ inicio, fim, usarCache = true, userId, tolerarDiaIncompleto = false } = {}) {
  if (!inicio || !fim) throw new Error('início e fim obrigatórios (YYYY-MM-DD)');

  // Cache curto · 10min · valido apenas pra janelas exatas
  if (usarCache && supabase) {
    const { data: cached } = await supabase
      .from('santander_extrato_cache')
      .select('conteudo, expires_at')
      .eq('data_inicio', inicio)
      .eq('data_fim', fim)
      .single();
    if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
      return cached.conteudo;
    }
  }

  const fatias = fatiarPeriodo(inicio, fim);
  const respostas = [];
  // ⚠️⚠️ QUARENTENA POR DIA, E SÓ QUANDO O CHAMADOR PEDE (`tolerarDiaIncompleto`).
  //
  // As fatias são de UM DIA e independentes. Sem isto, um dia envenenado
  // descarta os outros: medido em 01–02/09, o dia 31/08 derrubou 4 execuções
  // seguidas e os dias 01 e 02/09 — que não têm defeito nenhum — não entraram.
  //
  // ⚠️ O default é FALSE de propósito: as rotas manuais e o pix-sync continuam
  // recebendo exceção, byte a byte como antes. Extrato parcial devolvido em
  // silêncio a quem não pediu é a importação parcial silenciosa que a lei
  // contábil da casa proíbe.
  //
  // ⚠️⚠️ E quem LIGA a tolerância É OBRIGADO A DECLARAR: `_diasIncompletos` volta
  // na resposta, e o cron reporta a execução como FALHA nomeando o dia. Lacuna
  // que ninguém lê é importação parcial com uma etapa a mais.
  const diasIncompletos = [];
  for (const f of fatias) {
    try {
      respostas.push(await buscarExtratoSantander({ inicio: f.inicio, fim: f.fim, userId }));
    } catch (e) {
      if (!tolerarDiaIncompleto) throw e;
      diasIncompletos.push({ dia: f.inicio, motivo: e.message });
    }
  }

  // Concatena _content das fatias preservando estrutura
  const merged = {
    _content: respostas.flatMap((r) => Array.isArray(r?._content) ? r._content : []),
    _pageable: { _moreElements: false },
    _fatias: fatias.length,
    _diasIncompletos: diasIncompletos,
  };

  // ⚠️ NUNCA cachear extrato com buraco: seriam 10 minutos servindo um extrato
  // truncado com cara de autoridade pra quem abrir a tela.
  if (usarCache && supabase && !diasIncompletos.length) {
    await supabase
      .from('santander_extrato_cache')
      .upsert({
        data_inicio: inicio,
        data_fim: fim,
        conteudo: merged,
        cached_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      }, { onConflict: 'data_inicio,data_fim' });
  }

  return merged;
}

module.exports = {
  listarContas,
  consultarSaldo,
  snapshotSaldoDoDia,
  historicoSaldo,
  consultarExtrato,
  transactionsPath,
};
