// ============================================================================
// Leitura do banco pra aba de Diagnósticos. A RÉGUA é `utils/agentDiagnostico.js`
// (pura, no gate) — aqui só se busca e monta o Map. Não duplicar régua.
//
// ⚠️ Uma requisição resolve a tela inteira, de propósito: o front NÃO deve
// costurar `agent_runs` + `system_incidents` + `system_incident_events` com N+1
// (61 findings viram 120 idas ao banco, e a tela é aberta a partir de um push).
// ============================================================================
const { supabase } = require('../utils/supabase');
const { montarItens, resumirItens } = require('../utils/agentDiagnostico');

const LOTE = 200; // `.in()` sempre em lotes ≤200 (lei do projeto)

async function lerEmLotes(ids, consulta) {
  const out = [];
  for (let i = 0; i < ids.length; i += LOTE) {
    const { data, error } = await consulta(ids.slice(i, i + LOTE));
    // ⚠️ PROPAGA: incidente que não veio faria o item aparecer como
    // "sem_incidente" e o plano de ação de um caso RESOLVIDO voltaria a
    // parecer pendência. Erro visível é melhor que estado inventado.
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

/**
 * @param {object} opts
 * @param {number} [opts.limite]  quantas RUNS ler (não itens) · teto 100
 * @param {string} [opts.agentType] filtra um tipo de agente
 */
async function listarDiagnosticos({ limite, agentType } = {}) {
  const lim = Math.min(Math.max(parseInt(limite, 10) || 40, 1), 100);

  let q = supabase.from('agent_runs')
    .select('id, agent_type, status, summary, findings, started_at, completed_at, created_at')
    .not('findings', 'is', null)
    .order('created_at', { ascending: false })
    .limit(lim);
  if (agentType) q = q.eq('agent_type', agentType);

  const { data: runsBrutas, error } = await q;
  if (error) throw error;

  // ⚠️ O filtro de array VAZIO é em JS: o PostgREST não expressa
  // `jsonb_array_length(findings) > 0` sem view/RPC, e `not.is.null` deixa
  // passar `[]`. Run sem finding não é item de tela.
  const runs = (runsBrutas || []).filter((r) => Array.isArray(r.findings) && r.findings.length);

  const incidenteIds = [...new Set(
    runs.flatMap((r) => r.findings.map((f) => f?.incident_id).filter(Boolean)),
  )];

  const incidentes = new Map();
  const diagnosticos = new Map();

  if (incidenteIds.length) {
    const linhas = await lerEmLotes(incidenteIds, (chunk) => supabase
      .from('system_incidents')
      .select('id, title, status, severity, environment, request_id, release, impact_summary, created_at, resolved_at')
      .in('id', chunk));
    linhas.forEach((i) => incidentes.set(i.id, i));

    // O diagnóstico estruturado vive no `metadata.diagnosis` de um evento `note`
    // do agente. Ordem ASC + sobrescrita = **o mais recente vence** (incidente
    // rediagnosticado tem mais de um).
    const eventos = await lerEmLotes(incidenteIds, (chunk) => supabase
      .from('system_incident_events')
      .select('incident_id, metadata, created_at')
      .in('incident_id', chunk)
      .order('created_at', { ascending: true }));
    eventos.forEach((ev) => {
      const d = ev?.metadata?.diagnosis;
      if (d && typeof d === 'object') diagnosticos.set(ev.incident_id, d);
    });
  }

  const itens = montarItens({ runs, incidentes, diagnosticos });
  return { itens, resumo: resumirItens(itens) };
}

module.exports = { listarDiagnosticos };
