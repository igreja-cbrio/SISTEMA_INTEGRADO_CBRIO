// =====================================================================
// Planejamento Anual · regras de negócio PURAS (2026-08-12)
// =====================================================================
// 100% dado-entra-dado-sai: SEM import de supabase, SEM Date.now() em
// regra (datas chegam por parâmetro). Este arquivo é a REFERÊNCIA das
// regras do módulo — as rotas (planejamentoAnual.js) e a RPC de
// publicação (fn_plan_publicar_ciclo · rede de segurança transacional)
// espelham o que está aqui. Testado em src/test/planejamentoAnualRegras.test.ts.
//
// Datas são strings 'YYYY-MM-DD' (comparação lexicográfica) e horas
// 'HH:MM' — nunca new Date() sobre string (lei de TZ do projeto).
// Dinheiro em number (numeric(14,2) do banco); rateio em CENTAVOS
// inteiros pra soma bater exata.
// =====================================================================

// ── [SUPOSIÇÃO]s do protótipo · isoladas pra troca barata ───────────────
// Confirmar com o Pastor/Marcos; mudar aqui + testes = mudança completa.
const SUPOSICOES = {
  // [SUPOSIÇÃO 1] Conflito de ESPAÇO vale entre naturezas DIFERENTES
  // (restrição física de local · não confirmado com a diretoria).
  espacoEntreNaturezasDiferentes: true,
  // [SUPOSIÇÃO 2] Aprovada com ressalvas SÓ entra no calendário depois
  // que o Pastor marca a ressalva como verificada.
  ressalvaVerificadaAntesDoCalendario: true,
  // [SUPOSIÇÃO 3] Rateio orçamentário UNIFORME do líquido pelos meses
  // ocupados (evolução prevista: cronograma de desembolso por proposta).
  rateioUniforme: true,
  // Prazo padrão (dias corridos) de retificação e de ressalva.
  prazoDias: 5,
};

// ── Constantes de negócio (textos EXATOS do protótipo · lei do spec) ────
const CRITERIOS = [
  { chave: 'relevancia', titulo: 'Relevância', descricao: 'Alcance sobre o público-alvo: 80% da igreja, ou 80% do recorte geracional.' },
  { chave: 'pertencimento', titulo: 'Pertencimento', descricao: 'Trazer pessoas para a igreja pela nossa cultura, por aquilo que nos pertence.' },
  { chave: 'transformacao', titulo: 'Transformação', descricao: 'Contribuição para os cinco valores, conforme as justificativas. A nota não varia com a quantidade marcada.' },
  { chave: 'visao', titulo: 'Visão CBRio', descricao: 'Contribuição para 5 anos, 5 igrejas, 50 mil vidas.' },
  { chave: 'impacto', titulo: 'Impacto', descricao: 'Cativar as pessoas que vêm à CBRio pelo que a CBRio é, e não por ações pontuais.' },
  { chave: 'custo', titulo: 'Custo', descricao: 'Proporcionalidade do custo ao alcance e ao resultado esperado.' },
  { chave: 'sustentabilidade', titulo: 'Sustentabilidade financeira', descricao: 'Adequação do modelo de custeio ao propósito do projeto.' },
];

const VALORES_IGREJA = [
  'Seguir a Jesus',
  'Conectar-se com Pessoas',
  'Investir Tempo com Deus',
  'Servir em comunidade',
  'Viver generosamente',
];

const CAMPOS_APONTAVEIS = [
  { chave: 'nome', rotulo: 'Nome' },
  { chave: 'natureza', rotulo: 'Natureza' },
  { chave: 'area', rotulo: 'Área' },
  { chave: 'lider', rotulo: 'Líder responsável' },
  { chave: 'quando', rotulo: 'Período e recorrência' },
  { chave: 'local', rotulo: 'Local' },
  { chave: 'publico', rotulo: 'Público-alvo' },
  { chave: 'descricao', rotulo: 'Descrição' },
  { chave: 'alcance', rotulo: 'Alcance estimado' },
  { chave: 'pertencimento', rotulo: 'Pertencimento' },
  { chave: 'transformacao', rotulo: 'Transformação e valores' },
  { chave: 'visao', rotulo: 'Visão CBRio' },
  { chave: 'impacto', rotulo: 'Impacto' },
  { chave: 'custo', rotulo: 'Custo total' },
  { chave: 'arrecadacao', rotulo: 'Arrecadação prevista' },
];

