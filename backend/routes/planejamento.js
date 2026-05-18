/**
 * Planejamento Anual CBRio — rotas backend (PR-A · fundação)
 *
 * Fluxo:
 *  - Admin abre ciclo do próximo ano via POST /ciclos
 *  - Líderes propõem (POST /propostas) — proposto_por = req.user.userId
 *  - 1º estágio: diretor do setor aprova/altera/rejeita
 *  - 2º estágio: diretoria geral decide final
 *
 * Esta PR (A): apenas criar/listar. PR-B traz aprovação.
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

// ── Helpers ──────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (v) => UUID_RE.test(v);
const VALID_TIPO = ['evento', 'serie', 'projeto'];

// Identifica se o usuário é diretor de algum setor (1º estágio)
async function getSetoresDoDirector(userId) {
  const { data } = await supabase
    .from('planejamento_setores')
    .select('id, nome')
    .eq('diretor_id', userId)
    .eq('ativo', true);
  return data || [];
}

// Identifica se o usuário é da diretoria geral (2º estágio)
async function isDiretoriaGeral(userId) {
  const { data } = await supabase
    .from('profiles')
    .select('is_diretoria_geral')
    .eq('id', userId)
    .single();
  return data?.is_diretoria_geral === true;
}

// Mapa área → setor_id
async function getSetorIdByArea(area) {
  const { data } = await supabase
    .from('planejamento_areas_setor')
    .select('setor_id')
    .eq('area', area)
    .maybeSingle();
  return data?.setor_id || null;
}

// ═════════════════════════════════════════════════════════════════════
// SETORES
// ═════════════════════════════════════════════════════════════════════

// GET /api/planejamento/setores — lista (todos veem)
router.get('/setores', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('planejamento_setores')
      .select('id, nome, descricao, diretor_id, ativo, profiles:diretor_id(name, email)')
      .eq('ativo', true)
      .order('nome');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[Planejamento] setores GET:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/planejamento/setores/:id — admin atribui diretor
router.patch('/setores/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const upd = {};
    if (req.body.diretor_id !== undefined) upd.diretor_id = req.body.diretor_id || null;
    if (req.body.descricao !== undefined) upd.descricao = req.body.descricao;
    if (req.body.ativo !== undefined) upd.ativo = !!req.body.ativo;
    const { data, error } = await supabase.from('planejamento_setores')
      .update(upd).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/planejamento/areas-setor — lista mapa área→setor (pra UI saber qual setor mostrar)
router.get('/areas-setor', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('planejamento_areas_setor')
      .select('area, setor_id, planejamento_setores(nome)')
      .order('area');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═════════════════════════════════════════════════════════════════════
// CICLOS
// ═════════════════════════════════════════════════════════════════════

// GET /api/planejamento/ciclos — lista todos
router.get('/ciclos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('planejamento_ciclos')
      .select('*')
      .order('year', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/planejamento/ciclos/:id — detalhe + contadores
router.get('/ciclos/:id', async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const { data: ciclo, error } = await supabase
      .from('planejamento_ciclos')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error || !ciclo) return res.status(404).json({ error: 'Ciclo não encontrado' });

    // Contagens por status
    const { data: propostas } = await supabase
      .from('planejamento_propostas')
      .select('status')
      .eq('ciclo_id', req.params.id);

    const counts = { total: propostas?.length || 0 };
    (propostas || []).forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; });

    res.json({ ...ciclo, counts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/planejamento/ciclos — admin cria ciclo do ano X
router.post('/ciclos', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const year = parseInt(req.body.year, 10);
    if (!Number.isFinite(year) || year < 2026 || year > 2050) {
      return res.status(400).json({ error: 'Ano inválido' });
    }
    const description = (req.body.description || '').toString().slice(0, 500);

    const { data, error } = await supabase.from('planejamento_ciclos').insert({
      year, description, status: 'aberto', opened_by: req.user.userId,
    }).select().single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: `Ciclo de ${year} já existe` });
      throw error;
    }
    res.json(data);
  } catch (e) {
    console.error('[Planejamento] ciclos POST:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/planejamento/ciclos/:id — abrir/fechar (admin)
// Política: fechar bloqueia novas propostas; pendentes continuam tramitando.
router.patch('/ciclos/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const upd = {};
    if (req.body.status === 'aberto') {
      upd.status = 'aberto'; upd.closed_at = null; upd.closed_by = null;
    } else if (req.body.status === 'fechado') {
      upd.status = 'fechado'; upd.closed_at = new Date().toISOString(); upd.closed_by = req.user.userId;
    } else if (req.body.status !== undefined) {
      return res.status(400).json({ error: 'Status inválido' });
    }
    if (req.body.description !== undefined) upd.description = req.body.description.toString().slice(0, 500);

    const { data, error } = await supabase.from('planejamento_ciclos')
      .update(upd).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═════════════════════════════════════════════════════════════════════
// PROPOSTAS
// ═════════════════════════════════════════════════════════════════════

// GET /api/planejamento/propostas — lista filtrável
// Query: ?ciclo_id=, ?status=, ?tipo=, ?setor_id=, ?mine=1
router.get('/propostas', async (req, res) => {
  try {
    const { ciclo_id, status, tipo, setor_id } = req.query;
    const mine = req.query.mine === '1' || req.query.mine === 'true';

    let q = supabase.from('planejamento_propostas')
      .select(`
        id, ciclo_id, tipo, area, setor_id, proposto_por, proposto_em,
        payload_original, payload_atual, status,
        diretor_decisao_por, diretor_decisao_em, diretor_decisao, diretor_comentario,
        diretoria_decisao_por, diretoria_decisao_em, diretoria_decisao, diretoria_comentario,
        created_event_id, created_project_id, created_at, updated_at,
        proposto:proposto_por(name, email),
        setor:setor_id(nome),
        ciclo:ciclo_id(year, status)
      `)
      .order('proposto_em', { ascending: false });

    if (ciclo_id && isUUID(ciclo_id)) q = q.eq('ciclo_id', ciclo_id);
    if (status) q = q.eq('status', status);
    if (tipo && VALID_TIPO.includes(tipo)) q = q.eq('tipo', tipo);
    if (setor_id && isUUID(setor_id)) q = q.eq('setor_id', setor_id);
    if (mine) q = q.eq('proposto_por', req.user.userId);

    const { data, error } = await q.limit(500);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[Planejamento] propostas GET:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/planejamento/propostas/:id — detalhe + audit
router.get('/propostas/:id', async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const { data: prop, error } = await supabase.from('planejamento_propostas')
      .select(`
        *,
        proposto:proposto_por(name, email),
        diretor_decisor:diretor_decisao_por(name),
        diretoria_decisor:diretoria_decisao_por(name),
        setor:setor_id(nome),
        ciclo:ciclo_id(year, status)
      `)
      .eq('id', req.params.id).single();
    if (error || !prop) return res.status(404).json({ error: 'Proposta não encontrada' });

    const { data: audit } = await supabase.from('planejamento_audit')
      .select('id, quem, quando, etapa, campo, valor_antes, valor_depois, comentario, profiles:quem(name)')
      .eq('proposta_id', req.params.id)
      .order('quando');

    res.json({ ...prop, audit: audit || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/planejamento/propostas — líder cria nova
// Body: { ciclo_id, tipo, area, payload (jsonb) }
//
// Auto-roteia:
//  - Se proposto_por é diretor do setor da proposta → status='pendente_diretoria' (skip 1º estágio)
//  - Se proposto_por é da diretoria geral → status='pendente_diretoria' (idem)
//  - Caso contrário → status='pendente_diretor'
router.post('/propostas', async (req, res) => {
  try {
    const { ciclo_id, tipo, area, payload } = req.body;

    if (!ciclo_id || !isUUID(ciclo_id)) return res.status(400).json({ error: 'ciclo_id obrigatório' });
    if (!tipo || !VALID_TIPO.includes(tipo)) return res.status(400).json({ error: 'tipo inválido (evento|serie|projeto)' });
    if (!area || typeof area !== 'string') return res.status(400).json({ error: 'area obrigatória' });
    if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'payload obrigatório' });

    // Ciclo precisa estar aberto
    const { data: ciclo } = await supabase.from('planejamento_ciclos')
      .select('id, status, year').eq('id', ciclo_id).single();
    if (!ciclo) return res.status(404).json({ error: 'Ciclo não encontrado' });
    if (ciclo.status !== 'aberto') return res.status(409).json({ error: 'Ciclo está fechado. Novas propostas não são aceitas.' });

    // Resolve setor a partir da área
    const setor_id = await getSetorIdByArea(area);
    if (!setor_id) return res.status(400).json({ error: `Área "${area}" não está mapeada a nenhum setor. Avise o admin.` });

    // Auto-roteamento do status inicial
    const setoresDoDirector = await getSetoresDoDirector(req.user.userId);
    const proposeDirector = setoresDoDirector.some(s => s.id === setor_id);
    const proposeDiretoriaGeral = await isDiretoriaGeral(req.user.userId);
    const initialStatus = (proposeDirector || proposeDiretoriaGeral) ? 'pendente_diretoria' : 'pendente_diretor';

    // Se diretor de setor propõe → pula direto pro 2º estágio (com decisão auto-registrada do 1º)
    const extraFields = {};
    if (proposeDirector) {
      extraFields.diretor_decisao = 'aprovado';
      extraFields.diretor_decisao_por = req.user.userId;
      extraFields.diretor_decisao_em = new Date().toISOString();
      extraFields.diretor_comentario = 'Propositor é diretor do setor — 1º estágio pulado automaticamente.';
    }

    const { data, error } = await supabase.from('planejamento_propostas').insert({
      ciclo_id, tipo, area, setor_id,
      proposto_por: req.user.userId,
      payload_original: payload,
      payload_atual: payload,
      status: initialStatus,
      ...extraFields,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[Planejamento] propostas POST:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
