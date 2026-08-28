// Contrato do relatório de vínculos duplicados (mesma pessoa, 2+ linhas ATIVAS
// no MESMO grupo).
//
// Pedido do Matheus (13/08/2026), depois que a coluna Grupo da aba Pessoas
// apareceu repetindo "JOVENS - ESTUDO DA MENSAGEM DO CULTO AMI" 5× na mesma
// pessoa — linhas reais, não bug de render.
//
// ⚠️ MUTATION-TESTS desta suíte (rodados, não afirmados):
//   1. `validarResolucao` aceitar id que não é do caso → uma tela desatualizada
//      apagaria vínculo de OUTRA pessoa  (1 vermelho);
//   2. a sugestão deixar de priorizar `presencas` → a coordenação seguiria o
//      automático e jogaria fora o contador que existia  (4 vermelhos);
//   3. a sugestão deixar de olhar o papel → rebaixaria a linha de líder  (1).
//
// ⚠️ E uma armadilha que ESTA suíte já caiu: o último desempate de
// `escolherLinhaAManter` é o `id` alfabético, então teste cujo vencedor esperado
// tem o id alfabeticamente MENOR passa mesmo com o critério sob teste removido.
// A 1ª versão daqui tinha QUATRO casos assim — todos verdes com o mutante
// aplicado. Os ids agora são escolhidos ao contrário de propósito.
import { describe, it, expect } from 'vitest';
import {
  escolherLinhaAManter, agruparDuplicados, validarResolucao,
} from '../../backend/utils/vinculosDuplicados.js';

const linha = (over: any = {}) => ({
  id: 'l1', membro_id: 'm1', grupo_id: 'g1', funcao: 'frequentador',
  presencas: 0, entrou_em: '2026-01-10', created_at: '2026-01-10T10:00:00Z',
  ...over,
});

describe('escolherLinhaAManter · a sugestão', () => {
  it('lista vazia devolve null', () => {
    expect(escolherLinhaAManter([])).toBeNull();
    expect(escolherLinhaAManter(null as any)).toBeNull();
  });

  // ⚠️⚠️ OS IDS DESTES 4 CASOS SÃO ESCOLHIDOS AO CONTRÁRIO DE PROPÓSITO: o
  // último desempate é o `id` em ordem alfabética, então se o id do vencedor
  // esperado vier ANTES no alfabeto o teste passa mesmo com o critério que ele
  // deveria verificar REMOVIDO. Foi o que aconteceu na 1ª versão deste arquivo —
  // o mutante que tirava `presencas` da ordenação ficou VERDE. Em cada caso o
  // vencedor esperado é o id alfabeticamente MAIOR ('z...'), então só o critério
  // sob teste pode produzir o resultado.

  // ⚠️ MUTANTE 3: tirar `presencas` do 1º critério deixa isto vermelho.
  it('presenças manda: mantém a linha que tem o histórico', () => {
    const r = escolherLinhaAManter([
      linha({ id: 'a-vazia', presencas: 0 }),
      linha({ id: 'z-com-historico', presencas: 12 }),
    ]);
    expect(r.id).toBe('z-com-historico');
  });

  it('empatado em presenças, o papel maior vence (não rebaixa líder)', () => {
    const r = escolherLinhaAManter([
      linha({ id: 'a-membro', funcao: 'frequentador' }),
      linha({ id: 'z-lider', funcao: 'lider' }),
    ]);
    expect(r.id).toBe('z-lider');
  });

  it('empatado em presenças e papel, o entrou_em mais ANTIGO vence', () => {
    const r = escolherLinhaAManter([
      linha({ id: 'a-nova', entrou_em: '2026-08-01' }),
      linha({ id: 'z-antiga', entrou_em: '2025-03-04' }),
    ]);
    expect(r.id).toBe('z-antiga');
  });

  it('entrou_em ausente NÃO vence de quem tem data', () => {
    const r = escolherLinhaAManter([
      linha({ id: 'a-sem-data', entrou_em: null }),
      linha({ id: 'z-com-data', entrou_em: '2026-05-05' }),
    ]);
    expect(r.id).toBe('z-com-data');
  });

  it('empatado em tudo menos created_at, o mais ANTIGO vence', () => {
    const r = escolherLinhaAManter([
      linha({ id: 'a-novo', entrou_em: null, created_at: '2026-08-01T00:00:00Z' }),
      linha({ id: 'z-antigo', entrou_em: null, created_at: '2025-01-02T00:00:00Z' }),
    ]);
    expect(r.id).toBe('z-antigo');
  });

  // Sugestão que muda a cada refresh faz a coordenação desconfiar do relatório.
  it('é determinística com tudo empatado (desempate por id)', () => {
    const a = linha({ id: 'bbb' });
    const b = linha({ id: 'aaa' });
    expect(escolherLinhaAManter([a, b]).id).toBe('aaa');
    expect(escolherLinhaAManter([b, a]).id).toBe('aaa');
  });
});

