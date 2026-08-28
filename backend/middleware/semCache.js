// ============================================================================
// Resposta que NUNCA é cacheada — pra rota que devolve ESTADO.
//
// ⚠️⚠️ A LEI: cache condicional é pra CONTEÚDO, não pra ESTADO. Quando o corpo
// responde "esta cobrança já foi paga?" ou "o que falta no meu cadastro?", servir
// a versão anterior é sempre errado — e é errado justamente no instante que
// importa, que é quando o estado acabou de mudar.
//
// ── O incidente que originou isto (05/08/2026 · app dos membros) ──
// O Matheus completava o cadastro, recebia o código, confirmava — e voltava pra
// tela "Vamos confirmar quem você é". A Joana tentou 3× em 2 minutos. Os dois
// com o vínculo JÁ criado no banco: o servidor respondia `completo: true` e a
// tela não passava. Medido nos runtime logs: 124 de 251 respostas de
// `/api/app/*` em 6h eram 304.
//
// CAUSA: `res.json` do Express gera **ETag** e não manda `Cache-Control`. Sem
// `Cache-Control`, o cache do cliente ainda pode aplicar frescor HEURÍSTICO e
// servir do cache sem nem perguntar; e quando pergunta, o Express responde
// **304 sem corpo** e a camada de cache entrega ao JS a resposta ANTERIOR.
//
// ⚠️ `Cache-Control: no-store` SOZINHO NÃO RESOLVE: o `req.fresh` do Express
// compara o `If-None-Match` do REQUEST com o ETag da RESPOSTA e devolve 304 do
// mesmo jeito. Quem mata o 304 é **não emitir validador** — por isso `res.json`
// passa a responder por `res.end`, que não gera ETag.
//
// ⚠️ E NÃO "otimizar" devolvendo ETag numa rota destas depois. O ganho seria
// alguns bytes; o custo é a tela mostrando o estado de antes do pagamento.
// ============================================================================

/**
 * Middleware. Use no router inteiro quando TUDO ali é estado, ou com prefixo
 * (`router.use('/pagamento', semCache)`) quando o router também serve conteúdo
 * que se beneficia de cache.
 */
function semCache(_req, res, next) {
  res.set('Cache-Control', 'no-store');
  res.json = (body) => {
    if (!res.get('Content-Type')) res.type('application/json');
    res.end(JSON.stringify(body));
    return res;
  };
  next();
}

module.exports = { semCache };
