// ════════════════════════════════════════════════════════════════════════════
//  Progresso da campanha — a "barrinha" — régua PURA
//
//  ⚠️⚠️ LEI Nº 6 DO NÚCLEO, aplicada aqui: `mem_contribuicoes` **NÃO É CAIXA**.
//  Ela responde "QUEM doou, quanto e quando" (doadores únicos, recorrência,
//  comprovante anual). O dinheiro arrecadado sai do BANCO. Somar as duas camadas
//  é exatamente como nasceu a dupla contagem de ~R$ 1,5 mi que este projeto já
//  pagou pra descobrir (ver `services/pagamentos/handlers/generosidade.js`).
//
//  ⇒ A barrinha soma TRÊS baldes que são disjuntos POR CONSTRUÇÃO:
//
//    1. `caixa_confirmado`  — `fin_transacoes` com o dígito da campanha
//                             (crédito que já passou pela fila e virou lançamento)
//    2. `caixa_conciliando` — `fin_lancamentos_brutos` com o dígito, crédito,
//                             ainda SEM transação. O dinheiro está no banco; só
//                             a classificação humana não aconteceu ainda.
//    3. `online_pago`       — `pag_cobrancas` paga da campanha (link/QR)
//
//  ⚠️⚠️ POR QUE (1)+(2) NÃO SE SOMAM DUAS VEZES: o balde 2 exclui por definição
//  todo bruto que já tem `fin_transacoes.lancamento_bruto_id` apontando pra ele.
//  Quando a fila aprova, a linha MIGRA do balde 2 pro balde 1 e o total não se
//  move — que é justamente o comportamento que faz a barrinha não pular quando
//  o financeiro trabalha.
//
//  ⚠️⚠️ POR QUE (3) NÃO COLIDE COM (1): o dinheiro do PSP entra no banco como
//  UM REPASSE agrupado, com centavo arbitrário — nunca com o dígito da campanha.
//  Por isso o balde 1 é chaveado ESTRITAMENTE no dígito (`identificador_centavo`)
//  e NUNCA no centro de custo: no dia em que o financeiro classificar o repasse
//  do PSP dentro do centro de custo da campanha, chavear por centro de custo
//  contaria a mesma doação duas vezes. Essa é a armadilha, e ela é fechada aqui
//  por escolha de chave, não por conferência depois.
//
//  ⚠️ O veto humano (`camp_vinculos.incluir = false`) existe porque o dígito é
//  DECLARAÇÃO, não prova: um dízimo de R$ 1.000,07 cai na campanha do Kids por
//  coincidência. Ver `utils/digitoCampanha.js`.
// ════════════════════════════════════════════════════════════════════════════

