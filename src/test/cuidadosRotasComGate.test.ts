import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guarda das rotas de `cuidados` que precisam de gate de MÓDULO.
 *
 * ⚠️⚠️ POR QUE ISTO EXISTE (achado A01 da varredura de 04–08/09/2026)
 * `backend/routes/cuidados.js` aplica só `router.use(authenticate)` na L15 —
 * quem decide o acesso é o `authorizeModule` de cada rota, e 23 das 60 não
 * tinham nenhum. Como `authenticate` só exige profile ativo, essas 23 eram
 * alcançadas por QUALQUER conta logada: o auth do Supabase é compartilhado
 * entre o app de membros e o ERP, então "autenticado" é a base inteira de
 * logins (138 das 201 contas ativas são membro-only, fiel comum sem cargo).
 *
 * O que estava aberto, medido: `GET /convertidos` devolvia até 2000 fichas de
 * `cui_convertidos` com nome, CPF, telefone, observação pastoral e tags de
 * triagem; `GET /acompanhamentos` até 500 fichas de aconselhamento com motivo
 * (luto, casal, saúde, financeiro); `PATCH /convertidos/:id` gravava
 * `req.body` cru; e `GET /buscar-membro` era oráculo de CPF.
 *
 * ⚠️ Este teste fixa as 23 que foram decididas no A01, para não regredirem.
 * Rota nova em `cuidados.js` NÃO entra aqui sozinha — o `it` final é que
 * garante que ninguém nasça sem gate.
 */

const ARQ = resolve(__dirname, '../../backend/routes/cuidados.js');
const ARQ_AUTH = resolve(__dirname, '../../backend/middleware/auth.js');

/**
 * ⚠️ COMENTÁRIO SAI ANTES DE CASAR. Os comentários deste arquivo e do próprio
 * `cuidados.js` CITAM as rotas na explicação — sem remover, o texto
 * explicativo vira a evidência e o teste passa com o gate ausente (armadilha
 * de 06/08/2026). Bloco só é removido quando abre e fecha na MESMA linha
 * (armadilha de 02/09/2026).
 */
