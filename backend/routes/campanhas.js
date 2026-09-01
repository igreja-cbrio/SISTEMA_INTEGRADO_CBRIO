// ════════════════════════════════════════════════════════════════════════════
//  Módulo CAMPANHAS · arrecadação com dígito verificador, cronograma e disparo
//
//  Primeira campanha: Reforma do Espaço Kids (lançamento 06/09/2026).
//
//  ⚠️ A régua de "quanto entrou" mora na VIEW `vw_camp_arrecadacao` e é lida por
//  `services/campanhaArrecadacao.js` — nenhuma rota aqui soma dinheiro na mão.
//  ⚠️ LEI Nº 6 DO NÚCLEO: `mem_contribuicoes` NÃO é caixa. Ver o cabeçalho de
//  `utils/campanhaProgresso.js`.
// ════════════════════════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const { supabase } = require('../utils/supabase');
const { authenticate, authorizeModule } = require('../middleware/auth');
const arrecadacao = require('../services/campanhaArrecadacao');
const disparo = require('../services/campanhaDisparo');
const agradece = require('../services/campanhaAgradece');
const { normalizarDigito, checarDigitoLivre, sugerirDigito } = require('../utils/digitoCampanha');
const { SEGMENTOS, CANAIS } = require('../utils/campanhaPublico');
const svcMarcos = require('../services/campanhaMarcos');
let notificar; try { ({ notificar } = require('../services/notificar')); } catch { notificar = async () => {}; }

router.use(authenticate);

/** Colunas que o PUT aceita. Fora daqui não entra — nem `status`, que tem rota própria. */
const CAMPOS_CAMPANHA = [
  'nome', 'descricao_curta', 'descricao', 'meta_centavos', 'meta_minima_centavos',
  'plano_contas_id', 'centro_custo_id', 'data_inicio', 'data_lancamento', 'data_fim',
  'publica', 'mostrar_valor', 'aceita_online', 'video_url', 'imagem_url',
  'cor_destaque', 'observacao',
];

