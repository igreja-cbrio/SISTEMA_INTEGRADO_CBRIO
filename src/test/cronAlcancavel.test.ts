import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { semComentarios } from './utils/notificarEstatico';

// ─────────────────────────────────────────────────────────────────────────────
// GUARDA · toda rotina do vercel.json tem que ser ALCANÇÁVEL
//
// O incidente que originou este arquivo (11/08/2026): o Matheus recebeu no
// celular "Incidente: youtube · sync — 3 falhas consecutivas". Medido em
// `system_job_runs`: **HTTP_401 em 11 de 11 execuções**, ou seja a rotina nunca
// funcionou. Junto com ela, `/api/kpis/cultos/auto-create` e
// `/api/governanca/cron/lembrete` — três rotinas rodando diariamente sem fazer
// nada, em silêncio.
//
// Eram DOIS defeitos empilhados, e nenhum dos dois quebra teste, tipo ou lint:
//
//  1. `router.use(authenticate)` no topo do arquivo de rotas roda ANTES do
//     handler. O Vercel Cron manda `Authorization: Bearer <CRON_SECRET>`, o
//     `authenticate` tenta ler isso como JWT do Supabase e devolve 401 — então a
//     checagem `isAuthorizedCron(req) || isAdmin` de dentro do handler era CÓDIGO
//     MORTO pra cron.
//  2. **O Vercel Cron chama por GET.** Rota registrada só como POST não devolve
//     "não autorizado": devolve NÃO ENCONTRADO, que é ainda mais difícil de
//     diagnosticar, porque o erro registrado é um código HTTP e ninguém suspeita
//     do verbo.
//
// ⚠️ ESTE GUARDA É ESTÁTICO e é assim de propósito: as rotas importam o cliente
// do Supabase no topo, então não dá pra levantá-las num teste sem banco. O que
// se pode checar é a FORMA — e a forma é justamente onde os dois defeitos vivem.
// ─────────────────────────────────────────────────────────────────────────────

const raiz = (p: string) => resolve(__dirname, '../../', p);
const ler = (p: string) => semComentarios(readFileSync(raiz(p), 'utf-8'));

type Cron = { path: string; schedule: string };
const VERCEL = JSON.parse(readFileSync(raiz('vercel.json'), 'utf-8')) as { crons?: Cron[] };
const CRONS: Cron[] = VERCEL.crons || [];

// ⚠️⚠️ O PREFIXO DE MONTAGEM SAI DO `server.js`, NÃO DE UM PALPITE.
// A 1ª versão deste guarda cortava o caminho no primeiro segmento
// (`/api/kpis/v2/cron/coletar` → arquivo "kpis") e acusou FALSO POSITIVO: aquele
// cron é servido por `kpisV2.js`, porque `app.use('/api/kpis/v2', …)` é montado
// ANTES de `app.use('/api/kpis', …)`. Express resolve por prefixo mais longo
// declarado primeiro — então o teste tem que resolver do mesmo jeito, senão
// cobra de um arquivo a rota que vive em outro.
const SERVER = ler('backend/server.js');
const MONTAGENS_DO_SERVER = [...SERVER.matchAll(
  // O `(?:\.\w+)?` cobre `require('./routes/sistemaV1').router` — sem ele aquela
  // montagem ficava invisível pro modelo, e um cron servido por ela pareceria
  // órfão.
  /app\.use\('(\/api\/[^']*)',\s*require\('\.\/routes\/([^']+)'\)(?:\.\w+)?\)/g,
)].map(m => ({ prefixo: m[1], arquivo: `backend/routes/${m[2]}.js` }));

// ⚠️ Rota definida DIRETO no server (`app.get('/api/health', …)`) não passa por
// router nenhum — não tem authenticate global pra escapar, então fica fora desta
// checagem em vez de ser acusada de "sem montagem".
function noServerDireto(caminho: string): boolean {
  const base = caminho.split('?')[0];
  return new RegExp(`app\\.(get|post|all)\\('${base.replace(/\//g, '\\/')}'`).test(SERVER);
}

/** Qual arquivo de rota atende este caminho, e com que sufixo. */
function resolveRota(caminho: string) {
  const semQuery = caminho.split('?')[0];
  const candidatos = MONTAGENS_DO_SERVER
    .filter(m => semQuery === m.prefixo || semQuery.startsWith(`${m.prefixo}/`))
    .sort((a, b) => b.prefixo.length - a.prefixo.length); // prefixo mais longo ganha
  if (!candidatos.length) return null;
  const dono = candidatos[0];
  return { arquivo: dono.arquivo, resto: semQuery.slice(dono.prefixo.length) || '/' };
}

