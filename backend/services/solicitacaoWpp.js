// Aprovação de solicitação pelo WhatsApp.
// - enviarAprovacaoWpp(sol): enfileira+despacha o convite pro diretor de ORIGEM.
// - enviarMeritoWpp(sol): idem pro(s) aprovador(es) de MÉRITO (Pastor Presidente).
// - tratarRespostaAprovacao({telefone, texto}): interpreta a resposta (botão ou
//   número) e aplica reusando os handlers internos (origem/mérito).
//
// Melhorias:
//  1) BOTÕES interativos Aprovar/Recusar (dentro da janela de 24h). Fora da janela
//     a Meta só deixa TEMPLATE (com "responda 1/2") — a 1ª leva os detalhes nos
//     parâmetros; ao responder abre a janela e as próximas vão com botões.
//  2) VÁRIAS de uma vez: despacho UMA POR VEZ por telefone (serial) · o aprovador
//     nunca tem >1 aguardando resposta, então botão/número nunca ficam ambíguos.
//  3) MÉRITO: o Pastor Presidente recebe o julgamento pelo WhatsApp igual ao diretor.
const { supabase } = require('../utils/supabase');
const wpp = require('./whatsappService');

const TEMPLATE_APROVACAO = process.env.WHATSAPP_TEMPLATE_APROVACAO_SOLIC;
// Template COM botões (quick-reply Aprovar/Recusar) · usado na 1ª mensagem fria,
// pra ter botões já de cara (a resposta volta como m.type='button' no webhook).
// Mesmas 4 variáveis do template de texto. Fallback pro texto se não configurado.
const TEMPLATE_BOTOES = process.env.WHATSAPP_TEMPLATE_APROVACAO_BOTOES;
const TEMPLATE_COLD = TEMPLATE_BOTOES || TEMPLATE_APROVACAO;
const TEMPLATE_LANG = process.env.WHATSAPP_TEMPLATE_LANG || 'pt_BR';
const CATEGORIA_LABEL = {
  ti: 'TI', compras: 'Compras', reembolso: 'Reembolso', pagamento: 'Pagamento',
  reserva_espaco: 'Reserva de espaço', infraestrutura: 'Serviços/Infra',
  hospitalidade: 'Hospitalidade', ferias: 'Férias', licenca: 'Licença',
  marketing: 'Marketing', producao: 'Produção', servico: 'Serviço', outro: 'Outro',
};

function fmtBRL(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || !n) return null;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Resolve o telefone do aprovador: RH (colaborador) → membro → perfil.
async function telefoneDoAprovador(profileId) {
  if (!profileId) return { telefone: null, nome: null, email: null };
  const { data: prof } = await supabase.from('profiles')
    .select('name, email, membro_id, telefone').eq('id', profileId).maybeSingle();
  if (!prof) return { telefone: null, nome: null, email: null };
  let telefone = null;
  if (prof.email) {
    const { data: rh } = await supabase.from('rh_funcionarios')
      .select('telefone').ilike('email', prof.email).maybeSingle();
    telefone = rh?.telefone || null;
  }
  if (!telefone && prof.membro_id) {
    const { data: m } = await supabase.from('mem_membros')
      .select('telefone').eq('id', prof.membro_id).maybeSingle();
    telefone = m?.telefone || null;
  }
  if (!telefone) telefone = prof.telefone || null; // fallback: telefone do próprio perfil
  return { telefone, nome: prof.name, email: prof.email };
}

async function nomeSolicitante(solicitanteId) {
  if (!solicitanteId) return 'Colaborador';
  const { data } = await supabase.from('profiles').select('name').eq('id', solicitanteId).maybeSingle();
  return data?.name || 'Colaborador';
}

async function carregarSol(solicitacaoId) {
  const { data } = await supabase.from('solicitacoes')
    .select('id, titulo, categoria, valor_estimado, descricao, justificativa, data_necessaria, solicitante_id, status, aprovacao_origem_status, merito_status')
    .eq('id', solicitacaoId).maybeSingle();
  return data || null;
}

// A solicitação ainda precisa da decisão deste tipo?
function aindaPendente(sol, tipo) {
  if (!sol) return false;
  if (tipo === 'merito') return sol.merito_status === 'pendente' && sol.status === 'aguardando_merito';
  return sol.aprovacao_origem_status === 'pendente';
}

