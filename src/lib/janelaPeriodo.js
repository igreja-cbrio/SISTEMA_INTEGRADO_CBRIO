// Janela de período da Caixa de entrada de Grupos.
//
// Criada em 2026-08-03 depois de um mal-entendido REAL: o Marcos abriu o
// "Retrato do período" e leu **301 pedidos / 193 pessoas** como se fossem os do
// lançamento de domingo — que foram **177 pedidos / 161 pessoas**. Nenhum número
// estava errado: o filtro padrão é de 180 dias e somava os **120 pedidos de
// julho** (demo, varredura da Nana, piloto de 26-28/07). O defeito era o rótulo
// genérico "Retrato do período", que não dizia QUAL período.
//
// Duas coisas nasceram daqui:
//   1. o título passa a nomear a janela ("Retrato · temporada T2-2026 (01/08 a hoje)");
//   2. existe a opção **"Temporada atual"**, porque "como foi a abertura?" é a
//      pergunta real e nenhuma janela em DIAS a responde de forma estável (hoje
//      "7 dias" pega a abertura; em duas semanas, não pega mais).
//
// ⚠️ Fonte ÚNICA: a lista de pedidos, o painel e o rótulo leem a MESMA janela.
// Antes o cálculo `Date.now() - fPeriodo * 86400000` estava repetido em 3
// lugares — com a opção nova (que não é número) cada um deles daria `NaN`, e
// **NaN numa comparação de data não filtra nada: mostraria tudo, em silêncio.**

export const FILTRO_PERIODO = [
  { dias: 'temporada', label: 'Temporada atual' },
  { dias: 7, label: 'Últimos 7 dias' },
  { dias: 30, label: 'Últimos 30 dias' },
  { dias: 60, label: 'Últimos 60 dias' },
  { dias: 90, label: 'Últimos 90 dias' },
  { dias: 180, label: 'Últimos 180 dias' },
  { dias: 365, label: 'Último ano' },
  { dias: 1825, label: 'Últimos 5 anos' },
];

const DIAS_PADRAO = 180;
const DIAS_FALLBACK_TEMPORADA = 30;

/**
 * @param {object} p
 * @param {number|'temporada'} p.fPeriodo
 * @param {{id?:string, data_inicio?:string}|null} [p.temporada] — a temporada ativa
 * @param {number} [p.agora] — injetável pra teste (nunca usar Date.now() direto no teste)
 * @returns {{desdeMs:number, rotulo:string, temporadaIni:string|null}}
 */
export function resolverJanela({ fPeriodo, temporada = null, agora = Date.now() } = {}) {
  const temporadaIni = temporada?.data_inicio || null;

  if (fPeriodo === 'temporada') {
    if (temporadaIni) {
      // ⚠️ Meio-dia LOCAL. `new Date('2026-08-01')` é meia-noite UTC, que no Rio
      // é 31/07 às 21h — um pedido da véspera (temporada ANTERIOR) entraria como
      // se fosse da nova. Mesma armadilha do faixaEtaria.
      return {
        desdeMs: new Date(`${temporadaIni}T12:00:00`).getTime(),
        rotulo: `temporada ${temporada.id || 'atual'}`,
        temporadaIni,
      };
    }
    // Temporada ainda não carregou (ou não existe): piso conhecido, nunca NaN.
    return {
      desdeMs: agora - DIAS_FALLBACK_TEMPORADA * 86400000,
      rotulo: `últimos ${DIAS_FALLBACK_TEMPORADA} dias`,
      temporadaIni: null,
    };
  }

  const dias = Number(fPeriodo) > 0 ? Number(fPeriodo) : DIAS_PADRAO;
  const opcao = FILTRO_PERIODO.find((f) => f.dias === dias);
  return {
    desdeMs: agora - dias * 86400000,
    rotulo: opcao ? opcao.label.toLowerCase() : `últimos ${dias} dias`,
    temporadaIni,
  };
}
