// Espelho CLIENTE da régua de frequência do Kids.
//
// ⚠️⚠️ RÉGUA GÊMEA de `backend/utils/kidsFrequencia.js` — as duas precisam
// decidir IGUAL. O servidor conta e classifica; a tela filtra e rotula. Se
// divergirem, o contador do seletor ("2 a 5: 120") deixa de bater com a lista
// que aparece ao escolher a faixa, e ninguém descobre olhando a tela.
// `src/test/kidsFrequencia.test.ts` roda o MESMO vetor de casos nas duas.
//
// O backend não pode ser importado aqui (vai pro bundle do navegador), daí o
// espelho — mesmo padrão de `src/lib/busca.js` × `backend/services/busca.js`.

export type FaixaCheckin = 'zero' | '1' | '2-5' | '6-10' | '11+';

export const FAIXAS_CHECKIN: { key: FaixaCheckin; rotulo: string }[] = [
  { key: 'zero', rotulo: 'Nenhum check-in' },
  { key: '1', rotulo: '1 check-in' },
  { key: '2-5', rotulo: '2 a 5 check-ins' },
  { key: '6-10', rotulo: '6 a 10 check-ins' },
  { key: '11+', rotulo: '11 ou mais' },
];

/**
 * Em qual faixa cai a contagem.
 *
 * ⚠️ `null`/`undefined` cai em 'zero' junto com o zero real: a rota devolve
 * null quando NÃO CONSEGUIU ler os check-ins, e nesse caso a tela mostra o
 * aviso do servidor em vez de deixar a pessoa concluir que ninguém veio.
 */
export function faixaCheckin(qtd: number | null | undefined): FaixaCheckin {
  const n = Number(qtd);
  if (!Number.isFinite(n) || n <= 0) return 'zero';
  if (n === 1) return '1';
  if (n <= 5) return '2-5';
  if (n <= 10) return '6-10';
  return '11+';
}

/** A contagem casa com a faixa escolhida? 'todas' nunca filtra. */
export function casaFaixaCheckin(qtd: number | null | undefined, faixaSel: string): boolean {
  if (!faixaSel || faixaSel === 'todas') return true;
  return faixaCheckin(qtd) === faixaSel;
}