// Corpo da mensagem (detalhes). comNumero=true acrescenta a instrução "responda 1/2"
// (texto puro · fallback quando não dá pra usar botões).
async function montarCorpo(sol, tipo, comNumero) {
  const solicitante = await nomeSolicitante(sol.solicitante_id);
  const catLabel = CATEGORIA_LABEL[sol.categoria] || sol.categoria || '—';
  const valor = fmtBRL(sol.valor_estimado);
  const linhas = [
    tipo === 'merito' ? '🟠 *Julgamento de mérito (Pastor Presidente)*' : '🟡 *Solicitação para aprovar*',
    `*${sol.titulo || 'Solicitação'}*`,
    `👤 Solicitante: ${solicitante}`,
    `🏷️ Categoria: ${catLabel}`,
  ];
  if (valor) linhas.push(`💰 Valor estimado: ${valor}`);
  if (sol.descricao) linhas.push(`📝 ${String(sol.descricao).slice(0, 600)}`);
  if (sol.justificativa) linhas.push(`ℹ️ Justificativa: ${String(sol.justificativa).slice(0, 300)}`);
  if (comNumero) {
    linhas.push('');
    linhas.push('Responda *1* para APROVAR ou *2* para RECUSAR.');
  }
  return linhas.join('\n');
}

// Despacha a PRÓXIMA da fila pra esse telefone, se ninguém está aguardando resposta
// (serializa · uma de cada vez). janelaAberta=true → botões (após o aprovador
// responder); senão → template (fora da janela de 24h a Meta exige template).
async function despacharProximo(tel, janelaAberta = false) {
  const { data: emAndamento } = await supabase.from('solicitacao_wpp_fila')
    .select('id').eq('telefone', tel).eq('status', 'aguardando').limit(1);
  if (emAndamento && emAndamento.length) return;

  const { data: fila } = await supabase.from('solicitacao_wpp_fila')
    .select('*').eq('telefone', tel).eq('status', 'na_fila')
    .order('created_at', { ascending: true }).limit(1);
  const item = fila && fila[0];
  if (!item) return;

  const sol = await carregarSol(item.solicitacao_id);
  if (!aindaPendente(sol, item.tipo)) {
    await supabase.from('solicitacao_wpp_fila')
      .update({ status: 'cancelada', respondido_em: new Date().toISOString() }).eq('id', item.id);
    return despacharProximo(tel, janelaAberta);
  }

  const { nome } = await telefoneDoAprovador(item.aprovador_id);
  const primeiroNome = (nome || (item.tipo === 'merito' ? 'Pastor' : 'Diretor')).split(' ')[0];

  let enviouOk = false;
  try {
    if (janelaAberta) {
      const r = await wpp.sendButtons(tel, await montarCorpo(sol, item.tipo, false), [
        { id: 'aprovar', title: '✅ Aprovar' },
        { id: 'rejeitar', title: '❌ Recusar' },
      ]);
      enviouOk = !!r?.sent;
      if (!enviouOk) { // fallback texto+número se os botões falharem
        const r2 = await wpp.sendText(tel, await montarCorpo(sol, item.tipo, true));
        enviouOk = !!r2?.sent;
      }
    } else if (TEMPLATE_COLD) {
      const solicitante = await nomeSolicitante(sol.solicitante_id);
      const catLabel = CATEGORIA_LABEL[sol.categoria] || sol.categoria || '—';
      const valor = fmtBRL(sol.valor_estimado);
      const param4 = valor ? `${catLabel} · ${valor}` : catLabel;
      const r = await wpp.sendTemplate(tel, TEMPLATE_COLD, TEMPLATE_LANG,
        [primeiroNome, sol.titulo || 'Solicitação', solicitante, param4]);
      enviouOk = !!r?.sent; // só marca aguardando se a Meta aceitou o envio
    }
  } catch (e) {
    console.error('[solicitacaoWpp] despachar:', e.message);
  }
  if (enviouOk) {
    await supabase.from('solicitacao_wpp_fila').update({ status: 'aguardando' }).eq('id', item.id);
  }
}

// Enfileira 1 aprovador (idempotente por unique) e tenta despachar.
async function enfileirar(sol, aprovadorId, tipo) {
  const { telefone } = await telefoneDoAprovador(aprovadorId);
  const tel = wpp.normalizarTelefone(telefone);
  if (!tel) return;
  const { error } = await supabase.from('solicitacao_wpp_fila').insert({
    solicitacao_id: sol.id, aprovador_id: aprovadorId, telefone: tel, tipo, status: 'na_fila',
  });
  if (error) { if (error.code === '23505') return; throw error; }
  await despacharProximo(tel, false);
}

