// ════════════════════════════════════════════════════════════════════════════
//  CENSO · porta PÚBLICA da coleta (QR no culto, link, app do membro)
//
//  ⚠️ Montado ANTES do `publicLimiter` estrito em server.js, de propósito: o
//  culto inteiro sai pelo mesmo IP (NAT do prédio). Um teto de 30 req/15min por
//  IP derrubaria a coleta na terceira pessoa. Mesmo precedente do publicNps.
//  O anti-abuso aqui é honeypot + dois baldes próprios + idempotência.
//
//  ⚠️ Nenhum endpoint daqui devolve cadastro de ninguém. O /prefill responde
//  NEUTRO (mesmo corpo para "não existe" e para "existe com nascimento
//  errado"), porque CPF vaza e se compra — endpoint público que entrega ficha a
//  partir de CPF é máquina de vazamento. Molde: /wallet/verify.
// ════════════════════════════════════════════════════════════════════════════

const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { supabase } = require('../utils/supabase');
const { montarItens, validarPerguntas } = require('../utils/censoPerguntas');
const {
  gerarTokenIdentidade, verificarTokenIdentidade,
  gerarSegredoRetomada, hashRetomada, retomadaConfere,
} = require('../utils/censoRespostaToken');
const { cpfValido, normalizarCpf } = require('../utils/cpf');
const { casarComOpcao, loteParaBanco } = require('../utils/censoVocabulario');
const { acharRespostaDaPessoa } = require('../services/censoJaRespondeu');
const { acharMembroGuardado, acharOuCriarGuardado } = require('../services/membroMatch');

let reconciliarCenso;
try { ({ reconciliarCenso } = require('../services/censoReconciliar')); }
catch { reconciliarCenso = async () => ({ aplicados: [], conflitos: [] }); }

// ── Dois baldes separados ─────────────────────────────────────────────────
//
// ⚠️ ESTES NÚMEROS FORAM MEDIDOS, NÃO ESTIMADOS. O teste de carga do módulo
// (backend/scripts/censo_carga.cjs, jornada completa, 2026-08-06) mostrou que
// um teto de 10.000 barrava 1.836 de 2.500 pessoas com HTTP 429 — três quartos
// da igreja. A conta que faltava:
//
//   uma pessoa faz ~15 requisições (1 abrir + 13 salvar rascunho + 1 enviar)
//   e o culto INTEIRO sai por UM IP (o NAT do prédio)
//   → 2.500 pessoas = 37.500 requisições do mesmo IP na mesma janela
//
// Num formulário público comum, limite por IP é defesa. Aqui é o contrário:
// como todos compartilham o IP, o limite pune a igreja e não o atacante. A
// defesa real deste fluxo é outra: honeypot, `envio_id` idempotente, UNIQUE por
// pessoa, e resposta NEUTRA no lookup. O limitador fica só como teto de
// sanidade contra um laço descontrolado.
//
// Teto com folga para um culto de 5.000 pessoas e re-tentativas da fila offline.
// (Na Vercel o store é por INSTÂNCIA, então na prática a folga é ainda maior —
// motivo de mais para não apertar aqui.)
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.PUBLIC_CENSO_RATE_LIMIT_MAX || 120000),
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
});
// O lookup de CPF continua num balde SEPARADO e mais apertado — é o endpoint
// que serviria para varrer CPFs. Mas 600 também não passava: cada pessoa usa o
// atalho uma vez, então 2.500 pessoas estouravam na quarta parte da fila.
// 6.000 atende o culto com folga e ainda deixa a varredura lenta; a proteção
// que realmente vale é a resposta neutra (só quem acerta CPF *e* nascimento
// juntos descobre algo, e descobre apenas sobre si).
const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.PUBLIC_CENSO_LOOKUP_RATE_LIMIT_MAX || 6000),
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
});

const CANAIS = ['qr', 'app', 'link', 'email', 'whatsapp', 'totem'];

/**
 * "Matheus Ribeiro Toscano" → "Matheus R. T."
 *
 * É o MÁXIMO que um endereço público pode devolver a partir de um CPF sozinho.
 * O nome inteiro transformaria isto num consultor de CPF → nome, e CPF vaza e se
 * compra. Mesmo padrão dos lookups de `publicMembresia` (primeiro nome +
 * iniciais + telefone mascarado), que existe exatamente por isso.
 * O dado de verdade só sai depois de a pessoa confirmar o NASCIMENTO — que é uma
 * pergunta do censo, então ela não digita nada duas vezes.
 */
function nomeMascarado(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return null;
  const primeiro = partes[0];
  const iniciais = partes.slice(1)
    .filter((x) => x.length > 2 || /^[A-ZÀ-Ú]/.test(x))   // pula "de", "da", "dos"
    .map((x) => `${x[0].toUpperCase()}.`)
    .join(' ');
  return iniciais ? `${primeiro} ${iniciais}` : primeiro;
}

