// A régua de espera do registro de escaneamento do link curto.
//
// ⚠️⚠️ O CASO QUE ESTE ARQUIVO EXISTE PARA TRAVAR: o registro era
// fire-and-forget depois do `res.redirect()`, e a medição em produção
// (22/09/2026) mostrou **44 de 50 escaneamentos simultâneos gravados — 12%
// perdidos**. A perda só acontece sob concorrência, então ela é MAIOR no
// cartaz mais movimentado — exatamente o viés que inverteria a comparação
// "templo × feirinha" da campanha de voluntariado.
//
// ⚠️ E o teto existe para o defeito oposto: awaited sem teto transforma banco
// lento em câmera parada na mão de quem escaneou um cartaz no meio do culto.
import { describe, it, expect, vi } from 'vitest';
const { esperarRegistro, TETO_REGISTRO_MS } = require('../../backend/utils/registroAcesso');

/** Uma promessa que resolve depois de `ms`, como um insert lento. */
const lenta = <T,>(ms: number, valor: T) =>
  new Promise<T>((r) => setTimeout(() => r(valor), ms));

describe('esperarRegistro · o insert é esperado', () => {
  it('insert que dá certo devolve "gravado"', async () => {
    expect(await esperarRegistro(Promise.resolve({ error: null }))).toBe('gravado');
  });

  it('⚠️⚠️ ERRO DO POSTGREST não passa por gravado', async () => {
    // O supabase-js NÃO rejeita em erro de banco — devolve `{ error }`. Quem
    // tratar só o catch conta como sucesso um insert que o banco recusou, e a
    // contagem fica alta sem ninguém perceber.
    expect(await esperarRegistro(Promise.resolve({ error: { message: 'x' } }))).toBe('erro');
  });

  it('promessa rejeitada devolve "erro", nunca lança', async () => {
    await expect(esperarRegistro(Promise.reject(new Error('rede')))).resolves.toBe('erro');
  });

  it('espera de verdade: insert que demora 120ms ainda é gravado', async () => {
    // Este é o caso REAL: o insert medido leva ~100ms. Se a régua não
    // esperasse, a perda de 12% continuaria igual.
    expect(await esperarRegistro(lenta(120, { error: null }), 800)).toBe('gravado');
  });
});

describe('⚠️ o teto protege quem escaneou', () => {
  it('insert mais lento que o teto devolve "timeout" e libera', async () => {
    const t0 = Date.now();
    const r = await esperarRegistro(lenta(5000, { error: null }), 60);
    expect(r).toBe('timeout');
    // Liberou perto do teto, não perto dos 5s do insert.
    expect(Date.now() - t0).toBeLessThan(1500);
  });

  it('⚠️⚠️ teto INVÁLIDO cai no default, nunca em zero', async () => {
    // `setTimeout(fn, NaN)` dispara IMEDIATAMENTE: com teto NaN o await vira
    // no-op e a perda de 12% volta em silêncio, sem erro nenhum.
    expect(await esperarRegistro(lenta(80, { error: null }), Number('abc'))).toBe('gravado');
    expect(await esperarRegistro(lenta(80, { error: null }), 0)).toBe('gravado');
    expect(await esperarRegistro(lenta(80, { error: null }), -5)).toBe('gravado');
  });

  it('o teto padrão é generoso o bastante para o insert medido (~100ms)', () => {
    expect(TETO_REGISTRO_MS).toBeGreaterThanOrEqual(500);
  });

  it('⚠️ não deixa o timer pendurado depois que o insert responde', async () => {
    // ⚠️⚠️ ESTE TESTE JÁ NASCEU ERRADO UMA VEZ: a primeira versão media
    // `Date.now()` e o mutante que apaga o `clearTimeout` SOBREVIVEU — o
    // `await` retorna quando a corrida resolve, esteja o timer pendurado ou
    // não. O tempo não observa a guarda; a CONTAGEM DE TIMERS observa.
    //
    // Importa porque numa função serverless um timer pendente mantém o
    // event loop vivo — é o oposto do que esta régua existe para fazer.
    vi.useFakeTimers();
    try {
      const r = await esperarRegistro(Promise.resolve({ error: null }), 3000);
      expect(r).toBe('gravado');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('⚠️ nunca derruba quem escaneou', () => {
  it('valor que não é promessa não quebra', async () => {
    expect(await esperarRegistro(null)).toBe('sem_promessa');
    expect(await esperarRegistro(undefined)).toBe('sem_promessa');
    expect(await esperarRegistro(42 as any)).toBe('sem_promessa');
    expect(await esperarRegistro({ nao: 'e uma promessa' } as any)).toBe('sem_promessa');
  });

  it('a função NUNCA rejeita, em nenhum caminho', async () => {
    const casos = [
      Promise.resolve({ error: null }),
      Promise.resolve({ error: { message: 'x' } }),
      Promise.reject(new Error('boom')),
      lenta(5000, { error: null }),
      null,
    ];
    for (const c of casos) {
      await expect(esperarRegistro(c as any, 40)).resolves.toBeTypeOf('string');
    }
  });
});

describe('⚠️⚠️ guarda estática · o registro não pode voltar a ser fire-and-forget', () => {
  const fs = require('fs');
  const path = require('path');
  const corpo: string = fs.readFileSync(
    path.join(__dirname, '../../backend/routes/redirecionador.js'),
    'utf8',
  );

  it('o redirecionador ESPERA o registro', () => {
    expect(corpo).toContain('await esperarRegistro(');
  });

  it('⚠️ o insert NÃO volta ao `.then(() => {}, () => {})`', () => {
    // Era literalmente esta linha que perdia 12% dos escaneamentos.
    expect(corpo).not.toMatch(/link_curto_acesso[\s\S]{0,400}?\.then\(\s*\(\)\s*=>\s*\{\s*\}/);
  });

  it('⚠️⚠️ o registro vem ANTES do redirect', () => {
    // Depois do `res.redirect()` o container congela — é o defeito original.
    const iRegistro = corpo.indexOf('await esperarRegistro(');
    const iRedirect = corpo.indexOf('res.redirect(302');
    expect(iRegistro).toBeGreaterThan(-1);
    expect(iRedirect).toBeGreaterThan(-1);
    expect(iRegistro).toBeLessThan(iRedirect);
  });
});
