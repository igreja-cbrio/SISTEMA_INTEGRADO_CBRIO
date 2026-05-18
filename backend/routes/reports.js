const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const storage = require('../services/storageService');
const { AgentService } = require('../services/agentService');

const { extractText } = require('../services/textExtractor');

router.use(authenticate);

// Tool schema usado pra structured output. Forçar o modelo a preencher esse
// schema elimina o parsing fragil por regex no reportGenerator.js — todos os
// campos vêm tipados e nomeados, mesmo se o modelo mudar o estilo do markdown.
const REPORT_TOOL = {
  name: 'submit_report',
  description: 'Envia o relatório estruturado do evento em seções fixas. Todos os campos são markdown.',
  input_schema: {
    type: 'object',
    required: ['resumo_executivo', 'pontos_atencao', 'recomendacoes'],
    properties: {
      resumo_executivo: { type: 'string', description: 'Visão geral do evento: o que foi entregue e o que falta. 2-4 parágrafos.' },
      progresso_por_fase: { type: 'string', description: 'Markdown listando cada fase com total/concluído/pendente/%. Vazio se não houver dados.' },
      entregas_por_area: { type: 'string', description: 'O que cada área entregou, quem concluiu e quando. Markdown com bullets/seções por área.' },
      cards_pendentes: { type: 'string', description: 'Lista de cards não concluídos agrupados por fase/área, com impacto no evento.' },
      observacoes_responsaveis: { type: 'string', description: 'Observações relevantes dos responsáveis nas conclusões.' },
      pontos_atencao: { type: 'string', description: 'Gaps, atrasos, faltantes ou problemas identificados.' },
      recomendacoes: { type: 'string', description: 'Próximos passos sugeridos pra resolver as pendências a tempo.' },
    },
  },
};

// Tool reusado por cada chamada de seção (geração progressiva).
const SECTION_TOOL = {
  name: 'submit_section',
  description: 'Envia o conteúdo markdown da seção solicitada do relatório.',
  input_schema: {
    type: 'object',
    required: ['content'],
    properties: {
      content: {
        type: 'string',
        description: 'Markdown da seção. Use bullets, headings (##), negrito (**) apenas pra realce real. Tom profissional, conciso, acionável. NUNCA invente dados ausentes.',
      },
    },
  },
};

// Tool dedicada pro corpo de e-mail curto. Texto plano, sem markdown.
const EMAIL_BODY_TOOL = {
  name: 'submit_email_body',
  description: 'Envia o corpo curto (3-5 linhas) que o usuário vai copiar e colar no e-mail ao enviar o relatório.',
  input_schema: {
    type: 'object',
    required: ['body'],
    properties: {
      body: {
        type: 'string',
        description: 'Corpo do e-mail em TEXTO PLANO (sem markdown, sem ##, sem **). 3-5 linhas curtas. SEM saudação inicial ("Olá", "Prezados"). SEM assinatura. SEM "Segue em anexo" (já é óbvio). Foque no que importa: o que o relatório aborda, 1-2 destaques operacionais, 1 ponto crítico se houver, próximo passo se óbvio. Voz humana, acionável.',
      },
    },
  },
};

// Gera corpo de e-mail a partir do markdown completo do relatório.
// Usado pelo /finalize, pelo /report sync e pelo endpoint /email-summary.
// É best-effort: se falhar, retorna null e quem chamou decide se loga ou
// continua. Não derruba o fluxo principal.
async function generateEmailSummary({ userId, eventName, scope, content }) {
  if (!content || !content.trim()) return null;
  try {
    const agent = await AgentService.createRun('event_report_email', userId, { mode: 'email-summary' });
    const result = await agent.call({
      model: 'claude-haiku-4-5-20251001',
      system: `Você é assistente operacional da Igreja Comunidade Batista do Rio de Janeiro (CBRio).
Sua tarefa: gerar o CORPO de um e-mail curto que o destinatário vai usar pra enviar este relatório anexo.

REGRAS:
- 3 a 5 linhas em texto plano (sem markdown).
- SEM saudação inicial ("Olá [nome]", "Prezados") — o usuário customiza.
- SEM assinatura ou "Atenciosamente" — idem.
- SEM "segue em anexo" ou "abaixo" — é redundante.
- Foque em: o que o relatório aborda + 1-2 destaques + ponto de atenção crítico + próximo passo (se óbvio).
- Voz humana e direta. Evite jargão.
- Baseie-se SÓ no relatório fornecido. NUNCA invente dados.

Use a ferramenta submit_email_body.`,
      messages: [{
        role: 'user',
        content: `Evento: ${eventName}\nEscopo: ${scope}\n\n--- RELATÓRIO COMPLETO ---\n${content}`,
      }],
      tools: [EMAIL_BODY_TOOL],
      toolChoice: { type: 'tool', name: 'submit_email_body' },
      maxTokens: 512,
      role: 'email-summary',
    });
    await agent.complete('Corpo de e-mail gerado');
    const tc = (result.toolCalls || []).find(c => c.name === 'submit_email_body');
    return tc?.input?.body || null;
  } catch (e) {
    console.error('[Reports] generateEmailSummary:', e.message);
    return null;
  }
}

