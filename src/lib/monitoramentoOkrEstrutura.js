// ============================================================================
// Estrutura FIEL da planilha "CBRio_cabeca_Juninho" (aba "KPIs 2026")
// 1 NSM → 9 OKRs (3 blocos de Área Responsável) → ~25 indicadores táticos.
//
// Vive num módulo compartilhado porque é lida por DUAS telas:
//   - /monitoramento-okr (vitrine do Pr. Juninho · read-only)
//   - /governanca/okr (reunião mensal de OKR · lê a MESMA estrutura)
// Assim as duas nunca derivam. Este módulo é ESTRUTURA + avaliação; os valores
// vivos vêm de GET /api/painel/monitoramento-okr (metricas[chave]).
//
//   live      → chave da métrica viva em metricas[live] (backend)
//   fixo      → número oficial estático (Pr. Juninho · módulo-fim, não sai daqui)
//   alvoNum   → alvo numérico p/ colorir · cmp: gte | lte | range (+alvoMax)
//   precisa   → o que falta pra puxar automático (mostra ao expandir)
//   ressalva  → aviso que aparece MESMO COM número (fonte parada, base frágil).
//               ⚠️ Diferente de `precisa`, que só aparece quando NÃO há número:
//               aqui o número existe e é o que não se pode citar sem a ressalva.
//   comparaLive → chave da métrica viva EQUIVALENTE a um número `fixo`. Mostra
//                 "o sistema calcula X" ao lado do número da planilha, SEM
//                 trocá-lo. Existe porque os dois divergem por BASE (a planilha
//                 divide por 3.000, o sistema por membros ativos) e por
//                 definição — trocar sem decidir a régua faria o indicador
//                 "piorar" por mudança de critério, não por mudança de vida.
// ============================================================================

export const PRIMARY = '#00B39D';
export const VERDE = '#10B981';
export const VERMELHO = '#EF4444';
export const CINZA = '#9CA3AF';

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// ── Formata número no padrão pt-BR ──
export const fmt = (v, casas = 1) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: 0 });

// ── 'YYYY-MM' → 'mai' ──
export const mesLabel = (ym) => {
  const m = parseInt(String(ym).slice(5, 7), 10);
  return MESES_CURTOS[m - 1] || ym;
};

// ── Avalia o valor vivo contra o alvo · verde no alvo, vermelho fora.
//    Sem alvo numérico comparável → neutro (sem julgar). ──
export function avaliar(valor, cfg) {
  if (valor == null || !cfg || cfg.alvoNum == null) return { cor: PRIMARY, ok: null };
  let ok;
  if (cfg.cmp === 'gte') ok = valor >= cfg.alvoNum;
  else if (cfg.cmp === 'lte') ok = valor <= cfg.alvoNum;
  else if (cfg.cmp === 'range') ok = valor >= cfg.alvoNum && valor <= cfg.alvoMax;
  else return { cor: PRIMARY, ok: null };
  return { cor: ok ? VERDE : VERMELHO, ok };
}

export const NSM = {
  texto: 'Novos convertidos engajados em pelo menos um dos valores da CBRio em até 60 dias da decisão',
  alvo: '≥ 50%',
  objetivo: 'Apurar se a missão está sendo realizada de maneira eficaz, não só alcançando, mas engajando em uma jornada de crescimento espiritual',
};

