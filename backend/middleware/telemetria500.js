// ============================================================================
// Telemetria de 500 (alimenta a aba "Erros do servidor" e o AGENTE de incidente).
//
// O error handler global só vê exceções NÃO tratadas; a maioria dos 500 reais é
// respondida pela própria rota (`res.status(500).json(...)`) e ficava invisível —
// "nenhum erro" na tela era falso. Este hook registra QUALQUER resposta >= 500 no
// `finish`; o error handler marca `res.locals._erro500Registrado` pra não duplicar.
//
// ⚠️ Extraído do `server.js` em 27/08/2026 pra poder ser TESTADO: a cadeia
// "motivo real → coletor → agente" é o caminho 3 escolhido pelo Matheus, e ela
// não pode depender de subir o app inteiro pra ser verificada.
// ============================================================================
const { requestRoute } = require('./errorHandler');
const { recordServerError } = require('../services/serverErrorTelemetry');
const { montarMensagemFalha } = require('../utils/motivoFalha');
const { falhaDbDaRequisicao } = require('../utils/contextoFalha');

/**
 * ⚠️⚠️ DE ONDE SAI O MOTIVO, em ordem de confiança:
 *   1. `res.locals.motivoFalha` — a rota ENTREGOU o motivo (`falhaInterna`);
 *   2. a última falha de PostgREST vista NESTA requisição, anotada pelo fetch do
 *      cliente do Supabase — é ela que cobre os **791 blocos `catch` mudos** do
 *      backend sem editar um por um.
 * Sem nenhuma das duas, a mensagem fica IDÊNTICA à de antes.
 *
 * Era essa cegueira que fazia o agente de incidente concluir eternamente "falha
 * silenciosa" e marcar `decision_required: true` — o que fecha a porta da
 * correção automática (0 propostas em 18 diagnósticos, medido em 27/08).
 */
function motivoDaResposta(res) {
  const daRota = res?.locals?.motivoFalha;
  if (daRota) return { motivo: daRota, codigo: res?.locals?.codigoFalha || '' };
  const doBanco = falhaDbDaRequisicao();
  if (doBanco?.motivo) return { motivo: doBanco.motivo, codigo: doBanco.codigo || '' };
  return {};
}

function criarTelemetria500({ recordError = recordServerError, logger = console } = {}) {
  return function telemetria500(req, res, next) {
    res.on('finish', () => {
      if (res.statusCode < 500 || res.locals._erro500Registrado) return;
      try {
        void Promise.resolve(recordError({
          user_id: req.user?.id || null,
          user_email: req.user?.email || null,
          metodo: req.method,
          rota: requestRoute(req),
          mensagem: montarMensagemFalha({ status: res.statusCode, ...motivoDaResposta(res) }),
          // O stack só existe quando a rota o entrega — e é ele que alimenta o
          // `code_context` do agente. Sem ele fica null, como antes.
          stack: res.locals?.stackFalha || null,
          status: res.statusCode,
          request_id: req.requestId,
          release: process.env.VERCEL_GIT_COMMIT_SHA || null,
          environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
        })).catch((e) => logger.warn?.('[app_erros_servidor]', e.message));
      } catch (_) { /* tabela ausente / supabase off · ignora */ }
    });
    next();
  };
}

module.exports = { criarTelemetria500, motivoDaResposta };
