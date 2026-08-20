#!/usr/bin/env node
'use strict';

/**
 * GERADOR DO MAPA DO SISTEMA · responde "ONDE MORA", nunca "está certo".
 *
 * ⚠️⚠️ POR QUE ISTO EXISTE (pedido do Matheus · 20/08/2026)
 * O CLAUDE.md tem 12.500 linhas e ~200 mil tokens carregados em TODA sessão, e
 * mesmo assim a resposta a "põe um botão de compartilhar no app" começava com
 * "deixa eu ver como a tela de inscrições funciona". O problema não é falta de
 * contexto — é FORMA: aquele arquivo é um diário por incidente e por data (215
 * seções), não um índice por assunto. A informação está lá e não é recuperável.
 *
 * ⚠️⚠️ E ÍNDICE ESCRITO À MÃO APODRECE — há prova nesta casa. O `atlas.html`
 * (840 KB) descreve "para que serve" de 45 módulos e está parado em 25/06; o
 * próprio CLAUDE.md registra que ele descreve como vivo um pareamento do Kids
 * que nunca foi implementado. Em 20/08 apareceram outros três casos do mesmo
 * tipo (nota de cron 4 dias velha; tooltip dizendo `vol_profiles`/930 quando o
 * conjunto é 593; comentário afirmando um padrão de nome do ML que o ZIP real
 * não usa).
 *
 * ⇒ Daí a regra deste arquivo: **só fato DERIVÁVEL do código**. Nada de prosa
 *   sobre propósito, nada escrito à mão. Se um dia o mapa mentir sobre onde algo
 *   mora, é porque o gerador tem bug — não porque alguém esqueceu de atualizar.
 *
 * ⚠️ O QUE ELE DELIBERADAMENTE NÃO FAZ
 *   · não descreve intenção, decisão nem história (isso é o CLAUDE.md);
 *   · não grava catálogo de BANCO (tabela/coluna/RPC muda sem PR — gravar criaria
 *     a segunda fonte de verdade que este projeto já combateu várias vezes; para
 *     banco, a régua segue sendo consultar o catálogo ao vivo);
 *   · não afirma que o código está correto.
 *
 * Uso:
 *   node backend/scripts/gerar-mapa.cjs            # escreve docs/mapa/
 *   node backend/scripts/gerar-mapa.cjs --check    # não escreve; sai 1 se mudou
 *   node backend/scripts/gerar-mapa.cjs --json     # despeja o modelo (teste usa)
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const SAIDA = path.join(RAIZ, 'docs', 'mapa');

// Os 2 apps são repos IRMÃOS, fora deste. Ausência não é erro: quem roda no CI
// do ERP não tem os outros clonados, e o mapa do ERP tem de sair de qualquer
// forma — a seção dos apps simplesmente não é escrita.
//
// ⚠️ Procura em VÁRIOS lugares porque `..` não serve: quando o gerador roda de
// uma WORKTREE (que é como as sessões trabalham neste projeto), o pai é a pasta
// de scratch e não `~/Documents`. Assumir o irmão foi o primeiro bug deste
// arquivo — e ele falhava em silêncio, escrevendo APPS.md vazio.
function acharApp(nome) {
  const doEnv = process.env[`MAPA_DIR_${nome.toUpperCase().replace(/-/g, '_')}`];
  const candidatos = [
    doEnv,
    path.resolve(RAIZ, '..', nome),                              // clone lado a lado
    path.join(process.env.HOME || '', 'Documents', nome),         // máquina do Matheus
    path.join(process.env.HOME || '', nome),
  ].filter(Boolean);
  return candidatos.find((d) => fs.existsSync(path.join(d, 'app'))) || null;
}

const APPS = [
  { nome: 'Aplicativo-CBRio', rotulo: 'App dos membros' },
  { nome: 'CBRio-Staff', rotulo: 'App do staff' },
].map((a) => ({ ...a, dir: acharApp(a.nome) }));

// ───────────────────────────── utilidades ─────────────────────────────

function ler(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

/** Remove comentários de linha e de bloco antes de casar padrões.
 *  ⚠️ Isto não é higiene: sem remover, o próprio comentário que EXPLICA um
 *  `authorizeModule(...)` entra como se fosse chamada real. É a armadilha que
 *  já mordeu duas vezes neste repo (06/08), e nas duas o falso positivo foi a
 *  documentação do conserto. */
