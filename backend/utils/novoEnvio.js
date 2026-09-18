// "Novo envio" da Comunicação — régua PURA (F3 do redesenho · 09/09/2026).
//
// Pedido do Marcos (08/09): fundir Envios + Disparos numa aba só, com um botão
// "Novo envio" (agora · agendado · recorrência) que mostra a PRÉVIA da mensagem
// e o CUSTO ESTIMADO antes de sair. Aqui mora toda a conta: destinatários,
// prévia do corpo, custo, avisos e validação. A rota (routes/comunicacao.js)
// só lê o catálogo de templates e as tarifas e chama isto.
//
// Vive em utils/ sem Supabase para entrar no gate de deploy.

/** O mesmo teto do validarAgendamento: acima disso, "divida o disparo". */
const TETO_DESTINATARIOS = 500;
/** TIER_250 da Meta (250 destinatários únicos/24h) com folga pros avisos
 *  operacionais que dividem a cota — acima disto o resto sai no dia seguinte. */
const AVISO_TIER = 200;
const RECORRENCIAS = ['diaria', 'semanal', 'mensal'];
const MODOS = ['agora', 'agendado', 'recorrente'];

/**
 * Telefone como a fila espera: só dígitos, DDD + número (10 ou 11 dígitos).
 * ⚠️ O `55` do país só é removido quando o RESTO ainda é telefone completo —
 * DDD 55 é Santa Maria/RS, e `replace(/^55/,'')` destruiria todo número de lá
 * (a MESMA armadilha do tirarCodigoPaisTelefone). Fora disso: null.
 */
