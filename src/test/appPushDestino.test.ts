// Contrato de "para qual app vai o push" · 2026-08-20.
//
// ⚠️⚠️ POR QUE ESTE ARQUIVO EXISTE: `app_push_tokens` é UMA tabela para DOIS
// apps Expo, e `notificar()` (o aviso do ERP/staff) disparava para todos os
// tokens da pessoa — então quem usa os dois apps com a mesma conta recebia
// "inscrição no Next", "cadastro aprovado" e "falha de WhatsApp" no app de
// MEMBROS. Relato do Matheus em 20/08/2026.
//
// A invariante que este arquivo vigia: **push de staff NUNCA chega em token
// comprovadamente do app de membros** — e o inverso.
import { describe, it, expect } from 'vitest';
import {
  APP_MEMBROS,
  APP_STAFF,
  projetoDoToken,
  ehDoApp,
  filtrarPorApp,
  contarSemCarimbo,
} from '../../backend/utils/appPushDestino.js';

const membros = { token: 'ExponentPushToken[m]', projeto_id: APP_MEMBROS };
const staff = { token: 'ExponentPushToken[s]', projeto_id: APP_STAFF };
const semCarimbo = { token: 'ExponentPushToken[?]', projeto_id: null };

describe('filtrarPorApp', () => {
  it('⚠️ aviso de STAFF nunca vai pro token do app de MEMBROS — é a invariante', () => {
    const r = filtrarPorApp([membros, staff, semCarimbo], 'staff');
    expect(r).not.toContain(membros);
    expect(r).toContain(staff);
  });

  it('⚠️ aviso de MEMBROS nunca vai pro token do app do STAFF', () => {
    const r = filtrarPorApp([membros, staff, semCarimbo], 'membros');
    expect(r).not.toContain(staff);
    expect(r).toContain(membros);
  });

  it('⚠️ token SEM CARIMBO continua recebendo nos dois lados — lista branca derrubaria o staff todo', () => {
    expect(filtrarPorApp([semCarimbo], 'staff')).toEqual([semCarimbo]);
    expect(filtrarPorApp([semCarimbo], 'membros')).toEqual([semCarimbo]);
  });

  it('o caso real de 20/08: conta do ERP com token do app de membros carimbado', () => {
    const daConta = [
      { token: 'ios-membros', projeto_id: APP_MEMBROS }, // 17:11
      { token: 'ios-staff', projeto_id: null }, // 13:29
      { token: 'android-staff', projeto_id: null }, // 15:20
    ];
    const r = filtrarPorApp(daConta, 'staff');
    expect(r.map((t) => t.token)).toEqual(['ios-staff', 'android-staff']);
  });

  it('tolera caixa e espaço no uuid (o banco devolve minúsculo, mas não dependemos disso)', () => {
    const gritado = { token: 'x', projeto_id: `  ${APP_MEMBROS.toUpperCase()}  ` };
    expect(filtrarPorApp([gritado], 'staff')).toEqual([]);
    expect(filtrarPorApp([gritado], 'membros')).toEqual([gritado]);
  });

  it('projeto DESCONHECIDO (app futuro) não é excluído de ninguém', () => {
    const outro = { token: 'x', projeto_id: '00000000-0000-0000-0000-000000000000' };
    expect(filtrarPorApp([outro], 'staff')).toEqual([outro]);
    expect(filtrarPorApp([outro], 'membros')).toEqual([outro]);
  });

  it('alvo inválido NÃO filtra nada — chamador errado não pode silenciar push', () => {
    const todos = [membros, staff, semCarimbo];
    expect(filtrarPorApp(todos, 'nada' as never)).toEqual(todos);
    expect(filtrarPorApp(todos, undefined as never)).toEqual(todos);
  });

  it('entrada vazia/inválida devolve lista vazia, nunca quebra', () => {
    expect(filtrarPorApp([], 'staff')).toEqual([]);
    expect(filtrarPorApp(null as never, 'staff')).toEqual([]);
    expect(filtrarPorApp(undefined as never, 'membros')).toEqual([]);
  });

  it('não inventa e não perde token: o resultado é subconjunto da entrada', () => {
    const todos = [membros, staff, semCarimbo];
    for (const alvo of ['staff', 'membros'] as const) {
      const r = filtrarPorApp(todos, alvo);
      expect(r.length).toBeLessThanOrEqual(todos.length);
      for (const t of r) expect(todos).toContain(t);
    }
  });

  it('⚠️ os dois ids são DIFERENTES — colar o mesmo faria o filtro apagar tudo', () => {
    expect(APP_MEMBROS).not.toBe(APP_STAFF);
    expect(filtrarPorApp([membros, staff], 'staff')).toHaveLength(1);
    expect(filtrarPorApp([membros, staff], 'membros')).toHaveLength(1);
  });
});

describe('projetoDoToken / ehDoApp', () => {
  it('vazio, espaço e nulo contam como SEM CARIMBO', () => {
    for (const v of [null, undefined, '', '   ']) {
      expect(projetoDoToken({ projeto_id: v as never })).toBeNull();
    }
    expect(projetoDoToken(null as never)).toBeNull();
  });

  it('sem carimbo NÃO é "do app" — é desconhecido', () => {
    expect(ehDoApp(semCarimbo, 'staff')).toBe(false);
    expect(ehDoApp(semCarimbo, 'membros')).toBe(false);
    expect(ehDoApp(membros, 'membros')).toBe(true);
    expect(ehDoApp(membros, 'staff')).toBe(false);
    expect(ehDoApp(staff, 'nada' as never)).toBe(false);
  });
});

describe('contarSemCarimbo', () => {
  it('mede o resíduo declarado', () => {
    expect(contarSemCarimbo([membros, staff, semCarimbo, semCarimbo])).toBe(2);
    expect(contarSemCarimbo([])).toBe(0);
    expect(contarSemCarimbo(null as never)).toBe(0);
  });
});
