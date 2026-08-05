// ============================================================================
// Middleware · autenticação do AGENTE DO PINPAD por estação (2026-08-05)
//
// ⚠️ SEM CHAMADOR HOJE, de propósito: ele existe pro agente do pinpad (serviço
// Windows · Fase 2/3), que é o único cliente sem sessão de usuário. O totem de
// inscrições NÃO passa por aqui — ele vive dentro do Totem Membro, já logado na
// conta de quiosque, e a estação sai de `totemEstacao.estacaoDaConta`.
// Se em algum momento isto continuar sem chamador e a Fase 2 tiver sido
// descartada, apagar em vez de deixar middleware de auth órfão no repo.
//
// ⚠️ Header DEDICADO (`x-totem-token`), NUNCA `Authorization`. O token de
// estação não pode encostar no caminho de `authenticate`/`authorizeModule`
// (backend/middleware/auth.js): ele não é sessão de pessoa, não tem cargo, não
// tem área, e um dia em que alguém "unificar" isso o totem passa a herdar
// permissão de módulo — que é exatamente o que este desenho existe pra evitar.
//
// Popula SÓ `req.estacao` (projeção pública) e `req.estacaoInterna`/
// `req.estacaoToken` pra quem precisa dos campos de configuração.
// NUNCA popula `req.user`.
// ============================================================================

const servico = require('../services/totemEstacao');

// Motivos em que a credencial guardada no dispositivo não serve mais e o front
// deve APAGAR o localStorage e voltar pra tela de pareamento.
const MOTIVOS_LIMPAR = new Set(['token_invalido', 'token_expirado', 'estacao_revogada']);

const TEXTO = {
  token_ausente: 'Este dispositivo não está pareado.',
  token_invalido: 'Este dispositivo não está pareado.',
  token_expirado: 'O pareamento deste dispositivo expirou.',
  estacao_revogada: 'Este dispositivo foi desligado pela equipe.',
  // ⚠️ Mensagem própria e SEM limpar o token: a credencial está boa, o lugar é
  // que está errado. Limpar aqui empurraria o voluntário pra repareamento, que
  // também não funcionaria fora da rede da igreja — e ele não teria como saber.
  ip_nao_permitido: 'Este dispositivo só funciona na rede da igreja.',
};

function extrairToken(req) {
  const h = req.headers['x-totem-token'];
  if (typeof h === 'string' && h.trim()) return h.trim();
  return null;
}

// tipo: 'dispositivo' (navegador do totem) | 'agente' (serviço do pinpad)
function autenticarEstacao(tipo = 'dispositivo') {
  return async function (req, res, next) {
    const token = extrairToken(req);
    if (!token) {
      return res.status(401).json({
        error: TEXTO.token_ausente, reason: 'token_ausente', limpar_credencial: true,
      });
    }

    let r;
    try {
      r = await servico.resolverToken(token, { ip: req.ip, tipo });
    } catch (e) {
      // Falha de INFRA não é credencial inválida. Devolver 401 aqui faria o
      // front apagar o pareamento por causa de uma indisponibilidade do banco —
      // e o totem exigiria repareamento manual num domingo por nada.
      console.error('[totem-estacao] falha ao resolver token:', e.message);
      return res.status(503).json({ error: 'Instabilidade momentânea. Tente de novo.', reason: 'indisponivel' });
    }

    if (!r.ok) {
      return res.status(401).json({
        error: TEXTO[r.motivo] || TEXTO.token_invalido,
        reason: r.motivo,
        limpar_credencial: MOTIVOS_LIMPAR.has(r.motivo),
      });
    }

    req.estacaoInterna = r.estacao;
    req.estacaoToken = r.token;
    req.estacao = servico.publico(r.estacao);

    // Heartbeat oportunista (com throttle de 60s dentro do serviço): toda
    // request já prova que o dispositivo está vivo, então um endpoint dedicado
    // de heartbeat seria round-trip a mais pra saber o que já sabemos.
    servico.heartbeat(r.estacao, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      versao: req.headers['x-totem-versao'],
    }).catch((e) => console.warn('[totem-estacao] heartbeat:', e.message));

    next();
  };
}

module.exports = { autenticarEstacao, extrairToken, MOTIVOS_LIMPAR };
