// ============================================================================
// utils/remetenteEmail · o NOME que aparece na caixa de quem recebe
//
// Pedido do Matheus (17/08/2026): *"nos disparos de email, gostaria que o nome
// ao invés de ser 'Email Automático - CBRio' fosse apenas 'CBRio'"*.
//
// ⚠️ De onde vinha o nome errado: o Graph usa o display name da CAIXA
// (`GRAPH_MAIL_SENDER`, hoje noreply@cbrio.org) quando o envio não diz outro. O
// código só sobrescrevia quando o chamador passava `fromName` — e a maioria dos
// disparos (notificações, aprovações de solicitação, avisos de módulo) não
// passa. Resultado: alguns e-mails chegavam como "CBRio" (inscrições, censo,
// identidade do app) e o resto como "Email Automático - CBRio", pelo MESMO
// endereço.
//
// Agora o default é NOSSO, não da caixa. Quem já manda nome próprio
// ("Voluntariado CBRio" em volEmailSender/volEmails) continua mandando — o
// default só preenche quem não diz nada.
//
// ⚠️ Isto NÃO substitui arrumar o display name da caixa no Microsoft 365: se um
// dia um envio escapar deste módulo (script manual, outro serviço), o nome
// velho volta a aparecer. O ideal é fazer os dois.
//
// Puro (sem rede, sem env obrigatória) e em `utils/` para entrar no gate.
// ============================================================================

/** Nome exibido quando o disparo não pede um específico. */
const REMETENTE_NOME_PADRAO = 'CBRio';

/**
 * Nome de exibição efetivo: o que o chamador pediu, senão o padrão.
 * String vazia / só espaço conta como "não pediu" — nunca deixa o e-mail sair
 * sem nome (aí o cliente mostra o endereço cru, que é pior que o nome errado).
 */
function nomeDeExibicao(fromName) {
  const n = typeof fromName === 'string' ? fromName.trim() : '';
  return n || REMETENTE_NOME_PADRAO;
}

/**
 * Monta o `from` do Resend no formato `Nome <endereco@dominio>`.
 *
 * ⚠️ O ENDEREÇO é sempre o configurado (RESEND_FROM) — trocar o endereço
 * quebraria a verificação de domínio do Resend e o envio inteiro. O que este
 * helper faz é só carimbar o nome por cima, para o fallback não chegar com
 * remetente diferente do canal primário.
 *
 * `configurado` pode vir nas duas formas que o Resend aceita:
 *   'CBRio <noreply@cbrio.org>'  ou  'noreply@cbrio.org'
 */
function remetenteResend(configurado, fromName) {
  const bruto = typeof configurado === 'string' ? configurado.trim() : '';
  if (!bruto) return '';
  const m = bruto.match(/<([^>]+)>\s*$/);
  const endereco = (m ? m[1] : bruto).trim();
  if (!endereco) return '';
  return `${nomeDeExibicao(fromName)} <${endereco}>`;
}

module.exports = { REMETENTE_NOME_PADRAO, nomeDeExibicao, remetenteResend };
