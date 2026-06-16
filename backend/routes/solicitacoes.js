const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar, resolverDestinatarios } = require('../services/notificar');
const painelCache = require('../services/painelCache');
const mlTracker = require('../services/solicitacoesMlTracker');

const CRON_SECRET = process.env.CRON_SECRET;
const { isAuthorizedCron } = require('../utils/cronAuth');

// ── CRON · ATUALIZAR STATUS DE PEDIDOS ML VINCULADOS ───────────────────
// Montado ANTES do authenticate · auth via CRON_SECRET (Vercel/GitHub Actions).
router.post('/cron/atualizar-ml', async (req, res) => {
  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ erro: 'Nao autorizado' });
  }
  try {
    const result = await mlTracker.processarUpdates({ batchSize: 30, throttleMs: 200 });
    res.json(result);
  } catch (e) {
    console.error('[SOLICITACOES cron-ml] erro:', e.message);
    res.status(500).json({ ok: false, erro: e.message });
  }
});

router.use(authenticate);

// Bust do cache do painel após mutacao (afeta matriz adm/criativo)
router.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) painelCache.bust('');
    });
  }
  next();
});

const ALLOWED_CATEGORIES = ['ti', 'compras', 'reembolso', 'reserva_espaco', 'espaco', 'infraestrutura', 'ferias', 'licenca', 'marketing', 'pagamento', 'servico', 'producao', 'outro'];

// Map categoria → notification module
const CATEGORIA_MODULO = {
  ti: 'ti',
  compras: 'logistica',
  servico: 'logistica',     // contratação de fornecedor · logística negocia (Amaury)
  reembolso: 'financeiro',
  pagamento: 'financeiro',  // pagar boleto/NF de fornecedor · contas a pagar (Yago)
  reserva_espaco: 'administrativo',
  espaco: 'administrativo', // legado
  infraestrutura: 'administrativo',
  ferias: 'rh',
  licenca: 'rh',
  marketing: 'marketing',
  producao: 'producao',     // movimentação de material / configuração de equipamentos
  outro: 'administrativo',
};

// Map categoria → area_responsavel + subcategoria (Fase A backbone)
const CATEGORIA_TO_AREA_RESP = {
  ti:              { area: 'ti',                subcategoria: 'default' },
  compras:         { area: 'logistica_compras', subcategoria: 'default' },
  servico:         { area: 'logistica_compras', subcategoria: 'servico' },
  reembolso:       { area: 'financeiro',        subcategoria: 'reembolso' },
  pagamento:       { area: 'financeiro',        subcategoria: 'pagamento' },
  reserva_espaco:  { area: 'reserva_espaco',    subcategoria: 'default' },
  espaco:          { area: 'reserva_espaco',    subcategoria: 'default' },
  infraestrutura:  { area: 'manutencao',        subcategoria: 'default' },
  ferias:          { area: 'rh',                subcategoria: 'ferias' },
  licenca:         { area: 'rh',                subcategoria: 'licenca' },
  marketing:       { area: 'marketing',         subcategoria: 'default' },
  producao:        { area: 'producao',          subcategoria: 'default' },
  outro:           { area: null,                subcategoria: 'default' },
};

// Map módulo → categorias (for granular permission filtering)
const MODULO_CATEGORIAS = {
  ti: ['ti'],
  logistica: ['compras', 'servico'],
  financeiro: ['reembolso', 'pagamento'],
  administrativo: ['espaco', 'reserva_espaco', 'infraestrutura', 'outro'],
  rh: ['ferias', 'licenca'],
  marketing: ['marketing'],
  producao: ['producao'],
};

// Map modulePerms key → backend módulo
const PERM_TO_MODULO = {
  'DP': 'rh',
  'Pessoas': 'rh',
  'Financeiro': 'financeiro',
  'Logística': 'logistica',
  'Patrimônio': 'administrativo',
  'Membresia': 'administrativo',
  'TI': 'ti',
  'Marketing': 'marketing',
};

// ── Resolução de SETOR (Gestão/Criativo/Ministerial) para o roteamento ao
// diretor de origem. A cascata RICA roda aqui (req.user já carrega área/
// kpi_areas/cargo) e vira uma "dica" passada para fn_solicitacoes_rotear_origem
// — assim resolvemos o setor pelo cadastro OU pelo cargo antes de cair na
// triagem. Espelha fn_normalizar_setor (migration 20260612120000).
function _setorPorArea(raw) {
  const v = String(raw || '').normalize('NFD')
    .split('').filter(c => { const x = c.charCodeAt(0); return x < 0x0300 || x > 0x036f; }).join('')
    .toLowerCase().trim();
  if (!v) return null;
  if (['gestao', 'administrativo', 'adm', 'financeiro', 'rh', 'recursos humanos', 'logistica', 'logistica_compras', 'logistica_estoque', 'compras', 'manutencao', 'patrimonio', 'ti', 'tecnologia', 'operacoes', 'operacional', 'estrategia', 'governanca', 'juridico', 'secretaria', 'reserva_espaco'].includes(v)) return 'Gestao';
  if (['criativo', 'criativa', 'marketing', 'producao', 'comunicacao', 'design', 'audiovisual', 'midia', 'adoracao', 'louvor'].includes(v)) return 'Criativo';
  if (['ministerial', 'ministerio', 'pastoral', 'voluntariado', 'voluntariada', 'cuidados', 'grupos', 'integracao', 'next', 'membresia', 'discipulado', 'kids', 'ami', 'bridge', 'online', 'sede', 'cba', 'geracional', 'jornada'].includes(v)) return 'Ministerial';
  return null;
}
// Cargo → setor (rede de resgate quando o cadastro de área falha). Cargos
// genéricos/sem setor claro caem fora → resolve pela área ou vai pra triagem.
const CARGO_SETOR = {
  'diretor-criativo': 'Criativo', 'coordenador-marketing': 'Criativo', 'assistente-marketing': 'Criativo',
  'lider-producao': 'Criativo', 'assistente-producao': 'Criativo',
  'diretor-administrativo': 'Gestao', 'coordenador-estrategia': 'Gestao', 'coordenador-financeiro': 'Gestao',
  'assistente-financeiro': 'Gestao', 'lider-operacoes': 'Gestao', 'lider-logistica': 'Gestao',
  'assistente-logistica': 'Gestao', 'assistente-operacoes': 'Gestao', 'diretor-rh': 'Gestao',
  'diretor-ministerial': 'Ministerial', 'lider-ministerial': 'Ministerial', 'assistente-ministerial': 'Ministerial',
  'coordenador-kids': 'Ministerial', 'assistente-kids': 'Ministerial', 'coordenador-ami': 'Ministerial',
  'coordenador-bridge': 'Ministerial', 'coordenador-online': 'Ministerial', 'supervisor-jornada': 'Ministerial',
  'coordenador-voluntarios': 'Ministerial',
};
// Cascata: kpi_areas → usuario_areas (granular.areas) → profile.area → cargo
function resolverSetorHint(user) {
  const cands = [
    ...(Array.isArray(user.kpi_areas) ? user.kpi_areas : []),
    ...(Array.isArray(user.granular?.areas) ? user.granular.areas : []),
    user.area,
  ];
  for (const c of cands) { const s = _setorPorArea(c); if (s) return s; }
  const cs = user.granular?.cargoSlug;
  if (cs && CARGO_SETOR[cs]) return CARGO_SETOR[cs];
  return null;
}

