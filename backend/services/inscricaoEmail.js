// ============================================================================
// E-mail transacional da inscrição (espinha /inscricoes) · 2026-07-31
//
// Três momentos (decisão do Marcos, 31/07):
//   1. confirmada  — pagamento aprovado, ou inscrição gratuita/bolsa integral
//   2. pendente    — cobrança criada, com o LINK DE PAGAMENTO
//   3. expirada    — prazo de reserva venceu e a vaga voltou pra fila
//
// Por que o (2) importa: hoje quem fecha a aba PERDE o link de pagamento — o
// `public_token` só aparecia naquela URL e não havia como recuperar. O e-mail é
// o único caminho de volta.
//
// ⚠️ É TRANSACIONAL, não marketing: confirma uma compra que a pessoa acabou de
// fazer. Por isso NÃO passa pelo opt-in de WhatsApp (D4) — aquele opt-in é do
// canal WhatsApp. Não usar este serviço pra divulgação; se um dia virar
// divulgação, precisa de consentimento próprio.
//
// ⚠️ Best-effort SEMPRE. Nenhum chamador pode falhar porque o e-mail soluçou:
// o dinheiro e a vaga já foram decididos antes de chegar aqui.
// ============================================================================
const { enviarEmail, isConfigured } = require('./email');
const { supabase } = require('../utils/supabase');

// Variáveis oferecidas ao template. Serve de contrato pra tela de edição (a UI
// lê daqui, então a lista nunca divergir do que o servidor realmente troca).
const VARIAVEIS = Object.freeze({
  comuns: ['nome', 'primeiro_nome', 'codigo', 'evento', 'data', 'hora', 'local', 'link'],
  confirmada: ['valor', 'forma'],
  pendente: ['valor', 'expira_em'],
  expirada: [],
});

const TIPOS = Object.freeze(['confirmada', 'pendente', 'expirada']);

/**
 * Template do banco: do EVENTO primeiro, depois o GLOBAL. Devolve null quando
 * não há nenhum — e aí vale o layout do código.
 *
 * ⚠️ Consulta ISOLADA e fail-soft de propósito: se a migration dos templates
 * ainda não foi aplicada (deploy em 2 etapas), pedir a tabela derrubaria o
 * e-mail inteiro. Falha aqui = "sem template customizado", nunca "sem e-mail".
 * Mesma régua do `parcelas_max` e do `apelido`.
 */
async function carregarTemplate(tipo, eventoId) {
  try {
    let q = supabase.from('insc_email_templates')
      .select('tipo, evento_id, assunto, corpo_html')
      .eq('tipo', tipo).eq('ativo', true);
    q = eventoId ? q.or(`evento_id.eq.${eventoId},evento_id.is.null`) : q.is('evento_id', null);
    const { data, error } = await q;
    if (error || !data?.length) return null;
    // Específico do evento vence o global.
    return data.find((t) => t.evento_id) || data.find((t) => !t.evento_id) || null;
  } catch (e) {
    console.warn('[inscricaoEmail] template indisponível, usando padrão:', e.message);
    return null;
  }
}

/**
 * Troca {{chave}} pelos valores. O HTML do template vai CRU (é escrito por
 * gente de nível 5, e formatar é o objetivo); os VALORES são escapados, porque
 * vêm de campo preenchido pelo público (nome, local).
 */
function renderizar(texto, vars) {
  return String(texto || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (todo, chave) => {
    const v = vars[String(chave).toLowerCase()];
    return v == null || v === '' ? '' : escapar(v);
  });
}

// Kill-switch: `INSC_EMAIL_ATIVO=0` desliga sem deploy. Default LIGADO — o
// recurso foi pedido pra estar no ar.
function ativo() {
  return process.env.INSC_EMAIL_ATIVO !== '0' && process.env.INSC_EMAIL_ATIVO !== 'false';
}

// URL local/privada NUNCA sai em mensagem (lição do incidente do WhatsApp, em
// que uma líder recebeu link de localhost). O canal de e-mail não tem a guarda
// do `waSender`, então ela vive aqui. Fail-closed: sem base pública confiável, o
// e-mail vai SEM link em vez de com link quebrado.
const RE_URL_LOCAL = /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/i;

