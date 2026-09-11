import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * ════════════════════════════════════════════════════════════════════════════
 *  O BUG QUE ISTO GUARDA (medido no totem em 11/09/2026)
 *
 *  A tela chamava `totemKids.reservarCodigos(...)`, mas a função mora em
 *  `totemKids.checkin.reservarCodigos` (`src/api.js`). O resultado NÃO é um
 *  erro de rede: é `TypeError: ... is not a function` lançado ANTES de
 *  qualquer fetch — o pedido nunca saiu do navegador.
 *
 *  ⚠️⚠️ Por isso passou 9 dias invisível (02/09 → 11/09): o `catch` engolia o
 *  TypeError junto com as quedas de rede, a barra dizia "0 códigos" e a tabela
 *  `kids_codigos_reservados` ficou VAZIA desde o dia em que nasceu — a rede de
 *  segurança do check-in offline NUNCA foi armada uma única vez.
 *
 *  ⚠️ E nada mais pega isso: `src/api.js` é JavaScript e `allowJs` está
 *  DESLIGADO no `tsconfig.app.json`, então o módulo entra no typecheck como
 *  `any` e caminho errado não acusa. O teste é de TEXTO de propósito — importar
 *  `@/api` aqui subiria o cliente Supabase inteiro.
 * ════════════════════════════════════════════════════════════════════════════
 */

const raiz = resolve(__dirname, '..', '..');
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf8');

describe('reservarCodigos · o caminho da chamada tem que existir de verdade', () => {
  it('a API define reservarCodigos DENTRO de totemKids.checkin', () => {
    const api = ler('src/api.js');
    const totem = api.slice(api.indexOf('export const totemKids = {'));
    const checkin = totem.slice(totem.indexOf('\n  checkin: {'));
    const fimDoCheckin = checkin.indexOf('\n  },');
    expect(fimDoCheckin).toBeGreaterThan(0);
    expect(checkin.slice(0, fimDoCheckin)).toContain('reservarCodigos:');
  });

  it('⚠️ o totem chama pelo caminho COMPLETO (totemKids.checkin.reservarCodigos)', () => {
    const tela = ler('src/pages/ministerial/totemKids/TotemKidsCheckin.tsx');
    expect(tela).toContain('totemKids.checkin.reservarCodigos(');
  });

  it('⚠️⚠️ e NUNCA pelo caminho curto, que é undefined e lança antes do fetch', () => {
    const tela = ler('src/pages/ministerial/totemKids/TotemKidsCheckin.tsx');
    // `totemKids.reservarCodigos(` sem o `.checkin` no meio — o bug de 02/09.
    expect(tela).not.toMatch(/totemKids\.reservarCodigos\s*\(/);
  });
});
