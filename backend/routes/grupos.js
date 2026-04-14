const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

// GET /api/grupos — lista todos com contagem de membros e lider
router.get('/', async (req, res) => {
  try {
    const { ativo, categoria } = req.query;
    let q = supabase.from('mem_grupos').select('*');
    if (ativo !== undefined) q = q.eq('ativo', ativo === 'true');
    else q = q.eq('ativo', true);
    if (categoria) q = q.eq('categoria', categoria);
    q = q.order('nome');
    const { data: grupos, error } = await q;
    if (error) throw error;

    // Buscar contagem de membros ativos por grupo
    const { data: participacoes } = await supabase.from('mem_grupo_membros')
      .select('grupo_id, membro_id').is('saiu_em', null);

    // Buscar dados dos lideres
    const liderIds = [...new Set((grupos || []).map(g => g.lider_id).filter(Boolean))];
    let lideresMap = {};
    if (liderIds.length > 0) {
      const { data: lideres } = await supabase.from('mem_membros').select('id, nome, foto_url').in('id', liderIds);
      (lideres || []).forEach(l => { lideresMap[l.id] = l; });
    }

    // Buscar grupo de origem
    const origemIds = [...new Set((grupos || []).map(g => g.grupo_origem_id).filter(Boolean))];
    let origensMap = {};
    if (origemIds.length > 0) {
      const { data: origens } = await supabase.from('mem_grupos').select('id, nome').in('id', origemIds);
      (origens || []).forEach(o => { origensMap[o.id] = o.nome; });
    }

    const contagem = {};
    (participacoes || []).forEach(p => { contagem[p.grupo_id] = (contagem[p.grupo_id] || 0) + 1; });

    const result = (grupos || []).map(g => ({
      ...g,
      membros_count: contagem[g.id] || 0,
      lider_nome: lideresMap[g.lider_id]?.nome || null,
      lider_foto: lideresMap[g.lider_id]?.foto_url || null,
      grupo_origem_nome: origensMap[g.grupo_origem_id] || null,
    }));

    res.json(result);
  } catch (e) { console.error('[Grupos list]', e.message); res.status(500).json({ error: 'Erro ao buscar grupos' }); }
});

// GET /api/grupos/:id — detalhe com membros
router.get('/:id', async (req, res) => {
  try {
    const { data: grupo, error } = await supabase.from('mem_grupos').select('*').eq('id', req.params.id).single();
    if (error) throw error;

    // Membros ativos
    const { data: participacoes } = await supabase.from('mem_grupo_membros')
      .select('*, mem_membros(id, nome, telefone, email, foto_url, status, data_nascimento)')
      .eq('grupo_id', req.params.id).is('saiu_em', null).order('entrou_em');

    // Historico (quem saiu)
    const { data: historico } = await supabase.from('mem_grupo_membros')
      .select('*, mem_membros(id, nome)')
      .eq('grupo_id', req.params.id).not('saiu_em', 'is', null).order('saiu_em', { ascending: false });

    // Lider
    let lider = null;
    if (grupo.lider_id) {
      const { data } = await supabase.from('mem_membros').select('id, nome, telefone, email, foto_url').eq('id', grupo.lider_id).single();
      lider = data;
    }

    // Grupo de origem
    let grupoOrigem = null;
    if (grupo.grupo_origem_id) {
      const { data } = await supabase.from('mem_grupos').select('id, nome').eq('id', grupo.grupo_origem_id).single();
      grupoOrigem = data;
    }

    // Multiplicacoes (grupos que nasceram deste)
    const { data: multiplicacoes } = await supabase.from('mem_grupos').select('id, nome, ativo')
      .eq('grupo_origem_id', req.params.id).order('nome');

    const membros = (participacoes || []).map(p => ({
      participacao_id: p.id,
      entrou_em: p.entrou_em,
      presencas: p.presencas || 0,
      is_visitante: (p.presencas || 0) < 3,
      ...p.mem_membros,
    }));

    res.json({
      ...grupo,
      lider,
      grupo_origem: grupoOrigem,
      multiplicacoes: multiplicacoes || [],
      membros,
      historico: (historico || []).map(h => ({
        ...h, membro_nome: h.mem_membros?.nome, mem_membros: undefined,
      })),
    });
  } catch (e) { console.error('[Grupos get]', e.message); res.status(500).json({ error: 'Erro ao buscar grupo' }); }
});

// POST /api/grupos
router.post('/', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('mem_grupos').insert({
      nome: d.nome, categoria: d.categoria || '', lider_id: d.lider_id || null,
      local: d.local || '', endereco: d.endereco || '',
      dia_semana: d.dia_semana ?? null, horario: d.horario || null,
      recorrencia: d.recorrencia || 'semanal', tema: d.tema || '',
      foto_url: d.foto_url || null, observacoes: d.observacoes || '',
      grupo_origem_id: d.grupo_origem_id || null,
      descricao: d.descricao || '', ativo: true,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { console.error('[Grupos create]', e.message); res.status(500).json({ error: 'Erro ao criar grupo' }); }
});

// PUT /api/grupos/:id
router.put('/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('mem_grupos').update({
      nome: d.nome, categoria: d.categoria || '', lider_id: d.lider_id || null,
      local: d.local || '', endereco: d.endereco || '',
      dia_semana: d.dia_semana ?? null, horario: d.horario || null,
      recorrencia: d.recorrencia || 'semanal', tema: d.tema || '',
      foto_url: d.foto_url || null, observacoes: d.observacoes || '',
      grupo_origem_id: d.grupo_origem_id || null,
      descricao: d.descricao || '', ativo: d.ativo ?? true,
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar grupo' }); }
});

// DELETE /api/grupos/:id — soft delete
router.delete('/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    await supabase.from('mem_grupos').update({ ativo: false }).eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao desativar grupo' }); }
});

// POST /api/grupos/:id/membros — adicionar membro
router.post('/:id/membros', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { membro_id } = req.body;
    if (!membro_id) return res.status(400).json({ error: 'membro_id obrigatorio' });

    // Fechar participacao anterior ativa do membro
    await supabase.from('mem_grupo_membros')
      .update({ saiu_em: new Date().toISOString().split('T')[0], motivo_saida: 'Transferido para outro grupo' })
      .eq('membro_id', membro_id).is('saiu_em', null);

    const { data, error } = await supabase.from('mem_grupo_membros').insert({
      grupo_id: req.params.id, membro_id, entrou_em: new Date().toISOString().split('T')[0],
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { console.error('[Grupos add member]', e.message); res.status(500).json({ error: 'Erro ao adicionar membro' }); }
});

// PATCH /api/grupos/participacao/:id/sair — remover membro
router.patch('/participacao/:id/sair', async (req, res) => {
  try {
    const { data, error } = await supabase.from('mem_grupo_membros').update({
      saiu_em: new Date().toISOString().split('T')[0],
      motivo_saida: req.body.motivo || '',
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// PATCH /api/grupos/participacao/:id/presenca — incrementar presenca
router.patch('/participacao/:id/presenca', async (req, res) => {
  try {
    const { data: current } = await supabase.from('mem_grupo_membros').select('presencas').eq('id', req.params.id).single();
    const { data, error } = await supabase.from('mem_grupo_membros').update({
      presencas: (current?.presencas || 0) + 1,
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

module.exports = router;
