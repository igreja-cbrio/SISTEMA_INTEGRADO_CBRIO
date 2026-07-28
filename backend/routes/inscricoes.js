// ============================================================================
// Módulo de Inscrições · gestão (autenticado) — F3.2 PR 2
// Specs: docs/modulo-inscricoes/fase2-specs.md (5 abas; esta PR = Calendário
// + Eventos). CRUD de séries/eventos da ESPINHA (insc_series/insc_eventos)
// + "Nova edição" (recorrência · decisão Marcos 28/07). A página pública e a
// migração do Eventos Externos chegam nas PRs seguintes — até lá os eventos
// criados aqui ficam tipicamente em rascunho.
// ============================================================================
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

router.use(authenticate);

function slugify(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'evento';
}

// key OPACA e estável dos campos extras (mesma regra do form-builder do ext:
// gerada 1x, NUNCA re-derivada do label — senão orfana respostas antigas)
function novaKeyCampo() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

const TIPOS_CAMPO = ['texto', 'textarea', 'email', 'select', 'escolha', 'multi', 'rede_social', 'imagem', 'numero', 'data'];
function sanitizeCampos(campos) {
  if (!Array.isArray(campos)) return [];
  return campos
    .filter(c => c && String(c.label || '').trim())
    .slice(0, 40)
    .map(c => ({
      key: /^c_[a-z0-9_]+$/.test(String(c.key || '')) ? String(c.key) : novaKeyCampo(),
      label: String(c.label).trim().slice(0, 200),
      tipo: TIPOS_CAMPO.includes(c.tipo) ? c.tipo : 'texto',
      obrigatorio: c.obrigatorio !== false,
      opcoes: Array.isArray(c.opcoes) ? c.opcoes.map(o => String(o).trim()).filter(Boolean).slice(0, 60) : [],
    }));
}

