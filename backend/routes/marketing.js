// ============================================================================
// /api/marketing · CRUD do Kanban Marketing (Spec 004)
// ============================================================================
// Permissões (boost por área "Marketing" eleva pra nível 5):
//   nível 1 · read analytics e catalogos (diretoria · pastores seniors)
//   nível 3 · read fila geral + write próprio card (produtor)
//   nível 5 · admin do módulo (Pedro Paiva via boost · Marcos via dev)
//
// CHECK constraint do schema (Spec 002):
//   origem='solicitação' · solicitacao_id NOT NULL · evento_task_id NULL
//   origem='evento'      · evento_task_id NOT NULL · solicitacao_id NULL
//   origem='interna'     · ambos NULL
//
// Cards origem=solicitacao/evento NASCEM via triggers SQL · backend so cria
// origem=interna explicitamente (Pedro abre task direto em /marketing).
//
// Revisão (D-14):
//   Máximo 1 por card · tem_revisao boolean · trigger SQL fn_marketing_cards_estado_ts
//   atualiza ordem_fila pro fim quando tem_revisao vira true.
// ============================================================================

const router = require('express').Router();
const multer = require('multer');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const spMarketing = require('../services/sharepointMarketing');
const {
  CAMPANHA_INICIO,
  agruparArrecadacaoMensal,
  calcularGenerosidade,
} = require('../services/marketingGenerosidade');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: spMarketing.MAX_BYTES },
});

router.use(authenticate);

// ─── Helpers ────────────────────────────────────────────────────────────────

function levelOf(req) {
  const modulePerms = req.user.granular?.modulePerms || {};
  const mkt = modulePerms.marketing || modulePerms.Marketing;
  if (!mkt) return 0;
  return Math.max(mkt.leitura || 0, mkt.escrita || 0);
}

function isAdminLike(req) {
  if (['admin', 'diretor'].includes(req.user.role)) return true;
  return levelOf(req) >= 5;
}

async function meuMembroId(req) {
  // Retorna marketing_membros.id ATIVO do user logado (any habilidade).
  // Usado pra checar "card eh do produtor".
  const { data } = await supabase
    .from('marketing_membros')
    .select('id')
    .eq('profile_id', req.user.userId)
    .eq('ativo', true)
    .is('deleted_at', null);
  return (data || []).map(m => m.id);
}

// Dias úteis (seg-sex) inclusive entre duas datas YYYY-MM-DD · null se invalido.
function diasUteisInclusive(inicioStr, fimStr) {
  if (!inicioStr || !fimStr) return null;
  let d = new Date(String(inicioStr).slice(0, 10) + 'T00:00:00');
  const fim = new Date(String(fimStr).slice(0, 10) + 'T00:00:00');
  if (isNaN(d) || isNaN(fim) || fim < d) return null;
  let n = 0;
  while (d <= fim) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) n++;
    d = new Date(d.getTime() + 86400000);
  }
  return Math.max(1, n);
}

async function enrichCards(cards) {
  if (!cards?.length) return cards || [];

  // 1 query por dimensão p/ evitar N+1
  const tipoIds     = [...new Set(cards.map(c => c.etiqueta_tipo_id).filter(Boolean))];
  const destinoIds  = [...new Set(cards.map(c => c.etiqueta_destino_id).filter(Boolean))];
  const membroIds   = [...new Set(cards.map(c => c.atribuido_a).filter(Boolean))];
  const solicIds    = [...new Set(cards.map(c => c.solicitacao_id).filter(Boolean))];
  const cycleTaskIds= [...new Set(cards.map(c => c.cycle_phase_task_id).filter(Boolean))];

  const [tipos, destinos, membros, solics, cycleTasks] = await Promise.all([
    tipoIds.length    ? supabase.from('marketing_etiquetas_tipo').select('id, slug, nome, cor, habilidade_padrao, esforco_max_h').in('id', tipoIds) : Promise.resolve({ data: [] }),
    destinoIds.length ? supabase.from('marketing_etiquetas_destino').select('id, slug, nome, cor').in('id', destinoIds) : Promise.resolve({ data: [] }),
    membroIds.length  ? supabase.from('marketing_membros').select('id, profile_id, habilidade, nome_display').in('id', membroIds) : Promise.resolve({ data: [] }),
    solicIds.length   ? supabase.from('solicitacoes').select('id, titulo, solicitante_id, eh_urgente, urgencia_decisao').in('id', solicIds) : Promise.resolve({ data: [] }),
    // ⚠️ As DATAS da fase entram aqui porque é o que permite o Kanban decidir
    // "esta tarefa é desta semana?" no SERVIDOR. Sem elas o front teria que
    // reimplementar a régua de janela (a que já vive em utils/marketingSemanas).
    cycleTaskIds.length ? supabase.from('cycle_phase_tasks')
      .select('id, event_id, event_phase_id, is_critical, prioridade, events:event_id(id, name), event_cycle_phases:event_phase_id(id, nome_fase, numero_fase, data_inicio_prevista, data_fim_prevista)')
      .in('id', cycleTaskIds) : Promise.resolve({ data: [] }),
  ]);

  const tipoMap     = Object.fromEntries((tipos.data    || []).map(t => [t.id, t]));
  const destinoMap  = Object.fromEntries((destinos.data || []).map(d => [d.id, d]));
  const membroMap   = Object.fromEntries((membros.data  || []).map(m => [m.id, m]));
  const solicMap    = Object.fromEntries((solics.data   || []).map(s => [s.id, s]));
  const cycleMap    = Object.fromEntries((cycleTasks.data || []).map(t => [t.id, t]));

  // Resolve profile names dos membros + solicitantes em 1 query
  const profileIds = [
    ...Object.values(membroMap).map(m => m.profile_id),
    ...Object.values(solicMap).map(s => s.solicitante_id),
  ].filter(Boolean);
  let profileMap = {};
  if (profileIds.length) {
    const { data: profs } = await supabase.from('profiles').select('id, name, email').in('id', [...new Set(profileIds)]);
    profileMap = Object.fromEntries((profs || []).map(p => [p.id, p]));
  }

  // Acabamento do card: resumo de checklist (feitos/total) + prazo de entrega da campanha
  const cardIds = cards.map(c => c.id);
  const campanhaIds = [...new Set(cards.map(c => c.campanha_id).filter(Boolean))];
  const checklistMap = {};
  let campanhaMap = {};
  if (cardIds.length) {
    const { data: cl } = await supabase.from('marketing_card_checklist').select('card_id, feito').in('card_id', cardIds);
    for (const it of (cl || [])) {
      if (!checklistMap[it.card_id]) checklistMap[it.card_id] = { total: 0, feitos: 0 };
      checklistMap[it.card_id].total++;
      if (it.feito) checklistMap[it.card_id].feitos++;
    }
  }
  if (campanhaIds.length) {
    const { data: camps } = await supabase.from('marketing_campanhas').select('id, prazo_entrega, titulo').in('id', campanhaIds);
    campanhaMap = Object.fromEntries((camps || []).map(k => [k.id, k]));
  }

  return cards.map(c => ({
    ...c,
    etiqueta_tipo: tipoMap[c.etiqueta_tipo_id] || null,
    etiqueta_destino: destinoMap[c.etiqueta_destino_id] || null,
    atribuido: c.atribuido_a ? (() => {
      const m = membroMap[c.atribuido_a];
      if (!m) return null;
      const prof = profileMap[m.profile_id] || null;
      // Fallback nome: profile.name → nome_display → null
      return { ...m, profile: prof || (m.nome_display ? { id: null, name: m.nome_display, email: null } : null) };
    })() : null,
    solicitacao: c.solicitacao_id ? {
      ...solicMap[c.solicitacao_id],
      solicitante: profileMap[solicMap[c.solicitacao_id]?.solicitante_id] || null,
    } : null,
    cycle_phase_task: c.cycle_phase_task_id ? (() => {
      const t = cycleMap[c.cycle_phase_task_id];
      if (!t) return null;
      const f = t.event_cycle_phases || null;
      return {
        id: t.id,
        event_id: t.event_id,
        event_name: t.events?.name || null,
        fase: f ? `${f.numero_fase}. ${f.nome_fase}` : null,
        fase_id: f?.id || null,
        numero_fase: f?.numero_fase ?? null,
        nome_fase: f?.nome_fase || null,
        fase_de: f?.data_inicio_prevista || null,
        fase_ate: f?.data_fim_prevista || null,
        is_critical: t.is_critical,
        prioridade: t.prioridade,
        link: t.event_id ? `/eventos/${t.event_id}` : null,
      };
    })() : null,
    checklist: checklistMap[c.id] || null,
    campanha: c.campanha_id ? (campanhaMap[c.campanha_id] || null) : null,
  }));
}

// ─── Generosidade · snapshot agregado para as telas do culto ────────────────

async function carregarGenerosidadeDoBalanco(inicio, fim) {
  const { data: planos, error: planosError } = await supabase
    .from('fin_plano_contas')
    .select('id, codigo')
    .or('codigo.eq.3.01,codigo.like.3.01.%');
  if (planosError) throw planosError;

  const planoIds = (planos || []).map((plano) => plano.id);
  if (!planoIds.length) return [];

  const linhas = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('fin_transacoes')
      .select('id, data_competencia, valor')
      .not('codigo_legado', 'is', null)
      .eq('tipo', 'receita')
      .neq('status', 'cancelado')
      .in('classe_movimento', ['ordinaria', 'extraordinaria'])
      .in('plano_contas_id', planoIds)
      .gte('data_competencia', inicio)
      .lt('data_competencia', fim)
      .order('id', { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    linhas.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  return agruparArrecadacaoMensal(linhas);
}

router.get('/generosidade', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const anoAtual = new Date().getFullYear();
    const anoInicio = Number(CAMPANHA_INICIO.slice(0, 4));
    const ano = req.query.ano === undefined ? anoAtual : Number(req.query.ano);

    if (!Number.isInteger(ano) || ano < anoInicio || ano > anoAtual) {
      return res.status(400).json({
        error: `O ano deve estar entre ${anoInicio} e ${anoAtual}.`,
      });
    }

    const inicio = `${CAMPANHA_INICIO}-01`;
    const fim = `${ano + 1}-01-01`;

    const [mensalRows, uploadResult] = await Promise.all([
      carregarGenerosidadeDoBalanco(inicio, fim),
      supabase
        .from('fin_uploads')
        .select('concluido_em, data_inicio, data_fim')
        .eq('tipo', 'balanco')
        .eq('status', 'concluido')
        .order('concluido_em', { ascending: false })
        .limit(1),
    ]);
    if (uploadResult.error) throw uploadResult.error;

    const snapshot = calcularGenerosidade(mensalRows, ano);
    const ultimoBalanco = uploadResult.data?.[0] || null;

    res.set('Cache-Control', 'private, no-store');
    return res.json({
      ...snapshot,
      atualizado_em: ultimoBalanco?.concluido_em || null,
      periodo_ultimo_balanco: ultimoBalanco
        ? { inicio: ultimoBalanco.data_inicio, fim: ultimoBalanco.data_fim }
        : null,
      fonte: 'balanco_financeiro',
    });
  } catch (e) {
    console.error('[MARKETING] generosidade:', e.message);
    return res.status(500).json({
      error: 'Não foi possível carregar os dados de generosidade.',
    });
  }
});

// ─── Catalogos ──────────────────────────────────────────────────────────────

