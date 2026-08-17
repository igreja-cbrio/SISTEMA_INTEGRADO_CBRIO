// Contrato da pergunta condicional (`mostrar_se`) das inscrições · 2026-08-17.
//
// Origem: as perguntas do retiro 2027 (PDF do Arthur) são condicionais na
// própria redação — "Caso não seja membro Ami/CBRio, qual a sua igreja?",
// "Qual medicamento? (caso sim)".
//
// ⚠️⚠️ O QUE ESTE ARQUIVO PROTEGE, e é a razão dele existir: a régua roda em DOIS
// lugares (o servidor, pra decidir o que exigir e o que gravar; a tela, pra
// decidir o que mostrar), e divergir entre eles dá um de dois estragos — os dois
// já morderam este sistema no `exige_dados_menor` do voluntariado (28/07):
//   · formulário INSUBMISSÍVEL: 400 exigindo campo que a tela não mostrou;
//   · resposta GRAVADA de pergunta que a pessoa nunca viu.
// Por isso a tabela de casos roda nos DOIS módulos, no mesmo `it`.
import { describe, it, expect } from 'vitest';
import * as back from '../../backend/utils/camposCondicionais.js';
import * as front from '../lib/camposCondicionais.js';

const LADOS: Array<[string, any]> = [['backend', back], ['front', front]];

/** Roda a mesma expectativa nos dois lados — divergência aponta qual falhou. */
function nosDoisLados(fn: (m: any, nome: string) => void) {
  for (const [nome, mod] of LADOS) fn(mod, nome);
}

// Formulário do retiro, reduzido às perguntas que têm condição.
const MEMBRO = 'c_membro';
const IGREJA = 'c_igreja';
const CONHECE = 'c_conhece';
const ALERGIA = 'c_alergia';
const QUAL_MED = 'c_qual_med';

const CAMPOS = [
  { key: MEMBRO, label: 'É membro do Ami/CBRio?', tipo: 'escolha', obrigatorio: true, opcoes: ['Sim', 'Não'] },
  { key: IGREJA, label: 'Qual a sua igreja?', tipo: 'texto', obrigatorio: true, opcoes: [], mostrar_se: { key: MEMBRO, valores: ['Não'] } },
  { key: CONHECE, label: 'Conhece alguém que vai ao Ami Camp 2027?', tipo: 'texto', obrigatorio: false, opcoes: [], mostrar_se: { key: MEMBRO, valores: ['Não'] } },
  { key: ALERGIA, label: 'Possui alergia medicamentosa?', tipo: 'escolha', obrigatorio: true, opcoes: ['Sim', 'Não'] },
  { key: QUAL_MED, label: 'Qual medicamento?', tipo: 'texto', obrigatorio: true, opcoes: [], mostrar_se: { key: ALERGIA, valores: ['Sim'] } },
];

describe('keysVisiveis · o caso REAL do retiro 2027', () => {
  it('sem responder nada, só as perguntas-mãe aparecem', () => {
    nosDoisLados((m, lado) => {
      const vis = m.keysVisiveis(CAMPOS, {});
      expect([...vis].sort(), lado).toEqual([ALERGIA, MEMBRO].sort());
    });
  });

  it('"É membro? Não" abre a igreja e o "conhece alguém"', () => {
    nosDoisLados((m, lado) => {
      const vis = m.keysVisiveis(CAMPOS, { [MEMBRO]: 'Não' });
      expect(vis.has(IGREJA), lado).toBe(true);
      expect(vis.has(CONHECE), lado).toBe(true);
    });
  });

  it('"É membro? Sim" mantém a igreja escondida', () => {
    nosDoisLados((m, lado) => {
      const vis = m.keysVisiveis(CAMPOS, { [MEMBRO]: 'Sim' });
      expect(vis.has(IGREJA), lado).toBe(false);
    });
  });

  it('"alergia? Sim" abre "qual medicamento"; "Não" fecha', () => {
    nosDoisLados((m, lado) => {
      expect(m.keysVisiveis(CAMPOS, { [ALERGIA]: 'Sim' }).has(QUAL_MED), lado).toBe(true);
      expect(m.keysVisiveis(CAMPOS, { [ALERGIA]: 'Não' }).has(QUAL_MED), lado).toBe(false);
    });
  });
});

describe('keysVisiveis · normalização da resposta', () => {
  // A opção é rótulo digitado por gente; a resposta gravada pode ter vindo de uma
  // versão anterior do rótulo, com acento ou caixa diferente.
  it('acento e caixa não decidem visibilidade', () => {
    nosDoisLados((m, lado) => {
      for (const resposta of ['Não', 'não', 'NAO', 'nao ', ' Não']) {
        expect(m.keysVisiveis(CAMPOS, { [MEMBRO]: resposta }).has(IGREJA), `${lado} · ${resposta}`).toBe(true);
      }
    });
  });

  it('múltipla escolha casa por ITEM, não pela string inteira', () => {
    // ⚠️ `multi` guarda "A, B" numa string só. Comparar a string cheia faria a
    // condição falhar sempre que a pessoa marcasse mais de uma opção.
    const campos = [
      { key: 'c_rest', label: 'Restrições', tipo: 'multi', obrigatorio: false, opcoes: ['Alimentar', 'Motora'] },
      { key: 'c_qual', label: 'Qual?', tipo: 'texto', obrigatorio: true, opcoes: [], mostrar_se: { key: 'c_rest', valores: ['Motora'] } },
    ];
    nosDoisLados((m, lado) => {
      expect(m.keysVisiveis(campos, { c_rest: 'Alimentar, Motora' }).has('c_qual'), lado).toBe(true);
      expect(m.keysVisiveis(campos, { c_rest: 'Alimentar' }).has('c_qual'), lado).toBe(false);
    });
  });
});

