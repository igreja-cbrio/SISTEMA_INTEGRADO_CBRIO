// Disparo de e-mails pros voluntários · sub-router montado em /api/voluntariado/emails
// (backend/routes/voluntariado.js). O guard de arquivo do voluntariado é
// membresia>=1 — aqui TODAS as rotas exigem voluntariado>=3 (compor/enviar é
// ação de escrita da coordenação, não leitura geral).

const router = require('express').Router();
const multer = require('multer');
const { authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { enviarEmail } = require('../services/email');
const { gerarEmail } = require('../services/volEmailIa');
const {
  resolverSegmento,
  montarHtmlEmail,
  sanitizarHtml,
  snapshotDestinatarios,
  drenarDisparos,
  carregarAssinatura,
} = require('../services/volEmailSender');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

router.use(authorizeModule('voluntariado', 3));

const EDITAVEIS = ['rascunho', 'agendado'];

function validarSegmento(seg) {
  if (!seg || typeof seg !== 'object') return { tipo: 'todos' };
  const tipo = ['todos', 'equipe', 'escala', 'manual', 'inscritos'].includes(seg.tipo) ? seg.tipo : 'todos';
  const limpo = { tipo };
  if (tipo === 'equipe') limpo.team_id = seg.team_id || null;
  if (tipo === 'escala') limpo.service_id = seg.service_id || null;
  if (tipo === 'inscritos') {
    const STATUS_OK = ['inscrito', 'enviado_ministerio', 'nao_responde', 'integrado'];
    limpo.status = STATUS_OK.includes(seg.status) ? seg.status : 'inscrito';
    if (seg.area) limpo.area = String(seg.area).toLowerCase();
  }
  if (tipo === 'manual') {
    limpo.vol_profile_ids = (Array.isArray(seg.vol_profile_ids) ? seg.vol_profile_ids : [])
      .filter(id => typeof id === 'string' && id)
      .slice(0, 2000);
  }
  return limpo;
}

// GET / — histórico (últimos 100 ativos)
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vol_email_disparos')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[volEmails] list:', e.message);
    res.status(500).json({ error: 'Erro ao listar disparos' });
  }
});

// GET /config — assinatura global do módulo (antes de /:id · rota fixa vence)
router.get('/config', async (req, res) => {
  try {
    res.json({ assinatura_html: await carregarAssinatura() });
  } catch (e) {
    console.error('[volEmails] config get:', e.message);
    res.status(500).json({ error: 'Erro ao carregar a assinatura' });
  }
});

// PUT /config — salva a assinatura global
router.put('/config', async (req, res) => {
  try {
    const assinatura = sanitizarHtml(req.body?.assinatura_html || '');
    const { error } = await supabase
      .from('vol_email_config')
      .upsert({ id: 1, assinatura_html: assinatura, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw error;
    res.json({ ok: true, assinatura_html: assinatura });
  } catch (e) {
    console.error('[volEmails] config put:', e.message);
    res.status(500).json({ error: 'Erro ao salvar a assinatura' });
  }
});

// ── Templates de e-mail (modelos reutilizáveis · fábrica + custom) ───────────
// GET /templates — lista (fábrica primeiro)
router.get('/templates', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vol_email_templates')
      .select('id, nome, assunto, corpo_html, is_padrao, updated_at')
      .order('is_padrao', { ascending: false })
      .order('nome', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[volEmails] templates get:', e.message);
    res.status(500).json({ error: 'Erro ao listar os templates' });
  }
});

// POST /templates — cria template custom
router.post('/templates', async (req, res) => {
  try {
    const nome = (req.body?.nome || '').trim();
    if (!nome) return res.status(400).json({ error: 'Dê um nome ao template' });
    const { data, error } = await supabase
      .from('vol_email_templates')
      .insert({
        nome: nome.slice(0, 120),
        assunto: (req.body?.assunto || '').slice(0, 300),
        corpo_html: sanitizarHtml(req.body?.corpo_html || ''),
        is_padrao: false,
        created_by: req.user?.userId || null,
      })
      .select('id, nome, assunto, corpo_html, is_padrao, updated_at')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[volEmails] templates post:', e.message);
    res.status(500).json({ error: 'Erro ao salvar o template' });
  }
});

// PUT /templates/:id — edita template
router.put('/templates/:id', async (req, res) => {
  try {
    const patch = { updated_at: new Date().toISOString() };
    if (req.body?.nome != null) patch.nome = String(req.body.nome).trim().slice(0, 120);
    if (req.body?.assunto != null) patch.assunto = String(req.body.assunto).slice(0, 300);
    if (req.body?.corpo_html != null) patch.corpo_html = sanitizarHtml(req.body.corpo_html);
    const { data, error } = await supabase
      .from('vol_email_templates')
      .update(patch)
      .eq('id', req.params.id)
      .select('id, nome, assunto, corpo_html, is_padrao, updated_at')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[volEmails] templates put:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar o template' });
  }
});

// DELETE /templates/:id — só custom (fábrica não apaga)
router.delete('/templates/:id', async (req, res) => {
  try {
    const { data: t } = await supabase
      .from('vol_email_templates').select('is_padrao').eq('id', req.params.id).maybeSingle();
    if (t?.is_padrao) return res.status(400).json({ error: 'Templates de fábrica não podem ser apagados' });
    const { error } = await supabase.from('vol_email_templates').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[volEmails] templates delete:', e.message);
    res.status(500).json({ error: 'Erro ao apagar o template' });
  }
});

// GET /:id — detalhe + destinatários com erro (polling de progresso)
router.get('/:id', async (req, res) => {
  try {
    const { data: disparo, error } = await supabase
      .from('vol_email_disparos')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!disparo) return res.status(404).json({ error: 'Disparo não encontrado' });
    const { data: erros } = await supabase
      .from('vol_email_disparo_destinatarios')
      .select('email, nome, erro_msg')
      .eq('disparo_id', disparo.id)
      .eq('status', 'erro')
      .limit(50);
    res.json({ ...disparo, destinatarios_erro: erros || [] });
  } catch (e) {
    console.error('[volEmails] get:', e.message);
    res.status(500).json({ error: 'Erro ao carregar disparo' });
  }
});

