const { supabase } = require('../utils/supabase');
const { getEffectiveLevel } = require('../middleware/auth');
const { searchVault } = require('./cerebroSearch');

/**
 * Mapeia cada módulo de agente para a routeKey usada no sistema de permissões
 * (ver ROUTE_MODULE_MAP em backend/middleware/auth.js).
 * Se o usuário não tem nível >= 2 na routeKey, o módulo é OMITIDO do contexto.
 */
const MODULE_ROUTE_KEY = {
  rh: 'rh',
  financeiro: 'financeiro',
  logistica: 'logistica',
  solicitarCompra: 'logistica',
  patrimonio: 'patrimonio',
  eventos: 'events',
  projetos: 'projects',
  expansao: 'expansion',
  membresia: 'membresia',
  voluntariado: 'voluntariado',
  cuidados: 'cuidados',
  grupos: 'membresia',
  integracao: 'membresia',
  next: 'membresia',
  marketing: null,         // sem módulo granular — só admin/diretor
  // Módulos cross-cutting / institucionais (sem routeKey específica)
  nps: null,
  cerebro: null,
  kpis: null,
  processos: null,
  governanca: null,
};

const ALL_MODULES = [
  'rh', 'financeiro', 'logistica', 'solicitarCompra', 'patrimonio',
  'eventos', 'projetos', 'expansao', 'membresia', 'voluntariado',
  'cuidados', 'grupos', 'integracao', 'next', 'marketing',
  'nps', 'cerebro', 'kpis', 'processos', 'governanca',
];

/**
 * Retorna true se o usuário pode ver o módulo (nível >= 2).
 * Admin/diretor sempre retorna true. Sem req.user retorna true (compat legacy).
 */
function canSeeModule(req, mod) {
  if (!req || !req.user) return true;
  if (['admin', 'diretor'].includes(req.user.role)) return true;

  const routeKey = MODULE_ROUTE_KEY[mod];
  if (routeKey === null) return false; // marketing: só admin
  if (!routeKey) return true;            // módulo sem mapeamento: liberar

  return getEffectiveLevel(req, routeKey) >= 2;
}

/**
 * Retorna a lista de módulos a consultar, filtrando por permissão.
 */
function resolveModules(targetModules, req) {
  const requested = targetModules.includes('all') ? ALL_MODULES : targetModules;
  return requested.filter((m) => canSeeModule(req, m));
}

/**
 * Constrói o contexto RAG para os agentes com dados reais do sistema.
 * Respeita permissões: cada usuário só recebe dados dos módulos aos quais tem acesso.
 * Se options.query estiver presente, também busca notas relevantes no vault
 * (Cérebro CBRio) e injeta em ctx.cerebro_vault.
 *
 * @param {string[]} targetModules - ['all'] ou lista de módulos
 * @param {object} req - Express request (com req.user para filtrar permissões)
 * @param {object} options - { query?: string, vaultLimit?: number }
 */
async function buildContext(targetModules = ['all'], req = null, options = {}) {
  const modules = resolveModules(targetModules, req);

  const ctx = {
    sistema: getSystemDoc(),
    usuario: req?.user ? {
      nome: req.user.name,
      email: req.user.email,
      role: req.user.role,
      area: req.user.area,
    } : null,
    modulos_disponiveis: modules,
    modulos: {},
  };

  const modulesPromise = Promise.all(modules.map(async (mod) => {
    try {
      return [mod, await fetchModuleContext(mod)];
    } catch (e) {
      return [mod, { error: e.message }];
    }
  }));

  // Busca no Cérebro em paralelo com as consultas de módulos.
  const vaultPromise = options.query
    ? searchVault(options.query, req, options.vaultLimit || 5).catch((e) => {
        console.warn('[AGENT CONTEXT] vault search failed:', e.message);
        return [];
      })
    : Promise.resolve([]);

  const [moduleResults, vaultResults] = await Promise.all([modulesPromise, vaultPromise]);

  for (const [mod, data] of moduleResults) {
    ctx.modulos[mod] = data;
  }

  if (vaultResults.length) {
    ctx.cerebro_vault = {
      descricao: 'Notas relevantes do Cérebro CBRio (vault Obsidian no SharePoint). Use como conhecimento adicional; cite o note_path quando referenciar.',
      total: vaultResults.length,
      notas: vaultResults,
    };
  }

  return ctx;
}

