const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

const CRON_SECRET = process.env.CRON_SECRET;

// Cron: refresh da view materializada (chamado por Vercel cron horario).
// Definido ANTES de router.use(authenticate) pra Vercel cron chamar sem login.
async function autorizaCron(req, res, next) {
  const auth = req.headers['x-cron-secret'] || req.headers['authorization'];
  const isVercelCron = req.headers['user-agent']?.includes('vercel-cron');
  if (!isVercelCron && auth !== CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}

async function refreshPapeis(_req, res) {
  try {
    const { data, error } = await supabase.rpc('refresh_vw_pessoas_papeis_mat');
    if (error) throw error;
    res.json({ ok: true, resultado: data });
  } catch (e) {
    console.error('[jornada/cron/refresh-papeis]', e.message);
    res.status(500).json({ error: e.message });
  }
}

router.get('/cron/refresh-papeis', autorizaCron, refreshPapeis);
router.post('/cron/refresh-papeis', autorizaCron, refreshPapeis);

router.use(authenticate);

/**
 * Calcula os 5 valores para cada membro:
 * 1. Seguir a Jesus: conversao/batismo (trilha_valores, batismo_inscricoes, cui_convertidos)
 * 2. Conectar-se com Pessoas: em grupo ativo (mem_grupo_membros)
 * 3. Investir Tempo com Deus: jornada 180 com encontro nos ultimos 90 dias (cui_jornada180)
 * 4. Servir em Comunidade: voluntario ativo (mem_voluntarios ate IS NULL)
 * 5. Viver Generosamente: contribuicao nos ultimos 90 dias (mem_contribuicoes)
 */

function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }

