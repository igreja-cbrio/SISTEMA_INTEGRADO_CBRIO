// Handlers que APLICAM acoes propostas pelo agente kpis_watcher
// apos aprovacao humana.

const { supabase } = require('../../utils/supabase');

// ─────────────────────────────────────────────────────────────────────
// kpis.alertar_lider
// Cria notificacao in-app pro lider via tabela notificacoes_app.
// ─────────────────────────────────────────────────────────────────────
async function applyAlertarLider({ payload, reviewedBy }) {
  const { kpi_id, lider_funcionario_id, severidade, titulo, mensagem } = payload || {};
  if (!kpi_id) return { ok: false, error: 'kpi_id ausente' };
  if (!lider_funcionario_id) return { ok: false, error: 'lider_funcionario_id ausente' };
  if (!titulo || !mensagem) return { ok: false, error: 'titulo e mensagem obrigatorios' };

  // Resolve email do lider a partir de rh_funcionarios pra achar profile_id
  const { data: func, error: errFunc } = await supabase
    .from('rh_funcionarios')
    .select('id, nome, email')
    .eq('id', lider_funcionario_id)
    .maybeSingle();
  if (errFunc) return { ok: false, error: errFunc.message };
  if (!func) return { ok: false, error: 'funcionario nao encontrado' };

  // Profile match por email (case-insensitive)
  let profileId = null;
  if (func.email) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', func.email)
      .maybeSingle();
    profileId = prof?.id || null;
  }

  if (!profileId) {
    return {
      ok: false,
      error: `funcionario ${func.nome} sem profile linkado · nao da pra notificar`,
    };
  }

  // Usa o servico notificar.js direto · padrao do sistema
  const { notificar } = require('../../services/notificar');
  await notificar({
    modulo: 'kpis',
    tipo: 'kpi_critico',
    titulo,
    mensagem,
    link: `/painel/kpi/${kpi_id}`,
    severidade: severidade || 'aviso',
    chaveDedup: `kpi_alerta_${kpi_id}_${new Date().toISOString().slice(0, 10)}`,
    targetIds: [profileId],
  });

  return {
    ok: true,
    info: { lider: func.nome, kpi_id, profile_id: profileId },
  };
}

const HANDLERS = {
  'kpis.alertar_lider': applyAlertarLider,
};

async function applyKpisAction({ action_type, payload, reviewedBy }) {
  const handler = HANDLERS[action_type];
  if (!handler) return { ok: false, error: `action_type desconhecido: ${action_type}` };
  try {
    return await handler({ payload, reviewedBy });
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

module.exports = { applyKpisAction, HANDLERS };