router.get('/etiquetas', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const [tipos, destinos] = await Promise.all([
      supabase.from('marketing_etiquetas_tipo').select('*').eq('ativo', true).order('ordem'),
      supabase.from('marketing_etiquetas_destino').select('*').eq('ativo', true).order('ordem'),
    ]);
    res.json({
      tipos: tipos.data || [],
      destinos: destinos.data || [],
    });
  } catch (e) {
    console.error('[MARKETING] etiquetas:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/membros', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('marketing_membros')
      .select('*')
      .is('deleted_at', null)
      .eq('ativo', true);
    if (error) throw error;

    const profileIds = [...new Set((data || []).map(m => m.profile_id).filter(Boolean))];
    let profileMap = {};
    if (profileIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, name, email, avatar_url').in('id', profileIds);
      profileMap = Object.fromEntries((profs || []).map(p => [p.id, p]));
    }
    res.json((data || []).map(m => ({
      ...m,
      profile: profileMap[m.profile_id]
        || (m.nome_display ? { id: null, name: m.nome_display, email: null, avatar_url: null } : null),
    })));
  } catch (e) {
    console.error('[MARKETING] membros:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── (removidos · redesenho 2026-05-31) ─────────────────────────────────────
// GET /capacidade e GET /estimar usavam o modelo de HORAS (fn_marketing_calcular_
// capacidade_semana / fn_marketing_estimar_prazo), aposentado pelos slots/planner.
// Sem chamador no front · as funções SQL são dropadas na migration de limpeza.

router.get('/compromissos-recorrentes', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('marketing_compromissos_recorrentes')
      .select('*')
      .is('deleted_at', null)
      .eq('ativo', true)
      .order('dia_semana')
      .order('hora_inicio');
    if (error) throw error;

    // Junction · 1 row por participante · agrupa em array
    const ids = (data || []).map(r => r.id);
    let partMap = {};
    if (ids.length) {
      const { data: parts } = await supabase
        .from('marketing_recorrentes_participantes')
        .select('compromisso_id, membro_id')
        .in('compromisso_id', ids);
      partMap = (parts || []).reduce((acc, p) => {
        if (!acc[p.compromisso_id]) acc[p.compromisso_id] = [];
        acc[p.compromisso_id].push(p.membro_id);
        return acc;
      }, {});
    }
    const enriched = (data || []).map(r => ({
      ...r,
      participantes_ids: partMap[r.id] || [],
    }));
    res.json(enriched);
  } catch (e) {
    console.error('[MARKETING] recorrentes:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── CRUD cards ─────────────────────────────────────────────────────────────

router.get('/cards', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { estado, origem, etiqueta_tipo, etiqueta_destino, atribuido_a, raia_rapida } = req.query;

    let q = supabase
      .from('marketing_kanban_cards')
      .select('*')
      .is('deleted_at', null)
      .order('raia_rapida', { ascending: false })
      .order('ordem_fila', { ascending: true });

    if (estado) q = q.eq('estado', estado);
    if (origem) q = q.eq('origem', origem);
    if (etiqueta_tipo) q = q.eq('etiqueta_tipo_id', etiqueta_tipo);
    if (etiqueta_destino) q = q.eq('etiqueta_destino_id', etiqueta_destino);
    if (atribuido_a) q = q.eq('atribuido_a', atribuido_a);
    if (raia_rapida === 'true') q = q.eq('raia_rapida', true);

    const { data, error } = await q;
    if (error) throw error;

    const enriched = await enrichCards(data || []);
    res.json(enriched);
  } catch (e) {
    console.error('[MARKETING] list cards:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/cards/:id', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('marketing_kanban_cards')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Card não encontrado' });

    const enriched = await enrichCards([data]);
    // Entregaveis do card
    const { data: entregaveis } = await supabase
      .from('marketing_entregaveis')
      .select('*')
      .eq('card_id', data.id)
      .is('deleted_at', null)
      .order('enviado_em', { ascending: false });

    res.json({ ...enriched[0], entregaveis: entregaveis || [] });
  } catch (e) {
    console.error('[MARKETING] get card:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/cards', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { titulo, descricao, etiqueta_tipo_id, etiqueta_destino_id, atribuido_a,
            prazo_confirmado, raia_rapida } = req.body || {};
    if (!titulo) return res.status(400).json({ error: 'Titulo obrigatorio' });

    const payload = {
      origem: 'interna',
      titulo,
      descricao: descricao || null,
      etiqueta_tipo_id: etiqueta_tipo_id || null,
      etiqueta_destino_id: etiqueta_destino_id || null,
      atribuido_a: atribuido_a || null,
      prazo_confirmado: prazo_confirmado || null,
      raia_rapida: !!raia_rapida,
      criado_por: req.user.userId,
    };

    const { data, error } = await supabase
      .from('marketing_kanban_cards')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;

    // Notifica responsável atribuído (se houver)
    if (data.atribuido_a) {
      const { data: membro } = await supabase
        .from('marketing_membros')
        .select('profile_id')
        .eq('id', data.atribuido_a)
        .maybeSingle();
      if (membro?.profile_id) {
        notificar({
          modulo: 'marketing',
          tipo: 'marketing_card_atribuido',
          titulo: `Nova task: ${data.titulo}`,
          mensagem: `Pedro Paiva atribuiu uma task interna pra você.`,
          link: '/marketing',
          severidade: 'info',
          chaveDedup: `marketing_card_atribuido_${data.id}_${membro.profile_id}`,
          targetIds: [membro.profile_id],
        }).catch(err => console.error('[MARKETING] notify atribuido:', err.message));
      }
    }

    const enriched = await enrichCards([data]);
    res.status(201).json(enriched[0]);
  } catch (e) {
    console.error('[MARKETING] create card:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/cards/:id', authorizeModule('marketing', 3), async (req, res) => {
  try {
    const { data: atual } = await supabase
      .from('marketing_kanban_cards')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Card não encontrado' });

    // RLS UPDATE policy já bloqueia produtor que não eh o atribuído, mas
    // duplicamos o check no backend pra dar feedback claro de UX.
    const admin = isAdminLike(req);
    const meusMembroIds = await meuMembroId(req);
    const ehDoProdutor = atual.atribuido_a && meusMembroIds.includes(atual.atribuido_a);
    if (!admin && !ehDoProdutor) {
      return res.status(403).json({ error: 'Você so pode editar cards atribuídos a você' });
    }

    // Campos editaveis por produtor: estado (apenas seu card)
    // Campos editaveis so por admin (level 5+): tudo
    const update = {};
    if (admin) {
      const { titulo, descricao, etiqueta_tipo_id, etiqueta_destino_id,
              atribuido_a, prazo_preliminar, prazo_confirmado, prazo_producao, estado,
              raia_rapida, motivo_revisao, data_inicio, data_fim, pode_paralelo } = req.body || {};
      if (titulo !== undefined) update.titulo = titulo;
      if (descricao !== undefined) update.descricao = descricao;
      if (etiqueta_tipo_id !== undefined) update.etiqueta_tipo_id = etiqueta_tipo_id;
      if (etiqueta_destino_id !== undefined) update.etiqueta_destino_id = etiqueta_destino_id;
      if (atribuido_a !== undefined) update.atribuido_a = atribuido_a;
      if (prazo_preliminar !== undefined) update.prazo_preliminar = prazo_preliminar;
      if (prazo_confirmado !== undefined) update.prazo_confirmado = prazo_confirmado;
      // ⚠️ `prazo_producao` é o prazo INTERNO do redesenho (o que o coletor do
      // MKT-PRAZO prefere) e não estava na whitelist — então não havia caminho
      // de UI pra preenchê-lo, e as 7 tarefas internas de produção estavam
      // TODAS sem prazo. É o campo que o box do dashboard grava.
      if (prazo_producao !== undefined) update.prazo_producao = prazo_producao;
      if (estado !== undefined) update.estado = estado;
      if (raia_rapida !== undefined) update.raia_rapida = !!raia_rapida;
      if (motivo_revisao !== undefined) update.motivo_revisao = motivo_revisao;
      // Planner (Fase 4b): arrastar/realocar a barra altera as datas do entregavel
      if (data_inicio !== undefined) update.data_inicio = data_inicio;
      if (data_fim !== undefined) update.data_fim = data_fim;
      if (pode_paralelo !== undefined) update.pode_paralelo = !!pode_paralelo;
      if (data_inicio !== undefined || data_fim !== undefined) {
        const dd = diasUteisInclusive(
          data_inicio !== undefined ? data_inicio : atual.data_inicio,
          data_fim !== undefined ? data_fim : atual.data_fim);
        if (dd) update.duracao_dias = dd;
      }
    } else {
      // Produtor pode mover estado · proibido pular pra "concluído"
      // direto sem passar por aguardando_solicitante (definicao do fluxo).
      const { estado } = req.body || {};
      if (estado) update.estado = estado;
    }

    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nada para atualizar' });

    const { data, error } = await supabase
      .from('marketing_kanban_cards')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;

    // Notificação · mudou atribuicao
    if (update.atribuido_a && update.atribuido_a !== atual.atribuido_a) {
      const { data: membro } = await supabase
        .from('marketing_membros')
        .select('profile_id')
        .eq('id', update.atribuido_a)
        .maybeSingle();
      if (membro?.profile_id) {
        notificar({
          modulo: 'marketing',
          tipo: 'marketing_card_atribuido',
          titulo: `Card atribuido: ${data.titulo}`,
          mensagem: 'Você foi atribuído a um card no Kanban Marketing.',
          link: '/marketing',
          severidade: 'info',
          chaveDedup: `marketing_card_atribuido_${data.id}_${membro.profile_id}`,
          targetIds: [membro.profile_id],
        }).catch(err => console.error('[MARKETING] notify atribuido:', err.message));
      }
    }

    // ⚠️⚠️ Os 3 avisos ao solicitante abaixo dependiam de `data.solicitacao_id` e
    // por isso NUNCA saíam no fluxo em uso (8 dos 9 cards têm só `campanha_id`).
    // `solicitanteDoCard` atravessa card → campanha → solicitação (régua única em
    // utils/marketingSolicitante). Resolvido UMA vez e reusado nos três.
    // ⚠️ Erro de consulta devolve `{erro:true}` — não avisa, e não finge que o
    // card não tem dono. Um `console.error` deixa isso auditável.
    let solDoCard = null;
    const precisaAvisarSolicitante =
      (update.estado === 'concluido' && atual.estado !== 'concluido')
      || (update.prazo_confirmado !== undefined && update.prazo_confirmado !== atual.prazo_confirmado)
      || (update.estado === 'aguardando_solicitante' && atual.estado !== 'aguardando_solicitante');
    if (precisaAvisarSolicitante) {
      try {
        const r = await solicitanteDoCard(data);
        if (r?.erro) console.error('[MARKETING] solicitante do card (não avisou):', r.motivo);
        else solDoCard = r;
      } catch (e) { console.error('[MARKETING] solicitante do card:', e.message); }
    }

    // Notificação · entregue (estado=concluido) · solicitante avisado
    if (update.estado === 'concluido' && atual.estado !== 'concluido' && solDoCard) {
      const sol = { solicitante_id: solDoCard.solicitante_id, titulo: solDoCard.titulo_solicitacao };
      if (sol?.solicitante_id) {
        notificar({
          modulo: 'marketing',
          tipo: 'marketing_card_entregue',
          titulo: `Entregue: ${sol.titulo}`,
          mensagem: 'Sua solicitação foi marcada como entregue. Avalie em 30 segundos.',
          link: '/solicitacoes',
          severidade: 'info',
          chaveDedup: `marketing_card_entregue_${data.id}`,
          targetIds: [sol.solicitante_id],
        }).catch(err => console.error('[MARKETING] notify entregue:', err.message));
      }
    }

    // Notificação · prazo confirmado (Pedro definiu prazo) · solicitante avisado
    if (update.prazo_confirmado !== undefined
        && update.prazo_confirmado !== atual.prazo_confirmado
        && solDoCard) {
      const sol = { solicitante_id: solDoCard.solicitante_id, titulo: solDoCard.titulo_solicitacao };
      if (sol?.solicitante_id && data.prazo_confirmado) {
        const prazoStr = new Date(data.prazo_confirmado).toLocaleDateString('pt-BR');
        notificar({
          modulo: 'marketing',
          tipo: 'marketing_prazo_confirmado',
          titulo: `Prazo confirmado: ${sol.titulo}`,
          mensagem: `Marketing definiu prazo de entrega: ${prazoStr}.`,
          link: '/solicitacoes',
          severidade: 'info',
          chaveDedup: `marketing_prazo_confirmado_${data.id}_${data.prazo_confirmado}`,
          targetIds: [sol.solicitante_id],
        }).catch(err => console.error('[MARKETING] notify prazo:', err.message));
      }
    }

    // Notificação · aguardando solicitante (preview pro solicitante revisar)
    if (update.estado === 'aguardando_solicitante' && atual.estado !== 'aguardando_solicitante'
        && solDoCard) {
      const sol = { solicitante_id: solDoCard.solicitante_id, titulo: solDoCard.titulo_solicitacao };
      if (sol?.solicitante_id) {
        notificar({
          modulo: 'marketing',
          tipo: 'marketing_card_preview',
          titulo: `Preview pronto: ${sol.titulo}`,
          mensagem: 'Equipe Marketing finalizou um preview. Aprove ou sugira revisão em /solicitacoes.',
          link: '/solicitacoes',
          severidade: 'info',
          chaveDedup: `marketing_card_preview_${data.id}_${atual.estado_atualizado_em || ''}`,
          targetIds: [sol.solicitante_id],
        }).catch(err => console.error('[MARKETING] notify preview:', err.message));
      }
    }

    const enriched = await enrichCards([data]);
    res.json(enriched[0]);
  } catch (e) {
    console.error('[MARKETING] patch card:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Solicitante aprova entrega · card vira concluído (Spec 012)
// Endpoint dedicado pq solicitante não tem permissão geral de UPDATE no card.
router.patch('/cards/:id/aprovar-entrega', async (req, res) => {
  try {
    const { data: card } = await supabase
      .from('marketing_kanban_cards')
      .select('*, solicitacao:solicitacoes(id, solicitante_id, titulo)')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!card) return res.status(404).json({ error: 'Card não encontrado' });

    // Permissões: solicitante do card OU admin/coord
    const isSolicitante = card.solicitacao?.solicitante_id === req.user.userId;
    const isAdminMkt = isAdminLike(req);
    if (!isSolicitante && !isAdminMkt) {
      return res.status(403).json({ error: 'Apenas o solicitante (ou admin) pode aprovar a entrega.' });
    }
    if (!['aguardando_solicitante', 'em_producao'].includes(card.estado)) {
      return res.status(400).json({ error: 'Card não esta em estado aguardando_solicitante' });
    }

    const { data: novo, error } = await supabase
      .from('marketing_kanban_cards')
      .update({ estado: 'concluido' })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;

    // Notifica produtor + concluir solicitação automaticamente
    if (card.atribuido_a) {
      const { data: membro } = await supabase
        .from('marketing_membros')
        .select('profile_id')
        .eq('id', card.atribuido_a)
        .maybeSingle();
      if (membro?.profile_id) {
        notificar({
          modulo: 'marketing',
          tipo: 'marketing_entrega_aprovada',
          titulo: `Entrega aprovada: ${card.titulo}`,
          mensagem: 'Solicitante aprovou · card concluído. Avalia pelo NPS agora.',
          link: '/marketing',
          severidade: 'info',
          chaveDedup: `marketing_entrega_aprovada_${card.id}`,
          targetIds: [membro.profile_id],
        }).catch(err => console.error('[MARKETING] notify entrega aprovada:', err.message));
      }
    }

    // Marca solicitação como concluída pra acionar NPS (status=concluido dispara
    // o fluxo padrão + notificação de avaliação em routes/solicitacoes patch)
    // ⚠️ Pela régua única: sem isso, aprovar a entrega de card vindo de campanha
    // deixava a solicitação ABERTA pra sempre e o NPS nunca era pedido.
    const solAprovada = await solicitanteDoCard(card).catch(() => null);
    if (solAprovada?.solicitacao_id) {
      await supabase
        .from('solicitacoes')
        .update({ status: 'concluido', concluido_em: new Date().toISOString() })
        .eq('id', solAprovada.solicitacao_id)
        .neq('status', 'concluido');
    }

    res.json(novo);
  } catch (e) {
    console.error('[MARKETING] aprovar-entrega:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Sugerir revisão · 1x apenas (D-14) · trigger SQL atualiza ordem_fila pro fim.
// Solicitante chama esse endpoint via UI de Solicitações (Spec 012),
// mas também permitimos coordenador/produtor disparar (caso volte feedback offline).
router.patch('/cards/:id/sugerir-revisao', async (req, res) => {
  try {
    const { motivo } = req.body || {};
    if (!motivo || motivo.trim().length < 5) {
      return res.status(400).json({ error: 'Motivo da revisão obrigatório (>= 5 chars)' });
    }

    const { data: atual } = await supabase
      .from('marketing_kanban_cards')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Card não encontrado' });
    if (atual.tem_revisao) {
      return res.status(400).json({ error: 'Card já teve revisão (1 máximo · D-14)' });
    }

    // Permissões: solicitante do card OR admin marketing OR produtor atribuído
    const admin = isAdminLike(req);
    let podeSugerir = admin;
    // ⚠️ Régua única: antes só o solicitante de card com vínculo DIRETO podia
    // pedir revisão — quem veio por campanha tomava 403 no próprio pedido.
    // `ehSolicitanteDoCard` é fail-closed (erro de consulta nega).
    if (!podeSugerir) {
      podeSugerir = await ehSolicitanteDoCard(atual, req.user.userId);
    }
    if (!podeSugerir) {
      const meusMembroIds = await meuMembroId(req);
      if (meusMembroIds.includes(atual.atribuido_a)) podeSugerir = true;
    }
    if (!podeSugerir) return res.status(403).json({ error: 'Sem permissão para sugerir revisão' });

    const { data, error } = await supabase
      .from('marketing_kanban_cards')
      .update({
        tem_revisao: true,
        motivo_revisao: motivo.trim(),
        estado: 'em_producao',
      })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;

    // Notifica produtor atribuído
    if (data.atribuido_a) {
      const { data: membro } = await supabase
        .from('marketing_membros')
        .select('profile_id')
        .eq('id', data.atribuido_a)
        .maybeSingle();
      if (membro?.profile_id) {
        notificar({
          modulo: 'marketing',
          tipo: 'marketing_card_revisao',
          titulo: `Revisao pedida: ${data.titulo}`,
          mensagem: `Solicitante pediu revisão · "${motivo.trim()}". Card foi pro fim da fila.`,
          link: '/marketing',
          severidade: 'alta',
          chaveDedup: `marketing_card_revisao_${data.id}`,
          targetIds: [membro.profile_id],
        }).catch(err => console.error('[MARKETING] notify revisao:', err.message));
      }
    }

    const enriched = await enrichCards([data]);
    res.json(enriched[0]);
  } catch (e) {
    console.error('[MARKETING] sugerir-revisao:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Ciclo Criativo · agrupado Evento → Fase (Spec 024) ───────────────────
router.get('/ciclo-criativo', authorizeModule('marketing', 1), async (req, res) => {
  try {
    // Cards origem=evento com cycle_phase_task_id · agrupados
    const { data: cards, error } = await supabase
      .from('marketing_kanban_cards')
      .select('*')
      .eq('origem', 'evento')
      .not('cycle_phase_task_id', 'is', null)
      .is('deleted_at', null);
    if (error) throw error;

    const enriched = await enrichCards(cards || []);

    // Re-agrupa por evento + fase
    const grupos = {};
    for (const c of enriched) {
      const ct = c.cycle_phase_task;
      if (!ct) continue;
      const key = `${ct.event_id}::${ct.fase || 'sem_fase'}`;
      if (!grupos[key]) {
        grupos[key] = {
          event_id: ct.event_id,
          event_name: ct.event_name,
          fase: ct.fase,
          tarefas: [],
        };
      }
      grupos[key].tarefas.push(c);
    }

    // Ordena por evento e fase (número da fase eh prefixo)
    const lista = Object.values(grupos).sort((a, b) => {
      if (a.event_name !== b.event_name) return (a.event_name || '').localeCompare(b.event_name || '');
      return (a.fase || '').localeCompare(b.fase || '');
    });

    res.json(lista);
  } catch (e) {
    console.error('[MARKETING] ciclo-criativo:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Batch · aplica mesmo etiqueta_tipo_id + atribuido_a pra vários cards
router.patch('/ciclo-criativo/batch', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { card_ids, etiqueta_tipo_id, atribuido_a } = req.body || {};
    if (!Array.isArray(card_ids) || card_ids.length === 0) {
      return res.status(400).json({ error: 'card_ids deve ser array com >=1 id' });
    }
    const update = {};
    if (etiqueta_tipo_id !== undefined) update.etiqueta_tipo_id = etiqueta_tipo_id || null;
    if (atribuido_a !== undefined) update.atribuido_a = atribuido_a || null;
    if (!Object.keys(update).length) return res.status(400).json({ error: 'envie etiqueta_tipo_id ou atribuido_a' });

    const { error, count } = await supabase
      .from('marketing_kanban_cards')
      .update(update)
      .in('id', card_ids)
      .is('deleted_at', null)
      .select('id', { count: 'exact', head: true });
    if (error) throw error;

    res.json({ ok: true, atualizados: count || card_ids.length });
  } catch (e) {
    console.error('[MARKETING] ciclo-criativo batch:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// ─── DASHBOARD do Marketing (pedido do Pedro Paiva · 2026-08-14) ────────────
// ============================================================================
// 3 blocos numa tela: (1) minhas próximas entregas internas · (2) pulso das
// solicitações (feitas × resolvidas) + as próximas por prazo · (3) calendário
// SEMANAL do ciclo criativo (em que fase cada evento/série está em cada semana).
//
// ⚠️ O bloco 3 responde uma pergunta que o /eventos NÃO responde: lá o ciclo é
// visto POR EVENTO (fases em lista). Aqui é por SEMANA, atravessando os eventos
// — é assim que a equipe criativa planeja a semana dela.
//
// ⚠️ A régua de "que fase é essa semana?" mora em utils/marketingSemanas.js
// (pura · no gate de deploy · contrato em src/test/marketingSemanas.test.ts).
// NÃO reimplementar aqui: o contrato reproduz os 4 casos que o Pedro descreveu
// à mão, e duas cópias divergiriam.

const {
  hojeBRT: hojeBRTMkt,
  montarSemanas,
  semanasDoMesGrade,
  mesVizinho,
  montarCalendario,
  diasSobrepostos,
} = require('../utils/marketingSemanas');
const { corDoEvento, ehExcedente, CORES_EVENTO } = require('../utils/marketingCores');
// Quem é o solicitante deste card · atravessa card → campanha → solicitação.
// ⚠️ NÃO voltar a perguntar `card.solicitacao_id` direto: 8 dos 9 cards em uso
// têm só `campanha_id`, e era isso que matava os avisos e o download.
const { solicitanteDoCard, ehSolicitanteDoCard } = require('../services/marketingSolicitante');
// Ocupação da equipe · dias úteis e carga por dia. ⚠️ Régua ÚNICA: o cliente
// NÃO recalcula fim de tarefa nem carga — pede ao servidor.
const {
  OCUPACOES_DIAS, calcularDataFim, proximoDiaUtil, diasUteisNoIntervalo,
} = require('../utils/marketingOcupacao');

// Solicitação ENTREGUE (o que o marketing resolveu). `avaliado` = concluída e
// já com NPS respondido — continua sendo entrega.
const SOLIC_ENTREGUE = new Set(['concluido', 'avaliado']);
// Fechada SEM entrega · sai da fila mas NÃO conta como resolvida (senão a
// linha de "resolvidas" viraria "linha de encerradas", que é outra pergunta).
const SOLIC_ABORTADA = new Set(['cancelado', 'rejeitado']);

// Tarefa/card em estado terminal.
const TAREFA_FEITA = new Set(['concluida', 'concluido']);

// Prazo efetivo de um card interno. `prazo_producao` é o do redesenho,
// `prazo_confirmado` o legado e `data_fim` o do Planner — a mesma precedência
// que o coletor do MKT-PRAZO usa. Sem nenhum dos três, o card NÃO tem prazo (e
// isso é DECLARADO, nunca chutado por ordem de fila).
function prazoDoCard(c) {
  return c.prazo_producao || c.prazo_confirmado || c.data_fim || null;
}

// Query param inteiro com padrão e limites. Entrada ausente, vazia ou não
// numérica cai no PADRÃO — nunca em NaN.
function limitarInteiro(valor, padrao, min, max) {
  const n = Number.parseInt(valor, 10);
  if (!Number.isFinite(n)) return padrao;
  return Math.min(Math.max(n, min), max);
}

// Lotes de <=200 COM checagem de erro. `.in()` gigante estoura a URL do
// PostgREST e — se o `error` não for lido — devolve vazio em SILÊNCIO, que se
// lê como "não existe nada".
async function lerEmLotes(tabela, cols, coluna, valores) {
  const unicos = [...new Set((valores || []).filter(Boolean))];
  const out = [];
  for (let i = 0; i < unicos.length; i += 200) {
    const { data, error } = await supabase.from(tabela).select(cols).in(coluna, unicos.slice(i, i + 200));
    if (error) throw new Error(`${tabela}: ${error.message}`);
    out.push(...(data || []));
  }
  return out;
}

router.get('/dashboard', authorizeModule('marketing', 1), async (req, res) => {
  const hoje = hojeBRTMkt();
  // O calendário do ciclo é MENSAL, com setas — igual ao `BigCalendar` do
  // /eventos (pedido do Pedro · 14/08). `?mes=YYYY-MM` navega; sem param, o mês
  // de hoje. Mês malformado cai no mês de hoje em vez de devolver grade vazia.
  const mes = /^\d{4}-\d{2}$/.test(String(req.query.mes || ''))
    ? String(req.query.mes)
    : hoje.slice(0, 7);
  // ⚠️ `primeiroDiaSemana: 0` (domingo) porque a grade do /eventos começa no
  // domingo, e as fases de cada linha são calculadas para o intervalo que a
  // linha EXIBE — ver o comentário da régua em utils/marketingSemanas.
  const semanas = semanasDoMesGrade(mes, { primeiroDiaSemana: 0, hoje });
  const coord = isAdminLike(req);

  // ⚠️ Cada bloco falha SOZINHO. Um evento sem ciclo não pode apagar a lista de
  // tarefas da pessoa, e erro NUNCA se disfarça de "está vazio" (a tela mostra
  // faixa âmbar com o motivo).
  const resposta = {
    hoje,
    mes,
    mes_anterior: mesVizinho(mes, -1),
    mes_seguinte: mesVizinho(mes, 1),
    semanas,
    avisos: [],
  };

  // ── Bloco 1 · minhas próximas entregas ────────────────────────────────────
  try {
    const meus = await meuMembroId(req);
    // Coordenador pode olhar a fila de outra pessoa (é ele que distribui).
    let alvo = meus;
    let membroAlvo = null;
    if (req.query.membro_id && coord) {
      alvo = [req.query.membro_id];
      membroAlvo = req.query.membro_id;
    }

    if (!alvo.length) {
      // Não é membro do Marketing (ex.: diretoria com leitura, dev). Declarar é
      // melhor que devolver lista vazia, que se lê como "não tenho nada a fazer".
      resposta.minhas_tarefas = { itens: [], total: 0, sem_prazo: 0, sou_membro: false, membro_id: null };
    } else {
      const { data, error } = await supabase
        .from('marketing_kanban_cards')
        .select('id, titulo, estado, origem, atribuido_a, prazo_producao, prazo_confirmado, data_fim, ordem_fila, raia_rapida, campanha_id, solicitacao_id')
        .in('atribuido_a', alvo)
        .neq('origem', 'evento')       // ⚠️ pedido explícito: ciclo criativo fica FORA (ele tem o bloco 3)
        .not('estado', 'in', '("concluido")')
        .is('deleted_at', null);
      if (error) throw error;

      const comPrazo = [];
      const semPrazo = [];
      for (const c of data || []) {
        const item = {
          id: c.id, titulo: c.titulo, estado: c.estado, origem: c.origem,
          prazo: prazoDoCard(c), raia_rapida: !!c.raia_rapida, ordem_fila: c.ordem_fila,
          atrasado: false,
        };
        if (item.prazo) { item.atrasado = item.prazo < hoje; comPrazo.push(item); }
        else semPrazo.push(item);
      }
      // Com prazo primeiro (mais cedo à frente); sem prazo depois, na ordem da
      // fila do Kanban. Sem isso o "próximas a entregar" seria ordem aleatória.
      comPrazo.sort((a, b) => (a.prazo < b.prazo ? -1 : a.prazo > b.prazo ? 1 : 0));
      semPrazo.sort((a, b) => (Number(b.raia_rapida) - Number(a.raia_rapida)) || ((a.ordem_fila ?? 1e9) - (b.ordem_fila ?? 1e9)));
      const todas = [...comPrazo, ...semPrazo];

      resposta.minhas_tarefas = {
        itens: todas.slice(0, 10),
        total: todas.length,
        sem_prazo: semPrazo.length,
        atrasadas: comPrazo.filter(i => i.atrasado).length,
        sou_membro: !membroAlvo,
        membro_id: membroAlvo,
      };
    }

    // ⚠️ O COORDENADOR não pega tarefa interna (ele distribui), então a caixa
    // "minhas entregas" nasceria vazia justamente pra quem pediu o dashboard.
    // A equipe vai no payload pra ele poder olhar a fila de cada pessoa — o que
    // continua honrando "filtrado por quem foi vinculado": muda o RECORTE, não
    // a régua. Só pra coordenador; produtor vê a fila dele e ponto.
    if (coord) {
      const { data: eq } = await supabase
        .from('marketing_membros')
        .select('id, profile_id, nome_display, habilidade')
        .eq('ativo', true)
        .is('deleted_at', null);
      const profIds = (eq || []).map(m => m.profile_id).filter(Boolean);
      let nomes = {};
      if (profIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, name').in('id', profIds);
        nomes = Object.fromEntries((profs || []).map(p => [p.id, p.name]));
      }
      resposta.equipe = (eq || [])
        .map(m => ({
          id: m.id,
          nome: nomes[m.profile_id] || m.nome_display || m.habilidade || '—',
          habilidade: m.habilidade,
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }
  } catch (e) {
    console.error('[MARKETING] dashboard/minhas-tarefas:', e.message);
    resposta.minhas_tarefas = { itens: [], total: 0, erro: 'Não foi possível carregar suas tarefas' };
    resposta.avisos.push('As suas tarefas não carregaram (o resto da tela está atualizado).');
  }

  // ── Bloco 2 · pulso das solicitações ──────────────────────────────────────
  try {
    // Janela de 6 meses pra série mensal · a base é pequena (dezenas), então
    // não há cap de 1000 em risco aqui; mesmo assim ordenamos pra paginar se
    // um dia crescer.
    const inicioSerie = (() => {
      const d = new Date(hoje + 'T00:00:00Z');
      d.setUTCMonth(d.getUTCMonth() - 5, 1);
      return d.toISOString().slice(0, 10);
    })();

    const { data: sols, error } = await supabase
      .from('solicitacoes')
      .select('id, titulo, status, eh_urgente, created_at, concluido_em, data_necessaria, sla_resolucao_deadline, solicitante_id, area_cliente')
      .eq('categoria', 'marketing')
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (error) throw error;

    const meses = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje + 'T00:00:00Z');
      d.setUTCMonth(d.getUTCMonth() - i, 1);
      meses.push(d.toISOString().slice(0, 7));
    }
    const serie = Object.fromEntries(meses.map(m => [m, { mes: m, criadas: 0, resolvidas: 0 }]));
    for (const s of sols || []) {
      const mc = (s.created_at || '').slice(0, 7);
      if (serie[mc]) serie[mc].criadas++;
      if (SOLIC_ENTREGUE.has(s.status) && s.concluido_em) {
        const mf = s.concluido_em.slice(0, 7);
        if (serie[mf]) serie[mf].resolvidas++;
      }
    }

    const abertas = (sols || []).filter(s => !SOLIC_ENTREGUE.has(s.status) && !SOLIC_ABORTADA.has(s.status));

    // ⚠️ O prazo que ORDENA é o que foi combinado com QUEM PEDIU
    // (`data_necessaria`). O `sla_resolucao_deadline` é o relógio interno e já
    // venceu em todas as abertas de hoje — ordenar por ele mostraria tudo como
    // igualmente atrasado e perderia a informação útil. Quando não há data
    // pedida, cai no SLA e a ORIGEM do prazo vai no payload pra tela dizer qual
    // é qual (número sem a régua ao lado é número que engana).
    const proximas = abertas.map(s => {
      const pedida = s.data_necessaria ? String(s.data_necessaria).slice(0, 10) : null;
      const sla = s.sla_resolucao_deadline ? String(s.sla_resolucao_deadline).slice(0, 10) : null;
      const prazo = pedida || sla;
      return {
        id: s.id, titulo: s.titulo, status: s.status, eh_urgente: !!s.eh_urgente,
        criada_em: (s.created_at || '').slice(0, 10),
        prazo, prazo_origem: pedida ? 'pedida' : (sla ? 'sla' : null),
        sla_vencido: !!(sla && sla < hoje),
        atrasada: !!(prazo && prazo < hoje),
        area_cliente: s.area_cliente || null,
      };
    }).sort((a, b) => {
      if (a.eh_urgente !== b.eh_urgente) return a.eh_urgente ? -1 : 1;
      if (!a.prazo) return 1;
      if (!b.prazo) return -1;
      return a.prazo < b.prazo ? -1 : a.prazo > b.prazo ? 1 : 0;
    });

    resposta.solicitacoes = {
      serie: meses.map(m => serie[m]),
      proximas: proximas.slice(0, 8),
      abertas: abertas.length,
      atrasadas: proximas.filter(p => p.atrasada).length,
      total_historico: (sols || []).length,
      resolvidas_historico: (sols || []).filter(s => SOLIC_ENTREGUE.has(s.status)).length,
      janela: { de: inicioSerie, ate: hoje, meses: 6 },
    };
  } catch (e) {
    console.error('[MARKETING] dashboard/solicitacoes:', e.message);
    resposta.solicitacoes = { serie: [], proximas: [], erro: 'Não foi possível carregar as solicitações' };
    resposta.avisos.push('O pulso das solicitações não carregou (o resto da tela está atualizado).');
  }

  // ── Bloco 3 · calendário semanal do ciclo criativo ────────────────────────
  try {
    const { data: ciclos, error: eCiclos } = await supabase
      .from('event_cycles')
      .select('event_id, data_dia_d, events(id, name, status, date, event_categories(name))')
      .eq('status', 'ativo');
    if (eCiclos) throw eCiclos;

    const ativos = (ciclos || []).filter(c => c.events && c.events.status !== 'concluido');
    const eventIds = ativos.map(c => c.event_id);

    if (!eventIds.length) {
      resposta.ciclo = { linhas: [], sem_data: 0, ciclos_ativos: 0 };
    } else {
      const fases = await lerEmLotes('event_cycle_phases',
        'id, event_id, template_id, numero_fase, nome_fase, area, status, data_inicio_prevista, data_fim_prevista',
        'event_id', eventIds);

      // Tarefas do ciclo · SÓ marketing (o pedido é explícito: "coloque apenas
      // as coisas do Marketing"). As de produção/compras/etc ficam no /eventos.
      const tarefas = (await lerEmLotes('cycle_phase_tasks',
        'id, event_id, event_phase_id, area, status', 'event_id', eventIds))
        .filter(t => t.area === 'marketing');

      // Card espelho no Kanban (é ele que carrega dono e estado do Marketing).
      const cards = (await lerEmLotes('marketing_kanban_cards',
        'id, estado, atribuido_a, cycle_phase_task_id, deleted_at',
        'cycle_phase_task_id', tarefas.map(t => t.id)))
        .filter(c => !c.deleted_at);
      const cardDaTarefa = Object.fromEntries(cards.map(c => [c.cycle_phase_task_id, c]));

      // Contagem por fase. ⚠️ Quem decide "está feito" é o CARD quando ele
      // existe (é a verdade do Marketing); sem card, o status da tarefa no
      // /eventos. O detalhe da fase mostra os DOIS lados, então a divergência
      // fica visível em vez de escondida numa média.
      const porFase = {};
      for (const t of tarefas) {
        const b = porFase[t.event_phase_id] || (porFase[t.event_phase_id] = { total: 0, pendentes: 0, sem_dono: 0 });
        b.total++;
        const c = cardDaTarefa[t.id];
        const feito = c ? c.estado === 'concluido' : TAREFA_FEITA.has(t.status);
        if (!feito) b.pendentes++;
        if (c && !c.atribuido_a) b.sem_dono++;
      }

      const fasesPorEvento = {};
      for (const f of fases) (fasesPorEvento[f.event_id] || (fasesPorEvento[f.event_id] = [])).push(f);

      // Ordem das linhas: pelo Dia D (o que acontece primeiro em cima) — e é
      // essa ordem que fixa a COR de cada evento (ver utils/marketingCores).
      const eventos = ativos
        .slice()
        .sort((a, b) => String(a.data_dia_d || a.events.date || '').localeCompare(String(b.data_dia_d || b.events.date || '')))
        .map((c, i) => ({
          id: c.event_id,
          nome: c.events.name,
          categoria: c.events.event_categories?.name || null,
          dia_d: c.data_dia_d || c.events.date || null,
          cor: corDoEvento(i),
          cor_excedente: ehExcedente(i),
        }));

      const { linhas, sem_data } = montarCalendario({ eventos, fasesPorEvento, semanas });

      // Anexa as contagens de marketing em cada célula.
      for (const l of linhas) {
        for (const cel of l.celulas) {
          if (cel.vazio) continue;
          const b = porFase[cel.fase_id] || { total: 0, pendentes: 0, sem_dono: 0 };
          cel.mkt_total = b.total;
          cel.mkt_pendentes = b.pendentes;
          cel.mkt_sem_dono = b.sem_dono;
        }
      }

      resposta.ciclo = {
        linhas,
        sem_data,
        ciclos_ativos: ativos.length,
        // Declarado pra tela poder avisar quando algum evento caiu no cinza.
        cores_disponiveis: CORES_EVENTO.length,
        eventos_sem_cor_propria: linhas.filter(l => l.cor_excedente).length,
        // ⚠️ Ciclo ativo que não aparece no mês exibido (começa depois, ou já
        // acabou). DECLARADO — "só vejo 4 séries" com 7 ciclos ativos parece bug.
        fora_da_janela: ativos.length - linhas.length,
      };
    }
  } catch (e) {
    console.error('[MARKETING] dashboard/ciclo:', e.message);
    resposta.ciclo = { linhas: [], sem_data: 0, erro: 'Não foi possível carregar o ciclo criativo' };
    resposta.avisos.push('O calendário do ciclo criativo não carregou (o resto da tela está atualizado).');
  }

  res.json(resposta);
});

// ─── Kanban · macro-tarefas + janela de semanas ─────────────────────────────
//
// Pedido do Pedro (14/08): *"na aba de kanban e backlog, não coloque as
// subtarefas como quadrados; coloca as macro tarefas, porque senão fica muita
// coisa, e coloque apenas dos que estão na semana atual e na próxima"*.
//
// ⚠️ A MACRO é o EVENTO, e a subtarefa é o card do ciclo criativo. Medido em
// 14/08: **105 cards de evento de 15 eventos** (7 com ciclo ativo, 8 já
// concluídos) contra 7 cards internos — o Kanban era 93% ciclo criativo.
//
// ⚠️⚠️ Quem decide "está na janela" é o SERVIDOR, com a MESMA régua do
// calendário do dashboard (`utils/marketingSemanas`, no gate). Se o front
// filtrasse, o Kanban e o calendário poderiam discordar sobre a mesma semana.
//
// ⚠️ ESCONDER CARD É ESCONDER TRABALHO. Por isso: (1) o que ficou fora é
// CONTADO e devolvido (`fora_da_janela`), pra tela declarar e oferecer "ver
// tudo"; (2) card SEM data de fase entra como `na_janela: null` e a tela
// MOSTRA — "não sei quando é" nunca vira "não aparece"; (3) cards internos e de
// solicitação ficam SEMPRE visíveis (não têm fase, e o pedido era sobre o ciclo).
router.get('/kanban', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const hoje = hojeBRTMkt();
    const semanas = limitarInteiro(req.query.janela_semanas, 2, 1, 12);
    const janelaSemanas = montarSemanas(hoje, { retro: 0, adiante: semanas - 1 });
    const janela = {
      de: janelaSemanas[0]?.ini || hoje,
      ate: janelaSemanas[janelaSemanas.length - 1]?.fim || hoje,
      semanas,
    };

    const { data, error } = await supabase
      .from('marketing_kanban_cards')
      .select('*')
      .is('deleted_at', null)
      .order('raia_rapida', { ascending: false })
      .order('ordem_fila', { ascending: true });
    if (error) throw error;

    const cards = await enrichCards(data || []);

    let foraDaJanela = 0;
    let semDataDaFase = 0;
    for (const c of cards) {
      if (c.origem !== 'evento') { c.na_janela = true; continue; }
      const f = c.cycle_phase_task;
      if (!f || !f.fase_de || !f.fase_ate) {
        c.na_janela = null;          // desconhecido — a tela MOSTRA
        semDataDaFase++;
        continue;
      }
      c.na_janela = diasSobrepostos(f.fase_de, f.fase_ate, janela.de, janela.ate) > 0;
      if (!c.na_janela) foraDaJanela++;
    }

    res.json({
      hoje,
      janela,
      semanas: janelaSemanas,
      cards,
      fora_da_janela: foraDaJanela,
      sem_data_da_fase: semDataDaFase,
      total: cards.length,
    });
  } catch (e) {
    console.error('[MARKETING] kanban:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Detalhe de uma FASE · o que o Marketing tem pra entregar ali.
// ⚠️ Fase sem tarefa de marketing devolve `vazio: true` com o motivo, nunca
// lista vazia sem explicação (foi pedido nominalmente pelo Pedro).
router.get('/dashboard/fase/:faseId', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { data: fase, error } = await supabase
      .from('event_cycle_phases')
      .select('id, event_id, template_id, numero_fase, nome_fase, area, status, momento_chave, data_inicio_prevista, data_fim_prevista, data_conclusao, observacoes, events(id, name)')
      .eq('id', req.params.faseId)
      .maybeSingle();
    if (error) throw error;
    if (!fase) return res.status(404).json({ error: 'Fase não encontrada' });

    // O que a fase espera entregar (padrão do template) · contexto útil mesmo
    // quando não há tarefa cadastrada. Leitura ISOLADA: se falhar, a tela segue
    // de pé sem o padrão (nunca derruba o detalhe inteiro).
    let entregas_padrao = null;
    let descricao_fase = null;
    if (fase.template_id) {
      const { data: tpl } = await supabase
        .from('cycle_phase_templates')
        .select('entregas_padrao, descricao')
        .eq('id', fase.template_id)
        .maybeSingle();
      entregas_padrao = tpl?.entregas_padrao || null;
      descricao_fase = tpl?.descricao || null;
    }

    const { data: tarefas, error: eT } = await supabase
      .from('cycle_phase_tasks')
      .select('id, titulo, descricao, area, status, prazo, prioridade, is_critical, responsavel_nome, entrega, observacoes')
      .eq('event_phase_id', fase.id)
      .eq('area', 'marketing')                 // ⚠️ só Marketing, por pedido
      .order('prazo', { ascending: true, nullsFirst: false });
    if (eT) throw eT;

    const cards = (await lerEmLotes('marketing_kanban_cards',
      'id, titulo, estado, atribuido_a, etiqueta_tipo_id, prazo_producao, prazo_confirmado, data_fim, cycle_phase_task_id, deleted_at',
      'cycle_phase_task_id', (tarefas || []).map(t => t.id)))
      .filter(c => !c.deleted_at);
    const enriquecidos = await enrichCards(cards);
    const cardDaTarefa = Object.fromEntries(enriquecidos.map(c => [c.cycle_phase_task_id, c]));

    const itens = (tarefas || []).map(t => {
      const c = cardDaTarefa[t.id];
      return {
        tarefa_id: t.id,
        titulo: t.titulo,
        descricao: t.descricao || null,
        entrega: t.entrega || null,
        prazo: t.prazo ? String(t.prazo).slice(0, 10) : null,
        prioridade: t.prioridade || null,
        is_critical: !!t.is_critical,
        responsavel_eventos: t.responsavel_nome || null,   // o dono no /eventos
        status_eventos: t.status,
        // O lado do Marketing (o card espelho). Pode não existir se o trigger
        // não rodou — e nesse caso a tela DIZ que não há card, em vez de sumir.
        card: c ? {
          id: c.id, titulo: c.titulo, estado: c.estado,
          dono: c.atribuido?.profile?.name || c.atribuido?.nome_display || null,
          // ⚠️ O ID do dono (não só o nome) porque o dashboard passou a ATRIBUIR
          // daqui — o ciclo criativo saiu do Kanban e é gerenciado nesta tela.
          atribuido_a: c.atribuido_a || null,
          etiqueta: c.etiqueta_tipo?.nome || null,
          prazo: prazoDoCard(c),
        } : null,
        feito: c ? c.estado === 'concluido' : TAREFA_FEITA.has(t.status),
      };
    });

    const pendentes = itens.filter(i => !i.feito);

    res.json({
      fase: {
        id: fase.id, numero_fase: fase.numero_fase, nome_fase: fase.nome_fase,
        area: fase.area, status: fase.status, momento_chave: fase.momento_chave || null,
        de: fase.data_inicio_prevista, ate: fase.data_fim_prevista,
        concluida_em: fase.data_conclusao || null,
        observacoes: fase.observacoes || null,
      },
      evento: { id: fase.event_id, nome: fase.events?.name || null, link: `/eventos/${fase.event_id}` },
      entregas_padrao,
      descricao_fase,
      itens,
      total: itens.length,
      pendentes: pendentes.length,
      vazio: itens.length === 0,
      motivo_vazio: itens.length === 0
        ? (fase.area === 'marketing'
          ? 'Esta fase é do Marketing, mas não há nenhuma tarefa de marketing cadastrada nela.'
          : `Esta fase é de "${fase.area || 'outra área'}" — não há atividade do Marketing programada para essa etapa.`)
        : null,
    });
  } catch (e) {
    console.error('[MARKETING] dashboard/fase:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Fila de prioridade (Spec 018b) ─────────────────────────────────────────

// (removidos · redesenho 2026-05-31) GET /fila e PATCH /fila/reordenar: a fila
// virou ordenação dentro das colunas do Kanban (urgente→ordem_fila). Só o
// /fila/posicao (abaixo · mostrado ao solicitante) sobrevive.

// Posição da fila pra solicitante · so retorna se o card pertence a uma
// solicitação do user (transparencia sem expor outros cards).
router.get('/fila/posicao/:cardId', async (req, res) => {
  try {
    const { data: card } = await supabase
      .from('marketing_kanban_cards')
      .select('id, ordem_fila, estado, solicitacao_id, solicitacoes:solicitacao_id(solicitante_id)')
      .eq('id', req.params.cardId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!card) return res.status(404).json({ error: 'Card não encontrado' });

    const isOwner = card.solicitacoes?.solicitante_id === req.user.userId;
    const isMktMember = (req.user.granular?.modulePerms?.marketing?.leitura || 0) >= 1;
    if (!isOwner && !isMktMember && !['admin', 'diretor'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    if (!['fila', 'em_producao'].includes(card.estado)) {
      return res.json({ posicao: null, total: 0, estado: card.estado });
    }

    const { count: total } = await supabase
      .from('marketing_kanban_cards')
      .select('id', { count: 'exact', head: true })
      .in('estado', ['fila', 'em_producao'])
      .is('deleted_at', null);

    const { count: na_frente } = await supabase
      .from('marketing_kanban_cards')
      .select('id', { count: 'exact', head: true })
      .in('estado', ['fila', 'em_producao'])
      .is('deleted_at', null)
      .lt('ordem_fila', card.ordem_fila);

    res.json({
      posicao: (na_frente || 0) + 1,
      total: total || 0,
      estado: card.estado,
    });
  } catch (e) {
    console.error('[MARKETING] fila posicao:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Entregaveis (Spec 006 · SharePoint upload) ─────────────────────────────

router.get('/cards/:id/entregaveis', authorizeModule('marketing', 1), async (req, res) => {
  try {
    // RLS bloqueia solicitante de ver entregaveis de cards alheios.
    // ⚠️ Ownership pela régua ÚNICA (card → campanha → solicitação): antes só o
    // vínculo DIRETO passava, então o dono de pedido do fluxo em uso tomava 403
    // no próprio arquivo. Fail-closed: erro de consulta nega.
    const lvl = levelOf(req);
    const ehEquipe = lvl >= 3 || ['admin', 'diretor'].includes(req.user.role);
    if (!ehEquipe) {
      const { data: card } = await supabase
        .from('marketing_kanban_cards')
        .select('id')
        .eq('id', req.params.id)
        .is('deleted_at', null)
        .maybeSingle();
      if (!card) return res.status(404).json({ error: 'Card não encontrado' });
      if (!(await ehSolicitanteDoCard(req.params.id, req.user.userId))) {
        return res.status(403).json({ error: 'Sem permissão' });
      }
    }

    const entregaveis = await spMarketing.listarEntregaveis(req.params.id);
    // ⚠️ Solicitante NUNCA vê `tipo='referencia'` — referência é briefing/inspiração
    // INTERNA da equipe (bucket Marketing/Referencias). Ele vê só o arquivo FINAL.
    res.json(ehEquipe ? entregaveis : (entregaveis || []).filter(e => e.tipo !== 'referencia'));
  } catch (e) {
    console.error('[MARKETING] entregaveis list:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/cards/:id/entregaveis',
  authorizeModule('marketing', 3),
  upload.single('arquivo'),
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'Arquivo (campo "arquivo") obrigatorio · multipart/form-data' });

      const tipo = req.body?.tipo === 'referencia' ? 'referencia' : 'entregavel';
      const result = await spMarketing.uploadEntregavel({
        cardId: req.params.id,
        userId: req.user.userId,
        file: req.file,
        tipo,
      });

      // Notifica solicitante quando arquivo FINAL eh anexado (não referência · card no estado correto)
      try {
        const { data: card } = await supabase
          .from('marketing_kanban_cards')
          .select('id, estado, solicitacao_id, campanha_id, titulo')
          .eq('id', req.params.id)
          .maybeSingle();
        // ⚠️ Régua única (era `card.solicitacao_id`, que não existe no fluxo em uso).
        const solUp = (tipo !== 'referencia' && card?.estado === 'concluido')
          ? await solicitanteDoCard(card)
          : null;
        if (solUp && !solUp.erro) {
          const sol = { solicitante_id: solUp.solicitante_id, titulo: solUp.titulo_solicitacao };
          if (sol?.solicitante_id) {
            notificar({
              modulo: 'marketing',
              tipo: 'marketing_entregavel_anexado',
              titulo: `Arquivo final: ${sol.titulo}`,
              mensagem: `${req.file.originalname} anexado ao seu pedido · disponível pra download.`,
              link: '/solicitacoes',
              severidade: 'info',
              chaveDedup: `marketing_entregavel_${result.id}`,
              targetIds: [sol.solicitante_id],
            }).catch(err => console.error('[MARKETING] notify entregavel:', err.message));
          }
        }
      } catch (notifyErr) {
        console.error('[MARKETING] notify entregavel block:', notifyErr.message);
      }

      res.status(201).json(result);
    } catch (e) {
      console.error('[MARKETING] entregaveis upload:', e.message);
      const status = /excede|invalido|nao encontrado/i.test(e.message || '') ? 400 : 500;
      res.status(status).json({ error: e.message });
    }
  }
);

router.get('/entregaveis/:id/download', authorizeModule('marketing', 1), async (req, res) => {
  try {
    // ⚠️⚠️ ERA AQUI O 403 que impedia a pessoa de baixar o próprio arquivo:
    // `if (!card?.solicitacao_id) return 403` negava todo card vindo de campanha
    // — o fluxo em uso. Agora a régua única atravessa card → campanha →
    // solicitação, e segue fail-closed (erro de consulta nega).
    const lvl = levelOf(req);
    if (lvl < 3 && !['admin', 'diretor'].includes(req.user.role)) {
      const { data: ent } = await supabase
        .from('marketing_entregaveis')
        .select('card_id, tipo')
        .eq('id', req.params.id)
        .is('deleted_at', null)
        .maybeSingle();
      if (!ent) return res.status(404).json({ error: 'Entregavel não encontrado' });
      // Referência é material INTERNO da equipe — nunca sai pro solicitante.
      if (ent.tipo === 'referencia') return res.status(403).json({ error: 'Sem permissão' });
      if (!(await ehSolicitanteDoCard(ent.card_id, req.user.userId))) {
        return res.status(403).json({ error: 'Sem permissão' });
      }
    }

    const info = await spMarketing.getDownloadUrl(req.params.id);
    // Redireciona pra URL do Graph (TTL ~1h) · evita expor token / segredos
    res.redirect(302, info.url);
  } catch (e) {
    console.error('[MARKETING] entregavel download:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/entregaveis/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    await spMarketing.removerEntregavel(req.params.id, req.user.userId);
    res.json({ ok: true });
  } catch (e) {
    console.error('[MARKETING] entregavel delete:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/cards/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { data, error } = await supabase
      .rpc('app_soft_delete', {
        p_table_name: 'marketing_kanban_cards',
        p_row_id: req.params.id,
        p_deleted_by: req.user.userId,
      });
    if (error) throw error;
    if (data === false) return res.status(404).json({ error: 'Card não encontrado ou já excluido' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[MARKETING] soft delete:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Decisão de urgência · coord aceita/recusa raia rapida ──────────────────

router.patch('/cards/:id/decidir-urgencia', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { decisao, motivo_recusa } = req.body || {};
    if (!['aceita', 'recusada'].includes(decisao)) {
      return res.status(400).json({ error: 'decisão deve ser "aceita" ou "recusada"' });
    }
    if (decisao === 'recusada' && (!motivo_recusa || motivo_recusa.trim().length < 5)) {
      return res.status(400).json({ error: 'motivo_recusa obrigatório (>= 5 chars) quando recusar' });
    }

    const { data: atual } = await supabase
      .from('marketing_kanban_cards')
      .select('*, solicitacao:solicitacoes(id, solicitante_id, eh_urgente, urgencia_decisao, titulo)')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Card não encontrado' });
    if (!atual.solicitacao_id) {
      return res.status(400).json({ error: 'Card sem solicitação linkada · urgência decidida no próprio card eh raia_rapida (use PATCH)' });
    }

    const solUpdate = {
      urgencia_decisao: decisao,
      urgencia_decidida_por: req.user.userId,
      urgencia_decidida_em: new Date().toISOString(),
    };
    if (decisao === 'recusada') solUpdate.urgencia_motivo_recusa = motivo_recusa.trim();

    await supabase
      .from('solicitacoes')
      .update(solUpdate)
      .eq('id', atual.solicitacao_id);

    // Card · so aceita vira raia_rapida
    const cardUpdate = { raia_rapida: decisao === 'aceita' };
    const { data: novoCard, error } = await supabase
      .from('marketing_kanban_cards')
      .update(cardUpdate)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;

    const sol = atual.solicitacao;
    if (sol?.solicitante_id) {
      notificar({
        modulo: 'marketing',
        tipo: 'marketing_urgencia_decisao',
        titulo: decisao === 'aceita' ? `Urgencia aceita: ${sol.titulo}` : `Urgencia recusada: ${sol.titulo}`,
        mensagem: decisao === 'aceita'
          ? 'Pedro aceitou a urgência · entrou na raia rapida.'
          : `Pedro recusou a urgência · ${motivo_recusa.trim()}. Segue o fluxo normal.`,
        link: '/solicitacoes',
        severidade: decisao === 'aceita' ? 'info' : 'alta',
        chaveDedup: `marketing_urgencia_${atual.solicitacao_id}_${decisao}`,
        targetIds: [sol.solicitante_id],
      }).catch(err => console.error('[MARKETING] notify urgencia:', err.message));
    }

    const enriched = await enrichCards([novoCard]);
    res.json(enriched[0]);
  } catch (e) {
    console.error('[MARKETING] decidir-urgencia:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ANALYTICS (Spec 013 · nível 1)
// ═══════════════════════════════════════════════════════════════════════

router.get('/analytics/kpis', authorizeModule('marketing', 1), async (req, res) => {
  try {
    // Série temporal dos 4 KPIs MKT-* nas últimas N semanas (default 12)
    const semanas = Math.min(52, parseInt(req.query.semanas) || 12);
    const desde = new Date();
    desde.setDate(desde.getDate() - semanas * 7);

    const { data, error } = await supabase
      .from('kpi_valores_calculados')
      .select('kpi_id, periodo_referencia, valor_calculado, detalhes, calculado_em')
      .in('kpi_id', ['MKT-PRAZO', 'MKT-LEAD', 'MKT-THROUGHPUT', 'MKT-DEM-CAP'])
      .gte('calculado_em', desde.toISOString())
      .order('periodo_referencia', { ascending: true });
    if (error) throw error;

    // Normaliza pra shape estavel pro frontend (periodo/valor/observacao)
    const norm = (data || []).map(r => ({
      kpi_id: r.kpi_id,
      periodo: r.periodo_referencia,
      valor: r.valor_calculado,
      observacao: r.detalhes?.observacao || null,
    }));

    const byKpi = { 'MKT-PRAZO': [], 'MKT-LEAD': [], 'MKT-THROUGHPUT': [], 'MKT-DEM-CAP': [] };
    norm.forEach(r => {
      if (byKpi[r.kpi_id]) byKpi[r.kpi_id].push(r);
    });

    // Último valor (snapshot atual)
    const snapshot = {};
    Object.entries(byKpi).forEach(([id, arr]) => {
      const last = arr[arr.length - 1];
      snapshot[id] = last ? { valor: last.valor, periodo: last.periodo, observacao: last.observacao } : null;
    });

    res.json({ snapshot, serie: byKpi });
  } catch (e) {
    console.error('[MARKETING] analytics kpis:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/analytics/aprovacoes-origem', authorizeModule('marketing', 1), async (req, res) => {
  try {
    // Tempo medio que cada diretor leva pra aprovar solicitação da área marketing
    // janela default 90d
    const dias = Math.min(365, parseInt(req.query.dias) || 90);
    const desde = new Date();
    desde.setDate(desde.getDate() - dias);

    const { data, error } = await supabase
      .from('solicitacoes')
      .select('aprovacao_origem_diretor_id, aprovacao_origem_em, aprovacao_origem_status, created_at')
      .eq('area_responsavel', 'marketing')
      .gte('created_at', desde.toISOString())
      .not('aprovacao_origem_diretor_id', 'is', null)
      .in('aprovacao_origem_status', ['aprovada', 'rejeitada']);
    if (error) throw error;

    const agg = new Map();
    (data || []).forEach(s => {
      if (!s.aprovacao_origem_em) return;
      const id = s.aprovacao_origem_diretor_id;
      const horas = (new Date(s.aprovacao_origem_em).getTime() - new Date(s.created_at).getTime()) / 3600000;
      if (!agg.has(id)) agg.set(id, { diretor_id: id, total: 0, soma_horas: 0, rejeitadas: 0 });
      const a = agg.get(id);
      a.total++;
      a.soma_horas += horas;
      if (s.aprovacao_origem_status === 'rejeitada') a.rejeitadas++;
    });

    const lista = [...agg.values()].map(a => ({
      diretor_id: a.diretor_id,
      total: a.total,
      tempo_medio_h: Math.round((a.soma_horas / a.total) * 10) / 10,
      rejeitadas: a.rejeitadas,
      gargalo: (a.soma_horas / a.total) > 24,  // >24h flag
    })).sort((a, b) => b.tempo_medio_h - a.tempo_medio_h);

    // Enriquecer com profile.name
    if (lista.length > 0) {
      const ids = lista.map(x => x.diretor_id);
      const { data: profs } = await supabase.from('profiles').select('id, name').in('id', ids);
      const byId = Object.fromEntries((profs || []).map(p => [p.id, p]));
      lista.forEach(x => { x.diretor_nome = byId[x.diretor_id]?.name || 'Diretor'; });
    }
    res.json(lista);
  } catch (e) {
    console.error('[MARKETING] aprovacoes-origem:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// ADMIN · CRUD das 4 entidades (Spec 009 · so nível 5)
// ═══════════════════════════════════════════════════════════════════════

// ─── Membros ────────────────────────────────────────────────────────────────

router.get('/admin/membros', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('marketing_membros')
      .select('*')
      .is('deleted_at', null)
      .order('habilidade');
    if (error) throw error;
    const profileIds = [...new Set((data || []).map(m => m.profile_id).filter(Boolean))];
    let profileMap = {};
    if (profileIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, name, email').in('id', profileIds);
      profileMap = Object.fromEntries((profs || []).map(p => [p.id, p]));
    }
    res.json((data || []).map(m => ({
      ...m,
      profile: profileMap[m.profile_id]
        || (m.nome_display ? { id: null, name: m.nome_display, email: null } : null),
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/membros', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { profile_id, habilidade, horas_semanais, slots_dia, observacao, nome_display } = req.body || {};
    if (!habilidade) return res.status(400).json({ error: 'habilidade obrigatoria' });
    if (!profile_id && !nome_display) {
      return res.status(400).json({ error: 'profile_id OU nome_display obrigatório (use nome_display pra pessoas sem login)' });
    }
    const { data, error } = await supabase
      .from('marketing_membros')
      .insert({
        profile_id: profile_id || null,
        nome_display: nome_display || null,
        habilidade,
        horas_semanais: horas_semanais ?? 30,
        slots_dia: slots_dia ?? 3,
        observacao: observacao || null,
        ativo: true,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    if (/duplicate key/i.test(e.message)) {
      return res.status(409).json({ error: 'Este profile já tem essa habilidade · use PATCH pra editar.' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.patch('/admin/membros/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const update = {};
    const { habilidade, horas_semanais, slots_dia, observacao, ativo, nome_display } = req.body || {};
    if (habilidade !== undefined) update.habilidade = habilidade;
    if (horas_semanais !== undefined) update.horas_semanais = horas_semanais;
    if (slots_dia !== undefined) update.slots_dia = slots_dia;
    if (observacao !== undefined) update.observacao = observacao;
    if (nome_display !== undefined) update.nome_display = nome_display || null;
    if (ativo !== undefined) update.ativo = !!ativo;
    update.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('marketing_membros')
      .update(update)
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/admin/membros/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'marketing_membros',
      p_row_id: req.params.id,
      p_deleted_by: req.user.userId,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Etiquetas tipo ─────────────────────────────────────────────────────────

router.get('/admin/etiquetas/tipo', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('marketing_etiquetas_tipo')
      .select('*')
      .order('ordem');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/etiquetas/tipo', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { slug, nome, habilidade_padrao, esforco_max_h, cor, ordem, grupo } = req.body || {};
    if (!slug || !nome) return res.status(400).json({ error: 'slug e nome obrigatórios' });
    const { data, error } = await supabase
      .from('marketing_etiquetas_tipo')
      .insert({ slug, nome, habilidade_padrao, esforco_max_h, cor, ordem: ordem ?? 100, grupo: grupo || null, ativo: true })
      .select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/admin/etiquetas/tipo/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const update = {};
    const { nome, habilidade_padrao, esforco_max_h, cor, ordem, ativo, grupo } = req.body || {};
    if (nome !== undefined) update.nome = nome;
    if (habilidade_padrao !== undefined) update.habilidade_padrao = habilidade_padrao;
    if (esforco_max_h !== undefined) update.esforco_max_h = esforco_max_h;
    if (cor !== undefined) update.cor = cor;
    if (ordem !== undefined) update.ordem = ordem;
    if (ativo !== undefined) update.ativo = !!ativo;
    if (grupo !== undefined) update.grupo = grupo || null;
    const { data, error } = await supabase
      .from('marketing_etiquetas_tipo')
      .update(update)
      .eq('id', req.params.id)
      .select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Etiquetas destino ──────────────────────────────────────────────────────

router.get('/admin/etiquetas/destino', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('marketing_etiquetas_destino')
      .select('*')
      .order('ordem');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/etiquetas/destino', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { slug, nome, cor, ordem } = req.body || {};
    if (!slug || !nome) return res.status(400).json({ error: 'slug e nome obrigatórios' });
    const { data, error } = await supabase
      .from('marketing_etiquetas_destino')
      .insert({ slug, nome, cor, ordem: ordem ?? 100, ativo: true })
      .select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/admin/etiquetas/destino/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const update = {};
    const { nome, cor, ordem, ativo } = req.body || {};
    if (nome !== undefined) update.nome = nome;
    if (cor !== undefined) update.cor = cor;
    if (ordem !== undefined) update.ordem = ordem;
    if (ativo !== undefined) update.ativo = !!ativo;
    const { data, error } = await supabase
      .from('marketing_etiquetas_destino')
      .update(update)
      .eq('id', req.params.id)
      .select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Recorrentes ────────────────────────────────────────────────────────────

router.get('/admin/recorrentes', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('marketing_compromissos_recorrentes')
      .select('*')
      .is('deleted_at', null)
      .order('dia_semana').order('hora_inicio');
    if (error) throw error;

    const ids = (data || []).map(r => r.id);
    let partMap = {};
    if (ids.length) {
      const { data: parts } = await supabase
        .from('marketing_recorrentes_participantes')
        .select('compromisso_id, membro_id')
        .in('compromisso_id', ids);
      partMap = (parts || []).reduce((acc, p) => {
        if (!acc[p.compromisso_id]) acc[p.compromisso_id] = [];
        acc[p.compromisso_id].push(p.membro_id);
        return acc;
      }, {});
    }
    res.json((data || []).map(r => ({ ...r, participantes_ids: partMap[r.id] || [] })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/recorrentes', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { participantes_ids, dia_semana, hora_inicio, duracao_h, descricao } = req.body || {};
    if (!Array.isArray(participantes_ids) || participantes_ids.length === 0 ||
        dia_semana == null || !hora_inicio || !duracao_h || !descricao) {
      return res.status(400).json({ error: 'participantes_ids (array, >=1), dia_semana, hora_inicio, duracao_h, descricao obrigatorios' });
    }
    const { data, error } = await supabase
      .from('marketing_compromissos_recorrentes')
      .insert({ dia_semana, hora_inicio, duracao_h, descricao, ativo: true })
      .select('*').single();
    if (error) throw error;

    // Insere participantes
    const rows = participantes_ids.map(membro_id => ({ compromisso_id: data.id, membro_id }));
    const { error: partErr } = await supabase
      .from('marketing_recorrentes_participantes')
      .insert(rows);
    if (partErr) {
      // Rollback · soft delete o compromisso recem criado
      await supabase.from('marketing_compromissos_recorrentes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', data.id);
      throw partErr;
    }

    res.status(201).json({ ...data, participantes_ids });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/admin/recorrentes/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const update = {};
    const { participantes_ids, dia_semana, hora_inicio, duracao_h, descricao, ativo } = req.body || {};
    if (dia_semana !== undefined) update.dia_semana = dia_semana;
    if (hora_inicio !== undefined) update.hora_inicio = hora_inicio;
    if (duracao_h !== undefined) update.duracao_h = duracao_h;
    if (descricao !== undefined) update.descricao = descricao;
    if (ativo !== undefined) update.ativo = !!ativo;

    if (Object.keys(update).length > 0) {
      const { error } = await supabase
        .from('marketing_compromissos_recorrentes')
        .update(update)
        .eq('id', req.params.id);
      if (error) throw error;
    }

    // Substitui participantes se enviado · DELETE + INSERT em batch
    if (Array.isArray(participantes_ids)) {
      if (participantes_ids.length === 0) {
        return res.status(400).json({ error: 'participantes_ids nao pode ser array vazio · use DELETE no compromisso pra remover' });
      }
      const { error: delErr } = await supabase
        .from('marketing_recorrentes_participantes')
        .delete()
        .eq('compromisso_id', req.params.id);
      if (delErr) throw delErr;
      const rows = participantes_ids.map(membro_id => ({ compromisso_id: req.params.id, membro_id }));
      const { error: insErr } = await supabase
        .from('marketing_recorrentes_participantes')
        .insert(rows);
      if (insErr) throw insErr;
    }

    const { data: novo } = await supabase
      .from('marketing_compromissos_recorrentes')
      .select('*').eq('id', req.params.id).single();
    const { data: parts } = await supabase
      .from('marketing_recorrentes_participantes')
      .select('membro_id').eq('compromisso_id', req.params.id);
    res.json({ ...novo, participantes_ids: (parts || []).map(p => p.membro_id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/admin/recorrentes/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'marketing_compromissos_recorrentes',
      p_row_id: req.params.id,
      p_deleted_by: req.user.userId,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Overrides de capacidade (férias / picos) ───────────────────────────────

router.get('/admin/overrides', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { desde, ate } = req.query;
    let q = supabase
      .from('marketing_capacidade_override')
      .select('*')
      .is('deleted_at', null)
      .order('semana_inicio', { ascending: false });
    if (desde) q = q.gte('semana_inicio', desde);
    if (ate)   q = q.lte('semana_inicio', ate);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/overrides', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { membro_id, semana_inicio, horas_disponiveis, motivo } = req.body || {};
    if (!membro_id || !semana_inicio || horas_disponiveis == null) {
      return res.status(400).json({ error: 'membro_id, semana_inicio, horas_disponiveis obrigatorios' });
    }
    const { data, error } = await supabase
      .from('marketing_capacidade_override')
      .insert({ membro_id, semana_inicio, horas_disponiveis, motivo: motivo || null, created_by: req.user.userId })
      .select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    if (/duplicate key/i.test(e.message)) {
      return res.status(409).json({ error: 'Já existe override pra esse membro nessa semana · use PATCH' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.patch('/admin/overrides/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const update = {};
    const { horas_disponiveis, motivo } = req.body || {};
    if (horas_disponiveis !== undefined) update.horas_disponiveis = horas_disponiveis;
    if (motivo !== undefined) update.motivo = motivo;
    const { data, error } = await supabase
      .from('marketing_capacidade_override')
      .update(update)
      .eq('id', req.params.id)
      .select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/admin/overrides/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { error } = await supabase.rpc('app_soft_delete', {
      p_table_name: 'marketing_capacidade_override',
      p_row_id: req.params.id,
      p_deleted_by: req.user.userId,
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Checklist do card (sub-itens · estilo Trello · 2026-05-29) ─────────────
router.get('/cards/:id/checklist', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('marketing_card_checklist')
      .select('*')
      .eq('card_id', req.params.id)
      .order('ordem', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/cards/:id/checklist', authorizeModule('marketing', 3), async (req, res) => {
  try {
    const { texto, grupo } = req.body || {};
    if (!texto || !texto.trim()) return res.status(400).json({ error: 'texto obrigatorio' });
    const { data, error } = await supabase
      .from('marketing_card_checklist')
      .insert({ card_id: req.params.id, texto: texto.trim(), grupo: (grupo && grupo.trim()) || null })
      .select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/checklist/:itemId', authorizeModule('marketing', 3), async (req, res) => {
  try {
    const update = {};
    const { texto, feito, grupo, ordem } = req.body || {};
    if (texto !== undefined) update.texto = texto;
    if (feito !== undefined) update.feito = !!feito;
    if (grupo !== undefined) update.grupo = (grupo && grupo.trim()) || null;
    if (ordem !== undefined) update.ordem = ordem;
    update.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('marketing_card_checklist')
      .update(update)
      .eq('id', req.params.itemId)
      .select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/checklist/:itemId', authorizeModule('marketing', 3), async (req, res) => {
  try {
    const { error } = await supabase
      .from('marketing_card_checklist')
      .delete()
      .eq('id', req.params.itemId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Padrões por fase do ciclo criativo (2026-05-29) ────────────────────────
// (categoria do evento × nome da fase) -> etiqueta + dono automáticos no
// nascimento do card de evento. CRUD + catalogos + backfill manual.

router.get('/admin/ciclo-padroes', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('marketing_ciclo_padroes')
      .select('*')
      .order('nome_fase');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Catalogo de categorias de evento (pro select da UI)
router.get('/admin/ciclo-padroes/categorias', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('event_categories')
      .select('id, name, active, sort_order')
      .eq('active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Fases do catalogo de uma categoria (cycle_phase_templates · fonte dos nomes
// que casam com event_cycle_phases.nome_fase). Distinct por nome.
router.get('/admin/ciclo-padroes/fases', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { category_id } = req.query;
    if (!category_id) return res.status(400).json({ error: 'category_id obrigatorio' });
    const { data, error } = await supabase
      .from('cycle_phase_templates')
      .select('numero, nome, area')
      .eq('category_id', category_id)
      .order('numero', { ascending: true });
    if (error) throw error;
    const seen = new Set();
    const fases = [];
    for (const t of (data || [])) {
      if (t.nome && !seen.has(t.nome)) { seen.add(t.nome); fases.push({ numero: t.numero, nome: t.nome, area: t.area }); }
    }
    res.json(fases);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Backfill manual · aplica padrões aos cards de evento ativos sem dono/etiqueta
router.post('/admin/ciclo-padroes/aplicar', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { category_id } = req.body || {};
    const { data, error } = await supabase.rpc('fn_marketing_aplicar_padroes_ciclo', {
      p_category_id: category_id || null,
    });
    if (error) throw error;
    res.json({ ok: true, atualizados: data ?? 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/ciclo-padroes', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { category_id, nome_fase, etiqueta_tipo_id, atribuido_a } = req.body || {};
    if (!category_id || !nome_fase) return res.status(400).json({ error: 'category_id e nome_fase obrigatórios' });
    if (!etiqueta_tipo_id && !atribuido_a) return res.status(400).json({ error: 'informe ao menos etiqueta ou dono' });
    const { data, error } = await supabase
      .from('marketing_ciclo_padroes')
      .insert({
        category_id,
        nome_fase,
        etiqueta_tipo_id: etiqueta_tipo_id || null,
        atribuido_a: atribuido_a || null,
        ativo: true,
      })
      .select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    if (/duplicate key/i.test(e.message)) {
      return res.status(409).json({ error: 'Já existe padrão pra essa categoria + fase · edite o existente.' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.patch('/admin/ciclo-padroes/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const update = {};
    const { nome_fase, etiqueta_tipo_id, atribuido_a, ativo } = req.body || {};
    if (nome_fase !== undefined) update.nome_fase = nome_fase;
    if (etiqueta_tipo_id !== undefined) update.etiqueta_tipo_id = etiqueta_tipo_id || null;
    if (atribuido_a !== undefined) update.atribuido_a = atribuido_a || null;
    if (ativo !== undefined) update.ativo = !!ativo;
    update.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('marketing_ciclo_padroes')
      .update(update)
      .eq('id', req.params.id)
      .select('*').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/admin/ciclo-padroes/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { error } = await supabase
      .from('marketing_ciclo_padroes')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Campanhas + Triagem (Redesenho Fase 2 · 2026-05-30) ────────────────────
// A solicitacao-dor vira campanha em triagem (trigger) · o Pedro tria e
// materializa os entregaveis (cards de produção vinculados via campanha_id).

router.get('/campanhas', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { status } = req.query;
    let q = supabase.from('marketing_campanhas').select('*').is('deleted_at', null);
    if (status) q = q.eq('status', status);
    const { data: camps, error } = await q.order('created_at', { ascending: false });
    if (error) throw error;
    const lista = camps || [];
    const solIds = [...new Set(lista.map(c => c.solicitante_id).filter(Boolean))];
    let profMap = {};
    if (solIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, name').in('id', solIds);
      profMap = Object.fromEntries((profs || []).map(p => [p.id, p.name]));
    }
    // Solicitação de origem: data que o cliente pediu + urgência (pra triagem mostrar)
    const reqIds = [...new Set(lista.map(c => c.solicitacao_id).filter(Boolean))];
    let solMap = {};
    if (reqIds.length) {
      const { data: sols } = await supabase.from('solicitacoes').select('id, data_necessaria, eh_urgente').in('id', reqIds);
      solMap = Object.fromEntries((sols || []).map(s => [s.id, s]));
    }
    const ids = lista.map(c => c.id);
    const countMap = {};
    if (ids.length) {
      const { data: cards } = await supabase
        .from('marketing_kanban_cards').select('campanha_id')
        .in('campanha_id', ids).is('deleted_at', null);
      for (const c of (cards || [])) countMap[c.campanha_id] = (countMap[c.campanha_id] || 0) + 1;
    }
    res.json(lista.map(c => ({
      ...c,
      solicitante_nome: profMap[c.solicitante_id] || null,
      total_cards: countMap[c.id] || 0,
      data_pedida: solMap[c.solicitacao_id]?.data_necessaria || null,
      eh_urgente: solMap[c.solicitacao_id]?.eh_urgente || false,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/campanhas/:id', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { data: camp, error } = await supabase
      .from('marketing_campanhas').select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!camp) return res.status(404).json({ error: 'Campanha não encontrada' });
    // O que o cliente pediu (data + urgência)
    let data_pedida = null, eh_urgente = false;
    if (camp.solicitacao_id) {
      const { data: sol } = await supabase.from('solicitacoes')
        .select('data_necessaria, eh_urgente').eq('id', camp.solicitacao_id).maybeSingle();
      data_pedida = sol?.data_necessaria || null;
      eh_urgente = sol?.eh_urgente || false;
    }
    const { data: cards } = await supabase
      .from('marketing_kanban_cards').select('*')
      .eq('campanha_id', camp.id).is('deleted_at', null).order('data_inicio', { ascending: true, nullsFirst: false });
    const enriched = await enrichCards(cards || []);
    // Nome do dono de cada entregavel
    const memIds = [...new Set(enriched.map(c => c.atribuido_a).filter(Boolean))];
    let memMap = {};
    if (memIds.length) {
      const { data: mems } = await supabase.from('marketing_membros').select('id, profile_id, nome_display').in('id', memIds);
      const pIds = [...new Set((mems || []).map(m => m.profile_id).filter(Boolean))];
      let pMap = {};
      if (pIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, name').in('id', pIds);
        pMap = Object.fromEntries((profs || []).map(p => [p.id, p.name]));
      }
      memMap = Object.fromEntries((mems || []).map(m => [m.id, pMap[m.profile_id] || m.nome_display || null]));
    }
    const cardsComDono = enriched.map(c => ({ ...c, dono_nome: memMap[c.atribuido_a] || null }));
    res.json({ ...camp, cards: cardsComDono, data_pedida, eh_urgente });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/campanhas/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const update = {};
    const { titulo, dor_descricao, publico_alvo, complexidade, prazo_entrega, status } = req.body || {};
    if (titulo !== undefined) update.titulo = titulo;
    if (dor_descricao !== undefined) update.dor_descricao = dor_descricao;
    if (publico_alvo !== undefined) update.publico_alvo = publico_alvo;
    if (complexidade !== undefined) update.complexidade = complexidade || null;
    if (prazo_entrega !== undefined) update.prazo_entrega = prazo_entrega || null;
    if (status !== undefined) update.status = status;
    update.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('marketing_campanhas').update(update).eq('id', req.params.id).select('*').single();
    if (error) throw error;
    // Se o Pedro definiu/mudou o prazo de entrega e ele difere da data que o cliente
    // pediu, avisa o solicitante (o Pedro vai conversar e dar a 1a devolutiva).
    if (prazo_entrega !== undefined && data?.solicitacao_id && data?.solicitante_id) {
      try {
        const { data: sol } = await supabase.from('solicitacoes')
          .select('data_necessaria, titulo').eq('id', data.solicitacao_id).maybeSingle();
        const pedida = sol?.data_necessaria ? new Date(sol.data_necessaria).toISOString().slice(0, 10) : null;
        const nova = data.prazo_entrega ? new Date(data.prazo_entrega).toISOString().slice(0, 10) : null;
        if (nova && pedida && nova !== pedida) {
          const fmt = (d) => d.split('-').reverse().join('/');
          notificar({
            modulo: 'marketing',
            tipo: 'marketing_prazo_ajustado',
            titulo: `Prazo ajustado: ${sol?.titulo || data.titulo}`,
            mensagem: `A equipe de Marketing ajustou a entrega de ${fmt(pedida)} para ${fmt(nova)}. O Pedro vai falar com você sobre isso.`,
            link: '/solicitacoes',
            severidade: 'info',
            chaveDedup: `mkt_prazo_${data.id}_${nova}`,
            targetIds: [data.solicitante_id],
          }).catch(err => console.error('[MARKETING] notify prazo ajustado:', err.message));
        }
      } catch (nerr) { console.error('[MARKETING] prazo ajustado block:', nerr.message); }
    }
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/campanhas/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { error } = await supabase
      .from('marketing_campanhas').update({ deleted_at: new Date().toISOString() }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Materializa um entregavel (card de produção) a partir da campanha · nível 5.
// Card nasce origem='interna' + campanha_id · estado 'fila' (Fase 3 remapeia p/ backlog).
router.post('/campanhas/:id/cards', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { titulo, descricao, etiqueta_tipo_id, atribuido_a, pode_paralelo, ocupa_dias } = req.body || {};
    let { data_inicio, data_fim } = req.body || {};
    if (!titulo || !titulo.trim()) return res.status(400).json({ error: 'título do entregavel obrigatório' });
    const { data: camp } = await supabase
      .from('marketing_campanhas').select('id, status').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!camp) return res.status(404).json({ error: 'Campanha não encontrada' });

    // ⚠️ A TRIAGEM manda "começa dia X e ocupa N dias úteis"; o FIM é derivado
    // aqui pela régua única. Antes a tela mandava duas datas OPCIONAIS e o
    // resultado medido foi 0 de 83 cards com plano — o Planner ficava vazio e
    // "atribuir" não ocupava ninguém.
    if (ocupa_dias != null && ocupa_dias !== '') {
      const n = Number(ocupa_dias);
      if (!Number.isFinite(n) || n <= 0) {
        return res.status(400).json({ error: 'ocupa_dias deve ser um número de dias úteis maior que zero' });
      }
      const ini = proximoDiaUtil(data_inicio) || data_inicio;
      const fim = calcularDataFim(ini, n);
      if (!fim) return res.status(400).json({ error: 'não foi possível calcular o fim (confira a data de início)' });
      data_inicio = ini;
      data_fim = fim;
    }
    // duração em DIAS ÚTEIS derivada de inicio/fim (inclusivo · pula sab/dom)
    const dur = diasUteisInclusive(data_inicio, data_fim);
    const { data, error } = await supabase
      .from('marketing_kanban_cards')
      .insert({
        origem: 'interna',
        campanha_id: req.params.id,
        titulo: titulo.trim(),
        descricao: descricao || null,
        etiqueta_tipo_id: etiqueta_tipo_id || null,
        atribuido_a: atribuido_a || null,
        data_inicio: data_inicio || null,
        data_fim: data_fim || null,
        duracao_dias: dur,
        pode_paralelo: pode_paralelo === undefined ? true : !!pode_paralelo,
        prazo_producao: data_fim ? new Date(data_fim + 'T18:00:00').toISOString() : null,
        estado: 'backlog', // régua nova · entregável triado entra direto no Backlog
        criado_por: req.user.userId,
      })
      .select('*').single();
    if (error) throw error;
    // Campanha sai da triagem ao ganhar o 1o entregavel
    if (camp.status === 'triagem') {
      await supabase.from('marketing_campanhas')
        .update({ status: 'ativa', updated_at: new Date().toISOString() })
        .eq('id', req.params.id);
    }
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Solicitante aprova a CAMPANHA inteira (demanda completa · decisão Marcos 2026-05-31).
// Endpoint dedicado (o solicitante não tem UPDATE geral). Exige TODOS os entregáveis concluídos.
router.post('/campanhas/:id/aprovar', async (req, res) => {
  try {
    const { data: camp } = await supabase
      .from('marketing_campanhas')
      .select('id, titulo, status, solicitante_id, solicitacao_id')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!camp) return res.status(404).json({ error: 'Campanha não encontrada' });
    if (camp.solicitante_id !== req.user.userId && !isAdminLike(req)) {
      return res.status(403).json({ error: 'Apenas o solicitante (ou coordenacao) pode aprovar a entrega.' });
    }
    if (camp.status === 'concluida') return res.status(400).json({ error: 'Campanha já concluída' });

    const { data: cards } = await supabase
      .from('marketing_kanban_cards')
      .select('id, estado, atribuido_a').eq('campanha_id', camp.id).is('deleted_at', null);
    const ativos = cards || [];
    if (!ativos.length) return res.status(400).json({ error: 'Campanha ainda não tem entregaveis' });
    const pendentes = ativos.filter(c => c.estado !== 'concluido').length;
    if (pendentes > 0) return res.status(400).json({ error: `Ainda ha ${pendentes} entregavel(is) não concluído(s)` });

    await supabase.from('marketing_campanhas')
      .update({ status: 'concluida', updated_at: new Date().toISOString() }).eq('id', camp.id);
    if (camp.solicitacao_id) {
      await supabase.from('solicitacoes')
        .update({ status: 'concluido', concluido_em: new Date().toISOString() })
        .eq('id', camp.solicitacao_id).neq('status', 'concluido');
    }
    const donoIds = [...new Set(ativos.map(c => c.atribuido_a).filter(Boolean))];
    if (donoIds.length) {
      const { data: ms } = await supabase.from('marketing_membros').select('profile_id').in('id', donoIds);
      const pids = [...new Set((ms || []).map(m => m.profile_id).filter(Boolean))];
      if (pids.length) {
        notificar({
          modulo: 'marketing', tipo: 'marketing_campanha_aprovada',
          titulo: `Demanda aprovada: ${camp.titulo}`,
          mensagem: 'O solicitante aprovou a entrega completa · campanha concluída.',
          link: '/marketing', severidade: 'info',
          chaveDedup: `marketing_campanha_aprovada_${camp.id}`, targetIds: pids,
        }).catch(err => console.error('[MARKETING] notify campanha aprovada:', err.message));
      }
    }
    res.json({ ok: true, status: 'concluida' });
  } catch (e) {
    console.error('[MARKETING] aprovar campanha:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Solicitante pede revisão da CAMPANHA (1x) · reabre os entregaveis concluídos pra
// 'revisão' (sem migration · a campanha volta a "em produção" e o botao de aprovar
// some até o Pedro refazer). Notifica os donos com o motivo.
router.post('/campanhas/:id/revisar', async (req, res) => {
  try {
    const { motivo } = req.body || {};
    if (!motivo || motivo.trim().length < 5) {
      return res.status(400).json({ error: 'Motivo da revisão obrigatório (>= 5 chars)' });
    }
    const { data: camp } = await supabase
      .from('marketing_campanhas')
      .select('id, titulo, solicitante_id')
      .eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!camp) return res.status(404).json({ error: 'Campanha não encontrada' });
    if (camp.solicitante_id !== req.user.userId && !isAdminLike(req)) {
      return res.status(403).json({ error: 'Apenas o solicitante (ou coordenacao) pode pedir revisão.' });
    }
    const { data: cards } = await supabase
      .from('marketing_kanban_cards')
      .select('id, estado, tem_revisao, atribuido_a').eq('campanha_id', camp.id).is('deleted_at', null);
    const ativos = cards || [];
    if (ativos.some(c => c.tem_revisao)) {
      return res.status(400).json({ error: 'Esta demanda já teve uma revisão (1 máximo)' });
    }
    const concluidos = ativos.filter(c => c.estado === 'concluido');
    if (!concluidos.length) return res.status(400).json({ error: 'Nada concluído para revisar ainda' });

    for (const c of concluidos) {
      await supabase.from('marketing_kanban_cards')
        .update({ estado: 'revisao', tem_revisao: true, motivo_revisao: motivo.trim() }).eq('id', c.id);
    }
    const donoIds = [...new Set(concluidos.map(c => c.atribuido_a).filter(Boolean))];
    if (donoIds.length) {
      const { data: ms } = await supabase.from('marketing_membros').select('profile_id').in('id', donoIds);
      const pids = [...new Set((ms || []).map(m => m.profile_id).filter(Boolean))];
      if (pids.length) {
        notificar({
          modulo: 'marketing', tipo: 'marketing_campanha_revisao',
          titulo: `Revisao pedida: ${camp.titulo}`,
          mensagem: `O solicitante pediu ajustes: "${motivo.trim().slice(0, 140)}"`,
          link: '/marketing', severidade: 'info',
          chaveDedup: `marketing_campanha_revisao_${camp.id}`, targetIds: pids,
        }).catch(err => console.error('[MARKETING] notify campanha revisao:', err.message));
      }
    }
    res.json({ ok: true, reabertos: concluidos.length });
  } catch (e) {
    console.error('[MARKETING] revisar campanha:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Capacidade por dia (Fase 4 · fundacao · 2026-05-30) ────────────────────
// Ocupacao de slots de um membro por dia, a partir dos intervalos data_inicio→
// data_fim dos cards ativos. Usado na triagem pra avisar sobrecarga (>slots_dia).
// Paralela conta 1 slot/dia · foco (não paralela) enche o dia.
// ⚠️ Aceita `ocupa_dias` em vez de `fim`: o FIM é calculado aqui, pela régua
// única (`utils/marketingOcupacao`), porque duplicá-la no cliente daria duas
// respostas para "quando isso termina". O front manda "começa dia X e ocupa N
// dias úteis" e recebe de volta o intervalo efetivo + o efeito na agenda.
router.get('/capacidade-dia', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { membro_id, inicio, ocupa_dias } = req.query;
    let { fim } = req.query;
    if (membro_id && inicio && !fim && ocupa_dias) {
      fim = calcularDataFim(inicio, Number(ocupa_dias));
      if (!fim) return res.status(400).json({ error: 'ocupa_dias inválido' });
    }
    if (!membro_id || !inicio || !fim) return res.status(400).json({ error: 'membro_id, início e (fim OU ocupa_dias) obrigatórios' });
    const { data: membro } = await supabase
      .from('marketing_membros').select('id, slots_dia').eq('id', membro_id).maybeSingle();
    const slots_dia = membro?.slots_dia || 3;
    const { data: cards, error } = await supabase
      .from('marketing_kanban_cards')
      .select('id, titulo, data_inicio, data_fim, pode_paralelo')
      .eq('atribuido_a', membro_id)
      .is('deleted_at', null)
      .neq('estado', 'concluido')
      .not('data_inicio', 'is', null)
      .not('data_fim', 'is', null)
      .lte('data_inicio', fim)
      .gte('data_fim', inicio);
    if (error) throw error;
    const lo = new Date(inicio + 'T00:00:00'), hi = new Date(fim + 'T00:00:00');
    const dias = {};
    for (const c of (cards || [])) {
      let d = new Date(c.data_inicio + 'T00:00:00');
      const end = new Date(c.data_fim + 'T00:00:00');
      while (d <= end) {
        const dow = d.getDay();
        if (d >= lo && d <= hi && dow !== 0 && dow !== 6) {
          const k = d.toISOString().slice(0, 10);
          if (!dias[k]) dias[k] = { ocupados: 0, cards: [] };
          dias[k].ocupados += c.pode_paralelo ? 1 : slots_dia;
          dias[k].cards.push(c.titulo);
        }
        d = new Date(d.getTime() + 86400000);
      }
    }
    // ⚠️ Devolve o intervalo EFETIVO (o início pode andar se cair em fim de
    // semana): sem isso a tela mostraria um período que o servidor não usou.
    const diasCheios = Object.values(dias).filter(d => d.ocupados >= slots_dia).length;
    res.json({
      slots_dia, dias,
      data_inicio: proximoDiaUtil(inicio) || inicio,
      data_fim: fim,
      dias_uteis: diasUteisNoIntervalo(proximoDiaUtil(inicio) || inicio, fim),
      dias_cheios: diasCheios,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Planner (Fase 4b · 2026-05-30) ─────────────────────────────────────────
// Membros (raias) + entregaveis com intervalo (barras) que cruzam [início, fim].
// O front desenha as barras por dia útil e permite arrastar (PATCH /cards/:id).
router.get('/planner', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { inicio, fim } = req.query;
    if (!inicio || !fim) return res.status(400).json({ error: 'início e fim obrigatórios' });
    const { data: membrosRaw } = await supabase
      .from('marketing_membros')
      .select('id, profile_id, habilidade, nome_display, slots_dia')
      .eq('ativo', true).neq('habilidade', 'coordenador').is('deleted_at', null); // coordenador (Pedro) fora dos slots
    const profIds = [...new Set((membrosRaw || []).map(m => m.profile_id).filter(Boolean))];
    let profMap = {};
    if (profIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, name').in('id', profIds);
      profMap = Object.fromEntries((profs || []).map(p => [p.id, p.name]));
    }
    const membros = (membrosRaw || []).map(m => ({
      id: m.id, slots_dia: m.slots_dia || 3, habilidade: m.habilidade,
      nome: profMap[m.profile_id] || m.nome_display || '(sem nome)',
    }));
    // ⚠️⚠️ ANTES este SELECT exigia `data_inicio`+`data_fim`, e elas estavam
    // preenchidas em **0 de 83 cards vivos** — o Planner nunca teve uma barra. Era
    // um CÍRCULO: só o arrasto no Planner gravava as datas, e o card não aparecia
    // lá sem elas. Agora o card vem SEM o filtro de data e o plano é resolvido
    // abaixo: data própria → datas da FASE do ciclo → sem plano (declarado).
    const { data: cardsRaw, error } = await supabase
      .from('marketing_kanban_cards')
      .select('id, titulo, atribuido_a, data_inicio, data_fim, pode_paralelo, duracao_dias, estado, origem, campanha_id, etiqueta_tipo_id, cycle_phase_task_id')
      .is('deleted_at', null).neq('estado', 'concluido')
      .not('atribuido_a', 'is', null);
    if (error) throw error;

    // ⚠️ O ciclo criativo saiu do Kanban (o Pedro passou a gerenciá-lo no
    // dashboard), mas ele CONSOME a agenda da equipe — 74 das 83 tarefas vivas.
    // Sem trazer essa carga, o Planner mostraria a equipe quase livre e passaria
    // a MENTIR sobre capacidade. As fases já têm data prevista no banco; é ela
    // que dá o intervalo dessas tarefas (decisão do Marcos, 14/08).
    const idsTarefaCiclo = [...new Set((cardsRaw || [])
      .filter(c => !c.data_inicio || !c.data_fim)
      .map(c => c.cycle_phase_task_id).filter(Boolean))];
    // ⚠️ A coluna é `event_phase_id` (não `phase_id`) — e o embed já é o mesmo
    // que o `enrichCards` usa. A sonda contra produção pegou o nome errado antes
    // de subir: coluna inexistente faz o PostgREST recusar a query INTEIRA, e o
    // Planner voltaria 500 (ou vazio, se o erro fosse engolido).
    const faseDaTarefa = {};
    if (idsTarefaCiclo.length) {
      const tarefas = await lerEmLotes(
        'cycle_phase_tasks',
        'id, event_phase_id, event_cycle_phases:event_phase_id(id, numero_fase, nome_fase, data_inicio_prevista, data_fim_prevista)',
        'id', idsTarefaCiclo,
      );
      for (const t of tarefas || []) {
        const f = t.event_cycle_phases;
        if (f?.data_inicio_prevista && f?.data_fim_prevista) faseDaTarefa[t.id] = f;
      }
    }

    const dentroDaJanela = (de, ate) => !!de && !!ate && de <= fim && ate >= inicio;
    const tipoIds = [...new Set((cardsRaw || []).map(c => c.etiqueta_tipo_id).filter(Boolean))];
    let corMap = {};
    if (tipoIds.length) {
      const { data: tipos } = await supabase.from('marketing_etiquetas_tipo').select('id, cor').in('id', tipoIds);
      corMap = Object.fromEntries((tipos || []).map(t => [t.id, t.cor]));
    }
    const idsComRaia = new Set(membros.map(m => m.id));
    const cards = [];
    const semPlano = [];   // atribuídos que não ocupam dia nenhum — DECLARADOS
    // ⚠️⚠️ Dono SEM raia = barra que existe no dado e não tem onde aparecer. É o
    // caso do COORDENADOR, que fica fora das raias por decisão (ele distribui, não
    // executa) — e medido em 17/08: **as 10 barras do ciclo estavam TODAS no
    // coordenador**, então o Planner continuaria visualmente vazio mesmo com o
    // ciclo ligado. Sem declarar, isso é trabalho invisível outra vez.
    const semRaia = [];
    for (const c of cardsRaw || []) {
      let de = c.data_inicio;
      let ate = c.data_fim;
      let plano = 'proprio';

      // Ciclo criativo sem data própria: herda o intervalo da FASE.
      if ((!de || !ate) && c.cycle_phase_task_id) {
        const f = faseDaTarefa[c.cycle_phase_task_id];
        if (f?.data_inicio_prevista && f?.data_fim_prevista) {
          de = f.data_inicio_prevista;
          ate = f.data_fim_prevista;
          plano = 'fase';
        }
      }

      if (!de || !ate) {
        // ⚠️ NÃO é descartado em silêncio: sem isso, "atribuí e não ocupou" volta
        // a ser invisível — que é exatamente a reclamação que originou esta leva.
        semPlano.push({ id: c.id, titulo: c.titulo, atribuido_a: c.atribuido_a, origem: c.origem });
        continue;
      }
      if (!dentroDaJanela(de, ate)) continue;

      if (!idsComRaia.has(c.atribuido_a)) {
        semRaia.push({ id: c.id, titulo: c.titulo, origem: c.origem, data_inicio: de, data_fim: ate });
        continue;
      }

      cards.push({
        id: c.id, titulo: c.titulo, atribuido_a: c.atribuido_a,
        data_inicio: de, data_fim: ate,
        pode_paralelo: c.pode_paralelo,
        // Quantos dias úteis a tarefa ocupa (coluna `duracao_dias`, integer).
        ocupa_dias: c.duracao_dias ?? null,
        estado: c.estado, origem: c.origem, campanha_id: c.campanha_id,
        // A tela precisa distinguir: barra do ciclo é PREVISÃO da fase, não um
        // plano que alguém desenhou pra pessoa — e não deve ser arrastável.
        plano,
        cor: corMap[c.etiqueta_tipo_id] || null,
      });
    }

    res.json({ membros, cards, sem_plano: semPlano, sem_raia: semRaia });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
