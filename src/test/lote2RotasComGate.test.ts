import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { semComentariosJs } from './_semComentarios';

/**
 * ⚠️⚠️ POR QUE ESTE TESTE EXISTE (varredura 2026-09 · lote 2)
 *
 * O lote 2 fechou rotas EM BLOCO em quatro arquivos e não trouxe regressão —
 * e fechar em bloco é exatamente o tipo de mudança que alguém reabre sem
 * perceber, porque o gate é UMA palavra na linha da rota. Achados:
 *
 *  · A02 `backend/routes/kpis.js` — seis LEITURAS de pessoa estavam com
 *    `authenticate` puro: decisões de culto (CPF, data_nascimento, responsável
 *    do menor) e as inscrições de batismo (CPF, nascimento,
 *    `possui_deficiencia`) — convicção religiosa + saúde, art. 11 da LGPD.
 *    O buscador ainda era um oráculo CPF→pessoa com PREFIXO de 5 dígitos.
 *  · A03 `backend/routes/grupos.js` — rotas de PII sem `authorizeModule`.
 *  · B08 `backend/routes/voluntariado.js` — escrita herdando só `membresia>=1`.
 *
 * A verificação é POR TEXTO porque importar as rotas puxaria `utils/supabase` e
 * o gate roda sem as dependências de `backend/`.
 *
 * ⚠️ `semComentariosJs` (módulo compartilhado, não `.test.ts` de propósito) é
 * OBRIGATÓRIO aqui: os comentários do conserto CITAM as rotas e as chaves que
 * eles explicam — sem limpar, o próprio texto explicativo vira a evidência e o
 * teste passa com o gate AUSENTE (armadilha de 06/08/2026, já repetida).
 */

const RAIZ = resolve(__dirname, '..', '..');
const arq = (nome: string) => resolve(RAIZ, 'backend/routes', nome);

function carregar(nome: string) {
  const cru = readFileSync(arq(nome), 'utf8');
  return { cru, limpo: semComentariosJs(cru) };
}

const kpis = carregar('kpis.js');
const grupos = carregar('grupos.js');
const voluntariado = carregar('voluntariado.js');
const tasks = carregar('tasks.js');

/** Devolve a linha da declaração da rota (uma linha — é assim que o repo escreve). */
function linhaDaRota(limpo: string, metodo: string, caminho: string): string | undefined {
  const alvo = `router.${metodo}('${caminho}'`;
  return limpo.split('\n').find((l) => l.includes(alvo));
}

describe('sanidade do limpador — asserção negativa sobre texto comido passa por vacuidade', () => {
  for (const [nome, f] of Object.entries({ kpis, grupos, voluntariado, tasks })) {
    it(`${nome}.js sobrevive a semComentariosJs`, () => {
      // O limpador PRESERVA comprimento (comentário vira espaço), então o que
      // se mede é código restante, não bytes.
      expect(f.limpo).toContain('router.');
      expect(f.limpo.replace(/\s+/g, ' ').length).toBeGreaterThan(500);
    });
  }
});

// ── A02 · kpis.js ────────────────────────────────────────────────────────────

/**
 * As SEIS leituras de pessoa e a chave que cada uma usa. O wrapper é nomeado
 * (não `authorizeModule` cru) porque a régua da leitura tem de SOMAR com a da
 * escrita: `authorizeIntegracao`/`authorizeBatismo` também aceitam
 * `profiles.kpi_areas`, fonte DIFERENTE do `usuario_areas` que alimenta a
 * matriz. Gatear só pela matriz daria 403 na LISTA ao dono legítimo do dado,
 * que continuaria com o botão de gravar.
 */
