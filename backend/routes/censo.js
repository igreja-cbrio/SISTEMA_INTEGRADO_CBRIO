// Módulo Censo · plataforma de pesquisas (censo demográfico, pulso, evento).
// F0: CRUD do questionário + foto agregada. A coleta pública é a F1
// (routes/publicCenso.js) e os dashboards a F3.
//
// Régua de nível (mesma da membresia — agregado ≠ nominal):
//   1 = ver a lista de pesquisas e números AGREGADOS
//   2 = ver resposta NOMINAL (quem respondeu o quê)
//   4 = criar/editar/publicar pesquisa
//   5 = apagar
const express = require('express');
const router = express.Router();
const { supabase } = require('../utils/supabase');
const { authenticate, authorizeModule, getEffectiveLevel } = require('../middleware/auth');
const {
  TIPOS, FORMATOS, CUIDADO_TIPOS, validarPerguntas, slugificar,
} = require('../utils/censoPerguntas');
const { acharMembroGuardado } = require('../services/membroMatch');
const { reconciliarCenso } = require('../services/censoReconciliar');

router.use(authenticate);

const TIPOS_PESQUISA = ['censo', 'pulso', 'evento', 'nps', 'outro'];

// Texto de consentimento default. Convicção religiosa é dado SENSÍVEL (LGPD
// art. 5º II): o respondente precisa saber o que está sendo coletado e para
// quê antes de responder. O texto ACEITO é gravado junto da resposta
// (snapshot) — o texto muda com o tempo, a prova do que ela aceitou não pode.
const CONSENTIMENTO_DEFAULT = [
  'Ao continuar, você autoriza a Comunidade Batista do Rio a usar suas respostas',
  'para conhecer melhor a comunidade e orientar decisões ministeriais.',
  'Seus dados não são compartilhados com terceiros e você pode solicitar a',
  'exclusão a qualquer momento pelo contato@cbrio.org.',
].join(' ');

function limpar(v) {
  return typeof v === 'string' ? v.trim() : v;
}

/**
 * Quem pode ver o bloco sensível com NOME (saúde emocional, casamento, "nunca
 * teve coragem"). NÃO é o nível no módulo: é a lista nomeada em
 * `cen_acesso_sensivel` — hoje 34 cargos têm o módulo censo na matriz, e
 * "Em crise" ao lado do nome circula muito mais do que a pessoa imagina.
 * Super-admin NÃO entra de graça aqui: é o tipo de dado em que "sou admin" não
 * é justificativa. Fail-closed em qualquer erro.
 */
async function podeVerSensivel(profileId) {
  if (!profileId) return false;
  try {
    const { data, error } = await supabase
      .from('cen_acesso_sensivel').select('profile_id')
      .eq('profile_id', profileId).is('revogado_em', null).maybeSingle();
    if (error) return false;
    return !!data;
  } catch { return false; }
}

/** Slug único entre as pesquisas vivas: acrescenta -2, -3… se já existir. */
async function slugLivre(base, ignorarId) {
  const raiz = slugificar(base) || 'pesquisa';
  for (let n = 1; n <= 50; n += 1) {
    const tentativa = n === 1 ? raiz : `${raiz}-${n}`;
    let q = supabase.from('cen_pesquisa').select('id').eq('slug', tentativa).is('deleted_at', null);
    if (ignorarId) q = q.neq('id', ignorarId);
    const { data, error } = await q.maybeSingle();
    if (error && error.code !== 'PGRST116') throw new Error(error.message);
    if (!data) return tentativa;
  }
  return `${raiz}-${Date.now().toString(36)}`;
}

