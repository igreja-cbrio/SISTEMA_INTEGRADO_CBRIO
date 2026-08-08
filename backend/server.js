require('dotenv').config();

// Sentry deve inicializar ANTES de qualquer require do app pra capturar
// erros logo no boot. Se SENTRY_DSN não estiver setado, vira no-op.
const { initSentryBackend, sentryRequestHandler, sentryErrorHandler } = require('./utils/sentry');
initSentryBackend();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const { requestContext } = require('./middleware/requestContext');
const { systemJobTracking } = require('./middleware/systemJobTracking');
const { recordServerError } = require('./services/serverErrorTelemetry');
const { createCorsOriginValidator } = require('./utils/corsPolicy');
const { createErrorHandler, requestRoute } = require('./middleware/errorHandler');

const app = express();
// Atrás do proxy do Vercel (1 hop) · faz req.ip = IP real do cliente (x-forwarded-for)
// em vez do IP do proxy. Necessário pro rate-limit chavear por usuário e não tratar
// todo mundo como o mesmo IP. ('1' e não 'true' · evita spoofing e o warning do express-rate-limit.)
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// Request handler do Sentry (precisa vir antes de qualquer middleware
// e antes das rotas para capturar request data nos eventos).
app.use(sentryRequestHandler());
app.use(requestContext);

// ── Security middleware ──
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

app.use(cors({
  origin: createCorsOriginValidator(),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID'],
}));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'production' ? 500 : 5000),
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
  // Isenta NPS, inscrição de grupos e eventos externos do teto global · num
  // culto/evento presencial, dezenas de pessoas no MESMO WiFi (1 IP público)
  // estourariam o limite por-IP. Todos têm limiter próprio generoso
  // (routes/publicNps.js · routes/publicGrupos.js · routes/publicEventoExterno.js).
  // Ver mounts abaixo.
  // ⚠️ O webhook de pagamento também sai daqui: o PSP entrega de poucos IPs
  // fixos e em rajada, então 500/15min por IP é atingível num lançamento. 429
  // aqui = pagamento aprovado com inscrição não confirmada, e vários PSPs
  // DESATIVAM o webhook depois de N falhas (falha silenciosa e permanente).
  skip: (req) => process.env.NODE_ENV !== 'production'
    || req.path.startsWith('/api/public/nps')
    || req.path.startsWith('/api/public/grupos')
    || req.path.startsWith('/api/public/evento')
    || req.path.startsWith('/api/public/membresia')
    // Doação: a tela de pagamento faz POLLING do status, então sob o teto por IP
    // a pessoa tomaria 429 no meio do próprio pagamento — e a igreja inteira sai
    // por 1 IP no culto. Limiter próprio em routes/publicGenerosidade.js.
    || req.path.startsWith('/api/public/generosidade')
    // ⚠️⚠️ CENSO sai do teto por IP, e este é o caso mais extremo da lista: o
    // censo é respondido por MILHARES de pessoas dentro do mesmo culto, todas
    // pelo NAT do prédio, e UMA pessoa gasta ~15 requisições (abrir + salvar
    // rascunho a cada bloco + enviar). Com 500/15min por IP, a ~34ª pessoa já
    // levaria 429 — e 429 aqui é resposta perdida de quem preencheu 93 campos.
    // Limiter próprio (e medido) em routes/publicCenso.js.
    || req.path.startsWith('/api/public/censo')
    // ⚠️ O REDIRECIONADOR DE QR sai do teto por IP pelo mesmo motivo, e aqui a
    // falha é a mais visível de todas: 429 no /r/ é o cartaz não abrindo nada.
    // A pessoa não vê "muitas requisições", vê um QR quebrado — e conclui que o
    // sistema não funciona. É uma leitura de banco de 30s de cache; o custo de
    // isentar é nenhum perto disso.
    || req.path.startsWith('/r/')
    || req.path.startsWith('/api/pagamentos-webhook')
    // ⚠️ Totem também sai do teto por IP: todos os totens da igreja saem pelo
    // MESMO NAT, então 500/15min por IP seria compartilhado entre eles (e com
    // o WiFi dos visitantes). O limite certo é por ESTAÇÃO, e vive no router
    // (routes/totem.js) — que é quem sabe qual estação fez a request.
    || req.path.startsWith('/api/totem')
    // ⚠️⚠️ O APP DE MEMBROS sai do teto por IP (auditoria 06/08/2026): é a MESMA
    // razão do totem e das portas públicas, e é a superfície que mais vai
    // crescer (meta = 4.000 instalações = a base toda). No WiFi da igreja todo
    // celular sai por 1 IP público, e UMA abertura do app gasta 10-30
    // requisições — 5 a 10 aparelhos esgotavam 500/15min e a congregação
    // inteira levava 429. Pior: o app trata 429 como resposta de NEGÓCIO
    // (temporadaGrupos → "inscrições fechadas" · useAdminGrupo → líder sem
    // botão de gerenciar), então o sintoma não parecia limite de rede.
    // O limite certo aqui é por USUÁRIO AUTENTICADO, e vive no router
    // (routes/app.js) — que é quem sabe de quem é a requisição.
    || req.path.startsWith('/api/app'),
}));
app.use(hpp());
app.use(compression());
// Parser dedicado do app CBRio Staff ANTES do global de 1mb: foto/documento
// chegam como dataUrl base64 (até 5MB de arquivo ≈ 7MB de JSON). O body-parser
// marca o body como consumido, então o parser global abaixo vira no-op aqui.
app.use('/api/staff', express.json({ limit: '10mb' }));
// rawBody capturado pra validar HMAC do webhook do WhatsApp (X-Hub-Signature-256)
app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));
app.use(systemJobTracking);

