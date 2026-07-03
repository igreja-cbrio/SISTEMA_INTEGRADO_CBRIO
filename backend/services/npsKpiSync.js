// ============================================================================
// npsKpiSync · leva o agregado de cada pesquisa NPS pra dados_brutos, de onde
// os KPIs de satisfação (nps_culto / nps_lideres / nps_voluntarios / nps_next /
// nps_geral) são recalculados pelo gatilho de dados_brutos.
//
// Extraído de routes/nps.js pra ser compartilhado com o canal PÚBLICO
// (publicNps.js) — o link aberto no culto, onde chega o grosso das respostas
// e que até então nunca sincronizava (o KPI ficava parado no último valor).
// ============================================================================
const { supabase } = require('../utils/supabase');

// ── Sync de uma pesquisa ─────────────────────────────────────────────────────
// O contexto gravado precisa ser ESTÁVEL: ele faz parte do UNIQUE de
// dados_brutos (tipo_id, area, data, contexto). O formato antigo guardava
// total_respostas/nps_score dentro do contexto → cada sync com contagem nova
// INSERIA uma linha nova em vez de atualizar, e o avg do KPI misturava
// snapshots antigos da mesma pesquisa. Agora: contexto = { pesquisa_id } e os
// stats mutáveis vão pra observacao (informativo).
async function sincronizarKpi(pesquisaId) {
  const { data: pesquisa } = await supabase
    .from('nps_pesquisas')
    .select('id, contexto_kpi, area, data_inicio, status')
    .eq('id', pesquisaId)
    .single();
  if (!pesquisa || !pesquisa.contexto_kpi) return;

  // Pesquisa arquivada não deve seguir contando no KPI.
  if (pesquisa.status === 'arquivada') {
    await removerDadosBrutos(pesquisa.id);
    return;
  }

  const { data: stats } = await supabase
    .from('vw_nps_pesquisa_stats')
    .select('total_respostas, score_medio, nps_score')
    .eq('pesquisa_id', pesquisa.id)
    .single();
  if (!stats || !stats.total_respostas) return;

  const { data: tipo } = await supabase
    .from('tipos_dado_bruto')
    .select('id')
    .eq('id', pesquisa.contexto_kpi)
    .maybeSingle();
  if (!tipo) return; // tipo NPS ainda não seedado — ignora silenciosamente

  // Snapshots antigos da MESMA pesquisa saem antes do canônico entrar: cobre o
  // formato legado (stats no contexto), mudança de tipo/área/data numa edição
  // e a própria linha canônica (o upsert a repõe). Só linhas com pesquisa_id
  // no contexto são tocadas — o canal manual (painelArea) usa outro formato.
  await removerDadosBrutos(pesquisa.id);

  await supabase
    .from('dados_brutos')
    .upsert(
      {
        tipo_id: pesquisa.contexto_kpi,
        area: pesquisa.area || 'geral',
        data: pesquisa.data_inicio,
        valor: Number(stats.score_medio) || 0,
        contexto: { pesquisa_id: pesquisa.id },
        origem: 'auto',
        observacao: `NPS automático: pesquisa ${pesquisa.id} · ${stats.total_respostas} resposta(s) · nps_score ${Number(stats.nps_score) || 0}`,
      },
      { onConflict: 'tipo_id,area,data,contexto' }
    );
}

// Remove as linhas de dados_brutos originadas desta pesquisa (qualquer
// tipo/área/data — a chave é o pesquisa_id dentro do contexto).
async function removerDadosBrutos(pesquisaId) {
  await supabase
    .from('dados_brutos')
    .delete()
    .contains('contexto', { pesquisa_id: pesquisaId });
}

// ── Fire-and-forget com colapso por pesquisa (canal público) ────────────────
// No pico do culto (centenas de respostas em minutos), sincronizar a cada
// resposta multiplicaria queries à toa — o valor é um agregado da view, então
// o último sync corrige tudo. Janela de 15s por pesquisa POR INSTÂNCIA
// (serverless: cada instância tem o próprio Map; o corte de volume já é
// suficiente). O rabo do pico (respostas que caem dentro da janela sem uma
// próxima pra reabrir) é coberto pelo re-sync do cron diário e pelo sync do
// PUT da pesquisa.
const _ultimoSync = new Map(); // pesquisaId → epoch ms
const JANELA_MS = 15 * 1000;
function agendarSync(pesquisaId) {
  const agora = Date.now();
  if (agora - (_ultimoSync.get(pesquisaId) || 0) < JANELA_MS) return;
  _ultimoSync.set(pesquisaId, agora);
  sincronizarKpi(pesquisaId).catch((err) =>
    console.warn('[npsKpiSync] sync falhou:', err.message)
  );
}

// ── Rede de segurança (cron diário de KPIs) ─────────────────────────────────
// Re-sincroniza as pesquisas ativas e as iniciadas há pouco (cobre encerradas
// recentes) — garante o valor final mesmo que o rabo do pico tenha caído na
// janela do throttle ou a instância tenha morrido antes do fire-and-forget.
async function sincronizarPesquisasRecentes() {
  const corte = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const { data: pesquisas, error } = await supabase
    .from('nps_pesquisas')
    .select('id')
    .or(`status.eq.ativa,data_inicio.gte.${corte}`)
    .order('data_inicio', { ascending: false })
    .limit(100);
  if (error) return { error: error.message };
  let sincronizadas = 0;
  for (const p of pesquisas || []) {
    try {
      await sincronizarKpi(p.id);
      sincronizadas++;
    } catch (e) {
      console.warn('[npsKpiSync] recentes:', p.id, e.message);
    }
  }
  return { pesquisas: (pesquisas || []).length, sincronizadas };
}

module.exports = {
  sincronizarKpi,
  agendarSync,
  removerDadosBrutos,
  sincronizarPesquisasRecentes,
};
