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
const { configurado } = require('./whatsappService');
// Fila com reenvio automático: enfileirar() grava e tenta na hora; se o envio
// bater no teto diário da Meta (janela móvel de 24h), o cron reprocessa.
const { enfileirar } = require('./whatsappFila');
// Bloqueio geral (garantia 100% · Marcos 2026-07-23): quando ligado, NENHUM
// envio de grupos sai — nem por evento, nem manual, nem automático. Módulo leaf
// (sem require circular). Checado no topo de cada função de envio.
const { bloqueioTotalAtivo } = require('./gruposEnviosConfig');

// GRUPOS_TOKEN_SECRET (opcional) isola esta superfície dos demais usos do
// CRON_SECRET (bearer de crons, clientState do Graph no Cérebro — que é
// ecoado a terceiro). Sem ela, cai no CRON_SECRET como o resto do repo.
const SECRET = process.env.GRUPOS_TOKEN_SECRET || process.env.CRON_SECRET;
// Gate = a MESMA condição que faz o sendTemplate enviar de verdade
// (ENABLED + token + phone id). Um gate mais estreito (só ENABLED) deixaria
// o sendTemplate cair em dry-run e logar o link-capability em produção.
const WHATSAPP_LIGADO = () => configurado();
const TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_LANG || 'pt_BR';
// v2 (29/07 · pedido do Pr. Nélio, aprovado na Meta): o aviso ao líder instrui
// LIGAR pra pessoa antes de aceitar/recusar; o de aprovado perdeu o "o líder
// vai falar com você" (o contato já aconteceu). Mesmas 5 variáveis dos v1.
const TPL_NOVO_PEDIDO_LIDER = process.env.WHATSAPP_TEMPLATE_GRUPOS_PEDIDO_LIDER || 'grupos_pedido_novo_lider_v2';
const TPL_PEDIDO_APROVADO = process.env.WHATSAPP_TEMPLATE_GRUPOS_APROVADO || 'grupos_pedido_aprovado_v2';
// grupos_sugestao_grupo (UTILITY · 5 variáveis) — a 1ª versão, submetida como
// grupos_pedido_recusado, foi reclassificada pela Meta como MARKETING (2º link
// de navegação + tom promocional); a UTILITY é mais barata e não é pausável.
const TPL_SUGESTAO_GRUPO = process.env.WHATSAPP_TEMPLATE_GRUPOS_SUGESTAO || 'grupos_sugestao_grupo';
const TPL_FREQUENCIA_MES = process.env.WHATSAPP_TEMPLATE_GRUPOS_FREQUENCIA || 'grupos_frequencia_mes';
// grupos_renovacao_temporada (UTILITY · 4 variáveis · 1 link como variável de
// body — lição do grupos_sugestao_grupo: 2º link/tom promocional reclassifica
// como MARKETING). Renovação semestral: o líder diz se continua com o grupo.
const TPL_RENOVACAO = process.env.WHATSAPP_TEMPLATE_GRUPOS_RENOVACAO || 'grupos_renovacao_temporada';
// grupos_confira_lista (UTILITY · 4 variáveis · o link é variável de BODY, não
// botão — mesma técnica do renovacao/frequencia, que é o que mantém a categoria
// UTILITY na revisão da Meta). "Confira a lista do seu grupo": o líder abre e
// DESMARCA quem não faz mais parte (a lista vem toda marcada).
const TPL_CONFIRA = process.env.WHATSAPP_TEMPLATE_GRUPOS_CONFIRA || 'grupos_confira_lista';
// Material do grupo (envio manual · aba Envios). O template ainda NÃO existe na
// Meta (Marcos: testar na próxima temporada) → sem a env, montarEnvioMaterial
// devolve erro 'sem_template' e nada sai (nunca texto livre proativo).
const TPL_MATERIAL = process.env.WHATSAPP_TEMPLATE_GRUPOS_MATERIAL || null;
// Abertura de inscrições (Utility · Marcos 2026-07-24): avisa o LÍDER que a
// temporada abriu + bloco pra ele encaminhar no grupo (o link vive FIXO no
// corpo do template · a Cloud API não posta em grupo). Nome fixo no código; env
// só pra override. Só sai de fato depois de aprovar o template na Meta.
const TPL_ABERTURA = process.env.WHATSAPP_TEMPLATE_GRUPOS_ABERTURA || 'abertura_grupos_convite_lider';
// «Olá {{1}}! Recebemos sua inscrição em {{2}}. 💙 Em breve te damos os
// próximos passos.» — mensagem 1 da inscrição (a 2 é o grupos_pedido_aprovado).
const TPL_INSCRICAO_CONFIRMADA = process.env.WHATSAPP_TEMPLATE_INSCRICAO_CONFIRMADA || 'cbrio_inscricao_confirmada';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
// 'YYYY-MM' → 'julho/2026'
function rotuloMes(m) {
  const [ano, mes] = String(m || '').split('-').map(Number);
  return (mes >= 1 && mes <= 12) ? `${MESES[mes - 1]}/${ano}` : String(m || '');
}

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
// Renovação de temporada: a janela entre o fim de uma temporada e a abertura
// da próxima passa de 7 dias (e a fila pode segurar o envio por dias no
// backoff — o token é assinado no MONTAR, não no entregar). A revogação real
// é server-side: geração do token × linha + inscrições abertas + triagem.
const RENOV_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
// Conferência da lista: mesma razão do TTL longo da renovação (o token é
// assinado no MONTAR, e a fila pode segurar a entrega por dias no backoff). A
// revogação real é server-side: geração do token × linha, liderança atual e
// linha não triada.
const CONFIRA_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