function mascararTelefone(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  if (d.length < 8) return null;
  return `(${d.slice(0, 2)}) ****-${d.slice(-4)}`;
}

// ── Cache do questionário em memória ──────────────────────────────────────
// Num culto de 2.500 pessoas, CADA requisição relia a mesma linha de
// `cen_pesquisa` — que carrega o jsonb das 106 perguntas, o maior payload do
// fluxo. O questionário não muda durante a coleta, então 20s de cache por
// instância derrubam essa leitura de milhares para algumas dezenas.
// Mesmo padrão de cache com TTL do financeiroV2 (`_assistenteCache`), e sem
// cron novo (o teto de crons do plano já está no limite).
//
// ⚠️ PREÇO ACEITO: depois de "encerrar" a pesquisa, respostas ainda podem
// entrar por até 20s (cada instância tem o próprio cache). Num censo isso é
// inofensivo — perder resposta de quem apertou enviar seria pior.
const CACHE_TTL_MS = 20_000;
const _cachePesquisa = new Map();   // slug -> { at, valor }

function cacheLer(slug) {
  const hit = _cachePesquisa.get(slug);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.valor;
  if (hit) _cachePesquisa.delete(slug);
  return null;
}
function cacheGravar(slug, valor) {
  // Teto de chaves: a instância é reciclada pela Vercel, mas não deixamos o
  // mapa crescer sem limite se alguém varrer slugs inexistentes.
  if (_cachePesquisa.size > 50) _cachePesquisa.clear();
  _cachePesquisa.set(slug, { at: Date.now(), valor });
}

function ipHash(req) {
  const ip = req.ip || req.headers['x-forwarded-for'] || '';
  return crypto.createHash('sha256').update(`censo:${ip}`).digest('hex').slice(0, 32);
}

function ehUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
}

/** A pesquisa existe e está aberta para receber resposta? */
async function carregarPesquisaAberta(slug) {
  const chave = String(slug || '').trim();
  let data = cacheLer(chave);
  if (!data) {
    const r = await supabase
      .from('cen_pesquisa')
      .select('id, slug, titulo, subtitulo, perguntas, config, consentimento_texto, status, abre_em, fecha_em')
      .eq('slug', chave)
      .is('deleted_at', null)
      .maybeSingle();
    if (r.error) throw new Error(r.error.message);
    data = r.data;
    // Cacheia inclusive a ausência: assim uma varredura de slugs inexistentes
    // não vira uma consulta ao banco por tentativa.
    cacheGravar(chave, data || null);
  }
  if (!data) return { erro: 404, mensagem: 'Pesquisa não encontrada' };
  if (data.status !== 'aberta') return { erro: 409, mensagem: 'Esta pesquisa não está recebendo respostas.' };
  const agora = Date.now();
  if (data.abre_em && new Date(data.abre_em).getTime() > agora) {
    return { erro: 409, mensagem: 'Esta pesquisa ainda não começou.' };
  }
  if (data.fecha_em && new Date(data.fecha_em).getTime() < agora) {
    return { erro: 409, mensagem: 'Esta pesquisa já encerrou.' };
  }
  return { pesquisa: data };
}

// ── GET /catalogo/:nome · listas longas com busca ─────────────────────────
//
// As opções destas perguntas NÃO moram no jsonb da pesquisa: 1.911 igrejas em
// cada requisição do questionário seria absurdo (o questionário já tem 4 KB).
//
// Dois catálogos, com naturezas diferentes de propósito:
//  · igrejas_rj    → arquivo no repo, buscado EM MEMÓRIA. Não muda durante um
//                    culto e não vale uma ida ao banco por tecla digitada.
//  · grupos_ativos → banco, porque grupo abre e fecha. Busca por nome do grupo
//                    OU pelo nome do líder — pedido do Matheus: quem não lembra
//                    o nome do grupo lembra de quem lidera.
const MIN_BUSCA = 2;
const TETO_CATALOGO = 20;

let _igrejas = null;
function igrejas() {
  if (_igrejas) return _igrejas;
  try {
    const doc = require('../data/igrejasRJ.json');
    _igrejas = (doc.igrejas || []).map((i) => ({
      rotulo: i.nome,
      detalhe: [i.bairro, i.cidade].filter(Boolean).join(' · ') || null,
      chave: chaveBusca(`${i.nome} ${i.cidade || ''} ${i.bairro || ''}`),
    }));
  } catch { _igrejas = []; }
  return _igrejas;
}

