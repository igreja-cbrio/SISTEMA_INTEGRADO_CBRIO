import { describe, it, expect } from 'vitest';
import {
  montarBlocosApresentacao,
  montarHtmlApresentacao,
} from '../lib/imprimirListaApresentacao';

const fmt = (iso: string) => iso.split('-').reverse().join('/');
const rotulo = (h: string) => ({ '09:30': '9h30', '11:30': '11h30' } as Record<string, string>)[h] || h;

function insc(over: Record<string, any> = {}) {
  return {
    crianca_nome: 'Maria',
    crianca_idade: '2 anos',
    nome_pai: 'João',
    nome_mae: 'Ana',
    telefone: '21999990000',
    status: 'pendente',
    data_apresentacao: '2026-10-11',
    horario_culto: '09:30',
    ...over,
  };
}

describe('montarBlocosApresentacao', () => {
  it('separa por turma E por culto — a equipe chama as famílias de um culto por vez', () => {
    const blocos = montarBlocosApresentacao(
      [insc({ crianca_nome: 'A' }), insc({ crianca_nome: 'B', horario_culto: '11:30' })],
      fmt,
    );
    expect(blocos).toHaveLength(2);
    expect(blocos.map((b) => b.criancas.map((c) => c.nome))).toEqual([['A'], ['B']]);
  });

  it('CANCELADA fica de fora — ninguém pode ser chamado em voz alta sem estar lá', () => {
    const blocos = montarBlocosApresentacao(
      [insc({ crianca_nome: 'Vai' }), insc({ crianca_nome: 'Cancelou', status: 'cancelado' })],
      fmt,
    );
    expect(blocos.flatMap((b) => b.criancas.map((c) => c.nome))).toEqual(['Vai']);
  });

  it('ordena por horário CRU: 09:30 vem antes de 11:30 mesmo com o rótulo aplicado', () => {
    const blocos = montarBlocosApresentacao(
      [insc({ horario_culto: '11:30' }), insc({ horario_culto: '09:30' })],
      fmt,
      { fmtHorario: rotulo },
    );
    // ⚠️ o mutante aqui é rotular ANTES de ordenar: "11h30" < "9h30" em texto.
    expect(blocos.map((b) => b.horario)).toEqual(['9h30', '11h30']);
  });

  it('culto ainda não definido vai para o FIM, nunca some', () => {
    const blocos = montarBlocosApresentacao(
      [insc({ crianca_nome: 'Sem', horario_culto: null }), insc({ crianca_nome: 'Com' })],
      fmt,
    );
    expect(blocos.map((b) => b.horario)).toEqual(['09:30', '']);
    expect(blocos[1].criancas[0].nome).toBe('Sem');
  });

  it('turma sem data não desaparece — vira bloco próprio nomeado', () => {
    const blocos = montarBlocosApresentacao([insc({ data_apresentacao: null })], fmt);
    expect(blocos[0].turma).toBe('Turma ainda não definida');
  });

  it('pai e mãe vão juntos; com um só, sai ele sozinho', () => {
    const [b] = montarBlocosApresentacao([insc({ nome_pai: null })], fmt);
    expect(b.criancas[0].responsaveis).toBe('Ana');
    const [c] = montarBlocosApresentacao([insc()], fmt);
    expect(c.criancas[0].responsaveis).toBe('João · Ana');
  });

  it('ordena as crianças por nome dentro do bloco', () => {
    const blocos = montarBlocosApresentacao(
      [insc({ crianca_nome: 'Zoe' }), insc({ crianca_nome: 'Ana' }), insc({ crianca_nome: 'Ísis' })],
      fmt,
    );
    expect(blocos[0].criancas.map((c) => c.nome)).toEqual(['Ana', 'Ísis', 'Zoe']);
  });

  it('lista vazia devolve nada (e a tela avisa em vez de abrir folha em branco)', () => {
    expect(montarBlocosApresentacao([], fmt)).toEqual([]);
  });
});

describe('montarHtmlApresentacao · o que vai para o PAPEL', () => {
  const blocos = montarBlocosApresentacao([insc()], fmt, { fmtHorario: rotulo });

  it('⚠️ SEM opt-in o telefone NÃO sai — é PII em papel', () => {
    const html = montarHtmlApresentacao(blocos);
    expect(html).not.toContain('21999990000');
    expect(html).not.toContain('Contato');
  });

  it('com opt-in, o contato sai', () => {
    const html = montarHtmlApresentacao(blocos, { colunas: { contato: true } });
    expect(html).toContain('21999990000');
    expect(html).toContain('Contato');
  });

  it('leva nome, idade, responsáveis, culto e a caixa de presença', () => {
    const html = montarHtmlApresentacao(blocos);
    expect(html).toContain('Maria');
    expect(html).toContain('2 anos');
    expect(html).toContain('João · Ana');
    expect(html).toContain('Culto das 9h30');
    expect(html).toContain('class="box"');
    expect(html).toContain('Responsável:');
  });

  it('culto sem definição é DITO na folha, nunca em branco', () => {
    const semCulto = montarBlocosApresentacao([insc({ horario_culto: null })], fmt);
    expect(montarHtmlApresentacao(semCulto)).toContain('Culto ainda não definido');
  });

  it('escapa o nome — apóstrofo e & existem em nome de gente', () => {
    const b = montarBlocosApresentacao([insc({ crianca_nome: "Sant'Ana & Cia <b>" })], fmt);
    const html = montarHtmlApresentacao(b);
    expect(html).toContain('&amp;');
    expect(html).not.toContain('<b>');
  });
});
