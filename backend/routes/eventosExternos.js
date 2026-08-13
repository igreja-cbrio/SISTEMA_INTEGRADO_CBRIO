// ============================================================================
// Eventos Externos · gestão (autenticado)
// Eventos grandes com formulário público de confirmação de presença + sorteio.
// ============================================================================
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

router.use(authenticate);

// ⚠️ VIRADA (SPEC-04 · 2026-07-28): o ext_* CONGELOU — o Celebra migrou pra
// espinha e /evento/:slug é servido por ela. Escrever aqui criaria divergência
// silenciosa (a espinha não veria a mudança). Leitura segue liberada
// (conferência). Gestão do dia a dia: /inscricoes (routes/inscricoes.js).
router.use((req, res, next) => {
  if (req.method === 'GET') return next();
  return res.status(410).json({ error: 'Eventos Externos migrou pro módulo Inscrições — gerencie em /inscricoes.' });
});

// POST /upload-capa — foto de capa do formulário (bucket público). Devolve a URL.
router.post('/upload-capa', authorizeModule('eventos-externos', 3), upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });
    const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('evento-capas').upload(path, req.file.buffer, {
      contentType: req.file.mimetype || 'image/jpeg', upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from('evento-capas').getPublicUrl(path);
    res.json({ url: data.publicUrl });
  } catch (e) {
    console.error('[eventos-externos] upload-capa:', e.message);
    res.status(500).json({ error: 'Erro ao enviar a capa' });
  }
});

function slugify(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'evento';
}

