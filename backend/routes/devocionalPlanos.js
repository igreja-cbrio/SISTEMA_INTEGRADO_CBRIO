// ============================================================================
// Devocional · planos mensais (admin) + geracao IA + dashboard de adesao
// ============================================================================

const router = require('express').Router();
const Anthropic = require('@anthropic-ai/sdk');
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const devSender = require('../services/devocionalSender');

// ─────────────────────────────────────────────────────────────
// GET|POST /api/devocional-planos/cron/enviar-diario
//   Endpoint do cron Vercel · 06:00 BRT (09:00 UTC) diario
//   Autenticado por CRON_SECRET ou user-agent vercel-cron
// ─────────────────────────────────────────────────────────────
async function cronEnviarDiario(req, res) {
  const auth = req.headers['x-cron-secret'] || req.headers['authorization'];
  const isVercelCron = req.headers['user-agent']?.includes('vercel-cron');
  const CRON_SECRET = process.env.CRON_SECRET;
  if (!isVercelCron && auth !== CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const r = await devSender.enviarDoDia();
    console.log('[devocional-cron] resultado:', r);
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[devocional-cron]:', e.message);
    res.status(500).json({ error: e.message });
  }
}
router.get('/cron/enviar-diario', cronEnviarDiario);
router.post('/cron/enviar-diario', cronEnviarDiario);

// Tudo abaixo requer autenticacao normal
router.use(authenticate);