// ── LIST (filtered by role) ─────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const role = req.user.role;
    const granular = req.user.granular;

    const { categoria, status, mine, aba, periodo } = req.query;
    let q = supabase
      .from('solicitacoes')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (categoria) q = q.eq('categoria', categoria);
    if (status) q = q.eq('status', status);

    // Período padrão (Fase 2) · bound por updated_at pra não estourar o cap de
    // 1000 linhas do PostgREST conforme o volume cresce. Filtra por updated_at
    // (não created_at) pra manter visível o que teve atividade recente, mesmo
    // criado há tempos. 'tudo' remove o limite. aba=aprovar não filtra (a fila
    // de decisão é pequena e recente por natureza).
    if (aba !== 'aprovar') {
      const dias = periodo === 'tudo' ? 0 : (parseInt(periodo, 10) || 365);
      if (dias > 0) q = q.gte('updated_at', new Date(Date.now() - dias * 86400000).toISOString());
    }

    if (aba === 'aprovar') {
      // Aba do diretor de origem · so o que o user precisa aprovar.
      // Super-admins tambem veem a fila de TRIAGEM (sem setor resolvido · Fase 0).
      const isSuper = await isAdminFallback(req);
      if (isSuper) {
        q = q.or(`and(aprovacao_origem_diretor_id.eq.${userId},aprovacao_origem_status.eq.pendente),aprovacao_origem_status.eq.triagem`)
             .is('deleted_at', null);
      } else {
        q = q.eq('aprovacao_origem_diretor_id', userId)
             .eq('aprovacao_origem_status', 'pendente')
             .is('deleted_at', null);
      }
    } else if (mine === 'true') {
      q = q.eq('solicitante_id', userId);
    } else if (['admin', 'diretor'].includes(role)) {
      // Admin/diretor sees all — no filter
    } else {
      // Fila "Para Atender": SO quem eh responsável cadastrado em
      // area_solicitacoes_responsaveis ve as solicitações da sua área.
      // Colaborador comum (sem área responsável) ve apenas as próprias —
      // acesso genérico a um módulo NÃO da direito de ver a fila dos outros.
      const { data: respRows } = await supabase
        .from('area_solicitacoes_responsaveis')
        .select('area')
        .eq('profile_id', userId);
      const responsavelAreas = new Set((respRows || []).map(r => r.area));

      const orParts = [`solicitante_id.eq.${encodeURIComponent(userId)}`];
      if (responsavelAreas.size > 0) {
        orParts.push(`area_responsavel.in.(${[...responsavelAreas].join(',')})`);
      }
      q = q.or(orParts.join(','));
    }

    const { data, error } = await q;
    if (error) throw error;

    // Resolve profile names for solicitante/responsavel/diretor_origem
    const profileIds = [...new Set((data || []).flatMap(d => [
      d.solicitante_id, d.responsavel_id, d.aprovacao_origem_diretor_id,
    ].filter(Boolean)))];
    let profileMap = {};
    if (profileIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('id,name,email').in('id', profileIds);
      if (profiles) profileMap = Object.fromEntries(profiles.map(p => [p.id, p]));
    }

    // Enrich Marketing etiquetas (Spec 010 · usado no Drawer de aprovação Spec 011)
    const tipoIds    = [...new Set((data || []).map(d => d.marketing_tipo_id).filter(Boolean))];
    const destinoIds = [...new Set((data || []).map(d => d.marketing_destino_id).filter(Boolean))];
    let tipoMap = {}, destinoMap = {};
    if (tipoIds.length) {
      const { data: t } = await supabase.from('marketing_etiquetas_tipo').select('id, slug, nome, cor, habilidade_padrao, esforco_max_h').in('id', tipoIds);
      tipoMap = Object.fromEntries((t || []).map(x => [x.id, x]));
    }
    if (destinoIds.length) {
      const { data: d } = await supabase.from('marketing_etiquetas_destino').select('id, slug, nome, cor').in('id', destinoIds);
      destinoMap = Object.fromEntries((d || []).map(x => [x.id, x]));
    }

    // Spec 012 · card Marketing LEGADO (cards antigos com solicitacao_id direto)
    const solicMktIds = (data || [])
      .filter(d => d.area_responsavel === 'marketing')
      .map(d => d.id);
    let cardMap = {};
    let campanhaMap = {};
    if (solicMktIds.length) {
      const { data: cards } = await supabase
        .from('marketing_kanban_cards')
        .select('id, solicitacao_id, estado, tem_revisao, prazo_confirmado, prazo_preliminar, atribuido_a, entregue_em')
        .in('solicitacao_id', solicMktIds)
        .is('deleted_at', null);
      cardMap = Object.fromEntries((cards || []).map(c => [c.solicitacao_id, c]));

      // Redesenho 2026 · o solicitante acompanha a CAMPANHA (1 dor = 1 campanha com
      // N entregaveis · os cards triados tem campanha_id, NÃO solicitacao_id).
      const { data: camps } = await supabase
        .from('marketing_campanhas')
        .select('id, solicitacao_id, status, titulo, prazo_entrega')
        .in('solicitacao_id', solicMktIds)
        .is('deleted_at', null);
      const campIds = (camps || []).map(c => c.id);
      const entregMap = {};
      if (campIds.length) {
        const { data: ents } = await supabase
          .from('marketing_kanban_cards')
          .select('id, campanha_id, titulo, estado, atribuido_a, data_fim, tem_revisao')
          .in('campanha_id', campIds)
          .is('deleted_at', null);
        const membroIds = [...new Set((ents || []).map(e => e.atribuido_a).filter(Boolean))];
        let donoMap = {};
        if (membroIds.length) {
          const { data: ms } = await supabase.from('marketing_membros').select('id, profile_id, nome_display').in('id', membroIds);
          const pids = [...new Set((ms || []).map(m => m.profile_id).filter(Boolean))];
          let pmap = {};
          if (pids.length) {
            const { data: ps } = await supabase.from('profiles').select('id, name').in('id', pids);
            pmap = Object.fromEntries((ps || []).map(p => [p.id, p.name]));
          }
          donoMap = Object.fromEntries((ms || []).map(m => [m.id, pmap[m.profile_id] || m.nome_display || null]));
        }
        for (const e of (ents || [])) {
          if (!entregMap[e.campanha_id]) entregMap[e.campanha_id] = [];
          entregMap[e.campanha_id].push({ id: e.id, titulo: e.titulo, estado: e.estado, dono_nome: donoMap[e.atribuido_a] || null, data_fim: e.data_fim, tem_revisao: e.tem_revisao });
        }
      }
      campanhaMap = Object.fromEntries((camps || []).map(c => [c.solicitacao_id, { ...c, entregaveis: entregMap[c.id] || [] }]));
    }

    const enriched = (data || []).map(d => ({
      ...d,
      solicitante: profileMap[d.solicitante_id] || null,
      responsavel: profileMap[d.responsavel_id] || null,
      aprovacao_origem_diretor: profileMap[d.aprovacao_origem_diretor_id] || null,
      marketing_tipo: tipoMap[d.marketing_tipo_id] || null,
      marketing_destino: destinoMap[d.marketing_destino_id] || null,
      marketing_card: cardMap[d.id] || null,
      marketing_campanha: campanhaMap[d.id] || null,
    }));

    res.json(enriched);
  } catch (e) {
    console.error('[SOLICITACOES] list error:', e.message);
    res.status(500).json({ error: 'Erro ao listar solicitações' });
  }
});

// ── MEU PAPEL ───────────────────────────────────────────────
// Define se o usuário ve a fila "Para Atender": admin/diretor OU
// responsável cadastrado de alguma área (area_solicitacoes_responsaveis).
// Colaborador comum recebe atende=false → so "Minhas Solicitações".
router.get('/meu-papel', async (req, res) => {
  try {
    const userId = req.user.userId;
    const role = req.user.role;

    // Aprovador de origem? Cargo de diretor de setor cadastrado em setor_diretor.
    const { data: setorRow } = await supabase
      .from('setor_diretor')
      .select('setor, diretor_nome')
      .eq('diretor_id', userId)
      .maybeSingle();

    // Contador de pendentes na fila do diretor de origem
    let pendentesOrigem = 0;
    if (setorRow) {
      const { count } = await supabase
        .from('solicitacoes')
        .select('id', { count: 'exact', head: true })
        .eq('aprovacao_origem_diretor_id', userId)
        .eq('aprovacao_origem_status', 'pendente')
        .is('deleted_at', null);
      pendentesOrigem = count || 0;
    }

    // Triagem · super-admins veem solicitacoes sem setor resolvido (Fase 0)
    const isSuper = await isAdminFallback(req);
    let pendentesTriagem = 0;
    if (isSuper) {
      const { count } = await supabase
        .from('solicitacoes')
        .select('id', { count: 'exact', head: true })
        .eq('aprovacao_origem_status', 'triagem')
        .is('deleted_at', null);
      pendentesTriagem = count || 0;
    }

    if (['admin', 'diretor'].includes(role)) {
      return res.json({
        atende: true,
        admin: true,
        areas: [],
        eh_diretor_origem: !!setorRow,
        setor_origem: setorRow?.setor || null,
        pendentes_origem: pendentesOrigem,
        eh_triagem_admin: isSuper,
        pendentes_triagem: pendentesTriagem,
      });
    }
    const { data, error } = await supabase
      .from('area_solicitacoes_responsaveis')
      .select('area')
      .eq('profile_id', userId);
    if (error) throw error;
    const areas = (data || []).map(r => r.area);
    res.json({
      atende: areas.length > 0,
      admin: false,
      areas,
      eh_diretor_origem: !!setorRow,
      setor_origem: setorRow?.setor || null,
      pendentes_origem: pendentesOrigem,
      eh_triagem_admin: isSuper,
      pendentes_triagem: pendentesTriagem,
    });
  } catch (e) {
    console.error('[SOLICITACOES] meu-papel error:', e.message);
    res.status(500).json({ error: 'Erro ao resolver papel' });
  }
});