// Rótulo da edição a partir da data (mensal/semanal → 'YYYY-MM' · anual → 'YYYY')
function rotuloEdicao(periodicidade, dataISO) {
  const s = String(dataISO || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return periodicidade === 'anual' ? s.slice(0, 4) : s.slice(0, 7);
}

async function slugUnico(base) {
  let slug = base;
  for (let i = 2; i < 60; i++) {
    const { data } = await supabase.from('insc_eventos').select('id').eq('slug', slug).limit(1);
    if (!data || !data.length) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

// Área obrigatória (28/07) — SEMPRE do catálogo oficial `areas` (nunca lista
// paralela). "Administração" é a opção agregada das áreas administrativas.
async function areaValida(nome) {
  const n = String(nome || '').trim();
  if (!n) return null;
  if (/^administra/i.test(n)) return 'Administração';
  const { data } = await supabase.from('areas')
    .select('nome').eq('ativo', true).ilike('nome', n).limit(1);
  return data && data.length ? data[0].nome : null;
}

const CAMPOS_EVENTO = [
  'nome', 'descricao', 'data', 'hora', 'local', 'capa_url', 'vagas',
  'inscricoes_abrem_em', 'inscricoes_encerram_em',
  'msg_sucesso_titulo', 'msg_sucesso_texto', 'msg_whatsapp',
  'tem_sorteio', 'premios', 'checkin_ativo',
  'pagamento_ativo', 'valor_centavos', 'pagamento_expira_horas',
];

// GET /areas — catálogo oficial pro select do form.
// Feedback do Marcos (28/07): áreas ADMINISTRATIVAS não fazem inscrição —
// colapsam numa opção única "Administração" (RH, Patrimônio, T.I.,
// Financeiro, Logística…). Detecção por nome do setor OU da área.
const RE_ADMIN = /gest[aã]o|administra|operac|recursos humanos|\brh\b|patrim|financeir|log[íi]st|tecnologia|\bt\.?i\.?\b|jur[íi]dic|contab|secretar/i;
router.get('/areas', authorizeModule('inscricoes', 1), async (_req, res) => {
  try {
    const { data, error } = await supabase.from('areas')
      .select('id, nome, setor:setores(nome)').eq('ativo', true).order('nome');
    if (error) throw error;
    const naoAdmin = (data || []).filter(a => !RE_ADMIN.test(a.nome || '') && !RE_ADMIN.test(a.setor?.nome || ''));
    res.json([...naoAdmin.map(a => ({ id: a.id, nome: a.nome })), { id: 'administracao', nome: 'Administração' }]);
  } catch (e) {
    console.error('[inscricoes] areas:', e.message);
    res.json([{ id: 'administracao', nome: 'Administração' }]);
  }
});

// GET /series
router.get('/series', authorizeModule('inscricoes', 1), async (_req, res) => {
  try {
    const { data, error } = await supabase.from('insc_series')
      .select('id, nome, slug_base, area, periodicidade, tipo, ativo, recorre_ate')
      .is('deleted_at', null).order('nome');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[inscricoes] series:', e.message);
    res.status(500).json({ error: 'Erro ao listar séries' });
  }
});

// PUT /series/:id — nome / recorrente-até / ativo
router.put('/series/:id', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const b = req.body || {};
    const patch = {};
    if (b.nome !== undefined) {
      const nome = String(b.nome).trim();
      if (nome.length < 2) return res.status(400).json({ error: 'Informe o nome da série' });
      patch.nome = nome;
    }
    if (b.recorre_ate !== undefined) {
      patch.recorre_ate = b.recorre_ate && /^\d{4}-\d{2}-\d{2}$/.test(String(b.recorre_ate))
        ? String(b.recorre_ate) : null;
    }
    if (b.ativo !== undefined) patch.ativo = !!b.ativo;
    const { data, error } = await supabase.from('insc_series')
      .update(patch).eq('id', req.params.id).is('deleted_at', null).select('id').single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[inscricoes] atualizar série:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar série' });
  }
});

// GET /eventos — lista com série + contagem de inscritos
router.get('/eventos', authorizeModule('inscricoes', 1), async (_req, res) => {
  try {
    const { data, error } = await supabase.from('insc_eventos')
      .select('id, nome, slug, area, tipo, data, hora, local, capa_url, status, vagas, tem_sorteio, checkin_ativo, pagamento_ativo, valor_centavos, edicao_rotulo, serie_id, serie:insc_series(id, nome, periodicidade, recorre_ate, slug_base), inscritos:inscricoes(count)')
      .is('deleted_at', null)
      .order('data', { ascending: false, nullsFirst: false });
    if (error) throw error;
    res.json((data || []).map(e => ({ ...e, inscritos: e.inscritos?.[0]?.count ?? 0 })));
  } catch (e) {
    console.error('[inscricoes] eventos:', e.message);
    res.status(500).json({ error: 'Erro ao listar eventos' });
  }
});

// GET /eventos/:id — detalhe (com sorteios embutidos, pro painel do evento)
router.get('/eventos/:id', authorizeModule('inscricoes', 1), async (req, res) => {
  try {
    const { data, error } = await supabase.from('insc_eventos')
      .select('*, serie:insc_series(id, nome, periodicidade, slug_base), inscritos:inscricoes(count), sorteios:insc_sorteios(id, premio, numero_sorteado, inscricao_id, ganhador_nome, sorteado_em)')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Evento não encontrado' });
    const sorteios = (data.sorteios || []).sort((a, b) => String(b.sorteado_em).localeCompare(String(a.sorteado_em)));
    res.json({ ...data, inscritos: data.inscritos?.[0]?.count ?? 0, sorteios });
  } catch (e) {
    console.error('[inscricoes] evento:', e.message);
    res.status(500).json({ error: 'Erro ao carregar evento' });
  }
});

// GET /eventos/:id/inscricoes — lista de inscritos (sem CPF no nível 1;
// `dados` = respostas do form-builder, exibidas no detalhe do evento)
router.get('/eventos/:id/inscricoes', authorizeModule('inscricoes', 1), async (req, res) => {
  try {
    const { data, error } = await supabase.from('inscricoes')
      .select('id, nome_completo, telefone, email, status, numero_sorte, whatsapp_optin, dados, created_at')
      .eq('evento_id', req.params.id).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(2000);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[inscricoes] inscricoes do evento:', e.message);
    res.status(500).json({ error: 'Erro ao listar inscrições' });
  }
});

// PATCH /eventos/:id/inscricoes/:inscricaoId — corrigir uma inscrição
// (nome/telefone/e-mail/status + respostas). `dados` é MESCLADO sobre o
// existente (nunca substituído inteiro — mesma régua do eventos-externos);
// valor string vazia = limpa a resposta daquela chave.
router.patch('/eventos/:id/inscricoes/:inscricaoId', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const { data: atual } = await supabase.from('inscricoes')
      .select('id, dados').eq('id', req.params.inscricaoId)
      .eq('evento_id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Inscrição não encontrada' });

    const patch = {};
    if (typeof req.body?.nome_completo === 'string' && req.body.nome_completo.trim().length >= 2) {
      patch.nome_completo = req.body.nome_completo.trim().slice(0, 200);
    }
    if ('telefone' in (req.body || {})) patch.telefone = String(req.body.telefone || '').replace(/\D/g, '') || null;
    if ('email' in (req.body || {})) patch.email = req.body.email ? String(req.body.email).toLowerCase().trim().slice(0, 200) : null;
    if (req.body?.status !== undefined) {
      // 'recebida' é exclusiva do fluxo de pagamento — manual só confirma/cancela
      if (!['confirmada', 'cancelada'].includes(req.body.status)) {
        return res.status(400).json({ error: 'Status inválido' });
      }
      patch.status = req.body.status;
    }
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

    const { data, error } = await supabase.from('inscricoes')
      .update(patch)
      .eq('id', req.params.inscricaoId).eq('evento_id', req.params.id).is('deleted_at', null)
      .select('id, nome_completo, telefone, email, status, numero_sorte, whatsapp_optin, dados, created_at').maybeSingle();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[inscricoes] atualizar inscrição:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar a inscrição' });
  }
});

