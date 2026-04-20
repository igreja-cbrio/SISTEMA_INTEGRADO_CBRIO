const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

// GET /api/revisoes/diagnostico — status geral de projetos e expansao
router.get('/diagnostico', async (req, res) => {
  try {
    const hoje = new Date().toISOString().split('T')[0];

    // Projetos
    const { data: proj } = await supabase.from('projects').select('id, name, status, date_start, date_end, responsible, budget_planned, budget_spent, priority, area').neq('status', 'concluido').neq('status', 'cancelado').order('name');
    const projAtrasados = (proj || []).filter(p => p.date_end && p.date_end < hoje);
    const projSemData = (proj || []).filter(p => !p.date_end);

    // Expansao
    const { data: marcos } = await supabase.from('expansion_milestones').select('id, name, status, date_start, date_end, budget_planned, budget_spent, responsible, sort_order, year, area').order('sort_order');
    const marcosAtrasados = (marcos || []).filter(m => m.date_end && m.date_end < hoje && m.status !== 'concluido');
    const marcosPendentes = (marcos || []).filter(m => m.status === 'pendente' || m.status === 'em_andamento');

    // Dependencias
    const { data: deps } = await supabase.from('expansion_milestone_dependencies').select('milestone_id, depends_on_id');
    const atrasadoIds = new Set(marcosAtrasados.map(m => m.id));
    const impactados = new Set();
    (deps || []).forEach(d => { if (atrasadoIds.has(d.depends_on_id)) impactados.add(d.milestone_id); });

    res.json({
      projetos: { total: (proj || []).length, atrasados: projAtrasados, sem_data: projSemData, lista: proj || [] },
      expansao: { total: (marcos || []).length, atrasados: marcosAtrasados, pendentes: marcosPendentes, lista: marcos || [] },
      dependencias: { total: (deps || []).length, impactados: impactados.size },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/revisoes/simular/:tipo/:id — simular impacto de alteracao
router.get('/simular/:tipo/:id', async (req, res) => {
  try {
    const { tipo, id } = req.params;
    const { nova_data } = req.query;

    if (tipo === 'expansao') {
      // Buscar marco
      const { data: marco } = await supabase.from('expansion_milestones').select('*').eq('id', id).single();
      if (!marco) return res.status(404).json({ error: 'Marco nao encontrado' });

      // Buscar dependentes diretos
      const { data: depIds } = await supabase.from('expansion_milestone_dependencies').select('milestone_id').eq('depends_on_id', id);
      const ids = (depIds || []).map(d => d.milestone_id);
      let dependentes = [];
      if (ids.length > 0) {
        const { data } = await supabase.from('expansion_milestones').select('id, name, date_end, status, sort_order').in('id', ids).order('sort_order');
        dependentes = data || [];
      }

      // Buscar dependentes indiretos (cascata)
      const todosImpactados = new Set(ids);
      const { data: allDeps } = await supabase.from('expansion_milestone_dependencies').select('milestone_id, depends_on_id');
      let changed = true;
      while (changed) {
        changed = false;
        (allDeps || []).forEach(d => {
          if (todosImpactados.has(d.depends_on_id) && !todosImpactados.has(d.milestone_id)) {
            todosImpactados.add(d.milestone_id);
            changed = true;
          }
        });
      }

      let cascata = [];
      if (todosImpactados.size > ids.length) {
        const indiretoIds = [...todosImpactados].filter(x => !ids.includes(x));
        if (indiretoIds.length > 0) {
          const { data } = await supabase.from('expansion_milestones').select('id, name, date_end, status').in('id', indiretoIds);
          cascata = data || [];
        }
      }

      res.json({ marco, dependentes_diretos: dependentes, cascata, total_impactados: todosImpactados.size });
    } else {
      // Projeto
      const { data: proj } = await supabase.from('projects').select('*').eq('id', id).single();
      res.json({ projeto: proj, dependentes_diretos: [], cascata: [], total_impactados: 0 });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PACOTES DE REVISAO ──

// GET /api/revisoes/pacotes
router.get('/pacotes', async (req, res) => {
  try {
    const { data, error } = await supabase.from('revision_packages').select('*, revision_items(*)').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/revisoes/pacotes — criar pacote
router.post('/pacotes', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, error } = await supabase.from('revision_packages').insert({
      titulo: req.body.titulo, descricao: req.body.descricao || '', created_by: req.user.userId,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/revisoes/pacotes/:id/itens — adicionar item ao pacote
router.post('/pacotes/:id/itens', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const d = req.body;

    // Calcular impacto se for expansao + mudanca de data
    let dependentesAfetados = 0;
    let impactoDescricao = d.impacto_descricao || '';
    if (d.tipo === 'expansao' && d.campo === 'date_end') {
      const { data: depIds } = await supabase.from('expansion_milestone_dependencies').select('milestone_id').eq('depends_on_id', d.item_id);
      dependentesAfetados = (depIds || []).length;
      if (dependentesAfetados > 0 && !impactoDescricao) {
        const { data: depMarcos } = await supabase.from('expansion_milestones').select('name').in('id', depIds.map(x => x.milestone_id));
        impactoDescricao = `Afeta ${dependentesAfetados} marcos: ${(depMarcos || []).map(m => m.name).join(', ')}`;
      }
    }

    const { data, error } = await supabase.from('revision_items').insert({
      package_id: req.params.id, tipo: d.tipo, item_id: d.item_id, item_nome: d.item_nome,
      campo: d.campo, valor_atual: d.valor_atual, valor_proposto: d.valor_proposto,
      motivo: d.motivo || '', lider: d.lider || '',
      impacto_descricao: impactoDescricao, dependentes_afetados: dependentesAfetados,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/revisoes/itens/:id
router.delete('/itens/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    await supabase.from('revision_items').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/revisoes/pacotes/:id/status — mudar status
router.patch('/pacotes/:id/status', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const updates = { status: req.body.status };
    if (req.body.status === 'aprovado') { updates.approved_by = req.user.userId; updates.approved_at = new Date().toISOString(); }
    const { data, error } = await supabase.from('revision_packages').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/revisoes/pacotes/:id/aplicar — aplicar todas as alteracoes
router.post('/pacotes/:id/aplicar', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data: pkg } = await supabase.from('revision_packages').select('*, revision_items(*)').eq('id', req.params.id).single();
    if (!pkg || pkg.status !== 'aprovado') return res.status(400).json({ error: 'Pacote precisa estar aprovado' });

    let aplicados = 0;
    for (const item of (pkg.revision_items || [])) {
      const tabela = item.tipo === 'projeto' ? 'projects' : 'expansion_milestones';
      const update = {};
      update[item.campo] = item.valor_proposto;
      const { error } = await supabase.from(tabela).update(update).eq('id', item.item_id);
      if (!error) aplicados++;
    }

    await supabase.from('revision_packages').update({ status: 'aplicado', applied_at: new Date().toISOString() }).eq('id', req.params.id);
    res.json({ success: true, aplicados });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/revisoes/pacotes/:id
router.delete('/pacotes/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    await supabase.from('revision_items').delete().eq('package_id', req.params.id);
    await supabase.from('revision_packages').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