function getSystemDoc() {
  return `
CBRio ERP — Sistema de gestão interno da Igreja Comunidade Batista do Rio de Janeiro.
Stack: React 18 + Express + Supabase (PostgreSQL). Deploy: Vercel.

Módulos:
- RH: funcionários, documentos, treinamentos, férias/licenças, escalas, benefícios, admissões
- Financeiro: contas bancárias, transações, contas a pagar, reembolsos, arrecadação
- Logística: fornecedores, solicitações de compra, pedidos, notas fiscais
- Patrimônio: bens, categorias, localizações, movimentações, inventários
- Eventos: projetos de eventos, tarefas, reuniões, ciclos criativos
- Projetos: projetos institucionais com milestones
- Expansão: plantação de igrejas, milestones, tarefas e subtarefas
- Membresia: membros, famílias, grupos de vida, contribuições, ministérios, cadastros pendentes
- Voluntariado: voluntários, escalas, check-ins, serviços (Planning Center)
- Cuidados: aconselhamento, capelania, acompanhamentos, jornada 180, convertidos
- Grupos: grupos de vida, membros dos grupos, documentos
- Integração: visitantes, decisões, follow-up de novos
- NEXT: inscrições no NEXT (porta de entrada), check-ins, indicações
- Marketing: campanhas e comunicação
- NPS: pesquisas de satisfação geradas por IA, respostas e análise
- Cérebro CBRio: base de conhecimento Obsidian (SharePoint), fila de processamento de arquivos via IA
- KPIs/OKR: indicadores táticos, dados brutos, trajetória (no_alvo / atras / critico)
- Processos: gestão operacional, OKRs do mês, registros de indicadores
- Governança: ciclos mensais (OKR, DRE, KPI, Conselho), reuniões e tarefas

Regras importantes:
- Transferências entre contas devem ser filtradas nas análises financeiras
- Documentos com data_expiracao devem ser monitorados
- Bens extraviados são urgentes
- Notificações automáticas rodam a cada 6h
- Voluntariado usa Planning Center para sincronizar escalas
`.trim();
}

async function fetchModuleContext(mod) {
  switch (mod) {
    case 'rh': return fetchRHContext();
    case 'financeiro': return fetchFinanceiroContext();
    case 'logistica': return fetchLogisticaContext();
    case 'solicitarCompra': return fetchSolicitarCompraContext();
    case 'patrimonio': return fetchPatrimonioContext();
    case 'eventos': return fetchEventosContext();
    case 'projetos': return fetchProjetosContext();
    case 'expansao': return fetchExpansaoContext();
    case 'membresia': return fetchMembresiaContext();
    case 'voluntariado': return fetchVoluntariadoContext();
    case 'cuidados': return fetchCuidadosContext();
    case 'grupos': return fetchGruposContext();
    case 'integracao': return fetchIntegracaoContext();
    case 'next': return fetchNextContext();
    case 'marketing': return fetchMarketingContext();
    case 'nps': return fetchNpsContext();
    case 'cerebro': return fetchCerebroContext();
    case 'kpis': return fetchKpisContext();
    case 'processos': return fetchProcessosContext();
    case 'governanca': return fetchGovernancaContext();
    default: return { info: 'Módulo não reconhecido' };
  }
}

// ─── RH ────────────────────────────────────────────────────────────────

