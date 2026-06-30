// ============================================================================
// Módulo NEXT - rotas autenticadas
//
// Eventos:
//   GET    /eventos                       - lista eventos (com contagem)
//   POST   /eventos                       - criar evento
//   PUT    /eventos/:id                   - atualizar
//   POST   /eventos/auto-create-mes       - cria 3 eventos do mês (1o-3o domingo)
//
// Inscrições:
//   GET    /inscricoes                    - lista (filtros: evento_id, search, status)
//   GET    /inscricoes/:id                - detalhe
//   POST   /inscricoes                    - inscrever manualmente
//   PUT    /inscricoes/:id                - atualizar
//   POST   /inscricoes/:id/checkin        - marcar check-in
//   DELETE /inscricoes/:id/checkin        - desfazer check-in
//   POST   /inscricoes/:id/indicacoes     - { tipos: ['batismo', 'servir'...] }
//   GET    /indicacoes                    - lista de indicacoes pendentes
//   PUT    /indicacoes/:id                - atualizar status
//
// Dashboard:
//   GET    /dashboard                     - resumo do mês corrente
// ============================================================================

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const { coletarTodos } = require('../services/kpiAutoCollector');
const { escapePostgrestValue } = require('../utils/sanitize');
const { direcionarMatricula, signDirecionarToken } = require('../services/nextDirecionar');

// Re-calcula KPIs do NEXT em background (não bloqueia a resposta).
// Chamado após qualquer mudança em inscrições ou indicacoes.
function recalcularKpisNext() {
  setImmediate(async () => {
    try {
      await coletarTodos({ fontes: ['next.'] });
    } catch (e) {
      console.error('[next] erro ao recalcular KPIs:', e.message);
    }
  });
}

router.use(authenticate);

// ----------------------------------------------------------------------------
// Eventos
// ----------------------------------------------------------------------------
router.get('/eventos', async (req, res) => {
  const { ano, mes, status } = req.query;
  let q = supabase.from('next_eventos').select('*').order('data', { ascending: false });
  if (status) q = q.eq('status', status);
  if (ano) {
    const start = `${ano}-01-01`;
    const end = `${Number(ano) + 1}-01-01`;
    q = q.gte('data', start).lt('data', end);
  }
  if (mes && ano) {
    const m = String(mes).padStart(2, '0');
    const start = `${ano}-${m}-01`;
    const next = new Date(Date.UTC(Number(ano), Number(mes), 1)).toISOString().slice(0, 10);
    q = q.gte('data', start).lt('data', next);
  }
  const { data, error } = await q.limit(500);
  if (error) return res.status(500).json({ error: error.message });

  // Contagem agregada via view (1 row por evento) — evita o limite default
  // de 1000 rows do supabase ao agregar em memória com 2.4k+ inscrições.
  const ids = (data || []).map(e => e.id);
  let counts = {};
  if (ids.length) {
    const { data: rows } = await supabase
      .from('vw_next_eventos_counts')
      .select('evento_id, inscritos, checkins')
      .in('evento_id', ids);
    for (const row of (rows || [])) {
      counts[row.evento_id] = { inscritos: Number(row.inscritos) || 0, checkins: Number(row.checkins) || 0 };
    }
  }
  res.json((data || []).map(e => ({
    ...e,
    inscritos: counts[e.id]?.inscritos || 0,
    checkins: counts[e.id]?.checkins || 0,
  })));
});

