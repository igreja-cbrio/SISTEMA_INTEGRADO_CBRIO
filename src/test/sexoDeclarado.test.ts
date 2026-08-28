// ════════════════════════════════════════════════════════════════════════════
//  SEXO · declaração × palpite
//
//  ⚠️⚠️ Estes testes guardam a LEI de 10/08: **nunca inferir sexo por nome e
//  gravar como se fosse declarado.** O sexo decide quem entra em grupo de
//  Homens/Mulheres — palpite errado impede alguém de entrar no grupo certo, e
//  ninguém sabe quais estão errados.
//
//  O que está travado aqui:
//    · vocabulários diferentes das tabelas traduzem pro canônico
//    · divergência entre portas é CONFLITO, nunca desempate
//    · só palpite de confiança ALTA vira sugestão (ambíguo some)
//    · o casamento nome↔pessoa é acento-insensível
// ════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const {
  normalizarSexo,
  consolidarDeclaracoes,
  primeiroNomeParaPalpite,
  palpitesUsaveis,
  casarPalpites,
} = require_('../../backend/utils/sexoDeclarado.js');

describe('normalizarSexo · as tabelas não falam a mesma língua', () => {
  it('canônico passa', () => {
    expect(normalizarSexo('masculino')).toBe('masculino');
    expect(normalizarSexo('feminino')).toBe('feminino');
  });

  // kids_criancas e batismo_inscricoes gravam M/F; ler com a régua do canônico
  // devolveria null e o dado seria descartado em silêncio.
  it('vocabulário curto M/F traduz', () => {
    expect(normalizarSexo('M')).toBe('masculino');
    expect(normalizarSexo('f')).toBe('feminino');
  });

  it('caixa e espaço não atrapalham', () => {
    expect(normalizarSexo('  Feminino ')).toBe('feminino');
    expect(normalizarSexo('MASCULINO')).toBe('masculino');
  });

  it('não inventa: vazio, lixo e "outro" viram null', () => {
    for (const v of ['', '   ', null, undefined, 'outro', 'x', 'nao informado', 0]) {
      expect(normalizarSexo(v as never)).toBeNull();
    }
  });
});

describe('consolidarDeclaracoes · divergência é CONFLITO, não desempate', () => {
  it('uma fonte só', () => {
    const r = consolidarDeclaracoes([{ fonte: 'next', sexo: 'feminino' }]);
    expect(r).toMatchObject({ sexo: 'feminino', conflito: false });
    expect(r.fontes).toEqual(['next']);
  });

  it('fontes concordando (mesmo em vocabulários diferentes) somam', () => {
    const r = consolidarDeclaracoes([
      { fonte: 'voluntariado', sexo: 'masculino' },
      { fonte: 'batismo', sexo: 'M' },
    ]);
    expect(r.sexo).toBe('masculino');
    expect(r.conflito).toBe(false);
    expect(r.fontes).toEqual(['voluntariado', 'batismo']);
  });

  // ⚠️ MUTATION TARGET: "resolver" isso escolhendo a primeira/mais recente grava
  // um erro com cara de dado. Uma das portas está errada, ou são duas pessoas
  // fundidas por engano — em ambos os casos é decisão humana.
  it('fontes divergindo NÃO gravam nada', () => {
    const r = consolidarDeclaracoes([
      { fonte: 'voluntariado', sexo: 'masculino' },
      { fonte: 'batismo', sexo: 'F' },
    ]);
    expect(r.sexo).toBeNull();
    expect(r.conflito).toBe(true);
    expect(r.fontes.join(' ')).toContain('voluntariado');
    expect(r.fontes.join(' ')).toContain('batismo');
  });

  it('sem declaração nenhuma', () => {
    expect(consolidarDeclaracoes([])).toMatchObject({ sexo: null, conflito: false });
    expect(consolidarDeclaracoes([{ fonte: 'next', sexo: 'outro' }])).toMatchObject({ sexo: null, conflito: false });
    expect(consolidarDeclaracoes(null as never)).toMatchObject({ sexo: null, conflito: false });
  });
});

describe('primeiroNomeParaPalpite · só o primeiro nome vai pro modelo (LGPD)', () => {
  it('devolve o primeiro token', () => {
    expect(primeiroNomeParaPalpite('Maria Souza Lima')).toBe('Maria');
    expect(primeiroNomeParaPalpite('  João   Pedro  ')).toBe('João');
  });

  it('inicial não é nome — não dá pra palpitar', () => {
    expect(primeiroNomeParaPalpite('R. Silva')).toBeNull();
    expect(primeiroNomeParaPalpite('J Souza')).toBeNull();
  });

  it('vazio/nulo não estoura', () => {
    expect(primeiroNomeParaPalpite('')).toBeNull();
    expect(primeiroNomeParaPalpite(null as never)).toBeNull();
  });
});

