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
const { semCache } = require('../middleware/semCache');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { supabase } = require('../utils/supabase');
const { notificar, resolverDestinatarios } = require('../services/notificar');
const { moduloDaAreaEvento } = require('../utils/moduloDaAreaEvento');
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
const checkoutExterno = require('../utils/checkoutExterno');
// Perguntas condicionais e bloco do responsável (menor de idade) · 17/08.
// ⚠️ Réguas PURAS e ÚNICAS: a tela pública usa os espelhos de `src/lib/`, e há
// teste no gate amarrando os dois lados. Não reimplementar aqui.
const camposCondicionais = require('../utils/camposCondicionais');
const inscricaoMenor = require('../utils/inscricaoMenor');
const lotesEvento = require('../utils/lotesEvento');
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
    .select('id, nome, slug, area, data, hora, local, descricao, campos, capa_url, vagas, inscricoes_abrem_em, inscricoes_encerram_em, msg_sucesso_titulo, msg_sucesso_texto, tem_sorteio, pagamento_ativo, valor_centavos, pagamento_metodos, pagamento_expira_horas, parcelas_max, juros_repassados, status, checkout_externo_url, checkout_externo_nome')
    .eq('slug', slug).is('deleted_at', null).maybeSingle();
  if (!data || data.status === 'rascunho' || data.status === 'arquivado') return null;
  await anexarConfigMenor(data);
  await anexarExtrasEvento(data);
  await anexarLotesEvento(data);
  await anexarWhatsappDuvidas(data);
  return data;
}

/**
 * ⚠️⚠️ SELECT ISOLADO e BEST-EFFORT das colunas da migration 20260817160000.
 *
 * Pedir coluna inexistente faz o PostgREST recusar a query INTEIRA (42703) — e
 * a query acima é a que abre a página pública de TODO evento ao vivo. Num deploy
 * em duas etapas (código antes da migration), juntá-las derrubaria o Celebra e o
 * Patrocinadores por causa de um campo do retiro. Lição do `parcelas_max`.
 *
 * Ausente ⇒ os defaults reproduzem o comportamento de antes: endereço opcional,
 * sem bloco de menor, sem aceite extra.
 */
async function anexarConfigMenor(ev) {
  if (!ev || !ev.id) return ev;
  try {
    const { data, error } = await supabase.from('insc_eventos')
      .select('exigir_endereco, exige_dados_menor, termos_extra')
      .eq('id', ev.id).maybeSingle();
    if (error) throw error;
    ev.exigir_endereco = !!data?.exigir_endereco;
    ev.exige_dados_menor = !!data?.exige_dados_menor;
    ev.termos_extra = Array.isArray(data?.termos_extra) ? data.termos_extra : [];
  } catch (e) {
    console.warn('[publicEvento espinha] config de menor/endereço indisponível:', e.message);
    ev.exigir_endereco = false;
    ev.exige_dados_menor = false;
    ev.termos_extra = [];
  }
  return ev;
}

/**
 * ⚠️ Coluna da migration 20260821150000 (grupo de WhatsApp de dúvidas), em
 * select PRÓPRIO e best-effort — isolada dos outros anexadores porque cada um
 * cobre uma migration: a falha de uma coluna nova não pode apagar da tela o
 * que as migrations já aplicadas entregam. Só sai https.
 */
async function anexarWhatsappDuvidas(ev) {
  if (!ev || !ev.id) return ev;
  try {
    const { data, error } = await supabase.from('insc_eventos')
      .select('whatsapp_duvidas_url').eq('id', ev.id).maybeSingle();
    if (error) throw error;
    ev.whatsapp_duvidas_url = /^https:\/\//.test(String(data?.whatsapp_duvidas_url || ''))
      ? data.whatsapp_duvidas_url : null;
  } catch (e) {
    console.warn('[publicEvento espinha] whatsapp de dúvidas indisponível:', e.message);
    ev.whatsapp_duvidas_url = null;
  }
  return ev;
}

/**
 * ⚠️ Coluna da migration 20260821120000 (lotes de preço), em select PRÓPRIO e
 * best-effort — separada dos outros dois anexadores pra falha aqui não levar
 * junto o bloco de menor nem o período/instruções. Ausente ⇒ `lotes = []` =
 * preço único (valor_centavos), o comportamento de sempre.
 */
async function anexarLotesEvento(ev) {
  if (!ev || !ev.id) return ev;
  try {
    const { data, error } = await supabase.from('insc_eventos')
      .select('lotes').eq('id', ev.id).maybeSingle();
    if (error) throw error;
    ev.lotes = lotesEvento.sanitizarLotes(data?.lotes) || [];
  } catch (e) {
    console.warn('[publicEvento espinha] lotes indisponíveis:', e.message);
    ev.lotes = [];
  }
  return ev;
}

/**
 * ⚠️ Colunas da migration 20260820120000 (data_fim + instruções gerais), em
 * SELECT PRÓPRIO e best-effort — separado do `anexarConfigMenor` de propósito:
 * se fosse na mesma query, um deploy antes desta migration derrubaria também o
 * bloco de menor e os aceites, que já estão em produção. Ausente ⇒ evento de um
 * dia, sem arquivo de instruções (o comportamento de antes).
 */
