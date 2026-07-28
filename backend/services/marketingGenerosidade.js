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
  calcularGenerosidade,
};