describe('vercel.json · crons declarados', () => {
  it('existe pelo menos um cron e todos têm path e schedule', () => {
    expect(CRONS.length).toBeGreaterThan(10);
    for (const c of CRONS) {
      expect(c.path, JSON.stringify(c)).toMatch(/^\/api\//);
      expect(c.schedule, c.path).toMatch(/\S/);
    }
  });

  it('⚠️ nenhum cron aponta para uma rotina que foi removida', () => {
    // O `/api/kpis/youtube/sync` ficou no vercel.json depois de a rotina virar
    // redundante (os coletores do módulo `online` já gravavam o mesmo dado, por
    // fonte melhor) — e continuou disparando, falhando e alarmando todos os dias.
    const paths = CRONS.map(c => c.path);
    expect(paths).not.toContain('/api/kpis/youtube/sync');
  });
});

/**
 * Onde o `authenticate` passa a valer para todo o router — em bytes.
 *
 * ⚠️⚠️ NÃO PROCURAR SÓ `router.use(authenticate)`. Foi o furo da 1ª versão deste
 * guarda, pego por mutação: o conserto do `routes/sistema.js` trocou aquela
 * linha por um wrapper (`authenticate(req, res, next)`) e, com isso, o arquivo
 * saiu da lista que o teste vigiava. O guarda ficou verde justamente onde tinha
 * acabado de haver bug — a pior forma de falso negativo, porque parece cobertura.
 */
function posicaoDoAuthenticate(src: string): number {
  const marcas = [
    src.indexOf('router.use(authenticate)'),
    src.indexOf('authenticate(req, res, next)'),
  ].filter(i => i >= 0);
  return marcas.length ? Math.min(...marcas) : -1;
}

// Só cobra dos arquivos que aplicam `authenticate` a todo o router: é ali que o
// 401 nasce. Arquivo de cron sem authenticate global não precisa de liberação, e
// exigir uma seria inventar regra.
const CRONS_ATRAS_DE_AUTH = CRONS
  .map(c => ({ cron: c, dono: resolveRota(c.path) }))
  .filter((x): x is { cron: Cron; dono: { arquivo: string; resto: string } } => !!x.dono)
  .filter(x => posicaoDoAuthenticate(ler(x.dono.arquivo)) >= 0);

describe('cron atrás de authenticate · a liberação existe e é explícita', () => {
  it('o extrator achou as montagens do server.js e algum cron atrás de auth', () => {
    expect(MONTAGENS_DO_SERVER.length).toBeGreaterThan(20);
    expect(CRONS_ATRAS_DE_AUTH.length).toBeGreaterThan(0);
  });

  it('todo cron do vercel.json tem um arquivo de rota que o atende', () => {
    // Cron apontando pra prefixo que ninguém monta é 404 diário em silêncio.
    for (const c of CRONS) {
      if (noServerDireto(c.path)) continue;
      expect(resolveRota(c.path), `${c.path} não casa com nenhum app.use do server.js`)
        .not.toBeNull();
    }
  });

  for (const { cron, dono } of CRONS_ATRAS_DE_AUTH) {
    it(`${dono.arquivo} · '${dono.resto}' é alcançável pelo cron`, () => {
      // ⚠️⚠️ ESTA É A RÉGUA, e ela tem DUAS formas válidas — descobri isso com o
      // próprio guarda: a 1ª versão exigia a lista de liberação e acusou 12
      // rotinas que FUNCIONAM em produção. Elas funcionam porque registram a
      // rota ANTES do `router.use(authenticate)`, e aí o middleware nem roda.
      //
      // Então o que importa não é "está na lista", é ALCANÇÁVEL:
      //   · registrada antes do `router.use(authenticate)`, ou
      //   · liberada por caminho em `CAMINHOS_DE_CRON`.
      // Qualquer outra forma = 401 diário em silêncio.
      const src = ler(dono.arquivo);
      const iAuth = posicaoDoAuthenticate(src);
      const reg = new RegExp(`router\\.(get|post|all)\\('${dono.resto.replace(/\//g, '\\/')}'`);
      const achou = reg.exec(src);
      // ⚠️ A rota pode viver num SEGUNDO router montado no mesmo prefixo (é o
      // caso do `/api/sistema`, servido por sistema.js E sistemaV1.js). Se não
      // está aqui, ela precisa estar num vizinho — e este arquivo, que responde
      // primeiro, precisa deixar a requisição PASSAR.
      const vizinhos = MONTAGENS_DO_SERVER
        .filter(m => m.arquivo !== dono.arquivo && ler(m.arquivo).match(reg));
      expect(
        achou !== null || vizinhos.length > 0,
        `${dono.resto} não está registrada em ${dono.arquivo} nem em nenhum router vizinho`,
      ).toBe(true);
      const antesDoAuth = achou !== null && achou.index < iAuth;
      const liberadaPorCaminho = src.includes('CAMINHOS_DE_CRON.has(req.path)')
        && new RegExp(`CAMINHOS_DE_CRON[\\s\\S]{0,600}'${dono.resto.replace(/\//g, '\\/')}'`).test(src);
      // 3ª forma válida, e a melhor delas: liberar por PREFIXO `/cron/`. Existe
      // no repo desde antes (totemKids.js) e se mantém sozinha — rota de cron
      // nova não precisa que ninguém lembre de cadastrá-la.
      const liberadaPorPrefixo = dono.resto.startsWith('/cron/')
        && /req\.path\.startsWith\('\/cron\/'\)\s*&&\s*isAuthorizedCron\(req\)/.test(src);
      expect(
        antesDoAuth || liberadaPorCaminho || liberadaPorPrefixo,
        `${dono.arquivo}${dono.resto}: fica DEPOIS do authenticate e não está liberada `
        + '(nem por caminho, nem pelo prefixo /cron/) ⇒ o cron leva 401 antes do '
        + 'handler, todos os dias, em silêncio',
      ).toBe(true);

      // ⚠️⚠️ E O DESVIO NÃO PODE SER ANULADO LOGO DEPOIS. Eu cometi exatamente
      // este erro ao consertar: deixei o `router.use(authenticate)` DEPOIS do
      // wrapper, então o `next()` do desvio caía direto no authenticate global e
      // o 401 continuava. Não quebra sintaxe, não quebra tipo, e o comentário do
      // conserto jura que está resolvido.
      if (liberadaPorCaminho || liberadaPorPrefixo) {
        const iDesvio = Math.max(
          src.indexOf("CAMINHOS_DE_CRON.has(req.path)"),
          src.indexOf("req.path.startsWith('/cron/')"),
        );
        const authGlobalDepois = src.indexOf('router.use(authenticate)', iDesvio);
        expect(
          authGlobalDepois,
          `${dono.arquivo}: tem router.use(authenticate) DEPOIS do desvio de cron — o desvio não serve pra nada`,
        ).toBe(-1);
      }
    });

    it(`⚠️ ${dono.arquivo} · '${dono.resto}' aceita GET (o Vercel Cron não usa POST)`, () => {
      const rota = dono.resto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const get = new RegExp(`router\\.(get|all)\\('${rota}'`);
      // Procura no arquivo dono E nos vizinhos montados no mesmo prefixo.
      const ondeEstá = [dono.arquivo, ...MONTAGENS_DO_SERVER.map(m => m.arquivo)]
        .filter(a => new RegExp(`router\\.(get|post|all)\\('${rota}'`).test(ler(a)));
      expect(ondeEstá.length, `${dono.resto} não está registrada em lugar nenhum`).toBeGreaterThan(0);
      expect(
        ondeEstá.some(a => get.test(ler(a))),
        `${dono.resto} só aceita POST — o Vercel Cron chama por GET`,
      ).toBe(true);
    });
  }

  it('⚠️ a liberação SÓ vale com segredo de cron válido', () => {
    // ⚠️ Pego por mutação: tirar o `&& isAuthorizedCron(req)` da condição deixava
    // o guarda verde e transformava a liberação em porta aberta — qualquer um
    // chamaria a rotina (recalculo pesado, LLM, disparo de WhatsApp) sem prova
    // de origem nenhuma. É o mesmo furo que o `cronAuth.js` documenta ter
    // fechado quando confiava em `User-Agent: vercel-cron`.
    for (const { dono } of CRONS_ATRAS_DE_AUTH) {
      const src = ler(dono.arquivo);
      const usaDesvio = src.includes('CAMINHOS_DE_CRON.has(req.path)')
        || src.includes("req.path.startsWith('/cron/')");
      if (!usaDesvio) continue; // registra antes do authenticate, não há desvio
      expect(
        /(?:CAMINHOS_DE_CRON\.has\(req\.path\)|req\.path\.startsWith\('\/cron\/'\))\s*&&\s*isAuthorizedCron\(req\)/
          .test(src),
        `${dono.arquivo}: o desvio de cron não exige isAuthorizedCron — é passe livre`,
      ).toBe(true);
    }
  });

  it('a liberação NÃO é um passe livre para o router inteiro', () => {
    // ⚠️ Deixar qualquer requisição com CRON_SECRET atravessar o router faria do
    // segredo do cron uma chave-mestra pras dezenas de rotas autenticadas desses
    // arquivos. A liberação tem que ser por caminho.
    for (const { dono } of CRONS_ATRAS_DE_AUTH) {
      const src = ler(dono.arquivo);
      if (!src.includes('CAMINHOS_DE_CRON')) continue; // usa a outra forma válida
      expect(src).toContain('CAMINHOS_DE_CRON.has(req.path)');
    }
  });
});
