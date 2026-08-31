/**
 * Tira comentário de JS/TS/TSX antes de procurar CHAMADA — régua ÚNICA das
 * guardas estáticas do gate.
 *
 * ⚠️ Existe porque guarda estática que casa texto cru dá falso positivo com a
 * PRÓPRIA explicação do conserto (a armadilha de 06/08/2026, que já pegou o
 * lado SQL e depois o lado JS): a documentação cita o padrão errado como
 * exemplo, e o teste "acha" o que ele existe pra proibir. Procurar comando,
 * nunca identificador solto.
 *
 * ⚠️⚠️ Estava DUPLICADA em `routeModuleMap.test.ts` e `rpcsCliente.test.ts`
 * (26/08/2026). As duas cópias estavam iguais por sorte — e é exatamente assim
 * que régua duplicada divergiu neste repo várias vezes. Vive num módulo só, e
 * NÃO é `.test.ts` de propósito: arquivo de teste importado por outro faz o
 * vitest rodar a suíte dele duas vezes.
 */
export function semComentariosJs(src: string): string {
  // ⚠️⚠️ A ORDEM IMPORTA, e estava invertida (achado 26/08/2026). Tirar o
  // bloco `/* */` PRIMEIRO faz um `//` de linha que CONTENHA `/*` abrir um
  // comentário falso, e a limpeza engole tudo até o próximo `*/`. Caso real:
  // `backend/routes/painel.js` linha 2 é `// /api/painel/* - Endpoints...` e o
  // `*/` seguinte está na linha 1101 — **1.099 linhas de código sumiam** para
  // esta guarda. Medido em toda a árvore: **84 arquivos, 8.169 linhas**.
  // ⚠️ O `(^|[^:])` preserva o `//` de URL (`https://…`), que é código real.
  // ⚠️ PRESERVA COMPRIMENTO E LINHAS: comentário vira ESPAÇO, `\n` fica. Antes
  // o bloco `/* */` era REMOVIDO e o número de linha reportado DERIVAVA — em
  // 31/08/2026 isso fez uma varredura minha apontar linhas erradas em
  // `publicWhatsapp.js` (comentários longos), e eu quase reescrevi o lugar
  // errado. Guarda que erra a linha é guarda que manda consertar outra coisa.
  const espacos = (m: string) => m.replace(/[^\n]/g, ' ');
  return String(src || '')
    .replace(/(^|[^:])(\/\/[^\n]*)/g, (_m, pre, com) => pre + espacos(com))
    .replace(/\/\*[\s\S]*?\*\//g, espacos);
}
