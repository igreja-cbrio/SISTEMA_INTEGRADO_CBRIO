// ════════════════════════════════════════════════════════════════════════════
//  VARREDURA MENSAL DO WHATSAPP · o serviço (2026-09-26)
//
//  Lê as mensagens RECEBIDAS no mês anterior, tira o que é pastoral e o que
//  identifica a pessoa, pede ao modelo que agrupe por tema e aponte lacunas de
//  conhecimento do bot, grava em `wa_bot_varreduras` e manda o e-mail-resumo.
//  A RÉGUA mora em `utils/botIaVarredura` (pura, no gate) — aqui só há leitura,
//  chamada ao modelo e escrita.
//
//  Quem chama:
//   · o cron horário `GET /api/comunicacao/cron/agendamentos` (`rodarSeDevido`),
//     que respeita o interruptor dos disparos automáticos;
//   · o botão "Rodar agora" da tela (`rodar({ forcado: true })`), que o ignora
//     DE PROPÓSITO — quem clica decidiu — e deixa `forcado = true` registrado.
//
//  ⚠️⚠️ FALHA DECLARADA, NUNCA SUCESSO FINGIDO. Sem crédito na Anthropic (o
//  estado de 26/09/2026), a linha fica `status = 'erro'` com o motivo
//  `anthropic_sem_credito`, o e-mail NÃO sai e a tela diz isso. O cron não fica
//  re-tentando a API de hora em hora: quem retenta é gente, pelo botão.
//
//  ⚠️ Idempotência = UNIQUE(periodo). A linha `rodando` é INSERIDA antes de
//  chamar o modelo; quem perde a corrida bate no 23505 e sai sem pagar duas vezes.
// ════════════════════════════════════════════════════════════════════════════

const { supabase } = require('../utils/supabase');
const { disparoDesligado } = require('./comunicacaoDisparosOff');
const V = require('../utils/botIaVarredura');
const R = require('../utils/botIaRegras');

const DISPARO_ID = 'bot_varredura_mensal';
const TABELA = 'wa_bot_varreduras';
const MODEL = process.env.WHATSAPP_BOT_IA_MODEL || 'claude-haiku-4-5-20251001';
// ⚠️ Teto de saída: 15 temas com a lista de índices de cada um cabe com folga.
// Mais que isso só alonga a chamada — e o botão "Rodar agora" é síncrono.
const MAX_TOKENS = 4000;
const TIMEOUT_MODELO_MS = 90_000;
// ⚠️ Constante, não env: é o link que vai no e-mail. Mesma decisão do
// `linkInscricaoApp` (env com domínio da Vercel ou de localhost já mandou link
// errado pra fora uma vez).
const URL_ERP = 'https://www.cbrio.org';
// Linha `rodando` mais velha que isto é considerada TRAVADA (a função morreu no
// meio) e pode ser retomada.
const TRAVADO_MS = 30 * 60 * 1000;
// Teto de leitura: um mês do WhatsApp da igreja tem centenas de mensagens; o
// teto existe pra um mês anômalo não estourar memória. Passar dele é DECLARADO.
const TETO_LEITURA = 20000;
const LOTE_IN = 200;

function tabelaAusente(error) {
  return error && (error.code === '42P01' || error.code === 'PGRST205' || /wa_bot_varreduras/.test(error.message || ''));
}

// ── leituras ────────────────────────────────────────────────────────────────

