// ════════════════════════════════════════════════════════════════════════════
//  GANCHO DO WEBHOOK · "cadê o link do meu grupo?" → AVISA A LIDERANÇA
//  (26/09/2026 · determinístico, SEM IA — o crédito da Anthropic acabou e o
//  gancho não pode depender dele)
//
//  Pedido do Matheus (item 4): *"preciso que o líder seja avisado que tal pessoa
//  está solicitando o link do grupo"*. Roda ANTES do bot de IA e independe de
//  `bot_ia.ativo`.
//
//  ⚠️⚠️ O QUE ESTE GANCHO NUNCA FAZ: mandar o link da sala. `mem_grupo_link` é
//  CREDENCIAL DE ENTRADA e a identidade da conversa de WhatsApp é FRACA
//  (`wa_conversas.membro_id` por sufixo de 8 dígitos, 744 telefones
//  compartilhados por família). Quem entrega o link é a liderança, que sabe quem
//  é a pessoa. Decisão do conselho (26/09). Há guarda estática no gate.
//
//  A régua (de qual grupo, o dia da dedup, o que a resposta pode afirmar) é PURA
//  e mora em `utils/pedidoLinkGrupo.js`. Aqui é só banco e envio.
//
//  Contrato: `tratarPedidoLink(...)` NUNCA lança. Devolve `{ tratado:false }`
//  quando a mensagem não é dele (o webhook segue pro bot de IA) e
//  `{ tratado:true, acionarEquipe }` quando assumiu a mensagem.
// ════════════════════════════════════════════════════════════════════════════

const { supabase } = require('../utils/supabase');
const { semFalhar } = require('../utils/semFalhar');
const {
  DISPARO_ID, CONTEXTO, TEMPLATE_PADRAO,
  pedeLink, escolherGrupoParaLink, chaveDoDia, algumCanalSaiu,
  paramsTemplateLider, textoAvisoLider, respostaDoPedidoLink,
} = require('../utils/pedidoLinkGrupo');
const { pedeTroca } = require('../utils/trocaGrupoConversa');
const { ehGrupoOnline } = require('../utils/grupoOnline');
const { grupoDaConversa, liderDoGrupo } = require('./sugestaoGrupoAgenda');
const { mesmoNumeroBR, soDigitos, registrarOutbound } = require('./waInbox');

/** Janela dos pedidos de entrada que contam como "o grupo dela" (o GAP). */
const JANELA_PEDIDOS_DIAS = 90;

/** Colunas de `mem_grupos` que o gancho precisa (as mesmas do `grupoDaConversa`). */
const COLS_GRUPO = 'id, nome, dia_semana, horario, recorrencia, local, endereco, bairro, temporada, lider_id, ativo, deleted_at';

/**
 * Os grupos dos pedidos de entrada `pendente`/`aprovado` da pessoa — o GAP de
 * quem acabou de se inscrever e ainda não tem vínculo.
 *
 * ⚠️ Por `membro_id` quando a conversa tem cadastro; senão pelo TELEFONE do
 * pedido (sufixo de 8 + `mesmoNumeroBR` pra confirmar — o sufixo sozinho casa
 * número de outro DDD). Ainda é identidade fraca, e é por isso que o gancho só
 * AVISA a liderança: quem decide mandar o link é gente.
 * ⚠️ Janela de 90 dias: pedido aprovado de uma temporada passada, de quem já
 * saiu do grupo, apontaria o aviso para a líder errada.
 * ⚠️ Erro de consulta devolve `null` (≠ lista vazia): o chamador não pode
 * concluir "não tem grupo" de uma consulta que falhou.
 */
async function gruposDosPedidos(conversa) {
  const desde = new Date(Date.now() - JANELA_PEDIDOS_DIAS * 86400000).toISOString();
  let q = supabase.from('mem_grupo_pedidos')
    .select(`id, telefone, grupo_id, mem_grupos!inner(${COLS_GRUPO})`)
    .in('status', ['pendente', 'aprovado'])
    .is('deleted_at', null)
    .gte('created_at', desde)
    .limit(20);
  const tel = soDigitos(conversa?.telefone);
  if (conversa?.membro_id) q = q.eq('membro_id', conversa.membro_id);
  else if (tel.length >= 8) q = q.ilike('telefone', `%${tel.slice(-8)}`);
  else return [];

  const { data, error } = await q;
  if (error) { console.warn('[pedidoLink] pedidos:', error.message); return null; }
  return (data || [])
    .filter((p) => conversa?.membro_id || mesmoNumeroBR(soDigitos(p.telefone), tel))
    .map((p) => p.mem_grupos)
    .filter(Boolean);
}