// URL local (dev) NUNCA vira link de WhatsApp — quem recebe é sempre externo.
// Incidente 29/07/2026: redisparo local montou o link com localhost:5173.
// O waSender ainda bloqueia o envio (2ª camada); aqui a URL já nasce certa.
const RE_BASE_LOCAL = /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|^https?:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i;
function baseUrl() {
  const candidata = (process.env.FRONTEND_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://cbrio.org')
  ).replace(/\/+$/, '');
  if (RE_BASE_LOCAL.test(candidata)) {
    console.warn('[GruposWPP] FRONTEND_URL local (%s) ignorada em link de WhatsApp — usando https://cbrio.org', candidata);
    return 'https://cbrio.org';
  }
  return candidata;
}

// ── Token ────────────────────────────────────────────────────────────────
// ttlMs opcional (default 7d) — a renovação de temporada usa 30d.
function assinarToken(tipo, pedidoId, extra, ttlMs) {
  if (!SECRET) throw new Error('CRON_SECRET ausente — token de grupos não pode ser assinado');
  const payload = { t: tipo, p: pedidoId, exp: Date.now() + (ttlMs || TOKEN_TTL_MS), ...(extra || {}) };
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
  // Grupo diário acontece todos os dias — sem dia da semana fixo (Marcos · 17/07).
  if ((grupo?.recorrencia || '').toLowerCase().trim() === 'diario') {
    return grupo.horario ? `Todos os dias às ${String(grupo.horario).slice(0, 5)}` : 'Todos os dias';
  }
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
    if (await bloqueioTotalAtivo()) return { sent: false, reason: 'bloqueio_total' };
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

    // `pessoa.contato` (opcional) sobrescreve o {{4}}: é o que a inscrição de
    // CASAL usa pra mandar os DOIS contatos num aviso só. Sem ele, o padrão de
    // sempre (telefone · e-mail da pessoa).
    const contato = String(pessoa.contato || '').trim()
      || [pessoa.telefone, pessoa.email].filter(Boolean).join(' · ')
      || 'sem contato';
    // trim + fallback DEPOIS do split: nome importado com espaço à esquerda
    // viraria param '' e a Meta rejeita o template inteiro
    const r = await enfileirar({
      telefone: lider.telefone,
      template: TPL_NOVO_PEDIDO_LIDER,
      params: [
        (lider.nome || '').trim().split(/\s+/)[0] || 'Líder',
        (grupo.nome || '').trim() || 'seu grupo',
        (pessoa.nome || '').trim() || 'Alguém',
        contato,
        link,
      ],
      contexto: 'grupos.pedido_novo_lider',
      refId: pedidoId,
    });
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
    if (await bloqueioTotalAtivo()) return { sent: false, reason: 'bloqueio_total' };
    if (!telefone) return { sent: false, reason: 'pessoa_sem_telefone' };
    const r = await enfileirar({
      telefone,
      template: TPL_PEDIDO_APROVADO,
      params: [
        (grupo?.nome || '').trim() || 'seu grupo',
        formatarQuando(grupo),
        formatarOnde(grupo),
        (liderNome || '').trim() || 'o líder do grupo',
        (liderTelefone || '').trim() || 'em breve pelo WhatsApp',
      ],
      contexto: 'grupos.pedido_aprovado',
    });
    if (!r.sent) console.log('[GruposWPP] template aprovado não enviado:', r.reason || r.status);
    return r;
  } catch (e) {
    console.error('[GruposWPP] notificarPessoaAprovada:', e.message);
    return { sent: false, reason: 'exception' };
  }
}

