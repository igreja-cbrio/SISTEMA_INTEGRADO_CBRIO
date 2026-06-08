// Orquestracao da COLETA POR FORMULARIO (WhatsApp Flows) do bot.
// Fluxo desenhado com o Marcos (2026-06-08):
//   1. Lider pede pra lancar -> bot manda o Flow "Culto" (freq + decisoes).
//   2. Ao enviar, se houver decisoes (>0), o bot pede os dados de CADA
//      pessoa que decidiu (Flow "Pessoa", em loop) pra ela entrar na jornada.
//   3. Quando completa, vira coleta 'parseado' (fila do coordenador aplicar).
// Tudo passa pela revisao-antes-de-aplicar · nada entra direto no banco.
//
// Estado fica no proprio whatsapp_coletas.parsed (sem migration):
//   { fonte:'flow', culto_id, freq:{presencial,kids,online},
//     dec:{presencial,online,kids}, pessoas:[...], pendentes:N, resumo }
// flow_token correlaciona a resposta: 'culto' | 'pessoa:<coletaId>'.
const { supabase } = require('../utils/supabase');
const { enviarTexto } = require('./whatsappSend');
const { flowsConfigurados, enviarFlow } = require('./whatsappFlows');

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}
function tel11(raw) {
  let d = (raw || '').toString().replace(/\D+/g, '');
  if (d.length === 13 && d.startsWith('55')) d = d.slice(2); // tira DDI
  return d.length === 11 ? d : null;
}
function cpf11(raw) {
  const d = (raw || '').toString().replace(/\D+/g, '');
  return d.length === 11 ? d : null;
}

// Decide se o bot deve OFERECER o formulário (Flow) pra esse texto do líder.
// Regra simples e robusta (instantânea · sem LLM): se o líder NÃO mandou
// números soltos, ele está pedindo pra reportar ou só cumprimentando — nos
// dois casos o caminho rápido é o formulário. Se mandou número, deixa a
// coleta conversacional (Haiku) extrair os dados do texto.
//
// O gatilho antigo exigia verbo (lançar/preencher) E substantivo (culto/
// decisão/...) na mesma frase · "quero o formulário" não casava e caía na
// conversa lenta que perguntava "grupos ou integração?". Corrigido 2026-06-08.
function pedeFormulario(texto) {
  const t = (texto || '').trim();
  if (!t) return false;
  return !/\d/.test(t);
}