// Plano fixo das 7 seções. Cada uma usa Haiku (rápido + barato) com prompt
// focado e SÓ a fatia relevante do snapshot (menor contexto = mais rápido).
// "synthesis: true" indica que a seção sintetiza outras (gerada por último).
const SECTION_PLAN = [
  { name: 'resumo_executivo',         title: 'Resumo Executivo' },
  { name: 'progresso_por_fase',       title: 'Progresso por Fase' },
  { name: 'entregas_por_area',        title: 'Entregas por Área' },
  { name: 'cards_pendentes',          title: 'Cards Pendentes' },
  { name: 'observacoes_responsaveis', title: 'Observações dos Responsáveis' },
  { name: 'pontos_atencao',           title: 'Pontos de Atenção', synthesis: true },
  { name: 'recomendacoes',            title: 'Recomendações',     synthesis: true },
];

// Renderiza o JSON estruturado pra markdown (compatível com o storage atual
// em event_reports.content e com o reportGenerator que extrai por regex).
function structuredToMarkdown(j) {
  const sec = (title, body) => body && body.trim() ? `## ${title}\n\n${body.trim()}\n\n` : '';
  return (
    sec('Resumo Executivo', j.resumo_executivo) +
    sec('Progresso por Fase', j.progresso_por_fase) +
    sec('Entregas por Área', j.entregas_por_area) +
    sec('Cards Pendentes', j.cards_pendentes) +
    sec('Observações dos Responsáveis', j.observacoes_responsaveis) +
    sec('Pontos de Atenção', j.pontos_atencao) +
    sec('Recomendações', j.recomendacoes)
  ).trim();
}

// Carrega o snapshot completo dos dados do evento. Usado tanto pela rota
// síncrona quanto pelo /report/start. Retornar tudo aqui garante que TODAS
// as 7 seções (geradas em momentos diferentes) usem exatamente o mesmo input.
async function loadInputSnapshot(eventId, type, phase_name, since_days) {
  const sinceN = parseInt(since_days, 10);
  const hasDateFilter = Number.isFinite(sinceN) && sinceN > 0;
  const sinceIso = hasDateFilter ? new Date(Date.now() - sinceN * 86400000).toISOString() : null;

  const { data: event } = await supabase.from('events').select('name, date, status, description, updated_at').eq('id', eventId).single();
  if (!event) return { error: 'Evento não encontrado' };
  const isFinalizedEvent = event.status === 'concluido';

  let q = supabase.from('event_task_attachments').select('*').eq('event_id', eventId);
  if (type === 'phase' && phase_name) q = q.eq('phase_name', phase_name);
  if (hasDateFilter) q = q.gte('created_at', sinceIso);
  const { data: attachs } = await q.order('created_at');

  let compQ = supabase.from('card_completions').select('*').eq('event_id', eventId).is('reopened_at', null);
  if (type === 'phase' && phase_name) {
    const { data: phaseRow } = await supabase.from('event_cycle_phases')
      .select('numero_fase').eq('event_id', eventId).eq('nome_fase', phase_name).limit(1).maybeSingle();
    if (phaseRow) compQ = compQ.eq('phase_number', phaseRow.numero_fase);
  }
  if (hasDateFilter) compQ = compQ.gte('completed_at', sinceIso);
  const { data: completions } = await compQ.order('completed_at');

  let progressQ = supabase.from('vw_phase_progress').select('*').eq('event_id', eventId);
  if (type === 'phase' && phase_name) progressQ = progressQ.eq('nome_fase', phase_name);
  const { data: progress } = await progressQ.order('phase_number');

  let pendingQ = supabase.from('cycle_phase_tasks')
    .select('titulo, area, status, responsavel_nome, event_phase_id, closed_with_event_at, prazo')
    .eq('event_id', eventId)
    .neq('status', 'concluida');
  if (type === 'phase' && phase_name) {
    const { data: phaseRow } = await supabase.from('event_cycle_phases')
      .select('id').eq('event_id', eventId).eq('nome_fase', phase_name).limit(1).maybeSingle();
    if (phaseRow) pendingQ = pendingQ.eq('event_phase_id', phaseRow.id);
  }
  const { data: pendingTasks } = await pendingQ;

  // Tarefas event_tasks (do "kanban simples") em aberto, também listadas
  // pra termos visão completa do que ficou pra trás.
  let pendingEvQ = supabase.from('event_tasks')
    .select('name, area, status, responsible, closed_with_event_at, deadline')
    .eq('event_id', eventId)
    .neq('status', 'concluida');
  const { data: pendingEventTasks } = await pendingEvQ;

  // Pra evento finalizado: separa as tarefas marcadas como "fechadas com
  // evento". Essas são as que vão alimentar o Haiku pra destacar "o evento
  // foi finalizado sem a conclusão de X, Y, Z" como o Marcos pediu.
  const closedWithEvent = isFinalizedEvent ? [
    ...(pendingTasks || []).filter(t => t.closed_with_event_at).map(t => ({
      titulo: t.titulo, area: t.area, status_real: t.status, prazo: t.prazo,
      responsavel: t.responsavel_nome, origem: 'ciclo',
    })),
    ...(pendingEventTasks || []).filter(t => t.closed_with_event_at).map(t => ({
      titulo: t.name, area: t.area, status_real: t.status, prazo: t.deadline,
      responsavel: t.responsible, origem: 'evento',
    })),
  ] : [];

  if ((!attachs || attachs.length === 0) && (!completions || completions.length === 0) && (!pendingTasks || pendingTasks.length === 0) && closedWithEvent.length === 0) {
    return { error: 'Nenhum dado encontrado para gerar relatório.' };
  }

  // Extrai conteúdo dos arquivos (paraleliza fallbacks pra arquivos sem digest)
  const fileContents = await Promise.all((attachs || []).map(async (a) => {
    let text = '';
    if (a.file_digest) {
      text = a.file_digest;
    } else if (a.supabase_path || a.sharepoint_item_id) {
      try {
        const buffer = await storage.downloadFile(a.supabase_path, a.sharepoint_item_id);
        text = await extractText(buffer, a.file_type, a.file_name);
      } catch (e) {
        text = `[Erro ao ler ${a.file_name}: ${e.message}]`;
      }
    }
    return {
      file_name: a.file_name,
      area: a.area || 'não especificada',
      phase: a.phase_name || 'geral',
      description: a.description || '',
      uploaded_by: a.uploaded_by_name || 'desconhecido',
      content: text,
    };
  }));

  const totalCards = (progress || []).reduce((s, p) => s + (p.total_cards || 0), 0);
  const totalConcluidos = (progress || []).reduce((s, p) => s + (p.cards_concluidos || 0), 0);
  const totalPendentes = totalCards - totalConcluidos;
  const pctGeral = totalCards > 0 ? Math.round(totalConcluidos / totalCards * 100) : 0;

  return {
    eventName: event.name,
    eventDate: event.date || null,
    scope: type === 'phase' ? `Fase: ${phase_name}` : 'Evento Completo',
    type,
    phase_name: phase_name || null,
    since_days: sinceN || null,
    isFinalizedEvent,
    eventFinalizedAt: isFinalizedEvent ? event.updated_at : null,
    totals: {
      cards: totalCards,
      concluidos: totalConcluidos,
      pendentes: totalPendentes,
      pct: pctGeral,
      anexos: attachs?.length || 0,
      closed_with_event: closedWithEvent.length,
    },
    progress: progress || [],
    pendingTasks: pendingTasks || [],
    closedWithEvent,
    fileContents,
    completions: completions || [],
  };
}