// GET / — lista eventos (com contagem de inscritos)
router.get('/', authorizeModule('eventos-externos', 1), async (req, res) => {
  try {
    const { data: eventos, error } = await supabase.from('ext_eventos')
      .select('*').is('deleted_at', null).order('data', { ascending: false, nullsFirst: false });
    if (error) throw error;
    const ids = (eventos || []).map(e => e.id);
    const cont = {};
    if (ids.length) {
      const { data: ins } = await supabase.from('ext_inscricoes')
        .select('evento_id').in('evento_id', ids).is('deleted_at', null);
      (ins || []).forEach(i => { cont[i.evento_id] = (cont[i.evento_id] || 0) + 1; });
    }
    res.json((eventos || []).map(e => ({ ...e, inscritos: cont[e.id] || 0 })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST / — cria evento
router.post('/', authorizeModule('eventos-externos', 3), async (req, res) => {
  try {
    const { nome, data, hora, local, descricao, form_ativo, tem_sorteio, campos, capa_url, premios, inscricoes_encerram_em, msg_sucesso_titulo, msg_sucesso_texto, msg_whatsapp } = req.body || {};
    if (!nome || nome.trim().length < 2) return res.status(400).json({ error: 'Nome obrigatório' });
    // slug único
    let base = slugify(nome), slug = base, n = 1;
    while (true) {
      const { data: ex } = await supabase.from('ext_eventos').select('id').eq('slug', slug).maybeSingle();
      if (!ex) break;
      slug = `${base}-${++n}`;
    }
    const { data: ev, error } = await supabase.from('ext_eventos').insert({
      nome: nome.trim(), slug, data: data || null, hora: hora || null,
      local: local || null, descricao: descricao || null,
      form_ativo: form_ativo !== false, tem_sorteio: tem_sorteio !== false,
      campos: Array.isArray(campos) ? campos : [], capa_url: capa_url || null,
      premios: Array.isArray(premios) ? premios : [],
      inscricoes_encerram_em: inscricoes_encerram_em || null,
      msg_sucesso_titulo: msg_sucesso_titulo || null,
      msg_sucesso_texto: msg_sucesso_texto || null,
      msg_whatsapp: msg_whatsapp || null,
      created_by: req.user?.userId || null,
    }).select('*').single();
    if (error) throw error;
    res.status(201).json(ev);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /:id — detalhe + inscritos + sorteios
router.get('/:id', authorizeModule('eventos-externos', 1), async (req, res) => {
  try {
    const { data: evento } = await supabase.from('ext_eventos')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!evento) return res.status(404).json({ error: 'Evento não encontrado' });
    const { data: inscritos } = await supabase.from('ext_inscricoes')
      .select('id, nome, telefone, email, numero_sorte, dados, created_at')
      .eq('evento_id', evento.id).is('deleted_at', null).order('created_at');
    const { data: sorteios } = await supabase.from('ext_sorteios')
      .select('*').eq('evento_id', evento.id).order('sorteado_em', { ascending: false });
    res.json({ ...evento, inscritos: inscritos || [], sorteios: sorteios || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /:id — atualizar
router.put('/:id', authorizeModule('eventos-externos', 3), async (req, res) => {
  try {
    const allowed = ['nome', 'data', 'hora', 'local', 'descricao', 'form_ativo', 'tem_sorteio', 'campos', 'capa_url', 'premios', 'inscricoes_encerram_em', 'msg_sucesso_titulo', 'msg_sucesso_texto', 'msg_whatsapp'];
    const patch = { updated_at: new Date().toISOString() };
    for (const k of allowed) if (k in (req.body || {})) patch[k] = req.body[k];
    const { data, error } = await supabase.from('ext_eventos')
      .update(patch).eq('id', req.params.id).is('deleted_at', null).select('*').maybeSingle();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /:id/inscricoes/:inscricaoId — editar uma inscrição (nome/telefone/
// email + respostas do formulário, ex.: corrigir a rede social digitada errada).
// ⚠️ `dados` é MESCLADO sobre o existente (nunca substituído inteiro) — assim
// campos que o editor não mostra (ex.: imagem) não são apagados por engano.
// Valor string vazia = limpa a resposta daquela chave.
router.patch('/:id/inscricoes/:inscricaoId', authorizeModule('eventos-externos', 3), async (req, res) => {
  try {
    const { data: atual } = await supabase.from('ext_inscricoes')
      .select('id, dados').eq('id', req.params.inscricaoId)
      .eq('evento_id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Inscrição não encontrada' });

    const patch = {};
    if (typeof req.body?.nome === 'string' && req.body.nome.trim().length >= 2) patch.nome = req.body.nome.trim().slice(0, 200);
    if ('telefone' in (req.body || {})) patch.telefone = String(req.body.telefone || '').replace(/\D/g, '') || null;
    if ('email' in (req.body || {})) patch.email = req.body.email ? String(req.body.email).toLowerCase().trim().slice(0, 200) : null;
    if (req.body?.dados && typeof req.body.dados === 'object' && !Array.isArray(req.body.dados)) {
      const dados = { ...(atual.dados || {}) };
      for (const [k, v] of Object.entries(req.body.dados)) {
        const key = String(k).slice(0, 80);
        if (v === null || v === undefined || String(v).trim() === '') delete dados[key];
        else dados[key] = String(v).slice(0, 500); // mesma régua do form público
      }
      patch.dados = dados;
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada pra atualizar' });

    const { data, error } = await supabase.from('ext_inscricoes')
      .update(patch)
      .eq('id', req.params.inscricaoId).eq('evento_id', req.params.id).is('deleted_at', null)
      .select('id, nome, telefone, email, numero_sorte, dados, created_at').maybeSingle();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /:id/inscricoes/:inscricaoId — remove uma inscrição (soft delete ·
// ex.: apagar inscrições de teste). Some da lista e dos sorteios seguintes.
router.delete('/:id/inscricoes/:inscricaoId', authorizeModule('eventos-externos', 3), async (req, res) => {
  try {
    const { data, error } = await supabase.from('ext_inscricoes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params.inscricaoId).eq('evento_id', req.params.id).is('deleted_at', null)
      .select('id').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Inscrição não encontrada' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /:id — soft delete
router.delete('/:id', authorizeModule('eventos-externos', 3), async (req, res) => {
  try {
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'ext_eventos', p_row_id: req.params.id, p_deleted_by: req.user?.userId ?? null,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /:id/sortear — sorteia um inscrito. Body: { premio, permitir_repetir }.
// Vários sorteios por evento (1 por prêmio). Por padrão exclui quem já ganhou;
// com permitir_repetir=true sorteia do pool inteiro (pode repetir ganhador).
router.post('/:id/sortear', authorizeModule('eventos-externos', 3), async (req, res) => {
  try {
    const { premio, permitir_repetir } = req.body || {};
    const { data: inscritos } = await supabase.from('ext_inscricoes')
      .select('id, nome, numero_sorte').eq('evento_id', req.params.id).is('deleted_at', null);
    if (!inscritos || !inscritos.length) return res.status(400).json({ error: 'Sem inscritos pra sortear' });
    let elegiveis = inscritos;
    if (!permitir_repetir) {
      const { data: jaSorteados } = await supabase.from('ext_sorteios')
        .select('inscricao_id').eq('evento_id', req.params.id);
      const ganhos = new Set((jaSorteados || []).map(s => s.inscricao_id));
      elegiveis = inscritos.filter(i => !ganhos.has(i.id));
    }
    if (!elegiveis.length) return res.status(400).json({ error: 'Todos os inscritos já foram sorteados (marque "permitir repetir" pra sortear de novo)' });
    const g = elegiveis[Math.floor(Math.random() * elegiveis.length)];
    const { data: sorteio, error } = await supabase.from('ext_sorteios').insert({
      evento_id: req.params.id, premio: premio ? String(premio).trim().slice(0, 200) : null,
      numero_sorteado: g.numero_sorte, inscricao_id: g.id, ganhador_nome: g.nome,
      sorteado_por: req.user?.userId || null,
    }).select('*').single();
    if (error) throw error;
    res.status(201).json(sorteio);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
