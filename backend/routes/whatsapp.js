// Admin do bot WhatsApp · vinculo de líderes + revisao/aplicacao de coletas.
// Autenticado · exige nível >= 3 em integração OU grupos (coordenador).
// O webhook público (recebimento) fica em routes/publicWhatsapp.js.
const router = require('express').Router();
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { normalizarTelefone } = require('../services/whatsappSend');

router.use(authenticate);

// Coordenador de integração OU grupos (nível 3+) gerencia o bot.
// 'whatsapp-admin' -> ['integração','grupos'] no ROUTE_MODULE_MAP.
const podeGerir = authorizeModule('whatsapp-admin', 3);

// ═══════════════════════════════════════════════════════════════════
// LÍDERES · vinculo telefone -> profile
// ═══════════════════════════════════════════════════════════════════

// GET /api/whatsapp/lideres
router.get('/lideres', podeGerir, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('whatsapp_lideres')
      .select(`
        id, telefone, nome_exibicao, escopo, grupo_id, ativo, created_at,
        profile:profiles!whatsapp_lideres_profile_id_fkey(id, name, email, avatar_url),
        grupo:mem_grupos(id, nome)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[whatsapp] lideres list', e.message);
    res.status(500).json({ error: 'Erro ao listar líderes' });
  }
});

// POST /api/whatsapp/lideres · { profile_id, telefone, escopo[], grupo_id? }
router.post('/lideres', podeGerir, async (req, res) => {
  try {
    const { profile_id, telefone, escopo, grupo_id } = req.body || {};
    const tel = normalizarTelefone(telefone);
    if (!tel || tel.length < 12 || tel.length > 13) {
      return res.status(400).json({ error: 'Telefone invalido. Use DDI+DDD+número (ex: 5521999998888).' });
    }
    if (!Array.isArray(escopo) || escopo.length === 0) {
      return res.status(400).json({ error: 'Informe ao menos um escopo (grupos/integracao).' });
    }
    const escopoValido = escopo.filter(s => ['grupos', 'integracao'].includes(s));
    if (escopoValido.length === 0) {
      return res.status(400).json({ error: 'Escopo deve conter grupos e/ou integração.' });
    }

    // Cache do nome pra exibir rapido
    let nome_exibicao = null;
    if (profile_id) {
      const { data: prof } = await supabase.from('profiles').select('name').eq('id', profile_id).maybeSingle();
      nome_exibicao = prof?.name || null;
    }

    const { data, error } = await supabase
      .from('whatsapp_lideres')
      .insert({
        profile_id: profile_id || null,
        telefone: tel,
        nome_exibicao,
        escopo: escopoValido,
        grupo_id: grupo_id || null,
        ativo: true,
        created_by: req.user?.userId || null,
      })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Esse telefone já esta vinculado.' });
      return res.status(400).json({ error: error.message });
    }
    res.status(201).json(data);
  } catch (e) {
    console.error('[whatsapp] lideres create', e.message);
    res.status(500).json({ error: 'Erro ao vincular líder' });
  }
});

// PUT /api/whatsapp/lideres/:id · { escopo?, grupo_id?, ativo? }
router.put('/lideres/:id', podeGerir, async (req, res) => {
  try {
    const patch = {};
    if (Array.isArray(req.body?.escopo)) {
      patch.escopo = req.body.escopo.filter(s => ['grupos', 'integracao'].includes(s));
    }
    if ('grupo_id' in (req.body || {})) patch.grupo_id = req.body.grupo_id || null;
    if (typeof req.body?.ativo === 'boolean') patch.ativo = req.body.ativo;
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nada para atualizar' });

    const { error } = await supabase.from('whatsapp_lideres').update(patch).eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error('[whatsapp] lideres update', e.message);
    res.status(500).json({ error: 'Erro ao atualizar líder' });
  }
});

// DELETE /api/whatsapp/lideres/:id · soft delete
router.delete('/lideres/:id', podeGerir, async (req, res) => {
  try {
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'whatsapp_lideres',
      p_row_id: req.params.id,
      p_deleted_by: req.user?.userId || null,
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error('[whatsapp] lideres delete', e.message);
    res.status(500).json({ error: 'Erro ao remover líder' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// COLETAS · revisão e aplicação
// ═══════════════════════════════════════════════════════════════════

// GET /api/whatsapp/coletas?status=parseado
router.get('/coletas', podeGerir, async (req, res) => {
  try {
    let q = supabase
      .from('whatsapp_coletas')
      .select(`
        id, telefone, raw_text, parsed, modulo_destino, status,
        aplicado_em, erro, created_at,
        lider:whatsapp_lideres(id, nome_exibicao, escopo, grupo_id)
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100);
    if (req.query.status) q = q.eq('status', req.query.status);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[whatsapp] coletas list', e.message);
    res.status(500).json({ error: 'Erro ao listar coletas' });
  }
});

