const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');

router.use(authenticate);

const STATUS_VALIDOS = [
  'novo', 'primeiro_contato', 'acompanhamento', 'discipulado',
  'batizado', 'membro_ativo', 'inativo', 'mudou_cidade',
];

const CAMPOS_VISITANTE = [
  'nome', 'telefone', 'email', 'idade', 'data_visita', 'culto_id',
  'origem', 'veio_acompanhado', 'fez_decisao', 'tipo_decisao',
  'responsavel_id', 'status', 'membresia_id', 'observacoes',
];

function sanitize(body, allowed) {
  const out = {};
  for (const k of allowed) if (body[k] !== undefined) out[k] = body[k];
  return out;
}

// ── GET /visitantes — lista com filtros ─────────────────────────────────────
router.get('/visitantes', async (req, res) => {
  try {
    const { status, responsavel_id, culto_id, search, fez_decisao } = req.query;
    let q = supabase
      .from('int_visitantes')
      .select(`
        *,
        responsavel:vol_profiles!int_visitantes_responsavel_id_fkey(id, full_name, avatar_url),
        culto:vol_services(id, name, scheduled_at)
      `)
      .order('data_visita', { ascending: false })
      .order('created_at', { ascending: false });

    if (status) q = q.eq('status', status);
    if (responsavel_id) q = q.eq('responsavel_id', responsavel_id);
    if (culto_id) q = q.eq('culto_id', culto_id);
    if (fez_decisao !== undefined) q = q.eq('fez_decisao', fez_decisao === 'true');
    if (search) q = q.or(`nome.ilike.%${search}%,telefone.ilike.%${search}%,email.ilike.%${search}%`);

    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[INTEGRACAO] list visitantes', e.message);
    res.status(500).json({ error: 'Erro ao listar visitantes' });
  }
});

// ── GET /visitantes/:id — detalhe com acompanhamentos ───────────────────────
router.get('/visitantes/:id', async (req, res) => {
  try {
    const { data: visitante, error } = await supabase
      .from('int_visitantes')
      .select(`
        *,
        responsavel:vol_profiles!int_visitantes_responsavel_id_fkey(id, full_name, avatar_url),
        culto:vol_services(id, name, scheduled_at)
      `)
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!visitante) return res.status(404).json({ error: 'Visitante não encontrado' });

    const { data: acompanhamentos } = await supabase
      .from('int_acompanhamentos')
      .select('*, voluntario:vol_profiles(id, full_name, avatar_url)')
      .eq('visitante_id', req.params.id)
      .order('data_contato', { ascending: false });

    res.json({ ...visitante, acompanhamentos: acompanhamentos || [] });
  } catch (e) {
    console.error('[INTEGRACAO] get visitante', e.message);
    res.status(500).json({ error: 'Erro ao buscar visitante' });
  }
});

// ── POST /visitantes ────────────────────────────────────────────────────────
router.post('/visitantes', async (req, res) => {
  try {
    const payload = sanitize(req.body, CAMPOS_VISITANTE);
    if (!payload.nome || !payload.nome.trim()) {
      return res.status(400).json({ error: 'Nome obrigatório' });
    }
    if (payload.status && !STATUS_VALIDOS.includes(payload.status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }
    payload.created_by = req.user?.userId || null;

    const { data, error } = await supabase
      .from('int_visitantes')
      .insert(payload)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (e) {
    console.error('[INTEGRACAO] create visitante', e.message);
    res.status(500).json({ error: 'Erro ao cadastrar visitante' });
  }
});

// ── PUT /visitantes/:id ─────────────────────────────────────────────────────
router.put('/visitantes/:id', async (req, res) => {
  try {
    const payload = sanitize(req.body, CAMPOS_VISITANTE);
    if (payload.status && !STATUS_VALIDOS.includes(payload.status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }
    const { data, error } = await supabase
      .from('int_visitantes')
      .update(payload)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    console.error('[INTEGRACAO] update visitante', e.message);
    res.status(500).json({ error: 'Erro ao atualizar visitante' });
  }
});

// ── DELETE /visitantes/:id ──────────────────────────────────────────────────
router.delete('/visitantes/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('int_visitantes').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) {
    console.error('[INTEGRACAO] delete visitante', e.message);
    res.status(500).json({ error: 'Erro ao remover visitante' });
  }
});

// ── POST /visitantes/:id/status — mudança explícita de status ───────────────
router.post('/visitantes/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!STATUS_VALIDOS.includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }
    const { data, error } = await supabase
      .from('int_visitantes')
      .update({ status })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    console.error('[INTEGRACAO] change status', e.message);
    res.status(500).json({ error: 'Erro ao alterar status' });
  }
});

