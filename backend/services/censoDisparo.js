// ════════════════════════════════════════════════════════════════════════════
//  CENSO · disparo do convite de atualização cadastral
//
//  Pedido do Matheus (04/08): "disparar um WhatsApp e um e-mail para todas as
//  pessoas que não têm CPF cadastrado, mas que tenham o celular ou e-mail,
//  pedindo bem objetivamente para atualizar seus dados cadastrais, clicando no
//  link (deve ir junto o link de cadastro de membresia)".
//
//  O público é "sem CPF" porque o CPF é o SINAL DE QUALIDADE da base: é a única
//  chave forte do matcher canônico (Contrato de porta). Quem não tem CPF é
//  exatamente quem não dá para consolidar sem ligar e conferir.
//
//  ⚠️⚠️ A LEI DESTE ARQUIVO · o teto da Meta manda no tamanho da rodada.
//  A conta da igreja está em TIER_250 = 250 DESTINATÁRIOS ÚNICOS por janela de
//  24h. E a fila (`whatsappFila.IDADE_MIN_DESISTIR_H = 36`) DESISTE de uma
//  mensagem 36h depois de criada. Enfileirar as ~2.000 pessoas de uma vez não
//  entrega 2.000 mensagens devagar: entrega ~250 e as outras ~1.750 MORREM na
//  fila em dois dias, em silêncio, com a pessoa nunca sabendo do censo.
//  Por isso o disparo é POR RODADA, com teto, e reenvio é rodada nova.
//  Aumentar TETO_RODADA_WHATSAPP sem o tier ter subido = mensagem descartada.
//
//  ⚠️ Nada aqui é automático. Não existe cron: quem dispara é uma pessoa, na
//     tela, confirmando o número. Mesma lei dos envios de Grupos (20/07).
// ════════════════════════════════════════════════════════════════════════════

const { supabase } = require('../utils/supabase');
const fila = require('./whatsappFila');
const { enviarEmail, isConfigured: emailConfigurado } = require('./email');

// ⚠️ A régua de QUEM recebe e QUANTOS saem vive em utils/censoConvite.js (pura,
//    testada no gate de deploy). Não duplicar nada dela aqui.
const {
  TETO_RODADA_WHATSAPP,
  TETO_RODADA_EMAIL,
  semCpf,
  primeiroNome,
  emailUtilizavel,
  canaisDaPessoa,
  limitarPorTeto,
  montarLinkCenso,
  whatsappPronto,
  jaConvidadoEmQualquerCanal,
} = require('../utils/censoConvite');
const { gerarTokenCenso } = require('../utils/censoToken');

// ⚠️ Orçamento de TEMPO, além do teto de quantidade: o `enviarEmail` faz 3
// tentativas com backoff (1,5s + 3s) em falha transitória, então uma rodada com
// muitos endereços ruins pode passar de 4,5s por pessoa e estourar o
// maxDuration de 300s. Se a função é morta no meio, os e-mails já enviados NÃO
// são registrados e a próxima rodada os manda de novo. Melhor parar antes,
// declarar o que ficou e gravar o que saiu.
const ORCAMENTO_EMAIL_MS = 200000;

const TEMPLATE_PADRAO = 'atualizacao_cadastro';
const CONTEXTO = 'membresia.censo_atualizacao';

// Espelha `queryBaseCenso` / `ehNomePlaceholder`: descrição de extrato bancário
// ("Contribuinte 059412...") não é pessoa e não recebe convite.
const PLACEHOLDER = 'contribuinte%';

function nomeTemplate() {
  return process.env.WHATSAPP_TEMPLATE_CENSO_ATUALIZACAO || TEMPLATE_PADRAO;
}

// ── Leitura do público ─────────────────────────────────────────────────────

function schemaAusente(error) {
  if (!error) return false;
  return error.code === '42P01' || error.code === '42703'
    || /relation .* does not exist/i.test(error.message || '')
    || /column .* does not exist/i.test(error.message || '');
}

/**
 * Pessoas vivas SEM CPF, com contato. Paginado: são ~2.600 linhas e o
 * PostgREST capa em 1000 server-side — sem o laço, um terço do público
 * simplesmente não seria convidado, sem erro nenhum.
 */
