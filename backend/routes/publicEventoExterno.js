// ============================================================================
// Rotas públicas · /evento/:slug — FONTE DUPLA (F3.2 · PR 3 · SPEC-04):
// resolve PRIMEIRO na ESPINHA (insc_eventos/inscricoes — eventos novos do
// módulo /inscricoes) e cai no LEGADO (ext_eventos/ext_inscricoes) quando o
// slug não existe lá. QRs antigos do Celebra continuam funcionando sem
// mudança de link; eventos novos usam o mesmo endereço público.
//
// GET  /api/public/evento/textos          - textos canônicos de consentimento
// GET  /api/public/evento/:slug           - dados do evento (espinha → ext)
// POST /api/public/evento/:slug/inscrever - inscreve (contrato pleno)
// POST /api/public/evento/:slug/upload-imagem
//
// Ambas as fontes cumprem o Contrato de Inscrição (docs/modulo-inscricoes/).
// Montado ANTES do publicLimiter global (evento presencial em massa = 1 IP).
// ============================================================================
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const {
  validarCamposPadrao, processarIdentidade, registrarConsentimentos,
  honeypotPreenchido, TEXTOS,
} = require('../services/inscricaoContrato');
const { nomesMesmaPessoa } = require('../services/membroMatch');
const {
  emitirTokenComprovante,
  verificarTokenComprovanteAtivo,
} = require('../services/inscricaoComprovante');
const { enviarConfirmacaoInscricao } = require('../services/inscricaoWhatsapp');
const {
  enviarEmailInscricaoPendente,
  enviarEmailInscricaoConfirmada,
} = require('../services/inscricaoEmail');
// Fachada do núcleo de pagamentos. ⚠️ NUNCA importar `providers/*` aqui — é o
// que faz trocar de PSP custar 1 arquivo + 1 env (ver services/pagamentos/tipos.js).
const pagamentos = require('../services/pagamentos');
// Régua ÚNICA da tela pública de pagamento (compartilhada com a doação). É onde
// vivem as leis do parcelado e da forma que o provedor CONFIRMOU — uma segunda
// cópia dessa lógica seria a garantia de que uma das duas telas ia divergir.
const {
  estadoBasePagamento, escolherFormaPagamento, sincronizarSeParada,
} = require('../services/pagamentos/telaPublica');

// Limiter próprio generoso (mesma lógica do publicGrupos/publicNps): o evento
// inteiro sai por 1 IP de Wi-Fi — sem teto prático de inscrições (D9).
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.EVENTO_PUBLIC_RATE_LIMIT_MAX) || (process.env.NODE_ENV === 'production' ? 1000 : 5000),
  message: { error: 'Muitas requisições. Aguarde alguns minutos.' },
  skip: () => process.env.NODE_ENV !== 'production',
  standardHeaders: true,
  legacyHeaders: false,
});
router.use(limiter);

// Upload de imagem enviada NO formulário público (ex.: logo da empresa parceira).
// Só imagens, 5MB, memória → bucket público `evento-capas` (o mesmo da capa).
const MIME_IMG = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
const uploadImg = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, MIME_IMG.includes(file.mimetype)),
});

// Comprovante de Pix/transferência (bucket PRIVADO). PDF entra além de imagem:
// o app do banco costuma exportar comprovante como PDF, e recusá-lo empurraria
// a pessoa pra tirar print do PDF — pior de ler pra quem confere.
const MIME_COMPROVANTE = [...MIME_IMG, 'application/pdf'];
const uploadComprovante = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, MIME_COMPROVANTE.includes(file.mimetype)),
});
const EXT_COMPROVANTE = {
  'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg',
  'image/jpg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
};

// ── Fonte 1 · ESPINHA ──────────────────────────────────────────────────────
// Rascunho/arquivado NÃO existem pro público (404); publicado/encerrado
// aparecem (encerrado mostra "inscrições encerradas" em vez de sumir o link).
async function eventoEspinhaPorSlug(slug) {
  const { data } = await supabase.from('insc_eventos')
    .select('id, nome, slug, area, data, hora, local, descricao, campos, capa_url, vagas, inscricoes_abrem_em, inscricoes_encerram_em, msg_sucesso_titulo, msg_sucesso_texto, tem_sorteio, pagamento_ativo, valor_centavos, pagamento_metodos, pagamento_expira_horas, parcelas_max, juros_repassados, status')
    .eq('slug', slug).is('deleted_at', null).maybeSingle();
  if (!data || data.status === 'rascunho' || data.status === 'arquivado') return null;
  return data;
}

// Ocupação pela MESMA régua da fn_insc_inscrever (só `cancelada` devolve vaga).
// Usada pra EXIBIR e pra decidir o 403 antecipado; a decisão que vale é a de
// dentro do lock, na RPC. NUNCA derruba a página: falha aqui degrada pra
// "sem contagem" (null) — o formulário do evento AO VIVO não pode dar 500
// porque a RPC de vagas soluçou.
async function ocupacaoEspinha(eventoId) {
  try {
    const { data, error } = await supabase.rpc('fn_insc_vagas', { p_evento_id: eventoId });
    if (error) throw error;
    return data || { vagas: null, ocupadas: 0, restantes: null };
  } catch (e) {
    console.error('[publicEvento espinha] fn_insc_vagas indisponível:', e.message);
    return null;
  }
}

async function espinhaEncerrada(ev) {
  if (ev.status !== 'publicado') return true;
  const agora = Date.now();
  if (ev.inscricoes_abrem_em && agora < new Date(ev.inscricoes_abrem_em).getTime()) return true;
  if (ev.inscricoes_encerram_em && agora > new Date(ev.inscricoes_encerram_em).getTime()) return true;
  if (ev.vagas != null) {
    const ocup = await ocupacaoEspinha(ev.id);
    // fail-open na LEITURA: sem contagem, não fecha o form — quem decide de
    // verdade é o lock da fn_insc_inscrever no POST.
    if (ocup && ocup.restantes != null && ocup.restantes <= 0) return true;
  }
  return false;
}

// ── Fonte 2 · LEGADO (ext_*) ───────────────────────────────────────────────
async function eventoPorSlug(slug) {
  const { data } = await supabase.from('ext_eventos')
    .select('id, nome, slug, data, hora, local, descricao, form_ativo, tem_sorteio, campos, capa_url, inscricoes_encerram_em, msg_sucesso_titulo, msg_sucesso_texto')
    .eq('slug', slug).is('deleted_at', null).maybeSingle();
  return data || null;
}

function inscricoesEncerradas(ev) {
  if (!ev.form_ativo) return true;
  if (ev.inscricoes_encerram_em && Date.now() > new Date(ev.inscricoes_encerram_em).getTime()) return true;
  return false;
}

// Merge preservador (re-inscrição): resposta existente NUNCA é sobrescrita
// com vazio; valor novo não-vazio atualiza.
function mesclarDados(atuais, novas) {
  const out = { ...(atuais || {}) };
  for (const [k, v] of Object.entries(novas || {})) {
    if (String(v ?? '').trim() !== '') out[k] = v;
  }
  return out;
}

function validarExtras(evCampos, dadosBody) {
  const campos = Array.isArray(evCampos) ? evCampos : [];
  const respostas = {};
  for (const c of campos) {
    const v = dadosBody && c.key ? dadosBody[c.key] : undefined;
    const preenchido = v !== undefined && v !== null && String(v).trim() !== '';
    if (c.obrigatorio && !preenchido) return { erro: `Preencha: ${c.label}` };
    if (preenchido) respostas[c.key] = String(v).slice(0, 500);
  }
  return { respostas, temCampoImagem: campos.some((c) => c.tipo === 'imagem') };
}

