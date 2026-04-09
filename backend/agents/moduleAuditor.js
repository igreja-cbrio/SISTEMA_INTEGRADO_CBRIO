const { AgentService } = require('../services/agentService');
const { buildContext, serializeContext } = require('../services/agentContext');

/**
 * Module-specific Auditor Agent
 * Cada módulo tem seu próprio agente que analisa dados e UI específicos.
 */

const MODULE_PROMPTS = {
  rh: {
    name: 'Auditor RH',
    system: `Você é um auditor especialista em Recursos Humanos e Departamento Pessoal.
Analise os dados do módulo RH do CBRio ERP e identifique:
- Funcionários ativos sem CPF, email, cargo, setor ou data de admissão
- Admissões pendentes há mais de 30 dias
- Férias pendentes de aprovação
- Treinamentos sem participantes
- Documentos obrigatórios faltando
- Inconsistências salariais ou de contrato
- Colaboradores sem gestor direto definido`,
  },

  financeiro: {
    name: 'Auditor Financeiro',
    system: `Você é um auditor financeiro especializado em gestão de igrejas e ONGs.
Analise os dados financeiros do CBRio ERP e identifique:
- Contas a pagar vencidas
- Reembolsos pendentes há mais de 15 dias
- Transações sem categoria ou descrição
- Saldos negativos em contas
- Padrões incomuns de gastos
- Contas bancárias sem movimentação recente`,
  },

  eventos: {
    name: 'Auditor Eventos',
    system: `Você é um auditor especializado em gestão de eventos e produção.
Analise os dados de eventos do CBRio ERP e identifique:
- Eventos próximos sem responsável definido
- Tarefas atrasadas ou sem responsável
- Eventos sem orçamento definido
- Orçamentos estourados
- Eventos sem tarefas criadas
- Reuniões sem ata registrada`,
  },

  projetos: {
    name: 'Auditor Projetos',
    system: `Você é um auditor de gerenciamento de projetos (PMO).
Analise os dados de projetos do CBRio ERP e identifique:
- Projetos sem líder ou responsável
- Tarefas atrasadas
- Projetos com progresso estagnado (sem atualizações recentes)
- Fases sem tarefas
- Riscos não mitigados
- Marcos (milestones) vencidos`,
  },

  logistica: {
    name: 'Auditor Logística',
    system: `Você é um auditor de supply chain e logística.
Analise os dados de logística do CBRio ERP e identifique:
- Solicitações de compra pendentes há mais de 7 dias
- Pedidos sem rastreamento
- Fornecedores inativos com pedidos pendentes
- Notas fiscais sem vinculação a pedidos
- Pedidos atrasados (data prevista ultrapassada)`,
  },

  patrimonio: {
    name: 'Auditor Patrimônio',
    system: `Você é um auditor de controle patrimonial.
Analise os dados de patrimônio do CBRio ERP e identifique:
- Bens em status extraviado (urgente!)
- Bens sem categoria ou localização
- Bens em manutenção há mais de 30 dias
- Inventários pendentes ou incompletos
- Movimentações sem justificativa
- Bens sem código de barras`,
  },

  membresia: {
    name: 'Auditor Membresia',
    system: `Você é um auditor de gestão de membresia eclesiástica.
Analise os dados de membresia do CBRio ERP e identifique:
- Membros sem dados de contato
- Membros inativos há mais de 6 meses
- Processos de integração incompletos
- Dados inconsistentes (datas, status)
- Oportunidades de engajamento`,
  },
};

