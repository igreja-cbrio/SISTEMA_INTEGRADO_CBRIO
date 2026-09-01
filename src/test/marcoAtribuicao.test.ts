import { describe, it, expect } from 'vitest';
// Régua CommonJS de backend/utils — padrão dos testes da casa.
import atrib from '../../backend/utils/marcoAtribuicao.js';

const {
  MAX_RESPONSAVEIS, normalizarResponsaveis, normalizarArea,
  diffResponsaveis, destinatariosDoAviso,
} = atrib;

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

describe('atribuição de tarefa da campanha · normalizar', () => {
  it('aceita string E objeto — as duas formas existem no front', () => {
    expect(normalizarResponsaveis([A]).ids).toEqual([A]);
    expect(normalizarResponsaveis([{ id: A }]).ids).toEqual([A]);
    expect(normalizarResponsaveis([{ profile_id: A }]).ids).toEqual([A]);
    // um valor solto (não array) não pode derrubar o save
    expect(normalizarResponsaveis(A).ids).toEqual([A]);
  });

  it('a mesma pessoa marcada 2× entra uma vez', () => {
    expect(normalizarResponsaveis([A, A, { id: A }]).ids).toEqual([A]);
  });

  it('id inválido é DECLARADO, nunca engolido em silêncio', () => {
    const r = normalizarResponsaveis([A, 'nao-e-uuid', '']);
    expect(r.ids).toEqual([A]);
    // ⚠️ Descartar sem declarar faz a pessoa salvar, ver menos gente do que
    // marcou e concluir que a tela está quebrada.
    expect(r.invalidos).toEqual(['nao-e-uuid']);
  });

  it('respeita o teto e DIZ quantos ficaram de fora', () => {
    const muitos = Array.from({ length: MAX_RESPONSAVEIS + 3 },
      (_, i) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`);
    const r = normalizarResponsaveis(muitos);
    expect(r.ids).toHaveLength(MAX_RESPONSAVEIS);
    expect(r.truncados).toBe(3);
  });

  it('lista vazia/ausente é estado legítimo (tirar todos os responsáveis)', () => {
    expect(normalizarResponsaveis([]).ids).toEqual([]);
    expect(normalizarResponsaveis(undefined).ids).toEqual([]);
    expect(normalizarResponsaveis(null).ids).toEqual([]);
  });
});

describe('área', () => {
  it('inteiro positivo passa; o resto vira null (= tirar a área)', () => {
    expect(normalizarArea(7)).toBe(7);
    expect(normalizarArea('7')).toBe(7);
    expect(normalizarArea(null)).toBeNull();
    expect(normalizarArea('')).toBeNull();
    expect(normalizarArea(0)).toBeNull();
    expect(normalizarArea(-3)).toBeNull();
    expect(normalizarArea('abc')).toBeNull();
    // ⚠️ `areas.id` é INTEGER (não uuid): float não é id de área.
    expect(normalizarArea(7.5)).toBeNull();
  });
});

describe('diff · o aviso vai só pra quem ENTROU', () => {
  it('salvar de novo sem mudar responsável NÃO gera aviso', () => {
    const d = diffResponsaveis([A, B], [A, B]);
    // ⚠️ É o coração do desenho: sem isso, mexer no prazo três vezes mandaria
    // três avisos pras MESMAS pessoas — o padrão que treina a equipe a ignorar
    // o sino (esta base já teve 10.914 avisos em 21 dias, 88% não lidos).
    expect(d.adicionados).toEqual([]);
    expect(d.removidos).toEqual([]);
    expect(d.inalterados).toHaveLength(2);
  });

  it('separa quem entrou de quem saiu', () => {
    const d = diffResponsaveis([A, B], [B, C]);
    expect(d.adicionados).toEqual([C.toLowerCase()]);
    expect(d.removidos).toEqual([A.toLowerCase()]);
  });

  it('compara sem depender de caixa do uuid', () => {
    const d = diffResponsaveis([A.toUpperCase()], [A.toLowerCase()]);
    expect(d.adicionados).toEqual([]);
    expect(d.removidos).toEqual([]);
  });
});

describe('destinatários do aviso', () => {
  it('pessoa nomeada vence a área — "Marketing + Pedro" avisa o Pedro', () => {
    // ⚠️ Se a área também fosse avisada aqui, toda atribuição nominal viraria
    // 6 ou 7 avisos, que é o oposto do que atribuir a uma pessoa significa.
    const r = destinatariosDoAviso({
      adicionados: [B], pessoasDaArea: [{ profile_id: A }, { profile_id: C }],
    });
    expect(r.via).toBe('pessoa');
    expect(r.ids).toEqual([B.toLowerCase()]);
  });

  it('sem ninguém nomeado, avisa as pessoas da área', () => {
    const r = destinatariosDoAviso({
      adicionados: [], pessoasDaArea: [{ profile_id: A }, { profile_id: C }],
    });
    expect(r.via).toBe('area');
    expect(r.ids).toHaveLength(2);
  });

  it('quem atribuiu NÃO se avisa a si mesmo', () => {
    expect(destinatariosDoAviso({ adicionados: [A], autorId: A }).ids).toEqual([]);
    // e o autor sai também do caminho da área
    const r = destinatariosDoAviso({
      adicionados: [], pessoasDaArea: [{ profile_id: A }, { profile_id: B }], autorId: A,
    });
    expect(r.ids).toEqual([B.toLowerCase()]);
  });

  it('nada a avisar devolve via null, não uma lista vazia com via inventada', () => {
    const r = destinatariosDoAviso({ adicionados: [], pessoasDaArea: [] });
    expect(r.ids).toEqual([]);
    expect(r.via).toBeNull();
  });

  it('área que não resolve ninguém não inventa destinatário', () => {
    // Caso real possível: área cujas pessoas são todas `is_membro_only`.
    const r = destinatariosDoAviso({ adicionados: [], pessoasDaArea: [{ profile_id: null }] });
    expect(r.ids).toEqual([]);
  });
});
