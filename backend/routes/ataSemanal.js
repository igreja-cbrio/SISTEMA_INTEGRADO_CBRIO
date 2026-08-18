// ATA Semanal · porta própria da reunião ministerial
//
// ⚠️ POR QUE NÃO REUSAR /api/governanca:
// aqueles endpoints exigem `authorizeModule('governanca', 1)` para ler e nível 3
// para escrever. A ATA da ministerial precisa estar aberta a TODO colaborador
// (decisão do Matheus, 18/08/2026), e conceder `governanca` a todos abriria
// junto Conselho Consultivo, Diretoria Estatutária, DRE e Assembleia Geral —
// que é exatamente o material que deve continuar restrito. Porta separada é
// mais barato e mais seguro do que afrouxar a porta existente.
//
// Lê as mesmas tabelas (`governance_meetings` / `governance_tasks`), escopado ao
// tipo Ministerial.

const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');

router.use(authenticate);

// ⚠️ COLABORADOR, não "qualquer autenticado".
// O login do app de membros e o do ERP compartilham o mesmo Supabase Auth, então
// "autenticado" inclui ~91 contas que só usam o app. A ata traz números
// financeiros, discussão estratégica e menção a pessoas: não é conteúdo de
// membro. `is_membro_only` é a fronteira que já existe para isso.
function apenasColaborador(req, res, next) {
  if (req.user?.is_membro_only) {
    return res.status(403).json({ error: 'Acesso restrito a colaboradores' });
  }
  next();
}
router.use(apenasColaborador);

const STATUS_VALIDOS = ['pendente', 'em_andamento', 'concluida', 'cancelada', 'nao_executada'];

// O id do tipo não muda; resolver a cada request seria uma consulta a mais em
// toda chamada. Cache em memória, com refresh se por acaso vier vazio.
let _tipoId = null;
async function tipoMinisterialId() {
  if (_tipoId) return _tipoId;
  const { data } = await supabase
    .from('governance_meeting_types')
    .select('id')
    .eq('sigla', 'MIN')
    .maybeSingle();
  _tipoId = data?.id || null;
  return _tipoId;
}