// POST /api/whatsapp/coletas/:id/aplicar
// integração · cria submissao pendente no culto mais recente (cai na fila
//              existente /integracao?tab=pendentes pro coord aprovar)
// grupos · marca aplicado (lancamento manual no módulo Grupos · o encontro
//          exige lista nominal de presenças que o WhatsApp não fornece)
router.post('/coletas/:id/aplicar', podeGerir, async (req, res) => {
  try {
    const { data: coleta, error: errFetch } = await supabase
      .from('whatsapp_coletas')
      .select('id, parsed, modulo_destino, status')
      .eq('id', req.params.id)
      .single();
    if (errFetch || !coleta) return res.status(404).json({ error: 'Coleta não encontrada' });
    if (coleta.status !== 'parseado') {
      return res.status(409).json({ error: `Coleta já esta "${coleta.status}".` });
    }

    const dados = coleta.parsed?.dados || {};

    if (coleta.modulo_destino === 'integracao') {
      // Acha o culto mais recente dos últimos 7 dias
      const hoje = new Date().toISOString().slice(0, 10);
      const limite = new Date(); limite.setDate(limite.getDate() - 7);
      const desde = limite.toISOString().slice(0, 10);
      const { data: culto } = await supabase
        .from('cultos')
        .select('id, data')
        .gte('data', desde).lte('data', hoje)
        .order('data', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!culto) {
        return res.status(422).json({ error: 'Nenhum culto nos últimos 7 dias pra associar. Lance manualmente.' });
      }
      const ambiente = (dados.kids != null && dados.presencial == null) ? 'kids' : 'templo';
      const presencial = ambiente === 'kids' ? (dados.kids ?? 0) : (dados.presencial ?? 0);
      const { data: sub, error: errSub } = await supabase
        .from('cultos_dados_submissoes')
        .insert({
          culto_id: culto.id,
          ambiente,
          presencial: Math.round(presencial),
          decisoes: Math.round(dados.decisoes ?? 0),
          observacao: 'Via WhatsApp · ' + (coleta.parsed?.resumo || ''),
          status: 'pendente',
          submitted_by: req.user?.userId || null,
        })
        .select('id')
        .single();
      if (errSub) {
        if (errSub.code === '23505') {
          return res.status(409).json({ error: 'Já existe submissao ativa desse ambiente no culto. Veja em Pendentes.' });
        }
        return res.status(400).json({ error: errSub.message });
      }
      await supabase.from('whatsapp_coletas')
        .update({ status: 'aplicado', aplicado_em: new Date().toISOString(), aplicado_por: req.user?.userId || null, destino_ref: sub.id })
        .eq('id', coleta.id);
      return res.json({ ok: true, destino: 'submissao_pendente', submissao_id: sub.id });
    }

    // grupos (ou qualquer outro) · so marca aplicado (lancamento manual)
    await supabase.from('whatsapp_coletas')
      .update({ status: 'aplicado', aplicado_em: new Date().toISOString(), aplicado_por: req.user?.userId || null })
      .eq('id', coleta.id);
    return res.json({ ok: true, destino: 'manual' });
  } catch (e) {
    console.error('[whatsapp] coletas aplicar', e.message);
    res.status(500).json({ error: 'Erro ao aplicar coleta' });
  }
});

// POST /api/whatsapp/coletas/:id/rejeitar · { motivo? }
router.post('/coletas/:id/rejeitar', podeGerir, async (req, res) => {
  try {
    const { error } = await supabase.from('whatsapp_coletas')
      .update({ status: 'rejeitado', erro: req.body?.motivo || null })
      .eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true });
  } catch (e) {
    console.error('[whatsapp] coletas rejeitar', e.message);
    res.status(500).json({ error: 'Erro ao rejeitar coleta' });
  }
});

module.exports = router;
