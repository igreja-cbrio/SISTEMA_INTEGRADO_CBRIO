const { supabase } = require('../utils/supabase');

/**
 * Constrói o contexto RAG para os agentes com dados reais do sistema.
 * Cada módulo traz métricas agregadas (nunca dados pessoais sensíveis em massa).
 */
async function buildContext(targetModules = ['all']) {
  const modules = targetModules.includes('all')
    ? ['rh', 'financeiro', 'logistica', 'patrimonio', 'eventos', 'projetos', 'membresia']
    : targetModules;

  const ctx = { sistema: getSystemDoc(), modulos: {} };

  for (const mod of modules) {
    try {
      ctx.modulos[mod] = await fetchModuleContext(mod);
    } catch (e) {
      ctx.modulos[mod] = { error: e.message };
    }
  }

  return ctx;
}

function getSystemDoc() {
  return `
CBRio ERP — Sistema de gestão interno da Igreja Comunidade Batista do Rio de Janeiro.
Stack: React 18 + Express + Supabase (PostgreSQL).
Deploy: Vercel (frontend + backend serverless).

Módulos:
- RH: funcionários, documentos, treinamentos, férias/licenças, escalas de extras, benefícios, admissões
- Financeiro: contas bancárias, transações, contas a pagar, reembolsos, arrecadação
- Logística: fornecedores, solicitações de compra, pedidos, notas fiscais, integração Mercado Livre
- Patrimônio: bens, categorias, localizações, movimentações, inventários
- Eventos: projetos de eventos, tarefas, reuniões, ciclos criativos
- Projetos: projetos institucionais com milestones
- Membresia: membros da igreja, famílias, trilha dos valores, grupos de vida, contribuições, voluntariado, cadastros pendentes

Regras de negócio importantes:
- Transferências entre contas devem ser filtradas nas análises financeiras
- Férias CLT: período de experiência = 90 dias
- Documentos com data_expiracao devem ser monitorados
- Bens extraviados são urgentes
- Notificações automáticas rodam a cada 6h
`.trim();
}

async function fetchModuleContext(mod) {
  switch (mod) {
    case 'rh': return fetchRHContext();
    case 'financeiro': return fetchFinanceiroContext();
    case 'logistica': return fetchLogisticaContext();
    case 'patrimonio': return fetchPatrimonioContext();
    case 'eventos': return fetchEventosContext();
    case 'projetos': return fetchProjetosContext();
    case 'membresia': return fetchMembresiaContext();
    default: return { info: 'Módulo não reconhecido' };
  }
}

async function fetchRHContext() {
  const { count: total } = await supabase.from('rh_funcionarios').select('id', { count: 'exact', head: true });
  const { count: ativos } = await supabase.from('rh_funcionarios').select('id', { count: 'exact', head: true }).eq('status', 'ativo');
  const { count: ferias } = await supabase.from('rh_funcionarios').select('id', { count: 'exact', head: true }).eq('status', 'ferias');
  const { count: docs } = await supabase.from('rh_documentos').select('id', { count: 'exact', head: true });
  const { count: treinos } = await supabase.from('rh_treinamentos').select('id', { count: 'exact', head: true });
  const { count: feriasPend } = await supabase.from('rh_ferias_licencas').select('id', { count: 'exact', head: true }).eq('status', 'pendente');
  const { count: admissoes } = await supabase.from('rh_admissoes').select('id', { count: 'exact', head: true }).neq('status', 'concluido');

  // Campos nulos em funcionários ativos
  const { data: funcsComProblemas } = await supabase.from('rh_funcionarios')
    .select('id, nome, cpf, email, cargo, data_admissao')
    .eq('status', 'ativo')
    .or('cpf.is.null,email.is.null');

  return {
    resumo: { total, ativos, ferias, documentos: docs, treinamentos: treinos, ferias_pendentes: feriasPend, admissoes_abertas: admissoes },
    problemas: {
      funcionarios_sem_dados: (funcsComProblemas || []).map(f => ({
        id: f.id, nome: f.nome,
        campos_faltando: [!f.cpf && 'CPF', !f.email && 'Email'].filter(Boolean),
      })),
    },
  };
}

