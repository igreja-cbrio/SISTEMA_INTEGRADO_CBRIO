const { AgentService } = require('../services/agentService');
const { buildContext, serializeContext } = require('../services/agentContext');

/**
 * System Auditor Agent
 * Analisa dados reais do sistema, identifica problemas e sugere melhorias.
 * Nunca inventa dados — tudo baseado em evidências.
 */
async function runSystemAudit(triggeredBy, config = {}) {
  const agent = await AgentService.createRun('system_auditor', triggeredBy, config);
  const targetModules = config.targetModules || ['all'];

  try {
    // ── Step 1: Coletar contexto RAG ──────────────────────
    const context = await buildContext(targetModules);
    const contextStr = serializeContext(context);

    await agent.call({
      model: 'claude-haiku-4-5-20251001',
      system: 'Você é o assistente de contexto. Resuma brevemente os dados do sistema que recebeu.',
      messages: [{ role: 'user', content: `Dados do sistema:\n${contextStr}\n\nResuma em 2-3 frases o estado geral.` }],
      role: 'context',
      maxTokens: 256,
    });

    // ── Step 2: Análise profunda com Sonnet ───────────────
    const analysisResult = await agent.callSonnet(
      `Você é um auditor de sistemas ERP especializado. Analise os dados reais do CBRio ERP abaixo e identifique:

1. PROBLEMAS CRÍTICOS — dados inconsistentes, valores errados, registros órfãos
2. AVISOS — campos faltando, datas vencidas, processos parados
3. SUGESTÕES DE MELHORIA — funcionalidades que poderiam ser melhoradas, dados que deveriam ser preenchidos

Responda APENAS em JSON válido, seguindo exatamente esta estrutura:
{
  "findings": [
    {
      "severity": "critico" | "aviso" | "info",
      "module": "rh" | "financeiro" | "logistica" | "patrimonio" | "eventos" | "projetos" | "sistema",
      "title": "Título curto do problema",
      "detail": "Descrição detalhada com evidências concretas dos dados",
      "suggestion": "O que fazer para resolver"
    }
  ]
}

Baseie-se EXCLUSIVAMENTE nos dados fornecidos. NÃO invente problemas que não estão nos dados.`,

      `DADOS REAIS DO SISTEMA:\n\n${contextStr}`,
      'analysis'
    );

    // ── Step 3: Parse dos findings ────────────────────────
    let findings = [];
    try {
      const jsonMatch = analysisResult.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        findings = parsed.findings || [];
      }
    } catch (e) {
      findings = [{ severity: 'info', module: 'sistema', title: 'Resposta não-estruturada', detail: analysisResult.text.slice(0, 500), suggestion: 'Revisar manualmente' }];
    }

    // ── Step 4: Gerar resumo executivo ────────────────────
    const summaryResult = await agent.callHaiku(
      'Você gera resumos executivos concisos em português brasileiro.',
      `Com base nestes findings de auditoria:\n${JSON.stringify(findings, null, 2)}\n\nGere um resumo executivo de 3-5 linhas para o gestor. Foque nos itens mais importantes.`,
      'summary'
    );

    // ── Finalizar ─────────────────────────────────────────
    await agent.complete(summaryResult.text, findings, []);

    return { runId: agent.runId, findings, summary: summaryResult.text };

  } catch (error) {
    await agent.fail(error.message);
    return { runId: agent.runId, error: error.message };
  }
}

module.exports = { runSystemAudit };
