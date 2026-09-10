import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { semComentariosJs } from './_semComentarios';

/**
 * ⚠️⚠️ POR QUE ESTE TESTE EXISTE (varredura 2026-09 · lote 6)
 *
 * O lote 6 fechou rotas em bloco em cinco arquivos e não trouxe regressão —
 * contra o padrão que a casa fixou nos lotes 1/2/3 (`lote3RotasComGate`,
 * `cuidadosRotasComGate`, `gruposRotasComGate`). Tudo que ele mudou é do tipo
 * que alguém reabre sem perceber, porque cabe em UMA palavra na linha da rota:
 *
 *  · A04 `backend/routes/devocionais.js` — o arquivo inteiro era `authenticate`
 *    puro: qualquer conta logada lia, gravava e APAGAVA devocional em nome de
 *    qualquer `membro_id`. Prática devocional por pessoa é convicção religiosa
 *    (LGPD art. 11). A régua nova é "o dono faz o próprio; pra mexer no de
 *    outra pessoa vale a matriz", e o DELETE virou soft-delete com trilha.
 *  · AG-01 `backend/routes/agents.js` — o rastro do agente (`config`,
 *    `findings`, `response_text` — com CPF e telefone dentro) era legível por
 *    qualquer autenticado.
 *  · RHP-11 `backend/routes/rh.js` — decidir férias/licença rodava no piso 2
 *    herdado do `router.use`.
 *  · G02 `backend/routes/grupos.js` — grupo podia ficar ACEITANDO INSCRIÇÃO sem
 *    `lider_id`: o pedido nascia sem ninguém pra receber o aviso.
 *
 * A verificação é POR TEXTO porque importar as rotas puxaria `utils/supabase` e
 * o gate roda sem as dependências de `backend/`.
 *
 * ⚠️ `semComentariosJs` (módulo compartilhado, não `.test.ts` de propósito) é
 * OBRIGATÓRIO aqui: os comentários do próprio conserto CITAM `deleted_at`,
 * `app_soft_delete`, `authorizeModule` e até a chave ampla `membros` que este
 * teste existe pra PROIBIR — sem limpar, o texto explicativo do diff vira a
 * evidência e o teste passa com o gate AUSENTE (armadilha de 06/08/2026, já
 * repetida duas vezes neste repo).
 */

const RAIZ = resolve(__dirname, '..', '..');

function carregar(caminho: string) {
  const cru = readFileSync(resolve(RAIZ, caminho), 'utf8');
  return { cru, limpo: semComentariosJs(cru) };
}

const devocionais = carregar('backend/routes/devocionais.js');
const devocionalMembro = carregar('backend/routes/devocionalMembro.js');
const devocionalPlanos = carregar('backend/routes/devocionalPlanos.js');
const cuidados = carregar('backend/routes/cuidados.js');
const membresia = carregar('backend/routes/membresia.js');
const agents = carregar('backend/routes/agents.js');
const rh = carregar('backend/routes/rh.js');
const grupos = carregar('backend/routes/grupos.js');
const auth = carregar('backend/middleware/auth.js');
const permissoes = carregar('backend/routes/permissoes.js');
const agentTasks = carregar('backend/routes/agentTasks.js');

/** Devolve a linha da declaração da rota (uma linha — é assim que o repo escreve). */
function linhaDaRota(limpo: string, metodo: string, caminho: string): string | undefined {
  const alvo = `router.${metodo}('${caminho}'`;
  return limpo.split('\n').find((l) => l.includes(alvo));
}

/** Corpo de uma `function nome(...)` declarada no arquivo (chaves balanceadas). */
function corpoDaFuncao(limpo: string, nome: string): string {
  const i = limpo.search(new RegExp(`function\\s+${nome}\\s*\\(`));
  if (i < 0) return '';
  const abre = limpo.indexOf('{', i);
  if (abre < 0) return '';
  let nivel = 0;
  for (let k = abre; k < limpo.length; k++) {
    if (limpo[k] === '{') nivel++;
    else if (limpo[k] === '}') {
      nivel--;
      if (nivel === 0) return limpo.slice(i, k + 1);
    }
  }
  return limpo.slice(i);
}

/** Trecho a partir da declaração de uma rota (janela — o repo escreve handlers curtos). */
function blocoDaRota(limpo: string, metodo: string, caminho: string, tamanho: number): string {
  const i = limpo.indexOf(`router.${metodo}('${caminho}'`);
  return i < 0 ? '' : limpo.slice(i, i + tamanho);
}

/**
 * Bloco da rota até a PRÓXIMA declaração de rota.
 *
 * ⚠️⚠️ varredura 2026-09 (rodada 2): a janela de tamanho FIXO acima vaza pro
 * vizinho quando o handler é curto — e aí a asserção passa medindo a rota
 * ERRADA. Provado com mutante: apagar o `bloqueiaAutoEdicao` de
 * `PUT /usuario/:id/ativo` (permissoes.js) continuava verde, porque a janela de
 * 2600 alcançava o `bloqueiaAutoEdicao` da rota seguinte. Onde a asserção é
 * "esta rota TEM tal coisa", o recorte precisa fechar na porta certa.
 */