describe('palpitesUsaveis · ambíguo NÃO vira sugestão', () => {
  it('só confiança alta sobrevive', () => {
    const r = palpitesUsaveis([
      { nome: 'Maria', sexo: 'feminino', confianca: 'alta' },
      { nome: 'Alex', sexo: 'masculino', confianca: 'ambiguo' },
      { nome: 'Ariel', sexo: 'feminino', confianca: 'media' },
    ]);
    expect(r).toEqual([{ nome: 'Maria', sexo: 'feminino' }]);
  });

  // ⚠️ MUTATION TARGET: aceitar 'media' aqui transforma a fila de revisão numa
  // fila de erros plausíveis — parecem certos e ninguém confere.
  it('nome unissex marcado ambíguo some da lista', () => {
    const unissex = ['Alex', 'Ariel', 'Darci', 'Jean', 'Yuri', 'Nicola', 'Lindomar'];
    const r = palpitesUsaveis(unissex.map(nome => ({ nome, sexo: 'masculino', confianca: 'ambiguo' })));
    expect(r).toEqual([]);
  });

  it('sexo inválido não passa nem com confiança alta', () => {
    expect(palpitesUsaveis([{ nome: 'Chris', sexo: 'outro', confianca: 'alta' }])).toEqual([]);
    expect(palpitesUsaveis([{ nome: '', sexo: 'feminino', confianca: 'alta' }])).toEqual([]);
  });

  it('resposta que não é lista não estoura', () => {
    expect(palpitesUsaveis(null as never)).toEqual([]);
    expect(palpitesUsaveis({ erro: 'x' } as never)).toEqual([]);
  });
});

// ⚠️ O formato compacto existe por causa de TEMPO: o formato por objeto gera
// ~8x mais tokens de saída e o cliente aborta em 30s — foi o que travou o 1º
// uso real (14/08). Aqui o ambíguo nem trafega, que é a política.
describe('palpitesUsaveis · formato COMPACTO {masculino:[], feminino:[]}', () => {
  it('lê as duas listas', () => {
    const r = palpitesUsaveis({ masculino: ['João', 'Pedro'], feminino: ['Maria'] });
    expect(r).toEqual([
      { nome: 'João', sexo: 'masculino' },
      { nome: 'Pedro', sexo: 'masculino' },
      { nome: 'Maria', sexo: 'feminino' },
    ]);
  });

  it('chave desconhecida (ex.: "ambiguo") é ignorada', () => {
    const r = palpitesUsaveis({ masculino: ['João'], ambiguo: ['Alex', 'Ariel'], outro: ['X'] });
    expect(r).toEqual([{ nome: 'João', sexo: 'masculino' }]);
  });

  it('lista vazia, valor não-array e nome vazio não estouram', () => {
    expect(palpitesUsaveis({ masculino: [], feminino: [] })).toEqual([]);
    expect(palpitesUsaveis({ masculino: 'João' } as never)).toEqual([]);
    expect(palpitesUsaveis({ feminino: ['', '  '] })).toEqual([]);
  });

  it('aceita M/F como chave (o modelo às vezes abrevia)', () => {
    expect(palpitesUsaveis({ m: ['Pedro'], f: ['Ana'] })).toEqual([
      { nome: 'Pedro', sexo: 'masculino' },
      { nome: 'Ana', sexo: 'feminino' },
    ]);
  });
});

describe('casarPalpites · o modelo responde com acento, a base nem sempre tem', () => {
  it('casa ignorando acento e caixa', () => {
    const r = casarPalpites(
      [{ membro_id: 'a', nome: 'JOSE DA SILVA' }, { membro_id: 'b', nome: 'joão pedro' }],
      [{ nome: 'José', sexo: 'masculino' }, { nome: 'Joao', sexo: 'masculino' }],
    );
    expect(r.map(x => x.membro_id).sort()).toEqual(['a', 'b']);
  });

  it('pessoa sem palpite não entra na lista', () => {
    const r = casarPalpites(
      [{ membro_id: 'a', nome: 'Alex Souza' }],
      [{ nome: 'Maria', sexo: 'feminino' }],
    );
    expect(r).toEqual([]);
  });

  it('a mesma sugestão vale pra todo mundo que tem aquele nome', () => {
    const r = casarPalpites(
      [{ membro_id: '1', nome: 'Maria A' }, { membro_id: '2', nome: 'Maria B' }],
      [{ nome: 'Maria', sexo: 'feminino' }],
    );
    expect(r).toHaveLength(2);
    expect(r.every(x => x.sexo === 'feminino')).toBe(true);
  });

  it('aceita id em `id` ou `membro_id`, e ignora quem não tem nome utilizável', () => {
    const r = casarPalpites(
      [{ id: 'z', nome: 'Ana Paula' }, { membro_id: 'w', nome: 'A. Silva' }],
      [{ nome: 'Ana', sexo: 'feminino' }],
    );
    expect(r).toEqual([{ membro_id: 'z', nome: 'Ana Paula', primeiro_nome: 'Ana', sexo: 'feminino' }]);
  });
});
