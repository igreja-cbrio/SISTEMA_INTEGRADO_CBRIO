// ============================================================================
// Totem · pareamento do AGENTE DO PINPAD (2026-08-05)
//
// ⚠️ Esta rota NÃO é o caminho do totem de inscrições. As inscrições de evento
// vivem dentro do Totem Membro (`/totem` · MENU_OPTIONS de TotemMembro.tsx),
// que já está autenticado por conta de quiosque — lá a estação é resolvida no
// servidor por `totemEstacao.estacaoDaConta(req.user.id)` e não há nada a
// parear no navegador.
//
// O que sobra aqui é o único cliente que NÃO tem sessão de usuário: o agente
// do pinpad (serviço Windows · Fase 3 do plano de pagamento presencial). Ele
// troca o código de uso único gerado pela equipe por um segredo próprio, e
// depois se autentica por HMAC nas rotas de comando (que chegam na Fase 2).
//
// Montado FORA de `/api/public` (escapa o publicLimiter de 30/15min) e isento
// do limiter global no `skip()` do server.js — 429 no caminho do pinpad é
// cartão passado sem inscrição confirmada.
// ============================================================================

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const servico = require('../services/totemEstacao');

// ⚠️ Único endpoint adivinhável do sistema (código de 8 caracteres), e por isso
// o único com teto estrito. 32^8 ≈ 1,1 trilhão de combinações numa janela de 15
// min já é inviável, mas sem teto uma máquina tentaria milhões de vezes por
// hora e o custo seria nosso.
const limiterPareamento = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.TOTEM_PAREAMENTO_RATE_LIMIT_MAX, 10) || 20,
  message: { error: 'Muitas tentativas de pareamento. Aguarde alguns minutos.' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/totem/parear
 * Body: { codigo, rotulo? }
 * Troca o código de uso único (gerado em Inscrições → Totens) pelo segredo do
 * agente. O segredo é devolvido UMA vez e nunca mais — perdeu, gera outro.
 */
router.post('/parear', limiterPareamento, async (req, res) => {
  try {
    // Sempre 'agente': o tipo 'dispositivo' existe no CHECK como vocabulário
    // morto (era o quiosque paralelo, removido em 05/08). Aceitar o tipo do
    // corpo do request só reabriria aquele caminho por acidente.
    const r = await servico.parear({
      codigo: req.body?.codigo,
      tipo: 'agente',
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
    res.status(500).json({ error: 'Erro ao parear o agente' });
  }
});

module.exports = router;