describe('agruparDuplicados', () => {
  it('linha única não é caso', () => {
    const r = agruparDuplicados([linha({ id: 'a' })]);
    expect(r.casos).toEqual([]);
    expect(r.total_linhas_extras).toBe(0);
  });

  it('multi-GRUPO não é duplicata (é o desenho da igreja)', () => {
    const r = agruparDuplicados([
      linha({ id: 'a', grupo_id: 'g1' }),
      linha({ id: 'b', grupo_id: 'g2' }),
      linha({ id: 'c', grupo_id: 'g3' }),
    ]);
    expect(r.casos).toEqual([]);
  });

  it('mesma pessoa + mesmo grupo 2× vira caso', () => {
    const r = agruparDuplicados([linha({ id: 'a' }), linha({ id: 'b' })]);
    expect(r.casos).toHaveLength(1);
    expect(r.casos[0].linhas).toHaveLength(2);
    expect(r.total_linhas_extras).toBe(1);
    expect(r.pessoas_afetadas).toBe(1);
    expect(r.grupos_afetados).toBe(1);
  });

  // O caso do print: 5 linhas no mesmo grupo.
  it('conta as linhas EXTRAS, não as linhas', () => {
    const cinco = ['a', 'b', 'c', 'd', 'e'].map((id) => linha({ id }));
    const r = agruparDuplicados(cinco);
    expect(r.total_linhas_extras).toBe(4);
  });

  it('linha sem membro ou sem grupo é ignorada', () => {
    const r = agruparDuplicados([
      linha({ id: 'a', membro_id: null }),
      linha({ id: 'b', membro_id: null }),
      linha({ id: 'c', grupo_id: null }),
      linha({ id: 'd', grupo_id: null }),
    ]);
    expect(r.casos).toEqual([]);
  });

  it('a sugerida vem primeiro e o resto é declarado', () => {
    const r = agruparDuplicados([
      linha({ id: 'a-vazia', presencas: 0 }),
      linha({ id: 'z-cheia', presencas: 9 }),
    ]);
    const c = r.casos[0];
    expect(c.sugestao_manter_id).toBe('z-cheia');
    expect(c.linhas[0].id).toBe('z-cheia');
    expect(c.presencas_fora_da_sugestao).toBe(0);
  });

  // ⚠️ Duas linhas COM presença = o contador está partido; seguir o automático
  // muda um número que alguém lê. O relatório tem que gritar isso.
  it('marca exige_atencao quando mais de uma linha tem presença', () => {
    const r = agruparDuplicados([
      linha({ id: 'z-mais', presencas: 7 }),
      linha({ id: 'a-menos', presencas: 3 }),
    ]);
    expect(r.casos[0].exige_atencao).toBe(true);
    expect(r.casos[0].sugestao_manter_id).toBe('z-mais');
    expect(r.casos[0].presencas_fora_da_sugestao).toBe(3);
  });

  it('uma só com presença NÃO exige atenção', () => {
    const r = agruparDuplicados([
      linha({ id: 'z-com', presencas: 7 }),
      linha({ id: 'a-sem', presencas: 0 }),
    ]);
    expect(r.casos[0].exige_atencao).toBe(false);
    expect(r.casos[0].sugestao_manter_id).toBe('z-com');
  });

  it('quem exige atenção aparece primeiro', () => {
    const r = agruparDuplicados([
      linha({ id: 'x1', membro_id: 'mX', presencas: 0 }),
      linha({ id: 'x2', membro_id: 'mX', presencas: 0 }),
      linha({ id: 'y1', membro_id: 'mY', presencas: 4 }),
      linha({ id: 'y2', membro_id: 'mY', presencas: 2 }),
    ]);
    expect(r.casos[0].membro_id).toBe('mY');
  });
});

describe('validarResolucao · o servidor decide, não o payload', () => {
  const caso = [
    linha({ id: 'a', presencas: 5 }),
    linha({ id: 'b' }),
    linha({ id: 'c' }),
  ];

  it('caminho feliz', () => {
    const r = validarResolucao(caso, 'a', ['b', 'c']);
    expect(r.ok).toBe(true);
    expect(r.remover).toEqual(['b', 'c']);
  });

  it('aceita manter QUALQUER linha do caso, não só a sugerida', () => {
    expect(validarResolucao(caso, 'c', ['a', 'b']).ok).toBe(true);
  });

  // ⚠️ O pior estrago possível aqui. Quem PROTEGE de verdade são
  // `manter_na_lista_de_remover` e `linha_fora_do_caso` — a guarda
  // `removeria_todas` é backstop e hoje é inalcançável (ver o comentário dela
  // no util). Não afirmo que ela está mutation-testada.
  it('NUNCA remove todas: a pessoa sumiria do grupo', () => {
    const r = validarResolucao(caso, 'a', ['a', 'b', 'c']);
    expect(r.ok).toBe(false);
    expect(r.erro).toBe('manter_na_lista_de_remover');

    const r2 = validarResolucao([linha({ id: 'a' }), linha({ id: 'b' })], 'a', ['b', 'a']);
    expect(r2.ok).toBe(false);
  });

  // ⚠️ MUTANTE 2 — tela desatualizada apagando vínculo de outra pessoa.
  it('recusa id que não pertence ao caso', () => {
    const r = validarResolucao(caso, 'a', ['b', 'de-outra-pessoa']);
    expect(r.ok).toBe(false);
    expect(r.erro).toBe('linha_fora_do_caso');
  });

  it('recusa quando o caso já foi resolvido (sobrou 1 linha)', () => {
    const r = validarResolucao([linha({ id: 'a' })], 'a', ['b']);
    expect(r.ok).toBe(false);
    expect(r.erro).toBe('nao_ha_duplicata');
  });

  it('recusa manter_id que não está entre as linhas vivas', () => {
    const r = validarResolucao(caso, 'zzz', ['b']);
    expect(r.ok).toBe(false);
    expect(r.erro).toBe('manter_invalido');
  });

  it('recusa lista vazia de remoção', () => {
    expect(validarResolucao(caso, 'a', []).erro).toBe('nada_a_remover');
  });

  it('ids repetidos no payload não contam duas vezes', () => {
    const r = validarResolucao(caso, 'a', ['b', 'b', 'c']);
    expect(r.ok).toBe(true);
    expect(r.remover).toEqual(['b', 'c']);
  });
});