// GET /:id/destinatarios — log completo por destinatário (erro primeiro)
router.get('/:id/destinatarios', async (req, res) => {
  try {
    const todos = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('vol_email_disparo_destinatarios')
        .select('nome, email, status, erro_msg, enviado_em, aberto_em, aberturas')
        .eq('disparo_id', req.params.id)
        .order('status', { ascending: false }) // pendente > erro > enviado (texto desc)
        .order('nome', { ascending: true })
        .range(from, from + 999);
      if (error) throw error;
      todos.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    // erro primeiro, depois pendente, depois enviado
    const peso = { erro: 0, pendente: 1, enviado: 2 };
    todos.sort((a, b) => (peso[a.status] ?? 3) - (peso[b.status] ?? 3) || String(a.nome || '').localeCompare(String(b.nome || '')));
    res.json(todos);
  } catch (e) {
    console.error('[volEmails] destinatarios:', e.message);
    res.status(500).json({ error: 'Erro ao carregar o log de destinatários' });
  }
});

// POST / — cria rascunho
router.post('/', async (req, res) => {
  try {
    const { assunto, corpo_html, segmento, incluir_assinatura } = req.body || {};
    const { data, error } = await supabase
      .from('vol_email_disparos')
      .insert({
        assunto: (assunto || '').trim(),
        corpo_html: corpo_html || '',
        segmento: validarSegmento(segmento),
        incluir_assinatura: incluir_assinatura !== false,
        criado_por: req.user.userId,
        criado_por_nome: req.user.name || req.user.email,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[volEmails] create:', e.message);
    res.status(500).json({ error: 'Erro ao criar rascunho' });
  }
});

// PUT /:id — edita (só rascunho/agendado)
router.put('/:id', async (req, res) => {
  try {
    const { assunto, corpo_html, segmento, incluir_assinatura } = req.body || {};
    const patch = {};
    if (assunto !== undefined) patch.assunto = (assunto || '').trim();
    if (corpo_html !== undefined) patch.corpo_html = corpo_html || '';
    if (segmento !== undefined) patch.segmento = validarSegmento(segmento);
    if (incluir_assinatura !== undefined) patch.incluir_assinatura = incluir_assinatura !== false;
    const { data, error } = await supabase
      .from('vol_email_disparos')
      .update(patch)
      .eq('id', req.params.id)
      .in('status', EDITAVEIS)
      .is('deleted_at', null)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(409).json({ error: 'Disparo não é mais editável' });
    res.json(data);
  } catch (e) {
    console.error('[volEmails] update:', e.message);
    res.status(500).json({ error: 'Erro ao salvar rascunho' });
  }
});

// DELETE /:id — soft delete (lei do projeto)
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'vol_email_disparos',
      p_row_id: req.params.id,
      p_deleted_by: req.user.userId,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[volEmails] delete:', e.message);
    res.status(500).json({ error: 'Erro ao excluir disparo' });
  }
});

