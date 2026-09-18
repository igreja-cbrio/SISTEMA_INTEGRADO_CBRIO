// O vocabulário do 1º contato dos Próximos passos (16/09/2026).
//
// ⚠️⚠️ O pedido do Marcelo: "existem pessoas do online que nós temos apenas o id
// do youtube e o contato não é possível". MEDIDO no mesmo dia: 6 linhas de
// 14/09, área online, nome = handle do YouTube, telefone de dígito repetido,
// todas marcadas `contactada` — que conta como CONTATO FEITO. O indicador
// estava contando 6 contatos impossíveis.
import { describe, it, expect } from 'vitest';
import {
  PCONTATO_OPCOES, PCONTATO_LABEL, PCONTATO_COR, PCONTATO_FEITO,
  PCONTATO_INALCANCAVEL, rotuloPrimeiroContato,
} from '../lib/primeiroContato';

describe('as opções oferecidas', () => {
  it('oferece "Contato impossível"', () => {
    const o = PCONTATO_OPCOES.find(x => x.v === 'contato_impossivel');
    expect(o).toBeDefined();
    expect(o!.label).toBe('Contato impossível');
  });

  // ⚠️ O Marcelo pediu "não atendeu" achando que faltava — ela já estava lá.
  it('"Não atendido" continua na lista', () => {
    expect(PCONTATO_OPCOES.some(x => x.v === 'nao_atendido')).toBe(true);
  });

  it('só um desfecho é positivo', () => {
    expect(PCONTATO_OPCOES.filter(x => x.positivo).map(x => x.v)).toEqual(['atendido_respondido']);
  });

  it('nenhum valor repetido, e todo valor tem rótulo e cor', () => {
    const vs = PCONTATO_OPCOES.map(x => x.v);
    expect(new Set(vs).size).toBe(vs.length);
    for (const v of vs) {
      expect(PCONTATO_LABEL[v], `rótulo de ${v}`).toBeTruthy();
      expect(PCONTATO_COR[v], `cor de ${v}`).toBeTruthy();
    }
  });
});

describe('contato FEITO', () => {
  // ⚠️⚠️ O mutante: pôr `contato_impossivel` aqui. Seria reintroduzir
  // exatamente o defeito que este status existe pra consertar.
  it('"Contato impossível" NÃO conta como contato feito', () => {
    expect(PCONTATO_FEITO.has('contato_impossivel')).toBe(false);
  });

  it('número errado e sem retorno também não contam (régua do front)', () => {
    expect(PCONTATO_FEITO.has('numero_errado')).toBe(false);
    expect(PCONTATO_FEITO.has('sem_retorno')).toBe(false);
  });

  it('mensagem enviada conta, respondida ou não', () => {
    for (const v of ['contactada', 'nao_respondeu', 'nao_atendido', 'atendido_respondido']) {
      expect(PCONTATO_FEITO.has(v), v).toBe(true);
    }
  });
});

describe('inalcançável · sai do denominador do atendimento', () => {
  // ⚠️ Cobrar atendimento de quem não tinha canal é cobrar o que não está na
  // mão da equipe — `numero_errado` já saía; o novo entra na mesma família.
  it('reúne número errado e contato impossível', () => {
    expect([...PCONTATO_INALCANCAVEL].sort()).toEqual(['contato_impossivel', 'numero_errado']);
  });

  it('quem recebeu mensagem nunca é inalcançável', () => {
    for (const v of ['contactada', 'nao_atendido', 'nao_respondeu', 'atendido_respondido']) {
      expect(PCONTATO_INALCANCAVEL.has(v), v).toBe(false);
    }
  });
});

describe('rotuloPrimeiroContato', () => {
  it('traduz o que a tela oferece', () => {
    expect(rotuloPrimeiroContato('contato_impossivel')).toBe('Contato impossível');
    expect(rotuloPrimeiroContato('nao_atendido')).toBe('Não atendido');
  });

  // ⚠️ Status legado não é mais oferecido, mas existe em linha antiga — sem
  // rótulo, a tela mostraria o valor cru.
  it('traduz os legados da planilha importada', () => {
    expect(rotuloPrimeiroContato('sem_retorno')).toBe('Sem retorno do responsável');
    expect(rotuloPrimeiroContato('nao_compareceu')).toBe('Não compareceu');
  });

  it('vazio vira travessão, nunca string vazia', () => {
    expect(rotuloPrimeiroContato(null)).toBe('—');
    expect(rotuloPrimeiroContato('')).toBe('—');
    expect(rotuloPrimeiroContato('   ')).toBe('—');
  });

  // ⚠️ Status que aparecer do banco sem passar por aqui é mostrado CRU em vez
  // de sumir: valor desconhecido na tela é pista; campo vazio esconde o problema.
  it('status desconhecido aparece cru, não some', () => {
    expect(rotuloPrimeiroContato('status_que_nao_existe')).toBe('status_que_nao_existe');
  });
});
