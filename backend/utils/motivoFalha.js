// ============================================================================
// Régua PURA da MENSAGEM de uma falha de servidor.
//
// ⚠️ POR QUE ESTE ARQUIVO EXISTE (27/08/2026 · decisão do Matheus): os agentes de
// incidente só conseguiam dizer *"falha silenciosa na lógica de negócio da rota"*
// porque o único sinal que chegava a eles era o STATUS HTTP. O coletor
// (`server.js`, hook de `finish`) gravava literalmente
// `"HTTP 500 respondido pela rota (sem exceção · ver logs da função)"` — e o
// agente NÃO tem acesso ao log da função.
//
// Medido no backend em 27/08: **791 blocos `catch` respondem 5xx sem logar nada**
// (em 60 arquivos), e mesmo os **1.208** que logam mandam pro log da Vercel, que
// o agente não lê. Consertar 791 catches à mão não é caminho; dar OLHOS ao
// coletor é.
//
// ⚠️⚠️ E O TEXTO DAQUI VAI PRA UM AGENTE DE IA. `app_erros_servidor.mensagem` é
// lido por `systemIncidentDiagnosis` e enviado ao modelo — então sanitizar não é
// preciosismo: mensagem do PostgREST embute VALOR
// (`Key (cpf)=(12345678901) already exists`), e é a lei do Stax (dado de igreja
// não sai daqui sem necessidade).
// ============================================================================

const GENERICA = 'respondido pela rota (sem exceção · ver logs da função)';

// ⚠️ Poupa o `request_id`/id de incidente da regra de segredo — ver o comentário
// dentro de `sanitizarMotivo`.
const EH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Tira o que não pode sair do servidor.
 *
 * ⚠️ Ordem importa: o CPF é mascarado ANTES da regra de "sequência longa de
 * dígitos", senão um CPF sem pontuação viraria `[numero]` e a auditoria perderia
 * a informação de que o valor ofensor era um CPF (o formato é o diagnóstico).
 */
function sanitizarMotivo(valor, tetoChars = 1200) {
  return String(valor == null ? '' : valor)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[cpf]')
    .replace(/\b\d{11}\b/g, '[cpf]')
    // Token/segredo: sequência longa sem espaço. Vem DEPOIS do CPF e do e-mail.
    //
    // ⚠️⚠️ O UUID É POUPADO EXPLICITAMENTE, e não por acidente de charset: o
    // hífen ESTÁ em `[A-Za-z0-9_-]`, então um `request_id` de 36 caracteres
    // casava inteiro e virava `[segredo]` — apagando justo o rastreio que liga a
    // mensagem ao incidente. (Meu comentário afirmava o contrário e o teste
    // provou que era mentira.)
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, (m) => (EH_UUID.test(m) ? m : '[segredo]'))
    .replace(/\b\d{12,}\b/g, '[numero]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, tetoChars);
}

/**
 * A mensagem que vai pra `app_erros_servidor.mensagem`.
 *
 * ⚠️ O prefixo `HTTP <status>` FICA sempre: é ele que o agrupador de incidentes
 * e a tela usam pra reconhecer a família da falha, e tirá-lo mudaria o
 * fingerprint de todo incidente existente.
 * ⚠️ Sem motivo, devolve a frase antiga BYTE A BYTE — rota que não entrega
 * motivo tem que se comportar exatamente como antes.
 */
function montarMensagemFalha({ status, motivo, codigo, tetoChars } = {}) {
  const st = Number(status) || 500;
  const limpo = sanitizarMotivo(motivo, tetoChars);
  if (!limpo) return `HTTP ${st} ${GENERICA}`;
  const cod = String(codigo || '').trim();
  return `HTTP ${st}: ${cod ? `[${sanitizarMotivo(cod, 40)}] ` : ''}${limpo}`;
}

/**
 * Junta o que o PostgREST devolve num motivo LEGÍVEL.
 *
 * ⚠️ `details` e `hint` entram porque são justamente o que nomeia a causa: o
 * `message` de um 42703 é "column x does not exist", e o `hint` costuma dizer
 * qual coluna o autor queria. Sem eles o agente fica com meia frase.
 */
function motivoDeErroPostgrest(corpo) {
  if (!corpo || typeof corpo !== 'object') return '';
  const partes = [corpo.message, corpo.details, corpo.hint]
    .map((x) => String(x == null ? '' : x).trim())
    .filter(Boolean);
  return [...new Set(partes)].join(' · ');
}

module.exports = {
  GENERICA,
  sanitizarMotivo,
  montarMensagemFalha,
  motivoDeErroPostgrest,
};