async function fetchRHContext() {
  const { count: total } = await supabase.from('rh_funcionarios').select('id', { count: 'exact', head: true });
  const { count: ativos } = await supabase.from('rh_funcionarios').select('id', { count: 'exact', head: true }).eq('status', 'ativo');
  const { count: ferias } = await supabase.from('rh_funcionarios').select('id', { count: 'exact', head: true }).eq('status', 'ferias');
  const { count: docs } = await supabase.from('rh_documentos').select('id', { count: 'exact', head: true });
  const { count: treinos } = await supabase.from('rh_treinamentos').select('id', { count: 'exact', head: true });
  const { count: feriasPend } = await supabase.from('rh_ferias_licencas').select('id', { count: 'exact', head: true }).eq('status', 'pendente');
  const { count: admissoes } = await supabase.from('rh_admissoes').select('id', { count: 'exact', head: true }).neq('status', 'concluido');

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

// ─── Financeiro ────────────────────────────────────────────────────────

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

// ─── Logística ─────────────────────────────────────────────────────────

async function fetchLogisticaContext() {
  const { count: fornecedores } = await supabase.from('log_fornecedores').select('id', { count: 'exact', head: true }).eq('ativo', true);
  const { count: pedidos } = await supabase.from('log_pedidos').select('id', { count: 'exact', head: true });
  const { count: solicPend } = await supabase.from('log_solicitacoes_compra').select('id', { count: 'exact', head: true }).eq('status', 'pendente');

  return {
    resumo: { fornecedores_ativos: fornecedores, pedidos_total: pedidos, solicitacoes_pendentes: solicPend },
  };
}

async function fetchSolicitarCompraContext() {
  const { count: total } = await supabase.from('log_solicitacoes_compra').select('id', { count: 'exact', head: true });
  const { count: pendentes } = await supabase.from('log_solicitacoes_compra').select('id', { count: 'exact', head: true }).eq('status', 'pendente');
  const { count: aprovadas } = await supabase.from('log_solicitacoes_compra').select('id', { count: 'exact', head: true }).eq('status', 'aprovada');
  const { count: rejeitadas } = await supabase.from('log_solicitacoes_compra').select('id', { count: 'exact', head: true }).eq('status', 'rejeitada');

  const { data: recentes } = await supabase.from('log_solicitacoes_compra')
    .select('id, titulo, status, valor_estimado, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  return {
    resumo: { total, pendentes, aprovadas, rejeitadas },
    recentes: recentes || [],
  };
}

// ─── Patrimônio ────────────────────────────────────────────────────────

async function fetchPatrimonioContext() {
  const { count: bens } = await supabase.from('pat_bens').select('id', { count: 'exact', head: true });
  const { count: ativos } = await supabase.from('pat_bens').select('id', { count: 'exact', head: true }).eq('status', 'ativo');
  const { count: extraviados } = await supabase.from('pat_bens').select('id', { count: 'exact', head: true }).eq('status', 'extraviado');
  const { count: manutencao } = await supabase.from('pat_bens').select('id', { count: 'exact', head: true }).eq('status', 'manutencao');

  return {
    resumo: { total_bens: bens, ativos, extraviados, em_manutencao: manutencao },
  };
}

// ─── Eventos ───────────────────────────────────────────────────────────

async function fetchEventosContext() {
  const { count: total } = await supabase.from('events').select('id', { count: 'exact', head: true });

  const hoje = new Date().toISOString().slice(0, 10);
  const { data: proximos } = await supabase.from('events')
    .select('id, name, date, status, location, responsible')
    .gte('date', hoje)
    .order('date', { ascending: true })
    .limit(10);

  const { data: recentes } = await supabase.from('events')
    .select('id, name, date, status, location')
    .lt('date', hoje)
    .order('date', { ascending: false })
    .limit(10);

  return {
    resumo: { total_eventos: total },
    proximos: proximos || [],
    recentes: recentes || [],
  };
}

// ─── Projetos ──────────────────────────────────────────────────────────

async function fetchProjetosContext() {
  const { count: total } = await supabase.from('projects').select('id', { count: 'exact', head: true });

  const { data: ativos } = await supabase.from('projects')
    .select('id, name, status, date_start, date_end, responsible, area, priority')
    .neq('status', 'concluido')
    .order('date_start', { ascending: false })
    .limit(20);

  return {
    resumo: { total_projetos: total, em_andamento: (ativos || []).length },
    projetos: ativos || [],
  };
}

// ─── Expansão ──────────────────────────────────────────────────────────

async function fetchExpansaoContext() {
  const { count: milestones } = await supabase.from('expansion_milestones').select('id', { count: 'exact', head: true });
  const { count: tasks } = await supabase.from('expansion_tasks').select('id', { count: 'exact', head: true });
  const { count: tasksPend } = await supabase.from('expansion_tasks').select('id', { count: 'exact', head: true }).neq('status', 'concluida');

  const { data: milestonesAbertos } = await supabase.from('expansion_milestones')
    .select('id, title, status, due_date')
    .neq('status', 'concluido')
    .order('due_date', { ascending: true })
    .limit(20);

  return {
    resumo: {
      total_milestones: milestones,
      total_tasks: tasks,
      tasks_pendentes: tasksPend,
    },
    milestones_abertos: milestonesAbertos || [],
  };
}

// ─── Membresia ─────────────────────────────────────────────────────────

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

  const { data: membros } = await supabase
    .from('mem_membros')
    .select('id, nome, status, email, telefone, data_nascimento, estado_civil, cidade, profissao, familia_id, created_at')
    .eq('active', true)
    .order('nome')
    .limit(200);

  const { data: familiasData } = await supabase
    .from('mem_familias')
    .select('id, nome')
    .order('nome')
    .limit(100);

  const { data: cadastros } = await supabase
    .from('mem_cadastros_pendentes')
    .select('id, nome, email, telefone, status, created_at')
    .eq('status', 'pendente')
    .order('created_at', { ascending: false })
    .limit(50);

  const d90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const { data: contribRecentes } = await supabase
    .from('mem_contribuicoes')
    .select('membro_id, tipo, valor, data, forma_pagamento')
    .gte('data', d90)
    .order('data', { ascending: false })
    .limit(100);

  const { data: gruposData } = await supabase
    .from('mem_grupos')
    .select('id, nome, dia_semana, lider_id')
    .eq('ativo', true)
    .order('nome')
    .limit(50);

  const famMap = {};
  (familiasData || []).forEach(f => { famMap[f.id] = f.nome; });

  const membrosEnriquecidos = (membros || []).map(m => ({
    ...m,
    familia: famMap[m.familia_id] || null,
  }));

  return {
    resumo: {
      total_membros: total,
      membros_ativos: membrosAtivos,
      visitantes,
      inativos,
      familias: familias,
      grupos_ativos: grupos,
      cadastros_pendentes: cadastrosPend,
      contribuicoes_total: contribuicoes,
      ministerios_ativos: ministerios,
    },
    membros: membrosEnriquecidos,
    cadastros_pendentes: cadastros || [],
    contribuicoes_recentes: contribRecentes || [],
    grupos: gruposData || [],
    familias: familiasData || [],
  };
}

