const router = require('express').Router();
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { sanitizeObj, isValidUUID } = require('../utils/sanitize');
const { notificar } = require('../services/notificar');

// Fase 0 · Time de Agentes.
// Board de tarefas + roster (agent_team) + job description versionada
// (agent_instrucoes). Acesso ESTRITO a super-admins (app_super_admins).
// Persistência via cliente supabase (REST · service_role) — pool pg direto
// não conecta no serverless do Vercel.

router.use(authenticate, requireSuperAdmin);

const MODEL_ESTRUTURA = process.env.ESTRUTURA_INSTRUCOES_MODEL || 'claude-haiku-4-5-20251001';

// ─── helpers ────────────────────────────────────────────────────────────────

function err(res, e, code = 400) {
  console.error('[agentTasks]', e.message);
  return res.status(code).json({ error: e.message });
}

// Busca a job description ATIVA de um agente (para injeção em runtime).
async function instrucaoAtiva(agentKey) {
  const { data } = await supabase
    .from('agent_instrucoes')
    .select('*')
    .eq('agent_key', agentKey)
    .eq('ativo', true)
    .is('deleted_at', null)
    .maybeSingle();
  return data || null;
}

// Estrutura um texto livre em job description via Haiku (structured output).
async function estruturarComIA(raw) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY não configurada');
  const body = {
    model: MODEL_ESTRUTURA,
    max_tokens: 1500,
    system: [
      'Você transforma instruções em texto livre sobre um agente de IA em uma job description estruturada em JSON.',
      'Regras:',
      '- Responda APENAS com o JSON, sem markdown.',
      '- "titulo_cargo": nome curto do cargo do agente.',
      '- "descricao": job description (2-4 frases, português, acentuação correta).',
      '- "responsabilidades": lista de 3-6 responsabilidades.',
      '- "permitido": lista de 3-8 ações que o agente PODE fazer.',
      '- "proibido": lista de 3-8 ações que o agente NÃO PODE fazer.',
      '- Não invente poderes perigosos. Mantenha o tom de um funcionário da igreja.',
    ].join('\n'),
    messages: [{ role: 'user', content: `Instruções do agente:\n\n${raw}` }],
    tools: [{
      name: 'emitir_job_description',
      description: 'Emitir a job description estruturada do agente',
      input_schema: {
        type: 'object',
        properties: {
          titulo_cargo: { type: 'string' },
          descricao: { type: 'string' },
          responsabilidades: { type: 'array', items: { type: 'string' } },
          permitido: { type: 'array', items: { type: 'string' } },
          proibido: { type: 'array', items: { type: 'string' } },
        },
        required: ['titulo_cargo', 'descricao', 'responsabilidades', 'permitido', 'proibido'],
      },
    }],
    tool_choice: { type: 'tool', name: 'emitir_job_description' },
  };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  const toolUse = (data.content || []).find((b) => b.type === 'tool_use');
  if (!toolUse?.input) throw new Error('IA não retornou job description estruturada');
  return toolUse.input;
}

const STATUS_LABEL = {
  nova: 'Tarefa criada',
  agendada: 'Tarefa agendada',
  em_andamento: 'Tarefa em andamento',
  aguardando_revisao: 'Tarefa aguardando revisão',
  aguardando_aprovacao: 'Tarefa aguardando aprovação',
  concluida: 'Tarefa concluída',
  falhou: 'Tarefa falhou',
  bloqueada: 'Tarefa bloqueada',
  cancelada: 'Tarefa cancelada',
};

const TRANSICOES = {
  nova: ['agendada', 'em_andamento', 'cancelada'],
  agendada: ['em_andamento', 'cancelada'],
  em_andamento: ['aguardando_revisao', 'aguardando_aprovacao', 'falhou', 'bloqueada', 'cancelada'],
  aguardando_revisao: ['em_andamento', 'concluida', 'falhou', 'bloqueada'],
  aguardando_aprovacao: ['em_andamento', 'concluida', 'falhou', 'bloqueada'],
  concluida: ['em_andamento', 'cancelada'],
  falhou: ['em_andamento', 'bloqueada', 'cancelada'],
  bloqueada: ['em_andamento', 'nova', 'cancelada'],
  cancelada: [],
};

