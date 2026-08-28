// Contato da pessoa · "dá pra falar com ela por WhatsApp?"
//
// Régua ÚNICA, criada em 2026-08-03 depois da varredura do lançamento de
// grupos (domingo 02/08). Dois casos reais apareceram lá:
//
//  1. **Telefone que o nosso envio não alcança.** A Patricia Künzler digitou um
//     número SUÍÇO (+41 76 576 45 38). O contrato de porta valida QUANTIDADE de
//     dígitos, não o DDD, então passou: um pedido gravou `0765764538` (10
//     dígitos, DDD "07" que não existe) e outro `41765764538`. O envio prefixa
//     `55` em tudo que tem 10-11 dígitos (waSender.normalizarTelefone), então
//     virou `5541765764538` — um número de Curitiba que não existe.
//  2. **Número brasileiro válido sem WhatsApp.** Dois números com formato
//     perfeito receberam "Message undeliverable" da Meta.
//
// Decisão do Marcos (03/08): quem tem telefone estrangeiro **deve poder se
// inscrever** — só precisa gerar uma OBSERVAÇÃO pra o líder procurar por e-mail.
// E "número brasileiro sem WhatsApp é a mesma coisa que estrangeiro: classifique
// como **número errado — impossível contato**".
//
// ⚠️ Isto NÃO bloqueia inscrição em lugar nenhum. É classificação de LEITURA:
// pinta o selo na Caixa de entrada e troca o texto do contato que vai pro líder.
//
// ⚠️ Não guardamos estado: o telefone É a evidência do caso 1, e o webhook da
// Meta (`whatsapp_envios.failed_at`) é a evidência do caso 2. Derivar na leitura
// não fica velho — coluna gravada ficaria (a pessoa corrige o telefone e o selo
// mentiria).

// DDDs que existem no Brasil (Anatel). O buraco do lançamento era não checar
// isto: "07" e "41 sem o 9" passavam como telefone válido.
const DDD_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

const MOTIVOS = {
  SEM_TELEFONE: 'sem_telefone',
  NUMERO_ERRADO: 'numero_errado',   // formato que o nosso envio não alcança
  SEM_WHATSAPP: 'sem_whatsapp',     // a Meta respondeu "undeliverable"
};

const ROTULO = {
  [MOTIVOS.SEM_TELEFONE]: 'Sem telefone',
  // Rótulo único pros dois casos, como o Marcos pediu.
  [MOTIVOS.NUMERO_ERRADO]: 'Número errado — impossível contato',
  [MOTIVOS.SEM_WHATSAPP]: 'Número errado — impossível contato',
};

/** Só dígitos. */
function digitos(raw) {
  return String(raw || '').replace(/\D+/g, '');
}

/**
 * O número, como está guardado, é alcançável pelo nosso envio de WhatsApp?
 * Espelha `waSender.normalizarTelefone` (que prefixa 55 em 10-11 dígitos e
 * aceita 12-13 já com DDI 55) e ACRESCENTA o que faltava: DDD real e o 9 do
 * celular. Fora desse padrão o envio vira um número inexistente.
 */
function telefoneAlcancavel(raw) {
  const d = digitos(raw);
  if (!d) return false;
  // Já vem com DDI do Brasil: 55 + DDD + 8 ou 9 dígitos.
  const nacional = (d.startsWith('55') && (d.length === 12 || d.length === 13))
    ? d.slice(2)
    : d;
  if (nacional.length !== 10 && nacional.length !== 11) return false;
  if (!DDD_VALIDOS.has(Number(nacional.slice(0, 2)))) return false;
  // 11 dígitos = celular: o 9 é obrigatório. (10 = fixo, sem 9.)
  if (nacional.length === 11 && nacional[2] !== '9') return false;
  return true;
}

/**
 * Classifica o contato de uma pessoa.
 * @param {object} p
 * @param {string} p.telefone
 * @param {string} [p.email]
 * @param {boolean} [p.entregaFalhou] — a Meta reportou `failed` pra este número
 * @returns {{ok:boolean, motivo:string|null, rotulo:string|null, usarEmail:boolean, email:string|null}}
 */
function classificarContato({ telefone, email, entregaFalhou = false } = {}) {
  const emailLimpo = String(email || '').trim() || null;
  const semTelefone = !digitos(telefone);
  let motivo = null;
  if (semTelefone) motivo = MOTIVOS.SEM_TELEFONE;
  else if (!telefoneAlcancavel(telefone)) motivo = MOTIVOS.NUMERO_ERRADO;
  else if (entregaFalhou) motivo = MOTIVOS.SEM_WHATSAPP;

  return {
    ok: !motivo,
    motivo,
    rotulo: motivo ? ROTULO[motivo] : null,
    // Só sugere e-mail quando ele EXISTE — "contate por e-mail" sem e-mail é
    // orientação vazia; nesse caso a triagem tem que buscar outro caminho.
    usarEmail: Boolean(motivo && emailLimpo),
    email: emailLimpo,
  };
}

/**
 * Texto do contato que vai pro LÍDER no template ({{4}} do
 * grupos_pedido_novo_lider_v2). Quando o telefone não serve, o e-mail vem na
 * frente e a mensagem diz por quê — senão o líder tenta ligar/mandar zap pra um
 * número que não existe e conclui que a pessoa não quer responder.
 */
function contatoParaLider({ telefone, email, telefoneExibicao, entregaFalhou = false } = {}) {
  const c = classificarContato({ telefone, email, entregaFalhou });
  const telMostrar = telefoneExibicao || digitos(telefone) || null;
  if (c.ok) return [telMostrar, c.email].filter(Boolean).join(' · ') || 'sem contato';
  if (c.usarEmail) return `e-mail ${c.email} (o telefone informado não recebe WhatsApp)`;
  if (telMostrar) return `${telMostrar} — número não recebe WhatsApp, confirmar com a pessoa`;
  return 'sem contato';
}

module.exports = {
  DDD_VALIDOS,
  MOTIVOS,
  digitos,
  telefoneAlcancavel,
  classificarContato,
  contatoParaLider,
};