// DELETE /eventos/:id/inscricoes/:inscricaoId — soft delete (ex.: inscrição
// de teste). Some da lista, das contagens e dos sorteios seguintes.
router.delete('/eventos/:id/inscricoes/:inscricaoId', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const { data: atual } = await supabase.from('inscricoes')
      .select('id').eq('id', req.params.inscricaoId)
      .eq('evento_id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Inscrição não encontrada' });
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'inscricoes', p_row_id: req.params.inscricaoId, p_deleted_by: req.user?.id ?? null,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[inscricoes] excluir inscrição:', e.message);
    res.status(500).json({ error: 'Erro ao excluir a inscrição' });
  }
});

// POST /eventos/:id/sortear — sorteia um inscrito (espelho do eventos-externos).
// Body: { premio, permitir_repetir }. Pool = inscrições ativas não-canceladas
// com número da sorte; por padrão exclui quem já ganhou neste evento.
router.post('/eventos/:id/sortear', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const { premio, permitir_repetir } = req.body || {};
    const { data: inscritos } = await supabase.from('inscricoes')
      .select('id, nome_completo, numero_sorte')
      .eq('evento_id', req.params.id).is('deleted_at', null)
      .neq('status', 'cancelada').not('numero_sorte', 'is', null);
    if (!inscritos || !inscritos.length) return res.status(400).json({ error: 'Sem inscritos pra sortear' });
    let elegiveis = inscritos;
    if (!permitir_repetir) {
      const { data: jaSorteados } = await supabase.from('insc_sorteios')
        .select('inscricao_id').eq('evento_id', req.params.id);
      const ganhos = new Set((jaSorteados || []).map(s => s.inscricao_id));
      elegiveis = inscritos.filter(i => !ganhos.has(i.id));
    }
    if (!elegiveis.length) return res.status(400).json({ error: 'Todos os inscritos já foram sorteados (marque "permitir repetir" pra sortear de novo)' });
    const g = elegiveis[Math.floor(Math.random() * elegiveis.length)];
    const { data: sorteio, error } = await supabase.from('insc_sorteios').insert({
      evento_id: req.params.id, premio: premio ? String(premio).trim().slice(0, 200) : null,
      numero_sorteado: g.numero_sorte, inscricao_id: g.id, ganhador_nome: g.nome_completo,
      sorteado_por: req.user?.id || null,
    }).select('*').single();
    if (error) throw error;
    res.status(201).json(sorteio);
  } catch (e) {
    console.error('[inscricoes] sortear:', e.message);
    res.status(500).json({ error: 'Erro ao sortear' });
  }
});