// Campos comparáveis no diff de retificação (espelha versao_anterior jsonb)
const CAMPOS_RETIFICACAO = [
  'data_inicio', 'precisao_inicio', 'data_fim', 'precisao_fim',
  'custo', 'arrecadacao_prevista', 'local_id', 'descricao',
];

// Transições legais da coluna `estado` (única fonte gravável · derivados
// em_avaliacao/ranqueada/no_calendario NUNCA entram aqui).
const TRANSICOES = {
  rascunho: ['enviada'],
  enviada: ['aprovada', 'aprovada_ressalvas', 'reprovada', 'arquivada'],
  aprovada: ['enviada'],              // retirar do calendário (revoga a decisão)
  aprovada_ressalvas: ['enviada'],    // retirar do calendário
  reprovada: ['retificada', 'arquivada'],
  retificada: ['aprovada', 'aprovada_ressalvas', 'arquivada', 'enviada'], // 'enviada' = reaberta pros diretores
  arquivada: [],
};

// ── Datas/horas puras (strings · sem TZ) ────────────────────────────────
const mesDe = (dataStr) => parseInt(String(dataStr).slice(5, 7), 10);

function somarDias(dataStr, dias) {
  const [y, m, d] = String(dataStr).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dias)); // aritmética de calendário em UTC puro
  return dt.toISOString().slice(0, 10);
}

function horariosSobrepoem(a, b) {
  // Corrige o bug do protótipo: exige os QUATRO horários (hora_fim null
  // no protótipo retornava false silenciosamente só checando hIni).
  if (!a.hora_inicio || !a.hora_fim || !b.hora_inicio || !b.hora_fim) return false;
  return a.hora_inicio < b.hora_fim && b.hora_inicio < a.hora_fim; // 'HH:MM' lexicográfico
}

// ── Custeio derivado (nunca declarado) ──────────────────────────────────
function liquido(p) {
  const arrec = p.tem_arrecadacao ? Number(p.arrecadacao_prevista || 0) : 0;
  return Math.round((Number(p.custo || 0) - arrec) * 100) / 100;
}

function modeloCusteio(p) {
  const arrec = p.tem_arrecadacao ? Number(p.arrecadacao_prevista || 0) : 0;
  const custo = Number(p.custo || 0);
  if (!p.tem_arrecadacao || arrec === 0) return { tipo: 'integral', rotulo: 'Custeio integral pela igreja' };
  if (arrec < custo) return { tipo: 'parcial', rotulo: 'Custeio parcial' };
  return { tipo: 'autossustentado', rotulo: 'Autossustentado pela arrecadação' };
}

// Meses (1-12) ocupados pela proposta. Datas reais + CHECK do banco
// (data_fim >= data_inicio) tornam a virada de ano impossível por
// construção; ainda assim, degrada pra [] em dado inconsistente
// (protótipo dividia por zero aqui).
function mesesOcupados(p) {
  const ini = mesDe(p.data_inicio);
  const fim = p.multi_dia && p.data_fim ? mesDe(p.data_fim) : ini;
  if (!Number.isFinite(ini) || !Number.isFinite(fim) || fim < ini) return [];
  const ms = [];
  for (let m = ini; m <= fim; m += 1) ms.push(m);
  return ms;
}

// Rateio mensal do líquido [SUPOSIÇÃO 3 · uniforme]. Em CENTAVOS
// inteiros com distribuição de resto → a soma dos meses bate EXATA com
// o líquido total (teste de aceitação 10; float ingênuo não garante).
function rateioMensal(p) {
  const ms = mesesOcupados(p);
  const porMes = new Array(12).fill(0);
  if (!ms.length) return porMes;
  const totalCent = Math.round(liquido(p) * 100);
  const base = Math.trunc(totalCent / ms.length);
  let resto = totalCent - base * ms.length; // pode ser negativo se líquido < 0
  const passo = resto >= 0 ? 1 : -1;
  ms.forEach((m, i) => {
    let cent = base;
    if (resto !== 0) { cent += passo; resto -= passo; }
    porMes[m - 1] = cent / 100;
  });
  return porMes;
}

