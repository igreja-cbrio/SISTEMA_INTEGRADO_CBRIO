// ════════════════════════════════════════════════════════════════════════════
//  CULTO · token do link de lançamento de decisões pelo VOLUNTÁRIO
//
//  Medido em 14/08/2026: o voluntário coleta nome+telefone no papel ao fim do
//  culto e alguém lança no sistema depois — média de 3 dias, máximo de 9. O SLA
//  de primeiro contato do módulo é de 3 dias, então **o convertido entra no
//  sistema no dia em que o prazo dele já venceu** (só 41,5% são contatados a
//  tempo). E quem digita 9 dias depois não lembra de qual culto era o papel: em
//  12/07 o culto das 19h ficou com 0 nomes e o das 11h30 com 19.
//
//  Este link resolve os dois de uma vez: o voluntário lança do celular dele, na
//  hora, e o culto vai DENTRO da assinatura — nunca no corpo da requisição.
//  Culto errado deixa de ser possível por construção, não por disciplina.
//
//  ⚠️ Por que link assinado e não login travado (decidido contra o alternativo):
//  o produto NÃO sabe criar login de quiosque — `routes/voluntariado.js` grava
//  `is_membro_only: false` e a trava exige `true` (as contas `voluntario-kids`
//  foram feitas por SQL à mão). Além disso `integracao` não está no
//  `MODULO_ROTA_TRAVA` do AuthContext. E o commit 362adc8b (23/06) já mediu a
//  aposta do login neste mesmo público — "quem atende não loga no Cuidados" —
//  e removeu a tela por isso. Voluntário rotaciona toda semana; link não tem
//  senha para esquecer.
//
//  ⚠️ Namespace próprio (`culto-decisoes:`). Sem ele, um token do censo, da
//  escala ou do comprovante — que usam o MESMO segredo — seria aceito aqui.
//
//  ⚠️ Sem env NOVA de propósito: `CULTO_TOKEN_SECRET` é override OPCIONAL e o
//  fallback é o `CRON_SECRET` (já obrigatório em produção). Sem NENHUM segredo
//  fica FAIL-CLOSED — não gera link e não aceita token. NUNCA usar literal de
//  fallback (lição do MEM_QR_SALT).
//
//  ⚠️ O token dá UM poder só: acrescentar decisão NAQUELE culto. Não autentica,
//  não abre módulo, não lê lista de pessoas e não altera nem apaga nada. É a
//  autorização de escrita mais fraca do repositório — `/g/a/` cria vínculo de
//  pessoa e `/g/c/` remove gente do roster.
//
//  ⚠️ A validade REAL é reconferida no servidor a cada uso (o culto ainda estar
//  dentro da janela de lançamento). O token não carrega expiração porque o
//  culto já é datado — quem decide se ainda vale é a rota, contra o banco.
// ════════════════════════════════════════════════════════════════════════════

const crypto = require('crypto');

function segredo() {
  return process.env.CULTO_TOKEN_SECRET || process.env.CRON_SECRET || null;
}

// 20 hex = 80 bits: inviável de forjar online e curto o bastante pro link caber
// numa mensagem de WhatsApp sem virar um monstro.
function assinar(idNorm, sec) {
  return crypto.createHmac('sha256', sec)
    .update(`culto-decisoes:${idNorm}`).digest('hex').slice(0, 20);
}

/** UUID do culto → `<32 hex>.<20 hex>`, ou null sem segredo / id inválido. */
function gerarTokenCulto(cultoId) {
  const sec = segredo();
  const idNorm = String(cultoId || '').replace(/-/g, '').toLowerCase();
  if (!sec || !/^[0-9a-f]{32}$/.test(idNorm)) return null;
  return `${idNorm}.${assinar(idNorm, sec)}`;
}

/** Token → UUID do culto, ou null (formato, segredo ou assinatura inválidos). */
function verificarTokenCulto(token) {
  const sec = segredo();
  if (!sec) return null;
  const m = /^([0-9a-f]{32})\.([0-9a-f]{20})$/.exec(String(token || '').trim().toLowerCase());
  if (!m) return null;
  const esperado = assinar(m[1], sec);
  // Comprimentos iguais por construção (regex 20 + slice 20) — timingSafeEqual exige.
  if (!crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(esperado))) return null;
  return `${m[1].slice(0, 8)}-${m[1].slice(8, 12)}-${m[1].slice(12, 16)}-${m[1].slice(16, 20)}-${m[1].slice(20)}`;
}

/** Link completo pro voluntário. `null` quando não há segredo (fail-closed). */
function montarLinkCulto(cultoId, baseUrl) {
  const t = gerarTokenCulto(cultoId);
  if (!t) return null;
  const base = String(baseUrl || process.env.FRONTEND_URL || 'https://cbrio.org').replace(/\/+$/, '');
  return `${base}/c/${t}`;
}

module.exports = { gerarTokenCulto, verificarTokenCulto, montarLinkCulto };
