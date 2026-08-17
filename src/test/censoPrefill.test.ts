import { describe, it, expect } from 'vitest';
import {
  CAMPOS_COM_TOKEN,
  CAMPOS_SEM_TOKEN,
  podeIdentificarPorCpf,
  camposDoCadastro,
} from '../../backend/utils/censoPrefill.js';

// Cadastro de exemplo com TODOS os campos que o `select` da rota traz.
const MEMBRO = {
  id: 'abc',
  cpf: '123.456.789-09',
  nome: 'Matheus Ribeiro Toscano',
  data_nascimento: '1990-05-14',
  telefone: '21999998249',
  email: 'matheus@exemplo.com',
  estado_civil: 'casado',
  cidade: 'Rio de Janeiro',
  bairro: 'Barra da Tijuca',
  profissao: 'Analista',
};

describe('podeIdentificarPorCpf · o estágio "só o CPF" MORREU', () => {
  it('⚠️ CPF sozinho NÃO identifica — era o oráculo de convicção religiosa', () => {
    // Este é o caso que fecha o vazamento: uma página pública respondendo
    // "esta pessoa está na base da igreja?" a partir de um CPF comprado.
    expect(podeIdentificarPorCpf({ cpfValido: true, temNascimento: false })).toBe(false);
  });

  it('nascimento sozinho não identifica', () => {
    expect(podeIdentificarPorCpf({ cpfValido: false, temNascimento: true })).toBe(false);
  });

  it('os DOIS juntos identificam', () => {
    expect(podeIdentificarPorCpf({ cpfValido: true, temNascimento: true })).toBe(true);
  });

  it('CPF inválido não identifica nem com nascimento', () => {
    expect(podeIdentificarPorCpf({ cpfValido: false, temNascimento: false })).toBe(false);
  });

  it('⚠️ exige BOOLEAN true, não truthy — string "false" não pode passar', () => {
    // O corpo vem de `req.body`, então chega o que o cliente mandar.
    expect(podeIdentificarPorCpf({ cpfValido: 'sim' as never, temNascimento: true })).toBe(false);
    expect(podeIdentificarPorCpf({ cpfValido: 1 as never, temNascimento: 1 as never })).toBe(false);
  });

  it('tolera objeto vazio sem estourar', () => {
    expect(podeIdentificarPorCpf({} as never)).toBe(false);
  });
});

describe('camposDoCadastro · CONTATO só sai com prova de posse', () => {
  it('⚠️⚠️ sem token, telefone e e-mail NÃO saem', () => {
    const r = camposDoCadastro(MEMBRO, { viaToken: false });
    expect(r.telefone).toBeUndefined();
    expect(r.email).toBeUndefined();
  });

  it('⚠️ e não saem nem MASCARADOS — nenhuma chave de contato existe', () => {
    // Máscara dentro de `valores` seria pior que o vazamento: ela viraria a
    // RESPOSTA gravada, e o censo registraria "(21) ****-8249" como telefone.
    const chaves = Object.keys(camposDoCadastro(MEMBRO, { viaToken: false }));
    expect(chaves.some((k) => /telefone|email|contato|cel/i.test(k))).toBe(false);
  });

  it('sem token ainda pré-preenche o que não é contato', () => {
    const r = camposDoCadastro(MEMBRO, { viaToken: false });
    expect(r.nome).toBe('Matheus Ribeiro Toscano');
    expect(r.cidade).toBe('Rio de Janeiro');
    expect(r.estado_civil).toBe('casado');
  });

  it('COM token (link pessoal / app) o contato sai — a prova é o link ter chegado nela', () => {
    const r = camposDoCadastro(MEMBRO, { viaToken: true });
    expect(r.telefone).toBe('21999998249');
    expect(r.email).toBe('matheus@exemplo.com');
  });

  it('CPF sai digits-only nos dois caminhos', () => {
    expect(camposDoCadastro(MEMBRO, { viaToken: false }).cpf).toBe('12345678909');
    expect(camposDoCadastro(MEMBRO, { viaToken: true }).cpf).toBe('12345678909');
  });

  it('⚠️ ALLOWLIST, não blocklist: campo novo no cadastro NÃO vaza sozinho', () => {
    // Amanhã alguém acrescenta `endereco` ou `cep` ao select da rota. Se o
    // recorte fosse por `delete`, o campo novo sairia numa página pública sem
    // ninguém decidir isso.
    const comExtras = { ...MEMBRO, endereco: 'Rua X, 100', cep: '22640-102', renda: '9000' };
    const r = camposDoCadastro(comExtras, { viaToken: false });
    expect(r.endereco).toBeUndefined();
    expect(r.cep).toBeUndefined();
    expect(r.renda).toBeUndefined();
  });

  it('o caminho do token TAMBÉM é allowlist (endereço não entra por acidente)', () => {
    const comExtras = { ...MEMBRO, renda: '9000' };
    expect(camposDoCadastro(comExtras, { viaToken: true }).renda).toBeUndefined();
  });

  it('campo ausente vira null, não `undefined` solto', () => {
    const r = camposDoCadastro({ nome: 'Ana' }, { viaToken: false });
    expect(r.cidade).toBeNull();
    expect(r.nome).toBe('Ana');
  });

  it('tolera membro nulo', () => {
    expect(() => camposDoCadastro(null, { viaToken: false })).not.toThrow();
    expect(camposDoCadastro(null, { viaToken: false }).nome).toBeNull();
  });

  it('sem opções, o padrão é o caminho PÚBLICO (fail-closed)', () => {
    // Chamador que esquecer de passar `viaToken` não pode ganhar o modo aberto.
    expect(camposDoCadastro(MEMBRO).telefone).toBeUndefined();
  });

  it('as duas listas são congeladas — ninguém empurra campo em runtime', () => {
    expect(Object.isFrozen(CAMPOS_SEM_TOKEN)).toBe(true);
    expect(Object.isFrozen(CAMPOS_COM_TOKEN)).toBe(true);
  });

  it('⚠️ a lista pública é subconjunto estrito da lista com token', () => {
    for (const c of CAMPOS_SEM_TOKEN) expect(CAMPOS_COM_TOKEN).toContain(c);
    expect(CAMPOS_SEM_TOKEN.length).toBeLessThan(CAMPOS_COM_TOKEN.length);
  });
});
