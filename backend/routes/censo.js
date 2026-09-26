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
  TIPOS, FORMATOS, CUIDADO_TIPOS, TIPOS_CONSENTIMENTO, TIPOS_NUMERICOS, validarPerguntas, slugificar,
  ordenarPorOpcoes, baseSemNeutras, ehNeutra, montarItens,
} = require('../utils/censoPerguntas');
const {
  TIPOS_PARA_BUSCAR, TIPOS_IDENTIFICACAO, classificar, aplicarTeto, cortarDemografia,
} = require('../utils/censoGrafico');
const { montarPotencial, resumoPotencial } = require('../utils/censoPotencial');
const { podeExportar } = require('../utils/podeExportar');
const { fetchAllRows } = require('../utils/pagination');
const { requireCron } = require('../utils/cronAuth');
const { acharMembroGuardado } = require('../services/membroMatch');
const { reconciliarCenso } = require('../services/censoReconciliar');
// Traduz o RÓTULO que a pessoa viu ("Feminino") pro vocabulário da coluna
// ('feminino'). É o mesmo tradutor que o reconciliador usa pra gravar — usar
// outro aqui faria a tela somar 'Feminino' e 'feminino' como duas barras.
const { traduzirParaCadastro } = require('../utils/censoCampoCadastro');
const { montarPerfil, montarCruzamentos, CRUZAMENTOS } = require('../utils/censoRelatorioDados');
const { gerarRelatorio } = require('../services/censoRelatorioIA');
const {
  PORTA: PORTA_CONSENTIMENTO, gravarConsentimentosDoCenso, ligarOptinDoCenso,
} = require('../services/censoConsentimentoGravar');
const { lerRespostasAbertas, TIPOS_PARA_IA } = require('../services/censoLeituraIA');

// ⚠️ AQUI EM CIMA, e não junto do handler: `const` NÃO é hoisted (TDZ), e o
// cron abaixo a usa. Deixada lá embaixo, a linha do cron estouraria
// `ReferenceError` — e SÓ quando o cron rodasse, porque `require()` do módulo
// carrega sem executar. Mesma classe do bug de 26/08 (`conversaRoteamento`
// importando o supabase errado): erro que só aparece na hora.
// ⚠️ 500, não 200 (11/09/2026). Com 200 por pesquisa por rodada, um culto de
// 500 respostas levava 3 HORAS para chegar ao cadastro e ao app do membro — e o
// pedido do Matheus (29/08) era justamente que o dado chegasse lá. 500 cabe
// folgado nos 300s de `maxDuration` da função (medido: ~5 idas ao banco por
// resposta) e o cron passou a rodar de 15 em 15min, não de hora em hora.
const LOTE_MAX = 500;

// ══════════════════════════════════════════════════════════════════════════
//  CRON · aplicar ao cadastro o que o censo coletou
// ══════════════════════════════════════════════════════════════════════════
//
// Pedido do Matheus (29/08): *"quando uma pessoa preenche o censo, os dados do
// app dos membros devem ser atualizados com os dados que ela preencheu"*.
//
// ⚠️ O app JÁ lê `mem_membros` — não faltava nada do lado dele. O que faltava
// era o dado CHEGAR lá: o pós-processamento é MANUAL desde 17/08 e ninguém
// clica. Medido em 29/08: **20 respostas, 7 nunca processadas**, último
// processamento em 24/08 contra a última resposta em 25/08.
//
// ⚠️⚠️ E NÃO virou síncrono no envio, de propósito. Ele é manual porque o
// matcher + reconciliação são ~7 das 8,3 idas ao banco por resposta, e no culto
// isso é a tela travando para todo mundo. De hora em hora resolve o pedido sem
// devolver aquele problema.
//
// ⚠️ Declarado ANTES do `router.use(authenticate)`: o middleware global responde
// 401 ao cron da Vercel, que chega sem sessão. Prefixo `/cron/` + `requireCron`
// é a forma preferida (armadilha registrada no CLAUDE.md).
// ⚠️ `processarPendentes` é declarada mais abaixo e funciona por HOISTING de
// `async function`. NÃO converter para `const` sem mover a declaração.
router.get('/cron/pos-processar', requireCron, async (req, res) => {
  try {
    // Todas as pesquisas com fila, não só a do censo: pulso e NPS usam a mesma
    // tabela, e deixar as outras de fora criaria "processa sozinho, menos as
    // que você não sabe que existem".
    const { data: pend, error } = await supabase.from('cen_resposta')
      .select('pesquisa_id')
      .is('pos_processado_em', null).not('concluida_em', 'is', null).is('deleted_at', null)
      .limit(1000);
    if (error) throw new Error(error.message);

    const ids = [...new Set((pend || []).map(r => r.pesquisa_id).filter(Boolean))];
    if (!ids.length) return res.json({ ok: true, pesquisas: 0, processadas: 0 });

    let processadas = 0; let vinculadas = 0; let conflitos = 0; let falhas = 0;
    let itensReconstruidos = 0;
    const porPesquisa = [];
    for (const id of ids) {
      // ⚠️ Uma pesquisa que falha NÃO derruba as outras: o resultado dela vai no
      // relatório e o laço segue. Sem isso, uma pesquisa com dado torto
      // congelaria a fila de todas.
      try {
        const out = await processarPendentes(id, LOTE_MAX);
        processadas += out.processadas || 0;
        vinculadas += out.vinculadas || 0;
        conflitos += out.conflitos || 0;
        falhas += out.falhas || 0;
        itensReconstruidos += out.itens_reconstruidos || 0;
        porPesquisa.push({ pesquisa_id: id, ...out });
      } catch (e) {
        falhas += 1;
        porPesquisa.push({ pesquisa_id: id, erro: String(e.message).slice(0, 200) });
      }
    }
    res.json({
      ok: true, pesquisas: ids.length, processadas, vinculadas, conflitos, falhas,
      // ⚠️ Zero aqui é o normal. Qualquer número > 0 significa que a porta
      // pública perdeu o insert dos itens de alguém e o cron reparou — vale
      // olhar o log, não é rotina.
      itens_reconstruidos: itensReconstruidos,
      detalhe: porPesquisa,
    });
  } catch (e) {
    console.error('[censo/cron/pos-processar]', e.message);
    res.status(500).json({ error: e.message });
  }
});

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
    consentimento_tipos: TIPOS_CONSENTIMENTO,
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

