// Minhas Tarefas · CRUD pessoal (página /tarefas · lista/kanban/calendário).
// Privacidade estrita: TODA operação é escopada em created_by = req.user.userId
// — sem escape de admin (tarefa pessoal é privada; pedido do Matheus 2026-07-06).
// Tabela tarefas_pessoais (repurposada do módulo Processos descontinuado);
// status manda no kanban; done fica espelhado pra compat com a agenda legada.
const router = require('express').Router();
const crypto = require('crypto');
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

const STATUS = ['a_fazer', 'fazendo', 'concluida'];
const PRIORIDADES = ['baixa', 'media', 'alta'];
const RECORRENCIAS = ['unica', 'diaria', 'semanal', 'quinzenal', 'mensal'];

function limparPayload(d = {}) {
  const out = {};
  if (d.titulo !== undefined) out.titulo = String(d.titulo || '').trim().slice(0, 200);
  if (d.descricao !== undefined) out.descricao = d.descricao ? String(d.descricao).trim().slice(0, 2000) : null;
  if (d.data !== undefined) out.data = d.data || null;
  if (d.horario !== undefined) out.horario = d.horario || null;
  if (d.prioridade !== undefined) out.prioridade = PRIORIDADES.includes(d.prioridade) ? d.prioridade : 'media';
  if (d.status !== undefined && STATUS.includes(d.status)) {
    out.status = d.status;
    out.done = d.status === 'concluida';
  }
  return out;
}

// GET / — minhas tarefas (ativas + concluídas recentes)
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tarefas_pessoais')
      .select('id, titulo, descricao, data, horario, prioridade, status, done, recorrencia, recorrencia_id, created_at, ordem')
      .eq('created_by', req.user.userId)
      // ⚠️ `ordem` PRIMEIRO: é a posição que a pessoa escolheu à mão. Quem nunca
      // foi reordenada tem NULL e cai no fim do grupo (NULLS LAST), mantendo o
      // comportamento de sempre — data e horário.
      .order('ordem', { ascending: true, nullsFirst: false })
      .order('data', { ascending: true, nullsFirst: false })
      .order('horario', { ascending: true, nullsFirst: false })
      .limit(2000);
    if (error) {
      // ⚠️ Sem a migration, pedir `ordem` faz o PostgREST recusar a query
      // INTEIRA (42703) e a pessoa ficaria SEM NENHUMA tarefa na tela. Repete
      // sem a coluna — lição do `parcelas_max`.
      if (error.code !== '42703') throw error;
      const r = await supabase
        .from('tarefas_pessoais')
        .select('id, titulo, descricao, data, horario, prioridade, status, done, recorrencia, recorrencia_id, created_at')
        .eq('created_by', req.user.userId)
        .order('data', { ascending: true, nullsFirst: false })
        .order('horario', { ascending: true, nullsFirst: false })
        .limit(2000);
      if (r.error) throw r.error;
      return res.json(r.data || []);
    }
    res.json(data || []);
  } catch (e) {
    console.error('[tarefas] list:', e.message);
    res.status(500).json({ error: 'Erro ao listar as tarefas' });
  }
});

// POST /reordenar — a nova sequência de UM grupo da tela.
//
// ⚠️ O corpo manda a LISTA INTEIRA do grupo na ordem nova, não "sobe esta uma".
// Trocar duas linhas de lugar exige saber a posição das duas, e metade das
// tarefas tem `ordem` NULL — o swap teria que inventar valor pra vizinha e o
// resultado dependeria de quem foi movida primeiro. Com a lista inteira, o
// servidor escreve 0..n-1 e o grupo fica consistente numa tacada.
router.post('/reordenar', async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error: 'Nenhuma tarefa informada' });
    // Teto: a lista da tela é capada em 2000; ordem de grupo é muito menor.
    if (ids.length > 500) return res.status(400).json({ error: 'Lista longa demais' });
    if (new Set(ids).size !== ids.length) return res.status(400).json({ error: 'Ids repetidos' });

    // ⚠️⚠️ O payload diz QUAIS e em que ordem, NUNCA de quem: cada UPDATE leva
    // `created_by = eu`. Sem isso, um id de outra pessoa no corpo reordenaria a
    // tarefa dela (a mesma lei do lote de exclusão de inscrições).
    let movidas = 0;
    for (let i = 0; i < ids.length; i++) {
      const { data, error } = await supabase
        .from('tarefas_pessoais')
        .update({ ordem: i })
        .eq('id', ids[i])
        .eq('created_by', req.user.userId)
        .select('id');
      if (error) {
        // Sem a migration a coluna não existe — diz o motivo em vez de 500 seco.
        if (error.code === '42703') {
          return res.status(503).json({ error: 'Ordenação ainda não disponível', codigo: 'sem_coluna' });
        }
        throw error;
      }
      movidas += (data || []).length;
    }
    // Id que não é meu simplesmente não move — e a resposta DIZ quantas moveram.
    res.json({ ok: true, movidas, pedidas: ids.length });
  } catch (e) {
    console.error('[tarefas] reordenar:', e.message);
    res.status(500).json({ error: 'Erro ao salvar a nova ordem' });
  }
});