async function lerLinha(periodo) {
  const { data, error } = await supabase.from(TABELA).select('*').eq('periodo', periodo).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function lerConfigBotIa() {
  const { data, error } = await supabase.from('whatsapp_config').select('bot_ia').eq('id', 1).maybeSingle();
  if (error) return { botIa: R.lerConfigBotIa(null), erro: error.message };
  return { botIa: R.lerConfigBotIa(data?.bot_ia) };
}

/** Mensagens de TEXTO recebidas no período, paginadas (cap de 1000 do PostgREST). */
async function lerMensagensDoPeriodo(periodo) {
  const { inicioIso, fimIso } = V.limitesUtcDoPeriodo(periodo);
  const out = [];
  let truncado = false;
  for (let off = 0; ; off += 1000) {
    const { data, error } = await supabase.from('wa_mensagens')
      .select('id, conversa_id, texto, criado_em')
      .eq('direcao', 'in').eq('tipo', 'text').not('texto', 'is', null)
      .gte('criado_em', inicioIso).lt('criado_em', fimIso)
      .order('criado_em', { ascending: true }).order('id', { ascending: true })
      .range(off, off + 999);
    // ⚠️ Erro PROPAGA: lista incompleta viraria "o mês teve poucas mensagens".
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
    if (out.length >= TETO_LEITURA) { truncado = true; break; }
  }
  return { mensagens: out, leituraTruncada: truncado };
}

async function lerConversas(ids) {
  const mapa = new Map();
  const unicos = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < unicos.length; i += LOTE_IN) {
    const lote = unicos.slice(i, i + LOTE_IN);
    const { data, error } = await supabase.from('wa_conversas').select('id, area, telefone').in('id', lote);
    // ⚠️ Sem saber a área da conversa não dá pra excluir Cuidados — então erro
    // aqui PROPAGA em vez de mandar conversa pastoral pro modelo.
    if (error) throw error;
    for (const c of data || []) mapa.set(c.id, c);
  }
  return mapa;
}

async function lerAreasBot() {
  const { data, error } = await supabase.from('wa_bot_areas').select('*').order('area');
  if (error) return { areas: [] };
  return { areas: (data || []).map(R.lerArea).filter(Boolean) };
}

// ── o modelo ────────────────────────────────────────────────────────────────

let _client = null;
function client() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY não configurada');
  if (!_client) {
    // ⚠️ `require` preguiçoso: carregar este módulo (o cron, a tela, o teste do
    // interruptor) não pode depender do SDK estar presente.
    const Anthropic = require('@anthropic-ai/sdk');
    _client = new Anthropic({ timeout: TIMEOUT_MODELO_MS, maxRetries: 0 });
  }
  return _client;
}

async function agruparComModelo({ system, user }) {
  const msg = await client().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    tools: [V.TOOL_AGRUPAR],
    tool_choice: { type: 'tool', name: V.TOOL_AGRUPAR.name },
    messages: [{ role: 'user', content: user }],
  });
  const tool = (msg?.content || []).find(b => b.type === 'tool_use');
  return {
    input: tool?.input || null,
    stop: msg?.stop_reason || null,
    tokensIn: msg?.usage?.input_tokens || 0,
    tokensOut: msg?.usage?.output_tokens || 0,
  };
}

// ── escrita ─────────────────────────────────────────────────────────────────

/**
 * UPDATE da linha. `critico = true` LANÇA em erro: gravar o resultado `ok` e
 * falhar em silêncio deixaria a linha `rodando`, e em 30 min o cron pagaria o
 * modelo de novo pelo mesmo mês.
 */
async function atualizar(id, patch, { critico = false } = {}) {
  const { error } = await supabase.from(TABELA).update(patch).eq('id', id);
  if (error) {
    console.error('[botIaVarredura] update %s:', id, error.message);
    if (critico) throw error;
  }
}

/**
 * Reivindica o período. Devolve `{ linha }` (pode seguir) ou `{ pulou, varredura? }`.
 */