// ── Lista · a foto de cada pesquisa vem da view, não de contagem no front ──
router.get('/pesquisas', authorizeModule('censo', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_cen_pesquisa_stats')
      .select('*')
      .order('ultima_resposta_em', { ascending: false, nullsFirst: false });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/pesquisas/:id', authorizeModule('censo', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cen_pesquisa').select('*')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Pesquisa não encontrada' });

    const { data: stats } = await supabase
      .from('vw_cen_pesquisa_stats').select('*').eq('pesquisa_id', data.id).maybeSingle();
    res.json({ ...data, stats: stats || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Criar ─────────────────────────────────────────────────────────────────
router.post('/pesquisas', authorizeModule('censo', 4), async (req, res) => {
  try {
    const titulo = limpar(req.body?.titulo);
    if (!titulo) return res.status(400).json({ error: 'Título é obrigatório' });

    const tipo = TIPOS_PESQUISA.includes(req.body?.tipo) ? req.body.tipo : 'censo';
    // Pesquisa nova nasce em RASCUNHO, sempre. Publicar é ato separado e
    // explícito — ninguém publica um questionário por acidente.
    const payload = {
      titulo,
      subtitulo: limpar(req.body?.subtitulo) || null,
      tipo,
      status: 'rascunho',
      slug: await slugLivre(req.body?.slug || titulo),
      perguntas: [],
      config: {
        exige_identificacao: req.body?.config?.exige_identificacao !== false,
        permite_anonimo: req.body?.config?.permite_anonimo === true,
        mostrar_progresso: req.body?.config?.mostrar_progresso !== false,
      },
      consentimento_texto: limpar(req.body?.consentimento_texto) || CONSENTIMENTO_DEFAULT,
      criado_por: req.user?.id || null,
    };

    if (Array.isArray(req.body?.perguntas) && req.body.perguntas.length) {
      const v = validarPerguntas(req.body.perguntas);
      if (!v.ok) return res.status(400).json({ error: v.erros.join(' · ') });
      payload.perguntas = v.perguntas;
    }

    const { data, error } = await supabase.from('cen_pesquisa').insert(payload).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Editar ────────────────────────────────────────────────────────────────
router.put('/pesquisas/:id', authorizeModule('censo', 4), async (req, res) => {
  try {
    const { data: atual, error: e0 } = await supabase
      .from('cen_pesquisa').select('id, status, slug')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (e0) return res.status(400).json({ error: e0.message });
    if (!atual) return res.status(404).json({ error: 'Pesquisa não encontrada' });

    const patch = {};
    for (const k of ['titulo', 'subtitulo', 'consentimento_texto']) {
      if (req.body?.[k] !== undefined) patch[k] = limpar(req.body[k]) || null;
    }
    if (req.body?.tipo !== undefined) {
      if (!TIPOS_PESQUISA.includes(req.body.tipo)) return res.status(400).json({ error: 'Tipo inválido' });
      patch.tipo = req.body.tipo;
    }
    for (const k of ['abre_em', 'fecha_em']) {
      if (req.body?.[k] !== undefined) patch[k] = req.body[k] || null;
    }
    if (req.body?.config !== undefined && req.body.config && typeof req.body.config === 'object') {
      patch.config = req.body.config;
    }

    // O slug é a URL do QR impresso. Trocar depois de a pesquisa abrir
    // invalida o material que já está circulando — então só em rascunho.
    if (req.body?.slug !== undefined && slugificar(req.body.slug) !== atual.slug) {
      if (atual.status !== 'rascunho') {
        return res.status(400).json({ error: 'O endereço (slug) só pode mudar enquanto a pesquisa está em rascunho — o QR impresso aponta para ele.' });
      }
      patch.slug = await slugLivre(req.body.slug, atual.id);
    }

    if (req.body?.perguntas !== undefined) {
      const v = validarPerguntas(req.body.perguntas);
      if (!v.ok) return res.status(400).json({ error: v.erros.join(' · ') });
      patch.perguntas = v.perguntas;
    }

    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada para atualizar' });

    const { data, error } = await supabase
      .from('cen_pesquisa').update(patch).eq('id', atual.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Publicar / encerrar / reabrir ─────────────────────────────────────────
router.post('/pesquisas/:id/status', authorizeModule('censo', 4), async (req, res) => {
  try {
    const alvo = String(req.body?.status || '').trim();
    if (!['rascunho', 'aberta', 'encerrada', 'arquivada'].includes(alvo)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    const { data: p, error: e0 } = await supabase
      .from('cen_pesquisa').select('id, status, perguntas, consentimento_texto, abre_em')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (e0) return res.status(400).json({ error: e0.message });
    if (!p) return res.status(404).json({ error: 'Pesquisa não encontrada' });

    // Abrir sem pergunta válida geraria um formulário vazio no culto — o tipo
    // de erro que só se descobre com 300 pessoas de celular na mão.
    if (alvo === 'aberta') {
      const v = validarPerguntas(p.perguntas || []);
      if (!v.ok) return res.status(400).json({ error: `Não é possível abrir: ${v.erros.join(' · ')}` });
      if (!p.consentimento_texto) return res.status(400).json({ error: 'Defina o texto de consentimento antes de abrir.' });
    }

    // Voltar para rascunho com resposta na mesa deixaria o questionário
    // editável por baixo de dado já coletado.
    if (alvo === 'rascunho' && p.status !== 'rascunho') {
      const { count } = await supabase
        .from('cen_resposta').select('id', { count: 'exact', head: true })
        .eq('pesquisa_id', p.id).is('deleted_at', null);
      if ((count || 0) > 0) {
        return res.status(400).json({ error: `Esta pesquisa já tem ${count} resposta(s). Encerre em vez de voltar para rascunho.` });
      }
    }

    const patch = { status: alvo };
    if (alvo === 'aberta' && !p.abre_em) patch.abre_em = new Date().toISOString();
    if (alvo === 'encerrada') patch.fecha_em = new Date().toISOString();

    const { data, error } = await supabase
      .from('cen_pesquisa').update(patch).eq('id', p.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Duplicar · censo 2027 começa do questionário de 2026 ───────────────────
router.post('/pesquisas/:id/duplicar', authorizeModule('censo', 4), async (req, res) => {
  try {
    const { data: base, error: e0 } = await supabase
      .from('cen_pesquisa').select('*')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (e0) return res.status(400).json({ error: e0.message });
    if (!base) return res.status(404).json({ error: 'Pesquisa não encontrada' });

    const titulo = limpar(req.body?.titulo) || `${base.titulo} (cópia)`;
    const { data, error } = await supabase.from('cen_pesquisa').insert({
      titulo,
      subtitulo: base.subtitulo,
      tipo: base.tipo,
      status: 'rascunho',
      slug: await slugLivre(req.body?.slug || titulo),
      perguntas: base.perguntas,
      config: base.config,
      consentimento_texto: base.consentimento_texto,
      criado_por: req.user?.id || null,
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Apagar (soft) ─────────────────────────────────────────────────────────
router.delete('/pesquisas/:id', authorizeModule('censo', 5), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cen_pesquisa')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params.id).is('deleted_at', null)
      .select('id').maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Pesquisa não encontrada' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Tipos de pergunta que o renderer sabe desenhar (alimenta o construtor) ─
router.get('/aux', authorizeModule('censo', 1), async (req, res) => {
  res.json({
    tipos_pergunta: TIPOS,
    tipos_pesquisa: TIPOS_PESQUISA,
    formatos: FORMATOS,
    cuidado_tipos: CUIDADO_TIPOS,
    consentimento_default: CONSENTIMENTO_DEFAULT,
    nivel: getEffectiveLevel(req, 'censo'),
    // DUAS permissões distintas, e a distinção é deliberada:
    //
    //  · pode_ver_sensivel → ler a RESPOSTA do bloco 6 com nome. Só a lista
    //    nomeada. Super-admin NÃO entra de graça: quem respondeu "em crise"
    //    esperava estatística, e "sou admin" não é justificativa.
    //  · pode_ver_cuidado → operar a FILA de pedidos de ajuda. Lista OU
    //    super-admin, porque alguém precisa administrar a fila — e quem pediu
    //    contato espera ser contatado.
    //
    // Antes eu expunha só a primeira e a tela usava ela para as duas coisas, o
    // que bloqueava o super-admin na fila mesmo com o backend liberando
    // (`guardaCuidado`). UI e API discordando é bug, não política.
    pode_ver_sensivel: await podeVerSensivel(req.user?.id),
    pode_ver_cuidado: req.user?.is_super_admin === true || await podeVerSensivel(req.user?.id),
  });
});

// ══════════════════════════════════════════════════════════════════════════
//  RESPOSTAS NOMINAIS · nível 2, com o bloco sensível filtrado
// ══════════════════════════════════════════════════════════════════════════
//
// Régua: agregado é nível 1 (inclui o bloco 6, porque estatística de saúde
// emocional não expõe ninguém). NOMINAL é nível 2 para os 12 blocos, e o bloco
// SENSÍVEL só para quem está em `cen_acesso_sensivel`.
//
// O filtro acontece aqui, no servidor, e não no front: esconder no front é
// maquiagem — o dado já teria saído pela rede.

const CUIDADO_STATUS = ['aberto', 'em_contato', 'concluido', 'sem_retorno'];

/** Remove os itens sensíveis de uma lista de itens de resposta. */
function filtrarSensiveis(itens, podeVer) {
  if (podeVer) return itens || [];
  return (itens || []).filter((i) => i.sensivel !== true);
}

router.get('/respostas', authorizeModule('censo', 2), async (req, res) => {
  try {
    const pesquisaId = String(req.query.pesquisa_id || '').trim();
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });
    const limite = Math.min(Number(req.query.limite) || 100, 500);

    const { data, error } = await supabase
      .from('cen_resposta')
      .select('id, membro_id, nome_declarado, contato_declarado, canal, identificado_por, concluida_em, duracao_seg')
      .eq('pesquisa_id', pesquisaId)
      .not('concluida_em', 'is', null)
      .is('deleted_at', null)
      .order('concluida_em', { ascending: false })
      .limit(limite);
    if (error) return res.status(400).json({ error: error.message });

    // Nome de quem está na base vem de mem_membros; quem não casou tem só o
    // nome declarado. Uma consulta para todos, não uma por linha.
    const ids = [...new Set((data || []).map((r) => r.membro_id).filter(Boolean))];
    const nomes = new Map();
    if (ids.length) {
      const { data: membros } = await supabase
        .from('mem_membros').select('id, nome').in('id', ids);
      for (const m of membros || []) nomes.set(m.id, m.nome);
    }

    res.json((data || []).map((r) => ({
      id: r.id,
      nome: r.membro_id ? (nomes.get(r.membro_id) || '—') : (r.nome_declarado || 'Sem identificação'),
      na_base: !!r.membro_id,
      contato: r.membro_id ? null : r.contato_declarado,
      canal: r.canal,
      identificado_por: r.identificado_por,
      concluida_em: r.concluida_em,
      duracao_seg: r.duracao_seg,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/respostas/:id', authorizeModule('censo', 2), async (req, res) => {
  try {
    const { data: resposta, error } = await supabase
      .from('cen_resposta')
      .select('id, pesquisa_id, membro_id, nome_declarado, contato_declarado, canal, identificado_por, concluida_em, duracao_seg, consentimento_em')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!resposta) return res.status(404).json({ error: 'Resposta não encontrada' });

    const { data: itens } = await supabase
      .from('cen_resposta_item')
      .select('pergunta_id, pergunta_texto, tipo, valor_texto, valor_num, valor_opcoes, sensivel, acao')
      .eq('resposta_id', resposta.id);

    const podeVer = await podeVerSensivel(req.user?.id);
    const visiveis = filtrarSensiveis(itens, podeVer);
    const ocultos = (itens || []).length - visiveis.length;

    let nome = resposta.nome_declarado || 'Sem identificação';
    if (resposta.membro_id) {
      const { data: m } = await supabase
        .from('mem_membros').select('nome').eq('id', resposta.membro_id).maybeSingle();
      nome = m?.nome || '—';
    }

    res.json({
      ...resposta,
      nome,
      itens: visiveis,
      // Diz que existe algo oculto em vez de fingir que a resposta é isso. Quem
      // precisa e não tem acesso sabe a quem pedir.
      itens_sensiveis_ocultos: ocultos,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
//  FILA DE CUIDADO
// ══════════════════════════════════════════════════════════════════════════
//
// Um pedido de acompanhamento familiar, aconselhamento ou oração é, ele próprio,
// dado sensível — e a fila existe justamente com nome e telefone à vista. Então
// o acesso NOMINAL aqui é a mesma lista nomeada do bloco 6, não o nível no
// módulo. Super-admin passa porque alguém precisa administrar.
//
// O RESUMO (contagens, sem PII) é aberto para nível 1: a liderança tem que poder
// ver que existem 40 pedidos abertos sem precisar ver de quem são.
async function guardaCuidado(req, res, next) {
  if (req.user?.is_super_admin === true) return next();
  if (await podeVerSensivel(req.user?.id)) return next();
  return res.status(403).json({
    error: 'A fila de cuidado é restrita à equipe designada para o acompanhamento pastoral.',
  });
}

router.get('/cuidado/resumo', authorizeModule('censo', 1), async (req, res) => {
  try {
    let q = supabase.from('vw_cen_cuidado_resumo').select('*');
    const pesquisaId = String(req.query.pesquisa_id || '').trim();
    if (pesquisaId) q = q.eq('pesquisa_id', pesquisaId);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/cuidado', authorizeModule('censo', 2), guardaCuidado, async (req, res) => {
  try {
    let q = supabase.from('vw_cen_cuidado_fila').select('*');
    const pesquisaId = String(req.query.pesquisa_id || '').trim();
    if (pesquisaId) q = q.eq('pesquisa_id', pesquisaId);
    if (CUIDADO_STATUS.includes(req.query.status)) q = q.eq('status', req.query.status);
    if (req.query.tipo) q = q.eq('tipo', String(req.query.tipo));
    // Mais antigo primeiro: numa fila de pedido de ajuda, quem esperou mais é
    // quem tem mais urgência — não o último que chegou.
    const { data, error } = await q.order('criado_em', { ascending: true }).limit(500);
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/cuidado/:id', authorizeModule('censo', 2), guardaCuidado, async (req, res) => {
  try {
    const patch = {};
    if (req.body?.status !== undefined) {
      if (!CUIDADO_STATUS.includes(req.body.status)) return res.status(400).json({ error: 'Status inválido' });
      patch.status = req.body.status;
      patch.concluido_em = ['concluido', 'sem_retorno'].includes(req.body.status)
        ? new Date().toISOString() : null;
    }
    if (req.body?.observacao !== undefined) patch.observacao = limpar(req.body.observacao) || null;
    if (req.body?.responsavel_id !== undefined) {
      patch.responsavel_id = req.body.responsavel_id || null;
    }
    // "Assumir": quem clica vira o responsável, sem precisar se escolher numa lista.
    if (req.body?.assumir === true) patch.responsavel_id = req.user?.id || null;

    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada para atualizar' });

    const { data, error } = await supabase
      .from('cen_cuidado').update(patch).eq('id', req.params.id).select('id').maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Pedido não encontrado' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
//  PÓS-PROCESSAMENTO · vincular a pessoa e corrigir o cadastro
// ══════════════════════════════════════════════════════════════════════════
//
// Durante o culto a porta pública só GRAVA a resposta. Medido no teste de carga
// deste módulo: matcher + reconciliação eram 7 das 8,3 idas ao banco por
// resposta — ~17.500 queries de trabalho derivado com 2.500 pessoas esperando a
// tela. A resposta é o que não dá para pedir de novo; o vínculo é derivável do
// payload a qualquer momento.
//
// Fazer depois é melhor por dois motivos, não só mais leve: dá para revisar
// conflito de cadastro com calma, e o matcher acerta mais quando roda sobre o
// lote inteiro (a mesma pessoa que respondeu duas vezes aparece junto).

const LOTE_MAX = 200;

router.get('/pendentes', authorizeModule('censo', 2), async (req, res) => {
  try {
    const pesquisaId = String(req.query.pesquisa_id || '').trim();
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });
    const { count, error } = await supabase
      .from('cen_resposta').select('id', { count: 'exact', head: true })
      .eq('pesquisa_id', pesquisaId)
      .is('pos_processado_em', null).not('concluida_em', 'is', null).is('deleted_at', null);
    if (error) return res.status(400).json({ error: error.message });

    const { count: comErro } = await supabase
      .from('cen_resposta').select('id', { count: 'exact', head: true })
      .eq('pesquisa_id', pesquisaId)
      .not('pos_processo_erro', 'is', null).is('deleted_at', null);

    res.json({ pendentes: count || 0, com_erro: comErro || 0, lote_max: LOTE_MAX });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/pos-processar', authorizeModule('censo', 4), async (req, res) => {
  try {
    const pesquisaId = String(req.body?.pesquisa_id || '').trim();
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });
    const limite = Math.min(Number(req.body?.limite) || LOTE_MAX, LOTE_MAX);

    const { data: pesquisa, error: e0 } = await supabase
      .from('cen_pesquisa').select('id, perguntas').eq('id', pesquisaId).maybeSingle();
    if (e0) return res.status(400).json({ error: e0.message });
    if (!pesquisa) return res.status(404).json({ error: 'Pesquisa não encontrada' });

    const { data: fila, error: e1 } = await supabase
      .from('cen_resposta')
      .select('id, membro_id, payload, identificado_por')
      .eq('pesquisa_id', pesquisaId)
      .is('pos_processado_em', null).not('concluida_em', 'is', null).is('deleted_at', null)
      .order('concluida_em', { ascending: true })
      .limit(limite);
    if (e1) return res.status(400).json({ error: e1.message });
    if (!fila?.length) return res.json({ processadas: 0, vinculadas: 0, conflitos: 0, restantes: 0 });

    // `preenche_de` diz qual pergunta guarda qual campo do cadastro.
    const campoPorPergunta = new Map();
    for (const p of pesquisa.perguntas || []) {
      if (p.preenche_de) campoPorPergunta.set(p.id, p.preenche_de);
    }

    let vinculadas = 0; let conflitos = 0; let falhas = 0;
    for (const r of fila) {
      try {
        const porCampo = {};
        for (const [pid, campo] of campoPorPergunta) {
          const v = r.payload?.[pid];
          if (v !== undefined && v !== null && v !== '') porCampo[campo] = v;
        }

        let membroId = r.membro_id;
        let matchedBy = r.identificado_por === 'cpf_nascimento' ? 'cpf' : null;

        if (!membroId) {
          const hit = await acharMembroGuardado({
            email: porCampo.email, telefone: porCampo.telefone,
            nome: porCampo.nome, dataNascimento: porCampo.data_nascimento,
          });
          if (hit?.membro_id) {
            membroId = hit.membro_id;
            matchedBy = hit.matched_by;
            // Tentar gravar o vínculo pode bater na UNIQUE (pesquisa_id,
            // membro_id): é a MESMA pessoa tendo respondido duas vezes. Não é
            // erro de sistema — a segunda fica sem vínculo e vai para a fila de
            // duplicidade, exatamente como o resto do sistema trata isso.
            const { error } = await supabase.from('cen_resposta')
              .update({
                membro_id: membroId,
                identificado_por: hit.matched_by === 'cpf' ? 'cpf_nascimento' : 'nome_nascimento',
              })
              .eq('id', r.id);
            if (error) {
              if (error.code === '23505') {
                await supabase.from('cen_resposta')
                  .update({ pos_processado_em: new Date().toISOString(),
                    pos_processo_erro: 'Já existe outra resposta desta mesma pessoa nesta pesquisa.' })
                  .eq('id', r.id);
                continue;
              }
              throw new Error(error.message);
            }
            vinculadas += 1;
            // A fila de cuidado precisa saber de quem é o pedido.
            await supabase.from('cen_cuidado').update({ membro_id: membroId }).eq('resposta_id', r.id);
          }
        }

        if (membroId && matchedBy) {
          const dados = { ...porCampo };
          delete dados.nome;   // chave de match; o serviço já o ignora
          const out = await reconciliarCenso({ membroId, matchedBy, dados, origemId: r.id });
          conflitos += out?.conflitos?.length || 0;
        }

        await supabase.from('cen_resposta')
          .update({ pos_processado_em: new Date().toISOString(), pos_processo_erro: null })
          .eq('id', r.id);
      } catch (e) {
        falhas += 1;
        // Guarda o erro e NÃO marca como processada: a linha fica na fila para
        // a próxima rodada. Marcar aqui esconderia a falha para sempre.
        await supabase.from('cen_resposta')
          .update({ pos_processo_erro: String(e.message).slice(0, 400) })
          .eq('id', r.id);
      }
    }

    const { count: restantes } = await supabase
      .from('cen_resposta').select('id', { count: 'exact', head: true })
      .eq('pesquisa_id', pesquisaId)
      .is('pos_processado_em', null).not('concluida_em', 'is', null).is('deleted_at', null);

    res.json({ processadas: fila.length, vinculadas, conflitos, falhas, restantes: restantes || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
