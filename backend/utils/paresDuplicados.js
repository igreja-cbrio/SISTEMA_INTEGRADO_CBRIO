'use strict';

// ⚠️⚠️ LEI · a identidade de um PAR são os DOIS ids ORDENADOS, nunca a ordem em
// que a fonte os emitiu.
//
// A fila de Possíveis duplicidades (/entradas) é a UNIÃO de duas fontes que
// gravam a ordem de jeitos diferentes:
//
//   · `mem_identidade_pares` (motor progressivo) grava SEMPRE (menor, maior);
//   · a triagem em JS (`linhaDuplicidade`) grava na ordem em que varreu os
//     blocos de CPF/telefone/e-mail/nascimento/nome — que segue a paginação de
//     `mem_membros`, não o id.
//
// Enquanto o mapa da fila era chaveado por `${membro_a_id}_${membro_b_id}` cru,
// o MESMO par sobrevivia DUAS vezes quando as duas fontes discordavam da ordem
// ("A_B" da progressiva × "B_A" da triagem). Dois estragos, um visível e outro
// não:
//
//   1. a fila mostrava o par duas vezes, e a intenção declarada ("a identidade
//      progressiva PREVALECE sobre o retrato atual") não valia justamente nesses
//      casos — a progressiva não sobrescrevia nada, só somava uma 2ª entrada;
//   2. "Adiar todos" montava as linhas com `par_key` ORDENADO, então as duas
//      entradas viravam duas linhas com a MESMA chave no MESMO `INSERT ... ON
//      CONFLICT`. O Postgres recusa isso com **21000 · "ON CONFLICT DO UPDATE
//      command cannot affect row a second time"** e o lote inteiro é perdido.
//      Foi o erro que o Matheus viu em 19/08/2026.
//
// ⚠️ `ON CONFLICT` não é um `UPDATE` que roda duas vezes: o Postgres recusa o
// comando inteiro quando a mesma linha-alvo aparece 2× no mesmo statement. Logo
// **deduplicar é obrigação de quem monta o lote** — não existe "última vence".

/**
 * Chave canônica de um par de cadastros. Ordenada, então (A,B) e (B,A) dão a
 * mesma string. É o formato gravado em `entradas_pares_adiados.par_key`.
 * @returns {string|null} null quando falta um dos lados (nunca uma chave meia).
 */
function parKey(a, b) {
  if (!a || !b) return null;
  const ia = String(a);
  const ib = String(b);
  if (ia === ib) return null; // par consigo mesmo não é par
  return ia < ib ? `${ia}_${ib}` : `${ib}_${ia}`;
}

/**
 * Remove linhas repetidas pela chave de par, preservando a PRIMEIRA ocorrência.
 *
 * ⚠️ Primeira, não última: quem chama já ordenou por relevância (prioridade e
 * confiança). Deixar a última vencer trocaria silenciosamente a evidência
 * escolhida pela ordem de varredura.
 *
 * ⚠️ Linha sem chave resolvível é DESCARTADA e contabilizada em `semChave` —
 * não pode virar `par_key: null` numa tabela cuja unicidade é essa coluna.
 *
 * @param {Array<object>} linhas
 * @param {(linha:object)=>(string|null)} lerChave
 * @returns {{linhas: Array<object>, duplicadas: number, semChave: number}}
 */
function dedupPorParKey(linhas, lerChave = (l) => parKey(l?.membro_a_id, l?.membro_b_id)) {
  const vistas = new Set();
  const saida = [];
  let duplicadas = 0;
  let semChave = 0;
  for (const linha of Array.isArray(linhas) ? linhas : []) {
    const chave = lerChave(linha);
    if (!chave) { semChave += 1; continue; }
    if (vistas.has(chave)) { duplicadas += 1; continue; }
    vistas.add(chave);
    saida.push(linha);
  }
  return { linhas: saida, duplicadas, semChave };
}

module.exports = { parKey, dedupPorParKey };
