import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * ⚠️⚠️ POR QUE ESTE TESTE EXISTE (20/08/2026)
 *
 * `backend/routes/jornada.js` não tinha NENHUM `authorize`/`authorizeModule` —
 * só `router.use(authenticate)`. Logo `/membros`, `/membro/:id` e `/cruzar`,
 * que devolvem LISTA DE PESSOAS com nome, e-mail, telefone e status,
 * respondiam a QUALQUER conta autenticada: medido, **163 contas ativas, das
 * quais 100 são `is_membro_only` do app de membros**.
 *
 * O guard existia só no FRONTEND (`isAdmin` dentro de CruzamentosPessoas.jsx),
 * que não protege a API — quem montasse a requisição na mão passava.
 *
 * E a leva de 20/08 AMPLIOU o vazamento sem perceber: ao acrescentar critérios
 * de batismo/NEXT/conversão, a RPC `cruzar_pessoas` passou a devolver
 * `is_batizado`, `batizado_em`, `fez_next` e `convertido_em` — data de batismo e
 * de conversão são convicção religiosa, categoria especial da LGPD (art. 11).
 *
 * A verificação é por TEXTO porque importar `jornada.js` puxaria
 * `utils/supabase` e o gate roda sem as dependências de `backend/`.
 */
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** ⚠️ Tira comentário antes de casar: sem isso, o comentário que EXPLICA o guard
 *  conta como guard. É a armadilha já registrada duas vezes neste repo (06/08),
 *  e nas duas o falso positivo foi a documentação do próprio conserto. */
function semComentarios(src: string) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|[^:'"`\\])\/\/[^\n]*$/, '$1'))
    .join('\n');
}

const src = semComentarios(readFileSync(path.join(RAIZ, 'backend/routes/jornada.js'), 'utf8'));

/** Rotas de `jornada.js` que devolvem PESSOA e por isso não podem ficar só com
 *  `authenticate`. Rota nova que liste gente entra aqui. */
const ROTAS_COM_PII: Array<[string, string]> = [
  ["router.get('/membros'", 'lista de membros com nome/e-mail/telefone'],
  ["router.get('/membro/:id'", 'ficha de uma pessoa'],
  ["router.post('/cruzar'", 'cruzamento — até 500 pessoas por chamada, com batismo e conversão'],
  ["router.post('/refresh-papeis'", 'refresh da matview de pessoas'],
];

describe('⚠️⚠️ jornada · rota que devolve PESSOA exige módulo, não só login', () => {
  for (const [decl, oQueVaza] of ROTAS_COM_PII) {
    it(`${decl} está guardada (${oQueVaza})`, () => {
      const i = src.indexOf(decl);
      expect(i, `${decl} não existe mais — se a rota foi renomeada, atualizar ESTE teste`).toBeGreaterThan(-1);
      // O middleware tem de estar na PRÓPRIA declaração da rota, entre o caminho
      // e o handler. Guard no `router.use` não serve aqui: `/dashboard` e
      // `/visao` são agregados e alimentam o /painel, que é aberto a qualquer
      // autenticado de propósito.
      const declaracao = src.slice(i, i + 200);
      expect(declaracao, `${decl} está SEM guard de módulo`).toMatch(/soQuemCuidaDeGente|authorizeModule/);
    });
  }

  it('o guard usa a routeKey ESTREITA `membresia`, não a ampla `membros`', () => {
    // ⚠️ `ROUTE_MODULE_MAP['membros']` mapeia DOZE módulos (grupos, kids, online,
    // face…), então `authorizeModule('membros', 2)` deixaria passar quem tem
    // nível 2 em qualquer um deles. Para lista de PII isso é amplo demais.
    expect(src).toContain("authorizeModule('membresia', 2)");
    expect(src).not.toContain("authorizeModule('membros'");
  });

  it('⚠️ a routeKey do guard EXISTE no ROUTE_MODULE_MAP', () => {
    // Lei do projeto: routeKey fora do mapa faz `authorizeModule` cair no nível
    // padrão do CARGO e DESLIGA a matriz em silêncio (caso `links`, 17/08).
    //
    // ⚠️ A ORDEM importa: extrai o bloco do texto CRU e só depois limpa
    // comentário. Limpar antes quebrava o fecho `\n};` do objeto e o match
    // falhava — mas limpar é necessário, senão uma chave COMENTADA passaria
    // como se estivesse ativa.
    const auth = readFileSync(path.join(RAIZ, 'backend/middleware/auth.js'), 'utf8');
    const bloco = auth.match(/const\s+ROUTE_MODULE_MAP\s*=\s*\{([\s\S]*?)\n\};/);
    expect(bloco, 'ROUTE_MODULE_MAP não encontrado — a forma mudou').toBeTruthy();
    expect(semComentarios(bloco![1])).toMatch(/['"]membresia['"]\s*:/);
  });

  it('`/dashboard` e `/visao` seguem ABERTAS — são agregados do /painel', () => {
    // Guardá-las seria quebrar o painel, que é lido por qualquer autenticado
    // por decisão. Se um dia passarem a devolver pessoa, entram na lista acima.
    for (const decl of ["router.get('/dashboard'", "router.get('/visao'"]) {
      const i = src.indexOf(decl);
      expect(i).toBeGreaterThan(-1);
      expect(src.slice(i, i + 200)).not.toMatch(/soQuemCuidaDeGente|authorizeModule/);
    }
  });

  it('o cron continua fora do authenticate (Vercel chama sem login)', () => {
    expect(src).toMatch(/router\.get\('\/cron\/refresh-papeis',\s*autorizaCron/);
    expect(src.indexOf("router.get('/cron/refresh-papeis'"))
      .toBeLessThan(src.indexOf('router.use(authenticate)'));
  });
});

describe('a tela espelha o servidor, e está no menu', () => {
  const tela = readFileSync(path.join(RAIZ, 'src/pages/admin/CruzamentosPessoas.jsx'), 'utf8');
  const shell = readFileSync(path.join(RAIZ, 'src/components/layout/AppShell.jsx'), 'utf8');
  const busca = readFileSync(path.join(RAIZ, 'src/components/ui/command-search.tsx'), 'utf8');

  it('a tela usa canAccessModule, não profile.role', () => {
    expect(tela).toContain("canAccessModule(['membresia'], 'leitura', 2)");
    expect(tela).not.toMatch(/\['admin',\s*'diretor'\]\.includes\(profile\?\.role\)/);
  });

  it('⚠️ está no mega-menu — tela fora do menu é tela invisível', () => {
    // Foi exatamente o que aconteceu: a tela existia desde maio, ganhou
    // critérios novos em 20/08, e o Matheus perguntou onde a funcionalidade
    // estava porque não havia como chegar nela clicando.
    expect(shell).toContain("path: '/admin/cruzamentos'");
    expect(shell).toMatch(/path: '\/admin\/cruzamentos', module: 'membresia'/);
  });

  it('está também na busca ⌘K — as duas listas são espelhos', () => {
    expect(busca).toContain("path: '/admin/cruzamentos'");
    expect(busca).toContain("module: 'membresia'");
  });

  it('⚠️ "Jornada da Igreja" também é gated — ela lista pessoas', () => {
    expect(shell).toMatch(/path: '\/jornada', module: 'membresia'/);
  });
});
