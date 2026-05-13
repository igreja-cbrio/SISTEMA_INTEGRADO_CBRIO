const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const npsService = require('../services/npsService');

const TIPOS_KPI_VALIDOS = ['nps_geral', 'nps_next', 'nps_lideres', 'nps_voluntarios', 'nps_culto'];

// Rate limit para chamadas de IA (geração/análise) — caro em tokens.
const iaLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de chamadas à IA atingido. Tente novamente em 1h.' },
  skip: (req) => req.user?.role === 'admin',
});

router.use(authenticate);

// ────────────────────────────────────────────────────────────────────
// Geração de perguntas (preview antes de criar)
// POST /api/nps/gerar-perguntas
// ────────────────────────────────────────────────────────────────────
router.post('/gerar-perguntas', authorize('admin', 'diretor'), iaLimiter, async (req, res) => {
  try {
    const { valor, objetivo, contexto_kpi, area } = req.body || {};
    if (!objetivo) {
      return res.status(400).json({ error: 'objetivo é obrigatório' });
    }
    const areaInformada = area && String(area).toLowerCase() !== 'geral' ? area : null;
    if (!valor && !areaInformada) {
      return res.status(400).json({ error: 'Defina um escopo: um valor da CBRio ou uma área específica.' });
    }
    const contextoKpi = TIPOS_KPI_VALIDOS.includes(contexto_kpi) ? contexto_kpi : 'nps_geral';
    const result = await npsService.gerarPerguntas({ valor: valor || null, objetivo, contextoKpi, area });
    res.json(result);
  } catch (e) {
    console.error('[nps] gerar-perguntas:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao gerar perguntas' });
  }
});

// ────────────────────────────────────────────────────────────────────
// CRUD pesquisas
// ────────────────────────────────────────────────────────────────────

// GET /api/nps  → lista pesquisas (todas para autenticados)
router.get('/', async (req, res) => {
  try {
    const { status, valor } = req.query;
    let q = supabase
      .from('nps_pesquisas')
      .select('*')
      .order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    if (valor) q = q.eq('valor', valor);
    const { data, error } = await q;
    if (error) throw error;

    // Anexa stats agregadas em lote
    if (data?.length) {
      const ids = data.map(p => p.id);
      const { data: stats } = await supabase
        .from('vw_nps_pesquisa_stats')
        .select('*')
        .in('pesquisa_id', ids);
      const byId = Object.fromEntries((stats || []).map(s => [s.pesquisa_id, s]));
      data.forEach(p => { p.stats = byId[p.id] || null; });
    }

    res.json(data);
  } catch (e) {
    console.error('[nps] list:', e.message);
    res.status(500).json({ error: 'Erro ao listar pesquisas' });
  }
});

// GET /api/nps/:id  → detalhe + stats
router.get('/:id', async (req, res) => {
  try {
    const { data: pesquisa, error } = await supabase
      .from('nps_pesquisas')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error || !pesquisa) return res.status(404).json({ error: 'Pesquisa não encontrada' });

    const { data: stats } = await supabase
      .from('vw_nps_pesquisa_stats')
      .select('*')
      .eq('pesquisa_id', pesquisa.id)
      .single();

    res.json({ ...pesquisa, stats: stats || null });
  } catch (e) {
    console.error('[nps] get:', e.message);
    res.status(500).json({ error: 'Erro ao buscar pesquisa' });
  }
});