// ── Colaboradores (para o seletor de responsável) ───────────────────────────
//
// Não usa /permissoes/colaboradores porque aquele router é `authorize('admin',
// 'diretor')` — um líder de área não conseguiria abrir a lista, e é justamente
// ele que precisa atribuir responsável.
router.get('/colaboradores', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, avatar_url, area')
      .eq('active', true)
      // ⚠️ `.not(col,'is',true)` = `col IS NOT TRUE`, que deixa passar false E
      // null. Evita de propósito dois `.or()` encadeados: em PostgREST cada um
      // vira um parâmetro separado, e se um sobrescrevesse o outro as ~91 contas
      // que só usam o app de membros entrariam na lista sem ninguém notar.
      // Filtro de privacidade não pode depender de comportamento ambíguo.
      .not('is_membro_only', 'is', true)
      .not('is_servico', 'is', true)
      .order('name');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Reuniões ministeriais ───────────────────────────────────────────────────
router.get('/reunioes', async (_req, res) => {
  try {
    const tipo = await tipoMinisterialId();
    if (!tipo) return res.json([]);
    const { data, error } = await supabase
      .from('governance_meetings')
      .select('id, date, status, ata, observacoes, participantes')
      .eq('type_id', tipo)
      .is('deleted_at', null)
      .order('date', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/reunioes/:id', async (req, res) => {
  try {
    const tipo = await tipoMinisterialId();
    const { data: reuniao, error } = await supabase
      .from('governance_meetings')
      .select('id, date, status, local, pauta, ata, deliberacoes, temas, participantes, observacoes')
      .eq('id', req.params.id)
      .eq('type_id', tipo)          // escopo: só Ministerial passa por aqui
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!reuniao) return res.status(404).json({ error: 'Reunião não encontrada' });

    const { data: tasks } = await supabase
      .from('governance_tasks')
      .select('*')
      .eq('meeting_id', reuniao.id)
      .order('sort_order', { ascending: true })
      .order('created_at');

    res.json({ ...reuniao, tasks: tasks || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Pendência: atribuir responsável, prazo e status ─────────────────────────
router.patch('/tarefas/:id', async (req, res) => {
  try {
    // ⚠️ CONFIRMA QUE A TAREFA É DE UMA REUNIÃO MINISTERIAL ANTES DE ESCREVER.
    // Sem esta checagem, este endpoint — aberto a todo colaborador — viraria
    // porta lateral para editar as tarefas do Conselho Consultivo e da
    // Diretoria, que o /api/governanca protege com nível 3. O id da tarefa é
    // fornecido pelo cliente; nunca confiar nele sozinho.
    const tipo = await tipoMinisterialId();
    const { data: tarefa } = await supabase
      .from('governance_tasks')
      .select('id, meeting_id, governance_meetings!inner(type_id, deleted_at)')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!tarefa || tarefa.governance_meetings?.type_id !== tipo
        || tarefa.governance_meetings?.deleted_at) {
      return res.status(404).json({ error: 'Pendência não encontrada' });
    }

    // Whitelist estreita: só o que esta tela edita. Aceitar o corpo inteiro
    // deixaria alguém reescrever título e vínculo da pendência.
    const b = req.body || {};
    const campos = {};
    if ('responsavel' in b) {
      const v = String(b.responsavel ?? '').trim();
      campos.responsavel = v || null;
    }
    if ('prazo' in b) {
      const v = String(b.prazo ?? '').trim();
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        return res.status(400).json({ error: 'prazo deve ser AAAA-MM-DD' });
      }
      campos.prazo = v || null;
    }
    if ('status' in b) {
      if (!STATUS_VALIDOS.includes(b.status)) {
        return res.status(400).json({ error: `status inválido. Use: ${STATUS_VALIDOS.join(', ')}` });
      }
      campos.status = b.status;
    }
    if (!Object.keys(campos).length) {
      return res.status(400).json({ error: 'nada para atualizar' });
    }

    const { data, error } = await supabase
      .from('governance_tasks')
      .update(campos)
      .eq('id', req.params.id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Pendência → tarefa pessoal ("Minhas Tarefas") ──────────────────────────
//
// ⚠️ POR QUE NÃO REUSAR POST /api/tarefas:
// aquele endpoint força `responsavel_id: req.user.userId` — a tarefa nasce
// sempre para QUEM CLICA. Numa ata isso inverteria o sentido: clicar na
// pendência da Milena criaria tarefa para o Matheus, e atribuir responsável
// viraria enfeite. Aqui a tarefa vai para o responsável da pendência.
router.post('/tarefas/:id/enviar', async (req, res) => {
  try {
    const tipo = await tipoMinisterialId();
    const { data: pend } = await supabase
      .from('governance_tasks')
      .select('id, titulo, responsavel, prazo, tarefa_pessoal_id, meeting_id, governance_meetings!inner(date, type_id, deleted_at)')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!pend || pend.governance_meetings?.type_id !== tipo
        || pend.governance_meetings?.deleted_at) {
      return res.status(404).json({ error: 'Pendência não encontrada' });
    }

    // Idempotente: o vínculo é a memória de que já foi enviada. Sem isto, cada
    // clique (ou cada duplo-clique) criaria uma tarefa nova.
    if (pend.tarefa_pessoal_id) {
      return res.json({ criada: false, tarefa_id: pend.tarefa_pessoal_id, motivo: 'ja_enviada' });
    }

    // O responsável é TEXTO na ata (pode ser "Milena / Mari", ou alguém sem
    // login). Casamos por nome; sem correspondência, a tarefa fica com quem
    // clicou — melhor do que recusar e deixar a pendência sem dono em lugar
    // nenhum. O corpo diz de quem era, para não perder a informação.
    let destinoId = req.user.userId;
    let destinoNome = req.user.name || null;
    const nomeNaAta = String(pend.responsavel || '').trim();

    if (nomeNaAta) {
      const { data: perfil } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('active', true)
        .not('is_membro_only', 'is', true)
        .ilike('name', nomeNaAta)
        .maybeSingle();
      if (perfil) { destinoId = perfil.id; destinoNome = perfil.name; }
    }

    const dataReuniao = pend.governance_meetings?.date || null;
    const dataBr = dataReuniao
      ? String(dataReuniao).slice(0, 10).split('-').reverse().join('/')
      : null;

    const descricao = [
      dataBr ? `Pendência da reunião ministerial de ${dataBr}.` : 'Pendência da reunião ministerial.',
      nomeNaAta && destinoNome !== nomeNaAta ? `Na ata, o responsável está como "${nomeNaAta}".` : null,
    ].filter(Boolean).join(' ');

    const { data: tarefa, error: errTarefa } = await supabase
      .from('tarefas_pessoais')
      .insert({
        titulo: String(pend.titulo || '').slice(0, 200),
        descricao,
        data: pend.prazo || null,
        responsavel_id: destinoId,
        responsavel_nome: destinoNome,
        created_by: req.user.userId,
        tipo: 'pessoal',
        status: 'a_fazer',
        prioridade: 'media',
        recorrencia: 'unica',
      })
      .select('id')
      .maybeSingle();
    if (errTarefa) throw errTarefa;

    const { error: errVinculo } = await supabase
      .from('governance_tasks')
      .update({ tarefa_pessoal_id: tarefa.id })
      .eq('id', pend.id);
    // Se o vínculo falhar, a tarefa já existe: apagar seria pior (a pessoa
    // perde o item). Devolvemos sucesso avisando que pode reaparecer o botão.
    if (errVinculo) {
      return res.json({ criada: true, tarefa_id: tarefa.id, vinculo: false, responsavel_nome: destinoNome });
    }

    res.json({ criada: true, tarefa_id: tarefa.id, vinculo: true, responsavel_nome: destinoNome });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