async function anexarExtrasEvento(ev) {
  if (!ev || !ev.id) return ev;
  try {
    const { data, error } = await supabase.from('insc_eventos')
      .select('data_fim, instrucoes_url, instrucoes_nome')
      .eq('id', ev.id).maybeSingle();
    if (error) throw error;
    ev.data_fim = data?.data_fim || null;
    ev.instrucoes_url = /^https:\/\//.test(String(data?.instrucoes_url || '')) ? data.instrucoes_url : null;
    ev.instrucoes_nome = data?.instrucoes_nome || null;
  } catch (e) {
    console.warn('[publicEvento espinha] período/instruções indisponíveis:', e.message);
    ev.data_fim = null;
    ev.instrucoes_url = null;
    ev.instrucoes_nome = null;
  }
  return ev;
}

// Mesmo SELECT/régua do por-slug, mas por ID: o app de membros já tem o id do
// evento (veio do catálogo `GET /api/app/eventos`) e não precisa do slug.
// ⚠️ Reusar este loader é o que garante que o app veja EXATAMENTE o mesmo
// evento que a página pública — rascunho/arquivado não abrem em lugar nenhum.
async function eventoEspinhaPorId(id) {
  const { data } = await supabase.from('insc_eventos')
    .select('id, nome, slug, area, data, hora, local, descricao, campos, capa_url, vagas, inscricoes_abrem_em, inscricoes_encerram_em, msg_sucesso_titulo, msg_sucesso_texto, tem_sorteio, pagamento_ativo, valor_centavos, pagamento_metodos, pagamento_expira_horas, parcelas_max, juros_repassados, status, no_totem, checkout_externo_url, checkout_externo_nome')
    .eq('id', id).is('deleted_at', null).maybeSingle();
  if (!data || data.status === 'rascunho' || data.status === 'arquivado') return null;
  await anexarConfigMenor(data);
  await anexarExtrasEvento(data);
  await anexarLotesEvento(data);
  await anexarWhatsappDuvidas(data);
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
  // ⚠️⚠️ A visibilidade é decidida com a MESMA régua da tela
  // (`utils/camposCondicionais.js`). Critério divergente dá um de dois estragos,
  // e os dois já morderam este sistema (o `exige_dados_menor` do voluntariado,
  // 28/07): formulário INSUBMISSÍVEL (400 citando campo que a tela não mostrou)
  // ou resposta gravada de pergunta que a pessoa nunca viu.
  //
  // ⚠️ Avaliada sobre o que o CLIENTE mandou, porque é disso que a condição
  // depende (a resposta da pergunta-mãe). Campo escondido não é exigido **e a
  // resposta dele é DESCARTADA**: quem marcou "tenho alergia", escreveu o
  // medicamento e depois voltou pra "não tenho" não pode deixar o remédio
  // gravado — a equipe leria como fato clínico.
  const visiveis = camposCondicionais.keysVisiveis(campos, dadosBody || {});
  const respostas = {};
  for (const c of campos) {
    if (!c.key || !visiveis.has(String(c.key))) continue;
    const v = dadosBody ? dadosBody[c.key] : undefined;
    const preenchido = v !== undefined && v !== null && String(v).trim() !== '';
    if (c.obrigatorio && !preenchido) return { erro: `Preencha: ${c.label}` };
    if (preenchido) respostas[c.key] = String(v).slice(0, 500);
  }
  // ⚠️ O consentimento de imagem segue a MESMA visibilidade: um campo de foto
  // escondido não pode exigir autorização de uso de imagem.
  const temCampoImagem = campos.some((c) => c.tipo === 'imagem' && c.key && visiveis.has(String(c.key)));
  return { respostas, temCampoImagem };
}

function gerarSorteio() { return Math.floor(Math.random() * 9000) + 1000; } // 1000-9999

// ── Pagamento (F3.3) ───────────────────────────────────────────────────────

/** Métodos que o evento quer × o que o provider sabe cobrar. */
function metodosDoEvento(ev) {
  const desejados = Array.isArray(ev.pagamento_metodos) && ev.pagamento_metodos.length
    ? ev.pagamento_metodos : null;
  let lista;
  try {
    lista = pagamentos.metodosDisponiveis(desejados);
  } catch {
    lista = desejados || [];
  }
  // ⚠️⚠️ Cartão terceirizado sai daqui — e é ESTE campo que vira
  // `metodos_ofertados` da cobrança, que o servidor confere em `decidirForma`
  // ("forma fora da lista não é oferecida nem por chamada direta"). Esconder o
  // botão só na tela deixaria o app, um link antigo de /pagamento/<token> ou uma
  // chamada direta cobrando cartão por dentro — e a mesma inscrição poderia ser
  // paga nos DOIS lugares.
  return checkoutExterno.metodosProprios(lista, ev);
}

/**
 * Evento pago só ABRE quando dá pra cobrar de verdade. Três formas de estar
 * mal configurado, e nenhuma pode virar inscrição gratuita por acidente:
 * marcado como pago sem valor, PSP não configurado, ou pagamentos desligados
 * pelo kill switch.
 */
