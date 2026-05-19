// ============================================================================
// Devocional · endpoints do membro autenticado (consumido por /devocional/*)
// ============================================================================

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

// Helper: garante que o profile esta linkado a um mem_membros via email
// Retorna { id, nome, foto_url } ou null
async function resolveMembro(req) {
  const u = req.user;
  if (!u) return null;
  if (u.membro_id) {
    const { data: m } = await supabase
      .from('mem_membros')
      .select('id, nome, foto_url')
      .eq('id', u.membro_id)
      .maybeSingle();
    if (m) return m;
  }
  // Fallback · achar por email e auto-linkar
  if (u.email) {
    const { data: m } = await supabase
      .from('mem_membros')
      .select('id, nome, foto_url')
      .ilike('email', u.email)
      .eq('active', true)
      .maybeSingle();
    if (m) {
      await supabase.from('profiles').update({ membro_id: m.id }).eq('id', u.id);
      return m;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// GET /api/devocional-membro/hoje
//   Retorna o item do plano ativo cuja data == hoje.
//   Inclui flag concluido_hoje pro membro.
// ─────────────────────────────────────────────────────────────
router.get('/hoje', async (req, res) => {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const membro = await resolveMembro(req);

    // Achar item ativo do dia (qualquer plano ativo que cobre a data)
    const { data: itens, error } = await supabase
      .from('devocional_itens')
      .select('*, devocional_planos!inner(id, titulo, ativo, data_inicio, data_fim)')
      .eq('data', hoje)
      .eq('devocional_planos.ativo', true)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;

    const item = (itens || [])[0] || null;

    let concluido_hoje = false;
    let check_in_id = null;
    if (item && membro) {
      const { data: ck } = await supabase
        .from('mem_devocionais')
        .select('id')
        .eq('membro_id', membro.id)
        .eq('data_devocional', hoje)
        .maybeSingle();
      if (ck) { concluido_hoje = true; check_in_id = ck.id; }
    }

    res.json({
      hoje,
      membro: membro ? { id: membro.id, nome: membro.nome, foto_url: membro.foto_url } : null,
      item,
      concluido_hoje,
      check_in_id,
    });
  } catch (e) {
    console.error('devocional-membro/hoje:', e.message);
    res.status(500).json({ error: 'Erro ao buscar devocional do dia' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/devocional-membro/check-in
//   body: { item_id?, observacoes? }
//   Cria mem_devocionais pro membro logado (data = hoje, tipo=pessoal).
//   item_id e' opcional · se passar, linka pra contar adesao.
// ─────────────────────────────────────────────────────────────
router.post('/check-in', async (req, res) => {
  try {
    const membro = await resolveMembro(req);
    if (!membro) {
      return res.status(403).json({ error: 'Profile nao linkado a um membro' });
    }
    const hoje = new Date().toISOString().slice(0, 10);
    const { item_id, observacoes } = req.body || {};

    // Se ja existe pra hoje, retorna 200 com o existente (idempotente)
    const { data: existente } = await supabase
      .from('mem_devocionais')
      .select('*')
      .eq('membro_id', membro.id)
      .eq('data_devocional', hoje)
      .maybeSingle();
    if (existente) {
      // Se mandou novo observacoes/item_id e ainda nao tinha, atualiza
      const patch = {};
      if (item_id && !existente.devocional_item_id) patch.devocional_item_id = item_id;
      if (observacoes && !existente.observacoes) patch.observacoes = observacoes;
      if (Object.keys(patch).length) {
        const { data: upd } = await supabase
          .from('mem_devocionais')
          .update(patch)
          .eq('id', existente.id)
          .select()
          .single();
        return res.json({ ja_existia: true, registro: upd || existente });
      }
      return res.json({ ja_existia: true, registro: existente });
    }

    const { data: novo, error } = await supabase
      .from('mem_devocionais')
      .insert({
        membro_id: membro.id,
        data_devocional: hoje,
        tipo: 'pessoal',
        topico: null,
        observacoes: observacoes || null,
        devocional_item_id: item_id || null,
        concluida: true,
        created_by: req.user?.userId || null,
      })
      .select()
      .single();
    if (error) throw error;

    res.status(201).json({ ja_existia: false, registro: novo });
  } catch (e) {
    console.error('devocional-membro/check-in:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao registrar check-in' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/devocional-membro/historico
//   Ultimos 30 check-ins do membro logado.
// ─────────────────────────────────────────────────────────────
router.get('/historico', async (req, res) => {
  try {
    const membro = await resolveMembro(req);
    if (!membro) return res.json({ data: [] });

    const { data, error } = await supabase
      .from('mem_devocionais')
      .select('id, data_devocional, observacoes, devocional_item_id, devocional_itens(id, titulo, passagem)')
      .eq('membro_id', membro.id)
      .order('data_devocional', { ascending: false })
      .limit(30);
    if (error) throw error;

    res.json({ data: data || [] });
  } catch (e) {
    console.error('devocional-membro/historico:', e.message);
    res.status(500).json({ error: 'Erro ao listar historico' });
  }
});

module.exports = router;