async function runModuleAudit(agentType, triggeredBy, config = {}) {
  const moduleKey = agentType.replace('module_', '');
  const moduleConfig = MODULE_PROMPTS[moduleKey];

  if (!moduleConfig) {
    throw new Error(`Módulo desconhecido: ${moduleKey}`);
  }

  const agent = await AgentService.createRun(agentType, triggeredBy, config);

  try {
    // Step 0: Carregar memórias anteriores
    const memories = await agent.getMemories(moduleKey);
    const memoryStr = agent.formatMemories(memories);
    const scoreHistory = await agent.getScoreHistory(moduleKey, 5);
    const historyStr = scoreHistory.length
      ? scoreHistory.map(h => `${new Date(h.date).toLocaleDateString('pt-BR')}: score=${h.score}, ${h.findingsCount} findings`).join('\n')
      : 'Primeira execução — sem histórico.';

    // Step 1: Coletar contexto específico do módulo
    const context = await buildContext([moduleKey]);
    const contextStr = serializeContext(context);

    await agent.callHaiku(
      'Você é o assistente de contexto. Resuma os dados do módulo.',
      `Dados do módulo ${moduleKey}:\n${contextStr}\n\nResuma em 2-3 frases.`,
      'context'
    );

    // Step 2: Análise profunda com Sonnet (inclui memória + histórico)
    const analysisResult = await agent.callSonnet(
      `${moduleConfig.system}

MEMÓRIA DE EXECUÇÕES ANTERIORES (use para comparar evolução):
${memoryStr}

HISTÓRICO DE SCORES:
${historyStr}

INSTRUÇÕES:
- Compare com execuções anteriores: o que melhorou? O que piorou? O que é novo?
- Se um problema foi reportado antes e continua, aumente a severidade
- Se um problema foi resolvido, mencione como "info" positivo
- Identifique tendências (score subindo/descendo)

Responda APENAS em JSON válido:
{
  "score": 8,
  "findings": [
    {
      "severity": "critico" | "aviso" | "info",
      "module": "${moduleKey}",
      "title": "Título curto",
      "detail": "Descrição com evidências dos dados",
      "suggestion": "O que fazer"
    }
  ],
  "learnings": [
    "Aprendizado 1 para lembrar na próxima execução",
    "Aprendizado 2..."
  ]
}

Baseie-se EXCLUSIVAMENTE nos dados fornecidos. NÃO invente problemas.
O score vai de 1 (péssimo) a 10 (perfeito).`,

      `DADOS REAIS DO MÓDULO ${moduleKey.toUpperCase()}:\n\n${contextStr}`,
      'analysis'
    );

    // Step 3: Parse findings + learnings
    let findings = [];
    let score = null;
    let learnings = [];
    try {
      const jsonMatch = analysisResult.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        findings = parsed.findings || [];
        score = parsed.score || null;
        learnings = parsed.learnings || [];
      }
    } catch (e) {
      findings = [{ severity: 'info', module: moduleKey, title: 'Resposta não-estruturada', detail: analysisResult.text.slice(0, 500), suggestion: 'Revisar manualmente' }];
    }

    // Step 4: Salvar aprendizados na memória
    const now = new Date().toLocaleDateString('pt-BR');
    for (let i = 0; i < learnings.length; i++) {
      await agent.remember(`learning_${now}_${i}`, learnings[i], moduleKey);
    }
    // Salvar resumo de findings para comparação futura
    const critCount = findings.filter(f => f.severity === 'critico').length;
    const warnCount = findings.filter(f => f.severity === 'aviso').length;
    await agent.remember('last_run_summary', `Score: ${score}/10 | ${critCount} críticos, ${warnCount} avisos, ${findings.length} total | ${now}`, moduleKey);
    await agent.remember('last_score', String(score), moduleKey);

    // Step 5: Resumo executivo
    const summaryResult = await agent.callHaiku(
      'Gere um resumo executivo conciso em português.',
      `Módulo: ${moduleConfig.name}\nScore: ${score}/10\nFindings:\n${JSON.stringify(findings, null, 2)}\n\nGere 3-5 linhas para o gestor. Se houver comparação com runs anteriores, mencione.`,
      'summary'
    );

    // Finalizar
    await agent.complete(summaryResult.text, findings, []);

    // Salvar score no run config
    if (score !== null) {
      const { supabase } = require('../utils/supabase');
      await supabase.from('agent_runs').update({
        config: { ...config, score, module: moduleKey }
      }).eq('id', agent.runId);
    }

    return { runId: agent.runId, findings, summary: summaryResult.text, score };

  } catch (error) {
    await agent.fail(error.message);
    return { runId: agent.runId, error: error.message };
  }
}

module.exports = { runModuleAudit, MODULE_PROMPTS };
