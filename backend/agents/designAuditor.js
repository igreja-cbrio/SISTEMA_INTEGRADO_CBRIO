const { AgentService } = require('../services/agentService');

/**
 * Design & Layout Auditor Agent
 * Analisa o design atual do CRM, busca referências modernas e sugere melhorias.
 */
async function runDesignAudit(triggeredBy, config = {}) {
  const agentType = 'design_auditor';
  const agent = await AgentService.createRun(agentType, triggeredBy, config);

  try {
    // Step 0: Carregar memórias anteriores
    const memories = await agent.getMemories('design');
    const memoryStr = agent.formatMemories(memories);
    const scoreHistory = await agent.getScoreHistory('design', 5);
    const historyStr = scoreHistory.length
      ? scoreHistory.map(h => `${new Date(h.date).toLocaleDateString('pt-BR')}: score=${h.score}, ${h.findingsCount} findings`).join('\n')
      : 'Primeira execução — sem histórico.';

    // Step 1: Descrever o estado atual do design
    const currentDesign = getCurrentDesignState();

    await agent.callHaiku(
      'Resuma o estado atual do design do sistema.',
      `Estado do design:\n${currentDesign}\n\nResuma os principais problemas visuais em 3-4 frases.`,
      'context'
    );

    // Step 2: Análise profunda com Sonnet — trazer referências e sugestões
    const analysisResult = await agent.callSonnet(
      `Você é um designer de produto sênior especializado em design systems modernos, minimalistas e profissionais para aplicações SaaS/ERP.

Seu estilo de referência: Linear, Vercel, Notion, Stripe Dashboard, Raycast — interfaces limpas, espaçosas, com tipografia elegante e micro-interações sutis.

ESTADO ATUAL DO DESIGN DO CRM CBRIO:
${currentDesign}

MEMÓRIA DE ANÁLISES ANTERIORES:
${memoryStr}

HISTÓRICO:
${historyStr}

ANALISE o design atual e forneça:

1. **Score de Design** (1-10): avalie profissionalismo, consistência, modernidade, UX
2. **Findings**: problemas específicos de design/layout
3. **Referências**: cite apps/sites modernos com padrões que o CBRio deveria seguir
4. **Sugestões concretas**: com código/classes Tailwind quando possível

Categorias para avaliar:
- TIPOGRAFIA: hierarquia, tamanhos, pesos, espaçamento entre linhas
- COR & CONTRASTE: paleta, uso de cores, acessibilidade
- ESPAÇAMENTO: padding, margin, gap, respiração entre elementos
- COMPONENTES: botões, inputs, cards, tabelas, modais
- LAYOUT: grid, alinhamento, responsividade
- MICRO-INTERAÇÕES: hover, transitions, feedback visual
- CONSISTÊNCIA: padrões repetidos vs únicos em cada página
- MODERNIDADE: vs tendências atuais de 2025-2026

Responda em JSON:
{
  "score": 7,
  "findings": [
    {
      "severity": "critico" | "aviso" | "info",
      "module": "design",
      "category": "tipografia" | "cor" | "espacamento" | "componentes" | "layout" | "interacoes" | "consistencia" | "modernidade",
      "title": "Título",
      "detail": "Problema específico com exemplos",
      "suggestion": "Solução com código Tailwind/CSS quando possível",
      "reference": "App/site de referência que faz isso bem"
    }
  ],
  "top_references": [
    {
      "name": "Nome do app/site",
      "url": "URL",
      "why": "Por que é referência para o CBRio"
    }
  ],
  "quick_wins": [
    "Melhoria 1 que pode ser feita em 5 minutos",
    "Melhoria 2..."
  ],
  "learnings": [
    "Aprendizado para próxima execução"
  ]
}`,
      `Analise e traga referências modernas e minimalistas. Seja específico — cite classes Tailwind, valores de CSS, cores hex. O objetivo é transformar o sistema de "amador" para "profissional/premium".`,
      'analysis'
    );

    // Step 3: Parse
    let findings = [];
    let score = null;
    let learnings = [];
    let topReferences = [];
    let quickWins = [];
    try {
      const jsonMatch = analysisResult.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        findings = parsed.findings || [];
        score = parsed.score || null;
        learnings = parsed.learnings || [];
        topReferences = parsed.top_references || [];
        quickWins = parsed.quick_wins || [];
      }
    } catch (e) {
      findings = [{ severity: 'info', module: 'design', title: 'Resposta não-estruturada', detail: analysisResult.text.slice(0, 500), suggestion: 'Revisar manualmente' }];
    }

    // Step 4: Salvar memórias
    const now = new Date().toLocaleDateString('pt-BR');
    for (let i = 0; i < learnings.length; i++) {
      await agent.remember(`learning_${now}_${i}`, learnings[i], 'design');
    }
    if (topReferences.length) {
      await agent.remember('top_references', JSON.stringify(topReferences), 'design');
    }
    if (quickWins.length) {
      await agent.remember('quick_wins', JSON.stringify(quickWins), 'design');
    }
    await agent.remember('last_run_summary', `Score: ${score}/10 | ${findings.length} findings | ${now}`, 'design');
    await agent.remember('last_score', String(score), 'design');

    // Step 5: Resumo
    const summaryResult = await agent.callHaiku(
      'Gere um resumo executivo de design conciso em português.',
      `Score de Design: ${score}/10\nTop Referências: ${topReferences.map(r => r.name).join(', ')}\nQuick Wins: ${quickWins.join('; ')}\nFindings: ${findings.length}\n\nGere 4-5 linhas focando nas melhorias mais impactantes.`,
      'summary'
    );

    await agent.complete(summaryResult.text, findings, []);

    if (score !== null) {
      const { supabase } = require('../utils/supabase');
      await supabase.from('agent_runs').update({
        config: { ...config, score, module: 'design', topReferences, quickWins }
      }).eq('id', agent.runId);
    }

    return { runId: agent.runId, findings, summary: summaryResult.text, score };

  } catch (error) {
    await agent.fail(error.message);
    return { runId: agent.runId, error: error.message };
  }
}