function bloqueioPagamento(ev) {
  if (!ev.pagamento_ativo) return null;
  // ⚠️ Evento 100% no checkout externo (sobrou ZERO método nosso) não depende
  // do nosso PSP pra nada: quem cobra é a outra plataforma. Exigir PSP aqui
  // fecharia um evento que está perfeitamente configurado — e a inscrição por
  // dentro nem acontece (o POST recusa e aponta o link).
  if (checkoutExterno.temCheckoutExterno(ev) && !metodosDoEvento(ev).length) return null;
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
 * O LOTE desta inscrição, pela POSIÇÃO dela na ordem de chegada — nunca pelo
 * "lote atual" da tela, que pode ter virado entre abrir o formulário e enviar.
 *
 * Posição = quantas inscrições vivas NÃO-canceladas chegaram antes (ou junto,
 * desempatadas pelo id) — a MESMA régua de ocupação da `fn_insc_inscrever`, e
 * DETERMINÍSTICA: duas pessoas cruzando a fronteira do lote no mesmo segundo
 * recebem posições distintas, então uma paga o lote velho e a outra o novo, sem
 * depender da ordem em que as consultas rodaram.
 *
 * ⚠️ Fail-soft PRO VALOR DE TABELA (null ⇒ o chamador cobra `ev.valor_centavos`,
 * que com lotes é o preço FINAL): errar pra cima é a equipe devolvendo diferença
 * a uma pessoa; errar pra baixo é desconto silencioso que ninguém revisa.
 */
async function valorLoteDaInscricao(ev, inscricaoId) {
  if (!Array.isArray(ev?.lotes) || !ev.lotes.length || !inscricaoId) return null;
  try {
    const { data: eu, error: e1 } = await supabase.from('inscricoes')
      .select('created_at').eq('id', inscricaoId).maybeSingle();
    if (e1 || !eu?.created_at) return null;
    const { count, error: e2 } = await supabase.from('inscricoes')
      .select('id', { count: 'exact', head: true })
      .eq('evento_id', ev.id).is('deleted_at', null).neq('status', 'cancelada')
      .or(`created_at.lt.${eu.created_at},and(created_at.eq.${eu.created_at},id.lte.${inscricaoId})`);
    if (e2 || !(count > 0)) return null;
    const lote = lotesEvento.loteDaPosicao(ev.lotes, count);
    return lote ? { valor_centavos: lote.valor_centavos, nome: lote.nome } : null;
  } catch (e) {
    console.error('[publicEvento espinha] lote da inscrição:', e.message);
    return null;
  }
}

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
async function cobrarInscricao({ ev, inscricaoId, val, membroId, valorCentavos, estacaoId, lote }) {
  const horas = Number(ev.pagamento_expira_horas) > 0 ? Number(ev.pagamento_expira_horas) : 48;
  const { cobranca, reemitida } = await pagamentos.criarCobranca({
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
    // Totem: atribuído pelo SERVIDOR a partir da conta de quiosque logada.
    // NULL = veio da web (o caso normal).
    estacao_id: estacaoId || null,
    // `lote` é REGISTRO de qual lote precificou (a conciliação lê daqui por que
    // duas cobranças do mesmo evento têm valores diferentes) — nunca decide nada.
    metadata: { evento_id: ev.id, evento_slug: ev.slug, evento_nome: ev.nome, ...(lote ? { lote } : {}) },
  });

  // ⚠️ Reemissão (a cobrança anterior morreu sem dinheiro): o espelho tem
  // `uq_insc_pag_inscricao_ativa` — UMA linha por inscrição em
  // pendente/aguardando/pago. Sem aposentar a antiga, o insert abaixo bate 23505,
  // é engolido como "já existe", e o painel/`vw_insc_pagamento_estado` seguiriam
  // apontando pra cobrança MORTA enquanto a nova é a que a pessoa vai pagar.
  // Mesma manobra que o botão "Dar bolsa" já faz. Só linha `aguardando`/
  // `pendente`: `pago` nunca é mexido (e ali nem se reemite).
  if (reemitida) {
    const { error: eVelha } = await supabase.from('insc_pagamentos')
      .update({ status: 'expirado' })
      // Sem filtrar pela cobrança nova: ela ACABOU de nascer, então não tem
      // espelho ainda — e `neq` deixaria de fora linha legada com
      // `cobranca_id` nulo (NULL não compara), que é justamente uma das que
      // travariam a UNIQUE.
      .eq('inscricao_id', inscricaoId)
      .in('status', ['pendente', 'aguardando']);
    if (eVelha) console.error('[publicEvento espinha] aposentar espelho anterior:', eVelha.message);
  }

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
        // O id vai junto: é ele que deixa o e-mail saber se a inscrição é de
        // menor (pra anexar a autorização de embarque do responsável).
        id: inscricaoId,
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

// ⚠️ Estas duas famílias devolvem ESTADO e são consultadas em POLLING: a tela de
// pagamento pergunta de 6 em 6 segundos "já caiu?", e o comprovante é o que a
// portaria lê na entrada. Resposta cacheada aqui mostra o estado de ANTES do
// pagamento — a mesma classe do incidente do app em 05/08 (ver
// `middleware/semCache.js`).
//
// ⚠️ Escopo por PREFIXO, não no router inteiro, e isso é decisão: `GET /:slug`
// (a página do evento) é o endereço que leva a multidão no lançamento, e ali um
// pouco de cache AJUDA. O `vagas_restantes` dela já é declaradamente aproximado
// — quem decide a vaga é o advisory lock da RPC, não o número na tela.
router.use('/pagamento', semCache);
router.use('/comprovante', semCache);

// GET /textos — textos canônicos de consentimento (o front EXIBE estes; o
// snapshot gravado vem sempre do backend, então tela e registro nunca divergem)
router.get('/textos', (_req, res) => {
  res.json({
    termos_lgpd: TEXTOS.termos_lgpd,
    imagem: TEXTOS.imagem,
    // Autorização do responsável de menor (LGPD art. 14 §1º). ⚠️ O texto é o
    // `_inscricao`, NÃO o da apresentação de crianças (que fala explicitamente
    // de "apresentação de crianças"). Sem esta chave a tela cairia no fallback
    // local e o snapshot gravado — que vem do servidor — diria uma coisa
    // diferente do que a pessoa leu.
    menor_responsavel: TEXTOS.menor_responsavel_inscricao,
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

/**
 * Instruções gerais do EVENTO desta inscrição — pra página de pagamento
 * oferecer o download quando o pagamento confirma ("a tela de sucesso do
 * formulário ficou pra trás quando a pessoa foi pro checkout"). Isolada e
 * fail-soft: colunas da migration 20260820120000.
 */
async function instrucoesDaInscricao(inscricaoId) {
  if (!inscricaoId) return null;
  try {
    const { data, error } = await supabase.from('inscricoes')
      .select('evento:insc_eventos(instrucoes_url, instrucoes_nome)')
      .eq('id', inscricaoId).maybeSingle();
    if (error) return null;
    const url = data?.evento?.instrucoes_url;
    if (!/^https:\/\//.test(String(url || ''))) return null;
    return { url, nome: data.evento.instrucoes_nome || 'Instruções gerais' };
  } catch { return null; }
}

/**
 * Grupo de WhatsApp de dúvidas do EVENTO desta inscrição — a página de
 * pagamento é o "depois de se inscrever" (quem paga nunca volta na tela de
 * sucesso do formulário). Isolada e fail-soft (coluna da 20260821150000).
 */
async function whatsappDuvidasDaInscricao(inscricaoId) {
  if (!inscricaoId) return null;
  try {
    const { data, error } = await supabase.from('inscricoes')
      .select('evento:insc_eventos(whatsapp_duvidas_url)')
      .eq('id', inscricaoId).maybeSingle();
    if (error) return null;
    const url = data?.evento?.whatsapp_duvidas_url;
    return /^https:\/\//.test(String(url || '')) ? url : null;
  } catch { return null; }
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
    // Instruções gerais do evento: só com `pago` (inscrição concluída). O
    // mesmo arquivo vai anexado no e-mail de confirmação — o download aqui é
    // o "quer baixar agora?".
    instrucoes: cobranca.status === 'pago' ? await instrucoesDaInscricao(daInscricao) : null,
    // Grupo de dúvidas: SEMPRE (antes e depois de pagar — é pra tirar dúvida).
    whatsapp_duvidas: await whatsappDuvidasDaInscricao(daInscricao),

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
/**
 * POST /pagamento/:token/cartao — cobra o cartão SEM sair da nossa página.
 *
 * O corpo é o `formData` que o Card Payment Brick monta no navegador. ⚠️ O que
 * chega aqui é **token**, nunca número de cartão: é isso que mantém o PAN fora
 * do nosso servidor (lei nº 5) e ainda assim tira o redirecionamento pro site do
 * provedor — que era a única razão do salto existir.
 *
 * ⚠️ O `transaction_amount` que o Brick manda é IGNORADO. Quem diz o valor é a
 * cobrança no banco; o formulário roda no navegador da pessoa, e aceitar o valor
 * dele seria deixar qualquer um escolher quanto pagar pela inscrição.
 */
router.post('/pagamento/:token/cartao', async (req, res) => {
  try {
    const cobranca = await pagamentos.consultarPorToken(req.params.token);
    if (!cobranca) return res.status(404).json({ error: 'Cobrança não encontrada' });

    const b = req.body || {};
    if (!b.token) return res.status(400).json({ error: 'Não recebemos os dados do cartão. Tente de novo.' });

    const r = await pagamentos.pagarComCartao(cobranca, {
      token: b.token,
      installments: b.installments,
      payment_method_id: b.payment_method_id,
      issuer_id: b.issuer_id,
      payment_method_option_id: b.payment_method_option_id,
      payer: b.payer,
    });

    // Estado atual SEMPRE no corpo, inclusive em erro: sem isso a tela regride
    // pra vazio e a pessoa não sabe se pagou (mesma régua do /metodo).
    const pagamento = await respostaPagamento(r.cobranca || cobranca);

    if (!r.ok) {
      if (r.recusado) {
        // 402: o pedido estava correto, o emissor recusou. A cobrança segue viva
        // pra ela tentar outro cartão ou o Pix.
        return res.status(402).json({ error: r.motivo || 'Pagamento não aprovado.', recusado: true, pagamento });
      }
      if (r.motivo === 'cobranca_nao_editavel') {
        return res.status(409).json({ error: 'Esta cobrança já foi paga ou encerrada.', pagamento });
      }
      if (r.motivo === 'provider_sem_tokenizacao') {
        return res.status(503).json({ error: 'Pagamento com cartão nesta tela está indisponível agora.', pagamento });
      }
      return res.status(400).json({ error: r.motivo || 'Não foi possível cobrar o cartão.', pagamento });
    }

    return res.json(pagamento);
  } catch (e) {
    console.error('[publicEvento] cartao:', e.message);
    // ⚠️ Mensagem genérica pra fora: erro do provedor pode citar detalhe de
    // conta/credencial, e isso não vai pra tela de quem está pagando.
    res.status(502).json({ error: 'Não foi possível processar o cartão agora. Tente de novo em instantes.' });
  }
});

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
    const pago = !!esp.pagamento_ativo && Number(esp.valor_centavos) > 0;
    const temLotes = pago && Array.isArray(esp.lotes) && esp.lotes.length > 0;
    // Evento pago ABRE desde a F3.3 — o curto-circuito `pago ||` saiu. O de
    // vagas continua: evento sem limite (o Celebra migrou com vagas=null) não
    // gasta a RPC — a menos que haja LOTES, cuja exibição depende da ocupação.
    const ocup = (esp.vagas != null || temLotes) ? await ocupacaoEspinha(esp.id) : null;
    // Lote ATUAL só com a ocupação em mãos: sem ela (RPC soluçou), a tela cai
    // no valor de tabela (o preço FINAL) em vez de prometer um desconto que a
    // cobrança pode não dar. Quem decide o preço cobrado é o POST, pela POSIÇÃO
    // da inscrição — esta exibição é o convite, não a decisão.
    const lote = temLotes && ocup ? lotesEvento.loteAtual(esp.lotes, ocup.ocupadas || 0) : null;
    // ⚠️ Evento pago MAL CONFIGURADO conta como fechado, senão a pessoa preenche
    // o formulário inteiro e só então leva 503 do POST. O aviso explica por quê.
    const bloqueio = bloqueioPagamento(esp);
    const encerradas = !!bloqueio || await espinhaEncerrada(esp);
    return res.json({
      fonte: 'espinha',
      nome: esp.nome, slug: esp.slug, data: esp.data, hora: esp.hora, local: esp.local,
      // Último dia (retiro de vários dias) — a tela mostra "5 a 10 de fevereiro".
      data_fim: esp.data_fim || null,
      // Instruções gerais: a tela de sucesso oferece o download depois de
      // concluir (quem paga por Pix recebe na página de pagamento, quando paga).
      instrucoes: esp.instrucoes_url
        ? { url: esp.instrucoes_url, nome: esp.instrucoes_nome || 'Instruções gerais' }
        : null,
      descricao: esp.descricao, form_ativo: !encerradas, tem_sorteio: esp.tem_sorteio,
      campos: Array.isArray(esp.campos) ? esp.campos : [], capa_url: esp.capa_url || null,
      inscricoes_encerram_em: esp.inscricoes_encerram_em || null,
      inscricoes_encerradas: encerradas,
      vagas: esp.vagas ?? null,
      vagas_restantes: ocup ? ocup.restantes : null, // null = ilimitado
      // Pagamento: a tela mostra o valor ANTES de a pessoa preencher — e com
      // lotes é o preço do LOTE ATUAL (bundle antigo mostra o número certo sem
      // saber o que é lote).
      pagamento_ativo: pago,
      valor_centavos: pago ? (lote ? lote.valor_centavos : Number(esp.valor_centavos)) : null,
      // Lote atual por extenso, pra tela rotular ("Lote 1 · R$ 830 no Pix").
      // null = evento sem lotes, ou ocupação indisponível.
      // ⚠️ SÓ nome e preço de HOJE: `restantes_no_lote` e `proximo` NÃO saem no
      // payload público (pedido do Arthur · 21/08) — anunciar quanto falta e
      // quanto vai custar depois entrega o placar de inscritos pra qualquer um
      // que abra a API. O preço de cada inscrição continua decidido no POST,
      // pela posição, com a régua inteira do `lotesEvento` no servidor.
      lote_atual: lote ? { nome: lote.nome, valor_centavos: lote.valor_centavos } : null,
      // Grupo de WhatsApp pra dúvidas (21/08): link de ENTRADA exibido no
      // cabeçalho — cobre escolha de forma, formulário e tela de sucesso.
      whatsapp_duvidas: esp.whatsapp_duvidas_url || null,
      pagamento_metodos: pago ? metodosDoEvento(esp) : [],
      // Cartão numa plataforma externa (e-Inscrição): a tela pergunta a forma
      // ANTES do formulário e manda pra lá quem escolher cartão. `null` = o
      // cartão é cobrado aqui, e a tela nem faz a pergunta.
      checkout_externo: pago && checkoutExterno.temCheckoutExterno(esp) ? {
        url: checkoutExterno.linkExternoValido(esp.checkout_externo_url),
        nome: checkoutExterno.nomeExterno(esp.checkout_externo_nome),
        // Não sobrou método nosso ⇒ TODA inscrição acontece lá fora, e a tela
        // não pergunta nada: pergunta de uma alternativa só é atrito puro.
        exclusivo: !metodosDoEvento(esp).length,
      } : null,
      pagamento_expira_horas: pago ? (esp.pagamento_expira_horas || 48) : null,
      // ⚠️ Evento marcado como pago mas sem valor (ou sem PSP configurado) NÃO
      // pode receber inscrição gratuita por acidente — avisa e não abre.
      aviso: avisoPagamento(esp),
      msg_sucesso_titulo: esp.msg_sucesso_titulo || null,
      msg_sucesso_texto: esp.msg_sucesso_texto || null,
      // Retiro/viagem (17/08). ⚠️ Os textos dos aceites vão SEM o `url` cru se
      // ele não for https — a coluna já filtra, mas a tela transforma isto em
      // `href` e não pode confiar no que está gravado.
      exigir_endereco: !!esp.exigir_endereco,
      exige_dados_menor: !!esp.exige_dados_menor,
      maioridade: inscricaoMenor.MAIORIDADE,
      parentescos: esp.exige_dados_menor ? inscricaoMenor.PARENTESCOS : [],
      termos_extra: (Array.isArray(esp.termos_extra) ? esp.termos_extra : [])
        .filter((t) => t && t.chave && t.texto)
        .map((t) => ({
          chave: String(t.chave),
          titulo: String(t.titulo || 'Termo do evento'),
          texto: String(t.texto),
          // A tela mostra este aceite só quando o bloco de menor aparece.
          ...(t.so_menor ? { so_menor: true } : {}),
          ...(/^https:\/\//.test(String(t.url || '')) ? { url: String(t.url) } : {}),
        })),
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
/**
 * ⚠️ FUNÇÃO ÚNICA de inscrição na espinha — usada pela porta pública E pelo app
 * de membros (`POST /api/app/eventos/:id/inscrever`, que a importa). O app é um
 * CLIENTE novo desta régua, não uma porta nova: validação do contrato, benefício
 * por CPF, RPC atômica de vaga, consentimentos, cobrança e WhatsApp são os
 * MESMOS. Duplicar isso no app seria o "segundo caminho de escrita de pessoa"
 * que o Contrato de porta existe pra impedir.
 * @param opts.origem  rótulo gravado em `inscricoes.origem` ('app' quando vem do
 *   app · a coluna é TEXT sem CHECK, conferido no banco).
 */
async function inscreverEspinha(req, res, ev, opts = {}) {
  const body = req.body || {};
  const origemInscricao = opts.origem || 'formulario_publico';
  // Estação do totem (quando a inscrição vem do quiosque). Chega SEMPRE do
  // servidor — ver routes/inscricoes.js `/totem/eventos/:id/inscrever`.
  const estacaoId = opts.estacaoId || null;
  if (await espinhaEncerrada(ev)) {
    return res.status(403).json({ error: 'As inscrições deste evento estão encerradas.' });
  }
  // Evento pago mal configurado (sem valor, PSP ausente, kill switch) NÃO abre —
  // e sobretudo não vira inscrição gratuita por acidente.
  const bloqueio = bloqueioPagamento(ev);
  if (bloqueio) return res.status(503).json({ error: bloqueio });
  // ⚠️ Evento 100% no checkout externo: recusa com o LINK na resposta, nunca um
  // "não pode" seco. Quem chega aqui é bundle antigo ou chamada direta — a
  // pessoa não tem culpa e precisa saber para onde ir.
  if (checkoutExterno.temCheckoutExterno(ev) && !metodosDoEvento(ev).length) {
    const op = checkoutExterno.opcoesPagamento(ev);
    return res.status(409).json({
      error: `A inscrição deste evento é feita pelo ${op.externo_nome}.`,
      checkout_externo: { url: op.externo_url, nome: op.externo_nome },
    });
  }
  const ehPago = !!ev.pagamento_ativo;

  // Campos padrão do contrato (D1–D9 + 28/07)
  const { erros, valores: val } = validarCamposPadrao(body);
  const campoErro = Object.keys(erros)[0];
  if (campoErro) return res.status(400).json({ error: erros[campoErro], campo: campoErro });
  if (!body.aceita_termos) return res.status(400).json({ error: 'É preciso aceitar os termos para se inscrever.', campo: 'aceita_termos' });
  // Endereço é fixo-OPCIONAL no Contrato (28/07); retiro e viagem ligam a
  // exigência POR EVENTO. ⚠️ Conferido aqui, depois do contrato, pra a mensagem
  // sair no mesmo formato dos outros campos (`campo` aponta o input na tela).
  if (ev.exigir_endereco && !val.endereco) {
    return res.status(400).json({ error: 'Informe o endereço completo.', campo: 'endereco' });
  }

  const ex = validarExtras(ev.campos, body.dados);
  if (ex.erro) return res.status(400).json({ error: ex.erro });
  const optin = Boolean(body.whatsapp_optin);

  // ── Bloco do responsável (menor de idade · LGPD art. 14 §1º) ─────────────
  // ⚠️ Quem decide é o SERVIDOR, com o nascimento que ele acabou de validar —
  // nunca uma flag do cliente. `exige_dados_menor` do evento + menor de 18 na
  // data da inscrição (régua e o porquê da data em utils/inscricaoMenor.js).
  const precisaResponsavel = inscricaoMenor.exigeResponsavel(ev, val.dataNascimento);
  let resp = null;
  if (precisaResponsavel) {
    const r = inscricaoMenor.validarResponsavel(body);
    const respErro = Object.keys(r.erros)[0];
    if (respErro) return res.status(400).json({ error: r.erros[respErro], campo: respErro });
    // ⚠️ O consentimento do responsável é EXIGÊNCIA LEGAL, não caixinha
    // opcional: sem ele não há base para tratar dado de menor de 18.
    if (!body.consent_menor) {
      return res.status(400).json({
        error: 'É preciso a autorização do responsável para inscrever menor de idade.',
        campo: 'consent_menor',
      });
    }
    resp = r.valores;
  }

  // ── Aceites próprios do evento (`termos_extra`) ──────────────────────────
  // Todos são OBRIGATÓRIOS: a lista existe justamente pra o que a igreja precisa
  // que a pessoa leia (regulamento, termo de responsabilidade). Aceite opcional
  // seria um texto que ninguém marca e que não prova nada.
  // ⚠️ `so_menor` filtra o aceite que só vale pra menor (o "Termos de
  // Responsabilidade — Menor de idade" do retiro): exigir de adulto seria pedir
  // que ele aceite um termo sobre si mesmo como menor de idade. A decisão usa o
  // MESMO `precisaResponsavel` que o servidor acabou de calcular.
  const termosEvento = (Array.isArray(ev.termos_extra) ? ev.termos_extra : [])
    .filter((t) => t && t.chave && t.texto)
    .filter((t) => !t.so_menor || precisaResponsavel);
  const aceitesBody = (body.aceites && typeof body.aceites === 'object') ? body.aceites : {};
  for (const t of termosEvento) {
    if (aceitesBody[t.chave] !== true) {
      return res.status(400).json({
        error: `É preciso aceitar: ${t.titulo || 'termo do evento'}.`,
        campo: `aceite_${t.chave}`,
      });
    }
  }

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
      // Autorização do responsável (LGPD art. 14 §1º) — só quando o SERVIDOR
      // decidiu que a pessoa é menor. Chega aqui sempre `aceito: true`, porque a
      // inscrição foi RECUSADA acima sem ele.
      // ⚠️ `texto` explícito: o default de `registrarConsentimentos` é
      // `TEXTOS[tipo]`, que fala de "apresentação de crianças" — gravaria uma
      // prova legal descrevendo outra porta.
      ...(precisaResponsavel
        ? [{ tipo: 'menor_responsavel', aceito: true, texto: TEXTOS.menor_responsavel_inscricao }]
        : []),
      // ⚠️ Cada aceite do evento é linha PRÓPRIA, com o texto EXIBIDO como
      // snapshot: é o que permite responder "qual versão do regulamento esta
      // pessoa aceitou?" depois que a equipe editar o texto. O título vai junto
      // porque o `tipo` é o mesmo pros N termos.
      ...termosEvento.map((t) => ({
        tipo: 'evento_termo',
        aceito: true,
        texto: `[${t.chave}] ${t.titulo || 'Termo do evento'}\n\n${t.texto}`,
      })),
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
  // ⚠️⚠️ As colunas do responsável entram no SELECT **só quando o evento pede o
  // bloco de menor** — e `exige_dados_menor` só pode ser true depois da migration
  // 20260817160000 (sem ela, `anexarConfigMenor` devolve false). Pôr as 6 colunas
  // fixas aqui faria o PostgREST recusar a query INTEIRA (42703) num deploy em
  // duas etapas, e esta é a consulta de dedup de TODA re-inscrição: o Celebra
  // passaria a dar 500 por causa de um campo do retiro. Lição do `parcelas_max`.
  const COLS_DEDUP = 'id, numero_sorte, dados, membro_id, whatsapp_optin, status, nome_completo, cpf, email, data_nascimento, sexo, endereco, telefone';
  const colsDedup = ev.exige_dados_menor
    ? `${COLS_DEDUP}, responsavel_nome, responsavel_cpf, responsavel_parentesco, responsavel_telefone, responsavel_email, responsavel_autoriza_batismo`
    : COLS_DEDUP;
  const { data: dups, error: eDup } = await supabase.from('inscricoes')
    .select(colsDedup)
    .eq('evento_id', ev.id).eq('cpf', val.cpf).is('deleted_at', null).limit(2);
  if (eDup) throw eDup;
  let existente = (dups || []).find(d => d.status !== 'cancelada') || (dups || [])[0] || null;
  if (!existente && val.telefone) {
    const { data: legadas, error: eLeg } = await supabase.from('inscricoes')
      .select(colsDedup)
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
    // Responsável do menor na re-inscrição: preenche só o que está VAZIO, a
    // MESMA política das linhas acima. ⚠️ Corrigir um contato JÁ gravado é ato de
    // gente na ficha da inscrição — reescrever aqui deixaria um reenvio
    // acidental (ou um bundle antigo sem os campos) apagar o telefone de
    // emergência que a equipe já conferiu.
    if (resp) {
      if (!existente.responsavel_nome && resp.responsavelNome) patch.responsavel_nome = resp.responsavelNome;
      if (!existente.responsavel_cpf && resp.responsavelCpf) patch.responsavel_cpf = resp.responsavelCpf;
      if (!existente.responsavel_parentesco && resp.responsavelParentesco) patch.responsavel_parentesco = resp.responsavelParentesco;
      if (!existente.responsavel_telefone && resp.responsavelTelefone) patch.responsavel_telefone = resp.responsavelTelefone;
      if (!existente.responsavel_email && resp.responsavelEmail) patch.responsavel_email = resp.responsavelEmail;
      if (existente.responsavel_autoriza_batismo == null && resp.responsavelAutorizaBatismo != null) {
        patch.responsavel_autoriza_batismo = resp.responsavelAutorizaBatismo;
      }
    }
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
      // ⚠️ O valor do lote vai junto pro caso de REEMISSÃO (cobrança anterior
      // morta sem dinheiro): a nova precisa nascer com o preço da POSIÇÃO da
      // pessoa, não com o valor de tabela.
      const loteExistente = await valorLoteDaInscricao(ev, existente.id);
      const cobranca = await cobrarInscricao({
        ev, inscricaoId: existente.id, val, membroId: existente.membro_id,
        valorCentavos: loteExistente?.valor_centavos, lote: loteExistente?.nome,
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
    p_origem: origemInscricao,
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
        const loteCorrida = await valorLoteDaInscricao(ev, rpc.id);
        const cobranca = await cobrarInscricao({
          ev, inscricaoId: rpc.id, val, membroId: null, estacaoId,
          valorCentavos: loteCorrida?.valor_centavos, lote: loteCorrida?.nome,
        });
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

  // ── Dados do responsável, gravados DEPOIS do insert atômico ──────────────
  // ⚠️ A `fn_insc_inscrever` não tem parâmetro pra eles, e NÃO os acrescentei:
  // ela é o ÚNICO caminho de criação de inscrição do sistema, `CREATE OR REPLACE`
  // com assinatura nova cria OVERLOAD (a antiga continua viva e o PostgREST
  // escolhe qualquer uma), e reescrevê-la a partir do arquivo do repo reverteria
  // em silêncio qualquer ajuste que exista só em produção. Trocar o risco de
  // quebrar a inscrição de TODO evento pelo de um UPDATE a mais não se paga.
  //
  // ⚠️⚠️ Mas aqui, DIFERENTE da estação do totem logo abaixo, o UPDATE é AWAITED
  // e com uma retentativa: aquilo é atribuição (perder é inofensivo), isto é o
  // CONTATO DE EMERGÊNCIA de um adolescente que vai passar dias fora. Se mesmo
  // assim falhar, a inscrição VALE (o consentimento do responsável está
  // registrado) e a equipe é avisada pra pedir o contato — nunca se devolve erro
  // pra quem já tem vaga reservada, e nunca se finge que gravou.
  if (resp) {
    const patchResp = {
      responsavel_nome: resp.responsavelNome,
      responsavel_cpf: resp.responsavelCpf,
      responsavel_parentesco: resp.responsavelParentesco,
      responsavel_telefone: resp.responsavelTelefone,
      responsavel_email: resp.responsavelEmail,
      responsavel_autoriza_batismo: resp.responsavelAutorizaBatismo,
    };
    let erroResp = null;
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const { error: eResp } = await supabase.from('inscricoes').update(patchResp).eq('id', ins.id);
      if (!eResp) { erroResp = null; break; }
      erroResp = eResp;
    }
    if (erroResp) {
      console.error('[publicEvento espinha] responsavel do menor:', erroResp.message);
      // ⚠️ O aviso NÃO leva o contato do responsável: notificação é lida por
      // quem a regra do módulo alcançar, e este é dado de menor de idade.
      notificar({
        modulo: 'inscricoes', tipo: 'nova_inscricao',
        titulo: `Contato do responsável não gravou · ${ev.nome}`,
        mensagem: `A inscrição de ${val.nomeCompleto} é de menor de idade e os dados do responsável NÃO foram gravados. Abra a inscrição e peça o contato antes do evento.`,
        link: `/inscricoes/evento/${ev.id}`,
        chaveDedup: `insc_resp_falhou_${ins.id}`,
      }).catch((err) => console.error('[publicEvento espinha] avisar responsavel:', err.message));
    }
  }

  // Estação do totem na própria inscrição. Separado da cobrança de propósito:
  // evento GRATUITO não tem cobrança e a gente ainda quer saber onde a pessoa
  // se inscreveu (e onde o consentimento foi colhido).
  // ⚠️ Best-effort e DEPOIS do insert: a `fn_insc_inscrever` não tem parâmetro
  // pra isso (acrescentar exigiria DROP+CREATE da função, que é o caminho de
  // risco pra uma coluna de atribuição). Falhar aqui deixa a inscrição sem
  // origem — exatamente o estado de quem se inscreve pela web —, nunca sem
  // inscrição.
  if (estacaoId) {
    supabase.from('inscricoes').update({ totem_estacao_id: estacaoId }).eq('id', ins.id)
      .then(({ error: eEst }) => {
        if (eEst) console.error('[publicEvento espinha] estacao na inscricao:', eEst.message);
      });
  }

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

  // ⚠️ Quem cuida da ÁREA do evento também é avisado (17/08/2026). O aviso sai
  // pelo módulo `inscricoes`, que não tem regra pra `nova_inscricao` e cai no
  // fallback de admin/diretor — então o Celebra, que é o formulário dos
  // VOLUNTÁRIOS, nunca chegava a quem cuida do voluntariado. A régua é a ÁREA
  // do evento (`utils/moduloDaAreaEvento`); as PESSOAS continuam vindo de
  // `notificacao_regras` (/admin), nunca de lista no código.
  // ⚠️ Best-effort: falhar aqui não pode tirar o aviso de quem já recebe.
  let avisarTambem = [];
  try {
    const moduloArea = moduloDaAreaEvento(ev.area);
    if (moduloArea) avisarTambem = await resolverDestinatarios(moduloArea, 'nova_inscricao');
  } catch (err) {
    console.error('[publicEvento espinha] destinatarios da area:', err.message);
  }

  notificar({
    modulo: 'inscricoes', tipo: 'nova_inscricao',
    titulo: `Nova inscrição · ${ev.nome}`,
    // Distingue explicitamente: em evento pago a vaga está RESERVADA, não
    // confirmada. Dizer "se inscreveu" faria a equipe contar quem não pagou.
    mensagem: ehPago
      ? `${val.nomeCompleto} reservou vaga em "${ev.nome}" (${ev.area}) e está aguardando o pagamento.`
      : `${val.nomeCompleto} se inscreveu em "${ev.nome}" (${ev.area}).`,
    link: '/inscricoes',
    extraTargetIds: avisarTambem,
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
      // LOTES (20/08): o preço é o do lote da POSIÇÃO desta inscrição. O
      // benefício por CPF (autorização individual do líder) VENCE o lote — as
      // duas coisas não se somam. Sem lote resolvido, vale o valor de tabela.
      const loteInsc = valorComBeneficio == null ? await valorLoteDaInscricao(ev, ins.id) : null;
      const cobranca = await cobrarInscricao({
        ev, inscricaoId: ins.id, val, membroId: null,
        valorCentavos: valorComBeneficio ?? loteInsc?.valor_centavos,
        lote: loteInsc?.nome,
        estacaoId,
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
// Reuso pelo app de membros (routes/app.js) — ver o cabeçalho de inscreverEspinha.
module.exports.inscreverEspinha = inscreverEspinha;
module.exports.eventoEspinhaPorId = eventoEspinhaPorId;
module.exports.ocupacaoEspinha = ocupacaoEspinha;
// ⚠️ Leitura BEST-EFFORT das colunas da migration 20260817160000, exportada pra
// o app usar a MESMA (routes/app.js decide `so_web` com ela). Duas cópias
// divergiriam no dia em que uma coluna nova entrasse — e o efeito seria o app
// inscrevendo por dentro num evento que exige o bloco de menor, levando 400 numa
// tela sem os campos pra corrigir.
module.exports.anexarConfigMenor = anexarConfigMenor;
