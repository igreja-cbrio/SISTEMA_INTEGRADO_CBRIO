// Contrato de "o que trava o salvar" na ficha do membro · 2026-08-21.
//
// ⚠️⚠️ POR QUE ESTE ARQUIVO EXISTE: exigir CPF e nascimento para EDITAR fazia a
// equipe não conseguir corrigir um telefone de quem está sem esses dados — são
// 545 membros sem CPF em 21/08. O risco de "consertar" isso voltando a exigir
// não é o incômodo: é o CHUTE. CPF inventado vira chave forte no matcher e liga
// a pessoa ao cadastro de outra.
//
// A invariante: **criar continua exigindo os quatro; editar exige só o nome.**
import { describe, it, expect } from 'vitest';
import {
  CAMPOS_CRIACAO,
  CAMPOS_EDICAO,
  faltandoParaSalvar,
  podeSalvar,
  frasePendencias,
  pendenciasInformativas,
} from '../lib/camposObrigatoriosMembro.js';

const legado = { nome: 'Abel', sobrenome: '', cpf: '', data_nascimento: '' };
const completo = { nome: 'Abel', sobrenome: 'Ferreira', cpf: '11144477735', data_nascimento: '1985-04-20' };

describe('editar', () => {
  it('⚠️ com só o nome, SALVA — é a invariante do pedido', () => {
    expect(faltandoParaSalvar(legado, { edicao: true })).toEqual([]);
    expect(podeSalvar(legado, { edicao: true })).toBe(true);
  });

  it('⚠️ nem CPF nem nascimento travam a edição', () => {
    expect(CAMPOS_EDICAO).not.toContain('cpf');
    expect(CAMPOS_EDICAO).not.toContain('data_nascimento');
    expect(CAMPOS_EDICAO).not.toContain('sobrenome');
  });

  it('nome em branco AINDA trava — a coluna é NOT NULL no banco', () => {
    for (const n of ['', '   ', null, undefined]) {
      const r = faltandoParaSalvar({ ...completo, nome: n as never }, { edicao: true });
      expect(r).toEqual(['nome']);
      expect(podeSalvar({ ...completo, nome: n as never }, { edicao: true })).toBe(false);
    }
  });

  it('nome de UMA palavra só passa — pessoa sem sobrenome existe na base', () => {
    expect(podeSalvar({ nome: 'Madonna' }, { edicao: true })).toBe(true);
  });
});

describe('criar', () => {
  it('⚠️ o Contrato de porta CONTINUA valendo: os quatro são exigidos', () => {
    expect(CAMPOS_CRIACAO).toEqual(['nome', 'sobrenome', 'cpf', 'data_nascimento']);
    expect(faltandoParaSalvar(legado, { edicao: false })).toEqual(['sobrenome', 'cpf', 'data_nascimento']);
    expect(podeSalvar(legado, {})).toBe(false);
  });

  it('completo passa', () => {
    expect(faltandoParaSalvar(completo, { edicao: false })).toEqual([]);
  });

  it('⚠️ o DEFAULT é criar (o modo mais exigente) — opts ausente não pode afrouxar', () => {
    expect(podeSalvar(legado)).toBe(false);
    expect(podeSalvar(legado, {})).toBe(false);
    expect(podeSalvar(legado, { edicao: false })).toBe(false);
  });

  it('só espaço em branco conta como vazio', () => {
    expect(faltandoParaSalvar({ nome: ' ', sobrenome: '\t', cpf: '\n', data_nascimento: '  ' }, {}))
      .toEqual(['nome', 'sobrenome', 'cpf', 'data_nascimento']);
  });
});

describe('frasePendencias', () => {
  it('monta a frase em português, sem lista crua de chave', () => {
    expect(frasePendencias(['nome'])).toBe('Nome é obrigatório.');
    expect(frasePendencias(['cpf', 'data_nascimento'])).toBe('CPF e Data de nascimento são obrigatórios.');
    expect(frasePendencias(['sobrenome', 'cpf', 'data_nascimento']))
      .toBe('Sobrenome, CPF e Data de nascimento são obrigatórios.');
    expect(frasePendencias([])).toBe('');
    expect(frasePendencias(null as never)).toBe('');
  });
});

describe('pendenciasInformativas', () => {
  it('⚠️ informa o que falta SEM bloquear — e nunca repete o que já trava', () => {
    expect(pendenciasInformativas(legado)).toEqual(['sobrenome', 'cpf', 'data_nascimento']);
    expect(pendenciasInformativas(legado)).not.toContain('nome');
    expect(pendenciasInformativas(completo)).toEqual([]);
  });

  it('⚠️ com o NOME vazio, o informativo não repete o campo que já está travando', () => {
    // Sem o filtro, a faixa âmbar diria "Falta no cadastro: Nome" ao lado do
    // erro de bloqueio — dois avisos do mesmo problema, um deles dizendo que
    // "dá para salvar assim mesmo", que é o oposto do que acontece.
    const semNome = { nome: '', sobrenome: '', cpf: '', data_nascimento: '' };
    expect(pendenciasInformativas(semNome)).toEqual(['sobrenome', 'cpf', 'data_nascimento']);
    expect(faltandoParaSalvar(semNome, { edicao: true })).toEqual(['nome']);
  });
});

describe('entrada inválida', () => {
  it('form nulo não quebra — devolve tudo como faltando', () => {
    expect(faltandoParaSalvar(null as never, { edicao: true })).toEqual(['nome']);
    expect(faltandoParaSalvar(undefined as never, {})).toEqual(CAMPOS_CRIACAO);
  });
});