function chaveBusca(v) {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

router.get('/catalogo/:nome', submitLimiter, async (req, res) => {
  try {
    const nome = String(req.params.nome || '').trim();
    const q = chaveBusca(req.query.q);
    if (q.length < MIN_BUSCA) return res.json({ itens: [] });

    if (nome === 'igrejas_rj') {
      // Todos os termos precisam aparecer: "batista laranjal" acha
      // "Igreja Batista de Laranjal" sem depender da ordem.
      const termos = q.split(' ').filter(Boolean);
      const achados = [];
      for (const i of igrejas()) {
        if (termos.every((t) => i.chave.includes(t))) {
          achados.push({ valor: i.rotulo, rotulo: i.rotulo, detalhe: i.detalhe });
          if (achados.length >= TETO_CATALOGO) break;
        }
      }
      res.set('Cache-Control', 'public, s-maxage=3600');
      return res.json({ itens: achados, incompleto: true });
    }

    if (nome === 'grupos_ativos') {
      const termo = `%${String(req.query.q || '').trim()}%`;
      const { data, error } = await supabase
        .from('mem_grupos')
        .select('id, nome, bairro, dia_semana, lider:mem_membros!mem_grupos_lider_id_fkey(nome)')
        .eq('ativo', true).is('deleted_at', null)
        .or(`nome.ilike.${termo}`)
        .order('nome').limit(TETO_CATALOGO);
      if (error) return res.json({ itens: [] });

      // Busca pelo LÍDER: uma segunda consulta, porque `or` do PostgREST não
      // atravessa relação embutida. Duas consultas curtas e indexadas valem mais
      // que uma view nova só para isto.
      const { data: porLider } = await supabase
        .from('mem_grupos')
        // `!inner` é obrigatório: sem ele o PostgREST TRAZ a relação mas não
        // FILTRA por ela, e a busca por líder devolveria todos os grupos.
        .select('id, nome, bairro, dia_semana, lider:mem_membros!mem_grupos_lider_id_fkey!inner(nome)')
        .eq('ativo', true).is('deleted_at', null)
        .ilike('lider.nome', termo)
        .order('nome').limit(TETO_CATALOGO);

      const DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
      const vistos = new Set();
      const itens = [];
      for (const g of [...(data || []), ...(porLider || [])]) {
        if (vistos.has(g.id)) continue;
        vistos.add(g.id);
        itens.push({
          valor: g.nome,
          rotulo: g.nome,
          detalhe: [
            g.lider?.nome ? `líder ${g.lider.nome}` : null,
            g.bairro,
            typeof g.dia_semana === 'number' ? DIA[g.dia_semana] : null,
          ].filter(Boolean).join(' · ') || null,
        });
        if (itens.length >= TETO_CATALOGO) break;
      }
      return res.json({ itens });
    }

    return res.status(404).json({ error: 'Catálogo não encontrado' });
  } catch (e) {
    console.error('[PUBLIC CENSO] catalogo:', e.message);
    res.json({ itens: [] });
  }
});

// ── GET /:slug · o questionário ───────────────────────────────────────────
router.get('/:slug', submitLimiter, async (req, res) => {
  try {
    const r = await carregarPesquisaAberta(req.params.slug);
    if (r.erro) return res.status(r.erro).json({ error: r.mensagem });
    const p = r.pesquisa;
    // 30s de cache na borda: no pico do culto centenas de aparelhos pedem o
    // MESMO questionário no mesmo minuto. Mesmo truque do publicNps.
    res.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    res.json({
      slug: p.slug,
      titulo: p.titulo,
      subtitulo: p.subtitulo,
      perguntas: p.perguntas || [],
      config: p.config || {},
      consentimento_texto: p.consentimento_texto,
    });
  } catch (e) { res.status(500).json({ error: 'Não foi possível carregar a pesquisa.' }); }
});

// ── POST /:slug/prefill · atalho de identificação (opcional) ───────────────
// A pessoa NÃO precisa disto para responder: o próprio formulário pede nome,
// telefone e e-mail. Isto só poupa digitação de quem já está na base — e é o
// que dá `identificado_por='cpf_nascimento'`, a chave forte que autoriza o
// censo a corrigir o cadastro depois.

/**
 * Monta os valores de pré-preenchimento a partir do cadastro.
 *
 * Só devolve o que o questionário DECLARA pré-preencher (`preenche_de`) — a
 * lista de campos não vive aqui, vive no questionário, então adicionar uma
 * pergunta pré-preenchida não exige mexer nesta rota.
 *
 * ⚠️ O `casarComOpcao` é o que impede o bug de 07/08: o cadastro guarda
 * `estado_civil` como 'casado' e a opção é 'Casado(a)'. Devolver o valor cru
 * deixava a pergunta sem nada marcado, e a pessoa achava que o "buscar meu
 * cadastro" não tinha funcionado.
 */
function valoresPreenchidos(pesquisa, membro) {
  const doCadastro = {
    cpf: membro.cpf ? String(membro.cpf).replace(/\D/g, '') : null,
    nome: membro.nome, data_nascimento: membro.data_nascimento,
    telefone: membro.telefone, email: membro.email, estado_civil: membro.estado_civil,
    cidade: membro.cidade, bairro: membro.bairro, profissao: membro.profissao,
  };
  const valores = {};
  for (const q of pesquisa.perguntas || []) {
    if (!q.preenche_de) continue;
    const bruto = doCadastro[q.preenche_de];
    if (bruto === null || bruto === undefined || bruto === '') continue;
    if (Array.isArray(q.opcoes) && q.opcoes.length) {
      const casado = casarComOpcao(bruto, q.opcoes);
      // Sem correspondência não inventamos: a pessoa escolhe. Marcar a opção
      // errada por ela seria pior que não marcar nada.
      if (casado) valores[q.id] = casado;
    } else {
      valores[q.id] = String(bruto);
    }
  }
  return valores;
}

router.post('/:slug/prefill', lookupLimiter, async (req, res) => {
  // Resposta neutra ÚNICA. Toda saída sem sucesso usa exatamente este corpo —
  // não existe caminho que diferencie "CPF não existe" de "existe com outro
  // nascimento". Diferenciar transformaria isto num validador de CPF.
  const neutra = { encontrado: false };
  try {
    const r = await carregarPesquisaAberta(req.params.slug);
    if (r.erro) return res.status(r.erro).json({ error: r.mensagem });

    // ── Atalho do APP: a pessoa JÁ está autenticada ────────────────────────
    // O app manda o token de identidade que o próprio backend emitiu para a
    // sessão dela. Pedir CPF + nascimento a quem acabou de fazer login com
    // senha seria teatro de segurança: mais atrito, zero garantia a mais — o
    // token é assinado e o CPF é digitável por qualquer um.
    const idDoToken = verificarTokenIdentidade(req.body?.identidade);
    if (idDoToken) {
      const { data: m } = await supabase.from('mem_membros')
        .select('id, nome, cpf, telefone, email, data_nascimento, estado_civil, cidade, bairro, profissao')
        .eq('id', idDoToken).eq('active', true).is('deleted_at', null).maybeSingle();
      if (!m) return res.json(neutra);
      const ja = await acharRespostaDaPessoa({
        pesquisaId: r.pesquisa.id, membroId: m.id, cpf: m.cpf,
      });
      return res.json({
        encontrado: true,
        ja_respondeu: !!ja,
        respondida_em: ja?.concluida_em || null,
        // Devolve o MESMO token que recebeu: quem já provou identidade não
        // precisa de um novo, e emitir outro só aumentaria a superfície.
        identidade: req.body.identidade,
        valores: valoresPreenchidos(r.pesquisa, m),
      });
    }

    const cpf = normalizarCpf(req.body?.cpf);
    if (!cpfValido(cpf)) return res.json(neutra);
    const nascimento = String(req.body?.data_nascimento || '').trim();
    const temNascimento = /^\d{4}-\d{2}-\d{2}$/.test(nascimento);

    const { data, error } = await supabase
      .from('mem_membros')
      .select('id, nome, telefone, email, data_nascimento, estado_civil, cidade, bairro, profissao')
      .eq('cpf', cpf).eq('active', true).is('deleted_at', null)
      .maybeSingle();
    if (error || !data) return res.json(neutra);

    // ESTÁGIO 1 — só o CPF: devolve identificação MASCARADA, para a tela poder
    // perguntar "você é Matheus R. T.?". Nada de dado real ainda.
    if (!temNascimento) {
      return res.json({
        encontrado: true,
        confirmar: {
          nome_mascarado: nomeMascarado(data.nome),
          telefone_mascarado: mascararTelefone(data.telefone),
        },
      });
    }

    // ESTÁGIO 2 — CPF + nascimento conferem: agora sim o dado sai.
    // Nascimento errado devolve a MESMA resposta neutra de "não existe".
    if (data.data_nascimento !== nascimento) return res.json(neutra);

    // Já respondeu? Avisa em vez de deixar a pessoa preencher 93 campos para
    // tomar um erro no fim.
    //
    // Regra COMPARTILHADA com o endpoint do app (services/censoJaRespondeu.js):
    // olha membro_id E CPF. Só por membro_id, quem respondeu no culto e ainda
    // não passou pelo pós-processamento seria convidado a responder de novo.
    const jaTem = await acharRespostaDaPessoa({
      pesquisaId: r.pesquisa.id, membroId: data.id, cpf,
    });

    const token = gerarTokenIdentidade(data.id);
    if (!token) return res.json(neutra);   // fail-closed sem segredo configurado

    // Devolve só o que a PRÓPRIA pessoa acabou de provar que é dela, e só o que
    // o questionário declara pré-preencher (`preenche_de`).
    //
    // ⚠️ Devolvemos por PERGUNTA, não por campo, e já CASADO com as opções: o
    res.json({
      encontrado: true,
      ja_respondeu: !!jaTem,
      respondida_em: jaTem?.concluida_em || null,
      identidade: token,
      valores: valoresPreenchidos(r.pesquisa, { ...data, cpf }),
    });
  } catch (e) { res.json(neutra); }
});

// ── POST /:slug/parcial · salvar-e-retomar ────────────────────────────────
// Grava o rascunho no servidor conforme a pessoa avança. Best-effort: se
// falhar, o formulário continua (o aparelho tem a própria cópia).
router.post('/:slug/parcial', submitLimiter, async (req, res) => {
  try {
    const r = await carregarPesquisaAberta(req.params.slug);
    if (r.erro) return res.status(r.erro).json({ error: r.mensagem });

    const respostas = req.body?.respostas;
    if (!respostas || typeof respostas !== 'object') return res.status(400).json({ error: 'Respostas inválidas' });

    const rascunhoId = req.body?.rascunho_id;
    const segredo = req.body?.retomar;
    const agora = new Date().toISOString();

    if (ehUuid(rascunhoId) && segredo) {
      const { data: atual } = await supabase
        .from('cen_resposta').select('id, retomar_hash, concluida_em')
        .eq('id', rascunhoId).eq('pesquisa_id', r.pesquisa.id).is('deleted_at', null)
        .maybeSingle();
      if (!atual || !retomadaConfere(segredo, atual.retomar_hash)) {
        return res.status(404).json({ error: 'Rascunho não encontrado' });
      }
      // Rascunho de resposta já concluída não é atualizado — a pessoa terminou.
      if (atual.concluida_em) return res.json({ ok: true, concluida: true });
      await supabase.from('cen_resposta')
        .update({ payload: respostas, ultima_atividade_em: agora })
        .eq('id', atual.id);
      return res.json({ ok: true, rascunho_id: atual.id });
    }

    // Primeiro salvamento: cria o rascunho e devolve o segredo de retomada.
    const novoSegredo = gerarSegredoRetomada();
    const canal = CANAIS.includes(req.body?.canal) ? req.body.canal : 'qr';
    const { data, error } = await supabase.from('cen_resposta').insert({
      pesquisa_id: r.pesquisa.id,
      canal,
      identificado_por: 'anonimo',      // resolvido só na conclusão
      payload: respostas,
      ip_hash: ipHash(req),
      retomar_hash: hashRetomada(novoSegredo),
      ultima_atividade_em: agora,
    }).select('id').single();
    if (error) return res.status(400).json({ error: 'Não foi possível salvar o rascunho' });
    res.json({ ok: true, rascunho_id: data.id, retomar: novoSegredo });
  } catch (e) { res.status(500).json({ error: 'Não foi possível salvar o rascunho' }); }
});

// ── POST /:slug/retomar · continuar de onde parou ─────────────────────────
router.post('/:slug/retomar', submitLimiter, async (req, res) => {
  try {
    const r = await carregarPesquisaAberta(req.params.slug);
    if (r.erro) return res.status(r.erro).json({ error: r.mensagem });
    const { rascunho_id: id, retomar } = req.body || {};
    if (!ehUuid(id) || !retomar) return res.status(404).json({ error: 'Rascunho não encontrado' });

    const { data } = await supabase
      .from('cen_resposta').select('id, payload, retomar_hash, concluida_em')
      .eq('id', id).eq('pesquisa_id', r.pesquisa.id).is('deleted_at', null)
      .maybeSingle();
    if (!data || !retomadaConfere(retomar, data.retomar_hash)) {
      return res.status(404).json({ error: 'Rascunho não encontrado' });
    }
    res.json({ ok: true, respostas: data.payload || {}, concluida: !!data.concluida_em });
  } catch (e) { res.status(500).json({ error: 'Não foi possível retomar' }); }
});

// ── POST /:slug/responder · o envio ───────────────────────────────────────
router.post('/:slug/responder', submitLimiter, async (req, res) => {
  try {
    // Honeypot: bot preenche campo escondido. Responde 201 FALSO — 400 ensinaria
    // o bot a não preencher na próxima. Mesmo padrão do publicMembresia.
    if (String(req.body?.website || '').trim()) return res.status(201).json({ ok: true });

    const r = await carregarPesquisaAberta(req.params.slug);
    if (r.erro) return res.status(r.erro).json({ error: r.mensagem });
    const pesquisa = r.pesquisa;

    const respostas = req.body?.respostas;
    if (!respostas || typeof respostas !== 'object') return res.status(400).json({ error: 'Respostas inválidas' });

    const envioId = String(req.body?.envio_id || '').trim().slice(0, 64) || null;
    // IDEMPOTÊNCIA — a fila offline re-tenta e o sendBeacon do pagehide manda um
    // envio extra. Sem isto o total do censo vem inflado.
    //
    // ⚠️ NÃO consultamos antes de inserir: isso custaria uma ida ao banco em
    // TODO envio para proteger o caso raro. A UNIQUE parcial
    // (pesquisa_id, envio_id) já é a garantia; o custo extra fica só na
    // re-tentativa, que é onde ele deve estar. Num culto de 2.500 pessoas, uma
    // query por envio é 2.500 queries a menos.

    // Consentimento é pré-requisito, não formalidade: o censo coleta convicção
    // religiosa e saúde emocional, que são dados sensíveis.
    if (req.body?.consentimento !== true) {
      return res.status(400).json({ error: 'É preciso aceitar o aviso de privacidade para enviar.' });
    }

    // O questionário é revalidado aqui: se alguém publicou uma versão inválida,
    // é melhor recusar o envio do que gravar resposta que nenhum gráfico lê.
    const v = validarPerguntas(pesquisa.perguntas || []);
    if (!v.ok) return res.status(500).json({ error: 'Questionário indisponível no momento.' });

    const { itens, faltando, cuidados } = montarItens({ perguntas: v.perguntas, respostas });
    if (faltando.length) {
      return res.status(400).json({
        error: 'Faltam respostas obrigatórias.',
        faltando: faltando.map((f) => f.id),
      });
    }

    // ── Identificação, em cascata (a primeira que resolve, vence) ──────────
    let membroId = null;
    let identificadoPor = 'anonimo';
    let matchedBy = null;
    let nomeDeclarado = null;
    let contatoDeclarado = null;

    const doToken = verificarTokenIdentidade(req.body?.identidade);
    if (doToken) { membroId = doToken; identificadoPor = 'cpf_nascimento'; matchedBy = 'cpf'; }

    // Campos que o questionário declara guardar (`preenche_de`). Funciona mesmo
    // se os ids das perguntas mudarem de nome.
    const porCampo = {};
    for (const p of v.perguntas) {
      if (p.preenche_de && respostas[p.id] !== undefined) porCampo[p.preenche_de] = respostas[p.id];
    }

    // ⚠️ O MATCHER NÃO RODA AQUI por padrão.
    //
    // Medido: matcher + reconciliação eram 7 das 8,3 idas ao banco por resposta.
    // Com 2.500 pessoas no culto isso é ~17.500 queries de trabalho DERIVADO
    // com a pessoa olhando a tela. A resposta é o que não dá para pedir de novo;
    // o vínculo é derivável do payload a qualquer momento. Então gravamos a
    // resposta e a linha sai marcada como pendente (`pos_processado_em IS NULL`)
    // para o passe posterior.
    //
    // Quem usou o atalho de CPF já veio com `membro_id` pelo token, a custo zero
    // de query, e segue protegido pela UNIQUE contra resposta repetida.
    //
    // `config.vincular_na_hora: true` volta ao comportamento síncrono — útil
    // numa pesquisa pequena, onde a comodidade vale mais que a latência.
    // ⚠️ CPF É CHAVE FORTE e o censo passou a exigi-lo (07/08). Casar por CPF é
    // UMA consulta por índice — nada a ver com o matcher difuso (3 a 4 consultas
    // e heurística de nome). Então este vínculo acontece NA HORA, mesmo no modo
    // diferido: é o que faz a UNIQUE (pesquisa_id, membro_id) voltar a proteger
    // contra resposta repetida durante o culto, e o que garante que a resposta
    // aparece na ficha da pessoa sem esperar o pós-processamento.
    const cpfInformado = normalizarCpf(porCampo.cpf);
    if (!membroId && cpfInformado && cpfValido(cpfInformado)) {
      try {
        const { data: m } = await supabase
          .from('mem_membros').select('id')
          .eq('cpf', cpfInformado).eq('active', true).is('deleted_at', null)
          .maybeSingle();
        if (m?.id) { membroId = m.id; matchedBy = 'cpf'; identificadoPor = 'cpf_nascimento'; }
      } catch { /* indisponível não impede a resposta de entrar */ }
    }

    const vincularAgora = pesquisa.config?.vincular_na_hora === true;
    if (!membroId && vincularAgora) {
      try {
        const hit = await acharMembroGuardado({
          email: porCampo.email,
          telefone: porCampo.telefone,
          nome: porCampo.nome,
          dataNascimento: porCampo.data_nascimento,
        });
        if (hit?.membro_id) {
          membroId = hit.membro_id;
          matchedBy = hit.matched_by;
          identificadoPor = hit.matched_by === 'cpf' ? 'cpf_nascimento' : 'nome_nascimento';
        }
      } catch { /* matcher indisponível não impede a resposta de entrar */ }
    }

    // ⚠️ CRIA A PESSOA quando o CPF é válido e não existe na base (decisão do
    // Matheus, 07/08: "se o sistema não achar o cadastro dela, ele já vai criar
    // um automaticamente quando ela enviar o censo").
    //
    // É o que as outras 8 portas públicas já fazem, e o `acharOuCriarGuardado` é
    // o caminho guardado: entra como VISITANTE (nunca membro — promover é ato
    // humano), registra os contatos e eleva par ambíguo para revisão em vez de
    // fundir. Com CPF obrigatório e validado, a chave é forte e o risco de
    // duplicata é o mesmo das outras portas.
    //
    // Ganho colateral que importa: com membro_id SEMPRE preenchido, a UNIQUE
    // (pesquisa_id, membro_id) passa a barrar resposta repetida de qualquer
    // pessoa — antes o anônimo escapava —, e toda resposta nasce ligada à ficha.
    if (!membroId && cpfInformado && cpfValido(cpfInformado)) {
      try {
        const criado = await acharOuCriarGuardado({
          cpf: cpfInformado,
          nome: porCampo.nome,
          email: porCampo.email,
          telefone: porCampo.telefone,
          dataNascimento: porCampo.data_nascimento,
          status: 'visitante',
          origem: 'censo',
          origemId: envioId || null,
        }, { soChaveForte: true });   // só CPF liga; nada de heurística de nome
        if (criado?.membro_id) {
          membroId = criado.membro_id;
          matchedBy = 'cpf';
          identificadoPor = 'cpf_nascimento';
        }
      } catch (e) { console.error('[PUBLIC CENSO] criar pessoa:', e.message); }
    }

    // Identidade DECLARADA: guardada SEMPRE que não houver membro vinculado (o
    // criador pode ter falhado, ou a pessoa pode ter vindo sem CPF por uma
    // pesquisa que não o exige). É o que faz a fila de cuidado ter para quem
    // ligar mesmo sem vínculo.
    if (!membroId) {
      nomeDeclarado = porCampo.nome ? String(porCampo.nome).trim().slice(0, 160) : null;
      contatoDeclarado = porCampo.telefone || porCampo.email
        ? String(porCampo.telefone || porCampo.email).trim().slice(0, 160) : null;
    }

    const agora = new Date().toISOString();
    const iniciada = req.body?.iniciada_em && !Number.isNaN(Date.parse(req.body.iniciada_em))
      ? new Date(req.body.iniciada_em).toISOString() : agora;
    const duracao = Math.max(0, Math.round((Date.parse(agora) - Date.parse(iniciada)) / 1000)) || null;

    const linha = {
      pesquisa_id: pesquisa.id,
      membro_id: membroId,
      canal: CANAIS.includes(req.body?.canal) ? req.body.canal : 'qr',
      identificado_por: identificadoPor,
      nome_declarado: nomeDeclarado,
      contato_declarado: contatoDeclarado,
      payload: respostas,
      iniciada_em: iniciada,
      concluida_em: agora,
      duracao_seg: duracao,
      dispositivo: String(req.headers['user-agent'] || '').slice(0, 200) || null,
      ip_hash: ipHash(req),
      consentimento_texto: pesquisa.consentimento_texto,
      consentimento_em: agora,
      envio_id: envioId,
      ultima_atividade_em: agora,
      // NULL = entra na fila do pós-processamento (vincular pessoa + corrigir
      // cadastro). No modo síncrono o trabalho já foi feito aqui.
      pos_processado_em: vincularAgora ? agora : null,
    };

    // Retomada: se havia rascunho, ele VIRA a resposta (não cria outra linha).
    let respostaId = null;
    const rascunhoId = req.body?.rascunho_id;
    if (ehUuid(rascunhoId) && req.body?.retomar) {
      const { data: rascunho } = await supabase
        .from('cen_resposta').select('id, retomar_hash, concluida_em')
        .eq('id', rascunhoId).eq('pesquisa_id', pesquisa.id).is('deleted_at', null)
        .maybeSingle();
      if (rascunho && retomadaConfere(req.body.retomar, rascunho.retomar_hash)) {
        if (rascunho.concluida_em) return res.json({ ok: true, resposta_id: rascunho.id, repetido: true });
        const { error } = await supabase.from('cen_resposta').update(linha).eq('id', rascunho.id);
        if (!error) respostaId = rascunho.id;
      }
    }

    const veioDeRascunho = !!respostaId;
    if (!respostaId) {
      const { data, error } = await supabase.from('cen_resposta').insert(linha).select('id').single();
      if (error) {
        if (error.code === '23505') {
          // Duas UNIQUEs podem barrar aqui, e a diferença importa para a pessoa:
          //   · envio_id  → é a MESMA resposta chegando de novo (fila offline
          //     re-tentando). Devolve a que já existe: 2xx, senão a fila
          //     re-tenta para sempre.
          //   · membro_id → é a segunda resposta da MESMA PESSOA. 409.
          // Só aqui gastamos a consulta extra — no caminho raro, não no comum.
          if (envioId) {
            const { data: jaEnviado } = await supabase
              .from('cen_resposta').select('id')
              .eq('pesquisa_id', pesquisa.id).eq('envio_id', envioId)
              .maybeSingle();
            if (jaEnviado) return res.json({ ok: true, resposta_id: jaEnviado.id, repetido: true });
          }
          return res.status(409).json({ error: 'Você já respondeu este censo. Obrigado!', ja_respondeu: true });
        }
        return res.status(400).json({ error: 'Não foi possível registrar sua resposta.' });
      }
      respostaId = data.id;
    }

    // ── Itens ──
    // Só limpamos quando a resposta veio de um RASCUNHO: aí pode haver item
    // antigo de uma condicional que a pessoa mudou no caminho. Numa resposta
    // nova não há nada para apagar, e um DELETE por envio seriam 2.500 queries
    // inúteis no culto.
    if (veioDeRascunho) {
      await supabase.from('cen_resposta_item').delete().eq('resposta_id', respostaId);
    }
    const porId = new Map(v.perguntas.map((p) => [p.id, p]));
    const linhas = itens.map((i) => ({
      resposta_id: respostaId,
      pesquisa_id: pesquisa.id,
      pergunta_id: i.pergunta_id,
      pergunta_texto: i.pergunta_texto,
      tipo: i.tipo,
      valor_texto: i.valor_texto,
      valor_num: i.valor_num,
      valor_opcoes: i.valor_opcoes,
      sensivel: i.sensivel === true,
      acao: porId.get(i.pergunta_id)?.acao === 'cuidado' ? 'cuidado' : null,
    }));
    if (linhas.length) {
      const { error } = await supabase.from('cen_resposta_item').insert(linhas);
      if (error) console.error('[PUBLIC CENSO] itens:', error.message);
    }

    // ── Gatilhos de cuidado ──
    // Pedido de ajuda entra na fila. `ignoreDuplicates` porque a UNIQUE
    // (resposta_id, tipo) já garante um por tipo — re-tentativa não duplica.
    if (cuidados.length) {
      const { error } = await supabase.from('cen_cuidado').upsert(
        cuidados.map((c) => ({
          pesquisa_id: pesquisa.id,
          resposta_id: respostaId,
          membro_id: membroId,
          tipo: c.tipo,
          status: 'aberto',
        })),
        { onConflict: 'resposta_id,tipo', ignoreDuplicates: true },
      );
      if (error) console.error('[PUBLIC CENSO] cuidado:', error.message);
    }

    // ── Atualiza o cadastro ──
    // Só no modo síncrono. No modo padrão isto acontece no pós-processamento,
    // pelas MESMAS regras (`reconciliarCenso`: vazio preenche, igual no-op,
    // divergente vira conflito humano; nunca funde, nunca promove a membro).
    let cadastro = null;
    if (vincularAgora && membroId && matchedBy) {
      try {
        // Traduz para o vocabulário do BANCO. Sem isto, gravaríamos 'Casado(a)'
        // numa coluna que só tem 'casado' — criando um segundo vocabulário em
        // silêncio, e depois todo filtro por estado civil passa a mentir.
        const dados = loteParaBanco(porCampo);
        delete dados.nome;   // `nome` é chave de match e o serviço já o ignora
        cadastro = await reconciliarCenso({ membroId, matchedBy, dados, origemId: respostaId });
      } catch (e) { console.error('[PUBLIC CENSO] reconciliar:', e.message); }
    }

    res.status(201).json({
      ok: true,
      resposta_id: respostaId,
      identificado: !!membroId,
      cuidados: cuidados.map((c) => c.tipo),
      cadastro_conflitos: cadastro?.conflitos?.length || 0,
    });
  } catch (e) {
    console.error('[PUBLIC CENSO] responder:', e.message);
    res.status(500).json({ error: 'Não foi possível registrar sua resposta.' });
  }
});

module.exports = router;
