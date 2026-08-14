// Contrato da cadeia de resolução do telefone do voluntário.
//
// Os casos vêm da medição de produção de 13/08/2026, quando o Agente de
// Voluntariado exibia "sem telefone" nas 87 escalas pendentes porque lia só
// `vol_profiles.phone` (preenchido em 8 de 930 perfis). 59 daquelas 87 tinham
// telefone no sistema.
//
// ⚠️ Este arquivo é MUTATION-TEST da causa raiz: se alguém voltar a resolver o
// telefone só pela cópia local do módulo, ou afrouxar a régua de nome do canal
// do formulário, os testes ficam vermelhos.
import { describe, it, expect } from 'vitest';
import { resolverTelefoneVoluntario, ORIGENS } from '../../backend/utils/telefoneVoluntario.js';

const TEL_OK = '21999990000';        // celular sintético, alcançável
const TEL_OK2 = '2133334444';        // fixo do Rio (10 dígitos)
const TEL_SUICO = '41765764538';     // o número da Patricia Künzler
const TEL_CURTO = '996013179';       // o da Desiree: 9 dígitos, sem DDD

describe('resolverTelefoneVoluntario · ordem da cadeia', () => {
  it('prefere o telefone do próprio cadastro do voluntariado', () => {
    const r = resolverTelefoneVoluntario({
      nome: 'Fernando Monnerat',
      perfilTelefone: TEL_OK,
      membro: { id: 'm1', nome: 'Fernando Monnerat', telefone: TEL_OK2 },
    });
    expect(r.telefone).toBe(TEL_OK);
    expect(r.origem).toBe(ORIGENS.PERFIL);
  });

  it('cai no cadastro da PESSOA quando o perfil não tem telefone (o caso de 43 das 87 escalas)', () => {
    const r = resolverTelefoneVoluntario({
      nome: 'Anderson Roxo',
      perfilTelefone: null,
      membro: { id: 'm1', nome: 'Anderson Roxo', telefone: TEL_OK },
    });
    expect(r.telefone).toBe(TEL_OK);
    expect(r.origem).toBe(ORIGENS.MEMBRO);
    expect(r.membro_id).toBe('m1');
    expect(r.rotulo).toBeTruthy(); // a tela precisa declarar a origem
  });

  it('cai no CPF quando não há vínculo de membresia', () => {
    const r = resolverTelefoneVoluntario({
      nome: 'Atila Santos',
      membroPorCpf: { id: 'm9', nome: 'Átila Santos', telefone: TEL_OK },
    });
    expect(r.origem).toBe(ORIGENS.CPF);
    expect(r.membro_id).toBe('m9');
  });

  it('cai no formulário de voluntariado por último antes do contato secundário (os 16 casos)', () => {
    const r = resolverTelefoneVoluntario({
      nome: 'Eliane Santana',
      inscricoes: [{ nome: 'Eliane dos Santos Santana Sobrinho', telefone: TEL_OK }],
    });
    expect(r.telefone).toBe(TEL_OK);
    expect(r.origem).toBe(ORIGENS.INSCRICAO);
  });

  it('usa contato secundário só quando nada antes resolveu', () => {
    const r = resolverTelefoneVoluntario({
      nome: 'Karen Twardowsky',
      membro: { id: 'm2', nome: 'Karen Twardowsky', telefone: null },
      contatos: [{ telefone: TEL_OK }],
    });
    expect(r.origem).toBe(ORIGENS.CONTATO);
  });

  it('devolve vazio — e não inventa — quando ninguém tem telefone (os 28 restantes)', () => {
    const r = resolverTelefoneVoluntario({
      nome: 'Alguém Sem Contato',
      membro: { id: 'm3', nome: 'Alguém Sem Contato', telefone: null },
      inscricoes: [],
      contatos: [],
    });
    expect(r.telefone).toBeNull();
    expect(r.origem).toBeNull();
  });
});

describe('resolverTelefoneVoluntario · nome ABREVIADO é a mesma pessoa', () => {
  // ⚠️ MUTATION-TEST: trocar a régua de nome pelo Dice puro
  // (`membroMatch.nomesMesmaPessoa`) recusa TODOS estes pares e devolve 10 das
  // 16 recuperações a zero. O Planning Center guarda o nome curto; o formulário
  // tem o nome civil completo.
  const PARES_REAIS: Array<[string, string]> = [
    ['Eliane Santana', 'Eliane dos Santos Santana Sobrinho'],
    ['Patrícia Fernandes', 'Patrícia Christyane Alves Fernandes'],
    ['Karen Twardowsky', 'Karen Ferreira Dias Twardowsky'],
    ['Fellipe Godoy', 'FELLIPE GODOY DOS SANTOS'],
    ['Carla Suellen', 'Carla Suellen de Moura'],
    ['Felipe Medeiros', 'FELIPE MEDEIROS DOS SANTOS'],
    ['João Pedro Fraguito', 'João Pedro Fraguito dos Santos'],
    ['Vinicius Marinho', 'Vinicius Mello Marinho'],
    ['Atila Santos', 'Átila Santos'],
    ['Lívia Quintella', 'Livia Quintella'],
  ];

  it.each(PARES_REAIS)('aceita "%s" × "%s"', (escala, inscricao) => {
    const r = resolverTelefoneVoluntario({ nome: escala, inscricoes: [{ nome: inscricao, telefone: TEL_OK }] });
    expect(r.telefone).toBe(TEL_OK);
  });
});

