const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar, resolverDestinatarios } = require('../services/notificar');
const painelCache = require('../services/painelCache');
const mlTracker = require('../services/solicitacoesMlTracker');

const CRON_SECRET = process.env.CRON_SECRET;

// ── CRON · ATUALIZAR STATUS DE PEDIDOS ML VINCULADOS ───────────────────
// Montado ANTES do authenticate · usa CRON_SECRET ou x-vercel-cron header.
router.post('/cron/atualizar-ml', async (req, res) => {
  const auth = req.headers['x-cron-secret'] || req.headers['authorization'];
  const isVercelCron = req.headers['user-agent']?.includes('vercel-cron');
  if (!isVercelCron && auth !== CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
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

// Bust do cache do painel apos mutacao (afeta matriz adm/criativo)
router.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) painelCache.bust('');
    });
  }
  next();
});

const ALLOWED_CATEGORIES = ['ti', 'compras', 'reembolso', 'reserva_espaco', 'espaco', 'infraestrutura', 'ferias', 'licenca', 'marketing', 'outro'];

// Map categoria → notification module
const CATEGORIA_MODULO = {
  ti: 'ti',
  compras: 'logistica',
  reembolso: 'financeiro',
  reserva_espaco: 'administrativo',
  espaco: 'administrativo', // legado
  infraestrutura: 'administrativo',
  ferias: 'rh',
  licenca: 'rh',
  marketing: 'marketing',
  outro: 'administrativo',
};

// Map categoria → area_responsavel + subcategoria (Fase A backbone)
const CATEGORIA_TO_AREA_RESP = {
  ti:              { area: 'ti',                subcategoria: 'default' },
  compras:         { area: 'logistica_compras', subcategoria: 'default' },
  reembolso:       { area: 'financeiro',        subcategoria: 'reembolso' },
  reserva_espaco:  { area: 'reserva_espaco',    subcategoria: 'default' },
  espaco:          { area: 'reserva_espaco',    subcategoria: 'default' },
  infraestrutura:  { area: 'manutencao',        subcategoria: 'default' },
  ferias:          { area: 'rh',                subcategoria: 'ferias' },
  licenca:         { area: 'rh',                subcategoria: 'licenca' },
  marketing:       { area: 'marketing',         subcategoria: 'default' },
  outro:           { area: null,                subcategoria: 'default' },
};

// Map módulo → categorias (for granular permission filtering)
const MODULO_CATEGORIAS = {
  ti: ['ti'],
  logistica: ['compras'],
  financeiro: ['reembolso'],
  administrativo: ['espaco', 'reserva_espaco', 'infraestrutura', 'outro'],
  rh: ['ferias', 'licenca'],
  marketing: ['marketing'],
};

// Map modulePerms key → backend modulo
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

// ── LIST (filtered by role) ─────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const role = req.user.role;
    const granular = req.user.granular;

    const { categoria, status, mine } = req.query;
    let q = supabase
      .from('solicitacoes')
      .select('*')
      .order('created_at', { ascending: false });

    if (categoria) q = q.eq('categoria', categoria);
    if (status) q = q.eq('status', status);

    if (mine === 'true') {
      q = q.eq('solicitante_id', userId);
    } else if (['admin', 'diretor'].includes(role)) {
      // Admin/diretor sees all — no filter
    } else {
      // Areas onde o user eh responsavel cadastrado em area_solicitacoes_responsaveis
      const { data: respRows } = await supabase
        .from('area_solicitacoes_responsaveis')
        .select('area')
        .eq('profile_id', userId);
      const responsavelAreas = new Set((respRows || []).map(r => r.area));

      const modulePerms = granular?.modulePerms || {};
      const allowedCategories = new Set();

      for (const [permKey, modulo] of Object.entries(PERM_TO_MODULO)) {
        if (modulePerms[permKey] && modulePerms[permKey].leitura >= 2) {
          const cats = MODULO_CATEGORIAS[modulo] || [];
          cats.forEach(c => allowedCategories.add(c));
        }
      }

      // Monta filtro OR · sempre ve as proprias + categorias permitidas via
      // permissoes + areas onde eh responsavel cadastrado
      const orParts = [`solicitante_id.eq.${encodeURIComponent(userId)}`];
      if (allowedCategories.size > 0) {
        orParts.push(`categoria.in.(${[...allowedCategories].join(',')})`);
      }
      if (responsavelAreas.size > 0) {
        orParts.push(`area_responsavel.in.(${[...responsavelAreas].join(',')})`);
      }
      q = q.or(orParts.join(','));
    }

    const { data, error } = await q;
    if (error) throw error;

    // Resolve profile names for solicitante/responsavel
    const profileIds = [...new Set((data || []).flatMap(d => [d.solicitante_id, d.responsavel_id].filter(Boolean)))];
    let profileMap = {};
    if (profileIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('id,name,email').in('id', profileIds);
      if (profiles) profileMap = Object.fromEntries(profiles.map(p => [p.id, p]));
    }
    const enriched = (data || []).map(d => ({
      ...d,
      solicitante: profileMap[d.solicitante_id] || null,
      responsavel: profileMap[d.responsavel_id] || null,
    }));

    res.json(enriched);
  } catch (e) {
    console.error('[SOLICITACOES] list error:', e.message);
    res.status(500).json({ error: 'Erro ao listar solicitações' });
  }
});

