import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require_ = createRequire(import.meta.url);
const {
  CORES_EVENTO,
  COR_EXCEDENTE,
  corDoEvento,
  ehExcedente,
} = require_('../../backend/utils/marketingCores.js');

// ---------------------------------------------------------------------------
// Estes hex foram BUSCADOS com o validador de paleta (todos os pares, dois
// temas), não escolhidos a olho. O teste não revalida a matemática de cor —
// ele trava o CONTRATO que a busca estabeleceu, pra que mexer nas cores seja
// decisão consciente e não efeito colateral de um ajuste de UI.
// ---------------------------------------------------------------------------
describe('paleta dos eventos no calendário', () => {
  it('são 6 cores, distintas, em hex de 6 dígitos', () => {
    expect(CORES_EVENTO).toHaveLength(6);
    expect(new Set(CORES_EVENTO).size).toBe(6);
    for (const c of CORES_EVENTO) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });

  // ⚠️ O teal da marca é o acento do sistema (o "hoje" do calendário, botões
  // primários). Se ele entrar na paleta, um evento passa a parecer destaque do
  // sistema — e a pessoa procura significado onde não há.
  it('a cor da MARCA fica fora da paleta categórica', () => {
    const marca = ['#00b39d', '#00897b', '#3fe3c6'];
    for (const m of marca) {
      expect(CORES_EVENTO.map((c: string) => c.toLowerCase())).not.toContain(m);
    }
    expect(COR_EXCEDENTE.toLowerCase()).not.toBe('#00b39d');
  });

  it('cada posição até a 6ª tem cor própria', () => {
    const usadas = [0, 1, 2, 3, 4, 5].map(corDoEvento);
    expect(new Set(usadas).size).toBe(6);
    expect(usadas).toEqual(CORES_EVENTO);
    for (const i of [0, 1, 2, 3, 4, 5]) expect(ehExcedente(i)).toBe(false);
  });

  // ⚠️ A régua da casa: além da paleta, dobra em "Outro" — NUNCA gera matiz
  // nova (seria cor não validada, e duas geradas podem colidir para um
  // dicromata). Do 7º em diante a faixa é cinza e o NOME carrega a identidade.
  it('do 7º evento em diante cai no cinza neutro, sem inventar matiz', () => {
    for (const i of [6, 7, 12, 99]) {
      expect(corDoEvento(i)).toBe(COR_EXCEDENTE);
      expect(ehExcedente(i)).toBe(true);
    }
    expect(CORES_EVENTO).not.toContain(COR_EXCEDENTE);
  });

  it('índice inválido não estoura nem devolve undefined', () => {
    for (const ruim of [-1, NaN, undefined, null, 'a', 1.5, {}] as any[]) {
      expect(corDoEvento(ruim)).toBe(COR_EXCEDENTE);
      expect(ehExcedente(ruim)).toBe(true);
    }
  });

  // ⚠️ A cor sai da POSIÇÃO na lista ordenada por Dia D, então o mesmo evento
  // mantém a cor de mês para mês. Chamar duas vezes tem que dar o mesmo.
  it('é determinística', () => {
    for (const i of [0, 3, 5, 6, 40]) expect(corDoEvento(i)).toBe(corDoEvento(i));
  });
});
