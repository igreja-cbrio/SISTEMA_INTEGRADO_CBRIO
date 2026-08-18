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

// ── Geração automática da ata (cron) ───────────────────────────────────────
//
// Declarado ANTES do `authenticate` global: quem chama é o GitHub Actions com
// x-cron-secret, não um usuário logado. Se ficasse depois, o guard responderia
// 401 antes do handler e o cron falharia em silêncio toda segunda.
//
// Horário: segunda 15h SP. A reunião termina ~12h20 e a gravação do Plaud só
// fica pronta ~1h30 depois (medido: 3 reuniões, 1h29 a 1h50). Às 15h há folga.
const { isAuthorizedCron } = require('../utils/cronAuth');
const { gerarAtasPendentes } = require('../services/ataGenerator');

async function gerarPendentes(req, res) {
  if (!isAuthorizedCron(req)) return res.status(401).json({ error: 'unauthorized' });
  try {
    const limite = Math.min(5, Math.max(1, Number(req.query.limite) || 2));
    res.json(await gerarAtasPendentes({ limite }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
router.get('/cron/gerar', gerarPendentes);
router.post('/cron/gerar', gerarPendentes);

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
    // ⚠️ Lê a VIEW, não a tabela `profiles`.
    // Um filtro ingênuo em profiles (`is_membro_only is not true`) deixava
    // passar quem preencheu o formulário público de membresia no passado — elas
    // têm login, porque o app de membros e o ERP compartilham o Supabase Auth.
    // Quem separa é o CARGO ('membro', 'voluntario*', quiosque, acesso negado),
    // com resgate por ÁREA. A regra inteira, e o porquê de cada exceção, mora
    // na migration de `vw_colaboradores` — um lugar só, para toda lista de
    // responsável do sistema dizer a mesma coisa.
    const { data, error } = await supabase
      .from('vw_colaboradores')
      .select('id, name, email, avatar_url, area')
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
    // ⚠️ Aceita as DUAS formas de propósito. `responsaveis` (array) é a nova
    // fonte da verdade; `responsavel` (texto) continua sendo aceito porque,
    // durante a janela de deploy, o frontend antigo ainda está no navegador de
    // quem estava com a tela aberta e é ele quem manda esse campo.
    if ('responsaveis' in b) {
      const lista = Array.isArray(b.responsaveis)
        ? [...new Set(b.responsaveis.map((x) => String(x ?? '').trim()).filter(Boolean))]
        : [];
      campos.responsaveis = lista.length ? lista : null;
      // Espelho para o módulo de governança, que lê a coluna antiga.
      campos.responsavel = lista.length ? lista.join(', ') : null;
    } else if ('responsavel' in b) {
      const v = String(b.responsavel ?? '').trim();
      campos.responsavel = v || null;
      campos.responsaveis = v ? [v] : null;
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
      .select('id, titulo, responsavel, responsaveis, prazo, tarefa_pessoal_id, tarefas_pessoais_ids, meeting_id, governance_meetings!inner(date, type_id, deleted_at)')
      .eq('id', req.params.id)
      .maybeSingle();

    if (!pend || pend.governance_meetings?.type_id !== tipo
        || pend.governance_meetings?.deleted_at) {
      return res.status(404).json({ error: 'Pendência não encontrada' });
    }

    // Idempotente pelo vínculo: sem ele, cada clique (ou duplo-clique) criaria
    // tarefas novas e a tela não saberia mostrar "já enviada".
    const jaEnviadas = pend.tarefas_pessoais_ids?.length
      ? pend.tarefas_pessoais_ids
      : (pend.tarefa_pessoal_id ? [pend.tarefa_pessoal_id] : []);
    if (jaEnviadas.length) {
      return res.json({ criada: false, tarefas_ids: jaEnviadas, motivo: 'ja_enviada' });
    }

    // Nomes na ata são TEXTO (podem ser "Milena / Mari", ou gente sem login).
    const nomes = pend.responsaveis?.length
      ? pend.responsaveis
      : (String(pend.responsavel || '').trim() ? [String(pend.responsavel).trim()] : []);

    // Uma tarefa POR responsável: se três pessoas tocam a pendência, cada uma
    // precisa dela no próprio Minhas Tarefas — uma tarefa compartilhada que
    // aparece só para um vira tarefa de ninguém.
    const destinos = [];
    for (const nome of nomes) {
      const { data: perfil } = await supabase
        .from('profiles').select('id, name')
        .eq('active', true).not('is_membro_only', 'is', true)
        .ilike('name', nome).maybeSingle();
      if (perfil) destinos.push({ id: perfil.id, nome: perfil.name, daAta: nome });
    }

    // Nenhum nome casou com um login (ou não havia nome): fica com quem clicou,
    // e a descrição registra de quem era na ata — melhor do que recusar e
    // deixar a pendência sem dono em lugar nenhum.
    const semCorrespondencia = !destinos.length;
    if (semCorrespondencia) {
      destinos.push({ id: req.user.userId, nome: req.user.name || null, daAta: nomes.join(', ') || null });
    }

    const dataReuniao = pend.governance_meetings?.date || null;
    const dataBr = dataReuniao
      ? String(dataReuniao).slice(0, 10).split('-').reverse().join('/')
      : null;

    const linhas = destinos.map((d) => ({
      titulo: String(pend.titulo || '').slice(0, 200),
      descricao: [
        dataBr ? `Pendência da reunião ministerial de ${dataBr}.` : 'Pendência da reunião ministerial.',
        d.daAta && d.nome !== d.daAta ? `Na ata, o responsável está como "${d.daAta}".` : null,
        nomes.length > 1 ? `Compartilhada com: ${nomes.join(', ')}.` : null,
        d.id !== req.user.userId && req.user.name ? `Enviada por ${req.user.name}.` : null,
      ].filter(Boolean).join(' '),
      data: pend.prazo || null,
      responsavel_id: d.id,
      responsavel_nome: d.nome,
      // ⚠️ created_by = O DESTINATÁRIO, não quem clicou.
      // O módulo Minhas Tarefas declara "privacidade estrita: TODA operação é
      // escopada em created_by" — GET, PUT e DELETE, os três. Ali essa coluna é
      // usada como DONO DA LISTA, não como autor. Gravando quem clicou, a
      // tarefa não aparecia para ninguém: nem para o destinatário (não é o
      // created_by) nem de forma útil para o remetente. Aconteceu de verdade
      // com 9 tarefas em 18/08/2026.
      // Quem enviou fica registrado na descrição, para a informação não sumir.
      created_by: d.id,
      tipo: 'pessoal',
      status: 'a_fazer',
      prioridade: 'media',
      recorrencia: 'unica',
    }));

    const { data: criadas, error: errTarefa } = await supabase
      .from('tarefas_pessoais').insert(linhas).select('id');
    if (errTarefa) throw errTarefa;

    const ids = (criadas || []).map((t) => t.id);
    const { error: errVinculo } = await supabase
      .from('governance_tasks')
      .update({
        tarefas_pessoais_ids: ids,
        // Espelho da coluna antiga: o frontend no ar durante a janela de deploy
        // ainda lê ela para decidir se mostra o botão.
        tarefa_pessoal_id: ids[0] || null,
      })
      .eq('id', pend.id);

    // Se o vínculo falhar, as tarefas já existem: apagá-las seria pior (a
    // pessoa perde o item). Devolvemos sucesso avisando que o botão pode voltar.
    res.json({
      criada: true,
      tarefas_ids: ids,
      vinculo: !errVinculo,
      responsaveis: destinos.map((d) => d.nome).filter(Boolean),
      sem_correspondencia: semCorrespondencia,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Disparo manual da geração (botão na tela). Mesma função do cron.
router.post('/gerar', async (req, res) => {
  try {
    const limite = Math.min(5, Math.max(1, Number(req.body?.limite) || 1));
    res.json(await gerarAtasPendentes({ limite }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
