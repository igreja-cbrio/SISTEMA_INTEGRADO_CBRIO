const META_MENSAL = 1_000_000;
const META_CAMPUS = 8_000_000;
const CAMPANHA_INICIO = '2026-01';
const SALDO_INICIAL_CAMPUS = 0;

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function arredondarMoeda(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
}

function percentual(valor, meta) {
  if (!meta) return 0;
  return Math.round(((Number(valor) / Number(meta)) * 100 + Number.EPSILON) * 100) / 100;
}

function agruparArrecadacaoMensal(rows) {
  const porMes = new Map();

  for (const row of rows || []) {
    const mes = String(row.data_competencia || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(mes)) continue;

    const atual = porMes.get(mes) || {
      mes,
      arrecadado: 0,
      qtd_lancamentos: 0,
    };
    atual.arrecadado = arredondarMoeda(atual.arrecadado + Number(row.valor || 0));
    atual.qtd_lancamentos += 1;
    porMes.set(mes, atual);
  }

  return [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes));
}

/**
 * Junta a arrecadação de generosidade (dízimos e ofertas) com a RECEITA TOTAL
 * do mês, pra o painel poder mostrar os dois lado a lado.
 *
 * ⚠️⚠️ POR QUE OS DOIS NÚMEROS EXISTEM (pergunta do Matheus · 23/08/2026: *"por
 * que o valor de lá está diferente do valor que tem no dashboard semanal?"*).
 * Medido em agosto/2026:
 *   · Dashboard Semanal .......... R$ 805.267,90 — TODA a receita
 *   · Marketing/Generosidade ..... R$ 733.461,87 — só o plano 3.01
 *   · diferença .................. R$  71.806,03, sendo R$ 60.000 de três
 *     doações extraordinárias e o resto bazar, material didático e campanha.
 * Nenhum dos dois estava errado; o painel é que mostrava um só e chamava de
 * "arrecadado", o que se lê como "tudo que entrou".
 *
 * ⚠️ `arrecadado` NÃO MUDA DE SIGNIFICADO. É ele que alimenta a meta mensal e o
 * excedente do campus — trocá-lo por receita total mudaria a régua da CAMPANHA,
 * que é decisão financeira e não conserto de tela.
 *
 * ⚠️ O total vem da MESMA view que o Dashboard lê (`vw_fin_decendio`). Recalcular
 * aqui criaria uma TERCEIRA régua, e o próximo "por que os números divergem?"
 * teria três respostas em vez de duas.
 *
 * @param {Array} mensal saída de `agruparArrecadacaoMensal`
 * @param {Array<{mes,receita,receita_extraordinaria}>} totais somados por mês
 */
function combinarComReceitaTotal(mensal, totais) {
  const porMes = new Map();
  for (const t of totais || []) {
    // ⚠️ Sem guarda de formato aqui de propósito: `agruparArrecadacaoMensal` já
    // valida a OUTRA ponta, então chave malformada simplesmente não casa com
    // mês nenhum e o `porMes.get` devolve undefined. A validação que existia
    // era código morto — passava num teste-mutante sem proteger nada.
    const mes = String(t?.mes || '').slice(0, 7);
    const atual = porMes.get(mes) || { receita: 0, extraordinaria: 0 };
    atual.receita = arredondarMoeda(atual.receita + Number(t.receita || 0));
    atual.extraordinaria = arredondarMoeda(atual.extraordinaria + Number(t.receita_extraordinaria || 0));
    porMes.set(mes, atual);
  }

  return (mensal || []).map((linha) => {
    const t = porMes.get(String(linha.mes));
    if (!t) return { ...linha };
    const total = arredondarMoeda(t.receita);
    const outras = arredondarMoeda(total - Number(linha.arrecadado || 0));
    return {
      ...linha,
      receita_total: total,
      receita_extraordinaria: arredondarMoeda(t.extraordinaria),
      // ⚠️ NEGATIVO significa que as duas réguas divergiram (generosidade
      // contando o que o total não conta). Hoje é impossível — a query do
      // balanço é subconjunto da view —, mas declarar é melhor que exibir um
      // "outras receitas: -R$ 300" que ninguém sabe explicar.
      outras_receitas: outras < 0 ? null : outras,
      divergencia: outras < 0 ? outras : null,
    };
  });
}