const cent = (v) => {
  const n = Math.round(Number(v) || 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Soma os baldes e devolve o retrato do progresso.
 *
 * Tudo em CENTAVOS na entrada e na saída — o sistema conta dinheiro em centavos
 * (`pag_cobrancas.valor_centavos`, `camp_campanhas.meta_centavos`), e converter
 * pra reais no meio do caminho é onde entra erro de arredondamento que ninguém
 * acha depois.
 */
function calcularProgresso({
  meta_centavos = 0,
  caixa_confirmado_centavos = 0,
  caixa_conciliando_centavos = 0,
  online_pago_centavos = 0,
} = {}) {
  const meta = cent(meta_centavos);
  const confirmado = cent(caixa_confirmado_centavos);
  const conciliando = cent(caixa_conciliando_centavos);
  const online = cent(online_pago_centavos);

  const total = confirmado + conciliando + online;
  const falta = Math.max(0, meta - total);

  // ⚠️ `pct` é o número VERDADEIRO (pode passar de 100); `pct_barra` é o que a
  // barra desenha (travado em 100). Misturar os dois é como uma campanha que
  // arrecadou 130% aparece como 100% no relatório — ou como uma barra estoura o
  // container do card.
  const pct = meta > 0 ? (total / meta) * 100 : 0;

  return {
    meta_centavos: meta,
    caixa_confirmado_centavos: confirmado,
    caixa_conciliando_centavos: conciliando,
    online_pago_centavos: online,
    total_centavos: total,
    falta_centavos: falta,
    pct: Number(pct.toFixed(2)),
    pct_barra: Math.max(0, Math.min(100, Number(pct.toFixed(2)))),
    // A fatia ainda não conferida por gente. A tela interna mostra isso como
    // aviso; a pública não precisa saber — pra quem doou, o dinheiro chegou.
    pct_conciliando: total > 0 ? Number(((conciliando / total) * 100).toFixed(2)) : 0,
    bateu_meta: meta > 0 && total >= meta,
  };
}

/**
 * Quanto falta por dia pra bater a meta até o fim da campanha.
 *
 * ⚠️ Recebe as datas como STRING 'YYYY-MM-DD' de propósito: `new Date('2026-09-06')`
 * é meia-noite UTC, que no Rio ainda é dia 5 — a lição de UTC que este projeto
 * já pagou no check-in do Kids, na curva do censo e na agenda de grupos. Comparar
 * string de data ISO é exato e não tem fuso.
 */
function ritmoNecessario({ total_centavos = 0, meta_centavos = 0, hoje, data_fim }) {
  const falta = Math.max(0, cent(meta_centavos) - cent(total_centavos));
  if (!hoje || !data_fim) return { dias_restantes: null, por_dia_centavos: null, falta_centavos: falta };

  const dias = diasEntre(hoje, data_fim);
  if (dias === null) return { dias_restantes: null, por_dia_centavos: null, falta_centavos: falta };

  // Campanha encerrada (ou último dia): não existe "por dia" — existe o que falta.
  if (dias <= 0) return { dias_restantes: 0, por_dia_centavos: null, falta_centavos: falta };

  return {
    dias_restantes: dias,
    por_dia_centavos: Math.ceil(falta / dias),
    falta_centavos: falta,
  };
}

/** Dias inteiros de `de` até `ate`, em datas ISO. Negativo se `ate` já passou. */
function diasEntre(de, ate) {
  const a = parseIso(de);
  const b = parseIso(ate);
  if (a === null || b === null) return null;
  return Math.round((b - a) / 86400000);
}

/** 'YYYY-MM-DD' → epoch em UTC puro. Qualquer outro formato → null. */
function parseIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s ?? ''));
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * A campanha está no ar HOJE?
 *
 * `data_lancamento` é o marco PÚBLICO (o domingo em que a igreja fica sabendo);
 * `data_inicio` é quando o dinheiro já pode ser contado (uma doação antecipada
 * de quem soube na reunião de liderança é da campanha). Os dois existem porque
 * são coisas diferentes, e usar um pelo outro é o que faria a barrinha aparecer
 * na tela antes do culto de lançamento.
 */
function estaNoAr({ status, data_inicio, data_fim }, hoje) {
  if (status !== 'ativa') return false;
  const h = parseIso(hoje);
  if (h === null) return false;
  const ini = parseIso(data_inicio);
  const fim = parseIso(data_fim);
  if (ini !== null && h < ini) return false;
  if (fim !== null && h > fim) return false;
  return true;
}

/** Formata centavos em BRL. Vive aqui pro e-mail e a barrinha falarem igual. */
function brl(centavos) {
  return (cent(centavos) / 100).toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL', minimumFractionDigits: 2,
  });
}

/**
 * Valor "redondo" pra comunicação, sem centavo.
 *
 * O e-mail semanal e o cartaz falam "R$ 128 mil", não "R$ 128.437,19". Quem
 * lê um número exato num cartaz não confia mais nele — confia menos, porque
 * parece contabilidade e não convite.
 */
function brlRedondo(centavos) {
  const reais = Math.round(cent(centavos) / 100);
  if (reais >= 1000) {
    const mil = Math.round(reais / 1000);
    return `R$ ${mil.toLocaleString('pt-BR')} mil`;
  }
  return `R$ ${reais.toLocaleString('pt-BR')}`;
}

module.exports = {
  calcularProgresso,
  ritmoNecessario,
  diasEntre,
  estaNoAr,
  brl,
  brlRedondo,
};
