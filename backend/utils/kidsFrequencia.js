// ============================================================================
// Kids · "criança ativa" é quem FREQUENTA, não quem está cadastrada
//
// Decisão do Matheus (17/08/2026): só é criança ativa quem fez check-in pelo
// menos uma vez nos últimos 12 meses. Antes, "ativa" era só a coluna `ativo`
// — que a base herdou do import do Planning Center, e por isso contava 1.087
// crianças onde 524 tinham aparecido no totem alguma vez.
//
// Régua PURA (fica em utils/ pra entrar no gate). Quem lê o banco é a rota.
//
// ⚠️⚠️ A JANELA VAI COLADA NO NÚMERO. O totem só registra check-in desde
// 06/07/2026 — quando esta régua nasceu havia SEIS SEMANAS de coleta, não 12
// meses. "Sem check-in em 12 meses" e "não tínhamos totem" são fatos
// diferentes, e enquanto a coleta for mais curta que a janela quem responde
// "desde quando sabemos disso?" é `coletaDesde`, não a régua. Por isso
// `avaliarFrequencia` devolve `coberturaParcial` — a tela é obrigada a dizer.
// ============================================================================

/** Janela canônica: 12 meses (decisão de 17/08/2026). */
const JANELA_ATIVA_MESES = 12;

/**
 * Faixas de quantidade de check-in, na ordem em que a equipe lê.
 * `0` é faixa PRÓPRIA de propósito: é a mais acionável de todas (quem está
 * cadastrado e nunca apareceu), e sem faixa própria ela sumiria no "todas".
 */
const FAIXAS_CHECKIN = [
  { key: 'zero', rotulo: 'Nenhum check-in', min: 0, max: 0 },
  { key: '1', rotulo: '1 check-in', min: 1, max: 1 },
  { key: '2-5', rotulo: '2 a 5', min: 2, max: 5 },
  { key: '6-10', rotulo: '6 a 10', min: 6, max: 10 },
  { key: '11+', rotulo: '11 ou mais', min: 11, max: Infinity },
];

/** Em qual faixa cai uma contagem. Valor inválido cai em 'zero' (não some). */
function faixaCheckins(qtd) {
  const n = Number(qtd);
  if (!Number.isFinite(n) || n <= 0) return 'zero';
  const f = FAIXAS_CHECKIN.find((x) => n >= x.min && n <= x.max);
  return f ? f.key : '11+';
}

/** A contagem cai na faixa escolhida? `todas` nunca filtra. */
function casaFaixa(qtd, faixaSel) {
  if (!faixaSel || faixaSel === 'todas') return true;
  return faixaCheckins(qtd) === faixaSel;
}

/**
 * Data-limite da janela, em ISO. Tudo a partir daqui conta como frequência.
 * @param {number|Date} agora
 * @param {number} meses
 */
function inicioDaJanela(agora = Date.now(), meses = JANELA_ATIVA_MESES) {
  const d = new Date(agora);
  d.setUTCMonth(d.getUTCMonth() - meses);
  return d.toISOString();
}

/**
 * A criança frequenta? (= tem check-in dentro da janela)
 *
 * ⚠️ Sem nenhum check-in devolve `false`, nunca `null`: "não sabemos" aqui é
 * indistinguível de "não veio", e inventar um terceiro estado por linha faria
 * a contagem da tela deixar de fechar com o total.
 */
function frequentaNaJanela(ultimoCheckinISO, agora = Date.now(), meses = JANELA_ATIVA_MESES) {
  if (!ultimoCheckinISO) return false;
  const t = Date.parse(ultimoCheckinISO);
  if (Number.isNaN(t)) return false;
  return t >= Date.parse(inicioDaJanela(agora, meses));
}

/**
 * Resumo pra tela: quantas frequentam, quantas não, e — o que impede o número
 * de mentir — se a coleta é mais curta que a janela.
 *
 * @param {Array<{ultimo_checkin?: string|null}>} criancas
 * @param {{agora?: number, meses?: number, coletaDesde?: string|null}} opts
 */
function avaliarFrequencia(criancas = [], opts = {}) {
  const { agora = Date.now(), meses = JANELA_ATIVA_MESES, coletaDesde = null } = opts;
  const inicio = inicioDaJanela(agora, meses);

  let frequentam = 0;
  for (const c of criancas) {
    if (frequentaNaJanela(c?.ultimo_checkin, agora, meses)) frequentam += 1;
  }

  // A coleta começou DEPOIS do início da janela ⇒ o silêncio de parte do
  // período não é ausência da criança, é ausência de registro.
  const coberturaParcial = !!coletaDesde && Date.parse(coletaDesde) > Date.parse(inicio);

  return {
    total: criancas.length,
    frequentam,
    sem_checkin: criancas.length - frequentam,
    janela_meses: meses,
    janela_inicio: inicio,
    coleta_desde: coletaDesde,
    cobertura_parcial: coberturaParcial,
  };
}

module.exports = {
  JANELA_ATIVA_MESES,
  FAIXAS_CHECKIN,
  faixaCheckins,
  casaFaixa,
  inicioDaJanela,
  frequentaNaJanela,
  avaliarFrequencia,
};
