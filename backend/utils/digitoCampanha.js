// ════════════════════════════════════════════════════════════════════════════
//  O DÍGITO VERIFICADOR da campanha — régua PURA
//
//  A igreja pede que a doação de uma campanha chegue com um centavo combinado:
//  "07" para a reforma do Kids, "25" para a campanha do templo. Quem transfere
//  R$ 500,07 está DIZENDO que aquele dinheiro é da campanha. O dígito é a única
//  declaração de intenção que sobrevive ao extrato bancário — memo de Pix vem
//  truncado, nome do pagador não diz destino, e não existe campo de "finalidade".
//
//  ⚠️⚠️ POR QUE ISTO NASCEU EM utils/ E COM TESTE: em 26/08/2026 medi que o
//  dígito estava CONFIGURADO E MORTO. `fin_identificadores_centavo` tinha 4
//  dígitos ativos desde 21/05, a tela de configuração existia, e a régua do
//  centavo vivia SÓ no JS (`services/financeiroClassificador.js`) — enquanto o
//  caminho que roda de verdade é o trigger SQL `tg_fila_auto_classificar` →
//  `aplicar_classificacao_lancamento`, cuja definição VIVA não menciona centavo
//  nenhum. Resultado em produção:
//
//    dígito 25 (Campanha 2025) · 105 créditos · R$ 21.745,25 · 0 classificados
//    dígito 22 (Bazar)         ·  90 créditos · R$  7.063,80 · 0 classificados
//    dígito 31 (Ação Social)   ·  10 créditos · R$ 13.379,10 · 0 classificados
//
//  E `fin_transacoes.identificador_centavo` estava preenchido em ZERO linhas do
//  sistema inteiro — porque o endpoint de aprovar a fila só copia o dígito do
//  `req.body`, ou seja dependia do operador DIGITAR o que o próprio valor já
//  diz. Duas metades mortas do mesmo mecanismo.
//
//  ⇒ A régua mora aqui, é pura, tem teste no gate de deploy, e é ESPELHADA na
//  função SQL (migration `20260827120000`). Espelho declarado de propósito: o
//  trigger precisa decidir no INSERT, sem chamar JS, e um segundo caminho que
//  discorde do primeiro é como o dígito morreu na primeira vez.
//
//  ⚠️ O dígito é DECLARAÇÃO, não prova. ~12,5% dos créditos da igreja têm
//  centavo diferente de zero (4.868 créditos em 12 meses, 4.261 com ",00"), e a
//  média orgânica de um centavo não-designado é 4,5 ocorrências/ano. Ou seja:
//  algumas doações caem na campanha por COINCIDÊNCIA (um dízimo de R$ 1.000,07).
//  Por isso o dígito SUGERE e gente confirma — e por isso existe o veto humano
//  (`camp_vinculos.incluir = false`), que tira do total um crédito que o dígito
//  pegou sem ser da campanha.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Extrai o dígito (os 2 centavos) de um valor monetário.
 *
 * ⚠️ Aritmética de ponto flutuante é o risco real aqui: `1907.25 % 1` dá
 * `0.25000000000004547`, e `(0.25000000000004547 * 100)` truncado viraria 25 por
 * sorte — mas `0.07` dá `0.07000000000000028` e casos como `x.29` chegam a
 * `28.999999999`. `Math.round` no produto é o que fecha isso; truncar não.
 *
 * Devolve string de 2 caracteres ('00'..'99') ou null quando não há valor.
 */
function extrairDigito(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  const centavos = Math.round(Math.abs(n) * 100) % 100;
  return String(centavos).padStart(2, '0');
}

/**
 * '07' é dígito válido; '00' NÃO é.
 *
 * ⚠️ O ",00" está em 87,5% dos créditos da igreja — adotá-lo como dígito de
 * campanha jogaria o caixa inteiro dentro de uma campanha. Ele é o "sem
 * declaração", e é por isso que fica de fora por regra, não por configuração.
 */
function digitoValido(digito) {
  const d = String(digito ?? '').trim();
  return /^[0-9]{2}$/.test(d) && d !== '00';
}

/** Normaliza o que vem de formulário/URL: 7 → '07'; ' 07 ' → '07'; 'x' → null. */
function normalizarDigito(digito) {
  if (digito === null || digito === undefined) return null;
  const cru = String(digito).trim();
  if (!/^[0-9]{1,2}$/.test(cru)) return null;
  const d = cru.padStart(2, '0');
  return digitoValido(d) ? d : null;
}

/**
 * O lançamento é ENTRADA de dinheiro?
 *
 * ⚠️ Espelha `financeiroClassificador.js`: `tipo_trn === 'CREDIT' || valor > 0`.
 * Só crédito carrega dígito — uma SAÍDA de R$ 500,07 é um pagamento a
 * fornecedor cujo centavo é coincidência, e contá-la como doação somaria
 * despesa na arrecadação.
 */
function ehCredito(lancamento) {
  if (!lancamento) return false;
  if (lancamento.tipo_trn === 'CREDIT') return true;
  if (lancamento.tipo_trn === 'DEBIT') return false;
  return Number(lancamento.valor) > 0;
}

