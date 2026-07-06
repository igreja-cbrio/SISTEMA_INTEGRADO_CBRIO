// Aprovação de solicitação pelo WhatsApp.
// - enviarAprovacaoWpp(sol): manda o template pro diretor de origem e enfileira.
// - tratarRespostaAprovacao({telefone, texto}): interpreta 1/2 e aplica a decisão
//   reusando a MESMA lógica dos handlers (aprovarOrigemInterno/rejeitarOrigemInterno).
// Fora da janela de 24h a Meta exige template — por isso o convite é template e a
// confirmação é texto (dentro da janela, já que ele acabou de responder).
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

// Resolve o telefone do aprovador: RH (cadastro do colaborador) → membro.
async function telefoneDoAprovador(profileId) {
  if (!profileId) return { telefone: null, nome: null, email: null };
  const { data: prof } = await supabase.from('profiles')
    .select('name, email, membro_id').eq('id', profileId).maybeSingle();
  if (!prof) return { telefone: null, nome: null, email: null };
  let telefone = null;
  if (prof.email) {
    const { data: rh } = await supabase.from('rh_funcionarios')
      .select('telefone, celular').ilike('email', prof.email).maybeSingle();
    telefone = rh?.celular || rh?.telefone || null;
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

// Envia o convite de aprovação pro diretor de origem e enfileira a correlação.
// No-op gracioso se não houver template/telefone (não quebra a criação da solic).
async function enviarAprovacaoWpp(sol) {
  try {
    if (!TEMPLATE_APROVACAO) return;                       // template não configurado
    if (sol?.aprovacao_origem_status !== 'pendente') return;
    if (!sol?.aprovacao_origem_diretor_id) return;
    const { telefone, nome } = await telefoneDoAprovador(sol.aprovacao_origem_diretor_id);
    const tel = wpp.normalizarTelefone(telefone);
    if (!tel) return;
    const solicitante = await nomeSolicitante(sol.solicitante_id);
    const catLabel = CATEGORIA_LABEL[sol.categoria] || sol.categoria || '—';

    // Enfileira ANTES de enviar (idempotente por unique) — se já existe, não reenvia.
    const { error: insErr } = await supabase.from('solicitacao_wpp_fila').insert({
      solicitacao_id: sol.id,
      aprovador_id: sol.aprovacao_origem_diretor_id,
      telefone: tel,
      tipo: 'origem',
      status: 'aguardando',
    });
    if (insErr) { if (insErr.code === '23505') return; throw insErr; }

    const params = [(nome || 'Diretor').split(' ')[0], sol.titulo || 'Solicitação', solicitante, catLabel];
    await wpp.sendTemplate(tel, TEMPLATE_APROVACAO, TEMPLATE_LANG, params);
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
    const { data: pend } = await supabase.from('solicitacao_wpp_fila')
      .select('*').eq('telefone', tel).eq('status', 'aguardando')
      .order('created_at', { ascending: true });
    if (!pend || !pend.length) return false;      // não há aprovação pendente deste número

    const acao = interpretar(texto);
    const fila = pend[0];
    if (!acao) {
      await wpp.sendText(tel, `Você tem ${pend.length} solicitação(ões) aguardando. Responda *1* para APROVAR ou *2* para REJEITAR a mais antiga.`);
      return true;
    }

    const solic = require('../routes/solicitacoes');
    const res = acao === 'aprovar'
      ? await solic.aprovarOrigemInterno({ solicitacaoId: fila.solicitacao_id, aprovadorId: fila.aprovador_id })
      : await solic.rejeitarOrigemInterno({ solicitacaoId: fila.solicitacao_id, aprovadorId: fila.aprovador_id, motivo: 'Rejeitada pelo WhatsApp' });

    const titulo = res?.data?.titulo || 'a solicitação';
    if (!res.ok) {
      // Já não estava pendente (alguém aprovou no sistema) ou erro — fecha a fila.
      await supabase.from('solicitacao_wpp_fila').update({ status: 'cancelada', respondido_em: new Date().toISOString() }).eq('id', fila.id);
      await wpp.sendText(tel, `Não consegui aplicar (${res?.data?.error || 'já foi resolvida'}). "${titulo}" pode já ter sido tratada no sistema.`);
    } else {
      await supabase.from('solicitacao_wpp_fila').update({ status: acao === 'aprovar' ? 'aprovada' : 'rejeitada', respondido_em: new Date().toISOString() }).eq('id', fila.id);
      await wpp.sendText(tel, acao === 'aprovar' ? `✅ Aprovada: ${titulo}` : `❌ Rejeitada: ${titulo}`);
    }

    // Próxima pendente?
    const restantes = pend.length - 1;
    if (restantes > 0) {
      await wpp.sendText(tel, `Você ainda tem ${restantes} solicitação(ões) aguardando. Vou te enviar a próxima.`);
    }
    return true;
  } catch (e) {
    console.error('[solicitacaoWpp] resposta:', e.message);
    return false;
  }
}

module.exports = { enviarAprovacaoWpp, tratarRespostaAprovacao };