function gerarSorteio() { return Math.floor(Math.random() * 9000) + 1000; } // 1000-9999

// ── Pagamento (F3.3) ───────────────────────────────────────────────────────

/** Métodos que o evento quer × o que o provider sabe cobrar. */
function metodosDoEvento(ev) {
  const desejados = Array.isArray(ev.pagamento_metodos) && ev.pagamento_metodos.length
    ? ev.pagamento_metodos : null;
  try {
    return pagamentos.metodosDisponiveis(desejados);
  } catch {
    return desejados || [];
  }
}

/**
 * Evento pago só ABRE quando dá pra cobrar de verdade. Três formas de estar
 * mal configurado, e nenhuma pode virar inscrição gratuita por acidente:
 * marcado como pago sem valor, PSP não configurado, ou pagamentos desligados
 * pelo kill switch.
 */
function bloqueioPagamento(ev) {
  if (!ev.pagamento_ativo) return null;
  if (!(Number(ev.valor_centavos) > 0)) {
    return 'Este evento está marcado como pago mas ainda não tem valor definido. A equipe já foi avisada.';
  }
  if (!pagamentos.habilitado()) {
    return 'O pagamento online está temporariamente indisponível. Tente novamente em alguns minutos.';
  }
  if (!pagamentos.pspConfigurado()) {
    return 'O pagamento online deste evento ainda está sendo preparado. Volte em breve.';
  }
  return null;
}

function avisoPagamento(ev) {
  return bloqueioPagamento(ev);
}

/** Referência idempotente da cobrança: reenvio do form devolve a MESMA. */
const refCobranca = (inscricaoId) => `inscricao:${inscricaoId}`;

/**
 * Benefício (gratuidade/desconto) pré-autorizado pra este CPF neste evento.
 *
 * Só devolve o que ainda NÃO foi usado: a autorização vale uma vez, senão o
 * mesmo CPF renderia gratuidade em cada re-inscrição.
 *
 * Best-effort de propósito — a tabela é nova (migration 20260730210000) e a
 * porta pública não pode parar de inscrever por causa dela. Sem benefício a
 * pessoa paga o valor de tabela: é o comportamento que já existia.
 */
async function beneficioPorCpf(eventoId, cpf) {
  if (!cpf) return null;
  try {
    const { data, error } = await supabase.from('insc_beneficios')
      .select('id, tipo, valor_centavos, motivo, nome_referencia')
      .eq('evento_id', eventoId).eq('cpf', cpf)
      .is('deleted_at', null).is('usado_em', null)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (e) {
    console.error('[publicEvento] benefício por CPF indisponível:', e.message);
    return null;
  }
}

/**
 * Grava o benefício NA INSCRIÇÃO (as mesmas colunas do botão "Dar bolsa") e
 * marca a autorização como usada.
 *
 * Awaited, não fire-and-forget: sem estas colunas a pessoa isenta apareceria
 * como "aguardando pagamento" na lista, e o desconto ficaria invisível pra quem
 * confere o arrecadado. Falha aqui é logada e NÃO desfaz a inscrição — a vaga
 * já é dela, e o conserto é o botão "Dar bolsa" na ficha.
 */
async function aplicarBeneficio(beneficio, inscricaoId) {
  if (!beneficio) return;
  const integral = beneficio.tipo === 'integral';
  try {
    const { error } = await supabase.from('inscricoes').update({
      valor_cobrado_centavos: integral ? 0 : Number(beneficio.valor_centavos),
      bolsa_tipo: beneficio.tipo,
      bolsa_motivo: beneficio.motivo,
      bolsa_por_nome: beneficio.nome_referencia
        ? `benefício pré-cadastrado (${beneficio.nome_referencia})`
        : 'benefício pré-cadastrado por CPF',
      bolsa_em: new Date().toISOString(),
    }).eq('id', inscricaoId);
    if (error) throw error;
  } catch (e) {
    console.error('[publicEvento] aplicar benefício na inscrição:', e.message);
    return;
  }
  // `usado_em` só depois de a inscrição carregar o benefício: marcar antes e
  // falhar no update acima queimaria a autorização sem entregar o desconto.
  const { error: eUso } = await supabase.from('insc_beneficios')
    .update({ usado_em: new Date().toISOString(), inscricao_id: inscricaoId })
    .eq('id', beneficio.id);
  if (eUso) console.error('[publicEvento] marcar benefício usado:', eUso.message);
}

/**
 * Cria (ou recupera) a cobrança da inscrição e espelha em `insc_pagamentos`,
 * que é a linha que a UI de inscrições lê. O estado canônico vive no motor.
 */
async function cobrarInscricao({ ev, inscricaoId, val, membroId, valorCentavos }) {
  const horas = Number(ev.pagamento_expira_horas) > 0 ? Number(ev.pagamento_expira_horas) : 48;
  const { cobranca } = await pagamentos.criarCobranca({
    origem_tipo: pagamentos.ORIGENS.INSCRICAO,
    origem_id: inscricaoId,
    referencia: refCobranca(inscricaoId),
    // Benefício por CPF (desconto autorizado antes da inscrição) cobra MENOS
    // que o valor de tabela do evento. Sem esse override a pessoa com desconto
    // receberia a cobrança cheia e o desconto seria só enfeite na tela.
    valor_centavos: Number(valorCentavos) > 0 ? Number(valorCentavos) : Number(ev.valor_centavos),
    descricao: `Inscrição · ${ev.nome}`,
    metodos_ofertados: metodosDoEvento(ev),
    // NULL = vale o teto configurado na conta do PSP. Quem define o teto por
    // evento é a data em que a igreja paga o local.
    parcelas_max: ev.parcelas_max || null,
    juros_repassados: ev.juros_repassados !== false,
    expira_em: new Date(Date.now() + horas * 3600000).toISOString(),
    pagador_nome: val.nomeCompleto,
    pagador_cpf: val.cpf,
    pagador_email: val.email,
    pagador_telefone: val.telefone,
    membro_id: membroId || null,
    metadata: { evento_id: ev.id, evento_slug: ev.slug, evento_nome: ev.nome },
  });

  // Espelho pro painel. Best-effort e idempotente pela UNIQUE de cobranca_id —
  // reenvio do formulário não cria segunda linha.
  const { error } = await supabase.from('insc_pagamentos').insert({
    inscricao_id: inscricaoId,
    cobranca_id: cobranca.id,
    // NULL = ainda não escolheu. Chutar 'pix' aqui era o que fazia a lista
    // mostrar Pix pra todo mundo (a pessoa escolhe depois, na tela de pagamento).
    metodo: cobranca.metodo || null,
    provider: 'psp',
    provider_ref: cobranca.provider_cobranca_id || null,
    valor_centavos: cobranca.valor_centavos,
    status: 'aguardando',
    qr_payload: cobranca.pix_payload || null,
    expira_em: cobranca.expira_em || null,
  });
  if (error && error.code !== '23505') {
    console.error('[publicEvento espinha] espelho insc_pagamentos:', error.message);
  }

  // E-mail com o LINK DE PAGAMENTO (decisão do Marcos · 31/07). Sem ele, quem
  // fecha a aba perde o `public_token` e não tem NENHUM caminho de volta pra
  // pagar. Fire-and-forget: a cobrança e a vaga já foram decididas acima, e o
  // fluxo não pode falhar porque o e-mail soluçou.
  emailPendenteBestEffort({ ev, inscricaoId, val, cobranca });

  return cobranca;
}

/**
 * Busca só o `codigo` (gerado pelo trigger no INSERT) e manda o e-mail de
 * pendente. Tudo engolido: nenhum erro daqui pode subir pro chamador.
 */
function emailPendenteBestEffort({ ev, inscricaoId, val, cobranca }) {
  (async () => {
    const { data } = await supabase.from('inscricoes')
      .select('codigo, nome_completo, email').eq('id', inscricaoId).maybeSingle();
    await enviarEmailInscricaoPendente({
      inscricao: {
        codigo: data?.codigo || null,
        nome_completo: data?.nome_completo || val?.nomeCompleto,
        email: data?.email || val?.email,
      },
      evento: ev,
      cobranca,
    });
  })().catch((e) => console.error('[publicEvento espinha] e-mail pendente:', e.message));
}

/**
 * E-mail de confirmação do caminho SEM cobrança (gratuito e isento por bolsa
 * integral) — nesses casos a inscrição nasce `confirmada` aqui mesmo. Em evento
 * pago, quem manda é o handler do pagamento. Best-effort.
 */
function emailConfirmadaBestEffort({ ev, inscricaoId, val, comprovanteToken }) {
  (async () => {
    const { data } = await supabase.from('inscricoes')
      .select('codigo, nome_completo, email, bolsa_tipo, valor_cobrado_centavos')
      .eq('id', inscricaoId).maybeSingle();
    await enviarEmailInscricaoConfirmada({
      inscricao: {
        codigo: data?.codigo || null,
        nome_completo: data?.nome_completo || val?.nomeCompleto,
        email: data?.email || val?.email,
        bolsa_tipo: data?.bolsa_tipo || null,
        valor_cobrado_centavos: data?.valor_cobrado_centavos ?? null,
      },
      evento: ev,
      cobranca: null,
      comprovanteToken,
    });
  })().catch((e) => console.error('[publicEvento espinha] e-mail confirmada:', e.message));
}

/** Resposta padrão do fluxo pago (o front redireciona pro checkout). */
function respostaCobranca(cobranca, ev) {
  return {
    ok: true,
    pagamento: true,
    status: cobranca.status,
    public_token: cobranca.public_token,
    checkout_url: cobranca.checkout_url || null,
    valor_centavos: cobranca.valor_centavos,
    expira_em: cobranca.expira_em || null,
    tem_sorteio: ev.tem_sorteio,
  };
}

// GET /textos — textos canônicos de consentimento (o front EXIBE estes; o
// snapshot gravado vem sempre do backend, então tela e registro nunca divergem)
router.get('/textos', (_req, res) => {
  res.json({
    termos_lgpd: TEXTOS.termos_lgpd,
    imagem: TEXTOS.imagem,
    aviso_optin: TEXTOS.aviso_optin,
  });
});

// GET /pagamento/:token — status da cobrança pela página pública de pagamento.
//
// Montado NESTE router de propósito (fica `/api/public/evento/pagamento/:token`):
// herda o limiter generoso daqui E o `skip()` do limiter global em server.js.
// A tela faz polling — sob `/api/public` puro tomaria 429 no lançamento.
// Declarado ANTES de `/:slug` só por clareza; `/:slug` casa 1 segmento e não
// pegaria estas duas partes de qualquer forma.
//
// ⚠️ Acessado pelo `public_token`, NUNCA pelo uuid da cobrança (uuid vaza em
// log/referer e é chave interna em outros lugares).
// Só o necessário pra tela. Nada de PII do pagador, metadata ou payload — a
// resposta é pública (o token é o único segredo). Extraído porque o GET de
// status e o POST da escolha de forma devolvem exatamente a mesma coisa: a tela
// não deve ter dois entendimentos do que é o estado do pagamento.
// Formas em que o dinheiro pode chegar SEM o PSP perceber (Pix pago na chave da
// igreja, TED). Cartão e boleto não entram: ali o PSP é o único caminho e ele
// confirma sozinho — pedir comprovante criaria trabalho humano inútil.
const METODOS_COM_COMPROVANTE = ['pix', 'transferencia'];

// Comprovantes que a PESSOA anexou nesta inscrição. Best-effort: se a tabela
// ainda não existe (deploy em duas etapas), a tela de pagamento continua
// funcionando sem o bloco de anexo em vez de dar 500.
async function comprovantesDaInscricao(inscricaoId) {
  if (!inscricaoId) return [];
  try {
    const { data, error } = await supabase.from('insc_comprovantes')
      .select('id, status, metodo_declarado, arquivo_nome, created_at, motivo_recusa, revisado_em')
      .eq('inscricao_id', inscricaoId).is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) return [];
    return data || [];
  } catch { return []; }
}

