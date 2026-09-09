// Estado da CONEXÃO do WhatsApp da igreja — régua PURA (F4 do redesenho · 09/09/2026).
//
// Pedido do Marcos (08/09): a aba Configurações → Números vira um card só de
// leitura, "Conexão": qual número está em uso, se o webhook está ligado, quem
// responde quem escreve, e os sinais de vida (última mensagem recebida, último
// envio, último sync de templates). A rota lê o banco e chama isto; aqui mora
// a régua do que é ALERTA — vive em utils/ (sem Supabase) pra entrar no gate.

/** 3 dias sem ninguém escrever pro número da igreja é anormal (216 conversas em
 *  90 dias, medido em 08/09): quase sempre é webhook quebrado, não silêncio. */
const SILENCIO_INBOUND_H = 72;
/** O sync do espelho de templates é HORÁRIO (carona no cron de agendamentos);
 *  3h sem sync = o cron parou, e a trava de template rejeitado fica cega. */
const SYNC_TEMPLATES_H = 3;
const MODOS = ['ninguem', 'menu', 'ia'];
/** Alertas que pintam a saúde de âmbar. `dois_numeros_padrao` é smell de dado, não de operação. */
const GRAVES = new Set(['sem_numero', 'webhook_desligado', 'sem_inbound_recente', 'catalogo_vazio', 'sem_template_aprovado']);

/** Horas desde um instante ISO (1 decimal). null = nunca/ilegível. Nunca negativo. */
function horasDesde(iso, agoraMs) {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(t) || !Number.isFinite(agoraMs)) return null;
  return Math.max(0, Math.round(((agoraMs - t) / 3600000) * 10) / 10);
}

/**
 * Avalia a conexão. ⚠️ O envio usa SEMPRE o número da env
 * (`WHATSAPP_PHONE_NUMBER_ID`) — `wa_numeros` existe, mas nada o lê (medido em
 * 08/09: 0 linhas). O card diz a verdade: "em uso: env", e o cadastro é listado
 * como cadastro, não como número em uso.
 */
function avaliarConexao({
  envPhoneId = null, wabaId = null, numeros = [], webhookLigado = true, modo = 'ninguem',
  ultimoInboundEm = null, ultimoOutboundEm = null, ultimoSyncTemplatesEm = null,
  templatesAprovados = 0, templatesTotal = 0, agoraMs = Date.now(),
} = {}) {
  const alertas = [];
  const inbound_h = horasDesde(ultimoInboundEm, agoraMs);
  const outbound_h = horasDesde(ultimoOutboundEm, agoraMs);
  const sync_templates_h = horasDesde(ultimoSyncTemplatesEm, agoraMs);
  const lista = Array.isArray(numeros) ? numeros.filter(Boolean) : [];

  if (!envPhoneId) alertas.push('sem_numero');
  // Webhook desligado já explica o silêncio — acusar os dois seria ruído.
  if (!webhookLigado) alertas.push('webhook_desligado');
  else if (inbound_h === null || inbound_h > SILENCIO_INBOUND_H) alertas.push('sem_inbound_recente');
  if (sync_templates_h === null || sync_templates_h > SYNC_TEMPLATES_H) alertas.push('templates_sem_sync');
  if (templatesTotal === 0) alertas.push('catalogo_vazio');
  else if (templatesAprovados === 0) alertas.push('sem_template_aprovado');
  // Só os ATIVOS contam: um cadastro inativo marcado como padrão não decide nada.
  if (lista.filter(n => n.ativo !== false && n.is_default).length > 1) alertas.push('dois_numeros_padrao');

  return {
    numero: { phone_number_id: envPhoneId ? String(envPhoneId) : null, origem: envPhoneId ? 'env' : null, waba_id: wabaId ? String(wabaId) : null },
    cadastrados: lista.length,
    webhook: webhookLigado ? 'ligado' : 'desligado',
    quem_responde: MODOS.includes(modo) ? modo : 'ninguem',
    sinais: { inbound_h, outbound_h, sync_templates_h, templates_aprovados: templatesAprovados, templates_total: templatesTotal },
    alertas,
    saude: alertas.some(a => GRAVES.has(a)) ? 'atencao' : 'ok',
  };
}

const TEXTOS = {
  sem_numero: 'Nenhum número configurado (WHATSAPP_PHONE_NUMBER_ID vazio) — nada sai nem entra.',
  webhook_desligado: 'Webhook DESLIGADO (freio de emergência): mensagens recebidas não estão sendo registradas no inbox.',
  sem_inbound_recente: `Nenhuma mensagem recebida há mais de ${SILENCIO_INBOUND_H / 24} dias — para o número da igreja isso costuma ser webhook quebrado, não silêncio.`,
  templates_sem_sync: `O espelho de templates não sincroniza há mais de ${SYNC_TEMPLATES_H}h (o sync é horário) — a trava de template rejeitado fica cega. Sincronize em Templates.`,
  catalogo_vazio: 'Catálogo de templates vazio — sincronize com a Meta em Configurações → Templates.',
  sem_template_aprovado: 'Nenhum template APROVADO no espelho — a fila recusa tudo que não é texto de janela.',
  dois_numeros_padrao: 'Mais de um número cadastrado como padrão — o cadastro está inconsistente (o envio segue usando o da env).',
};
function textoAlerta(codigo) { return TEXTOS[codigo] || String(codigo); }

module.exports = { SILENCIO_INBOUND_H, SYNC_TEMPLATES_H, MODOS, GRAVES, horasDesde, avaliarConexao, textoAlerta };
