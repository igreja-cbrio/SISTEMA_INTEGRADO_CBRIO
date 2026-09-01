// ============================================================================
// Régua PURA da aba de Diagnósticos (`/assistente-ia?tab=diagnosticos`).
//
// ⚠️ POR QUE ESTE ARQUIVO EXISTE (27/08/2026): os agentes de incidente vinham
// diagnosticando e **mandando push** desde 17/08 — e o diagnóstico não aparecia
// em NENHUMA tela. A notificação linkava `/assistente-ia?run=<id>`, a página
// ignorava o `?run=` e não lia `agent_runs`; o `/sistema` carregava o evento do
// diagnóstico e renderizava só o `message`, jogando fora o `metadata.diagnosis`
// (causa provável, evidências, plano de ação, passos de validação, pergunta de
// decisão). O Matheus recebeu o aviso no celular e não tinha onde ler.
//
// Mora em `utils/` porque entra no GATE (não pode arrastar o Supabase atrás).
// Quem lê o banco é `services/agentDiagnosticos.js`.
// ============================================================================

/**
 * Rótulo humano do tipo de agente. ⚠️ Espelha `SPECIALISTS` de
 * `backend/agents/incidentDiagnostician.js` — mudou lá, muda aqui, senão a tela
 * chama de "Backend Diagnostician" o que a notificação chamou de outra coisa.
 */
const ROTULO_AGENTE = Object.freeze({
  incident_backend_diagnostician: 'Especialista Backend & API',
  incident_automation_diagnostician: 'Especialista em Automações',
  incident_experience_diagnostician: 'Especialista em Experiência',
  incident_general_diagnostician: 'Especialista Geral de Incidentes',
  system_auditor: 'Auditor do Sistema',
  design_auditor: 'Auditor de Design',
});

/**
 * ⚠️ Fallback DERIVADO, nunca `agent_type` cru na tela: `module_rh` viraria
 * "module_rh" no card. Vira "Auditoria · RH".
 */
