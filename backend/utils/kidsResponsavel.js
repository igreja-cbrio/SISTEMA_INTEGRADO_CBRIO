// ============================================================================
// Helpers de responsáveis Kids
// ============================================================================

// Traduz o erro do trigger `fn_kids_um_pai_uma_mae` (uma criança tem só UMA mãe
// e UM pai) para uma resposta amigável. O trigger levanta ERRCODE '23505' com
// uma mensagem pt-BR já pronta pro usuário. Retorna { status, error } quando é
// esse caso; retorna null caso contrário (o chamador segue com o tratamento
// padrão). Distingue do 23505 "genérico" (chave duplicada crianca_id+membro_id)
// pela mensagem — só traduz quando o texto fala de mãe/pai.
function traduzErroUmPaiUmaMae(e) {
  if (!e) return null;
  const msg = e.message || '';
  const ehTrava = e.code === '23505' && /(mãe cadastrada|pai cadastrado|uma mãe e um pai)/i.test(msg);
  if (ehTrava) return { status: 400, error: msg };
  return null;
}

module.exports = { traduzErroUmPaiUmaMae };
