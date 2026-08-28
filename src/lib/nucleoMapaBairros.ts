// Régua PURA do enquadramento inicial do mapa de calor da Membresia.
//
// ⚠️ Vive FORA do componente de propósito: `MapaBairros.tsx` importa
// `maplibre-gl`, que não sobe em ambiente de teste (WebGL). Régua que decide
// recorte precisa entrar no gate, então ela mora aqui e o componente consome.
//
// ⚠️⚠️ O que esta régua decide é a CÂMERA INICIAL, nunca o que é desenhado.
// Bairro fora do núcleo continua no mapa, e a tela declara quantos são — a
// diferença entre "fora do quadro" e "escondido" é o que faz este recorte ser
// honesto. Se um dia alguém usar `nucleo` para FILTRAR os pontos desenhados,
// a regra a reescrever é esta, não o consumidor.

export type PontoBairro = {
  bairro: string;
  norm: string;
  total: number;
  lat: number;
  lng: number;
};

/** Distância angular ao quadrado. Serve para ORDENAR, então a raiz é
 *  desnecessária — e a distorção do cosseno da latitude é irrelevante aqui
 *  (comparamos pontos da mesma região metropolitana entre si). */
const dist2 = (a: PontoBairro, lat: number, lng: number) =>
  (a.lat - lat) ** 2 + (a.lng - lng) ** 2;

/** Mediana simples de uma lista já ordenada. Mediana e não média porque UM
 *  ponto distante move a média e não move a mediana — é o ponto distante que
 *  esta régua existe para não deixar mandar no enquadramento. */
const mediana = (ordenada: number[]) => {
  const n = ordenada.length;
  if (n === 0) return 0;
  const meio = Math.floor(n / 2);
  return n % 2 ? ordenada[meio] : (ordenada[meio - 1] + ordenada[meio]) / 2;
};

/** Bairros que entram no QUADRO INICIAL. O resto volta em `fora` para a tela
 *  poder declarar — e continua desenhado no mapa.
 *
 *  A régua é UMA: os bairros MAIS PRÓXIMOS do centro de massa que, somados,
 *  cobrem `cobertura` das pessoas (padrão 90%).
 *
 *  ⚠️⚠️ ORDENAR POR PROXIMIDADE, NÃO POR TAMANHO — foi a correção de
 *  24/08/2026, medida em produção. A versão anterior ordenava pelo maior e
 *  parava em 90%, e com a cauda longa de hoje isso não protegia de nada:
 *  Barra 55 + Recreio 21 = 62% de 123 pessoas, então chegar a 90% exigia **14
 *  bairros**, e entre eles entravam "Centro" em Barra Mansa (2 pessoas),
 *  "Jardim Amália" em Volta Redonda (1) e "Várzea" em Teresópolis (1). TRÊS
 *  pessoas esticavam o quadro de −44,08° a −42,53° de longitude: o mapa abria
 *  no estado inteiro e a concentração da Barra virava uma bolinha — justamente
 *  a leitura que este mapa existe para dar.
 *
 *  ⚠️ Ordenar por tamanho mede QUANTAS pessoas; o que estica o quadro é ONDE
 *  elas estão. Só a ordem por distância responde a pergunta certa.
 *
 *  ⚠️⚠️ E a cobertura continua valendo sobre o TOTAL, não sobre um subconjunto:
 *  a 1ª tentativa deste conserto encadeou DOIS cortes de 90% (um por gente,
 *  outro por distância) e a cobertura efetiva caiu para 88% — no pior caso
 *  0,9 × 0,9 = 81%. O teste pegou. Um corte só mantém a promessa.
 *
 *  ⚠️ POLO LEGÍTIMO NUNCA É CORTADO, e não por sorte: sem ele a cobertura não
 *  fecha. Um segundo bairro com 40 de 100 pessoas entra obrigatoriamente,
 *  porque os vizinhos do centro só chegam a 60%. Quem fica de fora é sempre
 *  massa desprezível — 4 pessoas em 123, no caso real. */
export function nucleoDoMapa<T extends PontoBairro>(bairros: T[], cobertura = 0.9) {
  if (bairros.length <= 1) return { nucleo: bairros, fora: [] as T[] };
  const total = bairros.reduce((s, b) => s + b.total, 0);
  // ⚠️ Sem gente contada não há concentração a recortar — recortar aqui
  // esconderia bairro por acaso de ordenação.
  // ⚠️ HONESTIDADE SOBRE COBERTURA: este `return` é DEFENSIVO e o mutante que o
  // apaga SOBREVIVE ao teste — e sobrevive porque é equivalente, não porque o
  // teste é fraco: sem ele, `0 / 0` dá NaN, `NaN >= cobertura` é falso, o laço
  // percorre tudo e o resultado é o mesmo. Fica pela intenção declarada (e
  // porque protege se alguém trocar a comparação por outra que trate NaN de
  // forma diferente), não por cobertura que eu não tenho.
  if (total <= 0) return { nucleo: bairros, fora: [] as T[] };

  // O centro é a MEDIANA das coordenadas, não a média: a média é arrastada por
  // um ponto distante, e é exatamente o ponto distante que esta régua existe
  // para não deixar mandar no enquadramento.
  const centroLat = mediana(bairros.map((b) => b.lat).sort((a, b) => a - b));
  const centroLng = mediana(bairros.map((b) => b.lng).sort((a, b) => a - b));

  const porDistancia = [...bairros].sort(
    (a, b) => dist2(a, centroLat, centroLng) - dist2(b, centroLat, centroLng),
  );
  const nucleo: T[] = [];
  let acumulado = 0;
  for (const b of porDistancia) {
    nucleo.push(b);
    acumulado += b.total;
    if (acumulado / total >= cobertura) break;
  }

  const dentro = new Set(nucleo.map((b) => b.norm));
  return { nucleo, fora: bairros.filter((b) => !dentro.has(b.norm)) };
}
