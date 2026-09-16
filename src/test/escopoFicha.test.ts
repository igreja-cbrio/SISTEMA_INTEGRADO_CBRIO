import { describe, it, expect } from 'vitest';
import { resolverEscopoFicha, isEscopoBasico, ESCOPO_BASICO } from '../../backend/utils/escopoFicha.js';

describe('escopo da ficha · o básico corta o financeiro', () => {
  it('escopo basico corta mesmo com permissão total', () => {
    const r = resolverEscopoFicha({ escopo: 'basico', podeFinanceiro: true, podeMarcadorSensivel: true });
    expect(r.basico).toBe(true);
    expect(r.mostrarFinanceiro).toBe(false);
    expect(r.mostrarMarcadorSensivel).toBe(false);
  });

  it('sem escopo, quem tem permissão vê', () => {
    const r = resolverEscopoFicha({ podeFinanceiro: true, podeMarcadorSensivel: true });
    expect(r.basico).toBe(false);
    expect(r.mostrarFinanceiro).toBe(true);
    expect(r.mostrarMarcadorSensivel).toBe(true);
  });

  it('⚠️ o escopo só ESTREITA: sem permissão, escopo completo não destrava', () => {
    const r = resolverEscopoFicha({ escopo: 'completo', podeFinanceiro: false, podeMarcadorSensivel: false });
    expect(r.mostrarFinanceiro).toBe(false);
    expect(r.mostrarMarcadorSensivel).toBe(false);
  });

  it('⚠️ o marcador sensível segue a MESMA régua do bloco financeiro', () => {
    // Se este teste cair, o cabeçalho volta a entregar o que a aba escondeu.
    const r = resolverEscopoFicha({ escopo: 'basico', podeMarcadorSensivel: true });
    expect(r.mostrarMarcadorSensivel).toBe(false);
  });

  it('⚠️ FAIL-CLOSED: valor truthy que não é `true` não libera', () => {
    for (const v of [1, 'sim', 'true', {}, [], 'basico']) {
      expect(resolverEscopoFicha({ podeFinanceiro: v as any }).mostrarFinanceiro).toBe(false);
      expect(resolverEscopoFicha({ podeMarcadorSensivel: v as any }).mostrarMarcadorSensivel).toBe(false);
    }
  });

  it('⚠️ só o literal exato é básico — grafia diferente NÃO corta por acidente', () => {
    for (const v of ['Basico', 'BASICO', 'básico', ' basico', 'basic', '', null, undefined, 1, true]) {
      expect(isEscopoBasico(v as any)).toBe(false);
      // e o efeito prático: com permissão, continua mostrando
      expect(resolverEscopoFicha({ escopo: v as any, podeFinanceiro: true }).mostrarFinanceiro).toBe(true);
    }
    expect(isEscopoBasico(ESCOPO_BASICO)).toBe(true);
  });

  it('entrada ausente ou nula não explode e não libera nada', () => {
    for (const v of [undefined, null, {}]) {
      const r = resolverEscopoFicha(v as any);
      expect(r.mostrarFinanceiro).toBe(false);
      expect(r.mostrarMarcadorSensivel).toBe(false);
    }
  });
});