// POST /api/nps  → cria pesquisa (com perguntas já geradas) e notifica
router.post('/', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const d = req.body || {};
    if (!d.titulo || !d.objetivo || !d.perguntas) {
      return res.status(400).json({ error: 'titulo, objetivo e perguntas são obrigatórios' });
    }
    const areaNormalizada = (d.area || 'geral').toLowerCase().slice(0, 60);
    const valorNormalizado = d.valor || null;
    if (!valorNormalizado && areaNormalizada === 'geral') {
      return res.status(400).json({ error: 'Defina um escopo: um valor da CBRio ou uma área específica.' });
    }

    const contextoKpi = TIPOS_KPI_VALIDOS.includes(d.contexto_kpi) ? d.contexto_kpi : 'nps_geral';

    const token = d.permite_publico === false ? null : crypto.randomBytes(18).toString('base64url');

    const insert = {
      titulo: d.titulo.slice(0, 200),
      valor: valorNormalizado,
      objetivo: d.objetivo,
      contexto_kpi: contextoKpi,
      area: areaNormalizada,
      perguntas: d.perguntas,
      ia_modelo: d.ia_modelo || npsService.MODELO_PADRAO,
      ia_prompt: d.ia_prompt || null,
      link_publico_token: token,
      permite_publico: d.permite_publico !== false,
      data_inicio: d.data_inicio || new Date().toISOString().slice(0, 10),
      data_fim: d.data_fim || null,
      status: 'ativa',
      criado_por: req.user.userId,
    };

    const { data: pesquisa, error } = await supabase
      .from('nps_pesquisas')
      .insert(insert)
      .select()
      .single();
    if (error) throw error;

    // Notificação in-app para colaboradores cadastrados
    try {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id')
        .eq('active', true);
      const targetIds = (profiles || []).map(p => p.id);

      const valorNome = pesquisa.valor ? npsService.VALORES_INFO[pesquisa.valor]?.nome : null;
      const foco = valorNome
        ? `Sua opinião ajuda a melhorar o valor "${valorNome}".`
        : `Sua opinião ajuda a melhorar a área "${pesquisa.area}".`;

      await notificar({
        modulo: 'nps',
        tipo: 'pesquisa_aberta',
        titulo: `Nova pesquisa: ${pesquisa.titulo}`,
        mensagem: `${foco} Leva menos de 2 minutos.`,
        link: `/nps/${pesquisa.id}/responder`,
        severidade: 'info',
        chaveDedup: `nps_${pesquisa.id}`,
        targetIds,
      });
    } catch (notifErr) {
      console.warn('[nps] notificar falhou (criação seguiu):', notifErr.message);
    }

    res.status(201).json(pesquisa);
  } catch (e) {
    console.error('[nps] create:', e.message);
    res.status(500).json({ error: 'Erro ao criar pesquisa' });
  }
});

// PUT /api/nps/:id  → atualizar (encerrar, mudar título, etc)
router.put('/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const d = req.body || {};
    const update = {};
    if (d.titulo !== undefined) update.titulo = d.titulo;
    if (d.objetivo !== undefined) update.objetivo = d.objetivo;
    if (d.status !== undefined) update.status = d.status;
    if (d.data_fim !== undefined) update.data_fim = d.data_fim;
    if (d.permite_publico !== undefined) update.permite_publico = d.permite_publico;
    if (d.area !== undefined) update.area = String(d.area).toLowerCase();

    const { data, error } = await supabase
      .from('nps_pesquisas')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[nps] update:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar pesquisa' });
  }
});

// DELETE /api/nps/:id  → soft delete (arquivar)
router.delete('/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase
      .from('nps_pesquisas')
      .update({ status: 'arquivada' })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    console.error('[nps] delete:', e.message);
    res.status(500).json({ error: 'Erro ao arquivar pesquisa' });
  }
});

// ────────────────────────────────────────────────────────────────────
// Respostas
// ────────────────────────────────────────────────────────────────────

// GET /api/nps/:id/respostas  → admin/diretor ou criador
router.get('/:id/respostas', async (req, res) => {
  try {
    const { data: pesquisa } = await supabase
      .from('nps_pesquisas').select('criado_por').eq('id', req.params.id).single();
    const isPrivileged = ['admin', 'diretor'].includes(req.user.role);
    const isOwner = pesquisa?.criado_por === req.user.userId;
    if (!isPrivileged && !isOwner) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    const { data, error } = await supabase
      .from('nps_respostas')
      .select('id, score, respostas, comentario, origem, nome_publico, email_publico, profile_id, created_at')
      .eq('pesquisa_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[nps] respostas:', e.message);
    res.status(500).json({ error: 'Erro ao listar respostas' });
  }
});

// POST /api/nps/:id/responder  → respondente logado
router.post('/:id/responder', async (req, res) => {
  try {
    const { score, respostas, comentario } = req.body || {};
    if (score === undefined || score < 0 || score > 10) {
      return res.status(400).json({ error: 'score deve estar entre 0 e 10' });
    }
    const { data: pesquisa } = await supabase
      .from('nps_pesquisas').select('id, status').eq('id', req.params.id).single();
    if (!pesquisa) return res.status(404).json({ error: 'Pesquisa não encontrada' });
    if (pesquisa.status !== 'ativa') {
      return res.status(400).json({ error: 'Pesquisa não está ativa' });
    }

    const { data, error } = await supabase
      .from('nps_respostas')
      .insert({
        pesquisa_id: pesquisa.id,
        profile_id: req.user.userId,
        score: Math.round(score),
        respostas: respostas || {},
        comentario: comentario || null,
        origem: 'logado',
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Você já respondeu esta pesquisa' });
      }
      throw error;
    }

    // Atualiza dados_brutos com a nova média (sem bloquear resposta)
    sincronizarKpi(pesquisa.id).catch(err =>
      console.warn('[nps] sincronizarKpi falhou:', err.message)
    );

    res.status(201).json({ ok: true, id: data.id });
  } catch (e) {
    console.error('[nps] responder:', e.message);
    res.status(500).json({ error: 'Erro ao registrar resposta' });
  }
});