// POST /eventos — cria (com série automática quando periodicidade != unica)
router.post('/eventos', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const b = req.body || {};
    const nome = String(b.nome || '').trim();
    if (nome.length < 2) return res.status(400).json({ error: 'Informe o nome do evento' });
    const area = await areaValida(b.area);
    if (!area) return res.status(400).json({ error: 'Selecione uma área válida (catálogo oficial)' });

    const periodicidade = ['unica', 'semanal', 'mensal', 'anual', 'custom'].includes(b.periodicidade)
      ? b.periodicidade : 'unica';
    const slug = await slugUnico(slugify(nome));

    let serieId = null;
    let edicao = null;
    if (periodicidade !== 'unica') {
      const recorreAte = b.recorre_ate && /^\d{4}-\d{2}-\d{2}$/.test(String(b.recorre_ate))
        ? String(b.recorre_ate) : null;
      const { data: serie, error: eS } = await supabase.from('insc_series').insert({
        nome, slug_base: slug, area, periodicidade, recorre_ate: recorreAte,
        tipo: b.tipo === 'retiro' ? 'retiro' : 'evento',
      }).select('id').single();
      if (eS) throw eS;
      serieId = serie.id;
      edicao = rotuloEdicao(periodicidade, b.data);
    }

    const payload = {
      nome, slug, area, serie_id: serieId, edicao_rotulo: edicao,
      tipo: b.tipo === 'retiro' ? 'retiro' : 'evento',
      campos: sanitizeCampos(b.campos),
      status: 'rascunho',
      created_by: req.user?.id || null,
    };
    for (const k of CAMPOS_EVENTO) if (b[k] !== undefined && k !== 'nome') payload[k] = b[k];

    const { data, error } = await supabase.from('insc_eventos').insert(payload).select('id, slug').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[inscricoes] criar evento:', e.message);
    res.status(500).json({ error: 'Erro ao criar evento' });
  }
});

// PUT /eventos/:id — atualiza (whitelist; slug/série não mudam aqui)
router.put('/eventos/:id', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const b = req.body || {};
    const patch = {};
    for (const k of CAMPOS_EVENTO) if (b[k] !== undefined) patch[k] = b[k];
    if (b.nome !== undefined) {
      const nome = String(b.nome).trim();
      if (nome.length < 2) return res.status(400).json({ error: 'Informe o nome do evento' });
      patch.nome = nome;
    }
    if (b.area !== undefined) {
      const area = await areaValida(b.area);
      if (!area) return res.status(400).json({ error: 'Selecione uma área válida' });
      patch.area = area;
    }
    if (b.campos !== undefined) patch.campos = sanitizeCampos(b.campos);
    if (b.status !== undefined) {
      if (!['rascunho', 'publicado', 'encerrado', 'arquivado'].includes(b.status)) {
        return res.status(400).json({ error: 'Status inválido' });
      }
      patch.status = b.status;
    }
    const { data, error } = await supabase.from('insc_eventos')
      .update(patch).eq('id', req.params.id).is('deleted_at', null).select('id').single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[inscricoes] atualizar evento:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar evento' });
  }
});