// ─── Voluntariado ──────────────────────────────────────────────────────

async function fetchVoluntariadoContext() {
  const { count: totalVoluntarios } = await supabase.from('vol_profiles').select('id', { count: 'exact', head: true });
  const { count: totalServicos } = await supabase.from('vol_services').select('id', { count: 'exact', head: true });
  const { count: totalEscalas } = await supabase.from('vol_schedules').select('id', { count: 'exact', head: true });
  const { count: totalTeams } = await supabase.from('vol_teams').select('id', { count: 'exact', head: true });

  // Voluntários ativos = que têm pelo menos um check-in nos últimos 90 dias
  const d90 = new Date(Date.now() - 90 * 86400000).toISOString();
  const { data: checkins90d } = await supabase
    .from('vol_check_ins')
    .select('volunteer_id')
    .gte('checked_in_at', d90)
    .not('volunteer_id', 'is', null);

  const ativosSet = new Set((checkins90d || []).map(c => c.volunteer_id));
  const voluntariosAtivos = ativosSet.size;

  // Check-ins nos últimos 30 dias (métricas de engajamento)
  const d30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const { count: checkins30d } = await supabase
    .from('vol_check_ins')
    .select('id', { count: 'exact', head: true })
    .gte('checked_in_at', d30);

  // Próximos serviços (futuros)
  const agora = new Date().toISOString();
  const { data: proximosServicos } = await supabase
    .from('vol_services')
    .select('id, name, service_type_name, scheduled_at')
    .gte('scheduled_at', agora)
    .order('scheduled_at', { ascending: true })
    .limit(10);

  // Teams (equipes) com contagem de membros
  const { data: teams } = await supabase
    .from('vol_teams')
    .select('id, name')
    .order('name')
    .limit(30);

  // Últimos voluntários cadastrados
  const { data: recentes } = await supabase
    .from('vol_profiles')
    .select('id, full_name, email, created_at')
    .order('created_at', { ascending: false })
    .limit(30);

  // Sync recente do Planning Center
  const { data: ultimoSync } = await supabase
    .from('vol_sync_logs')
    .select('sync_type, services_synced, schedules_synced, status, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    resumo: {
      total_voluntarios: totalVoluntarios,
      voluntarios_ativos_90d: voluntariosAtivos,
      total_servicos: totalServicos,
      total_escalas: totalEscalas,
      total_equipes: totalTeams,
      checkins_30d: checkins30d,
    },
    proximos_servicos: proximosServicos || [],
    equipes: teams || [],
    voluntarios_recentes: recentes || [],
    ultimo_sync_planning_center: ultimoSync || null,
  };
}

