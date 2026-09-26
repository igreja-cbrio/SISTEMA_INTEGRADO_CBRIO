// ════════════════════════════════════════════════════════════════════════════
//  Quantos lotes puxar quando a busca precisa olhar a lista INTEIRA.
//
//  ⚠️⚠️ POR QUE ESTE MÓDULO EXISTE. Em 24/09/2026 o Matheus pediu: *"preciso
//  conseguir pesquisar o nome da pessoa na caixa de texto e achar ela"*. A
//  busca do censo já era desenhada para olhar tudo — e puxava `respostas(id,
//  1000, 0)`, um lote fixo. Medido no mesmo dia: a pesquisa tinha **1.410
//  respostas**. Como a ordem é da mais recente para a mais antiga, as **410
//  mais antigas** (desde 13/08) eram invisíveis para quem buscava, e a tela
//  respondia "0 encontrada(s)" — que a pessoa lê como "fulano não respondeu".
//
//  ⚠️ O teto de 1.000 não é capricho do cliente: `GET /censo/respostas` faz
//  `Math.min(limite, 1000)`. Pedir 5.000 não adianta — o servidor devolve 1.000
//  e não avisa. Por isso a solução é PAGINAR, não aumentar o número.
//
//  ⚠️⚠️ E SE UM DIA NÃO COUBER, A TELA TEM QUE DIZER. Um teto que trunca em
//  silêncio é exatamente o defeito que estamos consertando: ele volta com outra
//  cara, mais tarde, quando ninguém lembrar. Daí `truncado` subir junto.
// ════════════════════════════════════════════════════════════════════════════

// Teto por requisição imposto pelo servidor (`Math.min(limite, 1000)` em
// `backend/routes/censo.js`). Mudar aqui sem mudar lá volta a truncar calado.
export const POR_LOTE = 1000;

// Teto de sanidade: 20 requisições = 20.000 respostas. Acima disso, buscar
// no navegador deixa de ser razoável e a tela avisa em vez de fingir.
export const MAX_LOTES = 20;

/**
 * Os offsets a puxar para cobrir `total` linhas.
 *
 * @returns { offsets, truncado, alcance }
 *   `alcance` = quantas linhas os offsets cobrem de fato (para a tela poder
 *   dizer "busquei em 20.000 de 34.000", em vez de mentir por omissão).
 */
export function lotesPara(total, porLote = POR_LOTE, maxLotes = MAX_LOTES) {
  const n = Number(total);
  const passo = Number(porLote) > 0 ? Math.floor(Number(porLote)) : POR_LOTE;
  const teto = Number(maxLotes) > 0 ? Math.floor(Number(maxLotes)) : MAX_LOTES;

  // ⚠️ Total desconhecido (primeira busca, antes de qualquer contagem) pede UM
  // lote: ele volta com o `total` e a próxima rodada completa. Devolver zero
  // lotes aqui deixaria a busca sem nunca começar.
  if (!Number.isFinite(n) || n <= 0) return { offsets: [0], truncado: false, alcance: passo };

  const necessarios = Math.ceil(n / passo);
  const usados = Math.min(necessarios, teto);
  const offsets = [];
  for (let i = 0; i < usados; i += 1) offsets.push(i * passo);
  return {
    offsets,
    truncado: necessarios > teto,
    alcance: Math.min(n, usados * passo),
  };
}