describe('keysVisiveis · cascata e configuração quebrada', () => {
  it('filho de pergunta ESCONDIDA fica escondido, mesmo com resposta antiga casando', () => {
    // Cenário real: a pessoa respondeu "Não", preencheu a igreja, respondeu o
    // filho do filho e depois voltou pra "Sim". A resposta velha do neto
    // continua no estado do formulário — e não pode ressuscitá-lo.
    const campos = [
      ...CAMPOS,
      { key: 'c_neto', label: 'Desde quando frequenta?', tipo: 'texto', obrigatorio: true, opcoes: [], mostrar_se: { key: IGREJA, valores: ['Batista'] } },
    ];
    nosDoisLados((m, lado) => {
      const vis = m.keysVisiveis(campos, { [MEMBRO]: 'Sim', [IGREJA]: 'Batista' });
      expect(vis.has(IGREJA), lado).toBe(false);
      expect(vis.has('c_neto'), lado).toBe(false);
    });
  });

  it('condição apontando pra pergunta INEXISTENTE deixa o campo VISÍVEL (fail-open)', () => {
    // ⚠️ Fechar aqui sumiria com uma pergunta em silêncio: a equipe montaria o
    // formulário, publicaria, e ela nunca apareceria pra ninguém. Visível é o
    // comportamento de antes de a régua existir.
    const campos = [
      { key: 'c_a', label: 'Pergunta', tipo: 'texto', obrigatorio: true, opcoes: [], mostrar_se: { key: 'c_apagada', valores: ['Sim'] } },
    ];
    nosDoisLados((m, lado) => {
      expect(m.keysVisiveis(campos, {}).has('c_a'), lado).toBe(true);
    });
  });

  it('condição sem valores marcados é IGNORADA (a pergunta aparece)', () => {
    const campos = [
      { key: MEMBRO, label: 'É membro?', tipo: 'escolha', obrigatorio: true, opcoes: ['Sim', 'Não'] },
      { key: 'c_b', label: 'Qual igreja?', tipo: 'texto', obrigatorio: true, opcoes: [], mostrar_se: { key: MEMBRO, valores: [] } },
    ];
    nosDoisLados((m, lado) => {
      expect(m.keysVisiveis(campos, {}).has('c_b'), lado).toBe(true);
    });
  });

  it('ciclo (A depende de B, B depende de A) não trava nem esconde os dois', () => {
    const campos = [
      { key: 'c_x', label: 'X', tipo: 'escolha', obrigatorio: false, opcoes: ['Sim'], mostrar_se: { key: 'c_y', valores: ['Sim'] } },
      { key: 'c_y', label: 'Y', tipo: 'escolha', obrigatorio: false, opcoes: ['Sim'], mostrar_se: { key: 'c_x', valores: ['Sim'] } },
    ];
    nosDoisLados((m, lado) => {
      const vis = m.keysVisiveis(campos, { c_x: 'Sim', c_y: 'Sim' });
      expect(vis.has('c_x'), lado).toBe(true);
      expect(vis.has('c_y'), lado).toBe(true);
    });
  });

  it('campo SEM condição nunca é escondido', () => {
    nosDoisLados((m, lado) => {
      expect(m.keysVisiveis(CAMPOS, {}).has(MEMBRO), lado).toBe(true);
      expect(m.keysVisiveis(CAMPOS, { [MEMBRO]: 'Sim' }).has(ALERGIA), lado).toBe(true);
    });
  });

  it('lista vazia / lixo não estoura', () => {
    nosDoisLados((m, lado) => {
      expect(m.keysVisiveis(undefined as any, {}).size, lado).toBe(0);
      expect(m.keysVisiveis([{ label: 'sem key' }] as any, {}).size, lado).toBe(0);
    });
  });
});

describe('camposVisiveis · ordem preservada', () => {
  it('devolve os campos na ordem original do formulário', () => {
    nosDoisLados((m, lado) => {
      const lista = m.camposVisiveis(CAMPOS, { [MEMBRO]: 'Não', [ALERGIA]: 'Sim' });
      expect(lista.map((c: any) => c.key), lado).toEqual([MEMBRO, IGREJA, CONHECE, ALERGIA, QUAL_MED]);
    });
  });
});

describe('os dois lados concordam em TODA combinação', () => {
  // Varredura exaustiva das respostas possíveis das duas perguntas-mãe. É o que
  // transforma "os arquivos parecem iguais" em "os arquivos DECIDEM igual".
  it('backend e front devolvem o mesmo conjunto visível', () => {
    const opcoes = [undefined, '', 'Sim', 'Não', 'nao', 'NAO', 'lixo'];
    for (const rMembro of opcoes) {
      for (const rAlergia of opcoes) {
        const respostas: any = {};
        if (rMembro !== undefined) respostas[MEMBRO] = rMembro;
        if (rAlergia !== undefined) respostas[ALERGIA] = rAlergia;
        const b = [...back.keysVisiveis(CAMPOS, respostas)].sort();
        const f = [...front.keysVisiveis(CAMPOS, respostas)].sort();
        expect(f, `respostas=${JSON.stringify(respostas)}`).toEqual(b);
      }
    }
  });
});
