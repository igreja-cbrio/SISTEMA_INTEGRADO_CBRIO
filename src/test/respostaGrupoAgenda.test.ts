// Contrato do texto da sugestão de agenda de grupo (Matheus · 25-26/08/2026).
// ⚠️ Os casos são as CONVERSAS REAIS que originaram o pedido — se algum ficar
// vermelho, a sugestão mudou para quem já perguntou.
import { describe, it, expect } from 'vitest';
import { montarRespostaAgenda, quandoPorExtenso } from '../../backend/utils/respostaGrupoAgenda.js';

const JESSICA = {
  nome: 'Jessica de Souza', grupoNome: 'CASAIS ALPHA - QUINZENAL',
  proximaISO: '2026-09-01', horario: '20:00:00', recorrencia: 'quinzenal',
  local: 'Barra da Tijuca — Avenida das Américas 7907',
  liderNome: 'Wesley Barros Ramos', liderTelefone: '21996137099',
};

describe('sugestão de agenda de grupo', () => {
  it('⚠️ âncora ESTIMADA declara o cálculo e manda confirmar com o líder', () => {
    // O caso da Jessica: quinzenal, ZERO encontros registrados. Dizer "tudo
    // certo para hoje" a mandaria à Barra numa terça de folga.
    const r = montarRespostaAgenda({ ...JESSICA, estimada: true });
    expect(r.confianca).toBe('estimada');
    expect(r.texto).toContain('01/09');
    expect(r.texto).toContain('a cada 15 dias');
    expect(r.texto).toMatch(/confirme com Wesley \(21996137099\)/);
    // ⚠️ NUNCA promete: sem "te esperamos" quando a data é chute calculado.
    expect(r.texto).not.toContain('Te esperamos');
  });

  it('⚠️ a data vem ANTES da ressalva — quem lê quer saber quando ir', () => {
    const r = montarRespostaAgenda({ ...JESSICA, estimada: true });
    expect(r.texto.indexOf('01/09')).toBeLessThan(r.texto.indexOf('confirme com'));
  });

  it('âncora CONFIRMADA afirma a data e não pede confirmação', () => {
    const r = montarRespostaAgenda({ ...JESSICA, estimada: false });
    expect(r.confianca).toBe('confirmada');
    expect(r.texto).toContain('Te esperamos lá!');
    expect(r.texto).not.toContain('confirme com');
    expect(r.texto).not.toContain('ainda não estão registrados');
  });

  it('⚠️ SEM data calculável não inventa dia nenhum', () => {
    const r = montarRespostaAgenda({ ...JESSICA, proximaISO: null });
    expect(r.confianca).toBe('sem_data');
    expect(r.texto).not.toMatch(/\d{2}\/\d{2}/);
    expect(r.texto).toContain('fale com Wesley');
  });

  it('⚠️ semanal NÃO escreve cadência (é o esperado); quinzenal e mensal escrevem', () => {
    expect(montarRespostaAgenda({ ...JESSICA, recorrencia: 'semanal' }).texto).not.toContain('a cada');
    expect(montarRespostaAgenda({ ...JESSICA, recorrencia: 'quinzenal' }).texto).toContain('a cada 15 dias');
    expect(montarRespostaAgenda({ ...JESSICA, recorrencia: 'mensal' }).texto).toContain('uma vez por mês');
  });

  it('⚠️ recorrência desconhecida não quebra nem inventa texto', () => {
    const r = montarRespostaAgenda({ ...JESSICA, recorrencia: 'trimestral' });
    expect(r.texto).toContain('01/09');
    expect(r.texto).not.toContain('undefined');
  });

  it('⚠️ a data é FATIADA da string, nunca `new Date` (fuso comeria um dia)', () => {
    // 2026-09-01 é terça. Em UTC-3, `new Date('2026-09-01')` cairia em 31/08 (segunda).
    expect(quandoPorExtenso('2026-09-01', '20:00:00')).toBe('terça-feira, 01/09, às 20:00');
    expect(quandoPorExtenso('2026-08-23', '08:30')).toBe('domingo, 23/08, às 08:30');
  });

  it('sem líder cadastrado o texto continua de pé', () => {
    const r = montarRespostaAgenda({ ...JESSICA, liderNome: '', liderTelefone: '', estimada: true });
    expect(r.texto).toContain('confirme com a liderança');
    expect(r.texto).not.toContain('undefined');
  });

  it('sem nome da pessoa abre com "Oi!" e não com "Oi, !"', () => {
    expect(montarRespostaAgenda({ ...JESSICA, nome: '' }).texto).toMatch(/^Oi! /);
  });

  it('⚠️ nunca diz só "já iniciou" — a pergunta é QUANDO ir', () => {
    for (const est of [true, false]) {
      const r = montarRespostaAgenda({ ...JESSICA, estimada: est });
      expect(r.texto).toContain('📅');
    }
  });

  it('horário ausente mostra o dia sem inventar hora', () => {
    expect(quandoPorExtenso('2026-09-01', '')).toBe('terça-feira, 01/09');
  });

  it('data malformada devolve null em vez de texto quebrado', () => {
    expect(quandoPorExtenso('', '20:00')).toBeNull();
    expect(quandoPorExtenso('nao-e-data', '20:00')).toBeNull();
  });
});
