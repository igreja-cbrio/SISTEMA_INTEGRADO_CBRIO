// ════════════════════════════════════════════════════════════════════════════
//  ARRECADAÇÃO DO ONLINE · régua PURA
//
//  Decide o que é período FECHADO, o que é PARCIAL, e quando uma variação pode
//  ser publicada. A agregação pesada é da RPC `fn_online_arrecadacao` (o
//  PostgREST corta em 1000 linhas em silêncio e a semana financeira é função
//  SQL); aqui mora só a régua que precisa entrar no gate.
//
//  ⚠️⚠️ O MODO DE FALHA QUE ESTE ARQUIVO EXISTE PARA IMPEDIR
//  A importação do balanço é SEMANAL e **53% do dinheiro cai na segunda**
//  (medido: 1.349 de 2.546 créditos de 2026; ZERO no fim de semana). Então a
//  janela corrente está SEMPRE parcial, e comparar parcial com fechado produz
//  uma queda que não existe — toda semana, não uma vez por ano. Medido em
//  23/09: a semana em curso tinha R$ 90 contra R$ 17.664 da anterior; a
//  variação ingênua seria **−99,5%**.
//
//  ⚠️ Este arquivo é o irmão de `decendioComparativo.js` e de
//  `semanaOnline.compararSemanas`, que já carregam a mesma lição no módulo.
// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
//  QUEM VÊ O DINHEIRO NO MÓDULO ONLINE
//
//  Decisão do Matheus (23/09/2026): *"apenas a renata pode ver o dinheiro no
//  modulo do online"*.
//
//  ⚠️⚠️ MAS A LEI DO PROJETO PROÍBE NOMEAR PESSOA COMO DONA DE FLUXO (05/08):
//  o que o código guarda é o PAPEL; quem o ocupa vive no BANCO e muda sem PR.
//  Um e-mail chumbado aqui viraria mentira no dia em que a coordenação do
//  canal trocar — e ninguém procuraria a causa num arquivo de régua.
//
//  ⇒ O critério é **nível alto no MÓDULO `online`**. Medido em 23/09: a Renata
//  é `Coord Onl` com a ÁREA Online, e `AREA_MODULO_BOOST['online']` já a eleva
//  a nível 5 — ela passa sem nenhuma mudança de cadastro. Trocar quem vê é
//  mexer na matriz de `/admin/permissoes`, não aqui.
//
//  ⚠️⚠️ O "APENAS" É LITERAL, e é o que torna esta régua diferente do gate
//  financeiro padrão: quem cuida do dinheiro da igreja (`financeiro` nível 2+)
//  **deixou de ver este card**, porque o lugar dele é o módulo Financeiro. Sem
//  isso a arrecadação apareceria para 11 cargos.
//
//  ⚠️⚠️ SEM bypass de `role` e SEM piso de cargo, de propósito. É a mesma lei
//  de `dadosSensiveisPessoa`: `getEffectiveLevel` tem `cargoNivelLeitura` como
//  PISO, então um cargo com nível base alto passaria **sem ter o módulo** — o
//  que serve para decidir quanto detalhe mostrar numa tela já aberta, e é
//  errado para decidir se dinheiro sai pela rede.
//  ⚠️ Quem precisar entrar, entra pela matriz — não por role.
// ════════════════════════════════════════════════════════════════════════════

/** Nível no módulo `online` que libera valores em reais. */
const NIVEL_VE_DINHEIRO = 4;

function podeVerArrecadacaoOnline(user) {
  if (!user) return false;
  // Deny explícito por usuário vence tudo (mesma ordem do `authorizeModule`).
  const bloqueados = user.granular?.modulosBloqueados || [];
  if (bloqueados.includes('online')) return false;
  const nivel = user.granular?.modulePerms?.online?.leitura;
  return typeof nivel === 'number' && nivel >= NIVEL_VE_DINHEIRO;
}

/**
 * Dia de HOJE em BRT.
 * ⚠️ `toISOString()` sobre o agora dá o dia UTC, e das 21h do Rio em diante ele
 * já virou — a janela pegaria um dia que ainda não existe aqui.
 */