async function fetchFinanceiroContext() {
  const { count: contas } = await supabase.from('fin_contas').select('id', { count: 'exact', head: true }).eq('ativa', true);
  const { data: saldos } = await supabase.from('fin_contas').select('nome, saldo, tipo').eq('ativa', true);
  const { count: transacoes } = await supabase.from('fin_transacoes').select('id', { count: 'exact', head: true });
  const { count: pendentes } = await supabase.from('fin_contas_pagar').select('id', { count: 'exact', head: true }).eq('status', 'pendente');

  const today = new Date().toISOString().slice(0, 10);
  const { count: vencidas } = await supabase.from('fin_contas_pagar').select('id', { count: 'exact', head: true }).eq('status', 'pendente').lt('data_vencimento', today);
  const { count: reembolsos } = await supabase.from('fin_reembolsos').select('id', { count: 'exact', head: true }).eq('status', 'pendente');

  return {
    resumo: { contas_ativas: contas, transacoes_total: transacoes, contas_pagar_pendentes: pendentes, contas_vencidas: vencidas, reembolsos_pendentes: reembolsos },
    saldos: (saldos || []).map(s => ({ nome: s.nome, saldo: Number(s.saldo), tipo: s.tipo })),
  };
}

async function fetchLogisticaContext() {
  const { count: fornecedores } = await supabase.from('log_fornecedores').select('id', { count: 'exact', head: true }).eq('ativo', true);
  const { count: pedidos } = await supabase.from('log_pedidos').select('id', { count: 'exact', head: true });
  const { count: solicPend } = await supabase.from('log_solicitacoes_compra').select('id', { count: 'exact', head: true }).eq('status', 'pendente');

  return {
    resumo: { fornecedores_ativos: fornecedores, pedidos_total: pedidos, solicitacoes_pendentes: solicPend },
  };
}

async function fetchPatrimonioContext() {
  const { count: bens } = await supabase.from('pat_bens').select('id', { count: 'exact', head: true });
  const { count: ativos } = await supabase.from('pat_bens').select('id', { count: 'exact', head: true }).eq('status', 'ativo');
  const { count: extraviados } = await supabase.from('pat_bens').select('id', { count: 'exact', head: true }).eq('status', 'extraviado');
  const { count: manutencao } = await supabase.from('pat_bens').select('id', { count: 'exact', head: true }).eq('status', 'manutencao');

  return {
    resumo: { total_bens: bens, ativos, extraviados, em_manutencao: manutencao },
  };
}

async function fetchEventosContext() {
  const { count: total } = await supabase.from('events').select('id', { count: 'exact', head: true });
  return { resumo: { total_eventos: total } };
}

async function fetchProjetosContext() {
  const { count: total } = await supabase.from('projects').select('id', { count: 'exact', head: true });
  return { resumo: { total_projetos: total } };
}

async function fetchMembresiaContext() {
  const { count: total } = await supabase.from('mem_membros').select('id', { count: 'exact', head: true }).eq('active', true);
  const { count: membrosAtivos } = await supabase.from('mem_membros').select('id', { count: 'exact', head: true }).eq('active', true).eq('status', 'membro_ativo');
  const { count: visitantes } = await supabase.from('mem_membros').select('id', { count: 'exact', head: true }).eq('active', true).eq('status', 'visitante');
  const { count: inativos } = await supabase.from('mem_membros').select('id', { count: 'exact', head: true }).eq('active', true).eq('status', 'inativo');
  const { count: familias } = await supabase.from('mem_familias').select('id', { count: 'exact', head: true });
  const { count: grupos } = await supabase.from('mem_grupos').select('id', { count: 'exact', head: true }).eq('ativo', true);
  const { count: cadastrosPend } = await supabase.from('mem_cadastros_pendentes').select('id', { count: 'exact', head: true }).eq('status', 'pendente');
  const { count: contribuicoes } = await supabase.from('mem_contribuicoes').select('id', { count: 'exact', head: true });
  const { count: ministerios } = await supabase.from('mem_ministerios').select('id', { count: 'exact', head: true }).eq('ativo', true);

  // Membros sem família vinculada
  const { count: semFamilia } = await supabase.from('mem_membros').select('id', { count: 'exact', head: true }).eq('active', true).is('familia_id', null);

  return {
    resumo: {
      total_membros: total,
      membros_ativos: membrosAtivos,
      visitantes,
      inativos,
      familias,
      grupos_ativos: grupos,
      cadastros_pendentes: cadastrosPend,
      contribuicoes_total: contribuicoes,
      ministerios_ativos: ministerios,
    },
    problemas: {
      membros_sem_familia: semFamilia,
    },
  };
}

/**
 * Serializa contexto para incluir no prompt (controla tamanho)
 */
function serializeContext(ctx, maxChars = 8000) {
  const json = JSON.stringify(ctx, null, 2);
  if (json.length <= maxChars) return json;
  // Trunca contexto para caber no budget
  return json.slice(0, maxChars) + '\n... (contexto truncado)';
}

module.exports = { buildContext, serializeContext };
