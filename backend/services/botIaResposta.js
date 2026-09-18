// ════════════════════════════════════════════════════════════════════════════
//  BOT DE IA POR ÁREA · o serviço (2026-09-08)
//
//  Lê o banco, monta o contexto da pessoa, chama o modelo com a ferramenta
//  `decidir` e envia (ou não). A RÉGUA não mora aqui — mora em
//  `utils/botIaRegras` (pura, no gate). Aqui só há leitura, chamada e escrita.
//
//  Ponto de entrada no webhook: `tratar()` roda quando o MENU está calado
//  (`respostas_automaticas = false`) e `whatsapp_config.bot_ia.ativo = true`.
//  `simular()` é o mesmo caminho SEM enviar nem gravar — é o "Testar" da tela.
//
//  ⚠️⚠️ Tudo aqui é best-effort e fail-closed: qualquer erro ⇒ silêncio + log.
//  A mensagem da pessoa JÁ está no inbox (registrarInbound rodou antes); o que
//  este serviço pode perder é uma resposta automática, nunca a mensagem.
//
//  ⚠️ O modelo é o mesmo dos outros serviços de texto curto da casa (Haiku) —
//  `WHATSAPP_BOT_IA_MODEL` troca sem deploy de código.
// ════════════════════════════════════════════════════════════════════════════

const Anthropic = require('@anthropic-ai/sdk');
const { supabase } = require('../utils/supabase');
const { enviarTexto } = require('./whatsappSend');
const waInbox = require('./waInbox');
const { ehSoAgradecimento } = require('../utils/agradecimento');
const { diaBrt } = require('../utils/whatsappModulo');
const R = require('../utils/botIaRegras');

const MODEL = process.env.WHATSAPP_BOT_IA_MODEL || 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 600;

// ── leituras ────────────────────────────────────────────────────────────────

/**
 * `whatsapp_config.bot_ia` em SELECT ISOLADO: a coluna pode não existir antes
 * da migration `20260908120000`, e pedi-la na consulta do webhook derrubaria a
 * leitura de `respostas_automaticas` inteira (lição do parcelas_max).
 * Coluna ausente ⇒ bot desligado. Erro de leitura ⇒ desligado.
 */
async function lerConfig() {
  const { data, error } = await supabase.from('whatsapp_config').select('bot_ia, institucional').eq('id', 1).maybeSingle();
  if (error) {
    if (error.code === '42703' || /bot_ia/.test(error.message || '')) return { botIa: R.lerConfigBotIa(null), institucional: null, migracaoAusente: true };
    return { botIa: R.lerConfigBotIa(null), institucional: null, erro: error.message };
  }
  return { botIa: R.lerConfigBotIa(data?.bot_ia), institucional: data?.institucional || null };
}

/** Linhas de `wa_bot_areas`. Tabela ausente ⇒ []. */
async function lerAreas() {
  const { data, error } = await supabase.from('wa_bot_areas').select('*').order('area');
  if (error) {
    if (error.code === '42P01' || /wa_bot_areas/.test(error.message || '')) return { areas: [], migracaoAusente: true };
    return { areas: [], erro: error.message };
  }
  return { areas: (data || []).map(R.lerArea).filter(Boolean) };
}

async function conversaPorTelefone(telefone) {
  const tel = String(telefone || '').replace(/\D+/g, '');
  if (!tel) return null;
  const { data } = await supabase.from('wa_conversas')
    .select('id, nome, telefone, membro_id, area, atribuido_a, phone_number_id')
    .eq('telefone', tel).is('deleted_at', null).maybeSingle();
  return data || null;
}

async function conversaPorId(id) {
  const { data } = await supabase.from('wa_conversas')
    .select('id, nome, telefone, membro_id, area, atribuido_a, phone_number_id')
    .eq('id', id).is('deleted_at', null).maybeSingle();
  return data || null;
}

/** Início do dia BRT em ISO (meia-noite no Rio = 03:00Z). */
function inicioDoDiaBrtISO(agora = new Date()) {
  return `${diaBrt(agora)}T03:00:00.000Z`;
}

async function contarRespostasBotHoje(conversaId = null) {
  let q = supabase.from('wa_mensagens').select('id', { count: 'exact', head: true })
    .eq('direcao', 'out').eq('tipo', 'bot').gte('criado_em', inicioDoDiaBrtISO());
  if (conversaId) q = q.eq('conversa_id', conversaId);
  const { count, error } = await q;
  // ⚠️ Erro na contagem conta como TETO ATINGIDO: não dá pra provar que ainda há
  // orçamento, e o custo de errar fechado é uma resposta a menos.
  if (error) return Number.MAX_SAFE_INTEGER;
  return count || 0;
}

