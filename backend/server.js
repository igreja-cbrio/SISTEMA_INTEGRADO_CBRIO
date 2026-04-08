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
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
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
app.use('/api/auth', require('./routes/auth'));
app.use('/api/events', require('./routes/events'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/expansion', require('./routes/expansion'));
app.use('/api/meetings', require('./routes/meetings'));
app.use('/api/agents', require('./routes/agents'));
app.use('/api/rh', require('./routes/rh'));
app.use('/api/financeiro', require('./routes/financeiro'));
app.use('/api/logistica', require('./routes/logistica'));
app.use('/api/patrimonio', require('./routes/patrimonio'));

// ── Health check ──
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Serve frontend in production ──
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
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
