const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const storage = require('../services/storageService');
const { AgentService } = require('../services/agentService');

const { extractText } = require('../services/textExtractor');

router.use(authenticate);

// POST /api/events/:eventId/report — gerar relatório por IA
router.post('/:eventId/report', async (req, res) => {
  try {
    const { eventId } = req.params;
    const { type = 'full', phase_name } = req.body;

    // Buscar evento
    const { data: event } = await supabase.from('events').select('name, date, status, description').eq('id', eventId).single();
    if (!event) return res.status(404).json({ error: 'Evento não encontrado' });

    // Buscar anexos
    let q = supabase.from('event_task_attachments').select('*').eq('event_id', eventId);
    if (type === 'phase' && phase_name) q = q.eq('phase_name', phase_name);
    const { data: attachs } = await q.order('created_at');

    // Buscar conclusões de cards (card_completions)
    let compQ = supabase.from('card_completions').select('*').eq('event_id', eventId).is('reopened_at', null);
    if (type === 'phase' && phase_name) {
      // Buscar phase_number da fase pelo nome
      const { data: phaseRow } = await supabase.from('event_cycle_phases')
        .select('numero_fase').eq('event_id', eventId).eq('nome_fase', phase_name).limit(1).maybeSingle();
      if (phaseRow) compQ = compQ.eq('phase_number', phaseRow.numero_fase);
    }
    const { data: completions } = await compQ.order('completed_at');

    // Buscar progresso por fase/área (totais, concluídos, pendentes)
    let progressQ = supabase.from('vw_phase_progress').select('*').eq('event_id', eventId);
    if (type === 'phase' && phase_name) progressQ = progressQ.eq('nome_fase', phase_name);
    const { data: progress } = await progressQ.order('phase_number');

    // Buscar cards pendentes (não concluídos)
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

    // Montar conteúdo dos arquivos (usar digest se disponível, fallback para download)
    const fileContents = [];
    for (const a of attachs) {
      let text = '';
      if (a.file_digest) {
        // Digest já gerado na hora do upload — usar direto
        text = a.file_digest;
      } else if (a.supabase_path || a.sharepoint_item_id) {
        // Fallback: arquivo antigo sem digest — baixar e extrair
        try {
          const buffer = await storage.downloadFile(a.supabase_path, a.sharepoint_item_id);
          text = await extractText(buffer, a.file_type, a.file_name);
        } catch (e) {
          text = `[Erro ao ler ${a.file_name}: ${e.message}]`;
        }
      }
      fileContents.push({
        file_name: a.file_name,
        area: a.area || 'não especificada',
        phase: a.phase_name || 'geral',
        description: a.description || '',
        uploaded_by: a.uploaded_by_name || 'desconhecido',
        content: text,
      });
    }

    // Montar dados de conclusões para o prompt
    const completionsSummary = (completions || []).map(c =>
      `- Card: "${c.card_titulo}" | Área: ${c.area} | Fase: ${c.phase_number} | Concluído por: ${c.completed_by_name || 'desconhecido'} em ${new Date(c.completed_at).toLocaleDateString('pt-BR')}${c.observacao ? ` | Observação: "${c.observacao}"` : ''}${c.file_name ? ` | Arquivo: ${c.file_name}` : ''}`
    ).join('\n');

    // Calcular totais a partir do progresso
    const totalCards = (progress || []).reduce((s, p) => s + (p.total_cards || 0), 0);
    const totalConcluidos = (progress || []).reduce((s, p) => s + (p.cards_concluidos || 0), 0);
    const totalPendentes = totalCards - totalConcluidos;
    const pctGeral = totalCards > 0 ? Math.round(totalConcluidos / totalCards * 100) : 0;

    // Montar prompt
    const scope = type === 'phase' ? `Fase: ${phase_name}` : 'Evento Completo';
    const system = `Você é um analista de eventos da Igreja Comunidade Batista do Rio de Janeiro (CBRio).
Gere um relatório estruturado em markdown com base nos entregáveis, conclusões e status dos cards.

Evento: ${event.name}
Data: ${event.date || 'não definida'}
Escopo: ${scope}
Total de cards: ${totalCards}
Cards concluídos: ${totalConcluidos} (${pctGeral}%)
Cards pendentes: ${totalPendentes}
Total de anexos: ${attachs?.length || 0}

O relatório deve conter:
1. **Resumo Executivo** — visão geral do evento: o que foi entregue e o que ainda falta
2. **Progresso por Fase** — para cada fase, mostrar total de cards, concluídos, pendentes e % de conclusão
3. **Entregas por Área** — o que cada área (marketing, produção, adm, etc.) entregou, quem concluiu e quando
4. **Cards Pendentes** — listar os cards que ainda não foram concluídos, agrupados por fase/área, e avaliar o impacto de cada pendência no evento
5. **Observações dos Responsáveis** — destaque as observações relevantes registradas nas conclusões
6. **Pontos de Atenção** — gaps, atrasos, entregas faltantes ou problemas identificados com base nas pendências
7. **Recomendações** — próximos passos sugeridos para resolver as pendências a tempo

Baseie-se APENAS nos dados fornecidos. Não invente informações.`;

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

    // Criar run do agente
    const agent = await AgentService.createRun('event_report', req.user.userId, { eventId, type, phase_name });
    const result = await agent.call({
      model: 'claude-sonnet-4-20250514',
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 4096,
      role: 'report',
    });
    await agent.complete('Relatório gerado');

    const reportContent = result.text || 'Não foi possível gerar o relatório.';

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
    const ext = format === 'slide' ? 'Apresentacao' : 'Documento';
    const filename = `${ext}_${event?.name || 'evento'}.html`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
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