function semComentarios(src) {
  return String(src || '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|[^:'"`\\])\/\/[^\n]*$/, '$1'))
    .join('\n');
}

function listarArquivos(dir, filtro, acc = []) {
  let itens;
  try { itens = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const it of itens) {
    if (it.name === 'node_modules' || it.name.startsWith('.')) continue;
    const p = path.join(dir, it.name);
    if (it.isDirectory()) listarArquivos(p, filtro, acc);
    else if (filtro(it.name)) acc.push(p);
  }
  return acc;
}

const rel = (p, base = RAIZ) => path.relative(base, p).split(path.sep).join('/');
const unico = (a) => [...new Set(a)].sort();

// ───────────────────── 1 · rotas e telas (App.tsx) ─────────────────────

function lerAppTsx() {
  const bruto = ler(path.join(RAIZ, 'src', 'App.tsx'));
  if (!bruto) return { componentes: {}, rotas: [] };
  const src = semComentarios(bruto);

  // const Nome = lazyWithRetry(() => import('./pages/Foo'));   (ou lazy(...))
  const componentes = {};
  const reLazy = /const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:lazyWithRetry|lazy)\s*\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]/g;
  for (const m of src.matchAll(reLazy)) componentes[m[1]] = m[2];

  // ⚠️⚠️ FATIA por `<Route`, NUNCA casa até o primeiro `/>`.
  // A forma real da rota neste repo é:
  //   <Route path="/x" element={<Suspense fallback={<Loading />}><Tela /></Suspense>} />
  // e `<Loading />` fecha ANTES do componente. Um regex que pare no primeiro
  // `/>` corta o corpo no meio e o componente nunca é visto — foi assim que
  // `/admin/cruzamentos` sumiu do mapa na primeira versão, em silêncio e sem
  // erro. Fatiar até a próxima declaração é o que torna o corpo completo.
  const rotas = [];
  const pedacos = src.split(/<Route\s/).slice(1);
  for (const pedaco of pedacos) {
    const mPath = pedaco.match(/^\s*path=["']([^"']+)["']/);
    if (!mPath) continue;
    const caminho = mPath[1];
    const corpo = pedaco;
    const guard = corpo.match(/moduleSlug=["']([^"']+)["']/);
    const nivel = corpo.match(/nivelMinimo=\{?\s*(\d+)/);
    // O componente é o primeiro <Maiuscula> que conhecemos como lazy.
    let componente = null;
    for (const t of corpo.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)) {
      if (componentes[t[1]]) { componente = t[1]; break; }
    }
    rotas.push({
      caminho,
      modulo: guard ? guard[1] : null,
      nivel: nivel ? Number(nivel[1]) : null,
      componente,
      arquivo: componente ? componentes[componente] : null,
      redireciona: /<Navigate\s/.test(corpo),
      publica: !/<ProtectedRoute/.test(corpo),
    });
  }
  return { componentes, rotas };
}

// ───────────── 2 · routeKey → módulos (ROUTE_MODULE_MAP) ─────────────