// ── Decisões (append-only) e estados ────────────────────────────────────
function decisaoVigente(decisoes) {
  const ativas = (decisoes || []).filter((d) => !d.revogada_em);
  if (!ativas.length) return null;
  return ativas.reduce((max, d) => (d.rodada > max.rodada ? d : max), ativas[0]);
}

function ressalvaVerificada(decisoes) {
  const d = decisaoVigente(decisoes);
  return Boolean(d && d.decisao === 'aprovada_ressalvas' && d.ressalva_cumprida_em);
}

// A proposta entra no calendário? [SUPOSIÇÃO 2 na regra de ressalva]
function noCalendario(proposta, decisoes, suposicoes = SUPOSICOES) {
  if (proposta.deleted_at) return false;
  if (proposta.estado === 'aprovada') return true;
  if (proposta.estado === 'aprovada_ressalvas') {
    return suposicoes.ressalvaVerificadaAntesDoCalendario ? ressalvaVerificada(decisoes) : true;
  }
  return false;
}

// Estado DERIVADO pra exibição (nunca persistido).
function estadoDerivado(proposta, numAvaliacoes, quorum) {
  if (proposta.estado === 'enviada') {
    return numAvaliacoes >= quorum ? 'ranqueada' : 'em_avaliacao';
  }
  return proposta.estado;
}

function podeTransicionar(de, para) {
  return (TRANSICOES[de] || []).includes(para);
}

// ── Validações de entrada ────────────────────────────────────────────────
function validarEnvio(proposta, ciclo) {
  const erros = [];
  if (!ciclo || !ciclo.submissao_aberta) {
    erros.push('A janela de submissão está fechada, então o envio está desabilitado.');
  }
  if (!proposta.nome || !String(proposta.nome).trim()) erros.push('Nome é obrigatório.');
  if (!proposta.natureza) erros.push('Natureza é obrigatória.');
  if (!proposta.area) erros.push('Área é obrigatória.');
  if (!proposta.lider_id) erros.push('Líder responsável é obrigatório.');
  if (!proposta.data_inicio) erros.push('Mês de início é obrigatório.');
  if (!proposta.local_id) erros.push('Local é obrigatório.');
  if (proposta.alcance_pct == null) erros.push('Alcance estimado é obrigatório.');
  const valores = Array.isArray(proposta.valores) ? proposta.valores : [];
  valores.forEach((v) => {
    if (!v || !v.justificativa || !String(v.justificativa).trim()) {
      erros.push(`Justificativa é obrigatória para o valor marcado "${v && v.nome ? v.nome : '?'}".`);
    }
    if (v && v.nome && !VALORES_IGREJA.includes(v.nome)) {
      erros.push(`Valor desconhecido: "${v.nome}".`);
    }
  });
  return erros;
}

function validarAvaliacao(notas) {
  // Os sete critérios são obrigatórios · 1 a 5 · sem "não se aplica".
  const erros = [];
  CRITERIOS.forEach((c) => {
    const n = notas ? notas['nota_' + c.chave] : null;
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      erros.push(`Nota de "${c.titulo}" é obrigatória (1 a 5).`);
    }
  });
  return erros;
}

function validarRetificacao(proposta, hoje) {
  const erros = [];
  if (proposta.estado !== 'reprovada') erros.push('Só proposta reprovada pode ser retificada.');
  if (Number(proposta.versao) >= 2) erros.push('A rodada única de retificação já foi usada.');
  if (proposta.retificacao_prazo && hoje && hoje > proposta.retificacao_prazo) {
    erros.push('O prazo de retificação expirou.');
  }
  return erros;
}

function snapshotRetificacao(proposta) {
  const snap = {};
  CAMPOS_RETIFICACAO.forEach((c) => { snap[c] = proposta[c] === undefined ? null : proposta[c]; });
  return snap;
}

