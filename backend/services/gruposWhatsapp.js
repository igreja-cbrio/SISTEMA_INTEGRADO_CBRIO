// Grupos · camada WhatsApp (F3) — tokens de ação por link + templates.
//
// O líder recebe um template no WhatsApp quando alguém pede pra entrar no
// grupo dele, com um link tokenizado pra aprovar SEM login (/g/a/<token>).
// A pessoa recebe um template de boas-vindas quando é aprovada.
//
// Segurança do token: HMAC-SHA256 com CRON_SECRET (fail-closed: sem a env,
// nenhum token é assinado nem aceito — mesmo padrão do OAuth state do
// online.js). Payload mínimo { t: tipo, p: pedidoId, exp } — o token dá
// acesso a UM pedido específico e expira.
//
// Envio: delega ao whatsappService.sendTemplate, que já é gated por
// WHATSAPP_ENABLED === 'true' + credenciais (sem elas, loga DRY-RUN e não
// envia — o fluxo do sistema fica idêntico ao de hoje).
const crypto = require('crypto');
const { supabase } = require('../utils/supabase');
const { sendTemplate, configurado } = require('./whatsappService');

// GRUPOS_TOKEN_SECRET (opcional) isola esta superfície dos demais usos do
// CRON_SECRET (bearer de crons, clientState do Graph no Cérebro — que é
// ecoado a terceiro). Sem ela, cai no CRON_SECRET como o resto do repo.
const SECRET = process.env.GRUPOS_TOKEN_SECRET || process.env.CRON_SECRET;
// Gate = a MESMA condição que faz o sendTemplate enviar de verdade
// (ENABLED + token + phone id). Um gate mais estreito (só ENABLED) deixaria
// o sendTemplate cair em dry-run e logar o link-capability em produção.
const WHATSAPP_LIGADO = () => configurado();
const TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_LANG || 'pt_BR';
const TPL_NOVO_PEDIDO_LIDER = process.env.WHATSAPP_TEMPLATE_GRUPOS_PEDIDO_LIDER || 'grupos_pedido_novo_lider';
const TPL_PEDIDO_APROVADO = process.env.WHATSAPP_TEMPLATE_GRUPOS_APROVADO || 'grupos_pedido_aprovado';
// O template de sugestão foi submetido na Meta com o nome legado
// grupos_pedido_recusado (corpo de 6 variáveis: nome · grupo original ·
// mensagem · grupo sugerido · link de aceite · link de outras opções).
const TPL_SUGESTAO_GRUPO = process.env.WHATSAPP_TEMPLATE_GRUPOS_SUGESTAO || 'grupos_pedido_recusado';

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

function baseUrl() {
  return (process.env.FRONTEND_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://cbrio.org')
  ).replace(/\/+$/, '');
}

// ── Token ────────────────────────────────────────────────────────────────
function assinarToken(tipo, pedidoId, extra) {
  if (!SECRET) throw new Error('CRON_SECRET ausente — token de grupos não pode ser assinado');
  const payload = { t: tipo, p: pedidoId, exp: Date.now() + TOKEN_TTL_MS, ...(extra || {}) };
  const json = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(json).digest('base64url').slice(0, 24);
  return `${json}.${sig}`;
}