// POST /api/nps/:id/analisar  → roda análise IA (admin/diretor)
router.post('/:id/analisar', authorize('admin', 'diretor'), iaLimiter, async (req, res) => {
  try {
    const { data: pesquisa, error: pErr } = await supabase
      .from('nps_pesquisas').select('*').eq('id', req.params.id).single();
    if (pErr || !pesquisa) return res.status(404).json({ error: 'Pesquisa não encontrada' });

    const { data: stats } = await supabase
      .from('vw_nps_pesquisa_stats').select('*').eq('pesquisa_id', pesquisa.id).single();
    const { data: respostas } = await supabase
      .from('nps_respostas')
      .select('score, comentario, respostas')
      .eq('pesquisa_id', pesquisa.id);

    const analise = await npsService.analisarRespostas({
      pesquisa,
      stats: stats || { total_respostas: 0, score_medio: 0, nps_score: 0, promoters: 0, passives: 0, detractors: 0 },
      respostas: respostas || [],
    });

    await supabase
      .from('nps_pesquisas')
      .update({ analise_ia: analise, analise_atualizada_em: new Date().toISOString() })
      .eq('id', pesquisa.id);

    res.json(analise);
  } catch (e) {
    console.error('[nps] analisar:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao analisar' });
  }
});

// POST /api/nps/:id/notificar  → re-notifica colaboradores (admin/diretor)
router.post('/:id/notificar', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data: pesquisa } = await supabase
      .from('nps_pesquisas').select('*').eq('id', req.params.id).single();
    if (!pesquisa) return res.status(404).json({ error: 'Pesquisa não encontrada' });

    const { data: profiles } = await supabase
      .from('profiles').select('id').eq('active', true);
    const targetIds = (profiles || []).map(p => p.id);

    const enviadas = await notificar({
      modulo: 'nps',
      tipo: 'pesquisa_lembrete',
      titulo: `Lembrete: ${pesquisa.titulo}`,
      mensagem: 'A pesquisa continua aberta — sua resposta nos ajuda bastante.',
      link: `/nps/${pesquisa.id}/responder`,
      severidade: 'info',
      chaveDedup: `nps_lembrete_${pesquisa.id}_${Date.now()}`,
      targetIds,
    });

    res.json({ enviadas });
  } catch (e) {
    console.error('[nps] notificar:', e.message);
    res.status(500).json({ error: 'Erro ao enviar lembretes' });
  }
});

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────
async function sincronizarKpi(pesquisaId) {
  const { data: pesquisa } = await supabase
    .from('nps_pesquisas')
    .select('id, contexto_kpi, area, data_inicio')
    .eq('id', pesquisaId)
    .single();
  if (!pesquisa) return;

  const { data: stats } = await supabase
    .from('vw_nps_pesquisa_stats')
    .select('total_respostas, score_medio, nps_score')
    .eq('pesquisa_id', pesquisa.id)
    .single();
  if (!stats || !stats.total_respostas) return;

  // Garante que o tipo existe (no-op se já cadastrado).
  const { data: tipo } = await supabase
    .from('tipos_dado_bruto')
    .select('id')
    .eq('id', pesquisa.contexto_kpi)
    .maybeSingle();
  if (!tipo) return; // tipo NPS ainda não seedado — ignora silenciosamente

  await supabase
    .from('dados_brutos')
    .upsert(
      {
        tipo_id: pesquisa.contexto_kpi,
        area: pesquisa.area || 'geral',
        data: pesquisa.data_inicio,
        valor: Number(stats.score_medio) || 0,
        contexto: {
          pesquisa_id: pesquisa.id,
          total_respostas: stats.total_respostas,
          nps_score: Number(stats.nps_score) || 0,
        },
        origem: 'auto',
        observacao: `NPS automático: pesquisa ${pesquisa.id}`,
      },
      { onConflict: 'tipo_id,area,data,contexto' }
    );
}

module.exports = router;