function rotuloAgente(agentType) {
  const t = String(agentType || '').trim();
  if (!t) return 'Agente';
  if (ROTULO_AGENTE[t]) return ROTULO_AGENTE[t];
  if (t.startsWith('module_')) {
    const mod = t.slice('module_'.length).replace(/_/g, ' ');
    return `Auditoria · ${mod.charAt(0).toUpperCase()}${mod.slice(1)}`;
  }
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Severidades que a tela trata como "precisa de gente". */
const SEVERIDADES = Object.freeze(['critico', 'aviso', 'info']);

function severidadeDe(finding) {
  const s = String(finding?.severity || '').toLowerCase();
  return SEVERIDADES.includes(s) ? s : 'info';
}

/**
 * ⚠️⚠️ O PLANO DE AÇÃO, e por que ele tem DUAS fontes.
 *
 * O agente de incidente grava o diagnóstico estruturado em
 * `system_incident_events.metadata.diagnosis` (com `recommended_actions` e
 * `validation_steps` como ARRAYS) e, em paralelo, resume tudo no `suggestion` do
 * finding, que é **uma string com ` | ` entre os passos**. As auditorias antigas
 * de módulo têm SÓ o `suggestion`.
 *
 * ⚠️ Sem plano nenhum, devolve `[]` — e a TELA declara "sem plano de ação
 * registrado". Lista vazia sem explicação se lê como tela quebrada, que é o
 * defeito que esta aba existe pra consertar.
 */
function planoDeAcao(finding, diagnosis) {
  const doDiagnostico = Array.isArray(diagnosis?.recommended_actions)
    ? diagnosis.recommended_actions.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  if (doDiagnostico.length) return doDiagnostico;
  return String(finding?.suggestion || '')
    .split('|')
    .map((x) => x.trim())
    .filter(Boolean);
}

function passosDeValidacao(diagnosis) {
  return Array.isArray(diagnosis?.validation_steps)
    ? diagnosis.validation_steps.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
}

function evidencias(finding, diagnosis) {
  if (Array.isArray(diagnosis?.evidence) && diagnosis.evidence.length) {
    return diagnosis.evidence.map((x) => String(x || '').trim()).filter(Boolean);
  }
  // O finding empacota as evidências no fim do `detail`, depois de "Evidências:".
  const detalhe = String(finding?.detail || '');
  const corte = detalhe.indexOf('Evidências:');
  if (corte < 0) return [];
  return detalhe.slice(corte + 'Evidências:'.length)
    .split('|').map((x) => x.trim()).filter(Boolean);
}

/** O `detail` sem o rabo de evidências (que a tela mostra em lista própria). */
function resumoDoFinding(finding, diagnosis) {
  if (diagnosis?.summary) return String(diagnosis.summary).trim();
  const detalhe = String(finding?.detail || '');
  const corte = detalhe.indexOf('Evidências:');
  return (corte < 0 ? detalhe : detalhe.slice(0, corte)).trim();
}

/**
 * ⚠️ Status de TRABALHO do item, e ele não é o status do incidente.
 *
 * `resolvido` / `risco_aceito` = a decisão já foi tomada, então o plano de ação
 * é HISTÓRICO e não pode aparecer como pendência (é o que faz a aba parar de
 * cobrar o que já foi resolvido). Finding de auditoria sem incidente fica
 * `sem_incidente`: ele descreve algo que ninguém abriu como incidente, e
 * chamá-lo de "aberto" prometeria uma fila que não existe.
 */
function estadoDoItem(incidente) {
  if (!incidente) return 'sem_incidente';
  const st = String(incidente.status || '').toLowerCase();
  if (st === 'resolvido' || st === 'risco_aceito' || st === 'duplicado') return 'encerrado';
  return 'aberto';
}

/**
 * Junta runs + incidentes + diagnósticos em itens de tela.
 *
 * ⚠️⚠️ FINDING SEM INCIDENTE NÃO DESAPARECE. Filtrar por `incident_id` deixaria
 * de fora as 46 constatações das auditorias de módulo — e "a aba está vazia" é
 * indistinguível de "não há nada errado".
 *
 * @param runs        linhas de `agent_runs` (mais recente primeiro)
 * @param incidentes  Map<incident_id, incidente>
 * @param diagnosticos Map<incident_id, diagnosis>
 */
function montarItens({ runs = [], incidentes = new Map(), diagnosticos = new Map() } = {}) {
  const itens = [];
  for (const run of runs) {
    const findings = Array.isArray(run?.findings) ? run.findings : [];
    findings.forEach((finding, i) => {
      const incidenteId = finding?.incident_id || null;
      const incidente = incidenteId ? (incidentes.get(incidenteId) || null) : null;
      const diagnosis = incidenteId ? (diagnosticos.get(incidenteId) || null) : null;
      itens.push({
        // ⚠️ Chave estável por (run, posição): a mesma run pode ter N findings, e
        // usar só o run_id faria o React reusar o card errado ao filtrar.
        id: `${run.id}:${i}`,
        run_id: run.id,
        agent_type: run.agent_type || null,
        agente: rotuloAgente(run.agent_type),
        quando: run.completed_at || run.started_at || run.created_at || null,
        severidade: severidadeDe(finding),
        estado: estadoDoItem(incidente),
        titulo: String(finding?.title || 'Constatação sem título').trim(),
        modulo: finding?.module || null,
        resumo: resumoDoFinding(finding, diagnosis),
        evidencias: evidencias(finding, diagnosis),
        plano_de_acao: planoDeAcao(finding, diagnosis),
        passos_de_validacao: passosDeValidacao(diagnosis),
        classificacao: diagnosis?.classification || null,
        confianca: diagnosis?.confidence || null,
        risco: diagnosis?.risk_level || null,
        // ⚠️ A pergunta só é destacada quando o agente DECLAROU que precisa de
        // decisão: destacar sempre transformaria a aba numa fila infinita.
        decisao_necessaria: diagnosis?.decision_required === true && !!String(diagnosis?.decision_question || '').trim(),
        pergunta_de_decisao: String(diagnosis?.decision_question || '').trim() || null,
        incidente: incidente ? {
          id: incidente.id,
          titulo: incidente.title,
          status: incidente.status,
          severidade: incidente.severity,
          ambiente: incidente.environment,
          request_id: incidente.request_id,
          release: incidente.release,
          impacto: incidente.impact_summary,
          aberto_em: incidente.created_at,
          resolvido_em: incidente.resolved_at,
        } : null,
      });
    });
  }
  return itens;
}

/** Contagem pro cabeçalho — só o que está ABERTO conta como pendência. */
function resumirItens(itens = []) {
  const abertos = itens.filter((i) => i.estado === 'aberto');
  return {
    total: itens.length,
    abertos: abertos.length,
    criticos_abertos: abertos.filter((i) => i.severidade === 'critico').length,
    aguardando_decisao: abertos.filter((i) => i.decisao_necessaria).length,
    sem_plano: itens.filter((i) => !i.plano_de_acao.length).length,
  };
}

module.exports = {
  ROTULO_AGENTE,
  rotuloAgente,
  severidadeDe,
  planoDeAcao,
  passosDeValidacao,
  evidencias,
  resumoDoFinding,
  estadoDoItem,
  montarItens,
  resumirItens,
};
