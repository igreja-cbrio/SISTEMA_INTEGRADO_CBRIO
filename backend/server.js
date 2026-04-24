require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// ── Security middleware ──
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({
  origin: function (origin, callback) {
    // Allow same-origin (no origin header) and known domains
    const allowed = [
      'http://localhost:5173',
      'http://localhost:8080',
      process.env.FRONTEND_URL,
    ].filter(Boolean);
    if (!origin || allowed.includes(origin) || /\.vercel\.app$/.test(origin) || /\.lovable\.app$/.test(origin) || /\.lovableproject\.com$/.test(origin)) {
      callback(null, true);
    } else {
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
  skip: () => process.env.NODE_ENV !== 'production',
}));
app.use(hpp());
app.use(compression());
app.use(express.json({ limit: '1mb' }));
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

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
app.use('/api/financeiro', require('./routes/financeiro'));
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
app.use('/api/public/membresia', require('./routes/publicMembresia'));
app.use('/api/public/voluntariado', require('./routes/publicVoluntariado'));
app.use('/api/solicitacoes', require('./routes/solicitacoes'));
app.use('/api/cerebro', require('./routes/cerebro'));
app.use('/api/voluntariado', require('./routes/voluntariado'));
app.use('/api/voluntariado', require('./routes/voluntariado-sync'));
app.use('/api/grupos', require('./routes/grupos'));
app.use('/api/kpis', require('./routes/kpis'));
app.use('/api/cuidados', require('./routes/cuidados'));
app.use('/api/integracao', require('./routes/integracao'));
app.use('/api/governanca', require('./routes/governanca'));

// ── Health check ──
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

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

// ── Error handler ──
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`[CBRio PMO] Servidor rodando na porta ${PORT}`);
    console.log(`[CBRio PMO] Ambiente: ${process.env.NODE_ENV || 'development'}`);
  });
}

module.exports = app;