// ─── Cuidados ──────────────────────────────────────────────────────────

async function fetchCuidadosContext() {
  const mesAtual = new Date();
  mesAtual.setDate(1);
  const iniMes = mesAtual.toISOString().slice(0, 10);

  const { count: acompAtivos } = await supabase.from('cui_acompanhamentos').select('id', { count: 'exact', head: true }).neq('status', 'concluido');
  const { count: acompTotal } = await supabase.from('cui_acompanhamentos').select('id', { count: 'exact', head: true });
  const { count: convertidosMes } = await supabase.from('cui_convertidos').select('id', { count: 'exact', head: true }).gte('data_culto', iniMes);
  const { count: convertidosCadastrados } = await supabase.from('cui_convertidos').select('id', { count: 'exact', head: true }).eq('cadastrado', true).gte('data_culto', iniMes);

  const { data: atendimentosMes } = await supabase
    .from('cui_atendimentos_agregado')
    .select('tipo, quantidade')
    .eq('mes', iniMes);

  const { data: acompRecentes } = await supabase
    .from('cui_acompanhamentos')
    .select('id, tipo, status, created_at')
    .order('created_at', { ascending: false })
    .limit(30);

  return {
    resumo: {
      acompanhamentos_ativos: acompAtivos,
      acompanhamentos_total: acompTotal,
      convertidos_mes_atual: convertidosMes,
      convertidos_cadastrados_mes: convertidosCadastrados,
    },
    atendimentos_mes_atual: atendimentosMes || [],
    acompanhamentos_recentes: acompRecentes || [],
  };
}

// ─── Grupos ────────────────────────────────────────────────────────────

async function fetchGruposContext() {
  const { count: total } = await supabase.from('mem_grupos').select('id', { count: 'exact', head: true });
  const { count: ativos } = await supabase.from('mem_grupos').select('id', { count: 'exact', head: true }).eq('ativo', true);
  const { count: totalMembros } = await supabase.from('mem_grupo_membros').select('id', { count: 'exact', head: true });

  const { data: grupos } = await supabase
    .from('mem_grupos')
    .select('id, nome, dia_semana, horario, lider_id, ativo, endereco')
    .eq('ativo', true)
    .order('nome')
    .limit(80);

  return {
    resumo: {
      total_grupos: total,
      grupos_ativos: ativos,
      total_participantes: totalMembros,
    },
    grupos: grupos || [],
  };
}

// ─── Marketing ─────────────────────────────────────────────────────────

async function fetchMarketingContext() {
  // Marketing não tem tabela dedicada ainda — entrega estrutura vazia com indicação.
  return {
    resumo: { info: 'Módulo de marketing sem tabelas dedicadas ainda.' },
    observacao: 'Peças de comunicação vivem em eventos/projetos; campanhas não têm schema próprio.',
  };
}

// ─── Integração ────────────────────────────────────────────────────────