// ── GET /acompanhamentos/pendentes — próximos contatos agendados ────────────
router.get('/acompanhamentos/pendentes', async (req, res) => {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('int_acompanhamentos')
      .select(`
        *,
        visitante:int_visitantes(id, nome, status, telefone),
        voluntario:vol_profiles(id, full_name)
      `)
      .gte('data_proximo_contato', hoje)
      .order('data_proximo_contato', { ascending: true });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[INTEGRACAO] pendentes', e.message);
    res.status(500).json({ error: 'Erro ao listar pendentes' });
  }
});

// ── POST /visitantes/:id/acompanhamentos — registra 1:1 ─────────────────────
router.post('/visitantes/:id/acompanhamentos', async (req, res) => {
  try {
    const { tipo, data_contato, resultado, observacoes, proximo_passo, data_proximo_contato, voluntario_id } = req.body;
    if (!tipo) return res.status(400).json({ error: 'Tipo obrigatório' });

    const payload = {
      visitante_id: req.params.id,
      voluntario_id: voluntario_id || null,
      tipo,
      data_contato: data_contato || new Date().toISOString(),
      resultado: resultado || null,
      observacoes: observacoes || null,
      proximo_passo: proximo_passo || null,
      data_proximo_contato: data_proximo_contato || null,
      created_by: req.user?.userId || null,
    };

    const { data, error } = await supabase
      .from('int_acompanhamentos')
      .insert(payload)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (e) {
    console.error('[INTEGRACAO] add acompanhamento', e.message);
    res.status(500).json({ error: 'Erro ao registrar acompanhamento' });
  }
});

// ── DELETE /acompanhamentos/:id ─────────────────────────────────────────────
router.delete('/acompanhamentos/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('int_acompanhamentos').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) {
    console.error('[INTEGRACAO] delete acompanhamento', e.message);
    res.status(500).json({ error: 'Erro ao remover acompanhamento' });
  }
});