// DELETE /eventos/:id — soft delete (padrão da casa)
router.delete('/eventos/:id', authorizeModule('inscricoes', 4), async (req, res) => {
  try {
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'insc_eventos', p_row_id: req.params.id, p_deleted_by: req.user?.id ?? null,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[inscricoes] excluir evento:', e.message);
    res.status(500).json({ error: 'Erro ao excluir evento' });
  }
});

// POST /eventos/:id/nova-edicao — recorrência (decisão Marcos 28/07):
// copia formulário/config pra data nova; evento avulso vira série na hora.
router.post('/eventos/:id/nova-edicao', authorizeModule('inscricoes', 3), async (req, res) => {
  try {
    const dataNova = String(req.body?.data || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataNova)) {
      return res.status(400).json({ error: 'Informe a data da nova edição' });
    }
    const { data: ev, error: eEv } = await supabase.from('insc_eventos')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (eEv) throw eEv;
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });

    let serieId = ev.serie_id;
    let periodicidade = 'mensal';
    if (serieId) {
      const { data: s } = await supabase.from('insc_series')
        .select('periodicidade').eq('id', serieId).maybeSingle();
      periodicidade = s?.periodicidade || 'mensal';
    } else {
      periodicidade = ['semanal', 'mensal', 'anual', 'custom'].includes(req.body?.periodicidade)
        ? req.body.periodicidade : 'mensal';
      const { data: serie, error: eS } = await supabase.from('insc_series').insert({
        nome: ev.nome, slug_base: ev.slug, area: ev.area, periodicidade,
        tipo: ev.tipo || 'evento',
      }).select('id, slug_base').single();
      if (eS) throw eS;
      serieId = serie.id;
      await supabase.from('insc_eventos').update({
        serie_id: serieId, edicao_rotulo: rotuloEdicao(periodicidade, ev.data),
      }).eq('id', ev.id);
    }

    const { data: serie } = await supabase.from('insc_series')
      .select('slug_base').eq('id', serieId).maybeSingle();
    const rotulo = rotuloEdicao(periodicidade, dataNova) || dataNova;
    const slug = await slugUnico(`${serie?.slug_base || ev.slug}-${rotulo}`);

    const novo = {
      nome: ev.nome, slug, area: ev.area, tipo: ev.tipo,
      serie_id: serieId, edicao_rotulo: rotulo,
      descricao: ev.descricao, data: dataNova, hora: ev.hora, local: ev.local,
      capa_url: ev.capa_url, campos: ev.campos, vagas: ev.vagas,
      msg_sucesso_titulo: ev.msg_sucesso_titulo, msg_sucesso_texto: ev.msg_sucesso_texto,
      msg_whatsapp: ev.msg_whatsapp, tem_sorteio: ev.tem_sorteio, premios: ev.premios,
      pagamento_ativo: ev.pagamento_ativo, valor_centavos: ev.valor_centavos,
      pagamento_metodos: ev.pagamento_metodos, pagamento_expira_horas: ev.pagamento_expira_horas,
      checkin_ativo: ev.checkin_ativo,
      status: 'rascunho',
      created_by: req.user?.id || null,
    };
    const { data: criado, error: eNovo } = await supabase.from('insc_eventos')
      .insert(novo).select('id, slug').single();
    if (eNovo) throw eNovo;
    res.status(201).json(criado);
  } catch (e) {
    console.error('[inscricoes] nova edição:', e.message);
    res.status(500).json({ error: 'Erro ao criar a nova edição' });
  }
});

// POST /upload-capa — mesmo bucket/padrão do eventos-externos
router.post('/upload-capa', authorizeModule('inscricoes', 3), upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });
    const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
    const path = `espinha/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('evento-capas').upload(path, req.file.buffer, {
      contentType: req.file.mimetype || 'image/jpeg', upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from('evento-capas').getPublicUrl(path);
    res.json({ url: data.publicUrl });
  } catch (e) {
    console.error('[inscricoes] upload-capa:', e.message);
    res.status(500).json({ error: 'Erro ao enviar a capa' });
  }
});

module.exports = router;