// Lista de tarefas que ficaram em aberto quando o evento foi finalizado.
// Usado pelo Haiku pra destacar "evento foi finalizado sem conclusão de X, Y, Z".
function formatClosedWithEvent(items) {
  if (!items?.length) return '(nenhuma)';
  return items.map(t =>
    `- "${t.titulo}" | Área: ${t.area || 'não definida'} | Status real: ${t.status_real || 'não definido'} | Responsável: ${t.responsavel || 'não atribuído'}${t.prazo ? ` | Prazo era: ${t.prazo}` : ''} (origem: ${t.origem})`
  ).join('\n');
}

// Formata um pedaço do snapshot pra texto que vai dentro do prompt da seção.
function formatProgress(progress) {
  if (!progress?.length) return '(sem dados de progresso)';
  return progress.map(p =>
    `- Fase ${p.phase_number} "${p.nome_fase}" | Área: ${p.area} | ${p.cards_concluidos}/${p.total_cards} concluídos (${p.pct_concluido}%)${p.cards_bloqueados > 0 ? ` | ${p.cards_bloqueados} bloqueado(s)` : ''}`
  ).join('\n');
}
function formatPending(pending) {
  if (!pending?.length) return '(sem pendências)';
  return pending.map(t =>
    `- "${t.titulo}" | Área: ${t.area || 'não definida'} | Status: ${t.status} | Responsável: ${t.responsavel_nome || 'não atribuído'}`
  ).join('\n');
}
function formatCompletions(completions) {
  if (!completions?.length) return '(sem conclusões registradas)';
  return completions.map(c =>
    `- "${c.card_titulo}" | Área: ${c.area} | Fase: ${c.phase_number} | Por: ${c.completed_by_name || 'desconhecido'} em ${new Date(c.completed_at).toLocaleDateString('pt-BR')}${c.observacao ? ` | Obs: "${c.observacao}"` : ''}${c.file_name ? ` | Arquivo: ${c.file_name}` : ''}`
  ).join('\n');
}
function formatFiles(files) {
  if (!files?.length) return '(sem arquivos anexados)';
  return files.map((f, i) =>
    `--- Arquivo ${i + 1}: ${f.file_name} ---\nÁrea: ${f.area}\nFase: ${f.phase}\nDescrição: ${f.description}\nEnviado por: ${f.uploaded_by}\n\nConteúdo:\n${f.content}\n`
  ).join('\n');
}

