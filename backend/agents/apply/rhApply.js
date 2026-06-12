// Handlers que APLICAM ações propostas pelo rh_executor após aprovação.

const { supabase } = require('../../utils/supabase');

async function resolverProfileDoFuncionario(funcionario_id) {
  const { data: func } = await supabase
    .from('rh_funcionarios')
    .select('id, nome, email, gestor_id')
    .eq('id', funcionario_id)
    .maybeSingle();
  if (!func) return { ok: false, error: 'funcionário não encontrado' };

  let profileId = null;
  if (func.email) {
    const { data: prof } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', func.email)
      .maybeSingle();
    profileId = prof?.id || null;
  }
  return { ok: true, func, profileId };
}

async function applyAlertarDocumento({ payload, reviewedBy }) {
  const { documento_id, funcionario_id, tipo_documento, data_expiracao, severidade } = payload || {};
  if (!documento_id || !funcionario_id) return { ok: false, error: 'documento_id ou funcionario_id ausente' };

  const r = await resolverProfileDoFuncionario(funcionario_id);
  if (!r.ok) return r;

  const { notificar } = require('../../services/notificar');
  await notificar({
    modulo: 'rh',
    tipo: 'documento_vencendo',
    titulo: `Documento ${tipo_documento} vencendo · ${r.func.nome}`,
    mensagem: `O documento ${tipo_documento} de ${r.func.nome} vence em ${data_expiracao}. Atualizar antes do prazo.`,
    link: `/rh/funcionarios/${funcionario_id}`,
    severidade: severidade || 'aviso',
    chaveDedup: `rh_doc_${documento_id}_${data_expiracao}`,
    targetIds: r.profileId ? [r.profileId] : undefined, // sem fallback · vai pra admin/diretor
  });
  return { ok: true, info: { documento_id, funcionario: r.func.nome } };
}

async function applyAlertarTreinamento({ payload, reviewedBy }) {
  const { treinamento_funcionario_id, funcionario_id } = payload || {};
  if (!funcionario_id) return { ok: false, error: 'funcionario_id ausente' };
  const r = await resolverProfileDoFuncionario(funcionario_id);
  if (!r.ok) return r;

  const { notificar } = require('../../services/notificar');
  await notificar({
    modulo: 'rh',
    tipo: 'treinamento_pendente',
    titulo: `Treinamento pendente · ${r.func.nome}`,
    mensagem: `${r.func.nome} tem treinamento(s) pendente(s). Acessar pra concluir.`,
    link: `/rh/funcionarios/${funcionario_id}`,
    severidade: 'aviso',
    chaveDedup: `rh_treino_${treinamento_funcionario_id}_${new Date().toISOString().slice(0, 10)}`,
    targetIds: r.profileId ? [r.profileId] : undefined,
  });
  return { ok: true, info: { funcionario: r.func.nome } };
}

async function applyAlertarFerias({ payload, reviewedBy }) {
  const { funcionario_id, data_admissao } = payload || {};
  if (!funcionario_id) return { ok: false, error: 'funcionario_id ausente' };
  const r = await resolverProfileDoFuncionario(funcionario_id);
  if (!r.ok) return r;

  const { notificar } = require('../../services/notificar');
  await notificar({
    modulo: 'rh',
    tipo: 'ferias_vencendo',
    titulo: `Ferias a vencer · ${r.func.nome}`,
    mensagem: `${r.func.nome} (admissão ${data_admissao}) esta com período aquisitivo de férias vencendo. Programar.`,
    link: `/rh/funcionarios/${funcionario_id}`,
    severidade: 'alerta',
    chaveDedup: `rh_ferias_${funcionario_id}_${new Date().toISOString().slice(0, 7)}`,
    // sem targetIds · vai pra admin/diretor (geralmente RH)
  });
  return { ok: true, info: { funcionario: r.func.nome } };
}

const HANDLERS = {
  'rh.alertar_documento_vencendo': applyAlertarDocumento,
  'rh.alertar_treinamento_pendente': applyAlertarTreinamento,
  'rh.alertar_ferias_vencendo': applyAlertarFerias,
};

async function applyRhAction({ action_type, payload, reviewedBy }) {
  const handler = HANDLERS[action_type];
  if (!handler) return { ok: false, error: `action_type desconhecido: ${action_type}` };
  try {
    return await handler({ payload, reviewedBy });
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

module.exports = { applyRhAction, HANDLERS };
