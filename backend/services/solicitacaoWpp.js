// Aprovação de solicitação pelo WhatsApp.
// - enviarAprovacaoWpp(sol): enfileira e despacha o convite pro diretor de origem.
// - tratarRespostaAprovacao({telefone, texto}): interpreta 1/2 e aplica a decisão
//   reusando a MESMA lógica dos handlers (aprovarOrigemInterno/rejeitarOrigemInterno).
//
// Duas melhorias (2026-07-13, pedido do Matheus):
//  1) DETALHES na mensagem: título, solicitante, categoria, valor e descrição.
//     Fora da janela de 24h a Meta só deixa TEMPLATE (4 variáveis) — então a 1ª
//     leva os detalhes possíveis nos parâmetros; as seguintes (já dentro da
//     janela, após ele responder) vão em texto livre COMPLETO.
//  2) VÁRIAS de uma vez: as solicitações são despachadas UMA POR VEZ. O aprovador
//     sempre tem no máx. 1 aguardando resposta; ao responder, a próxima é enviada.
//     Assim ele nunca fica confuso sobre "qual estou respondendo".
const { supabase } = require('../utils/supabase');
const wpp = require('./whatsappService');

const TEMPLATE_APROVACAO = process.env.WHATSAPP_TEMPLATE_APROVACAO_SOLIC;
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

// Resolve o telefone do aprovador: RH (cadastro do colaborador) → membro.
async function telefoneDoAprovador(profileId) {
  if (!profileId) return { telefone: null, nome: null, email: null };
  const { data: prof } = await supabase.from('profiles')
    .select('name, email, membro_id').eq('id', profileId).maybeSingle();
  if (!prof) return { telefone: null, nome: null, email: null };
  let telefone = null;
  if (prof.email) {
    // rh_funcionarios só tem `telefone` (não `celular`).
    const { data: rh } = await supabase.from('rh_funcionarios')
      .select('telefone').ilike('email', prof.email).maybeSingle();
    telefone = rh?.telefone || null;
  }
  if (!telefone && prof.membro_id) {
    const { data: m } = await supabase.from('mem_membros')
      .select('telefone').eq('id', prof.membro_id).maybeSingle();
    telefone = m?.telefone || null;
  }
  return { telefone, nome: prof.name, email: prof.email };
}

async function nomeSolicitante(solicitanteId) {
  if (!solicitanteId) return 'Colaborador';
  const { data } = await supabase.from('profiles').select('name').eq('id', solicitanteId).maybeSingle();
  return data?.name || 'Colaborador';
}

// Carrega os detalhes da solicitação (pro texto rico e pra revalidar se segue pendente).
async function carregarSol(solicitacaoId) {
  const { data } = await supabase.from('solicitacoes')
    .select('id, titulo, categoria, valor_estimado, descricao, justificativa, data_necessaria, solicitante_id, aprovacao_origem_status')
    .eq('id', solicitacaoId).maybeSingle();
  return data || null;
}

// Texto RICO (livre · só dentro da janela de 24h) — com todos os detalhes.
async function montarTextoRico(sol) {
  const solicitante = await nomeSolicitante(sol.solicitante_id);
  const catLabel = CATEGORIA_LABEL[sol.categoria] || sol.categoria || '—';
  const valor = fmtBRL(sol.valor_estimado);
  const linhas = [
    '🟡 *Solicitação para aprovar*',
    `*${sol.titulo || 'Solicitação'}*`,
    `👤 Solicitante: ${solicitante}`,
    `🏷️ Categoria: ${catLabel}`,
  ];
  if (valor) linhas.push(`💰 Valor estimado: ${valor}`);
  if (sol.descricao) linhas.push(`📝 ${String(sol.descricao).slice(0, 600)}`);
  if (sol.justificativa) linhas.push(`ℹ️ Justificativa: ${String(sol.justificativa).slice(0, 300)}`);
  linhas.push('');
  linhas.push('Responda *1* para APROVAR ou *2* para RECUSAR.');
  return linhas.join('\n');
}

