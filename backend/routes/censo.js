// Módulo Censo · plataforma de pesquisas (censo demográfico, pulso, evento).
// F0: CRUD do questionário + foto agregada. A coleta pública é a F1
// (routes/publicCenso.js) e os dashboards a F3.
//
// Régua de nível (mesma da membresia — agregado ≠ nominal):
//   1 = ver a lista de pesquisas e números AGREGADOS
//   2 = ver resposta NOMINAL (quem respondeu o quê)
//   4 = criar/editar/publicar pesquisa
//   5 = apagar
const express = require('express');
const router = express.Router();
const { supabase } = require('../utils/supabase');
const { authenticate, authorizeModule, getEffectiveLevel } = require('../middleware/auth');
const { TIPOS, validarPerguntas, slugificar } = require('../utils/censoPerguntas');

router.use(authenticate);

const TIPOS_PESQUISA = ['censo', 'pulso', 'evento', 'nps', 'outro'];

// Texto de consentimento default. Convicção religiosa é dado SENSÍVEL (LGPD
// art. 5º II): o respondente precisa saber o que está sendo coletado e para
// quê antes de responder. O texto ACEITO é gravado junto da resposta
// (snapshot) — o texto muda com o tempo, a prova do que ela aceitou não pode.
const CONSENTIMENTO_DEFAULT = [
  'Ao continuar, você autoriza a Comunidade Batista do Rio a usar suas respostas',
  'para conhecer melhor a comunidade e orientar decisões ministeriais.',
  'Seus dados não são compartilhados com terceiros e você pode solicitar a',
  'exclusão a qualquer momento pelo contato@cbrio.org.',
].join(' ');

function limpar(v) {
  return typeof v === 'string' ? v.trim() : v;
}

/** Slug único entre as pesquisas vivas: acrescenta -2, -3… se já existir. */
async function slugLivre(base, ignorarId) {
  const raiz = slugificar(base) || 'pesquisa';
  for (let n = 1; n <= 50; n += 1) {
    const tentativa = n === 1 ? raiz : `${raiz}-${n}`;
    let q = supabase.from('cen_pesquisa').select('id').eq('slug', tentativa).is('deleted_at', null);
    if (ignorarId) q = q.neq('id', ignorarId);
    const { data, error } = await q.maybeSingle();
    if (error && error.code !== 'PGRST116') throw new Error(error.message);
    if (!data) return tentativa;
  }
  return `${raiz}-${Date.now().toString(36)}`;
}