async function lerPublicoSemCpf({ status = ['membro_ativo'] } = {}) {
  const PAGE = 1000;
  const pessoas = [];
  let offset = 0;
  for (;;) {
    let q = supabase
      .from('mem_membros')
      .select('id, nome, telefone, email, cpf, status, whatsapp_optin, censo_respondido_em')
      .eq('active', true)
      .is('deleted_at', null)
      .not('nome', 'ilike', PLACEHOLDER)
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (Array.isArray(status) && status.length) q = q.in('status', status);

    const { data, error } = await q;
    if (error) {
      // `censo_respondido_em` só existe com a parte 2 da migration do censo
      // aplicada. Sem ela, degrada para o público inteiro em vez de 500.
      if (schemaAusente(error)) return { pessoas: [], aviso: avisoSchemaCenso() };
      throw error;
    }
    if (!data || !data.length) break;
    pessoas.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  return {
    // Já respondeu o censo → não é cobrado de novo, mesmo sem CPF (pode ter
    // respondido e o CPF ter caído em conflito para decisão humana).
    pessoas: pessoas.filter(p => semCpf(p.cpf) && !p.censo_respondido_em),
    aviso: null,
  };
}

function avisoSchemaCenso() {
  return 'As colunas do censo em mem_membros (migration 20260803160100) ainda não foram aplicadas — o disparo fica indisponível até lá.';
}

/**
 * Quem já foi convidado. Duas visões:
 *  - `jaConvidado`: `${membro_id}:${canal}` — o mesmo canal não repete.
 *  - `jaConvidadoQualquer`: só `membro_id` — usada pra NÃO mandar WhatsApp pra
 *    quem já recebeu e-mail (regra do Matheus · 04/08).
 */
async function lerConvitesEnviados() {
  const PAGE = 1000;
  const jaConvidado = new Set();
  const jaConvidadoQualquer = new Set();
  const porRodada = new Map();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('mem_censo_convites')
      .select('membro_id, canal, rodada, ok')
      .order('enviado_em', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      if (schemaAusente(error)) return { indisponivel: true, jaConvidado, jaConvidadoQualquer, porRodada };
      throw error;
    }
    if (!data || !data.length) break;
    for (const c of data) {
      if (c.ok && c.membro_id) {
        jaConvidado.add(`${c.membro_id}:${c.canal}`);
        jaConvidadoQualquer.add(c.membro_id);
      }
      porRodada.set(c.rodada, (porRodada.get(c.rodada) || 0) + 1);
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return { indisponivel: false, jaConvidado, jaConvidadoQualquer, porRodada };
}

// ── Prévia ─────────────────────────────────────────────────────────────────

async function previewCenso({ status, canais = ['whatsapp', 'email'], reenviar = false, permitirCanalCruzado = false } = {}) {
  const optinObrigatorio = process.env.WHATSAPP_OPTIN_OBRIGATORIO === '1';
  const { pessoas, aviso } = await lerPublicoSemCpf({ status });
  if (aviso) return { disponivel: false, aviso };

  const convites = await lerConvitesEnviados();
  if (convites.indisponivel) {
    return {
      disponivel: false,
      aviso: 'A migration 20260804120000 (mem_censo_convites) ainda não foi aplicada — sem ela não há como saber quem já foi convidado, e o reenvio mandaria de novo para todo mundo.',
    };
  }

  const alvoWhats = [];
  const alvoEmail = [];
  const motivos = {};
  let jaConvidadas = 0;
  let jaConvidadasOutroCanal = 0;

  for (const p of pessoas) {
    const c = canaisDaPessoa(p, { canais, optinObrigatorio });
    for (const m of c.motivos) motivos[m] = (motivos[m] || 0) + 1;

    // ⚠️ Já foi convidada por OUTRO canal → por padrão NÃO recebe de novo.
    // Regra do Matheus (04/08): "quando for disparar pelo wpp, não é legal
    // enviar para quem já enviou por email". Medido na decisão: 508 dos 627
    // alcançáveis por WhatsApp já tinham recebido o e-mail — sem esta guarda o
    // disparo seria 81% contato repetido, gastando cota do TIER_250 em quem já
    // foi avisado. `permitirCanalCruzado` é o reforço DELIBERADO.
    const cruzado = !permitirCanalCruzado
      && jaConvidadoEmQualquerCanal(p.id, convites.jaConvidadoQualquer);

    const novoWhats = reenviar || (!convites.jaConvidado.has(`${p.id}:whatsapp`) && !cruzado);
    const novoEmail = reenviar || (!convites.jaConvidado.has(`${p.id}:email`) && !cruzado);
    if (c.whatsapp && novoWhats) alvoWhats.push(p);
    if (c.email && novoEmail) alvoEmail.push(p);
    if ((c.whatsapp && !novoWhats) || (c.email && !novoEmail)) jaConvidadas += 1;
    if (cruzado && (c.whatsapp || c.email)) jaConvidadasOutroCanal += 1;
  }

  const whats = limitarPorTeto(alvoWhats, TETO_RODADA_WHATSAPP);
  const mail = limitarPorTeto(alvoEmail, TETO_RODADA_EMAIL);
  const proxRodada = Math.max(0, ...convites.porRodada.keys()) + 1;

  return {
    disponivel: true,
    rodada: proxRodada,
    publico_sem_cpf: pessoas.length,
    whatsapp: {
      elegiveis: alvoWhats.length,
      enviar_agora: whats.envia.length,
      adiados: whats.adiados,
      teto: TETO_RODADA_WHATSAPP,
      template: nomeTemplate(),
      configurado: whatsappPronto(),
    },
    email: {
      elegiveis: alvoEmail.length,
      enviar_agora: mail.envia.length,
      adiados: mail.adiados,
      teto: TETO_RODADA_EMAIL,
      configurado: emailConfigurado(),
    },
    ja_convidadas: jaConvidadas,
    ja_convidadas_outro_canal: jaConvidadasOutroCanal,
    nao_recebem: motivos,
    exemplo: alvoWhats[0] || alvoEmail[0]
      ? { nome: primeiroNome((alvoWhats[0] || alvoEmail[0]).nome) }
      : null,
    link: montarLinkCenso(process.env.FRONTEND_URL),
    // Cada pessoa recebe o link com um token próprio (abre o cadastro DELA
    // preenchido). Se o segredo não estiver configurado, o link degrada pro
    // genérico e a tela avisa — senão a equipe acharia que mandou o
    // personalizado e a pessoa receberia uma folha em branco.
    link_pessoal: !!gerarTokenCenso('00000000-0000-0000-0000-000000000000'),
  };
}

// ── Disparo ────────────────────────────────────────────────────────────────

function corpoEmail({ nome, link, destinatario = null }) {
  const primeiro = primeiroNome(nome);
  const texto = [
    `Olá ${primeiro}!`,
    '',
    'Estamos atualizando o cadastro da nossa igreja e o seu está incompleto.',
    'Leva 2 minutos para preencher — é só abrir o link abaixo:',
    '',
    link,
    '',
    'O link é pessoal e já abre com os seus dados.',
    '',
    'Obrigado por ajudar a manter nossos dados em ordem.',
    'Comunidade Batista do Rio',
  ].join('\n');

  // ⚠️ HTML de E-MAIL, não de página: estilo INLINE em tudo (Gmail e Outlook
  // descartam <style> e classes), largura fixa em px, e nada de flex/grid — o
  // Outlook desktop renderiza com o motor do Word. A logo é URL ABSOLUTA em
  // https://cbrio.org (caminho relativo não existe dentro de um e-mail) e leva
  // `alt`, porque a maioria dos clientes abre com imagem BLOQUEADA por padrão:
  // sem o alt, a assinatura vira um retângulo vazio.
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:560px">
  <p style="margin:0 0 16px">Olá ${escapeHtml(primeiro)}!</p>
  <p style="margin:0 0 16px">Estamos atualizando o cadastro da nossa igreja e o seu está incompleto.<br>
     Leva 2 minutos para preencher.</p>
  <p style="margin:0 0 24px">
    <a href="${escapeHtml(link)}" style="background:#00B39D;color:#ffffff;text-decoration:none;padding:13px 24px;border-radius:8px;display:inline-block;font-weight:700;font-size:15px">Atualizar meu cadastro</a>
  </p>
  <p style="margin:0 0 16px;font-size:13px;color:#6b7280">Se o botão não abrir, use este endereço:<br>
     <a href="${escapeHtml(link)}" style="color:#00B39D;word-break:break-all">${escapeHtml(link)}</a></p>
  <p style="margin:0 0 24px;font-size:13px;color:#6b7280">
     Este link é <strong>pessoal</strong> e já abre com os seus dados — não encaminhe para outra pessoa.</p>

  <div style="border-top:1px solid #e5e7eb;padding-top:18px;margin-top:8px">
    <img src="https://cbrio.org/logo-cbrio-text.png" alt="CBRio · Comunidade Batista do Rio" width="132" style="display:block;width:132px;max-width:132px;height:auto;border:0;margin-bottom:10px">
    <p style="margin:0;font-size:13px;color:#374151"><strong>Comunidade Batista do Rio</strong></p>
    <p style="margin:2px 0 0;font-size:12px;color:#9ca3af">
      Você recebeu este e-mail porque tem cadastro na CBRio.${destinatario ? `<br>Enviado para ${escapeHtml(destinatario)}.` : ''}
    </p>
  </div>
</div>`;

  return { subject: 'Atualize seu cadastro na CBRio', text: texto, html };
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, ch => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

async function registrarConvites(linhas) {
  if (!linhas.length) return { gravados: 0 };
  // `ignoreDuplicates` porque a UNIQUE (membro,canal,rodada) é a trava contra
  // clique duplo no botão: a segunda tentativa não grava e não estoura.
  const { data, error } = await supabase
    .from('mem_censo_convites')
    .upsert(linhas, { onConflict: 'membro_id,canal,rodada', ignoreDuplicates: true })
    .select('id');
  if (error) {
    console.error('[censoDisparo] falha ao registrar convites:', error.message);
    return { gravados: 0, erro: error.message };
  }
  return { gravados: (data || []).length };
}

/**
 * Dispara a rodada. WhatsApp vai pela FILA (retry/backoff/teto por telefone);
 * e-mail sai na hora pelo Graph.
 *
 * ⚠️ O registro em `mem_censo_convites` é gravado DEPOIS do enfileiramento e
 *    é o que impede a próxima rodada de mandar de novo. Se o registro falhar,
 *    a resposta diz — porque a alternativa (achar que registrou) faria o
 *    próximo disparo repetir a mensagem para as mesmas pessoas.
 */
async function dispararCenso({ status, canais = ['whatsapp', 'email'], reenviar = false, por = null, permitirCanalCruzado = false } = {}) {
  const prev = await previewCenso({ status, canais, reenviar, permitirCanalCruzado });
  if (!prev.disponivel) return { ok: false, aviso: prev.aviso };

  // ⚠️ O link é POR PESSOA (token assinado com o membro_id dentro): é o que faz
  // o formulário abrir com os dados dela e marcar o que falta, SEM depender de
  // ela ter CPF cadastrado. Um link único para todos devolveria a folha em
  // branco — o furo que o Matheus achou em 04/08.
  const base = process.env.FRONTEND_URL;
  const linkDe = (membroId) => montarLinkCenso(base, membroId);
  const optinObrigatorio = process.env.WHATSAPP_OPTIN_OBRIGATORIO === '1';
  const { pessoas } = await lerPublicoSemCpf({ status });
  const convites = await lerConvitesEnviados();
  const rodada = prev.rodada;

  const alvoWhats = [];
  const alvoEmail = [];
  for (const p of pessoas) {
    const c = canaisDaPessoa(p, { canais, optinObrigatorio });
    // MESMA régua da prévia — se divergir, o disparo manda pra quem a tela
    // disse que não receberia.
    const cruzado = !permitirCanalCruzado
      && jaConvidadoEmQualquerCanal(p.id, convites.jaConvidadoQualquer);
    if (c.whatsapp && (reenviar || (!convites.jaConvidado.has(`${p.id}:whatsapp`) && !cruzado))) alvoWhats.push(p);
    if (c.email && (reenviar || (!convites.jaConvidado.has(`${p.id}:email`) && !cruzado))) alvoEmail.push(p);
  }
  const whats = limitarPorTeto(alvoWhats, TETO_RODADA_WHATSAPP);
  const mail = limitarPorTeto(alvoEmail, TETO_RODADA_EMAIL);

  let gravados = 0;
  let erroRegistro = null;
  const resultado = {
    ok: true,
    rodada,
    whatsapp: { enfileirados: 0, adiados: whats.adiados, motivo: null },
    email: { enviados: 0, falhas: 0, adiados: mail.adiados, motivo: null },
  };

  // ── WhatsApp (fila) ──
  // ⚠️ Template não aprovado ainda = canal FECHADO. Enfileirar aqui marcaria as
  // pessoas como convidadas (`mem_censo_convites`), a Meta recusaria o envio, e
  // a próxima rodada as pularia — convite perdido para sempre, sem erro na tela.
  if (whats.envia.length && !whatsappPronto()) {
    resultado.whatsapp.motivo = 'template_nao_configurado';
    resultado.whatsapp.adiados = alvoWhats.length;
  } else if (whats.envia.length) {
    const r = await fila.enfileirarLote(whats.envia.map(p => ({
      telefone: p.telefone,
      template: nomeTemplate(),
      params: [primeiroNome(p.nome), linkDe(p.id)],
      contexto: CONTEXTO,
      refId: p.id,
    })));
    resultado.whatsapp.enfileirados = r.queued || 0;
    resultado.whatsapp.motivo = r.motivo || null;
    if (r.queued) {
      // Grava JÁ: o enfileiramento aconteceu, e o registro não pode depender de
      // o resto da função chegar ao fim.
      const regWhats = await registrarConvites(whats.envia.map(p => ({
        membro_id: p.id, canal: 'whatsapp', rodada, enviado_por: por, ok: true,
      })));
      gravados += regWhats.gravados;
      if (regWhats.erro) erroRegistro = regWhats.erro;
    }
  }

  // ── E-mail (Microsoft Graph · sequencial) ──
  if (mail.envia.length) {
    if (!emailConfigurado()) {
      resultado.email.motivo = 'canal_nao_configurado';
    } else {
      // ⚠️⚠️ GRAVA EM BLOCOS, DURANTE o envio — não no fim.
      // Incidente de 04/08: 200 e-mails saíram e o registro (que era um único
      // insert no FIM) falhou por um bug no ON CONFLICT. Ninguém ficou marcado
      // como convidado e a rodada seguinte teria reenviado pras mesmas 200
      // pessoas. Gravando durante o laço, qualquer morte no meio — timeout da
      // função, erro de rede, deploy — deixa registrado tudo o que JÁ saiu, e a
      // próxima rodada continua de onde parou em vez de duplicar.
      const BLOCO_REGISTRO = 20;
      let pendentes = [];
      const flush = async () => {
        if (!pendentes.length) return;
        const r = await registrarConvites(pendentes);
        gravados += r.gravados;
        if (r.erro) erroRegistro = r.erro;
        pendentes = [];
      };

      const comecou = Date.now();
      for (let i = 0; i < mail.envia.length; i += 1) {
        if (Date.now() - comecou > ORCAMENTO_EMAIL_MS) {
          resultado.email.adiados += mail.envia.length - i;
          resultado.email.motivo = 'orcamento_de_tempo';
          break;
        }
        const p = mail.envia[i];
        const { subject, text, html } = corpoEmail({
          nome: p.nome, link: linkDe(p.id), destinatario: String(p.email).trim(),
        });
        let ok = false;
        let erro = null;
        try {
          const r = await enviarEmail({
            to: String(p.email).trim(), subject, text, html, fromName: 'CBRio',
          });
          ok = !!(r && r.ok !== false);
          if (!ok) erro = (r && (r.error || r.motivo)) || 'falha no envio';
        } catch (e) {
          erro = e?.message || String(e);
        }
        if (ok) resultado.email.enviados += 1;
        else resultado.email.falhas += 1;
        pendentes.push({
          membro_id: p.id, canal: 'email', rodada, enviado_por: por,
          ok, erro: erro ? String(erro).slice(0, 400) : null,
        });
        if (pendentes.length >= BLOCO_REGISTRO) await flush();
      }
      await flush();
    }
  }

  resultado.registrados = gravados;
  if (erroRegistro) {
    resultado.aviso_registro = `Os convites saíram, mas o registro de quem foi convidado falhou (${erroRegistro}) — NÃO dispare a próxima rodada antes de conferir, porque ela repetiria a mensagem para as mesmas pessoas.`;
  }
  return resultado;
}

module.exports = {
  previewCenso,
  dispararCenso,
  // Puras — exportadas pro teste (decidem quem recebe e quantos saem).
  semCpf,
  primeiroNome,
  emailUtilizavel,
  canaisDaPessoa,
  limitarPorTeto,
  montarLinkCenso,
  corpoEmail,
  TETO_RODADA_WHATSAPP,
  TETO_RODADA_EMAIL,
  CONTEXTO,
};