/**
 * O template está APROVADO na Meta? (consulta fresca, sem cache)
 *
 * ⚠️ `whatsappFila.templateBloqueado` deixa PENDING passar de propósito (o
 * espelho pode estar atrasado). Aqui a pergunta é outra: se a resposta à pessoa
 * vai dizer "já avisamos", o WhatsApp da líder só conta com template APROVADO —
 * PENDING é recusa da Meta na hora do envio.
 */
async function templateAprovado(nome) {
  const { data, error } = await supabase.from('wa_templates')
    .select('status_meta').eq('nome', nome).limit(5);
  if (error) { console.warn('[pedidoLink] wa_templates:', error.message); return false; }
  return (data || []).some((t) => String(t.status_meta || '').toUpperCase() === 'APPROVED');
}

/**
 * A REIVINDICAÇÃO do aviso do dia: quem insere a linha avisa.
 * @returns `{ id }` (novo) · `{ repetido:true, canais }` (23505) ·
 *   `{ indisponivel:true }` (tabela ausente ou erro — não avisa ninguém).
 */
async function reivindicarAviso({ conversa, grupo, agora }) {
  const linha = {
    conversa_id: conversa.id,
    grupo_id: grupo.id,
    membro_id: conversa.membro_id || null,
    lider_id: grupo.lider_id || null,
    dia_brt: chaveDoDia(agora),
  };
  const { data, error } = await supabase.from('wa_grupo_link_pedidos')
    .insert(linha).select('id').maybeSingle();
  if (!error) return { id: data?.id || null };

  if (error.code === '23505') {
    // Já avisamos hoje. Relê o que saiu, pra resposta não prometer o que não houve.
    const { data: ja } = await supabase.from('wa_grupo_link_pedidos')
      .select('id, canais')
      .eq('conversa_id', linha.conversa_id).eq('grupo_id', linha.grupo_id).eq('dia_brt', linha.dia_brt)
      .maybeSingle();
    return { repetido: true, id: ja?.id || null, canais: ja?.canais || {} };
  }
  // ⚠️ 42P01/PGRST205 = migration 20260926120000 ainda não aplicada. Sem a
  // reivindicação não há dedup — e aviso sem dedup, com a Meta reentregando,
  // vira dois WhatsApps iguais pra líder. Então NÃO avisa; responde o de sempre.
  if (error.code === '42P01' || error.code === 'PGRST205') {
    console.warn('[pedidoLink] wa_grupo_link_pedidos ausente (migration 20260926120000 pendente)');
  } else {
    console.warn('[pedidoLink] reivindicar:', error.code, error.message);
  }
  return { indisponivel: true };
}

