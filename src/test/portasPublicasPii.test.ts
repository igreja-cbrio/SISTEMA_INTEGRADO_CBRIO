import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { semComentariosJs } from './_semComentarios';

/**
 * ⚠️⚠️ POR QUE ESTE TESTE EXISTE (varredura 2026-09 · lote 4)
 *
 * O lote 4 mudou o CONTRATO de portas 100% PÚBLICAS — as que respondem a quem
 * não fez login nenhum — e não trouxe regressão. Contrato de porta pública é
 * exatamente o que volta sozinho: basta alguém "consertar a tela" devolvendo o
 * campo que a tela pedia, e o vazamento renasce sem quebrar nada.
 *
 *  · PUB-01 `POST /api/public/membresia/cadastro` — o bloco de criação de conta
 *    ENTREGAVA A CONTA DE OUTRA PESSOA: com o CPF de um membro (2.390 têm CPF
 *    gravado), o anônimo mandava o PRÓPRIO e-mail e a PRÓPRIA senha e recebia
 *    uma conta já confirmada com `profiles.membro_id` apontando pro membro
 *    casado por CPF — e `membro_id` alimenta `current_user_membro_id()`, usada
 *    nas policies de contribuições e Kids.
 *  · PUB-02 `GET /api/public/membresia/lookup-cpf` — só o CPF fazia a porta
 *    responder "esta pessoa está na base da CBRio?", que é convicção religiosa
 *    (LGPD art. 5º, II). O `/prefill` do censo já tinha matado esse estágio em
 *    17/08/2026; esta porta ficou para trás.
 *  · PUB-02 `POST /api/public/voluntariado/lookup-cpf` — devolvia `name` (nome
 *    COMPLETO) e `type`, e `type:'colaborador'` marcava, a partir de um CPF,
 *    quem são os funcionários da igreja.
 *  · PUB-03 CRON_SECRET — aceito em `?secret=` (a URL vaza em log de borda, no
 *    Sentry e no Referer) e comparado com `===` (timing side-channel).
 *
 * A verificação é POR TEXTO porque importar as rotas puxaria `utils/supabase`,
 * e o gate roda sem as dependências de `backend/`. O que se pode checar é a
 * FORMA — e é na forma que os quatro defeitos viviam.
 *
 * ⚠️ `semComentariosJs` é OBRIGATÓRIO aqui, e mais aqui do que em qualquer
 * outro guarda deste repo: os comentários do próprio conserto CITAM `name`,
 * `type`, `senha`, `password`, `membro_id: duplicadoDeId` e `?secret=` para
 * explicar o que saiu. Sem limpar, a explicação do conserto vira a evidência
 * do defeito e o teste passa com a porta ABERTA (armadilha de 06/08/2026, já
 * repetida duas vezes).
 */

const RAIZ = resolve(__dirname, '..', '..');
const lerLimpo = (rel: string) => semComentariosJs(readFileSync(resolve(RAIZ, rel), 'utf8'));

const ARQUIVOS = {
  membresia: 'backend/routes/publicMembresia.js',
  // varredura 2026-09: PUB-01 — publicDevocional estava FORA do mapa e por isso
  // fora de toda varredura deste guarda. A régua paginada nasceu justamente
  // porque as DUAS rotas faziam a mesma pergunta e uma ficou pra trás; deixar
  // só uma delas coberta é repetir o descuido dentro do próprio guarda.
  devocional: 'backend/routes/publicDevocional.js',
  voluntariado: 'backend/routes/publicVoluntariado.js',
  pagamentos: 'backend/routes/pagamentosWebhook.js',
  cerebro: 'backend/routes/cerebro.js',
  cronAuth: 'backend/utils/cronAuth.js',
} as const;

const fonte = Object.fromEntries(
  Object.entries(ARQUIVOS).map(([k, v]) => [k, lerLimpo(v)]),
) as Record<keyof typeof ARQUIVOS, string>;

/** Recorta o corpo de uma rota: da declaração até a PRÓXIMA `router.` em coluna 0. */
function blocoDaRota(src: string, decl: string): string {
  const i = src.indexOf(decl);
  expect(i, `\`${decl}\` não existe mais — se a rota foi renomeada, atualizar ESTE teste`).toBeGreaterThan(-1);
  const j = src.indexOf('\nrouter.', i + decl.length);
  return src.slice(i, j === -1 ? src.length : j);
}

/** Recorta um trecho entre duas âncoras (a segunda exclusiva). */
function blocoEntre(src: string, inicio: string, fim: string): string {
  const i = src.indexOf(inicio);
  expect(i, `âncora \`${inicio}\` sumiu — atualizar ESTE teste`).toBeGreaterThan(-1);
  const j = src.indexOf(fim, i + inicio.length);
  expect(j, `âncora de fim \`${fim}\` sumiu — atualizar ESTE teste`).toBeGreaterThan(-1);
  return src.slice(i, j);
}