/** Última mensagem de saída escrita por GENTE (autor_id) nesta conversa. */
async function ultimaSaidaHumana(conversaId) {
  const { data, error } = await supabase.from('wa_mensagens')
    .select('criado_em').eq('conversa_id', conversaId).eq('direcao', 'out')
    .not('autor_id', 'is', null).order('criado_em', { ascending: false }).limit(1).maybeSingle();
  if (error) return null;
  return data?.criado_em || null;
}

async function historico(conversaId, n = 8) {
  const { data } = await supabase.from('wa_mensagens')
    .select('direcao, tipo, texto, criado_em').eq('conversa_id', conversaId)
    .neq('tipo', 'sistema').order('criado_em', { ascending: false }).limit(n);
  return (data || []).reverse();
}

/**
 * Resumo da pessoa pro modelo. Cada bloco é best-effort e ISOLADO: a falha de um
 * não apaga o outro — o modelo recebe "sem registro", nunca uma afirmação errada.
 */
async function perfilResumido(conv) {
  const p = { nome: conv?.nome || null, cadastrado: false, batizado: false, fez_next: false, serve: false, grupo: null, grupo_motivo: null, sugestao_grupo: null };
  if (!conv?.membro_id) return p;
  p.cadastrado = true;
  try {
    const { data: m } = await supabase.from('mem_membros').select('nome, batizado').eq('id', conv.membro_id).is('deleted_at', null).maybeSingle();
    if (m?.nome && !p.nome) p.nome = m.nome;
    p.batizado = !!m?.batizado;
    if (!p.batizado) {
      const { data: bi } = await supabase.from('batismo_inscricoes').select('id').eq('membro_id', conv.membro_id).eq('status', 'realizado').is('deleted_at', null).limit(1).maybeSingle();
      p.batizado = !!bi;
    }
  } catch { /* best-effort */ }
  try {
    const { data: nf } = await supabase.from('vw_next_formado_pessoa').select('membro_id').eq('membro_id', conv.membro_id).limit(1).maybeSingle();
    p.fez_next = !!nf;
  } catch { /* view pode não existir */ }
  try {
    const { data: vp } = await supabase.from('vol_profiles').select('id').eq('membresia_id', conv.membro_id).maybeSingle();
    if (vp?.id) {
      const { data: tm } = await supabase.from('vol_team_members').select('is_active').eq('volunteer_profile_id', vp.id).eq('is_active', true).limit(1);
      p.serve = !!(tm && tm.length);
    }
  } catch { /* best-effort */ }
  // Grupo: reusa a régua da sugestão do inbox (vínculo → desempate pelo disparo →
  // agenda com exceções → texto pronto da casa). É a MESMA que o atendente vê.
  try {
    const { sugerirAgenda, grupoDaConversa } = require('./sugestaoGrupoAgenda');
    const g = await grupoDaConversa(conv);
    p.grupo_motivo = g.motivo || null;
    if (g.grupo) {
      const s = await sugerirAgenda(conv.id).catch(() => null);
      const { ehGrupoOnline } = require('../utils/grupoOnline');
      const { data: lider } = g.grupo.lider_id
        ? await supabase.from('mem_membros').select('nome, telefone').eq('id', g.grupo.lider_id).is('deleted_at', null).maybeSingle()
        : { data: null };
      p.grupo = {
        nome: g.grupo.nome,
        online: ehGrupoOnline(g.grupo),
        local: [g.grupo.local, g.grupo.endereco, g.grupo.bairro].map(x => String(x || '').trim()).filter(Boolean).join(' — ') || null,
        lider_nome: lider?.nome || null,
        lider_telefone: lider?.telefone || null,
        proxima: s?.proxima || null,
        estimada: s?.confianca === 'estimada' || s?.confianca === 'sem_data',
      };
      if (s?.disponivel && s?.texto) p.sugestao_grupo = s.texto;
    }
  } catch (e) { console.warn('[botIa] grupo:', e.message); }
  return p;
}

// ── o modelo ────────────────────────────────────────────────────────────────

let _client = null;
function client() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  if (!_client) _client = new Anthropic({ timeout: 25_000, maxRetries: 1 });
  return _client;
}

function dataHojeTexto() {
  return new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' });
}

async function decidirComModelo({ system, user }) {
  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    tools: [R.TOOL_DECISAO],
    // Forçar a ferramenta garante o formato: nunca texto solto que a gente teria
    // que "interpretar" (e que poderia sair pra pessoa por engano).
    tool_choice: { type: 'tool', name: R.TOOL_DECISAO.name },
    messages: [{ role: 'user', content: user }],
  });
  const uso = { input: msg?.usage?.input_tokens || 0, output: msg?.usage?.output_tokens || 0 };
  const tool = (msg?.content || []).find(b => b.type === 'tool_use');
  return { input: tool?.input || null, uso, stop: msg?.stop_reason || null };
}