function diffRetificacao(versaoAnterior, atual) {
  if (!versaoAnterior) return [];
  return CAMPOS_RETIFICACAO
    .filter((c) => {
      const antes = versaoAnterior[c] === undefined ? null : versaoAnterior[c];
      const depois = atual[c] === undefined ? null : atual[c];
      return String(antes) !== String(depois);
    })
    .map((c) => ({ campo: c, antes: versaoAnterior[c] ?? null, depois: atual[c] ?? null }));
}

// ── Ranking (Σ das 7 médias · máx 35 · desempate em cascata) ────────────
// Comparações por SOMA INTEIRA de notas (mesmo quórum pra todos os itens
// ranqueados ⇒ comparar somas ≡ comparar médias, sem ruído de float).
const collatorPtBr = new Intl.Collator('pt-BR');

function somasPorCriterio(avaliacoes) {
  return CRITERIOS.map((c) =>
    (avaliacoes || []).reduce((s, a) => s + (Number(a['nota_' + c.chave]) || 0), 0));
}

function mediasPorCriterio(avaliacoes) {
  const n = (avaliacoes || []).length;
  if (!n) return CRITERIOS.map(() => null);
  return somasPorCriterio(avaliacoes).map((s) => s / n);
}

/**
 * Ranking do ciclo. Só entram propostas com quórum completo; as demais
 * saem em `foraDoRanking` com as diretorias faltantes. Ordem: soma das 7
 * médias (desc) → critério a critério NA ORDEM do formulário (desc) →
 * alfabética pt-BR do nome. O ranking ordena a leitura, não corta.
 */
function montarRanking({ propostas, avaliacoesPorProposta, quorum, diretorias }) {
  const ranqueaveis = [];
  const foraDoRanking = [];
  (propostas || []).forEach((p) => {
    if (p.deleted_at) return;
    if (!['enviada', 'aprovada', 'aprovada_ressalvas', 'reprovada', 'retificada'].includes(p.estado)) return;
    if (p.estado === 'retificada') return; // fila do Pastor, fora do painel de ranking
    const avs = (avaliacoesPorProposta[p.id] || []).filter((a) => !a.deleted_at);
    if (avs.length < quorum) {
      const presentes = new Set(avs.map((a) => a.diretoria));
      foraDoRanking.push({
        proposta: p,
        avaliacoes: avs.length,
        faltam: (diretorias || []).filter((d) => !presentes.has(d)),
      });
      return;
    }
    const somas = somasPorCriterio(avs);
    ranqueaveis.push({
      proposta: p,
      medias: somas.map((s) => s / avs.length),
      soma: somas.reduce((t, s) => t + s, 0) / avs.length,
      _somas: somas,
      _somaTotal: somas.reduce((t, s) => t + s, 0),
    });
  });

  ranqueaveis.sort((a, b) => {
    if (b._somaTotal !== a._somaTotal) return b._somaTotal - a._somaTotal;
    for (let i = 0; i < CRITERIOS.length; i += 1) {
      if (b._somas[i] !== a._somas[i]) return b._somas[i] - a._somas[i];
    }
    return collatorPtBr.compare(a.proposta.nome || '', b.proposta.nome || '');
  });

  return {
    ranqueadas: ranqueaveis.map(({ _somas, _somaTotal, ...r }) => r),
    foraDoRanking,
  };
}

// ── Conflitos (NUNCA persistidos · recomputados sob demanda) ────────────
function mesmaData(a, b) {
  if (mesDe(a.data_inicio) !== mesDe(b.data_inicio)) return false;
  // Sem o dia (precisão mensal) a coincidência é assumida no mês.
  if (a.precisao_inicio !== 'dia' || b.precisao_inicio !== 'dia') return true;
  return a.data_inicio === b.data_inicio;
}

function colisaoFirme(a, b) {
  return a.precisao_inicio === 'dia' && b.precisao_inicio === 'dia';
}

function rotinasCoincidem(a, b) {
  if (a.dia_semana == null || b.dia_semana == null) return false;
  if (a.dia_semana !== b.dia_semana) return false;
  const ma = mesesOcupados(a);
  const mb = new Set(mesesOcupados(b));
  return ma.some((m) => mb.has(m));
}

