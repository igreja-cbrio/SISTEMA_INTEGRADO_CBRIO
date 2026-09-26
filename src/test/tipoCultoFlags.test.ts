// Régua PURA das flags que DEFINEM um tipo de culto
// (backend/utils/tipoCultoFlags.js · causa raiz fechada em 24/09/2026).
//
// Nada aqui lê relógio, rede ou banco — é função pura sobre o corpo da
// requisição.
//
// Mutantes travados (RODADOS, não afirmados):
// 1. DEFAULT_AO_CRIAR virando `has_online_stream: true` — é o default da COLUNA
//    e é ele que transforma todo tipo criado pela tela em fábrica semanal de
//    cultos (cada linha ~1,3 s de gatilho de KPI/NSM). Foi o que produziu os 3
//    tipos CBKIDS fantasmas.
// 2. Aplicar o default também no modo 'atualizar' — o PUT passaria a DESLIGAR a
//    materialização de um tipo que já funciona, só porque a tela não mandou o
//    campo. Campo ausente no PUT nunca pode virar escrita.
// 3. Coagir valor com `Boolean(...)` em vez de recusar — `Boolean('false')` é
//    `true`, então a string "false" ligaria a flag que ela queria desligar.
// 4. Não fazer trim / aceitar `presencial_label` em branco — a coluna é NOT NULL
//    e o rótulo em branco quebra o modal de culto.
import { describe, it, expect } from 'vitest';
import {
  normalizarFlagsTipoCulto, FLAGS_BOOLEANAS, DEFAULT_AO_CRIAR,
} from '../../backend/utils/tipoCultoFlags';

const criar = (body: any) => normalizarFlagsTipoCulto(body, { modo: 'criar' });
const atualizar = (body: any) => normalizarFlagsTipoCulto(body, { modo: 'atualizar' });

describe('criação: o default seguro', () => {
  it('sem flag nenhuma, o tipo nasce SEM materializar culto', () => {
    const r: any = criar({ name: 'Culto novo' });
    expect(r.ok).toBe(true);
    // ⚠️ MUTANTE 1: se isto virar `true`, todo tipo criado pela tela volta a
    // gerar culto toda semana sem ninguém decidir.
    expect(r.patch.has_online_stream).toBe(false);
  });

  it('não inventa valor para as flags que a coluna já protege', () => {
    const r: any = criar({ name: 'Culto novo' });
    expect(r.patch).not.toHaveProperty('has_kids');
    expect(r.patch).not.toHaveProperty('has_online');
    expect(r.patch).not.toHaveProperty('presencial_label');
  });

  it('respeita quem LIGOU a materialização de propósito', () => {
    const r: any = criar({ has_online_stream: true });
    expect(r.patch.has_online_stream).toBe(true);
  });

  it('aceita as três flags juntas', () => {
    const r: any = criar({ has_kids: true, has_online: true, has_online_stream: true });
    expect(r.patch).toEqual({ has_kids: true, has_online: true, has_online_stream: true });
  });

  it('ignora campo desconhecido (não vaza pro UPDATE)', () => {
    const r: any = criar({ name: 'x', is_active: false, meta_duracao_min: 60, apagar_tudo: true });
    expect(Object.keys(r.patch)).toEqual(['has_online_stream']);
  });
});

describe('atualização: ausente NUNCA é escrita', () => {
  it('corpo sem flags não toca em nada', () => {
    const r: any = atualizar({ name: 'Renomeado' });
    expect(r.ok).toBe(true);
    // ⚠️ MUTANTE 2: aplicar o default aqui desligaria a materialização de um
    // tipo que já funciona, porque a tela não manda o campo.
    expect(r.patch).toEqual({});
  });

  it('false EXPLÍCITO desliga (é a pessoa decidindo)', () => {
    const r: any = atualizar({ has_kids: false });
    expect(r.patch).toEqual({ has_kids: false });
  });

  it('é o caminho que conserta um tipo que nasceu errado', () => {
    const r: any = atualizar({ has_kids: true, has_online: true, presencial_label: 'Sede' });
    expect(r.patch).toEqual({ has_kids: true, has_online: true, presencial_label: 'Sede' });
  });
});

describe('valor inválido é RECUSADO, nunca coagido', () => {
  // ⚠️ MUTANTE 3: `Boolean('false') === true` — coagir faria a string "false"
  // LIGAR a flag que ela pedia para desligar.
  const invalidos: Array<[unknown, string]> = [
    ['true', 'string que parece verdadeira'],
    ['false', 'string que parece falsa'],
    [1, 'número 1'],
    [0, 'número 0'],
    [null, 'null explícito'],
    [{}, 'objeto'],
  ];
  it.each(invalidos)('recusa %j (%s)', (valor) => {
    const r: any = criar({ has_kids: valor });
    expect(r.ok).toBe(false);
    expect(r.campo).toBe('has_kids');
    expect(r.erro).toContain('has_kids');
  });

  it('nomeia a flag certa quando há várias', () => {
    const r: any = criar({ has_kids: true, has_online: 'sim' });
    expect(r.ok).toBe(false);
    expect(r.campo).toBe('has_online');
  });
});

describe('presencial_label', () => {
  it('faz trim', () => {
    const r: any = criar({ presencial_label: '  Sede  ' });
    expect(r.patch.presencial_label).toBe('Sede');
  });

  // ⚠️ MUTANTE 4
  it.each(['', '   '])('recusa em branco (%j)', (valor) => {
    const r: any = criar({ presencial_label: valor });
    expect(r.ok).toBe(false);
    expect(r.campo).toBe('presencial_label');
  });

  it('recusa não-texto', () => {
    const r: any = criar({ presencial_label: 42 });
    expect(r.ok).toBe(false);
    expect(r.campo).toBe('presencial_label');
  });
});

describe('bordas', () => {
  it.each([null, undefined, 'texto', 42])('corpo %j não explode', (body) => {
    const r: any = criar(body);
    expect(r.ok).toBe(true);
    expect(r.patch).toEqual({ has_online_stream: false });
  });

  it('modo inválido é erro de programação, não de payload', () => {
    expect(() => normalizarFlagsTipoCulto({}, { modo: 'zoiado' } as any)).toThrow();
    expect(() => (normalizarFlagsTipoCulto as any)({}, undefined)).toThrow();
  });

  it('o catálogo de flags não muda sem alguém revisar esta régua', () => {
    expect(FLAGS_BOOLEANAS).toEqual(['has_kids', 'has_online', 'has_online_stream']);
    expect(DEFAULT_AO_CRIAR).toEqual({ has_online_stream: false });
  });
});
