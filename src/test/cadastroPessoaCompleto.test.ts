// ════════════════════════════════════════════════════════════════════════════
//  "Temos os dados dessa pessoa?" — a régua que decide visitante × participante
//
//  Régua do Matheus (13/08/2026): "só não vai ser visitante aquele de quem
//  tivermos os dados completos (os mesmos que pedimos no momento da inscrição)".
//
//  ⚠️⚠️ Este arquivo é o CONTRATO do espelho: `avaliarCadastroPessoa` (JS, usado
//  pelo selo da aba Pessoas) e `fn_membro_cadastro_completo` (SQL, migration
//  20260814150000, usada pelo trigger que PROMOVE) precisam decidir igual. Se
//  divergirem, a tela diz "está tudo preenchido" e a pessoa continua visitante —
//  e ninguém consegue entender por quê.
//
//  ⚠️ `hoje` é INJETADO em todo caso que depende de data: teste que lê o relógio
//  da máquina foi o que mordeu no faixaEtaria.test.ts.
// ════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { avaliarCadastroPessoa, telefoneDigitosOk } = require_('../../backend/utils/prontidaoCadastro.js');

const HOJE = new Date('2026-08-13T12:00:00');

// CPF com DV válido (gerado pela regra, não copiado de pessoa real).
const CPF_OK = '52998224725';

const COMPLETO = {
  nome: 'Maria Souza Lima',
  cpf: CPF_OK,
  telefone: '21999887766',
  email: 'maria@exemplo.com',
  data_nascimento: '1990-05-20',
  genero: 'feminino',
};

describe('avaliarCadastroPessoa · cadastro completo', () => {
  it('aceita o cadastro com os 6 campos', () => {
    const r = avaliarCadastroPessoa(COMPLETO, HOJE);
    expect(r.completo).toBe(true);
    expect(r.faltando).toEqual([]);
  });

  it('aceita o vocabulário legado M/F no sexo', () => {
    expect(avaliarCadastroPessoa({ ...COMPLETO, genero: 'M' }, HOJE).completo).toBe(true);
    expect(avaliarCadastroPessoa({ ...COMPLETO, genero: 'f' }, HOJE).completo).toBe(true);
  });

  it('aceita telefone fixo de 10 dígitos', () => {
    expect(avaliarCadastroPessoa({ ...COMPLETO, telefone: '2133334444' }, HOJE).completo).toBe(true);
  });
});

describe('avaliarCadastroPessoa · o que falta vem NOMEADO', () => {
  const casos: Array<[string, Record<string, unknown>, string]> = [
    ['nome com um token só', { nome: 'Maria' }, 'nome'],
    ['nome com abreviação', { nome: 'Maria M. Souza' }, 'nome'],
    ['CPF ausente', { cpf: null }, 'cpf'],
    ['CPF com DV errado', { cpf: '11111111111' }, 'cpf'],
    ['telefone ausente', { telefone: '' }, 'telefone'],
    ['telefone curto', { telefone: '99887766' }, 'telefone'],
    ['e-mail ausente', { email: null }, 'email'],
    ['e-mail malformado', { email: 'maria@' }, 'email'],
    ['nascimento ausente', { data_nascimento: null }, 'nascimento'],
    ['nascimento no futuro', { data_nascimento: '2030-01-01' }, 'nascimento'],
    ['sexo ausente', { genero: null }, 'genero'],
  ];

  for (const [titulo, patch, campo] of casos) {
    it(`reprova: ${titulo}`, () => {
      const r = avaliarCadastroPessoa({ ...COMPLETO, ...patch }, HOJE);
      expect(r.completo).toBe(false);
      expect(r.faltando).toContain(campo);
      // A tela mostra o rótulo em português, não a chave.
      expect(r.rotulos.join(' ')).not.toContain(campo === 'genero' ? 'genero' : '__nunca__');
    });
  }

  it('cadastro vazio reprova em tudo, sem estourar', () => {
    const r = avaliarCadastroPessoa({}, HOJE);
    expect(r.completo).toBe(false);
    expect(r.faltando.sort()).toEqual(['cpf', 'email', 'genero', 'nascimento', 'nome', 'telefone']);
  });

  it('null/undefined não quebram', () => {
    expect(avaliarCadastroPessoa(null as never, HOJE).completo).toBe(false);
    expect(avaliarCadastroPessoa(undefined as never, HOJE).completo).toBe(false);
  });
});

describe('⚠️ o que esta régua NÃO exige (e por quê)', () => {
  // Se alguém "corrigir" isto pra exigir o termo, o caminho que o Matheus
  // descreveu (o líder pega os dados e a pessoa vira participante) fica
  // impossível: o visitante anotado à mão nunca terá um termo assinado.
  it('NÃO exige aceite dos termos — termo é prova de PORTA, não atributo do cadastro', () => {
    const r = avaliarCadastroPessoa({ ...COMPLETO, aceita_termos: false }, HOJE);
    expect(r.completo).toBe(true);
    expect(r.faltando).not.toContain('termos');
  });

  // `telefoneAlcancavel` (régua de ENVIO) recusa DDD inexistente; aqui a
  // pergunta é de CADASTRO. Divergir disto faz o selo da tela discordar do
  // trigger SQL, que confere dígitos.
  it('NÃO exige DDD real — a régua aqui é a do Contrato (10-11 dígitos)', () => {
    expect(telefoneDigitosOk('0765764538')).toBe(true);   // "DDD 07" não existe
    expect(avaliarCadastroPessoa({ ...COMPLETO, telefone: '0765764538' }, HOJE).completo).toBe(true);
  });

  it('telefone com código do país (13 dígitos) NÃO passa — tem que vir normalizado', () => {
    expect(telefoneDigitosOk('5521999887766')).toBe(false);
  });
});
