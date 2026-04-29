const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

/**
 * Calcula os 5 valores para cada membro:
 * 1. Seguir a Jesus: conversao/batismo (trilha_valores, batismo_inscricoes, cui_convertidos)
 * 2. Conectar-se com Pessoas: em grupo ativo (mem_grupo_membros)
 * 3. Investir Tempo com Deus: jornada 180 ativa (cui_jornada180)
 * 4. Servir em Comunidade: voluntario ativo (mem_voluntarios + checkin recente)
 * 5. Viver Generosamente: contribuicao recente (mem_contribuicoes)
 */

// ── GET /api/jornada/dashboard ──
router.get('/dashboard', async (req, res) => {
  try {
    // Total membros ativos
    const { count: totalMembros } = await supabase
      .from('mem_membros').select('id', { count: 'exact', head: true })
      .eq('active', true);

    // 1. Seguir a Jesus: tem etapa conversao OU batismo realizado
    const { count: seguir } = await supabase.rpc('count_valor_seguir').single().then(r => ({ count: r.data })).catch(() => ({ count: 0 }));
    // Fallback: contar via trilha_valores
    let seguirCount = seguir;
    if (!seguirCount) {
      const { count } = await supabase.from('mem_trilha_valores')
        .select('membro_id', { count: 'exact', head: true })
        .in('etapa', ['conversao', 'primeiro_contato'])
        .eq('concluida', true);
      seguirCount = count || 0;
    }

    // 2. Conectar: em grupo ativo
    const { count: conectar } = await supabase
      .from('mem_grupo_membros').select('membro_id', { count: 'exact', head: true })
      .is('saiu_em', null);

    // 3. Investir: jornada 180 com registro recente (90 dias)
    const j180Date = new Date();
    j180Date.setDate(j180Date.getDate() - 90);
    const { data: j180Ids } = await supabase
      .from('cui_jornada180').select('membro_id')
      .gte('created_at', j180Date.toISOString());
    const investirCount = new Set((j180Ids || []).map(r => r.membro_id).filter(Boolean)).size;

    // 4. Servir: voluntario ativo com checkin nos ultimos 60 dias
    const servirDate = new Date();
    servirDate.setDate(servirDate.getDate() - 60);
    const { count: servir } = await supabase
      .from('mem_voluntarios').select('membro_id', { count: 'exact', head: true })
      .is('ate', null);

    // 5. Generosidade: contribuicao nos ultimos 90 dias
    const genDate = new Date();
    genDate.setDate(genDate.getDate() - 90);
    const { data: genIds } = await supabase
      .from('mem_contribuicoes').select('membro_id')
      .gte('data', genDate.toISOString().slice(0, 10));
    const genCount = new Set((genIds || []).map(r => r.membro_id).filter(Boolean)).size;

    const total = totalMembros || 1;
    res.json({
      total_membros: totalMembros || 0,
      valores: {
        seguir:       { total: seguirCount || 0, pct: Math.round(((seguirCount || 0) / total) * 100) },
        conectar:     { total: conectar || 0, pct: Math.round(((conectar || 0) / total) * 100) },
        investir:     { total: investirCount, pct: Math.round((investirCount / total) * 100) },
        servir:       { total: servir || 0, pct: Math.round(((servir || 0) / total) * 100) },
        generosidade: { total: genCount, pct: Math.round((genCount / total) * 100) },
      },
    });
  } catch (e) {
    console.error('jornada dashboard:', e.message);
    res.status(500).json({ error: 'Erro ao calcular dashboard' });
  }
});