const LEITURAS_DE_PESSOA: Array<{ caminho: string; guard: string; porque: string }> = [
  {
    caminho: '/cultos/:id/decisoes-pessoas',
    guard: 'authorizeIntegracaoLeitura',
    porque: 'nome, CPF, data_nascimento e o responsável do menor de quem decidiu no culto',
  },
  {
    caminho: '/decisoes-pessoas/historico-importado',
    guard: 'authorizeIntegracaoLeitura',
    porque: 'CPF e nascimento de convertido importado',
  },
  {
    caminho: '/decisoes-pessoas/incompletos',
    guard: 'authorizeIntegracaoLeitura',
    porque: 'até 1.000 convertidos com CPF/nascimento',
  },
  {
    caminho: '/decisoes-pessoas/buscar-membro',
    guard: 'authorizeIntegracaoNominal',
    porque: 'resposta NOMINAL sobre a base inteira — régua de nível 2, como membresia/censo',
  },
  {
    caminho: '/batismos',
    guard: 'authorizeBatismoLeitura',
    porque: 'as inscrições de batismo com CPF, nascimento e possui_deficiencia',
  },
  {
    caminho: '/batismos/cobertura-convertidos',
    guard: 'authorizeBatismoLeitura',
    porque: 'nome e telefone de cada convertido ainda não batizado',
  },
];

