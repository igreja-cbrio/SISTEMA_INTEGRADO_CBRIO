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
  // ⚠️⚠️ Bloco `/* */` é removido SÓ quando abre e fecha na MESMA linha.
  // Um regex multilinha (`/\/\*[\s\S]*?\*\//g`) COME TRECHOS DO ARQUIVO aqui:
  // `App.tsx` tem `path="/ministerial/voluntariado/*"` — um `/*` literal dentro
  // de uma string de rota — que pareia com o `*/` do próximo comentário JSX e
  // engole tudo no meio (medido em 02/09: as 2 rotas da Membresia
  // desapareciam e o assert virava falso-negativo). Nestes dois arquivos todo
  // comentário de bloco é de uma linha, então isto basta e é seguro.
  return src
    .split('\n')
    .map((l) => l.replace(/\/\*.*?\*\//g, ' '))
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

// ============================================================================
// ⚠️⚠️ `canMembresia` só pode gatear a MEMBRESIA (2026-09-02)
// ============================================================================
// `perm` no menu é DENY ESTRITO e `canAccessModule(nomes,'leitura',2)` tem
// mínimo 2 — então apontar `canMembresia` num item de OUTRO módulo esconde o
// item de quem tem o módulo daquele item e `membresia` < 2. Foi o que escondeu
// a aba do Online da coordenadora do Online, e o que mandava coordenador de
// voluntariado pro /dashboard.
// ⚠️ Medido em 02/09: 22 cargos têm `voluntariado` >= 1 com `membresia` < 2
// (20 em integracao, 20 em grupos) — e ZERO cargos têm `membresia` >= 2 sem
// `voluntariado`, então trocar o deny não estreitou o acesso de ninguém.
// ============================================================================
describe('canMembresia só gateia a Membresia', () => {
  const linhasComPerm = SHELL.split('\n').filter((l) => l.includes("perm: 'canMembresia'"));

  it('todo item que usa canMembresia é da própria Membresia', () => {
    const forasteiros = linhasComPerm.filter((l) => !l.includes("path: '/ministerial/membresia"));
    expect(forasteiros).toEqual([]);
  });

  it('os itens de área declaram o próprio módulo', () => {
    for (const [path, slug] of [
      ['/ministerial/voluntariado', 'voluntariado'],
      ['/ministerial/integracao', 'integracao'],
      ['/grupos', 'grupos'],
    ] as Array<[string, string]>) {
      const linha = SHELL.split('\n').find((l) => l.includes(`path: '${path}'`)) || '';
      expect(linha, path).toContain(`module: '${slug}'`);
      expect(linha, path).not.toContain("perm: 'canMembresia'");
    }
  });

  it('⚠️ o VoluntariadoGuard não decide por canMembresia', () => {
    const i = APP.indexOf('function VoluntariadoGuard');
    expect(i).toBeGreaterThan(-1);
    const corpo = APP.slice(i, i + 900);
    expect(corpo).not.toContain('canMembresia');
    expect(corpo).toContain("'voluntariado'");
    // não pode redirecionar antes das permissões carregarem
    expect(corpo).toContain('auth.modulePerms');
  });

  it('as rotas da Membresia SEGUEM em canMembresia (é o módulo delas)', () => {
    const linhas = APP.split('\n').filter((l) => l.includes('path="/ministerial/membresia'));
    expect(linhas.length).toBeGreaterThan(0);
    for (const l of linhas) expect(l).toContain('permKey="canMembresia"');
  });
});