async function registrarEvento(tarefaId, evento, detalhe = {}, criadoPor = null) {
  await supabase.from('agent_task_events').insert({
    tarefa_id: tarefaId,
    evento,
    detalhe,
    criado_por: criadoPor,
  });
}

async function notificarTransicao(tarefa, status) {
  try {
    await notificar({
      modulo: 'assistente-ia',
      tipo: 'agent_task',
      titulo: `${STATUS_LABEL[status] || status} · ${tarefa.titulo}`,
      mensagem: `Tarefa do agente (${tarefa.agente_key || 'sem agente'}): ${STATUS_LABEL[status] || status}.`,
      link: '/assistente-ia',
      severidade: ['falhou', 'bloqueada'].includes(status) ? 'aviso' : 'info',
      chaveDedup: `agent_task_${tarefa.id}_${status}`,
    });
  } catch (e) {
    console.warn('[agentTasks] falha ao notificar transição:', e.message);
  }
}

// ─── team / roster ──────────────────────────────────────────────────────────

// GET /api/agent-tasks/team · roster + job description ativa de cada um
router.get('/team', async (req, res) => {
  try {
    const { data: membros } = await supabase.from('agent_team').select('*').order('nome');
    const keys = (membros || []).map((m) => m.agent_key);
    let instrucoes = {};
    if (keys.length) {
      const { data: ativas } = await supabase
        .from('agent_instrucoes')
        .select('agent_key, estruturado, versao, updated_at')
        .in('agent_key', keys)
        .eq('ativo', true)
        .is('deleted_at', null);
      instrucoes = (ativas || []).reduce((acc, i) => { acc[i.agent_key] = i; return acc; }, {});
    }
    res.json((membros || []).map((m) => ({ ...m, instrucao_ativa: instrucoes[m.agent_key] || null })));
  } catch (e) { return err(res, e, 500); }
});

// POST /api/agent-tasks/team · novo membro
router.post('/team', async (req, res) => {
  try {
    const body = sanitizeObj(req.body, ['agent_key', 'nome', 'classe', 'modelo', 'ativo', 'orcamento_tarefa_usd', 'custo_estimado_mes_usd']);
    if (!body.agent_key || !body.nome) return err(res, new Error('agent_key e nome são obrigatórios'));
    const { data, error } = await supabase.from('agent_team').insert(body).select().single();
    if (error) return err(res, error);
    res.status(201).json(data);
  } catch (e) { return err(res, e, 500); }
});

// PATCH /api/agent-tasks/team/:agentKey · atualizar membro
router.patch('/team/:agentKey', async (req, res) => {
  try {
    const patch = sanitizeObj(req.body, ['nome', 'classe', 'modelo', 'ativo', 'orcamento_tarefa_usd', 'custo_estimado_mes_usd']);
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('agent_team').update(patch).eq('agent_key', req.params.agentKey).select().single();
    if (error) return err(res, error);
    res.json(data);
  } catch (e) { return err(res, e, 500); }
});

// ─── job description ────────────────────────────────────────────────────────

// GET /api/agent-tasks/team/:agentKey/instrucoes · atual + histórico
router.get('/team/:agentKey/instrucoes', async (req, res) => {
  try {
    const { data: historico } = await supabase
      .from('agent_instrucoes')
      .select('*')
      .eq('agent_key', req.params.agentKey)
      .is('deleted_at', null)
      .order('versao', { ascending: false });
    res.json(historico || []);
  } catch (e) { return err(res, e, 500); }
});

// POST /api/agent-tasks/team/:agentKey/instrucoes/estruturar
// Rascunho (não salva): texto livre → job description estruturada via IA
router.post('/team/:agentKey/instrucoes/estruturar', async (req, res) => {
  try {
    const raw = String(req.body?.raw || '').trim();
    if (raw.length < 10) return err(res, new Error('Escreva as instruções (mínimo 10 caracteres)'));
    const estruturado = await estruturarComIA(raw);
    res.json({ estruturado });
  } catch (e) { return err(res, e, 500); }
});

