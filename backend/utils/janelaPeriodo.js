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
/**
 * ⚠️⚠️ ÚLTIMA LINHA DE DEFESA CONTRA `"NaN-NaN-NaN"` (02/09/2026).
 *
 * `new Date(NaN)` formatado à mão devolve a string `"NaN-NaN-NaN"`, que **parece
 * uma data** e atravessa a aplicação inteira até o Postgres recusar com 22007 —
 * longe da causa, como um 500 sem explicação. Foi assim que a tela de registro
 * de decisões do Kids caiu (ver a seção do incidente neste CLAUDE.md).
 *
 * ⚠️ O conserto daquele incidente é o fail-safe de `resolverJanelaPeriodo`, que
 * já está no ar (#2826) e faz esta função nunca receber data inválida por aquele
 * caminho. Esta guarda é DEFESA EM PROFUNDIDADE: `diaLocal` é exportado, e o
 * próximo chamador não passa pelo fail-safe. Data inválida aqui é bug de
 * PROGRAMAÇÃO, não dado de usuário — então lança, com o nome da função e o valor
 * recebido. Erro na hora, com endereço, é melhor que string inválida viajando
 * para o banco.
 */
function diaLocal(d) {
  const t = d instanceof Date ? d.getTime() : NaN;
  if (!Number.isFinite(t)) {
    throw new Error(`janelaPeriodo.diaLocal: data inválida (${String(d)}) — nunca produzir "NaN-NaN-NaN"`);
  }
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
/** `YYYY-MM-DD` válido? (não aceita `2026-02-31` como dia real) */
function diaIsoValido(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [a, m, d] = v.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d));
  // Se o dia rolou (31/02 → 03/03), a data não existe.
  return t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * Resolve o período LIVRE, ou `null` quando não foi pedido / é inválido.
 *
 * ⚠️⚠️ `fim` é CLAMPADO em hoje, pelo mesmo motivo do ramo de `ano`: pedir até
 * 31/12 encheria a janela de dias que ainda não aconteceram, e qualquer
 * denominador ("média por dia", "por domingo") sairia deflacionado.
 *
 * ⚠️ Inválido devolve `null` em vez de lançar — quem chama cai na janela móvel
 * padrão, que é o comportamento de antes. Data digitada errada não pode
 * derrubar a tela; ela só não filtra.
 */
function periodoLivre(inicio, fim, agora) {
  if (!diaIsoValido(inicio) || !diaIsoValido(fim)) return null;
  const hoje = diaLocal(new Date(agora));
  // Comparação por STRING `YYYY-MM-DD` — ordem lexicográfica é ordem de data, e
  // não passa por fuso nenhum.
  const fimEfetivo = fim > hoje ? hoje : fim;
  // ⚠️ Intervalo invertido é ERRO DE ENTRADA, não janela vazia: devolver um
  // período que não contém nada faria a tela dizer "0 visitantes" para uma
  // pergunta mal digitada — e zero se lê como resposta.
  if (inicio > fimEfetivo) return null;
  return {
    inicio,
    fim: fimEfetivo,
    dias: null,
    ano: null,
    livre: true,
    // ⚠️ Granularidade pelo TAMANHO do intervalo, não fixa: 400 pontos diários
    // num gráfico de largura de tela viram mancha (é a régua do ramo de `dias`).
    gran: (Date.parse(`${fimEfetivo}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`))
      / 86400000 <= 90 ? 'semana' : 'mes',
    // Diz se o fim pedido foi encurtado — a tela precisa DECLARAR, senão o
    // número parece de um período que a pessoa não vai reconhecer.
    fim_ajustado: fimEfetivo !== fim,
  };
}

function resolverJanelaPeriodo({ dias, ano, inicio, fim, diasValidos, diasPadrao, agora = Date.now() } = {}) {
  // ── Período LIVRE (De/Até) ─────────────────────────────────────────────────
  //
  // ⚠️ ADITIVO: sem `inicio`/`fim` este bloco não roda e o resto da função é
  // byte a byte o que era. É o que permite estender uma régua que já serve
  // Grupos, Cuidados, Voluntariado, Jornada, Inscrições e Governança sem mexer
  // no comportamento de nenhum deles. Há teste exigindo essa equivalência.
  //
  // ⚠️ Vem ANTES do ramo de `ano` porque é o recorte MAIS ESPECÍFICO: quem
  // mandou as duas datas escolheu exatamente o intervalo, e deixar o ano vencer
  // faria a tela ignorar em silêncio o que a pessoa acabou de digitar.
  const livre = periodoLivre(inicio, fim, agora);
  if (livre) return livre;

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
  // ⚠️⚠️ FAIL-SAFE, não fail-open: sem `diasPadrao` (ou com valor não numérico)
  // isto devolvia `inicio: "NaN-NaN-NaN"`, que o PostgREST recusa — ou seja um
  // erro de digitação no nome do parâmetro virava 500 na tela em vez de cair
  // num padrão. Aconteceu em 02/09 na tela de decisões do Kids. Data inventada
  // nunca sai daqui: cai na 1ª opção válida, ou em 365.
  if (!Number.isFinite(d) || d <= 0) {
    d = lista.find((x) => Number.isFinite(Number(x)) && Number(x) > 0) ?? 365;
    d = Number(d);
  }
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
  // ⚠️ O período livre vem PRIMEIRO: com `ano: null` e `dias: null` ele cairia
  // em "últimos null dias" — número sem rótulo é como um número correto passa a
  // parecer errado.
  if (j.livre) {
    const br = (iso) => (typeof iso === 'string' && iso.length >= 10
      ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
    return j.inicio === j.fim ? br(j.inicio) : `${br(j.inicio)} a ${br(j.fim)}`;
  }
  if (j.ano) return String(j.ano);
  return `últimos ${j.dias} dias`;
}

module.exports = {
  ANO_INICIAL, diaLocal, anoValido, diaIsoValido, resolverJanelaPeriodo, rotuloJanela,
};
