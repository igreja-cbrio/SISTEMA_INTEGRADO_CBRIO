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
        // varredura 2026-09: A04 — esta rota inteira é o devocional PESSOAL (o insert e o revive
        // do /check-in fixam `tipo: 'pessoal'`), mas esta consulta não filtrava o tipo: quem
        // tivesse um devocional 'familiar' no mesmo dia via `concluido_hoje: true` e o
        // `check_in_id` da linha ERRADA, sem nunca ter feito o check-in pessoal.
        .eq('tipo', 'pessoal')
        // varredura 2026-09: A04 — o DELETE do web virou soft-delete. Sem este filtro o app
        // devolvia `concluido_hoje: true` com o id de uma linha APAGADA: a pessoa removia o
        // check-in no web e o app continuava dizendo que o dia estava feito.
        .is('deleted_at', null)
        .limit(1)
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
//   body: { item_id?, observações? }
//   Cria mem_devocionais pro membro logado (data = hoje, tipo=pessoal).
//   item_id e' opcional · se passar, linka pra contar adesao.
// ─────────────────────────────────────────────────────────────
router.post('/check-in', async (req, res) => {
  try {
    const membro = await resolveMembro(req);
    if (!membro) {
      return res.status(403).json({ error: 'Profile não linkado a um membro' });
    }
    const hoje = new Date().toISOString().slice(0, 10);
    const { item_id, observacoes } = req.body || {};

    // Se já existe pra hoje, retorna 200 com o existente (idempotente)
    const { data: existente } = await supabase
      .from('mem_devocionais')
      .select('*')
      .eq('membro_id', membro.id)
      .eq('data_devocional', hoje)
      // varredura 2026-09: A04 — sem filtrar o tipo, esta guarda de idempotência via o devocional
      // 'familiar' VIVO do dia e respondia `ja_existia: true` com a linha errada — o ramo de
      // ressuscitar e o fallback de linha viva logo abaixo já filtram `tipo = 'pessoal'`, então
      // com o 'pessoal' APAGADO no mesmo dia o revive NUNCA rodava e o dia ficava trancado.
      .eq('tipo', 'pessoal')
      // varredura 2026-09: A04 — o DELETE do web virou soft-delete. Sem este filtro o check-in
      // achava a linha APAGADA, respondia `ja_existia: true` e NUNCA inseria: depois de remover
      // o check-in no web, o botão do app deixava de funcionar naquele dia, em silêncio.
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (existente) {
      // Se mandou novo observacoes/item_id e ainda não tinha, atualiza
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

    const novoCheckIn = {
      membro_id: membro.id,
      data_devocional: hoje,
      tipo: 'pessoal',
      topico: null,
      observacoes: observacoes || null,
      devocional_item_id: item_id || null,
      concluida: true,
      created_by: req.user?.userId || null,
    };

    const { data: novo, error } = await supabase
      .from('mem_devocionais')
      .insert(novoCheckIn)
      .select()
      .single();

    if (error) {
      // varredura 2026-09: A04 — RESSUSCITAR, mesmo motivo do POST de devocionais.js:
      // `uq_mem_devocionais_dia` NÃO é índice parcial (não tem `WHERE deleted_at IS NULL`),
      // então a linha soft-deletada continua ocupando (membro_id, data_devocional, tipo) e o
      // insert acima bate em 23505. Sem este ramo, o filtro que acabamos de acrescentar apenas
      // trocaria o "ja_existia" mentiroso por um 500 — o dia continuaria trancado.
      if (error.code !== '23505') throw error;

      const { data: apagado } = await supabase
        .from('mem_devocionais')
        .select('id, deleted_at')
        .eq('membro_id', membro.id)
        .eq('data_devocional', hoje)
        .eq('tipo', 'pessoal')
        .limit(1)
        .maybeSingle();

      let revivido = null;
      if (apagado?.deleted_at) {
        const { data: upd, error: erroRevive } = await supabase
          .from('mem_devocionais')
          .update({ ...novoCheckIn, deleted_at: null })
          .eq('id', apagado.id)
          // varredura 2026-09: A04 — trava de corrida: se a linha reviveu entre a leitura e o
          // UPDATE, nada volta e caímos no ramo idempotente abaixo, sem sobrescrever linha viva.
          .not('deleted_at', 'is', null)
          .select()
          .maybeSingle();
        if (erroRevive) throw erroRevive;
        revivido = upd || null;
      }

      // varredura 2026-09: A04 — pro app, ressuscitar é criar: mesmo 201 do caminho normal.
      if (revivido) return res.status(201).json({ ja_existia: false, registro: revivido });

      // varredura 2026-09: A04 — não era linha morta (corrida com outro check-in): responde
      // idempotente com a linha VIVA, que é o contrato desta rota.
      const { data: vivo } = await supabase
        .from('mem_devocionais')
        .select('*')
        .eq('membro_id', membro.id)
        .eq('data_devocional', hoje)
        .eq('tipo', 'pessoal')
        .is('deleted_at', null)
        .limit(1)
        .maybeSingle();
      if (vivo) return res.json({ ja_existia: true, registro: vivo });
      throw error;
    }

    res.status(201).json({ ja_existia: false, registro: novo });
  } catch (e) {
    console.error('devocional-membro/check-in:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao registrar check-in' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/devocional-membro/historico
//   Últimos 30 check-ins do membro logado.
// ─────────────────────────────────────────────────────────────
router.get('/historico', async (req, res) => {
  try {
    const membro = await resolveMembro(req);
    if (!membro) return res.json({ data: [] });

    const { data, error } = await supabase
      .from('mem_devocionais')
      .select('id, data_devocional, observacoes, devocional_item_id, devocional_itens(id, titulo, passagem)')
      .eq('membro_id', membro.id)
      // varredura 2026-09: A04 — o DELETE do web virou soft-delete. Sem este filtro o app
      // listava de volta exatamente os check-ins que a pessoa tinha apagado.
      .is('deleted_at', null)
      .order('data_devocional', { ascending: false })
      .limit(30);
    if (error) throw error;

    res.json({ data: data || [] });
  } catch (e) {
    console.error('devocional-membro/historico:', e.message);
    res.status(500).json({ error: 'Erro ao listar histórico' });
  }
});

module.exports = router;
