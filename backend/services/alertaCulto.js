// Alerta de dados de culto não lançados (cron de segunda 10h BRT).
// Marcos: até segunda 10h os dados dos cultos da semana têm que estar no
// sistema. Se faltar algum, avisa o Marcelo por 3 canais: notificação no
// sistema, WhatsApp e e-mail.
//
// "Lançado" = o culto tem submissão de dados (cultos_dados_submissoes) OU já
// tem presencial/decisões preenchidos direto na ficha. Sem nada disso = pendente.

const { supabase } = require('../utils/supabase');
const { notificar } = require('./notificar');
const { enviarTexto, isConfigured: wppConfigurado } = require('./whatsappSend');
const { enviarEmail, isConfigured: emailConfigurado } = require('./email');

const RESPONSAVEL_EMAIL = (process.env.ALERTA_CULTO_EMAIL || 'marcelo.soares@cbrio.org').toLowerCase();

function isoDiasAtras(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}
function fmtBR(iso) {
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
}

async function apurarCultosPendentes() {
  const hoje = new Date().toISOString().slice(0, 10);
  const seteDias = isoDiasAtras(7);
  // Cultos da última semana (já ocorridos)
  const { data: cultos, error } = await supabase
    .from('cultos')
    .select('id, data, presencial_adulto, decisoes, service_type_id, service_type:vol_service_types(name)')
    .gte('data', seteDias)
    .lt('data', hoje)
    .order('data');
  if (error) throw new Error(error.message);
  if (!cultos || !cultos.length) return [];

  // Quais têm submissão de dados lançada
  const ids = cultos.map(c => c.id);
  const { data: subs } = await supabase
    .from('cultos_dados_submissoes')
    .select('culto_id')
    .in('culto_id', ids);
  const comSubmissao = new Set((subs || []).map(s => s.culto_id));

  return cultos.filter(c => {
    const temNumeros = (Number(c.presencial_adulto) > 0) || (Number(c.decisoes) > 0);
    return !comSubmissao.has(c.id) && !temNumeros;
  }).map(c => ({
    id: c.id,
    data: c.data,
    nome: c.service_type?.name || 'Culto',
  }));
}

// Roda o alerta. Retorna resumo. `force` ignora o "não há pendentes" (teste).
async function enviarAlertaCultoSemDados() {
  const pendentes = await apurarCultosPendentes();
  if (!pendentes.length) return { ok: true, pendentes: 0, canais: {} };

  const { data: resp } = await supabase
    .from('profiles')
    .select('id, name, email, telefone')
    .ilike('email', RESPONSAVEL_EMAIL)
    .maybeSingle();

  const lista = pendentes.map(p => `• ${p.nome} (${fmtBR(p.data)})`).join('\n');
  const titulo = `⚠️ ${pendentes.length} culto(s) sem dados lançados`;
  const corpo = `Faltam lançar os dados de ${pendentes.length} culto(s) da semana passada no sistema:\n${lista}\n\nPor favor, lance até hoje às 10h em Integração → Cultos.`;

  const canais = { notificacao: false, whatsapp: false, email: false };

  // 1. Notificação no sistema
  if (resp?.id) {
    await notificar({
      modulo: 'integracao',
      tipo: 'culto_sem_dados',
      titulo,
      mensagem: corpo,
      link: '/ministerial/integracao',
      severidade: 'aviso',
      chaveDedup: `culto_sem_dados_${isoDiasAtras(0)}`,
      targetIds: [resp.id],
    }).then(() => { canais.notificacao = true; }).catch(e => console.error('[alertaCulto] notif', e.message));
  }

  // 2. WhatsApp
  if (resp?.telefone && wppConfigurado()) {
    const primeiro = (resp.name || '').split(/\s+/)[0] || '';
    const r = await enviarTexto(resp.telefone, `Oi ${primeiro}! ${titulo}\n\n${corpo}`);
    canais.whatsapp = !!r?.ok;
  }

  // 3. E-mail
  if (resp?.email && emailConfigurado()) {
    const html = `<p>Oi ${(resp.name || '').split(/\s+/)[0] || ''}!</p>`
      + `<p><strong>${titulo}</strong></p>`
      + `<p>Faltam lançar os dados de <strong>${pendentes.length}</strong> culto(s) da semana passada:</p>`
      + `<ul>${pendentes.map(p => `<li>${p.nome} — ${fmtBR(p.data)}</li>`).join('')}</ul>`
      + `<p>Por favor, lance até hoje às 10h em <a href="https://cbrio.org/ministerial/integracao">Integração → Cultos</a>.</p>`;
    const r = await enviarEmail({ to: resp.email, subject: titulo, html });
    canais.email = !!r?.ok;
  }

  console.log('[alertaCulto] %d pendentes · canais %j · resp %s', pendentes.length, canais, resp?.email || 'não encontrado');
  return { ok: true, pendentes: pendentes.length, cultos: pendentes, canais, responsavel: resp?.email || null };
}

module.exports = { enviarAlertaCultoSemDados, apurarCultosPendentes };