function lerRouteModuleMap() {
  const bruto = ler(path.join(RAIZ, 'backend', 'middleware', 'auth.js'));
  if (!bruto) return {};
  const bloco = semComentarios(bruto).match(/const\s+ROUTE_MODULE_MAP\s*=\s*\{([\s\S]*?)\n\};/);
  if (!bloco) return {};
  const mapa = {};
  for (const m of bloco[1].matchAll(/['"]([a-z0-9-]+)['"]\s*:\s*\[([^\]]*)\]/gi)) {
    mapa[m[1]] = [...m[2].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
  }
  return mapa;
}

// ───────────── 3 · montagem no server.js (prefixo → arquivo) ─────────────

function lerMontagens() {
  const bruto = ler(path.join(RAIZ, 'backend', 'server.js'));
  if (!bruto) return [];
  const out = [];
  const re = /app\.use\(\s*['"](\/api\/[^'"]*)['"]\s*,\s*require\(\s*['"]\.\/routes\/([^'"]+)['"]/g;
  for (const m of semComentarios(bruto).matchAll(re)) {
    out.push({ prefixo: m[1], arquivo: `backend/routes/${m[2].replace(/\.js$/, '')}.js` });
  }
  return out;
}

// ───────────── 4 · endpoints, guards e tabelas por arquivo de rota ─────────────

function lerRotasBackend() {
  const arquivos = listarArquivos(path.join(RAIZ, 'backend', 'routes'), (n) => n.endsWith('.js') && !n.endsWith('.test.js'));
  const porArquivo = {};
  for (const p of arquivos) {
    const src = semComentarios(ler(p));
    if (!src) continue;
    const endpoints = [];
    for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]*)['"`]/g)) {
      endpoints.push({ metodo: m[1].toUpperCase(), caminho: m[2] || '/' });
    }
    const guards = [];
    for (const m of src.matchAll(/authorizeModule\(\s*['"]([a-z0-9-]+)['"](?:\s*,\s*(\d+))?/gi)) {
      guards.push({ modulo: m[1], nivel: m[2] ? Number(m[2]) : null });
    }
    const tabelas = unico([...src.matchAll(/\.from\(\s*['"]([a-z0-9_]+)['"]/gi)].map((m) => m[1]));
    const rpcs = unico([...src.matchAll(/\.rpc\(\s*['"]([a-z0-9_]+)['"]/gi)].map((m) => m[1]));
    const utils = unico([...src.matchAll(/require\(\s*['"]\.\.\/utils\/([a-zA-Z0-9_]+)['"]/g)].map((m) => m[1]));
    const services = unico([...src.matchAll(/require\(\s*['"]\.\.\/services\/([a-zA-Z0-9_]+)['"]/g)].map((m) => m[1]));
    porArquivo[rel(p)] = { endpoints, guards, tabelas, rpcs, utils, services };
  }
  return porArquivo;
}

// ───────────── 5 · api.js (namespace do front → caminhos) ─────────────

function lerApiJs() {
  const bruto = ler(path.join(RAIZ, 'src', 'api.js'));
  if (!bruto) return {};
  const src = semComentarios(bruto);
  // Fatia por `export const <ns> = {` até o próximo export.
  const marcas = [...src.matchAll(/^export const ([a-zA-Z0-9_]+)\s*=\s*\{/gm)];
  const ns = {};
  marcas.forEach((m, i) => {
    const ini = m.index;
    const fim = i + 1 < marcas.length ? marcas[i + 1].index : src.length;
    const corpo = src.slice(ini, fim);
    const caminhos = unico(
      [...corpo.matchAll(/['"`](\/[a-z0-9][^'"`\s]*)['"`]/gi)]
        .map((x) => x[1].split('?')[0].replace(/\$\{[^}]*\}/g, ':id'))
        .filter((c) => c.length > 1)
    );
    if (caminhos.length) ns[m[1]] = caminhos;
  });
  return ns;
}

// ───────────── 6 · réguas puras em utils/ + o teste que as cobre ─────────────

function lerUtils() {
  const arquivos = listarArquivos(path.join(RAIZ, 'backend', 'utils'), (n) => n.endsWith('.js') && !n.includes('.test.'));
  const testes = listarArquivos(path.join(RAIZ, 'src', 'test'), (n) => /\.(ts|js)$/.test(n))
    .concat(listarArquivos(path.join(RAIZ, 'backend'), (n) => n.endsWith('.test.js')));
  const conteudoTestes = testes.map((t) => ({ arquivo: rel(t), src: ler(t) || '' }));

  const out = {};
  for (const p of arquivos) {
    const nome = path.basename(p, '.js');
    const cobertoPor = conteudoTestes
      .filter((t) => t.src.includes(`utils/${nome}`))
      .map((t) => t.arquivo);
    out[nome] = { arquivo: rel(p), cobertoPor: unico(cobertoPor) };
  }
  return out;
}

// ───────────── 7 · crons (vercel.json) ─────────────

function lerCrons() {
  try {
    const j = JSON.parse(ler(path.join(RAIZ, 'vercel.json')) || '{}');
    return (j.crons || []).map((c) => ({ caminho: c.path, quando: c.schedule }));
  } catch { return []; }
}

// ───────────── 8 · os 2 apps (expo-router: rota = caminho do arquivo) ─────────────

function lerApp(app) {
  if (!app.dir || !fs.existsSync(app.dir)) return null;
  const telas = listarArquivos(path.join(app.dir, 'app'), (n) => n.endsWith('.tsx'))
    .filter((p) => !path.basename(p).startsWith('_'));
  const reChamada = /api(?:Get|Post|Patch|Put|Delete|Upload)(?:<[^>]*>)?\(\s*['"`]([^'"`]+)/g;

  const porTela = telas.map((p) => {
    const src = semComentarios(ler(p));
    const chamadas = unico([...(src || '').matchAll(reChamada)]
      .map((m) => m[1].replace(/\$\{[^}]*\}/g, ':id').split('?')[0]));
    // expo-router: app/(app)/grupo-membros.tsx → /grupo-membros
    const rota = '/' + rel(p, path.join(app.dir, 'app'))
      .replace(/\.tsx$/, '')
      .replace(/\([^)]*\)\//g, '')
      .replace(/\/index$/, '');
    return { arquivo: rel(p, app.dir), rota, chamadas };
  });

  const varrer = (sub, ext) => listarArquivos(path.join(app.dir, sub), (n) => n.endsWith(ext) && !n.includes('.test.'))
    .map((p) => {
      const src = semComentarios(ler(p));
      return {
        arquivo: rel(p, app.dir),
        chamadas: unico([...(src || '').matchAll(reChamada)]
          .map((m) => m[1].replace(/\$\{[^}]*\}/g, ':id').split('?')[0])),
      };
    });

  // ⚠️ NÃO filtra por "tem chamada de API": a régua do compartilhar
  // (`lib/compartilharInscricao.ts`) monta TEXTO e não chama nada — e é
  // justamente o arquivo que eu preciso achar antes de escrever outro igual.
  // `components/` entra pelo mesmo motivo (`BotaoCompartilhar.tsx`).
  const libs = [...varrer('lib', '.ts'), ...varrer('components', '.tsx')];

  return { ...app, telas: porTela.sort((a, b) => a.rota.localeCompare(b.rota)), libs: libs.sort((a, b) => a.arquivo.localeCompare(b.arquivo)) };
}

// ───────────────────────── montagem do modelo ─────────────────────────

function montarModelo() {
  const { rotas } = lerAppTsx();
  const routeMap = lerRouteModuleMap();
  const montagens = lerMontagens();
  const rotasBackend = lerRotasBackend();
  const apiNs = lerApiJs();
  const utils = lerUtils();
  const crons = lerCrons();
  const apps = APPS.map(lerApp).filter(Boolean);

  // Universo de módulos: o que a matriz de permissão reconhece (valores do
  // ROUTE_MODULE_MAP) ∪ o que os guards realmente exigem ∪ o que as telas
  // guardam. Sem inventar nome: tudo sai de um dos três.
  const slugs = new Set();
  for (const v of Object.values(routeMap)) v.forEach((s) => slugs.add(s));
  for (const info of Object.values(rotasBackend)) info.guards.forEach((g) => slugs.add(g.modulo));
  for (const r of rotas) if (r.modulo) slugs.add(r.modulo);

  const modulos = {};
  for (const slug of [...slugs].sort()) {
    // routeKeys que apontam para este módulo
    const routeKeys = Object.entries(routeMap).filter(([, v]) => v.includes(slug)).map(([k]) => k).sort();

    // arquivos de rota do backend: guard explícito OU prefixo casando um routeKey
    const arquivosBackend = unico(Object.entries(rotasBackend)
      .filter(([arq, info]) => {
        if (info.guards.some((g) => g.modulo === slug)) return true;
        const mont = montagens.find((m) => m.arquivo === arq);
        if (!mont) return false;
        const chave = mont.prefixo.replace(/^\/api\//, '').replace(/\/$/, '');
        return routeKeys.includes(chave);
      })
      .map(([arq]) => arq));

    const telas = rotas.filter((r) => r.modulo === slug);

    modulos[slug] = {
      slug,
      routeKeys,
      telas,
      arquivosBackend,
      guards: unico(arquivosBackend.flatMap((a) =>
        rotasBackend[a].guards.filter((g) => g.modulo === slug).map((g) => `${g.nivel ?? 'padrão'}`))),
      endpoints: arquivosBackend.flatMap((a) => {
        const mont = montagens.find((m) => m.arquivo === a);
        const pref = mont ? mont.prefixo.replace(/\/$/, '') : '';
        return rotasBackend[a].endpoints.map((e) => `${e.metodo} ${pref}${e.caminho === '/' ? '' : e.caminho}`);
      }).sort(),
      tabelas: unico(arquivosBackend.flatMap((a) => rotasBackend[a].tabelas)),
      rpcs: unico(arquivosBackend.flatMap((a) => rotasBackend[a].rpcs)),
      utils: unico(arquivosBackend.flatMap((a) => rotasBackend[a].utils)),
      services: unico(arquivosBackend.flatMap((a) => rotasBackend[a].services)),
      apiNs: Object.keys(apiNs).filter((n) => n === slug || n === slug.replace(/-/g, '')),
      crons: crons.filter((c) => routeKeys.some((k) => c.caminho.includes(`/api/${k}`))),
    };
  }

  // ⚠️⚠️ ÍNDICE REVERSO app → módulo. Sem isto, a pergunta "onde o app toca
  // inscrições?" só era respondível lendo uma linha gigante de `lib/api.ts` com
  // 50 endpoints — inútil. Casa o caminho chamado pelo app com o endpoint do
  // módulo, pelo primeiro segmento depois de `/app/`.
  for (const m of Object.values(modulos)) {
    const alvos = new Set();
    for (const e of m.endpoints) {
      const p = e.split(' ')[1] || '';
      const seg = p.replace(/^\/api\/app\//, '').replace(/^\/api\//, '').split('/')[0];
      if (seg) alvos.add(seg);
    }
    alvos.add(m.slug);
    m.noApp = [];
    for (const app of apps) {
      const casa = (chamadas) => chamadas.some((c) => {
        const seg = c.replace(/^\/app\//, '').replace(/^\//, '').split('/')[0];
        return alvos.has(seg);
      });
      for (const t of app.telas) if (casa(t.chamadas)) m.noApp.push(`${app.nome}: \`${t.arquivo}\` (\`${t.rota}\`)`);
      for (const l of app.libs) if (casa(l.chamadas)) m.noApp.push(`${app.nome}: \`${l.arquivo}\``);
    }
    m.noApp = unico(m.noApp);
  }

  // ⚠️⚠️ ÓRFÃOS · rota sem `ModuleGuard` e arquivo de rota que nenhum módulo
  // reivindica. Isto NÃO é sobra do gerador — é a classe de bug que o CLAUDE.md
  // registra como lei: routeKey fora do `ROUTE_MODULE_MAP` DESLIGA a matriz de
  // permissão em silêncio (caso `links`, 17/08). O mapa passa a mostrar essa
  // lista de graça, e foi a ausência dela que fez a página de /admin/cruzamentos
  // não existir na primeira versão deste gerador.
  const reivindicados = new Set(Object.values(modulos).flatMap((m) => m.arquivosBackend));
  const orfaos = {
    telas: rotas.filter((r) => !r.modulo && !r.redireciona && r.arquivo),
    backend: Object.keys(rotasBackend).filter((a) => !reivindicados.has(a)).sort(),
  };

  return { modulos, apiNs, utils, crons, apps, rotas, montagens, rotasBackend, orfaos };
}

// ───────────────────────────── escrita ─────────────────────────────

const AVISO = [
  '<!-- GERADO por backend/scripts/gerar-mapa.cjs — NÃO editar à mão. -->',
  '',
  '> ⚠️ **Este mapa responde ONDE algo mora, nunca SE está certo.** Ele é derivado do',
  '> código, então não mente sobre caminho de arquivo, rota ou endpoint. Mas continua',
  '> obrigatório MEDIR: número do banco, se um cron roda, se uma coluna existe, o que a',
  '> definição **viva** de uma função SQL diz, e o formato real de arquivo de terceiro.',
  '>',
  '> ⚠️ É regenerado sem travar deploy, então pode estar algumas horas atrás. Se citar',
  '> arquivo que não existe, **vale o código**.',
  '',
].join('\n');

function lista(titulo, itens, fmt = (x) => `\`${x}\``) {
  if (!itens || !itens.length) return '';
  return `\n**${titulo}**\n\n${itens.map((i) => `- ${fmt(i)}`).join('\n')}\n`;
}

function paginaModulo(m) {
  const L = [`# Módulo \`${m.slug}\``, '', AVISO];

  if (m.telas.length) {
    L.push('## Telas (ERP)', '');
    L.push('| rota | arquivo | nível |', '|---|---|---|');
    for (const t of m.telas) {
      L.push(`| \`${t.caminho}\` | ${t.arquivo ? `\`src/${t.arquivo.replace(/^\.\//, '')}\`` : '—'} | ${t.nivel ?? '—'} |`);
    }
    L.push('');
  }

  if (m.arquivosBackend.length) {
    L.push('## Backend', '');
    L.push(...m.arquivosBackend.map((a) => `- \`${a}\``));
    if (m.guards.length) L.push('', `Guard: \`authorizeModule('${m.slug}', ${m.guards.join(' | ')})\``);
    L.push('');
  }

  if (m.endpoints.length) {
    L.push('<details><summary>Endpoints (' + m.endpoints.length + ')</summary>', '');
    L.push(...m.endpoints.map((e) => `- \`${e}\``));
    L.push('', '</details>', '');
  }

  L.push(lista('Réguas puras (backend/utils)', m.utils, (u) => `\`backend/utils/${u}.js\``));
  L.push(lista('Serviços', m.services, (s) => `\`backend/services/${s}.js\``));
  L.push(lista('Tabelas que estas rotas tocam', m.tabelas));
  L.push(lista('RPCs', m.rpcs));
  L.push(lista('Namespace no front (src/api.js)', m.apiNs, (n) => `\`${n}\``));
  L.push(lista('Crons', m.crons.map((c) => `${c.caminho} — \`${c.quando}\``), (x) => x));
  L.push(lista('Onde os APPS tocam este módulo', m.noApp, (x) => x));
  L.push(lista('routeKeys em ROUTE_MODULE_MAP', m.routeKeys));

  return L.filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

function paginaIndice(modelo) {
  const L = [
    '# Mapa do sistema · índice',
    '',
    AVISO,
    '**Leia isto ANTES de investigar onde algo mora.** Uma linha por módulo; a página',
    'de cada um tem rotas, arquivos, endpoints, réguas e tabelas.',
    '',
    '| módulo | telas | backend | página |',
    '|---|---|---|---|',
  ];
  for (const m of Object.values(modelo.modulos)) {
    const telas = m.telas.map((t) => `\`${t.caminho}\``).slice(0, 3).join(' ') || '—';
    const be = m.arquivosBackend.map((a) => `\`${path.basename(a)}\``).slice(0, 2).join(' ') || '—';
    L.push(`| **${m.slug}** | ${telas}${m.telas.length > 3 ? ' …' : ''} | ${be} | [${m.slug}](${m.slug}.md) |`);
  }
  L.push('', `## Apps`, '', 'Telas dos apps e o que cada uma chama: [APPS.md](APPS.md)', '');
  L.push('## Réguas puras (o que já existe pronto)', '');
  L.push('Antes de escrever régua nova, conferir se já existe uma:', '');
  const comTeste = Object.values(modelo.utils).filter((u) => u.cobertoPor.length);
  L.push(`\`backend/utils/\` tem **${Object.keys(modelo.utils).length}** arquivos, **${comTeste.length}** com teste.`);
  L.push('', '<details><summary>Lista completa</summary>', '');
  L.push('| régua | teste |', '|---|---|');
  for (const [nome, u] of Object.entries(modelo.utils).sort()) {
    L.push(`| \`${u.arquivo}\` | ${u.cobertoPor.length ? u.cobertoPor.map((t) => `\`${t}\``).join(' ') : '—'} |`);
  }
  L.push('', '</details>', '');
  return L.join('\n') + '\n';
}

function paginaApps(modelo) {
  const L = ['# Mapa dos apps', '', AVISO];
  if (!modelo.apps.length) {
    L.push('> Os repos dos apps não estavam presentes quando este mapa foi gerado', '> (são repositórios irmãos). Rode o gerador na máquina que os tem clonados.', '');
    return L.join('\n') + '\n';
  }
  for (const app of modelo.apps) {
    L.push(`## ${app.rotulo} · \`${app.nome}\``, '');
    L.push('| rota | arquivo | chama |', '|---|---|---|');
    for (const t of app.telas) {
      L.push(`| \`${t.rota}\` | \`${t.arquivo}\` | ${t.chamadas.length ? t.chamadas.map((c) => `\`${c}\``).join(' ') : '—'} |`);
    }
    L.push('');
    if (app.libs.length) {
      L.push('<details><summary>lib/ que fala com a API</summary>', '');
      L.push('| arquivo | chama |', '|---|---|');
      for (const l of app.libs) L.push(`| \`${l.arquivo}\` | ${l.chamadas.map((c) => `\`${c}\``).join(' ')} |`);
      L.push('', '</details>', '');
    }
  }
  return L.join('\n') + '\n';
}

/**
 * ⚠️⚠️ ARQUIVOS.md · índice PLANO, uma linha por arquivo.
 *
 * É o arquivo mais útil do mapa, e a razão é prática: na maioria das vezes eu
 * chego com um NOME ("cruzamentos", "danfe", "compartilhar") e preciso do
 * caminho. Um único `grep` aqui responde — sem varrer o repo, sem abrir 40
 * páginas. A primeira versão deste gerador não tinha, e por isso não achou
 * `CruzamentosPessoas.jsx`: a tela não tem `ModuleGuard`, então nenhum módulo a
 * reivindicava e ela sumia do mapa inteiro.
 */
function paginaArquivos(modelo) {
  const linhas = [];

  for (const r of modelo.rotas) {
    if (!r.arquivo || r.redireciona) continue;
    linhas.push({
      arquivo: `src/${r.arquivo.replace(/^\.\//, '')}`,
      tipo: 'tela ERP',
      modulo: r.modulo || '—',
      onde: r.caminho,
    });
  }
  for (const [arq, info] of Object.entries(modelo.rotasBackend)) {
    const mont = modelo.montagens.find((m) => m.arquivo === arq);
    const dono = Object.values(modelo.modulos).find((m) => m.arquivosBackend.includes(arq));
    linhas.push({ arquivo: arq, tipo: 'rota backend', modulo: dono ? dono.slug : '—', onde: mont ? mont.prefixo : '(não montado)' });
  }
  for (const u of Object.values(modelo.utils)) {
    linhas.push({ arquivo: u.arquivo, tipo: 'régua pura', modulo: '—', onde: u.cobertoPor[0] || 'SEM TESTE' });
  }
  for (const app of modelo.apps) {
    for (const t of app.telas) linhas.push({ arquivo: `${app.nome}/${t.arquivo}`, tipo: 'tela app', modulo: '—', onde: t.rota });
    for (const l of app.libs) linhas.push({ arquivo: `${app.nome}/${l.arquivo}`, tipo: 'lib app', modulo: '—', onde: `${l.chamadas.length} chamada(s)` });
  }

  linhas.sort((a, b) => a.arquivo.localeCompare(b.arquivo));
  return [
    '# Todos os arquivos · índice plano',
    '',
    AVISO,
    '**Um `grep` aqui responde "onde mora X".** É para isto que este arquivo existe:',
    'chegar com um nome e sair com um caminho, sem varrer o repositório.',
    '',
    `${linhas.length} arquivos.`,
    '',
    '| arquivo | tipo | módulo | rota / teste |',
    '|---|---|---|---|',
    ...linhas.map((l) => `| \`${l.arquivo}\` | ${l.tipo} | ${l.modulo} | \`${l.onde}\` |`),
    '',
  ].join('\n');
}

function paginaOrfaos(modelo) {
  const o = modelo.orfaos;
  const L = [
    '# Órfãos · o que nenhum módulo reivindica',
    '',
    AVISO,
    '⚠️⚠️ **Isto não é sobra do gerador — é uma lista de risco.** O CLAUDE.md',
    'registra como LEI que `routeKey` sem entrada no `ROUTE_MODULE_MAP` **desliga a',
    'matriz de permissão em silêncio** (caso `links`, 17/08: a matriz dizia 2 cargos',
    'com escrita, a API aplicava 10). Rota sem `ModuleGuard` e arquivo de rota que',
    'nenhum módulo reivindica são exatamente os candidatos a esse buraco.',
    '',
    '⚠️ Estar aqui **não** significa que está errado: há telas legitimamente sem',
    'guard (públicas, totens, `/perfil`). Significa que ninguém decidiu — vale',
    'conferir.',
    '',
    `## Telas sem ModuleGuard (${o.telas.length})`,
    '',
    '| rota | arquivo | pública? |',
    '|---|---|---|',
    ...o.telas.map((t) => `| \`${t.caminho}\` | \`src/${t.arquivo.replace(/^\.\//, '')}\` | ${t.publica ? 'sim' : 'não (só logado)'} |`),
    '',
    `## Arquivos de rota que nenhum módulo reivindica (${o.backend.length})`,
    '',
    ...o.backend.map((a) => `- \`${a}\``),
    '',
  ];
  return L.join('\n');
}

function gerar() {
  const modelo = montarModelo();
  const arquivos = {
    'INDICE.md': paginaIndice(modelo),
    'ARQUIVOS.md': paginaArquivos(modelo),
    'APPS.md': paginaApps(modelo),
    'ORFAOS.md': paginaOrfaos(modelo),
  };
  for (const m of Object.values(modelo.modulos)) arquivos[`${m.slug}.md`] = paginaModulo(m);
  return { modelo, arquivos };
}

// ───────────────────────────── CLI ─────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const { modelo, arquivos } = gerar();

  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify(modelo, null, 2));
    return;
  }

  if (args.includes('--check')) {
    let mudou = 0;
    for (const [nome, conteudo] of Object.entries(arquivos)) {
      if (ler(path.join(SAIDA, nome)) !== conteudo) { console.error(`desatualizado: docs/mapa/${nome}`); mudou++; }
    }
    if (mudou) { console.error(`\n${mudou} arquivo(s) fora de data. Rode: node backend/scripts/gerar-mapa.cjs`); process.exit(1); }
    console.log('mapa em dia');
    return;
  }

  fs.mkdirSync(SAIDA, { recursive: true });
  // ⚠️ Apaga .md que o gerador não produz mais (módulo removido): mapa que
  // guarda página de módulo extinto é a primeira forma de mentir.
  for (const f of fs.readdirSync(SAIDA)) {
    if (f.endsWith('.md') && !arquivos[f]) fs.unlinkSync(path.join(SAIDA, f));
  }
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    fs.writeFileSync(path.join(SAIDA, nome), conteudo);
  }
  const nApps = modelo.apps.reduce((s, a) => s + a.telas.length, 0);
  console.log(`docs/mapa/ · ${Object.keys(modelo.modulos).length} módulos · ${modelo.rotas.length} rotas do ERP · ${nApps} telas de app · ${Object.keys(modelo.utils).length} réguas`);
}

if (require.main === module) main();
module.exports = { gerar, montarModelo };
