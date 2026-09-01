// Alerta de dados de culto não lançados (cron de segunda 10h BRT).
// Marcos: até segunda 10h os dados dos cultos da semana têm que estar no
// sistema. Se faltar algum, avisa o Marcelo por 3 canais: notificação no
// sistema, WhatsApp e e-mail.
//
// "Lançado" = o culto tem submissão de dados (cultos_dados_submissoes) OU as
// FLAGS `frequencia_lancada`/`decisoes_lancadas` estão marcadas. Sem nada disso
// = pendente.
//
// ⚠️ As flags, NUNCA os números. Regra do Marcos, a mesma que o painel de
// Integração já seguia (`backend/routes/integracao.js`): lançar 0 conta como
// lançado, porque `0` é o DEFAULT da coluna e não distingue "ninguém tocou" de
// "veio zero de verdade". Este serviço olhava `presencial_adulto > 0 ||
// decisoes > 0` — e `cultos.decisoes` nem existe (as colunas reais são
// decisoes_presenciais/_online/_kids), o que derrubava o cron inteiro.

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

// Predicado puro (testado em alertaCultoPendente.test.js · gate de deploy).
// Pendente = ninguem lancou NADA: nem submissao de dados, nem as flags.
function cultoPendente(culto, comSubmissao) {
  if (comSubmissao.has(culto.id)) return false;
  return !culto.frequencia_lancada && !culto.decisoes_lancadas;
}

async function apurarCultosPendentes() {
  const hoje = new Date().toISOString().slice(0, 10);
  const seteDias = isoDiasAtras(7);
  // Cultos da última semana (já ocorridos)
  const { data: cultos, error } = await supabase
    .from('cultos')
    .select('id, data, frequencia_lancada, decisoes_lancadas, service_type_id, service_type:vol_service_types(name)')
    .gte('data', seteDias)
    .lt('data', hoje)
    .order('data');
  if (error) throw new Error(error.message);
  if (!cultos || !cultos.length) return [];

  // Quais têm submissão de dados lançada
  const ids = cultos.map(c => c.id);
  // ⚠️ Erro aqui NÃO pode virar conjunto vazio silencioso: sem as submissões
  // TODO culto parece pendente e o Marcelo recebe uma lista falsa. Alerta errado
  // queima a confiança no alerta · falhar alto é melhor.
  const { data: subs, error: errSubs } = await supabase
    .from('cultos_dados_submissoes')
    .select('culto_id')
    .in('culto_id', ids);
  if (errSubs) throw new Error(`submissoes: ${errSubs.message}`);
  const comSubmissao = new Set((subs || []).map(s => s.culto_id));

  return cultos.filter(c => cultoPendente(c, comSubmissao)).map(c => ({
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

  // Sem responsavel, os 3 canais ficam false e o retorno diria `ok: true` com
  // `pendentes: 6` — sucesso aparente notificando NINGUEM. Falhar alto, pra
  // virar incidente visivel em vez de silencio (ALERTA_CULTO_EMAIL trocado,
  // login desativado, e-mail renomeado).
  if (!resp?.id) {
    throw new Error(`responsavel do alerta nao encontrado em profiles: ${RESPONSAVEL_EMAIL} (ver ALERTA_CULTO_EMAIL)`);
  }

  const lista = pendentes.map(p => `• ${p.nome} (${fmtBR(p.data)})`).join('\n');
  const titulo = `⚠️ ${pendentes.length} culto(s) sem dados lançados`;
  const corpo = `Faltam lançar os dados de ${pendentes.length} culto(s) da semana passada no sistema:\n${lista}\n\nPor favor, lance até hoje às 10h em Integração → Cultos.`;

  const canais = { notificacao: false, whatsapp: false, email: false };

  // 1. Notificação no sistema (resp.id garantido pela guarda acima)
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

  // 2. WhatsApp
  if (resp.telefone && wppConfigurado()) {
    const primeiro = (resp.name || '').split(/\s+/)[0] || '';
    const r = await enviarTexto(resp.telefone, `Oi ${primeiro}! ${titulo}\n\n${corpo}`);
    canais.whatsapp = !!r?.ok;
  }

  // 3. E-mail
  if (resp.email && emailConfigurado()) {
    const html = `<p>Oi ${(resp.name || '').split(/\s+/)[0] || ''}!</p>`
      + `<p><strong>${titulo}</strong></p>`
      + `<p>Faltam lançar os dados de <strong>${pendentes.length}</strong> culto(s) da semana passada:</p>`
      + `<ul>${pendentes.map(p => `<li>${p.nome} — ${fmtBR(p.data)}</li>`).join('')}</ul>`
      + `<p>Por favor, lance até hoje às 10h em <a href="https://cbrio.org/ministerial/integracao">Integração → Cultos</a>.</p>`;
    const r = await enviarEmail({ to: resp.email, subject: titulo, html });
    canais.email = !!r?.ok;
  }

  console.log('[alertaCulto] %d pendentes · canais %j · resp %s', pendentes.length, canais, resp.email);
  return { ok: true, pendentes: pendentes.length, cultos: pendentes, canais, responsavel: resp.email };
}

module.exports = { enviarAlertaCultoSemDados, apurarCultosPendentes, cultoPendente };