// POST /resolver-destinatarios — preview {total, sem_email, lista completa}
router.post('/resolver-destinatarios', async (req, res) => {
  try {
    const segmento = validarSegmento(req.body?.segmento);
    const { destinatarios, sem_email, sem_email_lista } = await resolverSegmento(segmento);
    res.json({
      total: destinatarios.length,
      sem_email,
      sem_email_lista: sem_email_lista || [],
      lista: destinatarios.map((d) => ({ nome: d.nome, email: d.email })),
    });
  } catch (e) {
    console.error('[volEmails] resolver:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao resolver destinatários' });
  }
});


// POST /upload-imagem — imagem do corpo (bucket público vol-emails)
router.post('/upload-imagem', upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });
    if (!/^image\//.test(req.file.mimetype || '')) {
      return res.status(400).json({ error: 'Envie apenas imagens' });
    }
    const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('vol-emails').upload(path, req.file.buffer, {
      contentType: req.file.mimetype || 'image/jpeg',
      upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from('vol-emails').getPublicUrl(path);
    res.json({ url: data.publicUrl });
  } catch (e) {
    console.error('[volEmails] upload:', e.message);
    res.status(500).json({ error: 'Erro ao enviar imagem' });
  }
});

// POST /gerar-ia — gera/melhora assunto + corpo com Claude
router.post('/gerar-ia', async (req, res) => {
  try {
    const { objetivo, tom, corpo_atual } = req.body || {};
    const r = await gerarEmail({ objetivo, tom, corpo_atual });
    res.json(r);
  } catch (e) {
    console.error('[volEmails] gerar-ia:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao gerar com IA' });
  }
});

// POST /preview — shell final pro iframe do composer
router.post('/preview', async (req, res) => {
  try {
    const assinaturaHtml = req.body?.incluir_assinatura === false ? '' : await carregarAssinatura();
    const html = montarHtmlEmail(req.body?.corpo_html || '', { nome: req.user.name || 'Voluntário', assinaturaHtml });
    res.json({ html });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao montar preview' });
  }
});

// POST /:id/teste — envia pro e-mail do próprio usuário
router.post('/:id/teste', async (req, res) => {
  try {
    const { data: disparo } = await supabase
      .from('vol_email_disparos')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!disparo) return res.status(404).json({ error: 'Disparo não encontrado' });
    if (!req.user.email) return res.status(400).json({ error: 'Seu usuário não tem e-mail cadastrado' });
    const assinaturaHtml = disparo.incluir_assinatura === false ? '' : await carregarAssinatura();
    const html = montarHtmlEmail(disparo.corpo_html, { nome: req.user.name, assinaturaHtml });
    const r = await enviarEmail({
      to: req.user.email,
      subject: `[TESTE] ${disparo.assunto || '(sem assunto)'}`,
      html,
      fromName: 'Voluntariado CBRio',
    });
    if (!r?.ok) return res.status(502).json({ error: r?.error || 'Falha no envio de teste' });
    res.json({ ok: true, para: req.user.email });
  } catch (e) {
    console.error('[volEmails] teste:', e.message);
    res.status(500).json({ error: 'Erro ao enviar teste' });
  }
});

// POST /:id/enviar — snapshot + drena inline (budget · cron retoma o resto)
router.post('/:id/enviar', async (req, res) => {
  try {
    const { data: disparo } = await supabase
      .from('vol_email_disparos')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!disparo) return res.status(404).json({ error: 'Disparo não encontrado' });
    if (!EDITAVEIS.includes(disparo.status)) {
      return res.status(409).json({ error: `Disparo já está "${disparo.status}"` });
    }
    if (!disparo.assunto?.trim() || !disparo.corpo_html?.trim()) {
      return res.status(400).json({ error: 'Assunto e corpo são obrigatórios antes do envio' });
    }

    const total = await snapshotDestinatarios(disparo);
    if (!total) return res.status(400).json({ error: 'Nenhum destinatário com e-mail no segmento escolhido' });

    const { data: claimed } = await supabase
      .from('vol_email_disparos')
      .update({ status: 'enviando' })
      .eq('id', disparo.id)
      .in('status', EDITAVEIS)
      .select('id');
    if (!claimed?.length) return res.status(409).json({ error: 'Disparo já está em envio' });

    // Drena inline com orçamento — blasts pequenos terminam aqui; grandes
    // continuam pelo cron */5. A UI acompanha via polling do GET /:id.
    const r = await drenarDisparos({ budgetMs: 240000, apenasDisparoId: disparo.id });
    const { data: atual } = await supabase
      .from('vol_email_disparos')
      .select('*')
      .eq('id', disparo.id)
      .single();
    res.json({ ...atual, drain: r });
  } catch (e) {
    console.error('[volEmails] enviar:', e.message);
    res.status(500).json({ error: 'Erro ao iniciar envio' });
  }
});

