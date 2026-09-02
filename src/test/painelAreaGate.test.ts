// ============================================================================
// Guarda · os painéis de ÁREA são gateados pelo PRÓPRIO módulo
// ============================================================================
// ⚠️ Incidente de 02/09/2026: a Renata (coordenadora do Online, com a área
// Online e nível 5 no módulo `online` por boost) NÃO via a aba do Online.
// Causa: tanto a rota quanto o item de menu gateavam `/online` por
// `canMembresia` — a permissão do módulo MEMBRESIA — e
// `canAccessModule(nomes, 'leitura', 2)` tem MÍNIMO 2 por padrão. Ela tem
// membresia = 1, então `canMembresia === false` e o deny estrito do menu
// escondia o item. Os irmãos (/kids, /ami, /bridge) sempre usaram o próprio
// módulo; o Online era o único fora do padrão.
//
// ⚠️ E o conserto NÃO podia ser dar membresia >= 2 pra ela: isso entregaria à
// coordenadora do Online a leitura da membresia inteira (nome, CPF, telefone
// de toda a igreja) pra ela ver um painel de YouTube.
// ============================================================================
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const raiz = resolve(__dirname, '../..');
const app = readFileSync(resolve(raiz, 'src/App.tsx'), 'utf8');
const shell = readFileSync(resolve(raiz, 'src/components/layout/AppShell.jsx'), 'utf8');

// ⚠️ comentário fora dos dois lados: este arquivo CITA o código errado na
// explicação acima, e sem limpar o comentário ele seria a própria evidência
// (armadilha de 06/08, que já mordeu duas vezes nesta casa).
function semComentarios(src: string) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((l) => l.replace(/(^|[^:])\/\/[^\n]*$/, '$1'))
    .join('\n');
}

const APP = semComentarios(app);
const SHELL = semComentarios(shell);

// painel de área -> slug do módulo que manda nele
const PAINEIS: Array<[string, string]> = [
  ['/online', 'online'],
  ['/kids', 'kids'],
  ['/ami', 'ami'],
  ['/bridge', 'bridge'],
];

describe('painéis de área · rota', () => {
  for (const [path, slug] of PAINEIS) {
    it(`${path} é gateado por moduleSlug="${slug}"`, () => {
      const re = new RegExp(`<Route path="${path}" element=\\{<ModuleGuard moduleSlug="${slug}"`);
      expect(APP).toMatch(re);
    });

    it(`${path} NÃO é gateado por permKey (permissão de outro módulo)`, () => {
      const linha = APP.split('\n').find((l) => l.includes(`path="${path}"`)) || '';
      expect(linha).not.toMatch(/permKey=/);
    });
  }
});

describe('painéis de área · item de menu', () => {
  for (const [path, slug] of PAINEIS) {
    const linha = SHELL.split('\n').find((l) => l.includes(`path: '${path}'`)) || '';

    it(`o item ${path} existe no menu`, () => {
      expect(linha).not.toBe('');
    });

    it(`o item ${path} declara module: '${slug}'`, () => {
      expect(linha).toContain(`module: '${slug}'`);
    });

    it(`⚠️ o item ${path} não é escondido por canMembresia`, () => {
      // `perm` no menu é DENY ESTRITO: `auth[item.perm] === false` esconde o
      // item. Apontar pra membresia esconde de quem tem o módulo da área.
      expect(linha).not.toContain("perm: 'canMembresia'");
    });
  }
});
