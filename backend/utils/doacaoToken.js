// ════════════════════════════════════════════════════════════════════════════
//  DOAÇÃO · token de PREFILL do /doar aberto pelo app
//
//  Pedido do Matheus (01/09/2026): *"está pedindo nome, e-mail, celular e CPF —
//  sendo que a pessoa não precisa preencher isso tudo, pois no app já tem essas
//  informações dela. Preciso que essa tela já venha com essas informações."*
//
//  O app abre `/doar` no navegador (é assim que a doação sai do app sem cair na
//  guideline 3.2.2(iv) da Apple). A página é PÚBLICA, então precisa de uma prova
//  de quem abriu — e a prova é este token, emitido para a sessão autenticada.
//
//  ⚠️⚠️ DIFERENÇA DELIBERADA em relação ao `censoToken`: aquele é PERMANENTE (o
//  link vai por WhatsApp e tem de valer semanas). Este EXPIRA em minutos, porque
//  ele nasce no toque do botão e é usado no segundo seguinte. Token de prefill
//  vive na URL — e URL vai pro histórico do navegador, pro print e pro grupo de
//  WhatsApp quando alguém compartilha a tela. Prazo curto é o que faz um
//  vazamento valer quase nada.
//
//  ⚠️⚠️ O QUE ELE **NÃO** ENTREGA: o CPF. Ver `services/doacaoPrefill.js` — o
//  navegador recebe CPF MASCARADO, e quem resolve o CPF real (para mandar ao
//  provedor de pagamento) é o SERVIDOR, a partir deste token. CPF completo numa
//  resposta pública é dado que não se despublica.
//
//  ⚠️ Sem env nova: `DOACAO_TOKEN_SECRET` é override OPCIONAL e o fallback é o
//  `CRON_SECRET` (já obrigatório em produção). Sem NENHUM segredo fica
//  FAIL-CLOSED — não emite e não aceita. NUNCA usar literal de fallback (lição
//  do `MEM_QR_SALT`).
//
//  ⚠️ Namespace PRÓPRIO (`doacao-prefill:`). Sem ele, um token do censo, do
//  comprovante de inscrição ou do link do voluntário — todos derivados do MESMO
//  `CRON_SECRET` — seria aceito aqui. Há teste específico para isso.
// ════════════════════════════════════════════════════════════════════════════

const crypto = require('crypto');

// 30 minutos: o app emite no toque e a pessoa doa em seguida. Prazo maior só
// aumenta a janela de um link vazado; menor arrisca expirar em rede ruim ou com
// a pessoa parando pra pensar no valor.
const VALIDADE_MS = 30 * 60 * 1000;

function segredo() {
  return process.env.DOACAO_TOKEN_SECRET || process.env.CRON_SECRET || null;
}

function assinar(corpo, sec) {
  return crypto.createHmac('sha256', sec)
    .update(`doacao-prefill:${corpo}`).digest('hex').slice(0, 20);
}

/**
 * Emite o token. Devolve `null` sem segredo ou sem membro (FAIL-CLOSED).
 *
 * Formato: `<membroId>.<expiraMs>.<assinatura>`
 * ⚠️ O prazo entra DENTRO da assinatura — senão bastaria editar o número na URL
 * para ressuscitar um token vencido.
 */
function emitir(membroId, agora = Date.now()) {
  const sec = segredo();
  const id = typeof membroId === 'string' ? membroId.trim() : '';
  if (!sec || !id) return null;
  const exp = agora + VALIDADE_MS;
  const corpo = `${id}.${exp}`;
  return `${corpo}.${assinar(corpo, sec)}`;
}

/**
 * Lê o token. Devolve `{ ok, membro_id }` ou `{ ok: false, motivo }`.
 *
 * ⚠️ A recusa é NEUTRA para quem chama de fora: a rota pública não distingue
 * "token torto" de "segredo ausente" de "pessoa inexistente" na mensagem que
 * mostra — senão o endpoint vira sonda de existência de cadastro.
 */
function ler(token, agora = Date.now()) {
  const sec = segredo();
  if (!sec) return { ok: false, motivo: 'sem_segredo' };
  const bruto = typeof token === 'string' ? token.trim() : '';
  if (!bruto) return { ok: false, motivo: 'ausente' };

  const partes = bruto.split('.');
  if (partes.length !== 3) return { ok: false, motivo: 'malformado' };
  const [id, expTxt, sig] = partes;
  if (!id || !/^\d+$/.test(expTxt)) return { ok: false, motivo: 'malformado' };

  const esperada = assinar(`${id}.${expTxt}`, sec);
  // ⚠️ Comparação TIMING-SAFE, e só depois de conferir o tamanho: `timingSafeEqual`
  // LANÇA quando os buffers têm tamanhos diferentes.
  const a = Buffer.from(sig);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, motivo: 'assinatura' };
  }

  if (Number(expTxt) <= agora) return { ok: false, motivo: 'expirado' };
  return { ok: true, membro_id: id };
}

module.exports = { emitir, ler, VALIDADE_MS };
