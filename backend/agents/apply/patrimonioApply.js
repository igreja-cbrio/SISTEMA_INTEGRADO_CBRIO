async function notif(opts) {
  const { notificar } = require('../../services/notificar');
  return notificar(opts);
}

async function applyManutencao({ payload }) {
  const { bem_id, nome_bem, dias_em_manutencao, valor_aquisicao } = payload || {};
  if (!bem_id) return { ok: false, error: 'bem_id ausente' };
  await notif({
    modulo: 'patrimonio', tipo: 'manutencao_longa',
    titulo: `Manutencao prolongada · ${nome_bem}`,
    mensagem: `${nome_bem}${valor_aquisicao ? ` (R$ ${valor_aquisicao})` : ''} esta em manutencao ha ${dias_em_manutencao} dias. Verificar status.`,
    link: `/admin/patrimonio/bens/${bem_id}`,
    severidade: dias_em_manutencao > 90 ? 'critico' : 'alerta',
    chaveDedup: `pat_manut_${bem_id}_${new Date().toISOString().slice(0, 7)}`,
  });
  return { ok: true, info: { bem_id, dias: dias_em_manutencao } };
}

async function applyEmprestado({ payload }) {
  const { bem_id, nome_bem, dias_emprestado, valor_aquisicao } = payload || {};
  if (!bem_id) return { ok: false, error: 'bem_id ausente' };
  await notif({
    modulo: 'patrimonio', tipo: 'bem_emprestado_sem_retorno',
    titulo: `Bem emprestado sem retorno · ${nome_bem}`,
    mensagem: `${nome_bem}${valor_aquisicao ? ` (R$ ${valor_aquisicao})` : ''} emprestado ha ${dias_emprestado} dias sem registro de retorno.`,
    link: `/admin/patrimonio/bens/${bem_id}`,
    severidade: dias_emprestado > 120 ? 'critico' : 'alerta',
    chaveDedup: `pat_empr_${bem_id}_${new Date().toISOString().slice(0, 7)}`,
  });
  return { ok: true, info: { bem_id, dias: dias_emprestado } };
}

async function applyCadastroIncompleto({ payload }) {
  const { bem_id, nome_bem, valor_aquisicao, campos_faltando } = payload || {};
  if (!bem_id) return { ok: false, error: 'bem_id ausente' };
  await notif({
    modulo: 'patrimonio', tipo: 'cadastro_incompleto',
    titulo: `Cadastro incompleto · ${nome_bem}`,
    mensagem: `${nome_bem} (R$ ${valor_aquisicao}) com cadastro incompleto. Faltam: ${(campos_faltando || []).join(', ')}.`,
    link: `/admin/patrimonio/bens/${bem_id}`,
    severidade: 'aviso',
    chaveDedup: `pat_cad_${bem_id}_${new Date().toISOString().slice(0, 7)}`,
  });
  return { ok: true, info: { bem_id, faltando: campos_faltando } };
}

const HANDLERS = {
  'pat.alertar_manutencao_longa': applyManutencao,
  'pat.alertar_bem_emprestado': applyEmprestado,
  'pat.alertar_cadastro_incompleto': applyCadastroIncompleto,
};

async function applyPatrimonioAction({ action_type, payload, reviewedBy }) {
  const handler = HANDLERS[action_type];
  if (!handler) return { ok: false, error: `action_type desconhecido: ${action_type}` };
  try { return await handler({ payload, reviewedBy }); }
  catch (e) { return { ok: false, error: e.message || String(e) }; }
}

module.exports = { applyPatrimonioAction, HANDLERS };
