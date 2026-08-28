// ============================================================================
// jornadaEngajamento · motor ÚNICO de engajamento (Jornada da Igreja + NSM)
// Unificado 2026-06-30 (decisão do Marcos): NSM e Jornada medem A MESMA COISA.
//
//   ENGAJADO = convertido + ≥1 sinal entre os 6 módulos:
//     { Batismo, Next, Grupos, Voluntariado, Dízimos/Ofertas, Devocional }
//
// "≥1 valor" puro daria 100% trivial (todo membro já converteu = "Seguir"), por
// isso a régua é "conversão + 1": a CONVERSÃO é o piso (= ser membro ativo) e os
// 6 módulos são o "+1". Espelha fn_nsm_sinais_engajados (a mesma régua que o NSM
// aplica ±60d sobre a coorte de convertidos · aqui é a igreja toda).
//
// Dobra os 6 sinais nos 5 valores da CBRio p/ exibição (igual ao NSM):
//   seguir = Batismo OU Next · conectar = Grupos · investir = Devocional ·
//   servir = Voluntariado · generosidade = Dízimos/Ofertas
//
// Estado vs janela: batismo/next/grupo/servir = ESTADO ATUAL (sem corte · pertencer
// é estado). devocional e dízimo/oferta = ATIVIDADE recorrente (cortada pela janela
// escolhida · 'atual' = sem corte).
//
// "investir" = SÓ devocional (decisão do Marcos · "pra cuidados deve ser devocionais").
// "Membro Modelo"/engajado = derivado, nunca persistido.
// ============================================================================

const { supabase } = require('../utils/supabase');
const { ANO_INICIAL, diaLocal } = require('../utils/janelaPeriodo');

const VALORES = ['seguir', 'conectar', 'investir', 'servir', 'generosidade'];

// Presets de janela → dias (rolling). 'atual' = sem corte de tempo.
const JANELAS = { mes: 30, '3m': 90, '6m': 180, '12m': 365, atual: null };
const JANELA_PADRAO = '3m'; // 90d · preserva continuidade com a métrica anterior

function janelaDias(janela) {
  return Object.prototype.hasOwnProperty.call(JANELAS, janela) ? JANELAS[janela] : JANELAS[JANELA_PADRAO];
}
// ⚠️ Aceita também `ano:2024` (pedido do Marcos · 24/08/2026: "não consigo ver
// a jornada por ano"). É a única janela FECHADA daqui — as outras são rolling.
function normalizaJanela(janela) {
  if (ehJanelaAno(janela)) return String(janela);
  return Object.prototype.hasOwnProperty.call(JANELAS, janela) ? janela : JANELA_PADRAO;
}
function ehJanelaAno(janela) {
  if (typeof janela !== 'string' || !/^ano:\d{4}$/.test(janela)) return false;
  const n = Number(janela.slice(4));
  return n >= ANO_INICIAL && n <= new Date().getFullYear();
}
/**
 * Recorte de datas da janela. `ate` só existe na janela de ANO.
 * ⚠️⚠️ Sem o `ate`, escolher "2024" mostraria 2024→hoje em silêncio.
 */
function recorteJanela(janela) {
  if (ehJanelaAno(janela)) {
    const n = Number(String(janela).slice(4));
    const fimDoAno = new Date(n, 11, 31, 12);
    const fim = fimDoAno.getTime() <= Date.now() ? fimDoAno : new Date();
    return { dias: null, ano: n, desde: `${n}-01-01`, ate: diaLocal(fim) };
  }
  const dias = janelaDias(janela);
  return { dias, ano: null, desde: dias == null ? null : daysAgo(dias), ate: null };
}
function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }

// Lê todas as linhas contornando o cap de 1000 do PostgREST (paginação).
async function fetchAllRows(table, build) {
  const page = 1000; let from = 0; const out = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await build(supabase.from(table)).range(from, from + page - 1);
    if (error) throw error;
    if (!data || !data.length) break;
    out.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return out;
}

// Set de membro_id de uma tabela. O caller aplica os filtros (inclusive
// deleted_at quando a tabela tiver · next_inscricoes NÃO tem a coluna).
async function fetchMembroSet(table, build) {
  const rows = await fetchAllRows(table, (q) => build(q.select('membro_id')));
  return new Set(rows.map((r) => r.membro_id).filter(Boolean));
}