// ── CREATE ──────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const userName = req.user.name;

    const { titulo, descricao, justificativa, categoria, urgencia, valor_estimado, area_solicitante,
            // Fase A backbone
            area_cliente, area_responsavel, subcategoria, eh_urgente, justificativa_urgencia,
            data_necessaria, espaco_solicitado, data_uso, horario_inicio, horario_fim, qtde_pessoas,
            // Reembolso
            motivo_reembolso, data_compra,
            forma_pagamento, chave_pix, banco, agencia, conta, documento_url } = req.body;
    if (!titulo || !categoria) return res.status(400).json({ error: 'Título e categoria são obrigatórios' });
    if (!ALLOWED_CATEGORIES.includes(categoria)) {
      return res.status(400).json({ error: `Categoria inválida: "${categoria}". Permitidas: ${ALLOWED_CATEGORIES.join(', ')}` });
    }

    // Auto-mapeia area_responsavel + subcategoria
    const mapa = CATEGORIA_TO_AREA_RESP[categoria] || { area: null, subcategoria: 'default' };
    const finalAreaResp = area_responsavel || mapa.area;
    const finalSub = subcategoria || mapa.subcategoria;

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
        // Campos novos · trigger calcula SLA e precisa_aprovacao_financeira
        area_cliente: area_cliente || null,
        area_responsavel: finalAreaResp,
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
      })
      .select('*')
      .single();
    if (error) throw error;

    // Auto-vincula responsavel_id se houver uma unica pessoa cadastrada para
    // a area · se houver mais, deixa nulo (qualquer um da fila pode pegar)
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

    // Notify responsible people · alem das regras do modulo, sempre notifica
    // os responsaveis cadastrados pra area (Pedro Paiva pra marketing, etc)
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

    res.status(201).json(data);
  } catch (e) {
    console.error('[SOLICITACOES] create error:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao criar solicitação' });
  }
});