// ── CREATE ──────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;

    const { titulo, descricao, justificativa, categoria, urgencia, valor_estimado, area_solicitante,
            // Fase A backbone
            area_responsavel, subcategoria, eh_urgente, justificativa_urgencia,
            data_necessaria, espaco_solicitado, data_uso, horario_inicio, horario_fim, qtde_pessoas,
            // Reembolso
            motivo_reembolso, data_compra,
            forma_pagamento, chave_pix, banco, agencia, conta, documento_url,
            // Compras / Pagamentos / Serviços (campos estruturados compartilhados)
            itens, link_referencia, favorecido_nome, favorecido_documento,
            recorrente, recorrencia,
            // Marketing · Spec 010 (etiquetas) + intake por DOR (Redesenho 2026-05-30)
            marketing_tipo_id, marketing_destino_id,
            mkt_publico_alvo, mkt_ideia_inicial } = req.body;
    if (!titulo || !categoria) return res.status(400).json({ error: 'Título e categoria são obrigatórios' });
    if (!ALLOWED_CATEGORIES.includes(categoria)) {
      return res.status(400).json({ error: `Categoria inválida: "${categoria}". Permitidas: ${ALLOWED_CATEGORIES.join(', ')}` });
    }

    // Auto-mapeia area_responsavel + subcategoria
    const mapa = CATEGORIA_TO_AREA_RESP[categoria] || { area: null, subcategoria: 'default' };
    const finalAreaResp = area_responsavel || mapa.area;
    const finalSub = subcategoria || mapa.subcategoria;

    // Área do SOLICITANTE (dimensão de KPI) · NÃO vem mais de seletor no form
    // (2026-06-01). Deriva de quem preenche · ignora qualquer area_cliente do body.
    // Prioriza kpi_areas (slug que o resto dos KPIs usa) > 1a área granular de
    // usuario_areas (nome normalizado pra slug) > setor do profile.
    const _stripAcentos = (s) => String(s || '').normalize('NFD')
      .split('').filter(c => { const code = c.charCodeAt(0); return code < 0x0300 || code > 0x036f; }).join('');
    const _slugArea = (s) => _stripAcentos(s).toLowerCase().trim();
    const areaClienteResolvida =
      (Array.isArray(req.user.kpi_areas) && req.user.kpi_areas[0])
      || (req.user.granular?.areas?.[0] ? _slugArea(req.user.granular.areas[0]) : null)
      || (req.user.area ? _slugArea(req.user.area) : null)
      || null;

    // Aprovação hierarquica de origem (Spec 001) · resolvida AQUI porque o insert
    // roda via service_role (auth.uid()=NULL) e, nesse caso, o trigger so dispensa.
    // Gravamos aprovacao_origem_* + status no insert · o trigger continua de rede
    // de segurança (so age quando ninguém setou aprovacao_origem_status).
    let rota = null;
    try {
      const setorHint = resolverSetorHint(req.user);
      const { data: r, error: rErr } = await supabase
        .rpc('fn_solicitacoes_rotear_origem', { p_solicitante_id: userId, p_setor_hint: setorHint });
      if (rErr) throw rErr;
      rota = r;
    } catch (rerr) {
      console.error('[SOLICITAÇÕES] roteamento de origem falhou (fallback trigger):', rerr.message);
    }

    const { data, error } = await supabase
      .from('solicitacoes')
      .insert({
        titulo,
        descricao,
        justificativa,
        categoria,
        urgencia: urgencia || 'normal',
        valor_estimado,
        solicitante_id: userId,
        area_solicitante,
        cargo_solicitante: req.user.granular?.cargoNome || null,
        // Campos novos · trigger calcula SLA e precisa_aprovacao_financeira.
        // area_cliente vem da ÁREA do solicitante (KPIs), não mais de seletor.
        area_cliente: areaClienteResolvida,
        area_responsavel: finalAreaResp,
        // Roteamento hierarquico resolvido acima · status='aguardando_aprovacao_origem'
        // (vai pro diretor) ou 'pendente' (dispensada). SLA trigger refina compras/reembolso.
        ...(rota && {
          aprovacao_origem_diretor_id: rota.diretor_id || null,
          aprovacao_origem_status: rota.aprovacao_status,
          aprovacao_origem_motivo: rota.motivo || null,
          aprovacao_origem_em: rota.aprovacao_status === 'dispensada' ? new Date().toISOString() : null,
          status: rota.status,
        }),
        subcategoria: finalSub,
        eh_urgente: !!eh_urgente,
        justificativa_urgencia: justificativa_urgencia || null,
        data_necessaria: data_necessaria || null,
        // Reserva de espaco
        ...(finalAreaResp === 'reserva_espaco' && {
          espaco_solicitado: espaco_solicitado || null,
          data_uso: data_uso || null,
          horario_inicio: horario_inicio || null,
          horario_fim: horario_fim || null,
          qtde_pessoas: qtde_pessoas || null,
        }),
        // Reembolso · motivo + comprovante + data + forma de pagamento
        ...(categoria === 'reembolso' && {
          motivo_reembolso: motivo_reembolso || null,
          data_compra: data_compra || null,
          forma_pagamento: forma_pagamento || null,
          chave_pix: chave_pix || null,
          banco: banco || null,
          agencia: agencia || null,
          conta: conta || null,
          documento_url: documento_url || null,
        }),
        // Compras · itens + link de referência + fornecedor sugerido
        ...(categoria === 'compras' && {
          itens: itens || null,
          link_referencia: link_referencia || null,
          favorecido_nome: favorecido_nome || null,
        }),
        // Pagamento · favorecido + documento (boleto/NF) + forma + recorrencia.
        // data_necessaria carrega o vencimento (reusa a coluna · ver frontend).
        ...(categoria === 'pagamento' && {
          favorecido_nome: favorecido_nome || null,
          favorecido_documento: favorecido_documento || null,
          forma_pagamento: forma_pagamento || null,
          chave_pix: chave_pix || null,
          banco: banco || null,
          agencia: agencia || null,
          conta: conta || null,
          documento_url: documento_url || null,
          recorrente: !!recorrente,
          recorrencia: recorrencia || null,
        }),
        // Serviço · o que (itens) + fornecedor sugerido + proposta + recorrencia
        ...(categoria === 'servico' && {
          itens: itens || null,
          favorecido_nome: favorecido_nome || null,
          favorecido_documento: favorecido_documento || null,
          link_referencia: link_referencia || null,
          documento_url: documento_url || null,
          recorrente: !!recorrente,
          recorrencia: recorrencia || null,
        }),
        // Marketing · intake por DOR (Redesenho 2026-05-30) · público + ideia opcional.
        // marketing_tipo_id/destino_id ficam null no intake (Pedro classifica na triagem).
        ...(categoria === 'marketing' && {
          marketing_tipo_id: marketing_tipo_id || null,
          marketing_destino_id: marketing_destino_id || null,
          mkt_publico_alvo: mkt_publico_alvo || null,
          mkt_ideia_inicial: mkt_ideia_inicial || null,
        }),
      })
      .select('*')
      .single();
    if (error) throw error;

    // Auto-vincula responsavel_id se houver uma única pessoa cadastrada para
    // a área · se houver mais, deixa nulo (qualquer um da fila pode pegar)
    let responsaveisDaArea = [];
    if (finalAreaResp) {
      const { data: resps } = await supabase
        .from('area_solicitacoes_responsaveis')
        .select('profile_id')
        .eq('area', finalAreaResp);
      responsaveisDaArea = (resps || []).map(r => r.profile_id);

      if (responsaveisDaArea.length === 1) {
        await supabase
          .from('solicitacoes')
          .update({ responsavel_id: responsaveisDaArea[0] })
          .eq('id', data.id);
        data.responsavel_id = responsaveisDaArea[0];
      }
    }

    // Notify responsible people · além das regras do módulo, sempre notifica
    // os responsáveis cadastrados pra área (Pedro Paiva pra marketing, etc)
    const modulo = CATEGORIA_MODULO[categoria] || 'administrativo';
    notificar({
      modulo,
      tipo: 'solicitacao',
      titulo: `Nova solicitação: ${titulo}`,
      mensagem: `${userName || 'Usuário'} criou uma solicitação de ${categoria}`,
      link: '/solicitacoes',
      severidade: urgencia === 'critica' ? 'alta' : 'info',
      chaveDedup: `solicitacao_nova_${data.id}`,
      extraTargetIds: responsaveisDaArea,
    }).catch(err => console.error('[SOLICITACOES] notify error:', err.message));

    // Aprovação hierarquica · se trigger marcou aguardando_aprovacao_origem,
    // notifica o diretor de origem em vez do responsável da área alvo.
    if (data.status === 'aguardando_aprovacao_origem' && data.aprovacao_origem_diretor_id) {
      notificar({
        modulo: 'administrativo',
        tipo: 'solicitacao_aprovacao_origem',
        titulo: `Aprovar solicitacao: ${titulo}`,
        mensagem: `${userName || 'Funcionario'} pediu uma solicitação que precisa da sua aprovação antes de seguir para ${finalAreaResp || 'area alvo'}.`,
        link: '/solicitacoes?aba=aprovar',
        severidade: 'info',
        chaveDedup: `solicitacao_aprovacao_origem_${data.id}`,
        targetIds: [data.aprovacao_origem_diretor_id],
      }).catch(err => console.error('[SOLICITACOES] notify diretor:', err.message));
    }

    // Triagem · setor nao resolvido · alerta de governanca pros super-admins/diretoria.
    // O foco do alerta e' o CADASTRO sem area (corrigir o usuario), nao o pedido.
    if (data.status === 'aguardando_aprovacao_origem' && data.aprovacao_origem_status === 'triagem') {
      notificar({
        modulo: 'administrativo',
        tipo: 'solicitacao_triagem',
        titulo: 'Triagem · usuário sem área no sistema',
        mensagem: `A solicitação "${titulo}" caiu na triagem porque ${userName || 'o solicitante'} está no sistema sem área/setor definido. Defina a área no cadastro (Permissões › Usuários) e aprove/encaminhe.`,
        link: '/solicitacoes?aba=aprovar',
        severidade: 'alta',
        chaveDedup: `solicitacao_triagem_${data.id}`,
      }).catch(err => console.error('[SOLICITACOES] notify triagem:', err.message));
    }

    res.status(201).json(data);
  } catch (e) {
    console.error('[SOLICITACOES] create error:', e.message);
    // Erro do trigger fn_solicitacoes_roteamento_aprovacao · membro nao-funcionario
    if (e.code === '42501' || /apenas funcionarios podem criar solicitacoes/i.test(e.message || '')) {
      return res.status(403).json({
        error: 'Apenas funcionários com vinculo ativo em RH podem criar solicitações.',
      });
    }
    res.status(500).json({ error: e.message || 'Erro ao criar solicitação' });
  }
});

