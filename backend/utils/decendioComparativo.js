/**
 * Comparação de decêndio contra o MESMO decêndio dos meses anteriores.
 *
 * Pedido do Matheus (19/08/2026): "primeiro decêndio de agosto com primeiro
 * decêndio de julho, com percentual de diferença".
 *
 * ⚠️⚠️ A armadilha é o decêndio INCOMPLETO. No dia 19, o 2º decêndio do mês
 * (11-20) tem 9 dos 10 dias e o 3º nem começou. Compará-los com um decêndio
 * FECHADO do mês passado mostra uma queda que não existe — e é justamente o
 * número que alguém levaria pra uma reunião. Por isso cada decêndio sai
 * marcado com `situacao`, e o percentual só é calculado quando os dois lados
 * são comparáveis.
 */

const DIAS_FIM = { 1: 10, 2: 20 };

/** Em que decêndio cai o dia (1, 2 ou 3). */
function decendioDoDia(dia) {
  if (dia <= 10) return 1;
  if (dia <= 20) return 2;
  return 3;
}

/**
 * O decêndio já fechou, está correndo ou nem começou — na data de referência.
 * `hojeISO` é 'YYYY-MM-DD' em horário de Brasília.
 */
function situacaoDecendio(mes, decendio, hojeISO) {
  const mesHoje = String(hojeISO || '').slice(0, 7);
  if (!mesHoje || mes < mesHoje) return 'fechado';
  if (mes > mesHoje) return 'futuro';
  const dia = Number(String(hojeISO).slice(8, 10));
  const atual = decendioDoDia(dia);
  if (decendio < atual) return 'fechado';
  if (decendio > atual) return 'futuro';
  // ⚠️ O 3º decêndio só fecha no fim do mês, e o mês não tem tamanho fixo —
  // por isso ele fica 'em_andamento' até o mês virar, nunca por contagem de dias.
  return dia >= (DIAS_FIM[decendio] || 99) ? 'fechado' : 'em_andamento';
}

/**
 * Monta a comparação de um decêndio contra o mesmo decêndio de outro mês.
 *
 * ⚠️ Devolve `percentual: null` quando a conta seria enganosa:
 *  - qualquer um dos lados ainda está correndo (o atual quase sempre está);
 *  - a base é zero — variação sobre zero não é "+100%", é indefinida, e
 *    escrever qualquer número ali inventa uma tendência.
 */
function compararDecendio(atual, anterior, hojeISO) {
  if (!atual) return null;
  const sitAtual = situacaoDecendio(atual.mes, atual.decendio, hojeISO);
  const sitAnterior = anterior ? situacaoDecendio(anterior.mes, anterior.decendio, hojeISO) : null;
  const base = Number(anterior?.receita || 0);
  const valor = Number(atual.receita || 0);
  const comparavel = !!anterior && sitAtual === 'fechado' && sitAnterior === 'fechado' && base > 0;
  return {
    mes: atual.mes,
    decendio: atual.decendio,
    receita: valor,
    situacao: sitAtual,
    base_mes: anterior?.mes || null,
    base_receita: anterior ? base : null,
    diferenca: anterior ? valor - base : null,
    percentual: comparavel ? ((valor - base) / base) * 100 : null,
    // Diz POR QUE não há percentual — "—" sem explicação vira suspeita de bug.
    motivo_sem_percentual: comparavel ? null
      : !anterior ? 'sem_mes_anterior'
      : base === 0 ? 'base_zero'
      : 'periodo_em_aberto',
  };
}

/**
 * A grade completa: para cada mês da série, os 3 decêndios comparados com o
 * mesmo decêndio do mês imediatamente anterior DA SÉRIE.
 *
 * ⚠️ "Mês anterior da série", não "mês -1 do calendário": se um mês não tiver
 * nenhum lançamento ele não aparece na view, e assumir que existe faria a
 * comparação cair num mês vazio e reportar -100%.
 */
function montarGrade(linhas, hojeISO) {
  const porMes = new Map();
  for (const r of linhas || []) {
    if (!r || !r.mes) continue;
    if (!porMes.has(r.mes)) porMes.set(r.mes, new Map());
    porMes.get(r.mes).set(Number(r.decendio), r);
  }
  const meses = [...porMes.keys()].sort();
  return meses.map((mes, i) => {
    const anterior = i > 0 ? porMes.get(meses[i - 1]) : null;
    return {
      mes,
      decendios: [1, 2, 3].map((d) => {
        const atual = porMes.get(mes).get(d) || { mes, decendio: d, receita: 0 };
        return compararDecendio(atual, anterior ? anterior.get(d) || null : null, hojeISO);
      }),
    };
  });
}

module.exports = { decendioDoDia, situacaoDecendio, compararDecendio, montarGrade };
