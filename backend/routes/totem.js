// ============================================================================
// Totem · rotas do DISPOSITIVO (2026-08-05 · Fase 0)
//
// Montado FORA de `/api/public` (escapa o publicLimiter de 30/15min) e sem
// `authenticate`: quem se autentica aqui é o EQUIPAMENTO, pelo header
// `x-totem-token`. Ver backend/middleware/totemEstacao.js.
//
// ⚠️ Superfície mínima e é assim que tem que ficar. Um PC de hall é
// fisicamente acessível e o token é extraível por quem senta na frente dele —
// então o token roubado tem que valer quase nada. NÃO acrescentar aqui:
// listagem de gente, lookup por CPF, export, ou qualquer coisa que responda
// "quem é o dono deste documento". O ganho seria pré-preencher 4 campos; o
// custo seria um oráculo CPF → nome/telefone da igreja inteira, de graça.
// ============================================================================

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const servico = require('../services/totemEstacao');
const { autenticarEstacao } = require('../middleware/totemEstacao');

// ⚠️ O pareamento é o único endpoint adivinhável (código de 8 caracteres) e
// por isso é o único com teto estrito. 32^8 ≈ 1,1 trilhão de combinações numa
// janela de 15 min já é inviável, mas sem teto uma máquina tentaria milhões de
// vezes por hora e o custo seria nosso.
const limiterPareamento = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.TOTEM_PAREAMENTO_RATE_LIMIT_MAX, 10) || 20,
  message: { error: 'Muitas tentativas de pareamento. Aguarde alguns minutos.' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
});

// Teto por ESTAÇÃO, não por IP: todos os totens da igreja saem pelo mesmo NAT,
// então limite por IP puniria o totem 2 pelo uso do totem 1.
const limiterEstacao = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.TOTEM_RATE_LIMIT_MAX, 10) || 2000,
  keyGenerator: (req) => req.headers['x-totem-token']
    ? servico.hashToken(req.headers['x-totem-token']).slice(0, 32)
    : `ip:${req.ip}`,
  message: { error: 'Muitas requisições deste totem.' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/totem/parear
 * Body: { codigo, tipo?: 'dispositivo'|'agente', rotulo? }
 * Troca o código de uso único (digitado pelo voluntário) pelo segredo do
 * dispositivo. O segredo é devolvido UMA vez e nunca mais.
 */
router.post('/parear', limiterPareamento, async (req, res) => {
  try {
    const tipo = req.body?.tipo === 'agente' ? 'agente' : 'dispositivo';
    const r = await servico.parear({
      codigo: req.body?.codigo,
      tipo,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      rotulo: req.body?.rotulo,
    });

    if (!r.ok) {
      // Resposta NEUTRA de propósito: código errado, expirado e já usado
      // respondem igual, pra não virar oráculo de código válido.
      const texto = r.motivo === 'estacao_indisponivel'
        ? 'Esta estação está desligada. Fale com a equipe.'
        : 'Código inválido ou expirado. Peça um novo à equipe.';
      return res.status(400).json({ error: texto, reason: r.motivo });
    }

    res.json({
      ok: true,
      token: r.segredo,          // ⚠️ única vez que ele existe na rede
      linhagem: r.token.linhagem,
      expira_em: r.token.expira_em,
      estacao: r.estacao,
    });
  } catch (e) {
    console.error('[totem] parear:', e.message);
    res.status(500).json({ error: 'Erro ao parear o dispositivo' });
  }
});

/**
 * GET /api/totem/eu
 * Quem sou eu (estação pareada) + serve de heartbeat: o middleware já bate o
 * ponto, com throttle de 60s. É o endpoint que a tela de atração chama de
 * tempo em tempo pra saber se ainda está autorizada — e é o que faz a
 * revogação virar tela de pareamento em ≤60s.
 */
router.get('/eu', limiterEstacao, autenticarEstacao('dispositivo'), (req, res) => {
  res.json({ ok: true, estacao: req.estacao, servidor_em: new Date().toISOString() });
});

module.exports = router;