// Constrói o prompt focado de UMA seção. Recebe input_data (snapshot) +
// sectionName + opcionalmente outras seções já geradas (pra synthesis).
function buildSectionPrompt(sectionName, input, otherSections = {}) {
  const finalizedLine = input.isFinalizedEvent
    ? `Status do evento: FINALIZADO em ${input.eventFinalizedAt ? new Date(input.eventFinalizedAt).toLocaleDateString('pt-BR') : 'data desconhecida'}.${input.totals.closed_with_event > 0 ? ` ${input.totals.closed_with_event} tarefa(s) ficaram em aberto no momento do finalize.` : ''}`
    : `Status do evento: em andamento.`;

  const ctx = `### CONTEXTO DO EVENTO
Evento: ${input.eventName}
Data: ${input.eventDate || 'não definida'}
Escopo: ${input.scope}${input.since_days ? ` · últimos ${input.since_days} dias` : ''}
${finalizedLine}
Cards: ${input.totals.cards} total / ${input.totals.concluidos} concluídos (${input.totals.pct}%) / ${input.totals.pendentes} pendentes
Anexos: ${input.totals.anexos}`;

  const system = `Você é um analista de eventos da Igreja Comunidade Batista do Rio de Janeiro (CBRio).
Sua tarefa AGORA é gerar APENAS a seção solicitada do relatório operacional, em markdown.
Use a ferramenta submit_section pra entregar.

REGRAS DURAS:
- Baseie-se SOMENTE nos dados fornecidos. NUNCA invente nomes, datas, observações.
- Se a seção não tem dados pra preencher de forma útil, retorne uma única linha tipo "_Sem dados disponíveis para esta seção._"
- Use markdown limpo: ## subtítulos, - bullets, **negrito** apenas pra realce real.
- Tom profissional, conciso, acionável. NÃO repita o título da seção dentro do conteúdo.
${input.isFinalizedEvent ? `- EVENTO ESTÁ FINALIZADO. Use tempo PASSADO ("foi entregue", "ficou pendente"). NÃO sugira ações pra "destravar antes do evento" — o evento já acabou. Recomendações devem ser pro PRÓXIMO ciclo similar (aprendizado).` : ''}`;

  let task = '';
  let data = '';

  // Pra evento finalizado, todas as seções recebem a lista de tarefas que
  // ficaram em aberto no finalize. Cada seção decide se usa ou não.
  const closedBlock = input.isFinalizedEvent && input.closedWithEvent?.length
    ? `\n\nTAREFAS QUE FICARAM EM ABERTO QUANDO O EVENTO FOI FINALIZADO (status real não foi concluida):\n${formatClosedWithEvent(input.closedWithEvent)}`
    : '';

  switch (sectionName) {
    case 'resumo_executivo':
      task = input.isFinalizedEvent
        ? `Gere o RESUMO EXECUTIVO de um evento que JÁ ACONTECEU. 2-4 parágrafos contando: o que foi entregue, o que ficou em aberto, qual a leitura geral. Mencione explicitamente se houve tarefas que ficaram pendentes no fechamento. Use tempo passado.`
        : `Gere o RESUMO EXECUTIVO em 2-4 parágrafos: o estado geral do evento — o que foi entregue, o que ainda falta, status global, qual o sentimento geral. Sem listas, prosa corrida.`;
      data = `PROGRESSO POR FASE:\n${formatProgress(input.progress)}\n\nPENDÊNCIAS:\n${formatPending(input.pendingTasks)}${closedBlock}`;
      break;
    case 'progresso_por_fase':
      // A tabela formal vem do template HTML (determinística, vw_phase_progress).
      // Aqui o Haiku só gera NARRATIVA CURTA (2-4 frases) sobre o ritmo geral.
      // Antes ele inventava números na tabela markdown — agora não tem mais
      // como inventar porque não pedimos pra ele tabular.
      task = `Gere uma NARRATIVA CURTA (2-4 frases) sobre o ritmo geral de execução do ciclo: quais fases estão andando, quais travaram, ritmo aceitável ou preocupante. NÃO faça tabela, NÃO repita números (a tabela é mostrada no template separadamente). Foco em análise qualitativa.`;
      data = `PROGRESSO POR FASE:\n${formatProgress(input.progress)}`;
      break;
    case 'entregas_por_area':
      task = `Gere a seção ENTREGAS POR ÁREA: agrupe por área (marketing, produção, adm, etc.) o que cada uma entregou, quem concluiu, quando. Inclua os arquivos anexados relevantes.`;
      data = `CONCLUSÕES:\n${formatCompletions(input.completions)}\n\nARQUIVOS ANEXADOS:\n${formatFiles(input.fileContents)}`;
      break;
    case 'cards_pendentes':
      task = input.isFinalizedEvent
        ? `Gere a seção "FICOU EM ABERTO": lista as tarefas que não foram concluídas e o evento foi finalizado mesmo assim. Agrupe por área. Pra cada uma, mencione o responsável e prazo. Esta lista é prestação de contas — não esquecer dos responsáveis que ficaram com tarefas inacabadas.`
        : `Gere a seção CARDS PENDENTES: lista os cards não concluídos agrupados por fase/área. Pra cada um, avalie em 1 frase o impacto da pendência no evento.`;
      data = input.isFinalizedEvent
        ? `TAREFAS FECHADAS COM EVENTO (não concluídas pelo responsável):\n${formatClosedWithEvent(input.closedWithEvent)}\n\nPENDÊNCIAS RESTANTES NO CICLO:\n${formatPending(input.pendingTasks)}`
        : `PENDÊNCIAS:\n${formatPending(input.pendingTasks)}\n\nPROGRESSO POR FASE (contexto):\n${formatProgress(input.progress)}`;
      break;
    case 'observacoes_responsaveis':
      task = `Gere a seção OBSERVAÇÕES DOS RESPONSÁVEIS: extraia das conclusões SÓ as que têm observação preenchida. Destaque insights, alertas e contexto que os responsáveis deixaram. Se não houver observações, escreva apenas uma linha indicando.`;
      data = `CONCLUSÕES COM OBSERVAÇÃO:\n${formatCompletions((input.completions || []).filter(c => c.observacao))}`;
      break;
    case 'pontos_atencao':
      task = input.isFinalizedEvent
        ? `Gere a seção PONTOS DE ATENÇÃO de evento FINALIZADO. Destaque EXPLICITAMENTE: "O evento foi finalizado sem a conclusão das tarefas: [liste por nome]". Aponte também áreas que ficaram para trás, responsáveis com tarefas em aberto, padrões problemáticos. Esta seção é o registro pro time não esquecer o que ficou pra trás.`
        : `Gere a seção PONTOS DE ATENÇÃO: gaps, atrasos, áreas que não entregaram, riscos identificados a partir das pendências e do histórico. Seja específico e acionável. Não duplique a lista de cards_pendentes (essa seção já existe) — aqui é análise, não listagem.`;
      data = `PENDÊNCIAS:\n${formatPending(input.pendingTasks)}\n\nPROGRESSO:\n${formatProgress(input.progress)}${closedBlock}\n\nSEÇÕES JÁ GERADAS (use como contexto, NÃO repita):\n${otherSections.cards_pendentes ? `--- cards_pendentes ---\n${otherSections.cards_pendentes}\n` : ''}${otherSections.entregas_por_area ? `--- entregas_por_area ---\n${otherSections.entregas_por_area}\n` : ''}`;
      break;
    case 'recomendacoes':
      task = input.isFinalizedEvent
        ? `Gere RECOMENDAÇÕES como aprendizado pra próximas edições deste evento (já que ele finalizou). Foque em padrões: áreas que precisam de mais antecedência, processos que falharam, melhorias pro próximo ciclo. NÃO sugira "destravar pendências antes do evento" — já acabou.`
        : `Gere a seção RECOMENDAÇÕES: próximos passos concretos pra destravar pendências antes do evento. Priorize por impacto. Bullets com ação + responsável sugerido + prazo recomendado quando fizer sentido.`;
      data = `PENDÊNCIAS:\n${formatPending(input.pendingTasks)}\n\nPONTOS DE ATENÇÃO JÁ IDENTIFICADOS (use como contexto):\n${otherSections.pontos_atencao || '(ainda não gerado)'}${closedBlock}`;
      break;
    default:
      throw new Error(`Seção desconhecida: ${sectionName}`);
  }

  return {
    system,
    userMessage: `${ctx}\n\n### TAREFA\n${task}\n\n### DADOS\n${data}`,
  };
}