// PUT /api/agent-tasks/team/:agentKey/instrucoes · salva NOVA versão
router.put('/team/:agentKey/instrucoes', async (req, res) => {
  try {
    const raw = String(req.body?.raw || '').trim();
    const estruturado = req.body?.estruturado || {};
    if (!raw && Object.keys(estruturado).length === 0) {
      return err(res, new Error('Envie as instruções (raw) ou o estruturado'));
    }
    const { data: last } = await supabase
      .from('agent_instrucoes')
      .select('versao')
      .eq('agent_key', req.params.agentKey)
      .is('deleted_at', null)
      .order('versao', { ascending: false })
      .limit(1)
      .maybeSingle();
    const novaVersao = (last?.versao || 0) + 1;

    await supabase.from('agent_instrucoes').update({ ativo: false }).eq('agent_key', req.params.agentKey).eq('ativo', true);
    const { data, error } = await supabase.from('agent_instrucoes').insert({
      agent_key: req.params.agentKey,
      versao: novaVersao,
      raw_instrucoes: raw,
      estruturado,
      ativo: true,
      created_by: req.user.id,
    }).select().single();
    if (error) return err(res, error);

    await notificar({
      modulo: 'assistente-ia',
      tipo: 'agent_task',
      titulo: `📋 Job description atualizada · ${req.params.agentKey}`,
      mensagem: `Nova versão (v${novaVersao}) gravada. Vale para a próxima execução do agente.`,
      link: '/assistente-ia',
      severidade: 'info',
      chaveDedup: `agent_instrucao_${req.params.agentKey}_${novaVersao}`,
    });

    res.status(201).json(data);
  } catch (e) { return err(res, e, 500); }
});

// ─── tarefas ────────────────────────────────────────────────────────────────

// GET /api/agent-tasks/tarefas?status=&classe=&agente=&origem=
router.get('/tarefas', async (req, res) => {
  try {
    let query = supabase.from('agent_tarefas')
      .select('*, agent_team(nome, classe, modelo)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    for (const [k, v] of Object.entries(req.query)) {
      if (v && ['status', 'classe', 'agente', 'origem'].includes(k)) query = query.eq(k === 'agente' ? 'agente_key' : k, v);
    }
    const { data } = await query;
    res.json(data || []);
  } catch (e) { return err(res, e, 500); }
});

// GET /api/agent-tasks/tarefas/:id · detalhe + comentários + eventos
router.get('/tarefas/:id', async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return err(res, new Error('id inválido'));
    const { data: tarefa } = await supabase.from('agent_tarefas')
      .select('*, agent_team(nome, classe, modelo)')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!tarefa) return res.status(404).json({ error: 'Tarefa não encontrada' });
    const [{ data: comentarios }, { data: eventos }] = await Promise.all([
      supabase.from('agent_task_comments').select('*, profiles(nome)').eq('tarefa_id', tarefa.id).is('deleted_at', null).order('created_at'),
      supabase.from('agent_task_events').select('*').eq('tarefa_id', tarefa.id).order('created_at'),
    ]);
    res.json({ ...tarefa, comentarios: comentarios || [], eventos: eventos || [] });
  } catch (e) { return err(res, e, 500); }
});

// POST /api/agent-tasks/tarefas · criar
router.post('/tarefas', async (req, res) => {
  try {
    const body = sanitizeObj(req.body, ['titulo', 'descricao', 'classe', 'agente_key', 'status', 'prioridade', 'origem', 'orcamento_usd', 'gate']);
    if (!body.titulo) return err(res, new Error('Título é obrigatório'));
    const insert = {
      titulo: String(body.titulo).slice(0, 200),
      descricao: String(body.descricao || '').slice(0, 5000),
      classe: body.classe || 'watcher',
      agente_key: body.agente_key || null,
      status: body.status || 'nova',
      prioridade: body.prioridade || 'media',
      origem: body.origem || 'web',
      orcamento_usd: body.orcamento_usd || null,
      gate: body.gate || null,
      created_by: req.user.id,
    };
    const { data, error } = await supabase.from('agent_tarefas').insert(insert).select().single();
    if (error) return err(res, error);
    await registrarEvento(data.id, 'criada', { titulo: data.titulo }, req.user.id);
    notificarTransicao(data, 'nova');
    res.status(201).json(data);
  } catch (e) { return err(res, e, 500); }
});