/**
 * Monta o snapshot agregado que o Marketing pode consultar.
 *
 * A origem já chega agregada por mês e deve conter exclusivamente as receitas
 * de generosidade vindas do balanço. Meses deficitários nunca consomem o valor
 * acumulado para o campus: apenas o excedente mensal positivo é somado.
 */
function calcularGenerosidade(rows, ano, agora = new Date()) {
  const anoNumero = Number(ano);
  const inicioAno = Number(CAMPANHA_INICIO.slice(0, 4));
  const inicioMes = Number(CAMPANHA_INICIO.slice(5, 7));
  const porMes = new Map((rows || []).map((row) => [String(row.mes), row]));

  let campusAcumulado = SALDO_INICIAL_CAMPUS;
  const mesesDoAno = [];
  const anoAtual = agora.getFullYear();
  const mesAtual = agora.getMonth() + 1;

  for (let y = inicioAno; y <= anoNumero; y += 1) {
    for (let m = 1; m <= 12; m += 1) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      const antesDaCampanha = y === inicioAno && m < inicioMes;
      const row = porMes.get(key);
      const temDados = Boolean(row && Number(row.qtd_lancamentos || 0) > 0);
      const arrecadado = arredondarMoeda(row?.arrecadado || 0);
      const excedente = antesDaCampanha
        ? 0
        : arredondarMoeda(Math.max(0, arrecadado - META_MENSAL));

      campusAcumulado = arredondarMoeda(campusAcumulado + excedente);

      if (y !== anoNumero) continue;

      const futuro = y > anoAtual || (y === anoAtual && m > mesAtual);
      const parcial = y === anoAtual && m === mesAtual;
      const faltaMetaMensal = arredondarMoeda(Math.max(0, META_MENSAL - arrecadado));

      mesesDoAno.push({
        mes: key,
        mes_num: m,
        mes_label: MESES[m - 1],
        arrecadado,
        // ⚠️ Informativo, ao lado — a meta e o excedente do campus seguem
        // calculados SÓ sobre `arrecadado`. `undefined` = a leitura do total
        // falhou; a tela precisa saber a diferença entre "zero" e "não sei".
        receita_total: row?.receita_total,
        receita_extraordinaria: row?.receita_extraordinaria,
        outras_receitas: row?.outras_receitas,
        qtd_lancamentos: Number(row?.qtd_lancamentos || 0),
        tem_dados: temDados,
        futuro,
        parcial,
        percentual_mensal: percentual(arrecadado, META_MENSAL),
        falta_meta_mensal: faltaMetaMensal,
        excedente_campus: excedente,
        campus_acumulado: campusAcumulado,
        percentual_campus: percentual(campusAcumulado, META_CAMPUS),
        falta_meta_campus: arredondarMoeda(Math.max(0, META_CAMPUS - campusAcumulado)),
      });
    }
  }

  return {
    ano: anoNumero,
    configuracao: {
      meta_mensal: META_MENSAL,
      meta_campus: META_CAMPUS,
      campanha_inicio: CAMPANHA_INICIO,
      saldo_inicial_campus: SALDO_INICIAL_CAMPUS,
    },
    meses: mesesDoAno,
  };
}

module.exports = {
  CAMPANHA_INICIO,
  META_CAMPUS,
  META_MENSAL,
  SALDO_INICIAL_CAMPUS,
  agruparArrecadacaoMensal,
  combinarComReceitaTotal,
  calcularGenerosidade,
};
