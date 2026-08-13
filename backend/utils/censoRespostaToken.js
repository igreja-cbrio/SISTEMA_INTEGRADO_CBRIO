// ════════════════════════════════════════════════════════════════════════════
//  CENSO (pesquisa) · dois segredos curtos do fluxo de resposta
//
//  Este arquivo espelha a técnica de utils/censoToken.js (HMAC curto, sem env
//  nova, fail-closed) mas com NAMESPACE PRÓPRIO. Namespace separado não é
//  capricho: o token de lá dá o poder de ver e completar o cadastro da pessoa.
//  Se os dois compartilhassem assinatura, um token de identidade da pesquisa
//  abriria o cadastro — e vice-versa.
//
//  1) TOKEN DE IDENTIDADE (`censo-pesquisa-id:`)
//     Emitido pelo /prefill quando a pessoa comprova quem é (CPF + nascimento)
//     e consumido no envio da resposta. Existe para o cliente NUNCA carregar o
//     `membro_id` cru: se carregasse, bastaria trocar o uuid no devtools para
//     responder o censo no lugar de outra pessoa.
//
//  2) SEGREDO DE RETOMADA
//     93 campos no celular, em pé, no culto. Quem for interrompido precisa
//     voltar de onde parou. O segredo fica NO APARELHO; o banco guarda só o
//     HASH — vazamento da tabela não reabre a resposta de ninguém.
// ════════════════════════════════════════════════════════════════════════════

const crypto = require('crypto');

function segredo() {
  return process.env.CENSO_TOKEN_SECRET || process.env.CRON_SECRET || null;
}

// ── 1. Token de identidade ────────────────────────────────────────────────

const NS_IDENTIDADE = 'censo-pesquisa-id:';

function assinarIdentidade(idNorm, sec) {
  return crypto.createHmac('sha256', sec)
    .update(`${NS_IDENTIDADE}${idNorm}`).digest('hex').slice(0, 20);
}

/** UUID do membro → `<32 hex>.<20 hex>`. Null sem segredo ou com id inválido. */
function gerarTokenIdentidade(membroId) {
  const sec = segredo();
  const idNorm = String(membroId || '').replace(/-/g, '').toLowerCase();
  if (!sec || !/^[0-9a-f]{32}$/.test(idNorm)) return null;
  return `${idNorm}.${assinarIdentidade(idNorm, sec)}`;
}

/** Token → UUID do membro, ou null (formato, segredo ou assinatura inválidos). */
function verificarTokenIdentidade(token) {
  const sec = segredo();
  if (!sec) return null;
  const m = /^([0-9a-f]{32})\.([0-9a-f]{20})$/.exec(String(token || '').trim().toLowerCase());
  if (!m) return null;
  const esperado = assinarIdentidade(m[1], sec);
  if (!crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(esperado))) return null;
  return `${m[1].slice(0, 8)}-${m[1].slice(8, 12)}-${m[1].slice(12, 16)}-${m[1].slice(16, 20)}-${m[1].slice(20)}`;
}

// ── 2. Retomada ───────────────────────────────────────────────────────────

/** Segredo novo para o aparelho guardar. 32 hex = 128 bits. */
function gerarSegredoRetomada() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Hash do segredo, para guardar no banco. É o que permite validar a retomada
 * sem que o banco saiba o segredo.
 * Não é senha de usuário (é um valor aleatório de 128 bits, não adivinhável),
 * então SHA-256 basta — bcrypt aqui só custaria latência no culto.
 */
function hashRetomada(segredoBruto) {
  const s = String(segredoBruto || '').trim();
  if (!/^[0-9a-f]{32}$/.test(s)) return null;
  return crypto.createHash('sha256').update(`censo-retomar:${s}`).digest('hex');
}

/** Comparação em tempo constante entre o segredo recebido e o hash guardado. */
function retomadaConfere(segredoBruto, hashGuardado) {
  const calc = hashRetomada(segredoBruto);
  const guard = String(hashGuardado || '');
  if (!calc || calc.length !== guard.length) return false;
  return crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(guard));
}

module.exports = {
  gerarTokenIdentidade,
  verificarTokenIdentidade,
  gerarSegredoRetomada,
  hashRetomada,
  retomadaConfere,
};