// ORIGEM · convite pro diretor da área. No-op gracioso sem template/telefone.
async function enviarAprovacaoWpp(sol) {
  try {
    if (!TEMPLATE_COLD) return;
    if (sol?.aprovacao_origem_status !== 'pendente') return;
    if (!sol?.aprovacao_origem_diretor_id) return;
    await enfileirar(sol, sol.aprovacao_origem_diretor_id, 'origem');
  } catch (e) {
    console.error('[solicitacaoWpp] enviar origem:', e.message);
  }
}

// MÉRITO · julgamento do(s) aprovador(es) de mérito (Pr. Juninho).
async function enviarMeritoWpp(sol) {
  try {
    if (!TEMPLATE_COLD) return;
    if (sol?.status !== 'aguardando_merito' || sol?.merito_status !== 'pendente') return;
    const solic = require('../routes/solicitacoes');
    const ids = (await solic.aprovadoresMeritoIds()) || [];
    for (const aprovadorId of ids) {
      await enfileirar(sol, aprovadorId, 'merito').catch(e =>
        console.error('[solicitacaoWpp] enfileirar merito:', e.message));
    }
  } catch (e) {
    console.error('[solicitacaoWpp] enviar merito:', e.message);
  }
}

function interpretar(texto) {
  const t = String(texto || '').trim().toLowerCase();
  if (['1', 'aprovar', 'aprovado', 'aprova', 'sim', 'ok'].includes(t)) return 'aprovar';
  if (['2', 'rejeitar', 'rejeitado', 'reprovar', 'nao', 'não', 'recusar'].includes(t)) return 'rejeitar';
  return null;
}

// Trata a resposta do aprovador (botão ou número). Retorna true se assumiu a mensagem.
async function tratarRespostaAprovacao({ telefone, texto }) {
  try {
    const tel = wpp.normalizarTelefone(telefone);
    if (!tel) return false;
    // Serializado: no máximo 1 'aguardando' por telefone.
    const { data: pend } = await supabase.from('solicitacao_wpp_fila')
      .select('*').eq('telefone', tel).eq('status', 'aguardando')
      .order('created_at', { ascending: true }).limit(1);
    if (!pend || !pend.length) return false;

    const fila = pend[0];
    const acao = interpretar(texto);
    if (!acao) {
      await wpp.sendText(tel, 'Não entendi 🙂 Toque em *Aprovar* ou *Recusar* (ou responda *1* / *2*).');
      return true;
    }

    const solic = require('../routes/solicitacoes');
    const ehMerito = fila.tipo === 'merito';
    let res;
    if (ehMerito) {
      res = acao === 'aprovar'
        ? await solic.aprovarMeritoInterno({ solicitacaoId: fila.solicitacao_id, aprovadorId: fila.aprovador_id })
        : await solic.rejeitarMeritoInterno({ solicitacaoId: fila.solicitacao_id, aprovadorId: fila.aprovador_id, motivo: 'Reprovada pelo WhatsApp' });
    } else {
      res = acao === 'aprovar'
        ? await solic.aprovarOrigemInterno({ solicitacaoId: fila.solicitacao_id, aprovadorId: fila.aprovador_id })
        : await solic.rejeitarOrigemInterno({ solicitacaoId: fila.solicitacao_id, aprovadorId: fila.aprovador_id, motivo: 'Rejeitada pelo WhatsApp' });
    }

    const titulo = res?.data?.titulo || 'a solicitação';
    if (!res.ok) {
      await supabase.from('solicitacao_wpp_fila')
        .update({ status: 'cancelada', respondido_em: new Date().toISOString() }).eq('id', fila.id);
      await wpp.sendText(tel, `Não consegui aplicar (${res?.data?.error || 'já foi resolvida'}). "${titulo}" pode já ter sido tratada no sistema.`);
    } else {
      await supabase.from('solicitacao_wpp_fila')
        .update({ status: acao === 'aprovar' ? 'aprovada' : 'rejeitada', respondido_em: new Date().toISOString() }).eq('id', fila.id);
      await wpp.sendText(tel, acao === 'aprovar' ? `✅ Aprovada: ${titulo}` : `❌ Recusada: ${titulo}`);
    }

    const { count } = await supabase.from('solicitacao_wpp_fila')
      .select('id', { count: 'exact', head: true }).eq('telefone', tel).eq('status', 'na_fila');
    if (count && count > 0) {
      await wpp.sendText(tel, `Você ainda tem ${count} solicitação(ões) na fila — segue a próxima 👇`);
    }
    await despacharProximo(tel, true);
    return true;
  } catch (e) {
    console.error('[solicitacaoWpp] resposta:', e.message);
    return false;
  }
}

module.exports = { enviarAprovacaoWpp, enviarMeritoWpp, tratarRespostaAprovacao };