async function reivindicar({ periodo, forcado, criadoPor }) {
  const agoraIso = new Date().toISOString();
  const nova = { periodo, status: 'rodando', forcado: !!forcado, criado_por: criadoPor || null, iniciado_em: agoraIso };
  let ins = await supabase.from(TABELA).insert(nova).select('*').maybeSingle();
  if (ins.error && ins.error.code === '23503' && nova.criado_por) {
    // autor sem profile (conta de serviço) — grava sem a assinatura
    ins = await supabase.from(TABELA).insert({ ...nova, criado_por: null }).select('*').maybeSingle();
  }
  if (!ins.error) return { linha: ins.data };
  if (tabelaAusente(ins.error)) return { pulou: 'migration_ausente', migracaoAusente: true };
  if (ins.error.code !== '23505') throw ins.error;

  // Já existe linha do mês.
  const ex = await lerLinha(periodo);
  if (!ex) return { pulou: 'em_curso' };
  if (ex.status === 'ok' || ex.status === 'sem_dados') return { pulou: 'ja_existe', varredura: ex };

  let podeRetomar = false;
  if (ex.status === 'erro') {
    // ⚠️ O cron NÃO re-tenta erro sozinho: sem crédito, ele chamaria a API
    // (e falharia) de hora em hora. Quem retenta é gente, pelo botão.
    if (!forcado) return { pulou: 'erro_anterior', varredura: ex };
    podeRetomar = true;
  } else if (ex.status === 'rodando') {
    const idade = Date.now() - new Date(ex.iniciado_em).getTime();
    if (Number.isFinite(idade) && idade < TRAVADO_MS) return { pulou: 'em_curso', varredura: ex };
    podeRetomar = true; // travada: a função morreu no meio
  }
  if (!podeRetomar) return { pulou: 'em_curso', varredura: ex };

  // UPDATE CONDICIONADO ao estado que acabou de ser lido: duas retomadas
  // simultâneas, uma passa.
  const { data: retomada, error } = await supabase.from(TABELA)
    .update({
      status: 'rodando', iniciado_em: agoraIso, forcado: !!forcado,
      criado_por: criadoPor || ex.criado_por || null, erro: null,
      email_erro: null, email_enviado_em: null, email_destinos: null,
    })
    .eq('id', ex.id).eq('status', ex.status).eq('iniciado_em', ex.iniciado_em)
    .select('*').maybeSingle();
  if (error) throw error;
  if (!retomada) return { pulou: 'em_curso' };
  return { linha: retomada };
}

async function enviarEmailResumo({ periodo, totais, temas, lacunas }) {
  const { botIa } = await lerConfigBotIa();
  const destinos = botIa.varredura_emails;
  if (!destinos.length) return { email_erro: 'sem_destinatarios' };
  const corpo = V.montarEmail({ periodo, totais, temas, lacunas, urlErp: URL_ERP });
  let r;
  try {
    const { enviarEmail, isConfigured } = require('./email');
    // Sem canal nenhum no servidor: código estável (a tela traduz), não a frase do serviço.
    if (!isConfigured()) return { email_erro: 'email_sem_canal' };
    r = await enviarEmail({ to: destinos, subject: corpo.subject, html: corpo.html, text: corpo.text, fromName: 'Comunicação · CBRio' });
  } catch (e) {
    r = { ok: false, error: e.message };
  }
  if (!r?.ok) {
    // ⚠️ Sem canal (nenhum MICROSOFT_* nem RESEND) o `enviarEmail` devolve
    // ok:false — gravado como erro, NUNCA como "enviado".
    return { email_erro: V.sanitizarErro(r?.error || 'falha_no_envio') };
  }
  return { email_enviado_em: new Date().toISOString(), email_destinos: destinos };
}

// ── o caminho ───────────────────────────────────────────────────────────────

/**
 * Roda a varredura de um mês. Nunca lança para o chamador do cron.
 * @returns {{ pulou?, status?, varredura?, erro?, migracaoAusente? }}
 */