// Parse seguro do response_json do nfm_reply (vem string).
function parseReply(m) {
  try {
    const raw = m?.interactive?.nfm_reply?.response_json;
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// Envia o Flow do culto · pre-carrega a lista de cultos recentes (rapido).
// Retorna { ok, error? }. Se o formulário não puder abrir (estado draft/publish
// na Meta, permissão, etc) NÃO deixa o líder no silêncio: cai pro texto, pra ele
// reportar por número (a coleta conversacional assume).
async function enviarFormularioCulto(telefone) {
  const hoje = new Date().toISOString().slice(0, 10);
  const limite = new Date(); limite.setDate(limite.getDate() - 14);
  const { data: cultos } = await supabase
    .from('cultos')
    .select('id, data, service_type:vol_service_types(name)')
    .gte('data', limite.toISOString().slice(0, 10)).lte('data', hoje)
    .order('data', { ascending: false })
    .limit(20);
  const opcoes = (cultos || []).map(c => ({
    id: c.id,
    title: `${c.service_type?.name || 'Culto'} · ${c.data.split('-').reverse().slice(0, 2).join('/')}`,
  }));
  if (!opcoes.length) {
    await enviarTexto(telefone, 'Não achei cultos recentes pra lançar. Avisa a equipe, por favor. 🙏');
    return { ok: false, error: 'sem_cultos' };
  }
  const res = await enviarFlow(telefone, {
    flowId: process.env.WHATSAPP_FLOW_CULTO_ID,
    flowToken: 'culto',
    cta: 'Preencher culto',
    screen: 'SELECIONAR_CULTO',
    data: { cultos: opcoes },
    body: 'Vamos lançar os dados do culto. Toque pra preencher frequência e decisões 👇',
  });
  if (!res.ok) {
    console.error('[flowColeta] enviarFlow(culto) falhou:', res.error);
    await enviarTexto(telefone,
      'Não consegui abrir o formulário agora 😕. Sem problema: me manda os números por texto, '
      + 'ex: "1100 presencial, 12 decisões, 30 kids". Eu registro. 🙏');
  }
  return res;
}

async function enviarFormularioPessoa(telefone, coletaId, indice, total) {
  await enviarFlow(telefone, {
    flowId: process.env.WHATSAPP_FLOW_PESSOA_ID,
    flowToken: `pessoa:${coletaId}`,
    cta: 'Dados da pessoa',
    screen: 'PESSOA',
    data: { indice: `${indice} de ${total}` },
    body: `Pra essa pessoa entrar na jornada, precisamos dos dados dela (pessoa ${indice} de ${total}).`,
  });
}

// Trata uma resposta de Flow (nfm_reply). Retorna true se consumiu o evento.
async function tratarFlowReply(m, telefone, lider) {
  const token = m?.interactive?.nfm_reply?.flow_token || '';
  const resp = parseReply(m);
  if (!resp) return false;

  // ── Resposta do Flow do CULTO ──────────────────────────────────────
  if (token === 'culto') {
    const dec = {
      presencial: numOrNull(resp.dec_presencial) || 0,
      online: numOrNull(resp.dec_online) || 0,
      kids: numOrNull(resp.dec_kids) || 0,
    };
    const totalDec = dec.presencial + dec.online + dec.kids;
    const parsed = {
      fonte: 'flow',
      culto_id: resp.culto_id || null,
      freq: { presencial: numOrNull(resp.presencial), kids: numOrNull(resp.kids), online: numOrNull(resp.online) },
      dec,
      pessoas: [],
      pendentes: totalDec,
      resumo: `Formulário do culto · ${dec.presencial + dec.kids} decisões presenciais/kids, ${dec.online} online`,
    };
    const { data: coleta, error } = await supabase
      .from('whatsapp_coletas')
      .insert({
        whatsapp_message_id: m.id,
        telefone,
        lider_id: lider?.id || null,
        raw_text: 'Formulário do culto (Flow)',
        parsed,
        modulo_destino: 'integracao',
        status: totalDec > 0 ? 'aguardando_info' : 'parseado',
      })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505') return true; // reentrega
      console.error('[flowColeta] insert culto', error.message);
      await enviarTexto(telefone, 'Recebi os dados, mas tive um problema ao salvar. Pode tentar de novo? 🙏');
      return true;
    }
    if (totalDec > 0) {
      await enviarTexto(telefone, `Recebi a frequência! ✅ Agora vou pedir os dados das ${totalDec} pessoa(s) que decidiram, uma por vez.`);
      await enviarFormularioPessoa(telefone, coleta.id, 1, totalDec);
    } else {
      await enviarTexto(telefone, 'Recebi! ✅ Um líder vai conferir e lançar no sistema. Obrigado! 🙌');
    }
    return true;
  }

  // ── Resposta do Flow de PESSOA ─────────────────────────────────────
  if (token.startsWith('pessoa:')) {
    const coletaId = token.slice('pessoa:'.length);
    const { data: coleta } = await supabase
      .from('whatsapp_coletas')
      .select('id, parsed, status')
      .eq('id', coletaId)
      .maybeSingle();
    if (!coleta || coleta.status === 'aplicado' || coleta.status === 'rejeitado') return true;

    const p = coleta.parsed || {};
    const pessoas = Array.isArray(p.pessoas) ? p.pessoas : [];
    const ehKids = resp.tipo === 'kids';
    pessoas.push({
      tipo: ['presencial', 'online', 'kids'].includes(resp.tipo) ? resp.tipo : 'presencial',
      nome: (resp.nome || '').trim() || null,
      telefone: ehKids ? null : tel11(resp.celular),
      cpf: ehKids ? null : cpf11(resp.cpf),
      responsavel_nome: ehKids ? ((resp.resp_nome || '').trim() || null) : null,
      responsavel_telefone: ehKids ? tel11(resp.resp_celular) : null,
      responsavel_cpf: ehKids ? cpf11(resp.resp_cpf) : null,
    });
    const pendentes = Math.max(0, (p.pendentes || pessoas.length) - 1);
    const novoParsed = { ...p, pessoas, pendentes };
    const completou = pendentes <= 0;
    await supabase.from('whatsapp_coletas')
      .update({ parsed: novoParsed, status: completou ? 'parseado' : 'aguardando_info' })
      .eq('id', coleta.id);

    if (completou) {
      await enviarTexto(telefone, `Prontinho! ✅ Recebi os dados de ${pessoas.length} pessoa(s). Um líder vai conferir e lançar no sistema. Obrigado! 🙌`);
    } else {
      const total = pessoas.length + pendentes;
      await enviarFormularioPessoa(telefone, coleta.id, pessoas.length + 1, total);
    }
    return true;
  }

  return false;
}

module.exports = { flowsConfigurados, pedeFormulario, enviarFormularioCulto, tratarFlowReply };
