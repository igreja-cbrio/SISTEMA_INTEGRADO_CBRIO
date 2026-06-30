// ============================================================================
// jornadaEngajamento · motor único da "Jornada da Igreja" (Fase 2 · 2026-06-20)
//
// Mede os 5 valores sobre TODOS os membros formais (status='membro_ativo'),
// parametrizado por JANELA de tempo. Decisão do Marcos (2026-06-20):
//   - PROFUNDIDADE por ESTADO ATUAL: seguir/conectar/servir não têm corte de
//     recência (pertencer ao valor é estado, não atividade do mês).
//   - A janela corta SÓ as atividades recorrentes: investir (devocional) e
//     generosidade (dízimo/oferta). 'atual' = sem corte (qualquer época).
//
// "Membro Modelo" = membro com >= 2 dos 5 valores (derivado, nunca persistido).
//
// É fonte única: o /painel (estrela Jornada), a página /jornada e o KPI CUID-06
// (cuidados.membros_2mais_valores) leem daqui — uma definição só, sem divergir.
//
// Difere do NSM (fn_nsm_sinais_engajados · ±60d sobre recém-convertidos): ali a
// população é a coorte de conversão e a janela é relativa à decisão. Aqui é a
// igreja toda e a janela é absoluta (escolhida na tela). São métricas-irmãs com
// populações diferentes — o /painel mostra as duas como "2 estrelas".
// ============================================================================

const { supabase } = require('../utils/supabase');

const VALORES = ['seguir', 'conectar', 'investir', 'servir', 'generosidade'];

// Presets de janela → dias (rolling). 'atual' = sem corte de tempo.
const JANELAS = { mes: 30, '3m': 90, '6m': 180, '12m': 365, atual: null };
const JANELA_PADRAO = '3m'; // 90d · preserva continuidade com a métrica anterior

function janelaDias(janela) {
  return Object.prototype.hasOwnProperty.call(JANELAS, janela) ? JANELAS[janela] : JANELAS[JANELA_PADRAO];
}
function normalizaJanela(janela) {
  return Object.prototype.hasOwnProperty.call(JANELAS, janela) ? janela : JANELA_PADRAO;
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

async function fetchMembroSet(table, build) {
  const rows = await fetchAllRows(table, (q) => build(q.select('membro_id').is('deleted_at', null)));
  return new Set(rows.map((r) => r.membro_id).filter(Boolean));
}

// Calcula, pra base de membros ativos, os 5 valores de cada um na janela dada.
// Retorna { janela, dias, total_base, membros:[{id,nome,...,valores,total_valores}] }.
async function computeJornada(janelaIn = JANELA_PADRAO) {
  const janela = normalizaJanela(janelaIn);
  const dias = janelaDias(janela);
  // aplica corte de data só quando a janela não é 'atual' (dias != null)
  const comJanela = (q, col) => (dias == null ? q : q.gte(col, daysAgo(dias)));

  const membros = await fetchAllRows('mem_membros', (q) =>
    q.select('id, nome, email, telefone, foto_url, status')
      .is('deleted_at', null).eq('active', true).eq('status', 'membro_ativo'));

  // Ordem (e nomes) na MESMA sequência dos valores: seguir, conectar, investir, servir, generosidade.
  const [seguirSet, conectarSet, investirSet, servirSet, genSet] = await Promise.all([
    // Estado atual (sem janela): seguir, conectar
    fetchMembroSet('mem_trilha_valores', (q) => q.in('etapa', ['conversao', 'primeiro_contato', 'batismo']).eq('concluida', true)),
    fetchMembroSet('mem_grupo_membros', (q) => q.is('saiu_em', null)),
    // Atividade recorrente (cortada pela janela): investir
    fetchMembroSet('mem_devocionais', (q) => comJanela(q.eq('concluida', true), 'data_devocional')),
    // Estado atual (sem janela): servir
    fetchMembroSet('mem_voluntarios', (q) => q.is('ate', null)),
    // Atividade recorrente (cortada pela janela): generosidade
    fetchMembroSet('mem_contribuicoes', (q) => comJanela(q.in('tipo', ['dizimo', 'oferta']), 'data')),
  ]);
  const sets = { seguir: seguirSet, conectar: conectarSet, investir: investirSet, servir: servirSet, generosidade: genSet };

  const lista = membros.map((m) => {
    const v = {
      seguir: sets.seguir.has(m.id),
      conectar: sets.conectar.has(m.id),
      investir: sets.investir.has(m.id),
      servir: sets.servir.has(m.id),
      generosidade: sets.generosidade.has(m.id),
    };
    const total_valores = VALORES.reduce((acc, k) => acc + (v[k] ? 1 : 0), 0);
    return {
      id: m.id, nome: m.nome, email: m.email, telefone: m.telefone,
      foto_url: m.foto_url, status: m.status, valores: v, total_valores,
    };
  });

  return { janela, dias, total_base: lista.length, membros: lista };
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
  const mm = lista.reduce((acc, m) => acc + (m.total_valores >= 2 ? 1 : 0), 0);
  return {
    total_membros: total,
    membro_modelo: { total: mm, pct: Math.round((mm / denom) * 100) },
    valores: por_valor,
  };
}

module.exports = { computeJornada, agregar, VALORES, JANELAS, JANELA_PADRAO, janelaDias, normalizaJanela };
