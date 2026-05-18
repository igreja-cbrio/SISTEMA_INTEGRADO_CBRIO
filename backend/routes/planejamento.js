/**
 * Planejamento Anual CBRio — rotas backend (PR-A · fundação)
 *
 * Fluxo:
 *  - Admin abre ciclo do próximo ano via POST /ciclos
 *  - Líderes propõem (POST /propostas) — proposto_por = req.user.userId
 *  - 1º estágio: diretor do setor aprova/altera/rejeita
 *  - 2º estágio: diretoria geral decide final
 *
 * Esta PR (A): apenas criar/listar. PR-B traz aprovação.
 */
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

// ── Helpers ──────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (v) => UUID_RE.test(v);
const VALID_TIPO = ['evento', 'serie', 'projeto'];

// Identifica se o usuário é diretor de algum setor (1º estágio)
async function getSetoresDoDirector(userId) {
  const { data } = await supabase
    .from('planejamento_setores')
    .select('id, nome')
    .eq('diretor_id', userId)
    .eq('ativo', true);
  return data || [];
}

// Identifica se o usuário é da diretoria geral (2º estágio)
async function isDiretoriaGeral(userId) {
  const { data } = await supabase
    .from('profiles')
    .select('is_diretoria_geral')
    .eq('id', userId)
    .single();
  return data?.is_diretoria_geral === true;
}

// Mapa área → setor_id
async function getSetorIdByArea(area) {
  const { data } = await supabase
    .from('planejamento_areas_setor')
    .select('setor_id')
    .eq('area', area)
    .maybeSingle();
  return data?.setor_id || null;
}

// ═════════════════════════════════════════════════════════════════════
// SETORES
// ═════════════════════════════════════════════════════════════════════

