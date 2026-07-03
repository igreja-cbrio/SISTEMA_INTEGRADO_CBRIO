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

const app = express();
// Atrás do proxy do Vercel (1 hop) · faz req.ip = IP real do cliente (x-forwarded-for)
// em vez do IP do proxy. Necessário pro rate-limit chavear por usuário e não tratar
// todo mundo como o mesmo IP. ('1' e não 'true' · evita spoofing e o warning do express-rate-limit.)
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3001;

// Request handler do Sentry (precisa vir antes de qualquer middleware
// e antes das rotas para capturar request data nos eventos).
app.use(sentryRequestHandler());

// ── Security middleware ──
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
// Domínios extras configuraveis via env (CSV) · ex: EXTRA_ALLOWED_ORIGINS="https://x.com,https://y.com"
const extraOrigins = (process.env.EXTRA_ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow same-origin (no origin header) and known domains
    const allowed = [
      'http://localhost:5173',
      'http://localhost:8080',
      process.env.FRONTEND_URL,
      ...extraOrigins,
    ].filter(Boolean);
    if (
      !origin ||
      allowed.includes(origin) ||
      /\.vercel\.app$/.test(origin) ||
      /\.lovable\.app$/.test(origin) ||
      /\.lovableproject\.com$/.test(origin) ||
      // Domínio próprio CBRio · cbrio.org + qualquer subdominio
      /^https:\/\/(.+\.)?cbrio\.org$/.test(origin)
    ) {
      callback(null, true);
    } else {
      console.warn('[CORS] Origem bloqueada:', origin);
      callback(new Error('Origem não permitida pelo CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'production' ? 500 : 5000),
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
  // Isenta o NPS público do teto global · num culto, 100 pessoas no MESMO WiFi
  // (1 IP público) estourariam o limite por-IP. O NPS público tem limiter próprio
  // generoso (ver mount abaixo · routes/publicNps.js).
  skip: (req) => process.env.NODE_ENV !== 'production' || req.path.startsWith('/api/public/nps'),
}));
app.use(hpp());
app.use(compression());
// rawBody capturado pra validar HMAC do webhook do WhatsApp (X-Hub-Signature-256)
app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

// ── Telemetria de 500 (aba "Erros do servidor" do Feedback) ──
// O error handler global só vê exceções NÃO tratadas; a maioria dos 500 reais
// é respondida pela própria rota (res.status(500).json(...)) e ficava
// invisível — "nenhum erro" na tela era falso. Este hook registra QUALQUER
// resposta >= 500 no finish; o error handler marca res.locals pra não duplicar.
app.use((req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode < 500 || res.locals._erro500Registrado) return;
    try {
      const { supabase } = require('./utils/supabase');
      supabase.from('app_erros_servidor').insert({
        user_id: req.user?.id || null,
        user_email: req.user?.email || null,
        metodo: req.method,
        rota: String(req.path || req.originalUrl || '').slice(0, 300),
        mensagem: `HTTP ${res.statusCode} respondido pela rota (sem exceção · ver logs da função)`,
        status: res.statusCode,
      }).then(() => {}, (e) => console.warn('[app_erros_servidor]', e.message));
    } catch (_) { /* tabela ausente / supabase off · ignora */ }
  });
  next();
});

// ── Routes ──
app.use('/api/app', require('./routes/app'));               // Mobile app (sem auth ERP)
app.use('/api/auth/planning-center', require('./routes/authPlanningCenter'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/revisoes', require('./routes/revisoes'));
app.use('/api/events', require('./routes/events'));
app.use('/api/projects', require('./routes/projects'));
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
app.use('/api/public', publicLimiter);

app.use('/api/public/membresia', require('./routes/publicMembresia'));
app.use('/api/public/voluntariado', require('./routes/publicVoluntariado'));
app.use('/api/public/next', require('./routes/publicNext'));
app.use('/api/public/grupos', require('./routes/publicGrupos'));
app.use('/api/public/batismo', require('./routes/publicBatismo'));
app.use('/api/public/apresentacao-criancas', require('./routes/publicApresentacao'));
app.use('/api/public/evento', require('./routes/publicEventoExterno'));
app.use('/api/public/decisao-online', require('./routes/publicDecisaoOnline'));
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
app.use('/api/agente-primeiro-contato', require('./routes/agentePrimeiroContato'));
app.use('/api/monitor-automacoes', require('./routes/monitorAutomacoes'));
app.use('/api/agente-voluntariado', require('./routes/agenteVoluntariado'));
app.use('/api/agente-batismo-next', require('./routes/agenteBatismoNext'));
app.use('/api/integracao', require('./routes/integracao'));
app.use('/api/relatorios', require('./routes/relatorios'));
app.use('/api/eventos-externos', require('./routes/eventosExternos'));
app.use('/api/next', require('./routes/next'));
app.use('/api/next-batismo', require('./routes/nextBatismo'));
app.use('/api/governanca', require('./routes/governanca'));
app.use('/api/processos', require('./routes/processos'));
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
app.use('/api/apresentacoes', require('./routes/apresentacoes'));
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

// ── Error handler ──
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.locals._erro500Registrado = true; // o hook de finish não duplica este registro
  // Sink de telemetria (Onda 0) · fire-and-forget · NUNCA quebra a resposta ·
  // sem query/body pra não vazar PII (só rota, método, mensagem e stack).
  try {
    const { supabase } = require('./utils/supabase');
    supabase.from('app_erros_servidor').insert({
      user_id: req.user?.id || null,
      user_email: req.user?.email || null,
      metodo: req.method,
      rota: String(req.path || req.originalUrl || '').slice(0, 300),
      mensagem: String(err.message || '').slice(0, 1000),
      stack: String(err.stack || '').slice(0, 4000),
      status: err.status || 500,
    }).then(() => {}, (e) => console.warn('[app_erros_servidor]', e.message));
  } catch (_) { /* tabela ausente / supabase off · ignora */ }
  res.status(500).json({ error: 'Erro interno do servidor' });
});

if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`[CBRio PMO] Servidor rodando na porta ${PORT}`);
    console.log(`[CBRio PMO] Ambiente: ${process.env.NODE_ENV || 'development'}`);
  });
}

module.exports = app;