// ⚠️⚠️ DEVOLVE `total` SEPARADO DA PÁGINA (14/09/2026). O teto era 500 e o
// cliente pedia exatamente 500: com 812 respostas, a aba dizia
// **"500 resposta(s) concluída(s)"** e escondia 312 sem nenhum aviso. Quem lê a
// tela não tem como saber que está vendo um pedaço — foi o Marcos que percebeu,
// comparando com o número do painel.
//
// A régua: a PÁGINA é limitada (a lista tem nome e contato, não dá para mandar
// 10 mil linhas), mas o TOTAL vem do banco por COUNT e é sempre o verdadeiro.
// Número na tela nunca pode ser efeito colateral de paginação.
router.get('/respostas', authorizeModule('censo', 2), async (req, res) => {
  try {
    const pesquisaId = String(req.query.pesquisa_id || '').trim();
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });
    const limite = Math.min(Number(req.query.limite) || 500, 1000);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const { data, error, count } = await supabase
      .from('cen_resposta')
      .select('id, membro_id, nome_declarado, contato_declarado, canal, identificado_por, concluida_em, duracao_seg',
        { count: 'exact' })
      .eq('pesquisa_id', pesquisaId)
      .not('concluida_em', 'is', null)
      .is('deleted_at', null)
      .order('concluida_em', { ascending: false })
      .range(offset, offset + limite - 1);
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

    const itens = (data || []).map((r) => ({
      id: r.id,
      nome: r.membro_id ? (nomes.get(r.membro_id) || '—') : (r.nome_declarado || 'Sem identificação'),
      na_base: !!r.membro_id,
      contato: r.membro_id ? null : r.contato_declarado,
      canal: r.canal,
      identificado_por: r.identificado_por,
      concluida_em: r.concluida_em,
      duracao_seg: r.duracao_seg,
    }));
    // ⚠️ Formato NOVO (objeto). O antigo era o array cru — quem ler este
    // endpoint sem tratar `itens` mostra uma lista vazia, não um erro.
    res.json({ total: count ?? itens.length, offset, limite, itens });
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

// Apaga a resposta de UMA pessoa e a libera para responder de novo.
//
// Pedido do Matheus (10/08): "apagando, é liberado pra ela fazer de novo".
// ⚠️ É SOFT-DELETE, e não é economia de código: `acharRespostaDaPessoa` — a
// régua única do "já respondeu?" — filtra `deleted_at IS NULL` nos DOIS
// caminhos (membro_id e CPF do item). Então marcar a data já devolve o acesso,
// pelo app e pelo QR, sem apagar a prova do que foi respondido nem o
// consentimento que a pessoa deu.
// ⚠️ Os ITENS ficam. Eles são a resposta em si; se um dia alguém apagar por
// engano, `deleted_at = null` restaura tudo. Hard delete aqui seria perda
// irreversível de dado de pesquisa.
// ⚠️ Nível 4: apagar resposta de pesquisa é ato de gestão, não de leitura.
router.delete('/respostas/:id', authorizeModule('censo', 4), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('cen_resposta')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params.id).is('deleted_at', null)
      .select('id, membro_id, pesquisa_id')
      .maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    // Já apagada (ou id inexistente) responde 404 em vez de fingir sucesso —
    // quem clicou duas vezes precisa saber que a segunda não fez nada.
    if (!data) return res.status(404).json({ error: 'Resposta não encontrada (ou já apagada)' });

    console.log('[censo] resposta apagada', {
      resposta: data.id, por: req.user?.email || req.user?.id,
    });
    res.json({ ok: true, id: data.id, liberada: true });
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

/**
 * Aplica ao CADASTRO o que a pessoa preencheu no censo.
 *
 * ⚠️ Extraída do handler (29/08) porque o CRON passou a precisar da mesma
 * lógica. Duas cópias divergiriam, e o sintoma seria "processei pela tela e
 * pelo cron e deu resultado diferente para a mesma resposta".
 *
 * ⚠️ Devolve objeto, NUNCA escreve em `res`: quem decide o HTTP é quem chama.
 * Regra de negócio virando exceção é o que faz um cron ficar vermelho por algo
 * que não é falha (pesquisa apagada, por exemplo).
 */
/**
 * Remonta `cen_resposta_item` de uma resposta que ficou SEM itens.
 *
 * ⚠️⚠️ POR QUE ISTO EXISTE (11/09/2026). O insert dos itens na porta pública
 * era best-effort com `console.error`: se ele falhasse — e é o insert mais
 * gordo do fluxo, ~29 linhas por pessoa — a resposta ficava no banco com o
 * `payload` completo e ZERO linha de item. Todo gráfico do módulo lê item, não
 * payload: a pessoa desaparecia do relatório sem nenhum sinal de erro.
 *
 * O `payload` é a fonte da verdade, então o item é derivado e reconstruível. O
 * pós-processamento passa UMA VEZ por toda resposta concluída (é o que tira ela
 * da fila), então esta checagem cobre 100% delas sem varredura nova.
 *
 * ⚠️ Só age quando a contagem é ZERO. Resposta com item PARCIAL não é
 * reconstruída aqui — a UNIQUE (resposta_id, pergunta_id) recusaria o lote e o
 * certo seria apagar e remontar, que é decisão de gente, não de cron.
 *
 * Devolve quantos itens gravou (0 = nada a fazer).
 */
async function reconstruirItensSeFaltam(resposta, perguntasValidadas) {
  const { count, error: eConta } = await supabase
    .from('cen_resposta_item').select('id', { count: 'exact', head: true })
    .eq('resposta_id', resposta.id);
  if (eConta) throw new Error(eConta.message);
  if (count) return 0;

  const { itens } = montarItens({ perguntas: perguntasValidadas, respostas: resposta.payload || {} });
  if (!itens.length) return 0;

  const porId = new Map(perguntasValidadas.map((p) => [p.id, p]));
  const linhas = itens.map((i) => ({
    resposta_id: resposta.id,
    pesquisa_id: resposta.pesquisa_id,
    pergunta_id: i.pergunta_id,
    pergunta_texto: i.pergunta_texto,
    tipo: i.tipo,
    valor_texto: i.valor_texto,
    valor_num: i.valor_num,
    valor_opcoes: i.valor_opcoes,
    sensivel: i.sensivel === true,
    acao: porId.get(i.pergunta_id)?.acao === 'cuidado' ? 'cuidado' : null,
  }));
  const { error } = await supabase.from('cen_resposta_item').insert(linhas);
  if (error) throw new Error(`itens_nao_reconstruidos: ${error.message}`);
  return linhas.length;
}

async function processarPendentes(pesquisaId, limitePedido) {
    const limite = Math.min(Number(limitePedido) || LOTE_MAX, LOTE_MAX);

    const { data: pesquisa, error: e0 } = await supabase
      .from('cen_pesquisa').select('id, perguntas').eq('id', pesquisaId).maybeSingle();
    if (e0) throw new Error(e0.message);
    if (!pesquisa) return { erro: 'nao_encontrada', processadas: 0, vinculadas: 0, conflitos: 0, falhas: 0, restantes: 0 };

    const { data: fila, error: e1 } = await supabase
      .from('cen_resposta')
      .select('id, pesquisa_id, membro_id, payload, identificado_por, concluida_em')
      .eq('pesquisa_id', pesquisaId)
      .is('pos_processado_em', null).not('concluida_em', 'is', null).is('deleted_at', null)
      .order('concluida_em', { ascending: true })
      .limit(limite);
    if (e1) throw new Error(e1.message);
    if (!fila?.length) return { processadas: 0, vinculadas: 0, conflitos: 0, falhas: 0, restantes: 0 };

    // `preenche_de` diz qual pergunta guarda qual campo do cadastro.
    const campoPorPergunta = new Map();
    for (const p of pesquisa.perguntas || []) {
      if (p.preenche_de) campoPorPergunta.set(p.id, p.preenche_de);
    }

    // Questionário validado UMA vez por lote: é o que `montarItens` consome na
    // reconstrução de itens. Se o questionário estiver inválido não dá para
    // remontar nada — e isso não pode derrubar o vínculo, que não depende dele.
    const val = validarPerguntas(pesquisa.perguntas || []);
    const perguntasValidadas = val.ok ? val.perguntas : null;

    let vinculadas = 0; let conflitos = 0; let falhas = 0; let itensReconstruidos = 0;
    let optinsLigados = 0; let consentimentosGravados = 0;
    // O que o censo REALMENTE escreveu no cadastro, por campo, e o que ficou de
    // fora. Sem isso "12 processadas" não distingue "aplicou tudo" de "aplicou
    // nada" — foi o que fez o estado civil ser descartado sem ninguém notar.
    const aplicadosPorCampo = {}; const descartadosPorMotivo = {};
    for (const r of fila) {
      try {
        // ⚠️ PRIMEIRO a rede de segurança dos itens: uma resposta sem item é
        // invisível em todo gráfico, e esta é a única passagem garantida por
        // resposta (depois dela a linha sai da fila).
        if (perguntasValidadas) {
          itensReconstruidos += await reconstruirItensSeFaltam(r, perguntasValidadas);
        }

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
            // ⚠️ O ledger de consentimento foi gravado no ENVIO, quando a
            // pessoa ainda não era conhecida. Agora que é, a prova passa a
            // apontar para ela — senão o consentimento existe e não tem dono,
            // e nenhuma leitura por pessoa o encontra.
            await supabase.from('inscricao_consentimentos')
              .update({ membro_id: membroId })
              .eq('porta', PORTA_CONSENTIMENTO).eq('ref_id', r.id).is('membro_id', null);
          }
        }

        if (membroId && matchedBy) {
          const dados = { ...porCampo };
          delete dados.nome;   // chave de match; o serviço já o ignora
          const out = await reconciliarCenso({ membroId, matchedBy, dados, origemId: r.id });
          conflitos += out?.conflitos?.length || 0;
          for (const c of out?.aplicados || []) {
            aplicadosPorCampo[c] = (aplicadosPorCampo[c] || 0) + 1;
          }
          for (const d of out?.descartados || []) {
            const k = `${d.campo}:${d.motivo}`;
            descartadosPorMotivo[k] = (descartadosPorMotivo[k] || 0) + 1;
          }
        }

        // ── Consentimento: rede de segurança + opt-in ────────────────────
        // ⚠️ Mesma família da reconstrução de itens: o envio pode ter falhado
        // ao gravar a prova (CHECK, instabilidade), e o `payload` é a fonte da
        // verdade — então remontamos aqui. É idempotente: só grava o que falta.
        if (perguntasValidadas) {
          const cons = await gravarConsentimentosDoCenso({
            respostaId: r.id,
            perguntas: perguntasValidadas,
            respostas: r.payload || {},
            membroId,
          });
          consentimentosGravados += cons.gravados;

          // ⚠️⚠️ O opt-in só pode ser ligado AQUI no caminho padrão: é agora que
          // a pessoa existe. A data é a da RESPOSTA, não a de hoje — carimbar
          // "agora" moveria a prova para o dia em que o cron rodou.
          const opt = await ligarOptinDoCenso({
            membroId, consentimentos: cons.consentimentos, em: r.concluida_em,
          });
          if (opt.ligado) optinsLigados += 1;
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

    return {
      processadas: fila.length, vinculadas, conflitos, falhas, restantes: restantes || 0,
      itens_reconstruidos: itensReconstruidos,
      // ⚠️ `consentimentos_gravados` é o REPARO, não o total coletado: o comum
      // é o envio já ter gravado. Zero aqui é o normal; > 0 é para olhar.
      consentimentos_gravados: consentimentosGravados,
      optins_ligados: optinsLigados,
      cadastro_aplicado: aplicadosPorCampo,
      cadastro_nao_guardado: descartadosPorMotivo,
    };
}

router.post('/pos-processar', authorizeModule('censo', 4), async (req, res) => {
  try {
    const pesquisaId = String(req.body?.pesquisa_id || '').trim();
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });
    const out = await processarPendentes(pesquisaId, req.body?.limite);
    if (out.erro === 'nao_encontrada') return res.status(404).json({ error: 'Pesquisa não encontrada' });
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
//  COBERTURA · quem respondeu, e quem falta
// ══════════════════════════════════════════════════════════════════════════
//
// A pergunta que esta aba responde não é "quantas respostas temos" — é "posso
// confiar nisso?". 300 respostas de 1.798 membros ativos é um retrato de 17% da
// comunidade, e quem lê o resultado precisa saber disso antes de decidir.
//
// O denominador é CALCULADO ao vivo. Número fixo em código envelhece sem avisar,
// e aí a cobertura mente para cima justamente quando a igreja cresce.

router.get('/cobertura', authorizeModule('censo', 1), async (req, res) => {
  try {
    const pesquisaId = req.query.pesquisa_id;
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });

    const [stats, porCanalDia, membros, funil] = await Promise.all([
      supabase.from('vw_cen_pesquisa_stats').select('*').eq('pesquisa_id', pesquisaId).maybeSingle(),
      supabase.from('vw_cen_cobertura').select('*').eq('pesquisa_id', pesquisaId).order('dia'),
      supabase.from('mem_membros').select('id', { count: 'exact', head: true })
        .eq('status', 'membro_ativo').is('deleted_at', null),
      supabase.from('vw_cen_funil_pergunta').select('*').eq('pesquisa_id', pesquisaId)
        .order('respostas', { ascending: true }).limit(400),
    ]);
    if (stats.error) throw stats.error;
    if (porCanalDia.error) throw porCanalDia.error;

    const linhas = porCanalDia.data || [];
    const s = stats.data || {};
    const membrosAtivos = membros.count || 0;
    const concluidas = Number(s.concluidas) || 0;
    const identificadas = Number(s.identificadas) || 0;

    // Agrega no backend em vez de mandar a matriz crua: a tela precisa de duas
    // séries (por canal, por dia), não do produto cartesiano das duas.
    const porCanal = {};
    const porDia = {};
    for (const l of linhas) {
      const c = porCanal[l.canal] || (porCanal[l.canal] = { canal: l.canal, iniciadas: 0, concluidas: 0, identificadas: 0 });
      c.iniciadas += Number(l.iniciadas) || 0;
      c.concluidas += Number(l.concluidas) || 0;
      c.identificadas += Number(l.identificadas) || 0;
      const d = porDia[l.dia] || (porDia[l.dia] = { dia: l.dia, iniciadas: 0, concluidas: 0 });
      d.iniciadas += Number(l.iniciadas) || 0;
      d.concluidas += Number(l.concluidas) || 0;
    }

    // O funil mostra ONDE as pessoas param — a pergunta com menos respostas é a
    // que está cansando ou incomodando. É o dado que melhora o próximo censo.
    const abandono = (funil.data || [])
      .filter((f) => Number(f.pct_do_total) < 92)
      .slice(0, 12);

    res.json({
      pesquisa: {
        titulo: s.titulo || null, status: s.status || null,
        total_perguntas: Number(s.total_perguntas) || 0,
        ultima_resposta_em: s.ultima_resposta_em || null,
      },
      iniciadas: Number(s.iniciadas) || 0,
      concluidas,
      abandonadas: Math.max(0, (Number(s.iniciadas) || 0) - concluidas),
      taxa_conclusao: s.taxa_conclusao ?? null,
      duracao_media_seg: s.duracao_media_seg ?? null,
      identificadas,
      anonimas: Number(s.anonimas) || 0,
      // "Cobertura" é sobre gente reconhecível: uma resposta anônima conta para a
      // estatística, mas não para "alcançamos tal pessoa".
      membros_ativos: membrosAtivos,
      cobertura_pct: membrosAtivos ? Math.round((identificadas / membrosAtivos) * 1000) / 10 : null,
      por_canal: Object.values(porCanal).sort((a, b) => b.concluidas - a.concluidas),
      por_dia: Object.values(porDia).sort((a, b) => String(a.dia).localeCompare(String(b.dia))),
      abandono,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
//  PERFIL · todo gráfico do censo, gerado do próprio questionário
// ══════════════════════════════════════════════════════════════════════════
//
// Nada aqui é escrito à mão por pergunta. A view devolve contagem por valor; o
// motor de perguntas ordena os valores e calcula a base sem as neutras. Efeito
// prático: quando o Matheus adiciona uma pergunta no construtor, ela aparece
// como gráfico sozinha, sem eu tocar em código.
//
// Duas coisas que a view não sabe fazer e por isso ficam aqui:
//  · ORDEM — "Nunca / Raramente / Às vezes / Sempre" não é ordem alfabética. Só
//    quem tem o questionário na mão sabe a ordem certa.
//  · BASE — "Prefiro não dizer" sai do denominador do percentual, senão dilui
//    todo o bloco sensível e a leitura fica errada para baixo.

// Tetos do cinto de segurança. Não são o mecanismo (quem resolve o cap é o
// filtro por tipo) — existem para uma pesquisa futura com centenas de perguntas
// não virar função de 300s, e para o buraco ser DECLARADO se forem atingidos.
const TETO_AGREGADO = 20000;
const TETO_DEMO = 20000;

router.get('/perfil', authorizeModule('censo', 1), async (req, res) => {
  try {
    const pesquisaId = req.query.pesquisa_id;
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });

    // ⚠️⚠️ O FILTRO POR TIPO é o que resolve o cap de 1000 do PostgREST, e é
    // também o que impede o vazamento: sem ele, `nascimento` (tipo `data`) vem
    // com 774 valores distintos — a lista de datas de nascimento da igreja — e
    // o handler antigo a desenharia como 774 barras para nível 1.
    // Medido em 13/09: os tipos que viram gráfico somam ~282 linhas contra as
    // 4.752 da view inteira, e esse número NÃO cresce com respondentes novos.
    // O `fetchAllRows` fica por baixo como cinto de segurança (pesquisa com
    // muitas perguntas de opção), com ORDEM ESTÁVEL — `range()` sem `order()`
    // pula e duplica linha entre páginas.
    const [pesquisa, agregado, demo] = await Promise.all([
      supabase.from('cen_pesquisa').select('id, titulo, perguntas').eq('id', pesquisaId).maybeSingle(),
      fetchAllRows(
        () => supabase.from('vw_cen_item_agregado').select('*')
          .eq('pesquisa_id', pesquisaId)
          .in('tipo', TIPOS_PARA_BUSCAR)
          .order('pergunta_id').order('valor'),
        { max: TETO_AGREGADO },
      ),
      // Corte demográfico: vem da view NOMINAL, então é agregado aqui e o nome
      // nunca sai desta função. É o que permite nível 1 ver o perfil.
      // ⚠️ A lista de colunas é EXPLÍCITA: `select('*')` traria nome, profissão
      // e cidade para a memória do handler.
      fetchAllRows(
        // ⚠️⚠️ `concluida_em NOT NULL` (14/09/2026): a view filtra só
        // `deleted_at`, então ela devolve RASCUNHO junto. O corte demográfico
        // somava 866 pessoas contra 812 respostas — 54 de diferença, que é
        // exatamente o número de quem começou e não terminou. Quem lia a tela
        // via "456 feminino + 344 masculino" e não fechava com o total.
        () => supabase.from('vw_cen_resposta_pessoa')
          .select('resposta_id, membro_id, faixa_etaria, genero, estado_civil, bairro, status_membro')
          .eq('pesquisa_id', pesquisaId)
          .not('concluida_em', 'is', null)
          .order('resposta_id'),
        { max: TETO_DEMO },
      ),
    ]);
    if (pesquisa.error) throw pesquisa.error;
    if (!pesquisa.data) return res.status(404).json({ error: 'Pesquisa não encontrada' });

    // ⚠️ `fetchAllRows` DEGRADA EM ERRO devolvendo o que já leu — o que troca um
    // truncamento silencioso por outro. A conferência contra o COUNT do banco é
    // o que transforma isso em aviso na tela em vez de pergunta sumida.
    const { count: totalAgregado } = await supabase
      .from('vw_cen_item_agregado')
      .select('pergunta_id', { count: 'exact', head: true })
      .eq('pesquisa_id', pesquisaId)
      .in('tipo', TIPOS_PARA_BUSCAR);
    const leituraIncompleta = Number.isFinite(totalAgregado) && agregado.length < totalAgregado;

    const perguntas = validarPerguntas(pesquisa.data.perguntas || []).perguntas;
    const porId = new Map(perguntas.map((p) => [p.id, p]));

    // ── SEXO · UMA barra só, declaração na frente do cadastro ───────────────
    //
    // ⚠️⚠️ O bloco "Sexo" de "Quem respondeu" SEMPRE veio de
    // `mem_membros.genero` — a view faz LEFT JOIN no cadastro —, NUNCA desta
    // pesquisa. Isso passou despercebido enquanto não havia pergunta de sexo:
    // 100% das respostas "tinham sexo" e parecia dado do censo.
    //
    // Quando a pergunta voltou ao questionário (16/09/2026), o laço de
    // `graficos` abaixo desenharia uma SEGUNDA barra de sexo: a mesma coisa
    // medida de dois jeitos, com números diferentes (299 declarações × 910
    // cadastros preenchidos), e ninguém saberia qual citar. Pedido do Marcos:
    // "somar os números dessa que já temos, não criar uma análise extra".
    //
    // A régua: para quem RESPONDEU, vale a declaração; para quem não
    // respondeu, continua valendo o cadastro. Uma barra, todo mundo dentro.
    //
    // ⚠️ E a PROCEDÊNCIA vai declarada na resposta. Medido em 16/09/2026, o
    // sexo do cadastro dos respondentes era 32,6% declarado no censo, 29% de
    // outras portas e **38,4% palpite de IA pelo primeiro nome confirmado em
    // lote**. "58,7% feminino" e "58,7% feminino declarado" não são a mesma
    // frase, e a tela não pode deixar confundir uma com a outra.
    const pSexo = perguntas.find((p) => p.preenche_de === 'genero') || null;
    const sexoDeclarado = new Map(); // resposta_id → vocabulário da coluna
    if (pSexo) {
      const itensSexo = await fetchAllRows(
        () => supabase.from('cen_resposta_item')
          .select('resposta_id, valor_texto')
          .eq('pesquisa_id', pesquisaId)
          .eq('pergunta_id', pSexo.id)
          .order('resposta_id'),
        { max: TETO_DEMO },
      );
      for (const i of itensSexo) {
        // ⚠️ Traduzido, nunca cru: a opção da tela é "Feminino" e a coluna
        // guarda 'feminino'. Somar os dois sem traduzir faz DUAS barras.
        const t = traduzirParaCadastro('genero', i.valor_texto);
        if (t.ok) sexoDeclarado.set(i.resposta_id, t.valor);
      }
    }

    const linhasPorPergunta = new Map();
    for (const l of agregado) {
      if (!linhasPorPergunta.has(l.pergunta_id)) linhasPorPergunta.set(l.pergunta_id, []);
      linhasPorPergunta.get(l.pergunta_id).push(l);
    }

    // Percorre na ORDEM DO QUESTIONÁRIO, não na ordem que o banco devolveu — a
    // tela tem que parecer o formulário que a pessoa respondeu.
    const graficos = [];
    const identificacao = [];
    for (const p of perguntas) {
      if (p.tipo === 'secao') { graficos.push({ tipo: 'secao', id: p.id, texto: p.texto }); continue; }

      // A pergunta de sexo NÃO vira gráfico próprio — ela alimenta o bloco
      // "Sexo" de "Quem respondeu" (ver o comentário lá em cima). Vai
      // DECLARADA em `identificacao` com o motivo, porque pergunta que some da
      // tela sem explicação é o defeito que este arquivo já pagou duas vezes.
      if (pSexo && p.id === pSexo.id) {
        identificacao.push({ id: p.id, texto: p.texto, tipo: p.tipo, no_bloco_demografico: true });
        continue;
      }

      const classe = classificar(p.tipo);
      // ⚠️ Campo de identificação NUNCA vira barra, e o valor sequer foi lido do
      // banco (o filtro por tipo o deixou de fora). A pergunta aparece DECLARADA
      // na tela: quem olha vê que ela existe e por que não tem gráfico. Esconder
      // seria o buraco silencioso de novo, agora do outro lado.
      if (classe === 'identificacao') {
        identificacao.push({ id: p.id, texto: p.texto, tipo: p.tipo });
        continue;
      }
      // Tipo que o construtor conhece e esta régua ainda não classificou: também
      // é declarado, nunca desenhado por engano.
      if (classe === 'desconhecido') {
        identificacao.push({ id: p.id, texto: p.texto, tipo: p.tipo, desconhecido: true });
        continue;
      }

      const linhas = linhasPorPergunta.get(p.id) || [];
      if (!linhas.length) continue;

      const { base, neutras, total } = baseSemNeutras(p, linhas);
      const ordenadas = ordenarPorOpcoes(p, linhas).map((l) => {
        const n = Number(l.total) || 0;
        const neutra = ehNeutra(p, l.valor);
        return {
          valor: l.valor, total: n, neutra,
          // Percentual sobre a base SEM neutras. Numa neutra o percentual é
          // sobre o total — é a fatia "não quis responder", não uma resposta.
          pct: neutra
            ? (total ? Math.round((n / total) * 1000) / 10 : 0)
            : (base ? Math.round((n / base) * 1000) / 10 : 0),
        };
      });

      let media = null;
      if (TIPOS_NUMERICOS.includes(p.tipo) && base) {
        let soma = 0;
        for (const l of linhas) {
          if (ehNeutra(p, l.valor)) continue;
          const v = Number(l.valor);
          if (Number.isFinite(v)) soma += v * (Number(l.total) || 0);
        }
        media = Math.round((soma / base) * 100) / 100;
      }

      // ⚠️ `sensivel` é OU das linhas, nunca `linhas[0]` — ler de uma linha
      // arbitrária faz uma pergunta sensível passar por comum quando a ordem
      // do banco muda.
      const sensivel = linhas.some((l) => l.sensivel === true);
      // Lista longa (igreja anterior, grupo) tem cauda de valores digitados à
      // mão: 177 numa pergunta só. O teto mantém a tela legível e o que ficou
      // de fora vai DECLARADO, com quantas pessoas representa.
      const corte = classe === 'lista_longa' ? aplicarTeto(ordenadas) : { valores: ordenadas, ocultos: 0, ocultosTotal: 0 };

      graficos.push({
        tipo: p.tipo, id: p.id, texto: p.texto, sensivel,
        base, neutras, total, media,
        // Texto livre não vira barra — vira Leitura da IA. Aqui só o volume.
        aberta: classe === 'texto' || classe === 'lista_longa',
        valores: classe === 'texto' ? [] : corte.valores,
        valores_ocultos: corte.ocultos || 0,
        valores_ocultos_pessoas: corte.ocultosTotal || 0,
      });
    }

    // Cortes demográficos, contados aqui.
    const cortes = { faixa_etaria: {}, genero: {}, estado_civil: {}, bairro: {}, status_membro: {} };
    // Procedência do sexo: quantos responderam nesta pesquisa, quantos vieram
    // do cadastro e quantos continuam sem. Sai junto com a barra.
    const fonteSexo = { declarado: 0, cadastro: 0, sem: 0 };
    for (const r of demo) {
      for (const k of Object.keys(cortes)) {
        let v = r[k] || '(não informado)';
        if (k === 'genero') {
          const declarado = sexoDeclarado.get(r.resposta_id);
          if (declarado) { v = declarado; fonteSexo.declarado += 1; }
          else if (r.genero) fonteSexo.cadastro += 1;
          else fonteSexo.sem += 1;
        }
        cortes[k][v] = (cortes[k][v] || 0) + 1;
      }
    }
    const emLista = (o, teto) => Object.entries(o)
      .map(([valor, total]) => ({ valor, total }))
      .sort((a, b) => b.total - a.total).slice(0, teto || 100);

    // ⚠️⚠️ TETO QUE CORTA TEM QUE DECLARAR O QUE ESCONDEU (achado do Marcos ·
    // 16/09/2026): `bairro` corta em 12, e medido no mesmo dia isso escondia
    // **205 pessoas em 108 bairros** de 973 respondentes — 21% — sem UMA
    // palavra na tela. Quem somava as barras achava que faltava gente, e
    // estava certo. É a lei "número na tela nunca pode ser efeito colateral de
    // paginação", e o módulo JÁ tinha o padrão certo em `aplicarTeto`
    // (`censoGrafico.js`), que devolve `ocultos`/`ocultosTotal` e a tela
    // escreve "+ N outras respostas (M pessoas)". A demografia é que não usava.
    //
    // ⚠️ A régua é PURA e mora em `utils/censoGrafico.cortarDemografia` (no
    // gate), ao lado do `aplicarTeto` que já fazia isso para os gráficos.
    const bairroCorte = cortarDemografia(cortes.bairro, 12);

    // ⚠️ ÓRFÃS: linha no agregado cujo `pergunta_id` não está mais no
    // questionário (pergunta removida ou renomeada depois de já ter resposta).
    // O laço acima percorre `perguntas`, então elas ficariam invisíveis mesmo
    // depois do conserto — e o pedido foi ver CADA resposta. Entram declaradas,
    // com o texto que a própria view guardou.
    const idsVivos = new Set(perguntas.map((p) => p.id));
    const orfas = [];
    for (const [id, linhas] of linhasPorPergunta) {
      if (idsVivos.has(id)) continue;
      orfas.push({
        id,
        texto: linhas[0]?.pergunta_texto || id,
        respostas: linhas.reduce((acc, l) => acc + (Number(l.total) || 0), 0),
      });
    }
    orfas.sort((a, b) => b.respostas - a.respostas);

    res.json({
      titulo: pesquisa.data.titulo,
      // ⚠️ São RESPOSTAS RECEBIDAS, não concluídas: nem esta view nem
      // `vw_cen_item_agregado` filtram `concluida_em`, então o gráfico conta a
      // resposta abandonada também. O rótulo da tela dizia "concluídas" e
      // mentia. Unificar o denominador com a aba Cobertura (que conta só
      // concluídas) exige mexer na view — follow-up, não este PR.
      respondentes: demo.length,
      // ⚠️ A TELA deixou de MOSTRAR isto em 16/09 (pedido do Marcos, depois que
      // a auditoria fechou os 28 cadastros errados), mas o campo CONTINUA saindo:
      // ele é a única coisa que distingue "declarado na pesquisa" de "veio do
      // cadastro", e o cálculo já acontece de qualquer forma para a fusão da
      // barra. Custo zero, e é o que permite voltar a exibir em uma linha.
      sexo_fonte: fonteSexo,
      graficos,
      identificacao,
      orfas,
      // Buraco declarado: `fetchAllRows` devolve o que já leu quando uma página
      // falha, e sem isto a falha voltaria a aparecer como pergunta sumida.
      leitura_incompleta: leituraIncompleta || undefined,
      demografia: {
        faixa_etaria: ordenarPorOpcoes({ opcoes: ['0-11', '12-17', '18-24', '25-34', '35-44', '45-59', '60+'] },
          emLista(cortes.faixa_etaria)),
        genero: emLista(cortes.genero),
        estado_civil: emLista(cortes.estado_civil),
        bairro: bairroCorte.valores,
        status_membro: emLista(cortes.status_membro),
      },
      // ⚠️ O que o teto escondeu, por campo. Sem isto a soma das barras de
      // bairro não fecha com `respondentes` e nada na tela explica.
      demografia_ocultos: {
        bairro: { valores: bairroCorte.ocultos, pessoas: bairroCorte.ocultos_pessoas },
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
//  PERFIL · MAPA · de onde vem quem respondeu
// ══════════════════════════════════════════════════════════════════════════
//
// Endpoint SEPARADO do /perfil de propósito: o mapa carrega o maplibre (~1MB)
// e é lazy na tela; falha aqui não pode derrubar os gráficos, que são o
// conteúdo principal da aba.
//
// ⚠️⚠️ A COORDENADA VEM DE `vw_dem_pessoa`, NUNCA de um join escrito aqui.
// Medido em 13/09: juntar `dem_bairro_geo` direto pelo bairro cru posiciona 595
// pessoas; pela view são 694. A diferença são as 99 pessoas de "Barra Olímpica",
// que é `alias_de = 'barra da tijuca'` — bairro de alias NÃO TEM centróide
// próprio, por definição (decisão de 23/08: agrupamento no mapa, sem reescrever
// onde a pessoa mora). Reimplementar o join aqui perderia essas 99 pessoas em
// silêncio, e o número menor pareceria certo.
//
// ⚠️ Nível 1, como o /perfil: o que sai daqui é contagem por bairro. Nenhum
// `membro_id` e nenhum nome atravessam o `res.json`.
router.get('/perfil/mapa', authorizeModule('censo', 1), async (req, res) => {
  try {
    const pesquisaId = req.query.pesquisa_id;
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });

    const respostas = await fetchAllRows(
      // ⚠️ Mesmo filtro do /perfil: sem ele o mapa conta rascunho no denominador
      // e a cobertura por bairro sai menor do que é.
      () => supabase.from('vw_cen_resposta_pessoa')
        .select('resposta_id, membro_id')
        .eq('pesquisa_id', pesquisaId)
        .not('concluida_em', 'is', null)
        .order('resposta_id'),
      { max: TETO_DEMO },
    );
    const total = respostas.length;
    const ids = [...new Set(respostas.map((r) => r.membro_id).filter(Boolean))];
    // ⚠️ Resposta anônima ou sem cadastro nunca entra no mapa — mas CONTA no
    // denominador. Sem isso "82% posicionados" viraria 87% por omissão.
    const semCadastro = total - respostas.filter((r) => r.membro_id).length;

    // `.in()` em lotes de 200: lista longa estoura a URL do PostgREST.
    // ⚠️⚠️ Pede `bairro_norm`, NUNCA `lat/lng` daqui: `vw_dem_pessoa.lat` é a
    // coordenada da PESSOA (`mem_membros.lat`), reservada para acerto de RUA e
    // nula em 100% da base por decisão de 23/08 ("o centróide NUNCA é gravado
    // em lat/lng da pessoa"). Ler dali faz o mapa nascer vazio, sem erro nenhum.
    // O que a view entrega de valioso é o `bairro_norm` JÁ RESOLVIDO — com
    // alias (as 99 pessoas da Barra Olímpica) e com `ignorar` anulado.
    const pessoas = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase
        .from('vw_dem_pessoa')
        .select('id, bairro, bairro_norm')
        .in('id', ids.slice(i, i + 200));
      // ⚠️ Erro PROPAGA: mapa com menos gente é pior que mapa ausente, porque
      // parece completo.
      if (error) throw error;
      pessoas.push(...(data || []));
    }

    // A COORDENADA vem do catálogo de bairros, pela chave que a view resolveu.
    const normsUsados = [...new Set(pessoas.map((p) => p.bairro_norm).filter(Boolean))];
    const geo = new Map();
    for (let i = 0; i < normsUsados.length; i += 200) {
      const { data, error } = await supabase
        .from('dem_bairro_geo')
        .select('bairro_norm, bairro, lat, lng')
        .in('bairro_norm', normsUsados.slice(i, i + 200));
      if (error) throw error;
      for (const g of data || []) geo.set(g.bairro_norm, g);
    }

    const porNorm = new Map();
    let semBairro = 0;
    let semCoordenada = 0;
    const achadas = new Set();
    for (const p of pessoas) {
      achadas.add(p.id);
      if (!p.bairro_norm) { semBairro += 1; continue; }
      const g = geo.get(p.bairro_norm);
      if (!g || g.lat == null || g.lng == null) { semCoordenada += 1; continue; }
      const at = porNorm.get(p.bairro_norm)
        || { bairro: p.bairro || g.bairro || p.bairro_norm, norm: p.bairro_norm, total: 0, lat: Number(g.lat), lng: Number(g.lng) };
      at.total += 1;
      porNorm.set(p.bairro_norm, at);
    }
    // ⚠️ `vw_dem_pessoa` filtra cadastro ATIVO. Quem respondeu e foi desativado
    // depois some do mapa sem sumir do gráfico — os dois números divergem
    // sozinhos com o tempo, então o buraco é declarado em vez de arredondado.
    const foraDaBase = ids.length - achadas.size;

    const bairros = [...porNorm.values()].sort((a, b) => b.total - a.total);
    const noMapa = bairros.reduce((acc, b) => acc + b.total, 0);

    res.json({
      bairros,
      total,
      pessoas_no_mapa: noMapa,
      pessoas_sem_bairro: semBairro,
      pessoas_sem_coordenada: semCoordenada,
      pessoas_sem_cadastro: semCadastro,
      pessoas_fora_da_base: foraDaBase,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
//  LEITURA DA IA · síntese das respostas abertas
// ══════════════════════════════════════════════════════════════════════════
//
// LER é nível 1 (é agregado e já sai sem o bloco sensível). GERAR é nível 4:
// roda Opus 5 sobre centenas de textos, custa dinheiro e leva minutos — é ação,
// não consulta. E é deliberado que todos leiam a MESMA leitura: se cada abertura
// gerasse uma nova, cinco pessoas na reunião veriam cinco conclusões diferentes.

router.get('/ia', authorizeModule('censo', 1), async (req, res) => {
  try {
    const pesquisaId = req.query.pesquisa_id;
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });

    const [ultima, agora] = await Promise.all([
      supabase.from('cen_leitura_ia')
        .select('id, respostas_na_base, respostas_lidas, modelo, conteudo, gerada_em')
        .eq('pesquisa_id', pesquisaId).order('gerada_em', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('cen_resposta').select('id', { count: 'exact', head: true })
        .eq('pesquisa_id', pesquisaId).not('concluida_em', 'is', null).is('deleted_at', null),
    ]);
    if (ultima.error) throw ultima.error;

    const naBase = agora.count || 0;
    const l = ultima.data;
    res.json({
      leitura: l ? { ...l, conteudo: l.conteudo } : null,
      respostas_na_base: naBase,
      // "Envelheceu" é uma pergunta de confiança, não de tempo: 30% de resposta
      // nova depois da leitura muda a conclusão mais que duas semanas de calendário.
      desatualizada: !!l && naBase > (l.respostas_na_base || 0) * 1.3,
      novas_desde: l ? Math.max(0, naBase - (l.respostas_na_base || 0)) : naBase,
      pode_gerar: getEffectiveLevel(req, 'censo') >= 4,
      ia_configurada: !!process.env.ANTHROPIC_API_KEY,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/ia', authorizeModule('censo', 4), async (req, res) => {
  try {
    const pesquisaId = req.body?.pesquisa_id;
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'ANTHROPIC_API_KEY não configurada no servidor' });
    }

    // Só respostas de pergunta ABERTA e NÃO sensível, e só de resposta concluída.
    // O bloco 6 foi coletado com a promessa de virar estatística, não contexto
    // de modelo.
    //
    // ⚠️⚠️ O `.in('tipo', ...)` É A GUARDA QUE FALTAVA (10/09/2026). Este
    // comentário dizia "pergunta ABERTA" desde sempre e **nada checava o
    // tipo**: `cpf`, `nome`, `telefone`, `email`, `cep`, `cidade` e `bairro`
    // são `texto_curto`, gravam em `valor_texto` e não são sensíveis — medido,
    // 161 itens de PII iam para a Anthropic a cada clique no botão.
    // `tipo` é selecionado porque a segunda guarda (no serviço) depende dele:
    // sem a coluna, `ehTextoDeOpiniao` recebe `undefined` e — fail-closed —
    // descartaria tudo, deixando a leitura vazia sem ninguém entender por quê.
    const { data: itens, error } = await supabase
      .from('cen_resposta_item')
      .select('pergunta_id, pergunta_texto, tipo, valor_texto, sensivel, cen_resposta!inner(pesquisa_id, concluida_em, deleted_at)')
      .eq('cen_resposta.pesquisa_id', pesquisaId)
      .not('cen_resposta.concluida_em', 'is', null)
      .is('cen_resposta.deleted_at', null)
      .eq('sensivel', false)
      .in('tipo', [...TIPOS_PARA_IA])
      .not('valor_texto', 'is', null)
      .limit(20000);
    if (error) throw error;

    const abertos = (itens || []).filter((i) => String(i.valor_texto || '').trim().length >= 3);
    if (!abertos.length) {
      // ⚠️⚠️ A MENSAGEM ANTIGA ("Nenhuma resposta aberta para ler ainda") MANDAVA
      // ESPERAR POR ALGO QUE NUNCA CHEGARIA. Medido no Censo CBRio 2026 em
      // 13/09/2026: a pesquisa tem 34 perguntas e **nenhuma** do tipo
      // `texto_longo` — as três que existiam ("O que você mais ama na CBRio?",
      // "O que mais te conecta com Deus no culto?", "O que te desconecta?")
      // saíram do formulário. 793 pessoas responderam sem serem perguntadas, e
      // a tela dizia "ainda", sugerindo falta de volume.
      //
      // ⚠️ São dois casos com a MESMA cara e conserto oposto: "a pergunta não
      // existe" (mexer no questionário) × "existe e ninguém escreveu" (esperar
      // ou insistir na divulgação). Trocar um pelo outro custa semanas.
      const { data: p } = await supabase
        .from('cen_pesquisa').select('perguntas').eq('id', pesquisaId).maybeSingle();
      const temPerguntaAberta = Array.isArray(p?.perguntas)
        && p.perguntas.some((q) => TIPOS_PARA_IA.has(String(q?.tipo || '')));
      return res.status(422).json({
        error: temPerguntaAberta
          ? 'Ainda ninguém escreveu nas perguntas abertas desta pesquisa.'
          : 'Esta pesquisa não tem nenhuma pergunta aberta (texto longo), então não há o que ler. A leitura da IA usa só o que as pessoas escrevem com as próprias palavras — acrescente ao menos uma pergunta aberta ao questionário.',
        sem_pergunta_aberta: !temPerguntaAberta,
      });
    }

    const leitura = await lerRespostasAbertas(abertos);
    if (!leitura) return res.status(502).json({ error: 'A IA não devolveu uma leitura utilizável' });

    const { count: naBase } = await supabase.from('cen_resposta')
      .select('id', { count: 'exact', head: true })
      .eq('pesquisa_id', pesquisaId).not('concluida_em', 'is', null).is('deleted_at', null);

    const { data: salva, error: e2 } = await supabase.from('cen_leitura_ia').insert({
      pesquisa_id: pesquisaId,
      respostas_na_base: naBase || 0,
      respostas_lidas: leitura.respostas_lidas,
      modelo: leitura.modelo,
      conteudo: {
        por_pergunta: leitura.por_pergunta,
        leitura_geral: leitura.leitura_geral,
        truncadas: leitura.truncadas,
      },
      uso: leitura.uso,
      gerada_por: req.user?.id || null,
    }).select('id, respostas_na_base, respostas_lidas, modelo, conteudo, gerada_em').single();
    if (e2) throw e2;

    res.json({ leitura: salva, respostas_na_base: naBase || 0, desatualizada: false, novas_desde: 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════════
//  RELATÓRIO ANALÍTICO · o censo lido como uma pesquisa profissional
// ══════════════════════════════════════════════════════════════════════════
//
// Irmão da Leitura da IA e com a mesma régua de nível (LER 1 · GERAR 4), mas de
// matéria-prima OPOSTA: aquela lê o que as pessoas escreveram; este lê as
// perguntas FECHADAS agregadas — que é o que este censo tem (34 perguntas, zero
// `texto_longo`, medido em 13/09/2026).
//
// ⚠️⚠️ QUEM CONTA É O CÓDIGO. `montarPerfil` e `montarCruzamentos` (puros, no
// gate) produzem as tabelas; o modelo só interpreta. E o que ele escreve passa
// por `filtrarRecomendacoes`: recomendação que não cita número real é
// descartada antes de chegar na tela.

/** Monta perfil + cruzamentos a partir do banco. Usado pelo POST e pela prévia. */
async function materialDoRelatorio(pesquisaId) {
  // Perfil: sai do agregado, filtrado por TIPO — a mesma whitelist que impede
  // CPF/nome/telefone/nascimento de saírem do banco na aba Perfil.
  const agregado = await fetchAllRows(
    () => supabase.from('vw_cen_item_agregado')
      .select('pergunta_texto, tipo, valor, total')
      .eq('pesquisa_id', pesquisaId)
      .in('tipo', TIPOS_PARA_BUSCAR)
      .order('pergunta_id').order('valor'),
    { max: TETO_AGREGADO },
  );

  // Cruzamentos: precisam da resposta POR PESSOA, senão não há como cruzar.
  // ⚠️ Só as perguntas declaradas em CRUZAMENTOS são lidas, e o que sai daqui
  // é `{ [pergunta_texto]: valor }` — sem id, sem nome, sem CPF. O que não é
  // montado não pode vazar.
  const perguntasUsadas = new Set();
  for (const c of CRUZAMENTOS) {
    perguntasUsadas.add(c.eixo);
    if (c.controle) perguntasUsadas.add(c.controle);
    for (const m of c.metricas) perguntasUsadas.add(m);
  }
  const itens = await fetchAllRows(
    () => supabase.from('cen_resposta_item')
      .select('resposta_id, pergunta_texto, valor_texto, cen_resposta!inner(pesquisa_id, concluida_em, deleted_at)')
      .eq('cen_resposta.pesquisa_id', pesquisaId)
      .not('cen_resposta.concluida_em', 'is', null)
      .is('cen_resposta.deleted_at', null)
      .in('pergunta_texto', [...perguntasUsadas])
      .order('resposta_id'),
    { max: 60000 },
  );
  const porPessoa = new Map();
  for (const i of itens) {
    if (!porPessoa.has(i.resposta_id)) porPessoa.set(i.resposta_id, {});
    if (i.valor_texto != null) porPessoa.get(i.resposta_id)[i.pergunta_texto] = i.valor_texto;
  }

  return {
    perfil: montarPerfil(agregado),
    cruzamentos: montarCruzamentos([...porPessoa.values()]),
  };
}

router.get('/relatorio', authorizeModule('censo', 1), async (req, res) => {
  try {
    const pesquisaId = req.query.pesquisa_id;
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });

    const [ultimo, agora] = await Promise.all([
      supabase.from('cen_relatorio_ia')
        .select('id, respostas_na_base, respostas_lidas, modelo, conteudo, gerado_em')
        .eq('pesquisa_id', pesquisaId).order('gerado_em', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('cen_resposta').select('id', { count: 'exact', head: true })
        .eq('pesquisa_id', pesquisaId).not('concluida_em', 'is', null).is('deleted_at', null),
    ]);
    if (ultimo.error) throw ultimo.error;

    const naBase = agora.count || 0;
    const r = ultimo.data;
    res.json({
      relatorio: r || null,
      respostas_na_base: naBase,
      // Mesma régua da Leitura: envelhecer é sobre quanta resposta nova entrou,
      // não sobre o calendário.
      desatualizado: !!r && naBase > (r.respostas_na_base || 0) * 1.3,
      novas_desde: r ? Math.max(0, naBase - (r.respostas_na_base || 0)) : naBase,
      pode_gerar: getEffectiveLevel(req, 'censo') >= 4,
      ia_configurada: !!process.env.ANTHROPIC_API_KEY,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/relatorio', authorizeModule('censo', 4), async (req, res) => {
  try {
    const pesquisaId = req.body?.pesquisa_id;
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'ANTHROPIC_API_KEY não configurada no servidor' });
    }

    const material = await materialDoRelatorio(pesquisaId);
    // ⚠️ Sem perfil não é falha — é pesquisa sem resposta agregável. A mensagem
    // diz qual dos dois, como no conserto de 13/09 da Leitura da IA.
    if (!material.perfil.length) {
      return res.status(422).json({
        error: 'Esta pesquisa ainda não tem resposta suficiente para um relatório.',
      });
    }

    const { count: naBase } = await supabase.from('cen_resposta')
      .select('id', { count: 'exact', head: true })
      .eq('pesquisa_id', pesquisaId).not('concluida_em', 'is', null).is('deleted_at', null);

    const rel = await gerarRelatorio({ ...material, respostas: naBase || 0 });
    if (!rel) return res.status(502).json({ error: 'A IA não devolveu um relatório utilizável' });

    const { data: salvo, error: e2 } = await supabase.from('cen_relatorio_ia').insert({
      pesquisa_id: pesquisaId,
      respostas_na_base: naBase || 0,
      respostas_lidas: rel.respostas_lidas,
      modelo: rel.modelo,
      conteudo: {
        resumo_executivo: rel.resumo_executivo,
        achados: rel.achados,
        recomendacoes: rel.recomendacoes,
        recomendacoes_descartadas: rel.recomendacoes_descartadas,
        o_que_o_censo_nao_responde: rel.o_que_o_censo_nao_responde,
        // Guardado junto para o PDF poder mostrar a tabela que sustenta o
        // texto: relatório sem o número que o gerou não se confere.
        perfil: material.perfil,
        cruzamentos: material.cruzamentos,
      },
      uso: rel.uso,
      gerado_por: req.user?.id || null,
    }).select('id, respostas_na_base, respostas_lidas, modelo, conteudo, gerado_em').single();
    if (e2) throw e2;

    res.json({ relatorio: salvo, respostas_na_base: naBase || 0, desatualizado: false, novas_desde: 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ── POTENCIAL · as listas acionáveis (21/09/2026) ──────────────────────────
//
// Pedido do Matheus: *"queria analises potenciais... quantas criancas temos
// potencial de convidar para ir pro kids... tem pessoas que sao convertidas mas
// que nao sao batizadas, e aí queria uma lista dessas pessoas para que [a
// coordenadora] entre em contato com cada uma."*
//
// ⚠️⚠️ SÃO DUAS ROTAS E DOIS NÍVEIS, e isso não é excesso de zelo — é medição.
// 34 CARGOS têm censo nível >= 2, e entre eles estão **"Membro" e "Voluntário"**
// (medido em 21/09). Uma lista nominal em nível 2 entregaria nome, telefone e
// CONVICÇÃO RELIGIOSA (LGPD art. 5º II — dado sensível) ao cargo mais baixo do
// sistema. Então: o RESUMO (só contagens) é nível 2, e a lista NOMINAL é nível 4.
// Decisão do Matheus depois de ver a medição.
//
// ⚠️ Ler `cen_resposta.payload` e NÃO `cen_resposta_item`: o payload traz as 29
// respostas da pessoa numa linha só — 1.356 linhas / 1,18 MB, duas páginas do
// `fetchAllRows`. Por item seriam ~12 mil linhas para a mesma informação, e aí o
// cap de 1000 do PostgREST vira problema de arquitetura em vez de paginação.
function consultaPotencial(pesquisaId) {
  return () => supabase
    .from('cen_resposta')
    .select('id, membro_id, payload')
    .eq('pesquisa_id', pesquisaId)
    .not('concluida_em', 'is', null)
    .not('payload', 'is', null)
    // ⚠️ `range()` sem `order()` é NÃO-DETERMINÍSTICO entre páginas: o Postgres
    // não garante a mesma ordem em dois SELECTs, então linha pode sumir ou vir
    // duplicada na virada da página.
    .order('id');
}

// Quantas linhas DEVERIAM ter vindo — o `fetchAllRows` degrada devolvendo o
// acumulado quando dá erro no meio, e sem isto o truncamento é silencioso.
// É o mesmo cinto que a aba Perfil ganhou depois de servir 12 de 40 perguntas
// sem avisar ninguém.
async function baseDoPotencial(pesquisaId) {
  const [linhas, { count }] = await Promise.all([
    fetchAllRows(consultaPotencial(pesquisaId)),
    supabase.from('cen_resposta').select('id', { count: 'exact', head: true })
      .eq('pesquisa_id', pesquisaId)
      .not('concluida_em', 'is', null)
      .not('payload', 'is', null),
  ]);
  const esperado = count || 0;
  return { linhas, esperado, truncado: esperado > 0 && linhas.length < esperado };
}

// Nível 2 · SÓ NÚMEROS. Nenhum nome, nenhum telefone.
router.get('/potencial/resumo', authorizeModule('censo', 2), async (req, res) => {
  try {
    const pesquisaId = req.query.pesquisa_id;
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });
    const { linhas, esperado, truncado } = await baseDoPotencial(pesquisaId);
    res.json({ ...resumoPotencial(linhas), base: linhas.length, esperado, truncado });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Nível 4 · a lista NOMINAL, com o contato de cada pessoa.
router.get('/potencial', authorizeModule('censo', 4), async (req, res) => {
  try {
    const pesquisaId = req.query.pesquisa_id;
    if (!pesquisaId) return res.status(400).json({ error: 'pesquisa_id é obrigatório' });
    const { linhas, esperado, truncado } = await baseDoPotencial(pesquisaId);
    // ⚠️⚠️ Quem CONSTA como formado no Next — para marcar quem respondeu "não
    // fiz" e o sistema discorda (22 pessoas, medido em 21/09). É SELO e não
    // filtro: 250 responderam "sim" sem constar na view, então "não consta" não
    // prova nada. `vw_next_formado_pessoa` é a fonte única do "fez o Next" —
    // nunca `next_matriculas.status`.
    const formados = new Set();
    try {
      const fs = await fetchAllRows(() => supabase
        .from('vw_next_formado_pessoa').select('membro_id').not('membro_id', 'is', null).order('membro_id'));
      for (const f of fs) formados.add(f.membro_id);
    } catch { /* best-effort: sem o selo a lista ainda serve */ }

    // ⚠️ `pode_exportar` viaja na resposta porque o CSV é gerado no cliente. A
    // flag existe na matriz de permissões e HOJE não é aplicada em lugar nenhum
    // da API — de 34 cargos com nível >= 2 no censo, só "Dev" a tem. Sem mandá-la,
    // o botão de exportar apareceria para quem a matriz diz que não pode.
    res.json({
      ...montarPotencial(linhas, formados),
      base: linhas.length,
      esperado,
      truncado,
      pode_exportar: podeExportar(req.user, 'censo'),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// Encaminhar alguém da lista de Potencial para a FILA DE CUIDADO do censo.
//
// Pedido do Matheus (21/09/2026), depois de ver a lista pronta: *"pode fazer o
// botao de mandar pra fila"*.
//
// ⚠️⚠️ VAI PARA `cen_cuidado` E NÃO PARA `cui_batismo_next_fila`, e a troca é
// MEDIDA, não preferência. A fila de batismo exige `convertido_id` com FK para
// `cui_convertidos` — e dos 178 convertidos do censo **só 18 existem lá**.
// Criar os outros 160 ali teria um custo que ninguém pediu: `cui_convertidos`
// alimenta os KPIs `cuidados.convertidos_pos_culto` e `cuidados.reuniao_aceita_pct`,
// que contam POR `data_culto` e **não filtram origem nenhuma** (nem o campo
// `tags`, que existe e nunca foi usado). 160 linhas novas derrubariam os dois
// percentuais de uma vez, porque gente do censo não foi "atendida após o culto"
// nem tem "encontro marcado". Conserto seria mexer no coletor de outro módulo.
//
// `cen_cuidado` é a fila DO PRÓPRIO CENSO: já existe, já tem os 4 status, já
// tem a aba Cuidado lendo, e liga na `resposta_id` — que é exatamente a prova
// de onde a pessoa veio.
//
// ⚠️ Nível 4 e NÃO `guardaCuidado`: quem já vê o nome e o telefone na lista pode
// encaminhar. Exigir a guarda deixaria o botão visível para as 3 pessoas de
// `cen_acesso_sensivel` — que já leem a fila direto e não precisam dele.
// ENCAMINHAR para a fila e TRABALHAR a fila são atos diferentes.
router.post('/potencial/cuidado', authorizeModule('censo', 4), async (req, res) => {
  try {
    const respostaId = String(req.body?.resposta_id || '').trim();
    const tipo = String(req.body?.tipo || 'conversa').trim();
    if (!respostaId) return res.status(400).json({ error: 'resposta_id é obrigatório' });
    // Espelha o CHECK da tabela — mandar valor fora da lista devolveria um erro
    // cru do Postgres na cara de quem clicou.
    if (!['familiar', 'aconselhamento', 'oracao', 'conversa'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo inválido' });
    }

    const { data: r, error: eR } = await supabase
      .from('cen_resposta').select('id, pesquisa_id, membro_id')
      .eq('id', respostaId).is('deleted_at', null).maybeSingle();
    if (eR) return res.status(400).json({ error: eR.message });
    if (!r) return res.status(404).json({ error: 'Resposta não encontrada' });

    // ⚠️⚠️ `cen_cuidado` NÃO TEM UNIQUE. Sem esta checagem, dois cliques (ou
    // duas pessoas trabalhando a mesma lista) criam duas linhas para a mesma
    // pessoa, e a coordenadora liga duas vezes. Só conta o que está EM ABERTO:
    // quem já foi atendido e voltou a aparecer na lista pode ser encaminhado de
    // novo — é caso novo, não duplicata.
    const { data: jaTem } = await supabase
      .from('cen_cuidado').select('id, status')
      .eq('resposta_id', respostaId).eq('tipo', tipo)
      .in('status', ['aberto', 'em_contato'])
      .maybeSingle();
    if (jaTem) return res.status(200).json({ ok: true, ja_estava: true, id: jaTem.id });

    const { data, error } = await supabase.from('cen_cuidado').insert({
      pesquisa_id: r.pesquisa_id,
      resposta_id: r.id,
      membro_id: r.membro_id || null,
      tipo,
      status: 'aberto',
      observacao: limpar(req.body?.observacao) || null,
    }).select('id').maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true, ja_estava: false, id: data?.id || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
