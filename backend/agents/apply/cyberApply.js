// Apply handler do agente cyber · achados de seguranca.
// Achado e INFORMATIVO: "aplicar" = o aprovador registrou cienca. Nenhuma
// mutacao no banco — a correcao vira tarefa humana no board de agentes.
async function applyCyberAction({ action_type, payload, reviewedBy }) {
  if (action_type !== 'cyber.achado_seguranca') {
    return { ok: false, error: `action_type cyber desconhecido: ${action_type}` };
  }
  const severidade = payload?.severidade || 'media';
  return {
    ok: true,
    info: `Achado de seguranca (${severidade}) registrado. Nenhuma acao automatica — abrir tarefa no board do time de agentes para o plano de correcao.`,
  };
}

module.exports = { applyCyberAction };
