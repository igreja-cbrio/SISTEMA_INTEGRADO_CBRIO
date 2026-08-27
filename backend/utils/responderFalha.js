// ============================================================================
// Como uma rota responde 500 SEM apagar o diagnóstico.
//
// ⚠️ O padrão que dominava o backend em 27/08/2026 era este:
//
//     } catch (e) { res.status(500).json({ error: 'Erro ao fazer X' }); }
//
// — e ele **destrói o motivo**. Medido: **791 blocos assim** (60 arquivos). O
// coletor de erros (`server.js`) via só o status, gravava "HTTP 500 (sem exceção
// · ver logs da função)", e o agente de incidente — que lê exatamente essa
// coluna — só conseguia concluir *"falha silenciosa na lógica de negócio"*.
//
// O `fetch` do cliente do Supabase já captura sozinho toda falha de PostgREST
// (`utils/supabase.js`), então a maioria dos 500 passou a ter motivo sem tocar em
// nada. Este helper é pro resto: erro que NASCE FORA do banco (bug de JS,
// integração externa, JSON inválido).
//
//     } catch (e) { return falhaInterna(res, 'Erro ao dar baixa em massa', e); }
//
// ⚠️ O texto público NÃO muda: quem está clicando continua lendo a mesma frase.
// O que muda é que o motivo passa a existir em algum lugar.
// ============================================================================
const { sanitizarMotivo } = require('./motivoFalha');

/**
 * Responde erro de servidor e ENTREGA o motivo ao coletor.
 *
 * @param res     resposta do Express
 * @param publico frase que a pessoa lê (não muda o contrato da tela)
 * @param erro    o `e` do catch
 * @param opts.status         default 500
 * @param opts.exporDetalhe   manda `detalhe` no corpo (default false — corpo de
 *                            erro é lido pelo cliente, e mensagem de banco pode
 *                            carregar nome de coluna/constraint. Ligar só onde a
 *                            tela é interna e o detalhe ajuda quem opera.)
 */
function falhaInterna(res, publico, erro, opts = {}) {
  const status = Number(opts.status) || 500;
  try {
    if (res?.locals) {
      // ⚠️ Guardado CRU aqui; quem sanitiza é `montarMensagemFalha`, no ponto de
      // gravação. Sanitizar duas vezes em lugares diferentes é como as duas
      // pontas passam a discordar do que foi mascarado.
      res.locals.motivoFalha = erro?.message || String(erro || '');
      res.locals.codigoFalha = erro?.code || '';
      // O stack alimenta o `code_context` do agente (ele extrai arquivo/linha).
      if (erro?.stack) res.locals.stackFalha = String(erro.stack).slice(0, 6000);
    }
  } catch { /* nunca impedir a resposta por causa de telemetria */ }
  const corpo = { error: publico };
  if (opts.exporDetalhe && erro?.message) corpo.detalhe = sanitizarMotivo(erro.message, 300);
  return res.status(status).json(corpo);
}

module.exports = { falhaInterna };
