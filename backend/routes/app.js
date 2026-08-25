/**
 * Rotas do aplicativo mobile CBRio
 * Auth: Supabase JWT leve (sem sistema de permissões do ERP interno)
 */
const router   = require('express').Router();
const { semCache } = require('../middleware/semCache');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { supabase } = require('../utils/supabase');
const { equipeSupervisionada, filtrarPorSupervisao, supervisionaTudo, podeSupervisionar, subareasNaArea } = require('../utils/supervisorArea');
const { ehDiaDoCulto } = require('../utils/janelaCulto');
const { classificarCulto } = require('../utils/rodizioCulto');
const { proximasOcorrencias, proximoEncontro, ocorrenciaAnterior, ocorrenciasPassadas, janelaCorrecaoPassada } = require('../utils/agendaGrupo');
const { notificar, resolverDestinatarios } = require('../services/notificar');
const { donosDoGrupo } = require('../services/gruposDestinatarios');
const { avisarPedidoNovoNoApp } = require('../services/gruposAvisoApp');
const { dispararAuto } = require('../services/whatsappAuto');
const wpp = require('../services/whatsappService');
const { analisarOracao } = require('../services/oracaoAnalise');
const { acharOuCriarGuardado } = require('../services/membroMatch');
// Convite de familiar pelo app · junta na mesma família + vínculo de parentesco.
const { vincularParentesco, entrarNaFamilia, VINC_INVERSO } = require('../services/familiaVinculo');
// `notificarLiderNovoPedido` é a MESMA função que o formulário público usa —
// o app é um cliente novo da porta, não uma 2ª régua de aviso ao líder.
const gruposWpp = require('../services/gruposWhatsapp');
const { baseUrl } = gruposWpp;
// Espelho da matrícula do Next (o app inscreve por ENCONTRO; a gestão vive em
// TURMA/MATRÍCULA desde o cutover de 17/06) — ver services/nextMatricula.js.
const { chaveMesMembro } = require('../services/nextMatricula');
// ⚠️ Reuso da porta pública de eventos (espinha): a inscrição pelo app roda a
// MESMA função do site. Ver o cabeçalho do bloco de eventos mais abaixo.
const { inscreverEspinha, eventoEspinhaPorId, anexarConfigMenor } = require('./publicEventoExterno');
const { portasCompartilhaveis, linkDoEvento } = require('../utils/linkInscricaoApp');
const { TEXTOS: TEXTOS_INSCRICAO } = require('../services/inscricaoContrato');
const { gerarTokenComprovante } = require('../services/inscricaoComprovante');
const checkoutExterno = require('../utils/checkoutExterno');
// Reuso: núcleo de aprovação de pedidos de grupo (claim atômico + vínculo +
// notificação) já validado no módulo web de grupos.
const { aprovarPedidoCore } = require('./grupos');
const { cadastrarPessoaNoGrupo } = require('../services/grupoPessoaDireta');
const { ancorasDeGrupos, iniciosDeGrupos } = require('../services/grupoAncora');
const { aplicarExcecaoAgenda } = require('../services/grupoAgendaExcecao');
const { registrarEventoPedido } = require('../services/grupoPedidoEventos');
const appIdentidade = require('../services/appIdentidade');
const { acharRespostaDaPessoa } = require('../services/censoJaRespondeu');
const { anexarMarcadores } = require('../services/jornadaMarcadores');
// ⚠️⚠️ O vocabulário de sexo DIVERGE por tabela, e a diferença é medida, não
// suposta: `mem_membros.genero` é **masculino/feminino** (579 pessoas, ZERO com
// M/F), `kids_criancas.sexo` e `batismo_inscricoes.sexo` são **M/F**, e
// `vol_inscricoes.sexo`/`next_matriculas.sexo` voltam ao canônico do Contrato.
// `sexoPara` traduz por destino; copiar cru grava valor que nenhum filtro acha.
const { sexoPara, patchDoCadastro } = require('../utils/dadosDoCadastro');
const { precisaPagerPorInclusao } = require('../utils/saudeCrianca');
const { gerarTokenIdentidade } = require('../utils/censoRespostaToken');
// Reuso dos helpers de permissão granular pra resolver o nível do módulo
// "grupos" do usuário do app (authApp é leve e não computa permissões).
const {
  getModulos,
  getCargoMatrix,
  resolveEffectivePerms,
  isSuperAdminEmail,
} = require('../middleware/auth');
// Régua PURA da capa do grupo (allowlist de formato + o caminho que PODE ser
// apagado do Storage). Testada em `src/test/grupoCapaApp.test.ts`.
const { MIMES_CAPA, caminhoDaCapa, extensaoDaCapa, caminhoNovoDaCapa } = require('../utils/grupoCapaApp');
// Régua PURA de quem pode PEDIR pra entrar num grupo — a MESMA do site
// (extraída de publicGrupos.js). Testada em `src/test/entradaGrupoApp.test.ts`.
const { avaliarEntradaNoGrupo } = require('../utils/entradaGrupoApp');

// ── Auth middleware leve ───────────────────────────────────────────────────
async function authApp(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token não fornecido' });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Token inválido' });
  req.user = user;
  next();
}

// Tenta extrair usuário do token mas não bloqueia se não tiver
async function tryAuth(req, _res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    const { data: { user } } = await supabase.auth.getUser(token).catch(() => ({ data: {} }));
    req.user = user || null;
  }
  next();
}

// ⚠️⚠️ O LIMITE DO APP É POR USUÁRIO, NÃO POR IP (auditoria 06/08/2026).
// A régua da CHAVE vive em `utils/appRateLimit.js` (pura, no gate de deploy) —
// o porquê de cada nível está documentado lá, junto do sintoma que isto
// conserta. Aqui ficam só os TETOS e a montagem do middleware.
//
// ⚠️ LIMITAÇÃO CONHECIDA (não era o que quebrava, mas está medida): o store é o
// MemoryStore, e no Vercel cada instância tem o próprio contador — o teto
// efetivo é `max × nº de instâncias` e zera a cada cold start. Store
// compartilhado (ou regra na borda do Vercel) é item da onda de escala; o
// desenho por usuário já tira o dano do NAT, que era o dano real.
// ⚠️⚠️ NÃO importar `{ ipKeyGenerator }` daqui (incidente 06/08/2026 · 500 nas
// rotas ANÔNIMAS em produção, com todo teste local verde).
// **Este arquivo roda com o `backend/package.json`, que pina express-rate-limit
// `^7.4.0` (lock: 7.5.1) — a RAIZ tem 8.3.2, e `ipKeyGenerator` só existe na
// 8.x.** O `vercel.json` faz `installCommand: npm install && cd backend && npm
// install`, então é a árvore do BACKEND que vale em produção; localmente o
// `backend/node_modules` estava vazio e o Node subiu pra raiz, exercitando uma
// versão que produção nunca carrega.
// Régua: conferir versão de dependência em `backend/package.json`, nunca na
// raiz. A normalização de IP é NOSSA (`utils/appRateLimit.js`, no gate).
const { chaveLimiteApp, ehChaveAnonima } = require('../utils/appRateLimit');
// Saneamento do payload de inscrição do app (régua PURA · no gate de deploy).
const { sanearDadosApp } = require('../utils/saneamentoInscricaoApp');
const { mascaraTelefone } = require('../utils/camposContato');
const { avaliarHorarioBatismo, horariosDisponiveis } = require('../utils/batismoHorario');
const {
  horariosConfigurados: batismoHorariosConfigurados,
  ocupacaoPorHorario: batismoOcupacaoPorHorario,
  dataProximoBatismo,
} = require('../services/batismoHorarios');
// Régua PURA da edição de grupo pelo app (allowlist + categoria fechada + horário).
const { validarEdicaoGrupoApp } = require('../utils/grupoEdicaoApp');

function limiterApp({ max, maxAnonimo, nome }) {
  const chave = (req) => chaveLimiteApp(req);
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    // Anônimo paga o teto de IP, que é mais alto: ali é 1 IP pra congregação.
    limit: (req) => (ehChaveAnonima(chave(req)) ? maxAnonimo : max),
    keyGenerator: (req) => `${nome}:${chave(req)}`,
    // ⚠️ SEM `validate: { keyGeneratorIpFallback: false }` — essa validação só
    // existe na 8.x e a 7.5.1 (a de produção) responde
    // `ERR_ERL_UNKNOWN_VALIDATION` a cada construção do limiter, poluindo o log
    // sem efeito nenhum. Pego no smoke rodado contra a árvore do backend.
    skip: () => process.env.NODE_ENV !== 'production',
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
  });
}

// ⚠️ `limiterStrict` cobre as sondas de identidade (CPF → código) e as portas
// de inscrição. Continua estreito, mas por PESSOA: quem defende essas rotas de
// enumeração NÃO é o teto por IP — é o serviço (5 envios por telefone/dia, 6
// tentativas de código, TTL de 10 min e resposta MASCARADA), que não mudou.
const limiterStrict = limiterApp({
  max: parseInt(process.env.APP_STRICT_RATE_LIMIT_MAX) || 30,
  maxAnonimo: parseInt(process.env.APP_STRICT_RATE_LIMIT_IP_MAX) || 120,
  nome: 'strict',
});
// ⚠️ O teto ANÔNIMO de `limiterNormal` segue a calibragem da casa pra porta que
// a igreja inteira usa pelo mesmo IP (10.000/15min · validada em multidão real
// no NPS e nos grupos · `PUBLIC_MEMBRESIA_RATE_LIMIT_MAX`). Aqui caem as leituras
// públicas do app (`/anuncios`, `/grupos`), que TODO celular no WiFi do culto
// dispara: número menor volta a ser o mesmo estrago por outro caminho.
const limiterNormal = limiterApp({
  max: parseInt(process.env.APP_RATE_LIMIT_MAX) || 600,
  maxAnonimo: parseInt(process.env.APP_RATE_LIMIT_IP_MAX) || 10000,
  nome: 'normal',
});

// ⚠️⚠️ RESPOSTA DO APP NUNCA É CACHEÁVEL (incidente 2026-08-05 · não regredir)
//
// Sintoma: o Matheus completava o cadastro pelo CPF, recebia o código,
// confirmava — e voltava pra tela "Vamos confirmar quem você é". A Joana
// Botafogo tentou 3× em 2 minutos. Os dois com o vínculo JÁ criado
// (`profiles.membro_id` preenchido) e a ficha COMPLETA no banco (nome,
// telefone, CPF, nascimento e sexo) — ou seja, o servidor respondia
// `completo: true` e a tela não passava.
//
// CAUSA: `res.json` do Express gera **ETag** e não manda `Cache-Control`. O
// fetch do React Native usa o cache HTTP do sistema (NSURLSession no iOS,
// OkHttp no Android): ele guarda a resposta, revalida com `If-None-Match`, o
// Express responde **304 sem corpo**, e a camada nativa entrega ao JS a
// resposta ANTIGA — a de antes de vincular, com `completo: false`. Medido nos
// runtime logs: **124 de 251** respostas de `/api/app/*` em 6h eram 304, e a
// sequência do Matheus é literal (200 → 304 → confirma código → 304).
//
// Cache condicional é aceitável em conteúdo; aqui o corpo é **estado da
// pessoa** (o que falta no cadastro, meus grupos, meu perfil, minhas
// inscrições) e muda por ação dela na tela anterior. Servir a versão anterior
// é sempre errado.
//
// ⚠️ `Cache-Control: no-store` SOZINHO não resolve: `req.fresh` do Express olha
// o `If-None-Match` do REQUEST contra o ETag da resposta e devolve 304 do
// mesmo jeito. Por isso `res.json` passa a responder por `res.end`, que **não
// gera ETag** — sem validador, não há revalidação nem 304.
//
// Vale pro router INTEIRO de propósito: qualquer GET novo do app nasce sem
// cache, sem ninguém precisar lembrar disso.
// A régua vive em `middleware/semCache.js` — a MESMA que protege as telas
// públicas de pagamento (que também fazem polling de estado). Duas cópias desta
// lógica divergiriam, e o modo de divergir é silencioso: uma delas volta a
// emitir ETag e ninguém percebe até a tela mostrar estado velho.
router.use(semCache);

// ── Versão mínima do app (PÚBLICO) · Onda 3 (07/08/2026) ──────────────────
//
// O achado: não existe versão mínima em lugar nenhum, e `runtimeVersion.policy
// = appVersion` + `version 1.0.0` significa que, no dia em que a version subir,
// TODO binário 1.0.0 para de receber OTA — provado com GET no manifesto
// (`expo-runtime-version: 1.0.0` → 200 com bundle · `1.0.1` → **HTTP 204**).
// O app não quebra: CONGELA no último bundle, e o portão de atualização nunca
// mais dispara (ele só age com `isUpdatePending`). A partir daí, o único jeito
// de falar com aquele aparelho é a loja — e quem precisa avisar é isto aqui.
//
// ⚠️⚠️ PÚBLICO e SEM `authApp`, de propósito: um app bloqueado por versão pode
// nem ter conseguido logar (o login é Supabase Auth, fora do Express). Exigir
// sessão aqui faria o aviso não alcançar exatamente quem mais precisa dele.
//
// ⚠️ FAIL-OPEN: se a config não puder ser lida, responde `bloqueia: false`.
// Config indisponível trancando a base inteira é o pior desfecho possível — é o
// oposto do que este portão existe pra fazer.
//
// ⚠️⚠️ NÃO respondemos 426 nas outras rotas, e a razão é medida: **metade do app
// não passa por aqui** (perfil, devocional, cartão, destaques, catálogo de
// grupos vão direto ao Supabase, e o LOGIN é Supabase Auth). Um 426 geral
// produziria um app meio-funcionando — e ainda mataria `POST /telemetria`, que é
// a ÚNICA fonte que mede quem está velho, e afrouxaria o `CadastroGate` (que é
// fail-open em erro de rede). O servidor INFORMA; a tela de bloqueio vive no app.
router.get('/versao', limiterNormal, async (_req, res) => {
  const padrao = {
    bloqueia: false,
    minima_ios: null,
    minima_android: null,
    mensagem: null,
    url_loja_ios: null,
    url_loja_android: null,
  };
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('bloqueia, versao_minima_ios, versao_minima_android, mensagem, url_loja_ios, url_loja_android')
      .eq('id', true)
      .maybeSingle();
    // ⚠️ Tabela ausente (deploy em 2 etapas) cai aqui e responde o padrão —
    // o app segue funcionando como hoje.
    if (error || !data) return res.json(padrao);
    res.json({
      bloqueia: !!data.bloqueia,
      minima_ios: data.versao_minima_ios || null,
      minima_android: data.versao_minima_android || null,
      mensagem: data.mensagem || null,
      url_loja_ios: data.url_loja_ios || null,
      url_loja_android: data.url_loja_android || null,
    });
  } catch (e) {
    console.warn('[APP] /versao:', e.message);
    res.json(padrao);
  }
});

// ── Anúncios (público) ────────────────────────────────────────────────────
router.get('/anuncios', limiterNormal, async (_req, res) => {
  try {
    const { data } = await supabase
      .from('app_anuncios')
      .select('titulo, descricao, cor, link, created_at')
      .eq('ativo', true)
      .order('created_at', { ascending: false })
      .limit(10);
    res.json(data || []);
  } catch {
    res.json([]);
  }
});

// ── Visitante (público) ───────────────────────────────────────────────────
//
// ⚠️⚠️ LIMITER PRÓPRIO, e não o `limiterStrict` (07/08/2026 · Onda 4).
// Esta é a ÚNICA cota que a escala real do culto alcança. O `limiterStrict`
// dá 120/15min no balde ANÔNIMO — e "anônimo" aqui é a igreja inteira atrás de
// um IP (o Wi-Fi do culto). O 121º visitante do quarto de hora levaria 429 e a
// tela diria que o cadastro falhou.
//
// ⚠️ Por que o `limiterStrict` é estreito nas OUTRAS rotas e aqui não pode ser:
// lá ele cobre sonda de identidade por CPF, onde o teto atrapalha enumeração.
// Aqui a pessoa está se apresentando pela primeira vez — não há o que enumerar,
// e quem defende a rota é a validação do próprio serviço.
//
// ⚠️ Teto alinhado com a calibragem da casa pra porta que a multidão usa pelo
// mesmo IP (a mesma de `limiterNormal` e do `totemLimiter` de publicGrupos,
// validada em multidão real no NPS e nos grupos). Por PESSOA continua estreito.
const limiterVisitante = limiterApp({
  max: parseInt(process.env.APP_VISITANTE_RATE_LIMIT_MAX) || 30,
  maxAnonimo: parseInt(process.env.APP_VISITANTE_RATE_LIMIT_IP_MAX) || 3000,
  nome: 'visitante',
});

router.post('/visitante', limiterVisitante, async (req, res) => {
  try {
    const { nome, telefone, email, como_conheceu } = req.body;
    if (!nome?.trim() || !telefone?.trim()) {
      return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });
    }
    const resultado = await acharOuCriarGuardado({
      nome: nome.trim(), telefone, email: email?.trim() || null,
      status: 'visitante', origem: 'app_visitante',
      extra: {
        como_conheceu: como_conheceu || null,
        situacao: 'visitante', origem_cadastro: 'app',
      },
    });
    const { data, error } = await supabase.from('mem_membros')
      .select('id, nome').eq('id', resultado.membro_id).single();
    if (error) throw error;
    res.status(resultado.created ? 201 : 200).json({ ...data, criado: resultado.created });
  } catch (e) {
    console.error('[APP] visitante:', e.message);
    res.status(500).json({ error: 'Erro ao registrar visitante' });
  }
});

// ── Check-in (autenticado) ────────────────────────────────────────────────
router.post('/checkin', authApp, limiterNormal, async (req, res) => {
  try {
    const { service_type_id, data: dataCheckin } = req.body;
    if (!service_type_id || !dataCheckin) {
      return res.status(400).json({ error: 'service_type_id e data são obrigatórios' });
    }
    // Vínculo do app é via profiles.membro_id (mem_membros não tem auth_user_id)
    const membro = await resolveMembroApp(req);

    const { data, error } = await supabase
      .from('mem_checkins')
      .insert({
        service_type_id,
        data: dataCheckin,
        membro_id: membro?.id || null,
        origem: 'app',
        registrado_por: req.user.id,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[APP] checkin:', e.message);
    res.status(500).json({ error: 'Erro ao registrar check-in' });
  }
});

// ── Identidade da conta do app · vincular ao cadastro REAL ────────────────
// Contrato de porta aplicado à entrada do APP (Marcos · 04/08): o gatilho de
// auth.users cria a pessoa sem matcher e sem campo nenhum (21 cadastros assim,
// 13 com nome = prefixo do e-mail, 1 duplicata confirmada). Estes 3 endpoints
// são o caminho CERTO: caminho rápido por CPF com prova de posse do celular, ou
// formulário completo pelo matcher canônico. Ver services/appIdentidade.js.
//
// ⚠️ limiterStrict (10/15min por IP) no caminho do CPF: é sonda de existência
// de cadastro. O teto por TELEFONE/dia está no serviço (o dono do número não
// pediu nada e não pode ser metralhado).
router.post('/identidade/por-cpf', authApp, limiterStrict, async (req, res) => {
  try {
    const r = await appIdentidade.identificarPorCpf({
      cpf: req.body?.cpf,
      authUserId: req.user.id,
      email: req.user.email || null,
      ip: req.ip || null,
    });
    if (!r.ok) return res.status(r.status || 400).json({ error: r.error, codigo: r.codigo });
    res.json(r);
  } catch (e) {
    console.error('[APP] identidade/por-cpf:', e.message);
    res.status(500).json({ error: 'Não foi possível verificar seu CPF agora.' });
  }
});

router.post('/identidade/confirmar', authApp, limiterStrict, async (req, res) => {
  try {
    const r = await appIdentidade.confirmarCodigo({
      verificacaoId: req.body?.verificacao_id,
      codigo: req.body?.codigo,
      authUserId: req.user.id,
      email: req.user.email || null,
    });
    if (!r.ok) return res.status(r.status || 400).json({ error: r.error, codigo: r.codigo });
    res.json(r);
  } catch (e) {
    console.error('[APP] identidade/confirmar:', e.message);
    res.status(500).json({ error: 'Não foi possível confirmar o código agora.' });
  }
});

router.post('/identidade/completar', authApp, limiterNormal, async (req, res) => {
  try {
    const r = await appIdentidade.completarCadastro({
      payload: req.body || {},
      authUserId: req.user.id,
      email: req.user.email || null,
      ip: req.ip || null,
      userAgent: req.get('user-agent') || null,
    });
    if (!r.ok) return res.status(r.status || 400).json({ error: r.error, codigo: r.codigo, campo: r.campo, erros: r.erros });
    res.json(r);
  } catch (e) {
    console.error('[APP] identidade/completar:', e.message);
    res.status(500).json({ error: 'Não foi possível salvar seus dados agora.' });
  }
});

// GET /api/app/identidade/status — a tela de abertura pergunta "preciso
// completar meu cadastro?". Devolve o que falta (sem PII de terceiro).
router.get('/identidade/status', authApp, limiterNormal, async (req, res) => {
  try {
    // ⚠️⚠️ GATE DA FICHA LIGADO (Marcos · 05/08/2026): "todas as pessoas que
    // entrarem no sistema devem completar o cadastro antes; após completar elas
    // acessam normalmente". Então `completo` exige a ficha FECHADA — nome de
    // gente + telefone + nascimento + CPF + sexo. Antes o CPF era só
    // informativo, e o efeito medido era pior: a pessoa entrava "completa" e
    // levava 400 na primeira inscrição (`POST /app/inscricoes` exige CPF), o que
    // acontecia com 50 das 75 contas.
    // A ÚNICA isenção é conta de REVISÃO DE LOJA (o revisor não tem CPF
    // brasileiro e travaria na tela de cadastro → build recusado).
    const exigirFicha = !appIdentidade.contaDeRevisaoLoja(req.user?.email);
    const membro = await resolveMembroApp(req).catch(() => null);
    if (!membro) {
      return res.json({
        vinculado: false,
        completo: false,
        falta: exigirFicha
          ? ['nome', 'telefone', 'nascimento', 'cpf', 'sexo']
          : ['nome', 'telefone', 'nascimento'],
        exige_cpf: exigirFicha,
      });
    }
    const falta = [];
    if (!membro.telefone) falta.push('telefone');
    if (!membro.cpf) falta.push('cpf');
    const { data: m } = await supabase.from('mem_membros')
      .select('nome, data_nascimento, genero').eq('id', membro.id).maybeSingle();
    if (!m?.data_nascimento) falta.push('nascimento');
    if (!m?.genero) falta.push('sexo');
    const nomeFraco = require('../services/membroMatch')
      .ehNomeDerivadoDeEmail(m?.nome, req.user.email || '');
    if (nomeFraco) falta.push('nome');

    // ⚠️⚠️ DADO HERDADO NÃO É PROVA (Marcos · 05/08): "mesmo que o sistema ache
    // que alguém é igual, não deve liberar acesso; depois de preencher todos os
    // dados aí sim pode se ter 100% de certeza". O gatilho de `auth.users` liga
    // por e-mail + nome, então quem caía num cadastro já completo entrava SEM
    // nunca ter provado nada — herdando CPF, nascimento e sexo de um import.
    // Medido antes de ligar: 9 das 89 contas passavam, TODAS por herança.
    // ⚠️ FAIL OPEN se a coluna não existir (deploy em 2 etapas): pedir coluna
    // inexistente faz o PostgREST recusar a query inteira, e tratar isso como
    // "não confirmou" prenderia TODO MUNDO na tela — inclusive depois de
    // preencher, porque a gravação da marca falharia igual. Sem a migration, o
    // comportamento é o de antes; com ela, o portão liga. Select ISOLADO.
    let confirmouFicha = true;
    if (exigirFicha) {
      const { data: prof, error: eProf } = await supabase.from('profiles')
        .select('app_ficha_confirmada_em').eq('id', req.user.id).maybeSingle();
      if (eProf) console.warn('[APP] app_ficha_confirmada_em ausente?', eProf.message);
      else confirmouFicha = !!prof?.app_ficha_confirmada_em;
    }

    // Conta de revisão: CPF e sexo continuam aparecendo em `falta` (informativo),
    // mas não impedem o acesso.
    const bloqueiam = exigirFicha ? falta : falta.filter(f => f !== 'cpf' && f !== 'sexo');
    res.json({
      vinculado: true,
      completo: bloqueiam.length === 0 && confirmouFicha,
      falta,
      // O app pergunta ao SERVIDOR se tem que exigir CPF — nunca decide sozinho
      // (é a mesma lei do resto: quem decide o que é válido é o backend).
      exige_cpf: exigirFicha,
      // ⚠️ `false` = a pessoa nunca confirmou por esta conta ⇒ o formulário NÃO
      // pré-preenche CPF/nascimento/sexo/telefone do cadastro encontrado. Deixar
      // pré-preenchido faria ela "confirmar" dado que ela não forneceu, que é
      // justamente a herança que este bloco fecha.
      pode_preencher_com_vinculo: confirmouFicha,
      nome: m?.nome || membro.nome || null,
    });
  } catch (e) {
    console.error('[APP] identidade/status:', e.message);
    res.status(500).json({ error: 'Erro ao verificar seu cadastro' });
  }
});

// ── Grupos: lista pública ─────────────────────────────────────────────────
router.get('/grupos', limiterNormal, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('mem_grupos')
      .select('id, nome, dia_semana, horario, bairro, local, descricao, ativo')
      .eq('ativo', true)
      .order('nome');
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar grupos' });
  }
});

// ── Meus grupos (autenticado) ─────────────────────────────────────────────
router.get('/membro/grupos', authApp, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.json([]);

    const { data: participacoes } = await supabase
      .from('mem_grupo_membros')
      .select('papel, grupo:mem_grupos(id, nome, dia_semana, horario, bairro, local)')
      .eq('membro_id', membro.id)
      .eq('ativo', true);

    res.json((participacoes || []).map(p => ({ ...p.grupo, papel: p.papel })));
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar grupos do membro' });
  }
});

// ── Perfil do membro (autenticado) ────────────────────────────────────────
router.get('/membro/perfil', authApp, async (req, res) => {
  try {
    // ⚠️ mem_membros NÃO tem coluna auth_user_id — o vínculo do app é via
    // profiles.membro_id (fallback e-mail). Usar resolveMembroApp (padrão da
    // casa) senão a query quebra na coluna inexistente e o perfil some / não
    // salva ("Não foi possível salvar" no app).
    const membro = await resolveMembroApp(req);
    if (!membro) return res.json(null);

    const { data } = await supabase
      .from('mem_membros')
      .select('id, nome, telefone, email, data_nascimento, endereco, situacao, foto_url, membro_desde')
      .eq('id', membro.id)
      .maybeSingle();

    if (!data) return res.json(null);

    const { count: totalCheckins } = await supabase
      .from('mem_checkins')
      .select('*', { count: 'exact', head: true })
      .eq('membro_id', data.id);

    const { count: totalGrupos } = await supabase
      .from('mem_grupo_membros')
      .select('*', { count: 'exact', head: true })
      .eq('membro_id', data.id)
      .eq('ativo', true);

    res.json({ ...data, total_checkins: totalCheckins || 0, total_grupos: totalGrupos || 0 });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar perfil' });
  }
});

// ── Atualizar perfil (autenticado) ────────────────────────────────────────
router.put('/membro/perfil', authApp, limiterNormal, async (req, res) => {
  try {
    const allowed = ['nome', 'telefone', 'data_nascimento', 'endereco'];
    const update  = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => allowed.includes(k))
    );
    // Campo de data vazio vira NULL (coluna date estoura com string '')
    if ('data_nascimento' in update && !update.data_nascimento) update.data_nascimento = null;

    // ⚠️⚠️ ESTE ENDPOINT VIROU O CAMINHO DA TELA DE PERFIL (Onda 2 · 07/08/2026).
    // Até agora ele estava ÓRFÃO — quem salvava era a RPC `app_salvar_membro`,
    // que vinculava conta a cadastro por nome exato (o crítico da auditoria).
    // Agora que ele recebe o que a pessoa digita, o dado passa pelo MESMO
    // saneamento da porta de inscrição: telefone com "+55 (21) …" gravado cru é
    // o que quebra o dedup por telefone do sistema inteiro.
    // ⚠️ Sanear, NÃO recusar: perfil não é porta de inscrição — bloquear aqui
    // prenderia a pessoa numa tela de edição do próprio cadastro.
    const saneado = sanearDadosApp(update);
    if (saneado.ajustes.length) {
      // Só os NOMES dos campos — nunca os valores (é telefone e nascimento).
      console.log(`[APP] perfil · saneado: ${saneado.ajustes.join(', ')}`);
    }
    Object.assign(update, saneado.dados);

    // ⚠️ `nome` vazio não pode ir: a coluna é NOT NULL e o UPDATE estouraria
    // com 23502 — a pessoa veria "Erro ao atualizar perfil" sem saber o motivo.
    if ('nome' in update && !update.nome) {
      return res.status(400).json({ error: 'O nome não pode ficar vazio.', campo: 'nome' });
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo válido para atualizar' });
    }
    // Vínculo via profiles.membro_id (fallback e-mail) — mem_membros não tem
    // auth_user_id. Sem isto o save 404 sempre ("Não foi possível salvar").
    const membro = await resolveMembroApp(req);
    if (!membro) {
      // Conta criada sem cadastro vinculado (/completar-cadastro ainda não
      // rodou): não há mem_membros pra atualizar, mas o telefone que a pessoa
      // digitou NÃO pode se perder — a tela de perfil é onde ela o preenche.
      // Grava só em profiles, já no formato canônico. (O 404 continua: a tela
      // mostra que o cadastro ainda não existe.)
      if ('telefone' in update) {
        const telefonePerfil = update.telefone ? mascaraTelefone(update.telefone) : null;
        supabase.from('profiles').update({ telefone: telefonePerfil }).eq('id', req.user.id)
          .then(() => {}).catch((err) => console.log(`[APP] perfil · sync profiles.telefone (sem membro): ${err.message}`));
      }
      return res.status(404).json({ error: 'Membro não encontrado' });
    }

    const { data, error } = await supabase
      .from('mem_membros').update(update).eq('id', membro.id).select().single();
    if (error) throw error;

    // ⚠️⚠️ `profiles.telefone` também é fonte canônica de telefone (fanout,
    // dedup, waInbox, totem Kids) e a tela de perfil do app gravava o valor
    // CRU ("+55 (21) …" · 13 dígitos com código de país) direto na linha do
    // profile — o dedup compara 11 dígitos e não casa (mesmo bug do update de
    // mem_membros acima, já saneado). O `/perfil` do sistema grava MASCARADO
    // `(21) 99999-9999`; espelhar aqui mantém o app no MESMO formato canônico.
    // Best-effort de propósito: o update de mem_membros é o primário.
    if ('telefone' in update) {
      const telefonePerfil = update.telefone ? mascaraTelefone(update.telefone) : null;
      supabase.from('profiles').update({ telefone: telefonePerfil }).eq('id', req.user.id)
        .then(() => {}).catch((err) => console.log(`[APP] perfil · sync profiles.telefone: ${err.message}`));
    }

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Erro ao atualizar perfil' });
  }
});

// ── Vincular conta via CPF + data nascimento ──────────────────────────────
router.post('/membro/vincular', limiterStrict, authApp, async (req, res) => {
  try {
    const { cpf, data_nascimento } = req.body;
    if (!cpf || !data_nascimento) {
      return res.status(400).json({ error: 'CPF e data de nascimento são obrigatórios' });
    }
    const cpfDigitos = cpf.replace(/\D/g, '');

    // ⚠️ O vínculo do app é profiles.membro_id → mem_membros.id (mem_membros
    // NÃO tem auth_user_id). A versão antiga lia/escrevia mem_membros.auth_user_id
    // (coluna inexistente): a trava de segurança nunca disparava e o vínculo era
    // um no-op silencioso (update numa coluna que não existe).
    const { data: membro } = await supabase
      .from('mem_membros')
      .select('id, nome, cpf, data_nascimento')
      .eq('cpf', cpfDigitos)
      .is('deleted_at', null)
      .maybeSingle();

    if (!membro) {
      return res.status(404).json({ error: 'CPF não encontrado em nosso cadastro' });
    }

    // Verifica data de nascimento (aceita DD/MM/AAAA ou YYYY-MM-DD)
    const normalizar = (v) => (v || '').replace(/\D/g, '');
    const nascBD  = normalizar(membro.data_nascimento);
    const nascReq = normalizar(data_nascimento);
    // Converte DDMMAAAA → AAAAMMDD para comparação com ISO
    const nascReqISO = nascReq.length === 8
      ? `${nascReq.slice(4)}${nascReq.slice(2, 4)}${nascReq.slice(0, 2)}`
      : nascReq;
    if (nascBD !== nascReq && nascBD !== nascReqISO) {
      return res.status(400).json({ error: 'Data de nascimento não confere' });
    }

    // SEGURANÇA: não permitir reivindicar um cadastro já vinculado a OUTRA conta.
    // CPF+nascimento são de baixa entropia (frequentemente vazados no BR); sem
    // essa trava, quem adivinhasse esses dados sequestraria o cadastro de um
    // membro já vinculado. Idempotente se já for o próprio usuário.
    const { data: jaVinculado } = await supabase
      .from('profiles')
      .select('id')
      .eq('membro_id', membro.id)
      .neq('id', req.user.id)
      .limit(1);
    if (jaVinculado && jaVinculado.length > 0) {
      return res.status(409).json({ error: 'Este cadastro já está vinculado a outra conta. Fale com a secretaria.' });
    }

    // Vincula: grava profiles.membro_id do usuário logado. O profile já existe
    // (handle_new_user cria no cadastro) → UPDATE direto, sem risco de NOT NULL.
    const { data: linked, error: linkErr } = await supabase
      .from('profiles')
      .update({ membro_id: membro.id })
      .eq('id', req.user.id)
      .select('id')
      .maybeSingle();
    if (linkErr) throw linkErr;
    if (!linked) return res.status(404).json({ error: 'Conta não encontrada. Saia e entre de novo.' });

    res.json({ ok: true, nome: membro.nome });
  } catch (e) {
    console.error('[APP] vincular:', e.message);
    res.status(500).json({ error: 'Erro ao vincular conta' });
  }
});

// ── Voluntariado: status (autenticado) ────────────────────────────────────
router.get('/voluntariado/status/:userId', authApp, async (req, res) => {
  try {
    const { data: volProfile } = await supabase
      .from('vol_profiles')
      .select('id, status, area, funcao')
      .eq('auth_user_id', req.user.id)
      .maybeSingle();

    res.json({
      voluntario: volProfile?.status === 'ativo',
      area:       volProfile?.area   || null,
      funcao:     volProfile?.funcao || null,
    });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao verificar status de voluntário' });
  }
});

// ── Supervisor de área (app monta escala) ──────────────────────────────────
// Retorna as áreas onde o membro logado é supervisor de escala. O app usa pra
// liberar as telas de montar/ver escala da área. A concessão é feita no sistema
// (aba Voluntariado → Supervisores).
router.get('/voluntariado/supervisor', authApp, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req).catch(() => null);
    if (!membro) return res.json({ supervisor: false, areas: [] });
    const { data } = await supabase
      .from('vol_area_supervisores')
      .select('area')
      .eq('membro_id', membro.id);
    const areas = [...new Set((data || []).map(r => r.area).filter(Boolean))];
    res.json({ supervisor: areas.length > 0, areas });
  } catch (e) {
    console.error('[app] voluntariado/supervisor:', e.message);
    res.status(500).json({ error: 'Erro ao verificar supervisão' });
  }
});

// ── Inscrições ────────────────────────────────────────────────────────────
// Tipos aceitos pelo app. Os pastorais (Cuidados) notificam a equipe e
// entram na fila da aba "Acompanhamentos" do módulo Cuidados.
const TIPOS_INSCRICAO = new Set([
  'grupos', 'batismo', 'retiro', 'cursos', 'next', 'voluntariado', 'eventos',
  'aconselhamento', 'oracao', 'sos', 'contato',
]);
const TIPOS_CUIDADOS = new Set(['aconselhamento', 'oracao', 'sos']);
// Tipos que geram confirmação por WhatsApp (template cbrio_inscricao_confirmada).
//
// ⚠️ SÓ entra aqui o tipo que o fan-out (fn_app_inscricoes_fanout) realmente
// MATERIALIZA numa tabela do módulo. `retiro`/`cursos`/`eventos` foram REMOVIDOS
// em 2026-07-28: o fan-out não tem branch pra eles, então a linha ficava
// invisível em `app_inscricoes` e a pessoa recebia "Inscrição confirmada" de uma
// inscrição que não existia em lugar nenhum. Nunca dizer "confirmada" sem que a
// inscrição exista de fato (no retiro, sem pagamento confirmado no servidor).
const LABEL_INSCRICAO_WPP = {
  grupos: 'Grupos de Conexão', batismo: 'Batismo', next: 'NEXT',
  voluntariado: 'Voluntariado',
};
// Tipos aceitos mas SEM destino no fan-out — viram LEAD ("quero ir"): não
// confirmam nada, só avisam a equipe pra alguém dar seguimento. Retiro tem
// fluxo próprio (página pública com pagamento), não entra por aqui.
const LABEL_INSCRICAO_LEAD = {
  retiro: 'Retiro', cursos: 'Cursos', eventos: 'Eventos',
};
const MODULO_LEAD = { retiro: 'eventos', cursos: 'eventos', eventos: 'eventos' };
// Pra onde vai o aviso quando o FANOUT falha (status='erro' · migration
// 20260806160000). São os 4 tipos que têm ramo no trigger — os pastorais e o
// `contato` não passam por fanout, então nunca caem nesse caminho.
const MODULO_POR_TIPO_INSCRICAO = {
  grupos: 'grupos', batismo: 'batismos', next: 'next', voluntariado: 'voluntariado',
};
const LINK_POR_TIPO_INSCRICAO = {
  grupos: '/grupos?tab=entrada', batismo: '/batismo',
  next: '/ministerial/next?tab=turmas', voluntariado: '/ministerial/voluntariado/inscricoes',
};
/**
 * Onde o fanout pousa cada tipo, e como o Contrato se chama LÁ.
 *
 * ⚠️⚠️ O VOCABULÁRIO E OS NOMES DE COLUNA DIVERGEM POR TABELA, e isso foi
 * conferido no banco (não decorado): `vol_inscricoes.sexo` e
 * `next_matriculas.sexo` são canônicos (`masculino`/`feminino`), mas
 * `batismo_inscricoes.sexo` é **curto** (`M`/`F` — 5 F e 1 M em produção).
 * Copiar cru de um pro outro grava valor que nenhum filtro encontra depois.
 *
 * ⚠️ `grupos` fica FORA de propósito: `mem_grupo_pedidos` **não tem** coluna de
 * CPF, nascimento nem sexo (introspectado em 11/08) — o que o pedido de grupo faz
 * com o CPF já é outro caminho, o `reconciliarCpfTardio` de 06/08. Inventar
 * coluna aqui faria o PostgREST recusar o UPDATE inteiro (42703).
 */
const DESTINO_CONTRATO = {
  voluntariado: {
    tabela: 'vol_inscricoes',
    mapa: { cpf: 'cpf', data_nascimento: 'data_nascimento', sexo: 'sexo' },
    sexo: 'canonico',
  },
  batismo: {
    tabela: 'batismo_inscricoes',
    mapa: { cpf: 'cpf', data_nascimento: 'data_nascimento', sexo: 'sexo' },
    sexo: 'curto',
  },
  next: {
    tabela: 'next_matriculas',
    mapa: { cpf: 'cpf', data_nascimento: 'data_nascimento', sexo: 'sexo' },
    sexo: 'canonico',
  },
};

/**
 * Preenche, na linha que o fanout acabou de criar, o que o CADASTRO da pessoa já
 * sabe e o app não mandou.
 *
 * ⚠️ Acha a linha por (membro, recém-criada) porque o fanout roda na MESMA
 * transação do insert em `app_inscricoes` — sem a janela curta, uma inscrição
 * ANTIGA da mesma pessoa seria reescrita a cada nova.
 * ⚠️ Lê as colunas do mapa no SELECT: `patchDoCadastro` só toca campo que veio na
 * linha, e é assim que ele sobrevive a tabela sem a coluna em vez de derrubar
 * tudo com 42703.
 */
async function completarComCadastro(tipo, membroId) {
  const destino = DESTINO_CONTRATO[tipo];
  if (!destino) return null;

  const { data: membro } = await supabase
    .from('mem_membros')
    .select('cpf, data_nascimento, genero, email, telefone')
    .eq('id', membroId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!membro) return null;

  const colunas = ['id', ...Object.values(destino.mapa)].join(', ');
  const desde = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: linha } = await supabase
    .from(destino.tabela)
    .select(colunas)
    .eq('membro_id', membroId)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!linha) return null;

  const patch = patchDoCadastro(linha, membro, destino.mapa, { sexo: destino.sexo });
  if (!Object.keys(patch).length) return null;

  const { error } = await supabase.from(destino.tabela).update(patch).eq('id', linha.id);
  if (error) throw error;
  return { tabela: destino.tabela, campos: Object.keys(patch) };
}

const LABEL_CUIDADOS = { aconselhamento: 'aconselhamento', oracao: 'oração', sos: 'SOS' };
// Mapeia a urgência pra cor do sino (SEV_COLORS no AppShell)
const SEV_CUIDADOS = { sos: 'urgente', aconselhamento: 'aviso', oracao: 'info' };

function extrairMensagem(d) {
  return d.mensagem || d.message || d.texto || d.descricao || d.obs || d.observacao || null;
}

// GET /api/app/inscricoes/portas — os links públicos que o MEMBRO pode mandar
// pra outra pessoa ("vem se inscrever"). Pedido do Matheus (20/08/2026).
//
// ⚠️ SÓ LEITURA e sem dado de pessoa: a resposta é o catálogo de portas com a
// URL pública, igual pra todo mundo. Nada aqui depende de quem está pedindo.
//
// ⚠️ Quem monta a URL é o SERVIDOR (`utils/linkInscricaoApp`), nunca o app —
// URL escrita no bundle é URL que ninguém valida e que só se conserta por OTA.
// Ver o link morto de `/apresentacao-criancas` (11/08/2026).
router.get('/inscricoes/portas', authApp, limiterNormal, async (req, res) => {
  try {
    res.json({ portas: portasCompartilhaveis() });
  } catch (e) {
    console.error('[APP] inscricoes/portas:', e.message);
    // ⚠️ Lista vazia com 200 faria o app esconder os botões e parecer que a
    // igreja não tem porta de inscrição nenhuma. Erro é erro.
    res.status(500).json({ error: 'Erro ao carregar os links de inscrição' });
  }
});

router.post('/inscricoes', limiterStrict, tryAuth, async (req, res) => {
  try {
    const { tipo, ...extras } = req.body || {};
    if (!tipo) return res.status(400).json({ error: 'Tipo de inscrição é obrigatório' });
    if (!TIPOS_INSCRICAO.has(tipo)) {
      console.warn('[APP] inscricoes · tipo não reconhecido:', tipo);
      return res.status(400).json({ error: `Tipo de inscrição não reconhecido: ${tipo}` });
    }

    const ehCuidados = TIPOS_CUIDADOS.has(tipo);
    // `let`: o saneamento (mais abaixo) devolve um objeto NOVO.
    let dados = { ...extras };
    let membroId = null;

    // Pedidos pastorais + batismo/next: resolve o membro logado pra vincular a
    // ficha + snapshot de nome/telefone. Pro batismo/next isso melhora a taxa
    // de vínculo do fan-out (trigger fn_app_inscricoes_fanout) — o JWT já
    // identifica a pessoa, não dá pra depender só do que o form mandou.
    // Resolve o membro logado pra TODO tipo (backfill de nome/telefone/CPF —
    // o CPF virou obrigatório nas inscrições · 2026-07-24)
    if (true) {
      const membro = await resolveMembroApp(req).catch(() => null);
      if (membro) {
        membroId = membro.id;
        dados.membro_id = membro.id;
        if (!dados.nome && membro.nome) dados.nome = membro.nome;
        if (!dados.telefone && membro.telefone) dados.telefone = membro.telefone;
        if (!dados.cpf && membro.cpf) dados.cpf = membro.cpf;
      }
      // Fallback: o app também envia membro_id no corpo (já autenticado por JWT).
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!membroId && typeof extras.membro_id === 'string' && UUID_RE.test(extras.membro_id)) {
        membroId = extras.membro_id;
      }
    }

    // CPF obrigatório nas INSCRIÇÕES (grupos/batismo/next/voluntariado/retiro/
    // cursos/eventos). Pedidos pastorais (oração/sos/aconselhamento) e contato
    // ficam FORA — urgência pastoral não pode travar em documento.
    if (!ehCuidados && tipo !== 'contato') {
      const cpfDig = String(dados.cpf || '').replace(/\D+/g, '');
      if (cpfDig.length !== 11) {
        return res.status(400).json({ error: 'CPF é obrigatório pra se inscrever — complete seu CPF no perfil do app.' });
      }
      dados.cpf = cpfDig;
    }

    // ⚠️ `tipo:'next'` (build ANTIGO do app · a tela órfã) ia pro ramo `next` do
    // `fn_app_inscricoes_fanout`, que procura `next_eventos` agendado e futuro —
    // e não existe nenhum desde 21/06. Resultado: a linha virava 'processado' e
    // NADA era criado; a pessoa via "enviado" sem estar inscrita em nada. Agora
    // passa pela MESMA régua do `/next/inscrever` (matrícula na turma do próximo
    // encontro). Medido em 05/08: 0 linhas `tipo='next'` em app_inscricoes — é
    // rede de segurança, não fluxo vivo, mas rede que mentia.
    if (tipo === 'next') {
      const membroNext = membroId ? await resolveMembroApp(req).catch(() => null) : null;
      if (!membroNext) {
        return res.status(404).json({ error: 'Cadastro de membro não encontrado — complete seu cadastro no app.' });
      }
      const rNext = await matricularNoNextAberto({ membro: membroNext, email: req.user?.email })
        .catch((e) => { console.error('[APP] inscricoes next:', e.message); return { ok: false, error: 'Não foi possível inscrever no NEXT agora.' }; });
      if (!rNext.ok) return res.status(400).json({ error: rNext.error });
      if (rNext.matricula_id) {
        notificar({
          modulo: 'next',
          tipo: 'next_nova_inscricao',
          titulo: 'Nova inscrição no NEXT',
          mensagem: `${membroNext.nome || 'Alguém'} se inscreveu no NEXT pelo app (${rNext.turma.titulo}).`,
          link: '/ministerial/next?tab=turmas',
          chaveDedup: `next_mat_${rNext.matricula_id}`,
        }).catch(e => console.warn('[APP] inscricoes next · notificar:', e.message));
      }
      // Segue e grava em app_inscricoes (rastro do pedido). O ramo `next` do
      // fan-out é no-op hoje (não há evento agendado), então não duplica.
    }

    // ⚠️ Horário do batismo · MESMA régua do formulário público
    // (`utils/batismoHorario` + `services/batismoHorarios`). O app é um cliente
    // novo da porta, não uma 2ª régua — reproduzir a decisão aqui é como o app
    // passa a oferecer horário que o servidor recusa.
    //
    // ⚠️ O campo é OPCIONAL, e tem que continuar sendo: o binário da loja e todo
    // bundle que ainda não aplicou o OTA não sabem que horário existe. Exigir
    // aqui trancaria essa gente fora do batismo — a mecânica do portão que
    // trancou todo mundo em 06/08.
    if (tipo === 'batismo' && dados.horario_culto && String(dados.horario_culto).trim()) {
      const dataBat = await dataProximoBatismo();
      const [configurados, ocupacao] = await Promise.all([
        batismoHorariosConfigurados(),
        // Sem a data não dá pra contar ocupação; `configurados: null` já força a
        // recusa, mas passamos {} pra não fingir que o horário está vazio.
        dataBat ? batismoOcupacaoPorHorario(dataBat) : Promise.resolve({}),
      ]);
      const av = avaliarHorarioBatismo(dados.horario_culto, {
        configurados: dataBat ? configurados : null, // falha na data = falha fechada
        ocupacao,
      });
      if (!av.ok) return res.status(409).json({ error: av.mensagem });
      dados.horario_culto = av.horario;
    }

    // Pedido de oração: a IA classifica o tema (pra insights) já no insert.
    if (tipo === 'oracao') {
      const msgOra = extrairMensagem(extras);
      if (msgOra) {
        const analise = await analisarOracao(msgOra).catch(() => null);
        if (analise) dados.analise = analise;
      }
    }

    // ⚠️⚠️ SANEAMENTO DO PAYLOAD (06/08/2026 · auditoria, Onda 1 item 3).
    //
    // O que isto conserta, medido em produção: **o '55' grudado no telefone**.
    // 15 das 22 linhas de `app_inscricoes` têm 13 dígitos começando com 55 (vem
    // de `profiles.telefone`, que o PhoneInput grava como "+55 (21) …"), e o
    // fanout só remove NÃO-DÍGITO — ele não tira código de país. Efeito: as 5
    // inscrições de voluntariado que chegaram em `vol_inscricoes` estão com 13
    // dígitos, e o **próprio dedup por telefone do fanout compara contra os 11
    // dígitos da base** ⇒ não casa, e a pessoa pode duplicar.
    //
    // ⚠️ NÃO chamamos `validarCamposPadrao` aqui, e é decisão com número: medi o
    // que o app manda e ligar o contrato pleno reprovaria ~tudo — 0 de 22
    // payloads mandam nascimento ou sexo, oração/SOS/aconselhamento nunca mandam
    // e-mail, a régua de telefone não tem flag pra relaxar (e 46 dos 83
    // cadastros ligados a conta do app não têm telefone) e batismo manda `nome` =
    // primeiro token. Aplicar ali travaria o botão de SOS pra ~55% das contas,
    // numa tela que não tem campo pra corrigir. Subir exigência é decisão com a
    // base fechada — outra onda, com a medição na mão.
    //
    // Régua pura em `utils/saneamentoInscricaoApp.js` (no gate). NÃO bloqueia:
    // campo que não normaliza vira null, que é o que o fanout já gravava.
    const saneado = sanearDadosApp(dados);
    if (saneado.ajustes.length) {
      // Loga só os NOMES dos campos ajustados — nunca os valores (é telefone e CPF).
      console.log(`[APP] inscricoes · payload saneado (${tipo}): ${saneado.ajustes.join(', ')}`);
    }
    dados = saneado.dados;

    // ⚠️⚠️ TRAVA DE ENTRADA EM GRUPO — ESTE HANDLER NÃO VALIDAVA NADA (10/08/2026)
    //
    // Achado pelo Marcos testando no aparelho: *"eu sou homem e consigo ver os
    // grupos apenas para mulheres e posso tentar me inscrever, e isso não é
    // possível no nosso webapp."* Ele estava certo, e o buraco é MAIOR que a
    // queixa: este `POST` não lia **categoria/gênero, `ativo`,
    // `aceitando_inscricoes`, `modo_inscricao='fechado'` nem temporada** —
    // cinco travas do site, nenhuma aqui. O app não "escapava" da trava do
    // site: o site trava em `publicGrupos.js` (formulário público) e o app tem
    // porta própria, que nasceu sem elas.
    //
    // A régua agora vive num lugar só (`utils/entradaGrupoApp.js`, 37 asserções
    // no gate) e é a MESMA que o site usa. Duas cópias divergindo é a doença
    // recorrente deste sistema.
    //
    // ⚠️ Roda DEPOIS do saneamento e ANTES do insert: recusar tem que acontecer
    // sem deixar rastro, senão a coordenação passa a ver fila de pedido que
    // nunca deveria ter existido.
    if (tipo === 'grupos' && dados.grupo_id) {
      const { data: grupoAlvo } = await supabase
        .from('mem_grupos')
        .select('id, nome, categoria, ativo, aceitando_inscricoes, modo_inscricao, temporada, deleted_at')
        .eq('id', dados.grupo_id)
        .maybeSingle();

      // A temporada só é consultada quando o grupo depende dela — `null` diz
      // "não havia o que consultar", que a régua trata diferente de "fechada".
      let temporadaAberta = null;
      if (grupoAlvo?.temporada && String(grupoAlvo.modo_inscricao || '') !== 'sempre_aberto') {
        const { data: temp } = await supabase
          .from('mem_temporadas')
          .select('inscricoes_abertas')
          .eq('id', grupoAlvo.temporada)
          .maybeSingle();
        temporadaAberta = temp?.inscricoes_abertas === true;
      }

      // ⚠️ O sexo NÃO vem de `resolveMembroApp` (ele seleciona só
      // id/nome/cpf/email/telefone). Leitura ISOLADA: se falhar, a régua devolve
      // `sexo_necessario` — pede o dado, em vez de deixar passar.
      let genero = dados.genero || dados.sexo || null;
      if (!genero && membroId) {
        const { data: m } = await supabase
          .from('mem_membros').select('genero').eq('id', membroId).maybeSingle();
        genero = m?.genero || null;
      }

      const veredito = avaliarEntradaNoGrupo({ grupo: grupoAlvo, genero, temporadaAberta });
      if (!veredito.ok) {
        console.log(
          `[APP] inscricoes · grupo recusado (${veredito.codigo}) · grupo=${dados.grupo_id} membro=${membroId || 'anon'}`,
        );
        return res.status(veredito.status).json({ error: veredito.erro, codigo: veredito.codigo });
      }
    }

    const { data: inserted, error } = await supabase
      .from('app_inscricoes')
      .insert({
        tipo,
        auth_user_id: req.user?.id || null,
        membro_id: membroId,
        dados,
        status: 'pendente',
      })
      .select('id')
      .single();

    // Erro de gravação NÃO devolve 200 silencioso — o app precisa saber.
    if (error) {
      console.error('[APP] inscricoes · falha ao gravar:', error.message);
      return res.status(500).json({ error: 'Não foi possível registrar sua solicitação. Tente novamente.' });
    }

    // ⚠️⚠️ O FANOUT PODE TER FALHADO — E ATÉ 06/08/2026 ISSO ERA INVISÍVEL.
    //
    // `fn_app_inscricoes_fanout` é AFTER INSERT: ele roda na MESMA transação,
    // mas o `RETURNING` do insert reflete a linha ANTES do trigger, então o
    // `status` que veio acima é sempre 'pendente'. Quem sabe o que aconteceu de
    // fato é a linha RELIDA.
    //
    // Antes, ramo que falhava era engolido (`RAISE WARNING`) e a linha era
    // carimbada 'processado' de qualquer jeito: a pessoa via "inscrição
    // enviada", recebia WhatsApp de confirmação e **não existia pedido em fila
    // nenhuma**. Vítima medida na auditoria: um pedido de grupo de 11/06.
    // A migration `20260806160000` fez o ramo que falha marcar **'erro'** (com
    // SQLSTATE + constraint em `dados`); esta releitura é o que transforma isso
    // em erro VISÍVEL — pra equipe e pra pessoa.
    //
    // ⚠️ Best-effort de propósito: se a releitura falhar, seguimos no caminho de
    // sucesso. A linha existe e o rastro está no banco; derrubar a resposta por
    // causa de uma consulta de conferência seria pior que o problema.
    // ⚠️ `fanout_erro` em select ISOLADO junto do status: pedir coluna que a
    // migration ainda não criou faz o PostgREST recusar a query INTEIRA, e aí a
    // conferência viraria "não deu erro" — o oposto do que ela existe pra fazer.
    // Deploy em 2 etapas: sem a migration, `posFanout` vem null e seguimos no
    // caminho antigo (a lição do `parcelas_max`).
    const { data: posFanout } = await supabase
      .from('app_inscricoes')
      .select('status, fanout_erro')
      .eq('id', inserted.id)
      .maybeSingle();

    if (posFanout?.status === 'erro') {
      const nomeErro = dados.nome || req.user?.email || 'Alguém';
      const sqlstate = posFanout.fanout_erro?.sqlstate || '?';
      const constr = posFanout.fanout_erro?.constraint || null;
      console.error(
        `[APP] inscricoes · fanout falhou · tipo=${tipo} id=${inserted.id} sqlstate=${sqlstate}${constr ? ` constraint=${constr}` : ''}`,
      );
      notificar({
        modulo: MODULO_POR_TIPO_INSCRICAO[tipo] || 'membresia',
        tipo: 'app_inscricao_erro',
        titulo: `Inscrição pelo app NÃO foi registrada — ${nomeErro}`,
        mensagem:
          `A solicitação de ${LABEL_INSCRICAO_WPP[tipo] || tipo} de ${nomeErro} não chegou na fila `
          + `(erro ${sqlstate}${constr ? ` em ${constr}` : ''}). A pessoa foi avisada e pode ter tentado de novo. `
          + 'Registrar à mão ou corrigir a causa.',
        link: LINK_POR_TIPO_INSCRICAO[tipo] || '/ministerial/membresia',
        severidade: 'alta',
        // Dedup por PESSOA+TIPO, não por linha: quem toma erro tende a tentar de
        // novo, e cada tentativa cria uma linha nova — dedup por id encheria o
        // sino com o mesmo problema (lição dos avisos em massa do censo).
        chaveDedup: `app_inscricao_erro_${tipo}_${membroId || req.user?.id || 'anon'}`,
      }).catch((e) => console.warn('[APP] inscricoes · notificar erro de fanout:', e.message));

      // ⚠️ E a pessoa passa a ouvir a verdade. Dizer "recebido" pra algo que não
      // existe é o defeito que estamos consertando; o custo aceito é ela poder
      // tentar de novo (o dedup do fanout trata) enquanto a equipe corrige.
      return res.status(502).json({
        error:
          'Não conseguimos concluir sua solicitação agora. Nossa equipe já foi avisada '
          + 'e vai resolver — se preferir, tente novamente em alguns minutos.',
        codigo: 'fanout_falhou',
      });
    }

    // ⚠️ `duplicado` caía no caminho de SUCESSO — a pessoa lia "Solicitação
    // recebida! Nossa equipe entrará em contato." tendo o fan-out reconhecido
    // que ela JÁ está inscrita, e a equipe recebia um aviso de "nova inscrição"
    // que não existe. É o mesmo defeito do `erro`, na versão silenciosa: a lei
    // do Contrato de Inscrição diz que `ja_inscrito`/`duplicado` são EXIBIDOS,
    // nunca engolidos como confirmação.
    if (posFanout?.status === 'duplicado') {
      return res.status(200).json({
        ok: true,
        id: inserted.id,
        duplicado: true,
        message:
          `Você já tem uma inscrição de ${LABEL_INSCRICAO_WPP[tipo] || tipo} em andamento — `
          + 'não precisa se inscrever de novo. Nossa equipe já está com o seu pedido.',
      });
    }

    // ⚠️⚠️ O APP PASSA A CARREGAR O QUE O CADASTRO JÁ TEM (11/08/2026).
    //
    // Pedido do Marcos, depois da auditoria das 7 portas: *"caso alguém tenha
    // baixado e não tenha esses campos, já colocamos a tela de preencher; quando
    // elas voltarem terão, e aí vamos passar isso."*
    //
    // O fanout grava nome/telefone/e-mail e **deixa CPF, nascimento e sexo
    // vazios** — mas o CADASTRO da pessoa costuma ter os três (medido em 11/08:
    // 10 das 12 linhas incompletas de origem `app` têm cadastro completo). O dado
    // existia; o app é que não o carregava. Então **preencher, não exigir**:
    // exigir na porta reprovaria as contas que ainda não passaram pelo portão de
    // identidade e derrubaria inclusive o SOS.
    //
    // ⚠️ SÓ-ONDE-VAZIO e best-effort — a régua pura vive em
    // `utils/dadosDoCadastro` (testável, sem Supabase). Nunca sobrescreve o que a
    // pessoa digitou, e falhar aqui não desfaz a inscrição, que já está gravada.
    if (membroId && DESTINO_CONTRATO[tipo]) {
      try {
        await completarComCadastro(tipo, membroId);
      } catch (e) {
        console.warn('[APP] inscricoes · completar do cadastro:', e.message);
      }
    }

    // ⚠️⚠️ INSCRIÇÃO DE GRUPO PELO APP AGORA AVISA O LÍDER (06/08/2026).
    //
    // Até aqui só o formulário público (`publicGrupos`) mandava o template
    // `grupos_pedido_novo_lider_v2`. O app criava o pedido pelo fanout e
    // NINGUÉM avisava o líder — o pedido ficava pendente na Caixa de entrada e
    // quem deveria ligar pra pessoa antes de aprovar (lei dos templates v2,
    // 29/07) não sabia que ele existia. Medido em 06/08: 1 pedido origem-app
    // na história inteira, e a líder dele sem nenhum aviso desde o dia 06.
    //
    // ⚠️ AWAITED — mesma lei de 31/07 (em porta pública serverless, o que não
    // pode se perder vai awaited; enfileirar é 1 INSERT). E roda DEPOIS da
    // releitura do fanout: avisar o líder de um pedido que não existe é pior
    // que não avisar.
    // ⚠️ Best-effort no erro: o pedido já está gravado e a pessoa já tem vaga
    // na fila — derrubar a resposta porque o aviso falhou seria trocar um
    // problema de comunicação por um de inscrição. A falha vira log, e a
    // Caixa de entrada continua sendo o caminho garantido da coordenação.
    if (tipo === 'grupos' && dados.grupo_id) {
      try {
        // O fanout roda na MESMA transação do insert, então o pedido nasce com
        // `created_at` igual ao da linha de `app_inscricoes`. Localizamos pelo
        // par (grupo, membro) + pendente + origem 'app' dentro de uma janela
        // curta — sem a janela, um pedido ANTIGO da mesma pessoa no mesmo
        // grupo seria re-notificado a cada nova tentativa dela.
        const desde = new Date(Date.now() - 2 * 60 * 1000).toISOString();
        let q = supabase
          .from('mem_grupo_pedidos')
          .select('id, nome, telefone, email')
          .eq('grupo_id', dados.grupo_id)
          .eq('status', 'pendente')
          .eq('origem', 'app')
          .gte('created_at', desde)
          .order('created_at', { ascending: false })
          .limit(1);
        q = membroId ? q.eq('membro_id', membroId) : q.is('membro_id', null);
        const { data: pedidos } = await q;
        const pedido = pedidos?.[0] || null;

        if (pedido) {
          const { data: grupo } = await supabase
            .from('mem_grupos')
            .select('id, nome, lider_id')
            .eq('id', dados.grupo_id)
            .maybeSingle();
          if (grupo) {
            const r = await gruposWpp.notificarLiderNovoPedido({
              grupo,
              pedidoId: pedido.id,
              pessoa: {
                nome: pedido.nome || dados.nome,
                telefone: pedido.telefone || dados.telefone,
                email: pedido.email || dados.email,
              },
            });
            if (!r?.sent) {
              console.log('[APP] inscricoes · aviso ao líder não enviado:', r?.reason || r?.status);
            }

            // ⚠️ O sino do APP, além do WhatsApp. São canais DIFERENTES: o
            // WhatsApp alcança os 89 líderes, o sino alcança os 15 que têm
            // conta — e é o único que funciona no Android sem Firebase.
            await avisarPedidoNovoNoApp({
              grupoId: grupo.id,
              pedidoId: pedido.id,
              grupoNome: grupo.nome,
              pessoaNome: pedido.nome || dados.nome,
            });
          }
        } else {
          console.warn('[APP] inscricoes · pedido de grupo não localizado pra avisar o líder:', inserted.id);
        }
      } catch (e) {
        console.warn('[APP] inscricoes · aviso ao líder:', e.message);
      }
    }

    // Notifica a equipe de Cuidados (in-app + push). SOS é urgente.
    if (ehCuidados) {
      const nome = dados.nome || req.user?.email || 'Alguém';
      const label = LABEL_CUIDADOS[tipo] || tipo;
      const msg = extrairMensagem(extras);
      const urgente = tipo === 'sos';
      notificar({
        modulo: 'cuidados',
        tipo: `app_pedido_${tipo}`,
        titulo: urgente ? `🆘 SOS — ${nome}` : `Novo pedido de ${label} — ${nome}`,
        mensagem: `${nome} pediu ${label} pelo app${msg ? `: "${String(msg).slice(0, 180)}"` : '.'}`,
        link: '/ministerial/cuidados?tab=acomp',
        severidade: SEV_CUIDADOS[tipo] || 'info',
        chaveDedup: `app_pedido_${inserted.id}`,
      }).catch(e => console.warn('[APP] inscricoes · notificar:', e.message));
    }

    // Fale Conosco: avisa a equipe e aponta pra FILA onde a mensagem aparece.
    // ⚠️ Corrigido em 06/08/2026 (auditoria): o aviso ia pro módulo `membresia`
    // com link pra `/ministerial/membresia`, uma tela que NÃO lista
    // `app_inscricoes` — a pessoa clicava e não achava a mensagem, que fica
    // truncada em 180 chars aqui e em nenhum outro lugar. Agora vai pro módulo
    // `cuidados` (o dono da única fila que lê essa tabela, e a permissão que a
    // fila exige: cuidados >= 1) e aponta pra Caixa de entrada, onde dá pra
    // ler inteira, responder pelo Conversas e marcar como tratada.
    // ⚠️ Se a secretaria tiver que receber isto, o caminho é regra de
    // notificação do módulo `cuidados` em /admin — não um 2º destino aqui.
    if (tipo === 'contato') {
      const nome = dados.nome || req.user?.email || 'Alguém';
      const msg = extrairMensagem(extras);
      const assunto = dados.assunto ? ` (${String(dados.assunto).slice(0, 40)})` : '';
      notificar({
        modulo: 'cuidados',
        tipo: 'app_contato',
        titulo: `Fale Conosco — ${nome}${assunto}`,
        mensagem: `${nome} mandou uma mensagem pelo app${msg ? `: "${String(msg).slice(0, 180)}"` : '.'}`,
        link: '/ministerial/cuidados?tab=acomp',
        severidade: 'info',
        chaveDedup: `app_contato_${inserted.id}`,
      }).catch(e => console.warn('[APP] inscricoes · notificar contato:', e.message));
    }

    // Batismo: o fan-out (trigger) cria a inscrição em batismo_inscricoes —
    // aqui só avisa a equipe do módulo (espelho do publicBatismo).
    if (tipo === 'batismo') {
      const nome = [dados.nome, dados.sobrenome].filter(Boolean).join(' ') || req.user?.email || 'Alguém';
      notificar({
        modulo: 'batismos',
        tipo: 'nova_inscricao_batismo',
        titulo: 'Nova inscrição de batismo (app) 💧',
        mensagem: `${nome} se inscreveu pro batismo pelo app.`,
        link: '/batismo',
        severidade: 'info',
        chaveDedup: `batismo_app_${inserted.id}`,
      }).catch(e => console.warn('[APP] inscricoes · notificar batismo:', e.message));
    }

    // Mensagem automática de WhatsApp pro membro que pediu aconselhamento pastoral.
    if (tipo === 'aconselhamento') {
      try {
        await dispararAuto('cuidados_aconselhamento', {
          refId: inserted.id, telefone: dados.telefone, nome: dados.nome, origem: 'app',
        });
      } catch (e) { console.warn('[APP] aconselhamento whatsapp:', e.message); }
    }

    // Lead sem destino no fan-out (retiro/cursos/eventos): NÃO confirma nada —
    // só avisa a equipe, senão o registro fica invisível em `app_inscricoes` e
    // ninguém dá seguimento (era o caso até 2026-07-28).
    if (LABEL_INSCRICAO_LEAD[tipo]) {
      const nome = dados.nome || req.user?.email || 'Alguém';
      const label = LABEL_INSCRICAO_LEAD[tipo];
      const msg = extrairMensagem(extras);
      notificar({
        modulo: MODULO_LEAD[tipo] || 'eventos',
        tipo: `app_interesse_${tipo}`,
        titulo: `Interesse em ${label} — ${nome}`,
        mensagem: `${nome} demonstrou interesse em ${label} pelo app${msg ? `: "${String(msg).slice(0, 180)}"` : '.'} Entre em contato — não há inscrição confirmada.`,
        link: '/eventos',
        severidade: 'info',
        chaveDedup: `app_interesse_${inserted.id}`,
      }).catch(e => console.warn('[APP] inscricoes · notificar lead:', e.message));
    }

    // ⚠️⚠️ AWAITED — e isto É a causa-raiz da mensagem DUPLICADA de 06/08/2026.
    //
    // Este bloco era `resolveMembroApp(req).then(...)` SEM await, com o
    // `res.status(201).json(...)` logo abaixo. Em serverless o container
    // CONGELA na resposta: `enfileirar` já havia feito o INSERT (commitado) e
    // `tentarEnvio` já havia chamado a Meta — a mensagem foi ENTREGUE às 16:33
    // — mas o UPDATE que marca a linha como `enviado` se perdeu no
    // congelamento. A linha ficou `pendente` e o cron horário da fila
    // REENVIOU às 17:00. A pessoa recebeu o mesmo texto duas vezes.
    //
    // ⚠️ A forense enganou no começo: a linha da fila mostrava `tentativas=1` e
    // UM message_id (o do SEGUNDO envio). Envio cuja escrituração se perdeu é
    // INVISÍVEL em `tentativas`/`message_id` — o screenshot do Marcos é que
    // provou as duas entregas. Não concluir "não duplicou" só porque a fila
    // mostra um envio.
    //
    // Lei de 31/07 aplicada: em porta pública serverless, o que não pode se
    // perder vai AWAITED. `membroId` e `dados.nome` já estão em escopo
    // (resolvidos no topo do handler), então não há 2ª chamada a
    // `resolveMembroApp`. Opt-in e env do template seguem sendo julgados
    // dentro de `notificarMembro` (no-op gracioso quando não configurado).
    if (LABEL_INSCRICAO_WPP[tipo] && membroId) {
      try {
        const primeiroNome = String(dados.nome || '').trim().split(/\s+/)[0] || 'Olá';
        await wpp.notificarMembro(membroId, 'inscricao_confirmada', [primeiroNome, LABEL_INSCRICAO_WPP[tipo]]);
      } catch (e) {
        console.warn('[APP] inscricao wpp:', e.message);
      }
    }

    res.status(201).json({ ok: true, id: inserted.id, message: 'Solicitação recebida! Nossa equipe entrará em contato.' });
  } catch (e) {
    console.error('[APP] inscricoes:', e.message);
    res.status(500).json({ error: 'Erro ao registrar inscrição' });
  }
});


// ── Censo · disponível SÓ para quem ainda não respondeu ───────────────────
//
// Pedido do Matheus (08/08): "o censo deve aparecer no app para os membros que
// não fizeram; quem já fez, o sistema vai saber pelo CPF e mostra um aviso".
//
// Duas decisões que moldam este endpoint:
//
//  · A CHECAGEM olha membro_id E CPF (services/censoJaRespondeu.js). Só por
//    membro_id, quem respondeu no culto e ainda não passou pelo
//    pós-processamento seria convidado a responder de novo — e o segundo envio
//    não é barrado por nada, porque a idempotência é por aparelho.
//
//  · O app NÃO reimplementa o formulário. Abre o mesmo formulário público num
//    WebView, com um token de identidade assinado. São 108 perguntas com
//    condicionais, rascunho, fila offline e bloco sensível, tudo já testado e
//    no ar; uma segunda implementação em React Native seria uma segunda fonte
//    de verdade — e a que ficasse para trás mentiria em silêncio.
//
// O token vai no `?t=` e é o backend que o emite para a sessão autenticada: o
// membro_id NUNCA trafega cru, senão bastaria trocar o uuid para responder no
// lugar de outra pessoa.
router.get('/censo', authApp, limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req).catch(() => null);
    if (!membro) return res.json({ pesquisa: null, motivo: 'sem_cadastro' });

    // ⚠️⚠️ A coluna é `created_at`. Ordenar por `criado_em` (que existe na VIEW
    // do cuidado, não nesta tabela) faz o PostgREST recusar a consulta INTEIRA —
    // e o `data` vem nulo. Foi assim que o app disse "Nenhum censo aberto" com o
    // censo aberto e 43 perguntas no ar, por dias.
    //
    // ⚠️⚠️ E o motivo de ninguém notar: o erro era DESCARTADO. Falha de consulta
    // não é ausência de dado — é a mesma lição do Cérebro (loader que engolia o
    // `error` e o chamador concluía "entidade não encontrada"). Agora a falha
    // tem motivo PRÓPRIO e vai pro log: "nenhuma_aberta" volta a significar
    // exatamente isso.
    const { data: pesquisa, error: erroPesquisa } = await supabase
      .from('cen_pesquisa')
      .select('id, slug, titulo, subtitulo, fecha_em')
      .eq('status', 'aberta').is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (erroPesquisa) {
      console.error('[APP] censo · consulta falhou:', erroPesquisa.message);
      return res.status(500).json({ pesquisa: null, motivo: 'erro_consulta' });
    }
    if (!pesquisa) return res.json({ pesquisa: null, motivo: 'nenhuma_aberta' });

    const ja = await acharRespostaDaPessoa({
      pesquisaId: pesquisa.id, membroId: membro.id, cpf: membro.cpf,
    });

    const token = ja ? null : gerarTokenIdentidade(membro.id);
    const base = process.env.PUBLIC_BASE_URL || 'https://www.cbrio.org';

    res.json({
      pesquisa: {
        slug: pesquisa.slug, titulo: pesquisa.titulo,
        subtitulo: pesquisa.subtitulo, fecha_em: pesquisa.fecha_em,
      },
      ja_respondeu: !!ja,
      respondida_em: ja?.concluida_em || null,
      // O TOKEN cru, para o app montar o formulário NATIVO e mandar a resposta
      // pelos mesmos endpoints públicos da web (é ele que dá
      // `identificado_por='cpf_nascimento'` sem a pessoa digitar CPF).
      // Só sai para quem PODE responder — mesma régua da `url`.
      token: token || null,
      // Só emite o link para quem PODE responder. Sem isto, um app
      // desatualizado que ignorasse `ja_respondeu` ainda abriria o formulário.
      url: token ? `${base}/censo/p/${pesquisa.slug}?t=${token}&canal=app` : null,
    });
  } catch (e) {
    console.error('[APP] censo:', e.message);
    res.status(500).json({ error: 'Erro ao carregar o censo' });
  }
});

// ── Voluntariado · self-service do membro (app) ───────────────────────────
// Carteira é UNIFICADA (um cartão por membro = mem_qrcodes.token) — não há
// cartão de voluntário aqui. Estes endpoints cobrem: status da inscrição,
// área, escalas (confirmar/recusar) e indisponibilidade (culto ou período).

// Resolve o mem_membros do usuário logado (profiles.membro_id → fallback email)
async function resolveMembroApp(req) {
  const authId = req.user?.id;
  const email = req.user?.email || null;
  if (authId) {
    const { data: prof } = await supabase.from('profiles').select('membro_id').eq('id', authId).maybeSingle();
    if (prof?.membro_id) {
      // ⚠️ `deleted_at IS NULL` também AQUI (2026-08-05): os outros 2 caminhos
      // (e-mail e CPF) já filtravam, e este não — então cadastro que a equipe
      // apagou continuava servindo o app, e tudo que a pessoa fizesse (inscrição,
      // matrícula, devocional) ia pousar num membro que o ERP considera fora da
      // base. Caso real: a limpeza de 04/08 soft-deletou 3 cadastros que TÊM
      // conta no app. Sem membro, o `CadastroGate` manda a pessoa completar o
      // cadastro e o matcher canônico resolve — que é o efeito desejado.
      const { data: m } = await supabase.from('mem_membros')
        .select('id, nome, cpf, email, telefone').eq('id', prof.membro_id)
        .is('deleted_at', null).maybeSingle();
      if (m) return m;
    }
  }
  if (email) {
    // Família compartilha e-mail → pode haver >1 mem_membros com o mesmo e-mail.
    // maybeSingle() devolveria ERRO (não-single) e o membro perderia acesso ao
    // próprio grupo/inscrições. Pega o mais antigo (registro principal).
    const { data: ms } = await supabase.from('mem_membros')
      .select('id, nome, cpf, email, telefone').ilike('email', email).is('deleted_at', null)
      .order('created_at', { ascending: true }).limit(1);
    if (ms && ms[0]) return ms[0];
  }
  // Fallback por CPF (metadados do cadastro do app) — cobre a conta cujo e-mail
  // difere do cadastro do membro (mesmo CPF). Vincula o profile p/ as próximas
  // chamadas serem diretas (best-effort, só quando membro_id está vazio).
  const cpfRaw = req.user?.user_metadata?.cpf || req.user?.user_metadata?.CPF || null;
  const cpf = cpfRaw ? String(cpfRaw).replace(/\D/g, '') : '';
  if (cpf.length === 11) {
    const fmt = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
    const { data: mc } = await supabase.from('mem_membros')
      .select('id, nome, cpf, email, telefone')
      .or(`cpf.eq.${cpf},cpf.eq.${fmt}`).is('deleted_at', null)
      .order('created_at', { ascending: true }).limit(1);
    if (mc && mc[0]) {
      if (authId) {
        try {
          await supabase.from('profiles').update({ membro_id: mc[0].id })
            .eq('id', authId).is('membro_id', null);
        } catch { /* vínculo é best-effort */ }
      }
      return mc[0];
    }
  }
  return null;
}

// Resolve o vol_profile do usuário do app. Ordem: auth_user_id → CPF do membro
// (auto-vínculo · todo voluntário tem CPF) → membresia_id → e-mail. Quando casa
// por outro caminho, grava auth_user_id/membresia_id pra ficar vinculado.
async function resolverVolProfile(req, membro) {
  const sel = 'id, full_name, planning_center_id, auth_user_id, cpf, membresia_id, allocation_status';
  let { data: vp } = await supabase.from('vol_profiles').select(sel).eq('auth_user_id', req.user.id).maybeSingle();
  if (!vp) {
    const cpf = String(membro?.cpf || '').replace(/\D/g, '');
    if (cpf.length === 11) {
      const fmt = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
      const { data } = await supabase.from('vol_profiles').select(sel).or(`cpf.eq.${cpf},cpf.eq.${fmt}`).limit(1);
      vp = (data && data[0]) || null;
    }
  }
  if (!vp && membro?.id) {
    const { data } = await supabase.from('vol_profiles').select(sel).eq('membresia_id', membro.id).maybeSingle();
    vp = data || null;
  }
  if (!vp && req.user.email) {
    const { data } = await supabase.from('vol_profiles').select(sel).ilike('email', req.user.email).limit(1);
    vp = (data && data[0]) || null;
  }
  // backfill do vínculo (fica ligado pras próximas vezes · best-effort)
  if (vp) {
    const patch = {};
    if (!vp.auth_user_id) patch.auth_user_id = req.user.id;
    if (membro?.id && !vp.membresia_id) patch.membresia_id = membro.id;
    if (Object.keys(patch).length) {
      try { await supabase.from('vol_profiles').update(patch).eq('id', vp.id); Object.assign(vp, patch); } catch { /* best-effort */ }
    }
  }
  return vp;
}

async function escalasDoVoluntario(vp) {
  if (!vp) return [];
  const conds = [`volunteer_id.eq.${vp.id}`];
  if (vp.planning_center_id) conds.push(`planning_center_person_id.eq.${vp.planning_center_id}`);
  const { data: schedules } = await supabase.from('vol_schedules')
    .select('id, service_id, team_name, position_name, confirmation_status, service:vol_services(name, service_type_name, scheduled_at)')
    .or(conds.join(','));
  const agora = Date.now();
  const futuras = (schedules || [])
    .map(s => ({ ...s, service: Array.isArray(s.service) ? s.service[0] : s.service }))
    .filter(s => s.service?.scheduled_at && new Date(s.service.scheduled_at).getTime() >= agora)
    .sort((a, b) => new Date(a.service.scheduled_at).getTime() - new Date(b.service.scheduled_at).getTime());
  const ids = futuras.map(s => s.id);
  let checked = new Set();
  if (ids.length) {
    const { data: ci } = await supabase.from('vol_check_ins').select('schedule_id').in('schedule_id', ids);
    checked = new Set((ci || []).map(c => c.schedule_id));
  }
  return futuras.map(s => ({
    id: s.id, service_id: s.service_id, team_name: s.team_name, position_name: s.position_name,
    confirmation_status: s.confirmation_status, has_checkin: checked.has(s.id),
    service: s.service ? { name: s.service.name, service_type_name: s.service.service_type_name, scheduled_at: s.service.scheduled_at } : null,
  }));
}

// Histórico de check-ins do voluntário (mais recentes primeiro).
async function historicoCheckinVoluntario(vp) {
  if (!vp) return [];
  const { data: cis } = await supabase.from('vol_check_ins')
    .select('id, checked_in_at, method, service:vol_services(name, service_type_name, scheduled_at)')
    .eq('volunteer_id', vp.id)
    .order('checked_in_at', { ascending: false })
    .limit(30);
  return (cis || []).map(c => {
    const svc = Array.isArray(c.service) ? c.service[0] : c.service;
    return {
      id: c.id, checked_in_at: c.checked_in_at, method: c.method || null,
      servico: svc?.name || svc?.service_type_name || null,
      data: svc?.scheduled_at || c.checked_in_at,
    };
  });
}

// GET /api/app/voluntariado/me — agregador: inscrição + área + escalas + indisponibilidades
router.get('/voluntariado/me', authApp, limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);

    const vp = await resolverVolProfile(req, membro);

    // Inscrição mais recente (por membro_id ou e-mail)
    let inscricao = null;
    const orParts = [];
    if (membro?.id) orParts.push(`membro_id.eq.${membro.id}`);
    if (req.user.email) orParts.push(`email.ilike.${req.user.email}`);
    if (orParts.length) {
      const { data: ins } = await supabase.from('vol_inscricoes')
        .select('id, status, area, ministerios_interesse, data_inscricao, enviado_lider_em, integrado_em')
        .is('deleted_at', null)
        .or(orParts.join(',')).order('data_inscricao', { ascending: false }).limit(1).maybeSingle();
      inscricao = ins || null;
    }

    const ativo = vp?.allocation_status === 'active';
    const [escalas, indispRes] = await Promise.all([
      escalasDoVoluntario(vp),
      vp ? supabase.from('vol_availability').select('*').eq('volunteer_profile_id', vp.id).order('unavailable_from') : Promise.resolve({ data: [] }),
    ]);

    res.json({
      membro_id: membro?.id || null,
      vol_profile_id: vp?.id || null,
      voluntario_ativo: ativo,
      inscricao,                              // status: inscrito | enviado_ministerio | integrado
      area: inscricao?.area || null,
      ministerios: inscricao?.ministerios_interesse || null,
      escalas,
      indisponibilidades: indispRes.data || [],
    });
  } catch (e) {
    console.error('[APP vol/me]', e.message);
    res.status(500).json({ error: 'Erro ao carregar voluntariado' });
  }
});

// POST /api/app/voluntariado/solicitar-area — pede pra servir (em outra área também)
// body: { areas: [labels], nome_mae? }  · cai na triagem do voluntariado
router.post('/voluntariado/solicitar-area', authApp, limiterStrict, async (req, res) => {
  try {
    const { areas, nome_mae } = req.body || {};
    if (!Array.isArray(areas) || areas.length === 0) {
      return res.status(400).json({ error: 'Selecione ao menos uma área' });
    }
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(404).json({ error: 'Cadastro de membro não encontrado' });

    // Dedup: já existe uma inscrição em aberto (em análise) pra essa pessoa?
    const { data: aberta } = await supabase.from('vol_inscricoes')
      .select('id, status, area')
      .is('deleted_at', null)
      .eq('membro_id', membro.id)
      .in('status', ['inscrito', 'enviado_ministerio'])
      .limit(1).maybeSingle();
    if (aberta) {
      return res.status(409).json({
        error: 'Você já tem uma inscrição em análise. Aguarde a equipe entrar em contato.',
        jaInscrito: true, inscricao_status: aberta.status,
      });
    }

    const nomeCompleto = (membro.nome || '').trim();
    const nome = nomeCompleto.split(' ')[0] || nomeCompleto || 'Membro';
    const sobrenome = nomeCompleto.split(' ').slice(1).join(' ') || '-';

    // Insere em app_inscricoes → a trigger cria a inscrição em vol_inscricoes
    const { error } = await supabase.from('app_inscricoes').insert({
      tipo: 'voluntariado',
      auth_user_id: req.user.id,
      status: 'pendente',
      dados: {
        nome, sobrenome, nome_completo: nomeCompleto || nome,
        cpf: membro.cpf || null, email: membro.email || req.user.email || null,
        telefone: membro.telefone || null,
        nome_mae: nome_mae || null,
        areas, membro_id: membro.id,
      },
    });
    if (error) throw error;

    // A trigger de fan-out já criou a inscrição em vol_inscricoes · busca o id
    // pra logar/idempotência e dispara a mensagem de boas-vindas no WhatsApp.
    try {
      const { data: vi } = await supabase.from('vol_inscricoes')
        .select('id').eq('membro_id', membro.id).eq('status', 'inscrito').is('deleted_at', null)
        .order('data_inscricao', { ascending: false }).limit(1).maybeSingle();
      await dispararAuto('voluntariado_inscricao', {
        refId: vi?.id || null,
        telefone: membro.telefone,
        nome: membro.nome,
        origem: 'app',
      });
    } catch (e) { console.warn('[APP vol/solicitar-area] whatsapp:', e.message); }

    res.status(201).json({ ok: true, message: 'Pedido enviado! A coordenação de voluntários vai falar com você.' });
  } catch (e) {
    console.error('[APP vol/solicitar-area]', e.message);
    res.status(500).json({ error: 'Erro ao enviar pedido' });
  }
});

// POST /api/app/voluntariado/vincular-cpf — quem JÁ serve informa o CPF na
// primeira vez que abre a aba, e o sistema cruza com o cadastro de voluntário
// (vol_profiles). Se achar, vincula (auth_user_id + membresia) e grava o CPF no
// membro pra a resolução automática funcionar nas próximas vezes.
router.post('/voluntariado/vincular-cpf', authApp, limiterStrict, async (req, res) => {
  try {
    const cpfDigitos = String(req.body?.cpf || '').replace(/\D/g, '');
    if (cpfDigitos.length !== 11) {
      return res.status(400).json({ error: 'Informe um CPF válido (11 dígitos)' });
    }
    const membro = await resolveMembroApp(req);

    // Procura o perfil de voluntário por CPF (com e sem máscara)
    const fmt = `${cpfDigitos.slice(0, 3)}.${cpfDigitos.slice(3, 6)}.${cpfDigitos.slice(6, 9)}-${cpfDigitos.slice(9)}`;
    const { data: achados } = await supabase
      .from('vol_profiles')
      .select('id, full_name, auth_user_id, membresia_id, allocation_status, status')
      .or(`cpf.eq.${cpfDigitos},cpf.eq.${fmt}`)
      .limit(1);
    const vp = (achados && achados[0]) || null;

    if (!vp) {
      // Não achou como voluntário — mas guarda o CPF no membro (se vazio) pra
      // ajudar futuras buscas e o fluxo de inscrição normal.
      if (membro?.id) {
        await supabase.from('mem_membros').update({ cpf: cpfDigitos })
          .eq('id', membro.id).or('cpf.is.null,cpf.eq.').then(() => {}, () => {});
      }
      return res.json({ found: false });
    }

    // Segurança: não sequestrar um vol_profile já ligado a OUTRA conta
    if (vp.auth_user_id && vp.auth_user_id !== req.user.id) {
      return res.status(409).json({ error: 'Este cadastro de voluntário já está vinculado a outra conta. Fale com a coordenação.' });
    }

    // Vincula o perfil de voluntário à conta (e ao membro, se conhecido)
    const patch = { auth_user_id: req.user.id };
    if (membro?.id && !vp.membresia_id) patch.membresia_id = membro.id;
    const { error: upErr } = await supabase.from('vol_profiles').update(patch).eq('id', vp.id);
    if (upErr) throw upErr;

    // Guarda o CPF no membro se estiver vazio (resolução automática futura)
    if (membro?.id) {
      await supabase.from('mem_membros').update({ cpf: cpfDigitos })
        .eq('id', membro.id).or('cpf.is.null,cpf.eq.').then(() => {}, () => {});
    }

    res.json({
      found: true,
      nome: vp.full_name || null,
      integrado: vp.status === 'ativo' || vp.allocation_status === 'integrado',
    });
  } catch (e) {
    console.error('[APP vol/vincular-cpf]', e.message);
    res.status(500).json({ error: 'Erro ao cruzar o CPF' });
  }
});

// GET /api/app/voluntariado/escalas — próximas escalas + histórico de check-in.
// Resolve o voluntário por auth_user_id/CPF/membresia/e-mail (service_role,
// sem as travas de RLS do client).
router.get('/voluntariado/escalas', authApp, limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    const vp = await resolverVolProfile(req, membro);
    const [escalas, historico] = await Promise.all([
      escalasDoVoluntario(vp),
      historicoCheckinVoluntario(vp),
    ]);
    res.json({ escalas, historico, vol_profile_id: vp?.id || null });
  } catch (e) {
    console.error('[APP vol/escalas]', e.message);
    res.status(500).json({ error: 'Erro ao buscar escalas' });
  }
});

// POST /api/app/voluntariado/escalas/:id/responder — { status: 'confirmed'|'declined' }
router.post('/voluntariado/escalas/:id/responder', authApp, limiterNormal, async (req, res) => {
  try {
    const { status, motivo } = req.body || {};
    if (!['confirmed', 'declined'].includes(status)) {
      return res.status(400).json({ error: "status deve ser 'confirmed' ou 'declined'" });
    }
    const membro = await resolveMembroApp(req);
    const vp = await resolverVolProfile(req, membro);
    if (!vp) return res.status(404).json({ error: 'Perfil de voluntário não encontrado' });
    // Não dá pra RECUSAR culto que já passou (aceitar/registrar segue liberado).
    if (status === 'declined') {
      const { data: sched } = await supabase.from('vol_schedules')
        .select('service:vol_services(scheduled_at)').eq('id', req.params.id).maybeSingle();
      const quando = sched?.service?.scheduled_at ? new Date(sched.service.scheduled_at) : null;
      if (quando && quando.getTime() < Date.now()) {
        return res.status(400).json({ error: 'Esse culto já passou — não dá mais pra recusar.' });
      }
    }
    // motivo opcional só na recusa; confirmar limpa o motivo anterior.
    const recusa_motivo = status === 'declined' ? (String(motivo || '').trim().slice(0, 200) || null) : null;
    // só responde escala própria
    const { data, error } = await supabase.from('vol_schedules')
      .update({ confirmation_status: status, recusa_motivo })
      .eq('id', req.params.id).eq('volunteer_id', vp.id).select().maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Escala não encontrada' });
    res.json(data);
  } catch (e) {
    console.error('[APP vol/responder]', e.message);
    res.status(500).json({ error: 'Erro ao responder escala' });
  }
});

// GET /api/app/voluntariado/indisponibilidades
router.get('/voluntariado/indisponibilidades', authApp, limiterNormal, async (req, res) => {
  try {
    const { data: vp } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', req.user.id).maybeSingle();
    if (!vp) return res.json([]);
    const { data } = await supabase.from('vol_availability')
      .select('*').eq('volunteer_profile_id', vp.id).order('unavailable_from');
    res.json(data || []);
  } catch (e) {
    console.error('[APP vol/indisp list]', e.message);
    res.status(500).json({ error: 'Erro ao buscar indisponibilidade' });
  }
});

// POST /api/app/voluntariado/indisponibilidade
// body: { service_id } (culto específico) OU { inicio, fim } (faixa de datas) + motivo?
router.post('/voluntariado/indisponibilidade', authApp, limiterNormal, async (req, res) => {
  try {
    const { service_id, inicio, fim, motivo } = req.body || {};
    const { data: vp } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', req.user.id).maybeSingle();
    if (!vp) return res.status(404).json({ error: 'Perfil de voluntário não encontrado' });

    let from = inicio; let to = fim || inicio;
    if (service_id) {
      const { data: s } = await supabase.from('vol_services').select('scheduled_at').eq('id', service_id).maybeSingle();
      if (!s) return res.status(404).json({ error: 'Culto não encontrado' });
      from = s.scheduled_at.split('T')[0]; to = from;
    }
    if (!from) return res.status(400).json({ error: 'Informe service_id ou inicio/fim' });

    const { data, error } = await supabase.from('vol_availability').insert({
      volunteer_profile_id: vp.id, service_id: service_id || null,
      unavailable_from: from, unavailable_to: to, reason: motivo || null,
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[APP vol/indisp create]', e.message);
    res.status(500).json({ error: 'Erro ao registrar indisponibilidade' });
  }
});

// DELETE /api/app/voluntariado/indisponibilidade/:id
router.delete('/voluntariado/indisponibilidade/:id', authApp, limiterNormal, async (req, res) => {
  try {
    const { data: vp } = await supabase.from('vol_profiles')
      .select('id').eq('auth_user_id', req.user.id).maybeSingle();
    if (!vp) return res.status(404).json({ error: 'Perfil não encontrado' });
    const { error } = await supabase.from('vol_availability')
      .delete().eq('id', req.params.id).eq('volunteer_profile_id', vp.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[APP vol/indisp delete]', e.message);
    res.status(500).json({ error: 'Erro ao remover indisponibilidade' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// SUPERVISOR DE ÁREA · monta escala pelo app (concessão feita no sistema)
// ══════════════════════════════════════════════════════════════════════════
// Retorna as áreas onde o membro logado é supervisor (ou [] se não for).
async function supervisorAreasApp(req) {
  const membro = await resolveMembroApp(req).catch(() => null);
  if (!membro) return { membro: null, areas: [], grants: [] };
  // ⚠️ `grants` é a concessão INTEIRA (área + subárea). `areas` continua sendo
  // devolvido porque é o que abre o portão do 403 e o que a tela do app exibe
  // em `areas_supervisionadas` — mas quem decide permissão fina é `grants`.
  const { data } = await supabase
    .from('vol_area_supervisores')
    .select('area, position_id, culto_dia, culto_periodo, culto_semana')
    .eq('membro_id', membro.id);
  const grants = (data || []).filter(r => r.area);
  return {
    membro,
    areas: [...new Set(grants.map(r => r.area))],
    grants,
  };
}

/**
 * Resolve a subárea (vol_positions.id) a partir do nome que o cliente mandou.
 *
 * ⚠️ Escopado pela EQUIPE, nunca só pelo nome: "Recepção" existe em Integração
 * e em KIDS, "Cuidados" em AMI/Bridge/Voluntariado. Buscar só por nome traria a
 * posição de outra área e a trava aprovaria o alvo errado.
 */
/**
 * O rodízio deste culto (`{ dia, periodo, semana }`) a partir do service_id.
 *
 * ⚠️ Sem isto a trava de rodízio não teria como saber se o culto é "1º domingo
 * manhã". A régua é pura (`utils/rodizioCulto`, no gate); aqui só entra a
 * leitura do `scheduled_at`.
 *
 * ⚠️ Culto sem data devolve `null`, e `cultoCoberto` NEGA para quem tem recorte
 * — mesma lei da equipe sem área: liberar "porque não dá pra saber" devolve o
 * acesso amplo bastando um campo vazio.
 */
async function rodizioDoServico(serviceId) {
  if (!serviceId) return null;
  const { data } = await supabase.from('vol_services')
    .select('scheduled_at').eq('id', serviceId).maybeSingle();
  return classificarCulto(data?.scheduled_at || null);
}

async function resolverPosicaoId(teamId, positionName) {
  if (!teamId || !positionName) return null;
  const { data } = await supabase.from('vol_positions')
    .select('id').eq('team_id', teamId).eq('name', positionName).maybeSingle();
  return data?.id || null;
}

/**
 * A escala existente está numa área que esta pessoa supervisiona?
 *
 * ⚠️ Vale para MOVER e REMOVER, não só para adicionar. Uma trava só no POST
 * deixa a porta aberta pelos outros verbos: bastaria o id da escala pra tirar
 * alguém da área de outro supervisor.
 */
async function escalaSobSupervisao(scheduleId, areas) {
  if (supervisionaTudo(areas)) return { ok: true };
  const { data: sc } = await supabase.from('vol_schedules')
    .select('id, team_id, team_name, position_id, position_name, service_id').eq('id', scheduleId).maybeSingle();
  if (!sc) return { ok: false, motivo: 'nao_encontrada' };
  let equipe = null;
  if (sc.team_id) {
    const { data } = await supabase.from('vol_teams').select('id, name, area').eq('id', sc.team_id).maybeSingle();
    equipe = data;
  } else if (sc.team_name) {
    const { data } = await supabase.from('vol_teams').select('id, name, area').eq('name', sc.team_name).maybeSingle();
    equipe = data;
  }
  // ⚠️ Escala sem equipe resolvível NÃO é liberada: seria a brecha por onde
  // qualquer linha antiga do Planning Center viraria terreno de todo mundo.
  if (!equipe) return { ok: false, motivo: 'sem_equipe' };
  if (!equipeSupervisionada(equipe, areas)) {
    return { ok: false, motivo: 'outra_area', equipe: equipe.name };
  }
  // ⚠️ Recorte de SUBÁREA (2026-08-25). Quem tem concessão só do Ofertório não
  // pode mover/remover a linha do Estacionamento, mesmo sendo a mesma equipe.
  // Vale pra MOVER e REMOVER, não só pra adicionar — a lição do bloco acima.
  const alvo = { area: equipe.area, position_id: sc.position_id || null, culto: await rodizioDoServico(sc.service_id) };
  if (!podeSupervisionar(areas, alvo)) {
    return { ok: false, motivo: 'outra_subarea', equipe: equipe.name, subarea: sc.position_name || null };
  }
  return { ok: true };
}

// GET /app/voluntariado/escala/servicos — próximos cultos (para montar escala)
router.get('/voluntariado/escala/servicos', authApp, limiterNormal, async (req, res) => {
  try {
    const { areas } = await supervisorAreasApp(req);
    if (!areas.length) return res.status(403).json({ error: 'Você não é supervisor de escala.' });
    const hoje = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
    // ⚠️ JANELA, não contagem. O teto de 60 registros era invisível e virou
    // corte real em 18/08, quando o calendário passou a ser gerado aqui em vez
    // de vir do Planning Center: adulto + Kids somam ~6 cultos por semana, e
    // 62 já existiam no mesmo instante em que o limite era 60 — os dois mais
    // distantes sumiam da lista do supervisor sem nenhum aviso.
    // Uma janela de 90 dias é o que o supervisor consegue planejar, e o teto de
    // 400 vira uma rede de segurança, não o corte do dia a dia.
    const ate = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from('vol_services')
      .select('id, service_type_name, scheduled_at')
      .gte('scheduled_at', hoje)
      .lte('scheduled_at', ate)
      .order('scheduled_at', { ascending: true })
      .limit(400);
    if (error) throw error;
    // Contagem de escalados por culto (pro chip mostrar "N escalados").
    const ids = (data || []).map(s => s.id);
    const cnt = {};
    if (ids.length) {
      const { data: scs } = await supabase.from('vol_schedules').select('service_id').in('service_id', ids);
      for (const r of scs || []) cnt[r.service_id] = (cnt[r.service_id] || 0) + 1;
    }
    res.json({ areas, servicos: (data || []).map(s => ({ ...s, escalados: cnt[s.id] || 0 })) });
  } catch (e) {
    console.error('[APP vol/escala servicos]', e.message);
    res.status(500).json({ error: 'Erro ao listar cultos' });
  }
});

// GET /app/voluntariado/escala/:serviceId — escala + composição canônica.
// A árvore é área → subárea/equipe → posição, vinda do catálogo do culto e
// não de quem já está escalado. Assim Online e posições vazias continuam
// visíveis no app, exatamente como no sistema web.
router.get('/voluntariado/escala/:serviceId', authApp, limiterNormal, async (req, res) => {
  try {
    const { areas, grants } = await supervisorAreasApp(req);
    if (!areas.length) return res.status(403).json({ error: 'Você não é supervisor de escala.' });
    const [{ data, error }, { data: composicao, error: composicaoErr }] = await Promise.all([
      supabase
      .from('vol_schedules')
      // ⚠️ `position_id` entrou pro filtro de SUBÁREA. Sem ele o recorte fino
      // só teria o nome, que repete entre áreas.
      .select('id, volunteer_id, volunteer_name, team_id, team_name, position_id, position_name, confirmation_status, recusa_motivo')
      .eq('service_id', req.params.serviceId)
      .order('team_name', { ascending: true })
      .order('volunteer_name', { ascending: true }),
      supabase
        .from('vol_escala_culto_itens')
        .select('team_id, position_id, quantidade, team:vol_teams(id,name,area), position:vol_positions(id,name)')
        .eq('service_id', req.params.serviceId)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true }),
    ]);
    if (error) throw error;
    if (composicaoErr) throw composicaoErr;
    const todosItens = (composicao || []).map(item => {
      const team = Array.isArray(item.team) ? item.team[0] : item.team;
      const position = Array.isArray(item.position) ? item.position[0] : item.position;
      return {
        team_id: item.team_id,
        team_name: team?.name || 'Sem equipe',
        area: team?.area || null,
        position_id: item.position_id || null,
        position_name: position?.name || null,
        quantidade: item.quantidade || 1,
      };
    });
    // ⚠️ O supervisor vê SÓ as áreas dele. O card no app do membro já dizia
    // "monte e veja as escalas da sua área" — a promessa existia, o filtro não.
    //
    // ⚠️ Desde 25/08 o corte é por ÁREA + SUBÁREA: os itens da composição já
    // trazem `position_id`, então quem recebeu só o Ofertório vê só a linha do
    // Ofertório dentro da equipe Integração.
    // ⚠️ O `culto` entra no alvo desde 25/08: quem supervisiona o 1º domingo de
    // manhã não vê a composição do 4º domingo. A classificação é do SERVIÇO, não
    // do item — por isso é resolvida uma vez, fora do filtro.
    const rodizio = await rodizioDoServico(req.params.serviceId);
    const itens = (todosItens || []).filter(i => podeSupervisionar(grants, {
      area: i.area, position_id: i.position_id, culto: rodizio,
    }));
    // ⚠️ A escala também é recortada: mostrar quem está escalado em áreas que
    // ele não supervisiona transformaria a tela num diretório de gente, e o
    // botão de remover apagaria escala alheia.
    const equipesVisiveis = new Set(itens.map(i => i.team_id).filter(Boolean));
    const nomesVisiveis = new Set(itens.map(i => i.team_name));
    // ⚠️ A subárea também recorta a ESCALA, não só a composição. Sem isto,
    // esconder a linha "Estacionamento" da composição e ainda listar quem está
    // escalado nela deixaria o botão de remover apagando escala alheia — o
    // mesmo furo que o comentário acima descreve, um nível abaixo.
    const posicoesVisiveis = new Set(itens.map(i => i.position_id).filter(Boolean));
    const recortaSubarea = itens.some(i => i.position_id) && !supervisionaTudo(areas)
      && (data || []).some(e => e.position_id);
    const escalasVisiveis = supervisionaTudo(areas)
      ? (data || [])
      : (data || [])
        .filter(e => equipesVisiveis.has(e.team_id) || nomesVisiveis.has(e.team_name))
        .filter(e => !recortaSubarea || !e.position_id || posicoesVisiveis.has(e.position_id));
    res.json({
      escalas: escalasVisiveis,
      // ⚠️ ALIAS DE COMPATIBILIDADE (22/08/2026). O app do STAFF lê `escala`
      // (singular) e o do MEMBRO lê `escalas` — mesmo endpoint. O do staff caía
      // no fallback `[]` e a tela de montar escala abria VAZIA em todo culto,
      // sem erro nenhum: o card da lista anterior mostrava "107 escalados"
      // porque vem de outro endpoint. O app foi corrigido, mas o alias faz o
      // binário que JÁ está no celular voltar a funcionar no merge, sem
      // esperar o OTA. Remover quando a frota do staff tiver atualizado.
      escala: escalasVisiveis,
      composicao: itens.map(i => ({ ...i, area: i.area || 'Sem área' })),
      areas_supervisionadas: areas,
      // Declara o que foi escondido: uma tela que some com linhas sem dizer
      // parece dado faltando.
      ocultos: todosItens.length - itens.length,
    });
  } catch (e) {
    console.error('[APP vol/escala get]', e.message);
    res.status(500).json({ error: 'Erro ao carregar a escala' });
  }
});

// GET /app/voluntariado/escala-pool — voluntários pra adicionar (busca ?q=)
router.get('/voluntariado/escala-pool', authApp, limiterNormal, async (req, res) => {
  try {
    const { areas } = await supervisorAreasApp(req);
    if (!areas.length) return res.status(403).json({ error: 'Você não é supervisor de escala.' });
    const q = String(req.query.q || '').trim();
    let query = supabase.from('vol_profiles')
      .select('id, full_name, planning_center_id').eq('arquivado', false)
      .order('full_name').limit(30);
    if (q) query = query.ilike('full_name', `%${q}%`);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[APP vol/escala pool]', e.message);
    res.status(500).json({ error: 'Erro ao buscar voluntários' });
  }
});

// GET /app/voluntariado/voluntario/:id/detalhe — ficha do voluntário pro supervisor:
// nome, telefone (membro→vol_profiles→PCO), equipes que serve, histórico de
// check-ins e de escalas.
router.get('/voluntariado/voluntario/:id/detalhe', authApp, limiterNormal, async (req, res) => {
  try {
    const { areas } = await supervisorAreasApp(req);
    if (!areas.length) return res.status(403).json({ error: 'Você não é supervisor de escala.' });
    const { data: vp } = await supabase.from('vol_profiles')
      .select('id, full_name, planning_center_id, membresia_id, phone, avatar_url').eq('id', req.params.id).maybeSingle();
    if (!vp) return res.status(404).json({ error: 'Voluntário não encontrado' });

    // Telefone: cadastro de membro (app) → vol_profiles.phone → PCO ao vivo.
    let telefone = null;
    if (vp.membresia_id) {
      const { data: m } = await supabase.from('mem_membros').select('telefone').eq('id', vp.membresia_id).maybeSingle();
      telefone = m?.telefone || null;
    }
    if (!telefone) telefone = vp.phone || null;
    if (!telefone && vp.planning_center_id) {
      try { const { fetchPcoPhone } = require('../services/planningCenter'); telefone = await fetchPcoPhone(vp.planning_center_id); } catch { /* best-effort */ }
    }

    const { data: schedsRaw } = await supabase.from('vol_schedules')
      .select('id, team_name, position_name, confirmation_status, service:vol_services(service_type_name, scheduled_at)')
      .eq('volunteer_id', vp.id).limit(100);
    const escalas = (schedsRaw || [])
      .map((s) => ({ culto: s.service?.service_type_name || null, data: s.service?.scheduled_at || null, equipe: s.team_name, posicao: s.position_name, status: s.confirmation_status }))
      .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')))
      .slice(0, 40);

    const { data: cisRaw } = await supabase.from('vol_check_ins')
      .select('id, created_at, service:vol_services(service_type_name, scheduled_at)')
      .eq('volunteer_id', vp.id).limit(100);
    const checkins = (cisRaw || [])
      .map((c) => ({ culto: c.service?.service_type_name || null, data: c.service?.scheduled_at || c.created_at || null }))
      .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')))
      .slice(0, 40);

    const equipes = [...new Set((schedsRaw || []).map((s) => s.team_name).filter(Boolean))];

    res.json({
      id: vp.id, full_name: vp.full_name, avatar_url: vp.avatar_url || null,
      telefone, equipes, total_checkins: checkins.length, total_escalas: escalas.length, checkins, escalas,
    });
  } catch (e) {
    console.error('[APP vol/voluntario detalhe]', e.message);
    res.status(500).json({ error: 'Erro ao carregar o voluntário' });
  }
});

// POST /app/voluntariado/escala — adiciona à escala { service_id, volunteer_id, team_name, position_name }
router.post('/voluntariado/escala', authApp, limiterNormal, async (req, res) => {
  try {
    const { areas, grants } = await supervisorAreasApp(req);
    if (!areas.length) return res.status(403).json({ error: 'Você não é supervisor de escala.' });
    const { service_id, volunteer_id, team_name, position_name } = req.body || {};
    if (!service_id || !volunteer_id) return res.status(400).json({ error: 'service_id e volunteer_id obrigatórios' });

    // ⚠️⚠️ A TRAVA DE ESCRITA. Esconder a área na tela é sugestão; o que impede
    // um supervisor de escalar na área de outro é esta checagem, porque o
    // cliente manda `team_name` no corpo e nada impedia mandar qualquer um.
    if (!supervisionaTudo(areas)) {
      if (!team_name) {
        return res.status(400).json({ error: 'Escolha a equipe: supervisor de área não escala sem equipe definida.' });
      }
      const { data: eq } = await supabase.from('vol_teams')
        .select('id, name, area').eq('name', team_name).maybeSingle();
      if (!eq || !equipeSupervisionada(eq, areas)) {
        return res.status(403).json({
          error: `Você não supervisiona ${team_name}. Fale com quem responde por essa área.`,
        });
      }
      // ⚠️⚠️ TRAVA DE SUBÁREA + RODÍZIO (25/08/2026). O cliente manda
      // `position_name` e `service_id` no corpo, e nada impedia mandar a subárea
      // de outro ou o culto de outro turno. As duas checagens vivem no MESMO
      // `podeSupervisionar` de propósito: separar em dois ifs foi a minha
      // primeira versão e ela recusava quem tinha subárea no culto certo,
      // porque a pré-checagem de rodízio passava `position_id: null`.
      const rodizio = await rodizioDoServico(service_id);
      const recorte = subareasNaArea(grants, eq.area);
      if (recorte.length) {
        // Supervisão de subárea específica: a subárea é obrigatória no corpo.
        if (!position_name) {
          return res.status(400).json({
            error: 'Escolha a subárea: sua supervisão é de subárea específica, não da área inteira.',
          });
        }
        const posId = await resolverPosicaoId(eq.id, position_name);
        if (!posId || !podeSupervisionar(grants, { area: eq.area, position_id: posId, culto: rodizio })) {
          return res.status(403).json({
            error: `Você não supervisiona ${position_name} em ${team_name} neste culto.`,
          });
        }
      } else if (!podeSupervisionar(grants, { area: eq.area, position_id: null, culto: rodizio })) {
        // Supervisão da área inteira: só o rodízio pode barrar aqui (a área já
        // passou no `equipeSupervisionada` acima).
        return res.status(403).json({
          error: 'Este culto não está no seu turno de supervisão.',
          fora_do_rodizio: true,
        });
      }
    }

    const { data: vp } = await supabase.from('vol_profiles')
      .select('id, full_name, planning_center_id, auth_user_id, membresia_id').eq('id', volunteer_id).maybeSingle();
    if (!vp) return res.status(404).json({ error: 'Voluntário não encontrado' });
    // Dedup: mesma pessoa já nesta equipe deste culto? (NULLs no unique não
    // deduplicam, então checamos aqui). Permite a mesma pessoa em OUTRA equipe.
    let dupQ = supabase.from('vol_schedules').select('id')
      .eq('service_id', service_id).eq('volunteer_id', vp.id);
    dupQ = (team_name ? dupQ.eq('team_name', team_name) : dupQ.is('team_name', null));
    const { data: dup } = await dupQ.maybeSingle();
    if (dup) return res.status(409).json({ error: 'Essa pessoa já está nesta equipe do culto' });
    const { data, error } = await supabase.from('vol_schedules').insert({
      service_id,
      volunteer_id: vp.id,
      volunteer_name: vp.full_name,
      planning_center_person_id: vp.planning_center_id || null,
      team_name: team_name || null,
      position_name: position_name || null,
      confirmation_status: 'pending',
      source: 'manual',
    }).select('id, volunteer_id, volunteer_name, team_name, position_name, confirmation_status').single();
    if (error) throw error;
    res.status(201).json(data);

    // Push pro voluntário escalado (na hora). Fire-and-forget · não bloqueia.
    (async () => {
      try {
        const { notificarApp, membrosParaUsuarios } = require('../services/appPush');
        let userIds = vp.auth_user_id ? [vp.auth_user_id] : [];
        if (!userIds.length && vp.membresia_id) userIds = await membrosParaUsuarios([vp.membresia_id]);
        if (!userIds.length) return;
        const { data: svc } = await supabase.from('vol_services')
          .select('service_type_name, scheduled_at').eq('id', service_id).maybeSingle();
        let quando = '';
        if (svc?.scheduled_at) {
          const b = new Date(new Date(svc.scheduled_at).getTime() - 3 * 3600 * 1000); // BRT
          const dd = String(b.getUTCDate()).padStart(2, '0');
          const mm = String(b.getUTCMonth() + 1).padStart(2, '0');
          const aa = String(b.getUTCFullYear()).slice(2);
          const hh = String(b.getUTCHours()).padStart(2, '0');
          const mi = String(b.getUTCMinutes()).padStart(2, '0');
          quando = `${dd}/${mm}/${aa} ${hh}:${mi}`;
        }
        const culto = svc?.service_type_name || 'um culto';
        const teamTxt = team_name ? ` · ${team_name}` : '';
        await notificarApp(userIds, {
          tipo: 'escala',
          titulo: 'Você foi escalado(a) 🙌',
          body: `${culto}${quando ? ` · ${quando}` : ''}${teamTxt}. Confirme sua presença no app.`,
          data: { service_id },
        });
      } catch (e) { console.error('[APP vol/escala push]', e.message); }
    })();
  } catch (e) {
    console.error('[APP vol/escala post]', e.message);
    res.status(500).json({ error: 'Erro ao escalar' });
  }
});

// PATCH /app/voluntariado/escala/:id — move de equipe (drag & drop) / muda função
router.patch('/voluntariado/escala/:id', authApp, limiterNormal, async (req, res) => {
  try {
    const { areas, grants } = await supervisorAreasApp(req);
    if (!areas.length) return res.status(403).json({ error: 'Você não é supervisor de escala.' });
    const { team_name, position_name } = req.body || {};
    const { data: atual } = await supabase.from('vol_schedules')
      .select('id, service_id, volunteer_id, team_name').eq('id', req.params.id).maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Escala não encontrada' });
    const novoTeam = team_name === undefined ? atual.team_name : (team_name || null);
    // Dedup: a pessoa já está na equipe destino deste culto?
    if (atual.volunteer_id && novoTeam !== atual.team_name) {
      let dupQ = supabase.from('vol_schedules').select('id')
        .eq('service_id', atual.service_id).eq('volunteer_id', atual.volunteer_id).neq('id', atual.id);
      dupQ = (novoTeam ? dupQ.eq('team_name', novoTeam) : dupQ.is('team_name', null));
      const { data: dup } = await dupQ.maybeSingle();
      if (dup) return res.status(409).json({ error: 'Essa pessoa já está nessa equipe' });
    }
    // Trava de escrita no MOVER: tanto a origem quanto o destino têm que ser
    // áreas desta pessoa — senão dá pra "mover pra fora" o que não é seu.
    if (!supervisionaTudo(areas)) {
      const origem = await escalaSobSupervisao(req.params.id, areas);
      if (!origem.ok) {
        return res.status(403).json({ error: `Essa escala é de ${origem.equipe || 'outra área'}, que você não supervisiona.` });
      }
      if (novoTeam) {
        const { data: destino } = await supabase.from('vol_teams')
          .select('id, name, area').eq('name', novoTeam).maybeSingle();
        if (!destino || !equipeSupervisionada(destino, areas)) {
          return res.status(403).json({ error: `Você não supervisiona ${novoTeam}.` });
        }
        // ⚠️ Subárea do DESTINO. Sem isto, quem só tem o Ofertório moveria a
        // linha pra dentro do Estacionamento — saindo do próprio escopo por um
        // caminho que a trava de equipe aprova.
        const recorte = subareasNaArea(grants, destino.area);
        if (recorte.length) {
          const nomePos = position_name !== undefined ? position_name : null;
          if (!nomePos) {
            return res.status(400).json({ error: 'Escolha a subárea do destino: sua supervisão é de subárea específica.' });
          }
          const posId = await resolverPosicaoId(destino.id, nomePos);
          if (!posId || !podeSupervisionar(grants, { area: destino.area, position_id: posId })) {
            return res.status(403).json({ error: `Você não supervisiona ${nomePos} em ${novoTeam}.` });
          }
        }
      }
    }
    const patch = { team_name: novoTeam };
    if (position_name !== undefined) patch.position_name = position_name || null;
    const { data, error } = await supabase.from('vol_schedules').update(patch)
      .eq('id', req.params.id)
      .select('id, volunteer_id, volunteer_name, team_name, position_name, confirmation_status').single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[APP vol/escala patch]', e.message);
    res.status(500).json({ error: 'Erro ao mover' });
  }
});

// DELETE /app/voluntariado/escala/:id — remove da escala
router.delete('/voluntariado/escala/:id', authApp, limiterNormal, async (req, res) => {
  try {
    const { areas } = await supervisorAreasApp(req);
    if (!areas.length) return res.status(403).json({ error: 'Você não é supervisor de escala.' });
    // Só remove quem foi escalado pelo app (source='manual'). Escala do Planning
    // Center é gerida lá — se apagar aqui, o próximo sync recria (remoção fantasma).
    const sob = await escalaSobSupervisao(req.params.id, areas);
    if (!sob.ok) {
      return res.status(403).json({ error: `Essa escala é de ${sob.equipe || 'outra área'}, que você não supervisiona.` });
    }
    const { data: sc } = await supabase.from('vol_schedules').select('source').eq('id', req.params.id).maybeSingle();
    if (sc && sc.source && sc.source !== 'manual') {
      return res.status(400).json({ error: 'Essa pessoa veio do Planning Center — remova por lá. Pelo app só dá pra tirar quem foi escalado aqui.' });
    }
    const { error } = await supabase.from('vol_schedules').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[APP vol/escala delete]', e.message);
    res.status(500).json({ error: 'Erro ao remover da escala' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// CHECK-IN PELO SUPERVISOR · escopo + janela (2026-08-25)
// ══════════════════════════════════════════════════════════════════════════
//
// Pedido do Matheus: *"no app de membros os supervisores devem poder fazer
// check-in dos voluntários das suas respectivas áreas, e só nos dias de culto.
// Isso ajuda a gente não ficar refém de apenas um local de check-in (que hoje é
// na sala de voluntários)."*
//
// ⚠️⚠️ O endpoint de check-in JÁ EXISTIA e tinha o furo de 18/08 intacto: ele
// conferia `areas.length` — a PORTA — e depois registrava presença de QUALQUER
// pessoa em QUALQUER culto de QUALQUER dia. Supervisor de Louvor podia bater
// ponto do Kids em culto de três meses atrás.

/**
 * Hoje é o dia deste culto? (dia inteiro, em BRT · decisão do Matheus)
 *
 * ⚠️ A comparação é por DATA em America/Sao_Paulo, nunca por UTC: culto de
 * domingo 19h é 22h UTC, e depois das 21h BRT o UTC já virou segunda — a janela
 * fecharia no meio do culto da noite. É a mesma armadilha que o
 * `periodoSP`/`dateSP` deste arquivo já trata.
 */
async function cultoEhHoje(serviceId) {
  const { data: svc } = await supabase.from('vol_services')
    .select('id, scheduled_at, name').eq('id', serviceId).maybeSingle();
  if (!svc?.scheduled_at) return { ok: false, motivo: 'servico_sem_data' };
  // A régua de fuso é PURA e está no gate de deploy (`utils/janelaCulto`) —
  // aqui só entra a leitura do banco.
  const r = ehDiaDoCulto(svc.scheduled_at);
  return { ...r, servico: svc.name };
}

/**
 * Esta escala está no escopo (área + subárea) desta pessoa?
 *
 * ⚠️ Check-in SEM escala (`is_unscheduled`) é liberado de propósito para quem
 * tem escopo restrito — e é uma EXCEÇÃO consciente à lei de "alvo sem equipe
 * resolvível é negado". Motivo: registrar que alguém APARECEU não concede nada
 * a ninguém, e negar seria travar exatamente o caso que descentralizar o
 * check-in existe para atender (chegou gente pra ajudar e não estava na
 * escala). A janela do dia do culto é o que impede abuso.
 */
async function checkinSobSupervisao(scheduleId, areas) {
  if (supervisionaTudo(areas)) return { ok: true };
  if (!scheduleId) return { ok: true, sem_escala: true };
  const { data: sc } = await supabase.from('vol_schedules')
    .select('id, team_id, team_name, position_id, position_name, service_id').eq('id', scheduleId).maybeSingle();
  if (!sc) return { ok: false, motivo: 'escala_nao_encontrada' };
  let equipe = null;
  if (sc.team_id) {
    const { data } = await supabase.from('vol_teams').select('id, name, area').eq('id', sc.team_id).maybeSingle();
    equipe = data;
  } else if (sc.team_name) {
    const { data } = await supabase.from('vol_teams').select('id, name, area').eq('name', sc.team_name).maybeSingle();
    equipe = data;
  }
  if (!equipe) return { ok: false, motivo: 'sem_equipe' };
  if (!podeSupervisionar(areas, { area: equipe.area, position_id: sc.position_id || null, culto: await rodizioDoServico(sc.service_id) })) {
    return { ok: false, motivo: 'fora_do_escopo', equipe: equipe.name, subarea: sc.position_name || null };
  }
  return { ok: true };
}

// GET /app/voluntariado/escala/:serviceId/checkins — quem já tem presença
// (pra UI de gestão de check-in do supervisor saber quem bateu ponto no culto).
router.get('/voluntariado/escala/:serviceId/checkins', authApp, limiterNormal, async (req, res) => {
  try {
    const { areas, grants } = await supervisorAreasApp(req);
    if (!areas.length) return res.status(403).json({ error: 'Você não é supervisor de escala.' });
    // ⚠️ A escala vem embutida com equipe e subárea porque a LISTA também é
    // recortada: mostrar o check-in de uma área que a pessoa não supervisiona
    // transformaria a tela num diretório — e o botão de desfazer apagaria
    // presença alheia. Mesmo raciocínio do recorte da composição.
    const { data, error } = await supabase.from('vol_check_ins')
      .select('id, schedule_id, volunteer_id, checked_in_at, method, volunteer_name, is_unscheduled, volunteer:vol_profiles(full_name), schedule:vol_schedules(volunteer_name, team_id, team_name, position_id, position_name)')
      .eq('service_id', req.params.serviceId)
      .order('checked_in_at', { ascending: false });
    if (error) throw error;

    let areaPorEquipe = {};
    if (!supervisionaTudo(grants)) {
      const { data: eqs } = await supabase.from('vol_teams').select('id, name, area');
      for (const t of eqs || []) {
        if (t.id) areaPorEquipe[t.id] = t.area;
        if (t.name) areaPorEquipe[`n:${t.name}`] = t.area;
      }
    }
    // ⚠️ O rodizio do SERVICO e resolvido UMA vez, fora do filtro.
    const rodizioLista = supervisionaTudo(grants) ? null : await rodizioDoServico(req.params.serviceId);
    const noEscopo = (c) => {
      if (supervisionaTudo(grants)) return true;
      const sch = Array.isArray(c.schedule) ? c.schedule[0] : c.schedule;
      // Check-in avulso (sem escala) não tem área — fica visível pra quem pode
      // criá-lo, senão o supervisor não veria o que ele mesmo acabou de marcar.
      if (!sch) return true;
      const area = areaPorEquipe[sch.team_id] ?? areaPorEquipe[`n:${sch.team_name}`] ?? null;
      return podeSupervisionar(grants, { area, position_id: sch.position_id || null, culto: rodizioLista });
    };
    const visiveis = (data || []).filter(noEscopo);

    res.json(visiveis.map((c) => {
      const sch = Array.isArray(c.schedule) ? c.schedule[0] : c.schedule;
      return {
        id: c.id,
        schedule_id: c.schedule_id,
        volunteer_id: c.volunteer_id,
        volunteer_name: c.volunteer?.full_name || sch?.volunteer_name || c.volunteer_name || null,
        checked_in_at: c.checked_in_at,
        method: c.method,
        is_unscheduled: c.is_unscheduled || false,
        equipe: sch?.team_name || null,
        subarea: sch?.position_name || null,
      };
    }));
  } catch (e) {
    console.error('[APP vol/escala checkins]', e.message);
    res.status(500).json({ error: 'Erro ao carregar os check-ins' });
  }
});

// POST /app/voluntariado/checkin — supervisor registra presença pelo app.
// Reusa a lógica de check-in de voluntariado.js POST /check-ins: resolve a
// escala do dia (prioriza o bloco manhã/noite) e faz DEDUP por BLOCO de culto
// (a manhã 08:30/10:00/11:30 cobre com 1 check-in) → duplicado devolve 409.
// checked_in_by = o membro logado do app (req.user = auth.users). method
// default 'manual'. NÃO mexe em cultos/Integração — só controle do voluntariado.
router.post('/voluntariado/checkin', authApp, limiterNormal, async (req, res) => {
  try {
    const { areas, grants } = await supervisorAreasApp(req);
    if (!areas.length) return res.status(403).json({ error: 'Você não é supervisor de escala.' });
    const { service_id, schedule_id, volunteer_id, method } = req.body || {};
    if (!service_id) return res.status(400).json({ error: 'service_id obrigatório' });
    const metodo = ['qr_code', 'manual', 'facial', 'self_service'].includes(method) ? method : 'manual';

    // ⚠️⚠️ JANELA: só no DIA do culto. Vale pra TODO MUNDO, inclusive `geral` —
    // a restrição é da operação ("só nos dias de culto"), não do escopo de área.
    // Sem ela, presença de um culto de três meses atrás entraria hoje e a
    // frequência do voluntariado passaria a aceitar retroativo sem trilha.
    const janela = await cultoEhHoje(service_id);
    if (!janela.ok) {
      return res.status(403).json({
        error: janela.motivo === 'fora_do_dia'
          ? `Check-in só no dia do culto. "${janela.servico || 'Este culto'}" é ${janela.dia?.split('-').reverse().join('/')}.`
          : 'Este culto não tem data definida — não é possível registrar presença.',
        fora_da_janela: true,
      });
    }

    const norm = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const dateSP = (iso) => { try { return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); } catch { return (iso || '').slice(0, 10); } };
    const periodoSP = (iso) => { try { const h = Number(new Date(iso).toLocaleString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).slice(0, 2)); return h < 14 ? 'manha' : 'noite'; } catch { return 'noite'; } };

    let resolvedScheduleId = schedule_id || null;
    let resolvedVolunteerId = volunteer_id || null;
    let resolvedUnscheduled;

    const { data: ciSvc } = await supabase.from('vol_services').select('scheduled_at').eq('id', service_id).maybeSingle();
    const ciDate = ciSvc?.scheduled_at ? dateSP(ciSvc.scheduled_at) : null;
    const ciPer = ciSvc?.scheduled_at ? periodoSP(ciSvc.scheduled_at) : null;

    if (ciDate) {
      const { data: svcsDia } = await supabase.from('vol_services')
        .select('id, scheduled_at')
        .gte('scheduled_at', `${ciDate}T00:00:00-03:00`).lt('scheduled_at', `${ciDate}T23:59:59-03:00`);
      const idsDia = (svcsDia || []).map((s) => s.id);
      const idsBloco = (svcsDia || []).filter((s) => periodoSP(s.scheduled_at) === ciPer).map((s) => s.id);

      // Se veio só a escala, resolve o volunteer_id por ela (pra deduplicar).
      if (!resolvedVolunteerId && resolvedScheduleId) {
        const { data: sch } = await supabase.from('vol_schedules').select('volunteer_id').eq('id', resolvedScheduleId).maybeSingle();
        if (sch?.volunteer_id) resolvedVolunteerId = sch.volunteer_id;
      }

      // DEDUP por bloco: 1 check-in cobre a manhã (ou a noite) inteira → 409.
      if (resolvedVolunteerId && idsBloco.length) {
        const { data: jaTem } = await supabase.from('vol_check_ins')
          .select('id, checked_in_at, method, volunteer:vol_profiles(full_name), schedule:vol_schedules(volunteer_name)')
          .eq('volunteer_id', resolvedVolunteerId).in('service_id', idsBloco)
          .order('checked_in_at', { ascending: true }).limit(1);
        if (jaTem && jaTem[0]) {
          const ex = jaTem[0];
          return res.status(409).json({
            error: 'Check-in já foi realizado', alreadyCheckedIn: true,
            volunteerName: ex.volunteer?.full_name || ex.schedule?.volunteer_name || null,
            checkedInAt: ex.checked_in_at, method: ex.method,
          });
        }
      }

      // MATCH da escala no dia inteiro (prioriza o mesmo bloco) quando não veio.
      if (!resolvedScheduleId && idsDia.length) {
        let vp = null;
        if (resolvedVolunteerId) ({ data: vp } = await supabase.from('vol_profiles').select('planning_center_id, full_name').eq('id', resolvedVolunteerId).maybeSingle());
        const vpName = norm(vp?.full_name);
        const { data: scheds } = await supabase.from('vol_schedules')
          .select('id, volunteer_id, planning_center_person_id, volunteer_name, service_id').in('service_id', idsDia);
        const casa = (s) => (
          (resolvedVolunteerId && s.volunteer_id && s.volunteer_id === resolvedVolunteerId) ||
          (vp?.planning_center_id && s.planning_center_person_id && s.planning_center_person_id === vp.planning_center_id) ||
          (vpName && norm(s.volunteer_name) === vpName)
        );
        const match = (scheds || []).filter((s) => idsBloco.includes(s.service_id)).find(casa) || (scheds || []).find(casa);
        if (match) {
          resolvedScheduleId = match.id;
          resolvedUnscheduled = false;
          if (!resolvedVolunteerId && match.volunteer_id) resolvedVolunteerId = match.volunteer_id;
        } else {
          resolvedUnscheduled = true;
        }
      }
    }

    if (!resolvedVolunteerId && !resolvedScheduleId) {
      return res.status(400).json({ error: 'Informe o voluntário (volunteer_id) ou a escala (schedule_id) pra registrar o check-in.' });
    }

    // ⚠️⚠️ A TRAVA DE ESCOPO. Fica DEPOIS da resolução da escala de propósito:
    // é `resolvedScheduleId` (que o match acha no dia) que carrega equipe e
    // subárea. Checar antes, no `schedule_id` cru do corpo, deixaria passar todo
    // check-in em que o cliente manda só `volunteer_id`.
    const escopo = await checkinSobSupervisao(resolvedScheduleId, grants);
    if (!escopo.ok) {
      return res.status(403).json({
        error: escopo.motivo === 'fora_do_escopo'
          ? `${escopo.subarea ? `${escopo.subarea} (${escopo.equipe})` : escopo.equipe} não está na sua supervisão.`
          : 'Não foi possível confirmar que essa escala está na sua supervisão.',
        fora_do_escopo: true,
      });
    }

    const { data, error } = await supabase.from('vol_check_ins').insert({
      schedule_id: resolvedScheduleId,
      volunteer_id: resolvedVolunteerId,
      service_id,
      checked_in_by: req.user.id,
      method: metodo,
      is_unscheduled: resolvedUnscheduled || false,
    }).select('id, schedule_id, volunteer_id, service_id, checked_in_at, method, is_unscheduled').single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Check-in já foi realizado', alreadyCheckedIn: true });
      }
      throw error;
    }

    // Confirma a escala se ainda pendente (mesmo comportamento do totem).
    if (resolvedScheduleId) {
      await supabase.from('vol_schedules')
        .update({ confirmation_status: 'confirmed' }).eq('id', resolvedScheduleId).eq('confirmation_status', 'pending');
    }
    res.status(201).json(data);
  } catch (e) {
    console.error('[APP vol/checkin post]', e.message);
    res.status(500).json({ error: 'Erro ao registrar check-in' });
  }
});

// DELETE /app/voluntariado/checkin/:id — supervisor DESFAZ um check-in.
//
// Decisão do Matheus (25/08): "sim, dentro da janela" — marcou errado, desmarca;
// fora do dia do culto ninguém mexe.
//
// ⚠️ É HARD DELETE, de propósito. Os uniques de `vol_check_ins` são índices
// PARCIAIS (`schedule_id` / `volunteer_id+service_id`); soft-delete deixaria a
// linha morta ocupando o unique e o próximo check-in da mesma pessoa bateria
// 409 pra sempre. A trilha vai pro `audit_log`, que é onde ela é consultável.
//
// ⚠️ Mesmo escopo e mesma janela do POST. Um DELETE só com o id do check-in,
// sem essas duas checagens, seria a porta dos fundos do endpoint inteiro — a
// lição do `escalaSobSupervisao` ("vale para MOVER e REMOVER, não só adicionar").
router.delete('/voluntariado/checkin/:id', authApp, limiterNormal, async (req, res) => {
  try {
    const { areas, grants } = await supervisorAreasApp(req);
    if (!areas.length) return res.status(403).json({ error: 'Você não é supervisor de escala.' });

    const { data: ci } = await supabase.from('vol_check_ins')
      .select('id, service_id, schedule_id, volunteer_id, volunteer_name, checked_in_at, method, volunteer:vol_profiles(full_name), schedule:vol_schedules(volunteer_name)')
      .eq('id', req.params.id).maybeSingle();
    if (!ci) return res.status(404).json({ error: 'Check-in não encontrado' });

    const janela = await cultoEhHoje(ci.service_id);
    if (!janela.ok) {
      return res.status(403).json({
        error: 'Só é possível desfazer no dia do culto. Fale com a coordenação do voluntariado.',
        fora_da_janela: true,
      });
    }

    const escopo = await checkinSobSupervisao(ci.schedule_id, grants);
    if (!escopo.ok) {
      return res.status(403).json({ error: 'Esse check-in não está na sua supervisão.', fora_do_escopo: true });
    }

    const nome = ci.volunteer?.full_name
      || (Array.isArray(ci.schedule) ? ci.schedule[0]?.volunteer_name : ci.schedule?.volunteer_name)
      || ci.volunteer_name || null;

    const { error } = await supabase.from('vol_check_ins').delete().eq('id', ci.id);
    if (error) throw error;

    // Trilha: quem desfez, de quem, quando era. Best-effort — a tabela de audit
    // não pode derrubar a operação do culto.
    try {
      await supabase.from('audit_log').insert({
        table_name: 'vol_check_ins',
        record_id: ci.id,
        action: 'DELETE',
        field_name: 'checked_in_at',
        old_value: ci.checked_in_at ? String(ci.checked_in_at) : null,
        new_value: null,
        description: `Check-in de ${nome || 'voluntário'} desfeito pelo supervisor no app (método ${ci.method || '—'}).`,
        changed_by: req.user?.id || null,
      });
    } catch (e) {
      console.warn('[APP vol/checkin delete] audit não gravado:', e.message);
    }

    res.json({ ok: true, id: ci.id, volunteer_name: nome });
  } catch (e) {
    console.error('[APP vol/checkin delete]', e.message);
    res.status(500).json({ error: 'Erro ao desfazer o check-in' });
  }
});

// ── NEXT · inscrição + próximos encontros + check-in geolocalizado ────────
// Tudo vinculado ao mem_membros (resolveMembroApp) → alimenta a jornada.
// Geofence configurável por env (defina as coordenadas EXATAS no Vercel):
//   NEXT_CHURCH_LAT, NEXT_CHURCH_LNG, NEXT_CHECKIN_RADIUS_M (default 500)
const NEXT_CHURCH = {
  lat: parseFloat(process.env.NEXT_CHURCH_LAT || '-23.001115'),  // Av. das Américas 7907, Barra da Tijuca/RJ
  lng: parseFloat(process.env.NEXT_CHURCH_LNG || '-43.388279'),
  raio: parseInt(process.env.NEXT_CHECKIN_RADIUS_M || '500', 10),
};
function distanciaMetros(aLat, aLng, bLat, bLng) {
  const R = 6371000, toR = (x) => (x * Math.PI) / 180;
  const dLat = toR(bLat - aLat), dLng = toR(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function hojeBRT() { return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10); }
function partesNome(nomeCompleto) {
  const n = (nomeCompleto || '').trim();
  return { nome: n.split(' ')[0] || 'Membro', sobrenome: n.split(' ').slice(1).join(' ') || null };
}

// ⚠️⚠️ O NEXT DO APP LÊ O MODELO VIVO: turma → encontro → matrícula → presença
// (2026-08-05). Antes lia `next_eventos`/`next_inscricoes`, a camada APOSENTADA
// no cutover de turmas (17/06) — e o efeito era o app dizendo "não há encontros
// do NEXT agendados" com DUAS turmas abertas no sistema: medido em 05/08, os 8
// `next_eventos` com status 'agendado' têm data máxima **21/06** (todos no
// passado), enquanto `next_turmas` tinha "Agosto/01" (encontros 02 e 09/08) e
// "Agosto/02" (16 e 23/08). Foi o caso que o Marcos reportou.
// ⚠️ E o KPI de frequência do Next passou a ler `next_presencas` em 22/07
// (migration 20260722250000) — o check-in do app, que carimbava
// `next_inscricoes.check_in_at`, deixou de contar. Gravar a presença no modelo
// vivo conserta os dois de uma vez.
// ⚠️ `next_inscricoes` NÃO é porta de inscrição (é presença por encontro do
// modelo antigo, e a porta `next_legado` da view unificada morreu na migration
// 20260730120000). Não voltar a escrever ali por aqui.

/** Turmas com inscrição aberta + os encontros delas (o "quando" vive no encontro). */
async function nextTurmasAbertas() {
  const { data: turmas } = await supabase.from('next_turmas')
    .select('id, nome, status, horario, observacoes')
    .eq('status', 'aberta').is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (!turmas || !turmas.length) return { turmas: [], encontros: [] };
  const { data: encontros } = await supabase.from('next_encontros')
    .select('id, turma_id, numero, data, tema')
    .in('turma_id', turmas.map(t => t.id))
    .order('data', { ascending: true });
  return { turmas, encontros: encontros || [] };
}

// GET /api/app/next/me — próximos encontros + status de matrícula/presença
router.get('/next/me', authApp, limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    const hoje = hojeBRT();
    const { turmas, encontros } = await nextTurmasAbertas();
    const turmaPorId = new Map(turmas.map(t => [t.id, t]));

    // Matrícula do membro nas turmas abertas = "está inscrito".
    const matPorTurma = {};
    if (membro && turmas.length) {
      const { data: mats } = await supabase.from('next_matriculas')
        .select('id, turma_id, status, check_in_at')
        .eq('membro_id', membro.id).in('turma_id', turmas.map(t => t.id))
        .is('deleted_at', null);
      (mats || []).forEach(m => { matPorTurma[m.turma_id] = m; });
    }

    // Presença POR ENCONTRO (é o que o app mostra como "confirmado").
    const presPorEncontro = {};
    const matIds = Object.values(matPorTurma).map(m => m.id);
    if (matIds.length && encontros.length) {
      const { data: pres } = await supabase.from('next_presencas')
        .select('encontro_id, presente, created_at')
        .in('matricula_id', matIds).in('encontro_id', encontros.map(e => e.id));
      (pres || []).forEach(p => { if (p.presente) presPorEncontro[p.encontro_id] = p.created_at; });
    }

    const lista = encontros.filter(e => e.data >= hoje).slice(0, 12).map(e => {
      const turma = turmaPorId.get(e.turma_id);
      return {
        id: e.id,
        data: e.data,
        // O app já mostrava `titulo`; o tema do encontro é mais específico que
        // o nome da turma, então ele vem primeiro (sem quebrar o contrato).
        titulo: e.tema || turma?.nome || 'Encontro do NEXT',
        turma_id: e.turma_id,
        turma_nome: turma?.nome || null,
        horario: turma?.horario || null,
        inscrito: !!matPorTurma[e.turma_id],
        check_in_at: presPorEncontro[e.id] || null,
        pode_checkin_hoje: e.data === hoje,
      };
    });

    res.json({
      membro_id: membro?.id || null,
      inscrito_next: Object.keys(matPorTurma).length > 0,
      encontros: lista,
      igreja: { lat: NEXT_CHURCH.lat, lng: NEXT_CHURCH.lng, raio_m: NEXT_CHURCH.raio },
    });
  } catch (e) {
    console.error('[APP next/me]', e.message);
    res.status(500).json({ error: 'Erro ao carregar NEXT' });
  }
});

/**
 * Matricula o membro na turma ABERTA do próximo encontro. Devolve
 * `{ ok, turma, jaInscrito, matricula_id }` ou `{ ok:false, error }` — usado
 * pelo `/next/inscrever` E pelo genérico `POST /app/inscricoes` com
 * `tipo:'next'` (build antigo do app), pra não existirem duas réguas de
 * "em qual turma essa pessoa entra".
 */
// ⚠️ HOISTING: esta função é usada pelo `POST /inscricoes` (linha ~500), que
// vem ANTES dela no arquivo. Funciona porque `async function` é hoisted —
// **não converter pra `const ... = async () =>` sem mover a declaração pra
// cima** (a mesma armadilha registrada no publicNext.js).
async function matricularNoNextAberto({ membro, email }) {
  const hoje = hojeBRT();
  const { turmas, encontros } = await nextTurmasAbertas();
  if (!turmas.length) {
    return { ok: false, error: 'Não há turma do NEXT com inscrições abertas no momento.' };
  }
  const proximo = encontros.find(e => e.data >= hoje) || null;
  const turma = proximo
    ? turmas.find(t => t.id === proximo.turma_id)
    : turmas[turmas.length - 1];
  if (!turma) {
    return { ok: false, error: 'Não há turma do NEXT com inscrições abertas no momento.' };
  }
  const resposta = {
    id: proximo?.id || turma.id,
    turma_id: turma.id,
    titulo: turma.nome,
    data: proximo?.data || null,
    horario: turma.horario || null,
  };

  const { data: ja } = await supabase.from('next_matriculas')
    .select('id').eq('membro_id', membro.id).eq('turma_id', turma.id)
    .is('deleted_at', null).limit(1).maybeSingle();
  if (ja) return { ok: true, turma: resposta, jaInscrito: true, matricula_id: ja.id };

  const { nome, sobrenome } = partesNome(membro.nome);
  // Chave canônica (mês × pessoa) — a MESMA de services/nextMatricula.js.
  const primeiroEnc = encontros.find(e => e.turma_id === turma.id) || proximo;
  const chave = primeiroEnc ? chaveMesMembro(primeiroEnc.data, membro.id) : null;

  const { data: nova, error } = await supabase.from('next_matriculas').insert({
    turma_id: turma.id, nome, sobrenome,
    cpf: membro.cpf || null, email: membro.email || email || null,
    telefone: membro.telefone || null, data_nascimento: membro.data_nascimento || null,
    membro_id: membro.id, origem: 'app', status: 'matriculado',
    origem_mes_key: chave,
  }).select('id').single();

  if (error) {
    // 23505 = UNIQUE (origem_mes_key ou turma+cpf/email): já tem matrícula no
    // mês. É 1 Next por mês por pessoa — objetivo atingido.
    if (error.code === '23505') return { ok: true, turma: resposta, jaInscrito: true };
    throw error;
  }
  return { ok: true, turma: resposta, matricula_id: nova?.id || null };
}

// POST /api/app/next/inscrever — matrícula na turma do PRÓXIMO encontro
// ⚠️ Cria MATRÍCULA (`next_matriculas`), não linha em `next_inscricoes` — ver o
// bloco do /next/me acima. A turma escolhida é a do próximo encontro (a que
// está por vir), não a criada mais recentemente: em 05/08 havia "Agosto/01"
// (em curso) e "Agosto/02" (a partir de 16/08), e "a mais nova" jogaria quem se
// inscreve hoje pra depois do encontro de amanhã.
router.post('/next/inscrever', authApp, limiterStrict, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(404).json({ error: 'Cadastro de membro não encontrado' });

    const r = await matricularNoNextAberto({ membro, email: req.user.email });
    if (!r.ok) return res.status(400).json({ error: r.error });
    if (r.jaInscrito) return res.json({ ok: true, evento: r.turma, jaInscrito: true });

    // Notifica os responsáveis do NEXT (sino + push) — espelha o form público.
    notificar({
      modulo: 'next',
      tipo: 'next_nova_inscricao',
      titulo: 'Nova inscrição no NEXT',
      mensagem: `${membro.nome || 'Alguém'} se inscreveu no NEXT pelo app (${r.turma.titulo}).`,
      link: '/ministerial/next?tab=turmas',
      chaveDedup: r.matricula_id ? `next_mat_${r.matricula_id}` : undefined,
    }).catch(e => console.warn('[APP next/inscrever] notificar:', e.message));

    res.status(201).json({ ok: true, evento: r.turma, message: 'Inscrição no NEXT confirmada!' });
  } catch (e) {
    console.error('[APP next/inscrever]', e.message);
    res.status(500).json({ error: 'Erro ao inscrever no NEXT' });
  }
});

// POST /api/app/next/encontros/:encontroId/checkin — body { lat, lng }
// Só no DIA do encontro (BRT) e dentro do raio da igreja.
// ⚠️ Grava presença em `next_presencas` (modelo vivo · é o que o KPI
// `frequencia_next` lê desde 22/07) e carimba `next_matriculas.check_in_at`,
// que é o `compareceu` da view unificada. Antes carimbava
// `next_inscricoes.check_in_at`, que nenhum leitor vivo enxerga mais.
// O `:encontroId` é sempre um `next_encontros.id` — vem do /next/me, então não
// existe id do modelo antigo em circulação (o app não cacheia essa lista).
router.post('/next/encontros/:encontroId/checkin', authApp, limiterNormal, async (req, res) => {
  try {
    const { lat, lng } = req.body || {};
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(404).json({ error: 'Cadastro de membro não encontrado' });

    const encontroId = req.params.encontroId;
    const { data: enc } = await supabase.from('next_encontros')
      .select('id, turma_id, data, tema').eq('id', encontroId).maybeSingle();
    if (!enc) return res.status(404).json({ error: 'Encontro não encontrado' });
    if (enc.data !== hojeBRT()) {
      return res.status(422).json({ error: 'O check-in só fica disponível no dia do encontro.' });
    }
    if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
      return res.status(422).json({ needLocation: true, error: 'Ative a localização para confirmar sua presença.' });
    }
    const dist = distanciaMetros(Number(lat), Number(lng), NEXT_CHURCH.lat, NEXT_CHURCH.lng);
    if (dist > NEXT_CHURCH.raio) {
      return res.status(403).json({ error: 'Você precisa estar na igreja para fazer o check-in.', distancia_m: Math.round(dist) });
    }

    const { data: turma } = await supabase.from('next_turmas')
      .select('id, nome').eq('id', enc.turma_id).is('deleted_at', null).maybeSingle();
    if (!turma) return res.status(404).json({ error: 'Turma do encontro não encontrada' });

    const agora = new Date().toISOString();
    const { nome, sobrenome } = partesNome(membro.nome);

    // Matrícula da pessoa na turma. Check-in de quem não se inscreveu antes
    // CRIA a matrícula — é a semântica que o fluxo antigo já tinha (quem chega
    // no encontro está no Next), e o walk-in do totem faz o mesmo.
    let { data: mat } = await supabase.from('next_matriculas')
      .select('id, check_in_at').eq('membro_id', membro.id).eq('turma_id', turma.id)
      .is('deleted_at', null).limit(1).maybeSingle();
    let matriculaNova = false;
    if (!mat) {
      const { data: criada, error: errMat } = await supabase.from('next_matriculas').insert({
        turma_id: turma.id, nome, sobrenome,
        cpf: membro.cpf || null, email: membro.email || req.user.email || null,
        telefone: membro.telefone || null, data_nascimento: membro.data_nascimento || null,
        membro_id: membro.id, origem: 'app', status: 'matriculado',
        origem_mes_key: chaveMesMembro(enc.data, membro.id),
        check_in_at: agora, check_in_by: req.user.id,
      }).select('id, check_in_at').single();
      if (errMat) {
        // 23505 = já tem matrícula no mês (talvez em outra turma aberta): usa a
        // que existe em vez de falhar o check-in de quem está na porta.
        if (errMat.code !== '23505') throw errMat;
        const { data: existente } = await supabase.from('next_matriculas')
          .select('id, check_in_at').eq('membro_id', membro.id)
          .eq('origem_mes_key', chaveMesMembro(enc.data, membro.id))
          .is('deleted_at', null).limit(1).maybeSingle();
        if (!existente) throw errMat;
        mat = existente;
      } else {
        mat = criada;
        matriculaNova = true;
      }
    }

    // Presença idempotente (mesma lógica do responsável: apaga o par e insere).
    const { data: jaPres } = await supabase.from('next_presencas')
      .select('id, created_at').eq('encontro_id', enc.id).eq('matricula_id', mat.id)
      .eq('presente', true).limit(1).maybeSingle();
    if (jaPres) {
      return res.json({ ok: true, jaCheckin: true, check_in_at: jaPres.created_at || mat.check_in_at || agora });
    }
    await supabase.from('next_presencas').delete().eq('encontro_id', enc.id).eq('matricula_id', mat.id);
    const { error: errPres } = await supabase.from('next_presencas')
      .insert({ encontro_id: enc.id, matricula_id: mat.id, presente: true });
    if (errPres) throw errPres;
    await supabase.from('next_matriculas')
      .update({ check_in_at: agora, check_in_by: req.user.id, updated_at: agora })
      .eq('id', mat.id);

    if (matriculaNova) {
      notificar({
        modulo: 'next',
        tipo: 'next_nova_inscricao',
        titulo: 'Nova inscrição no NEXT',
        mensagem: `${membro.nome || nome} entrou no NEXT pelo app (check-in · ${turma.nome}).`,
        link: '/ministerial/next?tab=turmas',
        chaveDedup: `next_mat_${mat.id}`,
      }).catch(e => console.warn('[APP next/checkin] notificar:', e.message));
    }

    res.status(matriculaNova ? 201 : 200).json({ ok: true, check_in_at: agora });
  } catch (e) {
    console.error('[APP next/checkin]', e.message);
    res.status(500).json({ error: 'Erro ao fazer check-in' });
  }
});

// ── Next · RESPONSÁVEL de turma (gestão pelo app do membro) ────────────────
// Espelha o que o líder de grupo faz em grupos, mas para a turma do Next.
// O papel vem do membro logado: turmas onde next_turmas.responsavel_id = membro.id.
// SEMPRE gated por responsavel_id (nunca expõe turma de outro responsável).

// Recompute MÍNIMO do status das matrículas de uma turma a partir das presenças.
// Réplica enxuta de recomputarStatusTurma() de routes/next.js (não dá para importar
// entre arquivos sem refatorar; a semântica é idêntica): "formado" = presente em
// TODOS os encontros; não mexe em 'desistiu'/'incompleto'. Chamado best-effort após
// marcar presença, para o status refletir na hora no app (igual à web). O cron/web
// continua sendo a fonte canônica de KPIs — aqui só ajustamos o status da matrícula.
async function recomputarStatusTurmaApp(turmaId) {
  if (!turmaId) return;
  const { data: encontros } = await supabase.from('next_encontros').select('id').eq('turma_id', turmaId);
  const encIds = (encontros || []).map((e) => e.id);
  const totalEnc = encIds.length;
  const { data: mats } = await supabase
    .from('next_matriculas').select('id, status').eq('turma_id', turmaId).is('deleted_at', null);
  if (!mats || !mats.length) return;
  const presByMat = {};
  if (encIds.length) {
    const { data: pres } = await supabase.from('next_presencas').select('matricula_id, presente').in('encontro_id', encIds);
    (pres || []).forEach((p) => { if (p.presente) presByMat[p.matricula_id] = (presByMat[p.matricula_id] || 0) + 1; });
  }
  for (const m of mats) {
    if (m.status === 'desistiu' || m.status === 'incompleto') continue;
    const n = presByMat[m.id] || 0;
    const novo = (totalEnc > 0 && n >= totalEnc) ? 'formado' : 'matriculado';
    if (novo !== m.status) {
      await supabase.from('next_matriculas')
        .update({ status: novo, updated_at: new Date().toISOString() }).eq('id', m.id);
    }
  }
}

// GET /api/app/next/papel — o membro logado é responsável de alguma turma?
// { responsavel: boolean, turmas: [...] } (turmas onde responsavel_id = membro.id)
router.get('/next/papel', authApp, limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.json({ responsavel: false, turmas: [] });
    const { data: turmas, error } = await supabase.from('next_turmas')
      .select('id, nome, status, observacoes, origem_mes, created_at')
      .eq('responsavel_id', membro.id).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    res.json({ responsavel: (turmas || []).length > 0, turmas: turmas || [] });
  } catch (e) {
    console.error('[APP next/papel]', e.message);
    res.status(500).json({ error: 'Erro ao carregar suas turmas do NEXT' });
  }
});

// GET /api/app/next/turmas/:turmaId — detalhe da turma (mesmo shape do web
// GET /next/turmas/:id). Gate: só se o membro é responsavel_id da turma.
router.get('/next/turmas/:turmaId', authApp, limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(404).json({ error: 'Cadastro de membro não encontrado' });
    const { turmaId } = req.params;
    const { data: turma } = await supabase.from('next_turmas')
      .select('*').eq('id', turmaId).is('deleted_at', null).maybeSingle();
    if (!turma) return res.status(404).json({ error: 'Turma não encontrada' });
    if (turma.responsavel_id !== membro.id) {
      return res.status(403).json({ error: 'Você não é o responsável por esta turma.' });
    }
    const { data: encontros } = await supabase.from('next_encontros')
      .select('*').eq('turma_id', turmaId).order('numero');
    const { data: matriculas } = await supabase.from('next_matriculas')
      .select('id, nome, sobrenome, telefone, status, check_in_at')
      .eq('turma_id', turmaId).is('deleted_at', null).order('nome');
    const encIds = (encontros || []).map((e) => e.id);
    let presencas = [];
    if (encIds.length) {
      const { data: pres } = await supabase.from('next_presencas')
        .select('encontro_id, matricula_id, presente').in('encontro_id', encIds);
      presencas = pres || [];
    }
    res.json({ turma, encontros: encontros || [], matriculas: matriculas || [], presencas });
  } catch (e) {
    console.error('[APP next/turmas/:id]', e.message);
    res.status(500).json({ error: 'Erro ao carregar a turma' });
  }
});

// POST /api/app/next/encontros/:encontroId/presenca — marca/desmarca UMA pessoa.
// body { matricula_id, presente }. Espelha o POST web /next/encontros/:id/presenca:
// remove o par e reinsere só quando presente + carimba next_matriculas.check_in_at.
// Gate: o encontro pertence a uma turma cujo responsavel_id = membro.id.
router.post('/next/encontros/:encontroId/presenca', authApp, limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(404).json({ error: 'Cadastro de membro não encontrado' });
    const { encontroId } = req.params;
    const matriculaId = req.body?.matricula_id;
    const presente = req.body?.presente !== false; // default true
    if (!matriculaId) return res.status(400).json({ error: 'matricula_id obrigatório' });

    const { data: enc } = await supabase.from('next_encontros')
      .select('id, turma_id').eq('id', encontroId).maybeSingle();
    if (!enc) return res.status(404).json({ error: 'Encontro não encontrado' });
    const { data: turma } = await supabase.from('next_turmas')
      .select('id, responsavel_id').eq('id', enc.turma_id).is('deleted_at', null).maybeSingle();
    if (!turma) return res.status(404).json({ error: 'Turma não encontrada' });
    if (turma.responsavel_id !== membro.id) {
      return res.status(403).json({ error: 'Você não é o responsável por esta turma.' });
    }

    // idempotente: remove o par e reinsere só quando presente (mesma lógica do web)
    await supabase.from('next_presencas').delete().eq('encontro_id', encontroId).eq('matricula_id', matriculaId);
    if (presente) {
      const { error: insErr } = await supabase.from('next_presencas')
        .insert({ encontro_id: encontroId, matricula_id: matriculaId, presente: true });
      if (insErr) throw insErr;
    }
    await supabase.from('next_matriculas')
      .update({ check_in_at: presente ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
      .eq('id', matriculaId);
    // best-effort: recalcula o status da turma (não bloqueia a resposta se falhar).
    // KPIs continuam a cargo do fluxo web/cron (recalcularKpisNext vive em next.js).
    await recomputarStatusTurmaApp(enc.turma_id).catch((e) => console.warn('[APP next presenca] recompute:', e.message));
    res.json({ ok: true, presente });
  } catch (e) {
    console.error('[APP next/encontros/:id/presenca]', e.message);
    res.status(500).json({ error: 'Erro ao marcar presença' });
  }
});

// ── Kids · pré-check-in pelo app ───────────────────────────────────────────
// O responsável prepara o check-in (escolhe os filhos), gera um código/QR,
// e no totem o voluntário aplica. NÃO faz a entrada/retirada — só adianta.

// GET /api/app/kids/meus-filhos — crianças de quem o membro é responsável
// AUTORIZADO (autorizado_buscar=true) + pré-check-in pendente, se houver.
router.get('/kids/meus-filhos', authApp, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.json({ membro: null, filhos: [], preCheckin: null });

    const { data: vinculos } = await supabase
      .from('kids_responsaveis')
      .select('crianca_id, parentesco, kids_criancas!inner(id, nome, data_nascimento, observacoes_medicas, tem_espectro, tem_alergia, tem_limitacao_fisica, ativo)')
      .eq('membro_id', membro.id)
      .eq('autorizado_buscar', true);

    const filhos = (vinculos || [])
      .map((v) => (Array.isArray(v.kids_criancas) ? v.kids_criancas[0] : v.kids_criancas))
      .filter((c) => c && c.ativo)
      .map((c) => ({
        id: c.id,
        nome: c.nome,
        data_nascimento: c.data_nascimento,
        observacoes_medicas: c.observacoes_medicas || null,
        tem_espectro: c.tem_espectro ?? null,
        tem_alergia: c.tem_alergia ?? null,
        tem_limitacao_fisica: c.tem_limitacao_fisica ?? null,
      }));

    // pré-check-in pendente e não expirado
    const { data: pre } = await supabase
      .from('kids_pre_checkins')
      .select('id, codigo, crianca_ids, criado_em, expira_em')
      .eq('responsavel_membro_id', membro.id)
      .eq('status', 'pendente')
      .gt('expira_em', new Date().toISOString())
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle();

    res.json({ membro: { id: membro.id, nome: membro.nome }, filhos, preCheckin: pre || null });
  } catch (e) {
    console.error('[APP] kids/meus-filhos:', e.message);
    res.status(500).json({ error: 'Erro ao carregar' });
  }
});

// POST /api/app/kids/pre-checkin { crianca_ids: [] } — gera o código/QR.
router.post('/kids/pre-checkin', authApp, limiterStrict, async (req, res) => {
  try {
    const { crianca_ids } = req.body || {};
    if (!Array.isArray(crianca_ids) || crianca_ids.length === 0) {
      return res.status(400).json({ error: 'Selecione ao menos uma criança' });
    }
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(400).json({ error: 'Cadastro de membro não encontrado' });

    // valida: TODAS as crianças são filhos AUTORIZADOS deste membro
    const { data: vinculos } = await supabase
      .from('kids_responsaveis')
      .select('crianca_id')
      .eq('membro_id', membro.id)
      .eq('autorizado_buscar', true)
      .in('crianca_id', crianca_ids);
    const permitidos = new Set((vinculos || []).map((v) => v.crianca_id));
    if (crianca_ids.some((id) => !permitidos.has(id))) {
      return res.status(403).json({ error: 'Você só pode preparar o check-in dos seus filhos.' });
    }

    // cancela pendentes anteriores (só 1 ativo por responsável)
    await supabase
      .from('kids_pre_checkins')
      .update({ status: 'cancelado' })
      .eq('responsavel_membro_id', membro.id)
      .eq('status', 'pendente');

    const { data: codigoRow } = await supabase.rpc('fn_kids_pre_checkin_codigo');
    const codigo = codigoRow || Math.random().toString(36).slice(2, 8).toUpperCase();
    const expira = new Date(Date.now() + 12 * 3600 * 1000).toISOString();

    const { data: criado, error } = await supabase
      .from('kids_pre_checkins')
      .insert({
        codigo,
        responsavel_membro_id: membro.id,
        responsavel_nome: membro.nome,
        responsavel_telefone: membro.telefone || null,
        crianca_ids,
        expira_em: expira,
      })
      .select('id, codigo, crianca_ids, expira_em')
      .single();
    if (error) throw error;

    // Confirmação por WhatsApp com o código (template cbrio_kids_precheckin · {{1}})
    wpp.notificarMembro(membro.id, 'kids_precheckin', [codigo]).catch(() => {});

    res.status(201).json(criado);
  } catch (e) {
    console.error('[APP] kids/pre-checkin:', e.message);
    res.status(500).json({ error: 'Não foi possível gerar o check-in' });
  }
});

// GET /api/app/kids/filho/:id — detalhe do filho (responsável autorizado):
// info + sala sugerida + histórico de check-ins + foto (se consentida).
router.get('/kids/filho/:id', authApp, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(400).json({ error: 'Cadastro não encontrado' });
    // segurança: só responsável autorizado da criança
    const { data: vinc } = await supabase
      .from('kids_responsaveis')
      .select('id, parentesco')
      .eq('membro_id', membro.id)
      .eq('crianca_id', req.params.id)
      .eq('autorizado_buscar', true)
      .maybeSingle();
    if (!vinc) return res.status(403).json({ error: 'Você não é responsável autorizado desta criança.' });

    const { data: c } = await supabase
      .from('kids_criancas')
      .select('id, nome, data_nascimento, foto_url, foto_storage_path, foto_consentimento_em, observacoes_medicas, necessidades_especiais, tem_espectro, espectro_qual, tem_alergia, alergia_qual, tem_limitacao_fisica, limitacao_fisica_qual')
      .eq('id', req.params.id)
      .eq('ativo', true)
      .maybeSingle();
    if (!c) return res.status(404).json({ error: 'Criança não encontrada' });

    // Foto só com consentimento. App = bucket privado (signed URL); legado = foto_url.
    let fotoUrl = null;
    if (c.foto_consentimento_em) {
      if (c.foto_storage_path) {
        const { data: signed } = await supabase.storage.from('kids-documentos').createSignedUrl(c.foto_storage_path, 60 * 30);
        fotoUrl = signed?.signedUrl || null;
      } else {
        fotoUrl = c.foto_url;
      }
    }

    const idadeMeses = c.data_nascimento
      ? Math.floor((Date.now() - new Date(c.data_nascimento).getTime()) / (1000 * 60 * 60 * 24 * 30.44))
      : null;

    // sala sugerida pela faixa etária
    let salaSugerida = null;
    if (idadeMeses != null) {
      const { data: salas } = await supabase
        .from('kids_salas')
        .select('nome, cor, faixa_etaria_min_meses, faixa_etaria_max_meses')
        .eq('ativo', true);
      const s = (salas || []).find((x) => x.faixa_etaria_min_meses <= idadeMeses && x.faixa_etaria_max_meses >= idadeMeses);
      if (s) salaSugerida = { nome: s.nome, cor: s.cor };
    }

    // histórico de check-ins
    const { data: checkins } = await supabase
      .from('kids_checkins')
      .select('id, checkin_at, checkout_at, fez_decisao_jesus, sala:kids_salas(nome, cor), sessao:kids_sessoes(culto:cultos(nome, data))')
      .eq('crianca_id', req.params.id)
      .order('checkin_at', { ascending: false })
      .limit(20);

    const historico = (checkins || []).map((k) => {
      const sala = Array.isArray(k.sala) ? k.sala[0] : k.sala;
      const sessao = Array.isArray(k.sessao) ? k.sessao[0] : k.sessao;
      const culto = sessao && (Array.isArray(sessao.culto) ? sessao.culto[0] : sessao.culto);
      return {
        id: k.id,
        checkin_at: k.checkin_at,
        checkout_at: k.checkout_at,
        decisao: !!k.fez_decisao_jesus,
        sala: sala?.nome || null,
        cor: sala?.cor || null,
        culto: culto?.nome || null,
        data: culto?.data || null,
      };
    });

    res.json({
      crianca: {
        id: c.id,
        nome: c.nome,
        data_nascimento: c.data_nascimento,
        idade_meses: idadeMeses,
        observacoes_medicas: c.observacoes_medicas || null,
        necessidades_especiais: c.necessidades_especiais || null,
        tem_espectro: c.tem_espectro ?? null,
        espectro_qual: c.espectro_qual || null,
        tem_alergia: c.tem_alergia ?? null,
        alergia_qual: c.alergia_qual || null,
        tem_limitacao_fisica: c.tem_limitacao_fisica ?? null,
        limitacao_fisica_qual: c.limitacao_fisica_qual || null,
        parentesco: vinc.parentesco || null,
        foto_url: fotoUrl, // só com consentimento (signed URL se foto do app)
        foto_consentida: !!c.foto_consentimento_em,
      },
      sala_sugerida: salaSugerida,
      total_checkins: historico.length,
      historico,
    });
  } catch (e) {
    console.error('[APP] kids/filho:', e.message);
    res.status(500).json({ error: 'Erro ao carregar' });
  }
});

// Helper: confirma que o membro é responsável AUTORIZADO da criança.
async function ehResponsavelAutorizado(membroId, criancaId) {
  const { data } = await supabase
    .from('kids_responsaveis').select('id')
    .eq('membro_id', membroId).eq('crianca_id', criancaId).eq('autorizado_buscar', true)
    .maybeSingle();
  return !!data;
}

// POST /api/app/kids/filho/:id/foto — responsável adiciona a foto da criança.
// ⚠️ ECA/LGPD: exige consentimento explícito (consentimento=true). A foto já
// foi enviada pro bucket privado kids-documentos; aqui recebemos só o PATH
// (que precisa estar na pasta do próprio usuário).
router.post('/kids/filho/:id/foto', authApp, limiterStrict, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(400).json({ error: 'Cadastro não encontrado' });
    const { storage_path, consentimento, versao_consentimento } = req.body || {};
    if (consentimento !== true) {
      return res.status(400).json({ error: 'É necessário autorizar o uso da imagem da criança.' });
    }
    if (!storage_path || typeof storage_path !== 'string') {
      return res.status(400).json({ error: 'Arquivo inválido' });
    }
    if (!storage_path.startsWith(`${req.user.id}/`)) {
      return res.status(403).json({ error: 'Caminho inválido' });
    }
    if (!(await ehResponsavelAutorizado(membro.id, req.params.id))) {
      return res.status(403).json({ error: 'Você não é responsável autorizado desta criança.' });
    }

    const { error } = await supabase.from('kids_criancas').update({
      foto_storage_path: storage_path,
      foto_url: null, // app usa storage privado; limpa URL legada
      foto_consentimento_em: new Date().toISOString(),
      foto_consentimento_por: req.user.id,
      foto_consentimento_versao: (versao_consentimento || 'eca-lgpd-v1').toString().slice(0, 40),
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id).eq('ativo', true);
    if (error) throw error;

    const { data: signed } = await supabase.storage.from('kids-documentos').createSignedUrl(storage_path, 60 * 30);
    res.json({ ok: true, foto_url: signed?.signedUrl || null });
  } catch (e) {
    console.error('[APP] kids/foto:', e.message);
    res.status(500).json({ error: 'Erro ao salvar a foto' });
  }
});

// POST /api/app/kids/filho/:id/foto/remover — revoga o consentimento e apaga a foto.
router.post('/kids/filho/:id/foto/remover', authApp, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(400).json({ error: 'Cadastro não encontrado' });
    if (!(await ehResponsavelAutorizado(membro.id, req.params.id))) {
      return res.status(403).json({ error: 'Você não é responsável autorizado desta criança.' });
    }
    const { data: c } = await supabase.from('kids_criancas')
      .select('foto_storage_path').eq('id', req.params.id).maybeSingle();
    const { error } = await supabase.from('kids_criancas').update({
      foto_storage_path: null,
      foto_url: null,
      foto_consentimento_em: null,
      foto_consentimento_por: null,
      foto_consentimento_versao: null,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id);
    if (error) throw error;
    if (c?.foto_storage_path) {
      try { await supabase.storage.from('kids-documentos').remove([c.foto_storage_path]); } catch { /* best-effort */ }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[APP] kids/foto remover:', e.message);
    res.status(500).json({ error: 'Erro ao remover a foto' });
  }
});

// POST /api/app/kids/filho/:id/saude — responsável atualiza as informações de
// saúde da criança (espectro, alergia, limitação física + "mais informações").
// A equipe Kids vê isso no check-in. Só o responsável autorizado pode editar.
router.post('/kids/filho/:id/saude', authApp, limiterStrict, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(400).json({ error: 'Cadastro não encontrado' });
    if (!(await ehResponsavelAutorizado(membro.id, req.params.id))) {
      return res.status(403).json({ error: 'Você não é responsável autorizado desta criança.' });
    }
    const {
      tem_espectro, espectro_qual, tem_alergia, alergia_qual,
      tem_limitacao_fisica, limitacao_fisica_qual, observacoes_medicas,
    } = req.body || {};

    const bool = (v) => (v === true ? true : (v === false ? false : null));
    const txt = (cond, v) => (cond && v ? String(v).trim().slice(0, 500) : null);

    const { error } = await supabase.from('kids_criancas').update({
      tem_espectro: bool(tem_espectro),
      espectro_qual: txt(tem_espectro === true, espectro_qual),
      tem_alergia: bool(tem_alergia),
      alergia_qual: txt(tem_alergia === true, alergia_qual),
      tem_limitacao_fisica: bool(tem_limitacao_fisica),
      limitacao_fisica_qual: txt(tem_limitacao_fisica === true, limitacao_fisica_qual),
      observacoes_medicas: observacoes_medicas ? String(observacoes_medicas).trim().slice(0, 1000) : null,
      updated_at: new Date().toISOString(),
    }).eq('id', req.params.id).eq('ativo', true);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[APP] kids/saude:', e.message);
    res.status(500).json({ error: 'Erro ao salvar as informações de saúde' });
  }
});

// POST /api/app/kids/solicitar-vinculo — o responsável pede pra ser vinculado a
// uma criança informando o nome da criança + o nome dos pais (mãe e/ou pai), e
// opcionalmente uma foto da criança (com consentimento ECA/LGPD). NÃO vincula
// automaticamente: vira solicitação pendente que a equipe Kids confere e aprova.
// (Documentos de identidade foram descontinuados; campos legados doc_* seguem
// aceitos pra não quebrar versões antigas do app durante a transição.)
router.post('/kids/solicitar-vinculo', authApp, limiterStrict, async (req, res) => {
  try {
    const {
      crianca_nome, crianca_data_nascimento, parentesco, observacao,
      mae_nome, pai_nome, serie, necessidade_especial,
      consent_marketing, consent_marketing_versao,
      crianca_foto_path, foto_consentimento, foto_consentimento_versao,
      foto_mae_path, foto_pai_path,
      // saúde da criança (estruturado) + "mais informações"
      tem_espectro, espectro_qual, tem_alergia, alergia_qual,
      tem_limitacao_fisica, limitacao_fisica_qual, observacoes_medicas,
      // legado (versões antigas do app)
      crianca_doc_path, doc_pai_path, doc_mae_path,
    } = req.body || {};

    if (!crianca_nome || !String(crianca_nome).trim()) {
      return res.status(400).json({ error: 'Informe o nome da criança' });
    }
    const temNomePais = (mae_nome && String(mae_nome).trim()) || (pai_nome && String(pai_nome).trim());
    const temDocLegado = doc_pai_path || doc_mae_path;
    if (!temNomePais && !temDocLegado) {
      return res.status(400).json({ error: 'Informe o nome da mãe e/ou do pai' });
    }

    // Segurança: qualquer arquivo apontado tem que estar na pasta do próprio
    // usuário ({auth.uid}/...). Impede apontar arquivo de outra pessoa.
    const prefixo = `${req.user.id}/`;
    const paths = [crianca_foto_path, crianca_doc_path, doc_pai_path, doc_mae_path, foto_mae_path, foto_pai_path].filter(Boolean);
    if (paths.some((p) => !String(p).startsWith(prefixo))) {
      return res.status(403).json({ error: 'Arquivo inválido.' });
    }

    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(400).json({ error: 'Complete seu cadastro de membro antes de solicitar.' });
    // Responsável precisa ter nome + telefone (segurança da retirada).
    if (!membro.nome || !String(membro.nome).trim()) return res.status(400).json({ error: 'Complete seu nome no perfil antes de cadastrar a criança.' });
    if (!membro.telefone || !String(membro.telefone).trim()) return res.status(400).json({ error: 'Cadastre seu telefone no perfil antes de cadastrar a criança.' });

    const parentescosOk = ['mae', 'pai', 'avo_a', 'tio_a', 'tutor', 'outro'];
    const parent = parentescosOk.includes(parentesco) ? parentesco : 'outro';
    const comFoto = !!(crianca_foto_path && foto_consentimento);

    const { data: criado, error } = await supabase
      .from('kids_vinculo_solicitacoes')
      .insert({
        solicitante_membro_id: membro.id,
        solicitante_nome: membro.nome,
        solicitante_telefone: membro.telefone || null,
        solicitante_parentesco: parent,
        crianca_nome: String(crianca_nome).trim(),
        crianca_data_nascimento: crianca_data_nascimento || null,
        mae_nome: mae_nome ? String(mae_nome).trim() : null,
        pai_nome: pai_nome ? String(pai_nome).trim() : null,
        serie: serie ? String(serie).trim().slice(0, 80) : null,
        necessidade_especial: necessidade_especial ? String(necessidade_especial).trim().slice(0, 500) : null,
        consent_marketing: consent_marketing === true ? true : (consent_marketing === false ? false : null),
        consent_marketing_em: (consent_marketing === true || consent_marketing === false) ? new Date().toISOString() : null,
        consent_marketing_versao: (consent_marketing === true || consent_marketing === false) ? (consent_marketing_versao || 'felca-eca-digital-v1') : null,
        foto_mae_path: foto_mae_path || null,
        foto_pai_path: foto_pai_path || null,
        crianca_foto_path: comFoto ? crianca_foto_path : null,
        foto_consentimento_em: comFoto ? new Date().toISOString() : null,
        foto_consentimento_versao: comFoto ? (foto_consentimento_versao || 'eca-lgpd-v1') : null,
        crianca_doc_path: crianca_doc_path || null,
        doc_pai_path: doc_pai_path || null,
        doc_mae_path: doc_mae_path || null,
        tem_espectro: tem_espectro === true ? true : (tem_espectro === false ? false : null),
        espectro_qual: tem_espectro === true && espectro_qual ? String(espectro_qual).trim().slice(0, 500) : null,
        tem_alergia: tem_alergia === true ? true : (tem_alergia === false ? false : null),
        alergia_qual: tem_alergia === true && alergia_qual ? String(alergia_qual).trim().slice(0, 500) : null,
        tem_limitacao_fisica: tem_limitacao_fisica === true ? true : (tem_limitacao_fisica === false ? false : null),
        limitacao_fisica_qual: tem_limitacao_fisica === true && limitacao_fisica_qual ? String(limitacao_fisica_qual).trim().slice(0, 500) : null,
        observacoes_medicas: observacoes_medicas ? String(observacoes_medicas).trim().slice(0, 1000) : null,
        observacao: observacao ? String(observacao).trim() : null,
      })
      .select('id, status, created_at')
      .single();
    if (error) throw error;

    notificar({
      modulo: 'kids',
      tipo: 'kids_vinculo_solicitacao',
      titulo: 'Nova solicitação de vínculo Kids',
      mensagem: `${membro.nome} pediu vínculo com ${String(crianca_nome).trim()}. Confira e aprove.`,
      link: '/ministerial/totem-kids/vinculos',
      severidade: 'aviso',
      chaveDedup: `kids_vinculo_${criado.id}`,
    }).catch((e) => console.warn('[APP] solicitar-vinculo · notificar:', e.message));

    res.status(201).json(criado);
  } catch (e) {
    console.error('[APP] kids/solicitar-vinculo:', e.message);
    res.status(500).json({ error: 'Não foi possível enviar a solicitação' });
  }
});

// GET /api/app/whatsapp-optin — consentimento atual do membro pra WhatsApp.
router.get('/whatsapp-optin', authApp, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.json({ optin: false, optin_em: null });
    const { data } = await supabase
      .from('mem_membros')
      .select('whatsapp_optin, whatsapp_optin_em')
      .eq('id', membro.id)
      .maybeSingle();
    res.json({ optin: !!data?.whatsapp_optin, optin_em: data?.whatsapp_optin_em || null });
  } catch (e) {
    console.error('[APP] whatsapp-optin get:', e.message);
    res.status(500).json({ error: 'Erro ao carregar preferência' });
  }
});

// POST /api/app/whatsapp-optin { optin } — grava consentimento (LGPD: + data).
router.post('/whatsapp-optin', authApp, async (req, res) => {
  try {
    const optin = !!req.body?.optin;
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(400).json({ error: 'Cadastro de membro não encontrado' });
    const { error } = await supabase
      .from('mem_membros')
      .update({ whatsapp_optin: optin, whatsapp_optin_em: new Date().toISOString() })
      .eq('id', membro.id);
    if (error) throw error;
    res.json({ ok: true, optin });
  } catch (e) {
    console.error('[APP] whatsapp-optin post:', e.message);
    res.status(500).json({ error: 'Não foi possível salvar' });
  }
});

// GET /api/app/kids/minhas-solicitacoes — status das solicitações do membro.
router.get('/kids/minhas-solicitacoes', authApp, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.json({ solicitacoes: [] });

    const { data } = await supabase
      .from('kids_vinculo_solicitacoes')
      .select('id, crianca_nome, status, motivo_rejeicao, created_at, decidido_em')
      .eq('solicitante_membro_id', membro.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20);

    res.json({ solicitacoes: data || [] });
  } catch (e) {
    console.error('[APP] kids/minhas-solicitacoes:', e.message);
    res.status(500).json({ error: 'Erro ao carregar solicitações' });
  }
});

// Próximo encontro a partir do dia da semana (0=Dom..6=Sáb) + horário.
// ⚠️ Delega pra régua ÚNICA (utils/agendaGrupo), que trabalha em BRT e aplica
// as exceções de agenda. A versão anterior fazia `new Date().getDay()` — UTC no
// Vercel —, então das 21h de domingo em diante o servidor achava que já era
// segunda e pulava uma semana. Assinatura mantida; `excecoes` é opcional.
function proximoEncontroISO(diaSemana, horario, excecoes, recorrencia, ancoraISO) {
  const p = proximoEncontro({
    diaSemana, horario, recorrencia, ancoraISO: ancoraISO || null,
    excecoes: excecoes || [],
  });
  return p ? p.inicio : null;
}


// GET /api/app/meu-grupo — grupo(s) de conexão ativos do membro: info, líder,
// próximo encontro e materiais. Pra experiência "já estou no grupo".
router.get('/meu-grupo', authApp, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.json({ grupos: [] });
    const GSEL = 'id, nome, dia_semana, horario, recorrencia, local, endereco, bairro, complemento, lat, lng, foto_url, lider_id';
    // ⚠️ Consulta ISOLADA e best-effort: sem a migration aplicada, pedir a
    // tabela nova faria o PostgREST recusar a query INTEIRA e o líder ficaria
    // sem "meu grupo" (lição do parcelas_max). Falhou = agenda normal.
    const excecoesPorGrupo = {};
    async function carregarExcecoes(ids) {
      if (!ids.length) return;
      try {
        const { data, error } = await supabase.from('mem_grupo_agenda_excecoes')
          .select('grupo_id, data_original, status, nova_data, novo_horario, motivo')
          .in('grupo_id', ids).gte('data_original', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
        if (error) throw error;
        for (const e of data || []) (excecoesPorGrupo[e.grupo_id] ||= []).push(e);
      } catch (e) { console.warn('[APP] agenda excecoes indisponivel:', e.message); }
    }
    const { data: vinculos } = await supabase
      .from('mem_grupo_membros')
      .select(`grupo_id, funcao, mem_grupos(${GSEL})`)
      .eq('membro_id', membro.id)
      .is('saiu_em', null)
      .is('deleted_at', null);

    // Junta grupos onde é MEMBRO (vínculo) + grupos que LIDERA (lider_id) — o
    // líder pode não ter linha em mem_grupo_membros, mas precisa ver o próprio
    // grupo em "Meu grupo". Dedup por id; ser líder prevalece sobre o papel.
    const porId = new Map();
    for (const v of vinculos || []) {
      const g = Array.isArray(v.mem_grupos) ? v.mem_grupos[0] : v.mem_grupos;
      if (g) porId.set(g.id, { g, funcao: v.funcao });
    }
    const { data: liderados } = await supabase
      .from('mem_grupos').select(GSEL)
      .eq('lider_id', membro.id).is('deleted_at', null);
    for (const g of liderados || []) {
      const atual = porId.get(g.id);
      if (atual) atual.funcao = 'lider';
      else porId.set(g.id, { g, funcao: 'lider' });
    }

    await carregarExcecoes([...porId.keys()]);
    // ⚠️ Quinzenal/mensal precisam da âncora (último encontro realizado) — sem
    // ela a régua devolve 1 ocorrência marcada como incerta em vez de chutar.
    const ancorasMeuGrupo = await ancorasDeGrupos([...porId.keys()]);

    const grupos = [];
    for (const { g, funcao } of porId.values()) {
      if (!g) continue;
      let lider = null;
      if (g.lider_id) {
        const { data: l } = await supabase.from('mem_membros').select('nome, telefone').eq('id', g.lider_id).maybeSingle();
        if (l) lider = { nome: l.nome, telefone: l.telefone };
      }
      const { data: docs } = await supabase
        .from('mem_grupo_documentos')
        .select('id, nome, comentario, storage_path, created_at')
        .contains('grupo_ids', [g.id])
        .order('created_at', { ascending: false })
        .limit(15);
      const materiais = (docs || []).map((d) => ({
        id: d.id,
        nome: d.nome,
        comentario: d.comentario || null,
        url: d.storage_path ? supabase.storage.from('eventos-anexos').getPublicUrl(d.storage_path).data.publicUrl : null,
      }));
      grupos.push({
        id: g.id, nome: g.nome, dia_semana: g.dia_semana, horario: g.horario,
        local: g.local, endereco: g.endereco, bairro: g.bairro, complemento: g.complemento,
        lat: g.lat, lng: g.lng,
        foto_url: g.foto_url, funcao, lider,
        proximo_encontro: proximoEncontroISO(g.dia_semana, g.horario, excecoesPorGrupo[g.id] || [], g.recorrencia, ancorasMeuGrupo[g.id]),
        proximas_ocorrencias: proximasOcorrencias({
          diaSemana: g.dia_semana, horario: g.horario,
          recorrencia: g.recorrencia, ancoraISO: ancorasMeuGrupo[g.id] || null,
          excecoes: excecoesPorGrupo[g.id] || [], quantas: 6,
        }),
        materiais,
      });
    }
    res.json({ grupos });
  } catch (e) {
    console.error('[APP] meu-grupo:', e.message);
    res.status(500).json({ error: 'Erro ao carregar seu grupo' });
  }
});

// GET /api/app/videos — pregações recentes + séries (YouTube) + link ao vivo.
router.get('/videos', authApp, async (req, res) => {
  try {
    const channelId = process.env.YOUTUBE_CHANNEL_ID || 'UCfjMVzaYlCS_VE3JuEJj2vQ';
    const { data: videos } = await supabase
      .from('online_videos')
      .select('video_id, titulo, thumbnail_url, publicado_em, duration_seconds, serie:online_series(titulo)')
      .order('publicado_em', { ascending: false })
      .limit(30);
    const { data: series } = await supabase
      .from('online_series')
      .select('playlist_id, titulo, thumbnail_url, total_videos')
      .order('publicada_em', { ascending: false, nullsFirst: false })
      .limit(20);

    res.json({
      canal_live: `https://www.youtube.com/channel/${channelId}/live`,
      videos: (videos || []).map((v) => ({
        video_id: v.video_id,
        titulo: v.titulo,
        thumbnail_url: v.thumbnail_url,
        publicado_em: v.publicado_em,
        duration_seconds: v.duration_seconds,
        serie: Array.isArray(v.serie) ? v.serie[0]?.titulo : v.serie?.titulo || null,
      })),
      series: series || [],
    });
  } catch (e) {
    console.error('[APP] videos:', e.message);
    res.status(500).json({ error: 'Erro ao carregar vídeos' });
  }
});

// GET /api/app/pense-ultimo — último vídeo do canal Pense (Pr. Pedrão ·
// @CanalPense), pro atalho na aba Devocional. Resolve o handle → playlist de
// uploads → vídeo mais recente, via YouTube Data API. Cache em memória (3h)
// pra poupar quota. Sem chave/erro → { video: null } (o app esconde o card).
const PENSE_HANDLE = process.env.YOUTUBE_PENSE_HANDLE || 'CanalPense';
let _penseCache = { at: 0, uploads: null, video: null };
router.get('/pense-ultimo', authApp, async (req, res) => {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return res.json({ video: null });

    const TTL = 3 * 60 * 60 * 1000; // 3h
    if (_penseCache.video && Date.now() - _penseCache.at < TTL) {
      return res.json({ video: _penseCache.video });
    }

    const yt = async (path) => {
      const r = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${apiKey}`);
      if (!r.ok) throw new Error(`YouTube ${r.status}`);
      return r.json();
    };

    // 1) handle → playlist de uploads (resolve 1x, fica em cache)
    let uploads = _penseCache.uploads;
    if (!uploads) {
      const ch = await yt(`channels?part=contentDetails&forHandle=${encodeURIComponent(PENSE_HANDLE)}`);
      uploads = ch?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || null;
      _penseCache.uploads = uploads;
    }
    if (!uploads) return res.json({ video: null });

    // 2) item mais recente da playlist de uploads
    const pl = await yt(`playlistItems?part=snippet&maxResults=1&playlistId=${uploads}`);
    const sn = pl?.items?.[0]?.snippet;
    const videoId = sn?.resourceId?.videoId;
    if (!videoId) return res.json({ video: null });

    const th = sn.thumbnails || {};
    const video = {
      video_id: videoId,
      titulo: sn.title || 'Pense',
      thumbnail_url: (th.maxres || th.high || th.medium || th.default)?.url || null,
      publicado_em: sn.publishedAt || null,
    };
    _penseCache = { at: Date.now(), uploads, video };
    res.json({ video });
  } catch (e) {
    console.error('[APP] pense-ultimo:', e.message);
    res.json({ video: _penseCache.video || null });
  }
});

/**
 * Minutos desde a meia-noite **em BRT** (mesma convenção do `hojeBRT()`:
 * offset fixo −3h, que o Brasil não muda desde 2019).
 */
function agoraMinutosBRT() {
  const d = new Date(Date.now() - 3 * 3600 * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
function minutosDaHora(hora) {
  const [hh, mm] = String(hora || '').split(':');
  const h = Number(hh), m = Number(mm || 0);
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : null;
}

/**
 * O culto que a pessoa está VIVENDO agora.
 *
 * ⚠️ Isto era `order('hora', desc).limit(1)` do dia em UTC, e os dois pedaços
 * estavam errados (achado 04/08/2026):
 *  1. `new Date().toISOString()` é UTC → das 21h BRT em diante o "hoje" já é
 *     AMANHÃ. No culto de domingo 19h (que passa das 21h) o `culto` vinha nulo
 *     e a decisão de fé era gravada com o dia seguinte — o dedup de 1/dia e a
 *     fila da Integração ficavam desencontrados.
 *  2. Pegar a MAIOR hora do dia significa que, no culto das 08:30, a decisão
 *     era carimbada no culto das 19:00. Atribuição errada de culto na NSM.
 *
 * `ao_vivo` = existe culto cuja janela [hora − 30min, hora + 3h] contém o
 * agora. É o que o app usa pra mostrar (ou não) o "No culto" na Home: fora da
 * janela a tela não tem propósito. Sem janela ativa devolve o PRÓXIMO de hoje
 * (a tela consegue dizer "começa às 19h") com `ao_vivo: false`.
 */
async function cultoDeAgora() {
  const hoje = hojeBRT();
  const { data } = await supabase
    .from('cultos')
    .select('id, nome, data, hora')
    .eq('data', hoje).is('deleted_at', null)
    .order('hora', { ascending: true });
  const lista = data || [];
  if (!lista.length) return { culto: null, ao_vivo: false };

  const agora = agoraMinutosBRT();

  // ⚠️ Os cultos de domingo saem de 90 em 90 min, então uma janela de 3h
  // SOBREPÕE dois ou três. Por isso: (1) entre os que JÁ COMEÇARAM e ainda
  // estão na janela, vale o MAIS RECENTE (às 10:30 é o das 10:00, não o das
  // 08:30 — `find` simples pegava o primeiro e errava a atribuição do culto);
  // (2) só quando nada começou é que a antecedência de 30 min conta (às 08:15
  // é o das 08:30). Sem essa ordem, às 09:40 — 08:30 ainda rolando — a decisão
  // iria pro culto das 10:00.
  const iniciados = lista.filter((c) => {
    const ini = minutosDaHora(c.hora);
    return ini != null && agora >= ini && agora <= ini + 180;
  });
  if (iniciados.length) return { culto: iniciados[iniciados.length - 1], ao_vivo: true };

  const chegando = lista.find((c) => {
    const ini = minutosDaHora(c.hora);
    return ini != null && agora >= ini - 30 && agora < ini;
  });
  if (chegando) return { culto: chegando, ao_vivo: true };

  const proximo = lista.find((c) => {
    const ini = minutosDaHora(c.hora);
    return ini != null && ini > agora;
  });
  return { culto: proximo || lista[lista.length - 1], ao_vivo: false };
}

// GET /api/app/culto/agora — Modo Culto: culto de hoje + link ao vivo + se já registrou decisão.
router.get('/culto/agora', authApp, async (req, res) => {
  try {
    const channelId = process.env.YOUTUBE_CHANNEL_ID || 'UCfjMVzaYlCS_VE3JuEJj2vQ';
    const hoje = hojeBRT();
    const { culto, ao_vivo } = await cultoDeAgora();

    let jaRegistrou = false;
    const membro = await resolveMembroApp(req).catch(() => null);
    if (membro?.id) {
      const { data: pend } = await supabase
        .from('app_decisoes').select('id')
        .eq('membro_id', membro.id).eq('status', 'pendente').is('deleted_at', null)
        .gte('criada_em', `${hoje}T00:00:00`).limit(1);
      jaRegistrou = (pend || []).length > 0;
    }
    res.json({
      culto: culto || null,
      ao_vivo,
      canal_live: `https://www.youtube.com/channel/${channelId}/live`,
      jaRegistrou,
    });
  } catch (e) {
    console.error('[APP] culto/agora:', e.message);
    res.status(500).json({ error: 'Erro ao carregar o culto' });
  }
});

// POST /api/app/culto/decisao — registra uma decisão de fé na FILA DE REVISÃO.
// NÃO entra na NSM até a Integração confirmar (decisão da liderança).
router.post('/culto/decisao', authApp, limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req).catch(() => null);
    if (!membro?.id) return res.status(400).json({ error: 'Complete seu cadastro de membro primeiro.' });

    const ambiente = ['presencial', 'online'].includes(req.body?.ambiente) ? req.body.ambiente : 'presencial';
    const tipo = ['aceitar', 'reconciliacao', 'rededicacao', 'batismo', 'outro'].includes(req.body?.tipo) ? req.body.tipo : null;
    const observacao = (req.body?.observacao || '').toString().trim().slice(0, 500) || null;
    const hoje = hojeBRT();

    // Dedup: 1 decisão pendente por membro por dia.
    const { data: pend } = await supabase
      .from('app_decisoes').select('id')
      .eq('membro_id', membro.id).eq('status', 'pendente').is('deleted_at', null)
      .gte('criada_em', `${hoje}T00:00:00`).limit(1);
    if ((pend || []).length) return res.json({ ok: true, jaRegistrou: true });

    // ⚠️ MESMA régua do /culto/agora: a decisão é carimbada no culto que a
    // pessoa está vivendo, não no de maior hora do dia (antes, decisão das
    // 08:30 ia pro culto das 19:00) — e o dia é BRT (antes, das 21h em diante
    // o UTC já era o dia seguinte e o culto_id vinha nulo).
    const { culto } = await cultoDeAgora();

    const { error } = await supabase.from('app_decisoes').insert({
      membro_id: membro.id, culto_id: culto?.id || null, ambiente, tipo, observacao, status: 'pendente',
    });
    if (error) throw error;

    try {
      await notificar({
        modulo: 'integracao',
        tipo: 'decisao_app',
        titulo: 'Nova decisão de fé pelo app 🙌',
        mensagem: `${membro.nome} registrou uma decisão pelo app. Confirme na aba Decisões.`,
        link: '/integracao?tab=vis_decisoes',
        chaveDedup: `decisao_app-${membro.id}-${hoje}`,
      });
    } catch (e) { console.warn('[APP] notificar decisao_app:', e.message); }

    res.json({ ok: true, jaRegistrou: true });
  } catch (e) {
    console.error('[APP] culto/decisao:', e.message);
    res.status(500).json({ error: 'Erro ao registrar decisão' });
  }
});

// GET /api/app/comunicados — mural do membro (publicados, segmentados).
router.get('/comunicados', authApp, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req).catch(() => null);
    const segmentos = ['todos'];
    if (membro?.id) {
      const { data: m } = await supabase.from('mem_membros').select('frequenta_area').eq('id', membro.id).maybeSingle();
      if (m?.frequenta_area) segmentos.push(m.frequenta_area);
    }
    const { data } = await supabase
      .from('comunicados')
      .select('id, titulo, corpo, foto_url, segmento, publicado_em')
      .eq('status', 'publicado')
      .is('deleted_at', null)
      .in('segmento', segmentos)
      .order('publicado_em', { ascending: false })
      .limit(50);
    res.json({ comunicados: data || [] });
  } catch (e) {
    console.error('[APP] comunicados:', e.message);
    res.status(500).json({ error: 'Erro ao carregar comunicados' });
  }
});

// POST /api/app/telemetria { eventos: [{tipo,nome,props,plataforma,app_version}] }
// Ingestão de telemetria do app (telas/ações/erros). Auth opcional (captura
// também pré-login). NUNCA devolve erro pro app (telemetria não pode quebrar).
router.post('/telemetria', tryAuth, async (req, res) => {
  try {
    const { normalizeMobileTelemetryBatch } = require('../services/systemMobileOps');
    const rows = normalizeMobileTelemetryBatch(req.body?.eventos, req.user?.id || null);
    if (!rows.length) return res.json({ ok: true, gravados: 0 });
    const { error } = await supabase.from('app_eventos').upsert(rows, {
      onConflict: 'event_id',
      ignoreDuplicates: true,
    });
    if (error) throw error;
    res.json({ ok: true, gravados: rows.length });
  } catch (e) {
    console.warn('[APP] telemetria:', e.message);
    // ⚠️ Falha de ingestão AVISA GENTE (1×/dia). Este handler responde 200
    // `{ok:false}` de propósito (telemetria não pode quebrar o app) e o app
    // ignora o corpo — então, sem este aviso, a telemetria morre em SILÊNCIO:
    // foi o que aconteceu de 31/07 a 04/08/2026 (o `event_id NOT NULL` novo
    // rejeitava todo lote e ninguém soube por 5 dias, justo quando ela era
    // necessária pra diagnosticar o app do Marcos).
    try {
      const dia = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
      await notificar({
        modulo: 'dashboard',
        tipo: 'telemetria_app_falhando',
        titulo: 'Telemetria do app não está gravando',
        mensagem: `A ingestão de eventos do app está falhando: ${e.message}. Enquanto isso, o painel de uso do app fica sem dado novo.`,
        severidade: 'alta',
        link: '/admin/app-analytics',
        chaveDedup: `telemetria_app_falha_${dia}`,
      });
    } catch { /* aviso é best-effort · nunca derruba a resposta */ }
    res.json({ ok: false }); // nunca 500 pro app
  }
});

// ══════════════════════════════════════════════════════════════════════════
// Aprovação de pedidos de inscrição em grupo (líder + admin de grupos)
// Superfície pro app: o LÍDER de um grupo (mem_grupos.lider_id) e os
// RESPONSÁVEIS/admins de grupos aprovam/recusam pedidos que hoje vivem no
// módulo web /grupos. Reusa aprovarPedidoCore (grupos.js) e replica o
// essencial do rejeitar. NÃO mexe nos endpoints web.
// ══════════════════════════════════════════════════════════════════════════

// Resolve o papel do usuário do app no domínio de grupos:
//  - membro (mem_membros do logado, pra checar liderança e montar o nome)
//  - grupos_liderados: grupos onde ele é lider_id OU tem vínculo vivo no
//    roster com funcao lider/co_lider (Natasha 21/08: os outros líderes, não
//    só o principal, também gerenciam — o `meu-grupo.tsx` do app JÁ mostrava
//    o botão "Gerenciar" pra funcao lider/co_lider e o servidor recusava 403;
//    era a divergência tela × gate). ⚠️ Quem RECEBE WhatsApp do grupo segue
//    sendo SÓ o `lider_id` (lei de 31/07 · um destinatário) — isto é gestão,
//    não notificação.
//  - grupos_supervisionados: grupos onde ele é supervisor_id
//  - grupos_geridos: união (dedup por id) de liderados + supervisionados — é o
//    ESCOPO DE GESTÃO (líder OU supervisor pode gerenciar esses grupos)
//  - admin_grupos: role admin/diretor OU área "grupos" (boost) OU nível do
//    módulo grupos >= 3 (via permissões granulares resolvidas por e-mail).
// Batismo · operação pelo aplicativo. A tela pessoal e a tela de operação usam
// a mesma porta; o servidor decide o modo por permissão real, nunca por nome.
async function permissaoModuloApp(req, slug) {
  const email = String(req.user?.email || '').trim().toLowerCase();
  if (!email) return { leitura: 0, escrita: 0, superadmin: false };
  if (await isSuperAdminEmail(email)) return { leitura: 5, escrita: 5, superadmin: true };

  const { data: prof } = await supabase.from('profiles')
    .select('role').eq('id', req.user.id).maybeSingle();
  if (prof && ['admin', 'diretor'].includes(prof.role)) {
    return { leitura: 5, escrita: 5, superadmin: false };
  }

  const { data: permUser } = await supabase.from('usuarios')
    .select('id, cargo_id').eq('email', email).eq('ativo', true).maybeSingle();
  if (!permUser) return { leitura: 0, escrita: 0, superadmin: false };
  const [overridesRes, modulos, cargoMatrix, userAreasRes] = await Promise.all([
    supabase.from('permissoes_modulo')
      .select('modulo_id, nivel_leitura, nivel_escrita, pode_exportar, pode_aprovar, escopo_proprio, expira_em')
      .eq('usuario_id', permUser.id),
    getModulos(),
    getCargoMatrix(permUser.cargo_id),
    supabase.from('usuario_areas').select('areas(nome)').eq('usuario_id', permUser.id),
  ]);
  const agora = Date.now();
  const overrides = (overridesRes.data || []).filter(o => !o.expira_em || new Date(o.expira_em).getTime() > agora);
  const areas = (userAreasRes.data || []).map(ua => ua.areas?.nome).filter(Boolean);
  const perms = resolveEffectivePerms({ overrides, cargoMatrix, cargoId: permUser.cargo_id, modulos, areas });
  const p = perms[slug] || {};
  return { leitura: Number(p.leitura || 0), escrita: Number(p.escrita || 0), superadmin: false };
}

async function autorizarGestaoBatismoApp(req, res, next) {
  try {
    const permissao = await permissaoModuloApp(req, 'batismo');
    if (Math.max(permissao.leitura, permissao.escrita) < 2) {
      return res.status(403).json({ error: 'Esta área é só para quem gerencia o Batismo.' });
    }
    req.batismoPermissao = permissao;
    next();
  } catch (e) {
    console.error('[APP] batismo/permissao:', e.message);
    res.status(500).json({ error: 'Erro ao verificar a permissão de Batismo.' });
  }
}

function dataIsoValida(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }
function dataBatismoFutura(v) { return dataIsoValida(v) && String(v) >= hojeBRT(); }
function limparTexto(v, max = 500) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

const BATISMO_COLUNAS_APP = [
  'id', 'membro_id', 'nome', 'sobrenome', 'telefone', 'email', 'cpf',
  'data_nascimento', 'data_batismo', 'horario_culto', 'status', 'checkin_em',
  'tamanho_camisa', 'eh_crianca', 'possui_deficiencia',
  'deficiencia_descricao', 'observacoes', 'endereco', 'area_kpi', 'created_at',
].join(', ');

router.get('/batismo/papel', authApp, limiterNormal, async (req, res) => {
  try {
    const p = await permissaoModuloApp(req, 'batismo');
    const nivel = Math.max(p.leitura, p.escrita);
    res.json({ pode_gerenciar: nivel >= 2, nivel, superadmin: p.superadmin });
  } catch (e) {
    console.error('[APP] batismo/papel:', e.message);
    res.status(500).json({ error: 'Erro ao carregar seu acesso ao Batismo.' });
  }
});

router.get('/batismo/gestao', authApp, autorizarGestaoBatismoApp, limiterNormal, async (req, res) => {
  try {
    const hoje = hojeBRT();
    const [datasRes, proxima, horarios] = await Promise.all([
      supabase.from('batismo_inscricoes').select('data_batismo')
        .is('deleted_at', null).not('status', 'in', '(cancelado,rejeitado)')
        .not('data_batismo', 'is', null),
      dataProximoBatismo(),
      batismoHorariosConfigurados(),
    ]);
    if (datasRes.error) throw datasRes.error;
    const datasSet = new Set((datasRes.data || []).map(x => x.data_batismo).filter(dataIsoValida));
    if (dataIsoValida(proxima)) datasSet.add(proxima);
    // A gestão só precisa das próximas datas: históricos antigos não devem
    // poluir o seletor nem voltar a ser selecionados por engano.
    const datas = [...datasSet].filter(d => d >= hoje).sort().slice(0, 3);
    const datasPermitidas = new Set(datas);
    const pedida = dataIsoValida(req.query.data) ? String(req.query.data) : null;
    const selecionada = pedida && datasPermitidas.has(pedida)
      ? pedida
      : (datas[0] || (dataIsoValida(proxima) ? proxima : hoje));
    const [pessoasRes, aprovacoesRes] = await Promise.all([
      supabase.from('batismo_inscricoes').select(BATISMO_COLUNAS_APP)
        .eq('data_batismo', selecionada).is('deleted_at', null)
        .not('status', 'in', '(cancelado,rejeitado)')
        .order('horario_culto', { ascending: true, nullsFirst: false }).order('nome'),
      supabase.from('batismo_inscricoes').select(BATISMO_COLUNAS_APP)
        .eq('status', 'pendente').is('deleted_at', null).order('created_at'),
    ]);
    if (pessoasRes.error) throw pessoasRes.error;
    if (aprovacoesRes.error) throw aprovacoesRes.error;
    const pessoas = pessoasRes.data || [];
    res.json({
      data: selecionada, datas, hoje, pessoas, aprovacoes: aprovacoesRes.data || [],
      resumo: {
        previstos: pessoas.length,
        presentes: pessoas.filter(p => !!p.checkin_em).length,
        aguardando: (aprovacoesRes.data || []).length,
      },
      horarios: Array.isArray(horarios)
        ? horarios.filter(h => h.aberto !== false).map(h => ({ horario: h.horario, label: h.label || h.horario }))
        : [],
    });
  } catch (e) {
    console.error('[APP] batismo/gestao:', e.message);
    res.status(500).json({ error: 'Erro ao carregar a gestão do Batismo.' });
  }
});

router.post('/batismo/gestao/pessoas', authApp, autorizarGestaoBatismoApp, limiterNormal, async (req, res) => {
  try {
    const nome = limparTexto(req.body?.nome, 120);
    const sobrenome = limparTexto(req.body?.sobrenome, 120);
    const dataBatismo = dataIsoValida(req.body?.data_batismo) ? String(req.body.data_batismo) : await dataProximoBatismo();
    if (!nome || !sobrenome) return res.status(400).json({ error: 'Nome e sobrenome são obrigatórios.' });
    if (!dataIsoValida(dataBatismo)) return res.status(400).json({ error: 'Selecione uma data de Batismo.' });
    if (!dataBatismoFutura(dataBatismo)) return res.status(400).json({ error: 'A data de Batismo já passou.' });
    const cpf = String(req.body?.cpf || '').replace(/\D/g, '') || null;
    let membroId = null;
    try {
      const vinculo = await acharOuCriarGuardado({
        cpf, email: limparTexto(req.body?.email, 180), telefone: limparTexto(req.body?.telefone, 40),
        nome: `${nome} ${sobrenome}`,
        dataNascimento: dataIsoValida(req.body?.data_nascimento) ? req.body.data_nascimento : null,
        status: 'visitante', origem: 'batismo_app_gestao',
      });
      membroId = vinculo.membro_id || null;
    } catch (e) { console.warn('[APP] batismo/gestao/pessoas · vínculo:', e.message); }
    const { data, error } = await supabase.from('batismo_inscricoes').insert({
      membro_id: membroId, nome, sobrenome,
      telefone: limparTexto(req.body?.telefone, 40), email: limparTexto(req.body?.email, 180), cpf,
      data_nascimento: dataIsoValida(req.body?.data_nascimento) ? req.body.data_nascimento : null,
      data_batismo: dataBatismo, horario_culto: limparTexto(req.body?.horario_culto, 40),
      tamanho_camisa: limparTexto(req.body?.tamanho_camisa, 12)?.toUpperCase() || null,
      endereco: limparTexto(req.body?.endereco, 300),
      observacoes: limparTexto(req.body?.observacoes, 1000),
      status: 'confirmado', origem: 'app_gestao_batismo', inscrito_por: req.user.id,
      area_kpi: ['kids', 'sede', 'bridge', 'ami', 'online'].includes(req.body?.area_kpi) ? req.body.area_kpi : 'sede',
    }).select(BATISMO_COLUNAS_APP).single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[APP] batismo/gestao/pessoas POST:', e.message);
    res.status(500).json({ error: 'Erro ao adicionar a pessoa ao Batismo.' });
  }
});

router.post('/batismo/gestao/:id/aprovar', authApp, autorizarGestaoBatismoApp, limiterNormal, async (req, res) => {
  try {
    const { data: atual, error: buscaErr } = await supabase.from('batismo_inscricoes')
      .select('id, status, data_batismo').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (buscaErr) throw buscaErr;
    if (!atual) return res.status(404).json({ error: 'Inscrição não encontrada.' });
    if (atual.status !== 'pendente') return res.status(409).json({ error: 'Esta solicitação já foi tratada.' });
    const dataBatismo = dataIsoValida(req.body?.data_batismo)
      ? String(req.body.data_batismo) : (atual.data_batismo || await dataProximoBatismo());
    if (!dataIsoValida(dataBatismo)) return res.status(400).json({ error: 'Selecione a data antes de aprovar.' });
    if (!dataBatismoFutura(dataBatismo)) return res.status(400).json({ error: 'A data de Batismo já passou.' });
    const update = { status: 'confirmado', data_batismo: dataBatismo, updated_at: new Date().toISOString() };
    if (req.body?.horario_culto !== undefined) update.horario_culto = limparTexto(req.body.horario_culto, 40);
    const { data, error } = await supabase.from('batismo_inscricoes').update(update)
      .eq('id', req.params.id).eq('status', 'pendente').is('deleted_at', null)
      .select(BATISMO_COLUNAS_APP).single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[APP] batismo/gestao/aprovar:', e.message);
    res.status(500).json({ error: 'Erro ao aprovar a inscrição.' });
  }
});

router.put('/batismo/gestao/:id', authApp, autorizarGestaoBatismoApp, limiterNormal, async (req, res) => {
  try {
    const update = { updated_at: new Date().toISOString() };
    for (const [campo, max] of [
      ['nome', 120], ['sobrenome', 120], ['telefone', 40], ['email', 180],
      ['observacoes', 1000], ['endereco', 300], ['deficiencia_descricao', 500], ['horario_culto', 40],
    ]) if (req.body?.[campo] !== undefined) update[campo] = limparTexto(req.body[campo], max);
    if (req.body?.nome !== undefined && !update.nome) return res.status(400).json({ error: 'Nome é obrigatório.' });
    if (req.body?.sobrenome !== undefined && !update.sobrenome) return res.status(400).json({ error: 'Sobrenome é obrigatório.' });
    if (req.body?.data_batismo !== undefined) {
      if (!dataIsoValida(req.body.data_batismo)) return res.status(400).json({ error: 'Data de Batismo inválida.' });
      if (!dataBatismoFutura(req.body.data_batismo)) return res.status(400).json({ error: 'A data de Batismo já passou.' });
      update.data_batismo = req.body.data_batismo;
    }
    if (req.body?.data_nascimento !== undefined) update.data_nascimento = dataIsoValida(req.body.data_nascimento) ? req.body.data_nascimento : null;
    if (req.body?.tamanho_camisa !== undefined) update.tamanho_camisa = limparTexto(req.body.tamanho_camisa, 12)?.toUpperCase() || null;
    if (req.body?.eh_crianca !== undefined) update.eh_crianca = !!req.body.eh_crianca;
    if (req.body?.possui_deficiencia !== undefined) update.possui_deficiencia = !!req.body.possui_deficiencia;
    if (['kids', 'sede', 'bridge', 'ami', 'online'].includes(req.body?.area_kpi)) update.area_kpi = req.body.area_kpi;
    const { data, error } = await supabase.from('batismo_inscricoes').update(update)
      .eq('id', req.params.id).is('deleted_at', null).select(BATISMO_COLUNAS_APP).single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[APP] batismo/gestao/pessoa PUT:', e.message);
    res.status(500).json({ error: 'Erro ao salvar os dados da pessoa.' });
  }
});

router.post('/batismo/gestao/:id/checkin', authApp, autorizarGestaoBatismoApp, limiterNormal, async (req, res) => {
  try {
    const presente = req.body?.presente !== false;
    const agora = new Date().toISOString();
    const update = presente
      ? { checkin_em: agora, checkin_por: req.user.id, updated_at: agora }
      : { checkin_em: null, checkin_por: null, updated_at: agora };
    const { data, error } = await supabase.from('batismo_inscricoes').update(update)
      .eq('id', req.params.id).is('deleted_at', null).not('status', 'in', '(cancelado,rejeitado)')
      .select(BATISMO_COLUNAS_APP).single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[APP] batismo/gestao/checkin:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar o check-in.' });
  }
});

// Retira da lista sem apagar PII nem histórico; o cancelamento é reversível no ERP.
router.delete('/batismo/gestao/:id', authApp, autorizarGestaoBatismoApp, limiterNormal, async (req, res) => {
  try {
    const agora = new Date().toISOString();
    const { data, error } = await supabase.from('batismo_inscricoes')
      .update({ status: 'cancelado', checkin_em: null, checkin_por: null, updated_at: agora })
      .eq('id', req.params.id).is('deleted_at', null).select('id').single();
    if (error) throw error;
    res.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('[APP] batismo/gestao/pessoa DELETE:', e.message);
    res.status(500).json({ error: 'Erro ao retirar a pessoa deste Batismo.' });
  }
});

async function gruposPapelApp(req) {
  const membro = await resolveMembroApp(req).catch(() => null);

  // Grupos liderados/supervisionados pelo membro (só se resolvemos o membro).
  let gruposLiderados = [];
  let gruposSupervisionados = [];
  if (membro?.id) {
    const [glRes, gsRes, rosterRes] = await Promise.all([
      supabase.from('mem_grupos')
        .select('id, nome').eq('lider_id', membro.id).is('deleted_at', null)
        .order('nome', { ascending: true }),
      supabase.from('mem_grupos')
        .select('id, nome').eq('supervisor_id', membro.id).is('deleted_at', null)
        .order('nome', { ascending: true }),
      // Líder ADICIONAL do roster: quem GERENCIA o grupo sem ser o `lider_id`.
      // ⚠️⚠️ `lider_treinamento` ENTRA aqui por decisão do Marcos (25/08/2026):
      // *"quero que quem for líder em treinamento também possa gerenciar
      // grupo"*. E `co_lider` SAIU — o termo foi aposentado no mesmo pedido
      // (migration 20260825170000 converteu quem tinha em lider_treinamento e
      // o CHECK do banco recusa gravá-lo de novo).
      // ⚠️ Esta lista é GESTÃO, e é MAIS LARGA que a da vitrine pública
      // (`montarListaLideres` em publicGrupos só põe `lider` como líder do
      // grupo): quem está em treinamento gerencia, mas não é anunciado como
      // líder na página de inscrição. Se um dia as duas tiverem que coincidir,
      // é decisão de produto — não alinhar por engano achando que divergiram.
      // Best-effort no erro: falha aqui degrada pra "só lider_id" (fail-closed
      // pro poder novo, nunca derruba quem já gerenciava).
      supabase.from('mem_grupo_membros')
        .select('grupo_id, mem_grupos!inner(id, nome)')
        .eq('membro_id', membro.id)
        .in('funcao', ['lider', 'lider_treinamento'])
        .is('saiu_em', null).is('deleted_at', null)
        .is('mem_grupos.deleted_at', null),
    ]);
    gruposLiderados = glRes.data || [];
    gruposSupervisionados = gsRes.data || [];
    if (rosterRes.error) {
      console.warn('[APP] gruposPapelApp · roster de líderes:', rosterRes.error.message);
    } else {
      const vistos = new Set(gruposLiderados.map(g => g.id));
      for (const v of (rosterRes.data || [])) {
        const g = v.mem_grupos;
        if (!g?.id || vistos.has(g.id)) continue;
        vistos.add(g.id);
        gruposLiderados.push({ id: g.id, nome: g.nome });
      }
      gruposLiderados.sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
    }
  }

  // Escopo de gestão = líder OU supervisor (dedup por id).
  const geridosMap = new Map();
  for (const g of [...gruposLiderados, ...gruposSupervisionados]) {
    if (!geridosMap.has(g.id)) geridosMap.set(g.id, g);
  }
  const gruposGeridos = [...geridosMap.values()]
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome)));

  // Admin de grupos · (a) role legado admin/diretor no profiles do auth user.
  let adminGrupos = false;
  const email = req.user?.email || null;
  if (req.user?.id) {
    const { data: prof } = await supabase.from('profiles')
      .select('role').eq('id', req.user.id).maybeSingle();
    if (prof && ['admin', 'diretor'].includes(prof.role)) adminGrupos = true;
  }

  // (b)/(c) permissões granulares · resolve o nível do módulo "grupos" pelo
  // e-mail (mesma fonte do middleware web) sem depender de auth.uid()/RLS.
  if (!adminGrupos && email) {
    try {
      const { data: permUser } = await supabase.from('usuarios')
        .select('id, cargo_id').eq('email', email).eq('ativo', true).maybeSingle();
      if (permUser) {
        const [overridesRes, modulos, cargoMatrix, userAreasRes] = await Promise.all([
          supabase.from('permissoes_modulo')
            .select('modulo_id, nivel_leitura, nivel_escrita, pode_exportar, pode_aprovar, escopo_proprio, expira_em')
            .eq('usuario_id', permUser.id),
          getModulos(),
          getCargoMatrix(permUser.cargo_id),
          supabase.from('usuario_areas')
            .select('areas(nome)').eq('usuario_id', permUser.id),
        ]);
        const now = Date.now();
        const overrides = (overridesRes.data || [])
          .filter(o => !o.expira_em || new Date(o.expira_em).getTime() > now);
        const areas = (userAreasRes.data || []).map(ua => ua.areas?.nome).filter(Boolean);
        const modulePerms = resolveEffectivePerms({
          overrides, cargoMatrix, cargoId: permUser.cargo_id, modulos, areas,
        });
        const g = modulePerms['grupos'];
        if (g && (Math.max(g.leitura || 0, g.escrita || 0) >= 3)) adminGrupos = true;
      }
    } catch (e) {
      console.warn('[APP] gruposPapelApp · permissões:', e.message);
    }
  }

  return { membro, adminGrupos, gruposLiderados, gruposSupervisionados, gruposGeridos };
}

/**
 * Papel da pessoa NAQUELE grupo — quem decide é o SERVIDOR (07/08/2026).
 *
 * ⚠️ Precedência FIXA, e LIDERAR GANHA: medido em 07/08, **7 dos 87 grupos
 * ativos têm `supervisor_id == lider_id`**. Sem isso, esses líderes cairiam na
 * tela enxuta de supervisão e perderiam Pedidos, Estudos e Editar do PRÓPRIO
 * grupo.
 * ⚠️ `admin_grupos` (a coordenação) fica com a tela COMPLETA: quem cuida do
 * módulo precisa de tudo, não da visão de acompanhamento.
 */
function papelNoGrupoApp({ gruposLiderados, gruposSupervisionados, adminGrupos }, gid) {
  if ((gruposLiderados || []).some(g => g.id === gid)) return 'lider';
  if ((gruposSupervisionados || []).some(g => g.id === gid)) return 'supervisor';
  if (adminGrupos) return 'admin';
  return 'nenhum';
}

// GET /api/app/grupos/papel — o app decide se mostra a funcionalidade.
router.get('/grupos/papel', authApp, limiterNormal, async (req, res) => {
  try {
    const { adminGrupos, gruposLiderados, gruposSupervisionados } = await gruposPapelApp(req);
    res.json({
      lider: gruposLiderados.length > 0,
      supervisor: gruposSupervisionados.length > 0,
      admin_grupos: adminGrupos,
      grupos_liderados: gruposLiderados,
      grupos_supervisionados: gruposSupervisionados,
    });
  } catch (e) {
    console.error('[APP] grupos/papel:', e.message);
    res.status(500).json({ error: 'Erro ao carregar seu papel em grupos' });
  }
});

// Monta a query de pedidos pendentes conforme o escopo do usuário. Retorna
// null quando o usuário não é nem líder nem admin (o chamador responde vazio).
function pedidosPendentesQuery({ adminGrupos, gruposGeridos }) {
  if (!adminGrupos && !gruposGeridos.length) return null;
  let q = supabase.from('mem_grupo_pedidos')
    .select('id, grupo_id, nome, telefone, email, origem, created_at, mem_grupos(nome)')
    .eq('status', 'pendente');
  if (!adminGrupos) {
    q = q.in('grupo_id', gruposGeridos.map(g => g.id));
  }
  return q;
}

// GET /api/app/grupos/pedidos — pendentes no escopo do usuário (mais antigos 1º).
router.get('/grupos/pedidos', authApp, limiterNormal, async (req, res) => {
  try {
    const { adminGrupos, gruposGeridos } = await gruposPapelApp(req);
    const q = pedidosPendentesQuery({ adminGrupos, gruposGeridos });
    if (!q) return res.json({ admin: false, pedidos: [] });
    const { data, error } = await q.order('created_at', { ascending: true });
    if (error) throw error;
    const pedidos = (data || []).map(p => ({
      id: p.id,
      grupo_id: p.grupo_id,
      grupo_nome: (Array.isArray(p.mem_grupos) ? p.mem_grupos[0] : p.mem_grupos)?.nome || null,
      nome: p.nome,
      telefone: p.telefone,
      email: p.email,
      origem: p.origem,
      created_at: p.created_at,
    }));
    res.json({ admin: adminGrupos, pedidos });
  } catch (e) {
    console.error('[APP] grupos/pedidos:', e.message);
    res.status(500).json({ error: 'Erro ao carregar pedidos' });
  }
});

// GET /api/app/grupos/pedidos/count — badge (mesmo escopo).
router.get('/grupos/pedidos/count', authApp, limiterNormal, async (req, res) => {
  try {
    const { adminGrupos, gruposGeridos } = await gruposPapelApp(req);
    if (!adminGrupos && !gruposGeridos.length) return res.json({ count: 0 });
    let q = supabase.from('mem_grupo_pedidos')
      .select('id', { count: 'exact', head: true }).eq('status', 'pendente');
    if (!adminGrupos) q = q.in('grupo_id', gruposGeridos.map(g => g.id));
    const { count, error } = await q;
    if (error) throw error;
    res.json({ count: count || 0 });
  } catch (e) {
    console.error('[APP] grupos/pedidos/count:', e.message);
    res.status(500).json({ error: 'Erro ao contar pedidos' });
  }
});

// Autoriza a decisão sobre um pedido: precisa gerir o grupo do pedido (líder OU
// supervisor) OU ser admin de grupos. Devolve { pedido, membro } ou responde o
// erro e retorna null.
async function autorizarDecisaoPedido(req, res) {
  const { membro, adminGrupos, gruposGeridos } = await gruposPapelApp(req);
  const { data: pedido } = await supabase.from('mem_grupo_pedidos')
    .select('id, grupo_id, status').eq('id', req.params.id).maybeSingle();
  if (!pedido) { res.status(404).json({ error: 'Pedido não encontrado' }); return null; }
  const ehGerido = gruposGeridos.some(g => g.id === pedido.grupo_id);
  if (!adminGrupos && !ehGerido) {
    res.status(403).json({ error: 'Você não tem permissão para decidir este pedido' });
    return null;
  }
  return { pedido, membro };
}

// POST /api/app/grupos/pedidos/:id/aprovar
router.post('/grupos/pedidos/:id/aprovar', authApp, limiterNormal, async (req, res) => {
  try {
    const ctx = await autorizarDecisaoPedido(req, res);
    if (!ctx) return;
    // aprovarPedidoCore espera { userId, name } (usa como decidido_por/_nome).
    const user = { userId: req.user.id, name: ctx.membro?.nome || req.user.email || 'Líder' };
    const r = await aprovarPedidoCore(req.params.id, user);
    if (!r.ok) return res.status(r.code || 400).json({ error: r.error });
    res.json({ ok: true });
  } catch (e) {
    console.error('[APP] grupos/pedidos aprovar:', e.message);
    res.status(500).json({ error: 'Erro ao aprovar pedido' });
  }
});

// POST /api/app/grupos/pedidos/:id/rejeitar — body: { motivo? }
// Recusa do LÍDER não é terminal (lei de 14/07): o pedido volta pra TRIAGEM
// (status 'devolvido') — a equipe, acima do líder, sugere outro grupo pra
// pessoa ou rejeita de vez. A pessoa NÃO é notificada (o aviso de recusa era
// exclusivo deste caminho — o link do WhatsApp nunca mandou; item 3 da
// auditoria do app 03/08). Mesma semântica do ramo de recusa do
// POST /public/grupos/aprovar.
router.post('/grupos/pedidos/:id/rejeitar', authApp, limiterNormal, async (req, res) => {
  try {
    const ctx = await autorizarDecisaoPedido(req, res);
    if (!ctx) return;
    const motivoInterno = req.body?.motivo ? String(req.body.motivo).trim().slice(0, 500) : null;
    const { data: pedido } = await supabase.from('mem_grupo_pedidos')
      .select('id, status, grupo_id, membro_id, nome').eq('id', req.params.id).single();
    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (pedido.status !== 'pendente') {
      return res.status(409).json({ error: `Pedido já foi ${pedido.status}` });
    }
    const decididoPorNome = ctx.membro?.nome || req.user.email || 'Líder';
    // Guarda de corrida: só devolve se AINDA está pendente.
    const { data: claimed } = await supabase.from('mem_grupo_pedidos').update({
      status: 'devolvido',
      motivo_rejeicao: motivoInterno,
      decidido_por: req.user.id,
      decidido_por_nome: decididoPorNome,
      decidido_em: new Date().toISOString(),
    }).eq('id', pedido.id).eq('status', 'pendente').select('id');
    if (!claimed || !claimed.length) {
      return res.status(409).json({ error: 'Pedido já foi decidido por outra pessoa' });
    }
    // Linha do tempo (nunca lança) — awaited: serverless descarta trabalho
    // pendente depois do res.json.
    await registrarEventoPedido(pedido.id, 'recusado_lider',
      { motivo_interno: motivoInterno, origem: 'app' }, decididoPorNome);

    // Avisa a TRIAGEM (módulo grupos) — mesma notificação do link do WhatsApp.
    // Fire-and-forget de propósito: a Caixa de entrada é o caminho garantido
    // (o pedido devolvido já está na fila).
    (async () => {
      try {
        const { data: grupo } = await supabase.from('mem_grupos').select('nome').eq('id', pedido.grupo_id).single();
        await notificar({
          modulo: 'grupos',
          tipo: 'pedido_devolvido',
          titulo: `Pedido devolvido pra triagem: ${pedido.nome}`,
          mensagem: `O líder de ${grupo?.nome || 'um grupo'} recusou o pedido pelo app${motivoInterno ? ` (motivo interno: ${motivoInterno.slice(0, 200)})` : ''}. Sugira outro grupo pra pessoa ou rejeite de vez.`,
          link: '/grupos?tab=entrada',
          severidade: 'aviso',
          chaveDedup: `pedido_devolvido_${pedido.id}`,
        });
      } catch (e) { console.error('[APP grupos/pedidos devolver notify]', e.message); }
    })();

    res.json({ ok: true, acao: 'devolvido' });
  } catch (e) {
    console.error('[APP] grupos/pedidos rejeitar:', e.message);
    res.status(500).json({ error: 'Erro ao recusar pedido' });
  }
});

// GET /api/app/grupos/meus — os grupos que o usuário GERE (lidera OU
// supervisiona), com contagens (membros ativos + inscrições pendentes) e info
// básica. É o que faz o app "ver os grupos que gerencio" mesmo quando não há
// nenhuma inscrição pendente.
router.get('/grupos/meus', authApp, limiterNormal, async (req, res) => {
  try {
    const papel = await gruposPapelApp(req);
    const { adminGrupos, gruposGeridos } = papel;
    const ids = gruposGeridos.map(g => g.id);
    if (!ids.length) return res.json({ admin: adminGrupos, grupos: [] });

    const [infoRes, membrosRes, pendRes] = await Promise.all([
      supabase.from('mem_grupos')
        .select('id, nome, dia_semana, horario, local, bairro, categoria, aceitando_inscricoes')
        .in('id', ids).is('deleted_at', null),
      supabase.from('mem_grupo_membros')
        .select('grupo_id').in('grupo_id', ids).is('saiu_em', null).is('deleted_at', null),
      supabase.from('mem_grupo_pedidos')
        .select('grupo_id').in('grupo_id', ids).eq('status', 'pendente'),
    ]);
    const countBy = (arr) => {
      const m = {};
      (arr || []).forEach(r => { m[r.grupo_id] = (m[r.grupo_id] || 0) + 1; });
      return m;
    };
    const mc = countBy(membrosRes.data);
    const pc = countBy(pendRes.data);
    const grupos = (infoRes.data || []).map(g => ({
      ...g,
      membros_ativos: mc[g.id] || 0,
      pendentes: pc[g.id] || 0,
      // ⚠️ O PAPEL vem do servidor (07/08): é ele que decide se o app abre a
      // tela completa de gestão ou a enxuta de supervisão. Sem este campo o app
      // teria que fazer uma 2ª chamada a `/grupos/papel` e cruzar ids no
      // cliente — que é o tipo de régua duplicada que já divergiu antes.
      papel: papelNoGrupoApp(papel, g.id),
    })).sort((a, b) => (b.pendentes - a.pendentes) || String(a.nome).localeCompare(String(b.nome)));
    res.json({ admin: adminGrupos, grupos });
  } catch (e) {
    console.error('[APP] grupos/meus:', e.message);
    res.status(500).json({ error: 'Erro ao carregar seus grupos' });
  }
});

// GET /api/app/grupos/:grupoId/membros — detalhe do grupo + roster ativo +
// inscrições pendentes daquele grupo. Gate: gere o grupo (líder OU supervisor)
// OU admin de grupos.
router.get('/grupos/:grupoId/membros', authApp, limiterNormal, async (req, res) => {
  try {
    const papel = await gruposPapelApp(req);
    const { adminGrupos, gruposGeridos } = papel;
    const gid = req.params.grupoId;
    const ehGerido = gruposGeridos.some(g => g.id === gid);
    if (!adminGrupos && !ehGerido) {
      return res.status(403).json({ error: 'Você não gerencia este grupo' });
    }
    // ⚠️ `lider_id` vai pro app porque é ele que decide QUEM é a líder principal
    // (a que recebe o WhatsApp do grupo · lei de 31/07). Sem esse campo, a tela
    // não conseguia distinguir `funcao='lider'` (cadastro, pode ter vários) da
    // pessoa protegida — e escondia o menu de ações de TODOS os líderes.
    const { data: grupo } = await supabase.from('mem_grupos')
      // ⚠️ `modo_inscricao` vai pro app desde 10/08: é ele que decide se o
      // botão "Convidar" manda o link DIRETO do grupo ou o link geral. Sem
      // ele, os 9 grupos 'fechado' (por convite do líder) distribuiriam um
      // link que devolve 403 pra todo mundo. Ver `lib/convite.ts` no app.
      .select('id, nome, dia_semana, horario, local, endereco, bairro, descricao, categoria, aceitando_inscricoes, modo_inscricao, lider_id')
      .eq('id', gid).is('deleted_at', null).maybeSingle();
    if (!grupo) return res.status(404).json({ error: 'Grupo não encontrado' });

    const [rosterRes, pendRes] = await Promise.all([
      supabase.from('mem_grupo_membros')
        .select('id, membro_id, funcao, entrou_em, presencas, membro:mem_membros(id, nome, telefone)')
        .eq('grupo_id', gid).is('saiu_em', null).is('deleted_at', null)
        .order('created_at', { ascending: true }),
      supabase.from('mem_grupo_pedidos')
        .select('id, grupo_id, nome, telefone, email, origem, created_at')
        .eq('grupo_id', gid).eq('status', 'pendente')
        .order('created_at', { ascending: true }),
    ]);
    const membros = (rosterRes.data || []).map(r => {
      const m = Array.isArray(r.membro) ? r.membro[0] : r.membro;
      return {
        id: r.id, funcao: r.funcao, entrou_em: r.entrou_em, presencas: r.presencas,
        // ⚠️ `membro_id` é necessário pra chamada de frequência (a RPC
        // `registrar_encontro_grupo` recebe ids de MEMBRO, não da linha do
        // roster). O líder já vê nome e telefone dessa pessoa.
        membro_id: r.membro_id || m?.id || null,
        nome: m?.nome || '—', telefone: m?.telefone || null,
      };
    });

    // Marcadores de jornada do roster — o pedido original do Pr. Nélio via
    // Arthur Serpa (13/08/2026): "o líder de grupo vê rapidamente em quais
    // etapas da jornada cada pessoa da sua turma está".
    // ⚠️ `incluirSensiveis: false` FIXO aqui, sem consultar permissão: quem
    // chega por esta rota é líder/supervisor de grupo pelo APP, e o gate de
    // generosidade é justamente sobre ele. Não é o `req.user` do ERP.
    await anexarMarcadores(membros, (p) => p.membro_id, { incluirSensiveis: false });
    const pendentes = (pendRes.data || []).map(p => ({
      id: p.id, grupo_id: p.grupo_id, grupo_nome: grupo.nome,
      nome: p.nome, telefone: p.telefone, email: p.email, origem: p.origem, created_at: p.created_at,
    }));
    // ⚠️ `meu_papel` fecha a porta do deep link: a tela de destino RE-CONFERE o
    // papel com o servidor em vez de confiar no que veio na navegação.
    res.json({ grupo, membros, pendentes, meu_papel: papelNoGrupoApp(papel, gid) });
  } catch (e) {
    console.error('[APP] grupos/membros:', e.message);
    res.status(500).json({ error: 'Erro ao carregar o grupo' });
  }
});

// ── Grupos · GERENCIAR (tudo o que o líder faz, num lugar só) ───────────────
// Pedido do Marcos (05/08/2026): "ao apertar gerenciar grupo, ali devem ter
// TODAS as opções para se fazer em um grupo" — membros (com quem é líder ou em
// treinamento), registro de frequência (com comentário do líder e pedido de
// ajuda), aprovação de pedidos, saídas e transferências, estudos e editar.
//
// ⚠️ Todos gateados por `gruposPapelApp` (gere o grupo OU admin de grupos) — a
// MESMA régua do GET /grupos/:grupoId/membros que já existia.
// ⚠️ Reusa os escritores canônicos: `registrar_encontro_grupo` (RPC) pra
// frequência e `aprovarPedidoCore` pra aprovação. Não existe segundo caminho.

/** Gate comum: devolve `{ ok }` ou responde 403/404 e devolve `{ ok:false }`. */
async function gateGrupoApp(req, res, gid) {
  const papel = await gruposPapelApp(req);
  const { adminGrupos, gruposGeridos, membro } = papel;
  if (!adminGrupos && !gruposGeridos.some(g => g.id === gid)) {
    res.status(403).json({ error: 'Você não gerencia este grupo' });
    return { ok: false };
  }
  const { data: grupo } = await supabase.from('mem_grupos')
    .select('id, nome, lider_id').eq('id', gid).is('deleted_at', null).maybeSingle();
  if (!grupo) {
    res.status(404).json({ error: 'Grupo não encontrado' });
    return { ok: false };
  }
  // `meuPapel` sai daqui pra quem precisa DISTINGUIR quem está agindo (hoje: o
  // nome que vai no registro do encontro). A AUTORIZAÇÃO continua a mesma —
  // líder e supervisor passam igual, como desde 05/08.
  return { ok: true, grupo, membro, adminGrupos, meuPapel: papelNoGrupoApp(papel, gid) };
}

// ⚠️⚠️ PUT /app/grupos/:grupoId — EDITAR GRUPO PELO APP (06/08/2026 · Onda 1b)
//
// O QUE ISTO CONSERTA: `grupo-editar.tsx` fazia UPDATE DIRETO em `mem_grupos`, e
// a RLS de UPDATE só aceita `lider_id = current_user_membro_id()` OU nível
// grupos >= 3 — **supervisor não passa**. Como o update do app não tinha
// `.select()` nem conferia linhas afetadas, 0 linhas voltavam SEM erro e a tela
// dizia "Grupo atualizado." Medido em 06/08: dos 13 supervisores, o único com
// conta no app supervisiona **8 grupos ativos e não é líder em 7** — são 7 saves
// que hoje mentem. (E `current_user_module_level` resolve `usuarios` pelo E-MAIL
// DO LOGIN: o e-mail com que ele entra no app não é o da conta de sistema, então
// o nível dele na RLS é 0.)
//
// ⚠️⚠️ POR QUE NÃO REUSAR O `PUT /api/grupos/:id` DO WEB: ele é update de OBJETO
// INTEIRO, não patch — escreve ~28 colunas e aplica DEFAULT no que não vem
// (`lider_id: d.lider_id || null`, `ativo: d.ativo ?? true`, `temporada: || null`,
// `aceitando_inscricoes: d.aceitando_inscricoes !== false`). Chamá-lo com os 9
// campos da tela do app **apagaria a liderança, a temporada e o estado de
// inscrição** do grupo. Daí endpoint próprio, com allowlist e semântica de PATCH.
//
// Autorização: o MESMO `gateGrupoApp` dos outros 7 endpoints de gerenciar grupo
// (líder OU supervisor OU admin de grupos) — a mesma régua que a TELA usa pra
// decidir se mostra o botão "Editar". Era essa divergência entre tela e RLS que
// produzia o save silencioso.
//
// ⚠️ A régua de campo vive em `utils/grupoEdicaoApp.js` (pura, no gate): lista
// FECHADA de categoria (é regra de negócio — trava de gênero e inscrição de
// casal), `horario` normalizado pra `HH:MM` (a coluna é `time` e a tela manda
// texto livre) e `dia_semana` aceitando **0 = domingo** (que é falsy).
router.put('/grupos/:grupoId', authApp, limiterNormal, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const gate = await gateGrupoApp(req, res, gid);
    if (!gate.ok) return undefined;

    const { erros, valores, mudouEndereco } = validarEdicaoGrupoApp(req.body || {});
    const campoComErro = Object.keys(erros)[0];
    if (campoComErro) {
      // Mesmo formato de erro do resto do app (appIdentidade): o cliente já sabe
      // exibir `error` e agora tem `campo` pra destacar.
      return res.status(400).json({ error: erros[campoComErro], campo: campoComErro, erros });
    }
    if (!Object.keys(valores).length) {
      return res.status(400).json({ error: 'Nada para atualizar.' });
    }

    // ⚠️ `.select()` + conferir a linha é o ponto do conserto: sem isso, 0 linhas
    // afetadas voltam como sucesso. E `updated_at` passa a ser carimbado (não há
    // trigger de updated_at em mem_grupos, e o PUT do web também não o seta —
    // então hoje editar grupo deixa a coluna velha).
    const { data: atualizado, error } = await supabase
      .from('mem_grupos')
      .update({ ...valores, updated_at: new Date().toISOString() })
      .eq('id', gid)
      .is('deleted_at', null)
      .select('id, nome, categoria, descricao, tema, dia_semana, horario, local, endereco, bairro')
      .maybeSingle();

    if (error) {
      console.error('[APP] grupos · editar:', error.message);
      return res.status(500).json({ error: 'Não foi possível salvar as alterações.' });
    }
    if (!atualizado) {
      // Chegou aqui = o gate passou mas a linha não foi escrita. Não existe
      // caminho conhecido pra isso (service_role ignora RLS), então é sinal de
      // corrida (o grupo foi apagado no meio) — e a pessoa tem que saber.
      console.error('[APP] grupos · editar: 0 linhas afetadas no grupo', gid);
      return res.status(409).json({ error: 'O grupo não está mais disponível para edição.' });
    }

    // ⚠️ ENDEREÇO MUDOU = O PINO DO MAPA FICOU VELHO. Nenhum save do sistema
    // re-geocodifica (nem o do web); quem faz isso é a ferramenta MANUAL
    // `/admin/grupos/geocode`. Geocodificar aqui seria chamar ViaCEP + Nominatim
    // (com 1,1s de espera por política) dentro do request — é como uma edição
    // vira timeout. Então avisamos a coordenação, que é o que evita o pino
    // apontando pra casa antiga sem ninguém saber.
    if (mudouEndereco) {
      notificar({
        modulo: 'grupos',
        tipo: 'grupo_endereco_mudou_app',
        titulo: `Endereço do grupo mudou — ${atualizado.nome}`,
        mensagem:
          `O endereço de "${atualizado.nome}" foi editado pelo app. O pino do mapa e o `
          + '"como chegar" continuam no lugar antigo até rodar a ferramenta de endereços.',
        link: '/admin/grupos/geocode',
        severidade: 'aviso',
        chaveDedup: `grupo_endereco_app_${gid}`,
      }).catch((e) => console.warn('[APP] grupos · editar · notificar endereço:', e.message));
    }

    return res.json({ ok: true, grupo: atualizado });
  } catch (e) {
    console.error('[APP] grupos · editar:', e.message);
    return res.status(500).json({ error: 'Não foi possível salvar as alterações.' });
  }
});

// ⚠️⚠️ CAPA DO GRUPO — O MESMO SAVE SILENCIOSO QUE A ONDA 1b CONSERTOU, NA MESMA
// TELA, QUE FICOU PRA TRÁS (07/08/2026 · fecho da Onda 2)
//
// MEDIDO EM PRODUÇÃO: `mem_grupos.foto_url` está preenchido em **0 de 278**
// linhas e o bucket `grupos` tem **0 objetos**. A capa nunca funcionou pra
// ninguém, nenhuma vez, desde que o bucket nasceu (04/06/2026).
//
// SÃO DOIS DEFEITOS EMPILHADOS:
//  1. `grupo-editar.tsx:112-116` gravava `foto_url` com UPDATE DIRETO em
//     `mem_grupos`, **sem `.select()`** — e a RLS `mem_grupos_update` só aceita
//     `lider_id = current_user_membro_id()` OU nível grupos >= 3. 0 linhas
//     voltavam SEM erro, a tela dizia "Capa atualizada." e ainda pintava a
//     imagem (a URL pública é real). Ao recarregar, a capa sumia. É PALAVRA POR
//     PALAVRA o estrago que o `salvar()` desta mesma tela já teve.
//  2. A policy de escrita do bucket exige `is_admin_or_diretor()` — função que
//     só existe em `Aplicativo-CBRio/supabase/storage_grupos.sql` e passa 16
//     dos 113 profiles. Só 14 dos 102 grupos ativos têm líder com conta no app;
//     liberar "o supervisor" no SQL resolveria 7 grupos e deixaria 88 de fora,
//     além de duplicar a régua de autorização num 2º lugar (a doença que o
//     `gateGrupoApp` existe pra curar).
//
// A PORTA É AQUI, com service_role, autorizada pelo MESMO gate que o resto do
// gerenciar-grupo (líder ∪ supervisor ∪ admin de grupos) — que é a mesma régua
// que a tela usa pra decidir se mostra o botão da câmera (`useAdminGrupo`).
//
// ⚠️ ORDEM DE ENTREGA: este endpoint chega na hora (servidor), a tela só depois
// de 2 aberturas (OTA). Revogar as policies do bucket ou dropar
// `is_admin_or_diretor()` ANTES do OTA chegar tira o pouco que hoje passaria
// sem pôr nada no lugar — mesma lição da migration 20260806120000.
const uploadCapa = multer({
  storage: multer.memoryStorage(),
  // ⚠️ 4MB e não os 5MB do precedente do totem: o corpo de request da função
  // serverless tem teto (ordem de 4,5MB) e estourá-lo vira 413 opaco, sem JSON.
  // Não dá pra redimensionar no cliente — `expo-image-manipulator` é módulo
  // NATIVO e não sai por OTA; o que segura o tamanho é o `quality` do picker.
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // A allowlist vive num lugar só (`utils/grupoCapaApp.js`), com teste.
    if (MIMES_CAPA.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Use uma imagem JPG, PNG ou WEBP.'));
  },
});

/** Traduz erro do multer em 400 JSON (senão pula o handler e vira 500 genérico). */
function uploadCapaMw(req, res, next) {
  uploadCapa.single('foto')(req, res, (err) => {
    if (!err) return next();
    const msg = err instanceof multer.MulterError
      ? (err.code === 'LIMIT_FILE_SIZE' ? 'Imagem muito grande (máximo 4MB).' : 'Falha no envio da imagem.')
      : (err.message || 'Formato de imagem não suportado.');
    return res.status(400).json({ error: msg });
  });
}

// POST /api/app/grupos/:grupoId/foto — multipart, campo `foto`
// ⚠️ `limiterStrict` (e não o normal): upload é caro e não é leitura de multidão.
// ⚠️ O multer roda ANTES do gate porque precisa consumir o corpo; quem não
// gerencia o grupo gasta a subida e leva 403 — mas o arquivo nunca chega ao
// Storage nem ao banco.
router.post('/grupos/:grupoId/foto', authApp, limiterStrict, uploadCapaMw, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const gate = await gateGrupoApp(req, res, gid);
    if (!gate.ok) return undefined;
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ error: 'Nenhuma imagem foi enviada.' });
    }

    // Lê a capa atual ANTES de trocar — é o que permite apagar o objeto velho.
    const { data: antes } = await supabase
      .from('mem_grupos').select('foto_url').eq('id', gid).maybeSingle();

    // ⚠️ Caminho ÚNICO por upload (e não `${gid}.jpg` fixo): o bucket é público
    // e o CDN serve o objeto com cache de 1h. Com caminho fixo, trocar a capa
    // não aparece pra ninguém por uma hora — foi por isso que a tela improvisou
    // um `?t=Date.now()` no cliente, que só engana o cache do próprio aparelho.
    // ⚠️ A extensão sai do MIME que o multer validou, nunca do nome do arquivo.
    const ext = extensaoDaCapa(req.file.mimetype);
    if (!ext) return res.status(400).json({ error: 'Use uma imagem JPG, PNG ou WEBP.' });
    const path = caminhoNovoDaCapa(gid, ext, Date.now());

    const { error: upErr } = await supabase.storage
      .from('grupos')
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (upErr) {
      console.error('[APP] grupos · capa · upload:', upErr.message);
      return res.status(500).json({ error: 'Não foi possível enviar a imagem.' });
    }

    const { data: urlData } = supabase.storage.from('grupos').getPublicUrl(path);
    const foto_url = urlData.publicUrl;

    // ⚠️ `.select()` + conferir a linha é o ponto do conserto (ver cabeçalho).
    const { data: atualizado, error } = await supabase
      .from('mem_grupos')
      .update({ foto_url, updated_at: new Date().toISOString() })
      .eq('id', gid)
      .is('deleted_at', null)
      .select('id, foto_url')
      .maybeSingle();

    if (error || !atualizado) {
      // Não deu pra gravar a coluna: o objeto recém-subido vira lixo. Apaga.
      await supabase.storage.from('grupos').remove([path]).catch(() => {});
      if (error) {
        console.error('[APP] grupos · capa · update:', error.message);
        return res.status(500).json({ error: 'Não foi possível salvar a capa.' });
      }
      console.error('[APP] grupos · capa: 0 linhas afetadas no grupo', gid);
      return res.status(409).json({ error: 'O grupo não está mais disponível para edição.' });
    }

    // Limpeza best-effort da capa anterior (só se for objeto DESTE bucket).
    const antigo = caminhoDaCapa(antes?.foto_url);
    if (antigo && antigo !== path) {
      supabase.storage.from('grupos').remove([antigo])
        .catch((e) => console.warn('[APP] grupos · capa · limpar antiga:', e.message));
    }

    return res.json({ ok: true, foto_url: atualizado.foto_url });
  } catch (e) {
    console.error('[APP] grupos · capa:', e.message);
    return res.status(500).json({ error: 'Não foi possível salvar a capa.' });
  }
});

// DELETE /api/app/grupos/:grupoId/foto — tirar a capa
// Sem isto, uma foto errada não tem desfazer: o app só sabe SUBSTITUIR, e quem
// escolheu a imagem errada ficaria com ela até alguém abrir o web.
router.delete('/grupos/:grupoId/foto', authApp, limiterNormal, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const gate = await gateGrupoApp(req, res, gid);
    if (!gate.ok) return undefined;

    const { data: antes } = await supabase
      .from('mem_grupos').select('foto_url').eq('id', gid).maybeSingle();

    const { data: atualizado, error } = await supabase
      .from('mem_grupos')
      .update({ foto_url: null, updated_at: new Date().toISOString() })
      .eq('id', gid)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[APP] grupos · capa · remover:', error.message);
      return res.status(500).json({ error: 'Não foi possível remover a capa.' });
    }
    if (!atualizado) {
      return res.status(409).json({ error: 'O grupo não está mais disponível para edição.' });
    }

    const antigo = caminhoDaCapa(antes?.foto_url);
    if (antigo) {
      supabase.storage.from('grupos').remove([antigo])
        .catch((e) => console.warn('[APP] grupos · capa · limpar:', e.message));
    }
    return res.json({ ok: true, foto_url: null });
  } catch (e) {
    console.error('[APP] grupos · capa · remover:', e.message);
    return res.status(500).json({ error: 'Não foi possível remover a capa.' });
  }
});

// ⚠️⚠️ FOTO DE PERFIL PELO APP — O ARQUIVO NUNCA CHEGAVA AO STORAGE (10/08/2026)
//
// Achado pelo Marcos no aparelho: *"quando tentei colocar minha foto de perfil
// no sistema ele não recebeu, não alterou."*
//
// ⚠️ E NÃO era o mesmo defeito da capa de grupo — eu apostei nisso e estava
// errado. Medido: **18 de 121 profiles TÊM `avatar_url`** e a RLS de UPDATE de
// `profiles` é permissiva, ou seja o caminho de GRAVAÇÃO funciona. O que falhou
// foi o UPLOAD: a pasta do Marcos **não existe** no bucket `avatars`.
//
// A causa é o mesmo padrão que a capa de grupo abandonou em 07/08: `perfil.tsx`
// fazia `fetch(asset.uri)` → `.arrayBuffer()` → `storage.upload()`. No Android a
// URI do `ImagePicker` é `content://…`, e ler os bytes por `fetch` é frágil ali
// (buffer vazio sobe arquivo de 0 byte; exceção só pinta texto vermelho).
//
// Este endpoint recebe MULTIPART, que é o formato que o RN monta nativamente a
// partir do `{uri, name, type}` — sem ler bytes no JS.
//
// ⚠️ Reusa `uploadCapaMw` e a régua `utils/grupoCapaApp.js` de propósito: mesmo
// teto de 4MB (o corpo de request serverless tem limite ~4,5MB), mesma allowlist
// de mime, e a MESMA função que decide a extensão pelo MIME e não pelo nome do
// arquivo. Um lugar só pra as duas fotos do app.
router.post('/membro/foto', authApp, limiterStrict, uploadCapaMw, async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ error: 'Nenhuma imagem foi enviada.' });
    }
    const ext = extensaoDaCapa(req.file.mimetype);
    if (!ext) return res.status(400).json({ error: 'Use uma imagem JPG, PNG ou WEBP.' });

    const uid = req.user.id;
    // ⚠️ Caminho ÚNICO por upload, dentro da pasta da PESSOA. O `avatars` é
    // público e o CDN guarda ~1h: caminho fixo faria a troca de foto não
    // aparecer por uma hora (a mesma armadilha da capa). A pasta por `uid` é o
    // que a policy do bucket já espera.
    const path = `${uid}/avatar-${Date.now()}.${ext}`;

    const { data: antes } = await supabase
      .from('profiles').select('avatar_url, membro_id').eq('id', uid).maybeSingle();

    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (upErr) {
      console.error('[APP] membro · foto · upload:', upErr.message);
      return res.status(500).json({ error: 'Não foi possível enviar a imagem.' });
    }

    const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
    const avatar_url = urlData.publicUrl;

    // ⚠️ `.select()` + conferir a linha: sem isso, 0 linhas afetadas voltam como
    // sucesso e a tela diz "foto atualizada" sem ter gravado — a lição que custou
    // duas vezes nesta semana (save do grupo e capa do grupo).
    const { data: atualizado, error } = await supabase
      .from('profiles')
      .update({ avatar_url, updated_at: new Date().toISOString() })
      .eq('id', uid)
      .select('id, avatar_url')
      .maybeSingle();

    if (error || !atualizado) {
      await supabase.storage.from('avatars').remove([path]).catch(() => {});
      if (error) {
        console.error('[APP] membro · foto · update:', error.message);
        return res.status(500).json({ error: 'Não foi possível salvar a foto.' });
      }
      console.error('[APP] membro · foto: 0 linhas afetadas no profile', uid);
      return res.status(409).json({ error: 'Não foi possível salvar a foto agora.' });
    }

    // ⚠️⚠️ PROPAGA PRA `mem_membros.foto_url` — sem isto a foto NUNCA aparece no
    // ERP (13/08/2026). O app grava em `profiles.avatar_url`; o sistema inteiro
    // (lista da Membresia, aba Pessoas do /grupos, roster do grupo, ficha) lê
    // `mem_membros.foto_url`. As duas colunas nunca se encontravam, então as
    // fotos que os membros já subiram pelo app ficavam invisíveis pra igreja.
    // É a LEI do Contrato de porta aplicada à foto: uma pessoa = um cadastro
    // (`mem_membros`) = a fonte que todos os módulos leem.
    //
    // ⚠️ SOBRESCREVE de propósito (não é só-onde-vazio como o censo): aqui é a
    // PRÓPRIA PESSOA escolhendo a foto dela agora, autenticada — é a fonte mais
    // forte que existe pra este campo, mais recente que a foto que a secretaria
    // tenha subido antes.
    //
    // ⚠️ Usa `profiles.membro_id` (vínculo EXPLÍCITO), nunca `resolveMembroApp`:
    // o fallback por e-mail dele existe porque família compartilha caixa, e ali
    // a foto do filho pousaria no cadastro da mãe. Sem vínculo, não propaga.
    //
    // ⚠️ CONSEQUÊNCIA DECLARADA: `mem_membros.foto_url` do LÍDER já é exibido no
    // cartão público de grupos (`publicGrupos` · lider_foto). Então a foto de
    // perfil de quem lidera grupo passa a aparecer na página pública de
    // inscrição. Não é canal novo (o formulário público de inscrição e o
    // cadastro de membresia já alimentam essa mesma coluna), mas é alcance que a
    // pessoa não escolheu explicitamente — se a liderança quiser separar as
    // duas fotos, o caminho é uma coluna própria pro cartão, não desligar isto.
    if (antes?.membro_id) {
      const { error: eFoto } = await supabase
        .from('mem_membros')
        .update({ foto_url: avatar_url })
        .eq('id', antes.membro_id)
        .is('deleted_at', null);
      // Best-effort: a foto JÁ está salva no profile e o app já pode mostrá-la.
      // Derrubar a resposta aqui faria a pessoa reenviar uma foto que deu certo.
      if (eFoto) console.error('[APP] membro · foto · propagar mem_membros:', eFoto.message);
    }

    // Limpeza best-effort da foto anterior.
    const marca = '/storage/v1/object/public/avatars/';
    const s = String(antes?.avatar_url || '');
    const i = s.indexOf(marca);
    if (i >= 0) {
      const antigo = s.slice(i + marca.length).split(/[?#]/)[0];
      // ⚠️ Só apaga DENTRO da própria pasta — impede que uma URL colada à mão
      // faça a limpeza remover o avatar de outra pessoa.
      if (antigo && antigo.startsWith(`${uid}/`) && antigo !== path) {
        supabase.storage.from('avatars').remove([antigo])
          .catch((e) => console.warn('[APP] membro · foto · limpar antiga:', e.message));
      }
    }

    return res.json({ ok: true, avatar_url: atualizado.avatar_url });
  } catch (e) {
    console.error('[APP] membro · foto:', e.message);
    return res.status(500).json({ error: 'Não foi possível salvar a foto.' });
  }
});

// ⚠️⚠️ DUAS COISAS DIFERENTES, e eu tinha confundido as duas (corrigido 05/08 por
// esclarecimento do Marcos):
//
//   · `mem_grupo_membros.funcao = 'lider'` é **CADASTRO**: registra que a pessoa
//     lidera junto. Pode haver vários, e nenhum deles recebe mensagem por isso.
//   · `mem_grupos.lider_id` é o **LÍDER PRINCIPAL**: é ELE que recebe o WhatsApp
//     do grupo (lei de 31/07 — um destinatário só) e **não pode se remover**.
//
// Palavras dele: "só o líder principal recebe mensagem e ele não pode remover a
// si mesmo; os outros seria apenas para sabermos no cadastro, mas não receberia
// mensagem nenhum". Então `lider` ENTRA na lista do app (é cadastro) e o que
// continua protegido é a PESSOA que é `lider_id`.
// ⚠️ `supervisor` e `coordenador` seguem fora: são papéis da hierarquia de
// supervisão (grupo_supervisao_*), não do roster do grupo.
// ⚠️ `co_lider` SAIU (Marcos · 25/08/2026: *"nós não usamos o termo co-líder,
// pode excluir esse termo"*). Quem tinha virou `lider_treinamento` na migration
// 20260825170000, e o CHECK `chk_grupo_membros_sem_colider` recusa o valor —
// então mandá-lo aqui de volta faria o UPDATE estourar 23514 e a tela dizer
// "erro ao mudar a função" sem explicar nada.
const FUNCOES_APP = ['frequentador', 'lider_treinamento', 'lider'];

// PUT /api/app/grupos/:grupoId/membros/:rowId/funcao — body { funcao }
router.put('/grupos/:grupoId/membros/:rowId/funcao', authApp, limiterNormal, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const g = await gateGrupoApp(req, res, gid);
    if (!g.ok) return;
    const funcao = String(req.body?.funcao || '').trim();
    if (!FUNCOES_APP.includes(funcao)) {
      return res.status(400).json({
        error: 'Função inválida. Pelo app dá pra marcar frequentador, líder em treinamento ou líder (cadastro) — supervisor e coordenador são da hierarquia de supervisão.',
      });
    }
    // A linha tem que ser DESTE grupo (id de outro grupo no corpo não faz nada).
    const { data: linha } = await supabase.from('mem_grupo_membros')
      .select('id, grupo_id, membro_id, funcao').eq('id', req.params.rowId)
      .eq('grupo_id', gid).is('saiu_em', null).is('deleted_at', null).maybeSingle();
    if (!linha) return res.status(404).json({ error: 'Participante não encontrado neste grupo' });
    // ⚠️ O LÍDER PRINCIPAL (`lider_id`) não muda de função pelo app: ele é quem
    // recebe o WhatsApp do grupo, e a régua de 31/07 exige que o destinatário
    // seja líder do roster — rebaixá-lo aqui deixaria o grupo com destinatário
    // que não é líder. Trocar quem é o principal é ato da coordenação.
    if (linha.membro_id && linha.membro_id === g.grupo.lider_id) {
      return res.status(400).json({
        error: 'Esta é a líder principal do grupo (é quem recebe os avisos no WhatsApp). Trocar o principal é com a coordenação.',
      });
    }
    const { error } = await supabase.from('mem_grupo_membros')
      .update({ funcao }).eq('id', linha.id);
    if (error) throw error;
    res.json({ ok: true, funcao });
  } catch (e) {
    console.error('[APP] grupos/funcao:', e.message);
    res.status(500).json({ error: 'Erro ao mudar a função' });
  }
});

// POST /api/app/grupos/:grupoId/membros/:rowId/sair — body { motivo }
// Saída = soft (`saiu_em` + `motivo_saida`). A pessoa continua no sistema e pode
// voltar — é a mesma semântica do "confira a lista" (lei de 31/07).
router.post('/grupos/:grupoId/membros/:rowId/sair', authApp, limiterNormal, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const g = await gateGrupoApp(req, res, gid);
    if (!g.ok) return;
    const { data: linha } = await supabase.from('mem_grupo_membros')
      .select('id, membro_id').eq('id', req.params.rowId)
      .eq('grupo_id', gid).is('saiu_em', null).is('deleted_at', null).maybeSingle();
    if (!linha) return res.status(404).json({ error: 'Participante não encontrado neste grupo' });
    // ⚠️ "ele não pode remover a si mesmo" (Marcos · 05/08): o líder PRINCIPAL não
    // sai do grupo pelo app — sem ele o grupo fica sem destinatário de aviso.
    if (linha.membro_id && linha.membro_id === g.grupo.lider_id) {
      return res.status(400).json({ error: 'A líder principal não pode sair do grupo pelo app — fale com a coordenação.' });
    }
    const motivo = String(req.body?.motivo || '').trim().slice(0, 300) || 'Saída registrada pelo líder no app';
    const { error } = await supabase.from('mem_grupo_membros')
      .update({ saiu_em: new Date().toISOString().slice(0, 10), motivo_saida: motivo })
      .eq('id', linha.id).is('saiu_em', null); // guarda de corrida
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[APP] grupos/sair:', e.message);
    res.status(500).json({ error: 'Erro ao registrar a saída' });
  }
});

// POST /api/app/meu-grupo/:grupoId/sair — a PRÓPRIA pessoa sai do grupo.
//
// Pedido da Naná (18/08): nos grupos que ela frequenta, ao lado de "falar com o
// líder" e "como chegar", poder SAIR, com confirmação.
//
// ⚠️ NÃO é o endpoint acima. Aquele é o LÍDER registrando a saída de um
// participante e passa pelo `gateGrupoApp`; este é a pessoa saindo de si mesma
// e não exige gestão nenhuma. Reusar aquele exigiria dar ao participante um
// gate de líder — trocaria uma porta por um buraco.
//
// Saída é SOFT (`saiu_em` + `motivo_saida`), como manda a lei de 31/07: a
// pessoa continua no sistema e pode voltar a se inscrever.
router.post('/meu-grupo/:grupoId/sair', authApp, limiterStrict, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(404).json({ error: 'Não encontrei seu cadastro.' });

    const { data: grupo } = await supabase.from('mem_grupos')
      .select('id, nome, lider_id').eq('id', gid).is('deleted_at', null).maybeSingle();
    if (!grupo) return res.status(404).json({ error: 'Grupo não encontrado.' });

    // ⚠️ A LÍDER PRINCIPAL não sai sozinha: sem ela o grupo fica sem
    // destinatário dos avisos de WhatsApp (lei de 31/07 — um destinatário só,
    // e tem que ser líder do roster).
    if (grupo.lider_id && grupo.lider_id === membro.id) {
      return res.status(409).json({
        error: 'Você lidera este grupo — a saída precisa passar pela coordenação, para o grupo não ficar sem líder.',
        codigo: 'e_lider',
      });
    }

    const { data: vinculos, error: eV } = await supabase.from('mem_grupo_membros')
      .select('id, funcao').eq('grupo_id', gid).eq('membro_id', membro.id)
      .is('saiu_em', null).is('deleted_at', null);
    if (eV) throw eV;
    if (!vinculos || !vinculos.length) {
      return res.status(409).json({ error: 'Você já não faz parte deste grupo.', codigo: 'nao_participa' });
    }

    // ⚠️ LÍDER EM TREINAMENTO também não sai por aqui, e o motivo mudou de
    // lugar em 25/08/2026: ele passou a GERENCIAR o grupo (`gruposPapelApp`),
    // então sair por este botão o deixaria com gestão de um grupo em que não
    // está — e o gate lê o vínculo vivo. Trocar liderança é ato de gestão
    // (mesma régua do "confira a lista", 31/07).
    if (vinculos.some(v => ['lider', 'lider_treinamento'].includes(String(v.funcao)))) {
      return res.status(409).json({
        error: 'Você é da liderança deste grupo — fale com a coordenação para registrar a saída.',
        codigo: 'e_lideranca',
      });
    }

    const motivo = String(req.body?.motivo || '').trim().slice(0, 300) || 'Saiu pelo app';
    const { data: saiu, error } = await supabase.from('mem_grupo_membros')
      .update({ saiu_em: new Date().toISOString().slice(0, 10), motivo_saida: motivo })
      .in('id', vinculos.map(v => v.id))
      .is('saiu_em', null) // guarda de corrida: dois toques não contam duas vezes
      .select('id');
    if (error) throw error;
    if (!saiu || !saiu.length) {
      return res.status(409).json({ error: 'Você já não faz parte deste grupo.', codigo: 'nao_participa' });
    }

    // ⚠️ AVISA O LÍDER, não o grupo. Quem precisa saber que alguém saiu é quem
    // conduz — e é ele que decide se procura a pessoa. Disparar pro roster
    // seria expor a saída de alguém para todo mundo.
    // ⚠️ Best-effort: a saída já está registrada; falha de aviso não pode
    // desfazê-la nem virar erro na tela de quem saiu.
    (async () => {
      // ⚠️ Serviço ÚNICO, não notificação montada aqui: são cinco origens de
      // aviso de grupo e cinco cópias foi a doença que este módulo já teve.
      try {
        const { avisarSaidaNoApp } = require('../services/gruposAvisoApp');
        await avisarSaidaNoApp({
          grupoId: gid, grupoNome: grupo.nome, pessoaNome: membro.nome,
          dia: new Date().toISOString().slice(0, 10),
        });
      } catch (err) { console.warn('[APP] aviso de saida (app):', err.message); }
      try {
        await notificar({
          modulo: 'grupos',
          tipo: 'grupo_saida',
          titulo: `Saída de grupo: ${grupo.nome}`,
          mensagem: `${membro.nome || 'Uma pessoa'} saiu de ${grupo.nome} pelo app.`,
          link: '/grupos',
          severidade: 'info',
          chaveDedup: `grupo_saida_${gid}_${membro.id}`,
        });
      } catch (err) { console.warn('[APP] aviso de saida:', err.message); }
    })();

    res.json({ ok: true, saiu: saiu.length });
  } catch (e) {
    console.error('[APP] meu-grupo/sair:', e.message);
    res.status(500).json({ error: 'Erro ao registrar a saída' });
  }
});

// ============================================================================
// POST /api/app/grupos/:grupoId/pessoas — O LÍDER CADASTRA E A PESSOA JÁ NASCE
// DENTRO DO GRUPO (Marcos · 25/08/2026)
//
// ⚠️ CASCA FINA de propósito: a régua vive em `services/grupoPessoaDireta` e é a
// MESMA que o ERP usa em `POST /grupos/:id/pessoas` — o pedido dele terminou com
// *"alinhe todas essas mudanças com o sistema web"*, e alinhar significa uma
// régua só, não duas telas parecidas. O porquê de cada decisão (não passar por
// pedido, identidade pelo matcher, consentimento de terceiro, mínimo de campos)
// está no cabeçalho do serviço.
//
// ⚠️ NÃO checa categoria × sexo do grupo, de propósito. A trava de
// `utils/entradaGrupoApp` existe pra impedir que um DESCONHECIDO se inscreva
// sozinho no grupo errado; aqui quem preenche está com a pessoa na frente. E ela
// bloquearia caso real: o "NEW HEART - RECOMEÇO 40+" está cadastrado como
// `categoria='Homens'` com 4 mulheres no roster (cadastro do GRUPO errado,
// medido em 10/08) — enforcement ali impediria o líder de usar a tela.
// ============================================================================
router.post('/grupos/:grupoId/pessoas', authApp, limiterStrict, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const g = await gateGrupoApp(req, res, gid);
    if (!g.ok) return;

    const r = await cadastrarPessoaNoGrupo({
      grupo: g.grupo,
      dados: req.body || {},
      autor: { id: req.user?.id || null, nome: g.membro?.nome || req.user?.email || 'Líder (app)' },
      origem: 'grupos_app_lider',
      ip: req.ip || null,
      userAgent: req.get?.('user-agent') || null,
    });
    if (!r.ok) return res.status(r.http || 400).json({ error: r.error, campo: r.campo });

    // ⚠️ NENHUM WhatsApp — nem pra pessoa, nem pro líder (pedido explícito:
    // *"não passa por whatsapp e confirmação nenhuma"*). A coordenação é avisada
    // porque é ela que cuida do cadastro e da qualidade dos dados; o aviso vai
    // pelas regras do módulo `grupos`, nunca por lista de nomes no código.
    if (!r.ja_no_grupo) {
      notificar({
        modulo: 'grupos',
        tipo: 'novo_membro_grupo',
        titulo: `Nova pessoa no grupo ${g.grupo.nome}`,
        mensagem: `${r.nome} foi cadastrada pelo líder no app e já entrou em "${g.grupo.nome}".`
          + (r.sem_cpf ? ' Cadastro sem CPF — aparece na fila de "faltam dados".' : ''),
        link: '/grupos',
        severidade: 'info',
        chaveDedup: `novo_membro_${gid}_${r.membro_id}`,
      }).catch(e => console.warn('[APP] pessoas · notificar:', e.message));
    }

    const { ok, http, ...corpo } = r;
    res.status(http || 201).json({ ok: true, ...corpo });
  } catch (e) {
    console.error('[APP] grupos/pessoas:', e.message);
    res.status(500).json({ error: 'Erro ao cadastrar a pessoa' });
  }
});

// POST /api/app/grupos/:grupoId/membros/:rowId/transferir — body { motivo? }
//
// ⚠️⚠️ O LÍDER NÃO ESCOLHE O DESTINO (Marcos · 25/08/2026): *"sobre a opção de
// transferência eu quero que o líder de grupo não escolha para onde ele está
// transferindo, eu quero que ele aperte e solicite transferência, isso vai para
// caixa de entradas como pendente para Naná gerenciar."*
//
// O que MORREU aqui: o líder escolhia um grupo entre os que ELE gerencia e o
// sistema criava um pedido lá. Duas coisas erradas nisso — o destino certo
// raramente é outro grupo do mesmo líder (é o que estivesse mais perto da
// pessoa, na categoria dela), e a decisão de realocar gente é da coordenação,
// que enxerga a malha inteira. Medido: **zero uso histórico** (nenhuma linha de
// `mem_grupo_pedidos` com observação de transferência, desde sempre), então não
// há dado velho a migrar nem hábito a quebrar.
//
// ⚠️ A linha nasce em `mem_grupo_transferencias` (migration 20260825170000), NÃO
// em `mem_grupo_pedidos`: pedido é "quero entrar NESTE grupo" e exige
// `grupo_id`. Ver o comentário da migration pro porquê inteiro.
//
// ⚠️ A SAÍDA do grupo atual continua sendo um passo separado — o líder decide
// quando (e a coordenação pode resolver a transferência antes disso). Tirar a
// pessoa aqui a deixaria sem grupo nenhum enquanto a triagem não resolvesse.
router.post('/grupos/:grupoId/membros/:rowId/transferir', authApp, limiterNormal, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const g = await gateGrupoApp(req, res, gid);
    if (!g.ok) return;

    const { data: linha } = await supabase.from('mem_grupo_membros')
      .select('id, membro_id').eq('id', req.params.rowId)
      .eq('grupo_id', gid).is('saiu_em', null).is('deleted_at', null).maybeSingle();
    if (!linha?.membro_id) return res.status(404).json({ error: 'Participante não encontrado neste grupo' });

    // ⚠️ O líder PRINCIPAL não é transferido pelo app: sem ele o grupo fica sem
    // destinatário dos avisos de WhatsApp (lei de 31/07). Mesma proteção que a
    // mudança de função e a saída já têm.
    if (linha.membro_id === g.grupo.lider_id) {
      return res.status(400).json({
        error: 'Esta é a líder principal do grupo — mover a liderança é com a coordenação.',
      });
    }

    const { data: pessoa } = await supabase.from('mem_membros')
      .select('nome').eq('id', linha.membro_id).is('deleted_at', null).maybeSingle();
    const motivo = String(req.body?.motivo || '').trim().slice(0, 500) || null;

    // ⚠️ Já existe pedido pendente desta pessoa neste grupo? Devolve o MESMO,
    // sem criar outro. O índice `uniq_grupo_transf_pendente` garante isso no
    // banco; conferir antes é o que transforma o 23505 numa resposta amigável
    // em vez de um 500 ("o líder tocou duas vezes" é o caso normal).
    const { data: jaPediu } = await supabase.from('mem_grupo_transferencias')
      .select('id, created_at').eq('membro_id', linha.membro_id)
      .eq('grupo_origem_id', gid).eq('status', 'pendente').limit(1).maybeSingle();
    if (jaPediu) {
      return res.json({ ok: true, ja_pedido: true, transferencia_id: jaPediu.id });
    }

    const { data: novo, error } = await supabase.from('mem_grupo_transferencias').insert({
      membro_id: linha.membro_id,
      grupo_origem_id: gid,
      vinculo_id: linha.id,
      motivo,
      status: 'pendente',
      pedido_por: req.user?.id || null,
      // Snapshot de nome: em 86 dos 102 grupos ativos o líder não tem conta no
      // ERP, então resolver o nome depois pelo `pedido_por` não funcionaria.
      pedido_por_nome: g.membro?.nome || req.user?.email || 'Líder (app)',
      origem: 'app',
    }).select('id').single();
    if (error) {
      // Corrida com outra aba/toque: o índice parcial pegou. Não é erro pro
      // líder — o pedido dele está registrado.
      if (error.code === '23505') return res.json({ ok: true, ja_pedido: true });
      throw error;
    }

    // ⚠️⚠️ Quem precisa saber é a COORDENAÇÃO, e não o dono de nenhum grupo: é
    // ela que vai ESCOLHER o destino, e destino é justamente o que este pedido
    // não tem. Por isso aqui o `targetIds` não sai de `donosDoGrupo` (como em
    // todo outro aviso de grupo) e sim de `resolverDestinatarios('grupos')` — as
    // regras do módulo em `notificacao_regras`, nunca uma lista de nomes no
    // código (a lei do projeto: o dono do fluxo muda sem PR).
    //
    // ⚠️ Lista VAZIA (nenhuma regra configurada) omite `targetIds` de propósito,
    // pra cair no fallback de admin/diretor: transferência é rara e o custo de
    // avisar gente demais é bem menor que o de um pedido de líder ficar parado
    // sem ninguém saber que existe. Mandar `targetIds: []` seria SILÊNCIO.
    (async () => {
      const coordenacao = await resolverDestinatarios('grupos').catch(() => []);
      await notificar({
        modulo: 'grupos',
        tipo: 'grupo_transferencia_pedida',
        titulo: 'Transferência pedida por um líder',
        mensagem: `${pessoa?.nome || 'Alguém'} do grupo "${g.grupo.nome}" precisa ser transferida. `
          + `${motivo ? `Motivo: ${motivo}. ` : ''}O pedido está na Caixa de entrada, aguardando a coordenação escolher o grupo.`,
        link: '/grupos?tab=entrada',
        severidade: 'aviso',
        chaveDedup: `grupo_transf_${novo?.id}`,
        ...(coordenacao.length ? { targetIds: coordenacao } : {}),
      });
    })().catch(e => console.warn('[APP] transferir · notificar:', e.message));

    res.status(201).json({ ok: true, transferencia_id: novo?.id || null });
  } catch (e) {
    console.error('[APP] grupos/transferir:', e.message);
    res.status(500).json({ error: 'Erro ao pedir a transferência' });
  }
});

// GET /api/app/grupos/:grupoId/encontros — o histórico de frequência **com os
// encontros que ficaram SEM CHAMADA à vista**.
//
// ⚠️⚠️ Pedido do Marcos (25/08/2026), a partir de um defeito que ele viu no
// app: *"quando eu não preencho uma semana e preencho a outra ele dá meio que
// um bug — ele provavelmente ficou em dúvida se eu estava registrando a
// presença do dia 18, aí ele marcou que o encontro foi dia 24. Acho que vale a
// pena sempre manter os encontros à vista: se a pessoa passar 1 semana e não
// registrar, ele entra automaticamente como presença não registrada e pode ser
// registrada posteriormente se o líder quiser."*
//
// ⚠️⚠️ A CAUSA não era ambiguidade do servidor: o `POST` de encontro sempre
// aceitou `data` e caía em `hojeBRT()` quando ela não vinha — **e a tela nunca
// mandava data nenhuma**. Registrar no dia 24 a chamada do dia 18 gravava um
// encontro no dia 24, corretamente do ponto de vista de quem só recebeu
// "presentes". O conserto é DOS DOIS LADOS: aqui nasce a lista de datas
// possíveis (com o que falta), e o app passa a mandar a data escolhida.
//
// ⚠️ `encontros` (o histórico cru) CONTINUA na resposta, sem mudança: o binário
// que está no celular hoje lê essa chave, e o OTA leva 2 aberturas pra aplicar.
// A `ocorrencias` é aditiva.
router.get('/grupos/:grupoId/encontros', authApp, limiterNormal, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const g = await gateGrupoApp(req, res, gid);
    if (!g.ok) return;
    const { data: encontros, error } = await supabase.from('mem_grupo_encontros')
      .select('id, data, tema, observacoes, registrado_por_nome, created_at')
      .eq('grupo_id', gid).is('deleted_at', null)
      .order('data', { ascending: false }).limit(24);
    if (error) throw error;
    const ids = (encontros || []).map(e => e.id);
    const presentes = {};
    if (ids.length) {
      const { data: pres } = await supabase.from('mem_grupo_encontro_presencas')
        .select('encontro_id, presente').in('encontro_id', ids);
      (pres || []).forEach(p => { if (p.presente) presentes[p.encontro_id] = (presentes[p.encontro_id] || 0) + 1; });
    }
    const lista = (encontros || []).map(e => ({ ...e, presentes: presentes[e.id] || 0 }));

    // ── A timeline: cada ocorrência que já passou, registrada ou não ─────────
    // ⚠️ TODO este bloco é best-effort e ISOLADO: a aba de Encontros existe
    // hoje e não pode sumir porque a agenda falhou (lição do `parcelas_max`).
    // Sem `ocorrencias`, o app cai na lista crua — o comportamento de antes.
    let ocorrencias = null;
    let ocorrenciasAviso = null;
    try {
      const { data: grupo, error: eG } = await supabase.from('mem_grupos')
        .select('dia_semana, horario, recorrencia').eq('id', gid).maybeSingle();
      if (eG) throw eG;
      // ⚠️ Janela de 180 dias na leitura das exceções: `ocorrenciasPassadas`
      // devolve no máximo 12 ocorrências, e mesmo num grupo mensal isso são
      // ~48 semanas — buscar a tabela inteira só cresceria com o tempo.
      const desdeExcecoes = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
      const { data: exc, error: eE } = await supabase.from('mem_grupo_agenda_excecoes')
        .select('data_original, status, nova_data, novo_horario, motivo')
        .eq('grupo_id', gid).gte('data_original', desdeExcecoes);
      if (eE) throw eE;
      const [ancoras, inicios] = await Promise.all([
        ancorasDeGrupos([gid]),
        // ⚠️ O INÍCIO é o que permite listar o histórico de grupo quinzenal/
        // mensal que nunca registrou encontro — 34 dos 35 não-semanais ativos,
        // medido em 25/08. Sem ele a aba deles fica permanentemente vazia, e sem
        // lista não há o que corrigir (o pedido do Marcos).
        iniciosDeGrupos([gid]),
      ]);
      const porData = new Map(lista.map(e => [String(e.data).slice(0, 10), e]));
      const brutas = ocorrenciasPassadas({
        diaSemana: grupo?.dia_semana, horario: grupo?.horario,
        recorrencia: grupo?.recorrencia, ancoraISO: ancoras[gid] || null,
        inicioISO: inicios[gid] || null,
        // ⚠️⚠️ PISO no início da temporada. Sem ele a lista atravessa pra trás
        // além do começo do grupo: medido em 25/08 no grupo 00000068 (temporada
        // aberta em 01/08), a timeline mostrava 22/06 e 06/07 como "presença não
        // registrada" — pendência de encontro que aquele grupo não tinha por que
        // ter feito. Cobrar chamada de antes do grupo existir é a versão nova do
        // erro que a régua de âncora existia pra evitar.
        // ⚠️ Encontro REGISTRADO fora do piso NÃO se perde: ele volta pela lista
        // de avulsos logo abaixo.
        desdeISO: inicios[gid] || null,
        excecoes: exc || [], registradas: [...porData.keys()], quantas: 12,
      });
      // ⚠️⚠️ A JANELA DE CORREÇÃO É DECIDIDA AQUI, no servidor, e vai pronta pra
      // tela (mesma lei da remarcação futura · 18/08): o app NÃO recalcula. Duas
      // contas pra "que datas posso escolher" apareceriam como "o calendário
      // deixou e o servidor recusou".
      // ⚠️ Os vizinhos saem da PRÓPRIA lista (`data_original` ordenada desc),
      // então a janela reflete a cadência real do grupo, não uma suposição.
      ocorrencias = brutas.map((o, i) => {
        const enc = porData.get(o.data) || null;
        const janela = janelaCorrecaoPassada({
          dataOriginal: o.data_original,
          // A lista vem do mais RECENTE pro mais antigo: o índice seguinte é a
          // ocorrência ANTERIOR no tempo, e o anterior é a SEGUINTE.
          anteriorISO: brutas[i + 1]?.data || null,
          proximaISO: brutas[i - 1]?.data || null,
          hojeISO: hojeBRT(),
          // ⚠⚠ Dia que JÁ TEM chamada sai da janela: `mem_grupo_encontros` tem
          // UNIQUE (grupo_id, data), então escolher um deles levantaria 23505 e o
          // líder só descobriria DEPOIS de salvar. É de graça — `porData` já foi
          // carregado aqui em cima.
          // ⚠ A data DESTA ocorrência não entra: a chamada dela não pode bloquear
          // a própria linha (mover pra onde já está é no-op, não colisão).
          ocupadas: [...porData.keys()].filter(d => d !== o.data),
        });
        return {
          ...o,
          encontro_id: enc?.id || null,
          presentes: enc ? enc.presentes : null,
          tema: enc?.tema || null,
          observacoes: enc?.observacoes || null,
          registrado_por_nome: enc?.registrado_por_nome || null,
          pode_corrigir: !!janela?.pode,
          corrigir_de: janela?.de || null,
          corrigir_ate: janela?.ate || null,
          // A tela apaga estes dias do calendário; o servidor recusa de novo,
          // como cinto de segurança.
          corrigir_bloqueadas: janela?.bloqueadas || [],
        };
      });
      // ⚠️ Encontro REGISTRADO que não cai em ocorrência nenhuma (chamada feita
      // num dia fora da recorrência — inclusive as gravadas com a data errada
      // ANTES deste conserto) entra como avulso. Sumir com ele faria a chamada
      // que a pessoa fez desaparecer da tela, que é pior que o defeito original.
      const naTimeline = new Set(ocorrencias.map(o => o.data));
      for (const e of lista) {
        const d = String(e.data).slice(0, 10);
        if (naTimeline.has(d)) continue;
        ocorrencias.push({
          data_original: d, data: d, horario: null, status: 'registrado',
          motivo: null, dia_semana: null, registrado: true, avulso: true,
          encontro_id: e.id, presentes: e.presentes, tema: e.tema,
          observacoes: e.observacoes, registrado_por_nome: e.registrado_por_nome,
        });
      }
      ocorrencias.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
    } catch (e) {
      console.warn('[APP] encontros · timeline indisponível:', e.message);
      ocorrencias = null;
      ocorrenciasAviso = 'Não deu pra montar a agenda dos encontros agora.';
    }

    res.json({ encontros: lista, ocorrencias, ocorrencias_aviso: ocorrenciasAviso });
  } catch (e) {
    console.error('[APP] grupos/encontros:', e.message);
    res.status(500).json({ error: 'Erro ao carregar os encontros' });
  }
});

// GET /api/app/grupos/:grupoId/encontros/:encontroId — o encontro ABERTO:
// quem esteve presente (com NOME), o comentário de quem registrou e o tema.
//
// ⚠️ Pedido do Marcos (07/08): *"faz um quadradinho clicável do encontro; aí
// quando eu clico, vejo os comentários e a presença em um lugar só"*. A LISTA
// não traz nomes de propósito — seriam 24 encontros × N pessoas a cada abertura
// de tela; aqui é sob demanda, um encontro por vez.
//
// ⚠️ Só nomes de quem ESTEVE: a RPC `registrar_encontro_grupo` não cria linha
// pra ausente, então a tela não pode listar faltosos — deduzi-los do roster
// ATUAL afirmaria ausência de gente que talvez nem estivesse no grupo naquele
// dia (o roster muda). O que não se sabe, não se afirma.
router.get('/grupos/:grupoId/encontros/:encontroId', authApp, limiterNormal, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const g = await gateGrupoApp(req, res, gid);
    if (!g.ok) return;

    const { data: enc } = await supabase.from('mem_grupo_encontros')
      .select('id, data, tema, observacoes, registrado_por_nome, created_at')
      .eq('id', req.params.encontroId).eq('grupo_id', gid).is('deleted_at', null)
      .maybeSingle();
    if (!enc) return res.status(404).json({ error: 'Encontro não encontrado' });

    const { data: pres } = await supabase.from('mem_grupo_encontro_presencas')
      .select('membro_id, presente, membro:mem_membros(id, nome)')
      .eq('encontro_id', enc.id);

    const presentes = (pres || [])
      .filter(p => p.presente)
      .map(p => {
        const m = Array.isArray(p.membro) ? p.membro[0] : p.membro;
        return { membro_id: p.membro_id, nome: m?.nome || '—' };
      })
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome)));

    res.json({ encontro: { ...enc, presentes } });
  } catch (e) {
    console.error('[APP] grupos/encontros detalhe:', e.message);
    res.status(500).json({ error: 'Erro ao carregar o encontro' });
  }
});

// POST /api/app/grupos/:grupoId/encontros — registra a frequência do encontro
// body { data, tema?, observacoes?, presentes: [membro_id] }
// ⚠️ Usa a RPC `registrar_encontro_grupo` — o MESMO escritor do web e do fluxo do
// WhatsApp (ela cria o encontro, grava as presenças e incrementa o contador de
// cada participante). Inserir na mão aqui criaria uma segunda régua de presença.
router.post('/grupos/:grupoId/encontros', authApp, limiterNormal, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const g = await gateGrupoApp(req, res, gid);
    if (!g.ok) return;
    const hoje = hojeBRT();
    const data = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.data || '')) ? req.body.data : hoje;
    if (data > hoje) return res.status(400).json({ error: 'Não dá pra registrar encontro no futuro.' });

    // Só quem está no roster ATIVO conta como presente (id vindo do app não
    // pode inserir presença de gente de outro grupo).
    const { data: roster } = await supabase.from('mem_grupo_membros')
      .select('membro_id').eq('grupo_id', gid).is('saiu_em', null).is('deleted_at', null);
    const validos = new Set((roster || []).map(r => r.membro_id).filter(Boolean));
    const presentes = (Array.isArray(req.body?.presentes) ? req.body.presentes : [])
      .filter(id => validos.has(id));

    const { data: encontroId, error } = await supabase.rpc('registrar_encontro_grupo', {
      p_grupo_id: gid,
      p_data: data,
      p_tema: req.body?.tema ? String(req.body.tema).trim().slice(0, 200) : null,
      p_observacoes: req.body?.observacoes ? String(req.body.observacoes).trim().slice(0, 2000) : null,
      p_registrado_por: req.user?.id || null,
      // ⚠️ MARCA O SUPERVISOR NO NOME (07/08). O card "Grupos sem relatório de
      // encontro" do /grupos conta QUALQUER `mem_grupo_encontros` e o texto dele
      // afirma que o relato veio do líder ("chamada feita no sistema ou relato
      // do líder pelo bot"). Com o supervisor registrando, o card passaria a
      // dizer que o líder reportou quando não reportou — e a coordenação
      // deixaria de cobrar quem precisa ser cobrado. O campo já existe e já é
      // exibido; marcar aqui é o conserto mais barato e honesto.
      p_registrado_por_nome: g.meuPapel === 'supervisor'
        ? `${g.membro?.nome || req.user?.email || 'Supervisor'} (supervisor)`
        : (g.membro?.nome || req.user?.email || 'Líder (app)'),
      p_membros_presentes: presentes,
    });
    if (error) throw error;

    // ⚠️ Só quem responde pelo grupo, MENOS quem acabou de registrar — avisar a
    // pessoa da ação que ela mesma fez é ruído puro. Na prática: o líder
    // registra e o supervisor fica sabendo (e vice-versa). Ia pro fan-out do
    // módulo, ou seja ~16 pessoas que não têm nada a ver com este grupo.
    donosDoGrupo(g.grupo.id).then((donos) => {
      const alvos = donos.filter((id) => id !== req.user?.id);
      if (!alvos.length) return;
      return notificar({
        modulo: 'grupos',
        tipo: 'grupo_encontro_registrado',
        titulo: 'Encontro registrado pelo app',
        mensagem: `${g.grupo.nome}: ${presentes.length} presente(s) em ${data.split('-').reverse().join('/')}${req.body?.observacoes ? ' · com comentário do líder' : ''}.`,
        link: '/grupos',
        chaveDedup: `grupo_enc_${encontroId}`,
        targetIds: alvos,
      });
    }).catch(e => console.warn('[APP] encontro · notificar:', e.message));

    res.status(201).json({ ok: true, encontro_id: encontroId, presentes: presentes.length });
  } catch (e) {
    // ⚠️⚠️ `mem_grupo_encontros` tem UNIQUE (grupo_id, data) e a RPC faz INSERT
    // puro — a 2ª chamada no mesmo dia levanta 23505. O web já devolvia 409
    // ("Já existe encontro registrado nessa data"); AQUI virava **500 genérico**
    // e a pessoa lia "erro no sistema".
    //
    // Com a tela do supervisor isso deixa de ser exceção e vira o caso NORMAL:
    // líder e supervisor registram o MESMO dia do MESMO grupo. A frequência é
    // uma só (é do grupo) — quem chegar depois precisa saber disso, não levar
    // erro.
    // ⚠️ A UNIQUE **não é parcial**, então encontro soft-deletado continua
    // ocupando a data: a tela pode mostrar "nenhum encontro" e o POST recusar.
    // A mensagem diz o que houve em vez de culpar a rede.
    if (e?.code === '23505') {
      return res.status(409).json({
        error: 'Já existe frequência registrada para este grupo nesta data.',
        codigo: 'encontro_duplicado',
      });
    }
    console.error('[APP] grupos/encontros POST:', e.message);
    res.status(500).json({ error: 'Erro ao registrar a frequência' });
  }
});

// ── Grupos · VISITA DE SUPERVISÃO (07/08/2026) ──────────────────────────────
// Pedido do Marcos: o supervisor ganha uma tela enxuta onde registra a
// frequência do grupo e um comentário sobre a visita, e "a plataforma entende
// que quando supervisor preenche a frequência é porque fez uma visita e conta
// isso" — com o interruptor **"estive presente no encontro"** que ele aprovou,
// pra o indicador não passar a medir "digitou" em vez de "foi lá".
//
// ⚠️⚠️ O INTERRUPTOR SÓ FUNCIONA PORQUE `presente:false` **NÃO GRAVA LINHA**.
// Medido em 07/08: o KPI real (`_kpi_agregar_dado`, ramo `lideres_acompanhados`)
// conta `DISTINCT lider_id` das visitas do período e **NÃO filtra `status`** —
// 'agendada' e 'cancelada' contam igual a 'realizada'. Ou seja, gravar a linha
// com outro status faria o interruptor ser puro enfeite. Não gravar é o que dá
// efeito real a ele, sem depender de migration.
// (O filtro de `status` ausente no KPI é bug PRÉ-EXISTENTE e está reportado —
// não foi criado aqui, e este endpoint não depende dele.)
//
// ⚠️ NÃO reusa `POST /api/grupos/:id/visitas` do web, e não é preguiça: aquela
// rota passa por `authenticate`, que **auto-provisiona linha em `usuarios`** com
// cargo 'membro' pra todo token sem uma (auth.js) — cada supervisor do app
// viraria usuário do ERP no módulo Permissões — e resolve o membro por e-mail
// EXATO (`getMeuPerfilGrupo`), régua diferente do `resolveMembroApp` do app.
// O que se reusa é o FORMATO da linha, pra a visita do app aparecer igual na
// aba Visitas do /grupos.
//
// ⚠️ Grava `responsavel_id` (profile) E `supervisor_id` (mem_membros) porque o
// nome exibido no histórico do web sai de `profiles.name[responsavel_id] ||
// mem_membros.nome[supervisor_id]` — sem os dois, a visita aparece SEM NOME.
router.post('/grupos/:grupoId/visitas', authApp, limiterNormal, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const g = await gateGrupoApp(req, res, gid);
    if (!g.ok) return;

    const hoje = hojeBRT();
    const data = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.data_visita || ''))
      ? req.body.data_visita : hoje;
    if (data > hoje) return res.status(400).json({ error: 'Não dá pra registrar visita no futuro.' });

    const observacao = req.body?.observacao ? String(req.body.observacao).trim().slice(0, 2000) : null;

    // ⚠️ IDEMPOTÊNCIA POR (grupo, pessoa, dia). `grupo_supervisao_visitas` NÃO
    // tem UNIQUE nenhuma, e o caminho de repetição é REAL: se a frequência
    // grava e a visita falha, a tela pede pra tentar de novo — sem esta guarda,
    // a 2ª tentativa criaria a segunda visita do mesmo dia e o
    // `visitas_mes_atual` da `vw_grupos_supervisao` passaria a contar visita que
    // não houve. Devolve a que já existe em vez de duplicar.
    const { data: jaTem } = await supabase.from('grupo_supervisao_visitas')
      .select('id, data_visita, observacao, status')
      .eq('grupo_id', gid)
      .eq('data_visita', data)
      .eq('status', 'realizada')
      .eq('responsavel_id', req.user?.id || null)
      .maybeSingle();
    if (jaTem) {
      // Comentário digitado na 2ª tentativa não pode se perder em silêncio.
      if (observacao && observacao !== jaTem.observacao) {
        const { data: atualizada } = await supabase.from('grupo_supervisao_visitas')
          .update({ observacao }).eq('id', jaTem.id)
          .select('id, data_visita, observacao, status').maybeSingle();
        return res.status(200).json({ ok: true, visita: atualizada || jaTem, ja_existia: true });
      }
      return res.status(200).json({ ok: true, visita: jaTem, ja_existia: true });
    }

    const { data: linha, error } = await supabase.from('grupo_supervisao_visitas')
      .insert({
        grupo_id: gid,
        supervisor_id: g.membro?.id || null,
        responsavel_id: req.user?.id || null,
        registrado_por: req.user?.id || null,
        data_visita: data,
        observacao,
        status: 'realizada',
      })
      .select('id, data_visita, observacao, status')
      .single();
    if (error) throw error;

    // Idem: dono do grupo, menos quem registrou.
    donosDoGrupo(gid).then((donos) => {
      const alvos = donos.filter((id) => id !== req.user?.id);
      if (!alvos.length) return;
      return notificar({
        modulo: 'grupos',
        tipo: 'grupo_visita_registrada',
        titulo: 'Visita de supervisão registrada pelo app',
        mensagem: `${g.grupo.nome}: visita em ${data.split('-').reverse().join('/')}${observacao ? ' · com comentário' : ''}.`,
        link: '/grupos?tab=visitas',
        chaveDedup: `grupo_visita_${linha.id}`,
        targetIds: alvos,
      });
    }).catch(e => console.warn('[APP] visita · notificar:', e.message));

    res.status(201).json({ ok: true, visita: linha });
  } catch (e) {
    console.error('[APP] grupos/visitas POST:', e.message);
    res.status(500).json({ error: 'Erro ao registrar a visita' });
  }
});

// GET /api/app/grupos/:grupoId/visitas — histórico, pra a tela não prometer o
// que não mostra (e pra o supervisor ver quando esteve lá pela última vez).
router.get('/grupos/:grupoId/visitas', authApp, limiterNormal, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const g = await gateGrupoApp(req, res, gid);
    if (!g.ok) return;
    // ⚠️⚠️ RECORTE POR PESSOA — sem ele a tela MENTE. A tela do app diz "Sua
    // última visita" e "Suas visitas", e sem filtro esta lista traria também as
    // visitas que a COORDENAÇÃO registrou pelo web (`POST /api/grupos/:id/visitas`
    // deixa admin/coordenador registrar em qualquer grupo). O supervisor abriria
    // a tela, leria "Sua última visita: 01/08" — de uma visita que ele não fez —
    // e seria dispensado de ir ao grupo. É justamente o herói da tela.
    //
    // ⚠️ O corte é por `responsavel_id`/`registrado_por` (profiles de quem FEZ),
    // NÃO por `supervisor_id`: quando quem registra pelo web não tem
    // `membro_id`, o `supervisor_id` cai no supervisor DO GRUPO — ou seja, a
    // visita do pastor já nasce carimbada com o nome dele.
    const uid = req.user?.id || null;
    let q = supabase.from('grupo_supervisao_visitas')
      .select('id, data_visita, observacao, status')
      .eq('grupo_id', gid)
      .eq('status', 'realizada');
    if (uid) q = q.or(`responsavel_id.eq.${uid},registrado_por.eq.${uid}`);
    const { data, error } = await q.order('data_visita', { ascending: false }).limit(20);
    if (error) throw error;
    res.json({ visitas: data || [] });
  } catch (e) {
    console.error('[APP] grupos/visitas GET:', e.message);
    res.status(500).json({ error: 'Erro ao carregar as visitas' });
  }
});

// POST /api/app/grupos/:grupoId/ajuda — o líder pede ajuda à coordenação
// ⚠️ Hoje o pedido chega como NOTIFICAÇÃO (persistida em `app_notificacoes` pros
// destinatários do módulo grupos) + push. NÃO existe fila com "resolvido" — isso
// pediria tabela nova, e a decisão de criar fila é da coordenação. Está dito na
// tela: "a coordenação recebe seu pedido", não "abrimos um ticket".
// ── Agenda do grupo · remarcar/cancelar UMA ocorrência (Naná · 18/08/2026) ──
// O encontro recorrente é DERIVADO (dia_semana + horario); aqui grava-se só a
// EXCEÇÃO. Mesmo gate dos outros endpoints de gerenciar grupo.
// ⚠️ NÃO escreve em `mem_grupo_encontros`: aquela é o registro do que
// ACONTECEU (com presenças) e alimenta os KPIs de frequência.
// ⚠️ ÂNCORA da cadência: extraída pra `services/grupoAncora` em 25/08/2026,
// quando o ERP passou a precisar da MESMA (card de encontros sem chamada). O
// porquê inteiro — e por que sem ela a régua não inventa agenda — está lá.

// Quantos dias à frente vale listar: até o fim da temporada aberta (o líder
// pediu "todos os encontros da temporada"), com teto. Sem temporada aberta cai
// em 120 dias — a tela não pode ficar vazia por falta de cadastro.
async function janelaDaTemporada() {
  try {
    const { data, error } = await supabase.from('mem_temporadas')
      .select('data_fim').eq('inscricoes_abertas', true).order('data_inicio', { ascending: false }).limit(1);
    if (error) throw error;
    const fim = data && data[0] && data[0].data_fim;
    if (!fim) return 120;
    const dias = Math.ceil((new Date(String(fim).slice(0, 10) + 'T12:00:00Z') - Date.now()) / 86400000);
    return Math.max(30, Math.min(dias, 200));
  } catch (e) { console.warn('[APP] temporada indisponivel:', e.message); return 120; }
}

router.get('/grupos/:grupoId/agenda', authApp, limiterNormal, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const gate = await gateGrupoApp(req, res, gid);
    if (!gate.ok) return;
    const { data: g } = await supabase.from('mem_grupos')
      .select('id, nome, dia_semana, horario, recorrencia').eq('id', gid).maybeSingle();
    let excecoes = [];
    try {
      const { data, error } = await supabase.from('mem_grupo_agenda_excecoes')
        .select('data_original, status, nova_data, novo_horario, motivo, decidido_por_nome')
        .eq('grupo_id', gid).gte('data_original', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
      if (error) throw error;
      excecoes = data || [];
    } catch (e) {
      console.warn('[APP] agenda indisponivel:', e.message);
      return res.json({ ocorrencias: [], aviso: 'A agenda ainda não está disponível. Tente mais tarde.' });
    }
    const ancoras = await ancorasDeGrupos([gid]);
    const janelaDias = await janelaDaTemporada();
    res.json({
      grupo: {
        id: g?.id, nome: g?.nome, dia_semana: g?.dia_semana,
        horario: g?.horario, recorrencia: g?.recorrencia || 'semanal',
      },
      ocorrencias: proximasOcorrencias({
        diaSemana: g?.dia_semana, horario: g?.horario,
        recorrencia: g?.recorrencia, ancoraISO: ancoras[gid] || null,
        excecoes, quantas: 40, janelaDias,
      }),
      // ⚠️ O herói da tela ("faltou registrar") precisa saber qual foi o
      // ENCONTRO ANTERIOR com as exceções aplicadas. Ele calculava sozinho por
      // dia_semana e cobrava um encontro que o líder já tinha remarcado.
      // `null` = não há anterior, ou ela foi cancelada (sem pendência).
      anterior: ocorrenciaAnterior({
        diaSemana: g?.dia_semana, horario: g?.horario,
        recorrencia: g?.recorrencia, ancoraISO: ancoras[gid] || null,
        excecoes,
      }),
    });
  } catch (e) {
    console.error('[APP] agenda:', e.message);
    res.status(500).json({ error: 'Erro ao carregar a agenda' });
  }
});

// body: { data_original, acao: 'remarcar'|'cancelar'|'desfazer', nova_data?, novo_horario?, motivo? }
router.post('/grupos/:grupoId/agenda', authApp, limiterStrict, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const gate = await gateGrupoApp(req, res, gid);
    if (!gate.ok) return;
    const {
      data_original, acao, nova_data, novo_horario, motivo,
      confirmar_apagar_chamada,
    } = req.body || {};

    // ⚠️ CASCA FINA: a régua (as DUAS janelas de data, a coerência com a chamada
    // já registrada, a tradução dos erros de banco) vive em
    // `services/grupoAgendaExcecao` — a MESMA que o ERP usa desde 25/08. Duas
    // cópias divergiriam, e o sintoma seria "no app deu, no web não".
    const r = await aplicarExcecaoAgenda({
      grupoId: gid,
      dataOriginal: data_original,
      acao,
      novaData: nova_data,
      novoHorario: novo_horario,
      motivo,
      autor: { id: gate.membro?.id || null, nome: gate.membro?.nome || null },
      // ⚠⚠ `=== true` e nada mais: fail-closed. String, 1 ou objeto vindos de
      // um cliente distraído NÃO podem apagar a chamada de um encontro real —
      // a segunda etapa existe justamente pra isso ser uma decisão.
      confirmarApagarChamada: confirmar_apagar_chamada === true,
    });
    if (!r.ok) {
      const corpo = { error: r.error };
      if (r.codigo) corpo.codigo = r.codigo;
      if (r.remarcar_de) corpo.remarcar_de = r.remarcar_de;
      if (r.remarcar_ate) corpo.remarcar_ate = r.remarcar_ate;
      // Pra a pergunta da tela ser concreta ("isso apaga a presença de 3
      // pessoas") em vez de abstrata. `null` = não deu pra contar.
      if (r.presentes !== undefined) corpo.presentes = r.presentes;
      return res.status(r.http || 400).json(corpo);
    }

    // ⚠️ Avisa a COORDENAÇÃO, não o grupo: quem fala com os participantes é o
    // líder, no WhatsApp dele. Disparar pra todo o roster daqui seria mensagem
    // que ninguém pediu — e o app não tem o contexto ("adiamos por causa do
    // feriado") que só ele sabe dar.
    if (r.acao !== 'desfeito') {
      (async () => {
        try {
          const cancelou = r.acao === 'cancelado';
          // ⚠️ O vocabulário muda no passado: "cancelou o encontro de amanhã" e
          // "registrou que o encontro da semana passada não aconteceu" são fatos
          // diferentes, e a coordenação decide coisas diferentes a partir deles.
          const titulo = cancelou
            ? (r.no_passado
              ? `Encontro não aconteceu: ${gate.grupo.nome}`
              : `Encontro cancelado: ${gate.grupo.nome}`)
            : (r.no_passado
              ? `Data de encontro corrigida: ${gate.grupo.nome}`
              : `Encontro remarcado: ${gate.grupo.nome}`);
          const quem = gate.membro?.nome || 'O líder';
          const mensagem = cancelou
            ? (r.no_passado
              ? `${quem} registrou que o encontro de ${data_original} não aconteceu.${r.motivo ? ` Motivo: ${r.motivo}` : ''}`
              : `${quem} cancelou o encontro de ${data_original}.${r.motivo ? ` Motivo: ${r.motivo}` : ''}`)
            : (r.no_passado
              ? `${quem} corrigiu a data do encontro de ${data_original} para ${r.nova_data}.`
                + `${r.chamada_movida ? ' A chamada foi movida junto.' : ''}${r.motivo ? ` Motivo: ${r.motivo}` : ''}`
              : `${quem} remarcou o encontro de ${data_original} para ${r.nova_data}`
                + `${r.novo_horario ? ` às ${r.novo_horario}` : ''}.${r.motivo ? ` Motivo: ${r.motivo}` : ''}`);
          await notificar({
            modulo: 'grupos',
            tipo: 'agenda_grupo_alterada',
            titulo,
            mensagem,
            link: '/grupos',
            severidade: 'info',
            chaveDedup: `agenda_${gid}_${data_original}_${r.acao}`,
          });
        } catch (err) { console.error('[APP] agenda notify:', err.message); }
      })();
    }

    res.json({ ok: true, acao: r.acao, chamada_movida: r.chamada_movida });
  } catch (e) {
    console.error('[APP] agenda escrita:', e.message);
    res.status(500).json({ error: 'Erro ao alterar o encontro' });
  }
});

router.post('/grupos/:grupoId/ajuda', authApp, limiterStrict, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const g = await gateGrupoApp(req, res, gid);
    if (!g.ok) return;
    const msg = String(req.body?.mensagem || '').trim();
    if (msg.length < 5) return res.status(400).json({ error: 'Escreva o que você precisa (pelo menos uma frase).' });
    const quem = g.membro?.nome || req.user?.email || 'Líder';
    await notificar({
      modulo: 'grupos',
      tipo: 'grupo_pedido_ajuda',
      titulo: `Pedido de ajuda · ${g.grupo.nome}`,
      mensagem: `${quem} (líder de "${g.grupo.nome}") pediu ajuda pelo app: "${msg.slice(0, 400)}"`,
      link: '/grupos?tab=entrada',
      severidade: 'aviso',
      // Sem dedup por dia: se o líder pedir 2× é porque precisa 2×.
      chaveDedup: `grupo_ajuda_${gid}_${Date.now()}`,
    });
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error('[APP] grupos/ajuda:', e.message);
    res.status(500).json({ error: 'Erro ao enviar seu pedido' });
  }
});

// GET /api/app/grupos/:grupoId/materiais — estudos do grupo (e os de "Todos")
router.get('/grupos/:grupoId/materiais', authApp, limiterNormal, async (req, res) => {
  try {
    const gid = req.params.grupoId;
    const g = await gateGrupoApp(req, res, gid);
    if (!g.ok) return;
    const { data, error } = await supabase.from('mem_grupo_documentos')
      // ⚠️ NÃO existe coluna `url` — os campos reais são `sharepoint_url` e
      // `storage_path` (conferido no banco). Pedir coluna inexistente faz o
      // PostgREST recusar a query INTEIRA e a aba de estudos apareceria vazia.
      .select('id, nome, tipo, sharepoint_url, storage_path, etiquetas, grupo_ids, estudo_semana, created_at')
      .order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    // Material é do grupo quando cita o id, ou quando é geral (sem grupo_ids).
    const BUCKET = `${process.env.SUPABASE_URL || ''}/storage/v1/object/public/eventos-anexos/`;
    const materiais = (data || [])
      .filter(d => !Array.isArray(d.grupo_ids) || d.grupo_ids.length === 0 || d.grupo_ids.includes(gid))
      .slice(0, 60)
      .map(d => ({
        id: d.id, nome: d.nome, tipo: d.tipo,
        estudo_semana: !!d.estudo_semana, etiquetas: d.etiquetas || [],
        created_at: d.created_at,
        // Link pra abrir: SharePoint quando houver, senão o arquivo do bucket
        // público (é onde o fluxo de fotos/materiais de grupos guarda).
        url: d.sharepoint_url || (d.storage_path ? BUCKET + d.storage_path : null),
      }));
    res.json({ materiais });
  } catch (e) {
    console.error('[APP] grupos/materiais:', e.message);
    res.status(500).json({ error: 'Erro ao carregar os estudos' });
  }
});

// ── Minhas tarefas (to-do pessoal · app) ────────────────────────────────────
// Reusa a tabela `tarefas_pessoais` (mesma do /tarefas do ERP web): dono =
// created_by = auth user id (o mesmo id que o app resolve no authApp). Assim o
// colaborador vê as MESMAS tarefas no web e no app. Escopo garantido em código
// (service role bypassa RLS) via .eq('created_by', req.user.id).
const STATUS_TAREFA = ['a_fazer', 'fazendo', 'concluida'];
const PRIOS_TAREFA = ['baixa', 'media', 'alta'];

function limparTarefaApp(d = {}) {
  const out = {};
  if (d.titulo !== undefined) out.titulo = String(d.titulo || '').trim().slice(0, 200);
  if (d.descricao !== undefined) out.descricao = d.descricao ? String(d.descricao).trim().slice(0, 2000) : null;
  if (d.data !== undefined) out.data = d.data || null;
  if (d.horario !== undefined) out.horario = d.horario || null;
  if (d.prioridade !== undefined) out.prioridade = PRIOS_TAREFA.includes(d.prioridade) ? d.prioridade : 'media';
  if (d.status !== undefined && STATUS_TAREFA.includes(d.status)) {
    out.status = d.status;
    out.done = d.status === 'concluida'; // espelho de compat com a agenda legada
  }
  return out;
}

// GET /api/app/tarefas — minhas tarefas (mais recentes/urgentes primeiro)
router.get('/tarefas', authApp, limiterNormal, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tarefas_pessoais')
      .select('id, titulo, descricao, data, horario, prioridade, status, done, created_at, updated_at')
      .eq('created_by', req.user.id)
      .order('done', { ascending: true })
      .order('data', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[APP] tarefas list:', e.message);
    res.status(500).json({ error: 'Erro ao listar as tarefas' });
  }
});

// POST /api/app/tarefas — cria
router.post('/tarefas', authApp, limiterNormal, async (req, res) => {
  try {
    const d = req.body || {};
    if (!d.titulo || !String(d.titulo).trim()) return res.status(400).json({ error: 'Informe o título da tarefa' });
    const { data, error } = await supabase.from('tarefas_pessoais').insert({
      ...limparTarefaApp(d),
      titulo: String(d.titulo).trim().slice(0, 200),
      status: STATUS_TAREFA.includes(d.status) ? d.status : 'a_fazer',
      done: d.status === 'concluida',
      created_by: req.user.id,
      responsavel_id: req.user.id,
      tipo: 'pessoal',
      recorrencia: 'unica',
    }).select('id, titulo, descricao, data, horario, prioridade, status, done, created_at, updated_at').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[APP] tarefas create:', e.message);
    res.status(500).json({ error: 'Erro ao criar a tarefa' });
  }
});

// PUT /api/app/tarefas/:id — edita (só o dono)
router.put('/tarefas/:id', authApp, limiterNormal, async (req, res) => {
  try {
    const patch = limparTarefaApp(req.body || {});
    if (patch.titulo !== undefined && !patch.titulo) return res.status(400).json({ error: 'Informe o título da tarefa' });
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada para atualizar' });
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('tarefas_pessoais')
      .update(patch)
      .eq('id', req.params.id).eq('created_by', req.user.id)
      .select('id, titulo, descricao, data, horario, prioridade, status, done, created_at, updated_at')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Tarefa não encontrada' });
    res.json(data);
  } catch (e) {
    console.error('[APP] tarefas update:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar a tarefa' });
  }
});

// DELETE /api/app/tarefas/:id — remove (só o dono · hard-delete, como o web)
router.delete('/tarefas/:id', authApp, limiterNormal, async (req, res) => {
  try {
    const { error, count } = await supabase.from('tarefas_pessoais')
      .delete({ count: 'exact' })
      .eq('id', req.params.id).eq('created_by', req.user.id);
    if (error) throw error;
    if (!count) return res.status(404).json({ error: 'Tarefa não encontrada' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[APP] tarefas delete:', e.message);
    res.status(500).json({ error: 'Erro ao excluir a tarefa' });
  }
});

// ── Apresentação de criança · a porta que o app nunca teve ─────────────────
// Pedido do Marcos (11/08/2026): *"Apresentação de Bebês está fora do app, quero
// que tudo seja dentro do app. Quando a pessoa marcar que quer apresentar bebê,
// já que já temos os dados dela, tem que perguntar se o filho é dela; se sim,
// indicar o vínculo, completar os dados se a criança não existir como família
// já. Se for outra pessoa, ela tem que preencher os dados completos dos
// responsáveis e criança."*
//
// E a regra de identidade, dele: *"quando cadastrar uma criança deve gerar pessoa
// no sistema que aparece em minha família, com as regras de criança, SEM CPF,
// identificamos pelo pai."*
//
// ⚠️ A porta anterior era um LINK MORTO: `inscricoes.tsx` abria
// `cbrio.org/apresentacao-criancas`, rota que NÃO existe no ERP (0 referências
// em `src/`) e responde 200 só pelo catch-all do SPA. `apresentacao_bebes` tem
// 0 linhas — ninguém nunca conseguiu se inscrever, por porta nenhuma.
//
// ⚠️⚠️ ESCREVE EM `apresentacao_criancas`, NÃO em `apresentacao_bebes` (corrigido
// 11/08). **É `apresentacao_criancas` que a tela do Kids lê** (`totemKids.js`
// `GET /apresentacoes` → aba Apresentação de crianças do `/kids`); ninguém lê
// `apresentacao_bebes` além do próprio totem, pro dedup dele. Escolher a tabela
// errada faria o pedido feito no app **nunca aparecer pra equipe** — a família
// veria "recebemos" e o balcão não saberia de nada no domingo. E é ela que tem
// `crianca_id` (o elo com a ficha do Kids) e os campos que o Contrato pede.
// Troca sem custo: `apresentacao_bebes` tem 0 linhas (medido em 11/08).
const {
  proximoSegundoDomingo: _proxSegDom,
  iso: _isoData,
  acharCriancaNaFamilia,
  validarPedido: _validarPedidoCrianca,
  pessoaDaCrianca,
  nomesDosPais,
} = require('../utils/criancaApresentacao');
const {
  hojeBRT: _hojeBrtApres,
  separar: _separarApres,
  juntar: _juntarApres,
} = require('../utils/apresentacaoHistorico');

/**
 * Quem são os pais/mães de cada criança da lista (id → [ids dos responsáveis]).
 *
 * ⚠️ A direção importa: `vincularParentesco` grava a linha da CRIANÇA como
 * `pessoa_id = criança, tipo = 'filho', relacionado_id = pai/mãe` (e a recíproca
 * como `pai_mae`). Ler a direção errada devolveria os FILHOS de cada um.
 */
async function paisDasCriancas(ids) {
  const mapa = new Map();
  if (!ids?.length) return mapa;
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from('mem_vinculos_familiares')
      .select('pessoa_id, relacionado_id')
      .eq('tipo', 'filho')
      .in('pessoa_id', ids.slice(i, i + 200))
      .is('deleted_at', null);
    for (const v of data || []) {
      if (!mapa.has(v.pessoa_id)) mapa.set(v.pessoa_id, []);
      mapa.get(v.pessoa_id).push(v.relacionado_id);
    }
  }
  return mapa;
}

/**
 * Todas as apresentações que são DESTA pessoa, pelos 3 caminhos possíveis.
 *
 * ⚠️⚠️ Buscar só por `responsavel_membro_id` devolve VAZIO pra quem apresentou:
 * medido em 20/08, as 5 apresentações passadas têm essa coluna NULA (vieram do
 * formulário público, que não resolve membro) e as 2 atribuíveis chegam **só**
 * pela ficha do Kids. Um caminho só faria a tela AFIRMAR "você nunca apresentou"
 * a quem apresentou — e campo vazio parece dado, então ninguém investigaria.
 *
 * Cadeia, na ordem da força da evidência:
 *   1. `responsavel_membro_id` — o vínculo que o app/matcher gravou;
 *   2. `cpf_responsavel` = CPF do membro — chave FORTE do Contrato de porta;
 *   3. `crianca_id` → `kids_responsaveis` — a criança é minha (é o que alcança
 *      o histórico hoje).
 *
 * ⚠️ E-MAIL E TELEFONE FICAM FORA, de propósito: família compartilha os dois, e
 * casar por eles mostraria a apresentação do filho de OUTRA pessoa da casa como
 * se fosse minha. Lei do Contrato de porta.
 */
async function apresentacoesDaPessoa(membro) {
  const COLS = 'id, crianca_nome, data_apresentacao, status, crianca_id, created_at';
  const vazio = { vinculo: [], cpf: [], ficha_kids: [] };
  if (!membro?.id) return { linhas: [], incompleto: false };

  const falhas = [];
  const seguro = async (nome, fn) => {
    try { return (await fn()) || []; }
    catch (e) { falhas.push(nome); console.warn('[APP] apres/%s: %s', nome, e.message); return []; }
  };

  // 1 · vínculo direto
  const porCaminho = { ...vazio };
  porCaminho.vinculo = await seguro('vinculo', async () => {
    const { data, error } = await supabase.from('apresentacao_criancas')
      .select(COLS).eq('responsavel_membro_id', membro.id).is('deleted_at', null);
    if (error) throw error;
    return data;
  });

  // 2 · CPF (só com 11 dígitos — CPF pela metade não é chave)
  const cpf = String(membro.cpf || '').replace(/\D/g, '');
  if (cpf.length === 11) {
    porCaminho.cpf = await seguro('cpf', async () => {
      const { data, error } = await supabase.from('apresentacao_criancas')
        .select(COLS).eq('cpf_responsavel', cpf).is('deleted_at', null);
      if (error) throw error;
      return data;
    });
  }

  // 3 · a criança é minha (ficha do Kids)
  const criancas = await seguro('kids', async () => {
    const { data, error } = await supabase.from('kids_responsaveis')
      .select('crianca_id').eq('membro_id', membro.id).is('deleted_at', null);
    if (error) throw error;
    return data;
  });
  const ids = [...new Set((criancas || []).map((c) => c.crianca_id).filter(Boolean))];
  if (ids.length) {
    porCaminho.ficha_kids = await seguro('kids_apres', async () => {
      const out = [];
      // ⚠️ Lotes de 200: `.in()` com lista grande estoura a URL do PostgREST.
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase.from('apresentacao_criancas')
          .select(COLS).in('crianca_id', ids.slice(i, i + 200)).is('deleted_at', null);
        if (error) throw error;
        out.push(...(data || []));
      }
      return out;
    });
  }

  // ⚠️ Falha de consulta é DECLARADA, nunca silenciosa: "você não apresentou
  // ninguém" e "não consegui perguntar" levam a decisões opostas — a segunda
  // faria a família cadastrar de novo o filho que já está inscrito.
  return { linhas: _juntarApres(porCaminho), incompleto: falhas.length > 0 };
}

// GET /api/app/apresentacao-crianca — data da próxima cerimônia + o que já pedi
router.get('/apresentacao-crianca', authApp, limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    const data = _isoData(_proxSegDom());

    // ⚠️ A FAMÍLIA VAI NA RESPOSTA de propósito, com os nomes. É a guarda contra
    // o caso Benjamin/Mariane Gaia (lei de 22/07): quem está agrupada na família
    // da irmã pela Membresia colocaria o próprio filho na família errada, e o
    // único jeito honesto de evitar isso é a pessoa VER em qual família a criança
    // vai entrar antes de confirmar.
    let familia = null;
    if (membro?.id) {
      try {
        const dados = await carregarFamiliaDoMembro(membro.id);
        familia = {
          nome: dados.familia?.nome || null,
          membros: (dados.familiares || []).map((f) => f.nome).filter(Boolean).slice(0, 8),
        };
      } catch (e) { console.warn('[APP] apres familia:', e.message); }
    }

    // ⚠️ `pedidos` CONTINUA sendo só as próximas — é o que o bundle já publicado
    // lê, e mudar o significado dele faria o app antigo listar apresentações
    // passadas como se fossem pedidos em aberto. O histórico vai em campo NOVO.
    const { linhas, incompleto } = await apresentacoesDaPessoa(membro);
    const { proximas, historico } = _separarApres(linhas, _hojeBrtApres());

    res.json({
      proxima_data: data,
      familia,
      pedidos: proximas,
      // Apresentações que já aconteceram (mais recente primeiro).
      historico,
      // true = alguma consulta da cadeia falhou; a tela DIZ que a lista pode
      // estar incompleta em vez de afirmar que não há histórico.
      historico_incompleto: incompleto,
      // A tela usa isto pra decidir se pode oferecer o caminho "é meu filho".
      pode_indicar_vinculo: !!membro?.id,
    });
  } catch (e) {
    console.error('[APP] apresentacao-crianca GET:', e.message);
    res.status(500).json({ error: 'Erro ao carregar a apresentação de crianças' });
  }
});

// POST /api/app/apresentacao-crianca
// body: { propria: bool, crianca: {nome, data_nascimento, sexo?},
//         responsavel?: {nome, telefone, email?, nome_pai?, nome_mae?}, observacoes? }
router.post('/apresentacao-crianca', authApp, limiterStrict, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    const v = _validarPedidoCrianca(req.body, membro);
    if (!v.ok) return res.status(400).json({ error: v.erro });
    const p = v.dados;

    const dataApres = _isoData(_proxSegDom());

    // Culto de domingo daquele dia (informativo · o balcão confirma)
    let cultoId = null;
    try {
      const { data: cultos } = await supabase.from('cultos')
        .select('id').eq('data', dataApres).is('deleted_at', null).order('id').limit(1);
      if (cultos && cultos[0]) cultoId = cultos[0].id;
    } catch (e) { /* informativo · não trava o pedido */ }

    let criancaMembroId = null;
    let reusou = false;
    let familiaNome = null;
    let extraMembroId = null;
    let extraEmOutraFamilia = false;
    let extraFalhou = false;

    if (p.propria) {
      // ── A criança vira PESSOA e entra na família de quem está pedindo ──────
      //
      // ⚠️ DEDUP PELA FAMÍLIA, não por quem preencheu: o pai e a mãe cadastrando
      // o MESMO filho criariam duas pessoas, e a criança apareceria duplicada em
      // "Minha família" das duas contas. Não existe CPF pra desempatar (é a regra
      // do Marcos), então nome + nascimento DENTRO da família é a chave.
      // ⚠️ `genero` é lido AQUI porque `resolveMembroApp` não o traz (ele seleciona
      // id/nome/cpf/email/telefone). É o que decide se quem preencheu entra como
      // mãe ou como pai no snapshot do balcão — sem sexo, fica em branco.
      // ⚠️⚠️ Passa por `sexoPara`: a coluna guarda **masculino/feminino** e a
      // comparação direta com 'M'/'F' que estava aqui **nunca era verdade**, então
      // nome_pai/nome_mae saíam sempre nulos.
      const { data: eu } = await supabase.from('mem_membros')
        .select('id, familia_id, igreja_id, genero').eq('id', membro.id).maybeSingle();
      const meuSexo = sexoPara('curto', eu?.genero);
      if (meuSexo) p.responsavel.sexo = meuSexo;

      // ── O outro responsável (o outro pai/mãe), quando informado ────────────
      //
      // ⚠⚠ ADULTO PASSA PELO MATCHER CANÔNICO — o oposto da criança, e de
      // propósito: ele TEM CPF, que é a chave mais forte do Contrato de porta. É
      // isso que faz "se esse pai baixar o app" reencontrar o cadastro em vez de
      // criar um segundo. `soChaveForte` porque nome sozinho nunca identifica.
      if (p.responsavel_extra) {
        try {
          const achou = await acharOuCriarGuardado({
            cpf: p.responsavel_extra.cpf,
            nome: p.responsavel_extra.nome,
            telefone: p.responsavel_extra.telefone,
            status: 'visitante',
            extra: p.responsavel_extra.sexo ? { genero: p.responsavel_extra.sexo } : {},
            origem: 'apresentacao_crianca_app',
            origemId: membro.id,
          });
          if (achou?.id) {
            extraMembroId = achou.id;
            const { data: dele } = await supabase.from('mem_membros')
              .select('familia_id').eq('id', achou.id).maybeSingle();

            // ⚠⚠ NÃO ARRANCA NINGUÉM DA FAMÍLIA QUE JÁ TEM. `entrarNaFamilia` faz o
            // convidado ADOTAR a família do anfitrião — se este pai já está agrupado
            // com os pais dele, chamá-la o tiraria de lá em silêncio. Nesse caso
            // gravamos só o parentesco (que é verdade e não destrói nada) e
            // DECLARAMOS pra tela: a equipe alinha. Medido: 999 de 4.072 têm
            // família, então o caso comum é ninguém ter e o caminho ficar limpo.
            if (!dele?.familia_id || dele.familia_id === eu?.familia_id) {
              const fx = await entrarNaFamilia(supabase, {
                membroId: achou.id, anfitriaoId: membro.id, userId: req.user?.id || null,
              });
              if (fx?.ok) familiaNome = fx.familia_nome || familiaNome;
            } else {
              extraEmOutraFamilia = true;
            }
          }
        } catch (e2) {
          // ⚠️ Best-effort: falhar aqui não pode custar a apresentação da criança,
          // que é o que a família veio pedir. A tela avisa que o outro responsável
          // não entrou, em vez de fingir que entrou.
          console.warn('[APP] apres responsavel extra:', e2.message);
          extraFalhou = true;
        }
      }

      if (eu?.familia_id) {
        const { data: naFamilia } = await supabase.from('mem_membros')
          .select('id, nome, data_nascimento')
          .eq('familia_id', eu.familia_id).is('deleted_at', null);

        // ⚠⚠ A CHAVE TEM 3 PARTES: nome + nascimento + PAI/MÃE (Marcos · 11/08).
        // Sem a 3ª, dois primos homônimos de mesma data numa família estendida
        // seriam fundidos e um deles sumiria da lista do domingo.
        const paisPor = await paisDasCriancas((naFamilia || []).map((x) => x.id));
        const achada = acharCriancaNaFamilia(
          naFamilia, p.crianca.nome, p.crianca.data_nascimento,
          paisPor, [membro.id, extraMembroId].filter(Boolean),
        );
        if (achada) { criancaMembroId = achada.id; reusou = true; }
      }

      if (!criancaMembroId) {
        // ⚠️ NÃO passa pelo matcher canônico DE PROPÓSITO. O matcher liga por
        // CPF → e-mail+nome → telefone+nome → nascimento+nome, e uma criança não
        // tem nenhuma dessas chaves: o único ramo que alcançaria ela é
        // nascimento+nome, que casaria com QUALQUER homônimo da mesma data. A
        // identidade dela é o VÍNCULO com o responsável, que é o que o Marcos
        // definiu ("identificamos pelo pai") e é o que gravamos abaixo.
        const { data: nova, error: errNova } = await supabase.from('mem_membros')
          .insert(pessoaDaCrianca(p.crianca, eu?.igreja_id || null))
          .select('id').single();
        if (errNova) throw errNova;
        criancaMembroId = nova.id;
      }

      // Household + parentesco recíproco, pelos MESMOS helpers do convite de
      // familiar (`services/familiaVinculo`) — duas réguas de "entrar na família"
      // divergiriam, e é a de lá que a tela de Minha família lê.
      const fam = await entrarNaFamilia(supabase, {
        membroId: criancaMembroId, anfitriaoId: membro.id, userId: req.user?.id || null,
      });
      if (fam?.ok) familiaNome = fam.familia_nome || null;
      await vincularParentesco(supabase, {
        pessoaId: criancaMembroId, relacionadoId: membro.id, tipo: 'filho',
        userId: req.user?.id || null,
      });
      // ⚠️ O parentesco com o outro responsável é gravado MESMO quando ele ficou
      // na família dele: é fato ("esta criança é filha dele") e não destrói nada.
      // O que depende do household é a criança APARECER em "Minha família" dele —
      // e é disso que a tela avisa quando não dá.
      if (extraMembroId) {
        await vincularParentesco(supabase, {
          pessoaId: criancaMembroId, relacionadoId: extraMembroId, tipo: 'filho',
          userId: req.user?.id || null,
        });
      }
    }

    // ── A FICHA DO KIDS (`kids_criancas`) ─────────────────────────────────
    //
    // ⚠️⚠️ É aqui que as 3 respostas de saúde POUSAM, e é por isso que elas foram
    // pedidas: `tem_espectro` e `tem_limitacao_fisica` são a **régua do PAGER** no
    // totem (`totemKids.js`), obrigatória desde 03/08. Criança apresentada que
    // chega no domingo com esses campos NULOS não cai na regra.
    // ⚠️ Best-effort: falhar aqui NÃO pode custar a apresentação, que é o que a
    // família veio pedir. Sem ficha, o pedido entra com `crianca_id` nulo — a
    // equipe cadastra no check-in, como sempre fez.
    let kidsCriancaId = null;
    try {
      // Mesma dedup do formulário público (nome + nascimento + ativa) — duas
      // réguas fariam a mesma criança nascer duas vezes conforme a porta.
      const { data: kidDup } = await supabase.from('kids_criancas')
        .select('id, tem_alergia, alergia_qual, tem_espectro, espectro_qual, tem_limitacao_fisica, limitacao_fisica_qual')
        .ilike('nome', p.crianca.nome)
        .eq('data_nascimento', p.crianca.data_nascimento)
        .eq('ativo', true)
        .limit(1);
      if (kidDup && kidDup.length) {
        kidsCriancaId = kidDup[0].id;
        // SÓ-ONDE-VAZIO: a ficha já existe e a família acabou de responder.
        // Nunca sobrescreve — o que está lá pode ter sido corrigido no balcão.
        const patch = {};
        for (const [k, val] of Object.entries(p.crianca.saude || {})) {
          if (kidDup[0][k] === null || kidDup[0][k] === undefined) patch[k] = val;
        }
        if (Object.keys(patch).length) {
          await supabase.from('kids_criancas').update(patch).eq('id', kidsCriancaId);
        }
      } else {
        const { data: kid } = await supabase.from('kids_criancas')
          .insert({
            nome: p.crianca.nome,
            data_nascimento: p.crianca.data_nascimento,
            sexo: p.crianca.sexo || null,            // Kids fala M/F, igual ao app
            visitante: true,
            observacoes_internas: `Cadastrado pela Apresentação de Crianças no app (${dataApres}).`,
            ...(p.crianca.saude || {}),
          })
          .select('id').single();
        kidsCriancaId = kid?.id || null;
      }
    } catch (e2) {
      console.warn('[APP] apres ficha kids:', e2.message);
    }

    // ── O pedido em si (o que a equipe Kids/pastoral lê) ───────────────────
    const linha = {
      responsavel_membro_id: p.propria ? membro.id : null,
      responsavel_nome: p.responsavel.nome,
      responsavel_telefone: p.responsavel.telefone,
      responsavel_email: p.responsavel.email || null,
      crianca_nome: p.crianca.nome,
      crianca_data_nascimento: p.crianca.data_nascimento,
      // ⚠️ canônico aqui (a coluna do Contrato), M/F na ficha do Kids acima
      crianca_sexo: sexoPara('canonico', p.crianca.sexo),
      crianca_id: kidsCriancaId,
      origem: 'app',
      status: 'pendente',
      // ⚠️ No caminho "é meu filho" os nomes são DERIVADOS do sexo dos responsáveis,
      // e ficam NULOS quando não se sabe — chutar quem é pai e quem é mãe num
      // registro que o balcão lê em voz alta no culto é pior que deixar em branco.
      // ⚠⚠ No caminho de TERCEIRO valem os nomes que a pessoa DIGITOU — ali ela está
      // informando os pais da criança, e derivar apagaria o que ela escreveu.
      ...(p.propria
        ? nomesDosPais(p.responsavel, p.responsavel_extra)
        : { nome_pai: p.responsavel.nome_pai || null, nome_mae: p.responsavel.nome_mae || null }),
      observacoes: p.observacoes,
      data_apresentacao: dataApres,
      registrado_por: req.user?.id || null,
    };
    // ⚠️ `culto_id` só existe em `apresentacao_bebes`; a tabela do Kids não tem a
    // coluna, e mandar coluna inexistente faz o PostgREST recusar o INSERT
    // INTEIRO (42703) — a família perderia o pedido por causa de um informativo.
    void cultoId;

    // ⚠️ Idempotência: reenviar o formulário não cria segundo pedido pra mesma
    // criança na mesma cerimônia. Sem isso, um toque duplo no botão põe a família
    // duas vezes na lista do domingo.
    if (p.propria) {
      const { data: jaTem } = await supabase.from('apresentacao_criancas')
        .select('id').eq('responsavel_membro_id', membro.id)
        .eq('data_apresentacao', dataApres)
        .ilike('crianca_nome', p.crianca.nome)
        .is('deleted_at', null).maybeSingle();
      if (jaTem) {
        return res.json({
          ok: true, ja_inscrito: true, id: jaTem.id,
          data_apresentacao: dataApres, crianca_membro_id: criancaMembroId,
          familia: familiaNome, reusou_crianca: reusou,
        });
      }
    }

    const { data: criada, error } = await supabase.from('apresentacao_criancas')
      .insert(linha).select('id').single();
    if (error) throw error;

    // Aviso pra quem cuida do Kids — AWAITED (a lei de 31/07: em porta pública
    // serverless o container congela na resposta e fire-and-forget se perde).
    try {
      await notificar({
        modulo: 'kids', tipo: 'apresentacao_crianca',
        titulo: 'Apresentação de criança pelo app',
        mensagem: `${p.responsavel.nome} pediu a apresentação de ${p.crianca.nome} em ${dataApres.split('-').reverse().join('/')}.`,
        link: '/kids', severidade: 'info',
        chaveDedup: `apres_app_${criada.id}`,
      });
    } catch (e2) { console.warn('[APP] apres notif:', e2.message); }

    res.status(201).json({
      ok: true, id: criada.id, data_apresentacao: dataApres,
      crianca_membro_id: criancaMembroId, familia: familiaNome,
      reusou_crianca: reusou,
      // A tela AVISA a família que vai receber pager — quem decide é o totem no
      // check-in; aqui é só não deixar a novidade pro domingo de manhã.
      pager_inclusao: precisaPagerPorInclusao(p.crianca.saude),
      // A tela precisa dizer a VERDADE sobre o outro responsável: entrou na
      // família, ficou na dele, ou não entrou.
      responsavel_extra: p.responsavel_extra
        ? {
            entrou: !!extraMembroId && !extraEmOutraFamilia && !extraFalhou,
            em_outra_familia: extraEmOutraFamilia,
            falhou: extraFalhou,
          }
        : null,
    });
  } catch (e) {
    console.error('[APP] apresentacao-crianca POST:', e.message);
    res.status(500).json({ error: 'Não foi possível registrar a apresentação agora' });
  }
});

// ── Família · convite de familiar pelo app ──────────────────────────────────
// Uma pessoa gera um convite (código + link), envia pro familiar; o familiar
// aceita LOGADO no app → entra na mesma família + ganha o vínculo de parentesco.
// Reflete direto na Membresia (mesma familia_id / mem_vinculos_familiares).

const PARENTESCO_APP = {
  // opção na tela → { tipo do CONVIDADO em relação a quem convida, rótulo }
  filho:   { tipo: 'filho',   rotulo: 'filho(a)' },
  pai_mae: { tipo: 'pai_mae', rotulo: 'pai/mãe' },
  conjuge: { tipo: 'conjuge', rotulo: 'cônjuge' },
  irmao:   { tipo: 'irmao',   rotulo: 'irmão(ã)' },
  outro:   { tipo: 'outro',   rotulo: 'familiar' },
};
const CODIGO_ALFA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I ambíguos
function gerarCodigoFamilia(n = 6) {
  let s = '';
  for (let i = 0; i < n; i++) s += CODIGO_ALFA[Math.floor(Math.random() * CODIGO_ALFA.length)];
  return s;
}
const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0] || 'Alguém';

// Monta a lista de familiares (household) + vínculos de parentesco do membro.
async function carregarFamiliaDoMembro(membroId) {
  const { data: m } = await supabase.from('mem_membros')
    .select('id, nome, familia_id, familia:mem_familias(id, nome)')
    .eq('id', membroId).maybeSingle();
  let familiares = [];
  if (m?.familia_id) {
    const { data: fs } = await supabase.from('mem_membros')
      .select('id, nome, foto_url, status')
      .eq('familia_id', m.familia_id).neq('id', membroId)
      .eq('active', true).is('deleted_at', null);
    familiares = fs || [];
  }
  const { data: vins } = await supabase.from('mem_vinculos_familiares')
    .select('tipo, relacionado:mem_membros!mem_vinculos_familiares_relacionado_id_fkey(id, nome)')
    .eq('pessoa_id', membroId).is('deleted_at', null);
  const parentescoPor = {};
  (vins || []).forEach((v) => { if (v.relacionado?.id) parentescoPor[v.relacionado.id] = v.tipo; });
  return {
    familia: m?.familia ? { id: m.familia.id, nome: m.familia.nome } : null,
    familiares: familiares.map((f) => ({ ...f, parentesco: parentescoPor[f.id] || null })),
  };
}

// GET /api/app/familia — minha família (household + parentescos)
router.get('/familia', authApp, limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(404).json({ error: 'Cadastro de membro não encontrado' });
    const dados = await carregarFamiliaDoMembro(membro.id);
    res.json(dados);
  } catch (e) {
    console.error('[APP] familia GET:', e.message);
    res.status(500).json({ error: 'Erro ao carregar sua família' });
  }
});

// POST /api/app/familia/convite — gera um convite { parentesco } → { codigo, link, mensagem }
router.post('/familia/convite', authApp, limiterStrict, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(404).json({ error: 'Cadastro de membro não encontrado' });
    const key = String(req.body?.parentesco || 'outro');
    const opt = PARENTESCO_APP[key] || PARENTESCO_APP.outro;

    // reaproveita convite pendente e não-expirado do mesmo parentesco (evita
    // gerar N códigos por pessoa) — senão cria um novo.
    let convite = null;
    const { data: pend } = await supabase.from('mem_familia_convites')
      .select('id, codigo, expira_em')
      .eq('criador_membro_id', membro.id).eq('parentesco', opt.tipo).eq('status', 'pendente')
      .is('deleted_at', null).gt('expira_em', new Date().toISOString())
      .order('created_at', { ascending: false }).limit(1);
    if (pend && pend[0]) {
      convite = pend[0];
    } else {
      // código único entre os pendentes vivos (retry curto)
      let codigo = null;
      for (let i = 0; i < 20 && !codigo; i++) {
        const cand = gerarCodigoFamilia();
        const { data: existe } = await supabase.from('mem_familia_convites')
          .select('id').eq('codigo', cand).is('deleted_at', null).maybeSingle();
        if (!existe) codigo = cand;
      }
      if (!codigo) return res.status(500).json({ error: 'Não foi possível gerar o código, tente de novo' });
      const { data: m } = await supabase.from('mem_membros').select('familia_id').eq('id', membro.id).maybeSingle();
      const expira = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 dias
      const { data: ins, error } = await supabase.from('mem_familia_convites')
        .insert({ codigo, criador_membro_id: membro.id, familia_id: m?.familia_id || null, parentesco: opt.tipo, expira_em: expira })
        .select('id, codigo, expira_em').single();
      if (error) throw error;
      convite = ins;
    }

    const link = `${baseUrl()}/f/a/${convite.codigo}`;
    const mensagem = `Oi! Quero te adicionar como ${opt.rotulo} na minha família no app da CBRio. `
      + `É só abrir este link e confirmar: ${link}\n\nSe já tiver o app, você também pode entrar em "Minha família" e usar o código ${convite.codigo}.`;
    res.status(201).json({ codigo: convite.codigo, parentesco: opt.tipo, rotulo: opt.rotulo, link, mensagem, expira_em: convite.expira_em });
  } catch (e) {
    console.error('[APP] familia convite:', e.message);
    res.status(500).json({ error: 'Erro ao gerar o convite' });
  }
});

// GET /api/app/familia/convite-info?codigo= — mostra quem convidou (antes de aceitar)
router.get('/familia/convite-info', authApp, limiterNormal, async (req, res) => {
  try {
    const codigo = String(req.query?.codigo || '').trim().toUpperCase();
    if (!codigo) return res.status(400).json({ error: 'Código não informado' });
    const { data: conv } = await supabase.from('mem_familia_convites')
      .select('id, status, expira_em, parentesco, criador_membro_id')
      .eq('codigo', codigo).is('deleted_at', null).maybeSingle();
    if (!conv) return res.status(404).json({ error: 'Convite não encontrado' });
    if (conv.status !== 'pendente') return res.status(410).json({ error: 'Convite já usado ou cancelado', status: conv.status });
    if (new Date(conv.expira_em) < new Date()) return res.status(410).json({ error: 'Convite expirado', status: 'expirado' });
    const { data: criador } = await supabase.from('mem_membros').select('nome').eq('id', conv.criador_membro_id).maybeSingle();
    const opt = PARENTESCO_APP[conv.parentesco] || PARENTESCO_APP.outro;
    res.json({ criador_nome: primeiroNome(criador?.nome), parentesco: conv.parentesco, rotulo: opt.rotulo });
  } catch (e) {
    console.error('[APP] familia convite-info:', e.message);
    res.status(500).json({ error: 'Erro ao ler o convite' });
  }
});

// POST /api/app/familia/aceitar — { codigo } · quem aceita = membro logado
router.post('/familia/aceitar', authApp, limiterStrict, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(404).json({ error: 'Cadastro de membro não encontrado' });
    const codigo = String(req.body?.codigo || '').trim().toUpperCase();
    if (!codigo) return res.status(400).json({ error: 'Código não informado' });

    const { data: conv } = await supabase.from('mem_familia_convites')
      .select('id, status, expira_em, parentesco, criador_membro_id, aceito_por_membro_id')
      .eq('codigo', codigo).is('deleted_at', null).maybeSingle();
    if (!conv) return res.status(404).json({ error: 'Convite não encontrado' });
    if (conv.status !== 'pendente') return res.status(410).json({ error: 'Este convite já foi usado ou cancelado' });
    if (new Date(conv.expira_em) < new Date()) return res.status(410).json({ error: 'Este convite expirou' });
    if (conv.criador_membro_id === membro.id) return res.status(400).json({ error: 'Você não pode aceitar o próprio convite' });

    // 1) entra na família de quem convidou (cria a família se ele não tem)
    const fam = await entrarNaFamilia(supabase, { membroId: membro.id, anfitriaoId: conv.criador_membro_id, userId: req.user?.id || null });
    if (!fam.ok) return res.status(500).json({ error: 'Não foi possível entrar na família' });

    // 2) vínculo de parentesco (convidado é <tipo> de quem convidou), se houver
    if (conv.parentesco && VINC_INVERSO[conv.parentesco] && conv.parentesco !== 'outro') {
      await vincularParentesco(supabase, {
        pessoaId: membro.id, relacionadoId: conv.criador_membro_id, tipo: conv.parentesco, userId: req.user?.id || null,
      });
    }

    // 3) marca o convite como aceito
    await supabase.from('mem_familia_convites')
      .update({ status: 'aceito', aceito_por_membro_id: membro.id, aceito_em: new Date().toISOString() })
      .eq('id', conv.id);

    // 4) avisa quem convidou (in-app best-effort + WhatsApp no-op sem template)
    try {
      const { data: prof } = await supabase.from('profiles').select('id').eq('membro_id', conv.criador_membro_id).maybeSingle();
      if (prof?.id) {
        await notificar({
          modulo: 'membresia', tipo: 'familia_convite_aceito',
          titulo: 'Convite de família aceito',
          mensagem: `${primeiroNome(membro.nome)} aceitou seu convite e agora faz parte da sua família.`,
          link: '/perfil', severidade: 'info',
          chaveDedup: `fam_conv_${conv.id}`, targetIds: [prof.id],
        });
      }
      await wpp.notificarMembro(conv.criador_membro_id, 'familia_convite_aceito', [primeiroNome(membro.nome)]);
    } catch (e2) { console.warn('[APP] familia aceitar notif:', e2.message); }

    const dados = await carregarFamiliaDoMembro(membro.id);
    res.json({ ok: true, familia: fam.familia_nome ? { id: fam.familia_id, nome: fam.familia_nome } : dados.familia, ...dados });
  } catch (e) {
    console.error('[APP] familia aceitar:', e.message);
    res.status(500).json({ error: 'Erro ao aceitar o convite' });
  }
});

// DELETE /api/app/familia/vinculo/:membroId — sair/remover alguém da minha família
// (remove o vínculo de parentesco recíproco e tira o outro da household; a pessoa
// continua no sistema). Só o próprio membro mexe na PRÓPRIA família.
router.delete('/familia/vinculo/:outroId', authApp, limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req);
    if (!membro) return res.status(404).json({ error: 'Cadastro de membro não encontrado' });
    const outroId = req.params.outroId;
    // precisa estar na mesma família
    const [{ data: a }, { data: b }] = await Promise.all([
      supabase.from('mem_membros').select('id, familia_id').eq('id', membro.id).maybeSingle(),
      supabase.from('mem_membros').select('id, familia_id').eq('id', outroId).maybeSingle(),
    ]);
    if (!b || !a?.familia_id || a.familia_id !== b.familia_id) {
      return res.status(400).json({ error: 'Essa pessoa não está na sua família' });
    }
    // tira o OUTRO da household (a pessoa continua no sistema)
    await supabase.from('mem_membros').update({ familia_id: null }).eq('id', outroId);
    // soft-delete dos vínculos de parentesco entre os dois (nos 2 sentidos)
    const nowIso = new Date().toISOString();
    await supabase.from('mem_vinculos_familiares').update({ deleted_at: nowIso })
      .or(`and(pessoa_id.eq.${membro.id},relacionado_id.eq.${outroId}),and(pessoa_id.eq.${outroId},relacionado_id.eq.${membro.id})`)
      .is('deleted_at', null);
    const dados = await carregarFamiliaDoMembro(membro.id);
    res.json({ ok: true, ...dados });
  } catch (e) {
    console.error('[APP] familia remover vinculo:', e.message);
    res.status(500).json({ error: 'Erro ao remover da família' });
  }
});

// ── Inscrições · EVENTOS no app (espinha /inscricoes) ────────────────────────
// Pedido do Marcos (05/08/2026): "ao clicar em inscrições, aparecem todos os
// eventos da igreja, com um seletor de todos os eventos e eventos inscritos... e
// eu quero que os outros eventos tenham inscrições PELO APP também, sem link
// externo como é o caso do celebra."
//
// ⚠️⚠️ A INSCRIÇÃO PELO APP REUSA A FUNÇÃO DA PORTA PÚBLICA
// (`inscreverEspinha` de publicEventoExterno.js). O app é um CLIENTE novo da
// mesma régua — validação do Contrato de Inscrição, benefício por CPF, RPC
// atômica de vaga (`fn_insc_inscrever`), consentimentos, cobrança e WhatsApp
// rodam idênticos. Reimplementar no app seria o "segundo caminho de escrita de
// pessoa" que o Contrato de porta existe pra impedir.
// ⚠️ O PAGAMENTO continua na página hospedada (`/pagamento/<token>`): é lá que
// vivem Pix/boleto/cartão e o escopo PCI (lei nº 5 do núcleo de pagamentos —
// dado de cartão não entra no nosso Express, muito menos no app). O app manda a
// pessoa pra lá com o link que a própria resposta da inscrição devolve.
router.get('/eventos', authApp, limiterNormal, async (req, res) => {
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase.from('insc_eventos')
      .select('id, nome, slug, descricao, area, tipo, data, hora, local, capa_url, vagas, valor_centavos, pagamento_ativo, pagamento_metodos, parcelas_max, inscricoes_abrem_em, inscricoes_encerram_em, tem_sorteio, campos, msg_sucesso_titulo, msg_sucesso_texto, checkout_externo_url, checkout_externo_nome, created_at')
      .eq('status', 'publicado').is('deleted_at', null)
      .order('data', { ascending: true, nullsFirst: false })
      .limit(100);
    if (error) throw error;
    const abertos = (data || []).filter((e) => {
      if (e.inscricoes_abrem_em && e.inscricoes_abrem_em > nowIso) return false;
      if (e.inscricoes_encerram_em && e.inscricoes_encerram_em < nowIso) return false;
      return true;
    });
    // Configuração de retiro/viagem (migration 20260817160000) — em consulta
    // ISOLADA, best-effort, pela MESMA função da porta pública. ⚠️ Junto ao
    // SELECT acima, coluna ausente faria o PostgREST recusar a lista INTEIRA
    // (42703) e o app abriria sem nenhum evento (lição do `parcelas_max`).
    await Promise.all(abertos.map((e) => anexarConfigMenor(e).catch(() => e)));

    // Quais desses a pessoa já tem inscrição viva? É o que o seletor
    // "Todos | Meus eventos" usa, e o que decide form × minha inscrição.
    const membro = await resolveMembroApp(req).catch(() => null);
    const inscritos = new Set();
    // ⚠️⚠️ VAGA RESERVADA NÃO É INSCRIÇÃO. `recebida` significa "a vaga está
    // segura, o pagamento não veio" — e o app mostrava **"Inscrito"** pra quem
    // nunca pagou, porque aqui só se excluía `cancelada`. Em evento pago isso é
    // a pior mentira que a tela pode contar: a pessoa fecha o app achando que
    // tem lugar no retiro.
    //
    // A régua canônica é a mesma da porta pública e da notificação da equipe
    // ("reservou vaga e está aguardando o pagamento" × "se inscreveu"). Quem
    // decide o que é válido é o BACKEND — o app só exibe (lei da auditoria de
    // 05/08). Por isso vão os DOIS sinais, e `inscrito` continua significando o
    // que sempre significou pra não quebrar bundle antigo.
    const pendentes = new Set();
    if (membro && abertos.length) {
      const { data: minhas } = await supabase.from('inscricoes')
        .select('evento_id, status')
        .eq('membro_id', membro.id)
        .in('evento_id', abertos.map((e) => e.id))
        .neq('status', 'cancelada')
        .is('deleted_at', null);
      (minhas || []).forEach((i) => {
        inscritos.add(i.evento_id);
        if (i.status === 'recebida') pendentes.add(i.evento_id);
      });
    }

    // Vagas RESTANTES pela régua canônica (`fn_insc_vagas`, a MESMA do lock de
    // inscrição) — nunca recontando aqui, senão a tela e o servidor discordam.
    // ⚠️ Só chamamos pros eventos que TÊM vagas definidas: hoje são 0 dos 3, então
    // o custo real é zero. Best-effort: falha vira null, e o app omite a linha.
    const restantes = new Map();
    await Promise.all(abertos.filter((e) => e.vagas != null).map(async (e) => {
      try {
        const { data: v } = await supabase.rpc('fn_insc_vagas', { p_evento_id: e.id });
        const n = Array.isArray(v) ? v[0] : v;
        if (n && n.restantes != null) restantes.set(e.id, Number(n.restantes));
      } catch { /* aviso ausente é melhor que número errado */ }
    }));

    const eventos = abertos.map((e) => ({
      id: e.id, nome: e.nome, slug: e.slug, descricao: e.descricao,
      area: e.area, tipo: e.tipo, data: e.data, hora: e.hora, local: e.local,
      capa_url: e.capa_url, vagas: e.vagas, tem_sorteio: e.tem_sorteio,
      // Prazo e vagas restantes: o app precisa DIZER a urgência, não só o preço.
      // `inscricoes_encerram_em` já era selecionado (o filtro `abertos` usa) e
      // simplesmente não era devolvido.
      inscricoes_encerram_em: e.inscricoes_encerram_em || null,
      vagas_restantes: restantes.has(e.id) ? restantes.get(e.id) : null,
      // ⚠️ `pagamento_pendente` é o que separa "tem vaga garantida" de "reservou
      // e não pagou". Sem ele o app não TEM como saber — e mostrava "Inscrito".
      pagamento_pendente: pendentes.has(e.id),
      pago: !!e.pagamento_ativo,
      valor_centavos: e.pagamento_ativo ? (e.valor_centavos || null) : null,
      // Teto de parcelas do EVENTO (null = teto da conta do PSP). Só faz sentido
      // exibir em evento pago — a escolha das parcelas continua na página hospedada.
      parcelas_max: e.pagamento_ativo ? (e.parcelas_max || null) : null,
      // Campos EXTRA do form-builder (os padrão o app já tem do cadastro).
      campos: Array.isArray(e.campos) ? e.campos : [],
      msg_sucesso_titulo: e.msg_sucesso_titulo || null,
      msg_sucesso_texto: e.msg_sucesso_texto || null,
      inscrito: inscritos.has(e.id),
      // Link do form público — fallback (build antigo do app) e o link que o
      // membro COMPARTILHA. ⚠️ Vem da régua (`utils/linkInscricaoApp`), não de
      // string aqui: é o único lugar que decide o domínio público.
      url: linkDoEvento(e.slug),
      // ⚠️⚠️ Cartão cobrado numa plataforma externa (e-Inscrição): o app NÃO
      // reimplementa a escolha de forma. `so_web` manda a tela abrir o
      // formulário público, que é quem sabe perguntar Pix × cartão e mandar
      // pra fora — o mesmo tratamento que o campo `imagem` já tem. Sem isto o
      // app inscreveria por dentro e a pessoa cairia numa página de pagamento
      // sem a opção de cartão, sem nunca saber que ela existia noutro lugar.
      checkout_externo: checkoutExterno.temCheckoutExterno(e) ? {
        nome: checkoutExterno.nomeExterno(e.checkout_externo_nome),
      } : null,
      // ⚠️⚠️ `so_web` também cobre o bloco do RESPONSÁVEL e os aceites próprios do
      // evento (17/08). O app não tem essas telas, e o servidor RECUSA a inscrição
      // sem eles — sem isto a pessoa levaria 400 citando `responsavel_nome` numa
      // tela que não tem o campo, sem caminho nenhum pra concluir. Mandar pro
      // formulário público resolve **sem OTA**: o binário que já está no campo lê
      // esta flag. Ver `so_web` em app/(app)/evento.tsx do repo do app.
      so_web: checkoutExterno.temCheckoutExterno(e)
        || !!e.exige_dados_menor
        || (Array.isArray(e.termos_extra) && e.termos_extra.length > 0),
    }));
    res.json({
      eventos,
      // Textos canônicos do consentimento: o snapshot gravado é sempre o do
      // servidor (services/inscricaoContrato), o app só EXIBE o que vem daqui.
      textos: { termos_lgpd: TEXTOS_INSCRICAO.termos_lgpd, aviso_optin: TEXTOS_INSCRICAO.aviso_optin },
    });
  } catch (e) {
    console.error('[APP] eventos abertos:', e.message);
    res.status(500).json({ error: 'Erro ao carregar eventos' });
  }
});

// GET /api/app/eventos/minhas — as inscrições da pessoa (aba "Meus eventos")
// ⚠️ Declarada ANTES de qualquer `/eventos/:id` (o Express casa na ordem).
router.get('/eventos/minhas', authApp, limiterNormal, async (req, res) => {
  try {
    const membro = await resolveMembroApp(req).catch(() => null);
    if (!membro) return res.json({ inscricoes: [] });

    const { data, error } = await supabase.from('inscricoes')
      .select('id, evento_id, status, created_at, numero_sorte, valor_cobrado_centavos, bolsa_tipo, dados, insc_eventos(id, nome, slug, data, hora, local, capa_url, tem_sorteio, pagamento_ativo, valor_centavos, checkin_ativo)')
      .eq('membro_id', membro.id).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(50);
    if (error) throw error;

    const ids = (data || []).map((i) => i.id);
    // Estado do pagamento pela view canônica (o motor manda; o espelho só cobre
    // pagamento manual) — best-effort: a lista não cai se a view faltar.
    const pagos = {};
    if (ids.length) {
      const { data: pg, error: ePg } = await supabase
        .from('vw_insc_pagamento_estado')
        // ⚠️ A coluna é `status_pagamento` (conferido no banco em 05/08/2026);
        // `status` não existe nesta view e pedir uma coluna inexistente faz o
        // PostgREST recusar a query INTEIRA — o pagamento sairia vazio em
        // silêncio, que é exatamente a armadilha que a gente já pagou antes.
        .select('inscricao_id, status_pagamento, metodo, valor_centavos, pago_em, expira_em, checkout_url')
        .in('inscricao_id', ids);
      if (ePg) console.warn('[APP] eventos/minhas pagamento:', ePg.message);
      (pg || []).forEach((pp) => { pagos[pp.inscricao_id] = pp; });
    }
    // Link de pagamento: é a MESMA página hospedada do site, pelo public_token
    // da COBRANÇA (nunca pelo uuid — uuid vaza em log/print).
    const cobrancas = {};
    if (ids.length) {
      const { data: cb } = await supabase.from('insc_pagamentos')
        // ⚠️ `insc_pagamentos` NÃO tem `deleted_at` — é razão financeira, e
        // financeiro não se apaga (decisão da espinha, 20260729000100).
        .select('inscricao_id, pag_cobrancas(public_token)')
        .in('inscricao_id', ids);
      (cb || []).forEach((c) => {
        const tk = c.pag_cobrancas && c.pag_cobrancas.public_token;
        if (tk) cobrancas[c.inscricao_id] = tk;
      });
    }

    const inscricoes = (data || []).map((i) => {
      const ev = i.insc_eventos || {};
      const pg = pagos[i.id] || null;
      const tk = cobrancas[i.id] || null;
      return {
        id: i.id,
        status: i.status,
        criado_em: i.created_at,
        numero_sorte: ev.tem_sorteio ? i.numero_sorte : null,
        bolsa_tipo: i.bolsa_tipo || null,
        valor_cobrado_centavos: i.valor_cobrado_centavos,
        respostas: i.dados && typeof i.dados === 'object' ? i.dados : {},
        // Comprovante (QR da portaria) — token HMAC derivado do id, vale
        // retroativo pra inscrição migrada, sem coluna nova.
        // ⚠️ SÓ para inscrição `confirmada` (pedido do Matheus em 11/08/2026):
        // `recebida` é VAGA RESERVADA, não inscrição — mostrar o QR ali entrega
        // um comprovante de quem ainda não pagou, e é o mesmo QR que a portaria
        // lê. Uma régua só: `confirmada` cobre evento gratuito (nasce assim),
        // bolsa integral (idem) e evento pago (o handler confirma no `pago`);
        // conferir o pagamento em separado criaria uma 2ª verdade que discorda
        // do domínio em pagamento manual e em gratuidade (que não têm cobrança).
        comprovante_url: i.status === 'confirmada'
          ? `${baseUrl()}/i/c/${gerarTokenComprovante(i.id)}`
          : null,
        // Por que o comprovante não veio — a tela precisa dizer o motivo em vez
        // de simplesmente não mostrar nada (some sem explicação se lê como bug).
        comprovante_bloqueado: i.status === 'confirmada'
          ? null
          : (i.status === 'cancelada' ? 'cancelada' : 'aguardando_pagamento'),
        pagamento: pg ? {
          status: pg.status_pagamento, metodo: pg.metodo,
          valor_centavos: pg.valor_centavos, pago_em: pg.pago_em, expira_em: pg.expira_em,
          // Página HOSPEDADA (escolhe Pix/boleto/cartão) pelo public_token da
          // cobrança. `checkout_url` do provider é só último recurso.
          url: tk ? `${baseUrl()}/pagamento/${tk}` : (pg.checkout_url || null),
        } : null,
        evento: {
          id: ev.id, nome: ev.nome, slug: ev.slug, data: ev.data, hora: ev.hora,
          local: ev.local, capa_url: ev.capa_url, tem_sorteio: ev.tem_sorteio,
          pago: !!ev.pagamento_ativo, checkin_ativo: !!ev.checkin_ativo,
          // Link público, pro membro CONVIDAR alguém pelo botão de compartilhar
          // da aba "Meus eventos". Mesma régua do catálogo — o app não monta URL.
          url: linkDoEvento(ev.slug),
        },
      };
    });
    res.json({ inscricoes });
  } catch (e) {
    console.error('[APP] eventos/minhas:', e.message);
    res.status(500).json({ error: 'Erro ao carregar suas inscrições' });
  }
});

// POST /api/app/eventos/:id/inscrever — inscrição DENTRO do app
// Body = o MESMO do form público (nome_completo, telefone, cpf, email,
// data_nascimento, sexo, endereco?, dados{campos extra}, aceita_termos,
// whatsapp_optin). O app pré-preenche do cadastro; a régua é do servidor.
router.post('/eventos/:id/inscrever', authApp, limiterStrict, async (req, res) => {
  try {
    const ev = await eventoEspinhaPorId(req.params.id);
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
    if (ev.status !== 'publicado') {
      return res.status(403).json({ error: 'As inscrições deste evento não estão abertas.' });
    }
    // ⚠️ Evento que exige bloco de menor ou aceite próprio: a inscrição é no
    // formulário público, com o LINK na resposta. Quem chega aqui é bundle antigo
    // (que ignora `so_web`) — e o `inscreverEspinha` recusaria com 400 citando um
    // campo que a tela do app não tem, deixando a pessoa sem saída. Mesmo
    // tratamento do checkout externo exclusivo.
    if (ev.exige_dados_menor || (Array.isArray(ev.termos_extra) && ev.termos_extra.length)) {
      return res.status(409).json({
        error: 'A inscrição deste evento é feita pelo formulário completo, no navegador.',
        so_web: true,
        url: linkDoEvento(ev.slug),
      });
    }
    // Vincula ao cadastro do app quando o matcher não achar por CPF/telefone.
    const membro = await resolveMembroApp(req).catch(() => null);
    if (membro && !req.body?.membro_id) req.body = { ...(req.body || {}), membro_id: membro.id };
    return await inscreverEspinha(req, res, ev, { origem: 'app' });
  } catch (e) {
    console.error('[APP] eventos/inscrever:', e.message);
    res.status(500).json({ error: 'Erro ao inscrever no evento' });
  }
});

module.exports = router;
