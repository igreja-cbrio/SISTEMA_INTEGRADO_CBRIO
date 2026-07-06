// ============================================================================
// Rituais Mensais de Gestão Estratégica — conteúdo institucional
// Reproduz o material "rituais_mensais_gestao_estrategica_CBRio" (slide oficial):
// o ciclo executivo do mês em 4 reuniões, com Termo/Objetivo/Analisar/Por que
// importa/Saída esperada de cada uma. É a seção "Instruções" da página de cada
// ritual e o conteúdo dos quadrados da home da Governança.
// ============================================================================

export const SEQUENCIA_LOGICA = 'Sequência lógica do mês: estratégia → resultado econômico → performance → governança';

export const REGRA_DE_OURO = 'Todo desvio deve gerar causa, decisão, responsável e próximo passo.';

export const COMO_CONDUZIMOS = 'Curtas, produtivas, pontuais e com propósito · falar direto com respeito · trazer problemas com espírito de solução · registrar decisões, dono e prazo.';

export const RITUAIS = {
  OKR: {
    sigla: 'OKR',
    semanaLabel: '1ª semana',
    titulo: 'Revisão dos OKRs',
    termo: 'OKR = Objectives and Key Results; desdobra o plano em objetivos e resultados-chave mensuráveis.',
    objetivo: 'Revisar o avanço das prioridades estratégicas do mês e remover travas.',
    analisar: 'Status por objetivo, KRs em risco, desvios, causas, decisões e responsáveis.',
    porque: 'Mantém a visão viva, evita dispersão e conecta planejamento com execução.',
    saida: 'Prioridades reordenadas, travas escaladas e próximos passos definidos.',
  },
  DRE: {
    sigla: 'DRE',
    semanaLabel: '2ª semana',
    titulo: 'Análise do DRE Gerencial',
    termo: 'DRE = Demonstrativo de Resultados do Exercício; mostra como receita, custos e despesas formam o resultado.',
    objetivo: 'Entender se a estratégia está gerando saúde econômica e sustentabilidade.',
    analisar: 'Receita, custos, despesas, margens, planejado x realizado e análises vertical/horizontal.',
    porque: 'Revela a qualidade do crescimento e antecipa ajustes antes que o problema vire crise.',
    saida: 'Decisões sobre cortes, alocações, correções de rota e atenção ao caixa.',
  },
  KPI: {
    sigla: 'KPI',
    semanaLabel: '3ª semana',
    titulo: 'Análise dos KPIs',
    termo: 'KPI = Key Performance Indicator; indicador-chave que acompanha, de forma contínua, a performance de cada área/líder.',
    objetivo: 'Avaliar a execução operacional e ministerial com base em evidências.',
    analisar: 'Até 5 indicadores por área, tendência, meta x realizado, gargalos, produtividade, qualidade e pessoas.',
    porque: 'Tira a gestão do achismo, dá previsibilidade e mostra se os líderes estão sustentando a estratégia.',
    saida: 'Planos de ação por área, correção de gargalos e accountability dos líderes.',
  },
  CC: {
    sigla: 'CC',
    semanaLabel: '4ª semana',
    titulo: 'Reunião do Conselho Consultivo',
    termo: 'Fórum de governança e aconselhamento; integra visão externa, discernimento e accountability.',
    objetivo: 'Avaliar se a igreja segue na direção certa e decidir temas de maior impacto.',
    analisar: 'Síntese de OKRs, DRE e KPIs, riscos, expansão, investimentos, inovação e decisões estruturais.',
    porque: 'Reduz vieses, amplia prudência e protege o futuro da organização.',
    saida: 'Recomendações claras, temas sensíveis amadurecidos e decisões estruturais melhor embasadas.',
  },
};

// Ordem dos quadrados da home (o ciclo executivo do mês).
export const ORDEM_RITUAIS = ['OKR', 'DRE', 'KPI', 'CC'];

// Filtro de período das páginas de ritual (recorte do relatório/linha do tempo).
export const PERIODOS = [
  { dias: 30, label: '30 dias' },
  { dias: 60, label: '60 dias' },
  { dias: 90, label: '90 dias' },
  { dias: 180, label: '180 dias' },
  { dias: 365, label: '1 ano' },
  { dias: 1825, label: '5 anos' },
];

// Escopo da reunião de OKR (blocos de Área Responsável da cabeça do Juninho).
export const ESCOPOS_OKR = ['Todos', 'Ministerial', 'Criativo', 'Operações'];
