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

// POST /api/events/:eventId/report — gerar relatório por IA
router.post('/:eventId/report', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { type = 'full', phase_name, since_days } = req.body;

    // Filtro de data: pra séries longas, limita ao período recente.
    // since_days: 30/60/90/180. null/undefined = sem filtro (todos).
    const sinceN = parseInt(since_days, 10);
    const hasDateFilter = Number.isFinite(sinceN) && sinceN > 0;
    const sinceIso = hasDateFilter ? new Date(Date.now() - sinceN * 86400000).toISOString() : null;

    // Buscar evento
    const { data: event } = await supabase.from('events').select('name, date, status, description').eq('id', eventId).single();
    if (!event) return res.status(404).json({ error: 'Evento não encontrado' });

    // Buscar anexos (com filtro opcional de data)
    let q = supabase.from('event_task_attachments').select('*').eq('event_id', eventId);
    if (type === 'phase' && phase_name) q = q.eq('phase_name', phase_name);
    if (hasDateFilter) q = q.gte('created_at', sinceIso);
    const { data: attachs } = await q.order('created_at');

    // Buscar conclusões de cards (card_completions)
    let compQ = supabase.from('card_completions').select('*').eq('event_id', eventId).is('reopened_at', null);
    if (type === 'phase' && phase_name) {
      const { data: phaseRow } = await supabase.from('event_cycle_phases')
        .select('numero_fase').eq('event_id', eventId).eq('nome_fase', phase_name).limit(1).maybeSingle();
      if (phaseRow) compQ = compQ.eq('phase_number', phaseRow.numero_fase);
    }
    if (hasDateFilter) compQ = compQ.gte('completed_at', sinceIso);
    const { data: completions } = await compQ.order('completed_at');

    // Buscar progresso por fase/área (totais, concluídos, pendentes)
    let progressQ = supabase.from('vw_phase_progress').select('*').eq('event_id', eventId);
    if (type === 'phase' && phase_name) progressQ = progressQ.eq('nome_fase', phase_name);
    const { data: progress } = await progressQ.order('phase_number');

    // Buscar cards pendentes (não concluídos) — sem filtro de data, pendência atual é sempre relevante
    let pendingQ = supabase.from('cycle_phase_tasks')
      .select('titulo, area, status, responsavel_nome, event_phase_id')
      .eq('event_id', eventId)
      .neq('status', 'concluida');
    if (type === 'phase' && phase_name) {
      const { data: phaseRow } = await supabase.from('event_cycle_phases')
        .select('id').eq('event_id', eventId).eq('nome_fase', phase_name).limit(1).maybeSingle();
      if (phaseRow) pendingQ = pendingQ.eq('event_phase_id', phaseRow.id);
    }
    const { data: pendingTasks } = await pendingQ;

    if ((!attachs || attachs.length === 0) && (!completions || completions.length === 0) && (!pendingTasks || pendingTasks.length === 0)) {
      return res.status(400).json({ error: 'Nenhum dado encontrado para gerar relatório.' });
    }

    // Montar conteúdo dos arquivos (usar digest se disponível, fallback para download).
    // Paraleliza fallbacks pra não fazer N downloads serial em eventos antigos sem digest.
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

    // Montar dados de conclusões para o prompt
    const completionsSummary = (completions || []).map(c =>
      `- Card: "${c.card_titulo}" | Área: ${c.area} | Fase: ${c.phase_number} | Concluído por: ${c.completed_by_name || 'desconhecido'} em ${new Date(c.completed_at).toLocaleDateString('pt-BR')}${c.observacao ? ` | Observação: "${c.observacao}"` : ''}${c.file_name ? ` | Arquivo: ${c.file_name}` : ''}`
    ).join('\n');

    // Calcular totais a partir do progresso
    const totalCards = (progress || []).reduce((s, p) => s + (p.total_cards || 0), 0);
    const totalConcluidos = (progress || []).reduce((s, p) => s + (p.cards_concluidos || 0), 0);
    const totalPendentes = totalCards - totalConcluidos;
    const pctGeral = totalCards > 0 ? Math.round(totalConcluidos / totalCards * 100) : 0;

    // Prompt em 2 blocos: o STATIC tem instruções e regras (cacheável — repete
    // entre requisições). O DYNAMIC tem nome/data/totais do evento (varia).
    // Anthropic só ativa cache se o bloco passar do mínimo (~1024 tokens p/ Sonnet).
    // Em escopo pequeno o cache_control é no-op silencioso, sem prejuízo.
    const scope = type === 'phase' ? `Fase: ${phase_name}` : 'Evento Completo';

    const SYSTEM_STATIC = `Você é um analista de eventos da Igreja Comunidade Batista do Rio de Janeiro (CBRio).
Sua tarefa é gerar um relatório operacional estruturado em seções fixas a partir de dados reais de cards, entregas, anexos e pendências de um ciclo criativo.

Use a ferramenta submit_report para entregar o relatório. Cada campo da ferramenta deve ser markdown corpado:
- resumo_executivo: 2-4 parágrafos com visão geral do evento (o que foi entregue, o que ainda falta, status global).
- progresso_por_fase: lista por fase, mostrando total, concluídos, pendentes e % de conclusão.
- entregas_por_area: por área (marketing, produção, adm, etc.), o que foi entregue, por quem, quando.
- cards_pendentes: lista de pendências agrupada por fase/área, avaliando impacto de cada uma no evento.
- observacoes_responsaveis: destaque as observações relevantes registradas nas conclusões.
- pontos_atencao: gaps, atrasos, entregas faltantes, riscos identificados nas pendências.
- recomendacoes: próximos passos pra destravar pendências antes do evento.

REGRAS DURAS:
- Baseie-se APENAS nos dados fornecidos. NUNCA invente nomes, datas, observações.
- Se uma seção não tem dados, retorne string vazia ("") naquele campo. Não preencha com placeholders genéricos.
- Use markdown limpo: títulos com ##, bullets com -, negrito apenas pra realce real.
- Tom profissional, conciso, acionável.`;

    const dynamicHeader = `### CONTEXTO DESTE EVENTO

- Evento: ${event.name}
- Data: ${event.date || 'não definida'}
- Escopo: ${scope}${hasDateFilter ? ` · últimos ${sinceN} dias` : ''}
- Total de cards: ${totalCards}
- Cards concluídos: ${totalConcluidos} (${pctGeral}%)
- Cards pendentes: ${totalPendentes}
- Total de anexos: ${attachs?.length || 0}`;

    let userMessage = '';

    // Progresso por fase
    if (progress && progress.length > 0) {
      userMessage += '=== PROGRESSO POR FASE/ÁREA ===\n';
      userMessage += progress.map(p =>
        `- Fase ${p.phase_number} "${p.nome_fase}" | Área: ${p.area} | ${p.cards_concluidos}/${p.total_cards} concluídos (${p.pct_concluido}%)${p.cards_bloqueados > 0 ? ` | ${p.cards_bloqueados} bloqueado(s)` : ''}`
      ).join('\n') + '\n\n';
    }

    // Cards pendentes
    if (pendingTasks && pendingTasks.length > 0) {
      userMessage += '=== CARDS PENDENTES (NÃO CONCLUÍDOS) ===\n';
      userMessage += pendingTasks.map(t =>
        `- "${t.titulo}" | Área: ${t.area || 'não definida'} | Status: ${t.status} | Responsável: ${t.responsavel_nome || 'não atribuído'}`
      ).join('\n') + '\n\n';
    }

    if (fileContents.length > 0) {
      userMessage += '=== ARQUIVOS ANEXADOS ===\n' + fileContents.map((f, i) =>
        `--- Arquivo ${i + 1}: ${f.file_name} ---\nÁrea: ${f.area}\nFase: ${f.phase}\nDescrição: ${f.description}\nEnviado por: ${f.uploaded_by}\n\nConteúdo:\n${f.content}\n`
      ).join('\n');
    }
    if (completionsSummary) {
      userMessage += '\n=== CONCLUSÕES DE CARDS ===\n' + completionsSummary;
    }

    // Model routing: Haiku pra fase única (escopo menor, ~1/10 do custo), Sonnet pra evento completo.
    // Threshold de fallback: se userMessage > 80k chars (~20k tokens), força Sonnet mesmo em fase.
    const useHaiku = type === 'phase' && userMessage.length < 80000;
    const model = useHaiku ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-20250514';
    const maxTokens = useHaiku ? 2048 : 4096;

    const agent = await AgentService.createRun('event_report', req.user.userId, { eventId, type, phase_name, model, since_days: sinceN || null });

    // System em 2 blocos pra prompt caching: estável + dinâmico.
    // Tools + tool_choice forçam structured output via submit_report.
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

    // Extrai resultado da tool_use; se o modelo escapar e responder texto livre, usa o texto.
    let reportContent = '';
    const toolCall = (result.toolCalls || []).find(c => c.name === 'submit_report');
    if (toolCall?.input) {
      reportContent = structuredToMarkdown(toolCall.input);
    } else {
      reportContent = result.text || 'Não foi possível gerar o relatório.';
    }

    // Salvar no banco
    const { data: report, error } = await supabase.from('event_reports').insert({
      event_id: eventId,
      phase_name: type === 'phase' ? phase_name : null,
      report_type: type,
      content: reportContent,
      generated_by: req.user.userId,
      attachments_count: attachs.length,
      token_cost: agent.totalCost,
    }).select().single();
    if (error) throw error;

    res.json(report);
  } catch (e) {
    console.error('[Reports] Generate:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao gerar relatório' });
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
