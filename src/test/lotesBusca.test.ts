// ⚠️⚠️ QUANTOS LOTES A BUSCA PRECISA PUXAR — e o dia em que 1 não bastou mais.
//
// Matheus, 24/09/2026: *"preciso conseguir pesquisar o nome da pessoa na caixa
// de texto e achar ela"*. A busca do censo já era desenhada para olhar TUDO, e
// puxava um lote fixo de 1.000. Medido no mesmo dia: a pesquisa tinha **1.410
// respostas**. Como a ordem é da mais recente para a mais antiga, as **410 mais
// antigas** (desde 13/08) eram invisíveis — e a tela dizia "0 encontrada(s)",
// que se lê como "fulano não respondeu o censo".
//
// ⚠️ Aumentar o número não resolveria: `GET /censo/respostas` faz
// `Math.min(limite, 1000)` e devolve 1.000 sem avisar. Só paginando.
import { describe, it, expect } from 'vitest';
import { lotesPara, POR_LOTE, MAX_LOTES } from '@/lib/lotesBusca';

describe('os lotes que cobrem a lista inteira', () => {
  // O número real da pesquisa em 24/09/2026.
  it('1.410 respostas pedem DOIS lotes — um só deixava 410 de fora', () => {
    const r = lotesPara(1410);
    expect(r.offsets).toEqual([0, 1000]);
    expect(r.truncado).toBe(false);
    expect(r.alcance).toBe(1410);
  });

  it('cabendo em um lote, pede um só', () => {
    expect(lotesPara(1000).offsets).toEqual([0]);
    expect(lotesPara(1).offsets).toEqual([0]);
  });

  // ⚠️ O limite exato: 1.000 cabe em um; 1.001 já precisa de dois. Errar aqui
  // por um é o bug inteiro de novo, só que mais difícil de ver.
  it('1.001 já precisa de dois', () => {
    expect(lotesPara(1001).offsets).toHaveLength(2);
    expect(lotesPara(1000).offsets).toHaveLength(1);
  });

  // ⚠️ Total desconhecido (primeira busca) pede UM lote: ele volta com o total
  // e a rodada seguinte completa. Zero lotes deixaria a busca sem começar.
  it('sem total conhecido, começa com um lote', () => {
    expect(lotesPara(null).offsets).toEqual([0]);
    expect(lotesPara(undefined).offsets).toEqual([0]);
    expect(lotesPara(0).offsets).toEqual([0]);
  });
});

describe('⚠️⚠️ teto que trunca tem que AVISAR', () => {
  it('acima do teto, marca truncado e diz o alcance real', () => {
    const r = lotesPara(34000);
    expect(r.offsets).toHaveLength(MAX_LOTES);
    expect(r.truncado).toBe(true);
    expect(r.alcance).toBe(MAX_LOTES * POR_LOTE);
  });

  it('exatamente no teto ainda não é truncado', () => {
    const r = lotesPara(MAX_LOTES * POR_LOTE);
    expect(r.truncado).toBe(false);
    expect(r.offsets).toHaveLength(MAX_LOTES);
  });

  it('um a mais que o teto já é truncado', () => {
    expect(lotesPara(MAX_LOTES * POR_LOTE + 1).truncado).toBe(true);
  });
});

describe('parâmetros tortos não viram lote infinito', () => {
  it('porLote inválido cai no padrão', () => {
    expect(lotesPara(1410, 0).offsets).toEqual([0, 1000]);
    expect(lotesPara(1410, -5).offsets).toEqual([0, 1000]);
  });

  it('maxLotes inválido cai no padrão', () => {
    expect(lotesPara(34000, 1000, 0).offsets).toHaveLength(MAX_LOTES);
  });

  it('total não numérico não estoura', () => {
    expect(lotesPara('muitos' as never).offsets).toEqual([0]);
  });
});
