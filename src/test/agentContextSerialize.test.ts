import { describe, it, expect } from 'vitest';

// @ts-expect-error módulo JS sem tipos
import { serializeContext } from '../../backend/services/agentContext.js';

/**
 * O corte de tamanho do contexto do assistente.
 *
 * ⚠️ O bug que estes testes travam: `slice()` cego no JSON inteiro cortava por
 * ordem de inserção, e `cerebro_vault` — o resultado da busca no Cérebro — é o
 * ÚLTIMO campo inserido. A busca rodava, gastava consulta, e era a primeira
 * coisa descartada. Pior: cortar JSON no meio entrega ao modelo um objeto
 * inválido junto com a instrução "responda SOMENTE com base no contexto".
 */

function ctxGrande(comBusca: boolean) {
  const modulos: Record<string, unknown> = {};
  // 20 módulos com carga suficiente para estourar qualquer teto razoável.
  for (let i = 0; i < 20; i++) {
    modulos[`modulo_${i}`] = { linhas: Array.from({ length: 60 }, (_, j) => `registro ${i}-${j} com texto de enchimento`) };
  }
  const ctx: Record<string, unknown> = {
    sistema: 'CBRio ERP — documento do sistema',
    usuario: { nome: 'Fulano', role: 'assistente' },
    modulos_disponiveis: Object.keys(modulos),
    modulos,
  };
  if (comBusca) {
    ctx.conhecimento_sistema = { total: 1, itens: [{ titulo: 'NSM', conteudo: 'o que é a NSM' }] };
    ctx.cerebro_vault = { total: 1, notas: [{ titulo: 'Ata de março', note_path: 'gestao/ata.md' }] };
  }
  return ctx;
}

describe('serializeContext · o corte preserva o que a busca achou', () => {
  it('cabendo no teto, devolve o JSON inteiro (sem mudança de comportamento)', () => {
    const pequeno = { sistema: 'doc', modulos: { a: 1 } };
    const out = serializeContext(pequeno, 24000);
    expect(JSON.parse(out)).toEqual(pequeno);
  });

  it('estourando, o resultado da busca SOBREVIVE ao corte', () => {
    const out = serializeContext(ctxGrande(true), 6000);
    expect(out).toContain('cerebro_vault');
    expect(out).toContain('Ata de março');
    expect(out).toContain('conhecimento_sistema');
  });

  it('e o que sai continua sendo JSON válido', () => {
    const out = serializeContext(ctxGrande(true), 6000);
    const semAviso = out.split('\n... (')[0];
    expect(() => JSON.parse(semAviso)).not.toThrow();
    // A prova de que o corte foi por MÓDULO INTEIRO, não no meio da string.
    const parsed = JSON.parse(semAviso);
    expect(Object.keys(parsed.modulos).length).toBeLessThan(20);
  });

  it('respeita o teto pedido', () => {
    const out = serializeContext(ctxGrande(true), 6000);
    expect(out.length).toBeLessThanOrEqual(6000 + 200); // + a linha de aviso
  });

  it('teto minúsculo: devolve só o preservado, ainda válido', () => {
    const out = serializeContext(ctxGrande(true), 300);
    const semAviso = out.split('\n... (')[0];
    expect(() => JSON.parse(semAviso)).not.toThrow();
    expect(semAviso).toContain('cerebro_vault');
  });

  it('AUDITORES: sem busca no contexto, o comportamento é o antigo, idêntico', () => {
    // systemAuditor/moduleAuditor chamam buildContext sem `options.query`, então
    // não têm cerebro_vault nem conhecimento_sistema. Este caso precisa continuar
    // batendo byte a byte com o slice() original — é a garantia de zero regressão.
    const ctx = ctxGrande(false);
    const antigo = JSON.stringify(ctx, null, 2).slice(0, 24000)
      + '\n... (contexto truncado por limite de tamanho)';
    expect(serializeContext(ctx, 24000)).toBe(antigo);
  });
});