// ── GET /dashboard — cards do header de /integracao ─────────────────────────
// Reformulado em 2026-05-14 · visitantes/acompanhamentos descontinuados (PR
// #399). Agora retorna dados acionaveis: cultos pendentes de preenchimento,
// frequência + decisões do mês corrente, batismos aguardando.
router.get('/dashboard', async (req, res) => {
  try {
    const hoje = new Date();
    const hojeStr = hoje.toISOString().slice(0, 10);
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
    const sessentaDiasAtrasStr = new Date(hoje.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // 1. Cultos pendentes · passados nos últimos 60 dias sem preenchimento
    const { data: cultosRecentes } = await supabase
      .from('cultos')
      .select('id, data, presencial_adulto, presencial_kids')
      .gte('data', sessentaDiasAtrasStr)
      .lte('data', hojeStr);
    const cultosPendentes = (cultosRecentes || []).filter(
      c => (c.presencial_adulto || 0) === 0 && (c.presencial_kids || 0) === 0
    ).length;

    // 2. Frequência + decisões do mês corrente
    const { data: cultosMes } = await supabase
      .from('cultos')
      .select('presencial_adulto, presencial_kids, decisoes_presenciais, decisoes_online')
      .gte('data', inicioMes)
      .lte('data', hojeStr);
    let frequenciaMes = 0;
    let decisoesMes = 0;
    for (const c of cultosMes || []) {
      frequenciaMes += (c.presencial_adulto || 0) + (c.presencial_kids || 0);
      decisoesMes   += (c.decisoes_presenciais || 0) + (c.decisoes_online || 0);
    }

    // Soma também decisões sem culto vinculado · trilha 'conversao' concluída
    // que veio de importação (planilha) e cai no mês corrente.
    // (Decisões registradas via cultos_decisoes_pessoas também criam trilha,
    //  mas com observação 'Decisão registrada no culto' · filtramos por
    //  observação ILIKE '%importação%' pra contar so as historicas/avulsas.)
    const { count: decisoesImportadasMes } = await supabase
      .from('mem_trilha_valores')
      .select('id', { count: 'exact', head: true })
      .eq('etapa', 'conversao')
      .eq('concluida', true)
      .gte('data_conclusao', inicioMes)
      .lte('data_conclusao', hojeStr)
      .ilike('observacoes', '%importacao%');
    decisoesMes += decisoesImportadasMes || 0;

    // 3. Batismos aguardando + próxima data
    const { data: batismosAg } = await supabase
      .from('batismo_inscricoes')
      .select('id, data_batismo, status')
      .in('status', ['pendente', 'confirmado']);
    const batismosAguardando = (batismosAg || []).length;
    const proximoBatismo = (batismosAg || [])
      .map(b => b.data_batismo)
      .filter(d => d && d >= hojeStr)
      .sort()[0] || null;

    res.json({
      cultos_pendentes: cultosPendentes,
      frequencia_mes: frequenciaMes,
      decisoes_mes: decisoesMes,
      batismos_aguardando: batismosAguardando,
      proximo_batismo: proximoBatismo,
    });
  } catch (e) {
    console.error('[INTEGRACAO] dashboard', e.message);
    res.status(500).json({ error: 'Erro ao montar dashboard' });
  }
});

// ── GET /historico-anual — agregacao por ano + tipo de culto ────────────────
// Le vw_culto_historico_anual · agregacao no SQL escala pra qualquer volume.
// Frontend desenha tabela/grafico anual sem limit no client.
router.get('/historico-anual', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_culto_historico_anual')
      .select('*')
      .order('ano', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[INTEGRACAO] historico-anual', e.message);
    res.status(500).json({ error: 'Erro ao carregar histórico' });
  }
});

// ── GET /historico-batismos — total de batismos realizados por ano ──────────
router.get('/historico-batismos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_batismo_historico_anual')
      .select('*')
      .order('ano', { ascending: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[INTEGRACAO] historico-batismos', e.message);
    res.status(500).json({ error: 'Erro ao carregar histórico de batismos' });
  }
});

// ═════════════════════════════════════════════════════════════════════════
// COLETA MOBILE · submissoes de dados de culto pendentes de aprovação
// ═════════════════════════════════════════════════════════════════════════

