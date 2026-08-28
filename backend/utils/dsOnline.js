// ════════════════════════════════════════════════════════════════════════════
//  DS · "quantas pessoas viram DEPOIS que a live acabou"
//
//  Pergunta do Matheus (26/08/2026): *"o DS, ele subtrai do valor do máximo de
//  views que tivemos na live? O certo do DS deveria ser pegar as views que
//  tiveram daquela live depois que ela terminou, mas tem que diminuir do que
//  teve enquanto ela acontecia."*
//
//  ⚠️⚠️ ELE ESTAVA CERTO — o DS NÃO subtraía nada. O código era literal:
//      const update = { online_ds: stats?.viewCount ?? 0 };
//  ou seja o "Dia Seguinte" era o `viewCount` ACUMULADO DA VIDA INTEIRA do
//  vídeo, lido às 7h BRT do dia seguinte. Ele incluía todas as views que
//  aconteceram DURANTE a transmissão — justamente a parte que não é "dia
//  seguinte". O indicador estava inflado pelo próprio ao vivo.
//
//  ⚠️ TRÊS GRANDEZAS QUE SE CONFUNDEM, e a confusão é a origem do defeito:
//    • `online_pico`       → espectadores SIMULTÂNEOS (sobe e desce; instantâneo)
//    • `online_views_live` → views ACUMULADAS até o fim da live (só sobe)
//    • `online_ds`         → views DEPOIS da live
//  Medido em 23/08, culto de 19:00: pico 300 × DS 1.355. Nos cultos com dado o
//  pico fica entre 12% e 36% do DS — não são a mesma coisa nem por acaso.
//
//  ⚠️⚠️ O DDUS NÃO tinha esse defeito e NÃO muda: ele é a diferença entre dois
//  pontos (viewCount em D+7 menos o DS), então o que estava inflado nos dois
//  lados se cancelava. Mexer nele "para ficar igual" quebraria o que funciona.
// ════════════════════════════════════════════════════════════════════════════

/** Número não-negativo ou null. Texto do YouTube (`"1355"`) entra normalmente. */
function inteiro(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
}

/**
 * O DS a partir do acumulado do dia seguinte e das views até o fim da live.
 *
 * Devolve `{ ds, regra }`. A `regra` sobe junto porque o número muda de
 * SIGNIFICADO conforme ela, e a tela precisa poder dizer isso:
 *   • `pos_live`   → `viewCountD1 − viewsLive` (a régua correta)
 *   • `acumulado`  → sem `viewsLive`, cai no comportamento histórico
 *   • `sem_dado`   → não dá para afirmar nada
 *
 * ⚠️⚠️ A régua `acumulado` NÃO é um bug preservado por preguiça: o `viewCount`
 * do fim de uma live que já terminou é IRRECUPERÁVEL — o YouTube não guarda o
 * histórico daquele contador. Então todo culto anterior a esta mudança só pode
 * ser lido pela régua velha, e forçar a nova neles produziria número inventado.
 * Quem compara períodos precisa saber qual régua produziu cada ponto.
 */
function calcularDs({ viewCountD1, viewsLive } = {}) {
  const d1 = inteiro(viewCountD1);
  if (d1 === null) return { ds: null, regra: 'sem_dado' };

  const live = inteiro(viewsLive);
  if (live === null) return { ds: d1, regra: 'acumulado' };

  // ⚠️ Piso em ZERO, nunca negativo. `viewCount` pode oscilar para baixo: o
  // YouTube revisa a contagem removendo views inválidas horas depois. Um DS
  // negativo viraria subtração no somatório da semana — o dashboard passaria a
  // DESCONTAR audiência de outro culto, que é pior que perder este ponto.
  return { ds: Math.max(0, d1 - live), regra: 'pos_live' };
}

/**
 * As views totais da live — o indicador novo que o Matheus pediu.
 *
 * ⚠️ É o MAIOR `viewCount` observado durante a transmissão, não o último. O
 * live-monitor amostra de tempos em tempos e uma amostra pode chegar fora de
 * ordem ou depois de o YouTube revisar a contagem para baixo; o maior valor é
 * o único robusto às duas coisas. E `viewCount` só sobe no caso normal, então
 * "o maior" e "o último" coincidem quando nada dá errado.
 */
function maiorViewCount(atual, novo) {
  const a = inteiro(atual);
  const n = inteiro(novo);
  if (n === null) return a;
  if (a === null) return n;
  return Math.max(a, n);
}

module.exports = { calcularDs, maiorViewCount, inteiro };