// Template 3 (realocação) · grupos_pedido_recusado — corpo real na Meta:
// «Olá, {{1}}! Atualização sobre sua inscrição no grupo "{{2}}": {{3}} ·
// Você pode concluir sua inscrição neste grupo com vagas: {{4}} ·
// Para confirmar sua entrada, acesse: {{5}}»
// {{1}} primeiro nome · {{2}} grupo ORIGINAL do pedido · {{3}} mensagem ·
// {{4}} grupo sugerido (nome — quando — onde) · {{5}} link de aceite /g/s/.
// Sem 2º link de navegação nem tom promocional — é o que mantém a categoria
// UTILITY na revisão da Meta (a versão com "veja outras opções" virou MARKETING).
// Sanitiza o motivo digitado pela triagem pra virar parâmetro de template:
// sem links, sem quebras de linha (a Meta rejeita \n/\t e sequências de
// espaços em params) e curto — é UMA frase dentro da mensagem de utilidade.
function sanitizarMotivo(motivo) {
  return String(motivo || '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

async function notificarPessoaSugestao({ telefone, pessoaNome, grupoOriginalNome, grupoSugerido, pedidoId, motivo }) {
  try {
    if (await bloqueioTotalAtivo()) return { sent: false, reason: 'bloqueio_total' };
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
    // {{3}} leva o motivo escolhido pela triagem (Marcos 13/07: a pessoa deve
    // entender O QUE aconteceu) — com fallback na frase neutra de sempre.
    const motivoTxt = sanitizarMotivo(motivo);
    const mensagemSugestao = motivoTxt
      ? `${motivoTxt} — a liderança indicou um grupo com vagas para você.`
      : 'a liderança indicou um grupo com vagas para você.';
    const r = await enfileirar({
      telefone,
      template: TPL_SUGESTAO_GRUPO,
      params: [
        (pessoaNome || '').trim().split(/\s+/)[0] || 'Olá',
        (grupoOriginalNome || '').trim() || 'grupo escolhido',
        mensagemSugestao,
        sugeridoResumo,
        link,
      ],
      contexto: 'grupos.sugestao_grupo',
      refId: pedidoId,
    });
    if (!r.sent) console.log('[GruposWPP] template sugestão não enviado:', r.reason || r.status);
    return r;
  } catch (e) {
    console.error('[GruposWPP] notificarPessoaSugestao:', e.message);
    return { sent: false, reason: 'exception' };
  }
}

// Template 4 · grupos_frequencia_mes — 1×/mês pede ao LÍDER a chamada do mês
// pelo link /g/f/<token> (marca quem participou · vira encontro+presenças).
// {{1}} primeiro nome do líder · {{2}} mês (julho/2026) · {{3}} grupo · {{4}} link
// Monta o envio SEM enviar — o cron mensal enfileira em LOTE (enfileirarLote,
// a fila horária drena com backoff); o caminho individual abaixo envia na hora.
// Gate ANTES de assinar (token não pode parar em log de dry-run).
function montarEnvioFrequencia({ grupo, lider, mes }) {
  if (!WHATSAPP_LIGADO()) return { erro: 'disabled' };
  if (!lider?.telefone) return { erro: 'lider_sem_telefone' };
  let link;
  try {
    link = `${baseUrl()}/g/f/${assinarToken('freq', grupo.id, { m: mes, l: grupo.lider_id })}`;
  } catch (e) {
    console.error('[GruposWPP] token não assinado:', e.message);
    return { erro: 'sem_secret' };
  }
  return {
    envio: {
      telefone: lider.telefone,
      template: TPL_FREQUENCIA_MES,
      params: [
        (lider.nome || '').trim().split(/\s+/)[0] || 'Líder',
        rotuloMes(mes),
        (grupo.nome || '').trim() || 'seu grupo',
        link,
      ],
      contexto: 'grupos.frequencia_mes',
      refId: grupo.id,
    },
  };
}

// Caminho individual (reenvio deliberado a um líder): envia na hora via fila.
async function notificarLiderFrequencia({ grupo, lider, mes }) {
  try {
    if (await bloqueioTotalAtivo()) return { sent: false, reason: 'bloqueio_total' };
    const m = montarEnvioFrequencia({ grupo, lider, mes });
    if (m.erro) return { sent: false, reason: m.erro };
    const r = await enfileirar(m.envio);
    if (!r.sent) console.log('[GruposWPP] template frequência não enviado:', r.reason || r.status);
    return r;
  } catch (e) {
    console.error('[GruposWPP] notificarLiderFrequencia:', e.message);
    return { sent: false, reason: 'exception' };
  }
}

// Template 6 · grupos_renovacao_temporada — 1×/semestre pergunta ao LÍDER se
// continua com o grupo na próxima temporada, pelo link /g/r/<token>.
// {{1}} primeiro nome do líder · {{2}} temporada (label) · {{3}} grupo · {{4}} link
// Token 'renov' = { p: grupoId, r: renovacaoId, g: geração, l: liderId } ·
// 30 dias — MAS a validade real é decidida no servidor a cada uso (geração ×
// linha, liderança atual, inscrições da temporada ainda fechadas, não triada).
// Monta SEM enviar (o disparo manual enfileira em lote); gate ANTES de assinar
// (token não pode parar em log de dry-run).
function montarEnvioRenovacao({ grupo, lider, temporada, renovacaoId, geracao }) {
  if (!WHATSAPP_LIGADO()) return { erro: 'disabled' };
  if (!lider?.telefone) return { erro: 'lider_sem_telefone' };
  let link;
  try {
    link = `${baseUrl()}/g/r/${assinarToken('renov', grupo.id, {
      r: renovacaoId, g: geracao || 1, l: grupo.lider_id,
    }, RENOV_TTL_MS)}`;
  } catch (e) {
    console.error('[GruposWPP] token não assinado:', e.message);
    return { erro: 'sem_secret' };
  }
  return {
    envio: {
      telefone: lider.telefone,
      template: TPL_RENOVACAO,
      params: [
        (lider.nome || '').trim().split(/\s+/)[0] || 'Líder',
        (temporada?.label || temporada?.id || 'nova temporada'),
        (grupo.nome || '').trim() || 'seu grupo',
        link,
      ],
      contexto: 'grupos.renovacao_temporada',
      refId: renovacaoId,
    },
  };
}

// Template 8 · grupos_confira_lista — "Confira a lista do seu grupo": o líder
// abre /g/c/<token>, vê a lista ATUAL toda marcada e DESMARCA quem não faz mais
// parte. Irmão da renovação, mas sem "vai continuar?" e sem trava de temporada.
// {{1}} primeiro nome do líder · {{2}} grupo · {{3}} quantidade de pessoas na
// lista · {{4}} link (variável de BODY · não botão).
// Token 'conf' = { p: grupoId, c: conferenciaId, g: geração, l: liderId } ·
// 30 dias — MAS a validade real é decidida no servidor a cada uso (geração ×
// linha, liderança atual, linha não triada).
// Monta SEM enviar (o disparo manual enfileira em lote); gate ANTES de assinar
// (token não pode parar em log de dry-run).
function montarEnvioConfira({ grupo, lider, conferenciaId, geracao, qtd }) {
  if (!WHATSAPP_LIGADO()) return { erro: 'disabled' };
  if (!lider?.telefone) return { erro: 'lider_sem_telefone' };
  let link;
  try {
    link = `${baseUrl()}/g/c/${assinarToken('conf', grupo.id, {
      c: conferenciaId, g: geracao || 1, l: grupo.lider_id,
    }, CONFIRA_TTL_MS)}`;
  } catch (e) {
    console.error('[GruposWPP] token não assinado:', e.message);
    return { erro: 'sem_secret' };
  }
  return {
    envio: {
      telefone: lider.telefone,
      template: TPL_CONFIRA,
      params: [
        (lider.nome || '').trim().split(/\s+/)[0] || 'Líder',
        (grupo.nome || '').trim() || 'seu grupo',
        // Param de template NUNCA pode ser string vazia (a Meta rejeita a
        // mensagem inteira) — 0 vira '0', não ''.
        String(Number.isFinite(qtd) ? qtd : 0),
        link,
      ],
      contexto: 'grupos.confira_lista',
      refId: conferenciaId,
    },
  };
}

// Template 6 · material do grupo (envio manual · aba Envios · Marcos 23/07).
// {{1}} primeiro nome do líder · {{2}} título/material · {{3}} link do arquivo.
// Monta SEM enviar (o disparo manual enfileira em lote). ⚠️ Sem o template
// aprovado na Meta (env WHATSAPP_TEMPLATE_GRUPOS_MATERIAL), devolve 'sem_template'
// e NADA sai — nunca texto livre (barreira). Testar na próxima temporada.
function montarEnvioMaterial({ lider, link, titulo }) {
  if (!WHATSAPP_LIGADO()) return { erro: 'disabled' };
  if (!lider?.telefone) return { erro: 'lider_sem_telefone' };
  if (!TPL_MATERIAL) return { erro: 'sem_template' };
  return {
    envio: {
      telefone: lider.telefone,
      template: TPL_MATERIAL,
      params: [
        (lider.nome || '').trim().split(/\s+/)[0] || 'Líder',
        (titulo || 'Material do grupo').slice(0, 120),
        link || '',
      ],
      contexto: 'grupos.material',
      refId: null,
    },
  };
}

// Template 7 · abertura_grupos_convite_lider (Utility) — avisa o LÍDER que as
// inscrições da temporada abriram + bloco pra ele encaminhar no grupo. O link
// (cbrio.org/inscricao-grupos) é FIXO no corpo do template na Meta → aqui só
// vai {{1}} = primeiro nome. Monta SEM enviar (o disparo manual enfileira em
// lote). Sem o template aprovado, a fila falha por-mensagem (não é texto livre).
function montarEnvioAbertura({ lider }) {
  if (!WHATSAPP_LIGADO()) return { erro: 'disabled' };
  if (!lider?.telefone) return { erro: 'lider_sem_telefone' };
  return {
    envio: {
      telefone: lider.telefone,
      template: TPL_ABERTURA,
      params: [ (lider.nome || '').trim().split(/\s+/)[0] || 'Líder' ],
      contexto: 'grupos.abertura_convite',
      refId: null,
    },
  };
}

// Template 5 · cbrio_inscricao_confirmada — mensagem 1 pra PESSOA no momento
// da inscrição («recebemos, em breve os próximos passos» · a mensagem 2 é o
// grupos_pedido_aprovado, na aprovação). {{1}} primeiro nome · {{2}} grupo.
async function enviarInscricaoConfirmada({ telefone, nome, grupoNome, pedidoId }) {
  try {
    if (await bloqueioTotalAtivo()) return { sent: false, reason: 'bloqueio_total' };
    if (!telefone) return { sent: false, reason: 'pessoa_sem_telefone' };
    const r = await enfileirar({
      telefone,
      template: TPL_INSCRICAO_CONFIRMADA,
      params: [
        (nome || '').trim().split(/\s+/)[0] || 'Olá',
        (grupoNome || '').trim() || 'um grupo de conexão',
      ],
      contexto: 'grupos.inscricao_confirmada',
      refId: pedidoId,
    });
    if (!r.sent) console.log('[GruposWPP] inscrição confirmada não enviada agora:', r.reason || '(na fila)');
    return r;
  } catch (e) {
    console.error('[GruposWPP] enviarInscricaoConfirmada:', e.message);
    return { sent: false, reason: 'exception' };
  }
}

module.exports = {
  baseUrl,
  assinarToken,
  verificarToken,
  formatarQuando,
  formatarOnde,
  rotuloMes,
  notificarLiderNovoPedido,
  notificarPessoaAprovada,
  notificarPessoaSugestao,
  montarEnvioFrequencia,
  notificarLiderFrequencia,
  montarEnvioRenovacao,
  montarEnvioConfira,
  montarEnvioMaterial,
  montarEnvioAbertura,
  enviarInscricaoConfirmada,
};