// ── UPDATE (status, responsavel, observacoes) ───────────────
router.patch('/:id', async (req, res) => {
  try {
    const userName = req.user.name;

    const { status, responsavel_id, observacoes,
            // Fase A · novos campos editaveis
            proposta_orcamento, proposta_cronograma,
            nps_nota, nps_comentario,
            aprovado_financeiro_em } = req.body;
    const update = {};
    if (status) update.status = status;
    if (responsavel_id !== undefined) update.responsavel_id = responsavel_id;
    if (observacoes !== undefined) update.observacoes = observacoes;
    if (proposta_orcamento !== undefined) update.proposta_orcamento = proposta_orcamento;
    if (proposta_cronograma !== undefined) update.proposta_cronograma = proposta_cronograma;
    if (nps_nota !== undefined) update.nps_nota = nps_nota;
    if (nps_comentario !== undefined) update.nps_comentario = nps_comentario;
    if (aprovado_financeiro_em !== undefined) {
      update.aprovado_financeiro_em = aprovado_financeiro_em;
      update.aprovado_financeiro_por = req.user.userId;
    }

    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nada para atualizar' });

    const { data, error } = await supabase
      .from('solicitacoes')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;

    // Notify solicitante + area managers about status change
    if (status && data) {
      const modulo = CATEGORIA_MODULO[data.categoria] || 'administrativo';
      const statusLabel = status.replace('_', ' ');
      const obsNote = observacoes ? ` — "${observacoes}"` : '';

      // Conclusao · pede avaliacao NPS pro solicitante (alimenta KPIs ADM-*-Q)
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

      // 2. Notify area managers (excluding the requester to avoid duplicate)
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

// ── Reserva de espacos · calendario ────────────────────────────
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

// ── Area alcadas (limites de aprovacao financeira) ─────────────
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

// ── Responsaveis por area de solicitacao (admin/diretor) ────────────────────
// GET lista todos · agrupa por area com nomes dos responsaveis
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

// PUT substitui responsaveis de uma area · body: { area, profile_ids: [] }
// Apaga vinculos atuais da area e insere os novos
router.put('/area-responsaveis', async (req, res) => {
  if (!['admin', 'diretor'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Apenas admin/diretor podem configurar responsaveis' });
  }
  try {
    const { area, profile_ids } = req.body || {};
    if (!area) return res.status(400).json({ error: 'area obrigatoria' });
    if (!Array.isArray(profile_ids)) return res.status(400).json({ error: 'profile_ids deve ser array' });

    // Apaga vinculos existentes da area
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
// Apenas o solicitante, responsavel ou admin/diretor podem vincular.
router.post('/:id/vincular-ml', async (req, res) => {
  try {
    const userId = req.user.userId;
    const role = req.user.role;
    const { ml_input } = req.body || {};
    if (!ml_input) {
      return res.status(400).json({ error: 'Cole a URL ou o numero do pedido do Mercado Livre.' });
    }

    // Permissao: solicitante, responsavel, admin/diretor, ou responsavel da area_responsavel
    const { data: sol } = await supabase
      .from('solicitacoes')
      .select('id, solicitante_id, responsavel_id, area_responsavel, categoria')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!sol) return res.status(404).json({ error: 'Solicitacao nao encontrada' });

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
      return res.status(403).json({ error: 'Sem permissao para vincular o pedido.' });
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
    if (!sol) return res.status(404).json({ error: 'Solicitacao nao encontrada' });

    const isAdmin = ['admin', 'diretor'].includes(role);
    const podeRemover = isAdmin
      || sol.ml_linked_by === userId
      || sol.responsavel_id === userId;
    if (!podeRemover) {
      return res.status(403).json({ error: 'Sem permissao para desvincular.' });
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

// GET /api/solicitacoes/:id/ml-timeline · historico de eventos do tracking
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
    if (!sol) return res.status(404).json({ error: 'Solicitacao nao encontrada' });
    if (!sol.ml_shipment_id) return res.status(400).json({ error: 'Solicitacao sem pedido ML vinculado.' });

    const isAdmin = ['admin', 'diretor'].includes(role);
    const isMine = sol.solicitante_id === userId || sol.responsavel_id === userId;
    if (!isAdmin && !isMine) return res.status(403).json({ error: 'Sem permissao.' });

    // Reusa linkOrder com o order_id ja salvo (re-fetcha tudo)
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
// APROVACAO FINANCEIRA · Yago aprova compras/reembolsos antes de virar pra
// logistica comprar / financeiro pagar
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
      .is('deleted_at', null)
      .order('eh_urgente', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data || []);
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

    const mapaCat = { compras: 'logistica_compras', reembolso: 'financeiro' };
    const novaAreaResp = mapaCat[atual.categoria] || atual.area_responsavel;
    const novoStatus = atual.categoria === 'reembolso' ? 'em_atendimento' : 'pendente';

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

    notificar({
      modulo: atual.categoria === 'compras' ? 'logistica' : 'financeiro',
      tipo: 'solicitacao_status',
      titulo: `Solicitação aprovada: ${atual.titulo}`,
      mensagem: `Yago aprovou financeiramente · ${atual.categoria === 'compras' ? 'enviado pra logística comprar' : 'pode efetuar o reembolso'}`,
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

// Dashboard urgencia frequente · top solicitantes urgentes ultimos 90d
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

module.exports = router;
