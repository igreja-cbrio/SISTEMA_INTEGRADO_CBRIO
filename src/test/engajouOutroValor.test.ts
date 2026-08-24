// ⚠️⚠️ POR QUE ESTE ARQUIVO EXISTE (24/08/2026): o Matheus perguntou por que a
// linha "Engajados +1 valor" do /ministerial/cuidados vive em ZERO. Medido: ela
// lia SÓ `jornada_encaminhamentos` com status='engajou' — uma fila com **4
// linhas na história inteira** (1 engajou, 3 pendentes), nenhuma dos 131
// convertidos dos últimos 90 dias. Não era falta de identidade: os 131 têm
// `membro_id`. Era a régua perguntando pelo lugar errado.
//
// A régua nova lê os FATOS (grupo, voluntariado, Next, batismo). O que este
// arquivo protege é o que separa um fato de um palpite.
import { describe, it, expect } from 'vitest';
import {
  CHAVES_OUTRO_VALOR,
  marcoContaComoEngajamento,
  valoresEngajados,
  engajouEmOutroValor,
  montarMarco,
} from '../../backend/utils/jornadaTempo.js';

const real = (d: string, t0: string) => montarMarco(d, t0);

describe('CHAVES_OUTRO_VALOR', () => {
  it('⚠️ o 1º CONTATO fica de fora — é a linha anterior do funil', () => {
    expect(CHAVES_OUTRO_VALOR).not.toContain('contato');
    // sem isso as duas linhas do gráfico quase coincidem e ele para de
    // responder "quantos seguiram pra outro valor"
    expect(CHAVES_OUTRO_VALOR).toEqual(['next', 'batismo', 'grupo', 'servir', 'generosidade']);
  });
});

describe('marcoContaComoEngajamento', () => {
  it('marco com data real depois da decisão conta', () => {
    expect(marcoContaComoEngajamento(real('2026-08-18', '2026-08-10'))).toBe(true);
  });

  it('⚠️ marco ANTES da decisão NÃO conta — já estava na igreja e decidiu depois', () => {
    const m = real('2026-05-01', '2026-08-10');
    expect(m.motivo).toBe('antes_da_decisao');
    expect(marcoContaComoEngajamento(m)).toBe(false);
  });

  it('⚠️⚠️ data de IMPORTAÇÃO não conta — a carga carimbou o dia, não a pessoa', () => {
    const m = montarMarco('2026-06-19', '2026-06-01', { suspeita: true });
    expect(m.motivo).toBe('data_de_importacao');
    expect(marcoContaComoEngajamento(m)).toBe(false);
  });

  it('⚠️ SEM DATA conta — o fato é certo, o que falta é a data', () => {
    // caso real: `next_encontros.data` é NULLABLE e a pessoa esteve lá
    const m = montarMarco(null, '2026-08-10', { alcancado: true });
    expect(m.motivo).toBe('sem_data');
    expect(m.aproximada).toBe(true);
    expect(marcoContaComoEngajamento(m)).toBe(true);
  });

  it('marco ausente ou nulo não conta', () => {
    expect(marcoContaComoEngajamento(null as never)).toBe(false);
    expect(marcoContaComoEngajamento(undefined as never)).toBe(false);
    expect(marcoContaComoEngajamento({ alcancado: false } as never)).toBe(false);
  });
});

describe('valoresEngajados / engajouEmOutroValor', () => {
  const t0 = '2026-08-10';

  it('⚠️ só o contato NÃO é engajamento — é o passo anterior', () => {
    const p = { marcos: { contato: real('2026-08-11', t0) } };
    expect(valoresEngajados(p)).toEqual([]);
    expect(engajouEmOutroValor(p)).toBe(false);
  });

  it('entrou em grupo depois de decidir → engajou', () => {
    const p = { marcos: { contato: real('2026-08-11', t0), grupo: real('2026-08-18', t0) } };
    expect(valoresEngajados(p)).toEqual(['grupo']);
    expect(engajouEmOutroValor(p)).toBe(true);
  });

  it('devolve os valores NA ORDEM da jornada, sem repetir', () => {
    const p = { marcos: {
      grupo: real('2026-08-20', t0), next: real('2026-08-15', t0), servir: real('2026-08-22', t0),
    } };
    expect(valoresEngajados(p)).toEqual(['next', 'grupo', 'servir']);
  });

  it('⚠️ grupo com data de import + nada mais = NÃO engajou', () => {
    const p = { marcos: {
      contato: real('2026-08-11', t0),
      grupo: montarMarco('2026-08-19', t0, { suspeita: true }),
    } };
    expect(engajouEmOutroValor(p)).toBe(false);
  });

  it('grupo suspeito MAS Next real = engajou (um sinal bom basta)', () => {
    const p = { marcos: {
      grupo: montarMarco('2026-08-19', t0, { suspeita: true }),
      next: real('2026-08-21', t0),
    } };
    expect(valoresEngajados(p)).toEqual(['next']);
    expect(engajouEmOutroValor(p)).toBe(true);
  });

  it('pessoa sem marcos / objeto vazio não quebra', () => {
    expect(engajouEmOutroValor({ marcos: {} })).toBe(false);
    expect(engajouEmOutroValor({})).toBe(false);
    expect(engajouEmOutroValor(null as never)).toBe(false);
  });

  it('⚠️ chave fora do catálogo é IGNORADA — não vira valor novo por acidente', () => {
    const p = { marcos: { inventado: real('2026-08-18', t0) } };
    expect(valoresEngajados(p)).toEqual([]);
  });
});