async function rodar({ periodo, forcado = false, criadoPor = null } = {}) {
  if (!V.periodoValido(periodo)) return { pulou: 'periodo_invalido' };

  // ⚠️ O cron respeita o interruptor; o botão ("forçado") não — quem clicou
  // decidiu, e isso fica registrado em `forcado`.
  if (!forcado && await disparoDesligado(DISPARO_ID)) return { pulou: 'desligado' };

  let claim;
  try {
    claim = await reivindicar({ periodo, forcado, criadoPor });
  } catch (e) {
    console.error('[botIaVarredura] reivindicar %s:', periodo, e.message);
    return { erro: V.sanitizarErro(e.message) };
  }
  if (!claim.linha) return claim;
  const linha = claim.linha;

  try {
    const { mensagens, leituraTruncada } = await lerMensagensDoPeriodo(periodo);
    const conversas = await lerConversas(mensagens.map(m => m.conversa_id));

    let excluidasPastoral = 0;
    let excluidasCuidados = 0;
    const analisaveis = [];
    for (const m of mensagens) {
      const conv = conversas.get(m.conversa_id) || null;
      // ⚠️ LEI 2 · exclusão DETERMINÍSTICA, antes do modelo.
      if (conv && R.normalizarNome(conv.area) === 'cuidados') { excluidasCuidados += 1; continue; }
      if (V.ehPastoral(m.texto)) { excluidasPastoral += 1; continue; }
      analisaveis.push({
        id: m.id, conversa_id: m.conversa_id, area: conv?.area || null,
        // ⚠️ LEI 3 · o que identifica a pessoa sai ANTES do modelo.
        texto: V.mascararPII(m.texto, { telefoneConversa: conv?.telefone || null }),
      });
    }
    const amostra = V.prepararAmostra(analisaveis);
    const totais = {
      total_mensagens: mensagens.length,
      total_conversas: new Set(mensagens.map(m => m.conversa_id).filter(Boolean)).size,
      excluidas_pastoral: excluidasPastoral,
      excluidas_conversas_cuidados: excluidasCuidados,
    };

    if (!amostra.itens.length) {
      await atualizar(linha.id, { status: 'sem_dados', gerado_em: new Date().toISOString(), ...totais, temas: [], lacunas: [] }, { critico: true });
      return { status: 'sem_dados', periodo, ...totais };
    }

    const { areas } = await lerAreasBot();
    const nomesAreas = areas.map(a => a.area);
    const conhecimentoPorArea = Object.fromEntries(areas.map(a => [a.area, a.conhecimento]));
    const system = V.montarSystemPrompt({ areas: nomesAreas, conhecimentoPorArea });
    const user = V.montarUser({ amostra, periodo });

    const r = await agruparComModelo({ system, user });
    const { temas, lacunas } = V.normalizarSaidaModelo(r.input, { amostra, areasValidas: nomesAreas });

    if (!temas.length) {
      // ⚠️ Status `ok` com zero temas seria mentira: o mês teve mensagens.
      const motivo = r.stop === 'max_tokens' ? 'modelo_resposta_cortada' : 'modelo_sem_resultado';
      await atualizar(linha.id, { status: 'erro', erro: motivo, ...totais, modelo: MODEL, tokens_in: r.tokensIn, tokens_out: r.tokensOut });
      return { status: 'erro', erro: motivo, periodo };
    }

    await atualizar(linha.id, {
      status: 'ok', gerado_em: new Date().toISOString(), ...totais,
      temas, lacunas, modelo: MODEL, tokens_in: r.tokensIn, tokens_out: r.tokensOut,
    }, { critico: true });

    const email = await enviarEmailResumo({
      periodo, temas, lacunas,
      totais: { ...totais, analisadas: amostra.itens.length, truncado: amostra.truncado || leituraTruncada },
    });
    await atualizar(linha.id, email);

    return {
      status: 'ok', periodo, ...totais, temas: temas.length, lacunas: lacunas.length,
      analisadas: amostra.itens.length, truncado: amostra.truncado || leituraTruncada,
      email: email.email_enviado_em ? 'enviado' : (email.email_erro || 'nao_enviado'),
    };
  } catch (e) {
    const motivo = V.sanitizarErro(e?.message);
    console.error('[botIaVarredura] %s:', periodo, motivo);
    await atualizar(linha.id, { status: 'erro', erro: motivo });
    return { status: 'erro', erro: motivo, periodo };
  }
}