/**
 * Detecta conflitos entre as propostas dadas (o chamador decide o
 * conjunto: em geral as que estão no calendário — noCalendario()).
 * - agenda: SÓ entre naturezas iguais.
 * - espaço: mesmo local que gera conflito + horários sobrepostos, entre
 *   QUAISQUER naturezas [SUPOSIÇÃO 1].
 * - rotina×rotina: coincidência por dia da semana + meses sobrepostos
 *   (sempre firme). Demais: mesma data; firme = ambos com precisão 'dia'
 *   ("colisão confirmada"); senão "concentração" (não bloqueia).
 * Retorna pares com a.id < b.id (dedup por construção).
 */
function detectarConflitos(propostas, locaisById, suposicoes = SUPOSICOES) {
  const lista = (propostas || []).filter((p) => !p.deleted_at);
  const out = [];
  for (let i = 0; i < lista.length; i += 1) {
    for (let j = i + 1; j < lista.length; j += 1) {
      let [a, b] = [lista[i], lista[j]];
      if (String(b.id) < String(a.id)) [a, b] = [b, a];
      const rr = a.natureza === 'rotina' && b.natureza === 'rotina';

      // espaço
      const local = locaisById ? locaisById[a.local_id] : null;
      const geraConflito = local ? local.gera_conflito !== false : true;
      const naturezasOk = suposicoes.espacoEntreNaturezasDiferentes || a.natureza === b.natureza;
      if (a.local_id && a.local_id === b.local_id && geraConflito && naturezasOk
          && horariosSobrepoem(a, b)) {
        if (rr ? rotinasCoincidem(a, b) : mesmaData(a, b)) {
          out.push({ a, b, tipo: 'espaco', firme: rr ? true : colisaoFirme(a, b) });
        }
      }

      // agenda
      if (a.natureza === b.natureza) {
        if (rr ? rotinasCoincidem(a, b) : mesmaData(a, b)) {
          out.push({ a, b, tipo: 'agenda', firme: rr ? true : colisaoFirme(a, b) });
        }
      }
    }
  }
  return out;
}

/** Marca cada conflito com o aceite correspondente (se houver). */
function aplicarAceites(conflitos, aceites) {
  const chave = (pa, pb, tipo) => [pa, pb].sort().join('|') + '|' + tipo;
  const mapa = new Map((aceites || []).map((ac) => [chave(ac.proposta_a, ac.proposta_b, ac.tipo), ac]));
  return (conflitos || []).map((c) => ({
    ...c,
    aceite: mapa.get(chave(c.a.id, c.b.id, c.tipo)) || null,
  }));
}

// ── As 5 travas de publicação (textos exatos do protótipo) ──────────────
function validarTravas({ propostas, avaliacoesPorProposta, decisoesPorProposta, quorum, locaisById, aceites, suposicoes = SUPOSICOES }) {
  const vivas = (propostas || []).filter((p) => !p.deleted_at);
  const avsDe = (p) => (avaliacoesPorProposta[p.id] || []).filter((a) => !a.deleted_at);
  const decDe = (p) => decisoesPorProposta[p.id] || [];

  const semQuorum = vivas.filter((p) => p.estado === 'enviada' && avsDe(p).length < quorum);
  const semDecisao = vivas.filter((p) => p.estado === 'enviada' && avsDe(p).length >= quorum);
  const retificacao = vivas.filter((p) => ['reprovada', 'retificada'].includes(p.estado));
  const ressalva = vivas.filter((p) => p.estado === 'aprovada_ressalvas' && !ressalvaVerificada(decDe(p)));

  const emCalendario = vivas.filter((p) => noCalendario(p, decDe(p), suposicoes));
  const conflitos = aplicarAceites(detectarConflitos(emCalendario, locaisById, suposicoes), aceites)
    .filter((c) => c.firme && !c.aceite);

  const motivos = [];
  if (semQuorum.length) motivos.push(`${semQuorum.length} proposta(s) sem quórum de avaliação`);
  if (semDecisao.length) motivos.push(`${semDecisao.length} proposta(s) sem decisão`);
  if (retificacao.length) motivos.push(`${retificacao.length} retificação(ões) em andamento`);
  if (ressalva.length) motivos.push(`${ressalva.length} ressalva(s) não verificada(s)`);
  if (conflitos.length) motivos.push(`${conflitos.length} conflito(s) confirmado(s) e não aceito(s) no calendário`);

  return {
    bloqueada: motivos.length > 0,
    motivos,
    detalhe: { semQuorum, semDecisao, retificacao, ressalva, conflitos, itensCalendario: emCalendario },
  };
}

