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

/** Bairros que somam `cobertura` das pessoas (padrão 90%), do maior para o
 *  menor. O resto volta em `fora` para a tela poder declarar.
 *
 *  Motivo concreto (medido em 23/08/2026): a Barra concentra 55 de 79 pessoas
 *  e UM cadastro em Volta Redonda esticava o enquadramento até lá, espremendo
 *  o Rio inteiro num canto — justamente a leitura que o mapa existe para dar. */
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

  const ordenados = [...bairros].sort((a, b) => b.total - a.total);
  const nucleo: T[] = [];
  let acumulado = 0;
  for (const b of ordenados) {
    nucleo.push(b);
    acumulado += b.total;
    if (acumulado / total >= cobertura) break;
  }
  const dentro = new Set(nucleo.map((b) => b.norm));
  return { nucleo, fora: bairros.filter((b) => !dentro.has(b.norm)) };
}