// Helper: yyyy-mm-dd → Date
function parseDate(s) { return new Date(s + 'T12:00:00'); }
function fmtDate(d) { return d.toISOString().slice(0, 10); }
function eachDay(inicio, fim) {
  const out = [];
  const cur = parseDate(inicio);
  const end = parseDate(fim);
  while (cur <= end) {
    out.push(fmtDate(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// GET /api/devocional-planos — lista planos
// ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('devocional_planos')
      .select('*, devocional_itens(count)')
      .order('data_inicio', { ascending: false });
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (e) {
    console.error('devocional-planos list:', e.message);
    res.status(500).json({ error: 'Erro ao listar planos' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/devocional-planos/:id — plano + itens
// ─────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { data: plano, error: e1 } = await supabase
      .from('devocional_planos')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (e1) throw e1;
    const { data: itens, error: e2 } = await supabase
      .from('devocional_itens')
      .select('*')
      .eq('plano_id', req.params.id)
      .order('data', { ascending: true });
    if (e2) throw e2;
    res.json({ plano, itens: itens || [] });
  } catch (e) {
    console.error('devocional-planos detail:', e.message);
    res.status(500).json({ error: 'Erro ao buscar plano' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/devocional-planos — cria plano (sem itens)
// body: { titulo, descricao?, data_inicio, data_fim, ativo? }
// ─────────────────────────────────────────────────────────────
router.post('/', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { titulo, descricao, data_inicio, data_fim, ativo = true } = req.body || {};
    if (!titulo || !data_inicio || !data_fim) {
      return res.status(400).json({ error: 'titulo, data_inicio e data_fim sao obrigatorios' });
    }
    const { data, error } = await supabase
      .from('devocional_planos')
      .insert({ titulo, descricao, data_inicio, data_fim, ativo, criado_por: req.user?.id || null })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('devocional-planos create:', e.message);
    res.status(500).json({ error: 'Erro ao criar plano' });
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/devocional-planos/:id
// ─────────────────────────────────────────────────────────────
router.put('/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const patch = {};
    ['titulo', 'descricao', 'data_inicio', 'data_fim', 'ativo'].forEach(k => {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    });
    const { data, error } = await supabase
      .from('devocional_planos')
      .update(patch)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('devocional-planos update:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar plano' });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/devocional-planos/:id
// ─────────────────────────────────────────────────────────────
router.delete('/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase
      .from('devocional_planos')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (e) {
    console.error('devocional-planos delete:', e.message);
    res.status(500).json({ error: 'Erro ao deletar plano' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/devocional-planos/:id/gerar-ia
// body: { tema?, tom?, sobrescrever?, apenas_datas?: string[] }
// Gera ate 10 itens por chamada usando Haiku (fica dentro do timeout
// de 60s da Vercel). Frontend chama em lotes pra cobrir todo o plano.
//   - sem apenas_datas: gera ate 10 dias pendentes
//   - com apenas_datas: gera so as datas listadas (filtra existentes)
// ─────────────────────────────────────────────────────────────
const BATCH_MAX = 10;

router.post('/:id/gerar-ia', authorize('admin', 'diretor'), async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY nao configurada' });
    }
    const {
      tema = '',
      tom = 'pastoral, edificante, com aplicacao pratica',
      sobrescrever = false,
      apenas_datas,
    } = req.body || {};

    const { data: plano, error: e1 } = await supabase
      .from('devocional_planos')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (e1) throw e1;

    const todasDias = eachDay(plano.data_inicio, plano.data_fim);
    const candidatas = Array.isArray(apenas_datas) && apenas_datas.length
      ? apenas_datas.filter(d => todasDias.includes(d))
      : todasDias;

    const { data: existentes } = await supabase
      .from('devocional_itens')
      .select('data')
      .eq('plano_id', plano.id);
    const setExistente = new Set((existentes || []).map(r => r.data));
    const pendentes = sobrescrever ? candidatas : candidatas.filter(d => !setExistente.has(d));

    // Limita o lote pra caber no timeout do Vercel
    const diasAlvo = pendentes.slice(0, BATCH_MAX);
    const restantes = Math.max(0, pendentes.length - diasAlvo.length);

    if (diasAlvo.length === 0) {
      return res.json({
        message: 'Todos os dias solicitados ja tem item',
        criados: 0,
        restantes: 0,
        total_pendentes: 0,
      });
    }

    const client = new Anthropic();
    const systemPrompt = `Voce e um pastor protestante brasileiro escrevendo devocionais diarios para a Igreja CBRio. Estilo: ${tom}. Cada devocional deve ter passagem biblica curta (1-3 versiculos), reflexao de 4-6 paragrafos curtos, aplicacao pratica em 1 paragrafo, e uma oracao curta. Use linguagem acessivel e contemporanea. NUNCA cite mais de uma passagem central por devocional.`;

    const userPrompt = `Gere ${diasAlvo.length} devocionais diarios para o plano "${plano.titulo}".
${tema ? `Tema/serie: ${tema}\n` : ''}${plano.descricao ? `Contexto: ${plano.descricao}\n` : ''}
Datas (uma por devocional, na ordem):
${diasAlvo.map((d, i) => `${i + 1}. ${d}`).join('\n')}

Retorne APENAS um JSON array (sem markdown, sem texto fora do JSON) com ${diasAlvo.length} objetos no formato:
[
  {
    "data": "yyyy-mm-dd",
    "titulo": "...",
    "passagem": "Livro Cap:Vers",
    "reflexao": "...",
    "aplicacao": "...",
    "oracao": "..."
  }
]`;

    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = resp.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '';
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    let arr;
    try { arr = JSON.parse(cleaned); }
    catch (err) {
      console.error('IA JSON parse error:', err.message, 'raw:', text.slice(0, 500));
      return res.status(500).json({ error: 'IA retornou JSON invalido', preview: text.slice(0, 300) });
    }
    if (!Array.isArray(arr)) return res.status(500).json({ error: 'IA nao retornou array' });

    if (sobrescrever) {
      const datasSobrescrever = diasAlvo;
      await supabase
        .from('devocional_itens')
        .delete()
        .eq('plano_id', plano.id)
        .in('data', datasSobrescrever);
    }

    const rows = arr
      .filter(o => o && o.data && o.titulo && o.reflexao)
      .map(o => ({
        plano_id: plano.id,
        data: o.data,
        titulo: String(o.titulo).slice(0, 200),
        passagem: o.passagem ? String(o.passagem).slice(0, 100) : null,
        reflexao: String(o.reflexao),
        aplicacao: o.aplicacao ? String(o.aplicacao) : null,
        oracao: o.oracao ? String(o.oracao) : null,
        gerado_por_ia: true,
      }));

    if (rows.length === 0) return res.status(500).json({ error: 'IA nao retornou itens validos' });

    const { error: e2 } = await supabase.from('devocional_itens').insert(rows);
    if (e2) throw e2;

    res.json({
      criados: rows.length,
      total_solicitado: diasAlvo.length,
      restantes,
    });
  } catch (e) {
    console.error('devocional-planos gerar-ia:', e.message);
    res.status(500).json({ error: e.message || 'Erro na geracao IA' });
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/devocional-planos/itens/:id — editar item
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// POST /api/devocional-planos/:id/itens — criar item manualmente
// body: { data, titulo, passagem?, reflexao, aplicacao?, oracao? }
// ─────────────────────────────────────────────────────────────
router.post('/:id/itens', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, titulo, passagem, reflexao, aplicacao, oracao } = req.body || {};
    if (!data || !titulo || !reflexao) {
      return res.status(400).json({ error: 'data, titulo e reflexao sao obrigatorios' });
    }
    const { data: novo, error } = await supabase
      .from('devocional_itens')
      .insert({
        plano_id: req.params.id,
        data,
        titulo,
        passagem: passagem || null,
        reflexao,
        aplicacao: aplicacao || null,
        oracao: oracao || null,
        gerado_por_ia: false,
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Ja existe item pra essa data' });
      throw error;
    }
    res.status(201).json(novo);
  } catch (e) {
    console.error('devocional-itens create:', e.message);
    res.status(500).json({ error: 'Erro ao criar item' });
  }
});

router.put('/itens/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const patch = {};
    ['titulo', 'passagem', 'passagem_texto', 'reflexao', 'aplicacao', 'oracao'].forEach(k => {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    });
    const { data, error } = await supabase
      .from('devocional_itens')
      .update(patch)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('devocional-itens update:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar item' });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/devocional-planos/itens/:id
// ─────────────────────────────────────────────────────────────
router.delete('/itens/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase.from('devocional_itens').delete().eq('id', req.params.id);
    if (error) throw error;
    res.status(204).end();
  } catch (e) {
    console.error('devocional-itens delete:', e.message);
    res.status(500).json({ error: 'Erro ao deletar item' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/devocional-planos/:id/adesao
//   ?detalhe=membros — se passar, retorna lista de membros (cuidado: 50k+)
// ─────────────────────────────────────────────────────────────
router.get('/:id/adesao', async (req, res) => {
  try {
    const planoId = req.params.id;
    const { detalhe } = req.query;

    const { data: dias, error: e1 } = await supabase
      .from('vw_devocional_adesao_dia')
      .select('*')
      .eq('plano_id', planoId)
      .order('data', { ascending: true });
    if (e1) throw e1;

    const { count: totalMembros } = await supabase
      .from('mem_membros')
      .select('id', { count: 'exact', head: true })
      .eq('active', true)
      .in('status', ['membro_ativo', 'membro', 'frequentador']);

    const diasComPct = (dias || []).map(d => ({
      ...d,
      total_membros: totalMembros || 0,
      pct_adesao: totalMembros > 0 ? Math.round((d.check_ins / totalMembros) * 100) : 0,
    }));

    const resposta = { dias: diasComPct, total_membros: totalMembros || 0 };

    if (detalhe === 'membros') {
      const { data: detalheData, error: e2 } = await supabase
        .from('vw_devocional_adesao_membro')
        .select('membro_id, membro_nome, foto_url, data, concluido, item_id')
        .eq('plano_id', planoId)
        .order('membro_nome', { ascending: true });
      if (e2) throw e2;
      resposta.detalhe = detalheData || [];
    }

    res.json(resposta);
  } catch (e) {
    console.error('devocional-planos adesao:', e.message);
    res.status(500).json({ error: 'Erro ao calcular adesao' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/devocional-planos/:id/enviar-hoje
//   Disparo manual (admin) · envia o item de hoje do plano informado.
//   So envia se o plano tiver item com data == hoje.
// ─────────────────────────────────────────────────────────────
router.post('/:id/enviar-hoje', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const { data: item, error } = await supabase
      .from('devocional_itens')
      .select('id, plano_id, titulo, passagem, data, devocional_planos!inner(id, ativo)')
      .eq('plano_id', req.params.id)
      .eq('data', hoje)
      .maybeSingle();
    if (error) throw error;
    if (!item) return res.status(404).json({ error: 'Plano nao tem item pra hoje' });
    if (!item.devocional_planos?.ativo) return res.status(400).json({ error: 'Plano esta inativo' });

    const r = await devSender.enviarDoDia({ item });
    res.json(r);
  } catch (e) {
    console.error('devocional-planos enviar-hoje:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/devocional-planos/:id/envios
//   Lista envios agregados por item do plano + ultimos N erros.
// ─────────────────────────────────────────────────────────────
router.get('/:id/envios', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('devocional_envios')
      .select('item_id, enviado, motivo, devocional_itens!inner(id, data, titulo)')
      .eq('plano_id', req.params.id)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const porItem = new Map();
    for (const e of data || []) {
      const key = e.item_id;
      if (!porItem.has(key)) {
        porItem.set(key, {
          item_id: key,
          data: e.devocional_itens?.data,
          titulo: e.devocional_itens?.titulo,
          enviados: 0,
          erros: 0,
          ultimos_motivos: {},
        });
      }
      const agg = porItem.get(key);
      if (e.enviado) agg.enviados++;
      else {
        agg.erros++;
        if (e.motivo) agg.ultimos_motivos[e.motivo] = (agg.ultimos_motivos[e.motivo] || 0) + 1;
      }
    }
    const itens = Array.from(porItem.values()).sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    res.json({ itens });
  } catch (e) {
    console.error('devocional-planos envios:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/devocional-planos/metricas-cuidados
//   Resumo pro dashboard do modulo Cuidados:
//   - checkins_hoje · membros que fizeram check-in hoje
//   - checkins_7d · check-ins distintos nos ultimos 7 dias
//   - membros_engajados_30d · membros com >=1 check-in nos ultimos 30d
//   - planos_ativos · count planos com ativo=true
//   - adesao_hoje_pct · checkins_hoje / membros logados (is_membro_only=true)
// ─────────────────────────────────────────────────────────────
router.get('/metricas-cuidados', async (req, res) => {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const d7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const d30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const [
      { count: checkinsHoje },
      { count: planosAtivos },
      { count: membrosLogados },
      { data: checkins7d },
      { data: checkins30d },
    ] = await Promise.all([
      supabase.from('mem_devocionais').select('id', { count: 'exact', head: true }).eq('data_devocional', hoje),
      supabase.from('devocional_planos').select('id', { count: 'exact', head: true }).eq('ativo', true),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_membro_only', true).not('membro_id', 'is', null),
      supabase.from('mem_devocionais').select('membro_id, data_devocional').gte('data_devocional', d7),
      supabase.from('mem_devocionais').select('membro_id').gte('data_devocional', d30),
    ]);

    const checkins7dCount = (checkins7d || []).length;
    const membrosEngajados30d = new Set((checkins30d || []).map(r => r.membro_id)).size;
    const adesaoHojePct = (membrosLogados || 0) > 0
      ? Math.round(((checkinsHoje || 0) / (membrosLogados || 1)) * 100)
      : 0;

    res.json({
      checkins_hoje: checkinsHoje || 0,
      checkins_7d: checkins7dCount,
      membros_engajados_30d: membrosEngajados30d,
      planos_ativos: planosAtivos || 0,
      membros_logados: membrosLogados || 0,
      adesao_hoje_pct: adesaoHojePct,
    });
  } catch (e) {
    console.error('devocional-planos/metricas-cuidados:', e.message);
    res.status(500).json({ error: 'Erro ao calcular metricas' });
  }
});

module.exports = router;
