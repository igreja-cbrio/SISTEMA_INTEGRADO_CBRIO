/**
 * ⚠️⚠️ LEI · aviso PERIÓDICO é AGREGADO (1 por tipo), nunca 1 por item.
 *
 * Sem regra em `notificacao_regras` o `notificar` cai no fallback de TODOS os
 * admin/diretor (16 pessoas), então cada item vira 16 linhas no sino. Medido em
 * 10/08/2026, com o cron de notificações já rodando: 16.646 avisos NÃO LIDOS
 * para 90 pessoas = 185 por pessoa, e o módulo `grupos` sozinho respondia por
 * 9.782 (59%) — `grupo_sem_encontro` era 1 aviso por grupo atrasado POR DIA
 * (~101 por pessoa) e `kids_crianca_ausente` chegou a 211 para a MESMA pessoa.
 * Sino nesse estado não é lido, o que na prática é o mesmo que não notificar.
 *
 * É a mesma régua já aplicada em `grupos_sem_visita`, no censo, no lote de
 * aprovação de cadastros e em `cadastro_sem_nome_real`.
 *
 * ⚠️ A `chaveDedup` destes avisos é ESTÁVEL (sem data) de propósito: a dedup do
 * `notificar` só vale enquanto a notificação está NÃO LIDA (ver notificar.js —
 * o SELECT filtra `lida = false`), então chave estável garante no máximo 1
 * aviso não lido por tipo por pessoa, e depois de lida o próximo ciclo avisa de
 * novo (desejado). Chave com a data volta a empilhar 1 por dia, que é
 * exatamente o problema que isto conserta.
 * ⚠️ Custo declarado: enquanto o aviso não é lido, a contagem da mensagem é a do
 * momento em que ele nasceu. A verdade viva está na tela do `link`.
 */

/** Quantos itens aparecem nominalmente na mensagem antes do "e mais N". */
const MAX_AMOSTRA = 5;

/**
 * Resume uma lista de rótulos numa frase curta: os primeiros `max` + "e mais N".
 * ⚠️ NÃO ordena: a ordem é decisão de quem chama (cada gerador ordena pelo que
 * é "pior primeiro" no seu domínio — dias sem encontro, cultos perdidos…), e
 * ordenar aqui esconderia essa escolha do leitor.
 */
function amostraNomes(rotulos, max = MAX_AMOSTRA) {
  const itens = (rotulos || []).filter(r => r != null && String(r).trim() !== '');
  if (!itens.length) return '';
  const limite = Number.isFinite(max) && max > 0 ? Math.floor(max) : MAX_AMOSTRA;
  const lista = itens.slice(0, limite).join(', ');
  const resto = itens.length > limite ? ` e mais ${itens.length - limite}` : '';
  return `${lista}${resto}`;
}

/**
 * Concorda "1 grupo" / "2 grupos" sem inventar plural por sufixo — "reunião" →
 * "reuniões" não sai de `+ 's'`, e foi assim que um título quase saiu escrito
 * "1 reuniãoões".
 */
function plural(n, singular, pluralPalavra) {
  return Number(n) === 1 ? singular : pluralPalavra;
}

module.exports = { amostraNomes, plural, MAX_AMOSTRA };