// ── Orçamento (caixa livre e visão do Pastor · SEMPRE derivados) ────────
const LINHAS_ORCAMENTO = ['dizimos_ofertas', 'outras_receitas', 'folha', 'despesas_operacionais', 'provisoes'];

/** valores: [{linha, mes(1-12), valor}] → caixa livre mensal (12 posições). */
function caixaLivreMensal(valores) {
  const porLinha = {};
  LINHAS_ORCAMENTO.forEach((l) => { porLinha[l] = new Array(12).fill(0); });
  (valores || []).forEach((v) => {
    if (porLinha[v.linha] && v.mes >= 1 && v.mes <= 12) porLinha[v.linha][v.mes - 1] = Number(v.valor) || 0;
  });
  return new Array(12).fill(0).map((_, i) =>
    Math.round(((porLinha.dizimos_ofertas[i] + porLinha.outras_receitas[i])
      - (porLinha.folha[i] + porLinha.despesas_operacionais[i] + porLinha.provisoes[i])) * 100) / 100);
}

/**
 * Visão orçamentária do Pastor: por mês, caixa livre × custo dos
 * aprovados no calendário × custo dos propostos com quórum e sem
 * decisão × saldo projetado. Proposta sem quórum NÃO conta (teste 2).
 */
function orcamentoDoPastor({ propostas, avaliacoesPorProposta, decisoesPorProposta, quorum, caixaLivre, suposicoes = SUPOSICOES }) {
  const vivas = (propostas || []).filter((p) => !p.deleted_at);
  const avsDe = (p) => (avaliacoesPorProposta[p.id] || []).filter((a) => !a.deleted_at);
  const decDe = (p) => decisoesPorProposta[p.id] || [];

  const aprovadas = vivas.filter((p) => noCalendario(p, decDe(p), suposicoes));
  const pendentes = vivas.filter((p) => p.estado === 'enviada' && avsDe(p).length >= quorum);

  const soma = (lista) => {
    const total = new Array(12).fill(0);
    lista.forEach((p) => {
      rateioMensal(p).forEach((v, i) => { total[i] = Math.round((total[i] + v) * 100) / 100; });
    });
    return total;
  };

  const comprometido = soma(aprovadas);
  const propostos = soma(pendentes);
  const saldo = new Array(12).fill(0).map((_, i) =>
    Math.round((((caixaLivre && caixaLivre[i]) || 0) - comprometido[i] - propostos[i]) * 100) / 100);

  return {
    comprometido,
    propostos,
    saldo,
    mesesNegativos: saldo.filter((s) => s < 0).length,
    aprovadas,
    pendentes,
  };
}

