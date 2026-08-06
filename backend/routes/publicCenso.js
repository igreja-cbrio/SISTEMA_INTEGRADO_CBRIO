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
const { acharMembroGuardado } = require('../services/membroMatch');

let reconciliarCenso;
try { ({ reconciliarCenso } = require('../services/censoReconciliar')); }
catch { reconciliarCenso = async () => ({ aplicados: [], conflitos: [] }); }

// ── Dois baldes separados ─────────────────────────────────────────────────
// SUBMISSÃO é generosa: são centenas de pessoas legítimas atrás do mesmo IP.
// LOOKUP é apertado: é o endpoint que um atacante usaria para varrer CPFs.
const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.PUBLIC_CENSO_RATE_LIMIT_MAX || 10000),
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
});
const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.PUBLIC_CENSO_LOOKUP_RATE_LIMIT_MAX || 600),
  standardHeaders: true, legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' },
});

const CANAIS = ['qr', 'app', 'link', 'email', 'whatsapp', 'totem'];

function ipHash(req) {
  const ip = req.ip || req.headers['x-forwarded-for'] || '';
  return crypto.createHash('sha256').update(`censo:${ip}`).digest('hex').slice(0, 32);
}

function ehUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));
}

/** A pesquisa existe e está aberta para receber resposta? */
async function carregarPesquisaAberta(slug) {
  const { data, error } = await supabase
    .from('cen_pesquisa')
    .select('id, slug, titulo, subtitulo, perguntas, config, consentimento_texto, status, abre_em, fecha_em')
    .eq('slug', String(slug || '').trim())
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
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
router.post('/:slug/prefill', lookupLimiter, async (req, res) => {
  // Resposta neutra ÚNICA. Toda saída sem sucesso usa exatamente este corpo —
  // não existe caminho que diferencie "CPF não existe" de "existe com outro
  // nascimento". Diferenciar transformaria isto num validador de CPF.
  const neutra = { encontrado: false };
  try {
    const r = await carregarPesquisaAberta(req.params.slug);
    if (r.erro) return res.status(r.erro).json({ error: r.mensagem });

    const cpf = normalizarCpf(req.body?.cpf);
    const nascimento = String(req.body?.data_nascimento || '').trim();
    if (!cpfValido(cpf) || !/^\d{4}-\d{2}-\d{2}$/.test(nascimento)) return res.json(neutra);

    const { data, error } = await supabase
      .from('mem_membros')
      .select('id, nome, telefone, email, data_nascimento, estado_civil, cidade, bairro, profissao')
      .eq('cpf', cpf).eq('data_nascimento', nascimento)
      .eq('active', true).is('deleted_at', null)
      .maybeSingle();
    if (error || !data) return res.json(neutra);

    // Já respondeu? Avisa em vez de deixar a pessoa preencher 93 campos para
    // tomar um erro no fim.
    const { data: jaTem } = await supabase
      .from('cen_resposta').select('id')
      .eq('pesquisa_id', r.pesquisa.id).eq('membro_id', data.id)
      .not('concluida_em', 'is', null).is('deleted_at', null)
      .maybeSingle();

    const token = gerarTokenIdentidade(data.id);
    if (!token) return res.json(neutra);   // fail-closed sem segredo configurado

    // Devolve só o que a PRÓPRIA pessoa acabou de provar que é dela, e só o que
    // o questionário usa para pré-preencher.
    res.json({
      encontrado: true,
      ja_respondeu: !!jaTem,
      identidade: token,
      valores: {
        nome: data.nome || '',
        data_nascimento: data.data_nascimento || '',
        telefone: data.telefone || '',
        email: data.email || '',
        estado_civil: data.estado_civil || '',
        cidade: data.cidade || '',
        bairro: data.bairro || '',
        profissao: data.profissao || '',
      },
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
    if (envioId) {
      const { data: jaEnviado } = await supabase
        .from('cen_resposta').select('id, concluida_em')
        .eq('pesquisa_id', pesquisa.id).eq('envio_id', envioId)
        .maybeSingle();
      if (jaEnviado?.concluida_em) return res.json({ ok: true, resposta_id: jaEnviado.id, repetido: true });
    }

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

    if (!membroId) {
      // Sem token: casa pelos dados que a própria pessoa digitou. `preenche_de`
      // diz qual pergunta guarda qual campo, então isto funciona mesmo se os
      // ids das perguntas mudarem de nome.
      const porCampo = {};
      for (const p of v.perguntas) {
        if (p.preenche_de && respostas[p.id] !== undefined) porCampo[p.preenche_de] = respostas[p.id];
      }
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

      // Não casou: guarda a identidade DECLARADA. Vira lead de cadastro e faz a
      // fila de cuidado ter para quem ligar — nunca cria pessoa sozinho.
      if (!membroId) {
        nomeDeclarado = porCampo.nome ? String(porCampo.nome).trim().slice(0, 160) : null;
        contatoDeclarado = porCampo.telefone || porCampo.email
          ? String(porCampo.telefone || porCampo.email).trim().slice(0, 160) : null;
      }
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

    if (!respostaId) {
      const { data, error } = await supabase.from('cen_resposta').insert(linha).select('id').single();
      if (error) {
        // A UNIQUE (pesquisa_id, membro_id) da F0 barrando: a pessoa já
        // respondeu. Não é erro de sistema, é a regra funcionando.
        if (error.code === '23505') {
          return res.status(409).json({ error: 'Você já respondeu este censo. Obrigado!', ja_respondeu: true });
        }
        return res.status(400).json({ error: 'Não foi possível registrar sua resposta.' });
      }
      respostaId = data.id;
    }

    // ── Itens ──
    // Regravamos do zero (o rascunho pode ter itens antigos de uma condicional
    // que a pessoa mudou no caminho).
    await supabase.from('cen_resposta_item').delete().eq('resposta_id', respostaId);
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
    // Régua que já existe: campo vazio é preenchido, igual é no-op, divergente
    // em campo já preenchido vira conflito para decisão humana. Nunca funde
    // pessoa, nunca promove a membro. Best-effort: falhar aqui não perde a
    // resposta, que é o dado que não dá para pedir de novo.
    let cadastro = null;
    if (membroId && matchedBy) {
      try {
        const dados = {};
        for (const p of v.perguntas) {
          if (p.preenche_de && respostas[p.id] !== undefined && respostas[p.id] !== '') {
            dados[p.preenche_de] = respostas[p.id];
          }
        }
        delete dados.nome;   // `nome` é chave de match e o serviço já o ignora
        cadastro = await reconciliarCenso({
          membroId, matchedBy, dados, origemId: respostaId,
        });
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
