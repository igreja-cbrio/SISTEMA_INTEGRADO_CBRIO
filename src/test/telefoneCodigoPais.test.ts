import { describe, it, expect } from 'vitest';
import { tirarCodigoPais, mascaraTelefone, soDigitos } from '../lib/inscricao';

// Regra criada em 31/07 depois de achar 15 cadastros em produção com o DDD
// comido: colar "+55 21 99999-8888" (o formato que sai dos contatos do celular)
// gravava `55219999988` — 11 dígitos, passava nas duas validações, e era um
// número que não existe. O líder ligava (fluxo do Pr. Nélio) pro vazio.
//
// ⚠️ A ARMADILHA que este teste existe pra travar: **DDD 55 é Santa Maria/RS**.
// Um `replace(/^55/, '')` ingênuo destruiria todo número legítimo de lá. Só se
// remove o 55 quando o que sobra AINDA é telefone completo (12–13 dígitos).
describe('tirarCodigoPais', () => {
  it('remove o 55 do país quando sobra telefone completo', () => {
    expect(tirarCodigoPais('5521999998888')).toBe('21999998888'); // 13 → 11
    expect(tirarCodigoPais('552133334444')).toBe('2133334444');   // 12 → 10 (fixo)
  });

  it('NÃO toca em DDD 55 legítimo (Santa Maria/RS)', () => {
    expect(tirarCodigoPais('55999998888')).toBe('55999998888'); // 11 = DDD+celular
    expect(tirarCodigoPais('5532201234')).toBe('5532201234');   // 10 = DDD+fixo
  });

  it('não mexe em telefone normal nem em entrada vazia', () => {
    expect(tirarCodigoPais('21999998888')).toBe('21999998888');
    expect(tirarCodigoPais('')).toBe('');
    expect(tirarCodigoPais(null as unknown as string)).toBe('');
  });
});

describe('mascaraTelefone tira o país ANTES de truncar', () => {
  // O bug não era a ausência da normalização: era a ORDEM. O slice(0,11) cortava
  // os 2 últimos dígitos antes de qualquer chance de normalizar o prefixo.
  const gravado = (v: string) => soDigitos(mascaraTelefone(v));

  it('colar do contato com +55 preserva o número real', () => {
    expect(gravado('+55 21 99999-8888')).toBe('21999998888');
    expect(gravado('5521999998888')).toBe('21999998888');
  });

  it('DDD 55 com e sem código do país continuam corretos', () => {
    expect(gravado('+55 55 99999-8888')).toBe('55999998888');
    expect(gravado('(55) 99999-8888')).toBe('55999998888');
  });

  it('digitação normal segue intacta', () => {
    expect(gravado('(21) 99999-8888')).toBe('21999998888');
    expect(gravado('21 3333-4444')).toBe('2133334444');
  });

  it('o resultado sempre cabe na validação de 10–11 dígitos', () => {
    for (const entrada of [
      '+55 21 99999-8888', '5521999998888', '(55) 99999-8888',
      '+55 55 99999-8888', '(21) 99999-8888', '21 3333-4444',
    ]) {
      const d = gravado(entrada);
      expect(d.length, `${entrada} gravou ${d}`).toBeGreaterThanOrEqual(10);
      expect(d.length, `${entrada} gravou ${d}`).toBeLessThanOrEqual(11);
    }
  });
});