// POST /:id/agendar — {agendado_para} futuro
router.post('/:id/agendar', async (req, res) => {
  try {
    const quando = new Date(req.body?.agendado_para || '');
    if (Number.isNaN(quando.getTime()) || quando.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Informe uma data/hora futura' });
    }
    const { data: disparo } = await supabase
      .from('vol_email_disparos')
      .select('id, status, assunto, corpo_html')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!disparo) return res.status(404).json({ error: 'Disparo não encontrado' });
    if (!EDITAVEIS.includes(disparo.status)) {
      return res.status(409).json({ error: `Disparo já está "${disparo.status}"` });
    }
    if (!disparo.assunto?.trim() || !disparo.corpo_html?.trim()) {
      return res.status(400).json({ error: 'Assunto e corpo são obrigatórios antes de agendar' });
    }
    const { data, error } = await supabase
      .from('vol_email_disparos')
      .update({ status: 'agendado', agendado_para: quando.toISOString() })
      .eq('id', disparo.id)
      .in('status', EDITAVEIS)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[volEmails] agendar:', e.message);
    res.status(500).json({ error: 'Erro ao agendar disparo' });
  }
});

// POST /:id/cancelar — agendado→cancelado · enviando→fecha pendentes como erro
router.post('/:id/cancelar', async (req, res) => {
  try {
    const { data: disparo } = await supabase
      .from('vol_email_disparos')
      .select('id, status')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!disparo) return res.status(404).json({ error: 'Disparo não encontrado' });

    if (disparo.status === 'agendado') {
      const { data } = await supabase
        .from('vol_email_disparos')
        .update({ status: 'cancelado' })
        .eq('id', disparo.id)
        .eq('status', 'agendado')
        .select()
        .single();
      return res.json(data);
    }
    if (disparo.status === 'enviando') {
      await supabase
        .from('vol_email_disparo_destinatarios')
        .update({ status: 'erro', erro_msg: 'cancelado' })
        .eq('disparo_id', disparo.id)
        .eq('status', 'pendente');
      const { data } = await supabase
        .from('vol_email_disparos')
        .update({ status: 'cancelado' })
        .eq('id', disparo.id)
        .eq('status', 'enviando')
        .select()
        .single();
      return res.json(data);
    }
    res.status(409).json({ error: `Disparo "${disparo.status}" não pode ser cancelado` });
  } catch (e) {
    console.error('[volEmails] cancelar:', e.message);
    res.status(500).json({ error: 'Erro ao cancelar disparo' });
  }
});

// POST /:id/reenviar-erros — recoloca os destinatários com status 'erro' na fila
// (erro→pendente) e re-dispara. Útil pra blips transitórios do Graph.
router.post('/:id/reenviar-erros', async (req, res) => {
  try {
    const { data: disparo } = await supabase
      .from('vol_email_disparos')
      .select('id, status')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!disparo) return res.status(404).json({ error: 'Disparo não encontrado' });
    if (!['enviado', 'erro', 'enviando'].includes(disparo.status)) {
      return res.status(409).json({ error: `Disparo "${disparo.status}" não tem envio pra reprocessar` });
    }

    const { data: resetados, error: rErr } = await supabase
      .from('vol_email_disparo_destinatarios')
      .update({ status: 'pendente', erro_msg: null, enviado_em: null })
      .eq('disparo_id', disparo.id)
      .eq('status', 'erro')
      .select('id');
    if (rErr) throw rErr;
    if (!resetados?.length) return res.status(400).json({ error: 'Nenhum destinatário com erro pra reenviar' });

    await supabase
      .from('vol_email_disparos')
      .update({ status: 'enviando' })
      .eq('id', disparo.id);

    const r = await drenarDisparos({ budgetMs: 240000, apenasDisparoId: disparo.id });
    const { data: atual } = await supabase
      .from('vol_email_disparos')
      .select('*')
      .eq('id', disparo.id)
      .single();
    res.json({ ...atual, reprocessados: resetados.length, drain: r });
  } catch (e) {
    console.error('[volEmails] reenviar-erros:', e.message);
    res.status(500).json({ error: 'Erro ao reenviar os que falharam' });
  }
});

module.exports = router;