// POST /api/events/:eventId/report — geração SÍNCRONA (legacy/fallback).
// Mantida pra integrações externas. Frontend novo usa /start + /section +
// /finalize (geração progressiva, contorna timeout de 60s do Vercel).
router.post('/:eventId/report', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { type = 'full', phase_name, since_days } = req.body;

    const input = await loadInputSnapshot(eventId, type, phase_name, since_days);
    if (input.error) return res.status(input.error === 'Evento não encontrado' ? 404 : 400).json({ error: input.error });

    const SYSTEM_STATIC = `Você é um analista de eventos da Igreja Comunidade Batista do Rio de Janeiro (CBRio).
Sua tarefa é gerar um relatório operacional estruturado em seções fixas. Use submit_report com markdown em cada campo.

REGRAS: Baseie-se APENAS nos dados fornecidos. NUNCA invente. Seções sem dados ficam string vazia.
Markdown limpo, ## subtítulos, - bullets, **negrito** apenas pra realce real.

${input.isFinalizedEvent ? `EVENTO ESTÁ FINALIZADO. Use tempo passado. Em pontos_atencao destaque EXPLICITAMENTE "O evento foi finalizado sem a conclusão das tarefas: [liste]". Recomendações são pro PRÓXIMO ciclo similar — não pra destravar antes do evento (já acabou).` : ''}`;

    const finalizedLine = input.isFinalizedEvent
      ? `Status: FINALIZADO em ${input.eventFinalizedAt ? new Date(input.eventFinalizedAt).toLocaleDateString('pt-BR') : 'data desconhecida'}.${input.totals.closed_with_event > 0 ? ` ${input.totals.closed_with_event} tarefa(s) ficaram em aberto no fechamento.` : ''}`
      : `Status: em andamento.`;

    const dynamicHeader = `### CONTEXTO
Evento: ${input.eventName}
Data: ${input.eventDate || 'não definida'}
Escopo: ${input.scope}${input.since_days ? ` · últimos ${input.since_days} dias` : ''}
${finalizedLine}
Cards: ${input.totals.cards} total / ${input.totals.concluidos} concluídos (${input.totals.pct}%) / ${input.totals.pendentes} pendentes
Anexos: ${input.totals.anexos}`;

    const closedBlock = input.isFinalizedEvent && input.closedWithEvent?.length
      ? `\n\n=== TAREFAS QUE FICARAM EM ABERTO NO FECHAMENTO DO EVENTO ===\n${formatClosedWithEvent(input.closedWithEvent)}`
      : '';

    const userMessage =
      `=== PROGRESSO POR FASE/ÁREA ===\n${formatProgress(input.progress)}\n\n` +
      `=== CARDS PENDENTES ===\n${formatPending(input.pendingTasks)}\n\n` +
      `=== CONCLUSÕES DE CARDS ===\n${formatCompletions(input.completions)}\n\n` +
      `=== ARQUIVOS ANEXADOS ===\n${formatFiles(input.fileContents)}` +
      closedBlock;

    const useHaiku = type === 'phase' && userMessage.length < 80000;
    const model = useHaiku ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-20250514';
    const maxTokens = useHaiku ? 2048 : 4096;

    const agent = await AgentService.createRun('event_report', req.user.userId, { eventId, type, phase_name, model, since_days: input.since_days, mode: 'sync' });
    const result = await agent.call({
      model,
      system: [
        { type: 'text', text: SYSTEM_STATIC, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: dynamicHeader },
      ],
      messages: [{ role: 'user', content: userMessage }],
      tools: [REPORT_TOOL],
      toolChoice: { type: 'tool', name: 'submit_report' },
      maxTokens,
      role: 'report',
    });
    await agent.complete('Relatório gerado');

    let reportContent = '';
    const toolCall = (result.toolCalls || []).find(c => c.name === 'submit_report');
    if (toolCall?.input) reportContent = structuredToMarkdown(toolCall.input);
    else reportContent = result.text || 'Não foi possível gerar o relatório.';

    // Gera corpo de e-mail (best-effort, sem derrubar o relatório se falhar)
    const emailSummary = await generateEmailSummary({
      userId: req.user.userId,
      eventName: input.eventName,
      scope: input.scope,
      content: reportContent,
    });

    const { data: report, error } = await supabase.from('event_reports').insert({
      event_id: eventId,
      phase_name: type === 'phase' ? phase_name : null,
      report_type: type,
      content: reportContent,
      email_summary: emailSummary,
      generated_by: req.user.userId,
      attachments_count: input.totals.anexos,
      token_cost: agent.totalCost,
      status: 'ready',
      finished_at: new Date().toISOString(),
    }).select().single();
    if (error) throw error;

    res.json(report);
  } catch (e) {
    console.error('[Reports] Generate (sync):', e.message);
    res.status(500).json({ error: e.message || 'Erro ao gerar relatório' });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// GERAÇÃO PROGRESSIVA — 3 endpoints (start, section, finalize)
// ─────────────────────────────────────────────────────────────────────────
//
// Por que: Vercel Hobby = 60s de timeout. Sonnet com 4096 tokens output em
// evento grande às vezes passa disso. Solução: quebrar em 7 chamadas Haiku
// (~5-15s cada) em vez de 1 Sonnet de ~60-80s. Frontend orquestra. Bônus:
// custo cai, UX vê progresso por seção, retry é granular.
//
// Garantias de confiança:
// 1. Snapshot de input congelado no /start → todas as 7 chamadas usam os
//    MESMOS dados, mesmo se entregas forem adicionadas durante a geração.
// 2. Idempotência por seção: /section sem ?force=1 retorna cache se já gerada.
// 3. Resume: cliente que reabriu o modal vê pelas chaves de event_reports.sections
//    o que já existe e continua de onde parou.
// 4. Retry granular: 1 seção falha → cliente refaz só ela com ?force=1.
// 5. Atomicidade: cada seção é UPDATE jsonb_set atomico, sem race de overwrite.

// POST /:eventId/report/start — cria o registro com status='pending' e o
// snapshot dos dados. Retorna { id, sections: [...nomes...] }.
router.post('/:eventId/report/start', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { type = 'full', phase_name, since_days } = req.body;

    const input = await loadInputSnapshot(eventId, type, phase_name, since_days);
    if (input.error) return res.status(input.error === 'Evento não encontrado' ? 404 : 400).json({ error: input.error });

    const { data: row, error } = await supabase.from('event_reports').insert({
      event_id: eventId,
      phase_name: type === 'phase' ? phase_name : null,
      report_type: type,
      content: '',
      generated_by: req.user.userId,
      attachments_count: input.totals.anexos,
      token_cost: 0,
      status: 'pending',
      input_data: input,
      sections: {},
      section_errors: {},
      started_at: new Date().toISOString(),
    }).select().single();
    if (error) throw error;

    res.json({
      id: row.id,
      event_id: eventId,
      status: row.status,
      sections_plan: SECTION_PLAN,
      input_summary: {
        event: input.eventName,
        scope: input.scope,
        since_days: input.since_days,
        totals: input.totals,
      },
    });
  } catch (e) {
    console.error('[Reports] Start:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao iniciar relatório' });
  }
});