// ── Projeção de visibilidade por papel (regra mais crítica do módulo) ───
// papel: 'proponente' | 'avaliador' | 'pastor' | 'observador'
// - exigência/ressalva/apontamentos: APENAS proponente (e Pastor, autor).
// - fundamentação dos diretores: diretores e Pastor · NUNCA o proponente.
// - notas cegas até o quórum: avaliador vê SÓ a própria avaliação +
//   contagem n/quorum; médias/alheias só com quórum completo (vale
//   inclusive pro Pastor · sem exceção no spec).
function projetarProposta({ proposta, avaliacoes, decisoes, apontamentos, quorum, papel, minhaDiretoria }) {
  const avs = (avaliacoes || []).filter((a) => !a.deleted_at);
  const quorumCompleto = avs.length >= quorum;
  const vigente = decisaoVigente(decisoes || []);

  const base = {
    ...proposta,
    estado_derivado: estadoDerivado(proposta, avs.length, quorum),
    custeio: modeloCusteio(proposta),
    liquido: liquido(proposta),
    liquido_exibicao: Math.max(liquido(proposta), 0),
    avaliacoes_recebidas: avs.length,
    quorum,
    situacao_decisao: vigente ? vigente.decisao : null,
  };

  const semNotas = { avaliacoes: null, medias: null, soma: null };

  if (papel === 'proponente') {
    return {
      ...base,
      ...semNotas,
      // Devolutivas — só aqui:
      exigencia: vigente && vigente.decisao === 'reprovada'
        ? { texto: vigente.exigencia_texto, prazo: vigente.exigencia_prazo, rodada: vigente.rodada } : null,
      ressalva: vigente && vigente.decisao === 'aprovada_ressalvas'
        ? {
          texto: vigente.ressalva_texto,
          responsavel_id: vigente.ressalva_responsavel_id,
          prazo: vigente.ressalva_prazo,
          verificada: Boolean(vigente.ressalva_cumprida_em),
        } : null,
      apontamentos: (apontamentos || []).filter((ap) => !ap.deleted_at),
    };
  }

  if (papel === 'avaliador') {
    const minha = avs.find((a) => a.diretoria === minhaDiretoria) || null;
    return {
      ...base,
      exigencia: null, ressalva: null, apontamentos: null, // nunca ao avaliador
      minha_avaliacao: minha,
      avaliacoes: quorumCompleto ? avs : null, // cegas até o quórum
      medias: quorumCompleto ? mediasPorCriterio(avs) : null,
      soma: quorumCompleto ? mediasPorCriterio(avs).reduce((s, m) => s + m, 0) : null,
    };
  }

  if (papel === 'pastor') {
    return {
      ...base,
      exigencia: vigente && vigente.decisao === 'reprovada'
        ? { texto: vigente.exigencia_texto, prazo: vigente.exigencia_prazo, rodada: vigente.rodada } : null,
      ressalva: vigente && vigente.decisao === 'aprovada_ressalvas'
        ? {
          texto: vigente.ressalva_texto,
          responsavel_id: vigente.ressalva_responsavel_id,
          prazo: vigente.ressalva_prazo,
          verificada: Boolean(vigente.ressalva_cumprida_em),
          verificada_por: vigente.ressalva_verificada_por || null,
        } : null,
      apontamentos: (apontamentos || []).filter((ap) => !ap.deleted_at),
      avaliacoes: quorumCompleto ? avs : null, // cego até o quórum, como os diretores
      medias: quorumCompleto ? mediasPorCriterio(avs) : null,
      soma: quorumCompleto ? mediasPorCriterio(avs).reduce((s, m) => s + m, 0) : null,
      diff_retificacao: proposta.versao_anterior ? diffRetificacao(proposta.versao_anterior, proposta) : null,
    };
  }

  // observador (staff do módulo sem papel específico)
  return { ...base, ...semNotas, exigencia: null, ressalva: null, apontamentos: null };
}

module.exports = {
  SUPOSICOES,
  CRITERIOS,
  VALORES_IGREJA,
  CAMPOS_APONTAVEIS,
  CAMPOS_RETIFICACAO,
  LINHAS_ORCAMENTO,
  TRANSICOES,
  // datas/horas
  somarDias,
  horariosSobrepoem,
  mesDe,
  // custeio
  liquido,
  modeloCusteio,
  mesesOcupados,
  rateioMensal,
  // decisões/estados
  decisaoVigente,
  ressalvaVerificada,
  noCalendario,
  estadoDerivado,
  podeTransicionar,
  // validações
  validarEnvio,
  validarAvaliacao,
  validarRetificacao,
  snapshotRetificacao,
  diffRetificacao,
  // ranking
  somasPorCriterio,
  mediasPorCriterio,
  montarRanking,
  // conflitos
  detectarConflitos,
  aplicarAceites,
  // travas
  validarTravas,
  // orçamento
  caixaLivreMensal,
  orcamentoDoPastor,
  // visibilidade
  projetarProposta,
};