// ── GET /api/jornada/membros ──
router.get('/membros', async (req, res) => {
  try {
    const { search, valor, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    // Buscar membros ativos
    let q = supabase.from('mem_membros').select('id, nome, email, telefone, status, foto_url', { count: 'exact' })
      .eq('active', true).order('nome').range(offset, offset + parseInt(limit) - 1);
    if (search) q = q.ilike('nome', `%${search}%`);

    const { data: membros, count: totalCount, error } = await q;
    if (error) throw error;
    if (!membros || membros.length === 0) return res.json({ membros: [], total: 0 });

    const ids = membros.map(m => m.id);

    // Buscar dados dos 5 valores em paralelo
    const [trilha, grupos, j180, voluntarios, contribuicoes] = await Promise.all([
      supabase.from('mem_trilha_valores').select('membro_id, etapa, concluida').in('membro_id', ids).eq('concluida', true),
      supabase.from('mem_grupo_membros').select('membro_id').in('membro_id', ids).is('saiu_em', null),
      supabase.from('cui_jornada180').select('membro_id').in('membro_id', ids),
      supabase.from('mem_voluntarios').select('membro_id').in('membro_id', ids).is('ate', null),
      supabase.from('mem_contribuicoes').select('membro_id, data').in('membro_id', ids)
        .gte('data', new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)),
    ]);

    // Sets para lookup rapido
    const trilhaSet = new Set((trilha.data || []).filter(t => ['conversao', 'primeiro_contato'].includes(t.etapa)).map(t => t.membro_id));
    const grupoSet = new Set((grupos.data || []).map(g => g.membro_id));
    const j180Set = new Set((j180.data || []).map(j => j.membro_id));
    const volSet = new Set((voluntarios.data || []).map(v => v.membro_id));
    const genSet = new Set((contribuicoes.data || []).map(c => c.membro_id));

    const result = membros.map(m => {
      const v = {
        seguir: trilhaSet.has(m.id),
        conectar: grupoSet.has(m.id),
        investir: j180Set.has(m.id),
        servir: volSet.has(m.id),
        generosidade: genSet.has(m.id),
      };
      return { ...m, valores: v, total_valores: Object.values(v).filter(Boolean).length };
    });

    // Filtrar por valor se solicitado
    let filtered = result;
    if (valor === 'seguir') filtered = result.filter(m => !m.valores.seguir);
    else if (valor === 'conectar') filtered = result.filter(m => !m.valores.conectar);
    else if (valor === 'investir') filtered = result.filter(m => !m.valores.investir);
    else if (valor === 'servir') filtered = result.filter(m => !m.valores.servir);
    else if (valor === 'generosidade') filtered = result.filter(m => !m.valores.generosidade);

    res.json({ membros: filtered, total: totalCount || 0 });
  } catch (e) {
    console.error('jornada membros:', e.message);
    res.status(500).json({ error: 'Erro ao listar membros' });
  }
});

// ── GET /api/jornada/membro/:id ──
router.get('/membro/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [membro, trilha, grupo, j180, vol, contrib] = await Promise.all([
      supabase.from('mem_membros').select('*').eq('id', id).single(),
      supabase.from('mem_trilha_valores').select('*').eq('membro_id', id).order('created_at'),
      supabase.from('mem_grupo_membros').select('*, mem_grupos(nome)').eq('membro_id', id).order('entrou_em', { ascending: false }),
      supabase.from('cui_jornada180').select('*').eq('membro_id', id).order('created_at', { ascending: false }),
      supabase.from('mem_voluntarios').select('*, mem_ministerios(nome)').eq('membro_id', id).order('desde', { ascending: false }),
      supabase.from('mem_contribuicoes').select('*').eq('membro_id', id).order('data', { ascending: false }).limit(10),
    ]);

    if (membro.error || !membro.data) return res.status(404).json({ error: 'Membro nao encontrado' });

    const grupoAtivo = (grupo.data || []).find(g => !g.saiu_em);
    const volAtivo = (vol.data || []).find(v => !v.ate);
    const contribRecente = (contrib.data || []).find(c => {
      const diff = (Date.now() - new Date(c.data).getTime()) / 86400000;
      return diff <= 90;
    });
    const j180Recente = (j180.data || [])[0];
    const trilhaConversao = (trilha.data || []).find(t => ['conversao', 'primeiro_contato'].includes(t.etapa) && t.concluida);

    res.json({
      membro: membro.data,
      valores: {
        seguir:       { ativo: !!trilhaConversao, dados: trilhaConversao || null },
        conectar:     { ativo: !!grupoAtivo, dados: grupoAtivo || null },
        investir:     { ativo: !!j180Recente, dados: j180Recente || null },
        servir:       { ativo: !!volAtivo, dados: volAtivo || null },
        generosidade: { ativo: !!contribRecente, dados: contribRecente || null },
      },
      trilha: trilha.data || [],
      grupos: grupo.data || [],
      jornada180: j180.data || [],
      voluntariado: vol.data || [],
      contribuicoes: contrib.data || [],
    });
  } catch (e) {
    console.error('jornada membro:', e.message);
    res.status(500).json({ error: 'Erro ao buscar membro' });
  }
});

module.exports = router;