function slugificar(nome) {
  return String(nome || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'campanha';
}

/**
 * Os dígitos já ocupados — campanhas vivas + os identificadores do financeiro.
 *
 * ⚠️ As DUAS fontes, sempre. O módulo novo adotar um dígito que o financeiro já
 * usa faria a doação da campanha do templo cair na campanha do Kids, e o extrato
 * bancário não guarda nada que permita desempatar depois.
 */
async function digitosOcupados() {
  const ocupados = [];
  const { data: camps } = await supabase.from('camp_campanhas')
    .select('id, nome, digito, status').is('deleted_at', null)
    .not('digito', 'is', null).in('status', ['rascunho', 'ativa', 'pausada']);
  for (const c of camps || []) ocupados.push({ dono: c.id, digito: c.digito, descricao: c.nome });

  const { data: idents } = await supabase.from('fin_identificadores_centavo')
    .select('id, centavo, descricao').eq('ativo', true);
  for (const i of idents || []) {
    ocupados.push({ dono: `fin:${i.id}`, digito: i.centavo, descricao: i.descricao });
  }
  return ocupados;
}

// ── Campanhas ──────────────────────────────────────────────────────────────

router.get('/', authorizeModule('campanhas', 1), async (req, res) => {
  try {
    const lista = await arrecadacao.listar({ incluirEncerradas: req.query.encerradas !== 'false' });
    res.json(lista);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * Dígitos livres e ocupados — a tela precisa DIZER quem já usa cada um.
 * Mostrar só "indisponível" faz a pessoa tentar outro no escuro.
 */
router.get('/digitos', authorizeModule('campanhas', 1), async (_req, res) => {
  try {
    const ocupados = await digitosOcupados();
    res.json({
      ocupados: ocupados.map((o) => ({ digito: o.digito, descricao: o.descricao })),
      sugestao: sugerirDigito(ocupados),
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/segmentos', authorizeModule('campanhas', 1), (_req, res) => {
  res.json({ segmentos: SEGMENTOS, canais: CANAIS });
});

/**
 * Quem pode receber tarefa + as áreas.
 *
 * ⚠️ Devolve a equipe e o "fora da definição de equipe" SEPARADOS: a
 * `vw_colaboradores` (a definição única da casa) exclui 7 contas com login do
 * ERP, e uma delas é o Pr. Juninho. Omiti-las faria a tela afirmar que uma
 * pessoa real não existe — o que o Matheus concluiu 3× em 25/08 quando um
 * seletor escondia alguém em silêncio.
 */
router.get('/aux', authorizeModule('campanhas', 1), async (_req, res) => {
  try {
    const [pessoas, areas] = await Promise.all([
      svcMarcos.pessoasAtribuiveis(),
      svcMarcos.areasAtivas(),
    ]);
    res.json({ ...pessoas, areas });
  } catch (e) {
    // ⚠️ 400 com o motivo, nunca listas vazias: "não há ninguém pra atribuir" é
    // a leitura errada de uma consulta que falhou.
    res.status(400).json({ error: e.message });
  }
});

// ⚠️ `/:id` vem DEPOIS das rotas literais. No Express o primeiro match vence, e
// `/digitos` cairia aqui como `req.params.id` — a armadilha que engoliu
// `/avaliar` e `/mural` no módulo de Propostas (03/08).
router.get('/:id', authorizeModule('campanhas', 1), async (req, res) => {
  try {
    const { data: camp, error } = await supabase.from('camp_campanhas')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!camp) return res.status(404).json({ error: 'Campanha não encontrada' });

    const retrato = await arrecadacao.retrato(camp.id);
    const { data: marcosRaw, error: eM } = await supabase.from('camp_marcos')
      .select('*').eq('campanha_id', camp.id).is('deleted_at', null)
      .order('ordem').order('data_prevista');
    if (eM) return res.status(400).json({ error: eM.message });
    // ⚠️ Best-effort: se a atribuição não carregar, o cronograma AINDA aparece
    // (com `responsaveis: []` e um aviso) em vez de a aba inteira sumir. Mas o
    // aviso EXISTE — "sem responsável" e "não deu pra saber" são coisas diferentes.
    let marcosLista = (marcosRaw || []).map((m) => ({ ...m, responsaveis: [], area_nome: null }));
    let atribuicao_incompleta = null;
    try {
      marcosLista = await svcMarcos.anexarAtribuicao(marcosRaw || []);
    } catch (e) {
      console.error('[campanhas] anexar atribuição:', e.message);
      atribuicao_incompleta = e.message;
    }
    const { data: disparos } = await supabase.from('camp_disparos')
      .select('*').eq('campanha_id', camp.id).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(50);

    res.json({
      campanha: camp, ...retrato,
      marcos: marcosLista, disparos: disparos || [],
      ...(atribuicao_incompleta ? { atribuicao_incompleta } : {}),
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/', authorizeModule('campanhas', 3), async (req, res) => {
  try {
    const nome = String(req.body?.nome || '').trim();
    if (!nome) return res.status(400).json({ error: 'O nome da campanha é obrigatório.' });

    const meta = Math.round(Number(req.body?.meta_centavos) || 0);
    if (meta <= 0) return res.status(400).json({ error: 'A meta precisa ser maior que zero.' });

    // ⚠️ O dígito é conferido ANTES de gravar: colisão é irrecuperável (o extrato
    // não guarda nada que permita desempatar qual crédito era de qual campanha).
    const digito = normalizarDigito(req.body?.digito);
    if (req.body?.digito && !digito) {
      return res.status(400).json({ error: 'O dígito precisa ser dois números de 01 a 99 (o 00 não pode).' });
    }
    if (digito) {
      const livre = checarDigitoLivre(digito, await digitosOcupados());
      if (!livre.ok) return res.status(409).json({ error: livre.motivo, codigo: 'digito_ocupado' });
    }

    const payload = { nome, digito, meta_centavos: meta, slug: slugificar(req.body?.slug || nome) };
    for (const c of CAMPOS_CAMPANHA) {
      if (c === 'nome' || c === 'meta_centavos') continue;
      if (req.body?.[c] !== undefined) payload[c] = req.body[c];
    }
    payload.created_by = req.user?.userId || null;

    const { data, error } = await supabase.from('camp_campanhas').insert(payload).select().single();
    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Já existe campanha com esse dígito ou endereço.', codigo: 'duplicado' });
      }
      return res.status(400).json({ error: error.message });
    }
    res.status(201).json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', authorizeModule('campanhas', 3), async (req, res) => {
  try {
    const patch = {};
    for (const c of CAMPOS_CAMPANHA) if (req.body?.[c] !== undefined) patch[c] = req.body[c];

    if (req.body?.digito !== undefined) {
      const digito = req.body.digito === null || req.body.digito === ''
        ? null : normalizarDigito(req.body.digito);
      if (req.body.digito && !digito) {
        return res.status(400).json({ error: 'O dígito precisa ser dois números de 01 a 99 (o 00 não pode).' });
      }
      if (digito) {
        // ⚠️ `ignorar` é a própria campanha — sem ele, salvar sem trocar o dígito
        // colidiria consigo mesma e a tela viraria um beco sem saída.
        const livre = checarDigitoLivre(digito, await digitosOcupados(), { ignorar: req.params.id });
        if (!livre.ok) return res.status(409).json({ error: livre.motivo, codigo: 'digito_ocupado' });
      }
      patch.digito = digito;
    }

    if (patch.meta_centavos !== undefined) {
      patch.meta_centavos = Math.round(Number(patch.meta_centavos) || 0);
      if (patch.meta_centavos <= 0) return res.status(400).json({ error: 'A meta precisa ser maior que zero.' });
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada a atualizar.' });
    patch.updated_at = new Date().toISOString();

    const { data, error } = await supabase.from('camp_campanhas')
      .update(patch).eq('id', req.params.id).is('deleted_at', null).select().maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Campanha não encontrada' });
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * Muda o status. Rota PRÓPRIA, fora do PUT.
 *
 * ⚠️ Ativar a campanha é o que faz o dígito começar a classificar dinheiro e a
 * barrinha aparecer nas telas do culto — não pode acontecer como efeito
 * colateral de salvar um formulário de texto.
 */
router.post('/:id/status', authorizeModule('campanhas', 4), async (req, res) => {
  const STATUS = ['rascunho', 'ativa', 'pausada', 'encerrada', 'cancelada'];
  const status = String(req.body?.status || '');
  if (!STATUS.includes(status)) {
    return res.status(400).json({ error: `Status inválido. Use: ${STATUS.join(', ')}` });
  }
  try {
    const { data: antes } = await supabase.from('camp_campanhas')
      .select('id, nome, digito, status').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!antes) return res.status(404).json({ error: 'Campanha não encontrada' });

    // ⚠️ Ativar sem dígito e sem doação online é campanha que não tem como
    // receber nada — o dinheiro entraria e ninguém saberia que era dela.
    if (status === 'ativa' && !antes.digito) {
      const { data: c } = await supabase.from('camp_campanhas')
        .select('aceita_online').eq('id', req.params.id).maybeSingle();
      if (!c?.aceita_online) {
        return res.status(400).json({
          error: 'Esta campanha não tem dígito verificador nem doação online — não haveria como identificar o dinheiro dela. Configure um dos dois antes de ativar.',
          codigo: 'sem_caminho_de_arrecadacao',
        });
      }
    }

    const { data, error } = await supabase.from('camp_campanhas')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).is('deleted_at', null).select().maybeSingle();
    if (error) return res.status(400).json({ error: error.message });

    if (antes.status !== status) {
      await notificar({
        modulo: 'campanhas',
        tipo: 'campanha_status',
        titulo: `Campanha "${antes.nome}" agora está ${status}`,
        mensagem: status === 'ativa'
          ? `A campanha passou a ATIVA. O dígito ${antes.digito || '(sem dígito)'} começa a classificar as doações e a barrinha pode ir para as telas.`
          : `A campanha mudou de "${antes.status}" para "${status}".`,
        link: '/campanhas',
        chaveDedup: `camp_status_${req.params.id}_${status}`,
      }).catch((e) => console.error('[campanhas] notificar:', e.message));
    }
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/:id', authorizeModule('campanhas', 4), async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'camp_campanhas',
      p_row_id: req.params.id,
      p_deleted_by: req.user?.userId ?? null,
    });
    // ⚠️ O motivo REAL chega na tela (lição de 17/08): erro genérico em ação de
    // operador esconde defeito de configuração por meses.
    if (error) return res.status(500).json({ error: 'Erro ao excluir a campanha', detalhe: error.message });
    res.json({ ok: !!data });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao excluir a campanha', detalhe: e.message });
  }
});

// ── Dígito verificador ─────────────────────────────────────────────────────

/**
 * Configura (ou troca) o dígito da campanha.
 *
 * ⚠️⚠️ Rota PRÓPRIA, fora do PUT, e nível 4. Trocar o dígito é decisão com
 * consequência contábil: toda doação já identificada com o dígito ANTIGO
 * desapareceria da barrinha se nada fosse feito, porque a view casa o caixa por
 * `identificador_centavo = c.digito`. O serviço FIXA o passado em
 * `camp_vinculos` antes de trocar, e devolve quantos lançamentos foram fixados —
 * a tela DECLARA isso. Trocar o dígito como efeito colateral de salvar um
 * formulário de texto seria a pior forma possível de fazer isso.
 */
router.post('/:id/digito', authorizeModule('campanhas', 4), async (req, res) => {
  try {
    const cru = req.body?.digito;
    // Tirar o dígito é legítimo (campanha que só arrecada pelo link).
    const remover = cru === null || cru === '';
    const digito = remover ? null : normalizarDigito(cru);
    if (!remover && !digito) {
      return res.status(400).json({
        error: 'O dígito precisa ser dois números de 01 a 99. O 00 não pode: ele é o centavo de quem não declarou nada, e está em 87% dos créditos da igreja.',
      });
    }

    if (digito) {
      // ⚠️ `ignorar` é a própria campanha — sem ele, reconfirmar o mesmo dígito
      // colidiria consigo mesma e a tela viraria um beco sem saída.
      const livre = checarDigitoLivre(digito, await digitosOcupados(), { ignorar: req.params.id });
      if (!livre.ok) return res.status(409).json({ error: livre.motivo, codigo: 'digito_ocupado' });
    }

    const r = await arrecadacao.trocarDigito({
      campanhaId: req.params.id,
      digitoNovo: digito,
      motivo: req.body?.motivo || null,
      autorId: req.user?.userId || null,
    });
    if (!r.ok) return res.status(404).json({ error: 'Campanha não encontrada' });

    if (!r.sem_mudanca) {
      await notificar({
        modulo: 'campanhas',
        tipo: 'campanha_digito',
        titulo: `Dígito da campanha mudou: ${r.anterior || '(nenhum)'} → ${r.novo || '(nenhum)'}`,
        mensagem: r.fixados
          ? `${r.fixados} lançamento(s) que já estavam identificados pelo dígito ${r.anterior} foram FIXADOS na campanha, então o total não muda. Doações novas passam a ser identificadas pelo dígito ${r.novo}.`
          : `Não havia nenhum lançamento identificado pelo dígito anterior, então nada precisou ser fixado.`,
        link: '/campanhas',
        chaveDedup: `camp_digito_${req.params.id}_${r.novo || 'nulo'}`,
      }).catch((e) => console.error('[campanhas] notificar dígito:', e.message));
    }
    res.json(r);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/** Trilha de quando cada dígito valeu — explica inclusão manual em massa. */
router.get('/:id/digito-historico', authorizeModule('campanhas', 1), async (req, res) => {
  const { data, error } = await supabase.from('camp_digito_historico')
    .select('id, digito_anterior, digito_novo, lancamentos_fixados, motivo, created_at')
    .eq('campanha_id', req.params.id).order('created_at', { ascending: false }).limit(50);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

// ── Arrecadação ────────────────────────────────────────────────────────────

router.get('/:id/lancamentos', authorizeModule('campanhas', 1), async (req, res) => {
  try {
    res.json(await arrecadacao.lancamentos(req.params.id, { limite: 300 }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/:id/pendentes', authorizeModule('campanhas', 1), async (req, res) => {
  try {
    res.json(await arrecadacao.pendentesDeConciliacao(req.params.id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * O VETO (e a inclusão manual) de um crédito.
 *
 * ⚠️ Existe porque o dígito é DECLARAÇÃO, não prova: um dízimo de R$ 1.000,07 cai
 * na campanha do Kids por coincidência (medido: ~5 a 11 por ano). Sem caminho de
 * veto a barrinha superestima e ninguém consegue corrigir.
 */
router.post('/:id/vinculo', authorizeModule('campanhas', 3), async (req, res) => {
  const { lancamento_bruto_id, transacao_id, incluir, motivo } = req.body || {};
  if (!lancamento_bruto_id && !transacao_id) {
    return res.status(400).json({ error: 'Informe o lançamento ou a transação.' });
  }
  if (typeof incluir !== 'boolean') {
    return res.status(400).json({ error: 'Diga explicitamente se o lançamento entra (true) ou não entra (false) nesta campanha.' });
  }
  try {
    const { data, error } = await supabase.from('camp_vinculos').upsert({
      campanha_id: req.params.id,
      lancamento_bruto_id: lancamento_bruto_id || null,
      transacao_id: transacao_id || null,
      incluir,
      motivo: motivo ? String(motivo).slice(0, 500) : null,
      created_by: req.user?.userId || null,
    }, { onConflict: lancamento_bruto_id ? 'campanha_id,lancamento_bruto_id' : 'campanha_id,transacao_id' })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/:id/vinculo/:vinculoId', authorizeModule('campanhas', 3), async (req, res) => {
  const { error } = await supabase.from('camp_vinculos')
    .delete().eq('id', req.params.vinculoId).eq('campanha_id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ok: true });
});

// ── Cronograma ─────────────────────────────────────────────────────────────

// ⚠️ `responsavel_id`/`responsavel_nome` SAÍRAM do write path (deprecados em
// 27/08): quem guarda responsável é `camp_marco_responsaveis`. Duas fontes para
// "quem responde" é a divergência que o módulo Cuidados pagou pra descobrir — o
// mesmo pastor em 4 grafias, com o total dele partido em 4 cards.
const CAMPOS_MARCO = ['titulo', 'descricao', 'tipo', 'area_id',
  'data_prevista', 'data_conclusao', 'status', 'ordem', 'marketing_card_id'];

router.post('/:id/marcos', authorizeModule('campanhas', 3), async (req, res) => {
  try {
    const titulo = String(req.body?.titulo || '').trim();
    if (!titulo) return res.status(400).json({ error: 'O título da tarefa é obrigatório.' });
    const payload = { campanha_id: req.params.id, titulo, created_by: req.user?.userId || null };
    for (const c of CAMPOS_MARCO) if (c !== 'titulo' && req.body?.[c] !== undefined) payload[c] = req.body[c];
    payload.area_id = svcMarcos.normalizarArea(req.body?.area_id);

    const { data, error } = await supabase.from('camp_marcos').insert(payload).select().single();
    if (error) return res.status(400).json({ error: error.message });

    const atrib = await aplicarAtribuicao({
      marco: data, body: req.body, campanhaId: req.params.id, autorId: req.user?.userId,
    });
    res.status(201).json({ ...data, ...atrib });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * Grava responsáveis + avisa quem entrou. Compartilhado pelo POST e pelo PUT.
 *
 * ⚠️ Régua ÚNICA: criar a tarefa já atribuída e editá-la depois têm de produzir o
 * MESMO efeito, inclusive o aviso. Duas cópias divergiriam no primeiro ajuste, e
 * a divergência apareceria como "avisou quando eu editei e não quando eu criei".
 */
async function aplicarAtribuicao({ marco, body, campanhaId, autorId }) {
  const out = {};
  const { data: camp } = await supabase.from('camp_campanhas')
    .select('nome').eq('id', campanhaId).maybeSingle();
  const contexto = {
    marcoId: marco.id,
    marcoTitulo: marco.titulo,
    campanhaNome: camp?.nome || 'campanha',
    prazo: marco.data_prevista,
  };

  if (body?.responsaveis !== undefined) {
    Object.assign(out, await svcMarcos.definirResponsaveis({
      marcoId: marco.id, bruto: body.responsaveis, autorId, contexto,
    }));
  }

  // ⚠️ Área só avisa quando NÃO há ninguém nomeado — com "Marketing + Pedro",
  // quem puxa é o Pedro, e avisar a área junto viraria 6 avisos por atribuição.
  const semNomeados = !Array.isArray(body?.responsaveis) || !body.responsaveis.length;
  if (marco.area_id && semNomeados) {
    out.avisados_area = await svcMarcos.avisarAtribuidos({
      adicionados: [], autorId, contexto, areaId: marco.area_id,
    });
  }
  return out;
}

router.put('/marcos/:marcoId', authorizeModule('campanhas', 3), async (req, res) => {
 try {
  const patch = {};
  for (const c of CAMPOS_MARCO) if (req.body?.[c] !== undefined) patch[c] = req.body[c];
  if (req.body?.area_id !== undefined) patch.area_id = svcMarcos.normalizarArea(req.body.area_id);
  if (req.body?.titulo !== undefined && !String(req.body.titulo).trim()) {
    return res.status(400).json({ error: 'O título da tarefa não pode ficar vazio.' });
  }
  // ⚠️ Mexer SÓ nos responsáveis é edição legítima — sem isso, atribuir alguém
  // sem tocar em mais nada responderia "nada a atualizar".
  if (!Object.keys(patch).length && req.body?.responsaveis === undefined) {
    return res.status(400).json({ error: 'Nada a atualizar.' });
  }
  // ⚠️ Concluir carimba a data sozinho (e desfazer limpa): sem isso o cronograma
  // teria marco "concluído" sem dizer quando, que é o dado que interessa depois.
  if (patch.status === 'concluido' && patch.data_conclusao === undefined) {
    patch.data_conclusao = arrecadacao.hojeBrt();
  }
  if (patch.status && patch.status !== 'concluido' && patch.data_conclusao === undefined) {
    patch.data_conclusao = null;
  }
  patch.updated_at = new Date().toISOString();

  let atual = null;
  if (Object.keys(patch).length) {
    const { data, error } = await supabase.from('camp_marcos')
      .update(patch).eq('id', req.params.marcoId).is('deleted_at', null).select().maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    atual = data;
  } else {
    const { data } = await supabase.from('camp_marcos')
      .select('*').eq('id', req.params.marcoId).is('deleted_at', null).maybeSingle();
    atual = data;
  }
  if (!atual) return res.status(404).json({ error: 'Tarefa não encontrada' });

  const atrib = await aplicarAtribuicao({
    marco: atual, body: req.body, campanhaId: atual.campanha_id, autorId: req.user?.userId,
  });
  res.json({ ...atual, ...atrib });
 } catch (e) {
  res.status(400).json({ error: e.message });
 }
});

router.delete('/marcos/:marcoId', authorizeModule('campanhas', 3), async (req, res) => {
  const { data, error } = await supabase.rpc('app_soft_delete', {
    p_table_name: 'camp_marcos',
    p_row_id: req.params.marcoId,
    p_deleted_by: req.user?.userId ?? null,
  });
  if (error) return res.status(500).json({ error: 'Erro ao excluir o marco', detalhe: error.message });
  res.json({ ok: !!data });
});

// ── Disparos ───────────────────────────────────────────────────────────────

const CAMPOS_DISPARO = ['nome', 'canal', 'segmento', 'assunto', 'corpo_texto',
  'corpo_html', 'wa_template', 'agendado_para', 'recorrencia'];

/**
 * Prévia: quem receberia, quem não, e por quê. NÃO envia e NÃO grava.
 *
 * ⚠️ É a tela que autoriza um pedido de dinheiro para milhares de pessoas. O
 * número vem com a repartição dos motivos ao lado — senão "1.847 de 3.970"
 * parece defeito do sistema em vez de retrato da base.
 */
router.post('/:id/disparos/previa', authorizeModule('campanhas', 3), async (req, res) => {
  const canal = String(req.body?.canal || 'email');
  if (!CANAIS.includes(canal)) return res.status(400).json({ error: `Canal inválido. Use: ${CANAIS.join(', ')}` });
  const segmento = String(req.body?.segmento || 'todos');
  if (!SEGMENTOS[segmento]) return res.status(400).json({ error: 'Segmento inválido.' });
  try {
    const pub = await disparo.previa({ campanha_id: req.params.id, canal, segmento });
    // ⚠️ A lista de destinos é PII (e-mail/telefone). A prévia devolve CONTAGEM e
    // MOTIVOS; os endereços não trafegam.
    res.json({
      canal: pub.canal,
      segmento,
      total_base: pub.total_base,
      total_alvo: pub.total_alvo,
      total_fora: pub.total_fora,
      motivos: pub.motivos,
      exemplo: pub.alvo.slice(0, 3).map((a) => a.nome).filter(Boolean),
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/:id/disparos', authorizeModule('campanhas', 3), async (req, res) => {
  const nome = String(req.body?.nome || '').trim();
  if (!nome) return res.status(400).json({ error: 'Dê um nome ao disparo (é o que aparece no histórico).' });
  const canal = String(req.body?.canal || 'email');
  if (!CANAIS.includes(canal)) return res.status(400).json({ error: `Canal inválido. Use: ${CANAIS.join(', ')}` });

  const payload = { campanha_id: req.params.id, nome, canal, created_by: req.user?.userId || null };
  for (const c of CAMPOS_DISPARO) if (c !== 'nome' && c !== 'canal' && req.body?.[c] !== undefined) payload[c] = req.body[c];
  const { data, error } = await supabase.from('camp_disparos').insert(payload).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
});

router.put('/disparos/:disparoId', authorizeModule('campanhas', 3), async (req, res) => {
  const patch = {};
  for (const c of CAMPOS_DISPARO) if (req.body?.[c] !== undefined) patch[c] = req.body[c];
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada a atualizar.' });
  patch.updated_at = new Date().toISOString();

  // ⚠️ Disparo que já começou a sair NÃO é editável: metade das pessoas leria um
  // texto e metade outro, e o histórico guardaria só o último.
  const { data: atual } = await supabase.from('camp_disparos')
    .select('status').eq('id', req.params.disparoId).is('deleted_at', null).maybeSingle();
  if (!atual) return res.status(404).json({ error: 'Disparo não encontrado' });
  if (['enviando', 'enviado'].includes(atual.status)) {
    return res.status(409).json({
      error: 'Este disparo já começou a ser enviado e não pode mais ser alterado. Crie outro.',
      codigo: 'disparo_em_curso',
    });
  }

  const { data, error } = await supabase.from('camp_disparos')
    .update(patch).eq('id', req.params.disparoId).is('deleted_at', null).select().maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

/**
 * Agenda o disparo. Quem envia é o cron.
 *
 * ⚠️ NÃO envia aqui dentro: 2.392 e-mails não cabem numa invocação serverless, e
 * a função morrer no meio deixaria metade entregue sem registro (a LEI "gravar o
 * efeito DURANTE, não no fim"). Agendar para agora faz o cron pegar na próxima
 * rodada, com snapshot e retomada.
 */
router.post('/disparos/:disparoId/agendar', authorizeModule('campanhas', 4), async (req, res) => {
  try {
    const quando = req.body?.agendado_para ? new Date(req.body.agendado_para) : new Date();
    if (Number.isNaN(quando.getTime())) return res.status(400).json({ error: 'Data de agendamento inválida.' });

    const { data: d } = await supabase.from('camp_disparos')
      .select('*, campanha:campanha_id(status, nome)')
      .eq('id', req.params.disparoId).is('deleted_at', null).maybeSingle();
    if (!d) return res.status(404).json({ error: 'Disparo não encontrado' });
    if (d.campanha?.status !== 'ativa') {
      return res.status(409).json({
        error: `A campanha está "${d.campanha?.status}". Pedido de doação só sai com a campanha ATIVA.`,
        codigo: 'campanha_nao_ativa',
      });
    }
    if (!d.corpo_texto && !d.corpo_html && !d.wa_template) {
      return res.status(400).json({ error: 'Escreva a mensagem antes de agendar.' });
    }

    const { data, error } = await supabase.from('camp_disparos')
      .update({ status: 'agendado', agendado_para: quando.toISOString(), erro: null, updated_at: new Date().toISOString() })
      .eq('id', req.params.disparoId).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/disparos/:disparoId/cancelar', authorizeModule('campanhas', 3), async (req, res) => {
  const { data, error } = await supabase.from('camp_disparos')
    .update({ status: 'cancelado', updated_at: new Date().toISOString() })
    .eq('id', req.params.disparoId).in('status', ['rascunho', 'agendado'])
    .is('deleted_at', null).select().maybeSingle();
  if (error) return res.status(400).json({ error: error.message });
  // ⚠️ Não achou = já estava enviando/enviado. Dizer isso é diferente de "não
  // existe" — quem cancela precisa saber que a mensagem já saiu.
  if (!data) return res.status(409).json({ error: 'Este disparo já saiu (ou está saindo) e não pode ser cancelado.', codigo: 'ja_enviado' });
  res.json(data);
});

router.get('/disparos/:disparoId/envios', authorizeModule('campanhas', 2), async (req, res) => {
  // ⚠️ Nível 2: a lista carrega DESTINO (e-mail/telefone). Contar é gestão; ver a
  // quem foi, com contato, é cadastro de gente. Mesma régua da aba Automáticas.
  const { data, error } = await supabase.from('camp_disparo_envios')
    .select('id, membro_id, canal, destino, status, motivo, enviado_em')
    .eq('disparo_id', req.params.disparoId)
    .order('enviado_em', { ascending: false, nullsFirst: false }).limit(500);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

// ── Agradecimentos ─────────────────────────────────────────────────────────

router.get('/:id/agradecimentos', authorizeModule('campanhas', 1), async (req, res) => {
  const { data, error } = await supabase.from('camp_agradecimentos')
    .select('id, membro_id, canal, status, motivo, enviado_em, transacao_id, cobranca_id')
    .eq('campanha_id', req.params.id)
    .order('enviado_em', { ascending: false, nullsFirst: false }).limit(300);
  if (error) return res.status(400).json({ error: error.message });
  res.json(data || []);
});

/** Roda a rodada de agradecimentos na mão (o cron já faz de hora em hora). */
router.post('/agradecimentos/rodar', authorizeModule('campanhas', 4), async (_req, res) => {
  try {
    res.json(await agradece.rodar({ limite: 40 }));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ── Cron (de carona · sem slot novo no vercel.json) ────────────────────────
//
// ⚠️⚠️ O cron do MÓDULO COMUNICAÇÃO é que chama isto — não existe entrada nova em
// `vercel.json` (a Vercel está com 46 crons e o teto do plano é apertado). Ver
// `/api/comunicacao/cron/agendamentos`.
//
// ⚠️ ROTA COM PREFIXO `/cron/`: o `authenticate` global do router responde ANTES
// do handler e o cron levaria 401 em silêncio. Este arquivo aplica
// `router.use(authenticate)` no topo, então o cron NÃO pode morar aqui — ele vive
// em `comunicacao.js`, que já tem o caminho liberado. Este comentário existe para
// quem for procurar o cron das campanhas aqui e não achar.

module.exports = router;
module.exports.enviarPendentes = disparo.enviarPendentes;
module.exports.rodarAgradecimentos = agradece.rodar;
module.exports.garantirSemanal = disparo.garantirSemanal;