function hojeBRT(agora = Date.now()) {
  return new Date(agora - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Um período está FECHADO quando terminou **e** o dado já foi importado até o
 * fim dele.
 *
 * ⚠️⚠️ As DUAS condições são necessárias e por motivos diferentes:
 *  · `fim <= hoje` — a semana que ainda está correndo não acabou;
 *  · `fim <= corte` — a semana pode ter acabado e o balanço dela ainda não ter
 *    sido importado (a importação é semanal). Sem esta, a última semana
 *    fechada aparece com uma fração do valor e a variação mente.
 *
 * `corte` é a data máxima do dado NA CONTA, derivada do próprio banco — nunca
 * uma constante, que envelheceria no primeiro atraso de import.
 */
/**
 * Último dia do período, em `YYYY-MM-DD`.
 *
 * ⚠️⚠️ `'2026-09'` (mês) NÃO pode ser comparado como string com `'2026-09-23'`
 * (dia): `'2026-09' <= '2026-09-23'` é **true** porque um é prefixo do outro —
 * e aí o mês CORRENTE apareceria como fechado, que é exatamente o contrário do
 * que esta régua existe para impedir. Mês vira o último dia dele.
 */
function ultimoDiaDoPeriodo(fim) {
  if (typeof fim !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(fim)) return fim;
  if (/^\d{4}-\d{2}$/.test(fim)) {
    const ano = Number(fim.slice(0, 4));
    const mes = Number(fim.slice(5, 7));
    if (!Number.isInteger(ano) || mes < 1 || mes > 12) return null;
    // Dia 0 do mês SEGUINTE = último dia deste. Em UTC de propósito: é
    // aritmética de calendário, não instante — o fuso local jogaria a virada
    // para o mês errado.
    const d = new Date(Date.UTC(ano, mes, 0));
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function periodoFechado(fimBruto, { hoje, corte }) {
  const fim = ultimoDiaDoPeriodo(fimBruto);
  if (!fim) return false;
  if (typeof hoje !== 'string' || !hoje) return false;
  if (fim > hoje) return false;
  // ⚠️ Sem corte conhecido, NÃO assume fechado: fail-safe. Tratar "não sei"
  // como "fechado" é publicar variação sobre janela pela metade.
  if (typeof corte !== 'string' || !corte) return false;
  return fim <= corte;
}

/**
 * Variação percentual entre dois valores.
 *
 * ⚠️ Base zero devolve **null**, nunca 0 nem Infinity: "saiu de R$ 0 para
 * R$ 500" não é "+∞%" nem "0%" — é um fato que não tem percentual. A tela
 * escreve o valor absoluto nesse caso.
 */
function variacao(atual, anterior) {
  const a = Number(atual);
  const b = Number(anterior);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (b === 0) return null;
  return Number((((a - b) / b) * 100).toFixed(1));
}

/**
 * Marca cada período da série como fechado/parcial e calcula a variação contra
 * o período ANTERIOR DA SÉRIE.
 *
 * ⚠️⚠️ A variação só existe quando os DOIS lados estão fechados. Comparar uma
 * semana em curso com uma fechada é a armadilha principal deste arquivo; e
 * comparar uma fechada com uma parcial ANTERIOR (import atrasado no meio) é a
 * mesma armadilha ao contrário.
 */
function anotarSerie(periodos, { hoje, corte, campoFim = 'fim' } = {}) {
  const lista = Array.isArray(periodos) ? periodos : [];
  return lista.map((p, i) => {
    const fechado = periodoFechado(p?.[campoFim], { hoje, corte });
    const anterior = lista[i - 1];
    const anteriorFechado = anterior
      ? periodoFechado(anterior[campoFim], { hoje, corte })
      : false;
    return {
      ...p,
      fechado,
      // `variacao: null` com `comparavel: false` diz "não dá para comparar";
      // com `comparavel: true` diz "a base era zero". São coisas diferentes.
      comparavel: Boolean(fechado && anteriorFechado),
      variacao: fechado && anteriorFechado ? variacao(p?.total, anterior.total) : null,
      anterior_total: anteriorFechado ? (anterior?.total ?? null) : null,
    };
  });
}

/** O último período FECHADO da série (o que vai em destaque no card). */
function ultimoFechado(serieAnotada) {
  const lista = Array.isArray(serieAnotada) ? serieAnotada : [];
  for (let i = lista.length - 1; i >= 0; i -= 1) {
    if (lista[i]?.fechado) return lista[i];
  }
  return null;
}

/**
 * Mês do ano anterior correspondente. `'2026-09'` → `'2025-09'`.
 * ⚠️ Fatiando a string, nunca `new Date(mes)`: a string sem dia é meia-noite
 * UTC = 21h do dia anterior no Rio, e o mês viraria o anterior.
 */
function mesDoAnoAnterior(mes) {
  if (typeof mes !== 'string' || !/^\d{4}-\d{2}$/.test(mes)) return null;
  const ano = Number(mes.slice(0, 4));
  if (!Number.isFinite(ano)) return null;
  return `${ano - 1}-${mes.slice(5, 7)}`;
}

/**
 * Casa a série mensal com a do ano anterior.
 *
 * ⚠️⚠️ `dias_segunda` viaja junto e a tela PRECISA mostrá-lo: com 53% do valor
 * caindo na segunda, um mês com 5 segundas tem ~11% a mais que um com 4 **sem
 * nenhuma mudança de comportamento**, e o calendário muda de ano para ano. Um
 * março de 5 segundas contra um março de 4 dá +11% fantasma — o bastante para
 * inverter a leitura do mês.
 */
function compararComAnoAnterior(meses, mesesAnoAnterior) {
  const anterior = new Map(
    (Array.isArray(mesesAnoAnterior) ? mesesAnoAnterior : [])
      .filter((m) => m && typeof m.mes === 'string')
      .map((m) => [m.mes, m]),
  );
  return (Array.isArray(meses) ? meses : []).map((m) => {
    const chave = mesDoAnoAnterior(m?.mes);
    const par = chave ? anterior.get(chave) : null;
    return {
      ...m,
      mes_anterior: chave,
      total_ano_anterior: par ? par.total : null,
      dias_segunda_ano_anterior: par ? (par.dias_segunda ?? null) : null,
      // ⚠️ Sem o par, `variacao_ano` é null — e a tela diz "sem base
      // comparável", nunca "-100%".
      variacao_ano: par ? variacao(m?.total, par.total) : null,
      // ⚠️ Calendário diferente é DECLARADO: quem lê a variação precisa saber
      // que parte dela pode ser só o número de segundas-feiras.
      calendario_difere: Boolean(
        par && (m?.dias_segunda ?? null) !== (par.dias_segunda ?? null),
      ),
    };
  });
}

/**
 * A soma tem que FECHAR: o que entrou no recorte + o que ficou de fora = tudo
 * que a conta recebeu de receita viva no período.
 *
 * ⚠️ É a lei do corte de bairro do censo (16/09). Sem este número, quem
 * confere o extrato do Santander conclui que falta dinheiro — e a diferença
 * aqui é grande (medido em 2026: R$ 471 mil de cartão e outros ficam de fora).
 */
function conferencia(total, foraDoRecorte) {
  // ⚠️⚠️ Recusa null/undefined ANTES de converter: `Number(null)` é **0**, não
  // NaN, então `Number.isFinite` sozinho deixaria "não sei o total" passar como
  // "a conta recebeu R$ 0,00" — e a conferência afirmaria que a soma fecha em
  // zero. É a mesma armadilha do `Number(null) === 0` que este projeto já pagou
  // no dígito de campanha e na alçada de compra.
  if (total === null || total === undefined || total === '') return null;
  const dentro = Number(total);
  const fora = (Array.isArray(foraDoRecorte) ? foraDoRecorte : [])
    .reduce((s, f) => s + (Number(f?.total) || 0), 0);
  if (!Number.isFinite(dentro)) return null;
  return {
    dentro,
    fora,
    total_conta: dentro + fora,
    pct_dentro: dentro + fora > 0
      ? Number(((dentro / (dentro + fora)) * 100).toFixed(1))
      : null,
  };
}

module.exports = {
  NIVEL_VE_DINHEIRO,
  podeVerArrecadacaoOnline,
  hojeBRT,
  ultimoDiaDoPeriodo,
  periodoFechado,
  variacao,
  anotarSerie,
  ultimoFechado,
  mesDoAnoAnterior,
  compararComAnoAnterior,
  conferencia,
};
