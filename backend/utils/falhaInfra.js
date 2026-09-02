// ════════════════════════════════════════════════════════════════════════════
//  "Isto é o banco fora, ou é o token da pessoa?" — régua PURA
//
//  Incidente de 02/09/2026: o Supabase morreu às 14:58 UTC e ficou 1h34 fora.
//  Durante a queda, `supabase.auth.getUser(token)` falhava por REDE — e o
//  `authenticate` tratava qualquer erro como token ruim, devolvendo **401**.
//  Medido: 442 respostas dizendo "sessão expirada" para gente cujo token
//  estava perfeito. As pessoas tentaram relogar (o que também não funcionava,
//  porque o login fala direto com o Auth) e concluíram que a conta delas tinha
//  problema.
//
//  ⚠️ 401 e 503 mandam a pessoa fazer coisas OPOSTAS: 401 diz "faça login de
//  novo"; 503 diz "não é você, é o sistema — espere". Errar o código de status
//  aqui é dar a instrução errada no pior momento possível.
//
//  Vive em utils/ e sem dependência nenhuma porque decide o que a pessoa lê na
//  tela, e isso tem que ser testável sem banco, sem rede e sem Supabase.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Nome que o supabase-js dá ao erro de rede/5xx. É o sinal MAIS FORTE que
 * existe aqui — a própria biblioteca já classificou como "tente de novo".
 */
const NOME_RETRIABLE = 'AuthRetryableFetchError';

/**
 * Marcas de falha de INFRA no texto do erro.
 * ⚠️ A lista saiu do que aparece de verdade: `fetch failed` é o que o undici
 * (Node 18+) emite quando a conexão morre, e foi literalmente o que apareceu
 * hoje; `522` é o código do Cloudflare na frente do Supabase; `Connection
 * terminated` é o do pooler.
 */
const MARCAS_INFRA = [
  'fetch failed', 'network', 'econnrefused', 'econnreset', 'etimedout',
  'enotfound', 'eai_again', 'socket hang up', 'timeout', 'timed out',
  'aborted', 'connection terminated', 'connection closed', 'und_err',
  '502', '503', '504', '522', '524', 'bad gateway', 'service unavailable',
  'gateway timeout', 'upstream',
];

/**
 * O erro é de INFRA (o sistema não conseguiu perguntar) e não de CREDENCIAL
 * (perguntou, e a resposta foi "não")?
 *
 * ⚠️⚠️ FAIL-CLOSED PARA O 401: na dúvida devolve `false` (= trata como
 * problema de token). Chamar de "instabilidade" um token de fato inválido
 * seria dizer à pessoa que o sistema está fora quando o acesso dela é que
 * acabou — e, pior, esconderia credencial revogada atrás de uma mensagem de
 * indisponibilidade. Só afirma "é o sistema" com SINAL, nunca por ausência.
 */
function ehFalhaDeInfra(erro) {
  if (!erro || typeof erro !== 'object') return false;

  if (erro.name === NOME_RETRIABLE) return true;

  // ⚠️ `status` do supabase-js é o HTTP da resposta do Auth. 5xx é servidor;
  // 0 é "não houve resposta". 4xx é resposta legítima sobre a credencial e
  // NUNCA entra aqui.
  const status = Number(erro.status);
  if (Number.isFinite(status) && (status >= 500 || status === 0)) return true;

  // `cause` é onde o undici guarda o erro real (o de cima vira "fetch failed").
  const texto = [erro.message, erro.code, erro.cause?.message, erro.cause?.code]
    .filter(Boolean).join(' ').toLowerCase();
  if (!texto) return false;

  return MARCAS_INFRA.some((m) => texto.includes(m));
}

/**
 * O par (status HTTP, corpo) que a rota deve responder.
 * ⚠️ `retry_apos_seg` existe para o cliente NÃO martelar: sem ele, cada aba
 * volta a bater de 30 em 30 segundos e ajuda a afogar um banco que está
 * justamente tentando levantar.
 */
function respostaDeFalhaAuth(erro) {
  if (ehFalhaDeInfra(erro)) {
    return {
      status: 503,
      corpo: {
        error: 'O sistema está temporariamente indisponível. Não é a sua conta — aguarde um instante.',
        reason: 'banco_indisponivel',
        retry_apos_seg: 30,
      },
    };
  }
  return {
    status: 401,
    corpo: { error: 'Token inválido ou expirado', reason: 'invalid_token' },
  };
}

module.exports = { ehFalhaDeInfra, respostaDeFalhaAuth, MARCAS_INFRA };