router.post('/eventos', async (req, res) => {
  const { data, titulo, observacoes, total_lista, presentes_impressa, presentes_manuscritos, arquivo_origem } = req.body || {};
  if (!data) return res.status(400).json({ error: 'data obrigatoria' });
  const { data: row, error } = await supabase
    .from('next_eventos')
    .insert({
      data, titulo: titulo || null, observacoes: observacoes || null,
      total_lista: total_lista ?? null,
      presentes_impressa: presentes_impressa ?? null,
      presentes_manuscritos: presentes_manuscritos ?? null,
      arquivo_origem: arquivo_origem || null,
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(row);
});

router.put('/eventos/:id', async (req, res) => {
  const allowed = [
    'data', 'titulo', 'observacoes', 'status',
    'total_lista', 'presentes_impressa', 'presentes_manuscritos', 'arquivo_origem',
  ];
  const update = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(req.body || {})) {
    if (allowed.includes(k)) update[k] = v;
  }
  const { data, error } = await supabase
    .from('next_eventos').update(update).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Cria os 3 primeiros domingos do mês informado (idempotente)
router.post('/eventos/auto-create-mes', async (req, res) => {
  const ano = Number(req.body?.ano) || new Date().getFullYear();
  const mes = Number(req.body?.mes) || (new Date().getMonth() + 1);

  const datas = [];
  let cursor = new Date(Date.UTC(ano, mes - 1, 1));
  // primeiro domingo
  while (cursor.getUTCDay() !== 0) cursor.setUTCDate(cursor.getUTCDate() + 1);
  for (let i = 0; i < 3; i++) {
    datas.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  const created = [];
  for (const d of datas) {
    const { data: row, error } = await supabase
      .from('next_eventos')
      .upsert({ data: d, titulo: `NEXT ${d}` }, { onConflict: 'data', ignoreDuplicates: true })
      .select();
    if (!error && row && row[0]) created.push(row[0]);
  }
  res.json({ ano, mes, datas, created: created.length });
});

// ----------------------------------------------------------------------------
// Inscrições
// ----------------------------------------------------------------------------
router.get('/inscricoes', async (req, res) => {
  const { evento_id, search, com_checkin, com_indicacao, origem_lista, limit } = req.query;
  const maxLimit = Math.min(Number(limit) || 500, 5000);
  let q = supabase.from('next_inscricoes').select('*, evento:next_eventos(id, data, titulo)')
    .order('created_at', { ascending: false }).limit(maxLimit);
  if (evento_id) q = q.eq('evento_id', evento_id);
  if (com_checkin === 'true') q = q.not('check_in_at', 'is', null);
  if (com_checkin === 'false') q = q.is('check_in_at', null);
  if (origem_lista && ['impressa', 'manuscrito'].includes(origem_lista)) q = q.eq('origem_lista', origem_lista);
  if (com_indicacao === 'true') {
    q = q.or('indicou_batismo.eq.true,indicou_servir.eq.true,indicou_grupo.eq.true,indicou_dizimo.eq.true');
  }
  if (search) {
    const s = `%${escapePostgrestValue(search)}%`;
    q = q.or(`nome.ilike.${s},sobrenome.ilike.${s},email.ilike.${s},cpf.ilike.${s}`);
  }
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

router.get('/inscricoes/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('next_inscricoes')
    .select('*, evento:next_eventos(*), indicacoes:next_indicacoes(*)')
    .eq('id', req.params.id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Inscrição não encontrada' });
  res.json(data);
});

const { acharOuCriarGuardado } = require('../services/membroMatch');

router.post('/inscricoes', async (req, res) => {
  const { evento_id, nome, sobrenome, cpf, telefone, email, data_nascimento, observacoes, origem_lista } = req.body || {};
  if (!nome || !evento_id) return res.status(400).json({ error: 'nome e evento_id obrigatórios' });
  const cleanCpf = cpf ? String(cpf).replace(/\D/g, '') : null;
  const validOrigemLista = ['impressa', 'manuscrito'].includes(origem_lista) ? origem_lista : null;

  // ANTES de criar a inscrição: garantir que existe mem_membros (cria se necessário).
  // Membresia e fonte única — toda pessoa que se inscreve no NEXT vira membro
  // (status='visitante' no mínimo) e fica acessivel em /ministerial/membresia.
  let membro_id = null;
  try {
    const r = await acharOuCriarGuardado({
      cpf: cleanCpf, email, telefone,
      nome: [nome, sobrenome].filter(Boolean).join(' '),
      dataNascimento: data_nascimento || null,
      status: 'visitante',
    });
    membro_id = r.membro_id;
  } catch (e) {
    console.error('next/inscricoes acharOuCriarGuardado failed:', e.message);
    // segue sem membro_id - inscrição ainda e criada pra não perder dado
  }

  const { data, error } = await supabase
    .from('next_inscricoes')
    .insert({
      evento_id, nome, sobrenome: sobrenome || null, cpf: cleanCpf,
      telefone: telefone || null, email: email ? String(email).toLowerCase() : null,
      data_nascimento: data_nascimento || null, observacoes: observacoes || null,
      origem: 'manual', origem_lista: validOrigemLista,
      registered_by: req.user?.id || null,
      membro_id,
    })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put('/inscricoes/:id', async (req, res) => {
  const allowed = [
    'nome', 'sobrenome', 'cpf', 'telefone', 'email', 'data_nascimento',
    'observacoes', 'evento_id', 'ja_batizado', 'ja_voluntario', 'ja_doador',
    'origem_lista',
  ];
  const update = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(req.body || {})) {
    if (allowed.includes(k)) update[k] = v;
  }
  const { data, error } = await supabase
    .from('next_inscricoes').update(update).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ----------------------------------------------------------------------------
// Check-in
// ----------------------------------------------------------------------------
router.post('/inscricoes/:id/checkin', async (req, res) => {
  const { data, error } = await supabase
    .from('next_inscricoes')
    .update({
      check_in_at: new Date().toISOString(),
      check_in_by: req.user?.id || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/inscricoes/:id/checkin', async (req, res) => {
  const { error } = await supabase
    .from('next_inscricoes')
    .update({ check_in_at: null, check_in_by: null, updated_at: new Date().toISOString() })
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ----------------------------------------------------------------------------
// Indicacoes (batismo, servir, grupo, dizimo)
// ----------------------------------------------------------------------------
const TIPOS_AREA = {
  batismo: { area: 'integracao', flag: 'indicou_batismo', titulo: 'Nova indicacao de batismo no NEXT' },
  servir: { area: 'voluntariado', flag: 'indicou_servir', titulo: 'Nova indicacao para servir no NEXT' },
  grupo: { area: 'grupos', flag: 'indicou_grupo', titulo: 'Nova indicacao de grupo no NEXT' },
  dizimo: { area: 'generosidade', flag: 'indicou_dizimo', titulo: 'Nova indicacao de dizimo no NEXT' },
};

router.post('/inscricoes/:id/indicacoes', async (req, res) => {
  try {
    const { tipos = [], observacoes } = req.body || {};
    if (!Array.isArray(tipos) || tipos.length === 0) {
      return res.status(400).json({ error: 'Informe ao menos um tipo' });
    }
    const validos = tipos.filter(t => TIPOS_AREA[t]);
    if (validos.length === 0) return res.status(400).json({ error: 'Nenhum tipo valido' });

    // Atualiza flags na inscrição
    const update = {
      indicacao_observacoes: observacoes || null,
      indicacao_marcada_em: new Date().toISOString(),
      indicacao_marcada_por: req.user?.id || null,
      updated_at: new Date().toISOString(),
    };
    for (const t of validos) update[TIPOS_AREA[t].flag] = true;

    const { data: insc, error: e1 } = await supabase
      .from('next_inscricoes')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (e1) return res.status(500).json({ error: e1.message });

    // Cria/atualiza indicacoes (1 por tipo)
    const linhas = validos.map(t => ({
      inscricao_id: req.params.id,
      tipo: t,
      area_destino: TIPOS_AREA[t].area,
      observacoes: observacoes || null,
      status: 'pendente',
    }));

    for (const linha of linhas) {
      await supabase
        .from('next_indicacoes')
        .upsert(linha, { onConflict: 'inscricao_id,tipo' });
    }

    // Fase 2 · ponte pra caixa unificada de encaminhamentos: grupo/servir viram
    // encaminhamento na MESMA caixa que Grupos/Voluntariado já trabalham (com
    // devolutiva + "engajou" materializando o vínculo na NSM). batismo→Integração
    // e dízimo→generosidade seguem só em next_indicacoes (sem caixa consumidora).
    const CONVERGE = {
      grupo:  { destino: 'grupos',      valor_alvo: 'conectar', link: '/grupos' },
      servir: { destino: 'voluntarios', valor_alvo: 'servir',   link: '/ministerial/voluntariado/encaminhados' },
    };
    const nomeCompleto = `${insc.nome || ''} ${insc.sobrenome || ''}`.trim() || insc.nome || 'Sem nome';
    for (const t of validos) {
      const cv = CONVERGE[t];
      if (!cv) continue;
      try {
        // idempotente: 1 encaminhamento por (inscrição × destino)
        const { data: jaTem } = await supabase
          .from('jornada_encaminhamentos')
          .select('id')
          .eq('next_inscricao_id', req.params.id)
          .eq('destino', cv.destino)
          .is('deleted_at', null)
          .limit(1).maybeSingle();
        if (jaTem) continue;
        await supabase.from('jornada_encaminhamentos').insert({
          origem: 'next',
          next_inscricao_id: req.params.id,
          membro_id: insc.membro_id || null,
          nome: nomeCompleto,
          telefone: insc.telefone || null,
          destino: cv.destino,
          valor_alvo: cv.valor_alvo,
          observacao: observacoes || null,
          encaminhado_por: req.user?.id || null,
        });
      } catch (e) { console.error('[next] encaminhamento:', e.message); }
    }

    // Notificar áreas · grupo/servir levam pra caixa da área (devolutiva lá)
    for (const t of validos) {
      try {
        await notificar({
          modulo: TIPOS_AREA[t].area,
          titulo: TIPOS_AREA[t].titulo,
          mensagem: `${insc.nome} ${insc.sobrenome || ''} indicou ${t} no NEXT.`,
          link: CONVERGE[t]?.link || '/ministerial/next?tab=indicacoes',
        });
      } catch (e) { console.error('[next] notificar:', e.message); }
    }

    // Recalcula KPIs do NEXT em background (não bloqueia)
    recalcularKpisNext();

    res.json({ ok: true, indicacoes: linhas.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------------------------------------------------------
// Direcionar pros valores DENTRO do Next (Fase 1B · Marcos · 2026-06-25)
// POST /matriculas/:id/direcionar  body: { destinos: ['grupos','voluntarios','batismo','devocional'] }
// A inversão: o direcionamento do convertido pros valores saiu do Cuidados e vem pra cá.
//   grupos/voluntarios → encaminhamento (origem='next') na caixa da área (devolutiva lá ·
//                        "engajou" materializa o vínculo na NSM). Ligado à matrícula.
//   batismo            → inscrição pendente em batismo_inscricoes REUSANDO membro_id (sem duplicar).
//   devocional         → só registra a escolha (flag · estatística). 1º acesso/leitura = Fase 2.
// NÃO marca engajamento (NSM conta o sinal real). Dedup por matrícula × destino.
// ----------------------------------------------------------------------------
router.post('/matriculas/:id/direcionar', async (req, res) => {
  try {
    const r = await direcionarMatricula({
      matriculaId: req.params.id,
      destinos: (req.body || {}).destinos || [],
      userId: req.user?.id || null,
    });
    recalcularKpisNext();
    res.json(r);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// GET /direcionar-qr — token FIXO pro QR de direcionamento (resolve a turma aberta · Fase 2a)
router.get('/direcionar-qr', async (_req, res) => {
  try {
    const token = signDirecionarToken();
    if (!token) return res.status(503).json({ error: 'QR indisponível (CRON_SECRET ausente no servidor)' });
    res.json({ token });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/indicacoes', async (req, res) => {
  const { tipo, status, area } = req.query;
  let q = supabase
    .from('next_indicacoes')
    .select('*, inscricao:next_inscricoes(id, nome, sobrenome, email, telefone, evento_id, evento:next_eventos(data))')
    .order('created_at', { ascending: false })
    .limit(500);
  if (tipo) q = q.eq('tipo', tipo);
  if (status) q = q.eq('status', status);
  if (area) q = q.eq('area_destino', area);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

router.put('/indicacoes/:id', async (req, res) => {
  const allowed = ['status', 'observacoes', 'atendido_por', 'atendido_em'];
  const update = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(req.body || {})) {
    if (allowed.includes(k)) update[k] = v;
  }
  if (req.body?.status === 'concluido' && !update.atendido_em) {
    update.atendido_em = new Date().toISOString();
    update.atendido_por = req.user?.id || null;
  }
  const { data, error } = await supabase
    .from('next_indicacoes').update(update).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ----------------------------------------------------------------------------
// Dashboard
// ----------------------------------------------------------------------------
router.get('/dashboard', async (_req, res) => {
  const hoje = new Date();
  const inicioMes = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), 1)).toISOString().slice(0, 10);
  const inicioProxMes = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth() + 1, 1)).toISOString().slice(0, 10);

  const [eventos, inscricoesMes, checkinsMes, indicPendentes] = await Promise.all([
    supabase.from('next_eventos').select('id, data, status').gte('data', inicioMes).lt('data', inicioProxMes),
    supabase.from('next_inscricoes').select('id', { count: 'exact', head: true })
      .gte('created_at', inicioMes).lt('created_at', inicioProxMes),
    supabase.from('next_inscricoes').select('id', { count: 'exact', head: true })
      .not('check_in_at', 'is', null)
      .gte('check_in_at', inicioMes).lt('check_in_at', inicioProxMes),
    supabase.from('next_indicacoes').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
  ]);

  res.json({
    eventos_mes: eventos.data || [],
    inscricoes_mes: inscricoesMes.count || 0,
    checkins_mes: checkinsMes.count || 0,
    indicacoes_pendentes: indicPendentes.count || 0,
  });
});

// ----------------------------------------------------------------------------
// TURMAS · Next como coorte de 2 encontros com presença
//   "formado" = presente em TODOS os encontros da turma.
//   turma_id NULL numa matrícula = fila de espera (encaixe manual depois).
// ----------------------------------------------------------------------------

// Recalcula status (formado/matriculado) das matrículas de uma turma a partir
// das presenças. NÃO seta 'incompleto' (isso só ao encerrar) nem mexe em 'desistiu'.
async function recomputarStatusTurma(turmaId) {
  if (!turmaId) return;
  const { data: encontros } = await supabase.from('next_encontros').select('id').eq('turma_id', turmaId);
  const encIds = (encontros || []).map(e => e.id);
  const totalEnc = encIds.length;
  const { data: mats } = await supabase
    .from('next_matriculas').select('id, status').eq('turma_id', turmaId).is('deleted_at', null);
  if (!mats || !mats.length) return;
  const presByMat = {};
  if (encIds.length) {
    const { data: pres } = await supabase.from('next_presencas').select('matricula_id, presente').in('encontro_id', encIds);
    (pres || []).forEach(p => { if (p.presente) presByMat[p.matricula_id] = (presByMat[p.matricula_id] || 0) + 1; });
  }
  for (const m of mats) {
    if (m.status === 'desistiu' || m.status === 'incompleto') continue;
    const n = presByMat[m.id] || 0;
    const novo = (totalEnc > 0 && n >= totalEnc) ? 'formado' : 'matriculado';
    if (novo !== m.status) {
      await supabase.from('next_matriculas').update({ status: novo, updated_at: new Date().toISOString() }).eq('id', m.id);
    }
  }
}

// GET /turmas — lista turmas ativas + contagens (matriculados/formados/encontros)
router.get('/turmas', async (req, res) => {
  const { status } = req.query;
  let q = supabase.from('next_turmas').select('*').is('deleted_at', null).order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data: turmas, error } = await q.limit(500);
  if (error) return res.status(500).json({ error: error.message });
  const ids = (turmas || []).map(t => t.id);
  const cont = {};
  if (ids.length) {
    // pagina (evita o cap de 1000 do PostgREST quando há muito histórico)
    const mats = [];
    for (let from = 0; ; from += 1000) {
      const { data: chunk, error: e2 } = await supabase
        .from('next_matriculas').select('turma_id, status').is('deleted_at', null)
        .in('turma_id', ids).order('id').range(from, from + 999);
      if (e2 || !chunk || !chunk.length) break;
      mats.push(...chunk);
      if (chunk.length < 1000) break;
    }
    mats.forEach(m => {
      const c = cont[m.turma_id] || (cont[m.turma_id] = { total: 0, formado: 0, matriculado: 0, incompleto: 0, desistiu: 0, encontros: 0 });
      c.total += 1; if (c[m.status] !== undefined) c[m.status] += 1;
    });
    const { data: encs } = await supabase.from('next_encontros').select('turma_id').in('turma_id', ids);
    (encs || []).forEach(e => { const c = cont[e.turma_id] || (cont[e.turma_id] = { total: 0, encontros: 0 }); c.encontros = (c.encontros || 0) + 1; });
  }
  const lista = (turmas || []).map(t => ({ ...t, contagem: cont[t.id] || { total: 0, encontros: 0 } }));
  // ordem por data (mês mais recente primeiro); manuais sem origem_mes caem por created_at
  lista.sort((a, b) => {
    const ka = a.origem_mes || String(a.created_at || '').slice(0, 7);
    const kb = b.origem_mes || String(b.created_at || '').slice(0, 7);
    return kb < ka ? -1 : kb > ka ? 1 : 0;
  });
  res.json(lista);
});

// GET /lista-espera — contagem de inscritos SEM turma (aguardando a próxima
// turma abrir). São puxados automaticamente quando uma turma nova é aberta.
router.get('/lista-espera', async (req, res) => {
  const { count, error } = await supabase.from('next_matriculas')
    .select('id', { count: 'exact', head: true }).is('turma_id', null).is('deleted_at', null);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ count: count || 0 });
});

// POST /turmas — cria turma (+ os encontros · default 2)
router.post('/turmas', async (req, res) => {
  const { nome, responsavel_id, observacoes, encontros } = req.body || {};
  if (!nome || !String(nome).trim()) return res.status(400).json({ error: 'nome obrigatório' });

  // Múltiplas turmas abertas são permitidas — ex.: 2 por mês (1º/2º domingo e
  // 3º/4º domingo · pedido do Matheus 2026-06-30). Antes só permitia 1 aberta.

  const { data: turma, error } = await supabase
    .from('next_turmas')
    .insert({ nome: String(nome).trim(), responsavel_id: responsavel_id || null, observacoes: observacoes || null })
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  const base = Array.isArray(encontros) && encontros.length ? encontros : [{ numero: 1 }, { numero: 2 }];
  const rows = base.map((e, i) => ({ turma_id: turma.id, numero: e.numero || (i + 1), data: e.data || null, tema: e.tema || null }));
  const { error: encErr } = await supabase.from('next_encontros').insert(rows);
  if (encErr) return res.status(500).json({ error: encErr.message });

  // Puxa a LISTA DE ESPERA (matrículas sem turma) pra esta turma nova — SÓ quando
  // não há OUTRA turma aberta. Com mais de uma turma aberta ao mesmo tempo (ex.: 2
  // por mês), o operador decide quem vai em cada uma, então não vacuamos a fila pra
  // a turma recém-criada. Defensivo: 1 a 1, pulando conflito de UNIQUE.
  let puxados = 0;
  const { count: outrasAbertas } = await supabase.from('next_turmas')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'aberta').is('deleted_at', null).neq('id', turma.id);
  if (!outrasAbertas) try {
    const { data: espera } = await supabase.from('next_matriculas')
      .select('id').is('turma_id', null).is('deleted_at', null);
    for (const m of (espera || [])) {
      const { error: upErr } = await supabase.from('next_matriculas')
        .update({ turma_id: turma.id, status: 'matriculado', updated_at: new Date().toISOString() })
        .eq('id', m.id).is('turma_id', null);
      if (!upErr) puxados += 1;
      else if (upErr.code !== '23505') console.error('[next] puxar espera:', upErr.message);
    }
  } catch (e) { console.error('[next] puxar lista de espera:', e.message); }

  res.status(201).json({ ...turma, puxados_da_espera: puxados });
});

// GET /turmas/:id — detalhe (encontros + matrículas + presenças)
router.get('/turmas/:id', async (req, res) => {
  const { id } = req.params;
  const { data: turma, error } = await supabase.from('next_turmas').select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!turma) return res.status(404).json({ error: 'Turma não encontrada' });
  const { data: encontros } = await supabase.from('next_encontros').select('*').eq('turma_id', id).order('numero');
  const { data: matriculas } = await supabase.from('next_matriculas').select('*').eq('turma_id', id).is('deleted_at', null).order('nome');
  const encIds = (encontros || []).map(e => e.id);
  let presencas = [];
  if (encIds.length) {
    const { data: pres } = await supabase.from('next_presencas').select('*').in('encontro_id', encIds);
    presencas = pres || [];
  }
  res.json({ ...turma, encontros: encontros || [], matriculas: matriculas || [], presencas });
});

// PATCH /turmas/:id — atualizar. Ao encerrar, não-formados viram 'incompleto'.
router.patch('/turmas/:id', async (req, res) => {
  const b = req.body || {};
  // Reabrir é livre — múltiplas turmas abertas são permitidas (2 por mês · 2026-06-30).
  const patch = {};
  ['nome', 'status', 'responsavel_id', 'observacoes'].forEach(k => { if (k in b) patch[k] = b[k]; });
  patch.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('next_turmas').update(patch).eq('id', req.params.id).is('deleted_at', null).select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (b.status === 'encerrada') {
    await recomputarStatusTurma(req.params.id);
    await supabase.from('next_matriculas')
      .update({ status: 'incompleto', updated_at: new Date().toISOString() })
      .eq('turma_id', req.params.id).is('deleted_at', null)
      .not('status', 'in', '("formado","desistiu")');
  } else if (b.status === 'aberta') {
    // Reabrir: 'incompleto' volta a 'matriculado' pra poder re-qualificar
    // (recomputarStatusTurma pula 'incompleto'), e recalcula pela presença atual.
    await supabase.from('next_matriculas')
      .update({ status: 'matriculado', updated_at: new Date().toISOString() })
      .eq('turma_id', req.params.id).is('deleted_at', null)
      .eq('status', 'incompleto');
    await recomputarStatusTurma(req.params.id);
  }
  res.json(data);
});

// DELETE /turmas/:id — soft delete
router.delete('/turmas/:id', async (req, res) => {
  const { error } = await supabase.rpc('app_soft_delete', { p_table_name: 'next_turmas', p_row_id: req.params.id, p_deleted_by: req.user?.id ?? null });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// PATCH /encontros/:id — editar data/tema do encontro
router.patch('/encontros/:id', async (req, res) => {
  const b = req.body || {};
  const patch = {};
  ['numero', 'data', 'tema', 'observacoes'].forEach(k => { if (k in b) patch[k] = b[k]; });
  const { data, error } = await supabase.from('next_encontros').update(patch).eq('id', req.params.id).select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PUT /encontros/:id/presencas — define os presentes { matricula_ids: [] } e
// recalcula o status das matrículas da turma. Idempotente (regrava o conjunto).
router.put('/encontros/:id/presencas', async (req, res) => {
  const encontroId = req.params.id;
  const presentes = Array.isArray(req.body?.matricula_ids) ? req.body.matricula_ids : [];
  const { data: enc } = await supabase.from('next_encontros').select('id, turma_id').eq('id', encontroId).maybeSingle();
  if (!enc) return res.status(404).json({ error: 'Encontro não encontrado' });
  await supabase.from('next_presencas').delete().eq('encontro_id', encontroId);
  if (presentes.length) {
    const rows = presentes.map(mid => ({ encontro_id: encontroId, matricula_id: mid, presente: true }));
    const { error: insErr } = await supabase.from('next_presencas').insert(rows);
    if (insErr) return res.status(500).json({ error: insErr.message });
  }
  await recomputarStatusTurma(enc.turma_id);
  recalcularKpisNext();
  res.json({ ok: true });
});

// GET /matriculas?turma_id=&fila=true&search= — lista
router.get('/matriculas', async (req, res) => {
  const { turma_id, fila, search } = req.query;
  let q = supabase.from('next_matriculas').select('*').is('deleted_at', null);
  if (fila === 'true') q = q.is('turma_id', null);
  else if (turma_id) q = q.eq('turma_id', turma_id);
  if (search) {
    const s = escapePostgrestValue(String(search));
    q = q.or(`nome.ilike.%${s}%,sobrenome.ilike.%${s}%,email.ilike.%${s}%,telefone.ilike.%${s}%`);
  }
  const { data, error } = await q.order('created_at', { ascending: false }).limit(1000);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data || []);
});

// POST /matriculas — matricular (turma_id opcional = fila)
router.post('/matriculas', async (req, res) => {
  const b = req.body || {};
  if (!b.nome || !String(b.nome).trim()) return res.status(400).json({ error: 'nome obrigatório' });
  const row = {
    turma_id: b.turma_id || null,
    nome: String(b.nome).trim(), sobrenome: b.sobrenome || null,
    cpf: b.cpf || null, telefone: b.telefone || null, email: b.email || null,
    data_nascimento: b.data_nascimento || null, observacoes: b.observacoes || null,
    membro_id: b.membro_id || null,
    ja_batizado: !!b.ja_batizado, ja_voluntario: !!b.ja_voluntario, ja_doador: !!b.ja_doador,
    indicou_batismo: !!b.indicou_batismo, indicou_servir: !!b.indicou_servir,
    indicou_grupo: !!b.indicou_grupo, indicou_dizimo: !!b.indicou_dizimo,
    origem: 'manual', registered_by: req.user?.id ?? null,
  };
  const { data, error } = await supabase.from('next_matriculas').insert(row).select().single();
  if (error) return res.status(500).json({ error: error.message });
  recalcularKpisNext();
  res.status(201).json(data);
});

// PATCH /matriculas/:id — editar / mover de turma (re-encaixe) / status / indicações
router.patch('/matriculas/:id', async (req, res) => {
  const b = req.body || {};
  const patch = {};
  ['turma_id', 'nome', 'sobrenome', 'cpf', 'telefone', 'email', 'data_nascimento', 'observacoes', 'membro_id',
    'ja_batizado', 'ja_voluntario', 'ja_doador', 'indicou_batismo', 'indicou_servir', 'indicou_grupo', 'indicou_dizimo',
    'status'].forEach(k => { if (k in b) patch[k] = b[k]; });
  patch.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from('next_matriculas').update(patch).eq('id', req.params.id).is('deleted_at', null).select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  // se mudou de turma, recalcula o status na turma de destino
  if ('turma_id' in b && b.turma_id) await recomputarStatusTurma(b.turma_id);
  recalcularKpisNext();
  res.json(data);
});

// DELETE /matriculas/:id — soft delete
router.delete('/matriculas/:id', async (req, res) => {
  const { error } = await supabase.rpc('app_soft_delete', { p_table_name: 'next_matriculas', p_row_id: req.params.id, p_deleted_by: req.user?.id ?? null });
  if (error) return res.status(500).json({ error: error.message });
  recalcularKpisNext();
  res.json({ ok: true });
});

// ----------------------------------------------------------------------------
// PESSOAS · visão unificada (convertidos + matrículas, 1 linha por pessoa)
//   Substitui as listas separadas "Por pessoa" + "NSM" (que duplicavam quem é
//   convertido E matriculado). Cada pessoa traz: origem (convertido/externo),
//   status no Next, turma, e — pra convertido — Data NSM + bucket de prazo +
//   resolução (acaba com o "vermelho pra sempre").
// ----------------------------------------------------------------------------
const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
function nomeMesAtual() { const d = new Date(); return `${MESES_PT[d.getMonth()]} ${d.getFullYear()}`; }

async function fetchAllNext(table, columns, applyFilter) {
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
}

router.get('/pessoas', async (req, res) => {
  try {
    const { area } = req.query;
    const DIA = 86400000; const agora = Date.now();
    const digits = (v) => String(v || '').replace(/\D/g, '');
    const nomeKey = (s) => String(s || '').trim().toLowerCase() || null;

    const convertidos = await fetchAllNext('cui_convertidos',
      'id, nome, telefone, cpf, membro_id, data_culto, area, next_resolucao, next_resolucao_em',
      (q) => { q = q.is('deleted_at', null); return area ? q.eq('area', area) : q; });
    const matriculas = await fetchAllNext('next_matriculas',
      'id, turma_id, nome, sobrenome, cpf, telefone, email, membro_id, status, indicou_grupo, indicou_servir, indicou_batismo, indicou_devocional',
      (q) => q.is('deleted_at', null));
    const turmas = await fetchAllNext('next_turmas', 'id, nome', (q) => q.is('deleted_at', null));
    const turmaNome = new Map(turmas.map(t => [t.id, t.nome]));
    // Direcionamento (pra onde a pessoa vai ao fim do Next) · vem da matrícula
    const dirFlags = (mm) => ({
      indicou_grupo: !!(mm && mm.indicou_grupo), indicou_servir: !!(mm && mm.indicou_servir),
      indicou_batismo: !!(mm && mm.indicou_batismo), indicou_devocional: !!(mm && mm.indicou_devocional),
    });

    // índice de matrículas por identidade (membro_id > cpf > nome completo)
    const mByMembro = new Map(), mByCpf = new Map(), mByNome = new Map();
    for (const m of matriculas) {
      if (m.membro_id && !mByMembro.has(m.membro_id)) mByMembro.set(m.membro_id, m);
      const c = digits(m.cpf); if (c.length === 11 && !mByCpf.has(c)) mByCpf.set(c, m);
      const nk = nomeKey(`${m.nome || ''} ${m.sobrenome || ''}`); if (nk && !mByNome.has(nk)) mByNome.set(nk, m);
    }
    const matchMatricula = (cv) => {
      if (cv.membro_id && mByMembro.has(cv.membro_id)) return mByMembro.get(cv.membro_id);
      const c = digits(cv.cpf); if (c.length === 11 && mByCpf.has(c)) return mByCpf.get(c);
      const nk = nomeKey(cv.nome); if (nk && mByNome.has(nk)) return mByNome.get(nk);
      return null;
    };

    const usados = new Set();
    const itens = [];
    // 1. convertidos (com ou sem matrícula)
    for (const cv of convertidos) {
      const m = matchMatricula(cv);
      if (m) usados.add(m.id);
      const dias = cv.data_culto ? Math.floor((agora - new Date(cv.data_culto + 'T12:00:00').getTime()) / DIA) : null;
      let next_status; let bucket = null;
      if (cv.next_resolucao) next_status = 'resolvido';
      else if (m && m.status === 'formado') next_status = 'formado';
      else if (m) next_status = 'matriculado';
      else { next_status = 'nao_inscrito'; bucket = dias == null ? 'no_prazo' : dias > 90 ? 'fora_prazo' : dias > 75 ? 'vencendo' : 'no_prazo'; }
      itens.push({
        tipo: 'convertido', convertido_id: cv.id, matricula_id: m ? m.id : null,
        nome: cv.nome, telefone: cv.telefone, email: null, membro_id: cv.membro_id,
        area: cv.area, data_nsm: cv.data_culto, dias_desde_conversao: dias,
        turma_id: m ? m.turma_id : null, turma_nome: m && m.turma_id ? (turmaNome.get(m.turma_id) || null) : null,
        next_status, bucket, next_resolucao: cv.next_resolucao || null, next_resolucao_em: cv.next_resolucao_em || null,
        ...dirFlags(m),
      });
    }
    // 2. matrículas externas (sem convertido correspondente)
    for (const m of matriculas) {
      if (usados.has(m.id)) continue;
      itens.push({
        tipo: 'externo', convertido_id: null, matricula_id: m.id,
        nome: `${m.nome || ''}${m.sobrenome ? ' ' + m.sobrenome : ''}`.trim(), telefone: m.telefone, email: m.email, membro_id: m.membro_id,
        area: null, data_nsm: null, dias_desde_conversao: null,
        turma_id: m.turma_id, turma_nome: m.turma_id ? (turmaNome.get(m.turma_id) || null) : null,
        next_status: m.status === 'formado' ? 'formado' : 'matriculado', bucket: null, next_resolucao: null, next_resolucao_em: null,
        ...dirFlags(m),
      });
    }

    // prioridade na NSM: convertidos por data de conversão (recente primeiro), externos por último
    itens.sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo === 'convertido' ? -1 : 1;
      const da = a.data_nsm || ''; const db = b.data_nsm || '';
      return db < da ? -1 : db > da ? 1 : 0;
    });

    const resumo = {
      total: itens.length,
      convertidos: itens.filter(i => i.tipo === 'convertido').length,
      externos: itens.filter(i => i.tipo === 'externo').length,
      formados: itens.filter(i => i.next_status === 'formado').length,
      nao_inscritos: itens.filter(i => i.next_status === 'nao_inscrito').length,
      no_prazo: itens.filter(i => i.bucket === 'no_prazo' || i.bucket === 'vencendo').length,
      fora_prazo: itens.filter(i => i.bucket === 'fora_prazo').length,
      resolvidos: itens.filter(i => i.next_status === 'resolvido').length,
    };
    res.json({ itens, resumo });
  } catch (e) {
    console.error('[next/pessoas]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /convertidos/:id/resolver — fecha o pendente de Next do convertido
// (acaba o "vermelho pra sempre"). Body: { resolucao }.
router.post('/convertidos/:id/resolver', async (req, res) => {
  const { resolucao } = req.body || {};
  const VALID = ['contatado', 'sem_interesse', 'encerrado'];
  if (!VALID.includes(resolucao)) return res.status(400).json({ error: 'resolucao inválida' });
  const { data, error } = await supabase.from('cui_convertidos')
    .update({ next_resolucao: resolucao, next_resolucao_em: new Date().toISOString(), next_resolucao_por: req.user?.id ?? null })
    .eq('id', req.params.id).is('deleted_at', null).select('id').maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Convertido não encontrado' });
  res.json({ ok: true });
});

// DELETE /convertidos/:id/resolver — desfaz a resolução (volta ao funil)
router.delete('/convertidos/:id/resolver', async (req, res) => {
  const { error } = await supabase.from('cui_convertidos')
    .update({ next_resolucao: null, next_resolucao_em: null, next_resolucao_por: null })
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