// ── APROVAÇÃO HIERARQUICA DE ORIGEM ─────────────────────────
// Diretor de origem aprova a solicitação. Após aprovação, ela vai pra
// fila normal da área alvo (status='pendente').
async function isAdminFallback(req) {
  // Marcos + Matheus + outros super-admins · permitem aprovar/rejeitar quando
  // diretor de origem não esta cadastrado ou esta de férias (fallback).
  if (['admin'].includes(req.user.role)) return true;
  const { data } = await supabase
    .from('app_super_admins')
    .select('email')
    .ilike('email', req.user.email)
    .eq('ativo', true)
    .maybeSingle();
  return !!data;
}

router.patch('/:id/aprovar-origem', async (req, res) => {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;
    const isSuperAdmin = await isAdminFallback(req);

    const { data: atual, error: getErr } = await supabase
      .from('solicitacoes')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (getErr) throw getErr;
    if (!atual) return res.status(404).json({ error: 'Solicitação não encontrada.' });

    if (!['pendente', 'triagem'].includes(atual.aprovacao_origem_status)) {
      return res.status(400).json({ error: 'Solicitação não está pendente de aprovação.' });
    }

    // Quem pode aprovar: o diretor de origem cadastrado, OU super-admin (fallback
    // quando diretor_id não foi resolvido, OU intervencao manual).
    const isDiretorAlvo = atual.aprovacao_origem_diretor_id === userId;
    if (!isDiretorAlvo && !isSuperAdmin) {
      return res.status(403).json({ error: 'Apenas o diretor de origem pode aprovar esta solicitação.' });
    }

    const novoResponsavelId = atual.responsavel_id;
    // Próximo portao após o diretor de origem:
    //   compras/servico  -> EM_COTACAO · a logistica levanta valor+fornecedor ANTES
    //                       do financeiro (o Yago aprova sobre o valor real cotado).
    //   reembolso/pagamento (e demais c/ alcada) -> aprovação financeira direta.
    //   resto -> fila da área alvo (pendente).
    const ehCotacao = ['compras', 'servico'].includes(atual.categoria);
    let proximoStatus;
    if (ehCotacao) {
      proximoStatus = 'em_cotacao';
    } else if (atual.precisa_aprovacao_financeira && !atual.aprovado_financeiro_em) {
      proximoStatus = 'aguardando_aprovacao_financeira';
    } else {
      proximoStatus = 'pendente';
    }
    const update = {
      aprovacao_origem_status: 'aprovada',
      aprovacao_origem_em: new Date().toISOString(),
      status: proximoStatus,
    };
    // Se super-admin esta aprovando como fallback, registra quem foi
    if (!isDiretorAlvo && isSuperAdmin) {
      update.aprovacao_origem_diretor_id = userId;
      update.aprovacao_origem_motivo = '[Fallback super-admin]';
    }

    const { data, error } = await supabase
      .from('solicitacoes')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;

    // Notifica solicitante + responsável da área alvo
    const modulo = CATEGORIA_MODULO[data.categoria] || 'administrativo';
    notificar({
      modulo,
      tipo: 'solicitacao_status',
      titulo: `Aprovada: ${data.titulo}`,
      mensagem: ehCotacao
        ? `${userName || 'Diretor'} aprovou sua solicitação. Foi pra cotação na logística (valor e fornecedor) antes do financeiro.`
        : `${userName || 'Diretor'} aprovou sua solicitação. Foi para a fila ${data.area_responsavel || 'da area alvo'}.`,
      link: '/solicitacoes',
      severidade: 'info',
      chaveDedup: `solicitacao_aprovada_origem_${data.id}`,
      targetIds: [data.solicitante_id].filter(Boolean),
    }).catch(err => console.error('[SOLICITACOES] notify aprovar:', err.message));

    if (data.area_responsavel) {
      resolverDestinatarios(modulo).then(managers => {
        const filtered = managers.filter(id => id !== data.solicitante_id);
        if (filtered.length) {
          notificar({
            modulo,
            tipo: 'solicitacao',
            titulo: ehCotacao ? `Cotar: ${data.titulo}` : `Nova na fila: ${data.titulo}`,
            mensagem: ehCotacao
              ? `Solicitação aprovada pelo diretor · registre a cotação (valor + fornecedor) pra seguir pro financeiro.`
              : `Solicitação aprovada pelo diretor · pronta para atendimento.`,
            link: '/solicitacoes',
            severidade: 'info',
            chaveDedup: `solicitacao_pos_aprovacao_${data.id}`,
            targetIds: filtered,
          }).catch(err => console.error('[SOLICITACOES] notify responsaveis:', err.message));
        }
      }).catch(err => console.error('[SOLICITACOES] resolve managers:', err.message));
    }

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] aprovar-origem:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao aprovar solicitação' });
  }
});

// ── COTACAO (compras/servico) · a logistica levanta valor+fornecedor ANTES do ──
// financeiro. Marcos (2026-06-16): "primeiro vem a cotacao, depois a aprovacao do
// financeiro" · o Yago decide sobre o valor real, nao sobre uma estimativa cega.
async function podeCotar(req, sol) {
  if (['admin', 'diretor'].includes(req.user.role)) return true;
  const mp = req.user.granular?.modulePerms || {};
  const log = mp.logistica || mp.Logistica;
  if (log && (log.leitura >= 3 || log.escrita >= 3)) return true;
  if (!sol?.area_responsavel) return false;
  const { data } = await supabase
    .from('area_solicitacoes_responsaveis')
    .select('profile_id')
    .eq('area', sol.area_responsavel)
    .eq('profile_id', req.user.userId)
    .maybeSingle();
  return !!data;
}

router.post('/:id/registrar-cotacao', async (req, res) => {
  try {
    const { valor_cotado, fornecedor, observacao } = req.body || {};
    const valor = Number(valor_cotado);
    if (valor_cotado == null || valor_cotado === '' || Number.isNaN(valor) || valor < 0) {
      return res.status(400).json({ error: 'Informe o valor cotado (número ≥ 0).' });
    }
    const { data: atual, error: getErr } = await supabase
      .from('solicitacoes').select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (getErr) throw getErr;
    if (!atual) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (atual.status !== 'em_cotacao') {
      return res.status(400).json({ error: 'Esta solicitação não está em cotação.' });
    }
    if (!(await podeCotar(req, atual))) {
      return res.status(403).json({ error: 'Apenas a logística (ou admin) pode registrar a cotação.' });
    }

    // Grava a cotacao e manda pro financeiro · o Yago aprova sobre o valor cotado.
    // valor_estimado passa a refletir o cotado (alcada/relatorios usam o valor real).
    const updates = {
      valor_cotado: valor,
      cotacao_fornecedor: fornecedor || null,
      cotacao_observacao: observacao || null,
      cotacao_em: new Date().toISOString(),
      cotacao_por: req.user.userId,
      valor_estimado: valor,
      precisa_aprovacao_financeira: true,
      status: 'aguardando_aprovacao_financeira',
    };
    const { data, error } = await supabase
      .from('solicitacoes').update(updates).eq('id', req.params.id).select('*').single();
    if (error) throw error;

    // Notifica o financeiro (Yago) que ha cotacao pra aprovar
    resolverDestinatarios('financeiro').then(managers => {
      const alvo = [...new Set((managers || []).filter(Boolean))];
      if (alvo.length) {
        notificar({
          modulo: 'financeiro',
          tipo: 'solicitacao_status',
          titulo: `Cotação pronta: ${data.titulo}`,
          mensagem: `A logística cotou R$ ${valor.toFixed(2)}${fornecedor ? ` (${fornecedor})` : ''} · aguarda sua aprovação financeira.`,
          link: '/solicitacoes',
          severidade: 'info',
          chaveDedup: `solicitacao_cotacao_${data.id}`,
          targetIds: alvo,
        }).catch(err => console.error('[SOLICITACOES] notify cotacao:', err.message));
      }
    }).catch(err => console.error('[SOLICITACOES] resolve financeiro:', err.message));

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] registrar-cotacao:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao registrar cotação' });
  }
});