function corpoDaRota(limpo: string, metodo: string, caminho: string): string {
  const i = limpo.indexOf(`router.${metodo}('${caminho}'`);
  if (i < 0) return '';
  const proxima = limpo.slice(i + 1).search(/\n\s*router\.(?:get|post|put|patch|delete|use)\(/);
  return proxima < 0 ? limpo.slice(i) : limpo.slice(i, i + 1 + proxima);
}

describe('sanidade do limpador — asserção negativa sobre texto comido passa por vacuidade', () => {
  const arquivos = { devocionais, devocionalMembro, devocionalPlanos, cuidados, membresia, agents, rh, grupos, auth, permissoes, agentTasks };
  for (const [nome, f] of Object.entries(arquivos)) {
    it(`${nome} sobrevive a semComentariosJs`, () => {
      // O limpador PRESERVA comprimento (comentário vira espaço), então o que
      // se mede é código restante, não bytes.
      expect(f.limpo.replace(/\s+/g, ' ').length, `${nome} ficou vazio depois de limpar`).toBeGreaterThan(500);
      expect(f.limpo, `${nome} perdeu o código`).toMatch(/router\.|ROUTE_MODULE_MAP/);
    });
  }
});

// ── (a) A04 · devocionais.js — gate POR ROTA, com a régua certa em cada uma ──

describe('⚠️⚠️ A04 · devocionais.js — histórico devocional deixou de ser público-pra-quem-logou', () => {
  it('os três apelidos apontam pros níveis medidos (1 agregado · 2 nominal · 3 gerir de terceiro)', () => {
    // Se alguém trocar o número aqui, o gate continua "existindo" na linha de
    // cada rota e a régua inteira do módulo muda em silêncio.
    expect(devocionais.limpo, 'guardLerDeTerceiro deixou de ser nível 2 (histórico NOMINAL de outra pessoa)')
      .toMatch(/const\s+guardLerDeTerceiro\s*=\s*authorizeModule\('devocionais',\s*2\)/);
    expect(devocionais.limpo, 'guardAgregado deixou de ser nível 1 (só contagem, sem nome)')
      .toMatch(/const\s+guardAgregado\s*=\s*authorizeModule\('devocionais',\s*1\)/);
    expect(devocionais.limpo, 'guardGerirDeTerceiro deixou de ser nível 3 (gravar/editar/apagar de outra pessoa)')
      .toMatch(/const\s+guardGerirDeTerceiro\s*=\s*authorizeModule\('devocionais',\s*3\)/);
  });

  it('⚠️ os apelidos são declarados ANTES da primeira rota que os usa (TDZ derruba o router)', () => {
    // `const` não é hoisted: com a declaração depois da primeira rota, o
    // arquivo estoura ReferenceError NO CARREGAMENTO e o servidor não sobe.
    const decl = devocionais.limpo.search(/const\s+guardLerDeTerceiro\s*=\s*authorizeModule/);
    const primeiroUso = devocionais.limpo.indexOf("router.get('/'");
    expect(decl, 'a declaração de `guardLerDeTerceiro` sumiu').toBeGreaterThan(-1);
    expect(primeiroUso, 'GET / sumiu de devocionais.js').toBeGreaterThan(-1);
    expect(decl, 'os apelidos voltaram a ser declarados DEPOIS da primeira rota — TDZ').toBeLessThan(primeiroUso);
  });

  const DEV_ROTAS: Array<{ metodo: string; caminho: string; guard: string; porque: string }> = [
    {
      metodo: 'get',
      caminho: '/',
      guard: 'soDonoOuMatriz',
      porque: 'a lista traz NOME e foto do membro — sem `membro_id` próprio é histórico nominal de terceiro',
    },
    {
      metodo: 'get',
      caminho: '/membro/:id',
      guard: 'soDonoOuMatriz',
      porque: 'histórico devocional nominal de uma pessoa (LGPD art. 11)',
    },
    {
      metodo: 'get',
      caminho: '/kpis',
      guard: 'guardAgregado',
      porque: 'só números, sem nome — a régua do agregado é 1, igual censo',
    },
    {
      metodo: 'get',
      caminho: '/stats',
      guard: 'guardAgregado',
      porque: 'agregado do dashboard, mesma régua do /kpis',
    },
    {
      metodo: 'post',
      caminho: '/',
      guard: 'escritaSoDoDono',
      porque: 'registrar em nome de terceiro (inflar o KID-04) exige nível 3',
    },
    {
      metodo: 'put',
      caminho: '/:id',
      guard: 'registroSoDoDono',
      porque: 'editar o devocional de outra pessoa exige nível 3, com posse conferida na linha',
    },
    {
      metodo: 'delete',
      caminho: '/:id',
      guard: 'registroSoDoDono',
      porque: 'apagar o devocional de outra pessoa exige nível 3, com posse conferida na linha',
    },
  ];

  for (const r of DEV_ROTAS) {
    it(`${r.metodo.toUpperCase()} ${r.caminho} passa por \`${r.guard}\` — ${r.porque}`, () => {
      const linha = linhaDaRota(devocionais.limpo, r.metodo, r.caminho);
      expect(linha, `${r.metodo.toUpperCase()} ${r.caminho} sumiu de devocionais.js — se foi renomeada, atualizar ESTE teste`).toBeTruthy();
      expect(linha, `${r.metodo.toUpperCase()} ${r.caminho} voltou a ser \`authenticate\` puro — ${r.porque}`)
        .toMatch(new RegExp(`,\\s*${r.guard}\\s*,`));
    });
  }

  it('⚠️⚠️ os guards de posse CAEM na matriz quando não é o dono — não são pass-through', () => {
    // O modo de falha silencioso: alguém "simplifica" o guard pra `next()` no
    // fim. Ele continua na linha da rota, o teste de cima passa, e a rota fica
    // aberta de novo. O `return guard…(req, res, next)` no fim é a trava.
    const posse: Array<[string, string]> = [
      ['soDonoOuMatriz', 'guardLerDeTerceiro'],
      ['escritaSoDoDono', 'guardGerirDeTerceiro'],
      ['registroSoDoDono', 'guardGerirDeTerceiro'],
    ];
    for (const [fn, esperado] of posse) {
      const corpo = corpoDaFuncao(devocionais.limpo, fn);
      expect(corpo, `\`${fn}\` sumiu de devocionais.js`).toBeTruthy();
      expect(corpo, `\`${fn}\` deixou de cair em \`${esperado}\` — quem não é dono passa direto`)
        .toMatch(new RegExp(`return\\s+${esperado}\\(req,\\s*res,\\s*next\\)`));
    }
  });

  it('⚠️⚠️ o POST não deixa o CORPO escolher o membro no caminho "pra si"', () => {
    // Sem isto, `membro_id` do body volta a mandar e o guard de posse vira
    // enfeite: eu me identifico como dono e gravo em nome de outra pessoa.
    const corpo = corpoDaFuncao(devocionais.limpo, 'escritaSoDoDono');
    expect(corpo, 'o caminho "pra si" deixou de comparar o alvo com o CONJUNTO do login')
      .toMatch(/alvo\s*===\s*meus\[0\]/);
    expect(corpo, '`req.devocionalMembroId` deixou de ser carimbado no caminho "pra si"')
      .toContain('req.devocionalMembroId');
    const bloco = blocoDaRota(devocionais.limpo, 'post', '/', 900);
    expect(bloco, 'o POST voltou a tirar `membro_id` direto do body sem passar pelo guard')
      .toMatch(/const\s+membro_id\s*=\s*req\.devocionalMembroId/);
  });

  it('⚠️⚠️ quem é o dono é um CONJUNTO — o resolvedor não escolhe UM por desempate do PostgREST', () => {
    // ⚠️ O 403 ao salvar o PRÓPRIO devocional (varredura 2026-09): `.limit(1)` sem
    // `order` escolhia um membro a esmo entre os que compartilham o e-mail, enquanto o
    // front resolvia por OUTRO caminho (`GET /pessoas/lookup` → `buscarCandidatos`) e
    // mandava outro `membro_id`. Medido: 44 e-mails repetidos alcançam 89 membros.
    const corpo = corpoDaFuncao(devocionais.limpo, 'membroIdsDoUsuario');
    expect(corpo, '`membroIdsDoUsuario` sumiu de devocionais.js').toBeTruthy();
    expect(corpo, 'o resolvedor voltou a ESCOLHER um membro (`.limit(1)`) — o 403 do próprio devocional volta')
      .not.toMatch(/\.limit\(/);
    expect(corpo, 'o resolvedor voltou a `.maybeSingle()` — com e-mail repetido isso devolve erro, não o dono')
      .not.toMatch(/maybeSingle/);
    expect(corpo, 'o resolvedor deixou de devolver o conjunto inteiro')
      .toMatch(/new Set\(/);
    expect(corpo, 'o filtro de cadastro vivo saiu do resolvedor')
      .toMatch(/\.is\('deleted_at', null\)/);
    expect(corpo, 'o erro da consulta voltou a ser engolido — "falhou" viraria "não é dono" em silêncio')
      .toMatch(/if \(error\) throw error/);
    expect(corpo, '`_` e `%` do e-mail voltaram a valer como CURINGA no ilike — arrasta cadastro de terceiro')
      .toMatch(/escapePostgrestValue/);
  });

  it('⚠️⚠️ o carimbo do dono SÓ existe quando o conjunto tem UM membro', () => {
    // ⚠️⚠️ MUTANTE FIEL: não é trocar operador — é APAGAR a guarda de tamanho e
    // carimbar `meus[0]` mesmo com N. É o que um dev bem-intencionado escreveria
    // ("já sei quem é o dono, é o primeiro"), e reintroduz exatamente o desempate
    // arbitrário: o devocional seria gravado no cadastro errado, com 201 na tela.
    const corpo = corpoDaFuncao(devocionais.limpo, 'escritaSoDoDono');
    expect(corpo, 'a guarda `meus.length === 1` sumiu — o carimbo volta a escolher um membro a esmo')
      .toMatch(/meus\.length\s*===\s*1/);
    // Com conjunto ambíguo o body TEM de ser explícito e pertinente — e sem carimbo.
    expect(corpo, 'o ramo ambíguo deixou de exigir o `membro_id` explícito do body com pertinência conferida')
      .toMatch(/meus\.length\s*>\s*1\s*&&\s*alvo\s*&&\s*meus\.includes\(alvo\)/);
  });

  it('⚠️ leitura e PUT/DELETE conferem PERTINÊNCIA no conjunto, não igualdade com um escolhido', () => {
    const leitura = corpoDaFuncao(devocionais.limpo, 'soDonoOuMatriz');
    expect(leitura, 'a leitura deixou de conferir o alvo contra o conjunto do login')
      .toMatch(/meus\.includes\(String\(alvo\)\)/);
    const registro = corpoDaFuncao(devocionais.limpo, 'registroSoDoDono');
    expect(registro, 'o PUT/DELETE deixou de conferir o dono da LINHA contra o conjunto do login')
      .toMatch(/meus\.includes\(String\(linha\.membro_id\)\)/);
  });

  it('⚠️ a trava é POR ROTA — devocionais.js NÃO tem router.use(authorizeModule)', () => {
    // Gate de bloco achataria /kpis e /stats (nível 1) na régua das nominais
    // (nível 2) e mataria o auto-atendimento do próprio membro.
    expect(devocionais.limpo, 'devocionais.js ganhou um gate de bloco — as réguas por rota somem')
      .not.toMatch(/router\.use\(\s*authorizeModule/);
    expect(devocionais.limpo, 'o `router.use(authenticate)` do topo sumiu — o arquivo ficou sem login')
      .toMatch(/router\.use\(authenticate\)/);
  });
});

// ── (b) A04 · DELETE com trilha + o POST que RESSUSCITA ──────────────────────

describe('⚠️⚠️ A04 · o DELETE virou soft — e por isso o POST precisa ressuscitar', () => {
  it('DELETE /:id chama `app_soft_delete` e NÃO `.delete()`', () => {
    expect(devocionais.limpo, 'o DELETE deixou de usar a RPC de soft-delete com trilha')
      .toMatch(/supabase\.rpc\(\s*'app_soft_delete'/);
    expect(devocionais.limpo, 'a RPC deixou de apontar pra `mem_devocionais`')
      .toMatch(/p_table_name:\s*'mem_devocionais'/);
    // A tabela está na whitelist `app_soft_deletable_tables` (migration
    // 20260521180000): delete físico aqui apagava sem trilha e sem volta.
    expect(devocionais.limpo, 'voltou o DELETE FÍSICO em mem_devocionais')
      .not.toMatch(/from\('mem_devocionais'\)[\s\S]{0,200}?\.delete\(\)/);
  });

  /**
   * ⚠️⚠️ MEDIDO EM PRODUÇÃO (09/2026): `uq_mem_devocionais_dia` (migration
   * 20260430130000, linha 59) é
   *   `CREATE UNIQUE INDEX ... ON mem_devocionais(membro_id, data_devocional, tipo)`
   * — SEM `WHERE deleted_at IS NULL`. Não é índice parcial. A linha soft-deletada
   * CONTINUA ocupando a chave.
   *
   * Consequência sem o ramo de ressuscitar: quem apagasse o próprio devocional
   * de hoje nunca mais salvaria naquela data — a lista (que filtra `deleted_at`)
   * aparece VAZIA e o POST responde 409 "já registrado". A tela dizendo duas
   * coisas contrárias. Com DELETE físico isso não acontecia: a trilha não pode
   * custar o fluxo.
   */
  it('⚠️⚠️ o POST tem o ramo de RESSUSCITAR no 23505 (o índice único NÃO é parcial)', () => {
    // 4500 e não 3000: o ramo de ressuscitar é longo e o 409 mora DEPOIS dele —
    // com a janela curta o teste falhava por recorte, não por regressão.
    const bloco = blocoDaRota(devocionais.limpo, 'post', '/', 4500);
    expect(bloco, 'o POST / sumiu de devocionais.js').toBeTruthy();
    expect(bloco, 'o tratamento de 23505 sumiu do POST').toContain("'23505'");
    expect(bloco, 'o POST perdeu o ramo que revive a linha soft-deletada — o dia fica TRANCADO pra sempre')
      .toMatch(/deleted_at:\s*null/);
    expect(bloco, 'a revivida deixou de conferir que a linha estava MORTA — trava de corrida')
      .toMatch(/\.not\(\s*'deleted_at',\s*'is',\s*null\s*\)/);
    expect(bloco, 'o 409 sumiu — conflito com linha VIVA precisa continuar sendo conflito')
      .toContain('409');
    expect(bloco, 'a revivida deixou de responder 201 (pro cliente é criação)').toContain('201');
  });
});

// ── (c) A04 · nenhum leitor de mem_devocionais conta linha apagada ───────────

/**
 * Recorta cada cadeia que TOCA `mem_devocionais`, andando com a PROFUNDIDADE de
 * parênteses e parando no primeiro `,` ou `;` de nível zero.
 *
 * ⚠️⚠️ A primeira versão cortava no próximo `;` (com teto de 900 caracteres) e
 * era FALSAMENTE PERMISSIVA: em `membresia.js` e `devocionalPlanos.js` as
 * leituras vivem lado a lado dentro de um `Promise.all([...])`, separadas por
 * VÍRGULA — o recorte engolia as consultas seguintes e o `.is('deleted_at',
 * null)` de OUTRA tabela contava como filtro desta. Provado com mutante: tirar
 * o filtro de `membresia.js:1008` passava despercebido.
 */
function cadeiasDevocionais(limpo: string): Array<{ linha: number; texto: string }> {
  // ⚠️⚠️ varredura 2026-09 (rodada 2): a lista de VERBOS também era fixa
  // (`.from` / `fetchAll` / `fetchAllPaginado`) e deixava DOIS leitores de fora —
  // `services/jornadaEngajamento.js` lê por `fetchMembroSet(...)` e
  // `services/jornadaMarcadores.js` por `idsPresentes(...)`. Agora casa QUALQUER
  // chamada que receba 'mem_devocionais' como primeiro argumento: o nome do helper
  // muda, o leitor continua sendo leitor.
  const re = /\w+\(\s*'mem_devocionais'/g;
  const marcas: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(limpo))) marcas.push(m.index);
  const TETO = 1200; // rede de segurança: nenhuma cadeia do repo chega perto
  return marcas.map((i) => {
    let nivel = 0;
    let fim = Math.min(limpo.length, i + TETO);
    for (let k = i; k < limpo.length && k < i + TETO; k++) {
      const c = limpo[k];
      if (c === '(' || c === '[' || c === '{') nivel++;
      else if (c === ')' || c === ']' || c === '}') {
        nivel--;
        if (nivel < 0) { fim = k; break; }
      } else if ((c === ',' || c === ';') && nivel === 0) { fim = k + 1; break; }
    }
    return { linha: limpo.slice(0, i).split('\n').length, texto: limpo.slice(i, fim) };
  });
}

/**
 * Todo `.js` de `backend/` (menos `node_modules`). É a diferença entre guarda que
 * protege o que alguém LEMBROU e guarda que protege o que EXISTE.
 */
function varrerJsDoBackend(): string[] {
  const saida: string[] = [];
  const anda = (rel: string) => {
    for (const e of readdirSync(resolve(RAIZ, rel), { withFileTypes: true })) {
      const filho = `${rel}/${e.name}`;
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
        anda(filho);
      } else if (e.isFile() && e.name.endsWith('.js')) {
        saida.push(filho);
      }
    }
  };
  anda('backend');
  return saida;
}

const JS_DO_BACKEND = varrerJsDoBackend();
const LEITORES_DEVOCIONAIS = JS_DO_BACKEND
  .map((caminho) => ({
    caminho,
    cadeias: cadeiasDevocionais(semComentariosJs(readFileSync(resolve(RAIZ, caminho), 'utf8'))),
  }))
  .filter((f) => f.cadeias.length > 0);

/**
 * Cadeia que PODE ler linha apagada, com o motivo escrito. Fica VAZIA de propósito:
 * hoje nenhum leitor de `mem_devocionais` tem desculpa pra contar check-in apagado.
 * Quem precisar de uma entrada aqui escreve o porquê — e o `it` logo abaixo derruba
 * a entrada que parar de casar, pra a lista não virar depósito de exceção morta.
 */
const LISTA_BRANCA_DEVOCIONAIS: Array<{ arquivo: string; contem: string; porque: string }> = [];

function naListaBranca(caminho: string, texto: string) {
  return LISTA_BRANCA_DEVOCIONAIS.find((b) => caminho.endsWith(b.arquivo) && texto.includes(b.contem));
}

describe('⚠️⚠️ A04 · todo LEITOR de mem_devocionais filtra `deleted_at`', () => {
  // Com o DELETE soft e um leitor sem filtro, a mesma pessoa aparece contada
  // num painel e sumida em outro — e o KPI KID-04 conta check-in apagado.
  //
  // ⚠️⚠️ varredura 2026-09 (rodada 2): LISTA FIXA NÃO SERVE AQUI. A primeira versão
  // desta guarda enumerava CINCO arquivos à mão — os cinco que o lote tinha aberto —
  // e por isso não enxergou os outros OITO leitores de `mem_devocionais` que já
  // moravam no `backend/` (`painel.js`, `kpis.js`, `governanca.js`, `jornada.js`,
  // `lgpd.js`, `kpiAutoCollector.js`, `jornadaEngajamento.js`, `jornadaMarcadores.js`).
  // Guarda com lista à mão só protege o que alguém lembrou de escrever na lista, e o
  // leitor NOVO — que é justamente o que vai regredir — nasce fora dela.

  it('a varredura andou no backend inteiro (senão TODO `it` daqui passa por vacuidade)', () => {
    expect(JS_DO_BACKEND.length, 'a varredura de backend/**/*.js não achou arquivo — o walker quebrou')
      .toBeGreaterThan(50);
    expect(JS_DO_BACKEND, 'a varredura não alcança backend/services — só olhou routes?')
      .toContain('backend/services/kpiAutoCollector.js');
  });

  it('⚠️⚠️ a varredura vê MAIS que os 5 arquivos do lote — é este o buraco que ela fecha', () => {
    const CINCO_DO_LOTE = [
      'backend/routes/devocionais.js',
      'backend/routes/devocionalMembro.js',
      'backend/routes/cuidados.js',
      'backend/routes/devocionalPlanos.js',
      'backend/routes/membresia.js',
    ];
    const achados = LEITORES_DEVOCIONAIS.map((f) => f.caminho);
    for (const c of CINCO_DO_LOTE) {
      expect(achados, `${c} sumiu da varredura — o recorte de cadeia quebrou`).toContain(c);
    }
    const foraDaListaAntiga = achados.filter((c) => !CINCO_DO_LOTE.includes(c));
    expect(
      foraDaListaAntiga.length,
      'a varredura só alcançou os 5 arquivos da lista antiga — ela não está varrendo nada',
    ).toBeGreaterThanOrEqual(6);
  });

  for (const f of LEITORES_DEVOCIONAIS) {
    it(`${f.caminho} — nenhum leitor sem filtro`, () => {
      const semFiltro: string[] = [];
      for (const c of f.cadeias) {
        // ESCRITA não é leitor: `insert` não lê nada, e `update` é sempre
        // chaveado por `id` de uma linha que a cadeia ACIMA já leu (filtrada).
        // Os UPDATEs que importam têm `it` PRÓPRIO logo abaixo — este laço não
        // pode virar a única guarda deles, senão o alívio vira buraco.
        if (/\.insert\(|\.update\(/.test(c.texto)) continue;
        // A busca do CONFLITO no 23505 tem de enxergar a linha morta — é
        // justamente ela que a rota vai ressuscitar. Reconhecida pela coluna
        // `deleted_at` no select (a rota LÊ o campo pra decidir).
        if (/\.select\(\s*'id,\s*deleted_at'/.test(c.texto)) continue;
        if (/\.is\(\s*'deleted_at',\s*null\s*\)/.test(c.texto)) continue;
        if (naListaBranca(f.caminho, c.texto)) continue;
        semFiltro.push(`L${c.linha}: ${c.texto.replace(/\s+/g, ' ').slice(0, 160)}`);
      }
      expect(
        semFiltro,
        `${f.caminho} lê mem_devocionais sem \`.is('deleted_at', null)\` — o DELETE virou soft, ` +
          'então esse leitor conta check-in APAGADO e diverge da lista do módulo',
      ).toEqual([]);
    });
  }

  it('nenhuma entrada da lista branca está sobrando (exceção morta vira buraco esquecido)', () => {
    const orfas = LISTA_BRANCA_DEVOCIONAIS.filter(
      (b) => !LEITORES_DEVOCIONAIS.some((f) => f.caminho.endsWith(b.arquivo) && f.cadeias.some((c) => c.texto.includes(b.contem))),
    );
    expect(orfas.map((b) => `${b.arquivo} :: ${b.contem}`), 'entrada de lista branca que não casa com nenhuma cadeia — remover')
      .toEqual([]);
  });

  it('⚠️ o UPDATE do PUT /:id também filtra — editar não pode RESSUSCITAR pelo caminho errado', () => {
    // O laço acima pula `.update(` de propósito (escrita não é leitor), então
    // este é o `it` que segura o único update que precisa do filtro: sem ele, o
    // PUT reescreve uma linha soft-deletada e ela volta à vida sem passar pelo
    // ramo do 23505 — que é quem carimba `concluida` e `created_by` de novo.
    const bloco = blocoDaRota(devocionais.limpo, 'put', '/:id', 1200);
    expect(bloco, 'PUT /:id sumiu de devocionais.js').toBeTruthy();
    expect(bloco, 'o UPDATE do PUT deixou de filtrar `deleted_at` — edita (e revive) linha apagada')
      .toMatch(/\.update\(patch\)[\s\S]{0,200}?\.is\(\s*'deleted_at',\s*null\s*\)/);
  });
});

// ── (d) AG-01 · agents.js — o rastro do agente não é público-pra-quem-logou ──

describe('⚠️⚠️ AG-01 · agents.js — leitura de run exige admin/diretor', () => {
  const AG_ROTAS: Array<[string, string, string]> = [
    ['get', '/runs', 'lista das execuções do agente'],
    ['get', '/runs/:id', 'detalhe da run — `config` e `findings` crus (6 runs com CPF dentro)'],
    ['get', '/runs/:id/steps', '`response_text` tem 15 CPFs válidos e 59 telefones'],
    ['get', '/stats', 'custo e volume das execuções'],
    ['get', '/scores', 'lê `config` e `findings` das runs'],
  ];

  for (const [metodo, caminho, porque] of AG_ROTAS) {
    it(`${metodo.toUpperCase()} ${caminho} exige admin/diretor — ${porque}`, () => {
      const linha = linhaDaRota(agents.limpo, metodo, caminho);
      expect(linha, `${metodo.toUpperCase()} ${caminho} sumiu de agents.js`).toBeTruthy();
      expect(linha, `${metodo.toUpperCase()} ${caminho} ficou legível por qualquer autenticado — ${porque}`)
        .toMatch(/authorize\('admin',\s*'diretor'\)/);
    });
  }

  it('⚠️ GET /runs/:id não volta ao `select(*)` — `config` e `findings` ficam fora do payload', () => {
    const bloco = blocoDaRota(agents.limpo, 'get', '/runs/:id', 700);
    expect(bloco, 'GET /runs/:id sumiu').toBeTruthy();
    expect(bloco, 'o detalhe da run voltou a devolver a linha crua (config/findings com CPF)')
      .not.toMatch(/from\('agent_runs'\)\s*\.select\('\*'\)/);
    expect(bloco, 'a lista explícita de colunas sumiu').toMatch(/select\('id,\s*agent_type/);
  });

  it('o `router.use(requireDev)` continua de pé — o guard por rota é o SEGUNDO cadeado', () => {
    // O guard por rota existe porque uma rota nova declarada ANTES daquela
    // linha nasceria aberta; ele não substitui o bloco, soma com ele.
    expect(agents.limpo, 'o requireDev de bloco sumiu de agents.js').toMatch(/router\.use\(requireDev\)/);
  });
});

// ── (e) RHP-11 · rh.js — decidir férias saiu do piso 2 ───────────────────────

describe('⚠️⚠️ RHP-11 · rh.js — aprovar/rejeitar férias tem guard PRÓPRIO', () => {
  it('PATCH /ferias/:id passa por `podeDecidirFerias()`', () => {
    const linha = linhaDaRota(rh.limpo, 'patch', '/ferias/:id');
    expect(linha, 'PATCH /ferias/:id sumiu de rh.js').toBeTruthy();
    expect(linha, 'decidir férias voltou a rodar no piso 2 herdado do router.use')
      .toMatch(/,\s*podeDecidirFerias\(\)\s*,/);
  });

  /**
   * ⚠️ MEDIDO EM PRODUÇÃO (09/2026): os ÚNICOS cargos com nível em `rh` são
   * Dir RH = 5, Coord Estratégico = 5 e Coord Financ = 4. NINGUÉM está em nível
   * 2 nem 3 — a trava não tira a decisão de ninguém que decide hoje.
   *
   * As duas réguas SOMAM (a LEI do `podeVerFilaCadastros`): o gestor direto do
   * funcionário OU a matriz em nível 3. Gatear só pela matriz daria 403 no
   * gestor legítimo, que é justamente quem a RLS do banco
   * (`rh_ferias_licencas_update` → `user_is_lider_de`) autoriza a aprovar — e a
   * RLS nunca vale nesta rota, porque o backend fala por service_role.
   */
  it('⚠️⚠️ o guard SOMA gestor direto + matriz nível 3 — não é pass-through nem só-matriz', () => {
    const corpo = corpoDaFuncao(rh.limpo, 'podeDecidirFerias');
    expect(corpo, '`podeDecidirFerias` sumiu de rh.js').toBeTruthy();
    expect(corpo, 'a matriz saiu do guard — sobrou só o gestor direto').toContain("authorizeModule('rh', 3)");
    expect(corpo, 'o guard deixou de cair na matriz quando não é o gestor — virou pass-through')
      .toMatch(/return\s+guardMatriz\(req,\s*res,\s*next\)/);
    expect(corpo, 'o atalho do gestor direto sumiu — o gestor legítimo vai tomar 403')
      .toMatch(/ehGestorDaFerias\(req,\s*req\.params\.id\)/);
    const gestor = corpoDaFuncao(rh.limpo, 'ehGestorDaFerias');
    expect(gestor, '`ehGestorDaFerias` sumiu').toBeTruthy();
    expect(gestor, 'a checagem de gestor deixou de comparar com o `gestor_id` do dono da linha')
      .toMatch(/gestor_id/);
  });

  it('⚠️ `aprovado_por` vem do TOKEN e nunca fica nulo quando o status muda', () => {
    // As 53 aprovações históricas estão com `aprovado_por` NULL e não provam
    // quem autorizou. O decisor não pode voltar a sair do body.
    const bloco = blocoDaRota(rh.limpo, 'patch', '/ferias/:id', 1400);
    expect(bloco, 'o carimbo do decisor sumiu').toMatch(/patch\.aprovado_por\s*=\s*decisor/);
    // ⚠️⚠️ varredura 2026-09 (rodada 2): esta asserção era VACUAMENTE VERDE — foi o
    // único mutante SOBREVIVENTE dos 18 do revisor. Ela procurava o texto
    // `aprovado_por = req.body`, e o mutante realista não escreve isso: escreve
    // `const decisor = req.body?.aprovado_por || null;` e deixa o
    // `patch.aprovado_por = decisor` intacto — o decisor volta a vir do CORPO e os 53
    // casos seguem verdes. O que prova a régua é a ORIGEM do `decisor`, afirmada por
    // POSITIVO; a negativa fica como rede, agora larga o bastante pra pegar qualquer
    // `decisor`/`aprovado_por` nascido de `req.body`.
    expect(bloco, 'o `decisor` deixou de nascer do TOKEN (`req.user`) — é ele que prova quem autorizou')
      .toMatch(/const\s+decisor\s*=\s*req\.user\?\.(?:userId|id)\b/);
    expect(bloco, 'o decisor voltou a poder vir do corpo da requisição')
      .not.toMatch(/(?:decisor|aprovado_por)\s*=\s*req\.body/);
    expect(bloco, 'sumiu a recusa quando não dá pra identificar o decisor').toContain('401');
  });

  it('⚠️ a trava é POR ROTA — o router.use de rh.js continua no piso de entrada', () => {
    const usos = rh.limpo.match(/router\.use\(\s*authenticate,\s*authorizeModule\('rh'[^)]*\)/g) || [];
    for (const u of usos) {
      expect(u, 'o gate de bloco ganhou nível — isso fecha o self-service (`/meus-*`) da equipe inteira')
        .not.toMatch(/'rh',\s*[3-5]/);
    }
  });
});

// ── (f) G02 · grupos.js — aceitando inscrição exige dono ─────────────────────

describe('⚠️⚠️ G02 · grupos.js — as 3 portas de escrita recusam "aceitando" sem líder', () => {
  it('a mensagem única existe (régua igual nas 3 portas)', () => {
    expect(grupos.limpo, 'a constante da mensagem sumiu — a régua vai divergir porta a porta')
      .toMatch(/const\s+ERRO_ACEITANDO_SEM_LIDER\s*=/);
  });

  /**
   * ⚠️ MEDIDO EM PRODUÇÃO (09/2026): 109 grupos estão `aceitando_inscricoes`
   * hoje e exatamente UM está sem `lider_id` (JIU-JITSU, 98a2571b) — e esse um
   * tem ZERO líder no roster (`mem_grupo_membros` função=lider, `saiu_em` null)
   * e ZERO supervisor. A trava não esvazia lista nenhuma: 109 viram 108.
   *
   * Grupo SEM líder CONTINUA podendo existir (a coordenação cria antes de
   * definir quem lidera, e o /kpis/prontidao conta isso). O que não pode é
   * ficar ACEITANDO INSCRIÇÃO sem dono: aí o pedido nasce sem ninguém pra
   * receber o aviso, o link de aprovação nem é gerado, e a pessoa recebe
   * "inscrição confirmada".
   */
  const PORTAS: Array<[string, string, string]> = [
    ['post', '/', 'criar grupo — o form nasce com aceitando_inscricoes=true'],
    ['put', '/:id', 'o PUT é update COMPLETO: `d.lider_id` é a palavra final (é por aqui que o botão Reativar passa)'],
    ['patch', '/:id/aceitando', 'o atalho "retomar inscrições" reabria grupo sem líder'],
  ];

  for (const [metodo, caminho, porque] of PORTAS) {
    it(`${metodo.toUpperCase()} ${caminho} recusa 400 — ${porque}`, () => {
      const bloco = blocoDaRota(grupos.limpo, metodo, caminho, 1500);
      expect(bloco, `${metodo.toUpperCase()} ${caminho} sumiu de grupos.js`).toBeTruthy();
      expect(bloco, `${metodo.toUpperCase()} ${caminho} ficou sem a trava — a régua vale em 2 portas de 3`)
        .toContain('ERRO_ACEITANDO_SEM_LIDER');
      expect(bloco, `${metodo.toUpperCase()} ${caminho} deixou de devolver 400`).toContain('400');
      expect(bloco, `${metodo.toUpperCase()} ${caminho} perdeu o código que o front usa pra apontar o campo`)
        .toContain("codigo: 'aceitando_sem_lider'");
    });
  }

  it('⚠️ PAUSAR grupo sem líder continua livre — a trava só olha quando está LIGANDO', () => {
    // É justamente o conserto que a coordenação vai fazer nos pedidos parados:
    // se pausar exigisse líder, o único caminho de saída fecharia junto.
    const bloco = blocoDaRota(grupos.limpo, 'patch', '/:id/aceitando', 1200);
    expect(bloco, 'a consulta do líder deixou de ser condicionada a `aceitando`')
      .toMatch(/if\s*\(aceitando\)\s*\{/);
  });

  it('as 3 portas continuam exigindo grupos >= 3 (a trava nova não substituiu o gate)', () => {
    for (const [metodo, caminho] of PORTAS) {
      const linha = linhaDaRota(grupos.limpo, metodo, caminho);
      expect(linha, `${metodo.toUpperCase()} ${caminho} perdeu o gate de módulo`)
        .toContain("authorizeModule('grupos', 3)");
    }
  });
});

// ── (g) Lei nº 2 · routeKey fora do mapa desliga a matriz EM SILÊNCIO ────────

describe('⚠️⚠️ toda routeKey do lote 6 existe no ROUTE_MODULE_MAP', () => {
  // Chave fora do mapa faz `authorizeModule` cair no nível padrão do CARGO e
  // desliga a matriz sem erro nenhum (caso `links`, 17/08/2026).
  //
  // ⚠️ ORDEM: recorta o bloco do texto CRU e SÓ DEPOIS limpa. Limpar antes
  // quebra o fecho `\n};` do objeto; não limpar deixaria uma chave COMENTADA
  // passar como se estivesse ativa.
  const bloco = auth.cru.match(/const\s+ROUTE_MODULE_MAP\s*=\s*\{([\s\S]*?)\n\};/);
  const mapa = semComentariosJs(bloco?.[1] || '');

  it('o ROUTE_MODULE_MAP foi encontrado e tem conteúdo', () => {
    expect(bloco, 'a forma do ROUTE_MODULE_MAP mudou — atualizar o recorte').toBeTruthy();
    expect(mapa).toMatch(/['"]membresia['"]\s*:/);
  });

  it("⚠️⚠️ a entrada `devocionais` existe e aponta pras DUAS portas medidas (cuidados + membresia)", () => {
    // A tela mora na aba Devocionais de Cuidados (Cuidados.tsx) E o histórico
    // por pessoa é lido na ficha da Membresia (Membresia.jsx). Gatear só por
    // `cuidados` daria 403 numa tela que a Membresia sempre pôde abrir; sem
    // entrada nenhuma, `moduleNames` vem vazio e a matriz desliga em silêncio.
    expect(mapa, "a entrada 'devocionais' sumiu do ROUTE_MODULE_MAP — a matriz desliga EM SILÊNCIO")
      .toMatch(/['"]devocionais['"]\s*:\s*\[[^\]]*['"]cuidados['"][^\]]*\]/);
    expect(mapa, "a entrada 'devocionais' perdeu `membresia` — a ficha da pessoa vai tomar 403")
      .toMatch(/['"]devocionais['"]\s*:\s*\[[^\]]*['"]membresia['"][^\]]*\]/);
  });

  it('⚠️⚠️ devocionais.js NÃO usa a routeKey ampla `membros`', () => {
    // `ROUTE_MODULE_MAP['membros']` cobre doze módulos: nível 2 em QUALQUER um
    // deles passaria. Prática devocional é convicção religiosa (LGPD art. 11);
    // produção, marketing e logística não têm o que ver ali.
    expect(devocionais.limpo, "devocionais.js passou a usar a chave ampla 'membros' — 12 módulos abrem o histórico")
      .not.toMatch(/authorizeModule\(\s*['"]membros['"]/);
  });

  const arquivos: Array<[string, string]> = [
    ['devocionais.js', devocionais.limpo],
    ['grupos.js', grupos.limpo],
    ['rh.js', rh.limpo],
  ];

  for (const [nome, limpo] of arquivos) {
    it(`${nome} — nenhuma chave órfã`, () => {
      const chaves = [...limpo.matchAll(/authorizeModule\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
      expect(chaves.length, `${nome} não usa authorizeModule — o recorte quebrou`).toBeGreaterThan(0);
      for (const chave of [...new Set(chaves)]) {
        expect(
          mapa,
          `${nome} usa a routeKey '${chave}', que NÃO está no ROUTE_MODULE_MAP — ` +
            'authorizeModule cai no nível padrão do cargo e a matriz desliga em silêncio',
        ).toMatch(new RegExp(`['"]${chave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\s*:`));
      }
    });
  }
});

// ── (h) AUTH-02 · auth.js — o ban do GoTrue vale, e a trava não é inerte ─────

/**
 * ⚠️⚠️ ESTA CORREÇÃO JÁ NASCEU INERTE UMA VEZ — é por isso que ela tem `it`
 * PRÓPRIO, e não só o comentário no fonte.
 *
 * A primeira versão da trava lia `user.banned_until` do objeto que
 * `supabase.auth.getUser(token)` acabou de devolver. MEDIDO com token real
 * (09/2026): `GET /auth/v1/user` — o endpoint que o `getUser` chama — NÃO traz
 * esse campo; ele só existe nos endpoints ADMIN. O valor vinha `undefined`,
 * `Date.parse(undefined)` é NaN, a comparação nunca era verdadeira, e a trava
 * nunca disparou. Nenhum erro, nenhum log: inerte em silêncio.
 *
 * Três mutantes passavam pelos 53 casos da rodada 1 — a correção inteira não
 * tinha UMA asserção:
 *   g1 · voltar pra `banidoAte = user.banned_until || null` (a versão inerte);
 *   g2 · desligar o `if` que compara com o agora e devolve 403;
 *   g3 · forçar `banidoAte = null` depois da leitura.
 * Os três `it` abaixo existem um pra cada.
 */
describe('⚠️⚠️ AUTH-02 · o banimento do GoTrue é lido do endpoint ADMIN (e não é enfeite)', () => {
  it('⚠️⚠️ a leitura vem de `auth.admin.getUserById`, NUNCA do `user` que o getUser devolveu', () => {
    // `semComentariosJs` é o que faz esta asserção valer: o comentário do
    // próprio conserto CITA `user.banned_until` como o jeito errado. Sem
    // limpar, a negativa aqui embaixo acusaria a EXPLICAÇÃO e a positiva
    // passaria com a trava inerte de volta.
    expect(auth.limpo, 'a chamada ao endpoint ADMIN sumiu — `banned_until` volta a vir sempre `undefined`')
      .toMatch(/supabase\.auth\.admin\.getUserById\(/);
    expect(auth.limpo, 'voltou a ler `user.banned_until` do getUser — esse campo NÃO existe nessa resposta (trava inerte)')
      .not.toMatch(/\buser\.banned_until\b/);

    // Uma inicialização (`null`) e UMA atribuição real, vinda da resposta admin.
    // Qualquer `banidoAte = null` a mais é o mutante g3 desarmando a trava.
    const atribuicoes = [...auth.limpo.matchAll(/\bbanidoAte\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
    expect(atribuicoes.length, 'o número de atribuições de `banidoAte` mudou — alguém desarmou (ou renomeou) a trava')
      .toBe(2);
    expect(atribuicoes[0], 'a inicialização de `banidoAte` deixou de ser `null` (campo ausente = NÃO banido)')
      .toBe('null');
    expect(atribuicoes[1], 'a atribuição de `banidoAte` deixou de vir da resposta do `getUserById` — a trava virou constante')
      .toMatch(/\?\.user\?\.banned_until/);
  });

  it('⚠️⚠️ o `if` compara com o AGORA e devolve 403 `banned_user`', () => {
    expect(auth.limpo, 'o `Date.parse` do `banned_until` sumiu — comparar string com número não decide nada')
      .toMatch(/Date\.parse\(banidoAte\)/);
    expect(
      auth.limpo,
      'a trava do ban parou de recusar: sem o `if` que compara com `Date.now()` e devolve 403 ' +
        "`banned_user`, banir no painel do Supabase volta a não fazer nada",
    ).toMatch(
      /if\s*\([\s\S]{0,120}?banidoAteMs\s*>\s*Date\.now\(\)[\s\S]{0,20}?\)\s*\{[\s\S]{0,400}?return\s+res\.status\(403\)[\s\S]{0,300}?reason:\s*'banned_user'/,
    );
  });

  it('⚠️ a checagem fica DEPOIS do cache de token — o round-trip admin só custa no cache-miss', () => {
    // Subir a chamada admin pra antes do cache transformaria 1 round-trip por
    // usuário POR MINUTO em 1 round-trip em TODA requisição do sistema.
    const iCacheGet = auth.limpo.indexOf('authUserCache.get(token)');
    const iCacheHit = auth.limpo.indexOf('return next();', iCacheGet);
    const iGetUser = auth.limpo.indexOf('supabase.auth.getUser(token)');
    const iAdmin = auth.limpo.search(/supabase\.auth\.admin\.getUserById\(/);
    expect(iCacheGet, 'o cache de auth por token sumiu de auth.js').toBeGreaterThan(-1);
    expect(iCacheHit, 'o atalho `return next()` do cache-hit sumiu').toBeGreaterThan(iCacheGet);
    expect(iAdmin, 'a checagem de ban sumiu de auth.js').toBeGreaterThan(-1);
    expect(iAdmin, 'a chamada admin subiu pra ANTES do cache-hit — passa a custar um round-trip em TODA requisição')
      .toBeGreaterThan(iCacheHit);
    expect(iAdmin, 'a checagem de ban subiu pra antes do `getUser` — ela precisa do `user.id` que ele resolve')
      .toBeGreaterThan(iGetUser);
  });
});

// ── (i) AG-05 · agentTasks.js — versionar a job description deixa trilha ─────

describe('⚠️⚠️ AG-05 · a troca da job description grava QUEM trocou', () => {
  it('PUT /team/:agentKey/instrucoes grava a trilha COM `await` e lê o `raw` anterior', () => {
    // ⚠️⚠️ O `await` é a correção, não detalhe de estilo: o backend roda
    // serverless e a função é CONGELADA no `res.json`. Trilha disparada sem
    // `await` some no meio do caminho — e o buraco é justamente o que este
    // conserto veio fechar (`created_by` só vive na linha nova, e o trigger de
    // audit não tem autor porque o backend fala por service_role).
    const bloco = corpoDaRota(agentTasks.limpo, 'put', '/team/:agentKey/instrucoes');
    expect(bloco, 'PUT /team/:agentKey/instrucoes sumiu de agentTasks.js').toBeTruthy();

    const chamadas = [...bloco.matchAll(/(await\s+)?registrarTrilhaInstrucao\s*\(/g)];
    expect(chamadas.length, 'a rota parou de chamar a trilha do versionamento — a troca volta a ser anônima')
      .toBe(1);
    expect(chamadas[0][1], 'a trilha perdeu o `await` — o serverless congela no `res.json` e a gravação se perde')
      .toBeTruthy();

    // Sem `raw_instrucoes` no select da versão anterior, a trilha grava o diff
    // com o lado ANTIGO vazio: dá pra ver que mudou, não dá pra ver de quê pra quê.
    expect(bloco, 'o `select` da versão anterior perdeu `raw_instrucoes` — o diff da trilha fica sem o lado antigo')
      .toMatch(/from\('agent_instrucoes'\)[\s\S]{0,200}?\.select\('versao,\s*raw_instrucoes'\)/);

    // ⚠️ `corpoDaFuncao` NÃO serve aqui: o parâmetro é desestruturado
    // (`{ agentKey, linha, ... }`), então a primeira `{` que ele acha é a da
    // assinatura e o balanceamento fecha ANTES do corpo — a asserção passaria
    // por vacuidade sobre uma string de 90 caracteres. Janela, então.
    const iTrilha = agentTasks.limpo.search(/function\s+registrarTrilhaInstrucao\s*\(/);
    expect(iTrilha, '`registrarTrilhaInstrucao` sumiu de agentTasks.js').toBeGreaterThan(-1);
    const corpo = agentTasks.limpo.slice(iTrilha, iTrilha + 1400);
    expect(corpo, 'a trilha deixou de gravar em `app_audit_log` (imutável · só super-admin lê)')
      .toMatch(/from\('app_audit_log'\)\s*\.insert\(/);
    expect(corpo, 'a trilha deixou de guardar o diff de `raw_instrucoes`').toMatch(/raw_instrucoes:\s*\{/);
    expect(corpo, 'a trilha deixou de ser best-effort — falhar a trilha não pode derrubar o versionamento já gravado')
      .toMatch(/catch\s*\(/);
  });
});

// ── (j) AUTH-02 · permissoes.js — o gesto ÚNICO de ligar/desligar acesso ─────

describe('⚠️⚠️ AUTH-02 · PUT /usuario/:id/ativo é rota de CONTROLE DE ACESSO', () => {
  it('exige `podeMexerNoControleDeAcesso` (awaited) + `bloqueiaAutoEdicao` e estoura o cache de auth', () => {
    const bloco = corpoDaRota(permissoes.limpo, 'put', '/usuario/:id/ativo');
    expect(bloco, 'PUT /usuario/:id/ativo sumiu de permissoes.js — se foi renomeada, atualizar ESTE teste')
      .toBeTruthy();

    // ⚠️⚠️ O `await` é o mutante que passa despercebido: sem ele a chamada
    // devolve uma Promise, que é SEMPRE truthy, o `!` sempre dá false e o guard
    // libera todo mundo que passou pelo `router.use` — numa rota que liga e
    // desliga o acesso das pessoas.
    const chamadas = [...bloco.matchAll(/(await\s+)?podeMexerNoControleDeAcesso\s*\(/g)];
    expect(chamadas.length, 'a rota parou de exigir `podeMexerNoControleDeAcesso` — ativar/desativar cai no piso do router')
      .toBe(1);
    expect(chamadas[0][1], 'o `await` sumiu: a Promise é sempre truthy e o guard passa a liberar TODO MUNDO')
      .toBeTruthy();
    expect(bloco, 'o guard de controle de acesso deixou de recusar com 403')
      .toMatch(/podeMexerNoControleDeAcesso\(req\)\)\)\s*\{[\s\S]{0,240}?status\(403\)/);

    // Separação de funções · mesma régua do /role: ninguém liga/desliga a
    // própria conta (nem pra se destravar, nem pra se trancar por engano).
    expect(bloco, 'a trava de auto-edição sumiu — dá pra ativar/desativar a própria conta')
      .toMatch(/if\s*\(\s*bloqueiaAutoEdicao\(req[\s\S]{0,20}?\)\s*\)\s*\{[\s\S]{0,240}?status\(403\)/);

    // Sem estourar o cache, desativar alguém só faz efeito no próximo
    // cache-miss (até 60s) — e é justamente na hora do corte que isso importa.
    const iEscrita = bloco.search(/active:\s*ativo/);
    const iBust = bloco.indexOf('bustPermissionCaches()');
    expect(iEscrita, 'o UPDATE de `profiles.active` sumiu da rota').toBeGreaterThan(-1);
    expect(iBust, 'a rota parou de chamar `bustPermissionCaches()` — o corte só valeria no próximo cache-miss (60s)')
      .toBeGreaterThan(-1);
    expect(iBust, '`bustPermissionCaches()` foi pra ANTES da escrita — estoura o cache e logo em seguida repopula com o valor velho')
      .toBeGreaterThan(iEscrita);
  });
});