/** Os três canais do aviso. Cada um devolve UMA palavra; só `enviado` conta. */
async function avisarLideranca({ linhaId, conversa, grupo, lider }) {
  const canais = {};
  const pessoaNome = conversa.nome || '';
  const pessoaTelefone = conversa.telefone || '';
  const { titulo, mensagem } = textoAvisoLider({ pessoaNome, pessoaTelefone, grupoNome: grupo.nome });

  // 1) Sino do ERP / app do staff — SÓ quem responde pelo grupo.
  //    ⚠️ Lista vazia NÃO chama `notificar`: sem `targetIds` ele cai no
  //    fallback de TODOS os admin/diretor, e o telefone da pessoa iria junto.
  try {
    const { donosDoGrupo } = require('./gruposDestinatarios');
    const alvo = await donosDoGrupo(grupo.id);
    if (!alvo.length) canais.sino = 'sem_destinatario';
    else {
      const { notificar } = require('./notificar');
      const n = await notificar({
        modulo: 'grupos', tipo: 'grupo_link_pedido', titulo, mensagem,
        link: '/grupos', severidade: 'info',
        chaveDedup: `grupo_link_pedido_${linhaId}`, targetIds: alvo,
      });
      canais.sino = Number(n) > 0 ? 'enviado' : 'nao_gravado';
    }
  } catch (e) { console.warn('[pedidoLink] sino:', e.message); canais.sino = 'erro'; }

  // 2) App do membro (a líder que só tem o app).
  try {
    const { donosDoGrupoApp } = require('./gruposDestinatarios');
    const alvoApp = await donosDoGrupoApp(grupo.id);
    if (!alvoApp.length) canais.app = 'sem_destinatario';
    else {
      const { notificarApp } = require('./appPush');
      const r = await notificarApp(alvoApp, {
        tipo: 'grupo_link_pedido', titulo, body: mensagem,
        data: { grupo_id: grupo.id }, chaveDedup: `grupo_link_pedido:${linhaId}`,
      });
      canais.app = Number(r?.persistidos) > 0 ? 'enviado' : 'nao_gravado';
    }
  } catch (e) { console.warn('[pedidoLink] app:', e.message); canais.app = 'erro'; }

  // 3) WhatsApp da líder, pela fila, com template APROVADO.
  try {
    const { disparoDesligado } = require('./comunicacaoDisparosOff');
    const { bloqueioTotalAtivo } = require('./gruposEnviosConfig');
    const template = process.env.WHATSAPP_TEMPLATE_GRUPOS_LINK_PEDIDO || TEMPLATE_PADRAO;
    const telLider = soDigitos(lider.telefone);
    if (await disparoDesligado(DISPARO_ID)) canais.whatsapp = 'desligado';
    else if (await bloqueioTotalAtivo()) canais.whatsapp = 'bloqueio_total';
    else if (telLider.length < 10) canais.whatsapp = 'sem_telefone_lider';
    else if (!(await templateAprovado(template))) canais.whatsapp = 'template_nao_aprovado';
    else {
      const { enfileirar } = require('./whatsappFila');
      const r = await enfileirar({
        telefone: telLider,
        template,
        params: paramsTemplateLider({ liderNome: lider.nome, pessoaNome, grupoNome: grupo.nome, pessoaTelefone }),
        contexto: CONTEXTO,
        refId: linhaId,
      });
      // ⚠️ `na_fila` NÃO é "saiu": com o kill-switch ligado a linha espera e
      // pode nunca sair — e a resposta à pessoa não pode prometer em cima disso.
      canais.whatsapp = r?.sent === true ? 'enviado' : r?.queued ? 'na_fila' : String(r?.reason || 'erro').slice(0, 60);
    }
  } catch (e) { console.warn('[pedidoLink] whatsapp:', e.message); canais.whatsapp = 'erro'; }

  return canais;
}

async function gravarTrilha(coletaId, parsed) {
  if (!coletaId) return;
  await semFalhar(supabase.from('whatsapp_coletas').update({
    erro: 'gancho:link', parsed,
  }).eq('id', coletaId), '[pedidoLink] coleta');
}

/**
 * @param conversa `wa_conversas` da pessoa (o `ganchosGrupoWhatsapp` já leu).
 * @param enviarTexto `(telefone, texto, opts) → { ok, message_id, error }`.
 */