export const BLOCOS = [
  {
    area: 'Ministerial',
    papel: 'Move a NSM',
    okrs: [
      {
        nome: 'Novos Convertidos presentes no Acompanhamento "1º Encontro"',
        alvo: '≥70% dos convertidos',
        objetivo: 'Analisar a eficácia do funil de engajamento do novo convertido',
        envolvida: 'Cuidados',
        // Número oficial no topo do card (Pr. Juninho · módulo-fim, não sai dado daqui).
        fixo: { valor: 73, unidade: '%' }, alvoNum: 70, cmp: 'gte',
        taticos: [
          // Valores estáticos (Pr. Juninho) · módulo-fim, não saem pro sistema.
          { ind: 'Prazo médio para primeiro contato', alvo: '3 dias entre a conversão e o contato do pastor', fixo: { valor: 24, unidade: 'h' }, alvoNum: 72, cmp: 'lte' },
          { ind: '% de novos convertidos com primeiro contato feito', alvo: '70%', fixo: { valor: 100, unidade: '%' }, alvoNum: 70, cmp: 'gte' },
          // ⚠️ Régua trocada em 25/08/2026 (Matheus): "fez o Next" = esteve em PELO MENOS UM
          // encontro, NÃO "formado". O relatório de agosto trazia 6,0% porque contou
          // `next_matriculas.status='formado'` (status por TURMA, proibido pela lei do projeto).
          { ind: '% Pessoas com 1° contato que foram a ≥1 encontro do Next', alvo: '50%', live: 'next_pos_contato', alvoNum: 50, cmp: 'gte', casas: 1 },
        ],
      },
      {
        nome: 'Engajamento médio nos valores',
        alvo: '≥ 50%',
        objetivo: 'Avaliar engajamento dos membros no crescimento espiritual e no suporte ao crescimento da Igreja',
        envolvida: 'Grupos, Voluntariado e Generosidade',
        // Topo do card = média das 3 porcentagens abaixo (soma ÷ 3) · meta 50%.
        media: true, alvoNum: 50, cmp: 'gte',
        taticos: [
          // Valores estáticos (Pr. Juninho) · contagem real de cada área ÷ base definida pelo Juninho (módulo-fim, não sai dado daqui).
          { ind: '% frequência em Grupos', alvo: '60%', fixo: { valor: 48, unidade: '%', detalhe: '1.431 em grupos ativos · base 3.000 membros.' }, comparaLive: 'freq_grupos', alvoNum: 60, cmp: 'gte', casas: 1 },
          // ⚠️⚠️ Régua confirmada pelo Matheus em 25/08/2026: ATIVO = SERVIU (check-in) nos
          // últimos 3 meses · BASE = todo mundo com cadastro de voluntário ativo. TROCA A
          // PERGUNTA — antes era "cadastro ÷ membros ativos" (29,8%), com um numerador que
          // só cresce (`mem_voluntarios.ate` preenchido em ZERO linhas) e 156 pessoas que
          // nem eram membro. ⚠️ Escalado÷escalado daria 96,9% e não discriminaria.
          { ind: '% Voluntários ativos', alvo: '60%', live: 'volunt_ativos_base', alvoNum: 60, cmp: 'gte', casas: 1,
            ressalva: 'Régua nova (25/08): ATIVO = serviu (fez check-in) nos últimos 3 meses · BASE = todos com cadastro de voluntário ativo. A diferença em relação aos 29,8% da planilha é MUDANÇA DE PERGUNTA, não de operação — a base deixou de ser os membros da igreja e passou a ser o cadastro de voluntários. ⚠️ O numerador depende de o check-in ter sido feito: a adesão varia por equipe (de 38% no Apoio GC a 100% em Batismo, Bateria e Mesa de corte), então parte de quem aparece como inativo pode ter servido sem registrar. ⚠️ `vol_check_ins` só existe desde 15/04/2026 — janela maior que ~4 meses ainda não tem dado.' },
          { ind: '% dizimistas regulares', alvo: '60%', fixo: { valor: 28.5, unidade: '%', detalhe: '856 dizimistas · base 3.000 membros.' }, comparaLive: 'dizimistas', alvoNum: 60, cmp: 'gte', casas: 1,
            ressalva: '⚠️ FONTE PARADA. A última contribuição nominal em `mem_contribuicoes` é de 16/06/2026 — a base que alimenta este número não recebe lançamento há mais de dois meses. E o cruzamento contribuição↔pessoa praticamente não existe: das 131.228 receitas em `fin_transacoes`, 9 têm membro identificado (0,007%). Qualquer % de dizimistas hoje é piso, não medida.' },
        ],
      },
      {
        nome: 'Batismos Realizados',
        alvo: '≥30% dos convertidos em 90 dias',
        objetivo: 'Avaliar consolidação da decisão tomada',
        envolvida: 'Integração',
        live: 'okr_batismos', alvoNum: 30, cmp: 'gte',
        taticos: [
          // Mesma base do cabeçalho do box (batismos ÷ convertidos · 90d). Vermelho < 30%, verde ≥ 30%.
          { ind: '% de convertidos batizados (90 dias)', alvo: '≥30% dos convertidos', live: 'okr_batismos', alvoNum: 30, cmp: 'gte', casas: 1 },
          { ind: 'Tempo médio de decisão até o batismo', alvo: '90 dias', memoria: 'Nº de batizandos x convertidos nos últimos 90 dias — mensal', live: 'tempo_batismo', alvoNum: 90, cmp: 'lte' },
        ],
      },
    ],
  },
  {
    area: 'Criativo',
    papel: 'Amplifica a NSM',
    okrs: [
      {
        nome: 'Alcance Culto Online',
        alvo: '+20% YoY',
        objetivo: 'Ampliar o alcance da mensagem da igreja por meio do culto online, alcançando novas pessoas e fortalecendo a conexão com a comunidade digital.',
        envolvida: 'Online / Produção / Marketing',
        taticos: [
          // DS online (views do Dia Seguinte) · crescimento YoY real · verde ≥ +20%.
          { ind: 'DS online · crescimento YoY', alvo: '+20% YoY', live: 'ds_online', alvoNum: 20, cmp: 'gte', casas: 1 },
          { ind: '% de decisões com follow up', alvo: '≥50% com follow up realizado', fixo: { valor: 17.5, unidade: '%', detalhe: '≈317 de 1.821 decisões online com follow-up · média anual.' }, alvoNum: 50, cmp: 'gte', casas: 1 },
          { ind: 'NPS de culto online', alvo: 'Nota ≥ 9', memoria: 'Nota lançada por área no painel do culto (fonte nps_culto · área Online)', live: 'nps_culto_online', alvoNum: 9, cmp: 'gte', casas: 1, precisa: 'a área Online aplicar a pesquisa — o caminho já está ligado, falta a primeira nota' },
        ],
      },
      {
        nome: 'Experiência Presencial',
        alvo: '+20% YoY',
        objetivo: 'Proporcionar uma experiência presencial fluida, acolhedora e tecnicamente excelente, favorecendo o engajamento e a permanência das pessoas no culto.',
        envolvida: 'Produção / Adoração / Marketing / Online',
        taticos: [
          { ind: 'NPS de culto presencial', alvo: 'Nota ≥ 9', memoria: 'Média das áreas presenciais que já aplicaram a pesquisa · o detalhe diz quais entraram', live: 'nps_culto_presencial', alvoNum: 9, cmp: 'gte', casas: 1, precisa: 'as áreas que ainda não aplicaram a pesquisa (hoje só o AMI tem nota)' },
          { ind: '% de assentos ocupados', alvo: '30% a 80% (base 1050)', memoria: 'Ação em conjunto com a Integração', live: 'assentos', alvoNum: 30, alvoMax: 80, cmp: 'range' },
          // Fonte viva = aba Produção de Culto (culto_producao.duracao_minutos vs
          // meta de 60 min). Os cultos passados (jan–jun/2026) entraram com o tempo
          // TOTAL medido pela Produção; daqui pra frente a contagem é por momento.
          { ind: 'Índice de atrasos (pontualidade final)', alvo: 'Até 5 minutos', memoria: 'Tempo de encerramento do culto vs. roteiro de 60 min · fonte: Produção de Culto', live: 'atraso_culto', alvoNum: 5, cmp: 'lte', casas: 1 },
        ],
      },
      {
        nome: 'Engajamento de Conteúdo',
        alvo: '+25% YoY',
        objetivo: 'Estimular a interação e o relacionamento da igreja com os conteúdos institucionais, fortalecendo a comunicação e o senso de pertencimento',
        envolvida: 'Marketing / Online',
        taticos: [
          { ind: 'Retenção média em vídeos', alvo: '≥40%', live: 'eng_retencao', alvoNum: 40, cmp: 'gte' },
          { ind: 'Taxa de compartilhamento', alvo: '≥5%', live: 'eng_compartilhamento', alvoNum: 5, cmp: 'gte' },
          // Taxa de engajamento real do YouTube (curtidas + comentários ÷ views). Real ~7% · alvo ≥5%.
          { ind: 'Taxa de engajamento no YouTube', alvo: '≥5%', live: 'eng_interacao', alvoNum: 5, cmp: 'gte', casas: 1 },
        ],
      },
    ],
  },
  {
    area: 'Operações',
    papel: 'Sustenta a NSM',
    okrs: [
      {
        nome: 'Eficiência financeira',
        alvo: '80% de assertividade planejado x realizado',
        objetivo: 'Consolidar o processo de planejamento financeiro, visando ter uma maior previsibilidade de gastos',
        envolvida: 'Gestão estratégica / Financeiro',
        taticos: [
          { ind: '% de despesas dentro do orçamento', alvo: '80%', memoria: 'Acompanhamento do planejado vs executado no LouvaDeus e no Power BI', precisa: 'o planejado vs realizado (exportação do LouvaDeus / Power BI ou integração)' },
          { ind: '% fundo reserva', alvo: '100% dos 10%', memoria: 'Lançado no centro de custo FUNDO DE RESERVA ÷ 10% da arrecadação do mês', live: 'fundo_reserva', alvoNum: 100, cmp: 'gte', casas: 1 },
          { ind: '% cumprimento de prazos de pagamento internos e externos', alvo: '90%', memoria: 'Contas pagas até o vencimento ÷ contas pagas no mês · módulo Contas a Pagar', live: 'pagamentos_prazo', alvoNum: 90, cmp: 'gte', casas: 1 },
        ],
      },
      {
        nome: 'Cultura e Saúde do Staff',
        alvo: '≥ 4,3 no Q12',
        objetivo: 'Melhorar o clima organizacional do staff CBRio com ações baseadas na cultura',
        envolvida: 'RH',
        taticos: [
          { ind: 'Nota Q12', alvo: '≥ 4,3 no Q12', memoria: 'Avaliação pela plataforma do Gallup', live: 'q12', alvoNum: 4.3, cmp: 'gte', casas: 2 },
          { ind: 'Engajamento nos treinamentos propostos', alvo: '80%', memoria: 'Criação de planilha de presença', precisa: 'a presença nos treinamentos (o RH já tem rh_treinamentos — confirmo se está sendo preenchido e puxo)' },
          { ind: 'Rotatividade do Staff', alvo: '< 10%', memoria: 'Acompanhamento por meio da planilha de pessoal', live: 'rotatividade', alvoNum: 10, cmp: 'lte' },
        ],
      },
      {
        nome: 'Prontidão de Expansão e estrutura',
        alvo: '80% de cumprimento de cronograma',
        objetivo: 'Assegurar uma maior criticidade em relação às boas práticas de áreas correlatas ao processo de expansão.',
        envolvida: 'Gestão estratégica / Infraestrutura',
        taticos: [
          { ind: '% cronogramas cumpridos no prazo', alvo: '80%', memoria: 'Medição com base no calendário institucional da CBRio', precisa: 'os marcos do cronograma de expansão com data prevista vs realizada (módulo Expansão)' },
          { ind: '% orçamentos respeitados', alvo: '80%', memoria: 'Relatórios com memórias de cálculo atreladas à compra', precisa: 'o orçado vs gasto por obra/projeto de expansão' },
        ],
      },
    ],
  },
];

