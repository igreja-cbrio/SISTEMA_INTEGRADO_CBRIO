import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  quandoComData, ondeComLink, paramSeguro, dataCurta, diaDaSemana,
} = require('../../backend/utils/avisoGrupoAprovado.js');

describe('quandoComData · a data que a pessoa perguntou', () => {
  it('semanal com data: AFIRMA o próximo encontro', () => {
    const t = quandoComData({ diaSemana: 2, horario: '20:00:00', recorrencia: 'semanal', proximaISO: '2026-09-30', estimada: false });
    expect(t).toBe('Terça às 20:00 · o próximo é dia 30/09');
  });

  it('⚠️ quinzenal DIZ a cadência — "Terça às 20:00" sozinho manda a pessoa na terça errada', () => {
    const t = quandoComData({ diaSemana: 2, horario: '20:00', recorrencia: 'quinzenal', proximaISO: '2026-09-30', estimada: false });
    expect(t).toContain('(quinzenal)');
    expect(t).toContain('30/09');
  });

  it('⚠️⚠️ data CALCULADA não é afirmada — diz "deve ser" e manda confirmar', () => {
    const t = quandoComData({ diaSemana: 2, horario: '20:00', recorrencia: 'mensal', proximaISO: '2026-10-06', estimada: true });
    expect(t).toContain('deve ser');
    expect(t).toContain('confirme com o líder');
    expect(t).not.toContain('o próximo é dia');
  });

  it('sem data NÃO inventa nada — volta ao texto de hoje', () => {
    const t = quandoComData({ diaSemana: 2, horario: '20:00', recorrencia: 'semanal', proximaISO: null });
    expect(t).toBe('Terça às 20:00');
  });

  it('grupo diário não ganha data (é todo dia) nem rótulo de cadência', () => {
    const t = quandoComData({ diaSemana: null, horario: '06:30', recorrencia: 'diario', proximaISO: '2026-09-26' });
    expect(t).toBe('Todos os dias às 06:30');
  });

  it('⚠️ semanal NÃO escreve "(semanal)" — seria ruído em 70 dos 109 grupos', () => {
    const t = quandoComData({ diaSemana: 4, horario: '19:00', recorrencia: 'semanal', proximaISO: '2026-10-01', estimada: false });
    expect(t).not.toContain('semanal');
  });

  it('domingo é 0 e NÃO pode ser tratado como ausência (0 é falsy em JS)', () => {
    expect(diaDaSemana(0)).toBe('Domingo');
    expect(quandoComData({ diaSemana: 0, horario: '18:00', recorrencia: 'semanal', proximaISO: '2026-09-27', estimada: false }))
      .toContain('Domingo');
  });

  it('sem dia marcado não vira domingo — degrada para o horário', () => {
    expect(diaDaSemana(null)).toBeNull();
    expect(quandoComData({ diaSemana: null, horario: '20:00', recorrencia: 'semanal' })).toBe('às 20:00');
  });

  it('sem dia e sem hora devolve "a combinar", nunca texto quebrado', () => {
    expect(quandoComData({ diaSemana: null, horario: null, recorrencia: 'semanal' })).toBe('a combinar');
  });
});

describe('dataCurta · a armadilha de fuso', () => {
  it('⚠️ fatia a STRING — new Date(iso) daria o dia ANTERIOR no Rio', () => {
    expect(dataCurta('2026-01-01')).toBe('01/01');
    expect(dataCurta('2026-12-31')).toBe('31/12');
  });
  it('data inválida devolve null em vez de NaN/NaN', () => {
    expect(dataCurta('')).toBeNull();
    expect(dataCurta(null)).toBeNull();
    expect(dataCurta('sexta-feira')).toBeNull();
  });
});

describe('ondeComLink · onde é', () => {
  it('online COM link manda o link', () => {
    expect(ondeComLink({ online: true, linkOnline: 'https://meet.google.com/abc-defg-hij' }))
      .toBe('Online · https://meet.google.com/abc-defg-hij');
  });

  it('⚠️ online SEM link diz que o líder envia — "Online" sozinho é o que gera a pergunta', () => {
    const t = ondeComLink({ online: true, linkOnline: null });
    expect(t).toContain('o líder envia o link');
  });

  it('presencial junta as partes do endereço', () => {
    expect(ondeComLink({ partes: ['Casa da Ana', 'Rua X, 100', 'apto 302', 'Barra'], online: false }))
      .toBe('Casa da Ana — Rua X, 100 — apto 302 — Barra');
  });

  it('presencial sem endereço devolve "a combinar"', () => {
    expect(ondeComLink({ partes: [], online: false })).toBe('a combinar');
  });

  it('parte vazia ou nula não vira separador solto', () => {
    expect(ondeComLink({ partes: ['Rua X', null, '', '  ', 'Barra'], online: false })).toBe('Rua X — Barra');
  });
});

describe('paramSeguro · o que a Meta recusa', () => {
  it('⚠️⚠️ quebra de linha vira espaço — com ela a Meta recusa a MENSAGEM INTEIRA (132000)', () => {
    expect(paramSeguro('Rua X\nBarra')).toBe('Rua X Barra');
    expect(paramSeguro('a\r\nb\tc')).toBe('a b c');
  });

  it('⚠️ 4+ espaços seguidos também derrubam o envio', () => {
    expect(paramSeguro('Rua X     100')).toBe('Rua X 100');
  });

  it('corta na palavra inteira, nunca no meio', () => {
    const t = paramSeguro('palavra '.repeat(60), 40);
    expect(t.length).toBeLessThanOrEqual(40);
    expect(t.endsWith('palavra')).toBe(true);
  });

  it('nulo e indefinido viram string vazia, não "null"', () => {
    expect(paramSeguro(null)).toBe('');
    expect(paramSeguro(undefined)).toBe('');
  });

  it('todo parâmetro montado pela régua já sai seguro', () => {
    const t = quandoComData({ diaSemana: 2, horario: '20:00', recorrencia: 'quinzenal', proximaISO: '2026-09-30', estimada: true });
    expect(t).not.toMatch(/[\r\n\t]/);
    expect(t).not.toMatch(/ {2,}/);
  });
});