async function tratarPedidoLink({ telefone, texto, messageId, phoneNumberId = null, enviarTexto, conversa, agora = new Date() } = {}) {
  let coletaId = null;
  try {
    if (!pedeLink(texto)) return { tratado: false, motivo: 'nao_e_pedido' };
    // ⚠️ "Quero trocar de grupo, qual o link do outro?" é pedido de TROCA —
    // avisar a líder do grupo ATUAL pra mandar o link do atual seria o oposto.
    if (pedeTroca(texto)) return { tratado: false, motivo: 'pedido_de_troca' };
    if (!conversa?.id) return { tratado: false, motivo: 'sem_conversa' };

    const vinculos = await grupoDaConversa(conversa);
    let pedidos = [];
    if (!vinculos.grupo && vinculos.motivo !== 'erro' && vinculos.motivo !== 'ambiguo') {
      pedidos = await gruposDosPedidos(conversa);
      if (pedidos === null) return { tratado: false, motivo: 'erro_pedidos' };
    }
    const escolha = escolherGrupoParaLink({ vinculos, pedidos });
    if (!escolha.grupo) return { tratado: false, motivo: escolha.motivo };
    const grupo = escolha.grupo;

    // ⚠️ Presencial não tem link — a sugestão manual do inbox (31/08) cobre.
    if (!ehGrupoOnline(grupo)) return { tratado: false, motivo: 'presencial' };
    // ⚠️ A própria líder perguntando "cadê o link?" não é pedido pra ela mesma.
    if (conversa.membro_id && grupo.lider_id && conversa.membro_id === grupo.lider_id) {
      return { tratado: false, motivo: 'e_a_lideranca' };
    }

    // Daqui pra frente o gancho ASSUME a mensagem. A reivindicação da coleta é
    // a idempotência contra a reentrega da Meta (o mesmo UNIQUE do bot de IA) —
    // e só acontece AGORA, depois de decidir tratar: se reivindicasse antes, o
    // bot de IA bateria no 23505 nas mensagens que o gancho devolve.
    if (messageId) {
      const ins = await supabase.from('whatsapp_coletas').insert({
        whatsapp_message_id: messageId, telefone, raw_text: String(texto || '').slice(0, 4000),
        status: 'ignorado', erro: 'gancho:link', modulo_destino: 'bot_ia',
      }).select('id').maybeSingle();
      if (ins.error) {
        if (ins.error.code === '23505') return { tratado: true, acao: 'duplicado', motivo: 'reentrega' };
        console.warn('[pedidoLink] coleta:', ins.error.message);
      } else coletaId = ins.data?.id || null;
    }

    const lider = await liderDoGrupo(grupo);
    const reiv = await reivindicarAviso({ conversa, grupo, agora });
    let canais = {};
    let repetido = false;
    if (reiv.repetido) {
      repetido = true;
      canais = reiv.canais || {};
    } else if (reiv.id) {
      canais = await avisarLideranca({ linhaId: reiv.id, conversa, grupo, lider });
      await semFalhar(supabase.from('wa_grupo_link_pedidos').update({ canais }).eq('id', reiv.id), '[pedidoLink] canais');
    }

    // ⚠️⚠️ O telefone da líder NÃO vai na resposta automática: a identidade da
    // conversa é fraca, e o número pessoal de uma líder não é dado que o bot
    // entrega a quem escreveu. Quando o aviso saiu, é ela quem procura a
    // pessoa; quando não saiu, a equipe é acionada (acionarEquipe abaixo).
    const { texto: resposta } = respostaDoPedidoLink({
      conversaNome: conversa.nome, grupo, liderNome: lider.nome, liderTelefone: '', canais, repetido,
    });
    const avisou = algumCanalSaiu(canais);

    const opts = phoneNumberId ? { phoneNumberId } : {};
    const r = typeof enviarTexto === 'function'
      ? await enviarTexto(telefone, resposta, opts).catch((e) => ({ ok: false, error: e.message }))
      : { ok: false, error: 'sem_enviarTexto' };
    if (r?.ok) {
      await registrarOutbound({ telefone, texto: resposta, tipo: 'bot', phoneNumberId, waMessageId: r.message_id || null })
        .catch((e) => console.warn('[pedidoLink] outbound:', e.message));
    }

    await gravarTrilha(coletaId, {
      gancho: 'link', grupo_id: grupo.id, origem_grupo: escolha.origem, canais,
      repetido, avisou, enviado: !!r?.ok,
    });
    // ⚠️ Sem aviso que SAIU (ou sem resposta enviada), a pessoa fica sem ninguém
    // chamado a agir — aí a conversa vai pra equipe de atendimento.
    return { tratado: true, acao: 'link', grupo_id: grupo.id, canais, avisou, enviado: !!r?.ok, acionarEquipe: !avisou || !r?.ok };
  } catch (e) {
    console.error('[pedidoLink] tratar:', e.message);
    if (coletaId) {
      await gravarTrilha(coletaId, { gancho: 'link', erro: String(e.message || 'erro').slice(0, 200) });
      return { tratado: true, acao: 'erro', acionarEquipe: true };
    }
    return { tratado: false, motivo: 'erro' };
  }
}

module.exports = { tratarPedidoLink, DISPARO_ID, CONTEXTO };
