// Distribuição e COBRANÇA da ficha da CONTRATADA (Anexo II).
//
// ⚠️⚠️ O QUE ISTO CONSERTA, medido no disparo irmão (onboarding) em 21/09/2026:
//  · saiu UMA leva em 21/08 e ZERO lembretes nos 31 dias seguintes;
//  · é WhatsApp-only, enquanto 40 dos 46 colaboradores têm e-mail;
//  · `gerarOnboardingLink` carimba `enviado_em` ANTES de saber se enviou — com
//    o template ausente (estado atual), marca todo mundo como "enviado" sem
//    mandar nada, e a tela mostra números que não correspondem a mensagem
//    nenhuma.
//
// Aqui: e-mail é o canal PRIMÁRIO, o carimbo vem DEPOIS do envio, e a escada de
// lembretes tem teto.
const { supabase } = require('../utils/supabase');
const { enviarEmail, isConfigured } = require('./email');
const { basePublica } = require('../utils/linkInscricaoApp');
const { estadoFicha, ehContratada } = require('../utils/fichaContratada');
const { montarRodada, diaBRT } = require('../utils/fichaCobranca');
const crypto = require('crypto');

const DIAS_VALIDADE = 30;
const TETO_RODADA = 40;

const COLUNAS = 'id, nome, email, telefone, cargo, tipo_contrato, status, '
  + 'ficha_contratada, ficha_contratada_token, ficha_contratada_expira_em, ficha_contratada_cobrancas';

/** Ativos e em admissão — quem saiu não precisa entregar ficha. */
const STATUS_ELEGIVEIS = ['ativo', 'em_admissao', 'ferias', 'licenca'];

async function listarCandidatos() {
  const { data, error } = await supabase
    .from('rh_funcionarios')
    .select(COLUNAS)
    .is('deleted_at', null)
    .in('status', STATUS_ELEGIVEIS);
  if (error) return { erro: error.message };
  // ⚠️ O filtro de PJ é da régua (`ehContratada`), não um `.eq` aqui: a coluna
  // é texto livre e editável pelo PUT, e a régua é fail-closed para tipo novo.
  return { candidatos: (data || []).filter((f) => ehContratada(f.tipo_contrato)) };
}

/**
 * Garante token e validade para UMA pessoa.
 *
 * ⚠️ Reusa o token quando já existe e ainda vale: regenerar a cada cobrança
 * invalidaria o link que a pessoa já tem no WhatsApp — e o lembrete existe
 * justamente para quem não abriu o primeiro.
 */
async function garantirToken(func) {
  const valeAinda = func.ficha_contratada_token
    && func.ficha_contratada_expira_em
    && new Date(func.ficha_contratada_expira_em) > new Date();
  if (valeAinda) {
    return { url: `${basePublica()}/ficha-contratada/${func.ficha_contratada_token}` };
  }
  const token = func.ficha_contratada_token || crypto.randomBytes(24).toString('base64url');
  const expira = new Date();
  expira.setDate(expira.getDate() + DIAS_VALIDADE);
  const { error } = await supabase.from('rh_funcionarios')
    .update({ ficha_contratada_token: token, ficha_contratada_expira_em: expira.toISOString() })
    .eq('id', func.id);
  if (error) return { erro: error.message };
  return { url: `${basePublica()}/ficha-contratada/${token}` };
}

function assunto(rodada) {
  return rodada === 1
    ? 'CBRio · ficha cadastral da sua empresa'
    : 'CBRio · lembrete: ficha cadastral da sua empresa';
}