// ── GET /api/jornada/dashboard ──
router.get('/dashboard', async (req, res) => {
  try {
    const { count: totalMembros } = await supabase
      .from('mem_membros').select('id', { count: 'exact', head: true })
      .eq('active', true);

    // 1. Seguir a Jesus: trilha_valores com conversao/primeiro_contato concluida
    let seguirCount = 0;
    const { count: seguirQ } = await supabase.from('mem_trilha_valores')
      .select('membro_id', { count: 'exact', head: true })
      .in('etapa', ['conversao', 'primeiro_contato', 'batismo'])
      .eq('concluida', true);
    seguirCount = seguirQ || 0;

    // 2. Conectar: em grupo ativo
    const { count: conectar } = await supabase
      .from('mem_grupo_membros').select('membro_id', { count: 'exact', head: true })
      .is('saiu_em', null);

    // 3. Investir: jornada 180 com encontro nos ultimos 90 dias (usa data_encontro)
    const { data: j180Ids } = await supabase
      .from('cui_jornada180').select('membro_id')
      .gte('data_encontro', daysAgo(90));
    const investirCount = new Set((j180Ids || []).map(r => r.membro_id).filter(Boolean)).size;

    // 4. Servir: voluntario ativo (ate IS NULL)
    const { count: servir } = await supabase
      .from('mem_voluntarios').select('membro_id', { count: 'exact', head: true })
      .is('ate', null);

    // 5. Generosidade: contribuicao nos ultimos 90 dias
    const { data: genIds } = await supabase
      .from('mem_contribuicoes').select('membro_id')
      .gte('data', daysAgo(90));
    const genCount = new Set((genIds || []).map(r => r.membro_id).filter(Boolean)).size;

    const total = totalMembros || 1;
    res.json({
      total_membros: totalMembros || 0,
      valores: {
        seguir:       { total: seguirCount, pct: Math.round((seguirCount / total) * 100) },
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

    let q = supabase.from('mem_membros').select('id, nome, email, telefone, status, foto_url', { count: 'exact' })
      .eq('active', true).order('nome').range(offset, offset + parseInt(limit) - 1);
    if (search) q = q.ilike('nome', `%${search}%`);

    const { data: membros, count: totalCount, error } = await q;
    if (error) throw error;
    if (!membros || membros.length === 0) return res.json({ membros: [], total: 0 });

    const ids = membros.map(m => m.id);

    const [trilha, grupos, j180, voluntarios, contribuicoes] = await Promise.all([
      supabase.from('mem_trilha_valores').select('membro_id, etapa, concluida').in('membro_id', ids).eq('concluida', true),
      supabase.from('mem_grupo_membros').select('membro_id').in('membro_id', ids).is('saiu_em', null),
      supabase.from('cui_jornada180').select('membro_id').in('membro_id', ids).gte('data_encontro', daysAgo(90)),
      supabase.from('mem_voluntarios').select('membro_id').in('membro_id', ids).is('ate', null),
      supabase.from('mem_contribuicoes').select('membro_id').in('membro_id', ids).gte('data', daysAgo(90)),
    ]);

    const trilhaSet = new Set((trilha.data || []).filter(t => ['conversao', 'primeiro_contato', 'batismo'].includes(t.etapa)).map(t => t.membro_id));
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

    // FIX: filtro "Sem: X" = membros que NAO tem o valor (! correto)
    let filtered = result;
    if (valor) filtered = result.filter(m => !m.valores[valor]);

    // FIX: total reflete resultado filtrado, nao o total geral
    res.json({ membros: filtered, total: valor ? filtered.length : (totalCount || 0) });
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
      supabase.from('cui_jornada180').select('*').eq('membro_id', id).order('data_encontro', { ascending: false }),
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
    const j180Recente = (j180.data || []).find(j => {
      const diff = (Date.now() - new Date(j.data_encontro).getTime()) / 86400000;
      return diff <= 90;
    });
    const trilhaConversao = (trilha.data || []).find(t => ['conversao', 'primeiro_contato', 'batismo'].includes(t.etapa) && t.concluida);

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

// ── POST /api/jornada/cruzar ──
// Cruza combinacoes livres de criterios entre os 5 valores da Jornada
// e papeis (voluntario, visitante, NEXT, grupos ativos, contribuinte).
//
// Le da vw_pessoas_papeis_mat via funcao SQL cruzar_pessoas() · 1 query.
// Escala ate 100k+ pessoas (antes carregava 50k linhas em memoria JS).
//
// Body: { criterios: { seguir: 'tem'|'nao_tem'|null, ... }, limit, offset }
router.post('/cruzar', async (req, res) => {
  try {
    const criterios = req.body?.criterios || {};
    const limit = Math.min(Number(req.body?.limit) || 200, 500);
    const offset = Math.max(Number(req.body?.offset) || 0, 0);

    const { data, error } = await supabase.rpc('cruzar_pessoas', {
      p_criterios: criterios,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) throw error;

    // Set de criterios ativos pra retornar pro client (debug/exibicao)
    const VALIDOS = ['seguir', 'conectar', 'investir', 'servir', 'generosidade',
                     'voluntario', 'visitante', 'inscrito_next', 'grupo_ativo', 'contribuinte'];
    const ativos = {};
    for (const k of VALIDOS) {
      if (criterios[k] === 'tem' || criterios[k] === 'nao_tem') ativos[k] = criterios[k];
    }

    res.json({ ...data, criterios_ativos: ativos });
  } catch (e) {
    console.error('jornada cruzar:', e.message);
    res.status(500).json({ error: 'Erro ao cruzar dados' });
  }
});

// ── POST /api/jornada/refresh-papeis (manual · admin/diretor) ──
// Refresh forcado da view materializada. Quando voce acabou de inserir
// dados e quer ver no /cruzamentos sem esperar o cron horario.
router.post('/refresh-papeis', async (req, res) => {
  if (!['admin', 'diretor'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Apenas admin/diretor pode forcar refresh' });
  }
  try {
    const { data, error } = await supabase.rpc('refresh_vw_pessoas_papeis_mat');
    if (error) throw error;
    res.json({ ok: true, resultado: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
