const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

// ══════════════════════════════════════════════
// DIAGNÓSTICO — radar de tudo que precisa de atenção
// ══════════════════════════════════════════════

router.get('/diagnostico', async (req, res) => {
  try {
    const hoje = new Date().toISOString().split('T')[0];

    const [projRes, marcosRes, depsRes] = await Promise.all([
      supabase.from('projects').select('id, name, status, date_start, date_end, responsible, budget_planned, budget_spent, priority, area, description, year, notes').neq('status', 'concluido').neq('status', 'cancelado').order('name'),
      supabase.from('expansion_milestones').select('id, name, status, date_start, date_end, budget_planned, budget_spent, responsible, sort_order, year, area, description, phase').order('sort_order'),
      supabase.from('expansion_milestone_dependencies').select('milestone_id, depends_on_id'),
    ]);

    const proj = projRes.data || [];
    const marcos = marcosRes.data || [];
    const deps = depsRes.data || [];

    const projAtrasados = proj.filter(p => p.date_end && p.date_end < hoje);
    const marcosAtrasados = marcos.filter(m => m.date_end && m.date_end < hoje && m.status !== 'concluido' && m.status !== 'cancelado');
    const marcosPendentes = marcos.filter(m => m.status === 'pendente' || m.status === 'em_andamento');

    // Mapa de dependências (quem depende de quem)
    const depMap = {};
    deps.forEach(d => {
      if (!depMap[d.depends_on_id]) depMap[d.depends_on_id] = [];
      depMap[d.depends_on_id].push(d.milestone_id);
    });

    // Calcular impactados por atrasos (transitive)
    const atrasadoIds = new Set(marcosAtrasados.map(m => m.id));
    const impactados = new Set();
    let changed = true;
    while (changed) {
      changed = false;
      deps.forEach(d => {
        if ((atrasadoIds.has(d.depends_on_id) || impactados.has(d.depends_on_id)) && !impactados.has(d.milestone_id)) {
          impactados.add(d.milestone_id);
          changed = true;
        }
      });
    }

    // Orçamento total em risco (soma dos atrasados + impactados)
    const idsEmRisco = new Set([...atrasadoIds, ...impactados]);
    const orcamentoRisco = marcos.filter(m => idsEmRisco.has(m.id)).reduce((acc, m) => acc + (Number(m.budget_planned) || 0), 0);

    res.json({
      projetos: { total: proj.length, atrasados: projAtrasados, lista: proj },
      expansao: { total: marcos.length, atrasados: marcosAtrasados, pendentes: marcosPendentes, lista: marcos },
      dependencias: { total: deps.length, impactados: impactados.size, mapa: depMap },
      orcamento_risco: orcamentoRisco,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════
// SIMULAR IMPACTO — cascata de dependências ao alterar data
// ══════════════════════════════════════════════

router.get('/simular/:tipo/:id', async (req, res) => {
  try {
    const { tipo, id } = req.params;
    const { nova_data } = req.query;

    if (tipo === 'expansao') {
      const { data: marco } = await supabase.from('expansion_milestones').select('*').eq('id', id).single();
      if (!marco) return res.status(404).json({ error: 'Marco não encontrado' });

      // Calcular delta em dias (se nova_data fornecida)
      const deltaDias = nova_data && marco.date_end
        ? Math.round((new Date(nova_data) - new Date(marco.date_end)) / 86400000)
        : 0;

      // Buscar todas as dependências e marcos de uma vez
      const [depsRes, allMarcosRes] = await Promise.all([
        supabase.from('expansion_milestone_dependencies').select('milestone_id, depends_on_id'),
        supabase.from('expansion_milestones').select('id, name, date_start, date_end, status, budget_planned, responsible, sort_order, area'),
      ]);
      const allDeps = depsRes.data || [];
      const allMarcos = allMarcosRes.data || [];
      const marcoMap = {};
      allMarcos.forEach(m => { marcoMap[m.id] = m; });

      // Dependentes diretos
      const directIds = allDeps.filter(d => d.depends_on_id === id).map(d => d.milestone_id);

      // Cascata completa (transitive closure)
      const todosImpactados = new Set(directIds);
      let changed = true;
      while (changed) {
        changed = false;
        allDeps.forEach(d => {
          if (todosImpactados.has(d.depends_on_id) && !todosImpactados.has(d.milestone_id)) {
            todosImpactados.add(d.milestone_id);
            changed = true;
          }
        });
      }

      // Enriquecer com dados + nova data projetada
      const dependentes = [...todosImpactados].map(mid => {
        const m = marcoMap[mid] || {};
        const isDirect = directIds.includes(mid);
        return {
          ...m,
          is_direct: isDirect,
          data_projetada: deltaDias && m.date_end
            ? new Date(new Date(m.date_end).getTime() + deltaDias * 86400000).toISOString().split('T')[0]
            : m.date_end,
          delta_dias: deltaDias,
        };
      }).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

      // Custo total impactado
      const custoImpactado = dependentes.reduce((acc, d) => acc + (Number(d.budget_planned) || 0), 0);

      res.json({
        item: marco,
        dependentes,
        total_impactados: todosImpactados.size,
        custo_impactado: custoImpactado,
        delta_dias: deltaDias,
      });
    } else {
      // Projeto — sem dependências formais
      const { data: proj } = await supabase.from('projects').select('*').eq('id', id).single();
      if (!proj) return res.status(404).json({ error: 'Projeto não encontrado' });
      res.json({ item: proj, dependentes: [], total_impactados: 0, custo_impactado: 0, delta_dias: 0 });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════
// EDIÇÃO DIRETA — salva + loga + retorna impacto
// ══════════════════════════════════════════════

// PUT /api/revisoes/projeto/:id
router.put('/projeto/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { motivo, ...campos } = req.body;
    const allowed = ['name', 'year', 'description', 'status', 'responsible', 'area', 'date_start', 'date_end', 'budget_planned', 'budget_spent', 'priority', 'notes'];
    const update = {};
    for (const k of allowed) { if (campos[k] !== undefined) update[k] = campos[k]; }
    if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

    // Buscar valores atuais para log
    const { data: antes } = await supabase.from('projects').select('*').eq('id', req.params.id).single();
    if (!antes) return res.status(404).json({ error: 'Projeto não encontrado' });

    const { data, error } = await supabase.from('projects').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;

    // Logar cada campo alterado
    const logs = [];
    for (const [campo, valor] of Object.entries(update)) {
      const anterior = antes[campo];
      if (String(anterior ?? '') !== String(valor ?? '')) {
        logs.push({
          tipo: 'projeto', item_id: req.params.id, item_nome: antes.name,
          campo, valor_anterior: String(anterior ?? ''), valor_novo: String(valor ?? ''),
          motivo: motivo || null, changed_by: req.user.userId, changed_by_name: req.user.name,
        });
      }
    }
    if (logs.length > 0) await supabase.from('revision_log').insert(logs);

    res.json({ item: data, alteracoes: logs.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/revisoes/expansao/:id
router.put('/expansao/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { motivo, ...campos } = req.body;
    const allowed = ['name', 'description', 'status', 'responsible', 'area', 'date_start', 'date_end', 'budget_planned', 'budget_spent', 'phase', 'year'];
    const update = {};
    for (const k of allowed) { if (campos[k] !== undefined) update[k] = campos[k]; }
    if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

    // Buscar valores atuais
    const { data: antes } = await supabase.from('expansion_milestones').select('*').eq('id', req.params.id).single();
    if (!antes) return res.status(404).json({ error: 'Marco não encontrado' });

    const { data, error } = await supabase.from('expansion_milestones').update(update).eq('id', req.params.id).select().single();
    if (error) throw error;

    // Logar
    const logs = [];
    for (const [campo, valor] of Object.entries(update)) {
      const anterior = antes[campo];
      if (String(anterior ?? '') !== String(valor ?? '')) {
        logs.push({
          tipo: 'expansao', item_id: req.params.id, item_nome: antes.name,
          campo, valor_anterior: String(anterior ?? ''), valor_novo: String(valor ?? ''),
          motivo: motivo || null, changed_by: req.user.userId, changed_by_name: req.user.name,
        });
      }
    }
    if (logs.length > 0) await supabase.from('revision_log').insert(logs);

    res.json({ item: data, alteracoes: logs.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════
// HISTÓRICO DE ALTERAÇÕES
// ══════════════════════════════════════════════

router.get('/historico', async (req, res) => {
  try {
    const { tipo, item_id, limit: lim } = req.query;
    let q = supabase.from('revision_log').select('*').order('created_at', { ascending: false }).limit(Number(lim) || 100);
    if (tipo) q = q.eq('tipo', tipo);
    if (item_id) q = q.eq('item_id', item_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