// Calcula, pra base de membros ativos, os 5 valores (dobrados dos 6 sinais) de
// cada um na janela dada. engajado = ≥1 valor (= conversão + ≥1 dos 6 módulos).
// Retorna { janela, dias, total_base, membros:[{id,nome,...,valores,total_valores,engajado}] }.
async function computeJornada(janelaIn = JANELA_PADRAO) {
  const janela = normalizaJanela(janelaIn);
  const rec = recorteJanela(janela);
  const dias = rec.dias;
  // Corte só quando a janela tem recorte ('atual' não tem). ⚠️ O `.lte` existe
  // por causa da janela de ANO — é ele que a fecha; sem ele "2024" traria
  // 2024→hoje e o número só ficaria maior, sem nada quebrar.
  const comJanela = (q, col) => {
    let out = q;
    if (rec.desde) out = out.gte(col, rec.desde);
    if (rec.ate) out = out.lte(col, rec.ate);
    return out;
  };

  const membros = await fetchAllRows('mem_membros', (q) =>
    q.select('id, nome, email, telefone, foto_url, status')
      .is('deleted_at', null).eq('active', true).eq('status', 'membro_ativo'));

  // 6 sinais (espelham fn_nsm_sinais_engajados). Estado atual: batismo, next,
  // grupo, servir. Atividade na janela: investir (devocional), generosidade.
  const [batismoSet, nextSet, grupoSet, investirSet, servirSet, genSet] = await Promise.all([
    // Batismo · inscrição realizada (estado)
    fetchMembroSet('batismo_inscricoes', (q) => q.is('deleted_at', null).eq('status', 'realizado')),
    // ⚠️ Next · FONTE ÚNICA `vw_next_formado_pessoa` (régua de 14/08/2026: UM
    // encontro basta). Antes eram DOIS sets: `next_matriculas.status='formado'`
    // (que é POR TURMA e diz "não formou" para quem esteve num encontro de
    // outra turma) e o check-in da camada LEGADA `next_inscricoes`. Medido em
    // 14/08: a união dos dois reconhecia 689 pessoas contra 898 da view — 209 a
    // menos, e por isso a aba Jornada da Membresia e o /painel discordavam do
    // funil da Integração e dos KPIs sobre as MESMAS pessoas.
    // ⚠️ Conferido antes de trocar: dos 538 membros com check-in legado,
    // ZERO ficam de fora da view — a troca não perde ninguém.
    fetchMembroSet('vw_next_formado_pessoa', (q) => q.not('membro_id', 'is', null)),
    // Conectar · em grupo ativo (estado)
    fetchMembroSet('mem_grupo_membros', (q) => q.is('deleted_at', null).is('saiu_em', null)),
    // Investir · devocional concluído (atividade · na janela)
    fetchMembroSet('mem_devocionais', (q) => comJanela(q.is('deleted_at', null).eq('concluida', true), 'data_devocional')),
    // Servir · voluntário ativo (estado)
    fetchMembroSet('mem_voluntarios', (q) => q.is('deleted_at', null).is('ate', null)),
    // Generosidade · dízimo/oferta (atividade · na janela · empréstimo fora)
    fetchMembroSet('mem_contribuicoes', (q) => comJanela(q.is('deleted_at', null).in('tipo', ['dizimo', 'oferta']), 'data')),
  ]);

  const lista = membros.map((m) => {
    // seguir = Batismo OU Next (o "passo de fé" além da conversão · = sinal seguir do NSM)
    const v = {
      seguir: batismoSet.has(m.id) || nextSet.has(m.id),
      conectar: grupoSet.has(m.id),
      investir: investirSet.has(m.id),
      servir: servirSet.has(m.id),
      generosidade: genSet.has(m.id),
    };
    const total_valores = VALORES.reduce((acc, k) => acc + (v[k] ? 1 : 0), 0);
    return {
      id: m.id, nome: m.nome, email: m.email, telefone: m.telefone,
      foto_url: m.foto_url, status: m.status,
      valores: v, total_valores, engajado: total_valores >= 1,
    };
  });

  return { janela, dias, ano: rec.ano, desde: rec.desde, ate: rec.ate, total_base: lista.length, membros: lista };
}

// Agrega uma lista de membros enriquecidos (ou um subconjunto/coorte do funil).
function agregar(lista) {
  const total = lista.length;
  const denom = total || 1;
  const por_valor = {};
  for (const k of VALORES) {
    const n = lista.reduce((acc, m) => acc + (m.valores[k] ? 1 : 0), 0);
    por_valor[k] = { total: n, pct: Math.round((n / denom) * 100) };
  }
  const eng = lista.reduce((acc, m) => acc + (m.engajado ? 1 : 0), 0);
  return {
    total_membros: total,
    engajados: { total: eng, pct: Math.round((eng / denom) * 100) },
    valores: por_valor,
  };
}

module.exports = {
  computeJornada, agregar, VALORES, JANELAS, JANELA_PADRAO,
  janelaDias, normalizaJanela, ehJanelaAno, recorteJanela,
};
