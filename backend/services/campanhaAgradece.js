// ════════════════════════════════════════════════════════════════════════════
//  Agradecimento ao doador · o remetente
//
//  A régua PURA (quem merece, quando, e o texto) mora em
//  `utils/campanhaAgradecimento.js`. Aqui é só o encanamento: achar as doações
//  novas, consultar a régua, mandar e registrar.
//
//  ⚠️ A mensagem NÃO cita nome nem valor — decisão da reunião, motivo técnico
//  (telefone e e-mail nesta base estão cadastrados em nome de familiares e
//  filhos). Ver o cabeçalho da régua.
//
//  ⚠️ Canal preferencial: E-MAIL. WhatsApp só com opt-in, e apenas se a pessoa
//  não tiver e-mail — não faz sentido gastar mensagem de Marketing na Meta com
//  quem já é alcançável por um canal sem limite nem custo.
// ════════════════════════════════════════════════════════════════════════════

const { supabase } = require('../utils/supabase');
const { deveAgradecer, textoAgradecimento } = require('../utils/campanhaAgradecimento');
const { elegivel } = require('../utils/campanhaPublico');
const { disparoDesligado } = require('./comunicacaoDisparosOff');
const { enviarEmail, isConfigured: emailConfigurado } = require('./email');
const { linkPublico, htmlDoEmail } = require('./campanhaDisparo');

const DISPARO_ID = 'campanha_agradecimento';

/**
 * Roda uma rodada de agradecimentos para todas as campanhas ativas.
 *
 * ⚠️ Só agradece doação que já é TRANSAÇÃO ou COBRANÇA PAGA. Crédito bruto
 * esperando a fila NÃO gera agradecimento: a barrinha pode contar dinheiro que
 * está no banco, mas dizer "obrigado pela sua doação" a partir de um crédito não
 * conferido é agradecer o que pode ser um dízimo que caiu no dígito por
 * coincidência (~5 a 11 por ano, medido). O dinheiro aparece; o obrigado espera
 * gente confirmar.
 */
async function rodar({ limite = 60 } = {}) {
  if (await disparoDesligado(DISPARO_ID)) {
    return { enviados: 0, motivo: 'agradecimento desligado em Comunicação → Automáticas' };
  }
  if (!emailConfigurado()) {
    return { enviados: 0, motivo: 'nenhum canal de e-mail configurado' };
  }

  const { data: campanhas } = await supabase.from('camp_campanhas')
    .select('id, nome, slug, digito, data_inicio, data_fim, descricao_curta')
    .eq('status', 'ativa').is('deleted_at', null);

  const resumo = [];
  for (const camp of campanhas || []) {
    resumo.push(await rodarCampanha(camp, limite));
  }
  return { campanhas: resumo };
}