async function fetchIntegracaoContext() {
  const d30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const d90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

  const { count: totalVisitantes } = await supabase.from('int_visitantes').select('id', { count: 'exact', head: true });
  const { count: visitantes30d }   = await supabase.from('int_visitantes').select('id', { count: 'exact', head: true }).gte('data_visita', d30);
  const { count: novos }           = await supabase.from('int_visitantes').select('id', { count: 'exact', head: true }).eq('status', 'novo');
  const { count: decisoes30d }     = await supabase.from('int_visitantes').select('id', { count: 'exact', head: true }).eq('fez_decisao', true).gte('data_visita', d30);
  const { count: semFollowup }     = await supabase.from('int_visitantes').select('id', { count: 'exact', head: true }).eq('status', 'novo').lt('data_visita', d30);
  const { count: virouMembro }     = await supabase.from('int_visitantes').select('id', { count: 'exact', head: true }).eq('status', 'membro_ativo').gte('data_visita', d90);

  const { data: novosSemResp } = await supabase
    .from('int_visitantes')
    .select('id, nome, data_visita, status, responsavel_id')
    .eq('status', 'novo')
    .is('responsavel_id', null)
    .order('data_visita', { ascending: false })
    .limit(30);

  return {
    resumo: {
      total_visitantes: totalVisitantes,
      visitantes_ultimos_30d: visitantes30d,
      em_status_novo: novos,
      decisoes_ultimos_30d: decisoes30d,
      sem_followup_apos_30d: semFollowup,
      virou_membro_ultimos_90d: virouMembro,
    },
    visitantes_novos_sem_responsavel: novosSemResp || [],
  };
}

// ─── NEXT ──────────────────────────────────────────────────────────────

async function fetchNextContext() {
  const d30 = new Date(Date.now() - 30 * 86400000).toISOString();

  const { count: totalInscritos }    = await supabase.from('next_inscricoes').select('id', { count: 'exact', head: true });
  const { count: inscritos30d }      = await supabase.from('next_inscricoes').select('id', { count: 'exact', head: true }).gte('created_at', d30);
  const { count: comCheckin }        = await supabase.from('next_inscricoes').select('id', { count: 'exact', head: true }).not('check_in_at', 'is', null);
  const { count: semCheckin30d }     = await supabase.from('next_inscricoes').select('id', { count: 'exact', head: true }).is('check_in_at', null).gte('created_at', d30);

  // Indicações abertas: registradas mas sem acionamento (caso a tabela exista)
  let indicacoesPendentes = null;
  try {
    const { count } = await supabase
      .from('next_indicacoes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pendente');
    indicacoesPendentes = count;
  } catch { /* tabela pode não existir */ }

  const { data: ultimasInscricoes } = await supabase
    .from('next_inscricoes')
    .select('id, nome, telefone, email, check_in_at, created_at')
    .order('created_at', { ascending: false })
    .limit(30);

  return {
    resumo: {
      total_inscritos: totalInscritos,
      inscritos_ultimos_30d: inscritos30d,
      inscritos_com_checkin: comCheckin,
      sem_checkin_no_periodo: semCheckin30d,
      indicacoes_pendentes: indicacoesPendentes,
    },
    ultimas_inscricoes: ultimasInscricoes || [],
  };
}

// ─── NPS ───────────────────────────────────────────────────────────────

async function fetchNpsContext() {
  const d30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const d7  = new Date(Date.now() - 7  * 86400000).toISOString();

  const { count: total }      = await supabase.from('nps_pesquisas').select('id', { count: 'exact', head: true });
  const { count: ativas }     = await supabase.from('nps_pesquisas').select('id', { count: 'exact', head: true }).eq('status', 'ativa');
  const { count: encerradas } = await supabase.from('nps_pesquisas').select('id', { count: 'exact', head: true }).eq('status', 'encerrada');

  const { data: pesquisasAtivas } = await supabase
    .from('vw_nps_pesquisa_stats')
    .select('*')
    .eq('status', 'ativa')
    .order('data_inicio', { ascending: false })
    .limit(30);

  // Pesquisas ativas sem resposta há > 7d
  const { data: ativasSemRespRecente } = await supabase
    .from('nps_pesquisas')
    .select('id, titulo, data_inicio')
    .eq('status', 'ativa')
    .lt('created_at', d7);

  // Pesquisas com análise IA pendente
  const { data: semAnalise } = await supabase
    .from('nps_pesquisas')
    .select('id, titulo, status, created_at')
    .is('analise_ia', null)
    .eq('status', 'encerrada')
    .limit(30);

  // Respostas recentes (sentimento)
  const { data: respostasRecentes } = await supabase
    .from('nps_respostas')
    .select('pesquisa_id, score, comentario, created_at')
    .gte('created_at', d30)
    .order('created_at', { ascending: false })
    .limit(100);

  return {
    resumo: { total_pesquisas: total, ativas, encerradas },
    pesquisas_ativas_stats: pesquisasAtivas || [],
    pesquisas_encerradas_sem_analise_ia: semAnalise || [],
    pesquisas_ativas_sem_resposta_recente: ativasSemRespRecente || [],
    respostas_ultimos_30d: respostasRecentes || [],
  };
}