// ── Telemetria de 500 (aba "Erros do servidor" do Feedback) ──
// O error handler global só vê exceções NÃO tratadas; a maioria dos 500 reais
// é respondida pela própria rota (res.status(500).json(...)) e ficava
// invisível — "nenhum erro" na tela era falso. Este hook registra QUALQUER
// resposta >= 500 no finish; o error handler marca res.locals pra não duplicar.
app.use((req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode < 500 || res.locals._erro500Registrado) return;
    try {
      void recordServerError({
        user_id: req.user?.id || null,
        user_email: req.user?.email || null,
        metodo: req.method,
        rota: requestRoute(req),
        mensagem: `HTTP ${res.statusCode} respondido pela rota (sem exceção · ver logs da função)`,
        status: res.statusCode,
        request_id: req.requestId,
        release: process.env.VERCEL_GIT_COMMIT_SHA || null,
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
      }).catch((e) => console.warn('[app_erros_servidor]', e.message));
    } catch (_) { /* tabela ausente / supabase off · ignora */ }
  });
  next();
});

// ── Routes ──
app.use('/api/telemetry', require('./routes/systemTelemetry')); // Web Vitals anônimos, best-effort
app.use('/api/app', require('./routes/app'));               // Mobile app (sem auth ERP)
app.use('/api/auth/planning-center', require('./routes/authPlanningCenter'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/staff', require('./routes/staff'));           // App CBRio Staff (self-service do colaborador)
app.use('/api/comunicacao', require('./routes/comunicacao')); // Módulo Comunicação (WhatsApp central)
app.use('/api/revisoes', require('./routes/revisoes'));
app.use('/api/events', require('./routes/events'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/propostas', require('./routes/propostas')); // Ciclo anual de propostas (projetos/eventos/rotinas)
app.use('/api/tasks', require('./routes/tasks'));  // Kanban de tarefas transversal (Projetos/Eventos) · guard por módulo dentro do router
app.use('/api/expansion', require('./routes/expansion'));
app.use('/api/strategic', require('./routes/strategic'));
app.use('/api/meetings', require('./routes/meetings'));
app.use('/api/agents', require('./routes/agents'));
app.use('/api/rh', require('./routes/rh'));
app.use('/api/coberturas', require('./routes/coberturas'));
app.use('/api/pcs', require('./routes/pcs'));
app.use('/api/financeiro', require('./routes/financeiro'));
app.use('/api/financeiro-v2', require('./routes/financeiroV2'));
// Cron · registrar ANTES do /api/santander pra evitar collision com middleware authenticate
app.use('/api/santander/cron', require('./routes/santanderCron'));
app.use('/api/santander', require('./routes/santander'));
app.use('/api/logistica', require('./routes/logistica'));
app.use('/api/ml', require('./routes/ml'));
app.use('/api/arquivei', require('./routes/arquivei'));
app.use('/api/patrimonio', require('./routes/patrimonio'));
app.use('/api/cycles', require('./routes/cycles'));
app.use('/api/completions', require('./routes/completions'));
app.use('/api/events', require('./routes/reports'));
app.use('/api/occurrences', require('./routes/occurrences'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/notificacoes', require('./routes/notificacoes'));
app.use('/api/permissoes', require('./routes/permissoes'));
app.use('/api/membresia', require('./routes/membresia'));
app.use('/api/censo', require('./routes/censo'));   // Plataforma de pesquisas (censo demográfico/perfil/engajamento)
app.use('/api/links', require('./routes/links'));   // QR dinâmicos: o papel fica, o destino muda
app.use('/api/destaques', require('./routes/destaques'));
app.use('/api/batismo-fotos', require('./routes/batismoFotos'));
// Rate limit dedicado pros forms públicos (anti-spam · sem auth)
// Mais restritivo que o limiter global · 30 req/15min por IP em prod
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.PUBLIC_RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'production' ? 30 : 5000),
  message: { error: 'Muitas tentativas. Aguarde 15 minutos.' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
});
// NPS público montado ANTES do publicLimiter estrito (30/15min) · num culto o link
// é aberto por dezenas ao mesmo tempo. Como o Express casa a rota específica
// primeiro, o NPS não passa pelo teto de 30 · usa o limiter próprio (generoso) do
// routes/publicNps.js. Os demais forms públicos seguem no publicLimiter.
app.use('/api/public/nps', require('./routes/publicNps'));
// Redirecionador dos QR dinâmicos. Fora de /api de propósito: o endereço vai
// impresso em papel e `cbrio.org/r/censo` cabe num QR pequeno, que lê de longe.
// Fica ANTES de qualquer limiter — um culto inteiro escaneia o mesmo QR nos
// mesmos dois minutos, e derrubar isso por limite de taxa seria derrubar o
// próprio cartaz.
app.use('/r', require('./routes/redirecionador'));
// Censo público: MESMO motivo do NPS, elevado ao cubo — o censo é respondido por
// centenas de pessoas no mesmo culto, todas atrás do NAT do prédio. Limiter
// próprio (dois baldes: submissão generosa, lookup de CPF apertado).
app.use('/api/public/censo', require('./routes/publicCenso'));
// Convite de familiar (página de bounce /f/a/:codigo · só leitura do convite)
app.use('/api/public/familia', require('./routes/publicFamilia'));
// Pixel de abertura de e-mail (fora do publicLimiter · proxies carregam por 1 IP)
app.use('/api/public/vol-email', require('./routes/publicVolEmail'));
// Inscrição pública de grupos montada ANTES do publicLimiter estrito (30/15min):
// é o totem do lounge (1 IP, muitas inscrições num domingo cheio). Usa o limiter
// próprio generoso do routes/publicGrupos.js (mesma lógica do NPS acima).
app.use('/api/public/grupos', require('./routes/publicGrupos'));
// Eventos externos (Celebra etc.) montado ANTES do publicLimiter estrito:
// evento presencial em massa = 1 IP de Wi-Fi; a 31ª pessoa era bloqueada.
// Sem teto prático de inscrições (D9) · limiter próprio generoso no router.
app.use('/api/public/evento', require('./routes/publicEventoExterno'));
// As 4 portas de inscrição abaixo saíram do publicLimiter no sweep 28/07 —
// mesma razão do NPS/grupos/eventos: domingo no Wi-Fi da igreja é 1 IP só, e
// o teto de 30/15min derrubava o ~11º visitante (batismo consome 2-3 reqs por
// carga de form). Cada router tem limiter próprio generoso (600/15min · env
// PUBLIC_FORM_RATE_LIMIT_MAX); vol mantém 10/15min só no probing
// (lookup-cpf/request-login/register) e batismo no GET /acesso.
app.use('/api/public/voluntariado', require('./routes/publicVoluntariado'));
app.use('/api/public/next', require('./routes/publicNext'));
app.use('/api/public/batismo', require('./routes/publicBatismo'));
app.use('/api/public/apresentacao-criancas', require('./routes/publicApresentacao'));
// Membresia entrou no mesmo padrão no sweep do CENSO (2026-08-03): é a porta de
// PESSOA e o censo é escaneado pela igreja inteira no MESMO minuto do culto, por
// 1 IP só (WiFi/NAT). Ficava DEPOIS do publicLimiter (30/15min) somado ao teto
// próprio de 10/15min — que era compartilhado com os lookups do formulário, ou
// seja, o form morria por volta da 3ª pessoa. Limiters próprios (generoso na
// submissão · dedicado no probing) em routes/publicMembresia.js.
app.use('/api/public/membresia', require('./routes/publicMembresia'));
// Doação (Generosidade) montada ANTES do publicLimiter estrito: a página de
// pagamento faz POLLING do status, então sob o teto de 30/15min a pessoa tomaria
// 429 no meio do próprio pagamento. Limiter próprio generoso no router.
app.use('/api/public/generosidade', require('./routes/publicGenerosidade'));
app.use('/api/public', publicLimiter);

app.use('/api/public/rh-onboarding', require('./routes/publicRhOnboarding'));
app.use('/api/public/decisao-online', require('./routes/publicDecisaoOnline'));
// Webhook de pagamento (público · sem auth). Montado FORA de /api/public
// (escapa o publicLimiter de 30/15min) e isento do limiter global no skip()
// acima. Perder entrega aqui = pagamento aprovado sem inscrição confirmada.
app.use('/api/pagamentos-webhook', require('./routes/pagamentosWebhook'));
// Totem de autoatendimento · quem se autentica é o EQUIPAMENTO (header
// `x-totem-token`), não uma pessoa. Montado FORA de /api/public (escapa o
// publicLimiter de 30/15min · um domingo cheio é rajada legítima do mesmo
// dispositivo) e isento do limiter global no skip() acima; o teto real é por
// estação, dentro do router. Superfície deliberadamente mínima —
// ver o cabeçalho de routes/totem.js antes de acrescentar rota aqui.
app.use('/api/totem', require('./routes/totem'));
// Webhook WhatsApp (público · sem auth, fora do publicLimiter pra não
// perder entregas em rajada). Montado ANTES do admin /api/whatsapp.
app.use('/api/whatsapp/webhook', require('./routes/publicWhatsapp'));
app.use('/api/whatsapp', require('./routes/whatsapp'));
// Bot WhatsApp · grupos de conexão (cron estudo/lembretes + admin do estudo)
app.use('/api/whatsapp-grupos', require('./routes/whatsappGrupos'));
// Crons de disparo WhatsApp pra membros (aniversários etc · CRON_SECRET)
app.use('/api/whatsapp-cron', require('./routes/whatsappCron'));
app.use('/api/solicitacoes', require('./routes/solicitacoes'));
app.use('/api/producao', require('./routes/producao'));
app.use('/api/marketing', require('./routes/marketing'));
app.use('/api/cerebro', require('./routes/cerebro'));
app.use('/api/voluntariado', require('./routes/voluntariado'));
app.use('/api/voluntariado', require('./routes/voluntariado-sync'));
app.use('/api/face', require('./routes/face'));
app.use('/api/tutorial', require('./routes/tutorial'));
app.use('/api/grupos', require('./routes/grupos'));
app.use('/api/kpis/v2', require('./routes/kpisV2'));
app.use('/api/kpis', require('./routes/kpis'));
app.use('/api/online', require('./routes/online'));
app.use('/api/wifi', require('./routes/wifi'));
app.use('/api/cuidados', require('./routes/cuidados'));
app.use('/api/next-convite', require('./routes/nextConvite'));
app.use('/api/wa-inbox', require('./routes/waInbox'));
app.use('/api/agente-primeiro-contato', require('./routes/agentePrimeiroContato'));
app.use('/api/monitor-automacoes', require('./routes/monitorAutomacoes'));
app.use('/api/agente-voluntariado', require('./routes/agenteVoluntariado'));
app.use('/api/agente-batismo-next', require('./routes/agenteBatismoNext'));
app.use('/api/integracao', require('./routes/integracao'));
app.use('/api/relatorios', require('./routes/relatorios'));
app.use('/api/eventos-externos', require('./routes/eventosExternos'));
app.use('/api/inscricoes', require('./routes/inscricoes')); // Módulo central de inscrições (espinha · F3.2)
app.use('/api/next', require('./routes/next'));
const entradasRouter = require('./routes/nextBatismo');
app.use('/api/entradas', entradasRouter);
app.use('/api/next-batismo', entradasRouter); // alias legado (nome antigo · bundles em cache / bookmarks)
app.use('/api/governanca', require('./routes/governanca'));
app.use('/api/processos', require('./routes/processos'));
app.use('/api/tarefas', require('./routes/tarefas'));
app.use('/api/jornada', require('./routes/jornada'));
app.use('/api/encaminhamentos', require('./routes/encaminhamentos'));
app.use('/api/devocionais', require('./routes/devocionais'));
app.use('/api/devocional-planos', require('./routes/devocionalPlanos'));
app.use('/api/devocional-membro', require('./routes/devocionalMembro'));
app.use('/api/public/devocional', require('./routes/publicDevocional'));
app.use('/api/bible', require('./routes/bible'));
app.use('/api/pessoas', require('./routes/pessoas'));
app.use('/api/nsm', require('./routes/nsm'));
app.use('/api/painel', require('./routes/painel'));
app.use('/api/painel-area', require('./routes/painelArea'));
app.use('/api/app-analytics', require('./routes/appAnalytics'));
app.use('/api/sistema', require('./routes/sistema'));
app.use('/api/sistema', require('./routes/sistemaV1').router);
app.use('/api/comunicados', require('./routes/comunicados'));
app.use('/api/totem-kids', require('./routes/totemKids'));
app.use('/api/estrategia', require('./routes/estrategia'));
app.use('/api/ritual', require('./routes/ritual'));
app.use('/api/gestao', require('./routes/gestao'));
app.use('/api/dados-brutos', require('./routes/dadosBrutos'));
app.use('/api/dashboard-semanal', require('./routes/dashboardSemanal'));
app.use('/api/nps', require('./routes/nps'));
// (/api/public/nps montado acima, antes do publicLimiter estrito)
app.use('/api/planejamento', require('./routes/planejamento'));
// Apresentações: módulo DESATIVADO (2026-07-06 · pedido do Matheus) — mount comentado.
// app.use('/api/apresentacoes', require('./routes/apresentacoes'));
app.use('/api/lgpd', require('./routes/lgpd'));
app.use('/api/feedback', require('./routes/feedback'));

// ── Health check ──
// Inclui status do Supabase client pra diagnóstico de "Não autorizado" em prod
app.get('/api/health', (req, res) => {
  const { supabase } = require('./utils/supabase');
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    supabase_client: !!supabase,
    supabase_url_set: !!process.env.SUPABASE_URL,
    supabase_service_role_set: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    database_url_set: !!process.env.DATABASE_URL,
    node_env: process.env.NODE_ENV || 'unknown',
  });
});

// ── API 404 (evita fallback HTML para rotas inexistentes) ──
app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'Endpoint de API não encontrado',
    path: req.originalUrl,
    method: req.method,
    request_id: req.requestId,
  });
});

// ── Serve frontend in production ──
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'public')));
  app.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

// ── Sentry error handler (precisa vir antes do nosso) ──
app.use(sentryErrorHandler());

// ── Error handler canônico ──
// Preserva causa/stack de falhas inesperadas, responde AppError 4xx sem poluir
// a telemetria de servidor e nunca expõe a mensagem técnica ao cliente.
app.use(createErrorHandler());

if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`[CBRio PMO] Servidor rodando na porta ${PORT}`);
    console.log(`[CBRio PMO] Ambiente: ${process.env.NODE_ENV || 'development'}`);
  });
}

module.exports = app;
