import { describe, it, expect } from 'vitest';

import { visivel as visivelBack, montarItens, ehNeutra as ehNeutraBack, resolverMultipla }
  from '../../backend/utils/censoPerguntas.js';
import { visivel as visivelFront, faltando, ehNeutra as ehNeutraFront, aplicarNeutraExclusiva,
  alternarOpcao, blocosVisiveis, limparInvisiveis, progresso, bloqueios, invalidos,
  cpfValido } from '../lib/censoForm';
import questionario from '../../backend/data/censoQuestionario2026.json';

// ESTE É O TESTE QUE JUSTIFICA A DUPLICAÇÃO.
//
// `src/lib/censoForm.ts` repete no cliente a lógica de visibilidade e de
// obrigatoriedade que vive em `backend/utils/censoPerguntas.js`. Se as duas
// divergirem, o sintoma é cruel: a pessoa preenche 93 campos, aperta enviar, e
// o servidor recusa por uma pergunta que o formulário nunca mostrou — sem que
// ela tenha como descobrir qual.
//
// Aqui as duas implementações são comparadas sobre o QUESTIONÁRIO REAL, em
// centenas de combinações de resposta geradas deterministicamente.

/* eslint-disable @typescript-eslint/no-explicit-any */
const perguntas = questionario.perguntas as any[];
const respondiveis = perguntas.filter((p) => p.tipo !== 'secao');

// Gerador determinístico (LCG). Teste que depende de Math.random falha um dia
// só, sem ninguém conseguir reproduzir.
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Uma pessoa preenchendo: percorre em ordem e só responde o que está visível. */
function preencher(rnd: () => number, { deixarVazio = 0 } = {}) {
  const R: Record<string, unknown> = {};
  for (const p of perguntas) {
    if (p.tipo === 'secao') continue;
    if (!visivelFront(p, R)) continue;
    if (rnd() < deixarVazio) continue;                       // simula campo não preenchido
    const o = p.opcoes as string[] | undefined;
    if (p.formato === 'cpf') { R[p.id] = '52998224725'; continue; }
    switch (p.tipo) {
      case 'sim_nao': R[p.id] = rnd() < 0.5 ? 'Sim' : 'Não'; break;
      case 'opcao_unica': R[p.id] = o![Math.floor(rnd() * o!.length)]; break;
      case 'multipla': {
        const n = 1 + Math.floor(rnd() * o!.length);
        R[p.id] = aplicarNeutraExclusiva(p, o!.slice(0, n));
        break;
      }
      case 'nps': R[p.id] = Math.floor(rnd() * 11); break;
      case 'escala_5': case 'estrelas_5':
        R[p.id] = p.permite_nao_se_aplica && rnd() < 0.3 ? 'Não se aplica' : 1 + Math.floor(rnd() * 5);
        break;
      case 'numero': R[p.id] = p.min_num; break;
      case 'data': R[p.id] = '1990-05-12'; break;
      default: R[p.id] = 'texto livre';
    }
  }
  return R;
}

describe('espelho front ↔ back · visibilidade', () => {
  it('concordam sobre TODA pergunta em 300 combinações do questionário real', () => {
    const rnd = lcg(20260806);
    const divergencias: string[] = [];
    for (let i = 0; i < 300; i += 1) {
      const R = preencher(rnd);
      for (const p of respondiveis) {
        if (visivelFront(p, R) !== visivelBack(p, R)) divergencias.push(`${i}:${p.id}`);
      }
    }
    expect(divergencias).toEqual([]);
  });

  it('concordam sobre O QUE ESTÁ FALTANDO — é o que barra o envio', () => {
    const rnd = lcg(777);
    for (let i = 0; i < 200; i += 1) {
      const R = preencher(rnd, { deixarVazio: 0.15 });
      const frente = faltando(perguntas, R).map((p) => p.id).sort();
      const fundo = montarItens({ perguntas, respostas: R }).faltando.map((f: any) => f.id).sort();
      expect(frente).toEqual(fundo);
    }
  });

  it('formulário completo: front não cobra nada e back aceita', () => {
    const rnd = lcg(42);
    for (let i = 0; i < 100; i += 1) {
      const R = preencher(rnd);
      expect(faltando(perguntas, R)).toEqual([]);
      const { faltando: f, ignoradas } = montarItens({ perguntas, respostas: R });
      expect(f).toEqual([]);
      expect(ignoradas).toEqual([]);   // nada respondido fora de vista
    }
  });

  it('concordam sobre qual opção é neutra', () => {
    for (const p of respondiveis) {
      for (const o of (p.opcoes || []).concat(['Não se aplica', 'qualquer'])) {
        expect(ehNeutraFront(p, o)).toBe(ehNeutraBack(p, o));
      }
    }
  });

  it('a exclusividade da neutra dá o mesmo resultado nos dois lados', () => {
    const p = respondiveis.find((q) => q.id === 'restauracao_area')!;
    const marcado = ['Traumas', 'Culpa', 'Prefiro não dizer'];
    expect(aplicarNeutraExclusiva(p, marcado)).toEqual(resolverMultipla(p, marcado));
  });
});