// GET /api/planejamento/setores — lista (todos veem)
router.get('/setores', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('planejamento_setores')
      .select('id, nome, descricao, diretor_id, ativo, profiles:diretor_id(name, email)')
      .eq('ativo', true)
      .order('nome');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[Planejamento] setores GET:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/planejamento/setores/:id — admin atribui diretor
router.patch('/setores/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const upd = {};
    if (req.body.diretor_id !== undefined) upd.diretor_id = req.body.diretor_id || null;
    if (req.body.descricao !== undefined) upd.descricao = req.body.descricao;
    if (req.body.ativo !== undefined) upd.ativo = !!req.body.ativo;
    const { data, error } = await supabase.from('planejamento_setores')
      .update(upd).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/planejamento/areas-setor — lista mapa área→setor (pra UI saber qual setor mostrar)
router.get('/areas-setor', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('planejamento_areas_setor')
      .select('area, setor_id, planejamento_setores(nome)')
      .order('area');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═════════════════════════════════════════════════════════════════════
// CICLOS
// ═════════════════════════════════════════════════════════════════════

// GET /api/planejamento/ciclos — lista todos
router.get('/ciclos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('planejamento_ciclos')
      .select('*')
      .order('year', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/planejamento/ciclos/:id — detalhe + contadores
router.get('/ciclos/:id', async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const { data: ciclo, error } = await supabase
      .from('planejamento_ciclos')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error || !ciclo) return res.status(404).json({ error: 'Ciclo não encontrado' });

    // Contagens por status
    const { data: propostas } = await supabase
      .from('planejamento_propostas')
      .select('status')
      .eq('ciclo_id', req.params.id);

    const counts = { total: propostas?.length || 0 };
    (propostas || []).forEach(p => { counts[p.status] = (counts[p.status] || 0) + 1; });

    res.json({ ...ciclo, counts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/planejamento/ciclos — admin cria ciclo do ano X
router.post('/ciclos', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const year = parseInt(req.body.year, 10);
    if (!Number.isFinite(year) || year < 2026 || year > 2050) {
      return res.status(400).json({ error: 'Ano inválido' });
    }
    const description = (req.body.description || '').toString().slice(0, 500);

    const { data, error } = await supabase.from('planejamento_ciclos').insert({
      year, description, status: 'aberto', opened_by: req.user.userId,
    }).select().single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: `Ciclo de ${year} já existe` });
      throw error;
    }
    res.json(data);
  } catch (e) {
    console.error('[Planejamento] ciclos POST:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/planejamento/ciclos/:id — abrir/fechar (admin)
// Política: fechar bloqueia novas propostas; pendentes continuam tramitando.
router.patch('/ciclos/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const upd = {};
    if (req.body.status === 'aberto') {
      upd.status = 'aberto'; upd.closed_at = null; upd.closed_by = null;
    } else if (req.body.status === 'fechado') {
      upd.status = 'fechado'; upd.closed_at = new Date().toISOString(); upd.closed_by = req.user.userId;
    } else if (req.body.status !== undefined) {
      return res.status(400).json({ error: 'Status inválido' });
    }
    if (req.body.description !== undefined) upd.description = req.body.description.toString().slice(0, 500);

    const { data, error } = await supabase.from('planejamento_ciclos')
      .update(upd).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═════════════════════════════════════════════════════════════════════
// PROPOSTAS
// ═════════════════════════════════════════════════════════════════════

// GET /api/planejamento/propostas — lista filtrável
// Query: ?ciclo_id=, ?status=, ?tipo=, ?setor_id=, ?mine=1
router.get('/propostas', async (req, res) => {
  try {
    const { ciclo_id, status, tipo, setor_id } = req.query;
    const mine = req.query.mine === '1' || req.query.mine === 'true';

    let q = supabase.from('planejamento_propostas')
      .select(`
        id, ciclo_id, tipo, area, setor_id, proposto_por, proposto_em,
        payload_original, payload_atual, status,
        diretor_decisao_por, diretor_decisao_em, diretor_decisao, diretor_comentario,
        diretoria_decisao_por, diretoria_decisao_em, diretoria_decisao, diretoria_comentario,
        created_event_id, created_project_id, created_at, updated_at,
        proposto:proposto_por(name, email),
        setor:setor_id(nome),
        ciclo:ciclo_id(year, status)
      `)
      .order('proposto_em', { ascending: false });

    if (ciclo_id && isUUID(ciclo_id)) q = q.eq('ciclo_id', ciclo_id);
    if (status) q = q.eq('status', status);
    if (tipo && VALID_TIPO.includes(tipo)) q = q.eq('tipo', tipo);
    if (setor_id && isUUID(setor_id)) q = q.eq('setor_id', setor_id);
    if (mine) q = q.eq('proposto_por', req.user.userId);

    const { data, error } = await q.limit(500);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[Planejamento] propostas GET:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/planejamento/propostas/:id — detalhe + audit
router.get('/propostas/:id', async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const { data: prop, error } = await supabase.from('planejamento_propostas')
      .select(`
        *,
        proposto:proposto_por(name, email),
        diretor_decisor:diretor_decisao_por(name),
        diretoria_decisor:diretoria_decisao_por(name),
        setor:setor_id(nome),
        ciclo:ciclo_id(year, status)
      `)
      .eq('id', req.params.id).single();
    if (error || !prop) return res.status(404).json({ error: 'Proposta não encontrada' });

    const { data: audit } = await supabase.from('planejamento_audit')
      .select('id, quem, quando, etapa, campo, valor_antes, valor_depois, comentario, profiles:quem(name)')
      .eq('proposta_id', req.params.id)
      .order('quando');

    res.json({ ...prop, audit: audit || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/planejamento/propostas — líder cria nova
// Body: { ciclo_id, tipo, area, payload (jsonb) }
//
// Auto-roteia:
//  - Se proposto_por é diretor do setor da proposta → status='pendente_diretoria' (skip 1º estágio)
//  - Se proposto_por é da diretoria geral → status='pendente_diretoria' (idem)
//  - Caso contrário → status='pendente_diretor'
router.post('/propostas', async (req, res) => {
  try {
    const { ciclo_id, tipo, area, payload } = req.body;

    if (!ciclo_id || !isUUID(ciclo_id)) return res.status(400).json({ error: 'ciclo_id obrigatório' });
    if (!tipo || !VALID_TIPO.includes(tipo)) return res.status(400).json({ error: 'tipo inválido (evento|serie|projeto)' });
    if (!area || typeof area !== 'string') return res.status(400).json({ error: 'area obrigatória' });
    if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'payload obrigatório' });

    // Ciclo precisa estar aberto
    const { data: ciclo } = await supabase.from('planejamento_ciclos')
      .select('id, status, year').eq('id', ciclo_id).single();
    if (!ciclo) return res.status(404).json({ error: 'Ciclo não encontrado' });
    if (ciclo.status !== 'aberto') return res.status(409).json({ error: 'Ciclo está fechado. Novas propostas não são aceitas.' });

    // Resolve setor a partir da área
    const setor_id = await getSetorIdByArea(area);
    if (!setor_id) return res.status(400).json({ error: `Área "${area}" não está mapeada a nenhum setor. Avise o admin.` });

    // Auto-roteamento do status inicial
    const setoresDoDirector = await getSetoresDoDirector(req.user.userId);
    const proposeDirector = setoresDoDirector.some(s => s.id === setor_id);
    const proposeDiretoriaGeral = await isDiretoriaGeral(req.user.userId);
    const initialStatus = (proposeDirector || proposeDiretoriaGeral) ? 'pendente_diretoria' : 'pendente_diretor';

    // Se diretor de setor propõe → pula direto pro 2º estágio (com decisão auto-registrada do 1º)
    const extraFields = {};
    if (proposeDirector) {
      extraFields.diretor_decisao = 'aprovado';
      extraFields.diretor_decisao_por = req.user.userId;
      extraFields.diretor_decisao_em = new Date().toISOString();
      extraFields.diretor_comentario = 'Propositor é diretor do setor — 1º estágio pulado automaticamente.';
    }

    const { data, error } = await supabase.from('planejamento_propostas').insert({
      ciclo_id, tipo, area, setor_id,
      proposto_por: req.user.userId,
      payload_original: payload,
      payload_atual: payload,
      status: initialStatus,
      ...extraFields,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[Planejamento] propostas POST:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═════════════════════════════════════════════════════════════════════
// FILAS (PR-B)
// ═════════════════════════════════════════════════════════════════════

// GET /api/planejamento/filas/diretor — propostas aguardando minha decisão de setor
router.get('/filas/diretor', async (req, res) => {
  try {
    const setores = await getSetoresDoDirector(req.user.userId);
    if (setores.length === 0) return res.json([]);
    const setorIds = setores.map(s => s.id);

    const { data, error } = await supabase
      .from('planejamento_propostas')
      .select(`
        id, ciclo_id, tipo, area, setor_id, proposto_por, proposto_em,
        payload_original, payload_atual, status,
        proposto:proposto_por(name, email),
        setor:setor_id(nome),
        ciclo:ciclo_id(year, status)
      `)
      .eq('status', 'pendente_diretor')
      .in('setor_id', setorIds)
      .order('proposto_em');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/planejamento/filas/diretoria — propostas aguardando aprovação final
router.get('/filas/diretoria', async (req, res) => {
  try {
    if (!(await isDiretoriaGeral(req.user.userId))) return res.json([]);

    const { data, error } = await supabase
      .from('planejamento_propostas')
      .select(`
        id, ciclo_id, tipo, area, setor_id, proposto_por, proposto_em,
        payload_original, payload_atual, status,
        diretor_decisao_por, diretor_decisao_em, diretor_decisao, diretor_comentario,
        proposto:proposto_por(name, email),
        diretor_decisor:diretor_decisao_por(name),
        setor:setor_id(nome),
        ciclo:ciclo_id(year, status)
      `)
      .eq('status', 'pendente_diretoria')
      .order('diretor_decisao_em');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═════════════════════════════════════════════════════════════════════
// DECISÕES (workflow de aprovação)
// ═════════════════════════════════════════════════════════════════════

// Calcula diff entre dois payloads. Retorna array de { campo, antes, depois }.
// Usado pro audit log e pra devolutiva.
function diffPayload(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const out = [];
  for (const k of keys) {
    const va = a?.[k];
    const vb = b?.[k];
    if (JSON.stringify(va) !== JSON.stringify(vb)) {
      out.push({ campo: k, antes: va ?? null, depois: vb ?? null });
    }
  }
  return out;
}

// Registra entradas de audit pra cada campo alterado
async function logAuditChanges(propostaId, etapa, userId, diffs, comentario) {
  if (!diffs.length) return;
  const rows = diffs.map(d => ({
    proposta_id: propostaId,
    quem: userId,
    etapa,
    campo: d.campo,
    valor_antes: d.antes,
    valor_depois: d.depois,
    comentario: comentario || null,
  }));
  await supabase.from('planejamento_audit').insert(rows);
}

// Dispara notificação inline pro proponente quando o payload foi alterado
async function notifyProponente(proposta, etapa, alteracoes) {
  if (!alteracoes.length) return;
  try {
    const { notificar } = require('../services/notificar');
    const tituloEtapa = etapa === 'diretor' ? 'Diretor do setor' : 'Diretoria geral';
    await notificar({
      modulo: 'planejamento',
      tipo: 'proposta_alterada',
      titulo: `${tituloEtapa} alterou sua proposta`,
      mensagem: `${alteracoes.length} campo(s) foram modificados antes da aprovação. Veja a devolutiva no detalhe da proposta.`,
      link: `/planejamento/anual/${proposta.ciclo_id}`,
      destinatarios: [proposta.proposto_por],
      severidade: 'info',
      chaveDedup: `proposta_${proposta.id}_alterada_${etapa}`,
    });
  } catch { /* notificar é best-effort */ }
}

// Materializa a proposta aprovada em event/project oficial
async function materializarProposta(proposta) {
  const p = proposta.payload_atual || {};
  if (proposta.tipo === 'projeto') {
    const { data, error } = await supabase.from('projects').insert({
      name: p.nome,
      description: p.descricao || '',
      year: proposta.year_from_ciclo,
      area: proposta.area,
      responsible: p.responsavel || '',
      date_end: p.data || null,
      budget_planned: p.budget_planned || 0,
      status: 'no-prazo',
      proposta_id: proposta.id,
      criacao_origem: 'ciclo_planejamento',
      created_by: proposta.proposto_por,
    }).select().single();
    if (error) throw error;
    return { kind: 'project', id: data.id };
  } else {
    // evento e série caem em events
    const { data, error } = await supabase.from('events').insert({
      name: p.nome,
      description: p.descricao || '',
      date: p.data,
      location: p.local || '',
      responsible: p.responsavel || '',
      budget_planned: p.budget_planned || 0,
      expected_attendance: p.expected_attendance || null,
      recurrence: p.recorrencia || 'unico',
      proposta_id: proposta.id,
      criacao_origem: 'ciclo_planejamento',
      created_by: proposta.proposto_por,
    }).select().single();
    if (error) throw error;
    return { kind: 'event', id: data.id };
  }
}

// PATCH /api/planejamento/propostas/:id/decidir-diretor
// Body: { decisao: 'aprovado'|'aprovado_com_ressalvas'|'rejeitado', comentario, payload_alterado? }
// Guard: proposto_por != req.user.userId E usuário é diretor do setor da proposta.
router.patch('/propostas/:id/decidir-diretor', async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const { decisao, comentario, payload_alterado } = req.body;
    if (!['aprovado', 'aprovado_com_ressalvas', 'rejeitado'].includes(decisao)) {
      return res.status(400).json({ error: 'Decisão inválida' });
    }
    if (decisao === 'rejeitado' && (!comentario || !comentario.trim())) {
      return res.status(400).json({ error: 'Comentário obrigatório ao rejeitar' });
    }

    const { data: prop, error: readErr } = await supabase.from('planejamento_propostas')
      .select('*, ciclo:ciclo_id(year)').eq('id', req.params.id).single();
    if (readErr || !prop) return res.status(404).json({ error: 'Proposta não encontrada' });
    if (prop.status !== 'pendente_diretor') return res.status(409).json({ error: `Proposta não está aguardando decisão do diretor (status atual: ${prop.status})` });

    // Guard anti auto-aprovação
    if (prop.proposto_por === req.user.userId) {
      return res.status(403).json({ error: 'Você não pode decidir a própria proposta.' });
    }

    // Guard: usuário precisa ser diretor do setor
    const setores = await getSetoresDoDirector(req.user.userId);
    if (!setores.some(s => s.id === prop.setor_id)) {
      return res.status(403).json({ error: 'Você não é diretor deste setor.' });
    }

    // Aplica edições no payload_atual se houver
    let newPayloadAtual = prop.payload_atual;
    let diffs = [];
    if (payload_alterado && typeof payload_alterado === 'object') {
      newPayloadAtual = { ...prop.payload_atual, ...payload_alterado };
      diffs = diffPayload(prop.payload_atual, newPayloadAtual);
    }

    // Define status final pós-decisão
    let newStatus;
    let finalDecisao = decisao;
    if (decisao === 'rejeitado') newStatus = 'rejeitado';
    else {
      newStatus = 'pendente_diretoria';
      // Se houve alteração de campos, vira "com ressalvas" automaticamente
      if (diffs.length > 0 && decisao === 'aprovado') finalDecisao = 'aprovado_com_ressalvas';
    }

    const { error: updErr } = await supabase.from('planejamento_propostas').update({
      status: newStatus,
      payload_atual: newPayloadAtual,
      diretor_decisao: finalDecisao,
      diretor_decisao_por: req.user.userId,
      diretor_decisao_em: new Date().toISOString(),
      diretor_comentario: comentario || null,
    }).eq('id', req.params.id);
    if (updErr) throw updErr;

    // Audit log das mudanças de campo
    await logAuditChanges(req.params.id, 'diretor', req.user.userId, diffs, comentario);
    // Notifica proponente se houve alterações
    if (diffs.length > 0) await notifyProponente(prop, 'diretor', diffs);

    res.json({ success: true, status: newStatus, diretor_decisao: finalDecisao, diff_count: diffs.length });
  } catch (e) {
    console.error('[Planejamento] decidir-diretor:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/planejamento/propostas/:id/decidir-diretoria
// Body: { decisao, comentario, payload_alterado? }
// Guard: proposto_por != req.user.userId E usuário tem is_diretoria_geral=true.
// Quando aprovado final, MATERIALIZA event/project oficial.
router.patch('/propostas/:id/decidir-diretoria', async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.status(400).json({ error: 'ID inválido' });
    const { decisao, comentario, payload_alterado } = req.body;
    if (!['aprovado', 'aprovado_com_ressalvas', 'rejeitado'].includes(decisao)) {
      return res.status(400).json({ error: 'Decisão inválida' });
    }
    if (decisao === 'rejeitado' && (!comentario || !comentario.trim())) {
      return res.status(400).json({ error: 'Comentário obrigatório ao rejeitar' });
    }

    const { data: prop, error: readErr } = await supabase.from('planejamento_propostas')
      .select('*, ciclo:ciclo_id(year)').eq('id', req.params.id).single();
    if (readErr || !prop) return res.status(404).json({ error: 'Proposta não encontrada' });
    if (prop.status !== 'pendente_diretoria') return res.status(409).json({ error: `Proposta não está aguardando diretoria (status atual: ${prop.status})` });

    if (prop.proposto_por === req.user.userId) {
      return res.status(403).json({ error: 'Você não pode decidir a própria proposta. Outro membro da diretoria precisa decidir.' });
    }

    if (!(await isDiretoriaGeral(req.user.userId))) {
      return res.status(403).json({ error: 'Apenas membros da diretoria geral podem decidir.' });
    }

    let newPayloadAtual = prop.payload_atual;
    let diffs = [];
    if (payload_alterado && typeof payload_alterado === 'object') {
      newPayloadAtual = { ...prop.payload_atual, ...payload_alterado };
      diffs = diffPayload(prop.payload_atual, newPayloadAtual);
    }

    // Status final
    let newStatus;
    let finalDecisao = decisao;
    if (decisao === 'rejeitado') newStatus = 'rejeitado';
    else {
      // Se diretor já tinha aprovado com ressalvas OU se houve nova alteração da diretoria → com ressalvas
      const previousAlterations = prop.diretor_decisao === 'aprovado_com_ressalvas';
      const newAlterations = diffs.length > 0;
      finalDecisao = (previousAlterations || newAlterations || decisao === 'aprovado_com_ressalvas')
        ? 'aprovado_com_ressalvas' : 'aprovado';
      newStatus = finalDecisao;
    }

    // Atualiza a proposta
    const updFields = {
      status: newStatus,
      payload_atual: newPayloadAtual,
      diretoria_decisao: finalDecisao,
      diretoria_decisao_por: req.user.userId,
      diretoria_decisao_em: new Date().toISOString(),
      diretoria_comentario: comentario || null,
    };

    // Materializa se aprovado
    if (newStatus === 'aprovado' || newStatus === 'aprovado_com_ressalvas') {
      try {
        const propWithYear = { ...prop, payload_atual: newPayloadAtual, year_from_ciclo: prop.ciclo?.year };
        const materialized = await materializarProposta(propWithYear);
        if (materialized.kind === 'event') updFields.created_event_id = materialized.id;
        else if (materialized.kind === 'project') updFields.created_project_id = materialized.id;
      } catch (matErr) {
        console.error('[Planejamento] materializacao falhou:', matErr.message);
        return res.status(500).json({ error: `Erro ao criar item oficial: ${matErr.message}` });
      }
    }

    const { error: updErr } = await supabase.from('planejamento_propostas').update(updFields).eq('id', req.params.id);
    if (updErr) throw updErr;

    await logAuditChanges(req.params.id, 'diretoria', req.user.userId, diffs, comentario);
    if (diffs.length > 0) await notifyProponente(prop, 'diretoria', diffs);

    res.json({ success: true, status: newStatus, diretoria_decisao: finalDecisao, diff_count: diffs.length,
      created_event_id: updFields.created_event_id, created_project_id: updFields.created_project_id });
  } catch (e) {
    console.error('[Planejamento] decidir-diretoria:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═════════════════════════════════════════════════════════════════════
// LITÚRGICOS (PR-C)
// ═════════════════════════════════════════════════════════════════════
//
// Templates fixos (ceia 1º domingo, batismo 4º domingo, etc.) que NÃO
// passam por ciclo de aprovação. Admin clica "Gerar calendário do ano X"
// e o backend materializa events automaticamente.

// Calcula a data do N-ésimo dia-da-semana de um mês.
// targetDow: 0=domingo, 1=segunda, ..., 6=sábado
// nth: 1..5 (1st, 2nd, 3rd, 4th, 5th)
function nthWeekdayOfMonth(year, month0, targetDow, nth) {
  const first = new Date(Date.UTC(year, month0, 1));
  const firstDow = first.getUTCDay();
  let offset = (targetDow - firstDow + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  const d = new Date(Date.UTC(year, month0, day));
  if (d.getUTCMonth() !== month0) return null; // ultrapassou
  return d.toISOString().slice(0, 10);
}

// Último ocorrência do dia-da-semana no mês
function lastWeekdayOfMonth(year, month0, targetDow) {
  const last = new Date(Date.UTC(year, month0 + 1, 0));
  const lastDow = last.getUTCDay();
  const diff = (lastDow - targetDow + 7) % 7;
  const day = last.getUTCDate() - diff;
  return new Date(Date.UTC(year, month0, day)).toISOString().slice(0, 10);
}

// Resolve um padrão pra array de datas YYYY-MM-DD ao longo do ano
function expandPattern(pattern, year) {
  const dates = [];
  const DOMINGO = 0;
  const patterns = {
    '1st_sunday': (m) => nthWeekdayOfMonth(year, m, DOMINGO, 1),
    '2nd_sunday': (m) => nthWeekdayOfMonth(year, m, DOMINGO, 2),
    '3rd_sunday': (m) => nthWeekdayOfMonth(year, m, DOMINGO, 3),
    '4th_sunday': (m) => nthWeekdayOfMonth(year, m, DOMINGO, 4),
    'last_sunday': (m) => lastWeekdayOfMonth(year, m, DOMINGO),
  };
  if (patterns[pattern]) {
    for (let m = 0; m < 12; m++) {
      const d = patterns[pattern](m);
      if (d) dates.push(d);
    }
    return dates;
  }
  // monthly_day_DD
  const monthlyMatch = /^monthly_day_(\d{1,2})$/.exec(pattern);
  if (monthlyMatch) {
    const day = parseInt(monthlyMatch[1], 10);
    for (let m = 0; m < 12; m++) {
      const last = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
      if (day <= last) dates.push(new Date(Date.UTC(year, m, day)).toISOString().slice(0, 10));
    }
    return dates;
  }
  // weekly_dayN — todo X dia da semana, todo mês
  const weeklyMatch = /^weekly_day(\d)$/.exec(pattern);
  if (weeklyMatch) {
    const dow = parseInt(weeklyMatch[1], 10);
    for (let m = 0; m < 12; m++) {
      for (let n = 1; n <= 5; n++) {
        const d = nthWeekdayOfMonth(year, m, dow, n);
        if (d) dates.push(d);
      }
    }
    return dates;
  }
  return [];
}

// GET /api/planejamento/liturgia/templates
router.get('/liturgia/templates', async (req, res) => {
  try {
    const { data, error } = await supabase.from('event_liturgia_templates')
      .select('*').order('nome');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/planejamento/liturgia/gerar/:year
// Admin clica → backend materializa events fixos no ano X.
// Idempotente: pula se já existe event com mesmo nome+date.
router.post('/liturgia/gerar/:year', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const year = parseInt(req.params.year, 10);
    if (!Number.isFinite(year) || year < 2026 || year > 2050) {
      return res.status(400).json({ error: 'Ano inválido' });
    }

    const { data: templates } = await supabase.from('event_liturgia_templates')
      .select('*').eq('ativo', true);
    if (!templates?.length) return res.json({ created: 0, skipped: 0, total: 0, message: 'Nenhum template ativo' });

    // Pré-busca events existentes do ano pra dedupe
    const { data: existing } = await supabase.from('events')
      .select('name, date')
      .gte('date', `${year}-01-01`)
      .lte('date', `${year}-12-31`);
    const existingSet = new Set((existing || []).map(e => `${e.name}|${e.date}`));

    let created = 0, skipped = 0;
    const insertRows = [];

    for (const tpl of templates) {
      const dates = expandPattern(tpl.recurrence_pattern, year);
      for (const date of dates) {
        const key = `${tpl.nome}|${date}`;
        if (existingSet.has(key)) { skipped++; continue; }
        insertRows.push({
          name: tpl.nome,
          description: tpl.descricao || '',
          date,
          responsible: '',
          budget_planned: tpl.budget_default || 0,
          recurrence: 'unico',
          status: 'no-prazo',
          criacao_origem: 'liturgico',
          created_by: req.user.userId,
        });
      }
    }

    if (insertRows.length > 0) {
      // Insere em batch
      const { error } = await supabase.from('events').insert(insertRows);
      if (error) throw error;
      created = insertRows.length;
    }

    res.json({ created, skipped, total: created + skipped, year });
  } catch (e) {
    console.error('[Planejamento] liturgia/gerar:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
