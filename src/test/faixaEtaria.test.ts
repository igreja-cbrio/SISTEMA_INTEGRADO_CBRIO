import { describe, it, expect, vi, afterEach } from 'vitest';
import { idadeEmAnos, faixaEtaria, faixaLabel, sexoLabel } from '../lib/faixaEtaria';

// Este helper é espelho de `public.fn_faixa_etaria`. Erro aqui não dá exceção —
// só produz uma lista impressa que discorda do que o banco/KPI conta, e ninguém
// percebe até separarem as pessoas erradas nos quartos do retiro.

function nascidoHaAnos(anos: number, deslocDias = 0): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - anos);
  d.setDate(d.getDate() + deslocDias);
  return d.toISOString().slice(0, 10);
}

afterEach(() => { vi.useRealTimers(); });

describe('idadeEmAnos', () => {
  it('conta anos completos, não a diferença de ano civil', () => {
    expect(idadeEmAnos(nascidoHaAnos(30))).toBe(30);
    // Aniversário amanhã → ainda não fez.
    expect(idadeEmAnos(nascidoHaAnos(31, 1))).toBe(30);
    // Aniversário foi ontem → já fez.
    expect(idadeEmAnos(nascidoHaAnos(31, -1))).toBe(31);
  });

  it('trata YYYY-MM-DD como data LOCAL, não UTC', () => {
    // Sem o +T00:00:00, 'YYYY-MM-DD' é parseado como UTC e em fuso negativo
    // vira o dia anterior — no limiar da faixa isso muda a classificação.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 28, 12, 0, 0)); // 28/07/2026 meio-dia local
    expect(idadeEmAnos('1996-07-28')).toBe(30);        // faz 30 exatamente hoje
    expect(idadeEmAnos('1996-07-29')).toBe(29);        // faz amanhã
  });

  it('devolve null pra ausente, inválido ou absurdo', () => {
    expect(idadeEmAnos(null)).toBeNull();
    expect(idadeEmAnos(undefined)).toBeNull();
    expect(idadeEmAnos('')).toBeNull();
    expect(idadeEmAnos('não é data')).toBeNull();
    expect(idadeEmAnos('1500-01-01')).toBeNull();   // > 130 anos
    expect(idadeEmAnos(nascidoHaAnos(-5))).toBeNull(); // futuro
  });

  it('aceita Date além de string', () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 20);
    expect(idadeEmAnos(d)).toBe(20);
  });
});

describe('faixaEtaria · limiares exatos da fn_faixa_etaria', () => {
  it('< 13 = criança', () => {
    expect(faixaEtaria(nascidoHaAnos(0))).toBe('crianca');
    expect(faixaEtaria(nascidoHaAnos(12))).toBe('crianca');
  });

  it('13 a 17 = adolescente (os dois limites incluídos)', () => {
    expect(faixaEtaria(nascidoHaAnos(13))).toBe('adolescente');
    expect(faixaEtaria(nascidoHaAnos(17))).toBe('adolescente');
  });

  it('18 a 30 = jovem (os dois limites incluídos)', () => {
    expect(faixaEtaria(nascidoHaAnos(18))).toBe('jovem');
    expect(faixaEtaria(nascidoHaAnos(30))).toBe('jovem');
  });

  it('31+ = adulto', () => {
    expect(faixaEtaria(nascidoHaAnos(31))).toBe('adulto');
    expect(faixaEtaria(nascidoHaAnos(80))).toBe('adulto');
  });

  it('sem nascimento = null, e o rótulo diz isso em vez de chutar faixa', () => {
    expect(faixaEtaria(null)).toBeNull();
    expect(faixaLabel(null)).toBe('Sem data de nascimento');
  });

  it('slug nunca leva acento (é identificador); rótulo leva', () => {
    expect(faixaEtaria(nascidoHaAnos(5))).toBe('crianca');   // sem cedilha
    expect(faixaLabel(nascidoHaAnos(5), true)).toBe('Criança'); // com cedilha
  });
});

describe('sexoLabel', () => {
  it('traduz o vocabulário canônico', () => {
    expect(sexoLabel('masculino')).toBe('Masculino');
    expect(sexoLabel('feminino')).toBe('Feminino');
  });

  it('ausente vira "Não informado", não string vazia', () => {
    // Célula vazia na lista impressa parece erro de impressão.
    expect(sexoLabel(null)).toBe('Não informado');
    expect(sexoLabel('')).toBe('Não informado');
  });

  it('valor desconhecido é exibido como veio, não escondido', () => {
    expect(sexoLabel('outro')).toBe('outro');
  });
});