// POST / — cria (com recorrência opcional · gera 12 semanas de instâncias)
router.post('/', async (req, res) => {
  try {
    const d = req.body || {};
    if (!d.titulo?.trim()) return res.status(400).json({ error: 'Título é obrigatório' });
    const recorrencia = RECORRENCIAS.includes(d.recorrencia) ? d.recorrencia : 'unica';
    if (recorrencia !== 'unica' && !d.data) {
      return res.status(400).json({ error: 'Tarefa recorrente precisa de uma data inicial' });
    }
    const recorrenciaId = recorrencia !== 'unica' ? crypto.randomUUID() : null;

    const base = {
      ...limparPayload(d),
      titulo: String(d.titulo).trim().slice(0, 200),
      created_by: req.user.userId,
      responsavel_id: req.user.userId,
      responsavel_nome: req.user.name || null,
      recorrencia,
      recorrencia_id: recorrenciaId,
      tipo: 'pessoal',
    };

    const dates = [d.data || null];
    if (recorrenciaId) {
      const start = new Date(`${d.data}T12:00:00`);
      for (let i = 1; i <= 12 * 7; i++) {
        const next = new Date(start);
        next.setDate(next.getDate() + i);
        const match =
          (recorrencia === 'diaria') ||
          (recorrencia === 'semanal' && i % 7 === 0) ||
          (recorrencia === 'quinzenal' && i % 14 === 0) ||
          (recorrencia === 'mensal' && next.getDate() === start.getDate());
        if (match) dates.push(next.toISOString().slice(0, 10));
      }
    }

    const rows = dates.map(dt => ({ ...base, data: dt }));
    const { data, error } = await supabase.from('tarefas_pessoais').insert(rows).select();
    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (e) {
    console.error('[tarefas] create:', e.message);
    res.status(500).json({ error: 'Erro ao criar a tarefa' });
  }
});

// PUT /:id — edita campos (dono)
router.put('/:id', async (req, res) => {
  try {
    const patch = limparPayload(req.body || {});
    if (patch.titulo !== undefined && !patch.titulo) {
      return res.status(400).json({ error: 'Título é obrigatório' });
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada pra atualizar' });
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('tarefas_pessoais')
      .update(patch)
      .eq('id', req.params.id)
      .eq('created_by', req.user.userId)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Tarefa não encontrada' });
    res.json(data);
  } catch (e) {
    console.error('[tarefas] update:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar a tarefa' });
  }
});

// DELETE /:id — remove (dono) · ?serie=1 remove as instâncias FUTURAS da recorrência
router.delete('/:id', async (req, res) => {
  try {
    const { data: tarefa } = await supabase
      .from('tarefas_pessoais')
      .select('id, recorrencia_id, data')
      .eq('id', req.params.id)
      .eq('created_by', req.user.userId)
      .maybeSingle();
    if (!tarefa) return res.status(404).json({ error: 'Tarefa não encontrada' });

    if (req.query.serie === '1' && tarefa.recorrencia_id) {
      let q = supabase.from('tarefas_pessoais').delete()
        .eq('recorrencia_id', tarefa.recorrencia_id)
        .eq('created_by', req.user.userId);
      if (tarefa.data) q = q.gte('data', tarefa.data);
      const { error } = await q;
      if (error) throw error;
    } else {
      const { error } = await supabase.from('tarefas_pessoais').delete()
        .eq('id', tarefa.id).eq('created_by', req.user.userId);
      if (error) throw error;
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[tarefas] delete:', e.message);
    res.status(500).json({ error: 'Erro ao excluir a tarefa' });
  }
});

module.exports = router;