// POST /:eventId/report/:reportId/section
// body: { section: 'resumo_executivo' }, query: ?force=1 pra forçar regen
// Gera UMA seção com Haiku usando o snapshot salvo no /start.
router.post('/:eventId/report/:reportId/section', async (req, res) => {
  try {
    const { eventId, reportId } = req.params;
    const { section } = req.body;
    const force = req.query.force === '1' || req.query.force === 'true';

    if (!SECTION_PLAN.find(p => p.name === section)) {
      return res.status(400).json({ error: `Seção inválida: ${section}` });
    }

    const { data: row, error: readErr } = await supabase.from('event_reports')
      .select('*').eq('id', reportId).eq('event_id', eventId).single();
    if (readErr || !row) return res.status(404).json({ error: 'Relatório não encontrado' });
    if (row.status === 'ready' && !force) {
      return res.status(409).json({ error: 'Relatório já finalizado. Use ?force=1 pra regenerar a seção.' });
    }

    // Idempotência: se a seção já está preenchida e não é force, devolve cache.
    if (row.sections?.[section] && !force) {
      return res.json({ section, content: row.sections[section], cached: true });
    }

    const input = row.input_data;
    if (!input) return res.status(400).json({ error: 'Snapshot do relatório indisponível. Recrie pelo /start.' });

    // Para seções synthesis, passa as outras já geradas como contexto extra.
    const otherSections = row.sections || {};

    const { system, userMessage } = buildSectionPrompt(section, input, otherSections);

    const agent = await AgentService.createRun('event_report_section', req.user.userId, {
      eventId, reportId, section, mode: 'progressive',
    });

    const result = await agent.call({
      model: 'claude-haiku-4-5-20251001',
      system,
      messages: [{ role: 'user', content: userMessage }],
      tools: [SECTION_TOOL],
      toolChoice: { type: 'tool', name: 'submit_section' },
      maxTokens: 2048,
      role: 'report-section',
    });
    await agent.complete(`Seção ${section} gerada`);

    let content = '';
    const tc = (result.toolCalls || []).find(c => c.name === 'submit_section');
    if (tc?.input?.content) content = tc.input.content;
    else content = result.text || '_Sem dados disponíveis para esta seção._';

    // UPDATE atômico via jsonb_set: lê a row atual, atualiza só essa chave,
    // grava o objeto novo. Custo extra de transferência mas evita corrupção
    // se duas seções fossem salvas simultaneamente.
    const updatedSections = { ...(row.sections || {}), [section]: content };
    const updatedErrors = { ...(row.section_errors || {}) };
    delete updatedErrors[section]; // limpa erro anterior se sucesso

    const newCost = parseFloat(row.token_cost || 0) + agent.totalCost;
    const newStatus = row.status === 'pending' ? 'streaming' : row.status;

    const { error: updErr } = await supabase.from('event_reports').update({
      sections: updatedSections,
      section_errors: updatedErrors,
      token_cost: newCost,
      status: newStatus,
    }).eq('id', reportId);
    if (updErr) throw updErr;

    res.json({ section, content, cached: false, status: newStatus });
  } catch (e) {
    console.error('[Reports] Section:', e.message);
    // Persiste erro pra cliente saber o que falhou e poder retentar
    const { reportId } = req.params;
    const { section } = req.body || {};
    if (reportId && section) {
      try {
        const { data: row } = await supabase.from('event_reports').select('section_errors').eq('id', reportId).single();
        const errors = { ...(row?.section_errors || {}), [section]: e.message || 'Erro desconhecido' };
        await supabase.from('event_reports').update({ section_errors: errors }).eq('id', reportId);
      } catch { /* swallow */ }
    }
    res.status(500).json({ error: e.message || 'Erro ao gerar seção' });
  }
});