function normalizarTelefone(v) {
  let d = String(v ?? '').replace(/\D+/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? d : null;
}

/**
 * Destinatários colados (um por linha, vírgula ou ponto e vírgula) ou array.
 * Devolve os VÁLIDOS únicos (na ordem de chegada), os INVÁLIDOS como vieram
 * (para a tela apontar) e quantos repetidos foram descartados — nunca em
 * silêncio, senão "colei 50 e saíram 47" vira mistério.
 */
function normalizarDestinatarios(entrada) {
  const brutos = Array.isArray(entrada)
    ? entrada.map(x => String(x ?? ''))
    : String(entrada ?? '').split(/[\n,;]+/);
  const validos = [];
  const vistos = new Set();
  const invalidos = [];
  const invalidosVistos = new Set();
  let duplicados = 0;
  for (const bruto of brutos) {
    const cru = bruto.trim();
    if (!cru) continue;
    const tel = normalizarTelefone(cru);
    if (!tel) { if (!invalidosVistos.has(cru)) { invalidosVistos.add(cru); invalidos.push(cru); } continue; }
    if (vistos.has(tel)) { duplicados += 1; continue; }
    vistos.add(tel);
    validos.push(tel);
  }
  return { validos, invalidos, duplicados };
}

const RE_PARAM = /\{\{\s*(\d+)\s*\}\}/g;

/**
 * Corpo do template com os {{n}} preenchidos. Parâmetro sem valor FICA
 * ESCRITO ({{2}}) e entra em `faltando` — mandar "Olá , tudo bem?" em nome da
 * igreja é pior que pedir pra completar (a mesma lei das variáveis do inbox).
 */
function renderizarCorpo(corpo, params = []) {
  const p = Array.isArray(params) ? params : [];
  const faltando = new Set();
  const texto = String(corpo ?? '').replace(RE_PARAM, (m, n) => {
    const i = Number(n) - 1;
    const v = p[i];
    if (v === undefined || v === null || String(v).trim() === '') { faltando.add(Number(n)); return m; }
    return String(v);
  });
  return { texto, faltando: [...faltando].sort((a, b) => a - b) };
}

/** Quantidade de {{n}} que o template exige × o que veio. `paramsBody` nulo = não sabemos (espelho sem o número). */
function conferirParams(paramsBody, params = []) {
  const recebido = (Array.isArray(params) ? params : []).filter(v => v !== undefined && v !== null && String(v).trim() !== '').length;
  if (paramsBody === null || paramsBody === undefined || !Number.isFinite(Number(paramsBody))) {
    return { ok: true, esperado: null, recebido, conhecido: false };
  }
  const esperado = Number(paramsBody);
  return { ok: recebido === esperado, esperado, recebido, conhecido: true, faltando: Math.max(0, esperado - recebido), sobrando: Math.max(0, recebido - esperado) };
}

/**
 * Custo ESTIMADO = quantidade × tarifa da categoria do template (a Meta cobra
 * por conversa iniciada). Texto livre é `service` (janela de 24h · grátis).
 * Categoria sem tarifa conhecida devolve `null`, NUNCA 0 — "R$ 0,00" se lê
 * como "de graça", e a fatura vem depois.
 */
function custoEstimado({ quantidade = 0, tipo = 'template', categoria = null, tarifas = {} } = {}) {
  const n = Math.max(0, Number(quantidade) || 0);
  const t = tarifas || {};
  if (tipo === 'texto') {
    const tarifa = Number.isFinite(Number(t.service)) ? Number(t.service) : 0;
    return { categoria: 'service', tarifa, total: Math.round(n * tarifa * 100) / 100 };
  }
  const cat = categoria ? String(categoria).toLowerCase() : null;
  const tarifaCrua = cat ? t[cat] : undefined;
  if (tarifaCrua === undefined || tarifaCrua === null || !Number.isFinite(Number(tarifaCrua))) {
    return { categoria: cat, tarifa: null, total: null };
  }
  const tarifa = Number(tarifaCrua);
  return { categoria: cat, tarifa, total: Math.round(n * tarifa * 100) / 100 };
}

/** Avisos (códigos) que a tela traduz. Não bloqueiam; declaram. */
function avisos({ quantidade = 0, tipo = 'template', categoria = null, statusMeta = null, templateEncontrado = true } = {}) {
  const out = [];
  if (Number(quantidade) > AVISO_TIER) out.push('acima_do_tier');
  if (tipo === 'texto') out.push('texto_livre_janela_24h');
  if (tipo === 'template') {
    if (!templateEncontrado) out.push('template_desconhecido');
    else if (!statusMeta) out.push('template_sem_status');
    else if (String(statusMeta).toUpperCase() !== 'APPROVED') out.push('template_nao_aprovado');
    if (categoria && String(categoria).toLowerCase() === 'marketing') out.push('marketing_exige_optin');
    if (templateEncontrado && !categoria) out.push('tarifa_desconhecida');
  }
  return out;
}

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Valida o envio inteiro. Devolve códigos (a tela e a rota traduzem por
 * `textoErro`). `destinatarios` é a lista JÁ normalizada (validos).
 */
function validarNovoEnvio({
  modo, nome, destinatarios = [], template_nome, texto, params = [], params_body = null, templateEncontrado = true,
  quando = null, recorrencia = null, dia_semana = null, dia_mes = null, hora = null, agoraMs = Date.now(),
} = {}) {
  const erros = [];
  if (!MODOS.includes(modo)) erros.push('modo_invalido');
  const n = Array.isArray(destinatarios) ? destinatarios.length : 0;
  if (n === 0) erros.push('sem_destinatarios');
  else if (n > TETO_DESTINATARIOS) erros.push('acima_do_teto');
  const temTemplate = !!String(template_nome || '').trim();
  const temTexto = !!String(texto || '').trim();
  if (!temTemplate && !temTexto) erros.push('conteudo_ausente');
  if (temTemplate && temTexto) erros.push('conteudo_ambiguo');
  if (temTemplate && !templateEncontrado) erros.push('template_desconhecido');
  if (temTemplate && templateEncontrado) {
    const c = conferirParams(params_body, params);
    if (!c.ok) erros.push(c.faltando > 0 ? 'params_incompletos' : 'params_sobrando');
  }
  if (modo !== 'agora' && !String(nome || '').trim()) erros.push('nome_obrigatorio');
  if (modo === 'agendado') {
    const t = quando ? new Date(quando).getTime() : NaN;
    if (!Number.isFinite(t)) erros.push('quando_invalido');
    else if (t <= agoraMs) erros.push('quando_no_passado');
  }
  if (modo === 'recorrente') {
    if (!RECORRENCIAS.includes(recorrencia)) erros.push('recorrencia_invalida');
    if (!RE_HORA.test(String(hora || ''))) erros.push('hora_invalida');
    if (recorrencia === 'semanal' && !(Number.isInteger(Number(dia_semana)) && dia_semana !== null && dia_semana !== '' && Number(dia_semana) >= 0 && Number(dia_semana) <= 6)) erros.push('dia_semana_invalido');
    if (recorrencia === 'mensal' && !(Number.isInteger(Number(dia_mes)) && dia_mes !== null && dia_mes !== '' && Number(dia_mes) >= 1 && Number(dia_mes) <= 31)) erros.push('dia_mes_invalido');
  }
  return { ok: erros.length === 0, erros };
}

const TEXTOS = {
  modo_invalido: 'Escolha entre enviar agora, agendar ou repetir.',
  sem_destinatarios: 'Informe ao menos um telefone válido (DDD + número).',
  acima_do_teto: `Acima de ${TETO_DESTINATARIOS} telefones — divida o envio.`,
  conteudo_ausente: 'Escolha um template ou escreva o texto.',
  conteudo_ambiguo: 'Template e texto ao mesmo tempo não dá — escolha um.',
  template_desconhecido: 'Este template não está no catálogo sincronizado da Meta.',
  params_incompletos: 'Faltam parâmetros do template — preencha todos os {{n}}.',
  params_sobrando: 'Parâmetros a mais para este template — a Meta recusa a mensagem.',
  nome_obrigatorio: 'Dê um nome ao agendamento.',
  quando_invalido: 'Informe a data e a hora do envio.',
  quando_no_passado: 'A data do envio já passou.',
  recorrencia_invalida: 'Escolha diária, semanal ou mensal.',
  hora_invalida: 'Informe a hora no formato HH:MM.',
  dia_semana_invalido: 'Escolha o dia da semana.',
  dia_mes_invalido: 'Informe um dia do mês entre 1 e 31.',
};
const TEXTOS_AVISO = {
  acima_do_tier: `Acima de ${AVISO_TIER} pessoas: a Meta limita a conta a 250 destinatários novos por 24h — o que passar sai no dia seguinte (a fila insiste por 36h e depois desiste).`,
  texto_livre_janela_24h: 'Texto livre só chega a quem escreveu para a igreja nas últimas 24h. Para o resto, use um template aprovado.',
  template_desconhecido: 'Template fora do catálogo sincronizado — a Meta pode recusar. Sincronize em Configurações → Templates.',
  template_sem_status: 'O espelho não tem o status deste template na Meta — sincronize antes de enviar.',
  template_nao_aprovado: 'Este template não está APROVADO na Meta — a fila vai recusar.',
  marketing_exige_optin: 'Template de MARKETING: a Meta exige opt-in. Confira que essas pessoas aceitaram receber mensagens da igreja.',
  tarifa_desconhecida: 'Template sem categoria — o custo não pode ser estimado. Classifique em Configurações → Templates.',
};
function textoErro(codigo) { return TEXTOS[codigo] || String(codigo); }
function textoAviso(codigo) { return TEXTOS_AVISO[codigo] || String(codigo); }

/** Nome do envio manual quando ninguém deu um: "Envio manual · 09/09 10:32 · <template>". Dia/hora em BRT, determinístico. */
function nomePadrao({ agoraMs = Date.now(), tipo = 'template', template = null } = {}) {
  const d = new Date(agoraMs - 3 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  const quando = `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  const oque = tipo === 'texto' ? 'texto' : String(template || 'template');
  return `Envio manual · ${quando} · ${oque}`;
}

module.exports = {
  TETO_DESTINATARIOS, AVISO_TIER, RECORRENCIAS, MODOS,
  normalizarTelefone, normalizarDestinatarios, renderizarCorpo, conferirParams,
  custoEstimado, avisos, validarNovoEnvio, textoErro, textoAviso, nomePadrao,
};