/** A pergunta do cron horário: é hora de rodar o mês anterior? */
async function rodarSeDevido({ agoraMs = Date.now() } = {}) {
  const periodo = V.periodoAnterior(agoraMs);
  const { data, error } = await supabase.from(TABELA)
    .select('id, status, iniciado_em').eq('periodo', periodo).maybeSingle();
  if (error) {
    if (tabelaAusente(error)) return { periodo, executou: false, resultado: { pulou: 'migration_ausente' } };
    throw error;
  }
  // Linha `rodando` travada (função morta no meio) NÃO conta como existente —
  // senão o mês ficaria preso em "rodando" pra sempre.
  const travada = data?.status === 'rodando'
    && Date.now() - new Date(data.iniciado_em).getTime() >= TRAVADO_MS;
  const jaExiste = !!data && !travada;
  if (!V.deveRodarAgora({ agoraMs, jaExiste })) {
    return { periodo, executou: false, motivo: jaExiste ? `ja_existe:${data.status}` : 'antes_das_6h' };
  }
  const resultado = await rodar({ periodo });
  // `executou` = chegou a trabalhar no mês (inclusive quando o modelo falhou e
  // a linha ficou `erro`) — não é "deu certo". Quem diz se deu certo é `status`.
  return { periodo, executou: !!resultado.status, resultado };
}

async function listar({ limite = 12 } = {}) {
  const n = Math.min(Math.max(parseInt(limite, 10) || 12, 1), 36);
  const { data, error } = await supabase.from(TABELA).select('*')
    .order('periodo', { ascending: false }).limit(n);
  if (error) {
    if (tabelaAusente(error)) return { varreduras: [], migracaoAusente: true };
    throw error;
  }
  return { varreduras: data || [] };
}

/**
 * Os exemplos de cada tema, buscados na hora e MASCARADOS. É o único caminho
 * pelo qual texto de mensagem sai desta feature — e só para comunicacao ≥ 3.
 */
async function exemplos(periodo) {
  if (!V.periodoValido(periodo)) return { erro: 'periodo_invalido' };
  let linha;
  try {
    linha = await lerLinha(periodo);
  } catch (e) {
    if (tabelaAusente(e)) return { migracaoAusente: true, temas: [] };
    throw e;
  }
  if (!linha) return { naoEncontrada: true, temas: [] };
  const temas = Array.isArray(linha.temas) ? linha.temas : [];
  const ids = [...new Set(temas.flatMap(t => (Array.isArray(t?.exemplo_ids) ? t.exemplo_ids : [])))].filter(Boolean);

  const msgs = new Map();
  for (let i = 0; i < ids.length; i += LOTE_IN) {
    const { data, error } = await supabase.from('wa_mensagens')
      .select('id, conversa_id, criado_em, texto').in('id', ids.slice(i, i + LOTE_IN));
    if (error) throw error;
    for (const m of data || []) msgs.set(m.id, m);
  }
  const conversas = await lerConversas([...msgs.values()].map(m => m.conversa_id));

  return {
    periodo,
    temas: temas.map(t => ({
      tema: t.tema, area_sugerida: t.area_sugerida, contagem: t.contagem,
      exemplos: (t.exemplo_ids || []).map(id => msgs.get(id)).filter(Boolean).map(m => ({
        id: m.id, conversa_id: m.conversa_id, criado_em: m.criado_em,
        texto: V.mascararPII(m.texto, { telefoneConversa: conversas.get(m.conversa_id)?.telefone || null }),
      })),
    })),
  };
}

module.exports = { DISPARO_ID, MODEL, URL_ERP, rodar, rodarSeDevido, listar, exemplos };