// ── Valor exibido no topo do card de OKR ──
//   fixo → número oficial · media → média das porcentagens dos táticos · live → automático
export function valorTopoOkr(okr, metricas) {
  if (okr.fixo) {
    const aval = avaliar(okr.fixo.valor, okr);
    return { valor: okr.fixo.valor, unidade: okr.fixo.unidade || '%', cor: aval.cor, casas: okr.casas, label: 'oficial' };
  }
  if (okr.media) {
    const vals = (okr.taticos || [])
      .map((t) => (t.fixo ? Number(t.fixo.valor) : Number(metricas[t.live]?.valor)))
      .filter((v) => Number.isFinite(v));
    if (vals.length) {
      const media = vals.reduce((a, b) => a + b, 0) / vals.length;
      const aval = avaliar(media, okr);
      return { valor: media, unidade: '%', cor: aval.cor, casas: 1, label: 'média' };
    }
  }
  if (okr.live) {
    const m = metricas[okr.live];
    if (m) {
      const aval = avaliar(m.valor, okr);
      return { valor: m.valor, unidade: m.unidade, cor: aval.cor, casas: okr.casas, label: 'automático' };
    }
  }
  return null;
}

// ── Resolve o valor de um tático (vivo ou fixo) ──
export function valorTatico(tatico, metricas) {
  return tatico.live ? (metricas[tatico.live] || null) : (tatico.fixo || null);
}

// ── Retrato plano de TODOS os indicadores num instante (pro snapshot da
//    reunião de OKR na Governança: congela o que estava na tela na data). ──
export function retratoIndicadores(metricas) {
  const linhas = [];
  for (const bloco of BLOCOS) {
    for (const okr of bloco.okrs) {
      const topo = valorTopoOkr(okr, metricas);
      linhas.push({
        nivel: 'okr', bloco: bloco.area, nome: okr.nome, alvo: okr.alvo,
        valor: topo ? topo.valor : null, unidade: topo ? topo.unidade : null,
        ok: topo ? avaliar(topo.valor, okr).ok : null,
      });
      for (const t of okr.taticos) {
        const m = valorTatico(t, metricas);
        linhas.push({
          nivel: 'tatico', bloco: bloco.area, okr: okr.nome, nome: t.ind, alvo: t.alvo,
          valor: m ? m.valor : null, unidade: m ? m.unidade : null,
          ok: m ? avaliar(m.valor, t).ok : null,
        });
      }
    }
  }
  return linhas;
}
