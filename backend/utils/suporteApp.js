// ════════════════════════════════════════════════════════════════════════════
//  "Ajuda com o app" — régua PURA da dúvida que vira mensagem
//
//  Pedido do Matheus (29/08/2026): *"no app, no menu, tivesse um botão de ajuda
//  com app... essas dúvidas devem chegar para o meu WhatsApp. Quero o nome da
//  pessoa e a dúvida dela, com o número de celular dela."*
//
//  ⚠️ Em `utils/` (sem Supabase) pra entrar no gate de deploy.
// ════════════════════════════════════════════════════════════════════════════

const MIN_MENSAGEM = 5;
const MAX_MENSAGEM = 1000;
/** Teto do parâmetro no template. A Meta recusa parâmetro muito longo, e a
 *  dúvida INTEIRA fica gravada em `app_suporte_mensagens` de qualquer jeito. */
const MAX_PARAM = 600;

/**
 * ⚠️⚠️ PARÂMETRO DE TEMPLATE NÃO ACEITA QUEBRA DE LINHA, TAB, NEM 4+ ESPAÇOS
 * SEGUIDOS — a Meta recusa a mensagem inteira (132000). E gente escreve dúvida
 * em várias linhas o tempo todo. Sem esta normalização, justamente a dúvida
 * mais bem escrita é a que não chega.
 */
function paraParametro(texto, max = MAX_PARAM) {
  const limpo = String(texto == null ? '' : texto)
    .replace(/[\r\n]+/g, ' · ')
    .replace(/\t/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (limpo.length <= max) return limpo;
  return `${limpo.slice(0, max - 1).trimEnd()}…`;
}

/** A dúvida tem conteúdo? */
function validarMensagem(texto) {
  const limpo = String(texto == null ? '' : texto).trim();
  if (limpo.length < MIN_MENSAGEM) {
    return { ok: false, erro: 'Escreva sua dúvida com um pouco mais de detalhe.' };
  }
  return { ok: true, mensagem: limpo.slice(0, MAX_MENSAGEM) };
}

/** Telefone só-dígitos, sem o 55 do país (o envio já prefixa). */
function digitos(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  if (d.length >= 12 && d.length <= 13 && d.startsWith('55')) return d.slice(2);
  return d;
}

/** (21) 99999-8888 — pra quem vai LER e ligar de volta. */
function telefoneLegivel(tel) {
  const d = digitos(tel);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d || '';
}

/**
 * Os 3 parâmetros do template: nome · telefone · dúvida.
 *
 * ⚠️ **Sem telefone o pedido NÃO é bloqueado** — a dúvida chega dizendo "sem
 * telefone no cadastro". Barrar aqui deixaria de fora justamente quem está com
 * o cadastro incompleto, que é sobre o que boa parte das dúvidas é.
 */
function montarParams({ nome, telefone, mensagem }) {
  return [
    paraParametro(nome, 80) || 'Alguém do app',
    telefoneLegivel(telefone) || 'sem telefone no cadastro',
    paraParametro(mensagem),
  ];
}

module.exports = {
  validarMensagem, montarParams, paraParametro, telefoneLegivel, digitos,
  MIN_MENSAGEM, MAX_MENSAGEM, MAX_PARAM,
};