describe('ajudantes só do formulário', () => {
  it('alternar marca, desmarca, e a neutra limpa o resto', () => {
    const p = respondiveis.find((q) => q.id === 'restauracao_area')!;
    expect(alternarOpcao(p, [], 'Traumas')).toEqual(['Traumas']);
    expect(alternarOpcao(p, ['Traumas'], 'Culpa')).toEqual(['Traumas', 'Culpa']);
    expect(alternarOpcao(p, ['Traumas', 'Culpa'], 'Culpa')).toEqual(['Traumas']);
    expect(alternarOpcao(p, ['Traumas'], 'Prefiro não dizer')).toEqual(['Prefiro não dizer']);
    // e marcar outra depois tira a neutra
    expect(alternarOpcao(p, ['Prefiro não dizer'], 'Culpa')).toEqual(['Culpa']);
  });

  it('bloco sem pergunta visível desaparece — é o que encurta o formulário', () => {
    const solteiroSemFilhos = { estado_civil: 'Solteiro(a)', tem_filhos: 'Não' };
    const casadoComFilhos = { estado_civil: 'Casado(a)', tem_filhos: 'Sim' };
    const a = blocosVisiveis(perguntas, solteiroSemFilhos);
    const b = blocosVisiveis(perguntas, casadoComFilhos);
    const conta = (bl: ReturnType<typeof blocosVisiveis>) => bl.reduce((n, x) => n + x.perguntas.length, 0);
    expect(conta(a)).toBeLessThan(conta(b));
    expect(a.every((bl) => bl.perguntas.length > 0)).toBe(true);
  });

  it('limpa resposta de pergunta que ficou invisível quando a pessoa volta e muda', () => {
    const antes = { tem_filhos: 'Sim', filhos_quantos: 3, filhos_faixas: ['0 a 5 anos'] };
    const depois = limparInvisiveis(perguntas, { ...antes, tem_filhos: 'Não' });
    expect(depois.filhos_quantos).toBeUndefined();
    expect(depois.filhos_faixas).toBeUndefined();
    expect(depois.tem_filhos).toBe('Não');
    // e o backend concorda que aquilo não deveria ter sido enviado
    const { ignoradas } = montarItens({ perguntas, respostas: { ...antes, tem_filhos: 'Não' } });
    expect(ignoradas).toContain('filhos_quantos');
  });

  it('progresso conta sobre o que está VISÍVEL, não sobre as 93', () => {
    const R = { estado_civil: 'Solteiro(a)' };
    const p1 = progresso(perguntas, R);
    expect(p1.feitas).toBe(1);
    expect(p1.total).toBeLessThan(respondiveis.length);   // condicionais fora
    expect(p1.pct).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  O ESPELHO QUE FALTAVA: valor PRESENTE mas INVÁLIDO (11/09/2026)
//
//  O teste de cima compara o que está VAZIO — e passava, porque o gerador
//  sempre usou um CPF válido (`52998224725`). O servidor, porém, também recusa
//  valor preenchido e inválido: em `montarItens`, CPF com dígito trocado, data
//  fora do formato, número fora da faixa e opção que não existe caem no
//  `faltou()` e voltam como 400.
//
//  Era exatamente esse o buraco: o cliente deixava passar, o servidor recusava,
//  e a tela já tinha agradecido. O invariante abaixo é de UMA DIREÇÃO — é a que
//  importa: **nada que o formulário aceita pode ser recusado pelo servidor.**
//  O contrário é permitido de propósito (o formulário cobra e-mail, telefone e
//  CEP, que o servidor guarda como texto).
// ══════════════════════════════════════════════════════════════════════════
describe('espelho front ↔ back · valor inválido', () => {
  /** Preenche tudo e depois SUJA o valor de alguns campos, como um dedo errado. */
  function sujar(rnd: () => number) {
    const R = preencher(rnd);
    for (const p of respondiveis) {
      if (!visivelFront(p, R) || R[p.id] === undefined) continue;
      if (rnd() > 0.25) continue;
      if (p.formato === 'cpf') R[p.id] = '111.111.111-11';                  // dígito inválido
      else if (p.tipo === 'data') R[p.id] = '31/02/1990';                   // fora do ISO
      else if (p.tipo === 'numero') R[p.id] = (p.max_num ?? 99) + 7;        // acima do teto
      else if (p.tipo === 'nps') R[p.id] = 42;                              // fora de 0-10
      else if (p.tipo === 'escala_5' || p.tipo === 'estrelas_5') R[p.id] = 99;
      else if (p.tipo === 'opcao_unica') R[p.id] = 'opção que não existe';
      else if (p.tipo === 'sim_nao') R[p.id] = 'Talvez';
    }
    return R;
  }

  it('nada que o formulário aceita é recusado pelo servidor (200 combinações sujas)', () => {
    const rnd = lcg(20260911);
    for (let i = 0; i < 200; i += 1) {
      const R = sujar(rnd);
      const barradoNoFront = new Set(bloqueios(perguntas, R).map((b) => b.id));
      const recusadoNoBack = montarItens({ perguntas, respostas: R }).faltando.map((f: any) => f.id);
      for (const id of recusadoNoBack) {
        expect(barradoNoFront.has(id), `servidor recusa "${id}" e o formulário deixou passar`).toBe(true);
      }
    }
  });

  it('CPF com dígito trocado: front barra COM MOTIVO e back recusa', () => {
    const rnd = lcg(1);
    const R = preencher(rnd);
    R.cpf = '111.111.111-11';
    const problema = invalidos(perguntas, R).find((x) => x.id === 'cpf');
    expect(problema?.motivo).toMatch(/CPF inválido/);
    expect(montarItens({ perguntas, respostas: R }).faltando.map((f: any) => f.id)).toContain('cpf');
  });

  it('cpfValido do cliente concorda com o do backend', async () => {
    const back = await import('../../backend/utils/cpf.js');
    for (const v of ['52998224725', '529.982.247-25', '111.111.111-11', '00000000000',
      '1234567890', '12345678901', '', 'abc', '10033592306']) {
      expect(cpfValido(v), `divergiu em "${v}"`).toBe(back.cpfValido(back.normalizarCpf(v)));
    }
  });

  it('formulário completo e limpo não é barrado por nada', () => {
    const rnd = lcg(99);
    for (let i = 0; i < 100; i += 1) {
      const R = preencher(rnd);
      // ⚠️ O gerador de cima escreve "texto livre" em TODO texto curto, e as
      // regras SÓ-DO-FORMULÁRIO (e-mail, telefone, CEP) recusam isso com razão.
      // Aqui damos o valor na forma certa — é o que a pessoa digita de verdade.
      for (const p of respondiveis) {
        if (R[p.id] === undefined) continue;
        if (p.formato === 'email') R[p.id] = 'pessoa@exemplo.com';
        if (p.formato === 'telefone') R[p.id] = '(21) 99999-9999';
        if (p.formato === 'cep') R[p.id] = '20000-000';
      }
      expect(bloqueios(perguntas, R)).toEqual([]);
    }
  });

  it('as regras só-do-formulário cobram e-mail, telefone e CEP tortos', () => {
    const R = preencher(lcg(7));
    const achar = (id: string) => invalidos(perguntas, R).find((x) => x.id === id)?.motivo || '';
    const idDe = (fmt: string) => respondiveis.find((p) => p.formato === fmt && visivelFront(p, R))?.id;
    const eEmail = idDe('email'); const eTel = idDe('telefone'); const eCep = idDe('cep');
    if (eEmail) { R[eEmail] = 'sem-arroba'; expect(achar(eEmail)).toMatch(/E-mail inválido/); }
    if (eTel) { R[eTel] = '(21) 9999'; expect(achar(eTel)).toMatch(/Telefone incompleto/); }
    if (eCep) { R[eCep] = '2000'; expect(achar(eCep)).toMatch(/CEP incompleto/); }
    // ⚠️ E o servidor NÃO recusa nenhum deles: guarda o texto como veio. É por
    // isso que o invariante do espelho é de uma direção só.
    const recusado = montarItens({ perguntas, respostas: R }).faltando.map((f: any) => f.id);
    for (const id of [eEmail, eTel, eCep].filter(Boolean)) expect(recusado).not.toContain(id);
  });
});
