import { describe, it, expect } from 'vitest';
import { lotesDePush, tokenMorreu, MAX_POR_REQUEST } from '../../backend/utils/pushLotes.js';

// ⚠️⚠️ ESTE ARQUIVO É GÊMEO do bloco "lotesDePush" em
// `Aplicativo-CBRio/test/reguas.test.ts`. Os CASOS têm que ser os mesmos: os
// dois remetentes escrevem na MESMA `app_push_tokens` e falam com o MESMO
// serviço da Expo. Se as duas réguas divergirem, um dos lados volta a montar
// request misto e o erro reaparece só METADE das vezes — pior de achar que o
// bug original. Mudou aqui, confira lá.
//
// O que isto protege (medido em 07/08, `system_mobile_push_tickets`):
//   1.820 tickets · 19 aceitos · 1.801 em erro (98,9%)
//   1.773 deles com PUSH_TOO_MANY_EXPERIENCE_IDS
// A Expo recusa o REQUEST INTEIRO quando tokens de projetos diferentes vão
// juntos — um token do app Staff derrubava a entrega dos 30 tokens iOS válidos
// do app de membros.

const T = (token: string, projeto_id?: string | null) => ({ token, projeto_id });

describe('lotesDePush · nunca misturar projeto no mesmo request', () => {
  it('⚠️ MUTATION GUARD · projetos diferentes NUNCA no mesmo lote', () => {
    const lotes = lotesDePush([T('a', 'membros'), T('b', 'staff'), T('c', 'membros')]);
    for (const lote of lotes) {
      expect(new Set(lote.map((t: any) => t.projeto_id)).size).toBe(1);
    }
    expect(lotes.length).toBe(2);
  });

  it('⚠️ MUTATION GUARD · token de projeto DESCONHECIDO vai SOZINHO', () => {
    // Os 30 tokens de hoje têm projeto NULL. Agrupá-los reproduziria o bug com
    // outro nome — são justamente os de origem ambígua.
    const lotes = lotesDePush([T('a', null), T('b'), T('c', '   ')]);
    expect(lotes.every((l: any[]) => l.length === 1)).toBe(true);
    expect(lotes.length).toBe(3);
  });

  it('respeita o teto de 100 por request dentro do MESMO projeto', () => {
    const muitos = Array.from({ length: 250 }, (_, i) => T(`t${i}`, 'membros'));
    expect(lotesDePush(muitos).map((l: any[]) => l.length)).toEqual([100, 100, 50]);
    expect(MAX_POR_REQUEST).toBe(100);
  });

  it('mistura real: conhecidos agrupados, desconhecidos um a um', () => {
    const lotes = lotesDePush([
      T('m1', 'membros'), T('velho1', null), T('s1', 'staff'),
      T('m2', 'membros'), T('velho2', null),
    ]);
    expect(lotes.length).toBe(4);
    expect(lotes[0].map((t: any) => t.token)).toEqual(['m1', 'm2']);
    expect(lotes[1].map((t: any) => t.token)).toEqual(['s1']);
    expect(lotes.slice(2).every((l: any[]) => l.length === 1)).toBe(true);
  });

  it('deduplica por token (o mesmo aparelho não recebe 2 notificações)', () => {
    const lotes = lotesDePush([T('a', 'm'), T('a', 'm'), T(' a ', 'm'), T('b', 'm')]);
    expect(lotes.length).toBe(1);
    expect(lotes[0].map((t: any) => t.token)).toEqual(['a', 'b']);
  });

  it('ignora token vazio e entrada degenerada sem explodir', () => {
    expect(lotesDePush([])).toEqual([]);
    expect(lotesDePush(null)).toEqual([]);
    expect(lotesDePush(undefined)).toEqual([]);
    expect(lotesDePush([T(''), T('   ')])).toEqual([]);
    expect(lotesDePush([T('a', 'm')], 0).length).toBe(1);
  });

  it('é determinístico na ordem (projetos ordenados)', () => {
    const a = lotesDePush([T('x', 'zeta'), T('y', 'alfa')]);
    const b = lotesDePush([T('y', 'alfa'), T('x', 'zeta')]);
    expect(a).toEqual(b);
    expect(a[0][0].projeto_id).toBe('alfa');
  });
});

describe('tokenMorreu · só apaga o que é realmente permanente', () => {
  it('⚠️ MUTATION GUARD · NÃO apaga por erro de LOTE', () => {
    // Apagar por PUSH_TOO_MANY_EXPERIENCE_IDS teria zerado a tabela: 1.773
    // tickets com esse código, e a culpa era do request, não do token.
    for (const c of ['PUSH_TOO_MANY_EXPERIENCE_IDS', 'MessageRateExceeded',
      'MessageTooBig', 'HTTP_500', 'NETWORK_ERROR', '', null, undefined]) {
      expect(tokenMorreu(c)).toBe(false);
    }
  });

  it('apaga o token de app desinstalado', () => {
    expect(tokenMorreu('DeviceNotRegistered')).toBe(true);
    expect(tokenMorreu('  DeviceNotRegistered  ')).toBe(true);
  });
});