// Diretor de origem rejeita · motivo obrigatório · status fica imutavel
// (Marcos 2026-05-28 · "solicitação rejeitada não reabre · cria nova").
router.patch('/:id/rejeitar-origem', async (req, res) => {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;
    const isSuperAdmin = await isAdminFallback(req);
    const { motivo } = req.body || {};
    if (!motivo || !motivo.trim()) {
      return res.status(400).json({ error: 'Motivo da rejeição é obrigatório.' });
    }

    const { data: atual } = await supabase
      .from('solicitacoes')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (!['pendente', 'triagem'].includes(atual.aprovacao_origem_status)) {
      return res.status(400).json({ error: 'Solicitação não está pendente de aprovação.' });
    }
    const isDiretorAlvo = atual.aprovacao_origem_diretor_id === userId;
    if (!isDiretorAlvo && !isSuperAdmin) {
      return res.status(403).json({ error: 'Apenas o diretor de origem pode rejeitar esta solicitação.' });
    }

    const update = {
      aprovacao_origem_status: 'rejeitada',
      aprovacao_origem_em: new Date().toISOString(),
      aprovacao_origem_motivo: motivo.trim(),
      status: 'rejeitado',
    };
    if (!isDiretorAlvo && isSuperAdmin) {
      update.aprovacao_origem_diretor_id = userId;
    }

    const { data, error } = await supabase
      .from('solicitacoes')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;

    const modulo = CATEGORIA_MODULO[data.categoria] || 'administrativo';
    notificar({
      modulo,
      tipo: 'solicitacao_status',
      titulo: `Rejeitada: ${data.titulo}`,
      mensagem: `${userName || 'Diretor'} rejeitou: ${motivo.trim()}`,
      link: '/solicitacoes',
      severidade: 'alta',
      chaveDedup: `solicitacao_rejeitada_origem_${data.id}`,
      targetIds: [data.solicitante_id].filter(Boolean),
    }).catch(err => console.error('[SOLICITACOES] notify rejeitar:', err.message));

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] rejeitar-origem:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao rejeitar solicitação' });
  }
});

// ── UPDATE (status, responsável, observações) ───────────────
router.patch('/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;

    const { status, responsavel_id, observacoes,
            // Fase A · novos campos editaveis
            proposta_orcamento, proposta_cronograma,
            nps_nota, nps_comentario } = req.body;
    // SEGURANCA: `aprovado_financeiro_em`/`aprovado_financeiro_por` NUNCA sao
    // aceitos aqui. O portao de gasto so e liberado pelo endpoint dedicado
    // POST /:id/aprovar-financeiro (gated por podeAprovarFinanceiro). Antes, este
    // PATCH (sem authz) aceitava o campo do body → qualquer autenticado liberava
    // pagamento de qualquer solicitacao.

    // ── Autorizacao · carrega a solicitacao e decide quem pode editar ──
    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('id, solicitante_id, responsavel_id, area_responsavel')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada' });

    const isAdmin = ['admin', 'diretor'].includes(req.user.role);
    const isResponsavel = sol.responsavel_id === userId;
    const isSolicitante = sol.solicitante_id === userId;
    let isAreaResp = false;
    if (!isAdmin && !isResponsavel && sol.area_responsavel) {
      const { data: respRow } = await supabase
        .from('area_solicitacoes_responsaveis')
        .select('profile_id')
        .eq('area', sol.area_responsavel)
        .eq('profile_id', userId)
        .maybeSingle();
      isAreaResp = !!respRow;
    }
    const podeGerir = isAdmin || isResponsavel || isAreaResp;
    if (!podeGerir && !isSolicitante) {
      return res.status(403).json({ error: 'Sem permissão para alterar esta solicitação' });
    }

    const update = {};
    // Gestao (status/responsavel/observacoes/propostas) · so quem administra a fila.
    if (podeGerir) {
      if (status) update.status = status;
      if (responsavel_id !== undefined) update.responsavel_id = responsavel_id;
      if (observacoes !== undefined) update.observacoes = observacoes;
      if (proposta_orcamento !== undefined) update.proposta_orcamento = proposta_orcamento;
      if (proposta_cronograma !== undefined) update.proposta_cronograma = proposta_cronograma;
    }
    // Avaliacao NPS · o solicitante (dono) tambem pode registrar a propria nota.
    if (nps_nota !== undefined) update.nps_nota = nps_nota;
    if (nps_comentario !== undefined) update.nps_comentario = nps_comentario;

    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nada para atualizar' });

    const { data, error } = await supabase
      .from('solicitacoes')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;

    // Notify solicitante + área managers about status change
    if (status && data) {
      const modulo = CATEGORIA_MODULO[data.categoria] || 'administrativo';
      const statusLabel = status.replace('_', ' ');
      const obsNote = observacoes ? ` — "${observacoes}"` : '';

      // Conclusão · pede avaliação NPS pro solicitante (alimenta KPIs ADM-*-Q)
      const ehConclusao = status === 'concluido';
      const tituloSolicitante = ehConclusao
        ? `Avalie: ${data.titulo}`
        : `Solicitação atualizada: ${data.titulo}`;
      const mensagemSolicitante = ehConclusao
        ? `Sua solicitação foi concluída${obsNote}. Avalie o atendimento em 30 segundos · ajuda muito a melhorar.`
        : `Status alterado para "${statusLabel}"${obsNote}`;

      // 1. Notify the requester
      notificar({
        modulo,
        tipo: ehConclusao ? 'solicitacao_avaliar' : 'solicitacao_status',
        titulo: tituloSolicitante,
        mensagem: mensagemSolicitante,
        link: '/solicitacoes',
        severidade: status === 'rejeitado' ? 'alta' : 'info',
        chaveDedup: `solicitacao_status_${data.id}_${status}`,
        targetIds: [data.solicitante_id],
      }).catch(err => console.error('[SOLICITACOES] notify solicitante error:', err.message));

      // 2. Notify área managers (excluding the requester to avoid duplicate)
      resolverDestinatarios(modulo).then(managers => {
        const filtered = managers.filter(id => id !== data.solicitante_id);
        if (filtered.length) {
          notificar({
            modulo,
            tipo: 'solicitacao_status',
            titulo: `Solicitação atualizada: ${data.titulo}`,
            mensagem: `Status alterado para "${statusLabel}" por ${userName || 'usuário'}${obsNote}`,
            link: '/solicitacoes',
            severidade: 'info',
            chaveDedup: `solicitacao_status_mgr_${data.id}_${status}`,
            targetIds: filtered,
          }).catch(err => console.error('[SOLICITACOES] notify managers error:', err.message));
        }
      }).catch(err => console.error('[SOLICITACOES] resolve managers error:', err.message));
    }

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] update error:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar solicitação' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// FASE 1 · Linha do tempo + "Relatar Problema" (alteração/devolução) + reenvio
// ══════════════════════════════════════════════════════════════════════════