/** Código legível da inscrição. Consulta isolada e fail-soft (a coluna é nova). */
async function codigoDaInscricao(inscricaoId) {
  if (!inscricaoId) return null;
  try {
    const { data, error } = await supabase.from('inscricoes')
      .select('codigo').eq('id', inscricaoId).maybeSingle();
    if (error) return null;
    return data?.codigo || null;
  } catch { return null; }
}

async function respostaPagamento(cobranca) {
  const daInscricao = cobranca.origem_tipo === 'inscricao' ? cobranca.origem_id : null;
  const comprovanteToken = (cobranca.status === 'pago' && daInscricao)
    ? await emitirTokenComprovante(daInscricao, 'pagamento') : null;
  const comprovantes = daInscricao ? await comprovantesDaInscricao(daInscricao) : [];
  const ofertados = Array.isArray(cobranca.metodos_ofertados) ? cobranca.metodos_ofertados : [];
  return {
    // Campos comuns a TODA tela pública de pagamento (status, valor, forma,
    // formas ofertadas, artefatos, prazos) vêm da régua única em
    // `services/pagamentos/telaPublica.js` — a doação usa a MESMA. Só o que é
    // específico de INSCRIÇÃO fica aqui embaixo.
    ...estadoBasePagamento(cobranca),
    evento_nome: cobranca.metadata?.evento_nome || null,
    evento_slug: cobranca.metadata?.evento_slug || null,
    // Código legível da inscrição (CBR-AAAA-NNNNNN) — é o que a pessoa cita
    // quando fala com a equipe. NÃO é credencial: quem acessa esta página já
    // chegou pelo public_token.
    codigo: await codigoDaInscricao(daInscricao),
    // Comprovante do check-in (SPEC-06): quem pagou recebe o QR da entrada
    // AQUI — a tela de sucesso do formulário já ficou pra trás quando a
    // pessoa foi pro checkout, e esta é a página que ela reabre.
    comprovante_token: comprovanteToken,

    // ── Comprovante de Pix/transferência (fila humana) ──
    // Só faz sentido oferecer enquanto NÃO está pago e em forma que pode ter
    // sido paga fora do PSP. Já pago = não há o que conferir.
    // ⚠️ `comprovantes` NÃO carrega `storage_path`: o bucket é privado e o path
    // não é segredo — quem vê o arquivo é a equipe, por signed URL.
    aceita_comprovante: cobranca.status !== 'pago' && (
      cobranca.metodo
        ? METODOS_COM_COMPROVANTE.includes(cobranca.metodo)
        : (ofertados.length === 0 || ofertados.some(m => METODOS_COM_COMPROVANTE.includes(m)))
    ),
    comprovantes: comprovantes.map(c => ({
      id: c.id, status: c.status, metodo_declarado: c.metodo_declarado,
      arquivo_nome: c.arquivo_nome || null, enviado_em: c.created_at,
      motivo_recusa: c.motivo_recusa || null,
    })),
  };
}

