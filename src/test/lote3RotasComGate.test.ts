import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { semComentariosJs } from './_semComentarios';

/**
 * ⚠️⚠️ POR QUE ESTE TESTE EXISTE (varredura 2026-09 · lote 3)
 *
 * O lote 3 fechou ~30 rotas em bloco em três arquivos e criou um mecanismo NOVO
 * (redação de campo no payload de RH). Nenhuma das duas coisas tinha regressão,
 * e as duas são do tipo que alguém reabre sem perceber: o gate é UMA palavra na
 * linha da rota, e a redação é UMA chamada de função no `res.json`.
 *
 *  · A05 `backend/routes/governanca.js` — `/tipos`, `/relatorio/:sigla` e
 *    `POST /relatorio/:sigla/observacoes` eram `authenticate` puro: qualquer
 *    conta logada (inclusive as 138 só-app) lia o DRE do mês, OKR, metas e
 *    orçamento de evento. As rotas `/cron/*` entram por SEGREDO e não podem
 *    ganhar guard de módulo (não têm `req.user`).
 *  · RHP-02 `backend/routes/logistica.js` — escrita/aprovação/delete herdando
 *    só o piso 2 do `router.use`.
 *  · RHP-03 `backend/routes/rh.js` — `select('*')` mandava cpf/salário/
 *    benefícios no JSON pra qualquer nível; quem escondia era só o FRONT.
 *
 * A verificação é POR TEXTO porque importar as rotas puxaria `utils/supabase` e
 * o gate roda sem as dependências de `backend/`.
 *
 * ⚠️ `semComentariosJs` (módulo compartilhado, não `.test.ts` de propósito) é
 * OBRIGATÓRIO aqui: os comentários do conserto CITAM as rotas, os níveis e até
 * `getEffectiveLevel` (o padrão que este teste existe pra PROIBIR) — sem limpar,
 * o próprio texto explicativo vira a evidência e o teste passa com o gate
 * AUSENTE (armadilha de 06/08/2026, já repetida).
 */

const RAIZ = resolve(__dirname, '..', '..');
const arq = (nome: string) => resolve(RAIZ, 'backend/routes', nome);

function carregar(nome: string) {
  const cru = readFileSync(arq(nome), 'utf8');
  return { cru, limpo: semComentariosJs(cru) };
}

const governanca = carregar('governanca.js');
const logistica = carregar('logistica.js');
const rh = carregar('rh.js');

/** Devolve a linha da declaração da rota (uma linha — é assim que o repo escreve). */
function linhaDaRota(limpo: string, metodo: string, caminho: string): string | undefined {
  const alvo = `router.${metodo}('${caminho}'`;
  return limpo.split('\n').find((l) => l.includes(alvo));
}

/** Corpo de uma `function nome(...)` declarada no topo do arquivo (chaves balanceadas). */
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

describe('sanidade do limpador — asserção negativa sobre texto comido passa por vacuidade', () => {
  for (const [nome, f] of Object.entries({ governanca, logistica, rh })) {
    it(`${nome}.js sobrevive a semComentariosJs`, () => {
      // O limpador PRESERVA comprimento (comentário vira espaço), então o que
      // se mede é código restante, não bytes.
      expect(f.limpo).toContain('router.');
      expect(f.limpo.replace(/\s+/g, ' ').length).toBeGreaterThan(500);
    });
  }
});

// ── A05 · governanca.js ──────────────────────────────────────────────────────