// GET /coleta/cultos-abertos · lista cultos dos últimos 14 dias com status por ambiente
router.get('/coleta/cultos-abertos', async (req, res) => {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const limite = new Date(); limite.setDate(limite.getDate() - 14);
    const desde = limite.toISOString().slice(0, 10);

    const { data: cultos, error: errCultos } = await supabase
      .from('cultos')
      .select(`
        id, data, presencial_adulto, presencial_kids,
        decisoes_presenciais, decisoes_kids,
        service_type:vol_service_types(id, name, recurrence_time, has_kids)
      `)
      .gte('data', desde)
      .lte('data', hoje)
      .order('data', { ascending: false })
      .limit(40);
    if (errCultos) return res.status(400).json({ error: errCultos.message });

    const ids = (cultos || []).map(c => c.id);
    let subsByKey = {};
    if (ids.length) {
      const { data: subs, error: errSubs } = await supabase
        .from('cultos_dados_submissoes')
        .select('id, culto_id, ambiente, status, presencial, decisoes, submitted_at')
        .in('culto_id', ids)
        .in('status', ['pendente', 'aprovado']);
      if (errSubs) return res.status(400).json({ error: errSubs.message });
      for (const s of (subs || [])) {
        subsByKey[`${s.culto_id}:${s.ambiente}`] = s;
      }
    }

    const out = (cultos || []).map(c => ({
      id: c.id,
      data: c.data,
      service_type: c.service_type,
      templo: {
        submissao: subsByKey[`${c.id}:templo`] || null,
        ja_em_cultos: (c.presencial_adulto != null && c.presencial_adulto > 0) ||
                      (c.decisoes_presenciais != null && c.decisoes_presenciais > 0),
      },
      kids: {
        habilitado: !!c.service_type?.has_kids,
        submissao: subsByKey[`${c.id}:kids`] || null,
        ja_em_cultos: (c.presencial_kids != null && c.presencial_kids > 0) ||
                      (c.decisoes_kids != null && c.decisoes_kids > 0),
      },
    }));

    res.json(out);
  } catch (e) {
    console.error('[INTEGRACAO] coleta/cultos-abertos', e.message);
    res.status(500).json({ error: 'Erro ao carregar cultos abertos' });
  }
});

// POST /coleta · submeter dados de um culto (templo OU kids)
router.post('/coleta', async (req, res) => {
  try {
    const { culto_id, ambiente, presencial, decisoes, observacao } = req.body || {};
    if (!culto_id) return res.status(400).json({ error: 'culto_id obrigatorio' });
    if (!['templo', 'kids'].includes(ambiente)) {
      return res.status(400).json({ error: 'ambiente invalido (templo ou kids)' });
    }
    const pres = Number(presencial);
    const dec = Number(decisoes ?? 0);
    if (!Number.isFinite(pres) || pres < 0) {
      return res.status(400).json({ error: 'presencial deve ser número >= 0' });
    }
    if (!Number.isFinite(dec) || dec < 0) {
      return res.status(400).json({ error: 'decisões deve ser número >= 0' });
    }

    const { data, error } = await supabase
      .from('cultos_dados_submissoes')
      .insert({
        culto_id,
        ambiente,
        presencial: Math.round(pres),
        decisoes: Math.round(dec),
        observacao: observacao || null,
        status: 'pendente',
        submitted_by: req.user?.id || null,
      })
      .select()
      .single();
    if (error) {
      // 23505 = unique_violation · já tem submissao ativa pra esse (culto, ambiente)
      if (error.code === '23505') {
        return res.status(409).json({
          error: 'Já existe uma submissao pendente ou aprovada deste ambiente neste culto.',
        });
      }
      return res.status(400).json({ error: error.message });
    }

    // Notificação · admins/diretores (ou regras customizadas em /admin/notificacoes-regras)
    (async () => {
      try {
        const [{ data: prof }, { data: culto }] = await Promise.all([
          supabase.from('profiles').select('name, email').eq('id', req.user.id).single(),
          supabase
            .from('cultos')
            .select('data, service_type:vol_service_types(name)')
            .eq('id', culto_id)
            .single(),
        ]);
        const quem = prof?.name || prof?.email || 'Alguem';
        const ambienteLabel = ambiente === 'kids' ? 'Kids' : 'Templo';
        const dataPt = culto?.data ? new Date(culto.data + 'T12:00:00').toLocaleDateString('pt-BR') : '';
        const cultoLabel = `${culto?.service_type?.name || 'Culto'}${dataPt ? ' · ' + dataPt : ''}`;
        await notificar({
          modulo: 'integracao',
          tipo: 'dados_culto_pendente',
          titulo: `Dados de culto aguardando aprovação`,
          mensagem: `${quem} lancou ${ambienteLabel} do ${cultoLabel} · presencial ${Math.round(pres)} · decisões ${Math.round(dec)}`,
          link: '/integracao?tab=pendentes',
          severidade: 'info',
          chaveDedup: `dados_culto_sub_${data.id}`,
        });
      } catch (e) {
        console.warn('[INTEGRACAO] notificar coleta:', e.message);
      }
    })();

    res.status(201).json(data);
  } catch (e) {
    console.error('[INTEGRACAO] coleta POST', e.message);
    res.status(500).json({ error: 'Erro ao registrar submissao' });
  }
});