/**
 * POST /pagamento/:token/comprovante — a pessoa anexa o comprovante do Pix/TED.
 *
 * ⚠️ NÃO marca pagamento, em nenhuma circunstância. Cria uma linha
 * `em_analise` e avisa a equipe. Quem baixa o pagamento é uma pessoa, na tela
 * do evento, com autoria registrada. Aceitar imagem como prova automática é
 * como se aprova comprovante falso — e o dinheiro não aparece na conciliação.
 */
router.post('/pagamento/:token/comprovante', uploadComprovante.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Envie uma imagem (JPG/PNG/WEBP) ou PDF de até 10 MB.' });
    }
    const cobranca = await pagamentos.consultarPorToken(req.params.token);
    if (!cobranca) return res.status(404).json({ error: 'Cobrança não encontrada' });
    if (cobranca.origem_tipo !== 'inscricao' || !cobranca.origem_id) {
      return res.status(400).json({ error: 'Este pagamento não aceita comprovante.' });
    }
    // Já pago não tem o que conferir — e aceitar aqui geraria fila humana pra
    // decidir sobre dinheiro que já entrou.
    if (cobranca.status === 'pago') {
      return res.status(409).json({ error: 'Este pagamento já está confirmado.', pagamento: await respostaPagamento(cobranca) });
    }

    const inscricaoId = cobranca.origem_id;
    const metodo = METODOS_COM_COMPROVANTE.includes(String(req.body?.metodo_declarado || '').trim())
      ? String(req.body.metodo_declarado).trim()
      : (METODOS_COM_COMPROVANTE.includes(cobranca.metodo) ? cobranca.metodo : 'pix');

    // Teto por inscrição: reenviar depois de recusa é o fluxo NORMAL, mas sem
    // limite o endpoint público vira depósito de arquivo.
    const jaEnviados = await comprovantesDaInscricao(inscricaoId);
    if (jaEnviados.length >= 8) {
      return res.status(429).json({ error: 'Muitos comprovantes enviados. Fale com a equipe pelo WhatsApp.' });
    }

    const ext = EXT_COMPROVANTE[req.file.mimetype] || 'bin';
    const path = `${inscricaoId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const up = await supabase.storage.from('inscricao-comprovantes')
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    if (up.error) throw new Error(up.error.message);

    const { data: linha, error } = await supabase.from('insc_comprovantes').insert({
      inscricao_id: inscricaoId,
      cobranca_id: cobranca.id,
      metodo_declarado: metodo,
      storage_path: path,
      arquivo_nome: (req.file.originalname || '').slice(0, 200) || null,
      arquivo_tipo: req.file.mimetype,
      arquivo_bytes: req.file.size,
      observacao: req.body?.observacao ? String(req.body.observacao).slice(0, 500) : null,
    }).select('id').single();
    if (error) {
      // Arquivo órfão no bucket privado é lixo barato; linha sem arquivo seria
      // uma fila apontando pra nada.
      await supabase.storage.from('inscricao-comprovantes').remove([path]).catch(() => {});
      throw new Error(error.message);
    }

    const { data: insc } = await supabase.from('inscricoes')
      .select('nome_completo').eq('id', inscricaoId).maybeSingle();

    notificar({
      modulo: 'inscricoes',
      tipo: 'comprovante_pagamento',
      titulo: 'Comprovante de pagamento pra conferir',
      // Diz explicitamente que NÃO foi baixado: quem lê a notificação não pode
      // concluir que a pessoa já está paga na lista.
      mensagem: `${insc?.nome_completo || 'Um inscrito'} anexou comprovante de ${metodo === 'pix' ? 'Pix' : 'transferência'}${cobranca.metadata?.evento_nome ? ` · ${cobranca.metadata.evento_nome}` : ''}. O pagamento NÃO foi baixado — confira e confirme na tela do evento.`,
      link: cobranca.metadata?.evento_id ? `/inscricoes/evento/${cobranca.metadata.evento_id}` : '/inscricoes',
      chaveDedup: `insc_comprovante_${linha.id}`,
    }).catch((err) => console.error('[publicEvento] notificar comprovante:', err.message));

    res.json({ ok: true, pagamento: await respostaPagamento(cobranca) });
  } catch (e) {
    console.error('[publicEvento] comprovante:', e.message);
    res.status(500).json({ error: 'Não conseguimos anexar o comprovante agora. Tente novamente.' });
  }
});

/**
 * POST /pagamento/:token/metodo — a pessoa escolheu como quer pagar.
 *
 * ⚠️ Isto NÃO é preferência de interface: é o que faz o meio de pagamento
 * EXISTIR do lado do provedor. O 1º teste em sandbox (30/07) mostrou que uma
 * cobrança criada sem forma definida rende uma fatura com o que a CONTA do
 * provedor tem habilitado — no caso, só boleto — enquanto a nossa tela oferecia
 * Pix e cartão. Agora a escolha vira um fato lá, e o erro (conta sem chave Pix,
 * cartão não liberado) aparece aqui, na hora, em vez de virar uma fatura errada.
 *
 * Não mexe em valor, status nem vaga. Trocar de forma não é pagar nem cancelar.
 */
router.post('/pagamento/:token/metodo', async (req, res) => {
  try {
    const cobranca = await pagamentos.consultarPorToken(req.params.token);
    if (!cobranca) return res.status(404).json({ error: 'Cobrança não encontrada' });

    // Validação da forma, teto de parcelas no SERVIDOR, `definirMetodo` e o
    // mapeamento de erro (400 forma indisponível · 409 cobrança travada · 502
    // provedor recusou) vivem em `telaPublica.escolherFormaPagamento`.
    const r = await escolherFormaPagamento(cobranca, {
      metodo: req.body?.metodo, parcelas: req.body?.parcelas,
    });
    const pagamento = await respostaPagamento(r.cobranca);
    if (r.error) return res.status(r.status).json({ error: r.error, pagamento });
    return res.json(pagamento);
  } catch (e) {
    console.error('[publicEvento] metodo do pagamento:', e.message);
    res.status(500).json({ error: 'Erro ao escolher a forma de pagamento.' });
  }
});

router.get('/pagamento/:token', async (req, res) => {
  try {
    let cobranca = await pagamentos.consultarPorToken(req.params.token);
    if (!cobranca) return res.status(404).json({ error: 'Cobrança não encontrada' });

    // Rede de segurança nº 1: parado há mais de 2 min sem resolver → consulta o
    // PSP na hora. O webhook é otimização de latência; ninguém deve ficar
    // olhando "aguardando" porque uma entrega se perdeu. Régua compartilhada com
    // a doação (`telaPublica.sincronizarSeParada`).
    cobranca = await sincronizarSeParada(cobranca);

    res.json(await respostaPagamento(cobranca));
  } catch (e) {
    console.error('[publicEvento] status do pagamento:', e.message);
    res.status(500).json({ error: 'Erro ao consultar o pagamento.' });
  }
});

// GET /comprovante/:token — comprovante público da inscrição (SPEC-06).
// É a URL que o QR da tela de sucesso codifica (/i/c/<token>): a pessoa reabre
// o comprovante quando quiser e a portaria escaneia o MESMO QR no check-in.
// Token ASSINADO (HMAC) — sem assinatura válida não existe consulta. A resposta
// expõe só o que um comprovante imprime: nome, evento e situação — nada de
// CPF/telefone/e-mail (mesma régua do /pagamento/:token acima).
router.get('/comprovante/:token', async (req, res) => {
  try {
    const inscricaoId = await verificarTokenComprovanteAtivo(req.params.token);
    if (!inscricaoId) return res.status(404).json({ error: 'Comprovante não encontrado' });

    const { data: ins } = await supabase.from('inscricoes')
      .select('id, evento_id, nome_completo, numero_sorte, status, created_at')
      .eq('id', inscricaoId).is('deleted_at', null).maybeSingle();
    if (!ins) return res.status(404).json({ error: 'Comprovante não encontrado' });

    const { data: ev } = await supabase.from('insc_eventos')
      .select('nome, slug, data, hora, local, tem_sorteio')
      .eq('id', ins.evento_id).is('deleted_at', null).maybeSingle();
    if (!ev) return res.status(404).json({ error: 'Comprovante não encontrado' });

    // Situação do check-in é best-effort: o comprovante não pode deixar de
    // abrir na fila da entrada porque a consulta da marca soluçou.
    let checkinEm = null;
    try {
      const { data: c } = await supabase.from('insc_checkins')
        .select('em').eq('inscricao_id', ins.id).maybeSingle();
      checkinEm = c?.em || null;
    } catch (e2) { console.error('[publicEvento] comprovante/checkin:', e2.message); }

    res.json({
      nome: ins.nome_completo,
      numero_sorte: ev.tem_sorteio ? ins.numero_sorte : null,
      tem_sorteio: !!ev.tem_sorteio,
      status: ins.status,
      inscrito_em: ins.created_at,
      checkin_em: checkinEm,
      evento: { nome: ev.nome, slug: ev.slug, data: ev.data, hora: ev.hora, local: ev.local },
    });
  } catch (e) {
    console.error('[publicEvento] comprovante:', e.message);
    res.status(500).json({ error: 'Erro ao carregar o comprovante.' });
  }
});

// GET /:slug — dados públicos do evento (espinha → ext)
router.get('/:slug', async (req, res) => {
  try {
  const esp = await eventoEspinhaPorSlug(req.params.slug);
  if (esp) {
    // Evento pago ABRE desde a F3.3 — o curto-circuito `pago ||` saiu. O de
    // vagas continua: evento sem limite (o Celebra migrou com vagas=null) não
    // gasta a RPC.
    const ocup = esp.vagas == null ? null : await ocupacaoEspinha(esp.id);
    // ⚠️ Evento pago MAL CONFIGURADO conta como fechado, senão a pessoa preenche
    // o formulário inteiro e só então leva 503 do POST. O aviso explica por quê.
    const bloqueio = bloqueioPagamento(esp);
    const encerradas = !!bloqueio || await espinhaEncerrada(esp);
    const pago = !!esp.pagamento_ativo && Number(esp.valor_centavos) > 0;
    return res.json({
      fonte: 'espinha',
      nome: esp.nome, slug: esp.slug, data: esp.data, hora: esp.hora, local: esp.local,
      descricao: esp.descricao, form_ativo: !encerradas, tem_sorteio: esp.tem_sorteio,
      campos: Array.isArray(esp.campos) ? esp.campos : [], capa_url: esp.capa_url || null,
      inscricoes_encerram_em: esp.inscricoes_encerram_em || null,
      inscricoes_encerradas: encerradas,
      vagas: esp.vagas ?? null,
      vagas_restantes: ocup ? ocup.restantes : null, // null = ilimitado
      // Pagamento: a tela mostra o valor ANTES de a pessoa preencher.
      pagamento_ativo: pago,
      valor_centavos: pago ? Number(esp.valor_centavos) : null,
      pagamento_metodos: pago ? metodosDoEvento(esp) : [],
      pagamento_expira_horas: pago ? (esp.pagamento_expira_horas || 48) : null,
      // ⚠️ Evento marcado como pago mas sem valor (ou sem PSP configurado) NÃO
      // pode receber inscrição gratuita por acidente — avisa e não abre.
      aviso: avisoPagamento(esp),
      msg_sucesso_titulo: esp.msg_sucesso_titulo || null,
      msg_sucesso_texto: esp.msg_sucesso_texto || null,
    });
  }

  const ev = await eventoPorSlug(req.params.slug);
  if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
  res.json({
    fonte: 'ext',
    nome: ev.nome, slug: ev.slug, data: ev.data, hora: ev.hora, local: ev.local,
    descricao: ev.descricao, form_ativo: ev.form_ativo, tem_sorteio: ev.tem_sorteio,
    campos: Array.isArray(ev.campos) ? ev.campos : [], capa_url: ev.capa_url || null,
    inscricoes_encerram_em: ev.inscricoes_encerram_em || null,
    inscricoes_encerradas: inscricoesEncerradas(ev),
    msg_sucesso_titulo: ev.msg_sucesso_titulo || null,
    msg_sucesso_texto: ev.msg_sucesso_texto || null,
  });
  } catch (e) {
    // Único handler que ficava sem try/catch — erro aqui era 500 cru na
    // página pública do evento ao vivo.
    console.error('[publicEvento] GET /:slug:', e.message);
    res.status(500).json({ error: 'Não foi possível carregar o evento agora. Tente de novo em instantes.' });
  }
});

// ── POST /:slug/inscrever · ESPINHA ────────────────────────────────────────
async function inscreverEspinha(req, res, ev) {
  const body = req.body || {};
  if (await espinhaEncerrada(ev)) {
    return res.status(403).json({ error: 'As inscrições deste evento estão encerradas.' });
  }
  // Evento pago mal configurado (sem valor, PSP ausente, kill switch) NÃO abre —
  // e sobretudo não vira inscrição gratuita por acidente.
  const bloqueio = bloqueioPagamento(ev);
  if (bloqueio) return res.status(503).json({ error: bloqueio });
  const ehPago = !!ev.pagamento_ativo;

  // Campos padrão do contrato (D1–D9 + 28/07)
  const { erros, valores: val } = validarCamposPadrao(body);
  const campoErro = Object.keys(erros)[0];
  if (campoErro) return res.status(400).json({ error: erros[campoErro], campo: campoErro });
  if (!body.aceita_termos) return res.status(400).json({ error: 'É preciso aceitar os termos para se inscrever.', campo: 'aceita_termos' });

  const ex = validarExtras(ev.campos, body.dados);
  if (ex.erro) return res.status(400).json({ error: ex.erro });
  const optin = Boolean(body.whatsapp_optin);

  // Benefício PRÉ-AUTORIZADO pra este CPF (gratuidade ou desconto que o líder
  // cadastrou antes). Consultado ANTES da RPC porque decide o `p_status`:
  // gratuidade nasce `confirmada` (não há pagamento a esperar) e desconto nasce
  // `recebida` com a cobrança reduzida. Best-effort: tabela ausente (deploy em
  // duas etapas) não derruba a porta — sem benefício a pessoa paga o valor de
  // tabela, que é exatamente o comportamento de antes.
  const beneficio = ehPago ? await beneficioPorCpf(ev.id, val.cpf) : null;
  const isento = beneficio?.tipo === 'integral';
  const valorComBeneficio = beneficio && !isento ? Number(beneficio.valor_centavos) : null;
  // Isento não gera cobrança — cobrar R$ 0 no PSP não existe.
  const vaiCobrar = ehPago && !isento;

  const ip = req.ip || null;
  const ua = req.headers['user-agent'] || null;

  const consentimentos = (refId, membroId) => registrarConsentimentos({
    porta: 'inscricoes', refId, membroId, ip, userAgent: ua,
    itens: [
      { tipo: 'termos_lgpd', aceito: true },
      { tipo: 'whatsapp', aceito: optin },
      ...(ex.temCampoImagem ? [{ tipo: 'imagem', aceito: Boolean(body.consent_imagem) }] : []),
    ],
  });

  // Dedup — re-inscrição faz merge preservador. Duas chaves, na ordem:
  //   1. (evento, CPF) — linhas novas do contrato;
  //   2. (evento, telefone) em linha SEM CPF **com nome batendo** — as ~100
  //      inscrições migradas do Celebra não têm CPF (a coluna nem existia no
  //      ext); sem este fallback, re-escanear o QR duplicava a pessoa e gerava
  //      um SEGUNDO número da sorte pro palco. A guarda de nome
  //      (nomesMesmaPessoa) evita colar na inscrição de um parente que usa o
  //      mesmo telefone — nome divergente segue criando inscrição própria.
  const { data: dups, error: eDup } = await supabase.from('inscricoes')
    .select('id, numero_sorte, dados, membro_id, whatsapp_optin, status, nome_completo, cpf, email, data_nascimento, sexo, endereco, telefone')
    .eq('evento_id', ev.id).eq('cpf', val.cpf).is('deleted_at', null).limit(2);
  if (eDup) throw eDup;
  let existente = (dups || []).find(d => d.status !== 'cancelada') || (dups || [])[0] || null;
  if (!existente && val.telefone) {
    const { data: legadas, error: eLeg } = await supabase.from('inscricoes')
      .select('id, numero_sorte, dados, membro_id, whatsapp_optin, status, nome_completo, cpf, email, data_nascimento, sexo, endereco, telefone')
      .eq('evento_id', ev.id).eq('telefone', val.telefone).is('cpf', null).is('deleted_at', null).limit(5);
    if (eLeg) throw eLeg;
    existente = (legadas || []).find(d => nomesMesmaPessoa(d.nome_completo, val.nomeCompleto) && d.status !== 'cancelada')
      || (legadas || []).find(d => nomesMesmaPessoa(d.nome_completo, val.nomeCompleto))
      || null;
  }
  if (existente) {
    // Merge preservador + ENRIQUECIMENTO da linha legada: o que a pessoa
    // acabou de digitar completa o contrato (nunca sobrescreve valor existente).
    const patch = {
      dados: mesclarDados(existente.dados, ex.respostas),
      dados_anterior: existente.dados || {},
    };
    // Enriquecimento da linha legada: só preenche o que está VAZIO, nunca
    // sobrescreve (vindo de origin/main — inscrição do Celebra tinha só
    // nome+telefone e ganha o resto na re-inscrição).
    if (!existente.cpf && val.cpf) patch.cpf = val.cpf;
    if (!existente.email && val.email) patch.email = val.email;
    if (!existente.data_nascimento && val.dataNascimento) patch.data_nascimento = val.dataNascimento;
    if (!existente.sexo && val.sexo) patch.sexo = val.sexo;
    if (!existente.endereco && val.endereco) patch.endereco = val.endereco;
    if (!existente.telefone && val.telefone) patch.telefone = val.telefone;
    if (existente.status === 'cancelada') {
      // Voltou atrás → reativa. ⚠️ Em evento PAGO reativa como `recebida`, não
      // `confirmada`: confirmar aqui daria a vaga a quem não pagou.
      patch.status = ehPago ? 'recebida' : 'confirmada';
    }
    if (optin && !existente.whatsapp_optin) { patch.whatsapp_optin = true; patch.whatsapp_optin_em = new Date().toISOString(); }
    const { error: eUp } = await supabase.from('inscricoes').update(patch).eq('id', existente.id);
    if (eUp) console.error('[publicEvento espinha] merge re-inscrição:', eUp.message);
    consentimentos(existente.id, existente.membro_id || null)
      .catch((err) => console.error('[publicEvento espinha] consentimentos:', err.message));

    if (ehPago) {
      // ⚠️ Benefício NÃO é aplicado na re-inscrição: a cobrança dela já existe
      // com o valor cheio (a `referencia` é idempotente), e baixar o valor da
      // inscrição sem reemitir a cobrança deixaria as duas discordando. Quem
      // reemite corretamente é o botão "Dar bolsa" na ficha — então avisa gente
      // em vez de aplicar pela metade ou perder a autorização em silêncio.
      if (beneficio) {
        notificar({
          modulo: 'inscricoes', tipo: 'beneficio_pendente',
          titulo: 'Benefício não aplicado automaticamente',
          mensagem: `${val.nomeCompleto} tem ${beneficio.tipo === 'integral' ? 'gratuidade' : 'desconto'} autorizado em "${ev.nome}", mas já estava inscrita com a cobrança cheia. Aplique pelo botão "Dar bolsa" na ficha dela (ele reemite a cobrança).`,
          link: `/inscricoes/evento/${ev.id}`,
          chaveDedup: `insc_beneficio_pendente_${beneficio.id}`,
        }).catch((err) => console.error('[publicEvento espinha] notificar benefício:', err.message));
      }
      // Quem já pagou vê o comprovante; quem não pagou recebe o MESMO link
      // (a `referencia` idempotente devolve a cobrança existente em vez de
      // criar uma segunda — é assim que ninguém paga duas vezes).
      const cobranca = await cobrarInscricao({
        ev, inscricaoId: existente.id, val, membroId: existente.membro_id,
      });
      return res.json({ ...respostaCobranca(cobranca, ev), ja_inscrito: true });
    }
    const comprovanteToken = await emitirTokenComprovante(existente.id, 'form_reinscricao');
    return res.json({
      ok: true, ja_inscrito: true, numero_sorte: existente.numero_sorte, tem_sorteio: ev.tem_sorteio,
      comprovante_token: comprovanteToken,
    });
  }

  // Criação ATÔMICA: conferir vaga/janela/duplicidade, gerar numero_sorte e
  // inserir acontecem dentro de um advisory lock por evento (RPC
  // fn_insc_inscrever). É o que impede o evento de estourar a vaga quando 300
  // pessoas apertam "inscrever" no mesmo minuto — a conferência em JS acima é
  // só pra dar erro bonito antes, não é a que decide.
  const { data: rpc, error } = await supabase.rpc('fn_insc_inscrever', {
    p_evento_id: ev.id,
    p_nome_completo: val.nomeCompleto,
    p_telefone: val.telefone,
    p_cpf: val.cpf,
    p_email: val.email,
    p_data_nascimento: val.dataNascimento,
    p_sexo: val.sexo,
    p_endereco: val.endereco,
    p_dados: ex.respostas,
    // ⚠️ Evento pago nasce `recebida` = "vaga reservada, pagamento pendente".
    // A vaga fica presa sob o advisory lock até pagar ou o cron expirar; quem
    // promove pra `confirmada` é o handler do pagamento, nunca esta rota.
    // EXCEÇÃO: gratuidade pré-autorizada por CPF nasce `confirmada` — não há
    // pagamento a esperar, e deixá-la `recebida` faria o cron de expiração
    // tirar a vaga de quem a igreja decidiu isentar.
    p_status: vaiCobrar ? 'recebida' : 'confirmada',
    p_origem: 'formulario_publico',
    p_com_sorteio: !!ev.tem_sorteio,
    p_whatsapp_optin: optin,
  });
  if (error) throw error;

  if (!rpc?.ok) {
    // Perdeu a corrida entre a conferência acima e o lock. Cada motivo tem
    // resposta própria — "sem vaga" NÃO pode virar "inscrito com sucesso".
    if (rpc?.motivo === 'duplicada') {
      // Em evento pago, quem perdeu a corrida ainda precisa do link — devolve o
      // da cobrança que já existe (a `referencia` idempotente garante que é a
      // mesma, então ninguém paga duas vezes).
      if (ehPago && rpc.id) {
        const cobranca = await cobrarInscricao({ ev, inscricaoId: rpc.id, val, membroId: null });
        return res.json({ ...respostaCobranca(cobranca, ev), ja_inscrito: true });
      }
      // Busca a linha vencedora pra devolver o número da sorte — sem isso a
      // tela mostrava "Seu número da sorte" com nada embaixo (vindo de
      // origin/main).
      const { data: vencedora } = await supabase.from('inscricoes')
        .select('id, numero_sorte').eq('evento_id', ev.id).eq('cpf', val.cpf)
        .is('deleted_at', null).limit(1).maybeSingle();
      const comprovanteToken = vencedora
        ? await emitirTokenComprovante(vencedora.id, 'form_corrida_duplicada') : null;
      return res.status(200).json({
        ok: true, ja_inscrito: true, numero_sorte: vencedora?.numero_sorte ?? null, tem_sorteio: ev.tem_sorteio,
        comprovante_token: comprovanteToken,
      });
    }
    if (rpc?.motivo === 'sem_vaga') {
      return res.status(409).json({ error: 'As vagas deste evento acabaram de esgotar.', motivo: 'sem_vaga' });
    }
    if (rpc?.motivo === 'encerrado') {
      return res.status(403).json({ error: 'As inscrições deste evento estão encerradas.' });
    }
    if (rpc?.motivo === 'sorteio_esgotado') {
      return res.status(503).json({ error: 'Não foi possível gerar o número agora. Tente de novo.' });
    }
    console.error('[publicEvento espinha] inscrever recusado:', rpc?.motivo);
    return res.status(409).json({ error: 'Não foi possível concluir a inscrição. Tente de novo.' });
  }
  const ins = { id: rpc.id, numero_sorte: rpc.numero_sorte };

  // Benefício autorizado pra este CPF: grava o preço DESTA inscrição e queima a
  // autorização. Antes da cobrança, porque é ele que define o valor cobrado.
  await aplicarBeneficio(beneficio, ins.id);

  // Funil de identidade (matcher read-only + observação) + consentimentos.
  processarIdentidade({
    nomeCompleto: val.nomeCompleto, cpf: val.cpf, email: val.email, telefone: val.telefone,
    dataNascimento: val.dataNascimento, politica: 'ligar',
    origem: 'inscricoes_formulario', origemId: ins.id,
  }).then((ident) => {
    if (ident.membroId) {
      return supabase.from('inscricoes').update({ membro_id: ident.membroId }).eq('id', ins.id)
        .then(({ error: eM }) => { if (eM) console.error('[publicEvento espinha] vincular membro:', eM.message); })
        .then(() => consentimentos(ins.id, ident.membroId));
    }
    return consentimentos(ins.id, null);
  }).catch((err) => console.error('[publicEvento espinha] identidade/consentimentos:', err.message));

  notificar({
    modulo: 'inscricoes', tipo: 'nova_inscricao',
    titulo: `Nova inscrição · ${ev.nome}`,
    // Distingue explicitamente: em evento pago a vaga está RESERVADA, não
    // confirmada. Dizer "se inscreveu" faria a equipe contar quem não pagou.
    mensagem: ehPago
      ? `${val.nomeCompleto} reservou vaga em "${ev.nome}" (${ev.area}) e está aguardando o pagamento.`
      : `${val.nomeCompleto} se inscreveu em "${ev.nome}" (${ev.area}).`,
    link: '/inscricoes',
  }).catch((err) => console.error('[publicEvento espinha] notificar:', err.message));

  // Confirmação por WhatsApp (SPEC-07) — SÓ evento gratuito: nasce
  // `confirmada` aqui; em evento pago quem confirma é o handler do pagamento
  // (recebida→confirmada), e a mensagem sai de lá. Fire-and-forget: a fila tem
  // retry/backoff e falha terminal avisa gente — nunca decide o fluxo.
  // Re-inscrição/merge não passa por aqui (anti-spam de re-escaneada de QR).
  // Isento entra aqui também: nasceu `confirmada` e não tem pagamento a
  // esperar, então a confirmação é agora — igual a evento gratuito.
  if (!vaiCobrar) {
    enviarConfirmacaoInscricao({
      inscricaoId: ins.id, nome: val.nomeCompleto, telefone: val.telefone,
      optin, evento: ev,
    }).catch((err) => console.error('[publicEvento espinha] confirmação WhatsApp:', err.message));
  }

  if (vaiCobrar) {
    // A vaga já está reservada (`recebida`, sob o advisory lock). Se a cobrança
    // falhar aqui, a inscrição fica pendente e o cron de expiração devolve a
    // vaga — melhor que o inverso (cobrar sem vaga garantida).
    try {
      const cobranca = await cobrarInscricao({
        ev, inscricaoId: ins.id, val, membroId: null, valorCentavos: valorComBeneficio,
      });
      return res.status(201).json({ ...respostaCobranca(cobranca, ev), beneficio: beneficio ? 'parcial' : null });
    } catch (e) {
      console.error('[publicEvento espinha] criar cobrança:', e.message);
      return res.status(502).json({
        error: 'Sua vaga ficou reservada, mas não conseguimos gerar o pagamento agora. '
          + 'Tente enviar o formulário de novo em alguns minutos — sua vaga não será perdida.',
        vaga_reservada: true,
      });
    }
  }

  const comprovanteToken = await emitirTokenComprovante(ins.id, 'form_sucesso');
  emailConfirmadaBestEffort({ ev, inscricaoId: ins.id, val, comprovanteToken });
  return res.status(201).json({
    ok: true, numero_sorte: ins.numero_sorte, tem_sorteio: ev.tem_sorteio,
    // QR do comprovante na tela de sucesso (SPEC-06) — só a espinha tem
    // check-in; o ext legado segue sem token.
    comprovante_token: comprovanteToken,
    // Evento pago + isenção autorizada: a tela precisa DIZER que a inscrição
    // está confirmada sem pagamento, senão a pessoa fica esperando um link.
    beneficio: isento ? 'integral' : null,
  });
}

// ── POST /:slug/inscrever · LEGADO ext (comportamento da porta 1 intacto) ──
async function inscreverExt(req, res, ev) {
  const body = req.body || {};
  if (inscricoesEncerradas(ev)) return res.status(403).json({ error: 'As inscrições deste evento estão encerradas.' });

  const { erros, valores: val } = validarCamposPadrao(body);
  const campoErro = Object.keys(erros)[0];
  if (campoErro) return res.status(400).json({ error: erros[campoErro], campo: campoErro });
  if (!body.aceita_termos) return res.status(400).json({ error: 'É preciso aceitar os termos para se inscrever.', campo: 'aceita_termos' });

  const ex = validarExtras(ev.campos, body.dados);
  if (ex.erro) return res.status(400).json({ error: ex.erro });
  const optin = Boolean(body.whatsapp_optin);
  const ip = req.ip || null;
  const ua = req.headers['user-agent'] || null;

  const consentimentos = (refId, membroId) => registrarConsentimentos({
    porta: 'evento_externo', refId, membroId, ip, userAgent: ua,
    itens: [
      { tipo: 'termos_lgpd', aceito: true },
      { tipo: 'whatsapp', aceito: optin },
      ...(ex.temCampoImagem ? [{ tipo: 'imagem', aceito: Boolean(body.consent_imagem) }] : []),
    ],
  });

  // Dedup 1 · por CPF (chave das inscrições novas)
  const { data: porCpf, error: eCpf } = await supabase.from('ext_inscricoes')
    .select('id, numero_sorte, dados, cpf, email, data_nascimento, sexo, endereco, membro_id, whatsapp_optin')
    .eq('evento_id', ev.id).eq('cpf', val.cpf).is('deleted_at', null).limit(2);
  if (eCpf) throw eCpf;

  // Dedup 2 · fallback legado: linha antiga SEM CPF com o mesmo telefone
  let existente = (porCpf || [])[0] || null;
  if (!existente) {
    const { data: porTel, error: eTel } = await supabase.from('ext_inscricoes')
      .select('id, numero_sorte, dados, cpf, email, data_nascimento, sexo, endereco, membro_id, whatsapp_optin')
      .eq('evento_id', ev.id).eq('telefone', val.telefone).is('cpf', null).is('deleted_at', null).limit(2);
    if (eTel) throw eTel;
    existente = (porTel || [])[0] || null;
  }

  if (existente) {
    const patch = {
      dados: mesclarDados(existente.dados, ex.respostas),
      dados_anterior: existente.dados || {},
    };
    if (!existente.cpf && val.cpf) patch.cpf = val.cpf;
    if (!existente.email && val.email) patch.email = val.email;
    if (!existente.data_nascimento && val.dataNascimento) patch.data_nascimento = val.dataNascimento;
    if (!existente.sexo && val.sexo) patch.sexo = val.sexo;
    if (!existente.endereco && val.endereco) patch.endereco = val.endereco;
    if (optin && !existente.whatsapp_optin) { patch.whatsapp_optin = true; patch.whatsapp_optin_em = new Date().toISOString(); }

    const ident = await processarIdentidade({
      nomeCompleto: val.nomeCompleto, cpf: val.cpf, email: val.email, telefone: val.telefone,
      dataNascimento: val.dataNascimento, politica: 'ligar',
      origem: 'evento_externo_formulario', origemId: existente.id,
    });
    if (!existente.membro_id && ident.membroId) patch.membro_id = ident.membroId;

    const { error: eUp } = await supabase.from('ext_inscricoes').update(patch).eq('id', existente.id);
    if (eUp) console.error('[publicEventoExterno] merge da re-inscrição falhou:', eUp.message);
    consentimentos(existente.id, existente.membro_id || ident.membroId || null)
      .catch((err) => console.error('[publicEventoExterno] consentimentos:', err.message));

    return res.json({ ok: true, ja_inscrito: true, numero_sorte: existente.numero_sorte, tem_sorteio: ev.tem_sorteio });
  }

  // Número da sorte aleatório e único por evento (retenta em colisão).
  let numero = null;
  for (let tentativa = 0; tentativa < 25; tentativa++) {
    const cand = gerarSorteio();
    const { data: existe, error: eNum } = await supabase.from('ext_inscricoes')
      .select('id').eq('evento_id', ev.id).eq('numero_sorte', cand).limit(1);
    if (eNum) throw eNum;
    if (!existe || !existe.length) { numero = cand; break; }
  }
  if (numero == null) return res.status(503).json({ error: 'Não foi possível gerar o número agora. Tente de novo.' });

  const { data: ins, error } = await supabase.from('ext_inscricoes').insert({
    evento_id: ev.id,
    nome: val.nomeCompleto,
    telefone: val.telefone,
    cpf: val.cpf,
    email: val.email,
    data_nascimento: val.dataNascimento,
    sexo: val.sexo,
    endereco: val.endereco,
    whatsapp_optin: optin,
    whatsapp_optin_em: optin ? new Date().toISOString() : null,
    status: 'confirmada',
    origem: 'formulario_publico',
    numero_sorte: numero,
    dados: ex.respostas,
  }).select('id, numero_sorte').single();
  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Tente enviar de novo.' });
    throw error;
  }

  processarIdentidade({
    nomeCompleto: val.nomeCompleto, cpf: val.cpf, email: val.email, telefone: val.telefone,
    dataNascimento: val.dataNascimento, politica: 'ligar',
    origem: 'evento_externo_formulario', origemId: ins.id,
  }).then((ident) => {
    if (ident.membroId) {
      return supabase.from('ext_inscricoes').update({ membro_id: ident.membroId }).eq('id', ins.id)
        .then(({ error: eM }) => { if (eM) console.error('[publicEventoExterno] vincular membro:', eM.message); })
        .then(() => consentimentos(ins.id, ident.membroId));
    }
    return consentimentos(ins.id, null);
  }).catch((err) => console.error('[publicEventoExterno] identidade/consentimentos:', err.message));

  notificar({
    modulo: 'eventos-externos', tipo: 'nova_inscricao',
    titulo: `Nova inscrição · ${ev.nome}`,
    mensagem: `${val.nomeCompleto} confirmou presença em "${ev.nome}".`,
    link: `/eventos-externos/${ev.id}`,
  }).catch((err) => console.error('[publicEventoExterno] notificar:', err.message));

  return res.status(201).json({ ok: true, numero_sorte: ins.numero_sorte, tem_sorteio: ev.tem_sorteio });
}

// POST /:slug/inscrever — roteia pela fonte
router.post('/:slug/inscrever', async (req, res) => {
  try {
    if (honeypotPreenchido(req.body || {})) return res.status(200).json({ ok: true }); // honeypot

    const esp = await eventoEspinhaPorSlug(req.params.slug);
    if (esp) return await inscreverEspinha(req, res, esp);

    const ev = await eventoPorSlug(req.params.slug);
    if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
    return await inscreverExt(req, res, ev);
  } catch (e) {
    console.error('[publicEvento] inscrever:', e.message);
    res.status(500).json({ error: 'Erro ao confirmar presença.' });
  }
});

// POST /:slug/upload-imagem — imagem enviada num campo do formulário.
// Funciona pras duas fontes, só com inscrições abertas.
router.post('/:slug/upload-imagem', uploadImg.single('arquivo'), async (req, res) => {
  try {
    let pasta = null;
    const esp = await eventoEspinhaPorSlug(req.params.slug);
    if (esp) {
      if (await espinhaEncerrada(esp)) return res.status(403).json({ error: 'As inscrições deste evento estão encerradas.' });
      pasta = `espinha/inscricoes/${esp.id}`;
    } else {
      const ev = await eventoPorSlug(req.params.slug);
      if (!ev) return res.status(404).json({ error: 'Evento não encontrado' });
      if (inscricoesEncerradas(ev)) return res.status(403).json({ error: 'As inscrições deste evento estão encerradas.' });
      pasta = `inscricoes/${ev.id}`;
    }
    if (!req.file) return res.status(400).json({ error: 'Envie uma imagem (PNG, JPG, WEBP ou GIF, até 5MB).' });

    const ext = (req.file.originalname.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const path = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from('evento-capas').upload(path, req.file.buffer, {
      contentType: req.file.mimetype || 'image/png', upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from('evento-capas').getPublicUrl(path);
    res.json({ url: data.publicUrl });
  } catch (e) {
    console.error('[publicEvento] upload-imagem:', e.message);
    res.status(500).json({ error: 'Erro ao enviar a imagem.' });
  }
});

module.exports = router;
