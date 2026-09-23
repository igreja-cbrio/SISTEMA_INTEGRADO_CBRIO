// ════════════════════════════════════════════════════════════════════════════
//  "De onde sai esse número?" — a ficha de procedência de um KPI
//
//  Pedido do Matheus (23/09/2026), depois de a Renata (responsável do Online)
//  encher de dúvidas sobre o ONL-17: *"ela perguntou desde quando esse kpi ta
//  medindo, qual a periodicidade dele, de onde sai os dados que alimenta ele e
//  etc. Queria que tivesse uma funcionalidade para eu clicar nos cards de cada
//  kpi e ter essas informacoes."*
//
//  ⚠️⚠️ A FICHA NÃO PODE INVENTAR FONTE. O catálogo abaixo foi EXTRAÍDO da
//  função `_kpi_agregar_dado` em 23/09/2026 (as tabelas de cada ramo saíram de
//  `regexp_matches(bloco, 'public\.([a-z_]+)')`), não de memória. Dizer "vem da
//  tabela X" sobre um número que vem de outro lugar é pior que não dizer nada —
//  a pessoa para de perguntar e passa a confiar no errado.
//
//  ⚠️ E a ficha serve para DIAGNOSTICAR, não só descrever. Medido no mesmo dia:
//  **22 KPIs ativos apontam para um `dado_tipo` que NÃO TEM RAMO no SQL** — eles
//  nunca serão calculados. É o caso do ONL-18 ("% voluntários em treinamento"),
//  que mostra "0 atual · Crítico" não porque ninguém treina, mas porque o
//  cálculo não existe. A ficha diz isso em vez de deixar a pessoa concluir que
//  a área está mal.
// ════════════════════════════════════════════════════════════════════════════

// Ramos IMPLEMENTADOS em `_kpi_agregar_dado`, com a fonte real de cada um.
// ⚠️ `fonte` é a lista de tabelas que o ramo consulta — extraída do SQL.
// ⚠️ `conta` é a frase que responde "o que esse número significa", em português
// de quem usa, não de quem programou.
const CATALOGO = Object.freeze({
  voluntarios_checkin: {
    fonte: 'vol_schedules × vol_check_ins (por vol_teams.area)',
    conta: 'Escalas da área que tiveram check-in registrado, divididas por TODAS as escalas da área.',
    // ⚠️ A ressalva que respondeu a dúvida da Renata: o indicador mede REGISTRO,
    // não presença. Voluntário que serviu e não passou pelo check-in conta como
    // ausente.
    ressalva: 'Mede o REGISTRO, não a presença: quem serviu e não passou pelo check-in entra como ausente. O crédito vai para o mês do CULTO, não do dia em que o check-in foi lançado.',
    // ⚠️ Os rótulos da tabela mês a mês moram AQUI, colados na fonte, e não na
    // tela. Rótulo longe da definição é rótulo que envelhece sozinho: a fonte
    // muda, a coluna continua dizendo "escalas" sobre outra coisa.
    partes: { denominador: 'escalas', numerador: 'com check-in' },
  },
  voluntarios_ativos: {
    fonte: 'mem_voluntarios',
    conta: 'Vínculos de voluntariado em aberto (sem data de saída) na área.',
  },
  batismos: { fonte: 'batismo_inscricoes', conta: 'Batismos realizados no período.' },
  conversoes: { fonte: 'cultos', conta: 'Decisões registradas nos cultos do período.' },
  devocionais: { fonte: 'mem_devocionais', conta: 'Devocionais concluídos no período.' },
  doacoes_valor: { fonte: 'vw_doacoes_unificada', conta: 'Valor doado no período.' },
  doadores_count: { fonte: 'mem_contribuicoes', conta: 'Pessoas distintas que contribuíram no período.' },
  frequencia_culto: { fonte: 'cultos', conta: 'Público registrado nos cultos do período.' },
  frequencia_grupos: {
    fonte: 'mem_grupo_encontros × mem_grupo_encontro_presencas',
    conta: 'Presenças registradas nos encontros de grupo do período.',
    ressalva: 'Depende de o líder registrar a chamada — encontro sem chamada não entra.',
  },
  grupos_ativos: { fonte: 'mem_grupos', conta: 'Grupos ativos da área.' },
  inscricoes_jornada180: { fonte: 'cui_jornada', conta: 'Inscrições na Jornada 180 no período.' },
  lideres_acompanhados: {
    fonte: 'grupo_supervisao_visitas × mem_grupos',
    conta: 'Líderes distintos que receberam visita de supervisão no período.',
  },
  lideres_treinados: { fonte: 'mem_grupo_membros × mem_grupos', conta: 'Líderes em treinamento nos grupos.' },
  nps_next: { fonte: 'dados_brutos', conta: 'Nota de NPS do Next informada no período.' },
});

