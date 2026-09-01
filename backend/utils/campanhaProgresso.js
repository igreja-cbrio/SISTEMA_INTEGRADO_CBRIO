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
 * Quantos DOMINGOS existem no intervalo, inclusive as duas pontas.
 *
 * ⚠️⚠️ O dia da semana vem de `Date.UTC` + `getUTCDay()`, NUNCA de
 * `new Date('YYYY-MM-DD').getDay()`: a string sem horário é meia-noite UTC, que
 * no Rio é 21h do dia ANTERIOR — todo domingo viraria sábado e a conta devolveria
 * o número errado. É a mesma armadilha do rodízio de supervisão (25/08), da curva
 * do censo e do check-in do Kids.
 */
function domingosEntre(de, ate) {
  const a = parseIso(de);
  const b = parseIso(ate);
  // ⚠️ `b < a` é guarda DEFENSIVA e NÃO É OBSERVÁVEL: com o fim antes do início,
  // `primeiro` (o 1º domingo em `a` ou depois) é sempre > `b`, então o retorno já
  // seria 0 sem ela. Mutante rodado em 27/08 e SOBREVIVEU — fica pela intenção,
  // mas não afirmo cobertura que não existe (é a lição do mutante equivalente-por-
  // acidente da régua de agenda de grupos, 25/08).
  if (a === null || b === null || b < a) return 0;

  // Primeiro domingo em `a` ou depois: 0 = domingo em getUTCDay().
  const diaSemana = new Date(a).getUTCDay();
  const primeiro = a + ((7 - diaSemana) % 7) * 86400000;
  if (primeiro > b) return 0;
  return Math.floor((b - primeiro) / (7 * 86400000)) + 1;
}

/**
 * O ritmo necessário pra bater a meta — por DIA e por DOMINGO.
 *
 * ⚠️ Pedido do Matheus (27/08): *"quero que tenha o cálculo automático para saber
 * a meta por domingo, e aí vai sempre atualizando conforme o dinheiro vai
 * entrando"*. O por-domingo é o número que mobiliza, porque **é no culto que a
 * oferta entra** — "R$ 62 mil por domingo" é uma frase que a liderança usa; "R$
 * 7.692 por dia" não descreve nenhum momento real da igreja.
 *
 * ⚠️⚠️ A JANELA COMEÇA EM `max(hoje, data_inicio)`, não em `hoje`. A view só conta
 * dinheiro dentro da janela da campanha, então contar dias/domingos ANTES do
 * início infla o denominador e faz o ritmo parecer mais folgado do que é. Medido
 * em 27/08 na campanha do Kids: com `hoje` a tela dizia "faltam 65 dias"; a
 * janela real de arrecadação (01/09 → 31/10) tem **61 dias e 8 domingos**.
 *
 * ⚠️ `data_inicio` é OPCIONAL: sem ela vale `hoje`, que é o comportamento antigo.
 */
function ritmoNecessario({ total_centavos = 0, meta_centavos = 0, hoje, data_inicio, data_fim }) {
  const falta = Math.max(0, cent(meta_centavos) - cent(total_centavos));
  const vazio = {
    dias_restantes: null, por_dia_centavos: null,
    domingos_restantes: null, por_domingo_centavos: null,
    inicio_efetivo: null, parte_do_inicio: false, falta_centavos: falta,
  };
  if (!hoje || !data_fim) return vazio;

  // A campanha ainda não começou a arrecadar? A contagem parte do início dela.
  const ini = parseIso(data_inicio);
  const h = parseIso(hoje);
  if (h === null) return vazio;
  const parteDoInicio = ini !== null && ini > h;
  const inicioEfetivo = parteDoInicio ? data_inicio : hoje;

  const dias = diasEntre(inicioEfetivo, data_fim);
  if (dias === null) return vazio;

  const domingos = domingosEntre(inicioEfetivo, data_fim);

  // Campanha encerrada (ou último dia): não existe "por dia" nem "por domingo" —
  // existe o que falta. Dividir por zero aqui daria Infinity na tela.
  if (dias <= 0) {
    return {
      ...vazio, dias_restantes: 0, domingos_restantes: domingos,
      inicio_efetivo: inicioEfetivo, parte_do_inicio: parteDoInicio,
      // ⚠️ Se HOJE é o último domingo, o por-domingo ainda existe e é tudo o que
      // falta — zerá-lo esconderia justamente a cobrança do último culto.
      por_domingo_centavos: domingos > 0 ? falta : null,
    };
  }

  return {
    dias_restantes: dias,
    por_dia_centavos: Math.ceil(falta / dias),
    domingos_restantes: domingos,
    // ⚠️ Zero domingo restante devolve NULL, nunca Infinity: "não há mais domingo
    // até o fim da campanha" é uma frase que a tela sabe dizer.
    por_domingo_centavos: domingos > 0 ? Math.ceil(falta / domingos) : null,
    inicio_efetivo: inicioEfetivo,
    // ⚠️ Quem decide se a contagem parte do INÍCIO (e não de hoje) é a régua, não
    // a tela: o card da lista não recebe `hoje`, e comparar lá daria sempre true.
    parte_do_inicio: parteDoInicio,
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
  domingosEntre,
  diasEntre,
  estaNoAr,
  brl,
  brlRedondo,
};