// POST /:eventId/report/:reportId/finalize
// Monta o markdown final de sections, salva em content, status=ready.
// Gera email_summary best-effort (não bloqueia o finalize se falhar).
router.post('/:eventId/report/:reportId/finalize', async (req, res) => {
  try {
    const { eventId, reportId } = req.params;

    const { data: row, error: readErr } = await supabase.from('event_reports')
      .select('*').eq('id', reportId).eq('event_id', eventId).single();
    if (readErr || !row) return res.status(404).json({ error: 'Relatório não encontrado' });

    const missing = SECTION_PLAN
      .filter(p => !(row.sections && row.sections[p.name]))
      .map(p => p.name);

    // Política: aceita finalize com seções faltando (retorna 200) MAS marca
    // status='error' se faltar alguma. Frontend pode oferecer "finalizar mesmo
    // assim" ou "retentar faltantes". Não quero perder o trabalho já feito.
    const content = structuredToMarkdown(row.sections || {});

    const finalStatus = missing.length === 0 ? 'ready' : 'error';

    // Gera corpo de e-mail (best-effort). Só dispara se temos conteúdo útil.
    // Falha aqui NÃO derruba o finalize — usuário pode regenerar manualmente.
    const eventNameForEmail = row.input_data?.eventName || 'Evento';
    const scopeForEmail = row.input_data?.scope || (row.report_type === 'phase' ? `Fase: ${row.phase_name}` : 'Evento Completo');
    const emailSummary = content.trim()
      ? await generateEmailSummary({ userId: req.user.userId, eventName: eventNameForEmail, scope: scopeForEmail, content })
      : null;

    const { data: updated, error: updErr } = await supabase.from('event_reports').update({
      content,
      email_summary: emailSummary,
      status: finalStatus,
      finished_at: new Date().toISOString(),
    }).eq('id', reportId).select().single();
    if (updErr) throw updErr;

    res.json({ ...updated, missing_sections: missing });
  } catch (e) {
    console.error('[Reports] Finalize:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao finalizar relatório' });
  }
});