async function rodarCampanha(camp, limite) {
  const candidatas = [];

  // ── Doações do caixa, já confirmadas pela fila ───────────────────────────
  if (camp.digito) {
    let q = supabase.from('fin_transacoes')
      .select('id, valor, data_competencia, membro_id')
      .eq('tipo', 'receita')
      .eq('identificador_centavo', camp.digito)
      .not('membro_id', 'is', null)
      .order('data_competencia', { ascending: false })
      .limit(limite * 3);
    if (camp.data_inicio) q = q.gte('data_competencia', camp.data_inicio);
    if (camp.data_fim) q = q.lte('data_competencia', camp.data_fim);
    const { data } = await q;
    for (const t of data || []) {
      candidatas.push({
        transacao_id: t.id, cobranca_id: null, membro_id: t.membro_id,
        valor_centavos: Math.round(Math.abs(Number(t.valor)) * 100),
        quando: t.data_competencia,
      });
    }
  }

  // ── Doações online pagas ─────────────────────────────────────────────────
  const { data: cobs } = await supabase.from('pag_cobrancas')
    .select('id, valor_centavos, valor_pago_centavos, pago_em, membro_id, metadata')
    .eq('origem_tipo', 'generosidade').eq('status', 'pago')
    .is('deleted_at', null).not('membro_id', 'is', null)
    .order('pago_em', { ascending: false }).limit(limite * 3);
  for (const c of cobs || []) {
    if (String(c.metadata?.campanha_id || '') !== String(camp.id)) continue;
    candidatas.push({
      transacao_id: null, cobranca_id: c.id, membro_id: c.membro_id,
      valor_centavos: c.valor_pago_centavos || c.valor_centavos,
      quando: c.pago_em,
    });
  }

  if (!candidatas.length) return { campanha: camp.slug, enviados: 0, avaliadas: 0 };

  // ── Quem já foi agradecido (idempotência) ────────────────────────────────
  const jaTransacao = new Set();
  const jaCobranca = new Set();
  const ultimoPorMembro = new Map();
  const { data: feitos } = await supabase.from('camp_agradecimentos')
    .select('transacao_id, cobranca_id, membro_id, enviado_em, status')
    .eq('campanha_id', camp.id).limit(5000);
  for (const a of feitos || []) {
    if (a.transacao_id) jaTransacao.add(a.transacao_id);
    if (a.cobranca_id) jaCobranca.add(a.cobranca_id);
    if (a.membro_id && a.status === 'enviado' && a.enviado_em) {
      const atual = ultimoPorMembro.get(a.membro_id);
      if (!atual || a.enviado_em > atual) ultimoPorMembro.set(a.membro_id, a.enviado_em);
    }
  }

  // ── Contatos das pessoas envolvidas ──────────────────────────────────────
  const membroIds = [...new Set(candidatas.map((c) => c.membro_id))];
  const pessoas = new Map();
  for (let i = 0; i < membroIds.length; i += 500) {
    const { data } = await supabase.from('mem_membros')
      .select('id, nome, email, telefone, whatsapp_optin, email_optout, status, active, deleted_at')
      .in('id', membroIds.slice(i, i + 500));
    for (const p of data || []) pessoas.set(p.id, p);
  }

  const agora = new Date().toISOString();
  const texto = textoAgradecimento({
    nome: camp.nome,
    descricao_curta: camp.descricao_curta,
    link: linkPublico(camp.slug),
  });

  let enviados = 0;
  let pulados = 0;

  for (const d of candidatas) {
    if (enviados >= limite) break;

    const pessoa = pessoas.get(d.membro_id);
    const porEmail = pessoa ? elegivel(pessoa, 'email') : { elegivel: false, motivo: 'sem cadastro' };
    // WhatsApp é o plano B: só quem NÃO tem e-mail utilizável e TEM opt-in.
    const porWa = (!porEmail.elegivel && pessoa)
      ? elegivel(pessoa, 'whatsapp')
      : { elegivel: false, motivo: porEmail.motivo };
    const canal = porEmail.elegivel ? 'email' : (porWa.elegivel ? 'whatsapp' : null);

    const decisao = deveAgradecer(d, {
      ja_agradecida: d.transacao_id ? jaTransacao.has(d.transacao_id) : jaCobranca.has(d.cobranca_id),
      ultimo_agradecimento_em: ultimoPorMembro.get(d.membro_id) || null,
      canal_disponivel: !!canal,
      agora,
    });

    if (!decisao.agradecer) {
      // ⚠️ Registra o PULO também, e só quando ele é definitivo (não vai mudar
      // com o tempo). "Já agradecida" e "janela de silêncio" NÃO são gravados:
      // o primeiro já tem linha, e o segundo tem que ser reavaliado depois das
      // 72h — gravar aqui condenaria a doação a nunca ser agradecida.
      const definitivo = /anônima|sem e-mail|opt-in|entrada de dinheiro/.test(decisao.motivo || '');
      if (definitivo) {
        await supabase.from('camp_agradecimentos').upsert({
          campanha_id: camp.id,
          transacao_id: d.transacao_id, cobranca_id: d.cobranca_id,
          membro_id: d.membro_id,
          canal: 'email', status: 'pulado', motivo: decisao.motivo,
        }, { onConflict: d.transacao_id ? 'transacao_id' : 'cobranca_id', ignoreDuplicates: true });
      }
      pulados += 1;
      continue;
    }

    const destino = canal === 'email' ? porEmail.destino : porWa.destino;

    // ⚠️ GRAVA A INTENÇÃO ANTES DE ENVIAR. Se a function morrer entre o envio e
    // o registro, a pessoa recebe DUAS vezes na próxima rodada — e o índice
    // único só protege se a linha existir. É a LEI "gravar o efeito DURANTE".
    const { data: linha, error: eIns } = await supabase.from('camp_agradecimentos').insert({
      campanha_id: camp.id,
      transacao_id: d.transacao_id, cobranca_id: d.cobranca_id,
      membro_id: d.membro_id, canal, destino, status: 'pendente',
    }).select('id').single();
    // 23505 = outra rodada pegou esta doação primeiro. Caminho normal.
    if (eIns) { if (eIns.code !== '23505') console.error('[campanhaAgradece]', eIns.message); continue; }

    let ok = false;
    let erro = null;
    if (canal === 'email') {
      const r = await enviarEmail({
        to: destino,
        subject: texto.assunto,
        text: texto.corpo_texto,
        html: htmlDoEmail(texto.corpo_texto, { campanha: camp, membroId: d.membro_id }),
      }).catch((e) => ({ ok: false, erro: e.message }));
      ok = r?.ok !== false;
      erro = ok ? null : String(r?.erro || 'falha no envio').slice(0, 500);
    } else {
      // ⚠️ WhatsApp de agradecimento exige template aprovado (é Marketing). Sem
      // template configurado o agradecimento NÃO vai por aqui — e isso fica
      // DECLARADO na linha, não silencioso.
      const tpl = String(process.env.WHATSAPP_TEMPLATE_CAMPANHA_OBRIGADO || '').trim();
      if (!tpl) {
        ok = false;
        erro = 'sem template de WhatsApp aprovado (env WHATSAPP_TEMPLATE_CAMPANHA_OBRIGADO)';
      } else {
        const { enfileirarLote } = require('./whatsappFila');
        const r = await enfileirarLote([{
          telefone: destino, template: tpl, params: [camp.nome],
          contexto: 'campanha.agradecimento', refId: camp.id,
        }]);
        ok = (r.queued || 0) > 0;
        erro = ok ? null : (r.motivo || 'fila do WhatsApp não aceitou');
      }
    }

    await supabase.from('camp_agradecimentos').update({
      status: ok ? 'enviado' : 'falhou',
      motivo: erro,
      enviado_em: new Date().toISOString(),
    }).eq('id', linha.id);

    if (ok) {
      enviados += 1;
      ultimoPorMembro.set(d.membro_id, new Date().toISOString());
      if (d.transacao_id) jaTransacao.add(d.transacao_id); else jaCobranca.add(d.cobranca_id);
    }
  }

  return { campanha: camp.slug, avaliadas: candidatas.length, enviados, pulados };
}

module.exports = { DISPARO_ID, rodar, rodarCampanha };
