// ============================================================================
// Devocional · planos mensais (admin) + geração IA + dashboard de adesao
// ============================================================================

const router = require('express').Router();
const Anthropic = require('@anthropic-ai/sdk');
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const devSender = require('../services/devocionalSender');
const { isAuthorizedCron } = require('../utils/cronAuth');

// ─────────────────────────────────────────────────────────────
// GET|POST /api/devocional-planos/cron/enviar-diario
//   Endpoint do cron Vercel · 06:00 BRT (09:00 UTC) diario
//   Autenticado por CRON_SECRET (Vercel injeta Bearer; GitHub Actions x-cron-secret)
// ─────────────────────────────────────────────────────────────
async function cronEnviarDiario(req, res) {
  if (!isAuthorizedCron(req)) {
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

// ─────────────────────────────────────────────────────────────
// GET|POST /api/devocional-planos/cron/lancar-semanal
//   Cron Vercel · segunda-feira 05:00 BRT (08:00 UTC)
//   Lançamento SEMANAL dos devocionais (seg→sex):
//   1. desativa planos expirados (data_fim < hoje) — housekeeping
//   2. se já existe plano ATIVO cobrindo hoje → lançamento manual
//      aconteceu, não faz nada
//   3. senão → cria o plano da semana (seg–sex) e gera os 5 itens
//      via IA, já ativo (lançamento automático), e avisa os
//      responsáveis de Cuidados pra revisarem o conteúdo
// ─────────────────────────────────────────────────────────────
function hojeBRT() {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return p; // YYYY-MM-DD
}

async function cronLancarSemanal(req, res) {
  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const hoje = hojeBRT();
    const d = new Date(hoje + 'T12:00:00Z');
    const dow = d.getUTCDay();
    const seg = new Date(d); seg.setUTCDate(d.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
    const sex = new Date(seg); sex.setUTCDate(seg.getUTCDate() + 4);
    const segIso = seg.toISOString().slice(0, 10);
    const sexIso = sex.toISOString().slice(0, 10);

    // 1) desativa expirados
    const { data: expirados } = await supabase
      .from('devocional_planos')
      .update({ ativo: false })
      .eq('ativo', true)
      .lt('data_fim', hoje)
      .select('id');

    // 2) já tem plano ativo cobrindo hoje? (lançamento manual)
    const { data: vigentes } = await supabase
      .from('devocional_planos')
      .select('id, titulo')
      .eq('ativo', true)
      .lte('data_inicio', hoje)
      .gte('data_fim', hoje)
      .limit(1);
    if (vigentes && vigentes.length > 0) {
      return res.json({
        ok: true, modo: 'manual', plano: vigentes[0].titulo,
        expirados: expirados?.length || 0,
      });
    }

    // 3) lançamento automático: cria plano da semana + 5 itens por IA
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada' });
    }
    const [, mm, dd] = segIso.split('-');
    const { data: plano, error: e1 } = await supabase
      .from('devocional_planos')
      .insert({
        titulo: `Devocional da semana ${dd}/${mm}`,
        descricao: 'Lançamento automático semanal (gerado por IA — revise os itens)',
        data_inicio: segIso,
        data_fim: sexIso,
        ativo: true,
      })
      .select()
      .single();
    if (e1) throw e1;

    const dias = eachDay(segIso, sexIso);
    const rows = await gerarItensViaIA(plano, dias, '', 'pastoral, edificante, com aplicação pratica');
    const { error: e2 } = await supabase.from('devocional_itens').insert(rows);
    if (e2) throw e2;

    try {
      const { notificar } = require('../services/notificar');
      await notificar({
        modulo: 'cuidados',
        tipo: 'devocional_auto',
        titulo: 'Devocional da semana lançado automaticamente',
        mensagem: `Ninguém lançou o devocional desta semana até segunda 05:00 — o sistema criou "${plano.titulo}" com ${rows.length} itens por IA. Revise o conteúdo em Cuidados → Devocionais.`,
        link: '/ministerial/cuidados',
        chaveDedup: `devocional_auto_${segIso}`,
      });
    } catch (nErr) {
      console.error('[devocional-cron-semanal] notificar:', nErr.message);
    }

    console.log(`[devocional-cron-semanal] plano ${plano.id} criado com ${rows.length} itens`);
    res.json({ ok: true, modo: 'automatico', plano_id: plano.id, itens: rows.length, expirados: expirados?.length || 0 });
  } catch (e) {
    console.error('[devocional-cron-semanal]:', e.message);
    res.status(500).json({ error: e.message });
  }
}
router.get('/cron/lancar-semanal', cronLancarSemanal);
router.post('/cron/lancar-semanal', cronLancarSemanal);

// Tudo abaixo requer autenticação normal
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
// body: { título, descrição?, data_inicio, data_fim, ativo? }
// ─────────────────────────────────────────────────────────────
router.post('/', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { titulo, descricao, data_inicio, data_fim, ativo = true } = req.body || {};
    if (!titulo || !data_inicio || !data_fim) {
      return res.status(400).json({ error: 'título, data_inicio e data_fim são obrigatórios' });
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

// Gera itens devocionais via Haiku pra um conjunto de datas. Retorna as
// rows prontas pro insert em devocional_itens (NÃO insere). Usada pela
// rota gerar-ia (admin) e pelo cron de lançamento semanal.
async function gerarItensViaIA(plano, diasAlvo, tema, tom) {
  const client = new Anthropic();
  const systemPrompt = `Você e um pastor protestante brasileiro escrevendo devocionais diarios para a Igreja CBRio. Estilo: ${tom}.

Cada devocional deve ter:
- **passagem**: referência bíblica curta (1-3 versiculos) · formato "Livro Cap:Vers"
- **passagem_texto**: o TEXTO COMPLETO da passagem em portugues, traducao NAA ou ARA. NUNCA omita · a pessoa que le o devocional deve poder ler o texto bíblico ali mesmo, sem precisar abrir a Bíblia.
- **reflexao**: 4-6 paragrafos curtos
- **aplicação**: 1 paragrafo de aplicação pratica
- **oração**: oração curta encerrando

Use linguagem acessivel e contemporanea. NUNCA cite mais de uma passagem central por devocional.`;

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
    "passagem_texto": "Texto biblico completo aqui, em portugues",
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
    const e = new Error('IA retornou JSON invalido');
    e.preview = text.slice(0, 300);
    throw e;
  }
  if (!Array.isArray(arr)) throw new Error('IA não retornou array');

  const rows = arr
    .filter(o => o && o.data && o.titulo && o.reflexao)
    .map(o => ({
      plano_id: plano.id,
      data: o.data,
      titulo: String(o.titulo).slice(0, 200),
      passagem: o.passagem ? String(o.passagem).slice(0, 100) : null,
      passagem_texto: o.passagem_texto ? String(o.passagem_texto) : null,
      reflexao: String(o.reflexao),
      aplicacao: o.aplicacao ? String(o.aplicacao) : null,
      oracao: o.oracao ? String(o.oracao) : null,
      gerado_por_ia: true,
    }));
  if (rows.length === 0) throw new Error('IA não retornou itens validos');
  return rows;
}

// ─────────────────────────────────────────────────────────────
// POST /api/devocional-planos/:id/gerar-ia
// body: { tema?, tom?, sobrescrever?, apenas_datas?: string[] }
// Gera até 10 itens por chamada usando Haiku (fica dentro do timeout
// de 60s da Vercel). Frontend chama em lotes pra cobrir todo o plano.
//   - sem apenas_datas: gera até 10 dias pendentes
//   - com apenas_datas: gera so as datas listadas (filtra existentes)
// ─────────────────────────────────────────────────────────────
const BATCH_MAX = 10;

router.post('/:id/gerar-ia', authorize('admin', 'diretor'), async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada' });
    }
    const {
      tema = '',
      tom = 'pastoral, edificante, com aplicação pratica',
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
        message: 'Todos os dias solicitados já tem item',
        criados: 0,
        restantes: 0,
        total_pendentes: 0,
      });
    }

    let rows;
    try {
      rows = await gerarItensViaIA(plano, diasAlvo, tema, tom);
    } catch (iaErr) {
      return res.status(500).json({ error: iaErr.message, preview: iaErr.preview });
    }

    if (sobrescrever) {
      await supabase
        .from('devocional_itens')
        .delete()
        .eq('plano_id', plano.id)
        .in('data', diasAlvo);
    }

    const { error: e2 } = await supabase.from('devocional_itens').insert(rows);
    if (e2) throw e2;

    res.json({
      criados: rows.length,
      total_solicitado: diasAlvo.length,
      restantes,
    });
  } catch (e) {
    console.error('devocional-planos gerar-ia:', e.message);
    res.status(500).json({ error: e.message || 'Erro na geração IA' });
  }
});

// ─────────────────────────────────────────────────────────────
// PUT /api/devocional-planos/itens/:id — editar item
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// POST /api/devocional-planos/:id/itens — criar item manualmente
// body: { data, título, passagem?, reflexao, aplicação?, oração? }
// ─────────────────────────────────────────────────────────────
router.post('/:id/itens', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { data, titulo, passagem, reflexao, aplicacao, oracao } = req.body || {};
    if (!data || !titulo || !reflexao) {
      return res.status(400).json({ error: 'data, título e reflexao são obrigatórios' });
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
      if (error.code === '23505') return res.status(409).json({ error: 'Já existe item pra essa data' });
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
    if (!item) return res.status(404).json({ error: 'Plano não tem item pra hoje' });
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
//   Lista envios agregados por item do plano + últimos N erros.
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
//   Resumo pro dashboard do módulo Cuidados:
//   - checkins_hoje · membros que fizeram check-in hoje
//   - checkins_7d · check-ins distintos nos últimos 7 dias
//   - membros_engajados_30d · membros com >=1 check-in nos últimos 30d
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