// GET /:id/timeline · fases (solicitacoes_eventos) + ajustes (solicitacao_ajustes)
// mesclados em ordem · visível pro solicitante E pro responsável.
router.get('/:id/timeline', async (req, res) => {
  try {
    const [{ data: eventos }, { data: ajustes }] = await Promise.all([
      supabase.from('solicitacoes_eventos').select('*').eq('solicitacao_id', req.params.id).order('created_at', { ascending: true }),
      supabase.from('solicitacao_ajustes').select('*').eq('solicitacao_id', req.params.id).order('created_at', { ascending: true }),
    ]);
    const ids = [...new Set([
      ...(eventos || []).map(e => e.ator_id),
      ...(ajustes || []).map(a => a.autor_id),
    ].filter(Boolean))];
    let nomes = {};
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, name').in('id', ids);
      nomes = Object.fromEntries((profs || []).map(p => [p.id, p.name]));
    }
    const linha = [
      ...(eventos || []).map(e => ({ tipo: 'evento', em: e.created_at, status_anterior: e.status_anterior, status_novo: e.status_novo, ator: nomes[e.ator_id] || null, observacao: e.observacao })),
      ...(ajustes || []).map(a => ({ tipo: 'ajuste', em: a.created_at, lado: a.lado, motivo: a.motivo, comentario: a.comentario, ator: nomes[a.autor_id] || null })),
    ].sort((x, y) => new Date(x.em).getTime() - new Date(y.em).getTime());
    res.json(linha);
  } catch (e) {
    console.error('[SOLICITACOES] timeline:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /:id/relatar-problema · body { motivo, comentario }
// motivo ∈ descricao|escopo|data → 'aguardando_ajuste' (volta editável pro
// solicitante · pausa o SLA · vezes_refeita++). motivo='cancelamento' → 'cancelado'.
// O `lado` (solicitante/responsável) sai de quem aciona (KPI diagnóstico).
router.post('/:id/relatar-problema', async (req, res) => {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;
    const { motivo, comentario } = req.body || {};
    if (!['descricao', 'escopo', 'data', 'cancelamento'].includes(motivo)) {
      return res.status(400).json({ error: 'Motivo inválido.' });
    }

    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('id, solicitante_id, responsavel_id, area_responsavel, categoria, titulo, status, vezes_refeita')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });

    const isAdmin = ['admin', 'diretor'].includes(req.user.role);
    const isSolic = sol.solicitante_id === userId;
    const isResp = sol.responsavel_id === userId;
    let isAreaResp = false;
    if (!isAdmin && !isResp && sol.area_responsavel) {
      const { data: rr } = await supabase.from('area_solicitacoes_responsaveis')
        .select('profile_id').eq('area', sol.area_responsavel).eq('profile_id', userId).maybeSingle();
      isAreaResp = !!rr;
    }
    const podeGerir = isAdmin || isResp || isAreaResp;
    if (!isSolic && !podeGerir) return res.status(403).json({ error: 'Sem permissão.' });
    if (['concluido', 'cancelado', 'rejeitado', 'avaliado'].includes(sol.status)) {
      return res.status(400).json({ error: 'Solicitação já encerrada · não é possível relatar problema.' });
    }
    // Já em ajuste: não re-pausa (preservaria status_antes_ajuste/sla_pausado_em
    // originais) · o solicitante deve editar e reenviar. Cancelar ainda é possível.
    if (sol.status === 'aguardando_ajuste' && motivo !== 'cancelamento') {
      return res.status(400).json({ error: 'Já está aguardando ajuste · edite e reenvie (ou cancele).' });
    }

    const lado = isSolic ? 'solicitante' : 'responsavel';
    await supabase.from('solicitacao_ajustes').insert({
      solicitacao_id: sol.id, autor_id: userId, lado, motivo, comentario: comentario || null,
    });

    const modulo = CATEGORIA_MODULO[sol.categoria] || 'administrativo';

    if (motivo === 'cancelamento') {
      const { data, error } = await supabase.from('solicitacoes')
        .update({ status: 'cancelado' }).eq('id', sol.id).select('*').single();
      if (error) throw error;
      notificar({
        modulo, tipo: 'solicitacao_status',
        titulo: `Cancelada: ${sol.titulo}`,
        mensagem: `${userName || 'Usuário'} cancelou a solicitação${comentario ? ` · ${comentario}` : ''}.`,
        link: '/solicitacoes', severidade: 'info',
        chaveDedup: `solicitacao_cancelada_${sol.id}`,
        ...(lado === 'responsavel' ? { targetIds: [sol.solicitante_id].filter(Boolean) } : {}),
      }).catch(err => console.error('[SOLICITACOES] notify cancelar:', err.message));
      return res.json(data);
    }

    const update = {
      status: 'aguardando_ajuste',
      status_antes_ajuste: sol.status,
      sla_pausado_em: new Date().toISOString(),
      vezes_refeita: (sol.vezes_refeita || 0) + 1,
    };
    const { data, error } = await supabase.from('solicitacoes')
      .update(update).eq('id', sol.id).select('*').single();
    if (error) throw error;

    const MOTIVO_LABEL = { descricao: 'descrição', escopo: 'escopo', data: 'data' };
    if (lado === 'responsavel') {
      notificar({
        modulo, tipo: 'solicitacao_status',
        titulo: `Sua solicitação voltou para ajuste: ${sol.titulo}`,
        mensagem: `${userName || 'A área'} pediu ajuste em ${MOTIVO_LABEL[motivo]}${comentario ? `: ${comentario}` : ''}. Edite e reenvie.`,
        link: '/solicitacoes', severidade: 'alta',
        chaveDedup: `solicitacao_devolvida_${sol.id}_${new Date(update.sla_pausado_em).getTime()}`,
        targetIds: [sol.solicitante_id].filter(Boolean),
      }).catch(err => console.error('[SOLICITACOES] notify devolucao:', err.message));
    } else {
      notificar({
        modulo, tipo: 'solicitacao_status',
        titulo: `Solicitante vai ajustar: ${sol.titulo}`,
        mensagem: `${userName || 'O solicitante'} sinalizou ajuste em ${MOTIVO_LABEL[motivo]}${comentario ? `: ${comentario}` : ''}. O SLA fica pausado até o reenvio.`,
        link: '/solicitacoes', severidade: 'info',
        chaveDedup: `solicitacao_ajuste_solic_${sol.id}_${new Date(update.sla_pausado_em).getTime()}`,
      }).catch(err => console.error('[SOLICITACOES] notify ajuste:', err.message));
    }
    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] relatar-problema:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /:id/reenviar · solicitante edita (opcional) e reenvia uma solicitação
// que estava em aguardando_ajuste. Restaura o status anterior e RETOMA o SLA
// (empurra os deadlines pelo tempo parado · a área não é penalizada).
router.post('/:id/reenviar', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { titulo, descricao, justificativa, data_necessaria } = req.body || {};
    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('id, solicitante_id, status, status_antes_ajuste, sla_pausado_em, sla_resposta_deadline, sla_resolucao_deadline, categoria, titulo, area_responsavel')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    const isAdmin = ['admin', 'diretor'].includes(req.user.role);
    if (sol.solicitante_id !== userId && !isAdmin) {
      return res.status(403).json({ error: 'Só o solicitante pode reenviar.' });
    }
    if (sol.status !== 'aguardando_ajuste') {
      return res.status(400).json({ error: 'Solicitação não está aguardando ajuste.' });
    }

    const update = {
      status: sol.status_antes_ajuste || 'pendente',
      status_antes_ajuste: null,
      sla_pausado_em: null,
    };
    if (titulo !== undefined) update.titulo = titulo;
    if (descricao !== undefined) update.descricao = descricao;
    if (justificativa !== undefined) update.justificativa = justificativa;
    if (data_necessaria !== undefined) update.data_necessaria = data_necessaria || null;

    // Retoma o SLA · empurra os prazos pelo tempo pausado
    if (sol.sla_pausado_em) {
      const pausaMs = Date.now() - new Date(sol.sla_pausado_em).getTime();
      if (pausaMs > 0) {
        if (sol.sla_resposta_deadline) update.sla_resposta_deadline = new Date(new Date(sol.sla_resposta_deadline).getTime() + pausaMs).toISOString();
        if (sol.sla_resolucao_deadline) update.sla_resolucao_deadline = new Date(new Date(sol.sla_resolucao_deadline).getTime() + pausaMs).toISOString();
      }
    }

    const { data, error } = await supabase.from('solicitacoes')
      .update(update).eq('id', sol.id).select('*').single();
    if (error) throw error;

    const modulo = CATEGORIA_MODULO[sol.categoria] || 'administrativo';
    resolverDestinatarios(modulo).then(managers => {
      if (managers.length) {
        notificar({
          modulo, tipo: 'solicitacao_status',
          titulo: `Reenviada: ${data.titulo}`,
          mensagem: `O solicitante ajustou e reenviou · voltou pra fila ${data.area_responsavel || ''}.`,
          link: '/solicitacoes', severidade: 'info',
          chaveDedup: `solicitacao_reenviada_${sol.id}_${Date.now()}`,
          targetIds: managers,
        }).catch(err => console.error('[SOLICITACOES] notify reenviar:', err.message));
      }
    }).catch(err => console.error('[SOLICITACOES] resolve managers reenviar:', err.message));

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] reenviar:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── SLA definitions (catalogo de prazos) ───────────────────────
router.get('/sla-defs', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('sla_definicoes')
      .select('*')
      .eq('ativo', true)
      .order('area_responsavel')
      .order('subcategoria')
      .order('eh_urgente');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Reserva de espacos · calendário ────────────────────────────
router.get('/reservas-espaco', async (req, res) => {
  try {
    const { desde, ate } = req.query;
    let q = supabase.from('vw_reserva_espacos').select('*');
    if (desde) q = q.gte('data_uso', desde);
    if (ate) q = q.lte('data_uso', ate);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Área alcadas (limites de aprovação financeira) ─────────────
router.get('/alcadas', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('area_alcadas')
      .select('*')
      .order('area_cliente');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Responsáveis por área de solicitação (admin/diretor) ────────────────────
// GET lista todos · agrupa por área com nomes dos responsáveis
router.get('/area-responsaveis', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('area_solicitacoes_responsaveis')
      .select('id, area, profile_id, criado_em')
      .order('area');
    if (error) throw error;

    const profileIds = [...new Set((data || []).map(r => r.profile_id))];
    let profileMap = {};
    if (profileIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, nome_completo, email')
        .in('id', profileIds);
      profileMap = Object.fromEntries((profs || []).map(p => [p.id, p]));
    }

    const enriched = (data || []).map(r => ({
      ...r,
      profile: profileMap[r.profile_id] || null,
    }));
    res.json(enriched);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT substitui responsáveis de uma área · body: { área, profile_ids: [] }
// Apaga vinculos atuais da área e insere os novos
router.put('/area-responsaveis', async (req, res) => {
  if (!['admin', 'diretor'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Apenas admin/diretor podem configurar responsaveis' });
  }
  try {
    const { area, profile_ids } = req.body || {};
    if (!area) return res.status(400).json({ error: 'area obrigatoria' });
    if (!Array.isArray(profile_ids)) return res.status(400).json({ error: 'profile_ids deve ser array' });

    // Apaga vinculos existentes da área
    const { error: delError } = await supabase
      .from('area_solicitacoes_responsaveis')
      .delete()
      .eq('area', area);
    if (delError) throw delError;

    // Insere novos
    if (profile_ids.length > 0) {
      const rows = profile_ids.map(pid => ({
        area,
        profile_id: pid,
        criado_por: req.user.userId,
      }));
      const { error: insError } = await supabase
        .from('area_solicitacoes_responsaveis')
        .insert(rows);
      if (insError) throw insError;
    }

    res.json({ ok: true, area, count: profile_ids.length });
  } catch (e) {
    console.error('[SOLICITACOES] area-responsaveis PUT:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// VINCULO COM PEDIDO DO MERCADO LIVRE
// ─────────────────────────────────────────────────────────────────────────

// POST /api/solicitacoes/:id/vincular-ml
// Body: { ml_input } · URL ou ID do pedido do Mercado Livre
// Apenas o solicitante, responsável ou admin/diretor podem vincular.
router.post('/:id/vincular-ml', async (req, res) => {
  try {
    const userId = req.user.userId;
    const role = req.user.role;
    const { ml_input } = req.body || {};
    if (!ml_input) {
      return res.status(400).json({ error: 'Cole a URL ou o número do pedido do Mercado Livre.' });
    }

    // Permissão: solicitante, responsável, admin/diretor, ou responsável da area_responsavel
    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('id, solicitante_id, responsavel_id, area_responsavel, categoria')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada' });

    const isAdmin = ['admin', 'diretor'].includes(role);
    const isMine = sol.solicitante_id === userId || sol.responsavel_id === userId;
    let isAreaResp = false;
    if (!isAdmin && !isMine && sol.area_responsavel) {
      const { data: respRow } = await supabase
        .from('area_solicitacoes_responsaveis')
        .select('profile_id')
        .eq('area', sol.area_responsavel)
        .eq('profile_id', userId)
        .maybeSingle();
      isAreaResp = !!respRow;
    }
    if (!isAdmin && !isMine && !isAreaResp) {
      return res.status(403).json({ error: 'Sem permissão para vincular o pedido.' });
    }

    const result = await mlTracker.linkOrder({
      solicitacaoId: req.params.id,
      mlOrderInput: ml_input,
      profileId: userId,
    });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (e) {
    console.error('[SOLICITACOES] vincular-ml error:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao vincular pedido.' });
  }
});

// DELETE /api/solicitacoes/:id/vincular-ml · remove o vinculo (so admin/responsavel)
router.delete('/:id/vincular-ml', async (req, res) => {
  try {
    const userId = req.user.userId;
    const role = req.user.role;
    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('id, solicitante_id, responsavel_id, ml_linked_by')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada' });

    const isAdmin = ['admin', 'diretor'].includes(role);
    const podeRemover = isAdmin
      || sol.ml_linked_by === userId
      || sol.responsavel_id === userId;
    if (!podeRemover) {
      return res.status(403).json({ error: 'Sem permissão para desvincular.' });
    }

    await supabase
      .from('solicitacoes')
      .update({
        ml_order_id: null,
        ml_shipment_id: null,
        ml_tracking_number: null,
        ml_tracking_url: null,
        ml_item_title: null,
        ml_total_amount: null,
        ml_last_status: null,
        ml_last_status_changed_at: null,
        ml_last_checked_at: null,
        ml_linked_at: null,
        ml_linked_by: null,
        ml_estimated_delivery: null,
      })
      .eq('id', req.params.id);

    res.json({ ok: true });
  } catch (e) {
    console.error('[SOLICITACOES] unvincular-ml error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/solicitacoes/:id/ml-timeline · histórico de eventos do tracking
router.get('/:id/ml-timeline', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('solicitacao_ml_eventos')
      .select('*')
      .eq('solicitacao_id', req.params.id)
      .order('ocorrido_em', { ascending: true });
    if (error) throw error;
    res.json({
      eventos: data || [],
      statusLabels: mlTracker.STATUS_LABELS,
    });
  } catch (e) {
    console.error('[SOLICITACOES] ml-timeline error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/solicitacoes/:id/atualizar-ml · forca refresh manual (admin/diretor)
router.post('/:id/atualizar-ml', async (req, res) => {
  try {
    const role = req.user.role;
    const userId = req.user.userId;
    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('id, solicitante_id, responsavel_id, ml_shipment_id')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (!sol.ml_shipment_id) return res.status(400).json({ error: 'Solicitação sem pedido ML vinculado.' });

    const isAdmin = ['admin', 'diretor'].includes(role);
    const isMine = sol.solicitante_id === userId || sol.responsavel_id === userId;
    if (!isAdmin && !isMine) return res.status(403).json({ error: 'Sem permissão.' });

    // Reusa linkOrder com o order_id já salvo (re-fetcha tudo)
    const { data: full } = await supabase
      .from('solicitacoes')
      .select('ml_order_id')
      .eq('id', req.params.id)
      .single();

    const result = await mlTracker.linkOrder({
      solicitacaoId: req.params.id,
      mlOrderInput: full.ml_order_id,
      profileId: userId,
    });
    res.json(result);
  } catch (e) {
    console.error('[SOLICITACOES] atualizar-ml error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// APROVAÇÃO FINANCEIRA · Yago aprova compras/reembolsos antes de virar pra
// logística comprar / financeiro pagar
// ══════════════════════════════════════════════════════════════════════════

async function podeAprovarFinanceiro(req) {
  const userId = req.user.userId;
  const role = req.user.role;
  if (['admin', 'diretor'].includes(role)) return true;
  const modulePerms = req.user.granular?.modulePerms || {};
  const fin = modulePerms.financeiro || modulePerms.Financeiro;
  if (fin && (fin.leitura >= 3 || fin.escrita >= 3)) return true;
  const { data } = await supabase
    .from('area_solicitacoes_responsaveis')
    .select('profile_id')
    .eq('area', 'financeiro')
    .eq('profile_id', userId)
    .maybeSingle();
  return !!data;
}

router.get('/pendentes-financeiro', async (req, res) => {
  try {
    if (!(await podeAprovarFinanceiro(req))) {
      return res.status(403).json({ error: 'Sem permissão pra ver pendências financeiras' });
    }
    const { data, error } = await supabase
      .from('solicitacoes')
      .select('*')
      .eq('precisa_aprovacao_financeira', true)
      .is('aprovado_financeiro_em', null)
      .neq('status', 'cancelado')
      .neq('status', 'rejeitado')
      // Ainda aguardando o diretor de origem · so cai no financeiro depois (Spec 001)
      .neq('status', 'aguardando_aprovacao_origem')
      // Compras/servico em cotacao · o Yago so ve depois que a logistica cotar (valor real)
      .neq('status', 'em_cotacao')
      .is('deleted_at', null)
      .order('eh_urgente', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) throw error;

    // Enriquece com nome/email/foto do solicitante (consulta separada em profiles
    // pra evitar JOIN PostgREST que tem comportamento erratico).
    const ids = [...new Set((data || []).map(s => s.solicitante_id).filter(Boolean))];
    let byId = {};
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from('profiles').select('id, name, email, avatar_url').in('id', ids);
      byId = Object.fromEntries((profs || []).map(p => [p.id, p]));
    }
    const enriched = (data || []).map(s => ({
      ...s,
      solicitante_nome: byId[s.solicitante_id]?.name || null,
      solicitante_email: byId[s.solicitante_id]?.email || null,
      solicitante_avatar: byId[s.solicitante_id]?.avatar_url || null,
    }));

    res.json(enriched);
  } catch (e) {
    console.error('[SOLICITACOES] pendentes-financeiro:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/aprovar-financeiro', async (req, res) => {
  try {
    if (!(await podeAprovarFinanceiro(req))) {
      return res.status(403).json({ error: 'Apenas financeiro pode aprovar' });
    }
    const { observacao } = req.body || {};
    const { data: atual } = await supabase
      .from('solicitacoes').select('*').eq('id', req.params.id).single();
    if (!atual) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (atual.aprovado_financeiro_em) {
      return res.status(400).json({ error: 'Já foi aprovada' });
    }

    // Pra onde vai depois do OK do Yago:
    //   compras/servico  -> logistica_compras (Amaury compra/contrata) · status pendente
    //   reembolso/pagto  -> financeiro (paga) · status em_atendimento
    const mapaCat = {
      compras: 'logistica_compras', servico: 'logistica_compras',
      reembolso: 'financeiro',      pagamento: 'financeiro',
    };
    const novaAreaResp = mapaCat[atual.categoria] || atual.area_responsavel;
    const novoStatus = ['reembolso', 'pagamento'].includes(atual.categoria) ? 'em_atendimento' : 'pendente';

    const updates = {
      aprovado_financeiro_em: new Date().toISOString(),
      aprovado_financeiro_por: req.user.userId,
      area_responsavel: novaAreaResp,
      status: novoStatus,
    };
    if (observacao) {
      updates.observacoes = atual.observacoes
        ? `${atual.observacoes}\n[Aprovação financeira] ${observacao}`
        : `[Aprovação financeira] ${observacao}`;
    }

    const { data, error } = await supabase
      .from('solicitacoes').update(updates).eq('id', req.params.id).select('*').single();
    if (error) throw error;

    const acaoMsg = {
      compras:   'enviado pra logística comprar',
      servico:   'enviado pra logística contratar o serviço',
      reembolso: 'pode efetuar o reembolso',
      pagamento: 'pode efetuar o pagamento',
    }[atual.categoria] || 'liberado pra atendimento';
    notificar({
      modulo: CATEGORIA_MODULO[atual.categoria] || 'financeiro',
      tipo: 'solicitacao_status',
      titulo: `Solicitação aprovada: ${atual.titulo}`,
      mensagem: `Yago aprovou financeiramente · ${acaoMsg}`,
      link: '/solicitacoes',
      severidade: 'info',
      chaveDedup: `solicitacao_aprovada_fin_${data.id}`,
      extraTargetIds: [atual.solicitante_id].filter(Boolean),
    }).catch(err => console.error('[SOLICITACOES] notify:', err.message));

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] aprovar-financeiro:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/:id/reprovar-financeiro', async (req, res) => {
  try {
    if (!(await podeAprovarFinanceiro(req))) {
      return res.status(403).json({ error: 'Apenas financeiro pode reprovar' });
    }
    const { motivo } = req.body || {};
    if (!motivo) return res.status(400).json({ error: 'Motivo da reprovação é obrigatório' });

    const { data: atual } = await supabase
      .from('solicitacoes').select('*').eq('id', req.params.id).single();
    if (!atual) return res.status(404).json({ error: 'Solicitação não encontrada' });

    const updates = {
      status: 'rejeitado',
      aprovado_financeiro_em: new Date().toISOString(),
      aprovado_financeiro_por: req.user.userId,
      observacoes: atual.observacoes
        ? `${atual.observacoes}\n[REPROVADO pelo financeiro] ${motivo}`
        : `[REPROVADO pelo financeiro] ${motivo}`,
    };

    const { data, error } = await supabase
      .from('solicitacoes').update(updates).eq('id', req.params.id).select('*').single();
    if (error) throw error;

    notificar({
      modulo: 'financeiro',
      tipo: 'solicitacao_status',
      titulo: `Solicitação reprovada: ${atual.titulo}`,
      mensagem: `Financeiro reprovou · ${motivo}`,
      link: '/solicitacoes',
      severidade: 'alta',
      chaveDedup: `solicitacao_reprovada_fin_${data.id}`,
      extraTargetIds: [atual.solicitante_id].filter(Boolean),
    }).catch(err => console.error('[SOLICITACOES] notify:', err.message));

    res.json(data);
  } catch (e) {
    console.error('[SOLICITACOES] reprovar-financeiro:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Dashboard urgência frequente · top solicitantes urgentes últimos 90d
router.get('/dashboard/urgencia-frequente', async (req, res) => {
  try {
    const role = req.user.role;
    if (!['admin', 'diretor'].includes(role)) {
      const modulePerms = req.user.granular?.modulePerms || {};
      const fin = modulePerms.financeiro || modulePerms.Financeiro;
      if (!(fin && fin.leitura >= 3)) {
        return res.status(403).json({ error: 'Sem permissão' });
      }
    }
    const desde = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data, error } = await supabase
      .from('solicitacoes')
      .select('solicitante_id, eh_urgente')
      .gte('created_at', desde)
      .is('deleted_at', null);
    if (error) throw error;

    const agg = new Map();
    (data || []).forEach(s => {
      const id = s.solicitante_id;
      if (!id) return;
      if (!agg.has(id)) agg.set(id, { solicitante_id: id, total: 0, urgentes: 0 });
      const a = agg.get(id);
      a.total++;
      if (s.eh_urgente) a.urgentes++;
    });

    const lista = [...agg.values()]
      .filter(a => a.urgentes >= 2)
      .map(a => ({ ...a, taxa: a.total > 0 ? (a.urgentes / a.total) : 0 }))
      .sort((a, b) => b.urgentes - a.urgentes)
      .slice(0, 20);

    if (lista.length > 0) {
      const ids = lista.map(x => x.solicitante_id);
      const { data: profs } = await supabase
        .from('profiles').select('id, name, email').in('id', ids);
      const byId = Object.fromEntries((profs || []).map(p => [p.id, p]));
      lista.forEach(x => {
        const p = byId[x.solicitante_id];
        x.nome = p?.name || '—';
        x.email = p?.email || null;
      });
    }

    res.json(lista);
  } catch (e) {
    console.error('[SOLICITACOES] urgencia-frequente:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /dashboard/refeitas?dias=90 · termômetro "pedimos bem?" (NÃO punitivo · Fase 1)
// % das solicitações do período que precisaram de ajuste (refação pelo solicitante)
// + nº de devoluções (a área pediu clareza). Gestão (admin/diretor) ou responsável.
router.get('/dashboard/refeitas', async (req, res) => {
  try {
    const role = req.user.role;
    if (!['admin', 'diretor'].includes(role)) {
      const { data: rr } = await supabase
        .from('area_solicitacoes_responsaveis')
        .select('area').eq('profile_id', req.user.userId).limit(1);
      if (!rr || !rr.length) return res.status(403).json({ error: 'Sem permissão' });
    }
    const dias = Math.min(Math.max(parseInt(req.query.dias, 10) || 90, 7), 365);
    const desde = new Date(Date.now() - dias * 86400000).toISOString();

    const [{ count: totalPeriodo }, { data: ajustes }] = await Promise.all([
      supabase.from('solicitacoes').select('id', { count: 'exact', head: true })
        .gte('created_at', desde).is('deleted_at', null),
      supabase.from('solicitacao_ajustes').select('solicitacao_id, lado, motivo')
        .gte('created_at', desde),
    ]);

    const refeitasSet = new Set();
    const devolucoesSet = new Set();
    const porMotivo = { descricao: 0, escopo: 0, data: 0, cancelamento: 0 };
    (ajustes || []).forEach(a => {
      porMotivo[a.motivo] = (porMotivo[a.motivo] || 0) + 1;
      if (a.motivo === 'cancelamento') return;
      if (a.lado === 'solicitante') refeitasSet.add(a.solicitacao_id);
      else if (a.lado === 'responsavel') devolucoesSet.add(a.solicitacao_id);
    });

    const total = totalPeriodo || 0;
    const refeitas = refeitasSet.size;
    res.json({
      dias,
      total_periodo: total,
      refeitas,
      devolucoes: devolucoesSet.size,
      pct_refeitas: total > 0 ? Math.round((refeitas / total) * 1000) / 10 : 0,
      por_motivo: porMotivo,
    });
  } catch (e) {
    console.error('[SOLICITACOES] dashboard-refeitas:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── PONTE ESTOQUE (Fase 3a-2) · atender uma solicitação dando baixa no estoque ──
// O Amaury (responsável da logística) vê o pedido na fila e, se já temos o item
// aqui, "atende pela estoque": baixa o(s) produto(s) + resolve a solicitação.
// (A outra saída — comprar — segue pelo fluxo de compras que já existe.)

// GET /estoque/produtos · picker do catálogo (com saldo) pra montar a baixa
router.get('/estoque/produtos', async (req, res) => {
  try {
    const busca = (req.query.busca || '').toString().replace(/[,()*:%]/g, ' ').trim();
    let q = supabase.from('vw_log_estoque_saldo').select('id,nome,categoria,unidade,saldo')
      .eq('ativo', true).order('nome').limit(1000);
    if (busca) q = q.ilike('nome', `%${busca}%`);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /:id/atender-estoque · body { itens:[{produto_id, quantidade}], observacao? }
router.post('/:id/atender-estoque', async (req, res) => {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;
    const { itens, observacao } = req.body || {};
    if (!Array.isArray(itens) || !itens.length) return res.status(400).json({ error: 'Informe ao menos um item.' });

    const { data: sol } = await supabase.from('solicitacoes')
      .select('id, solicitante_id, responsavel_id, area_responsavel, area_cliente, categoria, titulo, status, observacoes')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitação não encontrada.' });

    // permissão · admin/diretor, responsável direto, ou responsável da área
    const isAdm = ['admin', 'diretor'].includes(req.user.role);
    const isResp = sol.responsavel_id === userId;
    let isAreaResp = false;
    if (!isAdm && !isResp && sol.area_responsavel) {
      const { data: rr } = await supabase.from('area_solicitacoes_responsaveis')
        .select('profile_id').eq('area', sol.area_responsavel).eq('profile_id', userId).maybeSingle();
      isAreaResp = !!rr;
    }
    if (!isAdm && !isResp && !isAreaResp) return res.status(403).json({ error: 'Sem permissão.' });
    if (['concluido', 'cancelado', 'rejeitado', 'avaliado'].includes(sol.status)) {
      return res.status(400).json({ error: 'Solicitação já encerrada.' });
    }

    const rows = [];
    for (const it of itens) {
      const qtd = Number(it.quantidade);
      if (!it.produto_id || !qtd || qtd <= 0) return res.status(400).json({ error: 'Item inválido (produto + quantidade > 0).' });
      rows.push({
        produto_id: it.produto_id, tipo: 'saida', quantidade: qtd,
        data_movimentacao: new Date().toISOString().slice(0, 10),
        area_destino: sol.area_cliente || null,
        motivo: `Atende solicitação: ${sol.titulo}`,
        origem_solicitacao_id: sol.id, feito_por: userId,
      });
    }
    const { error: movErr } = await supabase.from('log_estoque_movimentacoes').insert(rows);
    if (movErr) return res.status(400).json({ error: 'Erro ao baixar do estoque: ' + movErr.message });

    const obs = `${sol.observacoes ? sol.observacoes + '\n' : ''}Atendido pela estoque por ${userName || 'logística'}${observacao ? ` · ${observacao}` : ''}.`;
    const { data, error } = await supabase.from('solicitacoes')
      .update({ status: 'concluido', observacoes: obs }).eq('id', sol.id).select('*').single();
    if (error) return res.status(400).json({ error: error.message });

    notificar({
      modulo: CATEGORIA_MODULO[sol.categoria] || 'logistica',
      tipo: 'solicitacao_status',
      titulo: `Atendida pela estoque: ${sol.titulo}`,
      mensagem: `${userName || 'A logística'} atendeu sua solicitação com itens que já tínhamos no estoque.`,
      link: '/solicitacoes', severidade: 'info',
      chaveDedup: `solicitacao_atendida_estoque_${sol.id}`,
      targetIds: [sol.solicitante_id].filter(Boolean),
    }).catch(err => console.error('[SOLICITACOES] notify atender-estoque:', err.message));

    res.json(data);
  } catch (e) { console.error('[SOLICITACOES] atender-estoque:', e.message); res.status(500).json({ error: e.message }); }
});

module.exports = router;
