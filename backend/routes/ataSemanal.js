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

module.exports = router;