function baseUrl() {
  const bruta = process.env.FRONTEND_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!bruta) return null;
  const url = String(bruta).replace(/\/+$/, '');
  if (RE_URL_LOCAL.test(url)) {
    console.warn('[inscricaoEmail] FRONTEND_URL local ignorada — e-mail sai sem link');
    return null;
  }
  return url;
}

function escapar(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function primeiroNome(nome) {
  return String(nome || '').trim().split(/\s+/)[0] || 'Olá';
}

function formatarQuando(evento) {
  const data = String(evento?.data || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  const [a, m, d] = data.split('-');
  return evento?.hora ? `${d}/${m}/${a} às ${evento.hora}` : `${d}/${m}/${a}`;
}

function reais(centavos) {
  if (centavos == null) return null;
  return `R$ ${(Number(centavos) / 100).toFixed(2).replace('.', ',')}`;
}

const ROTULO_METODO = Object.freeze({
  pix: 'Pix', boleto: 'Boleto', cartao: 'Cartão de crédito',
  apple_pay: 'Apple Pay', dinheiro: 'Dinheiro', transferencia: 'Transferência',
});

/** Layout único · HTML simples e inline (cliente de e-mail não carrega CSS externo). */
function montarHtml({ titulo, saudacao, paragrafos = [], linhas = [], acao, rodape }) {
  const itens = linhas
    .filter((l) => l && l.valor)
    .map((l) => `<tr>
      <td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;white-space:nowrap">${escapar(l.rotulo)}</td>
      <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600">${escapar(l.valor)}</td>
    </tr>`).join('');

  const botao = acao?.url
    ? `<p style="margin:24px 0 8px"><a href="${escapar(acao.url)}"
         style="display:inline-block;background:#00B39D;color:#ffffff;text-decoration:none;
                padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px"
       >${escapar(acao.rotulo)}</a></p>
       <p style="margin:0;color:#6b7280;font-size:12px;word-break:break-all">${escapar(acao.url)}</p>`
    : '';

  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
                      max-width:560px;margin:0 auto;padding:24px;color:#111827">
    <h1 style="margin:0 0 4px;font-size:20px;color:#111827">${escapar(titulo)}</h1>
    <p style="margin:0 0 18px;color:#374151;font-size:15px">${escapar(saudacao)}</p>
    ${paragrafos.map((p) => `<p style="margin:0 0 14px;color:#374151;font-size:15px">${escapar(p)}</p>`).join('')}
    ${itens ? `<table role="presentation" style="border-collapse:collapse;margin:18px 0">${itens}</table>` : ''}
    ${botao}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:26px 0 14px">
    <p style="margin:0;color:#9ca3af;font-size:12px">${escapar(rodape || 'Comunidade Batista do Rio de Janeiro')}</p>
  </div>`;
}

function montarTexto({ titulo, saudacao, paragrafos = [], linhas = [], acao }) {
  const partes = [titulo, '', saudacao, ''];
  paragrafos.forEach((p) => { partes.push(p, ''); });
  linhas.filter((l) => l && l.valor).forEach((l) => partes.push(`${l.rotulo}: ${l.valor}`));
  if (acao?.url) partes.push('', `${acao.rotulo}: ${acao.url}`);
  partes.push('', 'Comunidade Batista do Rio de Janeiro');
  return partes.join('\n');
}

/** Guardas comuns. Devolve null quando não há nada a fazer. */
function preparar(inscricao) {
  if (!ativo()) return { pular: 'desligado' };
  if (!isConfigured()) return { pular: 'sem_canal_email' };
  const email = String(inscricao?.email || '').trim();
  if (!email || !email.includes('@')) return { pular: 'sem_email' };
  return { email };
}

/** Alternativa em texto puro quando o corpo veio de template HTML. */
function semTags(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function despachar({ to, subject, corpo, html, text }) {
  const corpoHtml = html || montarHtml(corpo);
  const r = await enviarEmail({
    to,
    subject,
    html: corpoHtml,
    text: text || (html ? semTags(html) : montarTexto(corpo)),
    fromName: 'CBRio',
  });
  if (!r.ok) console.error('[inscricaoEmail]', subject, '→', r.error);
  return r;
}

/**
 * Caminho comum: usa o template do banco quando existe, senão o layout do
 * código. `assuntoPadrao`/`corpo` são o padrão; `vars` alimenta os dois.
 */
async function despacharTipo({ tipo, eventoId, to, vars, assuntoPadrao, corpo }) {
  const tpl = await carregarTemplate(tipo, eventoId);
  if (tpl) {
    return despachar({
      to,
      subject: renderizar(tpl.assunto, vars) || assuntoPadrao,
      html: renderizar(tpl.corpo_html, vars),
    });
  }
  return despachar({ to, subject: assuntoPadrao, corpo });
}

/** Variáveis comuns a todos os tipos. */
function varsBase({ inscricao, evento, link }) {
  return {
    nome: inscricao?.nome_completo || '',
    primeiro_nome: primeiroNome(inscricao?.nome_completo),
    codigo: inscricao?.codigo || '',
    evento: evento?.nome || '',
    data: formatarQuando(evento) || '',
    hora: evento?.hora || '',
    local: evento?.local || '',
    link: link || '',
  };
}

/**
 * (1) Inscrição confirmada — pagou, ou é gratuita/bolsa integral.
 * `comprovanteToken` é opcional: sem ele o e-mail sai sem o link do comprovante.
 */
async function enviarEmailInscricaoConfirmada({ inscricao, evento, cobranca, comprovanteToken }) {
  const g = preparar(inscricao);
  if (g.pular) return { sent: false, reason: g.pular };

  const base = baseUrl();
  const link = (base && comprovanteToken) ? `${base}/i/c/${comprovanteToken}` : null;
  const quando = formatarQuando(evento);
  const pagou = cobranca?.valor_pago_centavos > 0;
  const isento = inscricao?.bolsa_tipo === 'integral' || inscricao?.valor_cobrado_centavos === 0;

  const corpo = {
    titulo: 'Inscrição confirmada',
    saudacao: `${primeiroNome(inscricao.nome_completo)}, sua inscrição está garantida.`,
    paragrafos: [
      isento && !pagou
        ? 'Sua inscrição foi liberada pela liderança — você não precisa pagar nada.'
        : 'Recebemos seu pagamento.',
      'Guarde o código abaixo: é ele que identifica sua inscrição se você precisar falar com a equipe.',
    ].filter(Boolean),
    linhas: [
      { rotulo: 'Código', valor: inscricao.codigo },
      { rotulo: 'Evento', valor: evento?.nome },
      { rotulo: 'Quando', valor: quando },
      { rotulo: 'Local', valor: evento?.local },
      { rotulo: 'Valor', valor: pagou ? reais(cobranca.valor_pago_centavos) : (isento ? 'Isenta' : null) },
      { rotulo: 'Forma', valor: pagou ? (ROTULO_METODO[cobranca?.metodo] || cobranca?.metodo) : null },
    ],
    acao: link ? { rotulo: 'Ver meu comprovante', url: link } : null,
    rodape: comprovanteToken
      ? 'Apresente o comprovante na entrada do evento. Comunidade Batista do Rio de Janeiro'
      : undefined,
  };

  return despacharTipo({
    tipo: 'confirmada',
    eventoId: evento?.id,
    to: g.email,
    vars: {
      ...varsBase({ inscricao, evento, link }),
      valor: pagou ? reais(cobranca.valor_pago_centavos) : (isento ? 'Isenta' : ''),
      forma: pagou ? (ROTULO_METODO[cobranca?.metodo] || cobranca?.metodo || '') : '',
    },
    assuntoPadrao: `Inscrição confirmada · ${evento?.nome || 'evento'} (${inscricao.codigo})`,
    corpo,
  });
}

/** (2) Cobrança criada e ainda não paga — leva o LINK de pagamento. */
async function enviarEmailInscricaoPendente({ inscricao, evento, cobranca }) {
  const g = preparar(inscricao);
  if (g.pular) return { sent: false, reason: g.pular };
  if (!cobranca?.public_token) return { sent: false, reason: 'sem_public_token' };

  const base = baseUrl();
  const link = base ? `${base}/pagamento/${cobranca.public_token}` : null;
  const expira = cobranca.expira_em
    ? new Date(cobranca.expira_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : null;

  const corpo = {
    titulo: 'Falta pagar para garantir sua vaga',
    saudacao: `${primeiroNome(inscricao.nome_completo)}, recebemos sua inscrição.`,
    paragrafos: [
      'Sua vaga está reservada, mas só fica garantida depois do pagamento.',
      expira
        ? `Se o pagamento não for feito até ${expira}, a vaga volta para a fila.`
        : 'Conclua o pagamento para confirmar.',
    ],
    linhas: [
      { rotulo: 'Código', valor: inscricao.codigo },
      { rotulo: 'Evento', valor: evento?.nome },
      { rotulo: 'Quando', valor: formatarQuando(evento) },
      { rotulo: 'Valor', valor: reais(cobranca.valor_centavos) },
    ],
    acao: link ? { rotulo: 'Pagar minha inscrição', url: link } : null,
    rodape: 'Se você já pagou, ignore este e-mail. Comunidade Batista do Rio de Janeiro',
  };

  return despacharTipo({
    tipo: 'pendente',
    eventoId: evento?.id,
    to: g.email,
    vars: {
      ...varsBase({ inscricao, evento, link }),
      valor: reais(cobranca.valor_centavos) || '',
      expira_em: expira || '',
    },
    assuntoPadrao: `Pagamento pendente · ${evento?.nome || 'evento'} (${inscricao.codigo})`,
    corpo,
  });
}

/** (3) Prazo venceu sem pagamento — a vaga voltou pra fila. */
async function enviarEmailInscricaoExpirada({ inscricao, evento }) {
  const g = preparar(inscricao);
  if (g.pular) return { sent: false, reason: g.pular };

  const base = baseUrl();
  const link = (base && evento?.slug) ? `${base}/evento/${evento.slug}` : null;
  const corpo = {
    titulo: 'Sua reserva expirou',
    saudacao: `${primeiroNome(inscricao.nome_completo)}, o prazo de pagamento da sua inscrição venceu.`,
    paragrafos: [
      'A vaga voltou para a fila, então sua inscrição não está mais valendo.',
      'Se ainda quiser participar, é possível se inscrever de novo enquanto houver vaga.',
    ],
    linhas: [
      { rotulo: 'Código', valor: inscricao.codigo },
      { rotulo: 'Evento', valor: evento?.nome },
    ],
    acao: link ? { rotulo: 'Inscrever-se de novo', url: link } : null,
    rodape: 'Se você pagou e recebeu este aviso, fale com a equipe citando seu código. Comunidade Batista do Rio de Janeiro',
  };

  return despacharTipo({
    tipo: 'expirada',
    eventoId: evento?.id,
    to: g.email,
    vars: varsBase({ inscricao, evento, link }),
    assuntoPadrao: `Reserva expirada · ${evento?.nome || 'evento'} (${inscricao.codigo})`,
    corpo,
  });
}

/**
 * Prévia pra tela de edição: renderiza o template com dados FICTÍCIOS, sem
 * enviar nada e sem tocar em inscrição real. `corpo_html`/`assunto` vêm do
 * rascunho que está na tela (nem precisa estar salvo).
 */
function previewTemplate({ tipo, assunto, corpo_html }) {
  const exemplo = {
    nome: 'Maria Aparecida de Souza',
    primeiro_nome: 'Maria',
    codigo: 'CBR-2026-000123',
    evento: 'Retiro AMI 2027',
    data: '16/02/2027 às 20:00',
    hora: '20:00',
    local: 'Sede — Rio de Janeiro',
    link: 'https://cbrio.org/i/c/exemplo',
    valor: 'R$ 900,00',
    forma: 'Pix',
    expira_em: '02/08/2026, 10:15:08',
  };
  return {
    tipo,
    assunto: renderizar(assunto, exemplo),
    html: renderizar(corpo_html, exemplo),
    variaveis_usadas: [...String(corpo_html || '').matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)]
      .map((m) => m[1].toLowerCase())
      .filter((v, i, a) => a.indexOf(v) === i),
  };
}

module.exports = {
  enviarEmailInscricaoConfirmada,
  enviarEmailInscricaoPendente,
  enviarEmailInscricaoExpirada,
  previewTemplate,
  carregarTemplate,
  renderizar,
  TIPOS,
  VARIAVEIS,
  // exportados pra teste
  baseUrl,
  formatarQuando,
  reais,
};