describe('⚠️⚠️ A05 · governanca.js — relatório e catálogo exigem o módulo, não só login', () => {
  it('os apelidos `rd`/`wr` apontam para governanca 1 (ler) e 3 (escrever)', () => {
    // Se alguém trocar o nível aqui, o gate continua "existindo" na linha de
    // cada rota e a régua muda em silêncio nas ~30 rotas de uma vez.
    expect(governanca.limpo).toMatch(/const\s+rd\s*=\s*authorizeModule\('governanca',\s*1\)/);
    expect(governanca.limpo).toMatch(/const\s+wr\s*=\s*authorizeModule\('governanca',\s*3\)/);
  });

  it('⚠️ `rd`/`wr` são declarados ANTES da primeira rota que os usa (TDZ derruba o router)', () => {
    // `const` não é hoisted: enquanto a declaração morava depois do último
    // builder, referenciá-la em `/tipos` ou `/relatorio/:sigla` estouraria
    // ReferenceError NO CARREGAMENTO do arquivo — o servidor inteiro não sobe.
    // Foi por isso que a declaração subiu pro topo; este `it` fixa a ordem.
    const decl = governanca.limpo.search(/const\s+rd\s*=\s*authorizeModule/);
    const primeiroUso = governanca.limpo.indexOf("router.get('/tipos'");
    expect(decl, 'a declaração de `rd` sumiu').toBeGreaterThan(-1);
    expect(primeiroUso, "GET /tipos sumiu de governanca.js").toBeGreaterThan(-1);
    expect(decl, '`rd` voltou a ser declarado DEPOIS da primeira rota que o usa — TDZ').toBeLessThan(primeiroUso);
    expect(
      (governanca.limpo.match(/const\s+rd\s*=\s*authorizeModule/g) || []).length,
      'existe MAIS DE UMA declaração de `rd` — a de baixo sombreia a de cima',
    ).toBe(1);
  });

  const GOV_ROTAS: Array<{ metodo: string; caminho: string; guard: string; porque: string }> = [
    {
      metodo: 'get',
      caminho: '/tipos',
      guard: 'rd',
      porque: 'catálogo das reuniões de governança — serve só a tela, que já exige nível 1',
    },
    {
      metodo: 'get',
      caminho: '/relatorio/:sigla',
      guard: 'rd',
      porque:
        'devolvia o DRE do mês (fin_contas, fin_transacoes, fin_contas_pagar, fin_reembolsos), ' +
        'OKRs, metas e orçamento de evento pra QUALQUER token válido',
    },
    {
      metodo: 'post',
      caminho: '/relatorio/:sigla/observacoes',
      guard: 'wr',
      porque: 'cria ciclo/reunião e grava observação da diretoria — mesma régua do botão de salvar (>= 3)',
    },
  ];

  for (const r of GOV_ROTAS) {
    it(`${r.metodo.toUpperCase()} ${r.caminho} passa por \`${r.guard}\` — ${r.porque}`, () => {
      const linha = linhaDaRota(governanca.limpo, r.metodo, r.caminho);
      expect(linha, `${r.metodo.toUpperCase()} ${r.caminho} sumiu de governanca.js — se foi renomeada, atualizar ESTE teste`).toBeTruthy();
      expect(linha, `${r.metodo.toUpperCase()} ${r.caminho} ficou SEM gate — ${r.porque}`)
        .toMatch(new RegExp(`,\\s*${r.guard}\\s*,`));
    });
  }

  it('⚠️⚠️ as rotas /cron/* continuam SEM guard de módulo — elas entram por SEGREDO', () => {
    // O `router.use` do topo pula `authenticate` quando o path é `/cron/*` E o
    // `CRON_SECRET` confere. Não há `req.user` nessas chamadas: pendurar `rd`/
    // `wr`/`authorizeModule` ali devolveria 401 e mataria o lembrete e o e-mail
    // da rotina — silenciosamente, porque quem falha é um cron.
    const crons = governanca.limpo
      .split('\n')
      .filter((l) => /^router\.(get|post|put|patch|delete)\('\/cron\//.test(l));
    expect(crons.length, 'as rotas /cron/* sumiram de governanca.js').toBeGreaterThanOrEqual(2);
    for (const linha of crons) {
      expect(linha, `rota de cron ganhou guard de módulo (vai tomar 401 — não há req.user): ${linha.trim()}`)
        .not.toMatch(/,\s*(rd|wr|authorizeModule\()/);
    }
    // E o skip por prefixo + segredo segue de pé (fail-closed).
    expect(governanca.limpo).toContain("req.path.startsWith('/cron/')");
    expect(governanca.limpo, 'o skip do cron deixou de exigir o segredo — virou porta aberta')
      .toContain('isAuthorizedCron(req)');
  });

  it('⚠️ a trava é POR ROTA — governanca.js não ganhou router.use(authorizeModule)', () => {
    // Gate global aqui pegaria as `/cron/*`, que passam sem `req.user`.
    expect(governanca.limpo).not.toMatch(/router\.use\(\s*authorizeModule/);
  });
});

// ── RHP-02 · logistica.js ────────────────────────────────────────────────────

/** Escritas de operação: criar/editar/conciliar/lançar — nível 3. */
const LOG_ESCRITA_3: Array<[string, string]> = [
  ['post', '/fornecedores'],
  ['put', '/fornecedores/:id'],
  ['post', '/fornecedores/enriquecer-incompletos'],
  ['post', '/fornecedores/:id/enriquecer'],
  ['post', '/pedidos'],
  ['put', '/pedidos/:id'],
  ['post', '/pedidos/:id/recebimento'],
  ['post', '/pedidos/:id/itens'],
  ['post', '/notas/escanear'],
  ['post', '/notas/importar-xml'],
  ['post', '/notas/importar-danfe'],
  ['post', '/notas'],
  ['put', '/notas/:id'],
  ['post', '/compras'],
  ['put', '/compras/:id'],
  ['post', '/compras/escanear'],
  ['post', '/compras/:id/vincular'],
  ['post', '/compras/:id/desvincular'],
  ['post', '/estoque/produtos'],
  ['patch', '/estoque/produtos/:id'],
  ['delete', '/estoque/produtos/:id'], // grava ativo=false · reversível, e o PATCH acima faz o mesmo em 3
  ['post', '/estoque/movimentacoes'],
  ['post', '/estoque/gerar-compra'],
];

/** Aprovação, dinheiro saindo e DELETE — nível 4 (o teto de quem opera). */
const LOG_APROVACAO_4: Array<[string, string, string]> = [
  ['post', '/compras/:id/aprovar', 'aprovar compra é o controle financeiro do módulo'],
  ['post', '/compras/:id/rejeitar', 'o outro lado da aprovação'],
  ['post', '/compras/importar', 'inserção em MASSA no ledger, chaveada por hash, que ninguém desfaz linha a linha'],
  ['post', '/notas/:id/enviar-financeiro', 'manda a nota pro financeiro LANÇAR (dinheiro saindo)'],
  ['delete', '/notas/:id', 'DELETE duro da COMPROVAÇÃO fiscal, sem trilha'],
  ['delete', '/fornecedores/:id', 'DELETE duro do cadastro que lastreia a nota, sem trilha'],
  ['delete', '/pedidos/:id', 'DELETE duro de registro operacional'],
  ['delete', '/itens/:id', 'linha do pedido — não adianta blindar o pai e deixar as linhas abertas'],
  ['delete', '/compras/:id', 'soft-delete COM trilha (app_soft_delete)'],
];

describe('⚠️ RHP-02 · logistica.js — escrita com gate PRÓPRIO na rota', () => {
  for (const [metodo, caminho] of LOG_ESCRITA_3) {
    it(`${metodo.toUpperCase()} ${caminho} exige logistica >= 3`, () => {
      const linha = linhaDaRota(logistica.limpo, metodo, caminho);
      expect(linha, `${metodo.toUpperCase()} ${caminho} sumiu de logistica.js`).toBeTruthy();
      expect(
        linha,
        `${metodo.toUpperCase()} ${caminho} herda só o piso 2 do router.use — a trava é POR ROTA (lei da casa, jornada.js:52-55)`,
      ).toContain("authorizeModule('logistica', 3)");
    });
  }

  for (const [metodo, caminho, porque] of LOG_APROVACAO_4) {
    it(`${metodo.toUpperCase()} ${caminho} exige logistica >= 4 — ${porque}`, () => {
      const linha = linhaDaRota(logistica.limpo, metodo, caminho);
      expect(linha, `${metodo.toUpperCase()} ${caminho} sumiu de logistica.js`).toBeTruthy();
      expect(linha, `${metodo.toUpperCase()} ${caminho} caiu de nível — ${porque}`)
        .toContain("authorizeModule('logistica', 4)");
    });
  }

  it('⚠️⚠️ NENHUMA rota do arquivo pede nível 5 — ninguém que OPERA logística tem 5', () => {
    // Medido em `cargo_modulo_permissao` (04/09/2026): `Lider Op`, `Lider Log`,
    // `Assist Log` e `Assist Op` têm 4 — esse é o TETO real de quem opera. Só
    // `Dir Estrat` e `Dev` têm 5, e nenhum dos dois usa a tela. Exigir 5 aqui
    // não é "mais rigor": é desligar a ação pra equipe inteira, e como os botões
    // de apagar são renderizados sem gate de front, vira 403 em botão visível.
    const linhas5 = logistica.limpo
      .split('\n')
      .map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => /authorizeModule\('logistica',\s*5\)/.test(l));
    expect(
      linhas5.map(([n, l]) => `L${n}: ${l.trim()}`),
      'rota de logística pedindo nível 5 — ninguém que opera o módulo alcança esse nível',
    ).toEqual([]);
  });

  it('o piso do arquivo continua sendo o router.use de nível 2 (entrar no módulo)', () => {
    expect(logistica.limpo).toContain("router.use(authenticate, authorizeModule('logistica'))");
  });

  it('⚠️ segregação de funções: quem registrou a compra não aprova a própria', () => {
    // LEI: ao endurecer um lado do fluxo, conferir o outro. Sem isto o nível 4
    // registra e aprova sozinho, e o gate de /aprovar vira enfeite.
    const i = logistica.limpo.indexOf("router.post('/compras/:id/aprovar'");
    expect(i).toBeGreaterThan(-1);
    // 2600 e nao 1800: a isencao da planilha (quem importa nao e quem comprou)
    // acrescentou comentario e a trava saiu da janela antiga — o teste falhava
    // por recorte, nao por regressao.
    const bloco = logistica.limpo.slice(i, i + 2600);
    expect(bloco, 'a trava de auto-aprovação sumiu').toMatch(/created_by\s*===\s*req\.user\.userId/);
    expect(bloco).toContain('403');
    // A planilha e ISENTA: o importador vira `created_by` de centenas de linhas
    // que ele nao comprou, e sem a isencao a fila inteira trava.
    expect(bloco, 'a isenção da planilha sumiu — o importador não consegue aprovar o que importou')
      .toMatch(/origem_registro\s*!==\s*'planilha'/);
  });

  it('⚠️⚠️ POST /compras NUNCA nasce `aprovada` — o corpo não decide isso', () => {
    // O outro lado do mesmo fluxo: com `status_aprovacao` vindo do corpo, um POST
    // direto contornava o /aprovar (e a segregação de funções junto). A régua é
    // FIXA — nada de recalcular nível aqui, que seria uma 2ª cópia do
    // `authorizeModule` divergindo da matriz no primeiro ajuste de cargo.
    const i = logistica.limpo.indexOf("router.post('/compras'");
    expect(i).toBeGreaterThan(-1);
    const bloco = logistica.limpo.slice(i, i + 1500);
    expect(bloco, 'o POST perdeu a fixação de `pendente`')
      .toMatch(/payload\.status_aprovacao\s*=\s*'pendente'\s*;/);
    expect(bloco, "o corpo da requisição voltou a decidir o `status_aprovacao`")
      .not.toMatch(/req\.body\s*(\?\.|\[)?\s*\??\.?status_aprovacao/);
    expect(bloco, 'o POST voltou a poder gravar `aprovada`').not.toContain("'aprovada'");
    expect(bloco, 'o registro manual deixou de carimbar quem criou (base da segregação)')
      .toMatch(/created_by\s*=\s*req\.user\.userId/);
  });
});

// ── RHP-03 · rh.js ───────────────────────────────────────────────────────────

describe('⚠️⚠️ RHP-03 · rh.js — a redação de CPF/salário existe e usa o nível do MÓDULO', () => {
  it('as três respostas de funcionário passam pela redação', () => {
    // `select('*')` + `res.json(data)` mandava cpf/salário/benefícios no payload;
    // o "•••" era só pintura do front (RH.jsx). Quem lê o JSON via devtools ou
    // via API pegava a folha inteira.
    const chamadas = (rh.limpo.match(/ocultarConfidenciaisRh\(req,/g) || []).length;
    expect(chamadas, 'a redação foi removida de alguma resposta (lista, ficha ou PUT)').toBeGreaterThanOrEqual(3);
    expect(rh.limpo, 'GET /funcionarios voltou a devolver a linha crua').toMatch(
      /res\.json\(ocultarConfidenciaisRh\(req,\s*data\)\)/,
    );
    expect(rh.limpo, 'a ficha (GET /funcionarios/:id) voltou a espalhar `...func` cru').toMatch(
      /\.\.\.ocultarConfidenciaisRh\(req,\s*func\)/,
    );
    expect(rh.limpo).toMatch(/function\s+ocultarConfidenciaisRh\s*\(/);
  });

  it('a lista de campos confidenciais cobre CPF e a folha — e NÃO cobre `observacoes`', () => {
    const i = rh.limpo.indexOf('const CAMPOS_RH_CONFIDENCIAIS');
    expect(i, 'CAMPOS_RH_CONFIDENCIAIS sumiu').toBeGreaterThan(-1);
    const lista = rh.limpo.slice(i, rh.limpo.indexOf('];', i));
    for (const campo of ['cpf', 'salario', 'remuneracao_bruta', 'custo_total_mensal', 'remuneracao_liquida']) {
      expect(lista, `\`${campo}\` saiu da lista de confidenciais`).toContain(`'${campo}'`);
    }
    // A caixa de Notas é editada por nível 2 e faz AUTOSAVE: ocultar o valor
    // apagaria a nota no primeiro caractere digitado. `status`/`data_demissao`
    // são só write-protected — a tela LISTA por eles.
    for (const campo of ['observacoes', 'status', 'data_demissao']) {
      expect(lista, `\`${campo}\` entrou na redação — isso QUEBRA a tela de RH`).not.toContain(`'${campo}'`);
    }
  });

  /**
   * ⚠️⚠️⚠️ O `it` MAIS IMPORTANTE DESTE ARQUIVO — foi o erro que os revisores acharam.
   *
   * `getEffectiveLevel(req, 'rh')` parte de `granular.cargoNivelLeitura`
   * (`cargos.nivel_padrao_leitura`) e só DEPOIS puxa pra cima com o módulo
   * (auth.js:759-772). Ou seja: quem tem padrão alto no CARGO passa mesmo SEM
   * linha nenhuma em `rh`. Medido em 04/09/2026: 10 cargos têm
   * `nivel_padrao_leitura >= 4` e OITO deles não têm linha em `rh` — Acesso
   * diretor, Acesso admin, Pastor Sr, Pastor Pres, Dir Geral, Dir Estrat,
   * Dir Mini, Dir Criat. Com `getEffectiveLevel`, a "redação" não redigia nada
   * pra esses oito: CPF e folha de pagamento inteira no payload, exatamente o
   * vazamento que o conserto dizia estar fechando.
   *
   * Quem OPERA rh não perde nada com a régua certa: Dir RH 5, Coord Estratégico
   * 5, Coord Financ 4 — e não há mais ninguém com linha em `rh`.
   */
  it('⚠️⚠️ a régua da redação é `modulePerms.rh`, NUNCA getEffectiveLevel', () => {
    const bloco = corpoDaFuncao(rh.limpo, 'ocultarConfidenciaisRh');
    expect(bloco, '`ocultarConfidenciaisRh` sumiu').toBeTruthy();

    // Segue a cadeia: a função de decisão chamada dentro da redação e, dela, a
    // função que resolve o nível. Sem seguir, trocar a régua UM salto acima
    // passaria despercebido.
    const chamada = /if\s*\(!payload\s*\|\|\s*(\w+)\(req\)\)/.exec(bloco);
    expect(chamada, 'a forma do guard da redação mudou — atualizar ESTE teste').toBeTruthy();
    const guarda = chamada![1];
    const corpoGuarda = corpoDaFuncao(rh.limpo, guarda);
    expect(corpoGuarda, `a função \`${guarda}\` não é declarada em rh.js`).toBeTruthy();

    const seguinte = /return\s+(\w+)\(req/.exec(corpoGuarda);
    const cadeia = [bloco, corpoGuarda, seguinte ? corpoDaFuncao(rh.limpo, seguinte[1]) : ''].join('\n');

    expect(
      cadeia,
      'a redação de CPF/salário voltou a usar getEffectiveLevel — ele parte do ' +
        '`nivel_padrao_leitura` do CARGO, e 8 cargos com padrão >= 4 NÃO têm linha ' +
        'em `rh`: pra eles a redação não redige nada',
    ).not.toContain('getEffectiveLevel');
    expect(cadeia, 'a régua deixou de ler o nível do MÓDULO rh').toMatch(/modulePerms\??\.?\??\.?\s*rh|modulePerms\?\.\brh\b/);
    expect(cadeia, 'a régua deixou de olhar `modulePerms`').toContain('modulePerms');
    expect(cadeia, 'o degrau da confidencialidade deixou de ser 4').toMatch(/>=\s*4/);
    // Nunca cair no nível padrão do cargo por outro caminho.
    expect(cadeia, 'voltou a usar o nível padrão do cargo').not.toMatch(/cargoNivel(Leitura|Escrita)/);
  });

  it('⚠️ a ESCRITA de remuneração usa a MESMA régua de módulo (as duas têm de somar)', () => {
    // LEI da casa: ao endurecer um lado, conferir o outro. Não adianta esconder
    // o salário na leitura e deixar os mesmos 8 cargos EDITANDO o salário.
    const corpo = corpoDaFuncao(rh.limpo, 'podeEditarRemuneracao');
    expect(corpo, '`podeEditarRemuneracao` sumiu').toBeTruthy();
    expect(corpo, 'a escrita de remuneração voltou a cair no nível padrão do cargo')
      .not.toContain('getEffectiveLevel');
    // E `cpf` entra na trava de escrita: sem isso o nível <4 abre a ficha SEM
    // CPF (redigido) e o PUT do formulário grava null por cima.
    const i = rh.limpo.indexOf('const CAMPOS_RH_SENSIVEIS');
    expect(i).toBeGreaterThan(-1);
    expect(rh.limpo.slice(i, rh.limpo.indexOf('];', i)), '`cpf` saiu dos campos write-protected — o PUT vai apagar o CPF')
      .toContain("'cpf'");
  });

  const RH_ROTAS: Array<{ metodo: string; caminho: string; nivel: number; porque: string }> = [
    { metodo: 'delete', caminho: '/documentos/:id', nivel: 3, porque: 'apaga contrato/RG/CPF digitalizado de qualquer colaborador' },
    { metodo: 'delete', caminho: '/extras/:id', nivel: 3, porque: 'delete HARD de escala extra paga (plantão)' },
    { metodo: 'put', caminho: '/config/:chave', nivel: 3, porque: 'config do MÓDULO (ex.: valor_extra_padrao de todo plantão pago)' },
    { metodo: 'get', caminho: '/kpis', nivel: 3, porque: 'headcount global + lista NOMINAL das admissões do mês, sem applyAccessFilter' },
    { metodo: 'delete', caminho: '/avaliacoes/:id', nivel: 4, porque: 'delete HARD de avaliação 360° (ciclo PCS) — a aba inteira é >= 4 no front' },
  ];

  for (const r of RH_ROTAS) {
    it(`${r.metodo.toUpperCase()} ${r.caminho} exige rh >= ${r.nivel} — ${r.porque}`, () => {
      const linha = linhaDaRota(rh.limpo, r.metodo, r.caminho);
      expect(linha, `${r.metodo.toUpperCase()} ${r.caminho} sumiu de rh.js`).toBeTruthy();
      expect(linha, `${r.metodo.toUpperCase()} ${r.caminho} rodava em nível 2 — ${r.porque}`)
        .toContain(`authorizeModule('rh', ${r.nivel})`);
    });
  }

  it('⚠️ a trava é POR ROTA — rh.js não ganhou router.use(authorizeModule) de nível alto', () => {
    // O piso do arquivo é o `router.use` de entrada no módulo; subir o nível ali
    // fecharia o self-service (`/meus-*`) e as leituras de escopo de área.
    const usos = rh.limpo.match(/router\.use\(\s*authenticate,\s*authorizeModule\('rh'[^)]*\)/g) || [];
    for (const u of usos) {
      expect(u, 'o gate de bloco ganhou nível — isso fecha a tela pra nível 2/3').not.toMatch(/'rh',\s*[3-5]/);
    }
  });
});

// ── Lei nº 2 · routeKey fora do mapa desliga a matriz EM SILÊNCIO ────────────

describe('⚠️⚠️ toda routeKey usada nos 3 arquivos existe no ROUTE_MODULE_MAP', () => {
  // Chave fora do mapa faz `authorizeModule` cair no nível padrão do CARGO e
  // desliga a matriz sem erro nenhum (caso `links`, 17/08/2026).
  //
  // ⚠️ ORDEM: recorta o bloco do texto CRU e SÓ DEPOIS limpa. Limpar antes
  // quebra o fecho `\n};` do objeto; não limpar deixaria uma chave COMENTADA
  // passar como se estivesse ativa.
  const auth = readFileSync(resolve(RAIZ, 'backend/middleware/auth.js'), 'utf8');
  const bloco = auth.match(/const\s+ROUTE_MODULE_MAP\s*=\s*\{([\s\S]*?)\n\};/);
  const mapa = semComentariosJs(bloco?.[1] || '');

  it('o ROUTE_MODULE_MAP foi encontrado e tem conteúdo', () => {
    expect(bloco, 'a forma do ROUTE_MODULE_MAP mudou — atualizar o recorte').toBeTruthy();
    expect(mapa).toMatch(/['"]membresia['"]\s*:/);
  });

  const arquivos: Array<[string, string]> = [
    ['governanca.js', governanca.limpo],
    ['logistica.js', logistica.limpo],
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

  it('⚠️ nenhum dos 3 usa a routeKey ampla `membros` em escrita ou lista de PII', () => {
    // `ROUTE_MODULE_MAP['membros']` cobre doze módulos: nível 2 em QUALQUER um
    // deles passaria. Amplo demais para PII (ficha de RH) e para escrita.
    for (const [nome, limpo] of arquivos) {
      expect(limpo, `${nome} passou a usar a chave ampla 'membros'`).not.toMatch(/authorizeModule\(\s*['"]membros['"]/);
    }
  });
});
