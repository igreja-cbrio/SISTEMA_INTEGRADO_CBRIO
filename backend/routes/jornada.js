const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

const CRON_SECRET = process.env.CRON_SECRET;

// Cron: refresh da view materializada (chamado por Vercel cron horario).
// Definido ANTES de router.use(authenticate) pra Vercel cron chamar sem login.
const { isAuthorizedCron } = require('../utils/cronAuth');
async function autorizaCron(req, res, next) {
  if (!isAuthorizedCron(req)) {
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
 * 3. Investir Tempo com Deus: jornada 180 com encontro nos últimos 90 dias (cui_jornada180)
 * 4. Servir em Comunidade: voluntário ativo (mem_voluntarios até IS NULL)
 * 5. Viver Generosamente: contribuição nos últimos 90 dias (mem_contribuicoes)
 */

function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }

// Lê todos os valores de uma coluna contornando o cap de 1000 do PostgREST.
async function fetchAllIds(table, buildQuery, col = 'id') {
  const page = 1000; let from = 0; const out = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await buildQuery(supabase.from(table)).range(from, from + page - 1);
    if (error) throw error;
    if (!data || !data.length) break;
    for (const r of data) if (r[col] != null) out.push(r[col]);
    if (data.length < page) break;
    from += page;
  }
  return out;
}

// Conjunto de membro_id distintos de uma tabela de valor (paginado, sem cap).
async function fetchMembroSet(table, applyFilter) {
  const ids = await fetchAllIds(table, (q) => applyFilter(q.select('membro_id').is('deleted_at', null)), 'membro_id');
  return new Set(ids.filter(Boolean));
}

// ── GET /api/jornada/dashboard ──
router.get('/dashboard', async (req, res) => {
  try {
    // Base = MEMBROS formais (status 'membro_ativo'). Decisão do Matheus
    // (2026-06-19): o engajamento é "% dos membros", não da base inteira —
    // visitantes do wifi/import do Next NÃO contam (continuam como visitante).
    // Os numeradores também são restritos a esses membros (interseção).
    const memberIds = await fetchAllIds('mem_membros', (q) =>
      q.select('id').is('deleted_at', null).eq('active', true).eq('status', 'membro_ativo'), 'id');
    const memberSet = new Set(memberIds);
    const total = memberIds.length || 1;
    const inter = (set) => { let n = 0; for (const id of set) if (memberSet.has(id)) n++; return n; };

    // membro_ids distintos com cada valor (paginado), depois ∩ membros
    const [seguirSet, conectarSet, investirSet, servirSet, genSet] = await Promise.all([
      fetchMembroSet('mem_trilha_valores', (q) => q.in('etapa', ['conversao', 'primeiro_contato', 'batismo']).eq('concluida', true)),
      fetchMembroSet('mem_grupo_membros', (q) => q.is('saiu_em', null)),
      // Investir Tempo com Deus = devocional feito no app (mem_devocionais ·
      // decisão Matheus 2026-06-20). Antes era cui_jornada180.
      fetchMembroSet('mem_devocionais', (q) => q.eq('concluida', true).gte('data_devocional', daysAgo(90))),
      fetchMembroSet('mem_voluntarios', (q) => q.is('ate', null)),
      fetchMembroSet('mem_contribuicoes', (q) => q.gte('data', daysAgo(90))),
    ]);

    const seguirCount = inter(seguirSet);
    const conectar = inter(conectarSet);
    const investirCount = inter(investirSet);
    const servir = inter(servirSet);
    const genCount = inter(genSet);

    res.json({
      total_membros: memberIds.length,
      valores: {
        seguir:       { total: seguirCount, pct: Math.round((seguirCount / total) * 100) },
        conectar:     { total: conectar, pct: Math.round((conectar / total) * 100) },
        investir:     { total: investirCount, pct: Math.round((investirCount / total) * 100) },
        servir:       { total: servir, pct: Math.round((servir / total) * 100) },
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

    // Base = membros formais (consistente com o dashboard 5 valores · 2026-06-19)
    let q = supabase.from('mem_membros').select('id, nome, email, telefone, status, foto_url', { count: 'exact' })
      .is('deleted_at', null)
      .eq('active', true).eq('status', 'membro_ativo').order('nome').range(offset, offset + parseInt(limit) - 1);
    if (search) q = q.ilike('nome', `%${search}%`);

    const { data: membros, count: totalCount, error } = await q;
    if (error) throw error;
    if (!membros || membros.length === 0) return res.json({ membros: [], total: 0 });

    const ids = membros.map(m => m.id);

    const [trilha, grupos, j180, voluntarios, contribuicoes] = await Promise.all([
      supabase.from('mem_trilha_valores').select('membro_id, etapa, concluida').is('deleted_at', null).in('membro_id', ids).eq('concluida', true),
      supabase.from('mem_grupo_membros').select('membro_id').is('deleted_at', null).in('membro_id', ids).is('saiu_em', null),
      supabase.from('mem_devocionais').select('membro_id').is('deleted_at', null).in('membro_id', ids).eq('concluida', true).gte('data_devocional', daysAgo(90)),
      supabase.from('mem_voluntarios').select('membro_id').is('deleted_at', null).in('membro_id', ids).is('ate', null),
      supabase.from('mem_contribuicoes').select('membro_id').is('deleted_at', null).in('membro_id', ids).gte('data', daysAgo(90)),
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

    // FIX: filtro "Sem: X" = membros que NÃO tem o valor (! correto)
    let filtered = result;
    if (valor) filtered = result.filter(m => !m.valores[valor]);

    // FIX: total reflete resultado filtrado, não o total geral
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
      supabase.from('mem_trilha_valores').select('*').is('deleted_at', null).eq('membro_id', id).order('created_at'),
      supabase.from('mem_grupo_membros').select('*, mem_grupos(nome)').is('deleted_at', null).eq('membro_id', id).order('entrou_em', { ascending: false }),
      supabase.from('cui_jornada180').select('*').is('deleted_at', null).eq('membro_id', id).order('data_encontro', { ascending: false }),
      supabase.from('mem_voluntarios').select('*, mem_ministerios(nome)').is('deleted_at', null).eq('membro_id', id).order('desde', { ascending: false }),
      supabase.from('mem_contribuicoes').select('*').is('deleted_at', null).eq('membro_id', id).order('data', { ascending: false }).limit(10),
    ]);

    if (membro.error || !membro.data) return res.status(404).json({ error: 'Membro não encontrado' });

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
// Cruza combinacoes livres de critérios entre os 5 valores da Jornada
// e papéis (voluntário, visitante, NEXT, grupos ativos, contribuinte).
//
// Le da vw_pessoas_papeis_mat via função SQL cruzar_pessoas() · 1 query.
// Escala até 100k+ pessoas (antes carregava 50k linhas em memória JS).
//
// Body: { critérios: { seguir: 'tem'|'nao_tem'|null, ... }, limit, offset }
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

    // Set de critérios ativos pra retornar pro client (debug/exibicao)
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
// Refresh forcado da view materializada. Quando você acabou de inserir
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