function semComentarios(js: string): string {
  return js
    .split('\n')
    .map((l) => l.replace(/\/\*.*?\*\//g, ''))
    .map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1'))
    .join('\n');
}

const ROTAS_COM_GATE: Array<{
  metodo: string; caminho: string; chave: string; nivel: number; porque: string;
}> = [
  // ── leitura (nível 1) ──
  { metodo: 'get', caminho: '/dashboard', chave: 'cuidados', nivel: 1,
    porque: 'agregado de vw_cuidados_mensal; a tela já é condicionada a canCuidados' },
  { metodo: 'get', caminho: '/acompanhamentos', chave: 'cuidados', nivel: 1,
    porque: 'até 500 fichas de aconselhamento com nome, telefone e motivo (luto, casal, saúde)' },
  { metodo: 'get', caminho: '/jornada180', chave: 'cuidados', nivel: 1,
    porque: 'rota legada de cui_jornada180, que alimenta KPI e o /painel' },
  { metodo: 'get', caminho: '/convertidos/tags', chave: 'cuidados', nivel: 1,
    porque: 'constante sem PII, mas exceção sem gate é o que faz a próxima nascer aberta' },
  { metodo: 'get', caminho: '/convertidos/atendentes', chave: 'cuidados', nivel: 1,
    porque: 'nome e e-mail dos cargos pastorais — organograma de quem atende' },
  { metodo: 'get', caminho: '/convertidos', chave: 'cuidados', nivel: 1,
    porque: 'até 2000 fichas com nome, CPF, telefone, observação pastoral e tags de triagem' },
  { metodo: 'get', caminho: '/visitas-pendentes', chave: 'cuidados', nivel: 1,
    porque: 'fila de visitas com pessoa e endereço' },
  { metodo: 'get', caminho: '/agregado', chave: 'cuidados', nivel: 1,
    porque: 'leitura do agregado de atendimentos' },

  // ── escrita leve (nível 2) ──
  { metodo: 'get', caminho: '/buscar-membro', chave: 'cuidados', nivel: 2,
    porque: 'oráculo de CPF: confirma se uma pessoa está na base (mesmo padrão do B06 em pessoas.js)' },

  // ── criar, editar, apagar (nível 3) ──
  { metodo: 'post', caminho: '/acompanhamentos', chave: 'cuidados', nivel: 3,
    porque: 'cria ficha de aconselhamento' },
  { metodo: 'patch', caminho: '/acompanhamentos/:id', chave: 'cuidados', nivel: 3,
    porque: 'edita ficha de aconselhamento' },
  { metodo: 'delete', caminho: '/acompanhamentos/:id', chave: 'cuidados', nivel: 3,
    porque: 'apaga ficha de aconselhamento' },
  { metodo: 'post', caminho: '/jornada180', chave: 'cuidados', nivel: 3,
    porque: 'injeta encontro em cui_jornada180 — mexe no indicador do /painel' },
  { metodo: 'delete', caminho: '/jornada180/:id', chave: 'cuidados', nivel: 3,
    porque: 'apagar encontro derruba número do /painel' },
  { metodo: 'patch', caminho: '/convertidos/:id', chave: 'cuidados', nivel: 3,
    porque: 'edita a ficha do convertido; dava para falsificar o SLA de 3 dias' },
  { metodo: 'delete', caminho: '/convertidos/:id', chave: 'cuidados', nivel: 3,
    porque: 'cui_convertidos é fonte canônica do convertido no /painel e na NSM' },
  { metodo: 'post', caminho: '/convertidos/:id/agendar-encontro', chave: 'cuidados', nivel: 3,
    porque: 'marca encontro e notifica o pastor' },
  { metodo: 'post', caminho: '/convertidos/:id/cancelar-encontro', chave: 'cuidados', nivel: 3,
    porque: 'cancela encontro agendado' },
  { metodo: 'post', caminho: '/convertidos/:id/desfecho', chave: 'cuidados', nivel: 3,
    porque: 'fecha o acompanhamento e dispara encaminhamentos' },
  { metodo: 'post', caminho: '/agregado', chave: 'cuidados', nivel: 3,
    porque: 'grava o agregado de atendimentos' },
  { metodo: 'post', caminho: '/criar-membro', chave: 'cuidados', nivel: 3,
    porque: 'escrita em mem_membros (mesmo padrão do B06 em pessoas.js)' },

  // ── o painel de novos convertidos: chave ESTREITA, não a ampla `membros` ──
  { metodo: 'get', caminho: '/jornada-convertidos', chave: 'jornada-convertidos', nivel: 1,
    porque: 'lista nome, telefone e CPF; a tela é do líder de área (online, ami, bridge, kids), que não tem o módulo cuidados' },
  { metodo: 'post', caminho: '/convertidos/:id/registrar-contato', chave: 'jornada-convertidos', nivel: 1,
    porque: 'o botão vive no mesmo componente da lista — par obrigatório, senão o dono da tela vê e não age' },
];

describe('cuidados.js · rotas que precisam de authorizeModule', () => {
  const bruto = readFileSync(ARQ, 'utf8');
  const limpo = semComentarios(bruto);

  // Sanidade do próprio limpador: se ele comesse o arquivo, todo assert abaixo
  // passaria por vacuidade (asserção negativa sobre texto inexistente).
  it('o limpador de comentários não destrói o arquivo', () => {
    expect(limpo).toContain("router.get('/convertidos'");
    expect(limpo.length).toBeGreaterThan(bruto.length * 0.5);
  });

  for (const r of ROTAS_COM_GATE) {
    it(`${r.metodo.toUpperCase()} ${r.caminho} exige ${r.chave} >= ${r.nivel} — ${r.porque}`, () => {
      const linha = limpo
        .split('\n')
        .find((l) => l.includes(`router.${r.metodo}('${r.caminho}'`));
      expect(linha, `rota ${r.metodo.toUpperCase()} ${r.caminho} sumiu do arquivo`).toBeTruthy();
      expect(
        linha,
        `${r.metodo.toUpperCase()} ${r.caminho} ficou SEM o gate — ${r.porque}`,
      ).toContain(`authorizeModule('${r.chave}', ${r.nivel})`);
    });
  }

  it('NENHUMA rota do arquivo fica sem authorizeModule (é o que o A01 fechou)', () => {
    // A falha que este `it` existe pra impedir é silenciosa: rota nova nasce sem
    // gate, ninguém toma 403 indevido e portanto ninguém reclama — foi assim que
    // as 23 passaram despercebidas. Se uma rota nova precisar mesmo ficar aberta,
    // a exceção entra aqui NOMEADA, com o porquê.
    const semGate = limpo
      .split('\n')
      .filter((l) => /^router\.(get|post|put|patch|delete)\(/.test(l))
      .filter((l) => !l.includes('authorizeModule('));
    expect(semGate, `rotas sem gate:\n${semGate.join('\n')}`).toEqual([]);
  });

  it('o arquivo continua sem gate global (o gate é por rota — não relaxar)', () => {
    // `router.use(authorizeModule(...))` quebraria o agregado que alimenta o
    // /painel — a lei registrada em backend/routes/jornada.js:52-55.
    expect(limpo).not.toMatch(/router\.use\(\s*authorizeModule/);
  });

  it('a routeKey estreita `jornada-convertidos` existe no ROUTE_MODULE_MAP', () => {
    // Lei de 17/08/2026: routeKey fora do mapa faz `authorizeModule` cair no
    // nível padrão do CARGO e a matriz deixa de valer, em silêncio.
    const auth = semComentarios(readFileSync(ARQ_AUTH, 'utf8'));
    expect(auth).toMatch(/'jornada-convertidos'\s*:\s*\[/);
  });

  it('a lista de PII do painel de convertidos NÃO usa a routeKey ampla `membros`', () => {
    // Mesma régua de src/test/jornadaPiiGuard.test.ts: `membros` mapeia DOZE
    // módulos (inclui produção, marketing, face), largo demais para uma lista
    // com nome, telefone e CPF.
    expect(limpo).not.toContain("authorizeModule('membros'");
  });

  it('PATCH /convertidos/:id não grava req.body cru (mass-assignment)', () => {
    // Sem whitelist dava para escrever `deleted_at` e apagar por fora da RPC
    // `app_soft_delete`, que tem whitelist de tabela própria.
    const trecho = limpo.slice(limpo.indexOf("router.patch('/convertidos/:id'"));
    const corpo = trecho.slice(0, trecho.indexOf('router.', 10));
    expect(corpo).not.toMatch(/\.update\(\s*req\.body\s*\)/);
    expect(corpo).toContain('CAMPOS_EDITAVEIS');
  });
});
