/**
 * Assistente do sistema (Jarvis) · FASE 2 · tools read-only tipadas.
 *
 * O assistente responde perguntas de DADOS AO VIVO chamando estas tools — nunca
 * text-to-SQL. Cada tool:
 *   - declara a routeKey e o nível mínimo de permissão;
 *   - é RE-checada por permissão no runTool (filtro-antes-do-LLM);
 *   - retorna AGREGADOS / não-PII (contagens, percentuais, nomes de grupos/áreas),
 *     nunca CPF, telefone, salário, contribuição individual ou dado de menor.
 *
 * getEffectiveLevel(req, routeKey) já resolve super-admin, diretor, matriz e
 * boost por área. As tools de dados exigem nível >= 1 (leitura) no módulo.
 */

const { supabase } = require('../utils/supabase');
const { getEffectiveLevel, getUserAreas } = require('../middleware/auth');
const { searchConhecimento } = require('./conhecimentoBase');

// Helper: valida YYYY-MM-DD (evita string arbitrária no filtro de data).
function isYmd(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
// Normaliza uma área informada pelo usuário para o slug canônico.
const AREAS_VALIDAS = ['kids', 'ami', 'bridge', 'sede', 'online', 'cba'];
function normalizarArea(a) {
  if (!a) return null;
  const s = String(a).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  return AREAS_VALIDAS.includes(s) ? s : null;
}

// ─── Registro de tools ───────────────────────────────────────────────────
// handler(input, req) → objeto/So string (será serializado como tool_result).
// Cada handler assume que a permissão JÁ foi checada por runTool.

const TOOLS = [
  {
    name: 'buscar_conhecimento',
    routeKey: null, // geral — qualquer autenticado
    minLevel: 0,
    description:
      'Busca na base de conhecimento curada do sistema para perguntas sobre COMO o sistema funciona, o que cada módulo faz, o significado de indicadores (NSM, KPI, valores), fluxos e regras. Use SEMPRE para perguntas conceituais ou de "como faço X". Não serve para números ao vivo.',
    input_schema: {
      type: 'object',
      properties: {
        pergunta: { type: 'string', description: 'A pergunta ou tema a buscar, em português.' },
      },
      required: ['pergunta'],
    },
    handler: async (input, req) => {
      const itens = await searchConhecimento(input.pergunta || '', req, 6);
      if (!itens.length) return { encontrado: false, itens: [] };
      return {
        encontrado: true,
        itens: itens.map((i) => ({ titulo: i.titulo, secao: i.secao, conteudo: i.conteudo })),
      };
    },
  },

  // ─── DADOS AO VIVO (read-only · agregados não-PII) ─────────────────────

  {
    name: 'nsm_atual',
    routeKey: 'painel-cbrio',
    minLevel: 1,
    description:
      'Retorna o estado atual da NSM (métrica-norte): numerador, denominador e percentual por segmento (janela móvel de 90 dias). Use para "como está a NSM", "quantos convertidos engajados".',
    input_schema: { type: 'object', properties: {} },
    handler: async () => {
      const { data } = await supabase.from('vw_nsm_painel').select('*');
      return { segmentos: data || [] };
    },
  },

  {
    name: 'decisoes_periodo',
    routeKey: 'integracao',
    minLevel: 1,
    description:
      'Conta as decisões de fé / novos convertidos num período, com quebra por área de culto. Datas em AAAA-MM-DD; o fim é exclusivo. area opcional (kids, ami, bridge, sede, online, cba).',
    input_schema: {
      type: 'object',
      properties: {
        inicio: { type: 'string', description: 'Data inicial AAAA-MM-DD (inclusiva).' },
        fim: { type: 'string', description: 'Data final AAAA-MM-DD (exclusiva).' },
        area: { type: 'string', description: 'Área opcional: kids, ami, bridge, sede, online, cba.' },
      },
      required: ['inicio', 'fim'],
    },
    handler: async (input) => {
      if (!isYmd(input.inicio) || !isYmd(input.fim)) return { erro: 'Informe inicio e fim no formato AAAA-MM-DD.' };
      const area = normalizarArea(input.area);
      let q = supabase.from('cui_convertidos').select('area', { count: 'exact' })
        .is('deleted_at', null).gte('data_culto', input.inicio).lt('data_culto', input.fim);
      if (area) q = q.eq('area', area);
      const { data, count } = await q;
      const porArea = {};
      for (const r of data || []) { const k = r.area || 'sem_area'; porArea[k] = (porArea[k] || 0) + 1; }
      return { periodo: { inicio: input.inicio, fim: input.fim }, area: area || 'todas', total: count ?? (data || []).length, por_area: porArea };
    },
  },

  {
    name: 'batismos_periodo',
    routeKey: 'integracao',
    minLevel: 1,
    description:
      'Conta batismos REALIZADOS num período (por data do batismo) e o total aguardando. Datas em AAAA-MM-DD (fim exclusivo). area opcional (kids, ami, bridge, sede, online, cba).',
    input_schema: {
      type: 'object',
      properties: {
        inicio: { type: 'string', description: 'Data inicial AAAA-MM-DD (inclusiva).' },
        fim: { type: 'string', description: 'Data final AAAA-MM-DD (exclusiva).' },
        area: { type: 'string', description: 'Área opcional (area_kpi): kids, ami, bridge, sede, online, cba.' },
      },
      required: ['inicio', 'fim'],
    },
    handler: async (input) => {
      if (!isYmd(input.inicio) || !isYmd(input.fim)) return { erro: 'Informe inicio e fim no formato AAAA-MM-DD.' };
      const area = normalizarArea(input.area);
      let qr = supabase.from('batismo_inscricoes').select('id', { count: 'exact', head: true })
        .eq('status', 'realizado').gte('data_batismo', input.inicio).lt('data_batismo', input.fim);
      if (area) qr = qr.eq('area_kpi', area);
      const { count: realizados } = await qr;
      let qa = supabase.from('batismo_inscricoes').select('id', { count: 'exact', head: true })
        .in('status', ['pendente', 'confirmado']).is('deleted_at', null);
      if (area) qa = qa.eq('area_kpi', area);
      const { count: aguardando } = await qa;
      return { periodo: { inicio: input.inicio, fim: input.fim }, area: area || 'todas', realizados: realizados || 0, aguardando: aguardando || 0 };
    },
  },

  {
    name: 'grupos_sem_relato',
    routeKey: 'grupos',
    minLevel: 1,
    description:
      'Lista os grupos de conexão ativos SEM encontro registrado há N dias (default 60). Retorna a contagem e os nomes dos grupos. Use para "grupos sem visita/relato".',
    input_schema: {
      type: 'object',
      properties: { dias: { type: 'number', description: 'Janela em dias (default 60, entre 7 e 365).' } },
    },
    handler: async (input) => {
      const dias = Math.min(Math.max(parseInt(input.dias, 10) || 60, 7), 365);
      const desde = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
      const { data: grupos } = await supabase.from('mem_grupos').select('id, nome').eq('ativo', true);
      const { data: encontros } = await supabase.from('mem_grupo_encontros').select('grupo_id').gte('data', desde);
      const comRelato = new Set((encontros || []).map((e) => e.grupo_id));
      const sem = (grupos || []).filter((g) => !comRelato.has(g.id));
      return {
        dias, total_ativos: (grupos || []).length, total_sem_relato: sem.length,
        grupos: sem.slice(0, 25).map((g) => g.nome),
        truncado: sem.length > 25,
      };
    },
  },

  {
    name: 'kpis_area',
    routeKey: 'painel-cbrio',
    minLevel: 1,
    description:
      'Lista os KPIs de uma área com o status atual (no alvo / atrasado / crítico) e o último valor. area obrigatória (kids, ami, bridge, sede, online, cba).',
    input_schema: {
      type: 'object',
      properties: { area: { type: 'string', description: 'Área: kids, ami, bridge, sede, online, cba.' } },
      required: ['area'],
    },
    handler: async (input) => {
      const area = normalizarArea(input.area);
      if (!area) return { erro: `Área inválida. Use uma de: ${AREAS_VALIDAS.join(', ')}.` };
      const { data: kpis } = await supabase.from('kpi_indicadores_taticos')
        .select('id, indicador, area, unidade').eq('ativo', true).eq('area', area);
      if (!kpis || !kpis.length) return { area, kpis: [] };
      const ids = kpis.map((k) => k.id);
      const { data: traj } = await supabase.from('vw_kpi_trajetoria_atual')
        .select('kpi_id, status_trajetoria, ultimo_valor, percentual_meta').in('kpi_id', ids);
      const byId = {};
      for (const t of traj || []) byId[t.kpi_id] = t;
      const STATUS = { no_alvo: 'no alvo', verde: 'no alvo', atras: 'atrasado', amarelo: 'atrasado', critico: 'crítico', vermelho: 'crítico', sem_meta: 'sem meta' };
      return {
        area,
        kpis: kpis.map((k) => {
          const t = byId[k.id] || {};
          return { indicador: k.indicador, unidade: k.unidade, status: STATUS[t.status_trajetoria] || t.status_trajetoria || 'sem dado', ultimo_valor: t.ultimo_valor ?? null, percentual_meta: t.percentual_meta ?? null };
        }),
      };
    },
  },

  {
    name: 'solicitacoes_resumo',
    routeKey: 'solicitacoes',
    minLevel: 1,
    description:
      'Resume as solicitações por status (contagem). status opcional para filtrar um status específico. Use para "quantas solicitações abertas/pendentes".',
    input_schema: {
      type: 'object',
      properties: { status: { type: 'string', description: 'Status opcional para filtrar.' } },
    },
    handler: async (input) => {
      let q = supabase.from('solicitacoes').select('status').is('deleted_at', null);
      if (input.status) q = q.eq('status', String(input.status));
      const { data } = await q.limit(2000);
      const porStatus = {};
      for (const r of data || []) { const k = r.status || 'sem_status'; porStatus[k] = (porStatus[k] || 0) + 1; }
      return { total: (data || []).length, por_status: porStatus };
    },
  },
];

/**
 * Retorna as definições de tools (formato Anthropic) que ESTE usuário pode usar.
 */
function getToolDefsForUser(req) {
  return TOOLS
    .filter((t) => t.minLevel === 0 || getEffectiveLevel(req, t.routeKey) >= (t.minLevel || 1))
    .map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
}

/**
 * Executa uma tool pelo nome, RE-checando a permissão. Nunca confia só no LLM.
 * Retorna sempre um objeto serializável (inclui { erro } em caso de bloqueio).
 */
async function runTool(name, input, req) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { erro: `Ferramenta desconhecida: ${name}` };
  const nivel = tool.minLevel || 0;
  if (nivel > 0 && getEffectiveLevel(req, tool.routeKey) < nivel) {
    return { erro: 'Você não tem permissão para acessar esses dados.', sem_permissao: true };
  }
  try {
    const out = await tool.handler(input || {}, req);
    return out ?? { ok: true };
  } catch (e) {
    console.warn(`[ASSISTANT TOOL ${name}]`, e.message);
    return { erro: 'Não consegui consultar esse dado agora.' };
  }
}

module.exports = { TOOLS, getToolDefsForUser, runTool, isYmd, normalizarArea, AREAS_VALIDAS };