// ── o caminho ───────────────────────────────────────────────────────────────

/**
 * Monta contexto, decide e (opcionalmente) envia.
 * @returns {{ acao, area, motivo, texto?, uso?, decisao_modelo? }}
 */
async function decidir({ conv, texto, cfgInstitucional, botIa, areas, seco = false, agora = Date.now() }) {
  const ativas = areas.filter(a => a.ativo === true);

  // O que dispensa o modelo (barato e determinístico) — no modo SECO (simulador)
  // os tetos e o "humano ativo" NÃO se aplicam: ali a pergunta é "o que o bot
  // diria", não "ele pode falar agora".
  const [respostasHoje, respostasConversaHoje, ultimaHumanaEm] = seco || !conv
    ? [0, 0, null]
    : await Promise.all([contarRespostasBotHoje(null), contarRespostasBotHoje(conv.id), ultimaSaidaHumana(conv.id)]);

  const pre = R.decidirAntesDoModelo({
    texto, agradecimento: ehSoAgradecimento(texto), areasAtivas: ativas.length,
    respostasHoje, respostasConversaHoje, ultimaHumanaEm, agora, limites: botIa,
  });
  if (pre.pular) return { acao: 'silencio', area: conv?.area || null, motivo: pre.motivo, modelo_chamado: false };

  const [perfil, hist] = conv
    ? await Promise.all([perfilResumido(conv), historico(conv.id)])
    : [{ nome: null, cadastrado: false }, []];

  const system = R.montarSystemPrompt({
    areas, institucional: cfgInstitucional, contatoHumano: botIa.contato_humano,
    instrucoes: botIa.instrucoes, dataHoje: dataHojeTexto(),
  });
  const user = R.montarMensagemUsuario({ conversa: conv, perfil, historico: hist, texto });

  const { input, uso } = await decidirComModelo({ system, user });
  const d = R.normalizarDecisao(input, { areas, contatoHumano: botIa.contato_humano });

  let textoFinal = '';
  let removidos = null;
  if (d.acao === 'responder') {
    const linksPermitidos = [...(d.area?.links || []).map(l => l.url)];
    if (botIa.contato_link) linksPermitidos.push(botIa.contato_link);
    // ⚠️ o telefone do líder do grupo é dado do CONTEXTO (veio do banco), então
    // pode sair — é o único telefone além do contato humano que a régua libera.
    const contatoLiberado = perfil?.grupo?.lider_telefone || botIa.contato_humano;
    const s = R.sanitizarResposta(d.resposta, { linksPermitidos, contato: contatoLiberado });
    removidos = s.removidos;
    // Se a sanitização esvaziou o texto, o modelo só tinha inventado — encaminha.
    if (!s.texto || s.texto.length < 8) {
      return { acao: botIa.contato_humano ? 'encaminhar' : 'silencio', area: d.area?.area || null, motivo: 'resposta_so_inventada', uso, decisao_modelo: input, removidos,
        texto: botIa.contato_humano ? R.textoEncaminhamento({ nome: perfil?.nome || conv?.nome, contato: botIa.contato_humano, contatoLink: botIa.contato_link, area: d.area?.area || null }) : '' };
    }
    textoFinal = s.texto;
  } else if (d.acao === 'encaminhar') {
    textoFinal = R.textoEncaminhamento({
      nome: perfil?.nome || conv?.nome, contato: botIa.contato_humano, contatoLink: botIa.contato_link,
      area: d.area?.area || null,
    });
  }

  return { acao: d.acao, area: d.area?.area || null, motivo: d.motivo, texto: textoFinal, uso, decisao_modelo: input, removidos, modelo_chamado: true };
}

/**
 * Chamado pelo webhook quando o menu está calado. Nunca lança.
 * Registra a decisão em `whatsapp_coletas` (idempotência por wa_message_id +
 * trilha pro resumo da tela) e, se for o caso, envia e grava no inbox.
 */
