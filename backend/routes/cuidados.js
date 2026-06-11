const router = require('express').Router();
const { authenticate, authorize, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const { enqueueSync } = require('../services/cerebroSync');
const { mountWhatsappAuto } = require('./whatsappAutoRoutes');

router.use(authenticate);

// Mensagem automática de WhatsApp · pedido de aconselhamento pastoral
// (config/edição em /whatsapp-auto/* · gerencia a chave 'cuidados_aconselhamento')
mountWhatsappAuto(router, { chave: 'cuidados_aconselhamento', modulo: 'cuidados', authorizeModule });

// Helper: limpa CPF (somente dígitos)
function cleanCpf(cpf) {
  return String(cpf || '').replace(/\D/g, '');
}

// Helper: tenta encontrar membro pelo CPF
// (fix 2026-06-10: buscava o CPF no campo TELEFONE — mem_membros tem coluna
// cpf de verdade · sem o vínculo certo, jornada180/aconselhamento nasciam
// sem membro_id e o sinal "Investir" não contava na NSM)
async function findMembroByCpf(cpf) {
  const clean = cleanCpf(cpf);
  if (!clean || clean.length !== 11) return null;
  const { data, error } = await supabase
    .from('mem_membros')
    .select('id, nome, telefone, email')
    .eq('cpf', clean)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

// ─────────────────────────────────────────────────────────────
// GET /api/cuidados/dashboard — KPIs do mês + comparativo
// ─────────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const { data: atual, error } = await supabase
      .from('vw_cuidados_mensal')
      .select('*')
      .single();
    if (error) throw error;

    // Comparativo: mês anterior — calculado em consultas separadas
    const inicioMesAnterior = new Date();
    inicioMesAnterior.setDate(1);
    inicioMesAnterior.setMonth(inicioMesAnterior.getMonth() - 1);
    const fimMesAnterior = new Date(inicioMesAnterior);
    fimMesAnterior.setMonth(fimMesAnterior.getMonth() + 1);

    const iniIso = inicioMesAnterior.toISOString().slice(0, 10);
    const fimIso = fimMesAnterior.toISOString().slice(0, 10);

    const [{ count: aconsAnt }, { count: capelAnt }, { count: jornAnt }, { count: convAtAnt }, { count: convCadAnt }] = await Promise.all([
      supabase.from('cui_atendimentos_agregado').select('id', { count: 'exact', head: true }).eq('mes', iniIso).eq('tipo', 'aconselhamento'),
      supabase.from('cui_atendimentos_agregado').select('id', { count: 'exact', head: true }).eq('mes', iniIso).eq('tipo', 'capelania'),
      supabase.from('cui_jornada180').select('id', { count: 'exact', head: true }).is('deleted_at', null).gte('data_encontro', iniIso).lt('data_encontro', fimIso),
      supabase.from('cui_convertidos').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('atendido_apos_culto', true).gte('data_culto', iniIso).lt('data_culto', fimIso),
      supabase.from('cui_convertidos').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('cadastrado', true).gte('data_culto', iniIso).lt('data_culto', fimIso),
    ]);

    // Soma de quantidade por tipo no mês anterior (agregado é quantidade, não count)
    const { data: agregadoAnt } = await supabase
      .from('cui_atendimentos_agregado')
      .select('tipo, quantidade')
      .eq('mes', iniIso);
    const aconsAntSum = (agregadoAnt || []).filter(r => r.tipo === 'aconselhamento').reduce((s, r) => s + (r.quantidade || 0), 0);
    const capelAntSum = (agregadoAnt || []).filter(r => r.tipo === 'capelania').reduce((s, r) => s + (r.quantidade || 0), 0);

    res.json({
      atual,
      anterior: {
        aconselhamentos: aconsAntSum,
        capelania: capelAntSum,
        jornada180_encontros: jornAnt || 0,
        convertidos_atendidos: convAtAnt || 0,
        convertidos_cadastrados: convCadAnt || 0,
      },
    });
  } catch (e) {
    console.error('[CUIDADOS] dashboard:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Acompanhamentos
// ─────────────────────────────────────────────────────────────
router.get('/acompanhamentos', async (req, res) => {
  try {
    const { status, search, responsavel } = req.query;
    let q = supabase
      .from('cui_acompanhamentos')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(500);
    if (status) q = q.eq('status', status);
    if (responsavel) q = q.eq('responsavel_id', responsavel);
    if (search) q = q.ilike('nome', `%${search}%`);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/acompanhamentos', async (req, res) => {
  try {
    const body = { ...req.body, created_by: req.user.userId };
    if (body.cpf) {
      const membro = await findMembroByCpf(body.cpf);
      if (membro) body.membro_id = membro.id;
    }
    const { data, error } = await supabase
      .from('cui_acompanhamentos')
      .insert(body)
      .select()
      .single();
    if (error) throw error;

    // Notificação imediata
    notificar({
      modulo: 'cuidados',
      tipo: 'novo_acompanhamento',
      titulo: `Novo acompanhamento — ${data.nome}`,
      mensagem: `${data.nome} entrou em acompanhamento (${data.motivo || 'sem motivo'}).`,
      link: '/ministerial/cuidados',
      severidade: 'info',
      chaveDedup: `cui_novo_${data.id}`,
    }).catch(() => {});

    enqueueSync('acompanhamento', data.id, 'upsert').catch(() => {});

    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/acompanhamentos/:id', async (req, res) => {
  try {
    const body = { ...req.body, ultima_atualizacao: new Date().toISOString() };
    const { data, error } = await supabase
      .from('cui_acompanhamentos')
      .update(body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    enqueueSync('acompanhamento', req.params.id, 'upsert').catch(() => {});
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/acompanhamentos/:id', async (req, res) => {
  try {
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'cui_acompanhamentos',
      p_row_id: req.params.id,
      p_deleted_by: req.user?.id ?? null,
    });
    if (error) throw error;
    enqueueSync('acompanhamento', req.params.id, 'delete').catch(() => {});
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Pedidos de Cuidados vindos do app (aconselhamento / oração / SOS)
// Fila pra equipe pastoral · alimentada por POST /api/app/inscricoes.
// ─────────────────────────────────────────────────────────────
const TIPOS_PEDIDO_APP = ['aconselhamento', 'oracao', 'sos'];
const TRATAMENTO_STATUS = ['pendente', 'em_andamento', 'concluido'];

function extrairMensagemPedido(d) {
  if (!d || typeof d !== 'object') return null;
  return d.mensagem || d.message || d.texto || d.descricao || d.obs || d.observacao || null;
}

// GET /api/cuidados/pedidos-app?status=pendente|em_andamento|concluido
router.get('/pedidos-app', authorizeModule('cuidados', 1), async (req, res) => {
  try {
    const { status } = req.query;
    let q = supabase
      .from('app_inscricoes')
      .select('id, tipo, dados, membro_id, status, tratamento_status, tratado_em, created_at')
      .in('tipo', TIPOS_PEDIDO_APP)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(500);
    if (status && TRATAMENTO_STATUS.includes(status)) q = q.eq('tratamento_status', status);
    const { data, error } = await q;
    if (error) throw error;

    // Enriquece com nome/telefone frescos do membro (snapshot em dados é fallback)
    const ids = [...new Set((data || []).map(r => r.membro_id).filter(Boolean))];
    let membros = {};
    if (ids.length) {
      const { data: ms } = await supabase
        .from('mem_membros')
        .select('id, nome, telefone, email')
        .in('id', ids)
        .is('deleted_at', null);
      membros = Object.fromEntries((ms || []).map(m => [m.id, m]));
    }

    const items = (data || []).map(r => {
      const d = r.dados || {};
      const m = r.membro_id ? membros[r.membro_id] : null;
      return {
        id: r.id,
        tipo: r.tipo,
        membro_id: r.membro_id || null,
        nome: m?.nome || d.nome || null,
        telefone: m?.telefone || d.telefone || null,
        email: m?.email || d.email || null,
        mensagem: extrairMensagemPedido(d),
        tratamento_status: r.tratamento_status || 'pendente',
        tratado_em: r.tratado_em || null,
        created_at: r.created_at,
      };
    });
    res.json(items);
  } catch (e) {
    console.error('[CUIDADOS] pedidos-app:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/cuidados/pedidos-app/:id — atualiza status de tratamento
router.patch('/pedidos-app/:id', authorizeModule('cuidados', 3), async (req, res) => {
  try {
    const { tratamento_status } = req.body || {};
    if (!TRATAMENTO_STATUS.includes(tratamento_status)) {
      return res.status(400).json({ error: 'Status de tratamento inválido' });
    }
    const patch = {
      tratamento_status,
      tratado_por: req.user?.id || null,
      tratado_em: tratamento_status === 'pendente' ? null : new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from('app_inscricoes')
      .update(patch)
      .eq('id', req.params.id)
      .in('tipo', TIPOS_PEDIDO_APP)
      .select('id, tratamento_status, tratado_em')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[CUIDADOS] pedidos-app patch:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Pedidos de oração · lista + insights por IA (tema de cada pedido)
// ─────────────────────────────────────────────────────────────
const { analisarOracao, CATEGORIAS } = require('../services/oracaoAnalise');

async function carregarOracoes(limit = 1000) {
  const { data, error } = await supabase
    .from('app_inscricoes')
    .select('id, dados, membro_id, tratamento_status, created_at')
    .eq('tipo', 'oracao')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// GET /api/cuidados/oracoes — lista de pedidos de oração (com tema e vínculo a membro)
router.get('/oracoes', authorizeModule('cuidados', 1), async (_req, res) => {
  try {
    const rows = await carregarOracoes(500);
    const ids = [...new Set(rows.map(r => r.membro_id).filter(Boolean))];
    let membros = {};
    if (ids.length) {
      const { data: ms } = await supabase
        .from('mem_membros').select('id, nome, telefone, email').in('id', ids).is('deleted_at', null);
      membros = Object.fromEntries((ms || []).map(m => [m.id, m]));
    }
    const items = rows.map(r => {
      const d = r.dados || {};
      const m = r.membro_id ? membros[r.membro_id] : null;
      const a = d.analise || null;
      return {
        id: r.id,
        membro_id: r.membro_id || null,
        nome: m?.nome || d.nome || null,
        telefone: m?.telefone || d.telefone || null,
        mensagem: extrairMensagemPedido(d),
        categoria: a?.categoria || null,
        categoria_label: a?.categoria ? (CATEGORIAS[a.categoria] || a.categoria) : null,
        resumo: a?.resumo || null,
        tratamento_status: r.tratamento_status || 'pendente',
        created_at: r.created_at,
      };
    });
    res.json(items);
  } catch (e) {
    console.error('[CUIDADOS] oracoes:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/cuidados/oracoes/insights — agregação por tema (pra tirar insights)
router.get('/oracoes/insights', authorizeModule('cuidados', 1), async (_req, res) => {
  try {
    const rows = await carregarOracoes(2000);
    const cont = {};
    let analisados = 0;
    for (const r of rows) {
      const cat = r.dados?.analise?.categoria;
      if (cat) { cont[cat] = (cont[cat] || 0) + 1; analisados++; }
    }
    const total = rows.length;
    const temas = Object.entries(cont)
      .map(([slug, count]) => ({ slug, label: CATEGORIAS[slug] || slug, count, pct: total ? Math.round((count / analisados) * 100) : 0 }))
      .sort((a, b) => b.count - a.count);
    res.json({ total, analisados, nao_analisados: total - analisados, temas });
  } catch (e) {
    console.error('[CUIDADOS] oracoes insights:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/cuidados/oracoes/analisar — classifica com IA os pedidos ainda sem análise
router.post('/oracoes/analisar', authorizeModule('cuidados', 2), async (_req, res) => {
  try {
    const rows = await carregarOracoes(2000);
    const pendentes = rows.filter(r => !r.dados?.analise && extrairMensagemPedido(r.dados)).slice(0, 30);
    let ok = 0;
    for (const r of pendentes) {
      const a = await analisarOracao(extrairMensagemPedido(r.dados));
      if (!a) continue;
      const novoDados = { ...(r.dados || {}), analise: a };
      const { error } = await supabase.from('app_inscricoes').update({ dados: novoDados }).eq('id', r.id);
      if (!error) ok++;
    }
    res.json({ analisados: ok, pendentes_restantes: Math.max(0, pendentes.length - ok), total_pendentes: rows.filter(r => !r.dados?.analise && extrairMensagemPedido(r.dados)).length - ok });
  } catch (e) {
    console.error('[CUIDADOS] oracoes analisar:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Jornada 180
// ─────────────────────────────────────────────────────────────
router.get('/jornada180', async (req, res) => {
  try {
    const { etapa, mes } = req.query;
    let q = supabase.from('cui_jornada180').select('*').is('deleted_at', null).order('data_encontro', { ascending: false }).limit(500);
    if (etapa) q = q.eq('etapa', Number(etapa));
    if (mes) {
      const start = `${mes}-01`;
      const dt = new Date(`${mes}-01T12:00:00`);
      dt.setMonth(dt.getMonth() + 1);
      q = q.gte('data_encontro', start).lt('data_encontro', dt.toISOString().slice(0, 10));
    }
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/jornada180', async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.cpf) {
      const m = await findMembroByCpf(body.cpf);
      if (m) body.membro_id = m.id;
    }
    const { data, error } = await supabase.from('cui_jornada180').insert(body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/jornada180/:id', async (req, res) => {
  try {
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'cui_jornada180',
      p_row_id: req.params.id,
      p_deleted_by: req.user?.id ?? null,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Convertidos
// ─────────────────────────────────────────────────────────────
// Tags fixas de triagem pastoral · alimenta o multiselect no front
const CONVERTIDO_TAGS = [
  'casamento', 'familia', 'espiritual', 'saude', 'financeiro',
  'luto', 'emocional', 'vicios', 'profissional', 'outro',
];

router.get('/convertidos/tags', (_req, res) => {
  res.json(CONVERTIDO_TAGS);
});

// Quem pode atender convertidos (decisão do Marcos · 2026-06-10): só líderes
// de culto (coordenador kids/ami/bridge/online) e líderes de ministérios
// (lider-ministerial + coordenador-voluntarios). Filtra por CARGO, não por
// nome — trocar o titular do cargo atualiza a lista sozinho.
const ATENDENTE_CARGO_SLUGS = [
  'coordenador-kids', 'coordenador-ami', 'coordenador-bridge', 'coordenador-online',
  'lider-ministerial', 'coordenador-voluntarios',
];

// GET /api/cuidados/convertidos/atendentes — profiles elegíveis pro select
// "quem vai atender" do agendamento de visita.
router.get('/convertidos/atendentes', async (_req, res) => {
  try {
    const { data: cargos, error: e1 } = await supabase
      .from('cargos').select('id, slug').in('slug', ATENDENTE_CARGO_SLUGS);
    if (e1) throw e1;
    const cargoIds = (cargos || []).map(c => c.id);
    if (!cargoIds.length) return res.json([]);

    const { data: usuarios, error: e2 } = await supabase
      .from('usuarios').select('email, cargo_id')
      .in('cargo_id', cargoIds).is('deleted_at', null);
    if (e2) throw e2;
    const emails = new Set((usuarios || []).map(u => String(u.email || '').toLowerCase()).filter(Boolean));
    if (!emails.size) return res.json([]);

    const { data: profs, error: e3 } = await supabase
      .from('profiles').select('id, name, email').eq('active', true).order('name');
    if (e3) throw e3;
    const itens = (profs || [])
      .filter(p => emails.has(String(p.email || '').toLowerCase()))
      .map(p => ({ id: p.id, name: p.name }));
    res.json(itens);
  } catch (e) {
    console.error('[CUIDADOS] atendentes:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/convertidos', async (req, res) => {
  try {
    const { from, to, tag, encontro_marcado, atendido, encontro_from, encontro_to } = req.query;
    let q = supabase.from('cui_convertidos').select('*').is('deleted_at', null).limit(2000);
    if (from) q = q.gte('data_culto', from);
    if (to) q = q.lte('data_culto', to);
    if (tag) q = q.contains('tags', [tag]);
    if (encontro_marcado === 'true') q = q.eq('encontro_marcado', true);
    if (encontro_marcado === 'false') q = q.eq('encontro_marcado', false);
    if (atendido === 'true') q = q.eq('atendido_apos_culto', true);
    if (atendido === 'false') q = q.eq('atendido_apos_culto', false);
    // Janela de VISITA agendada (calendário de visitas) · filtra por data_encontro
    if (encontro_from || encontro_to) {
      q = q.eq('encontro_marcado', true);
      if (encontro_from) q = q.gte('data_encontro', encontro_from);
      if (encontro_to) q = q.lte('data_encontro', encontro_to);
      q = q.order('data_encontro', { ascending: true });
    } else {
      q = q.order('data_culto', { ascending: false });
    }
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/convertidos', async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.cpf) {
      const m = await findMembroByCpf(body.cpf);
      if (m) body.membro_id = m.id;
    }
    const { data, error } = await supabase.from('cui_convertidos').insert(body).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/convertidos/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cui_convertidos')
      .update(req.body)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/convertidos/:id', async (req, res) => {
  try {
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'cui_convertidos',
      p_row_id: req.params.id,
      p_deleted_by: req.user?.id ?? null,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Encontro pastoral + desfecho (encaminhamento da jornada)
// ─────────────────────────────────────────────────────────────
// destino do encaminhamento → valor da jornada + módulo de notificação + label
const DESTINO_META = {
  jornada180:  { valor: 'investir', modulo: 'cuidados',     label: 'Jornada 180',  link: '/ministerial/cuidados?tab=jornada' },
  grupos:      { valor: 'conectar', modulo: 'grupos',       label: 'Grupos',       link: '/grupos' },
  voluntarios: { valor: 'servir',   modulo: 'voluntariado', label: 'Voluntários',  link: '/ministerial/voluntariado/encaminhados' },
};

// POST /api/cuidados/convertidos/:id/agendar-encontro
// Marca o encontro pastoral com data + hora + quem vai atender e notifica o pastor.
router.post('/convertidos/:id/agendar-encontro', async (req, res) => {
  try {
    const { data_encontro, encontro_hora, encontro_responsavel_id, encontro_responsavel_nome, observacoes } = req.body;
    if (!data_encontro) return res.status(400).json({ error: 'Data do encontro é obrigatória' });
    const uid = req.user.userId || req.user.id;
    // 1º contato pastoral (base do SLA de 3 dias) · grava só na primeira vez
    await supabase.from('cui_convertidos')
      .update({ primeiro_contato_em: new Date().toISOString(), primeiro_contato_por: uid })
      .eq('id', req.params.id).is('primeiro_contato_em', null);
    const patch = {
      encontro_marcado: true,
      encontro_status: 'agendado',
      data_encontro,
      encontro_hora: encontro_hora || null,
      encontro_responsavel_id: encontro_responsavel_id || null,
      encontro_responsavel_nome: encontro_responsavel_nome || null,
    };
    if (observacoes != null) patch.observacoes = observacoes;
    const { data, error } = await supabase
      .from('cui_convertidos').update(patch).eq('id', req.params.id).select().single();
    if (error) throw error;

    // Notifica o pastor que vai atender
    if (encontro_responsavel_id) {
      const quando = `${new Date(data_encontro + 'T12:00:00').toLocaleDateString('pt-BR')}${encontro_hora ? ' ' + String(encontro_hora).slice(0, 5) : ''}`;
      notificar({
        modulo: 'cuidados',
        tipo: 'encontro_agendado',
        titulo: `Encontro pastoral — ${data.nome}`,
        mensagem: `Você tem um encontro com ${data.nome} em ${quando}.`,
        link: '/ministerial/cuidados?tab=convertidos',
        severidade: 'info',
        chaveDedup: `cui_encontro_${data.id}_${data_encontro}`,
        targetIds: [encontro_responsavel_id],
      }).catch(() => {});
    }
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/cuidados/convertidos/:id/cancelar-encontro
router.post('/convertidos/:id/cancelar-encontro', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cui_convertidos')
      .update({ encontro_marcado: false, encontro_status: 'cancelado' })
      .eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/cuidados/convertidos/:id/registrar-contato
// Marca que o líder fez o 1º contato (fecha o SLA de 3 dias) sem precisar
// agendar o encontro ainda. Usado pelos líderes de área no módulo deles.
router.post('/convertidos/:id/registrar-contato', async (req, res) => {
  try {
    const uid = req.user.userId || req.user.id;
    const { data, error } = await supabase
      .from('cui_convertidos')
      .update({ primeiro_contato_em: new Date().toISOString(), primeiro_contato_por: uid })
      .eq('id', req.params.id).is('primeiro_contato_em', null)
      .select().maybeSingle();
    if (error) throw error;
    res.json(data || { ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/cuidados/convertidos/:id/desfecho
// body: { compareceu, encaminhamentos: [{ destino, observacao? }], observacoes?, tags? }
// Registra o desfecho do encontro e encaminha a pessoa pros próximos valores.
// tags = triagem pastoral preenchida no mesmo modal (decisão do Marcos 2026-06-10:
// o líder sai do encontro com tags + encaminhamento + observações num lugar só).
router.post('/convertidos/:id/desfecho', async (req, res) => {
  try {
    const { compareceu, encaminhamentos = [], observacoes, tags } = req.body;
    const userId = req.user.userId || req.user.id;

    // 1) Desfecho no convertido
    const patchDesfecho = {
      encontro_compareceu: !!compareceu,
      encontro_status: compareceu ? 'realizado' : 'faltou',
      desfecho_em: new Date().toISOString(),
      desfecho_por: userId,
      desfecho_observacoes: observacoes ?? null,
    };
    if (Array.isArray(tags)) {
      patchDesfecho.tags = tags.filter(t => CONVERTIDO_TAGS.includes(t));
    }
    const { data: conv, error: e1 } = await supabase
      .from('cui_convertidos')
      .update(patchDesfecho)
      .eq('id', req.params.id).select().single();
    if (e1) throw e1;

    // 2) Encaminhamentos (só se a pessoa compareceu)
    // Dedup por (convertido, destino): reabrir o desfecho pra completar uma
    // pendência (ex.: tag) não pode duplicar um encaminhamento já feito.
    const criados = [];
    if (compareceu && Array.isArray(encaminhamentos)) {
      for (const enc of encaminhamentos) {
        const meta = DESTINO_META[enc?.destino];
        if (!meta) continue;
        const { data: jaExiste } = await supabase
          .from('jornada_encaminhamentos')
          .select('id')
          .eq('convertido_id', conv.id)
          .eq('destino', enc.destino)
          .is('deleted_at', null)
          .limit(1)
          .maybeSingle();
        if (jaExiste) continue;
        const { data: row, error: e2 } = await supabase
          .from('jornada_encaminhamentos')
          .insert({
            origem: 'cuidados',
            convertido_id: conv.id,
            membro_id: conv.membro_id || null,
            nome: conv.nome,
            telefone: conv.telefone || null,
            destino: enc.destino,
            valor_alvo: meta.valor,
            observacao: enc.observacao || null,
            encaminhado_por: userId,
          })
          .select().single();
        if (e2) { console.warn('[cuidados/desfecho] encaminhamento falhou:', e2.message); continue; }
        criados.push(row);
        notificar({
          modulo: meta.modulo,
          tipo: 'novo_encaminhamento',
          titulo: `Encaminhado: ${conv.nome} → ${meta.label}`,
          mensagem: `${conv.nome} foi encaminhado(a) pelo cuidado pastoral. Faça o primeiro contato e registre a devolutiva.`,
          link: meta.link,
          severidade: 'info',
          chaveDedup: `enc_${row.id}`,
        }).catch(() => {});
      }
    }
    res.json({ convertido: conv, encaminhamentos: criados });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/cuidados/visitas-pendentes
// Visitas passadas (data_encontro < hoje) cuja pessoa ainda não saiu "completa":
// toda pessoa visitada precisa ter desfecho registrado, ≥1 tag pastoral e
// ≥1 encaminhamento (regra do Marcos · 2026-06-10). Faltou/cancelado ficam fora
// (o caminho deles é reagendar pela ficha).
router.get('/visitas-pendentes', async (req, res) => {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const { data: rows, error } = await supabase
      .from('cui_convertidos')
      .select('id, nome, telefone, cpf, membro_id, data_culto, data_encontro, encontro_hora, encontro_status, encontro_responsavel_id, encontro_responsavel_nome, encontro_compareceu, encontro_marcado, atendido_apos_culto, cadastrado, tags, observacoes, area, created_at')
      .is('deleted_at', null)
      .eq('encontro_marcado', true)
      .lt('data_encontro', hoje)
      .in('encontro_status', ['agendado', 'realizado'])
      .order('data_encontro', { ascending: false })
      .limit(500);
    if (error) throw error;

    // Encaminhamentos existentes por convertido (consulta em lotes · evita URL gigante)
    const ids = (rows || []).map(r => r.id);
    const destinosPorConvertido = new Map();
    for (let i = 0; i < ids.length; i += 100) {
      const lote = ids.slice(i, i + 100);
      const { data: encs, error: e2 } = await supabase
        .from('jornada_encaminhamentos')
        .select('convertido_id, destino')
        .in('convertido_id', lote)
        .is('deleted_at', null);
      if (e2) throw e2;
      (encs || []).forEach(en => {
        const lista = destinosPorConvertido.get(en.convertido_id) || [];
        if (!lista.includes(en.destino)) lista.push(en.destino);
        destinosPorConvertido.set(en.convertido_id, lista);
      });
    }

    const itens = (rows || []).map(c => {
      const destinosExistentes = destinosPorConvertido.get(c.id) || [];
      const pendencias = [];
      if (c.encontro_status === 'agendado') pendencias.push('desfecho');
      if (!Array.isArray(c.tags) || c.tags.length === 0) pendencias.push('tag');
      if (destinosExistentes.length === 0) pendencias.push('encaminhamento');
      return { ...c, pendencias, destinos_existentes: destinosExistentes };
    }).filter(c => c.pendencias.length > 0);

    res.json(itens);
  } catch (e) {
    console.error('[CUIDADOS] visitas-pendentes:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/cuidados/jornada-convertidos?area=&status=
// Os 3 marcos dos primeiros 90 dias por convertido: contato ≤3d, batismo ≤90d,
// Next ≤90d · status semáforo. Segmentável por área (cada líder vê a sua;
// Marcelo/Cuidados vê todas). Cruza batismo_inscricoes + next_inscricoes (paginado).
router.get('/jornada-convertidos', async (req, res) => {
  try {
    const { area } = req.query;
    const DIA = 86400000;
    const agora = Date.now();
    const onlyDigits = (v) => String(v || '').replace(/\D/g, '');

    const fetchAll = async (table, columns, applyFilter) => {
      const out = []; let from = 0; const page = 1000;
      while (true) {
        let q = supabase.from(table).select(columns).range(from, from + page - 1);
        if (applyFilter) q = applyFilter(q);
        const { data, error } = await q;
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < page) break;
        from += page;
      }
      return out;
    };

    const convertidos = await fetchAll(
      'cui_convertidos',
      'id, nome, telefone, cpf, membro_id, data_culto, area, primeiro_contato_em, encontro_status, encontro_responsavel_nome',
      (q) => { q = q.is('deleted_at', null); return area ? q.eq('area', area) : q; },
    );
    const batismos = await fetchAll('batismo_inscricoes', 'status, membro_id, cpf, nome', (q) => q.is('deleted_at', null));
    const nextInsc = await fetchAll('next_inscricoes', 'membro_id, nome, check_in_at'); // sem deleted_at nessa tabela

    // índices de batismo (realizado > inscrito) e de Next (fez check-in > só inscrito)
    const bM = new Map(), bC = new Map(), bN = new Map();
    const putB = (m, k, real) => { if (!k) return; const c = m.get(k); const r = real ? 2 : 1; if (!c || r > c.r) m.set(k, { r, real }); };
    for (const b of batismos) {
      const real = b.status === 'realizado';
      putB(bM, b.membro_id, real);
      putB(bC, onlyDigits(b.cpf).length === 11 ? onlyDigits(b.cpf) : null, real);
      putB(bN, String(b.nome || '').trim().toLowerCase() || null, real);
    }
    const batOf = (c) => {
      const cs = [c.membro_id ? bM.get(c.membro_id) : null, onlyDigits(c.cpf).length === 11 ? bC.get(onlyDigits(c.cpf)) : null, bN.get(String(c.nome || '').trim().toLowerCase())].filter(Boolean);
      return cs.length ? { real: cs.some(x => x.real) } : null;
    };
    const nM = new Map(), nN = new Map();
    const putN = (m, k, fez) => { if (!k) return; const c = m.get(k); const r = fez ? 2 : 1; if (!c || r > c.r) m.set(k, { r, fez }); };
    for (const n of nextInsc) {
      const fez = !!n.check_in_at;
      putN(nM, n.membro_id, fez);
      putN(nN, String(n.nome || '').trim().toLowerCase() || null, fez);
    }
    const nextOf = (c) => {
      const cs = [c.membro_id ? nM.get(c.membro_id) : null, nN.get(String(c.nome || '').trim().toLowerCase())].filter(Boolean);
      return cs.length ? { fez: cs.some(x => x.fez) } : null;
    };

    const itens = convertidos.map((c) => {
      const ddesde = Math.floor((agora - new Date(c.data_culto + 'T12:00:00').getTime()) / DIA);
      // contato ≤ 3d
      let contato;
      if (c.primeiro_contato_em) {
        const d = Math.floor((new Date(c.primeiro_contato_em).getTime() - new Date(c.data_culto + 'T12:00:00').getTime()) / DIA);
        contato = { feito: true, status: d <= 3 ? 'feito_no_prazo' : 'feito_atrasado', dias: d };
      } else {
        contato = { feito: false, status: ddesde > 3 ? 'atrasado' : (ddesde >= 2 ? 'vencendo' : 'no_prazo'), dias: ddesde };
      }
      // batismo ≤ 90d
      const b = batOf(c);
      const batismo = b && b.real ? { feito: true, status: 'feito' }
        : b ? { feito: false, status: 'inscrito' }
        : { feito: false, status: ddesde > 90 ? 'atrasado' : (ddesde > 75 ? 'vencendo' : 'no_prazo') };
      // Next ≤ 90d
      const n = nextOf(c);
      const nxt = n && n.fez ? { feito: true, status: 'feito' }
        : n ? { feito: false, status: 'inscrito' }
        : { feito: false, status: ddesde > 90 ? 'atrasado' : (ddesde > 75 ? 'vencendo' : 'no_prazo') };
      return { id: c.id, nome: c.nome, telefone: c.telefone, area: c.area, data_culto: c.data_culto, dias_desde_conversao: ddesde, membro_id: c.membro_id, encontro_responsavel_nome: c.encontro_responsavel_nome, contato, batismo, next: nxt };
    });

    const total = itens.length;
    const pct = (n) => total ? Math.round((n / total) * 100) : 0;
    const contatoOk = itens.filter(i => i.contato.feito && i.contato.status === 'feito_no_prazo').length;
    const batOk = itens.filter(i => i.batismo.feito).length;
    const nextOk = itens.filter(i => i.next.feito).length;
    res.json({
      resumo: {
        total,
        contato_no_prazo: contatoOk, contato_pct: pct(contatoOk),
        contato_atrasados: itens.filter(i => i.contato.status === 'atrasado').length,
        batismo_feitos: batOk, batismo_pct: pct(batOk),
        next_feitos: nextOk, next_pct: pct(nextOk),
      },
      itens,
    });
  } catch (e) {
    console.error('[cuidados/jornada-convertidos]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Agregado (aconselhamento / capelania mensal)
// ─────────────────────────────────────────────────────────────
router.get('/agregado', async (req, res) => {
  try {
    const { mes } = req.query; // 'YYYY-MM'
    const mesIso = mes ? `${mes}-01` : new Date().toISOString().slice(0, 7) + '-01';
    const { data, error } = await supabase
      .from('cui_atendimentos_agregado')
      .select('*')
      .eq('mes', mesIso)
      .order('tipo');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Mapeia tipo do agregado pro tipo correspondente em dados_brutos (pra KPI)
const TIPO_AGREGADO_DADO_BRUTO = {
  aconselhamento:         'solicitacoes_aconselh',
  capelania:              'solicitacoes_capelania',
  devocional:             'devocionais',
  jornada180_inscricoes:  'inscricoes_jornada180',
  novos_convertidos_atend:'novos_convertidos_atend',
};
const TIPOS_AGREGADO_VALIDOS = Object.keys(TIPO_AGREGADO_DADO_BRUTO);

router.post('/agregado', async (req, res) => {
  try {
    const { mes, tipo, quantidade, observacoes, area } = req.body;
    const mesIso = mes ? `${mes}-01` : new Date().toISOString().slice(0, 7) + '-01';
    if (!TIPOS_AGREGADO_VALIDOS.includes(tipo)) {
      return res.status(400).json({
        error: `tipo deve ser um de: ${TIPOS_AGREGADO_VALIDOS.join(', ')}`,
      });
    }
    const areaNormalizada = (area || 'igreja').toLowerCase();

    // Upsert manual: deletar existente do mesmo (mês,tipo,responsável) e inserir
    await supabase
      .from('cui_atendimentos_agregado')
      .delete()
      .eq('mes', mesIso)
      .eq('tipo', tipo)
      .eq('responsavel_id', req.user.userId);

    const { data, error } = await supabase
      .from('cui_atendimentos_agregado')
      .insert({
        mes: mesIso,
        tipo,
        quantidade: Number(quantidade) || 0,
        observacoes,
        responsavel_id: req.user.userId,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;

    // Espelha em dados_brutos pro KPI calcular sozinho (sem necessidade de UI separada)
    const tipoDadoBruto = TIPO_AGREGADO_DADO_BRUTO[tipo];
    if (tipoDadoBruto) {
      try {
        await supabase
          .from('dados_brutos')
          .upsert({
            tipo_id: tipoDadoBruto,
            area: areaNormalizada,
            data: mesIso,
            valor: Number(quantidade) || 0,
            contexto: { origem: 'cuidados.agregado', responsavel_id: req.user.userId },
            observacao: observacoes || null,
            origem: 'auto',
          }, { onConflict: 'tipo_id,area,data,contexto' });
      } catch (eMir) {
        console.warn('[cuidados/agregado] mirror dados_brutos falhou:', eMir.message);
      }
    }

    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Helpers de Membresia
// ─────────────────────────────────────────────────────────────
router.get('/buscar-membro', async (req, res) => {
  try {
    const cpf = cleanCpf(req.query.cpf);
    if (!cpf || cpf.length !== 11) return res.json({ membro: null });
    const m = await findMembroByCpf(cpf);
    res.json({ membro: m });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/criar-membro', async (req, res) => {
  try {
    const { nome, cpf, telefone, email, status = 'visitante' } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const { data, error } = await supabase
      .from('mem_membros')
      .insert({ nome, telefone, email, status })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
