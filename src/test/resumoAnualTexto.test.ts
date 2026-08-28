// Contrato do texto do comparativo do ano — o que é COLADO em grupo de liderança.
//
// ⚠️ O que estes testes protegem, em ordem de dano:
//   1. ano SEM DADO nunca virar "0" (o endpoint devolve `total: 0` com
//      `tem_dado: false`, e "0 decisões em 2024" num WhatsApp é uma afirmação
//      falsa que ninguém volta pra conferir);
//   2. o RÓTULO DO PERÍODO sair junto (um número acumulado sem "até 27/08" é
//      comparado com ano fechado);
//   3. o formato pt-BR dos milhares;
//   4. linha inteira sem dado não virar bloco de três traços.
import { describe, it, expect } from 'vitest';
import { montarResumoAnual, linhasDoYtd, numeroBr } from '../lib/resumoAnualTexto';

// Números REAIS de produção em 27/08/2026 (conferidos por SQL).
const FREQ = [
  { ano: 2024, total: 71417, tem_dado: true },
  { ano: 2025, total: 80685, tem_dado: true },
  { ano: 2026, total: 78416, tem_dado: true },
];
const DEC = [
  { ano: 2024, total: 1317, tem_dado: true },
  { ano: 2025, total: 1258, tem_dado: true },
  { ano: 2026, total: 609, tem_dado: true },
];
const BAT = [
  { ano: 2024, total: 162 },
  { ano: 2025, total: 158 },
  { ano: 2026, total: 104 },
];
const ANOS = [2024, 2025, 2026];

describe('resumoAnualTexto · número', () => {
  it('formata milhares em pt-BR, sem casa decimal', () => {
    expect(numeroBr(78416)).toBe('78.416');
    expect(numeroBr(609)).toBe('609');
    expect(numeroBr(1258.4)).toBe('1.258');
  });

  it('valor inválido vira travessão, nunca 0', () => {
    expect(numeroBr(null)).toBe('—');
    expect(numeroBr(undefined)).toBe('—');
    expect(numeroBr('abc')).toBe('—');
  });
});

describe('resumoAnualTexto · linhas a partir do /ytd', () => {
  it('monta as três linhas com os números reais', () => {
    const l = linhasDoYtd({ anos: ANOS, frequencia: FREQ, decisoes: DEC, batismos: BAT });
    expect(l.map((x) => x.rotulo)).toEqual(['Frequência', 'Decisões', 'Batismos']);
    expect(l[0].anos.map((a) => a.valor)).toEqual([71417, 80685, 78416]);
    expect(l[2].anos.map((a) => a.valor)).toEqual([162, 158, 104]);
  });

  it('⚠️⚠️ `tem_dado: false` vira NULL, mesmo com total 0', () => {
    const semDado = [{ ano: 2024, total: 0, tem_dado: false }, ...DEC.slice(1)];
    const l = linhasDoYtd({ anos: ANOS, frequencia: FREQ, decisoes: semDado, batismos: BAT });
    expect(l[1].anos[0].valor).toBeNull();
    expect(l[1].anos[1].valor).toBe(1258);
  });

  it('ano ausente na resposta vira NULL', () => {
    const l = linhasDoYtd({ anos: ANOS, frequencia: FREQ.slice(1), decisoes: DEC, batismos: BAT });
    expect(l[0].anos[0].valor).toBeNull();
    expect(l[0].anos[2].valor).toBe(78416);
  });

  it('⚠️ batismo ZERO é zero de verdade (a contagem não tem `tem_dado`)', () => {
    const l = linhasDoYtd({
      anos: ANOS, frequencia: FREQ, decisoes: DEC,
      batismos: [{ ano: 2024, total: 0 }, { ano: 2025, total: 158 }, { ano: 2026, total: 104 }],
    });
    expect(l[2].anos[0].valor).toBe(0);
  });
});

describe('resumoAnualTexto · o texto colável', () => {
  const linhas = linhasDoYtd({ anos: ANOS, frequencia: FREQ, decisoes: DEC, batismos: BAT });

  it('sai com título, período e os três blocos', () => {
    const t = montarResumoAnual({
      titulo: 'CBRio · comparativo do ano',
      periodo: '1º de janeiro a 27 de agosto',
      linhas,
    });
    expect(t).toContain('*CBRio · comparativo do ano*');
    expect(t).toContain('_1º de janeiro a 27 de agosto_');
    expect(t).toContain('*Frequência*');
    expect(t).toContain('2026: 78.416');
    expect(t).toContain('*Decisões*');
    expect(t).toContain('2026: 609');
    expect(t).toContain('*Batismos*');
    expect(t).toContain('2026: 104');
  });

  it('⚠️ o PERÍODO nunca some quando existe (é ele que impede a leitura errada)', () => {
    const t = montarResumoAnual({ periodo: 'até 27/08', linhas });
    expect(t).toContain('_até 27/08_');
  });

  it('ano sem dado aparece como travessão, não como 0', () => {
    const l = linhasDoYtd({
      anos: ANOS, frequencia: FREQ, batismos: BAT,
      decisoes: [{ ano: 2024, total: 0, tem_dado: false }, ...DEC.slice(1)],
    });
    const t = montarResumoAnual({ linhas: l });
    expect(t).toContain('2024: —');
    expect(t).not.toContain('2024: 0\n');
  });

  it('⚠️ linha SEM NENHUM dado é omitida (bloco de três traços parece defeito)', () => {
    const l = linhasDoYtd({
      anos: ANOS, frequencia: FREQ, decisoes: DEC,
      batismos: [],
    });
    const t = montarResumoAnual({ linhas: l });
    expect(t).toContain('*Frequência*');
    expect(t).not.toContain('*Batismos*');
  });

  it('observação entra em itálico no fim quando existe', () => {
    const t = montarResumoAnual({ linhas, observacao: 'a captura do online estava com falha' });
    expect(t.trimEnd().endsWith('_a captura do online estava com falha_')).toBe(true);
    expect(montarResumoAnual({ linhas })).not.toContain('__');
  });
});