/**
 * Descreve o estado atual do design do sistema para o agente analisar
 */
function getCurrentDesignState() {
  return `
## CRM CBRio — Estado Atual do Design

### Stack de UI
- Framework: React 18 + Vite
- Styling: Tailwind CSS v4 + inline styles (misto)
- Componentes: shadcn-inspired (Button, Input, Dialog, Table, StatusBadge, EmptyState)
- Ícones: Lucide React
- Animações: Framer Motion (mega-menu)
- Fontes: Inter (system font stack)

### Cores
- Primary: #00B39D (turquesa/teal)
- Background dark: #0a0a0a
- Card dark: #161616
- Background light: #f5f5f5
- Card light: #ffffff
- Border dark: #262626
- Border light: #e5e5e5
- Text: #e5e5e5 (dark) / #171717 (light)

### Problemas conhecidos
- 95% das páginas ainda usam inline styles (style={{}}) em vez de Tailwind
- Cada página define seu próprio objeto "styles" com valores duplicados
- Tipografia inconsistente: fontSize varia entre 11px, 12px, 13px, 14px, 15px, 28px
- Espaçamento: padding varia entre 10px, 12px, 14px, 16px, 20px, 24px sem padrão
- Tabelas usam <table> raw com inline styles em vez do componente <Table>
- Modais usam overlays customizados em vez do componente <Dialog>
- Cards com border-radius misturado (8px, 10px, 12px, 16px)
- Header com mega-menu centralizado, logo no canto esquerdo com container turquesa
- Sidebar existe mas não está ativa (ModernSidebar component)
- Status badges duplicados em cada página com cores hardcoded
- Sem design tokens centralizados
- Sem animações de entrada/saída nas páginas
- Sem skeleton loading nos cards/tabelas
- Formulários com labels uppercase 11px + inputs com estilos inline

### Componentes existentes (src/components/ui/)
- button.tsx (shadcn clean)
- input.tsx (basic)
- dialog.tsx (radix-based)
- table.tsx (responsive)
- status-badge.tsx (color variants)
- empty-state.tsx (icon + text)
- loading-spinner.tsx
- badge.tsx
- mega-menu.tsx (framer motion)
- modern-side-bar.tsx (not active)

### Páginas principais
- /admin/rh — Recursos Humanos (tabela de colaboradores, formulários, organograma)
- /admin/financeiro — Dashboard financeiro, contas, transações
- /eventos — Eventos com Home, Lista, Kanban, Gantt
- /projetos — Projetos com fases, tarefas, riscos
- /admin/logistica — Fornecedores, pedidos, NF
- /admin/patrimonio — Bens patrimoniais
- /ministerial/membresia — Membros da igreja
- /assistente-ia — Dashboard dos agentes IA (esta página)
`.trim();
}

module.exports = { runDesignAudit };