/**
 * O dígito deste lançamento, SE ele estiver na lista de dígitos ativos.
 *
 * `ativos` aceita array de strings (['07','25']) ou de objetos com `.digito`/
 * `.centavo` — os dois formatos existem no sistema (`camp_campanhas.digito` e
 * `fin_identificadores_centavo.centavo`) e obrigar a chamada a converter é
 * como se fabrica divergência entre chamadores.
 *
 * Devolve o dígito ('07') ou null.
 */
function digitoDoLancamento(lancamento, ativos) {
  if (!ehCredito(lancamento)) return null;
  const digito = extrairDigito(lancamento.valor);
  if (!digitoValido(digito)) return null;

  const lista = (Array.isArray(ativos) ? ativos : [])
    .map((a) => (typeof a === 'string' || typeof a === 'number'
      ? normalizarDigito(a)
      : normalizarDigito(a?.digito ?? a?.centavo)))
    .filter(Boolean);

  return lista.includes(digito) ? digito : null;
}

/**
 * Dois dígitos não podem apontar pra dois destinos ao mesmo tempo.
 *
 * A colisão é o modo de falha mais caro do mecanismo: se a campanha do Kids
 * adota "25" e a campanha do templo já usa "25", todo crédito passa a ser
 * atribuído à campanha errada — e o extrato não guarda nada que permita
 * desempatar depois. Então a checagem é ANTES de gravar.
 *
 * `ocupados` = lista de { digito, dono } já em uso (campanhas + identificadores
 * do financeiro). `ignorar` = id/dono da própria campanha em edição, pra
 * renomear não colidir consigo mesma.
 *
 * Devolve { ok: true } ou { ok: false, motivo, conflito }.
 */
function checarDigitoLivre(digito, ocupados, { ignorar = null } = {}) {
  const d = normalizarDigito(digito);
  if (!d) {
    return {
      ok: false,
      motivo: 'O dígito precisa ser dois números de 01 a 99. O 00 não pode: '
        + 'ele é o centavo de quem não declarou nada.',
      conflito: null,
    };
  }
  const conflito = (Array.isArray(ocupados) ? ocupados : []).find((o) => {
    const dono = o?.dono ?? o?.id ?? null;
    if (ignorar !== null && dono !== null && String(dono) === String(ignorar)) return false;
    return normalizarDigito(o?.digito ?? o?.centavo) === d;
  });
  if (conflito) {
    return {
      ok: false,
      motivo: `O dígito ${d} já é de "${conflito.descricao || conflito.nome || 'outro destino'}". `
        + 'Dois destinos com o mesmo dígito fazem o extrato virar irrecuperável: '
        + 'o banco não guarda nada que permita desempatar depois.',
      conflito,
    };
  }
  return { ok: true, motivo: null, conflito: null };
}

/**
 * Sugestão de dígito livre, pra tela não obrigar ninguém a adivinhar.
 *
 * Ordem de preferência é a MENOR ocorrência orgânica primeiro? Não — é a ordem
 * numérica simples. Frequência orgânica de centavo varia mês a mês e otimizar
 * por ela daria um número diferente a cada abertura da tela, o que é pior que
 * um número estável e previsível pra quem vai imprimir no cartaz.
 */
function sugerirDigito(ocupados) {
  for (let i = 1; i <= 99; i += 1) {
    const d = String(i).padStart(2, '0');
    if (checarDigitoLivre(d, ocupados).ok) return d;
  }
  return null;
}

/**
 * O valor que a pessoa deve transferir pra doar com o dígito.
 *
 * ⚠️ NÃO é "valor + 0,07". Se a pessoa quer doar R$ 500,00 com dígito 07, ela
 * transfere R$ 500,07 (7 centavos a mais). Mas se ela digitou R$ 500,50, o
 * valor com dígito é R$ 500,07 — arredonda pra baixo, nunca pra cima. Cobrar
 * mais do que a pessoa mandou é a única direção do erro que gera reclamação, e
 * é a que este `Math.floor` fecha.
 *
 * Recebe e devolve CENTAVOS (o sistema inteiro conta dinheiro em centavos —
 * `pag_cobrancas.valor_centavos`, `camp_campanhas.meta_centavos`).
 */
function valorComDigito(valorCentavos, digito) {
  const d = normalizarDigito(digito);
  const bruto = Math.round(Number(valorCentavos) || 0);
  if (!d || bruto <= 0) return bruto;
  const reaisInteiros = Math.floor(bruto / 100);
  const alvo = reaisInteiros * 100 + Number(d);
  // Doação de R$ 0,05 com dígito 07 não pode virar R$ 0,07 e nem R$ 0,00:
  // devolve o dígito puro, que é o menor valor que ainda carrega a declaração.
  return alvo > 0 ? alvo : Number(d);
}

module.exports = {
  extrairDigito,
  digitoValido,
  normalizarDigito,
  ehCredito,
  digitoDoLancamento,
  checarDigitoLivre,
  sugerirDigito,
  valorComDigito,
};