function corpo({ nome, url, rodada, faltando }) {
  const primeiro = String(nome || '').trim().split(/\s+/)[0] || '';
  const abre = rodada === 1
    ? 'Para seguir com o seu contrato de prestação de serviços e com os pagamentos, precisamos dos dados da sua empresa.'
    : 'Passando para lembrar: ainda estamos esperando os dados da sua empresa.';
  // ⚠️ O que falta vai NOMEADO quando a ficha foi começada: "está incompleta"
  // sem dizer o quê obriga a pessoa a abrir o link para descobrir, e é aí que
  // ela adia de novo.
  const oQueFalta = (faltando && faltando.length)
    ? `<p style="margin:0 0 16px"><b>Falta preencher:</b> ${faltando.join(', ')}.</p>`
    : '';
  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;color:#12303a;line-height:1.6">
      <p style="margin:0 0 16px">Olá${primeiro ? `, ${primeiro}` : ''}!</p>
      <p style="margin:0 0 16px">${abre}</p>
      ${oQueFalta}
      <p style="margin:0 0 24px">É rápido — leva uns 3 minutos:</p>
      <p style="margin:0 0 24px">
        <a href="${url}" style="background:#00B39D;color:#04222A;text-decoration:none;padding:13px 22px;border-radius:9px;font-weight:700;display:inline-block">Preencher a ficha</a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#5b7780">Ou copie este endereço: ${url}</p>
      <p style="margin:0;font-size:13px;color:#5b7780">O pagamento depende desta ficha estar completa. Qualquer dúvida, é só responder este e-mail.</p>
    </div>`;
}

/**
 * Dispara a rodada de cobrança.
 *
 * ⚠️⚠️ O CARIMBO VEM DEPOIS DO ENVIO. É o defeito do disparo irmão invertido:
 * lá o link é gerado (carimbando "enviado") antes de saber se o canal existe.
 * Aqui, se o e-mail não sair, a pessoa NÃO é marcada como cobrada e entra na
 * próxima rodada.
 *
 * ⚠️ E grava DURANTE o laço, uma pessoa por vez (lei de 04/08): morte no meio
 * deixa registrado quem já recebeu, em vez de fazer a próxima rodada repetir
 * tudo. Registro no fim transforma qualquer interrupção em cobrança duplicada.
 */
async function dispararCobranca({ seco = false, agora = new Date() } = {}) {
  const r = await listarCandidatos();
  if (r.erro) return { erro: r.erro };

  // ⚠️ WhatsApp fica de fora enquanto não houver template aprovado na Meta —
  // nome de template inexistente é recusa PERMANENTE (132001), que queima a
  // cobrança sem retry. O e-mail sozinho já alcança 40 dos 46.
  const temTemplateWhatsapp = false;

  const rodada = montarRodada(r.candidatos, {
    agora, temTemplateWhatsapp, teto: TETO_RODADA, estadoDe: estadoFicha,
  });

  const canalOk = isConfigured();
  if (!canalOk) {
    // ⚠️ Sem canal configurado NÃO é sucesso com zero envio: a caixa verde
    // dizendo "rodada disparada" com ninguém recebendo foi o incidente do
    // censo (05/08). Recusa explícita, com o motivo.
    return {
      erro: 'canal_de_email_nao_configurado',
      detalhe: 'Nenhum e-mail sairia. Configure o Microsoft Graph antes de disparar.',
      elegiveis: rodada.enviar.length,
      resumo: rodada.resumo,
    };
  }

  if (seco) {
    return {
      seco: true,
      elegiveis: rodada.enviar.length,
      adiados: rodada.adiados,
      resumo: rodada.resumo,
      exemplo: rodada.enviar.slice(0, 5).map((e) => ({
        nome: e.func.nome, rodada: e.rodada, canais: e.canais,
      })),
    };
  }

  let enviados = 0;
  const falhas = [];

  for (const item of rodada.enviar) {
    const { func } = item;
    const link = await garantirToken(func);
    if (link.erro) { falhas.push({ nome: func.nome, motivo: 'link: ' + link.erro }); continue; }

    const estado = estadoFicha(func);
    const res = await enviarEmail({
      to: func.email,
      subject: assunto(item.rodada),
      html: corpo({ nome: func.nome, url: link.url, rodada: item.rodada, faltando: estado.faltando }),
    });

    if (!res || res.ok === false) {
      falhas.push({ nome: func.nome, motivo: (res && res.error) || 'falha no envio' });
      continue; // ⚠️ NÃO carimba: a pessoa volta na próxima rodada.
    }

    const cobrancas = Array.isArray(func.ficha_contratada_cobrancas) ? func.ficha_contratada_cobrancas : [];
    const { error } = await supabase.from('rh_funcionarios').update({
      ficha_contratada_cobrancas: [...cobrancas, {
        em: new Date().toISOString(), canal: 'email', rodada: item.rodada, dia: diaBRT(agora),
      }],
      ficha_contratada_enviado_em: new Date().toISOString(),
    }).eq('id', func.id);

    // ⚠️ Falha ao REGISTRAR depois de o e-mail ter saído é declarada, nunca
    // engolida: sem o registro a pessoa recebe de novo na próxima rodada, e
    // quem lê o relatório precisa saber disso.
    if (error) falhas.push({ nome: func.nome, motivo: 'enviado mas NÃO registrado: ' + error.message });
    enviados += 1;
  }

  return {
    enviados,
    adiados: rodada.adiados,
    falhas,
    resumo: rodada.resumo,
    canal: 'email',
    // ⚠️ Declarado para a tela não prometer WhatsApp que não sai.
    whatsapp: 'sem_template_aprovado',
  };
}

module.exports = { listarCandidatos, dispararCobranca, garantirToken, TETO_RODADA };
