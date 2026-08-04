// ════════════════════════════════════════════════════════════════════════════
//  CENSO · token pessoal do convite de atualização cadastral
//
//  O PROBLEMA que este arquivo resolve (pergunta do Matheus em 04/08): "se estou
//  disparando mensagem pedindo para a pessoa completar o cadastro dela, como o
//  sistema vai achar ela se ela não tiver CPF cadastrado???"
//
//  ⚠️ A resposta é que o sistema NÃO precisa achar: quem manda a mensagem é ele,
//  e ele já sabe para quem está mandando. O link vai PESSOAL, assinado com o
//  `membro_id` dentro. Isso resolve as ~2.000 pessoas sem CPF — que são
//  justamente o público da campanha — sem nenhuma busca.
//
//  ⚠️ E é o único jeito SEGURO de preencher o formulário com dados reais numa
//  página pública. Os lookups públicos (`lookup-cpf`, `lookup-nome-telefone`)
//  devolvem de propósito só primeiro nome + iniciais + telefone mascarado:
//  endpoint público que entrega o cadastro inteiro a partir de um CPF é máquina
//  de vazar dado, porque CPF vaza e se compra. Aqui a prova de identidade é o
//  token ter chegado no WhatsApp/e-mail DELA — mesmo nível do comprovante de
//  inscrição (services/inscricaoComprovante.js, cuja técnica esta espelha).
//
//  ⚠️ Sem env NOVA de propósito (env obrigatória nova = merge blocker):
//  CENSO_TOKEN_SECRET é override OPCIONAL, o fallback é o CRON_SECRET (já
//  obrigatório em produção). Sem NENHUM segredo fica FAIL-CLOSED: não gera link
//  pessoal e não aceita token. NUNCA usar literal de fallback (lição do
//  MEM_QR_SALT). Trocar o segredo invalida os links já enviados — a pessoa cai
//  no formulário normal, nada quebra.
//
//  ⚠️ O token dá UM poder só: ver e completar o PRÓPRIO cadastro. Não autentica
//  no sistema, não abre módulo, não vale para outra pessoa. Namespace próprio na
//  assinatura (`censo-atualizacao:`) impede que um token de outro fluxo — o do
//  comprovante de inscrição, por exemplo — seja aceito aqui.
// ════════════════════════════════════════════════════════════════════════════

const crypto = require('crypto');

function segredo() {
  return process.env.CENSO_TOKEN_SECRET || process.env.CRON_SECRET || null;
}

// 20 hex = 80 bits de assinatura: inviável de forjar online e curto o
// suficiente pro link caber numa mensagem de WhatsApp sem virar um monstro.
function assinar(idNorm, sec) {
  return crypto.createHmac('sha256', sec)
    .update(`censo-atualizacao:${idNorm}`).digest('hex').slice(0, 20);
}

/** UUID do membro → `<32 hex>.<20 hex>`, ou null sem segredo / id inválido. */
function gerarTokenCenso(membroId) {
  const sec = segredo();
  const idNorm = String(membroId || '').replace(/-/g, '').toLowerCase();
  if (!sec || !/^[0-9a-f]{32}$/.test(idNorm)) return null;
  return `${idNorm}.${assinar(idNorm, sec)}`;
}

/** Token → UUID do membro, ou null (formato, segredo ou assinatura inválidos). */
function verificarTokenCenso(token) {
  const sec = segredo();
  if (!sec) return null;
  const m = /^([0-9a-f]{32})\.([0-9a-f]{20})$/.exec(String(token || '').trim().toLowerCase());
  if (!m) return null;
  const esperado = assinar(m[1], sec);
  // Comprimentos iguais por construção (regex 20 + slice 20) — timingSafeEqual exige.
  if (!crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(esperado))) return null;
  return `${m[1].slice(0, 8)}-${m[1].slice(8, 12)}-${m[1].slice(12, 16)}-${m[1].slice(16, 20)}-${m[1].slice(20)}`;
}

module.exports = { gerarTokenCenso, verificarTokenCenso };
