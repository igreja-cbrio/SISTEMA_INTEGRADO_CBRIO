// ============================================================================
// Confirmação de inscrição da ESPINHA por WhatsApp (SPEC-07) — via FILA
// `whatsapp_envios` (retry/backoff, histórico universal e falha TERMINAL que
// avisa gente — política de 2026-07-27; o prefixo `inscricoes.` do contexto
// roteia o aviso de falha pro módulo de inscrições).
//
// Regras (não regredir):
// - OPT-IN é lei (D4): sem `whatsapp_optin = true` na inscrição, NÃO envia.
// - Kill-switch = env `WHATSAPP_TEMPLATE_INSCRICAO_EVENTO` (nome do template
//   aprovado na Meta). Vazia → no-op gracioso, padrão plug-and-play do
//   notificarMembro — desliga-se removendo a env, sem deploy de código.
// - Envia SÓ em transição real: inscrição NOVA gratuita (nasce confirmada) ou
//   pagamento CONFIRMADO (recebida→confirmada no handler, gate `confirmouAgora`).
//   Re-inscrição/merge NÃO reenvia — a fila não tem dedup por contexto e cada
//   re-escaneada de QR viraria spam.
//
// Template sugerido (UTILITY · pt_BR · criar na Meta e pôr o NOME na env):
//   Oi {{1}}! Sua inscrição no {{2}} está confirmada. 📅 {{3}}
//   Seu comprovante (apresente na entrada): {{4}}
// {{4}} = link do comprovante como VARIÁVEL DE BODY (mesma técnica do
// grupos_renovacao_temporada — link dinâmico não pode ser botão fixo).
// ============================================================================
const { enfileirar } = require('./whatsappFila');
const { gerarTokenComprovante } = require('./inscricaoComprovante');

function baseUrl() {
  // Nunca hardcodar domínio (regra do repo) — mesma resolução do Cérebro.
  if (process.env.FRONTEND_URL) return String(process.env.FRONTEND_URL).replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return null;
}

function formatarQuando(evento) {
  const data = String(evento?.data || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return 'em breve — fique de olho nos avisos';
  const [a, m, d] = data.split('-');
  return evento?.hora ? `${d}/${m}/${a} às ${evento.hora}` : `${d}/${m}/${a}`;
}

/**
 * Enfileira a confirmação da inscrição pro próprio inscrito. Fire-and-forget
 * nos chamadores (nunca decide o fluxo da inscrição). Params SEMPRE não-vazios
 * — variável vazia derruba o template inteiro na Meta.
 */
async function enviarConfirmacaoInscricao({ inscricaoId, nome, telefone, optin, evento }) {
  if (!optin) return { sent: false, reason: 'sem_optin' };            // D4 — lei
  const template = process.env.WHATSAPP_TEMPLATE_INSCRICAO_EVENTO;
  if (!template) return { sent: false, reason: 'template_nao_configurado' };
  const tel = String(telefone || '').replace(/\D/g, '');
  if (tel.length < 10) return { sent: false, reason: 'invalid_phone' };
  const base = baseUrl();
  const token = gerarTokenComprovante(inscricaoId);
  if (!base || !token) return { sent: false, reason: 'sem_link_comprovante' };

  const primeiroNome = String(nome || '').trim().split(/\s+/)[0] || 'Olá';
  return enfileirar({
    telefone: tel,
    template,
    params: [
      primeiroNome,
      String(evento?.nome || 'evento').slice(0, 120),
      formatarQuando(evento),
      `${base}/i/c/${token}`,
    ],
    contexto: 'inscricoes.confirmacao',
    refId: inscricaoId,
  });
}

module.exports = { enviarConfirmacaoInscricao };