// ─── Cérebro CBRio ─────────────────────────────────────────────────────

async function fetchCerebroContext() {
  const d24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const d7  = new Date(Date.now() - 7  * 86400000).toISOString();

  const { count: total }        = await supabase.from('cerebro_fila').select('id', { count: 'exact', head: true });
  const { count: pendentes }    = await supabase.from('cerebro_fila').select('id', { count: 'exact', head: true }).eq('status', 'pendente');
  const { count: processando }  = await supabase.from('cerebro_fila').select('id', { count: 'exact', head: true }).eq('status', 'processando');
  const { count: concluidos }   = await supabase.from('cerebro_fila').select('id', { count: 'exact', head: true }).eq('status', 'concluido');
  const { count: comErro }      = await supabase.from('cerebro_fila').select('id', { count: 'exact', head: true }).eq('status', 'erro');
  const { count: ignorados }    = await supabase.from('cerebro_fila').select('id', { count: 'exact', head: true }).eq('status', 'ignorado');

  // Pendentes há > 24h (atraso)
  const { data: pendentesAtrasados } = await supabase
    .from('cerebro_fila')
    .select('id, nome_arquivo, biblioteca, pasta_origem, detectado_em')
    .eq('status', 'pendente')
    .lt('detectado_em', d24)
    .limit(20);

  // Últimos erros
  const { data: errosRecentes } = await supabase
    .from('cerebro_fila')
    .select('id, nome_arquivo, biblioteca, erro_mensagem, processado_em')
    .eq('status', 'erro')
    .gte('processado_em', d7)
    .order('processado_em', { ascending: false })
    .limit(20);

  // Tokens consumidos (últimos 7d)
  const { data: ultimosOk } = await supabase
    .from('cerebro_fila')
    .select('tokens_usados, processado_em')
    .eq('status', 'concluido')
    .gte('processado_em', d7);
  const tokens7d = (ultimosOk || []).reduce((s, r) => s + (r.tokens_usados || 0), 0);

  return {
    resumo: {
      fila_total: total,
      pendentes,
      processando,
      concluidos,
      com_erro: comErro,
      ignorados,
      tokens_ultimos_7d: tokens7d,
    },
    pendentes_ha_mais_de_24h: pendentesAtrasados || [],
    erros_ultimos_7d: errosRecentes || [],
  };
}

// ─── KPIs / OKR ────────────────────────────────────────────────────────

