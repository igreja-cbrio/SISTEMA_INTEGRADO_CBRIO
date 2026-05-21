// Service de contas correntes Santander
// Endpoints cobertos: lista contas, saldo, extrato (com fatia automatica de 30d)
const { callApi, BANK_ID, AGENCIA, CONTA } = require('./httpClient');
const { supabase } = require('../../utils/supabase');

const BASE = '/bank_account_information/v1';

// Santander exige formato AGENCIA.CONTA · 4 digitos de agencia + 12 de conta
// Ex: 3957.000130004222 (zero-padding a esquerda na conta se vier curta)
function padAgencia(a) { return String(a || '').padStart(4, '0'); }
function padConta(c) { return String(c || '').padStart(12, '0'); }

function balanceId() {
  if (!AGENCIA || !CONTA) throw new Error('SANTANDER_AGENCIA / SANTANDER_CONTA nao configurados');
  return `${padAgencia(AGENCIA)}.${padConta(CONTA)}`;
}

async function listarContas({ userId } = {}) {
  return callApi(`${BASE}/banks/${BANK_ID}/accounts`, { userId });
}

async function consultarSaldo({ userId } = {}) {
  const raw = await callApi(`${BASE}/banks/${BANK_ID}/balances/${balanceId()}`, { userId });
  // Normaliza · API retorna campos como string
  const available = Number(raw.availableAmount || 0);
  const blocked = Number(raw.blockedAmount || 0);
  const invested = Number(raw.automaticallyInvestedAmount || 0);
  // Limite de cheque especial · campo do Open Banking
  // Tenta varias chaves possiveis (Santander as vezes muda nomenclatura)
  const overdraftLimit = Number(
    raw.overdraftLimitAmount
    || raw.overdraftContractedLimit
    || raw.checkSpecialContractedLimit
    || 0
  );
  const overdraftUsed = Number(
    raw.overdraftUsedAmount
    || raw.checkSpecialUsedAmount
    || 0
  );
  return {
    available,
    blocked,
    invested,
    overdraftLimit,
    overdraftUsed,
    overdraftAvailable: overdraftLimit > 0 ? overdraftLimit - overdraftUsed : 0,
    total: available + blocked + invested,
    currency: raw.availableAmountCurrency || 'BRL',
    raw,
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

// Fatiar periodo em janelas de max 30 dias (limite da API)
function fatiarPeriodo(inicio, fim) {
  const fatias = [];
  let cursor = new Date(inicio);
  const fimDate = new Date(fim);
  while (cursor <= fimDate) {
    const proxFim = new Date(cursor);
    proxFim.setDate(proxFim.getDate() + 29);
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
  return callApi(`${BASE}/banks/${BANK_ID}/statements`, {
    query: {
      branchCode: padAgencia(AGENCIA),
      accountNumber: padConta(CONTA),
      initialDate: inicio,
      finalDate: fim,
    },
    userId,
  });
}

async function consultarExtrato({ inicio, fim, usarCache = true, userId } = {}) {
  if (!inicio || !fim) throw new Error('inicio e fim obrigatorios (YYYY-MM-DD)');

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
  for (const f of fatias) {
    const res = await buscarExtratoSantander({ inicio: f.inicio, fim: f.fim, userId });
    respostas.push(res);
  }

  // Concatena _content das fatias preservando estrutura
  const merged = {
    _content: respostas.flatMap((r) => Array.isArray(r?._content) ? r._content : []),
    _pageable: { _moreElements: false },
    _fatias: fatias.length,
  };

  if (usarCache && supabase) {
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
};