describe('⚠️⚠️ A02 · kpis.js — leitura de pessoa exige módulo, não só login', () => {
  for (const r of LEITURAS_DE_PESSOA) {
    it(`GET ${r.caminho} passa por ${r.guard} — ${r.porque}`, () => {
      const linha = linhaDaRota(kpis.limpo, 'get', r.caminho);
      expect(linha, `GET ${r.caminho} sumiu de kpis.js — se foi renomeada, atualizar ESTE teste`).toBeTruthy();
      expect(linha, `GET ${r.caminho} ficou SEM gate — ${r.porque}`).toContain(r.guard);
    });
  }

  it('os três wrappers de leitura existem e apontam para as chaves decididas', () => {
    // Se alguém trocar a chave aqui, o gate continua "existindo" na linha da
    // rota e some em silêncio — por isso a chave é fixada separadamente.
    expect(kpis.limpo).toContain("authorizeModule('integracao', 1)");
    expect(kpis.limpo).toContain("authorizeModule('integracao', 2)");
    expect(kpis.limpo).toContain("authorizeModule('batismo-leitura', 1)");
    for (const w of ['authorizeIntegracaoLeitura', 'authorizeIntegracaoNominal', 'authorizeBatismoLeitura']) {
      expect(kpis.limpo, `wrapper ${w} não é mais declarado`).toMatch(new RegExp(`function\\s+${w}\\s*\\(`));
    }
  });

  it('⚠️ o wrapper SOMA com kpi_areas — sem isso o dono do dado toma 403 na lista', () => {
    // LEI da casa: réguas de fontes diferentes SOMAM. `_porAreaKpi` é o atalho
    // por `profiles.kpi_areas`, e o deny explícito por pessoa vence antes dele.
    expect(kpis.limpo).toMatch(/function\s+_porAreaKpi\s*\(/);
    expect(kpis.limpo).toContain('modulosBloqueados');
    for (const w of ['authorizeIntegracaoLeitura', 'authorizeIntegracaoNominal', 'authorizeBatismoLeitura']) {
      const i = kpis.limpo.indexOf(`function ${w}(`);
      expect(kpis.limpo.slice(i, i + 220), `${w} deixou de somar kpi_areas`).toContain('_porAreaKpi(req');
    }
  });

  it('⚠️ a trava é POR ROTA — kpis.js não ganhou router.use(authorizeModule)', () => {
    // `/dashboard`, `/cultura` e `/metas` são agregados sem PII e alimentam o
    // /painel: gate global aqui quebraria o painel de quem pode abri-lo.
    expect(kpis.limpo).not.toMatch(/router\.use\(\s*authorizeModule/);
  });
});

describe('⚠️⚠️ A02 · o buscador de membro não é mais oráculo de CPF', () => {
  // Bloco da rota: da declaração até a próxima declaração de rota.
  const inicio = kpis.limpo.indexOf("router.get('/decisoes-pessoas/buscar-membro'");
  const resto = kpis.limpo.slice(inicio + 10);
  const fim = inicio + 10 + resto.search(/\nrouter\.(get|post|put|patch|delete)\(/);
  const bloco = kpis.limpo.slice(inicio, fim);

  it('o bloco da rota foi isolado (senão todo assert abaixo é vácuo)', () => {
    expect(inicio).toBeGreaterThan(-1);
    expect(fim).toBeGreaterThan(inicio);
    expect(bloco).toContain('mem_membros');
  });

  it('exige CPF COMPLETO — 11 dígitos, não prefixo de 5', () => {
    // Com 5 dígitos, ~11 chamadas reconstroem qualquer CPF: era enumeração
    // documento→nome/telefone/nascimento sobre membros + visitantes do WiFi.
    expect(bloco).toMatch(/cpfLimpo\.length\s*===\s*11/);
    expect(bloco, 'voltou a aceitar prefixo de CPF').not.toMatch(/cpfLimpo\.length\s*>=\s*\d/);
  });

  it('⚠️ a BUSCA não exige DV, a ESCRITA exige — é decisão, não esquecimento', () => {
    // Quem mata a varredura por prefixo são os 11 DÍGITOS, não o dígito
    // verificador. Medido em `mem_membros` vivos: 2.073 têm CPF (50,8%) e 4 deles têm
    // DV INVÁLIDO (legado importado). Exigir DV na BUSCA faria o operador
    // digitar o CPF ditado, não achar ninguém e cadastrar decisão NOVA —
    // pessoa duplicada em vez de vínculo. No POST o CPF entra sob índice
    // UNIQUE, e um errado bloqueia o dono verdadeiro: lá o DV vale.
    //
    // ⚠️ Este `it` só é honesto porque o comentário saiu antes de casar: o
    // texto que EXPLICA a ausência cita `cpfValido` e passaria por evidência.
    expect(bloco, 'a busca voltou a exigir DV — ver os 4 CPFs de DV inválido no legado')
      .not.toContain('cpfValido(cpfLimpo)');
    const iPost = kpis.limpo.indexOf("router.post('/cultos/:id/decisoes-pessoas'");
    expect(kpis.limpo.slice(iPost, iPost + 6000), 'a ESCRITA perdeu a validação de DV')
      .toMatch(/cpfLimpo\.length\s*!==\s*11\s*\|\|\s*!cpfValido\(cpfLimpo\)/);
  });

  it('o payload NÃO devolve cpf nem data_nascimento — só os 2 últimos dígitos', () => {
    // Desambiguar homônimo não exige entregar o documento. O ramo do WiFi vale
    // dobrado: o visitante nunca consentiu com consulta de documento.
    expect(bloco).toContain('cpf_final');
    expect(bloco, 'data_nascimento voltou ao payload do buscador').not.toContain('data_nascimento');
    expect(bloco, 'o select do buscador voltou a puxar data_nascimento').not.toMatch(/select\([^)]*data_nascimento/);
    // `cpf:` como CHAVE de resposta (o `cpf` do filtro e do select seguem
    // existindo — é com ele que se casa o documento e se monta o cpf_final).
    expect(bloco, 'o campo `cpf` voltou ao objeto de resposta').not.toMatch(/\n\s*cpf:\s/);
  });

  it('⚠️ a ESCRITA compensa o buscador mascarado — a decisão não nasce vazia', () => {
    // LEI: endurecer a leitura obriga a conferir a escrita. Sem recompor do
    // CADASTRO, toda decisão de pessoa já vinculada cairia em
    // `/decisoes-pessoas/incompletos`. A fonte passa a ser o banco, não a tela.
    const i = kpis.limpo.indexOf("router.post('/cultos/:id/decisoes-pessoas'");
    expect(i).toBeGreaterThan(-1);
    const bloco2 = kpis.limpo.slice(i, i + 6000);
    expect(bloco2).toMatch(/nascLimpo/);
    expect(bloco2).toMatch(/select\('cpf,\s*data_nascimento'\)/);
    expect(bloco2, 'a escrita perdeu o gate de Integração').toContain('authorizeIntegracao');
  });
});

// ── A03 · grupos.js ──────────────────────────────────────────────────────────

/** As dez rotas de maior PII que ganharam gate no lote 2. */
const GRUPOS_PII: Array<{ caminho: string; guard: string; porque: string }> = [
  { caminho: '/buscar', guard: "authorizeModule('grupos', 1)", porque: 'busca livre de grupo/pessoa' },
  { caminho: '/lideres/buscar', guard: "authorizeModule('grupos', 1)", porque: 'busca nominal de líderes' },
  { caminho: '/pedidos/list', guard: "authorizeModule('grupos', 1)", porque: 'nome, e-mail e telefone de quem pediu para entrar' },
  { caminho: '/lideres-inscricoes/list', guard: "authorizeModule('grupos', 1)", porque: 'inscrições de líder com contato' },
  { caminho: '/:id/historico-membros', guard: "authorizeModule('grupos', 1)", porque: 'histórico de entrada e saída por pessoa' },
  { caminho: '/:id/entradas-saidas', guard: "authorizeModule('grupos', 1)", porque: 'quem entrou e quem saiu do grupo' },
  { caminho: '/:id/frequencia', guard: "authorizeModule('grupos', 1)", porque: 'presença nominal por encontro' },
  { caminho: '/pessoas/papeis', guard: "authorizeModule('grupos', 1)", porque: 'papel de cada pessoa na malha de grupos' },
  { caminho: '/pessoas/:membroId/frequencia', guard: "authorizeModule('grupos', 1)", porque: 'frequência de UMA pessoa' },
  { caminho: '/entrada/cobertura', guard: "authorizeModule('grupos', 1)", porque: 'cobertura nominal da porta de entrada' },
  // Supervisão tem régua PRÓPRIA (rede/supervisor), não a matriz — as duas somam.
  { caminho: '/visitas/painel', guard: 'podeVerSupervisaoGrupos', porque: 'visitas de supervisão' },
  { caminho: '/:id/observacoes', guard: 'podeVerSupervisaoGrupos', porque: 'observação pastoral sobre o grupo' },
];

describe('⚠️ A03 · grupos.js — rotas de PII com gate de módulo', () => {
  for (const r of GRUPOS_PII) {
    it(`GET ${r.caminho} exige ${r.guard} — ${r.porque}`, () => {
      const linha = linhaDaRota(grupos.limpo, 'get', r.caminho);
      expect(linha, `GET ${r.caminho} sumiu de grupos.js`).toBeTruthy();
      expect(linha, `GET ${r.caminho} ficou SEM gate — ${r.porque}`).toContain(r.guard);
    });
  }

  it('⚠️ segue sem gate global — /meu e /supervisao/me são self-scoped', () => {
    // `router.use(authorizeModule(...))` aqui quebraria líder sem o módulo.
    expect(grupos.limpo).not.toMatch(/router\.use\(\s*authorizeModule/);
  });
});

// ── B08 · voluntariado.js ────────────────────────────────────────────────────

/**
 * Escritas ESTRUTURAIS: nada de self-service (`/me`, `/my-*`, `/self-checkin`,
 * `/quero-servir`) nem de porta de culto (`/check-ins`, `/qr-lookup`,
 * `/face/match`, `/profiles`), que têm régua própria e não podem tomar 403.
 * Estas criam/alteram/APAGAM culto, equipe, posição e escala — e 20 dos
 * `.delete()` do arquivo são FÍSICOS, sem `deleted_at`.
 */
const VOL_ESCRITAS: Array<[string, string]> = [
  ['post', '/services'],
  ['put', '/services/:id'],
  ['delete', '/services/:id'],
  ['post', '/teams-manage'],
  ['put', '/teams-manage/:id'],
  ['delete', '/teams-manage/:id'],
  ['post', '/positions'],
  ['put', '/positions/:id'],
  ['delete', '/positions/:id'],
  ['post', '/team-members'],
  ['delete', '/team-members/:id'],
  ['delete', '/schedules/:id'],
  ['post', '/schedules/bulk'],
  ['post', '/schedules/desfazer-lote'],
];

describe('⚠️⚠️ B08 · voluntariado.js — escrita estrutural tem gate PRÓPRIO na rota', () => {
  for (const [metodo, caminho] of VOL_ESCRITAS) {
    it(`${metodo.toUpperCase()} ${caminho} declara authorizeModule('voluntariado', …) na própria rota`, () => {
      const linha = linhaDaRota(voluntariado.limpo, metodo, caminho);
      expect(linha, `${metodo.toUpperCase()} ${caminho} sumiu de voluntariado.js`).toBeTruthy();
      expect(
        linha,
        `${metodo.toUpperCase()} ${caminho} herda o piso só por middleware de bloco — ` +
          'a trava é POR ROTA (lei da casa, jornada.js:52-55)',
      ).toMatch(/authorizeModule\('voluntariado',\s*[3-5]\)|authEscalaEscrita/);
    });
  }

  it('conceder e remover PAPEL exige voluntariado 5 — é autorização, não cadastro', () => {
    for (const [metodo, caminho] of [['post', '/roles'], ['delete', '/roles/:profileId/:role']] as const) {
      const linha = linhaDaRota(voluntariado.limpo, metodo, caminho);
      expect(linha, `${metodo.toUpperCase()} ${caminho} sumiu`).toBeTruthy();
      expect(linha).toContain("authorizeModule('voluntariado', 5)");
    }
  });

  it('⚠️⚠️ NÃO existe router.use condicional por MÉTODO — a trava é por rota', () => {
    // Middleware de bloco que liga o gate olhando `req.method`/`req.path` é o
    // `router.use(authorizeModule(...))` disfarçado: a lista de exceções vira
    // uma segunda matriz de permissão, invisível na linha da rota, e cada rota
    // NOVA nasce gateada por acidente (ou isenta, se casar um regex).
    const usos = voluntariado.limpo.match(/router\.use\(\s*(?:async\s*)?\(req[\s\S]{0,400}?\n\}\);/g) || [];
    const condicional = usos.filter((b) => /req\.method|req\.path/.test(b));
    expect(
      condicional,
      'voluntariado.js ainda tem router.use que decide o gate por método/caminho — ' +
        'trocar por authorizeModule em cada rota de escrita',
    ).toHaveLength(0);
    expect(voluntariado.limpo, 'a lista de exceções por regex ainda existe')
      .not.toContain('ESCRITA_COM_REGUA_PROPRIA');
  });

  it('o piso de LEITURA do arquivo continua membresia>=1 (agregado do /painel)', () => {
    expect(voluntariado.limpo).toContain("router.use(authenticate, authorizeModule('membresia', 1))");
  });
});

// ── Lei nº 2 · routeKey fora do mapa desliga a matriz EM SILÊNCIO ────────────

describe('⚠️⚠️ toda routeKey usada nos 4 arquivos existe no ROUTE_MODULE_MAP', () => {
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
    ['kpis.js', kpis.limpo],
    ['grupos.js', grupos.limpo],
    ['voluntariado.js', voluntariado.limpo],
    ['tasks.js', tasks.limpo],
  ];

  for (const [nome, limpo] of arquivos) {
    it(`${nome} — nenhuma chave órfã`, () => {
      const chaves = [...limpo.matchAll(/authorizeModule\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const chave of [...new Set(chaves)]) {
        expect(
          mapa,
          `${nome} usa a routeKey '${chave}', que NÃO está no ROUTE_MODULE_MAP — ` +
            'authorizeModule cai no nível padrão do cargo e a matriz desliga em silêncio',
        ).toMatch(new RegExp(`['"]${chave.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\s*:`));
      }
    });
  }

  it("⚠️ nenhum dos 4 usa a routeKey ampla `membros` em escrita ou lista de PII", () => {
    // `ROUTE_MODULE_MAP['membros']` cobre doze módulos: nível 2 em QUALQUER um
    // deles passaria. Amplo demais para PII e para escrita.
    for (const [nome, limpo] of arquivos) {
      expect(limpo, `${nome} passou a usar a chave ampla 'membros'`).not.toMatch(/authorizeModule\(\s*['"]membros['"]/);
    }
  });

  it("a chave nova `batismo-leitura` abre as DUAS portas (integracao e batismo)", () => {
    // A tela /batismo é gateada por `batismo` e a aba Batismos da Integração
    // por `integracao`: gatear por uma só daria 403 numa tela que a pessoa
    // sempre pôde abrir. Chave própria de propósito — criar `batismo` no mapa
    // mudaria em silêncio o `getEffectiveLevel(req, 'batismo')` da ESCRITA.
    expect(mapa).toMatch(/['"]batismo-leitura['"]\s*:\s*\[[^\]]*'integracao'[^\]]*'batismo'[^\]]*\]/);
    expect(mapa, "o slug `batismo` ganhou entrada própria — isso muda a régua da ESCRITA")
      .not.toMatch(/\n\s*['"]batismo['"]\s*:/);
  });
});