describe('resolverTelefoneVoluntario · não manda mensagem pra outra pessoa', () => {
  // ⚠️ O canal do formulário casa por E-MAIL, e e-mail é o sinal que a FAMÍLIA
  // compartilha. Sem exigir nome compatível, o lembrete de escala iria pro
  // telefone do cônjuge. Afrouxar isto deixa estes testes vermelhos.
  const PARENTES: Array<[string, string]> = [
    ['Ana Souza Lima', 'João Souza Lima'],   // cônjuges, sobrenome em comum
    ['Maria Silva', 'João Maria Silva'],
    ['Pedro Alves', 'Paulo Alves'],
    ['Felipe Medeiros', 'Fernanda Medeiros dos Santos'],
    ['Ana Lima', 'Ana Pereira Souza'],
  ];

  it.each(PARENTES)('recusa o telefone de "%s" quando o formulário é de "%s"', (escala, inscricao) => {
    const r = resolverTelefoneVoluntario({ nome: escala, inscricoes: [{ nome: inscricao, telefone: TEL_OK }] });
    expect(r.telefone).toBeNull();
  });

  it('exige nome dos DOIS lados no canal do formulário (ausência não é permissão)', () => {
    expect(resolverTelefoneVoluntario({ nome: '', inscricoes: [{ nome: 'Ana Souza', telefone: TEL_OK }] }).telefone).toBeNull();
    expect(resolverTelefoneVoluntario({ nome: 'Ana Souza', inscricoes: [{ nome: '', telefone: TEL_OK }] }).telefone).toBeNull();
  });

  it('VETA o cadastro vinculado quando os nomes são incompatíveis', () => {
    // `membresia_id` não é prova: o backfill de 2026-06-10 ligou perfis a
    // membros "por CPF/e-mail", e e-mail sozinho nunca identifica.
    const r = resolverTelefoneVoluntario({
      nome: 'Ana Souza Lima',
      membro: { id: 'm1', nome: 'João Souza Lima', telefone: TEL_OK },
    });
    expect(r.telefone).toBeNull();
    expect(r.descartados.some((d: any) => d.motivo === 'nome_divergente')).toBe(true);
  });

  it('VETA o cadastro achado por CPF quando os nomes são incompatíveis', () => {
    const r = resolverTelefoneVoluntario({
      nome: 'Ana Souza Lima',
      membroPorCpf: { id: 'm1', nome: 'João Souza Lima', telefone: TEL_OK },
    });
    expect(r.telefone).toBeNull();
  });

  it('nome ausente num lado NÃO é divergência — o canal forte segue valendo', () => {
    // Perfil do Planning Center sem nome completo é o caso comum; tratar
    // ausência de sinal como conflito jogaria fora a maior parte da recuperação.
    const r = resolverTelefoneVoluntario({
      nome: '',
      membro: { id: 'm1', nome: 'Fernando Monnerat', telefone: TEL_OK },
    });
    expect(r.telefone).toBe(TEL_OK);
    expect(r.origem).toBe(ORIGENS.MEMBRO);
  });
});

describe('resolverTelefoneVoluntario · número que o envio não alcança é descartado', () => {
  // ⚠️ Régua reusada de `contatoPessoa.telefoneAlcancavel`. O envio prefixa 55
  // em 10-11 dígitos, então o suíço `41765764538` viraria um número de Curitiba
  // que não existe — a mensagem chegaria a um ESTRANHO. Número errado é pior
  // que telefone ausente.
  it('descarta o número suíço, declarando o motivo', () => {
    const r = resolverTelefoneVoluntario({ nome: 'Patricia Künzler', perfilTelefone: TEL_SUICO });
    expect(r.telefone).toBeNull();
    expect(r.descartados[0].motivo).toBe('numero_errado');
  });

  it('descarta os 9 dígitos sem DDD', () => {
    expect(resolverTelefoneVoluntario({ nome: 'Desiree', perfilTelefone: TEL_CURTO }).telefone).toBeNull();
  });

  it('número ruim no perfil NÃO impede achar o bom no cadastro da pessoa', () => {
    const r = resolverTelefoneVoluntario({
      nome: 'Desiree Alves',
      perfilTelefone: TEL_CURTO,
      membro: { id: 'm1', nome: 'Desiree Alves', telefone: TEL_OK },
    });
    expect(r.telefone).toBe(TEL_OK);
    expect(r.origem).toBe(ORIGENS.MEMBRO);
  });

  it('aceita fixo de 10 dígitos e celular com DDI 55', () => {
    expect(resolverTelefoneVoluntario({ nome: 'X Y', perfilTelefone: TEL_OK2 }).telefone).toBe(TEL_OK2);
    expect(resolverTelefoneVoluntario({ nome: 'X Y', perfilTelefone: `55${TEL_OK}` }).telefone).toBe(`55${TEL_OK}`);
  });

  it('entrada vazia não explode', () => {
    expect(resolverTelefoneVoluntario().telefone).toBeNull();
    expect(resolverTelefoneVoluntario({}).telefone).toBeNull();
  });
});