function verificarToken(token, tipoEsperado) {
  try {
    if (!SECRET) return null;
    const [json, sig] = String(token || '').split('.');
    if (!json || !sig) return null;
    const expected = crypto.createHmac('sha256', SECRET).update(json).digest('base64url').slice(0, 24);
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(json, 'base64url').toString('utf8'));
    if (payload.t !== tipoEsperado) return null;
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

// ── Formatação compartilhada ─────────────────────────────────────────────
function formatarQuando(grupo) {
  if (grupo?.dia_semana == null) return 'a combinar';
  const dia = DIAS_SEMANA[grupo.dia_semana] || 'a combinar';
  return grupo.horario ? `${dia} às ${String(grupo.horario).slice(0, 5)}` : dia;
}

function formatarOnde(grupo) {
  const partes = [grupo?.local, grupo?.endereco, grupo?.complemento, grupo?.bairro].filter(Boolean);
  return partes.length ? partes.join(' — ') : 'a combinar';
}

// ── Templates ────────────────────────────────────────────────────────────
// Template 1 · grupos_pedido_novo_lider — avisa o LÍDER que chegou pedido,
// com link de aprovar sem login. Fire-and-forget (quem chama não espera).
// {{1}} líder · {{2}} grupo · {{3}} nome da pessoa · {{4}} contato · {{5}} link
async function notificarLiderNovoPedido({ grupo, pedidoId, pessoa }) {
  try {
    // Gate ANTES de assinar o token: com o envio desligado, o sendTemplate
    // cairia no DRY-RUN e logaria os params — incluindo o link-capability de
    // aprovar. Token não pode parar em log de produção.
    if (!WHATSAPP_LIGADO()) return { sent: false, reason: 'disabled' };
    if (!grupo?.lider_id) return { sent: false, reason: 'sem_lider' };
    const { data: lider } = await supabase.from('mem_membros')
      .select('nome, telefone').eq('id', grupo.lider_id).maybeSingle();
    if (!lider?.telefone) return { sent: false, reason: 'lider_sem_telefone' };

    let link;
    try {
      // `l` amarra o token ao líder que o recebeu: se a liderança do grupo
      // trocar dentro dos 7 dias, o link antigo deixa de valer (verificado
      // nos endpoints públicos).
      link = `${baseUrl()}/g/a/${assinarToken('aprov', pedidoId, { l: grupo.lider_id })}`;
    } catch (e) {
      console.error('[GruposWPP] token não assinado:', e.message);
      return { sent: false, reason: 'sem_secret' };
    }

    const contato = [pessoa.telefone, pessoa.email].filter(Boolean).join(' · ') || 'sem contato';
    // trim + fallback DEPOIS do split: nome importado com espaço à esquerda
    // viraria param '' e a Meta rejeita o template inteiro
    const r = await sendTemplate(lider.telefone, TPL_NOVO_PEDIDO_LIDER, TEMPLATE_LANG, [
      (lider.nome || '').trim().split(/\s+/)[0] || 'Líder',
      (grupo.nome || '').trim() || 'seu grupo',
      (pessoa.nome || '').trim() || 'Alguém',
      contato,
      link,
    ]);
    if (!r.sent) console.log('[GruposWPP] template líder não enviado:', r.reason || r.status);
    return r;
  } catch (e) {
    console.error('[GruposWPP] notificarLiderNovoPedido:', e.message);
    return { sent: false, reason: 'exception' };
  }
}

// Template 2 · grupos_pedido_aprovado — boas-vindas à PESSOA aprovada.
// {{1}} grupo · {{2}} dia/hora · {{3}} local · {{4}} líder · {{5}} tel do líder
async function notificarPessoaAprovada({ telefone, grupo, liderNome, liderTelefone }) {
  try {
    if (!telefone) return { sent: false, reason: 'pessoa_sem_telefone' };
    const r = await sendTemplate(telefone, TPL_PEDIDO_APROVADO, TEMPLATE_LANG, [
      (grupo?.nome || '').trim() || 'seu grupo',
      formatarQuando(grupo),
      formatarOnde(grupo),
      (liderNome || '').trim() || 'o líder do grupo',
      (liderTelefone || '').trim() || 'em breve pelo WhatsApp',
    ]);
    if (!r.sent) console.log('[GruposWPP] template aprovado não enviado:', r.reason || r.status);
    return r;
  } catch (e) {
    console.error('[GruposWPP] notificarPessoaAprovada:', e.message);
    return { sent: false, reason: 'exception' };
  }
}

// Template 3 (realocação) · grupos_pedido_recusado — corpo real na Meta:
// «Olá, {{1}}! Sobre sua inscrição no grupo "{{2}}": {{3}} · Mas você não
// fica de fora — separamos uma ótima opção: {{4}} · Se quiser entrar nesse
// grupo, é só confirmar aqui: {{5}} · Prefere ver outras opções? Acesse: {{6}}»
// {{1}} primeiro nome · {{2}} grupo ORIGINAL do pedido · {{3}} mensagem ·
// {{4}} grupo sugerido (nome — quando — onde) · {{5}} link de aceite /g/s/ ·
// {{6}} link do formulário público (outras opções).
async function notificarPessoaSugestao({ telefone, pessoaNome, grupoOriginalNome, grupoSugerido, pedidoId }) {
  try {
    // Mesmo gate do template do líder: não assina token com o envio desligado
    // (o DRY-RUN logaria o link-capability).
    if (!WHATSAPP_LIGADO()) return { sent: false, reason: 'disabled' };
    if (!telefone) return { sent: false, reason: 'pessoa_sem_telefone' };
    let link;
    try {
      link = `${baseUrl()}/g/s/${assinarToken('suges', pedidoId, { g: grupoSugerido.id })}`;
    } catch (e) {
      console.error('[GruposWPP] token não assinado:', e.message);
      return { sent: false, reason: 'sem_secret' };
    }
    const sugeridoResumo = [
      (grupoSugerido?.nome || '').trim() || 'outro grupo',
      formatarQuando(grupoSugerido) !== 'a combinar' ? formatarQuando(grupoSugerido) : null,
      formatarOnde(grupoSugerido) !== 'a combinar' ? formatarOnde(grupoSugerido) : null,
    ].filter(Boolean).join(' — ');
    const r = await sendTemplate(telefone, TPL_SUGESTAO_GRUPO, TEMPLATE_LANG, [
      (pessoaNome || '').trim().split(/\s+/)[0] || 'Olá',
      (grupoOriginalNome || '').trim() || 'grupo escolhido',
      'a liderança encontrou um grupo que combina ainda mais com você.',
      sugeridoResumo,
      link,
      `${baseUrl()}/inscricao-grupos`,
    ]);
    if (!r.sent) console.log('[GruposWPP] template sugestão não enviado:', r.reason || r.status);
    return r;
  } catch (e) {
    console.error('[GruposWPP] notificarPessoaSugestao:', e.message);
    return { sent: false, reason: 'exception' };
  }
}

module.exports = {
  assinarToken,
  verificarToken,
  formatarQuando,
  formatarOnde,
  notificarLiderNovoPedido,
  notificarPessoaAprovada,
  notificarPessoaSugestao,
};