// ─────────────────────────────────────────────────────────────────────────────
// 0 · sanidade do limpador
//
// ⚠️ Asserção NEGATIVA sobre texto que o limpador comeu passa por vacuidade.
// Este bloco existe para que "o teste passou" nunca signifique "o limpador
// apagou o arquivo": os arquivos deste lote são justamente os mais comentados
// da varredura.
// ─────────────────────────────────────────────────────────────────────────────
describe('sanidade · os arquivos sobrevivem a semComentariosJs', () => {
  for (const [nome, src] of Object.entries(fonte)) {
    it(`${nome} continua tendo CÓDIGO depois de limpar os comentários`, () => {
      expect(src.replace(/\s+/g, ' ').trim().length).toBeGreaterThan(400);
      expect(src).toMatch(/router\.|module\.exports/);
    });
  }

  it('o limpador de fato apaga o comentário (senão o teste inteiro é teatro)', () => {
    // Os comentários do lote CITAM os padrões proibidos. Se sobrevivessem, as
    // asserções abaixo achariam o defeito na explicação dele.
    const cru = readFileSync(resolve(RAIZ, ARQUIVOS.membresia), 'utf8');
    expect(cru, 'o comentário do conserto deveria citar `password`').toContain('SEM `password`');
    expect(fonte.membresia).not.toContain('SEM `password`');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1 · PUB-02 · GET /api/public/membresia/lookup-cpf
// ─────────────────────────────────────────────────────────────────────────────
describe('⚠️⚠️ PUB-02 · membresia GET /lookup-cpf — CPF sozinho não é prova, e a recusa é NEUTRA', () => {
  const bloco = blocoDaRota(fonte.membresia, "router.get('/lookup-cpf'");

  it('EXIGE data de nascimento além do CPF', () => {
    // A régua é a mesma do /prefill do censo (`utils/censoPrefill`), importada
    // em vez de recopiada — régua duplicada já divergiu neste repo.
    expect(bloco, 'o nascimento não é lido da query').toMatch(/req\.query\.(data_nascimento|nascimento)/);
    expect(bloco, 'a régua pura do censo não está sendo aplicada').toContain('podeIdentificarPorCpf');
  });

  it('sem nascimento a resposta é a MESMA de CPF inexistente (não é 400, não é mensagem)', () => {
    // Um 400 "falta nascimento" só quando o CPF existe devolveria o oráculo
    // inteiro de volta pela porta dos fundos.
    const i = bloco.indexOf('if (!podeIdentificarPorCpf');
    expect(i, 'a guarda do nascimento sumiu — atualizar ESTE teste').toBeGreaterThan(-1);
    expect(bloco.slice(i, i + 200)).toContain('res.json(neutra)');
    expect(bloco).not.toMatch(/status\(4\d\d\)/);
  });

  it('⚠️ NENHUM `reason:` sobrou — era ele que discriminava os casos de recusa', () => {
    // `reason:'invalid'` vs `reason:'error'` vs corpo sem reason separava
    // "CPF malformado" de "não está na base" de "o banco caiu".
    expect(bloco).not.toMatch(/\breason\s*:/);
  });

  it('o corpo de recusa é UM só, literal `{ found: false }`', () => {
    expect(bloco).toMatch(/const\s+neutra\s*=\s*\{\s*found\s*:\s*false\s*\}/);
  });

  it('⚠️⚠️ TODA saída sem sucesso devolve o MESMO objeto — nenhuma variante avulsa', () => {
    // Varre cada `res.json(` do bloco: ou é `neutra`, ou é um sucesso
    // (`found: true`). Qualquer terceiro formato volta a ser um sinal.
    const saidas = bloco.split(/res\.json\(/).slice(1).map((t) => t.slice(0, 80));
    expect(saidas.length, 'a rota não responde mais nada?').toBeGreaterThanOrEqual(4);
    for (const s of saidas) {
      const ehNeutra = /^neutra\s*\)/.test(s.trim());
      const ehSucesso = /found\s*:\s*true/.test(s);
      expect(ehNeutra || ehSucesso, `saída em formato próprio: res.json(${s.trim().slice(0, 60)}…`).toBe(true);
    }
  });

  it('as DUAS fontes exigem o nascimento — a fila de pendentes responde a mesma pergunta sensível', () => {
    // `mem_cadastros_pendentes` estava fora da prova: bastava um CPF que ainda
    // não virou membro para o oráculo voltar.
    expect(bloco).toContain("from('mem_membros')");
    expect(bloco).toContain("from('mem_cadastros_pendentes')");
    const divergencias = bloco.match(/data_nascimento\s*!==\s*nascimento/g) || [];
    expect(divergencias.length, 'alguma das duas fontes não confere o nascimento').toBeGreaterThanOrEqual(2);
    // O select da fila precisa TRAZER o campo, senão a comparação é contra undefined.
    expect(bloco).toMatch(/select\('id, nome, status, data_nascimento'\)/);
  });

  it('o erro do banco não vira sinal — o catch também devolve a recusa neutra', () => {
    const cat = bloco.slice(bloco.lastIndexOf('catch'));
    expect(cat).toContain('res.json(neutra)');
    expect(cat).not.toMatch(/\breason\s*:/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · PUB-02 · POST /api/public/voluntariado/lookup-cpf
// ─────────────────────────────────────────────────────────────────────────────
describe('⚠️⚠️ PUB-02 · voluntariado POST /lookup-cpf — não devolve nome nem qualifica a fonte', () => {
  const bloco = blocoDaRota(fonte.voluntariado, "router.post('/lookup-cpf'");
  /** Só o objeto de SUCESSO: é ele que carregava `name` e `type`. */
  const sucesso = blocoEntre(bloco, 'const hasEmail', '});');

  it('⚠️ `name` saiu — era o nome COMPLETO entregue a quem só tinha o CPF', () => {
    expect(sucesso).not.toMatch(/(^|[\s{,])name\s*:/);
    expect(sucesso).not.toContain('result.name');
  });

  it('⚠️ `type` saiu — `colaborador` marcava, a partir de um CPF, quem é funcionário da igreja', () => {
    expect(sucesso).not.toMatch(/(^|[\s{,])type\s*:/);
    expect(sucesso).not.toContain('result.type,');
  });

  it('o que o self-checkin realmente usa continua saindo (found · hasEmail · maskedEmail)', () => {
    // VolSelfCheckin.tsx só lê `found` e `hasEmail`; quem confirma a identidade
    // é o maskedEmail e, de fato, o magic link. Nada se perdeu.
    expect(sucesso).toMatch(/found\s*:\s*true/);
    expect(sucesso).toMatch(/hasEmail\s*,?/);
    expect(sucesso).toContain('maskedEmail');
  });

  it('o e-mail continua MASCARADO (não é o endereço cru que substitui o nome)', () => {
    expect(sucesso).toContain('maskEmail(result.email)');
    expect(sucesso).not.toMatch(/maskedEmail\s*:\s*result\.email\b/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · PUB-01 · POST /api/public/membresia/cadastro
// ─────────────────────────────────────────────────────────────────────────────
describe('⚠️⚠️ PUB-01 · cadastro público não liga a conta de quem chama ao membro casado por CPF', () => {
  const rota = blocoDaRota(fonte.membresia, "router.post('/cadastro'");
  /** O bloco de criação de conta — o pedaço que entregava a conta alheia. */
  // varredura 2026-09: âncora sem o `)` de fechamento — a guarda ganhou uma
  // terceira condição no meio da rodada (`&& !req.contaPorEmailEstourou`) e a
  // âncora literal quebrou o arquivo inteiro por colisão de edição, não por
  // regressão. O que interessa é o INÍCIO do bloco de criação de conta.
  const conta = blocoEntre(rota, 'if (senha && emailLimpo', 'catch (accErr)');

  it('⚠️⚠️ `profiles.membro_id` NUNCA sai de `duplicadoDeId` nesta porta', () => {
    // `membro_id` não é etiqueta: alimenta `current_user_membro_id()`, usada
    // nas policies de contribuições e Kids (migration 20260816194649), e é o
    // vínculo que o app de membros lê. O casamento por CPF numa porta ANÔNIMA
    // não pode produzi-lo.
    expect(conta).not.toMatch(/membro_id\s*:\s*duplicadoDeId/);
    expect(conta).not.toMatch(/patch\.membro_id/);
    expect(conta).not.toMatch(/membro_id\s*=\s*duplicadoDeId/);
  });

  it('o profile novo nasce com `membro_id: null` — o vínculo é ato da EQUIPE', () => {
    const insert = blocoEntre(conta, "from('profiles').insert(", '})');
    expect(insert).toMatch(/membro_id\s*:\s*null/);
  });

  it('⚠️ a escrita em `mem_membros` só é autorizada pelo vínculo JÁ PROVADO no profile', () => {
    // Com `profileExistente.membro_id || duplicadoDeId`, o casamento por CPF
    // autorizava um anônimo a ESCREVER no mem_membros de outra pessoa.
    expect(conta).toMatch(/membroDoLogin\s*=\s*profileExistente\.membro_id\s*;/);
    expect(conta).not.toMatch(/profileExistente\.membro_id\s*\|\|\s*duplicadoDeId/);
  });

  it('⚠️⚠️ `createUser` NÃO recebe `password` — senha escolhida por anônimo não é credencial', () => {
    const create = blocoEntre(conta, 'auth.admin.createUser(', '})');
    expect(create).not.toMatch(/\bpassword\s*:/);
    expect(create).not.toContain('senha');
  });

  it('`email_confirm: false` — marcar confirmado sem verificar tirava o dono do circuito', () => {
    const create = blocoEntre(conta, 'auth.admin.createUser(', '})');
    expect(create).toMatch(/email_confirm\s*:\s*false/);
    expect(create).not.toMatch(/email_confirm\s*:\s*true/);
  });

  it('a entrada passa a ser o link no e-mail, e só para a conta CRIADA agora', () => {
    // Disparar magic link para conta PREEXISTENTE transformaria uma porta
    // anônima em gatilho de e-mail para o endereço de qualquer um.
    expect(conta).toContain('generateLink');
    expect(conta).toMatch(/type\s*:\s*'magiclink'/);
    expect(conta).toMatch(/if\s*\(\s*authUserNovo\s*\)/);
  });

  it('ninguém "entra na hora" a partir desta porta', () => {
    expect(conta).toMatch(/canLoginDevocional\s*=\s*false\s*;/);
    expect(conta).not.toMatch(/canLoginDevocional\s*=\s*!!\s*duplicadoDeId/);
  });

  it('⚠️ a busca do auth user por e-mail é PAGINADA (listUsers() cru via só a 1ª página)', () => {
    // Sem paginação, ~155 dos 205 usuários eram invisíveis: quem já tinha conta
    // caía no ramo de CRIAR.
    // ⚠️ A régua vive em `backend/utils/authUsers.js`, UMA só: publicMembresia
    // e publicDevocional faziam a MESMA pergunta, e cópia local em cada rota
    // foi exatamente como uma delas ficou para trás.
    expect(fonte.membresia).toContain("require('../utils/authUsers')");
    expect(conta).toContain('acharAuthUserPorEmail(emailLimpo)');
    expect(conta, 'voltou o listUsers() sem paginação').not.toMatch(/listUsers\(\s*\)/);
    const util = lerLimpo('backend/utils/authUsers.js');
    expect(util).toMatch(/listUsers\(\s*\{\s*page\s*,\s*perPage\s*:\s*PER_PAGE\s*\}\s*\)/);
    // Erro de infra PROPAGA: responder "não existe" por causa de uma falha de
    // rede é o que criava conta duplicada / "user already registered".
    expect(util).toMatch(/if\s*\(error\)\s*throw error/);
    // Página incompleta = última página (senão varre o teto inteiro à toa).
    expect(util).toMatch(/users\.length\s*<\s*PER_PAGE/);
  });

  // varredura 2026-09: PUB-01 — a MESMA dupla de asserções para o gêmeo. Sem
  // ela, reintroduzir `supabase.auth.admin.listUsers()` cru no /devocional/login
  // passava verde: o guarda cobria um dos dois chamadores da régua única.
  it('⚠️ o /devocional/login usa a MESMA régua paginada (era o outro chamador)', () => {
    const login = blocoDaRota(fonte.devocional, "router.post('/login'");
    expect(fonte.devocional).toContain("require('../utils/authUsers')");
    expect(login, 'o login do devocional não passa mais pela régua única').toContain('acharAuthUserPorEmail(');
    expect(login, 'voltou o listUsers() sem paginação no devocional').not.toMatch(/listUsers\(\s*\)/);
  });

  it('a fila de cadastros NÃO perde o `duplicado_de_id` — só deixa de virar acesso', () => {
    // A equipe continua vendo o casamento por CPF na tela de promoção; o que
    // saiu foi o efeito automático sobre a conta.
    expect(rota).toMatch(/duplicado_de_id\s*:\s*duplicadoDeId/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 · PUB-03 · CRON_SECRET
// ─────────────────────────────────────────────────────────────────────────────
const DIR_ROTAS = resolve(RAIZ, 'backend/routes');
const ROTAS = readdirSync(DIR_ROTAS)
  .filter((f) => f.endsWith('.js'))
  .map((f) => ({ nome: f, src: lerLimpo(`backend/routes/${f}`) }));

describe('⚠️⚠️ PUB-03 · segredo de cron nunca em QUERY STRING', () => {
  it('a varredura enxerga a árvore inteira de rotas (senão passa por vacuidade)', () => {
    expect(ROTAS.length).toBeGreaterThan(40);
  });

  it('nenhuma rota lê `req.query.secret`', () => {
    // A URL inteira vai para o log da borda, para o Sentry e para o Referer da
    // página seguinte — segredo em query string é segredo publicado.
    const culpados = ROTAS.filter((r) => /req\.query\.secret\b/.test(r.src)).map((r) => r.nome);
    expect(culpados, `segredo em query string: ${culpados.join(', ')}`).toEqual([]);
  });

  it('nenhuma rota casa o CRON_SECRET contra algo vindo de `req.query`', () => {
    // `req.query.token` continua legítimo nas portas de LINK ASSINADO
    // (publicGrupos, publicBatismo): ali o token é o próprio objeto assinado,
    // não o segredo-mãe. O que se proíbe é o CRON_SECRET encostar na query.
    const perto =
      /req\.query\.\w+[^\n]{0,80}(CRON_SECRET|cronSecret)|(CRON_SECRET|cronSecret)[^\n]{0,80}req\.query\.\w+/;
    const culpados = ROTAS.filter((r) => perto.test(r.src)).map((r) => r.nome);
    expect(culpados, `CRON_SECRET comparado com query string: ${culpados.join(', ')}`).toEqual([]);
  });

  it('`pagamentosWebhook.js` não tem mais a régua LOCAL — usa a única de utils/cronAuth', () => {
    expect(fonte.pagamentos).not.toContain('function cronAutorizado');
    expect(fonte.pagamentos).toContain("require('../utils/cronAuth')");
    // Os cinco crons do arquivo, todos pela régua única.
    for (const rota of ['/cron/tick', '/cron/expirar', '/cron/reconciliar', '/cron/replay', '/cron/saude']) {
      const b = blocoDaRota(fonte.pagamentos, `router.get('${rota}'`);
      expect(b, `${rota} sem gate de cron`).toContain('isAuthorizedCron(req)');
      expect(b, `${rota} ainda usa a régua local`).not.toContain('cronAutorizado(req)');
    }
  });
});

describe('⚠️⚠️ PUB-03 · a comparação do segredo é timing-safe', () => {
  it('`utils/cronAuth` compara com `crypto.timingSafeEqual`, e falha fechado sem env', () => {
    expect(fonte.cronAuth).toContain('crypto.timingSafeEqual');
    expect(fonte.cronAuth).toMatch(/if\s*\(!secret\)\s*return false/);
    // Só header: nem `isAuthorizedCron` nem `requireCron` olham a query.
    expect(fonte.cronAuth).not.toContain('req.query');
  });

  it('nenhuma rota compara o CRON_SECRET com `===`/`!==`', () => {
    // ⚠️ ALLOWLIST de UMA ocorrência, e ela é INERTE: em
    // `voluntariado-sync.js` o `if (cronSecret && authHeader === cronSecret)`
    // tem CORPO VAZIO e o router inteiro já está atrás de
    // `authenticate + authorizeModule('voluntariado', 3)` (linha 15) — não
    // concede nada. Fica fora do tema deste lote de propósito; se alguém
    // transformar aquele `if` em concessão, esta allowlist tem de morrer junto.
    const INERTES = new Set(['voluntariado-sync.js']);
    const igualdade = /(===|!==)\s*(process\.env\.CRON_SECRET|CRON_SECRET|cronSecret)\b(?!\s*\.)/;
    const culpados = ROTAS.filter((r) => !INERTES.has(r.nome) && igualdade.test(r.src)).map((r) => r.nome);
    expect(culpados, `comparação não timing-safe: ${culpados.join(', ')}`).toEqual([]);
  });

  it('o webhook do Cérebro compara o clientState com `safeEqual`, sem fallback literal', () => {
    // O fallback `'cbrio-cerebro'` era literal PÚBLICO: sem CRON_SECRET
    // qualquer um disparava Graph delta + Haiku pela rota, que não tem
    // authenticate.
    const web = blocoDaRota(fonte.cerebro, "router.post('/webhook'");
    expect(web).toContain('safeEqual');
    expect(web).not.toMatch(/notif\.clientState\s*!==/);
    expect(fonte.cerebro).not.toContain("'cbrio-cerebro'");
    // Fail-closed: sem nenhum clientState conhecido, nada é processado.
    expect(web).toMatch(/if\s*\(!CLIENT_STATES_ACEITOS\.length\)/);
  });

  it('o CRON_SECRET nunca mais é ENVIADO ao tenant Microsoft', () => {
    // Ele é o segredo-mãe de 16 crons; entregá-lo como clientState da
    // subscription é dar a chave da casa a um terceiro.
    const sub = blocoDaRota(fonte.cerebro, "router.post('/subscriptions'");
    expect(sub).toMatch(/clientState\s*:\s*GRAPH_CLIENT_STATE/);
    expect(sub).not.toMatch(/clientState\s*:\s*CRON_SECRET/);
    // Sem a env própria não se CRIA subscription (renovar por PATCH não manda
    // clientState, então o que já existe segue vivo).
    expect(sub).toMatch(/if\s*\(!GRAPH_CLIENT_STATE\)/);
    expect(fonte.cerebro).toMatch(/GRAPH_CLIENT_STATE\s*=\s*process\.env\.GRAPH_CLIENT_STATE\s*\|\|\s*null/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5 · o CHAMADOR tem de acompanhar o contrato novo
//
// ⚠️ Contrato de porta pública quebra a tela em silêncio: o backend passa a
// exigir o nascimento e a tela continua mandando só o CPF — a confirmação
// visual simplesmente nunca mais aparece, e ninguém vê erro nenhum. É por isso
// que esta asserção mora AQUI, junto do contrato, e não numa lista de tarefas.
// ─────────────────────────────────────────────────────────────────────────────
describe('⚠️ o chamador do lookup manda a prova nova', () => {
  const api = lerLimpo('src/api.js');
  const chamada = blocoEntre(api, 'lookupCpf: async (cpf', '},');

  it('`cadastroPublico.lookupCpf` envia o nascimento junto do CPF', () => {
    // Sem isto, `podeIdentificarPorCpf` recusa SEMPRE e a tela de cadastro
    // perde a confirmação "é você?" — a porta fica fechada até para a dona.
    expect(chamada, 'o chamador ainda manda só o CPF').toMatch(/data_nascimento|nascimento/);
  });
});

// varredura 2026-09: PUB-02 — `src/api.js` era só a METADE do chamador. Quem
// de fato quebrou foi a TELA: o efeito do lookup e o campo que ele passou a
// exigir moram em `CadastroMembresia.jsx`, e é lá que "a porta fica fechada
// até para a dona" acontece na cara do usuário. Parar no api.js deixava o
// achado sem guarda exatamente onde ele se manifesta.
describe('⚠️⚠️ a TELA do cadastro consegue satisfazer o contrato novo', () => {
  const TELA = 'src/pages/public/CadastroMembresia.jsx';
  const tela = lerLimpo(TELA);

  it('sanidade · a tela sobrevive a semComentariosJs', () => {
    expect(tela.replace(/\s+/g, ' ').trim().length).toBeGreaterThan(4000);
    expect(tela).toContain('cadastroPublico.lookupCpf(');
  });

  it('o efeito do lookup tem `form.data_nascimento` nas DEPENDÊNCIAS', () => {
    // Sem a dependência o efeito não roda de novo quando a pessoa preenche o
    // nascimento: o cartão de reconhecimento fica morto para sempre, e sem
    // erro nenhum na tela.
    const iChamada = tela.indexOf('cadastroPublico.lookupCpf(');
    expect(iChamada, 'a chamada do lookup sumiu da tela — atualizar ESTE teste').toBeGreaterThan(-1);
    const iDeps = tela.indexOf('}, [', iChamada);
    expect(iDeps, 'o array de dependências do efeito sumiu — atualizar ESTE teste').toBeGreaterThan(-1);
    const deps = tela.slice(iDeps, tela.indexOf(']', iDeps));
    expect(deps, 'o efeito não reage ao nascimento').toContain('form.data_nascimento');
  });

  it('⚠️⚠️ o campo de nascimento e o cartão de reconhecimento vivem no MESMO passo', () => {
    // Dependência certa e passos diferentes dá o MESMO resultado prático: no
    // passo do CPF o nascimento ainda está vazio, o efeito recusa, e quando o
    // nascimento chega o cartão já não está mais na tela. O contrato novo só
    // é satisfazível se os dois estiverem visíveis ao mesmo tempo.
    const marcas = [...tela.matchAll(/currentStep\s*===\s*(\d+)\s*&&/g)];
    expect(marcas.length, 'a tela não é mais dividida por `currentStep === N &&`').toBeGreaterThan(1);
    const passoDe = (agulha: string) => {
      const i = tela.indexOf(agulha);
      expect(i, `\`${agulha}\` sumiu da tela — atualizar ESTE teste`).toBeGreaterThan(-1);
      let passo = -1;
      for (const m of marcas) {
        if ((m.index as number) < i) passo = Number(m[1]);
        else break;
      }
      return passo;
    };
    const passoNascimento = passoDe('<BirthDatePicker');
    const passoCartao = passoDe('cpfLookup?.found');
    expect(
      passoNascimento,
      `nascimento no passo ${passoNascimento} e cartão de reconhecimento no passo ${passoCartao}`,
    ).toBe(passoCartao);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6 · o bloqueio do censo — contato só entra atrás de sinal FORTE
//
// varredura 2026-09 (3ª rodada): o texto que estava aqui dizia que o
// `/cadastro` público podia mandar `email` e `telefone` no `dados` do
// `reconciliarCenso` SEMPRE, porque "o gate de confiança vive DENTRO do
// serviço". Premissa DERRUBADA — o gate trata `matchedBy: 'cpf'` como chave
// FORTE, e CPF digitado numa porta anônima identifica mas não autentica: por
// ele o contato de quem preencheu ia parar no `mem_membros.email` de outra
// pessoa (o mesmo endereço que o /devocional/login usa como identidade). A
// trava passou a ser de ORIGEM e mora no CHAMADOR:
// `contatoProvado = matchedBy === 'token_censo'`.
//
// ⚠️ Esta era a ÚNICA das quatro correções do lote sem trava de regressão: a
// asserção antiga (`toMatch(/email\s*:\s*emailLimpo/)`) casava igual com a
// forma corrigida (dentro da ternária) e com a forma VULNERÁVEL (o campo solto
// no `dados`) — apagar o `contatoProvado` deixava a suíte 100% verde. Por isso
// a asserção que vale é a NEGATIVA, sobre a chamada COM os spreads removidos:
// é ela que de fato quebra se alguém tirar a guarda.
// ─────────────────────────────────────────────────────────────────────────────
describe('⚠️⚠️ censo · contato de anônimo não encosta em membro por sinal fraco', () => {
  const svc = lerLimpo('backend/services/censoReconciliar.js');
  const chamada = blocoEntre(fonte.membresia, 'reconciliarCenso({', '});');
  const ramoCortado = blocoEntre(fonte.membresia, 'if (!contatoProvado', 'reconciliarCenso({');

  it('⚠️⚠️ o contato SÓ entra atrás de `token_censo` — e o cortado não se perde', () => {
    // (a) a trava existe e é de ORIGEM: só o token pessoal do censo (link
    // assinado que o sistema entregou pra ela) prova posse do contato.
    expect(
      fonte.membresia,
      'a trava de origem sumiu — sem ela o CPF digitado volta a escolher a chave de login de outra pessoa',
      // O `;` no fim é a parte que importa: sem ele o regex prende a REMOÇÃO da
      // trava mas não o ALARGAMENTO. Medido — com `|| matchedBy === 'cpf'`
      // colado na definição, as 50 asserções passavam e a tomada de conta em
      // dois passos voltava inteira. É a regressão mais provável do futuro,
      // porque ela se disfarça de "conserto do reconhecimento".
    ).toMatch(/const\s+contatoProvado\s*=\s*matchedBy\s*===\s*'token_censo'\s*;/);

    // (b) o contato entra SÓ pela ternária. A positiva sozinha não segura nada
    // (casa com o campo solto também); a que vale é a negativa logo abaixo.
    expect(chamada, 'o contato deixou de entrar pelo spread condicional').toMatch(
      /\.\.\.\(\s*contatoProvado\s*\?\s*\{[^}]*email\s*:\s*emailLimpo[^}]*telefone\s*:\s*telefoneLimpo[^}]*\}\s*:\s*\{\s*\}\s*\)/,
    );
    const semSpreads = chamada.replace(/\.\.\.\([^)]*\)/g, '');
    expect(
      semSpreads,
      'o contato voltou a ir INCONDICIONAL no `dados` — era exatamente o vazamento do lote',
    ).not.toMatch(/email\s*:\s*emailLimpo/);
    expect(semSpreads).not.toMatch(/telefone\s*:\s*telefoneLimpo/);

    // (c) o `matchedBy` continua viajando: o gate lá dentro ainda julga os
    // OUTROS campos (nascimento, endereço) mesmo sem o contato no payload.
    expect(chamada, 'a chamada parou de dizer COMO a pessoa foi casada').toMatch(/matchedBy\s*,/);

    // (d) o que foi cortado vira contato ACUMULADO em `mem_contatos`, no ramo
    // `!contatoProvado` e com a fonte `censo`. Sem isso a trava não CORTA, ela
    // joga fora o que a pessoa digitou.
    expect(
      ramoCortado,
      'o ramo do contato cortado não registra mais nada — o contato está sendo descartado',
    ).toContain('registrarContatoDaPorta(');
    expect(ramoCortado, 'a fonte do contato acumulado deixou de ser `censo`').toMatch(/'censo'/);
  });

  // varredura 2026-09 (3ª rodada): as duas travas que faltavam no "o cortado
  // não se perde" — ORDEM e RASTRO. As duas somem sem quebrar nada mais, que é
  // a assinatura do que este arquivo existe pra segurar.
  it('⚠️ o acúmulo roda ANTES do `await reconciliarCenso` — e deixa rastro no histórico', () => {
    // (e) ORDEM. O `reconciliarCenso` propaga erro de infra DE PROPÓSITO, e os
    // dois moram no MESMO `try`: com o acúmulo DEPOIS da chamada, uma falha do
    // reconciliador pula direto pro `catch` e o contato não chega nem em
    // `mem_membros` (cortado pela trava) nem em `mem_contatos` — o "não se
    // perde" cai justamente no caminho de erro. `registrarContatoDaPorta` é
    // best-effort e não retorna promise, então antecipar não custa nada.
    const iAcumulo = fonte.membresia.indexOf('registrarContatoDaPorta(');
    const iReconciliar = fonte.membresia.indexOf('await reconciliarCenso({');
    expect(iAcumulo, '`registrarContatoDaPorta(` sumiu — atualizar ESTE teste').toBeGreaterThan(-1);
    expect(iReconciliar, '`await reconciliarCenso({` sumiu — atualizar ESTE teste').toBeGreaterThan(-1);
    expect(
      iAcumulo,
      'o acúmulo voltou pra depois do reconciliador — erro de infra lá volta a comer o contato cortado',
    ).toBeLessThan(iReconciliar);

    // (f) RASTRO. Antes da trava, contato divergente entrava pelo `acumular` do
    // serviço e ERA ELE quem escrevia `[censo] contato acumulado: email` em
    // `mem_historico`. Agora o contato nem chega no `dados`, então `acumular`
    // fica vazio: sem esta escrita o acúmulo acontece INVISÍVEL na linha do
    // tempo do membro — cego exatamente no caso que mais interessa auditar
    // depois (alguém de fora tentando mexer no cadastro).
    expect(
      ramoCortado,
      'o acúmulo do contato de porta anônima deixou de gravar rastro em `mem_historico`',
    ).toContain("from('mem_historico')");
    // `tipo` é NOT NULL + CHECK: sem ele TODO writer falha em silêncio (a
    // lição de 17/07, quando a tabela estava vazia em prod).
    expect(ramoCortado, '`tipo` sumiu do insert — o histórico volta a falhar em silêncio').toMatch(/tipo:\s*'outro'/);
    expect(
      ramoCortado,
      'o rastro deixou de dizer que o contato veio de porta anônima sem token pessoal',
    ).toMatch(/porta an[oô]nima/);
  });

  it('só `cpf` e `token_censo` são chave FORTE', () => {
    // `confirmado_usuario` (o "sou eu" validado só contra o telefone da casa)
    // NÃO pode entrar nesta lista: era por ele que o contato de quem clicou
    // iria parar no cadastro de outra pessoa da família.
    expect(svc).toMatch(/CHAVES_FORTES\s*=\s*new Set\(\[\s*'cpf'\s*,\s*'token_censo'\s*\]\)/);
  });

  it('⚠️ sinal fraco sai ANTES de decidir campo nenhum', () => {
    expect(svc).toMatch(/if\s*\(!gate\.ok\)/);
    const iSaida = svc.indexOf("vazioResp('sinal_fraco_ignorado'");
    const iDecide = svc.indexOf('decidirCampos(membro, informado)');
    expect(iSaida, 'a saída de sinal fraco sumiu — atualizar ESTE teste').toBeGreaterThan(-1);
    expect(iDecide, '`decidirCampos` sumiu — atualizar ESTE teste').toBeGreaterThan(-1);
    expect(iSaida, 'o gate deixou de vir antes da decisão de campos').toBeLessThan(iDecide);
    // E sinal fraco sem nascimento conferível também não passa.
    expect(svc).toMatch(/sinal_fraco_sem_nascimento/);
    expect(svc).toMatch(/sinal_fraco_nascimento_divergente/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7 · o balde por E-MAIL ALVO do ramo de criação de conta
//
// varredura 2026-09 (3ª rodada): o `contaPorEmailLimiter` entrou no lote sem
// asserção nenhuma. Bastava alguém tirar o 2º middleware da linha do
// `router.post('/cadastro', ...)` — um "simplificar a rota" — e a porta ANÔNIMA
// voltava a ser gatilho ILIMITADO de `createUser` + `generateLink` contra um
// e-mail que quem chama digitou, com a suíte 100% verde. O teto por IP não
// cobre isso: trocar de IP é de graça.
//
// ⚠️ E a régua é PULAR, não recusar: o balde é do RAMO (a conta é acessório
// desta porta), então estourar não pode derrubar a submissão — perder o
// cadastro leva junto o consentimento LGPD que ele carrega, que é o contrário
// da política deste arquivo. Por isso o `handler` chama `next()`.
// ─────────────────────────────────────────────────────────────────────────────
describe('⚠️⚠️ PUB-01 · o ramo de criação de conta tem balde por E-MAIL ALVO', () => {
  const rota = blocoDaRota(fonte.membresia, "router.post('/cadastro'");
  const conta = blocoEntre(rota, 'if (senha && emailLimpo', 'catch (accErr)');
  const balde = blocoEntre(fonte.membresia, 'const contaPorEmailLimiter = rateLimit({', '});');

  it('⚠️⚠️ o middleware está MONTADO na rota (tirá-lo é o que reabre a porta)', () => {
    expect(
      fonte.membresia,
      'o `contaPorEmailLimiter` saiu da linha do `router.post(\'/cadastro\')` — `createUser`+`generateLink` viraram ilimitados por e-mail alvo',
    ).toMatch(/router\.post\(\s*'\/cadastro'[^)]*\bcontaPorEmailLimiter\b/);
  });

  it('o ramo de criação de conta CONSULTA o balde antes de disparar qualquer coisa', () => {
    // Montar o middleware sem ninguém ler a marca é o mesmo que não montar:
    // o `handler` não recusa nada por conta própria.
    expect(
      conta,
      'a guarda de criação de conta parou de olhar `req.contaPorEmailEstourou`',
    ).toMatch(/!\s*req\.contaPorEmailEstourou/);
  });

  it('⚠️ estourar o balde PULA a conta — não responde 429 nem derruba a submissão', () => {
    expect(balde, 'o balde perdeu o `handler` próprio — o default do express-rate-limit responde 429').toMatch(/handler\s*:/);
    expect(balde, 'o handler deixou de marcar a flag que o ramo lê').toMatch(/req\.contaPorEmailEstourou\s*=\s*true/);
    expect(balde, 'o handler não segue o pipeline — a submissão (e o consentimento LGPD) está sendo perdida').toMatch(/\bnext\(\s*\)/);
    expect(balde, 'o balde voltou a RECUSAR a requisição inteira').not.toMatch(/\.status\(/);
    expect(balde).not.toMatch(/429/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8 · o TEXTO da tela não promete uma entrega que não dá pra provar
//
// varredura 2026-09 (3ª rodada): as duas pontas da tela (o passo do e-mail e o
// parágrafo de sucesso) perderam a afirmação de envio, e isso também ficou sem
// asserção. Há TRÊS caminhos em que o `generateLink` nem chega a rodar — balde
// por e-mail alvo estourado, conta que JÁ existia e `createUser` que falhou —
// e em todos eles um "Enviamos/Enviaremos um e-mail" manda a pessoa esperar
// uma mensagem que não existe. A régua é descrever COMO o acesso funciona e
// deixar o CAMINHO DE SAÍDA humano na tela.
//
// ⚠️ Asserção negativa sobre texto: sem a sanidade positiva abaixo, um limpador
// que comesse o arquivo faria este bloco passar por vacuidade.
// ─────────────────────────────────────────────────────────────────────────────
describe('⚠️ a TELA não afirma entrega de e-mail, e dá o caminho de saída', () => {
  const tela = lerLimpo('src/pages/public/CadastroMembresia.jsx');

  it('sanidade · o texto visível da tela sobreviveu à limpeza dos comentários', () => {
    expect(tela.replace(/\s+/g, ' ').trim().length).toBeGreaterThan(4000);
    expect(tela, 'o texto do acesso por link sumiu — atualizar ESTE teste').toContain('O acesso ao devocional é por link no e-mail.');
  });

  it('⚠️⚠️ nenhuma ponta afirma que um e-mail foi/será ENVIADO', () => {
    expect(
      tela,
      'voltou a afirmar entrega no passado — o `generateLink` não roda em 3 caminhos (balde, conta que já existia, createUser falho)',
    ).not.toMatch(/[Ee]nviamos[\s\S]{0,40}e-?mail/);
    expect(
      tela,
      'voltou a prometer entrega no futuro — mesma afirmação que não dá pra provar daqui',
    ).not.toMatch(/[Ee]nviaremos[\s\S]{0,40}e-?mail/);
  });

  it('o parágrafo de sucesso traz o CAMINHO DE SAÍDA humano', () => {
    // Sem promessa de envio, a tela precisa dizer o que fazer quando nada
    // chegar — é o que a torna correta também nos caminhos sem link nenhum.
    expect(
      tela,
      'a saída humana sumiu do sucesso — a pessoa fica sem link e sem a quem recorrer',
    ).toContain('fale com a nossa equipe');
  });
});