// Despacha a PRÓXIMA da fila pra esse telefone, se ninguém está aguardando resposta
// (serializa · uma de cada vez). janelaAberta=true → texto rico (ex.: logo após ele
// responder); senão → template (fora da janela de 24h a Meta exige template).
async function despacharProximo(tel, janelaAberta = false) {
  // Já tem uma aguardando resposta? Não manda outra (evita "várias de uma vez").
  const { data: emAndamento } = await supabase.from('solicitacao_wpp_fila')
    .select('id').eq('telefone', tel).eq('status', 'aguardando').limit(1);
  if (emAndamento && emAndamento.length) return;

  const { data: fila } = await supabase.from('solicitacao_wpp_fila')
    .select('*').eq('telefone', tel).eq('status', 'na_fila')
    .order('created_at', { ascending: true }).limit(1);
  const item = fila && fila[0];
  if (!item) return;

  const sol = await carregarSol(item.solicitacao_id);
  // Já não está mais pendente (resolvida no sistema)? descarta e tenta a próxima.
  if (!sol || sol.aprovacao_origem_status !== 'pendente') {
    await supabase.from('solicitacao_wpp_fila')
      .update({ status: 'cancelada', respondido_em: new Date().toISOString() }).eq('id', item.id);
    return despacharProximo(tel, janelaAberta);
  }

  const { nome } = await telefoneDoAprovador(item.aprovador_id);
  const primeiroNome = (nome || 'Diretor').split(' ')[0];

  let enviouOk = false;
  try {
    if (janelaAberta) {
      await wpp.sendText(tel, await montarTextoRico(sol));
      enviouOk = true;
    } else if (TEMPLATE_APROVACAO) {
      const solicitante = await nomeSolicitante(sol.solicitante_id);
      const catLabel = CATEGORIA_LABEL[sol.categoria] || sol.categoria || '—';
      const valor = fmtBRL(sol.valor_estimado);
      const param4 = valor ? `${catLabel} · ${valor}` : catLabel; // + valor no template
      await wpp.sendTemplate(tel, TEMPLATE_APROVACAO, TEMPLATE_LANG,
        [primeiroNome, sol.titulo || 'Solicitação', solicitante, param4]);
      enviouOk = true;
    }
  } catch (e) {
    console.error('[solicitacaoWpp] despachar:', e.message);
  }
  if (enviouOk) {
    await supabase.from('solicitacao_wpp_fila').update({ status: 'aguardando' }).eq('id', item.id);
  }
}

// Enfileira o convite de aprovação e tenta despachar (respeita a serialização).
// No-op gracioso se não houver template/telefone (não quebra a criação da solic).
async function enviarAprovacaoWpp(sol) {
  try {
    if (!TEMPLATE_APROVACAO) return;                       // template não configurado
    if (sol?.aprovacao_origem_status !== 'pendente') return;
    if (!sol?.aprovacao_origem_diretor_id) return;
    const { telefone } = await telefoneDoAprovador(sol.aprovacao_origem_diretor_id);
    const tel = wpp.normalizarTelefone(telefone);
    if (!tel) return;

    // Enfileira como 'na_fila' (idempotente por unique) — despacharProximo decide
    // se envia agora (ninguém aguardando) ou deixa na fila.
    const { error: insErr } = await supabase.from('solicitacao_wpp_fila').insert({
      solicitacao_id: sol.id,
      aprovador_id: sol.aprovacao_origem_diretor_id,
      telefone: tel,
      tipo: 'origem',
      status: 'na_fila',
    });
    if (insErr) { if (insErr.code === '23505') return; throw insErr; }

    await despacharProximo(tel, false);
  } catch (e) {
    console.error('[solicitacaoWpp] enviar:', e.message);
  }
}

function interpretar(texto) {
  const t = String(texto || '').trim().toLowerCase();
  if (['1', 'aprovar', 'aprovado', 'aprova', 'sim', 'ok'].includes(t)) return 'aprovar';
  if (['2', 'rejeitar', 'rejeitado', 'reprovar', 'nao', 'não', 'recusar'].includes(t)) return 'rejeitar';
  return null;
}

// Trata a resposta do aprovador. Retorna true se assumiu a mensagem.
async function tratarRespostaAprovacao({ telefone, texto }) {
  try {
    const tel = wpp.normalizarTelefone(telefone);
    if (!tel) return false;
    // Serializado: no máximo 1 'aguardando' por telefone.
    const { data: pend } = await supabase.from('solicitacao_wpp_fila')
      .select('*').eq('telefone', tel).eq('status', 'aguardando')
      .order('created_at', { ascending: true }).limit(1);
    if (!pend || !pend.length) return false;      // nada aguardando deste número

    const fila = pend[0];
    const acao = interpretar(texto);
    if (!acao) {
      await wpp.sendText(tel, 'Não entendi 🙂 Responda *1* para APROVAR ou *2* para RECUSAR esta solicitação.');
      return true;
    }

    const solic = require('../routes/solicitacoes');
    const res = acao === 'aprovar'
      ? await solic.aprovarOrigemInterno({ solicitacaoId: fila.solicitacao_id, aprovadorId: fila.aprovador_id })
      : await solic.rejeitarOrigemInterno({ solicitacaoId: fila.solicitacao_id, aprovadorId: fila.aprovador_id, motivo: 'Rejeitada pelo WhatsApp' });

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

    // Quantas ainda faltam na fila + manda a próxima (janela aberta agora).
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

module.exports = { enviarAprovacaoWpp, tratarRespostaAprovacao };
