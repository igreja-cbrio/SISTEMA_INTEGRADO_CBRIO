/**
 * Janela de período dos filtros de data — régua PURA (sem banco, sem relógio).
 *
 * Nasceu do pedido do Marcos (24/08/2026), depois da apresentação do
 * ministerial: *"nenhum filtro de data tem 'por ano' e aí selecionar o ano —
 * não consigo ver a jornada por ano, só os últimos 6 meses ou 365 dias"*. Sem
 * isso não existe comparação anual, que é justamente o que a reunião de
 * governança pede.
 *
 * ⚠️⚠️ ANO É A PRIMEIRA JANELA **FECHADA** DO SISTEMA. Todas as outras são
 * "últimos N dias a partir de agora" e por isso só precisavam de um `inicio`.
 * Um ano tem começo E fim: resolver 2024 e usar só o `inicio` mostraria
 * 2024→hoje — errado, e errado em SILÊNCIO, do jeito mais difícil de perceber
 * (o número só fica maior, nada quebra). Por isso `resolverJanelaPeriodo`
 * devolve **`fim` SEMPRE que a janela é de ano**, e todo endpoint que a usa
 * PRECISA aplicar o `.lte(...)` junto com o `.gte(...)`.
 *
 * ⚠️ ESPELHO de `src/lib/janelaPeriodo.js` (o lado do cliente, que monta as
 * opções do <select> e o rótulo). Mudou a régua num, muda no outro — senão a
 * tela diz "2024" e o servidor responde outra coisa. `src/test/janelaPeriodoBackend.test.ts`
 * exige que os dois concordem em `ANO_INICIAL` e na granularidade.
 *
 * ⚠️ O contrato de query é ADITIVO: `?dias=90` continua valendo byte a byte, e
 * `?ano=2024` é o caminho novo. Cliente antigo não muda de comportamento.
 */

/** Primeiro ano com dado real no sistema (contribuições começam em 2022). */
const ANO_INICIAL = 2022;

/**
 * Dia no formato `YYYY-MM-DD` a partir dos componentes LOCAIS.
 * ⚠️⚠️ NUNCA `toISOString().slice(0,10)`: o banco roda em UTC e às 21h do Rio
 * o dia UTC já virou — o fim de 31/12 às 23:59 sairia como 01/01, ou seja o
 * ano FECHADO vazaria pro ano seguinte. Mesma armadilha do dia da curva do
 * censo, do "culto de agora" e do totem Kids.
 */
function diaLocal(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** `true` quando o valor é um ano oferecível no filtro. */
function anoValido(ano, agora = Date.now()) {
  const n = Number(ano);
  return Number.isInteger(n) && n >= ANO_INICIAL && n <= new Date(agora).getFullYear();
}

/**
 * Resolve a janela a partir da query.
 *
 * @param {object} p
 * @param {string|number} [p.dias]   — janela móvel (o que já existia)
 * @param {string|number} [p.ano]    — janela FECHADA (o caminho novo)
 * @param {number[]} p.diasValidos   — allowlist do endpoint (nada de valor solto)
 * @param {number} p.diasPadrao      — fallback quando `dias` não é válido
 * @param {number} [p.agora]         — injetável pra teste; NUNCA passar em produção
 * @returns {{inicio:string, fim:string|null, dias:number|null, ano:number|null, gran:'semana'|'mes'}}
 *   `fim` é `null` na janela móvel (segue "até agora") e uma data na de ano.
 */
function resolverJanelaPeriodo({ dias, ano, diasValidos, diasPadrao, agora = Date.now() } = {}) {
  if (anoValido(ano, agora)) {
    const n = Number(ano);
    const fimDoAno = new Date(n, 11, 31, 12, 0, 0);
    const hoje = new Date(agora);
    // ⚠️ Ano CORRENTE não termina no futuro: os cultos nascem pré-agendados
    // até dezembro com frequência 0, então ir até 31/12 encheria a série de
    // meses vazios e inflaria qualquer denominador de "cultos no período".
    const fim = fimDoAno.getTime() <= agora ? fimDoAno : hoje;
    return {
      inicio: `${n}-01-01`,
      fim: diaLocal(fim),
      dias: null,
      ano: n,
      // Ano é sempre MÊS: 365 pontos diários num gráfico de largura de tela
      // viram uma mancha. Espelha `granularidadeDaJanela` do cliente.
      gran: 'mes',
    };
  }

  const lista = Array.isArray(diasValidos) && diasValidos.length ? diasValidos : [diasPadrao];
  let d = Number(dias);
  if (!lista.includes(d)) d = diasPadrao;
  return {
    inicio: diaLocal(new Date(agora - d * 86400000)),
    fim: null,
    dias: d,
    ano: null,
    gran: d <= 90 ? 'semana' : 'mes',
  };
}

/** Rótulo curto da janela, pro texto que acompanha o número. */
function rotuloJanela(j) {
  if (!j) return '';
  if (j.ano) return String(j.ano);
  return `últimos ${j.dias} dias`;
}

module.exports = { ANO_INICIAL, diaLocal, anoValido, resolverJanelaPeriodo, rotuloJanela };