// ── Lista · a foto de cada pesquisa vem da view, não de contagem no front ──
router.get('/pesquisas', authorizeModule('censo', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_cen_pesquisa_stats')
      .select('*')
      .order('ultima_resposta_em', { ascending: false, nullsFirst: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/pesquisas/:id', authorizeModule('censo', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cen_pesquisa').select('*')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Pesquisa não encontrada' });

    const { data: stats } = await supabase
      .from('vw_cen_pesquisa_stats').select('*').eq('pesquisa_id', data.id).maybeSingle();
    res.json({ ...data, stats: stats || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Criar ─────────────────────────────────────────────────────────────────
router.post('/pesquisas', authorizeModule('censo', 4), async (req, res) => {
  try {
    const titulo = limpar(req.body?.titulo);
    if (!titulo) return res.status(400).json({ error: 'Título é obrigatório' });

    const tipo = TIPOS_PESQUISA.includes(req.body?.tipo) ? req.body.tipo : 'censo';
    // Pesquisa nova nasce em RASCUNHO, sempre. Publicar é ato separado e
    // explícito — ninguém publica um questionário por acidente.
    const payload = {
      titulo,
      subtitulo: limpar(req.body?.subtitulo) || null,
      tipo,
      status: 'rascunho',
      slug: await slugLivre(req.body?.slug || titulo),
      perguntas: [],
      config: {
        exige_identificacao: req.body?.config?.exige_identificacao !== false,
        permite_anonimo: req.body?.config?.permite_anonimo === true,
        mostrar_progresso: req.body?.config?.mostrar_progresso !== false,
      },
      consentimento_texto: limpar(req.body?.consentimento_texto) || CONSENTIMENTO_DEFAULT,
      criado_por: req.user?.id || null,
    };

    if (Array.isArray(req.body?.perguntas) && req.body.perguntas.length) {
      const v = validarPerguntas(req.body.perguntas);
      if (!v.ok) return res.status(400).json({ error: v.erros.join(' · ') });
      payload.perguntas = v.perguntas;
    }

    const { data, error } = await supabase.from('cen_pesquisa').insert(payload).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Editar ────────────────────────────────────────────────────────────────
router.put('/pesquisas/:id', authorizeModule('censo', 4), async (req, res) => {
  try {
    const { data: atual, error: e0 } = await supabase
      .from('cen_pesquisa').select('id, status, slug')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (e0) return res.status(400).json({ error: e0.message });
    if (!atual) return res.status(404).json({ error: 'Pesquisa não encontrada' });

    const patch = {};
    for (const k of ['titulo', 'subtitulo', 'consentimento_texto']) {
      if (req.body?.[k] !== undefined) patch[k] = limpar(req.body[k]) || null;
    }
    if (req.body?.tipo !== undefined) {
      if (!TIPOS_PESQUISA.includes(req.body.tipo)) return res.status(400).json({ error: 'Tipo inválido' });
      patch.tipo = req.body.tipo;
    }
    for (const k of ['abre_em', 'fecha_em']) {
      if (req.body?.[k] !== undefined) patch[k] = req.body[k] || null;
    }
    if (req.body?.config !== undefined && req.body.config && typeof req.body.config === 'object') {
      patch.config = req.body.config;
    }

    // O slug é a URL do QR impresso. Trocar depois de a pesquisa abrir
    // invalida o material que já está circulando — então só em rascunho.
    if (req.body?.slug !== undefined && slugificar(req.body.slug) !== atual.slug) {
      if (atual.status !== 'rascunho') {
        return res.status(400).json({ error: 'O endereço (slug) só pode mudar enquanto a pesquisa está em rascunho — o QR impresso aponta para ele.' });
      }
      patch.slug = await slugLivre(req.body.slug, atual.id);
    }

    if (req.body?.perguntas !== undefined) {
      const v = validarPerguntas(req.body.perguntas);
      if (!v.ok) return res.status(400).json({ error: v.erros.join(' · ') });
      patch.perguntas = v.perguntas;
    }

    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada para atualizar' });

    const { data, error } = await supabase
      .from('cen_pesquisa').update(patch).eq('id', atual.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Publicar / encerrar / reabrir ─────────────────────────────────────────
router.post('/pesquisas/:id/status', authorizeModule('censo', 4), async (req, res) => {
  try {
    const alvo = String(req.body?.status || '').trim();
    if (!['rascunho', 'aberta', 'encerrada', 'arquivada'].includes(alvo)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const { data: p, error: e0 } = await supabase
      .from('cen_pesquisa').select('id, status, perguntas, consentimento_texto, abre_em')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (e0) return res.status(400).json({ error: e0.message });
    if (!p) return res.status(404).json({ error: 'Pesquisa não encontrada' });

    // Abrir sem pergunta válida geraria um formulário vazio no culto — o tipo
    // de erro que só se descobre com 300 pessoas de celular na mão.
    if (alvo === 'aberta') {
      const v = validarPerguntas(p.perguntas || []);
      if (!v.ok) return res.status(400).json({ error: `Não é possível abrir: ${v.erros.join(' · ')}` });
      if (!p.consentimento_texto) return res.status(400).json({ error: 'Defina o texto de consentimento antes de abrir.' });
    }

    // Voltar para rascunho com resposta na mesa deixaria o questionário
    // editável por baixo de dado já coletado.
    if (alvo === 'rascunho' && p.status !== 'rascunho') {
      const { count } = await supabase
        .from('cen_resposta').select('id', { count: 'exact', head: true })
        .eq('pesquisa_id', p.id).is('deleted_at', null);
      if ((count || 0) > 0) {
        return res.status(400).json({ error: `Esta pesquisa já tem ${count} resposta(s). Encerre em vez de voltar para rascunho.` });
      }
    }

    const patch = { status: alvo };
    if (alvo === 'aberta' && !p.abre_em) patch.abre_em = new Date().toISOString();
    if (alvo === 'encerrada') patch.fecha_em = new Date().toISOString();

    const { data, error } = await supabase
      .from('cen_pesquisa').update(patch).eq('id', p.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Duplicar · censo 2027 começa do questionário de 2026 ───────────────────
router.post('/pesquisas/:id/duplicar', authorizeModule('censo', 4), async (req, res) => {
  try {
    const { data: base, error: e0 } = await supabase
      .from('cen_pesquisa').select('*')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (e0) return res.status(400).json({ error: e0.message });
    if (!base) return res.status(404).json({ error: 'Pesquisa não encontrada' });

    const titulo = limpar(req.body?.titulo) || `${base.titulo} (cópia)`;
    const { data, error } = await supabase.from('cen_pesquisa').insert({
      titulo,
      subtitulo: base.subtitulo,
      tipo: base.tipo,
      status: 'rascunho',
      slug: await slugLivre(req.body?.slug || titulo),
      perguntas: base.perguntas,
      config: base.config,
      consentimento_texto: base.consentimento_texto,
      criado_por: req.user?.id || null,
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Apagar (soft) ─────────────────────────────────────────────────────────
router.delete('/pesquisas/:id', authorizeModule('censo', 5), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cen_pesquisa')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params.id).is('deleted_at', null)
      .select('id').maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Pesquisa não encontrada' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Tipos de pergunta que o renderer sabe desenhar (alimenta o construtor) ─
router.get('/aux', authorizeModule('censo', 1), async (req, res) => {
  res.json({
    tipos_pergunta: TIPOS,
    tipos_pesquisa: TIPOS_PESQUISA,
    consentimento_default: CONSENTIMENTO_DEFAULT,
    nivel: getEffectiveLevel(req, 'censo'),
  });
});

module.exports = router;