// GET /coleta/minhas · submissoes do próprio usuário (histórico pessoal)
router.get('/coleta/minhas', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cultos_dados_submissoes')
      .select(`
        id, culto_id, ambiente, presencial, decisoes, observacao,
        status, submitted_at, approved_at, rejected_reason,
        culto:cultos(id, data, service_type:vol_service_types(name))
      `)
      .eq('submitted_by', req.user.id)
      .order('submitted_at', { ascending: false })
      .limit(50);
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[INTEGRACAO] coleta/minhas', e.message);
    res.status(500).json({ error: 'Erro ao carregar suas submissoes' });
  }
});

// GET /coleta/pendentes · lista submissoes pendentes pro coord aprovar
router.get('/coleta/pendentes', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cultos_dados_submissoes')
      .select(`
        id, culto_id, ambiente, presencial, decisoes, observacao,
        status, submitted_at, rejected_reason,
        submitted_by, submitter:profiles!cultos_dados_submissoes_submitted_by_fkey(id, name, email, avatar_url),
        culto:cultos(id, data, presencial_adulto, presencial_kids, decisoes_presenciais, decisoes_kids,
                     service_type:vol_service_types(name, recurrence_time))
      `)
      .eq('status', 'pendente')
      .order('submitted_at', { ascending: true });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[INTEGRACAO] coleta/pendentes', e.message);
    res.status(500).json({ error: 'Erro ao listar pendentes' });
  }
});

// POST /coleta/:id/aprovar · aplica os valores em cultos.* e marca aprovado
router.post('/coleta/:id/aprovar', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: sub, error: errFetch } = await supabase
      .from('cultos_dados_submissoes')
      .select('id, culto_id, ambiente, presencial, decisoes, status')
      .eq('id', id)
      .single();
    if (errFetch || !sub) return res.status(404).json({ error: 'Submissao não encontrada' });
    if (sub.status !== 'pendente') {
      return res.status(409).json({ error: `Submissao já esta ${sub.status}` });
    }

    const updateCulto = sub.ambiente === 'templo'
      ? { presencial_adulto: sub.presencial, decisoes_presenciais: sub.decisoes }
      : { presencial_kids: sub.presencial, decisoes_kids: sub.decisoes };

    const { error: errCulto } = await supabase
      .from('cultos')
      .update(updateCulto)
      .eq('id', sub.culto_id);
    if (errCulto) return res.status(400).json({ error: 'Erro ao atualizar culto: ' + errCulto.message });

    const { data: updSub, error: errUpd } = await supabase
      .from('cultos_dados_submissoes')
      .update({
        status: 'aprovado',
        approved_by: req.user?.id || null,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (errUpd) return res.status(400).json({ error: errUpd.message });

    res.json(updSub);
  } catch (e) {
    console.error('[INTEGRACAO] coleta aprovar', e.message);
    res.status(500).json({ error: 'Erro ao aprovar submissao' });
  }
});

// POST /coleta/:id/rejeitar · marca rejeitada · libera novo envio do mesmo (culto,ambiente)
router.post('/coleta/:id/rejeitar', async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body || {};
    if (!motivo || String(motivo).trim().length < 3) {
      return res.status(400).json({ error: 'Informe um motivo (min 3 chars)' });
    }
    const { data, error } = await supabase
      .from('cultos_dados_submissoes')
      .update({
        status: 'rejeitado',
        rejected_reason: String(motivo).trim(),
        approved_by: req.user?.id || null,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'pendente')
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Submissao não encontrada ou já decidida' });
    res.json(data);
  } catch (e) {
    console.error('[INTEGRACAO] coleta rejeitar', e.message);
    res.status(500).json({ error: 'Erro ao rejeitar submissao' });
  }
});

module.exports = router;