/** Como o valor é apurado, em português. */
const COMO_CALCULA = Object.freeze({
  soma_periodo: 'Soma/apura o dado do próprio período.',
  delta_pct: 'Variação percentual contra o período de comparação.',
  delta_abs: 'Variação absoluta contra o período de comparação.',
  razao: 'Razão entre dois dados do período.',
  manual: 'Preenchido à mão — o sistema não calcula.',
});

const PERIODO_LABEL = Object.freeze({
  semanal: 'toda semana', mensal: 'todo mês', trimestral: 'a cada trimestre',
  semestral: 'a cada semestre', anual: 'uma vez por ano',
});

/**
 * A ficha de um KPI.
 *
 * @param kpi          linha de `kpi_indicadores_taticos`
 * @param historico    { primeiro_periodo, ultimo_periodo, total_periodos } de
 *                     `kpi_valores_calculados` ou `kpi_registros`
 */
function montarProcedencia(kpi, historico = {}) {
  if (!kpi || typeof kpi !== 'object') return null;

  const tipoCalculo = String(kpi.tipo_calculo || '').trim() || 'manual';
  const dadoTipo = kpi.formula_config && typeof kpi.formula_config === 'object'
    ? String(kpi.formula_config.dado_tipo || '').trim()
    : '';
  const entrada = dadoTipo ? CATALOGO[dadoTipo] : null;
  const automatico = tipoCalculo !== 'manual';

  // ⚠️⚠️ O DIAGNÓSTICO QUE A FICHA EXISTE PARA DAR: KPI marcado como automático,
  // apontando para um `dado_tipo` que não tem implementação, NUNCA vai calcular.
  // Medido em 23/09: 22 KPIs ativos nessa situação. Sem esta linha, a pessoa lê
  // "0 · Crítico" e conclui que a área está mal — quando o cálculo é que não
  // existe. `manual` com dado_tipo sem ramo é normal: espera preenchimento.
  const semImplementacao = automatico && !!dadoTipo && !entrada;

  return {
    kpi_id: kpi.id || null,
    indicador: kpi.indicador || null,
    area: kpi.area || null,
    periodicidade: kpi.periodicidade || null,
    quando: PERIODO_LABEL[String(kpi.periodicidade || '').toLowerCase()] || null,
    meta: kpi.meta_valor ?? kpi.meta_valor_absoluto ?? null,
    sentido_meta: kpi.sentido_meta || null,
    automatico,
    como_calcula: COMO_CALCULA[tipoCalculo] || null,
    tipo_calculo: tipoCalculo,
    dado_tipo: dadoTipo || null,
    fonte: entrada?.fonte || null,
    conta: entrada?.conta || null,
    ressalva: entrada?.ressalva || null,
    // Só os `dado_tipo` cujo ramo sabe abrir o número em partes têm rótulo.
    rotulo_partes: entrada?.partes || null,
    sem_implementacao: semImplementacao,
    // ⚠️ "desde quando" é o PRIMEIRO PERÍODO com valor, não a data de cadastro
    // do KPI — foi exatamente essa confusão (`desde` = cadastro lido como
    // "dias sem check-in") que fez o agente de voluntariado acusar 42 pessoas.
    desde: historico.primeiro_periodo || null,
    ate: historico.ultimo_periodo || null,
    periodos_medidos: Number.isFinite(Number(historico.total_periodos))
      ? Number(historico.total_periodos) : 0,
    // Sem nenhum período, a ficha diz "nunca mediu" em vez de fingir um começo.
    nunca_mediu: !historico.primeiro_periodo,
  };
}

module.exports = { CATALOGO, COMO_CALCULA, PERIODO_LABEL, montarProcedencia };