// POST /:eventId/report/:reportId/email-summary
// Gera ou regenera o corpo de e-mail pra um relatório existente.
// - Útil pra relatórios antigos (pré-feature) que não têm email_summary
// - Permite ao usuário pedir uma nova versão se a primeira não agradou
// Body opcional: { force: true } pra regenerar mesmo se já existe.
router.post('/:eventId/report/:reportId/email-summary', async (req, res) => {
  try {
    const { eventId, reportId } = req.params;
    const force = req.body?.force === true || req.query.force === '1';

    const { data: row, error: readErr } = await supabase.from('event_reports')
      .select('*').eq('id', reportId).eq('event_id', eventId).single();
    if (readErr || !row) return res.status(404).json({ error: 'Relatório não encontrado' });

    if (row.email_summary && !force) {
      return res.json({ email_summary: row.email_summary, cached: true });
    }
    if (!row.content || !row.content.trim()) {
      return res.status(400).json({ error: 'Relatório sem conteúdo. Gere o relatório antes.' });
    }

    const { data: ev } = await supabase.from('events').select('name').eq('id', eventId).single();
    const eventName = row.input_data?.eventName || ev?.name || 'Evento';
    const scope = row.input_data?.scope || (row.report_type === 'phase' ? `Fase: ${row.phase_name}` : 'Evento Completo');

    const email = await generateEmailSummary({
      userId: req.user.userId, eventName, scope, content: row.content,
    });
    if (!email) return res.status(500).json({ error: 'Não foi possível gerar o resumo de e-mail.' });

    const { error: updErr } = await supabase.from('event_reports')
      .update({ email_summary: email }).eq('id', reportId);
    if (updErr) throw updErr;

    res.json({ email_summary: email, cached: false });
  } catch (e) {
    console.error('[Reports] Email summary:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao gerar resumo de e-mail' });
  }
});

// POST /api/events/:eventId/report/export — gerar HTML (slide ou documento)
router.post('/:eventId/report/export', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { reportId, format } = req.body; // format: 'slide' | 'document'
    if (!reportId || !format) return res.status(400).json({ error: 'reportId e format são obrigatórios' });

    const { generateSlideHTML, generateDocumentHTML } = require('../services/reportGenerator');

    const { data: event } = await supabase.from('events').select('name, date').eq('id', eventId).single();
    const { data: report } = await supabase.from('event_reports').select('*').eq('id', reportId).single();
    if (!report) return res.status(404).json({ error: 'Relatório não encontrado' });

    const { data: progress } = await supabase.from('vw_phase_progress').select('*').eq('event_id', eventId).order('phase_number');
    const phaseMap = {};
    (progress || []).forEach(p => {
      if (!phaseMap[p.phase_number]) phaseMap[p.phase_number] = { numero: p.phase_number, nome: p.nome_fase, total: 0, done: 0 };
      phaseMap[p.phase_number].total += p.total_cards || 0;
      phaseMap[p.phase_number].done += p.cards_concluidos || 0;
    });
    const phases = Object.values(phaseMap).sort((a, b) => a.numero - b.numero);
    const totalTasks = phases.reduce((s, p) => s + p.total, 0);
    const completedTasks = phases.reduce((s, p) => s + p.done, 0);

    const params = {
      eventName: event?.name || 'Evento',
      eventDate: event?.date ? new Date(event.date + 'T12:00:00').toLocaleDateString('pt-BR') : '',
      scope: report.report_type === 'phase' ? `Fase: ${report.phase_name}` : 'Evento Completo',
      phases, completedTasks,
      pendingTasks: totalTasks - completedTasks,
      totalTasks,
      pctDone: totalTasks > 0 ? Math.round(completedTasks / totalTasks * 100) : 0,
      // sections (JSON estruturado) tem prioridade — elimina parser regex e
      // títulos duplicados. content em markdown vira fallback pra relatórios
      // gerados antes do progressive flow (#4).
      sections: (report.sections && Object.keys(report.sections).length > 0) ? report.sections : null,
      reportContent: report.content || '',
    };

    const html = format === 'slide' ? generateSlideHTML(params) : generateDocumentHTML(params);
    const prefix = format === 'slide' ? 'Apresentacao' : 'Documento';
    // Sanitiza nome do evento pra filename: remove acento + caractere especial.
    const safeName = (event?.name || 'evento')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 60);
    const filename = `${prefix}_${safeName}.html`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Garante extensão correta no download mesmo se o frontend errar
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(html);
  } catch (e) {
    console.error('[Reports] Export:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao exportar relatório' });
  }
});

// GET /api/events/:eventId/reports — listar relatórios
router.get('/:eventId/reports', async (req, res) => {
  try {
    const { data, error } = await supabase.from('event_reports')
      .select('*')
      .eq('event_id', req.params.eventId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao listar relatórios' });
  }
});

// GET /api/events/:eventId/reports/:id — ler relatório
router.get('/:eventId/reports/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('event_reports')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar relatório' });
  }
});

module.exports = router;