// PATCH /api/agent-tasks/tarefas/:id · editar campos
router.patch('/tarefas/:id', async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return err(res, new Error('id inválido'));
    const patch = sanitizeObj(req.body, ['titulo', 'descricao', 'classe', 'agente_key', 'prioridade', 'orcamento_usd', 'gate', 'pull_request_url', 'branch', 'queue_ids', 'run_ids']);
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('agent_tarefas').update(patch).eq('id', req.params.id).select().single();
    if (error) return err(res, error);
    await registrarEvento(data.id, 'atualizada', { campos: Object.keys(patch) }, req.user.id);
    res.json(data);
  } catch (e) { return err(res, e, 500); }
});

// POST /api/agent-tasks/tarefas/:id/comentario
router.post('/tarefas/:id/comentario', async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return err(res, new Error('id inválido'));
    const texto = String(req.body?.texto || '').trim();
    if (!texto) return err(res, new Error('Comentário vazio'));
    const { data, error } = await supabase.from('agent_task_comments').insert({
      tarefa_id: req.params.id,
      autor_id: req.user.id,
      texto: texto.slice(0, 3000),
    }).select().single();
    if (error) return err(res, error);
    res.status(201).json(data);
  } catch (e) { return err(res, e, 500); }
});

// POST /api/agent-tasks/tarefas/:id/transicao · mudar status (validado)
router.post('/tarefas/:id/transicao', async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return err(res, new Error('id inválido'));
    const novo = String(req.body?.status || '');
    const { data: tarefa } = await supabase.from('agent_tarefas').select('*').eq('id', req.params.id).maybeSingle();
    if (!tarefa || tarefa.deleted_at) return res.status(404).json({ error: 'Tarefa não encontrada' });
    const permitidas = TRANSICOES[tarefa.status] || [];
    if (!permitidas.includes(novo)) {
      return err(res, new Error(`Transição inválida: ${tarefa.status} → ${novo}. Permitidas: ${permitidas.join(', ') || 'nenhuma'}`));
    }
    const { data, error } = await supabase.from('agent_tarefas')
      .update({ status: novo, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) return err(res, error);
    await registrarEvento(data.id, `status_${novo}`, { de: tarefa.status, para: novo }, req.user.id);
    await supabase.from('agent_team')
      .update({ ultima_atividade_em: new Date().toISOString() })
      .eq('agent_key', data.agente_key || '');
    notificarTransicao(data, novo);
    res.json(data);
  } catch (e) { return err(res, e, 500); }
});

// POST /api/agent-tasks/tarefas/:id/gates · aprovar/reprovar G1 ou G2
router.post('/tarefas/:id/gates', async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return err(res, new Error('id inválido'));
    const gate = String(req.body?.gate || '').toUpperCase();
    const aprovado = req.body?.aprovado !== false;
    const observacao = String(req.body?.observacao || '');
    if (!['G1', 'G2'].includes(gate)) return err(res, new Error('gate deve ser G1 ou G2'));
    const patch = { gate, aprovada_por: req.user.id, aprovada_em: new Date().toISOString(), updated_at: new Date().toISOString() };
    const { data, error } = await supabase.from('agent_tarefas').update(patch).eq('id', req.params.id).select().single();
    if (error) return err(res, error);
    await registrarEvento(data.id, `gate_${gate}`, { aprovado, observacao }, req.user.id);
    notificar({
      modulo: 'assistente-ia',
      tipo: 'agent_task',
      titulo: `Gate ${gate} ${aprovado ? 'aprovado' : 'reprovado'} · ${data.titulo}`,
      mensagem: observacao || (aprovado ? 'Pode seguir para a execução.' : 'Voltou para ajustes.'),
      link: '/assistente-ia',
      severidade: aprovado ? 'info' : 'aviso',
      chaveDedup: `agent_task_${data.id}_${gate}_${aprovado ? 'ap' : 're'}`,
    });
    res.json(data);
  } catch (e) { return err(res, e, 500); }
});

// DELETE /api/agent-tasks/tarefas/:id · soft delete (app_soft_delete)
router.delete('/tarefas/:id', async (req, res) => {
  try {
    if (!isValidUUID(req.params.id)) return err(res, new Error('id inválido'));
    const { data, error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'agent_tarefas',
      p_row_id: req.params.id,
      p_deleted_by: req.user.id ?? null,
    });
    if (error) return err(res, error);
    res.json({ ok: true, result: data });
  } catch (e) { return err(res, e, 500); }
});

module.exports = router;
