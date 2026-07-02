const router = require('express').Router();
const { authenticate, authorize, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const { enqueueSync } = require('../services/cerebroSync');
const { mountWhatsappAuto } = require('./whatsappAutoRoutes');
const { acharOuCriarGuardado } = require('../services/membroMatch');

router.use(authenticate);

// Contato FEITO = o contato foi realizado, independente da resposta da pessoa
// (regra do Marcos · 2026-06-17). Vale pelo status do dropdown OU pelo
// primeiro_contato_em legado. "sem_retorno"/"numero_errado"/vazio NÃO contam.
// "Contato feito" = a mensagem foi enviada (independe da resposta). numero_errado
// entra aqui: a equipe mandou a mensagem, o número é que estava errado (Marcos 2026-07-01).
const CONTATO_FEITO_STATUS = new Set(['respondeu', 'atendido_respondido', 'nao_respondeu', 'nao_compareceu', 'nao_atendido', 'numero_errado']);
const contatoFoiFeito = (c) => !!c.primeiro_contato_em || CONTATO_FEITO_STATUS.has(c.primeiro_contato_status);

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

    // aconselhamento/capelania vêm da SOMA de quantidade (agregadoAnt abaixo), não
    // de count — por isso só contamos jornada180/convertidos aqui.
    const [{ count: jornAnt }, { count: convAtAnt }, { count: convCadAnt }] = await Promise.all([
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
// GET /api/cuidados/dashboard-series?dias=30|60|90|180|365|1825
// Séries do dashboard novo (tudo dado real · sem entrada manual):
//   · funil      → convertidos → 1º contato → engajados em +1 valor
//   · cards      → cobertura presencial/online × com-dados
//   · processos  → capelania (entra de verdade na Fase 2) × acompanhamento × Jornada 180
//   · devocional → leitores distintos por dia/semana/mês
// ─────────────────────────────────────────────────────────────
const DASH_DIAS_VALIDOS = [30, 60, 90, 180, 365, 1825];

function dashInicioJanela(dias) {
  return new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
}
// Bucket de uma data (YYYY-MM-DD) na granularidade: dia | semana (segunda) | mes
function dashBucket(dataIso, gran) {
  if (!dataIso) return null;
  const s = String(dataIso).slice(0, 10);
  if (gran === 'mes') return s.slice(0, 7);
  if (gran === 'semana') {
    const dt = new Date(s + 'T12:00:00');
    const dow = (dt.getDay() + 6) % 7; // 0 = segunda
    dt.setDate(dt.getDate() - dow);
    return dt.toISOString().slice(0, 10);
  }
  return s;
}
// Todos os buckets de [inicio, hoje] · preenche períodos vazios pra o gráfico ter eixo contínuo
function dashBucketsIntervalo(inicioIso, gran) {
  const out = [];
  const hoje = new Date();
  let cur = new Date(inicioIso + 'T12:00:00');
  if (gran === 'mes') cur = new Date(cur.getFullYear(), cur.getMonth(), 1, 12);
  else if (gran === 'semana') { const dow = (cur.getDay() + 6) % 7; cur.setDate(cur.getDate() - dow); }
  let guard = 0;
  while (cur <= hoje && guard++ < 6000) {
    out.push(dashBucket(cur.toISOString().slice(0, 10), gran));
    if (gran === 'mes') cur.setMonth(cur.getMonth() + 1);
    else if (gran === 'semana') cur.setDate(cur.getDate() + 7);
    else cur.setDate(cur.getDate() + 1);
  }
  return [...new Set(out)];
}

router.get('/dashboard-series', authorizeModule('cuidados', 1), async (req, res) => {
  try {
    let dias = parseInt(req.query.dias, 10);
    if (!DASH_DIAS_VALIDOS.includes(dias)) dias = 90;
    const inicio = dashInicioJanela(dias);
    const granTrend = dias <= 90 ? 'semana' : 'mes';
    const granDevoc = dias <= 90 ? 'dia' : (dias <= 730 ? 'semana' : 'mes');

    // Paginação genérica (PostgREST capa em 1000 linhas server-side)
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

    // ── Convertidos na janela (bucket pela data do culto) ──
    const convertidos = await fetchAll(
      'cui_convertidos',
      'id, data_culto, primeiro_contato_em, primeiro_contato_status, responsavel_atendimento, area, telefone',
      (q) => q.is('deleted_at', null).gte('data_culto', inicio),
    );

    // engajados = convertido com >=1 encaminhamento status='engajou' (consulta em lotes de 100)
    const engajadosSet = new Set();
    const convIds = convertidos.map(c => c.id);
    for (let i = 0; i < convIds.length; i += 100) {
      const lote = convIds.slice(i, i + 100);
      const { data: encs, error: eEnc } = await supabase
        .from('jornada_encaminhamentos')
        .select('convertido_id')
        .eq('status', 'engajou')
        .in('convertido_id', lote)
        .is('deleted_at', null);
      if (eEnc) throw eEnc;
      (encs || []).forEach(e => engajadosSet.add(e.convertido_id));
    }

    // Funil por bucket (mesmo bucket = mesma coorte de conversão)
    const funilMap = new Map();
    for (const c of convertidos) {
      const b = dashBucket(c.data_culto, granTrend);
      if (!b) continue;
      const o = funilMap.get(b) || { convertidos: 0, contato: 0, atendido: 0, engajados: 0 };
      o.convertidos++;
      if (contatoFoiFeito(c)) o.contato++;
      if (c.primeiro_contato_status === 'atendido_respondido') o.atendido++;
      if (engajadosSet.has(c.id)) o.engajados++;
      funilMap.set(b, o);
    }
    const funil = dashBucketsIntervalo(inicio, granTrend).map(b => ({
      periodo: b, ...(funilMap.get(b) || { convertidos: 0, contato: 0, atendido: 0, engajados: 0 }),
    }));

    // ── Próximos passos · distribuição por status do 1º contato + relatório por responsável (janela toda) ──
    const PP_STATUS_LABEL = { atendido_respondido: 'Atendido e respondido', nao_respondeu: 'Não respondeu', nao_atendido: 'Não atendido', numero_errado: 'Número errado', pendente: 'Pendente' };
    const ppCount = { atendido_respondido: 0, nao_respondeu: 0, nao_atendido: 0, numero_errado: 0, pendente: 0 };
    const respMap = new Map();
    for (const c of convertidos) {
      const k = (c.primeiro_contato_status && ppCount[c.primeiro_contato_status] !== undefined) ? c.primeiro_contato_status : 'pendente';
      ppCount[k]++;
      const r = (c.responsavel_atendimento || '').trim() || '— sem responsável';
      const o = respMap.get(r) || { responsavel: r, total: 0, contato: 0, atendido: 0, numero_errado: 0 };
      o.total++;
      if (contatoFoiFeito(c)) o.contato++;
      if (c.primeiro_contato_status === 'atendido_respondido') o.atendido++;
      if (c.primeiro_contato_status === 'numero_errado') o.numero_errado++;
      respMap.set(r, o);
    }
    const statusDist = Object.keys(PP_STATUS_LABEL).map(k => ({ status: k, label: PP_STATUS_LABEL[k], n: ppCount[k] }));
    // contato_pct = feitos ÷ todos (número errado conta como feito); atendido_pct exclui número errado do denominador
    const porResponsavel = [...respMap.values()].map(o => ({
      ...o,
      contato_pct: o.total ? Math.round(o.contato / o.total * 100) : 0,
      atendido_pct: (o.total - o.numero_errado) > 0 ? Math.round(o.atendido / (o.total - o.numero_errado) * 100) : 0,
    })).sort((a, b) => b.total - a.total);

    // Cards de cobertura (toda a janela) · "com dados" = telefone preenchido (dá pra contatar)
    const ehOnline = (a) => String(a || '').toLowerCase() === 'online';
    const temDados = (c) => String(c.telefone || '').replace(/\D/g, '').length >= 8;
    let cp = 0, cpd = 0, co = 0, cod = 0;
    for (const c of convertidos) {
      if (ehOnline(c.area)) { co++; if (temDados(c)) cod++; }
      else { cp++; if (temDados(c)) cpd++; }
    }
    const totalConv = convertidos.length;
    const cards = {
      conv_presencial_total: cp,
      conv_presencial_com_dados: cpd,
      conv_online_total: co,
      conv_online_com_dados: cod,
      pct_com_dados: totalConv ? Math.round(((cpd + cod) / totalConv) * 100) : 0,
    };

    // ── Visitas e atendimentos por tipo (cui_visitas) · substitui o antigo "processos"/Jornada 180 ──
    const VIS_TIPOS = ['visita_domiciliar', 'visita_hospitalar', 'funeral', 'casamento', 'aconselhamento', 'outro'];
    const zeroVis = () => Object.fromEntries(VIS_TIPOS.map(t => [t, 0]));
    const vis = await fetchAll('cui_visitas', 'id, data_visita, tipo', (q) => q.is('deleted_at', null).gte('data_visita', inicio));
    const visMap = new Map();
    for (const v of vis) {
      const b = dashBucket(v.data_visita, granTrend);
      if (!b) continue;
      const o = visMap.get(b) || zeroVis();
      o[VIS_TIPOS.includes(v.tipo) ? v.tipo : 'outro']++;
      visMap.set(b, o);
    }
    const visitas = dashBucketsIntervalo(inicio, granTrend).map(b => ({ periodo: b, ...(visMap.get(b) || zeroVis()) }));

    // ── Devocional · leitores distintos por bucket ──
    const devoc = await fetchAll('mem_devocionais', 'membro_id, data_devocional', (q) => q.gte('data_devocional', inicio));
    const devMap = new Map();
    for (const d of devoc) {
      const b = dashBucket(d.data_devocional, granDevoc);
      if (!b) continue;
      const set = devMap.get(b) || new Set();
      set.add(d.membro_id);
      devMap.set(b, set);
    }
    const devocional = dashBucketsIntervalo(inicio, granDevoc).map(b => ({
      periodo: b, leitores: devMap.get(b) ? devMap.get(b).size : 0,
    }));

    res.json({ dias, gran_trend: granTrend, gran_devoc: granDevoc, funil, cards, visitas, devocional, statusDist, porResponsavel });
  } catch (e) {
    console.error('[CUIDADOS] dashboard-series:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Acompanhamentos
// ─────────────────────────────────────────────────────────────
router.get('/acompanhamentos', async (req, res) => {
  try {
    const { status, search, responsavel, agendamento_from, agendamento_to } = req.query;
    let q = supabase
      .from('cui_acompanhamentos')
      .select('*')
      .is('deleted_at', null)
      .limit(500);
    if (status) q = q.eq('status', status);
    if (responsavel) q = q.eq('responsavel_id', responsavel);
    if (search) q = q.ilike('nome', `%${search}%`);
    // Janela de SESSÃO agendada (calendário de Visitas agendadas) · filtra por agendamento_data
    if (agendamento_from || agendamento_to) {
      q = q.not('agendamento_data', 'is', null);
      if (agendamento_from) q = q.gte('agendamento_data', agendamento_from);
      if (agendamento_to) q = q.lte('agendamento_data', agendamento_to);
      q = q.order('agendamento_data', { ascending: true });
    } else {
      q = q.order('created_at', { ascending: false });
    }
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
    if (!['aconselhamento', 'capelania'].includes(body.tipo)) body.tipo = 'aconselhamento';
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

    // Sessão agendada → avisa quem vai atender (aparece no calendário de Visitas agendadas)
    if (data.agendamento_data && data.agendamento_responsavel_id) {
      const quando = `${new Date(data.agendamento_data + 'T12:00:00').toLocaleDateString('pt-BR')}${data.agendamento_hora ? ' ' + String(data.agendamento_hora).slice(0, 5) : ''}`;
      notificar({
        modulo: 'cuidados',
        tipo: 'aconselhamento_agendado',
        titulo: `Sessão de ${data.tipo} — ${data.nome}`,
        mensagem: `Você tem uma sessão com ${data.nome} em ${quando}.`,
        link: '/ministerial/cuidados?tab=visitas',
        severidade: 'info',
        chaveDedup: `cui_acomp_ag_${data.id}_${data.agendamento_data}`,
        targetIds: [data.agendamento_responsavel_id],
      }).catch(() => {});
    }

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

    // Fecha o ciclo com o membro: push avisando que está sendo cuidado /
    // foi atendido (a Edge Function ignora 'pendente'). Em background.
    if (process.env.SUPABASE_URL && tratamento_status !== 'pendente') {
      fetch(`${process.env.SUPABASE_URL}/functions/v1/notify-cuidado-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inscricao_id: req.params.id, status: tratamento_status }),
      }).catch((e) => console.error('[CUIDADOS] notify-status falhou:', e.message));
    }

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
// Jornada 180 · TURMAS (estrutura própria de Cuidados · dado sensível)
// Espelha grupos (turma → líder → participantes → encontros → presenças),
// mas vive em Cuidados (RLS scoped 'cuidados') e fica FORA dos KPIs de grupos.
// ─────────────────────────────────────────────────────────────
const J180_AREAS = ['ami', 'sede', 'online'];

// Soft-delete via UPDATE (service_role) · a tabela fica fora da whitelist app_soft_delete
async function j180SoftDelete(table, id, res) {
  const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
}

// GET /j180/turmas?area=&incluir_inativas= — turmas + contagem de participantes ativos
router.get('/j180/turmas', authorizeModule('cuidados', 1), async (req, res) => {
  try {
    const { area, incluir_inativas } = req.query;
    let q = supabase.from('cui_j180_turmas').select('*').is('deleted_at', null).order('nome');
    if (area && J180_AREAS.includes(area)) q = q.eq('area', area);
    if (incluir_inativas !== 'true') q = q.eq('ativo', true);
    const { data: turmas, error } = await q;
    if (error) throw error;
    const ids = (turmas || []).map(t => t.id);
    const countByTurma = new Map();
    if (ids.length) {
      const { data: membros } = await supabase
        .from('cui_j180_turma_membros').select('turma_id').in('turma_id', ids).is('saiu_em', null);
      (membros || []).forEach(m => countByTurma.set(m.turma_id, (countByTurma.get(m.turma_id) || 0) + 1));
    }
    res.json((turmas || []).map(t => ({ ...t, participantes_count: countByTurma.get(t.id) || 0 })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /j180/turmas/:id — detalhe (turma + participantes ativos + encontros recentes)
router.get('/j180/turmas/:id', authorizeModule('cuidados', 1), async (req, res) => {
  try {
    const { data: turma, error } = await supabase.from('cui_j180_turmas').select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!turma) return res.status(404).json({ error: 'Turma não encontrada' });
    const [{ data: membros }, { data: encontros }] = await Promise.all([
      supabase.from('cui_j180_turma_membros').select('*').eq('turma_id', turma.id).is('saiu_em', null).order('nome'),
      supabase.from('cui_j180_encontros').select('*').eq('turma_id', turma.id).is('deleted_at', null).order('data', { ascending: false }).limit(20),
    ]);
    res.json({ ...turma, membros: membros || [], encontros: encontros || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /j180/turmas — cria turma
router.post('/j180/turmas', authorizeModule('cuidados', 3), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    const area = J180_AREAS.includes(b.area) ? b.area : 'sede';
    const { data, error } = await supabase.from('cui_j180_turmas').insert({
      nome: b.nome, area, lider_id: b.lider_id || null, lider_nome: b.lider_nome || null,
      temporada: b.temporada || null, dia_semana: b.dia_semana ?? null, horario: b.horario || null,
      descricao: b.descricao || null, ativo: b.ativo !== false,
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /j180/turmas/:id
router.patch('/j180/turmas/:id', authorizeModule('cuidados', 3), async (req, res) => {
  try {
    const b = { ...req.body };
    if (b.area && !J180_AREAS.includes(b.area)) delete b.area;
    delete b.id; delete b.created_at; delete b.deleted_at;
    const { data, error } = await supabase.from('cui_j180_turmas').update(b).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /j180/turmas/:id — soft-delete
router.delete('/j180/turmas/:id', authorizeModule('cuidados', 3), async (req, res) => {
  await j180SoftDelete('cui_j180_turmas', req.params.id, res);
});

// POST /j180/turmas/:id/membros — adiciona participante (resolve membro por CPF se vier)
router.post('/j180/turmas/:id/membros', authorizeModule('cuidados', 3), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.nome) return res.status(400).json({ error: 'Nome é obrigatório' });
    let membro_id = b.membro_id || null;
    if (!membro_id && b.cpf) {
      const m = await findMembroByCpf(b.cpf);
      if (m) membro_id = m.id;
    }
    const { data, error } = await supabase.from('cui_j180_turma_membros').insert({
      turma_id: req.params.id, membro_id, nome: b.nome, telefone: b.telefone || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /j180/membros/:id — ex.: marcar saída (saiu_em)
router.patch('/j180/membros/:id', authorizeModule('cuidados', 3), async (req, res) => {
  try {
    const b = { ...req.body }; delete b.id; delete b.turma_id; delete b.created_at;
    const { data, error } = await supabase.from('cui_j180_turma_membros').update(b).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /j180/membros/:id — remove do roster (linha de vínculo)
router.delete('/j180/membros/:id', authorizeModule('cuidados', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('cui_j180_turma_membros').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /j180/turmas/:id/encontros — encontros + ids dos presentes
router.get('/j180/turmas/:id/encontros', authorizeModule('cuidados', 1), async (req, res) => {
  try {
    const { data: encontros, error } = await supabase
      .from('cui_j180_encontros').select('*').eq('turma_id', req.params.id).is('deleted_at', null)
      .order('data', { ascending: false }).limit(50);
    if (error) throw error;
    const ids = (encontros || []).map(e => e.id);
    const presPorEncontro = new Map();
    if (ids.length) {
      const { data: pres } = await supabase
        .from('cui_j180_encontro_presencas').select('encontro_id, turma_membro_id, presente').in('encontro_id', ids);
      (pres || []).forEach(p => {
        const arr = presPorEncontro.get(p.encontro_id) || [];
        if (p.presente) arr.push(p.turma_membro_id);
        presPorEncontro.set(p.encontro_id, arr);
      });
    }
    res.json((encontros || []).map(e => ({ ...e, presentes: presPorEncontro.get(e.id) || [] })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /j180/turmas/:id/encontros — registra encontro + presenças
// body: { data, tema?, observacoes?, presentes: [turma_membro_id] }
router.post('/j180/turmas/:id/encontros', authorizeModule('cuidados', 3), async (req, res) => {
  try {
    const b = req.body || {};
    const uid = req.user.userId || req.user.id;
    const { data: enc, error: e1 } = await supabase.from('cui_j180_encontros').insert({
      turma_id: req.params.id, data: b.data || new Date().toISOString().slice(0, 10),
      tema: b.tema || null, observacoes: b.observacoes || null, registrado_por: uid,
    }).select().single();
    if (e1) throw e1;
    const presentes = Array.isArray(b.presentes) ? b.presentes : [];
    if (presentes.length) {
      const rows = presentes.map(tmid => ({ encontro_id: enc.id, turma_membro_id: tmid, presente: true }));
      const { error: e2 } = await supabase.from('cui_j180_encontro_presencas').insert(rows);
      if (e2) throw e2;
    }
    res.status(201).json({ ...enc, presentes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /j180/encontros/:id — soft-delete
router.delete('/j180/encontros/:id', authorizeModule('cuidados', 3), async (req, res) => {
  await j180SoftDelete('cui_j180_encontros', req.params.id, res);
});

// GET /j180/relatorio — métricas das turmas (nº turmas/participantes/líderes/frequência por área)
router.get('/j180/relatorio', authorizeModule('cuidados', 1), async (req, res) => {
  try {
    const { data: turmas } = await supabase.from('cui_j180_turmas').select('id, area, lider_nome').is('deleted_at', null).eq('ativo', true);
    const turmaIds = (turmas || []).map(t => t.id);
    const lideres = new Set((turmas || []).map(t => String(t.lider_nome || '').trim().toLowerCase()).filter(Boolean));
    const porArea = {};
    (turmas || []).forEach(t => { porArea[t.area] = (porArea[t.area] || 0) + 1; });

    let participantes = 0, totalPresencas = 0, totalEncontros = 0;
    const d180 = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
    if (turmaIds.length) {
      const { count: pc } = await supabase.from('cui_j180_turma_membros')
        .select('id', { count: 'exact', head: true }).in('turma_id', turmaIds).is('saiu_em', null);
      participantes = pc || 0;

      const { data: encs } = await supabase.from('cui_j180_encontros')
        .select('id').in('turma_id', turmaIds).is('deleted_at', null).gte('data', d180);
      const encIds = (encs || []).map(e => e.id);
      totalEncontros = encIds.length;
      for (let i = 0; i < encIds.length; i += 100) {
        const lote = encIds.slice(i, i + 100);
        const { count } = await supabase.from('cui_j180_encontro_presencas')
          .select('id', { count: 'exact', head: true }).in('encontro_id', lote).eq('presente', true);
        totalPresencas += count || 0;
      }
    }
    res.json({
      total_turmas: (turmas || []).length,
      total_lideres: lideres.size,
      total_participantes: participantes,
      por_area: porArea,
      frequencia: {
        total_encontros: totalEncontros,
        total_presencas: totalPresencas,
        media_por_encontro: totalEncontros ? Math.round((totalPresencas / totalEncontros) * 10) / 10 : 0,
      },
    });
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

// POST /convertidos REMOVIDO (2026-06-25) · convertido nasce SEMPRE do culto
// (cultos_decisoes_pessoas → trigger tg_cultos_dec_pessoas_to_cuidados), nunca no
// Cuidados. A entrada única é a Integração. Caso raro de "história posterior" (sem
// culto/data) é vinculado direto no banco, sem botão no sistema (decisão do Marcos ·
// não facilitar a informalidade). Cuidados só ACOMPANHA/edita (PATCH abaixo).

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
  grupos:      { valor: 'conectar', modulo: 'grupos',       label: 'Grupos',       link: '/grupos?tab=encaminhados' },
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

// POST /api/cuidados/convertidos/:id/direcionar
// Pra NOVO CONVERTIDO o único próximo passo direcionável no Cuidados é o NEXT (decisão
// Marcos · 2026-06-25 · o direcionamento pros valores migrou pra DENTRO do Next). Direcionar
// "next" INSCREVE a pessoa numa matrícula em FILA DE ESPERA reusando o membro_id (sem duplicar);
// ela passa a aparecer no Next. NÃO marca engajamento (o NSM conta Next só quando 'formado').
// Misclick: voltar pra "—" RETRAI a matrícula criada, só se intocada (sem turma · não formada).
// retrairDirecionamento ainda cobre os tipos LEGADOS (grupos/voluntarios/batismo) de registros
// criados antes da inversão (PRs #1242/#1293).
const DIRECIONAMENTOS_VALIDOS = ['next'];

// Desfaz o registro que o direcionamento anterior criou — só se ainda intocado.
async function retrairDirecionamento(tipo, id, convertidoId) {
  if (!tipo) return;
  const agora = new Date().toISOString();
  if (tipo === 'grupos' || tipo === 'voluntarios') {
    let q = supabase.from('jornada_encaminhamentos')
      .update({ deleted_at: agora })
      .eq('status', 'pendente').is('recebido_em', null).is('deleted_at', null);
    if (id) q = q.eq('id', id);
    else q = q.eq('convertido_id', convertidoId).eq('destino', tipo).eq('origem', 'cuidados'); // legado sem ref
    await q;
  } else if (tipo === 'next' && id) {
    await supabase.from('next_matriculas')
      .update({ deleted_at: agora })
      .eq('id', id).eq('status', 'matriculado').is('turma_id', null).is('deleted_at', null);
  } else if (tipo === 'batismo' && id) {
    await supabase.from('batismo_inscricoes')
      .update({ status: 'cancelado' })
      .eq('id', id).eq('status', 'pendente').is('data_batismo', null);
  }
}

router.post('/convertidos/:id/direcionar', authorizeModule('cuidados', 3), async (req, res) => {
  try {
    const { direcionamento } = req.body || {};
    if (direcionamento != null && !DIRECIONAMENTOS_VALIDOS.includes(direcionamento)) {
      return res.status(400).json({ error: 'Direcionamento inválido' });
    }
    const userId = req.user.userId || req.user.id;
    const novo = direcionamento || null;

    // Estado atual (pra retrair o anterior se o destino mudou)
    const { data: atual, error: e0 } = await supabase
      .from('cui_convertidos')
      .select('id, nome, telefone, cpf, area, membro_id, direcionamento, direcionamento_ref_tipo, direcionamento_ref_id')
      .eq('id', req.params.id).single();
    if (e0) throw e0;

    // 1) Retrai o que o direcionamento ANTERIOR criou (se mudou). Usa o ref; cai no
    //    direcionamento antigo como tipo quando não há ref (registros pré-feature).
    const tipoAntigo = atual.direcionamento_ref_tipo || atual.direcionamento;
    if (tipoAntigo && atual.direcionamento !== novo) {
      await retrairDirecionamento(tipoAntigo, atual.direcionamento_ref_id, atual.id);
    }

    // Resolve membro_id (pra Next/Batismo não duplicarem cadastro)
    let membroId = atual.membro_id || null;
    async function garantirMembro() {
      if (membroId) return membroId;
      try {
        const r = await acharOuCriarGuardado({
          cpf: atual.cpf || null, telefone: atual.telefone || null, nome: atual.nome, status: 'visitante',
        });
        membroId = r?.membro_id || null;
        if (membroId) await supabase.from('cui_convertidos').update({ membro_id: membroId }).eq('id', atual.id);
      } catch (_) { /* segue sem membro_id */ }
      return membroId;
    }

    // nome / sobrenome (batismo exige os 2)
    const partes = String(atual.nome || '').trim().split(/\s+/);
    const primeiroNome = partes[0] || (atual.nome || 'Convertido');
    const sobrenome = partes.slice(1).join(' ');

    let refTipo = null, refId = null;
    const extra = {};

    // Único destino do Cuidados = Next (inscreve em fila de espera, reusa membro_id, sem duplicar).
    if (novo === 'next') {
      await garantirMembro();
      let ja = null;
      if (membroId) {
        const { data } = await supabase.from('next_matriculas').select('id')
          .eq('membro_id', membroId).is('deleted_at', null)
          .in('status', ['matriculado', 'formado']).limit(1).maybeSingle();
        ja = data;
      }
      if (ja) { refTipo = 'next'; refId = null; extra.ja_inscrito = true; } // já no Next · não duplica
      else {
        const { data: row, error: en } = await supabase.from('next_matriculas').insert({
          turma_id: null, nome: primeiroNome, sobrenome: sobrenome || null,
          cpf: atual.cpf || null, telefone: atual.telefone || null, membro_id: membroId || null,
          status: 'matriculado', origem: 'manual', observacoes: 'Direcionado pelo Cuidados', registered_by: userId,
        }).select().single();
        if (en) throw en;
        refTipo = 'next'; refId = row.id; extra.matricula_id = row.id;
      }
    }

    // 2) Salva o direcionamento + a referência (pro retract) no convertido
    const { data: conv, error: e1 } = await supabase.from('cui_convertidos').update({
      direcionamento: novo,
      direcionamento_em: novo ? new Date().toISOString() : null,
      direcionamento_ref_tipo: refTipo,
      direcionamento_ref_id: refId,
    }).eq('id', atual.id).select().single();
    if (e1) throw e1;

    res.json({ convertido: conv, ...extra });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Visitas e atendimentos avulsos (cui_visitas)
// Lista da aba "Visitas e atendimentos" · visitas pastorais e atendimentos FORA
// do funil de novos convertidos (substituiu o calendário da aba "Visitas agendadas").
// ─────────────────────────────────────────────────────────────
const VISITA_TIPOS = ['visita_domiciliar', 'visita_hospitalar', 'funeral', 'casamento', 'aconselhamento', 'outro'];
const VISITA_STATUS = ['agendada', 'realizada', 'cancelada'];

router.get('/visitas', authorizeModule('cuidados', 1), async (req, res) => {
  try {
    const { status, tipo, search } = req.query;
    let q = supabase.from('cui_visitas').select('*').is('deleted_at', null)
      .order('data_visita', { ascending: false }).limit(1000);
    if (status) q = q.eq('status', status);
    if (tipo) q = q.eq('tipo', tipo);
    if (search) q = q.ilike('nome', `%${String(search).replace(/[%,()]/g, ' ')}%`);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/visitas', authorizeModule('cuidados', 3), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.nome) return res.status(400).json({ error: 'Nome obrigatório' });
    const payload = {
      nome: b.nome,
      membro_id: b.membro_id || null,
      telefone: b.telefone || null,
      data_visita: b.data_visita || new Date().toISOString().slice(0, 10),
      tipo: VISITA_TIPOS.includes(b.tipo) ? b.tipo : 'visita_domiciliar',
      tipo_outro: b.tipo === 'outro' ? (b.tipo_outro || null) : null,
      responsavel: b.responsavel || null,
      status: VISITA_STATUS.includes(b.status) ? b.status : 'realizada',
      observacao: b.observacao || null,
      created_by: req.user.userId || req.user.id || null,
    };
    if (!payload.membro_id && b.cpf) {
      const m = await findMembroByCpf(b.cpf);
      if (m) payload.membro_id = m.id;
    }
    const { data, error } = await supabase.from('cui_visitas').insert(payload).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/visitas/:id', authorizeModule('cuidados', 3), async (req, res) => {
  try {
    const b = req.body || {};
    const patch = {};
    for (const k of ['nome', 'telefone', 'data_visita', 'tipo', 'tipo_outro', 'responsavel', 'status', 'observacao', 'membro_id']) {
      if (k in b) patch[k] = b[k];
    }
    if (patch.tipo && !VISITA_TIPOS.includes(patch.tipo)) delete patch.tipo;
    if (patch.status && !VISITA_STATUS.includes(patch.status)) delete patch.status;
    if (patch.tipo && patch.tipo !== 'outro') patch.tipo_outro = null; // limpa descrição livre se não for "Outro"
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('cui_visitas')
      .update(patch).eq('id', req.params.id).is('deleted_at', null).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/visitas/:id', authorizeModule('cuidados', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('cui_visitas')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params.id).is('deleted_at', null);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
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
// Marcelo/Cuidados vê todas). Cruza batismo_inscricoes + Next (formado na turma
// em next_matriculas · fonte única desde 20260626180000 · paginado).
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
      'id, nome, telefone, cpf, membro_id, data_culto, area, primeiro_contato_em, primeiro_contato_status, encontro_status, encontro_responsavel_nome',
      (q) => { q = q.is('deleted_at', null); return area ? q.eq('area', area) : q; },
    );
    const batismos = await fetchAll('batismo_inscricoes', 'status, membro_id, cpf, nome', (q) => q.is('deleted_at', null));
    const nextMats = await fetchAll('next_matriculas', 'membro_id, cpf, nome', (q) => q.is('deleted_at', null)); // matrícula = "inscrito"
    const nextFormados = await fetchAll('vw_next_formado_pessoa', 'membro_id, cpf, nome', (q) => q); // "fez Next" POR PESSOA (cross-turma)

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
      // Com membro_id/CPF, casa SÓ por chave forte — cruzar por nome aqui gera
      // falso positivo (homônimo) e super-conta. Nome só quando não há identificação.
      const temCpf = onlyDigits(c.cpf).length === 11;
      if (c.membro_id || temCpf) {
        const cs = [c.membro_id ? bM.get(c.membro_id) : null, temCpf ? bC.get(onlyDigits(c.cpf)) : null].filter(Boolean);
        return cs.length ? { real: cs.some(x => x.real) } : null;
      }
      const hit = bN.get(String(c.nome || '').trim().toLowerCase());
      return hit ? { real: hit.real } : null;
    };
    // "fez Next" = formado POR PESSOA (fonte única vw_next_formado_pessoa · cross-turma);
    // "inscrito" = tem matrícula (qualquer). Casa por chave forte (membro/CPF); nome só sem id.
    const insM = new Set(), insC = new Set(), insN = new Set();
    for (const m of nextMats) {
      if (m.membro_id) insM.add(m.membro_id);
      const cc = onlyDigits(m.cpf); if (cc.length === 11) insC.add(cc);
      const nn = String(m.nome || '').trim().toLowerCase(); if (nn) insN.add(nn);
    }
    const fezM = new Set(), fezC = new Set(), fezN = new Set();
    for (const v of nextFormados) {
      if (v.membro_id) fezM.add(v.membro_id);
      const cc = onlyDigits(v.cpf); if (cc.length === 11) fezC.add(cc);
      const nn = String(v.nome || '').trim().toLowerCase(); if (nn) fezN.add(nn);
    }
    const matchPessoa = (c, M, C, N) => {
      const temCpf = onlyDigits(c.cpf).length === 11;
      if (c.membro_id || temCpf) return (c.membro_id && M.has(c.membro_id)) || (temCpf && C.has(onlyDigits(c.cpf)));
      const nn = String(c.nome || '').trim().toLowerCase();
      return !!nn && N.has(nn);
    };
    const nextOf = (c) => {
      if (matchPessoa(c, fezM, fezC, fezN)) return { fez: true };
      if (matchPessoa(c, insM, insC, insN)) return { fez: false };
      return null;
    };

    const itens = convertidos.map((c) => {
      const ddesde = Math.floor((agora - new Date(c.data_culto + 'T12:00:00').getTime()) / DIA);
      // contato FEITO (independe da resposta): por data legada OU pelo status do dropdown
      let contato;
      if (c.primeiro_contato_em) {
        const d = Math.floor((new Date(c.primeiro_contato_em).getTime() - new Date(c.data_culto + 'T12:00:00').getTime()) / DIA);
        contato = { feito: true, status: d <= 3 ? 'feito_no_prazo' : 'feito_atrasado', dias: d };
      } else if (CONTATO_FEITO_STATUS.has(c.primeiro_contato_status)) {
        contato = { feito: true, status: 'feito', dias: ddesde };
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
    // Contato = FEITO (independe da resposta). "no prazo" (≤3d) vira sub-recorte.
    const contatoFeitos = itens.filter(i => i.contato.feito).length;
    const contatoNoPrazo = itens.filter(i => i.contato.status === 'feito_no_prazo').length;
    const batOk = itens.filter(i => i.batismo.feito).length;
    const nextOk = itens.filter(i => i.next.feito).length;
    res.json({
      resumo: {
        total,
        contato_feitos: contatoFeitos, contato_pct: pct(contatoFeitos),
        contato_pendentes: total - contatoFeitos,
        contato_no_prazo: contatoNoPrazo, // sub-recorte: feitos em ≤3 dias
        contato_atrasados: total - contatoFeitos, // compat: agora = pendentes
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
