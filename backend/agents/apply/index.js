// Roteador central de handlers de apply.
// Cada módulo registra seu prefixo (ex: 'fin.', 'kpis.') e seu handler.
// Pra plugar um módulo novo:
//   1. Cria backend/agents/apply/<módulo>Apply.js exportando apply<Módulo>Action
//   2. Adiciona o handler no MODULE_HANDLERS abaixo
//   3. Pronto · agent_queue rotea automático pelo prefixo do action_type

const { applyQueueAction: applyFinanceiroAction } = require('./financeiroApply');
const { applyKpisAction } = require('./kpisApply');
const { applyRhAction } = require('./rhApply');
const { applyCuidadosAction } = require('./cuidadosApply');
const { applyEventosAction } = require('./eventosApply');
const { applyVoluntariadoAction } = require('./voluntariadoApply');
const { applyLogisticaAction } = require('./logisticaApply');
const { applyMembresiaAction } = require('./membresiaApply');
const { applyPatrimonioAction } = require('./patrimonioApply');
const { applyCerebroAction } = require('./cerebroApply');
const { applyNextAction } = require('./nextApply');
const { applyGruposAction } = require('./gruposApply');
const { applyNpsAction } = require('./npsApply');
const { applyProjetosAction } = require('./projetosApply');

// Mapa prefixo -> handler
const MODULE_HANDLERS = {
  'fin.': applyFinanceiroAction,
  'kpis.': applyKpisAction,
  'rh.': applyRhAction,
  'cui.': applyCuidadosAction,
  'eventos.': applyEventosAction,
  'vol.': applyVoluntariadoAction,
  'log.': applyLogisticaAction,
  'mem.': applyMembresiaAction,
  'pat.': applyPatrimonioAction,
  'cerebro.': applyCerebroAction,
  'next.': applyNextAction,
  'grupos.': applyGruposAction,
  'nps.': applyNpsAction,
  'proj.': applyProjetosAction,
};

async function applyQueueAction({ action_type, payload, reviewedBy }) {
  if (!action_type || typeof action_type !== 'string') {
    return { ok: false, error: 'action_type obrigatorio' };
  }

  // Acha handler pelo prefixo
  const entry = Object.entries(MODULE_HANDLERS).find(([prefix]) =>
    action_type.startsWith(prefix)
  );
  if (!entry) {
    return { ok: false, error: `Nenhum handler registrado pra action_type: ${action_type}` };
  }
  const [, handler] = entry;
  return handler({ action_type, payload, reviewedBy });
}

module.exports = { applyQueueAction, MODULE_HANDLERS };