async function fetchKpisContext() {
  const { count: totalKpis }  = await supabase.from('kpi_indicadores_taticos').select('id', { count: 'exact', head: true }).eq('ativo', true);
  const { count: kpisOkr }    = await supabase.from('kpi_indicadores_taticos').select('id', { count: 'exact', head: true }).eq('ativo', true).eq('is_okr', true);

  // Trajetória atual (status: no_alvo / atras / critico / sem_dado)
  let trajetoria = [];
  try {
    const { data } = await supabase
      .from('vw_kpi_trajetoria_atual')
      .select('kpi_id, area, indicador, periodo, valor_atual, meta_valor, status, percentual')
      .limit(200);
    trajetoria = data || [];
  } catch { /* view pode não existir */ }

  const porStatus = { no_alvo: 0, atras: 0, critico: 0, sem_dado: 0 };
  trajetoria.forEach(t => {
    if (porStatus[t.status] != null) porStatus[t.status]++;
  });

  const criticos = trajetoria.filter(t => t.status === 'critico').slice(0, 20);
  const atrasados = trajetoria.filter(t => t.status === 'atras').slice(0, 20);

  // Áreas sem dado recente (últimos 14d)
  const d14 = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const { data: dadosRecentes } = await supabase
    .from('dados_brutos')
    .select('area, tipo_id, data')
    .gte('data', d14)
    .limit(500);
  const areasComDados = new Set((dadosRecentes || []).map(d => d.area).filter(Boolean));

  return {
    resumo: {
      total_kpis_ativos: totalKpis,
      kpis_okr: kpisOkr,
      trajetoria_no_alvo: porStatus.no_alvo,
      trajetoria_atras: porStatus.atras,
      trajetoria_critico: porStatus.critico,
      trajetoria_sem_dado: porStatus.sem_dado,
      areas_com_dado_ultimos_14d: areasComDados.size,
    },
    kpis_criticos: criticos,
    kpis_atrasados: atrasados,
  };
}

// ─── Processos ─────────────────────────────────────────────────────────

async function fetchProcessosContext() {
  const { count: total }     = await supabase.from('processos').select('id', { count: 'exact', head: true }).neq('status', 'arquivado');
  const { count: okrs }      = await supabase.from('processos').select('id', { count: 'exact', head: true }).eq('is_okr', true).neq('status', 'arquivado');
  const { count: pausados }  = await supabase.from('processos').select('id', { count: 'exact', head: true }).eq('status', 'pausado');

  const { data: semResponsavel } = await supabase
    .from('processos')
    .select('id, nome, area, categoria, is_okr, status')
    .is('responsavel_id', null)
    .neq('status', 'arquivado')
    .limit(30);

  const { data: okrsSemKpi } = await supabase
    .from('processos')
    .select('id, nome, area, indicador_ids')
    .eq('is_okr', true)
    .neq('status', 'arquivado')
    .limit(50);

  return {
    resumo: {
      total_processos_ativos: total,
      okrs_definidos: okrs,
      processos_pausados: pausados,
    },
    processos_sem_responsavel: semResponsavel || [],
    okrs_sem_kpis_vinculados: (okrsSemKpi || []).filter(p => !p.indicador_ids?.length),
  };
}

// ─── Governança ────────────────────────────────────────────────────────

async function fetchGovernancaContext() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;

  const { data: cicloAtual } = await supabase
    .from('governance_cycles')
    .select('id, year, month, status')
    .eq('year', ano)
    .eq('month', mes)
    .maybeSingle();

  const { count: cicloAno } = await supabase
    .from('governance_cycles')
    .select('id', { count: 'exact', head: true })
    .eq('year', ano);

  // Reuniões do ciclo atual
  let reunioesCiclo = [];
  if (cicloAtual?.id) {
    const { data } = await supabase
      .from('governance_meetings')
      .select('id, tipo, data, status, pauta, ata, deliberacoes')
      .eq('cycle_id', cicloAtual.id);
    reunioesCiclo = data || [];
  }

  // Tarefas abertas
  const { count: tarefasAbertas } = await supabase
    .from('governance_tasks')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'concluida');

  return {
    resumo: {
      ciclo_atual: cicloAtual || null,
      ciclos_no_ano: cicloAno,
      reunioes_ciclo_atual: reunioesCiclo.length,
      reunioes_com_ata: reunioesCiclo.filter(r => r.ata && r.ata.length).length,
      tarefas_abertas: tarefasAbertas,
    },
    reunioes_ciclo_atual: reunioesCiclo,
  };
}

/**
 * Serializa contexto para incluir no prompt (controla tamanho).
 */
function serializeContext(ctx, maxChars = 24000) {
  const json = JSON.stringify(ctx, null, 2);
  if (json.length <= maxChars) return json;
  return json.slice(0, maxChars) + '\n... (contexto truncado por limite de tamanho)';
}

module.exports = { buildContext, serializeContext, canSeeModule, MODULE_ROUTE_KEY };
