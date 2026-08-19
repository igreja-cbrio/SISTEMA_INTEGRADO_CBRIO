import { describe, it, expect, vi, afterEach } from 'vitest';
import { idadeEmAnos, faixaEtaria, faixaPorIdade, faixaLabel, sexoLabel } from '../lib/faixaEtaria';

// Este helper é espelho de `public.fn_faixa_etaria`. Erro aqui não dá exceção —
// só produz uma lista impressa que discorda do que o banco/KPI conta, e ninguém
// percebe até separarem as pessoas erradas nos quartos do retiro.

function nascidoHaAnos(anos: number, deslocDias = 0): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - anos);
  d.setDate(d.getDate() + deslocDias);
  // Formata no calendário LOCAL. `toISOString()` muda para UTC e, depois das
  // 21h no Brasil, avança um dia — exatamente quando os testes de limiar
  // ficavam um ano abaixo e tornavam o CI dependente do horário da execução.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
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

  // ⚠️ SIMETRIA COM O BANCO (migration 20260819200000): `fn_faixa_etaria`
  // não tinha essa guarda e `age()` de data FUTURA dá 0 anos ⇒ classificava
  // 3 mulheres adultas do import de grupos como CRIANÇA na Membresia. Os dois
  // espelhos só concordam se os DOIS recusarem data impossível.
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

  // ⚠️ Régua da igreja desde 19/08/2026 (antes: jovem até 30, adulto 31+).
  // Vale em todo lugar — Membresia, painel de área, inscrições e batismo.
  it('18 a 25 = jovem (os dois limites incluídos)', () => {
    expect(faixaEtaria(nascidoHaAnos(18))).toBe('jovem');
    expect(faixaEtaria(nascidoHaAnos(25))).toBe('jovem');
  });

  it('26+ = adulto', () => {
    expect(faixaEtaria(nascidoHaAnos(26))).toBe('adulto');
    expect(faixaEtaria(nascidoHaAnos(30))).toBe('adulto');   // era jovem até 18/08
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

describe('data impossível não vira faixa', () => {
  // Caso real: `grupos_import_2026` carimbou o ano corrente em aniversário que
  // veio só com dia e mês, e uma linha ficou com 1886 (século errado, o mesmo
  // padrão do 1085 da inscrição de batismo).
  it('nascimento no futuro e idade acima de 130 devolvem null', () => {
    expect(faixaEtaria(nascidoHaAnos(-1))).toBeNull();
    expect(faixaEtaria('2026-11-21', new Date(2026, 7, 19))).toBeNull();
    expect(faixaEtaria('1886-03-15')).toBeNull();
    expect(faixaLabel('2026-11-21')).toBe('Sem data de nascimento');
  });
});

describe('faixaPorIdade · a régua sobre a idade, sem depender de data', () => {
  it('os quatro cortes', () => {
    expect(faixaPorIdade(12)).toBe('crianca');
    expect(faixaPorIdade(13)).toBe('adolescente');
    expect(faixaPorIdade(17)).toBe('adolescente');
    expect(faixaPorIdade(18)).toBe('jovem');
    expect(faixaPorIdade(25)).toBe('jovem');
    expect(faixaPorIdade(26)).toBe('adulto');
  });

  // ⚠️ A régua é EXPORTADA e recebe idade calculada por quem chama (o batismo,
  // o painel de área). Idade impossível não pode virar faixa: "criança" vinda de
  // uma conta quebrada é indistinguível de criança de verdade na tela.
  it('idade impossível devolve null em vez de virar criança', () => {
    expect(faixaPorIdade(null)).toBeNull();
    expect(faixaPorIdade(undefined)).toBeNull();
    expect(faixaPorIdade(-1)).toBeNull();
    expect(faixaPorIdade(Number.NaN)).toBeNull();
    expect(faixaPorIdade(Number.POSITIVE_INFINITY)).toBeNull();
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
