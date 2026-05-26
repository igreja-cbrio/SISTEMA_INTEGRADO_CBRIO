async function notif(opts) {
  const { notificar } = require('../../services/notificar');
  return notificar(opts);
}

async function applyErros({ payload }) {
  const { qtd_erros, periodo_horas, amostra_arquivos } = payload || {};
  const amostraStr = (amostra_arquivos || []).slice(0, 3).join(', ');
  await notif({
    modulo: 'cerebro', tipo: 'erros_acumulando',
    titulo: `Cerebro · ${qtd_erros} erros em ${periodo_horas}h`,
    mensagem: `Pipeline acumulou ${qtd_erros} erros nas ultimas ${periodo_horas} horas. Amostra: ${amostraStr || 'sem detalhes'}. Investigar.`,
    link: `/admin/cerebro`,
    severidade: qtd_erros >= 20 ? 'critico' : 'alerta',
    chaveDedup: `cerebro_erros_${new Date().toISOString().slice(0, 10)}`,
  });
  return { ok: true, info: { qtd_erros } };
}

async function applyFilaTravada({ payload }) {
  const { qtd_pendentes, horas_minimo } = payload || {};
  await notif({
    modulo: 'cerebro', tipo: 'fila_travada',
    titulo: `Cerebro · fila travada (${qtd_pendentes} pendentes)`,
    mensagem: `${qtd_pendentes} itens em status='pendente' detectados ha mais de ${horas_minimo}h. Verificar cron/worker.`,
    link: `/admin/cerebro`,
    severidade: qtd_pendentes >= 50 ? 'critico' : 'alerta',
    chaveDedup: `cerebro_fila_${new Date().toISOString().slice(0, 10)}`,
  });
  return { ok: true, info: { qtd_pendentes } };
}

async function applyCusto({ payload }) {
  const { tokens_periodo, dias, itens_processados } = payload || {};
  await notif({
    modulo: 'cerebro', tipo: 'custo_crescente',
    titulo: `Cerebro · custo alto (${tokens_periodo} tokens em ${dias}d)`,
    mensagem: `Pipeline consumiu ${tokens_periodo.toLocaleString('pt-BR')} tokens nos ultimos ${dias} dias (${itens_processados} itens). Revisar limites.`,
    link: `/admin/cerebro`,
    severidade: 'aviso',
    chaveDedup: `cerebro_custo_${new Date().toISOString().slice(0, 10)}`,
  });
  return { ok: true, info: { tokens: tokens_periodo } };
}

const HANDLERS = {
  'cerebro.alertar_erros': applyErros,
  'cerebro.alertar_fila_travada': applyFilaTravada,
  'cerebro.alertar_custo': applyCusto,
};

async function applyCerebroAction({ action_type, payload, reviewedBy }) {
  const handler = HANDLERS[action_type];
  if (!handler) return { ok: false, error: `action_type desconhecido: ${action_type}` };
  try { return await handler({ payload, reviewedBy }); }
  catch (e) { return { ok: false, error: e.message || String(e) }; }
}

module.exports = { applyCerebroAction, HANDLERS };