async function tratar({ telefone, texto, messageId, phoneNumberId = null, cfg = null } = {}) {
  const resultado = { acao: 'silencio', area: null, motivo: 'nao_avaliado' };
  let coletaId = null;
  try {
    const [c, a] = await Promise.all([lerConfig(), lerAreas()]);
    if (!c.botIa.ativo) return { ...resultado, acao: 'desligado', motivo: c.migracaoAusente ? 'migration_ausente' : 'bot_desligado' };
    if (!a.areas.length) return { ...resultado, acao: 'desligado', motivo: a.migracaoAusente ? 'migration_ausente' : 'sem_areas' };

    // Idempotência: a Meta reentrega eventos. Quem consegue INSERIR a linha da
    // coleta é quem trata; reentrega bate no UNIQUE e sai sem falar duas vezes.
    if (messageId) {
      const ins = await supabase.from('whatsapp_coletas').insert({
        whatsapp_message_id: messageId, telefone, raw_text: String(texto || '').slice(0, 4000),
        status: 'ignorado', erro: 'bot_ia:pendente', modulo_destino: 'bot_ia',
      }).select('id').maybeSingle();
      if (ins.error) {
        if (ins.error.code === '23505') return { ...resultado, acao: 'duplicado', motivo: 'reentrega' };
        console.warn('[botIa] coleta:', ins.error.message);
      } else coletaId = ins.data?.id || null;
    }

    const conv = await conversaPorTelefone(telefone);
    const d = await decidir({ conv, texto, cfgInstitucional: c.institucional || cfg?.institucional || null, botIa: c.botIa, areas: a.areas });

    // Triagem de carona: a área que o modelo reconheceu vira a etiqueta da
    // conversa — só onde está VAZIA (decisão humana manda), inclusive quando o
    // bot ficou em silêncio porque a área está desligada: é exatamente aí que a
    // equipe daquela área precisa ver a conversa no filtro dela.
    if (conv && !conv.area && d.area) {
      await supabase.from('wa_conversas').update({ area: d.area }).eq('id', conv.id).is('area', null)
        .then(({ error }) => { if (error) console.warn('[botIa] triagem:', error.message); });
    }

    if ((d.acao === 'responder' || d.acao === 'encaminhar') && d.texto) {
      const opts = phoneNumberId ? { phoneNumberId } : {};
      const r = await enviarTexto(telefone, d.texto, opts);
      if (r?.ok) {
        await waInbox.registrarOutbound({ telefone, texto: d.texto, tipo: 'bot', phoneNumberId, waMessageId: r.message_id || null }).catch(() => {});
        d.enviado = true;
      } else {
        d.enviado = false;
        d.erro_envio = r?.error || 'envio_recusado';
        console.warn('[botIa] envio recusado:', d.erro_envio);
      }
    }

    if (coletaId) {
      await supabase.from('whatsapp_coletas').update({
        erro: `bot_ia:${d.acao}`,
        parsed: { bot_ia: { acao: d.acao, area: d.area, motivo: d.motivo, enviado: !!d.enviado, uso: d.uso || null, modelo: d.modelo_chamado ? MODEL : null, removidos: d.removidos || null } },
      }).eq('id', coletaId).then(({ error }) => { if (error) console.warn('[botIa] coleta update:', error.message); });
    }
    return d;
  } catch (e) {
    console.error('[botIa] tratar:', e.message);
    // A trilha não pode ficar em 'pendente' pra sempre: o resumo da tela leria
    // como "ainda decidindo". Best-effort — se nem isso der, o log acima fica.
    if (coletaId) {
      await supabase.from('whatsapp_coletas')
        .update({ erro: 'bot_ia:erro', parsed: { bot_ia: { acao: 'erro', motivo: String(e.message || 'erro').slice(0, 200) } } })
        .eq('id', coletaId).then(() => {}, () => {});
    }
    return { ...resultado, acao: 'erro', motivo: String(e.message || 'erro').slice(0, 200) };
  }
}

/**
 * O "Testar" da tela: mesmo caminho, SEM enviar e SEM gravar. Aceita uma
 * conversa real (pelo id ou telefone) pra usar o contexto dela, ou nada — aí o
 * modelo recebe uma pessoa desconhecida.
 */
async function simular({ texto, conversaId = null, telefone = null } = {}) {
  const [c, a] = await Promise.all([lerConfig(), lerAreas()]);
  const avisos = [];
  if (c.migracaoAusente || a.migracaoAusente) avisos.push('migration_ausente');
  if (!c.botIa.ativo) avisos.push('bot_desligado');
  if (!a.areas.some(x => x.ativo)) avisos.push('nenhuma_area_ligada');
  if (!c.botIa.contato_humano) avisos.push('sem_contato_humano');

  let conv = null;
  if (conversaId) conv = await conversaPorId(conversaId);
  else if (telefone) conv = await conversaPorTelefone(telefone);

  const d = await decidir({ conv, texto, cfgInstitucional: c.institucional, botIa: c.botIa, areas: a.areas, seco: true });
  return { ...d, avisos, modelo: MODEL, conversa: conv ? { id: conv.id, nome: conv.nome, area: conv.area, cadastrada: !!conv.membro_id } : null };
}

// `decidir` sai exportado pro smoke com áreas sintéticas (não lê banco de
// config) — nunca é chamado de fora em produção.
module.exports = { tratar, simular, lerConfig, lerAreas, decidir, MODEL };
