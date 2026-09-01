// ============================================================================
// Reordenar tarefas na tela (/tarefas) · pedido do Matheus, 01/09
//
// A lista é agrupada por prazo (Atrasadas · Hoje · Próximos 7 dias · Mais tarde
// · Sem prazo), e "mover pra cima" acontece DENTRO do grupo.
// ============================================================================

/** Troca de lugar dois vizinhos e devolve a nova sequência de ids do grupo. */
export function trocarVizinho(ids: string[], idx: number, direcao: 1 | -1): string[] | null {
  const alvo = idx + direcao;
  // Nas pontas não há o que fazer — quem chama desabilita o botão, e aqui é a
  // rede: devolver `null` impede gravar uma "nova ordem" idêntica à antiga.
  if (!Array.isArray(ids) || idx < 0 || idx >= ids.length) return null;
  if (alvo < 0 || alvo >= ids.length) return null;
  const out = [...ids];
  [out[idx], out[alvo]] = [out[alvo], out[idx]];
  return out;
}

/**
 * Aplica a nova ordem do grupo NA LISTA INTEIRA, para a tela mexer na hora.
 *
 * ⚠️ NÃO é um `sort` com comparador: os itens do grupo não são contíguos na
 * lista e um comparador que devolve 0 para "um de fora" não define ordem total
 * — o resultado dependeria do algoritmo do motor. Aqui as POSIÇÕES ocupadas
 * pelo grupo são recalculadas e preenchidas na sequência nova; todo o resto
 * fica exatamente onde estava.
 */
export function aplicarNovaOrdem<T extends { id: string }>(lista: T[], idsNaOrdem: string[]): T[] {
  if (!Array.isArray(lista) || !Array.isArray(idsNaOrdem) || !idsNaOrdem.length) return lista;
  const doGrupo = new Set(idsNaOrdem);
  const porId = new Map(lista.filter((t) => t && doGrupo.has(t.id)).map((t) => [t.id, t]));
  // Id que não está na lista (apagado noutra aba) é ignorado em vez de virar
  // buraco — a gravação no servidor também não o move.
  const fila = idsNaOrdem.filter((id) => porId.has(id)).map((id) => porId.get(id) as T);
  let i = 0;
  return lista.map((t) => (t && doGrupo.has(t.id) ? fila[i++] : t));
}
