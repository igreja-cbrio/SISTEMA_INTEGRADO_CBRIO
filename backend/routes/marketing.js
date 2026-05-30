// ============================================================================
// /api/marketing · CRUD do Kanban Marketing (Spec 004)
// ============================================================================
// Permissoes (boost por area "Marketing" eleva pra nivel 5):
//   nivel 1 · read analytics e catalogos (diretoria · pastores seniors)
//   nivel 3 · read fila geral + write proprio card (produtor)
//   nivel 5 · admin do modulo (Pedro Paiva via boost · Marcos via dev)
//
// CHECK constraint do schema (Spec 002):
//   origem='solicitacao' · solicitacao_id NOT NULL · evento_task_id NULL
//   origem='evento'      · evento_task_id NOT NULL · solicitacao_id NULL
//   origem='interna'     · ambos NULL
//
// Cards origem=solicitacao/evento NASCEM via triggers SQL · backend so cria
// origem=interna explicitamente (Pedro abre task direto em /marketing).
//
// Revisao (D-14):
//   Maximo 1 por card · tem_revisao boolean · trigger SQL fn_marketing_cards_estado_ts
//   atualiza ordem_fila pro fim quando tem_revisao vira true.
// ============================================================================

const router = require('express').Router();
const multer = require('multer');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const spMarketing = require('../services/sharepointMarketing');

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

// Dias uteis (seg-sex) inclusive entre duas datas YYYY-MM-DD · null se invalido.
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

  // 1 query por dimensao p/ evitar N+1
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
    cycleTaskIds.length ? supabase.from('cycle_phase_tasks')
      .select('id, event_id, event_phase_id, is_critical, prioridade, events:event_id(id, name), event_cycle_phases:event_phase_id(nome_fase, numero_fase)')
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
      return {
        id: t.id,
        event_id: t.event_id,
        event_name: t.events?.name || null,
        fase: t.event_cycle_phases ? `${t.event_cycle_phases.numero_fase}. ${t.event_cycle_phases.nome_fase}` : null,
        is_critical: t.is_critical,
        prioridade: t.prioridade,
        link: t.event_id ? `/eventos/${t.event_id}` : null,
      };
    })() : null,
  }));
}

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

// ─── Capacidade + estimativa (Spec 005) ─────────────────────────────────────

router.get('/capacidade', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const semana = req.query.semana || new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .rpc('fn_marketing_calcular_capacidade_semana', { p_data_ref: semana });
    if (error) throw error;

    // Enriquece com profile.name + nome_display (membros sem login)
    const profileIds = [...new Set((data || []).map(r => r.profile_id).filter(Boolean))];
    const membroIds  = [...new Set((data || []).map(r => r.membro_id).filter(Boolean))];
    let profileMap = {}, membroMap = {};
    if (profileIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, name, email, avatar_url').in('id', profileIds);
      profileMap = Object.fromEntries((profs || []).map(p => [p.id, p]));
    }
    if (membroIds.length) {
      const { data: ms } = await supabase.from('marketing_membros').select('id, nome_display').in('id', membroIds);
      membroMap = Object.fromEntries((ms || []).map(m => [m.id, m]));
    }

    const enriched = (data || []).map(r => {
      const prof = profileMap[r.profile_id] || null;
      const nd = membroMap[r.membro_id]?.nome_display;
      return {
        ...r,
        profile: prof || (nd ? { id: null, name: nd, email: null, avatar_url: null } : null),
      };
    });
    res.json(enriched);
  } catch (e) {
    console.error('[MARKETING] capacidade:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get('/estimar', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { tipo, data_alvo } = req.query;
    if (!tipo) return res.status(400).json({ error: 'Param tipo (UUID da etiqueta) obrigatorio' });

    const { data, error } = await supabase
      .rpc('fn_marketing_estimar_prazo', {
        p_tipo_id: tipo,
        p_data_alvo: data_alvo || null,
      });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[MARKETING] estimar:', e.message);
    res.status(500).json({ error: e.message });
  }
});

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
    if (!data) return res.status(404).json({ error: 'Card nao encontrado' });

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

    // Notifica responsavel atribuido (se houver)
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
          mensagem: `Pedro Paiva atribuiu uma task interna pra voce.`,
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
    if (!atual) return res.status(404).json({ error: 'Card nao encontrado' });

    // RLS UPDATE policy ja bloqueia produtor que nao eh o atribuido, mas
    // duplicamos o check no backend pra dar feedback claro de UX.
    const admin = isAdminLike(req);
    const meusMembroIds = await meuMembroId(req);
    const ehDoProdutor = atual.atribuido_a && meusMembroIds.includes(atual.atribuido_a);
    if (!admin && !ehDoProdutor) {
      return res.status(403).json({ error: 'Voce so pode editar cards atribuidos a voce' });
    }

    // Campos editaveis por produtor: estado (apenas seu card)
    // Campos editaveis so por admin (level 5+): tudo
    const update = {};
    if (admin) {
      const { titulo, descricao, etiqueta_tipo_id, etiqueta_destino_id,
              atribuido_a, prazo_preliminar, prazo_confirmado, estado,
              raia_rapida, motivo_revisao, data_inicio, data_fim, pode_paralelo } = req.body || {};
      if (titulo !== undefined) update.titulo = titulo;
      if (descricao !== undefined) update.descricao = descricao;
      if (etiqueta_tipo_id !== undefined) update.etiqueta_tipo_id = etiqueta_tipo_id;
      if (etiqueta_destino_id !== undefined) update.etiqueta_destino_id = etiqueta_destino_id;
      if (atribuido_a !== undefined) update.atribuido_a = atribuido_a;
      if (prazo_preliminar !== undefined) update.prazo_preliminar = prazo_preliminar;
      if (prazo_confirmado !== undefined) update.prazo_confirmado = prazo_confirmado;
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
      // Produtor pode mover estado · proibido pular pra "concluido"
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

    // Notificacao · mudou atribuicao
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
          mensagem: 'Voce foi atribuido a um card no Kanban Marketing.',
          link: '/marketing',
          severidade: 'info',
          chaveDedup: `marketing_card_atribuido_${data.id}_${membro.profile_id}`,
          targetIds: [membro.profile_id],
        }).catch(err => console.error('[MARKETING] notify atribuido:', err.message));
      }
    }

    // Notificacao · entregue (estado=concluido) · solicitante avisado
    if (update.estado === 'concluido' && atual.estado !== 'concluido' && data.solicitacao_id) {
      const { data: sol } = await supabase
        .from('solicitacoes')
        .select('solicitante_id, titulo')
        .eq('id', data.solicitacao_id)
        .maybeSingle();
      if (sol?.solicitante_id) {
        notificar({
          modulo: 'marketing',
          tipo: 'marketing_card_entregue',
          titulo: `Entregue: ${sol.titulo}`,
          mensagem: 'Sua solicitacao foi marcada como entregue. Avalie em 30 segundos.',
          link: '/solicitacoes',
          severidade: 'info',
          chaveDedup: `marketing_card_entregue_${data.id}`,
          targetIds: [sol.solicitante_id],
        }).catch(err => console.error('[MARKETING] notify entregue:', err.message));
      }
    }

    // Notificacao · prazo confirmado (Pedro definiu prazo) · solicitante avisado
    if (update.prazo_confirmado !== undefined
        && update.prazo_confirmado !== atual.prazo_confirmado
        && data.solicitacao_id) {
      const { data: sol } = await supabase
        .from('solicitacoes')
        .select('solicitante_id, titulo')
        .eq('id', data.solicitacao_id)
        .maybeSingle();
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

    // Notificacao · aguardando solicitante (preview pro solicitante revisar)
    if (update.estado === 'aguardando_solicitante' && atual.estado !== 'aguardando_solicitante'
        && data.solicitacao_id) {
      const { data: sol } = await supabase
        .from('solicitacoes')
        .select('solicitante_id, titulo')
        .eq('id', data.solicitacao_id)
        .maybeSingle();
      if (sol?.solicitante_id) {
        notificar({
          modulo: 'marketing',
          tipo: 'marketing_card_preview',
          titulo: `Preview pronto: ${sol.titulo}`,
          mensagem: 'Equipe Marketing finalizou um preview. Aprove ou sugira revisao em /solicitacoes.',
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

// Solicitante aprova entrega · card vira concluido (Spec 012)
// Endpoint dedicado pq solicitante nao tem permissao geral de UPDATE no card.
router.patch('/cards/:id/aprovar-entrega', async (req, res) => {
  try {
    const { data: card } = await supabase
      .from('marketing_kanban_cards')
      .select('*, solicitacao:solicitacoes(id, solicitante_id, titulo)')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!card) return res.status(404).json({ error: 'Card nao encontrado' });

    // Permissoes: solicitante do card OU admin/coord
    const isSolicitante = card.solicitacao?.solicitante_id === req.user.userId;
    const isAdminMkt = isAdminLike(req);
    if (!isSolicitante && !isAdminMkt) {
      return res.status(403).json({ error: 'Apenas o solicitante (ou admin) pode aprovar a entrega.' });
    }
    if (!['aguardando_solicitante', 'em_producao'].includes(card.estado)) {
      return res.status(400).json({ error: 'Card nao esta em estado aguardando_solicitante' });
    }

    const { data: novo, error } = await supabase
      .from('marketing_kanban_cards')
      .update({ estado: 'concluido' })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error) throw error;

    // Notifica produtor + concluir solicitacao automaticamente
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
          mensagem: 'Solicitante aprovou · card concluido. Avalia pelo NPS agora.',
          link: '/marketing',
          severidade: 'info',
          chaveDedup: `marketing_entrega_aprovada_${card.id}`,
          targetIds: [membro.profile_id],
        }).catch(err => console.error('[MARKETING] notify entrega aprovada:', err.message));
      }
    }

    // Marca solicitacao como concluida pra acionar NPS (status=concluido dispara
    // o fluxo padrao + notificacao de avaliacao em routes/solicitacoes patch)
    if (card.solicitacao_id) {
      await supabase
        .from('solicitacoes')
        .update({ status: 'concluido', concluido_em: new Date().toISOString() })
        .eq('id', card.solicitacao_id)
        .neq('status', 'concluido');
    }

    res.json(novo);
  } catch (e) {
    console.error('[MARKETING] aprovar-entrega:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Sugerir revisao · 1x apenas (D-14) · trigger SQL atualiza ordem_fila pro fim.
// Solicitante chama esse endpoint via UI de Solicitacoes (Spec 012),
// mas tambem permitimos coordenador/produtor disparar (caso volte feedback offline).
router.patch('/cards/:id/sugerir-revisao', async (req, res) => {
  try {
    const { motivo } = req.body || {};
    if (!motivo || motivo.trim().length < 5) {
      return res.status(400).json({ error: 'Motivo da revisao obrigatorio (>= 5 chars)' });
    }

    const { data: atual } = await supabase
      .from('marketing_kanban_cards')
      .select('*')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Card nao encontrado' });
    if (atual.tem_revisao) {
      return res.status(400).json({ error: 'Card ja teve revisao (1 maximo · D-14)' });
    }

    // Permissoes: solicitante do card OR admin marketing OR produtor atribuido
    const admin = isAdminLike(req);
    let podeSugerir = admin;
    if (!podeSugerir && atual.solicitacao_id) {
      const { data: sol } = await supabase
        .from('solicitacoes')
        .select('solicitante_id')
        .eq('id', atual.solicitacao_id)
        .maybeSingle();
      if (sol?.solicitante_id === req.user.userId) podeSugerir = true;
    }
    if (!podeSugerir) {
      const meusMembroIds = await meuMembroId(req);
      if (meusMembroIds.includes(atual.atribuido_a)) podeSugerir = true;
    }
    if (!podeSugerir) return res.status(403).json({ error: 'Sem permissao para sugerir revisao' });

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

    // Notifica produtor atribuido
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
          mensagem: `Solicitante pediu revisao · "${motivo.trim()}". Card foi pro fim da fila.`,
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

    // Ordena por evento e fase (numero da fase eh prefixo)
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

// Batch · aplica mesmo etiqueta_tipo_id + atribuido_a pra varios cards
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

// ─── Fila de prioridade (Spec 018b) ─────────────────────────────────────────

// Lista cards em fila + em_producao ordenados por ordem_fila.
// Solicitante pode chamar tambem · backend retorna so cards onde ele eh
// solicitante (ownership) + cards sem solicitacao_id se nivel >=1.
router.get('/fila', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { atribuido_a } = req.query;
    let q = supabase
      .from('marketing_kanban_cards')
      .select('*')
      .in('estado', ['fila', 'em_producao'])
      .is('deleted_at', null)
      .order('estado', { ascending: false }) // em_producao primeiro · "fila" depois (alfabetico inverso bate)
      .order('ordem_fila', { ascending: true });

    if (atribuido_a) q = q.eq('atribuido_a', atribuido_a);
    const { data, error } = await q;
    if (error) throw error;

    const enriched = await enrichCards(data || []);
    res.json(enriched);
  } catch (e) {
    console.error('[MARKETING] fila list:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Reordena a fila · array de { id, ordem } pra atualizar em batch · so coord (>=5).
router.patch('/fila/reordenar', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { ordens } = req.body || {};
    if (!Array.isArray(ordens) || ordens.length === 0) {
      return res.status(400).json({ error: 'ordens deve ser array de { id, ordem }' });
    }

    // Validacao + update em batch · uma query por card · ok pra ~50 cards
    const results = [];
    for (const item of ordens) {
      if (!item.id || typeof item.ordem !== 'number') continue;
      const { error } = await supabase
        .from('marketing_kanban_cards')
        .update({ ordem_fila: item.ordem })
        .eq('id', item.id)
        .is('deleted_at', null);
      if (error) results.push({ id: item.id, error: error.message });
    }

    if (results.length > 0) {
      return res.status(207).json({ ok: false, falhas: results });
    }
    res.json({ ok: true, total: ordens.length });
  } catch (e) {
    console.error('[MARKETING] fila reordenar:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Posicao da fila pra solicitante · so retorna se o card pertence a uma
// solicitacao do user (transparencia sem expor outros cards).
router.get('/fila/posicao/:cardId', async (req, res) => {
  try {
    const { data: card } = await supabase
      .from('marketing_kanban_cards')
      .select('id, ordem_fila, estado, solicitacao_id, solicitacoes:solicitacao_id(solicitante_id)')
      .eq('id', req.params.cardId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!card) return res.status(404).json({ error: 'Card nao encontrado' });

    const isOwner = card.solicitacoes?.solicitante_id === req.user.userId;
    const isMktMember = (req.user.granular?.modulePerms?.marketing?.leitura || 0) >= 1;
    if (!isOwner && !isMktMember && !['admin', 'diretor'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Sem permissao' });
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
    // Pra solicitante: backend confere ownership via card.solicitacao_id.
    const lvl = levelOf(req);
    if (lvl < 3 && !['admin', 'diretor'].includes(req.user.role)) {
      const { data: card } = await supabase
        .from('marketing_kanban_cards')
        .select('id, solicitacao_id')
        .eq('id', req.params.id)
        .is('deleted_at', null)
        .maybeSingle();
      if (!card) return res.status(404).json({ error: 'Card nao encontrado' });
      if (card.solicitacao_id) {
        const { data: sol } = await supabase
          .from('solicitacoes')
          .select('solicitante_id')
          .eq('id', card.solicitacao_id)
          .maybeSingle();
        if (sol?.solicitante_id !== req.user.userId) {
          return res.status(403).json({ error: 'Sem permissao' });
        }
      } else {
        return res.status(403).json({ error: 'Sem permissao' });
      }
    }

    const entregaveis = await spMarketing.listarEntregaveis(req.params.id);
    res.json(entregaveis);
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

      // Notifica solicitante quando arquivo FINAL eh anexado (nao referencia · card no estado correto)
      try {
        const { data: card } = await supabase
          .from('marketing_kanban_cards')
          .select('estado, solicitacao_id, titulo')
          .eq('id', req.params.id)
          .maybeSingle();
        if (tipo !== 'referencia' && card?.solicitacao_id && card.estado === 'concluido') {
          const { data: sol } = await supabase
            .from('solicitacoes')
            .select('solicitante_id, titulo')
            .eq('id', card.solicitacao_id)
            .maybeSingle();
          if (sol?.solicitante_id) {
            notificar({
              modulo: 'marketing',
              tipo: 'marketing_entregavel_anexado',
              titulo: `Arquivo final: ${sol.titulo}`,
              mensagem: `${req.file.originalname} anexado ao seu pedido · disponivel pra download.`,
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
    // Pra solicitante: confere ownership via card.solicitacao_id
    const lvl = levelOf(req);
    if (lvl < 3 && !['admin', 'diretor'].includes(req.user.role)) {
      const { data: ent } = await supabase
        .from('marketing_entregaveis')
        .select('card_id')
        .eq('id', req.params.id)
        .is('deleted_at', null)
        .maybeSingle();
      if (!ent) return res.status(404).json({ error: 'Entregavel nao encontrado' });
      const { data: card } = await supabase
        .from('marketing_kanban_cards')
        .select('solicitacao_id')
        .eq('id', ent.card_id)
        .maybeSingle();
      if (!card?.solicitacao_id) return res.status(403).json({ error: 'Sem permissao' });
      const { data: sol } = await supabase
        .from('solicitacoes')
        .select('solicitante_id')
        .eq('id', card.solicitacao_id)
        .maybeSingle();
      if (sol?.solicitante_id !== req.user.userId) {
        return res.status(403).json({ error: 'Sem permissao' });
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
    if (data === false) return res.status(404).json({ error: 'Card nao encontrado ou ja excluido' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[MARKETING] soft delete:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─── Decisao de urgencia · coord aceita/recusa raia rapida ──────────────────

router.patch('/cards/:id/decidir-urgencia', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { decisao, motivo_recusa } = req.body || {};
    if (!['aceita', 'recusada'].includes(decisao)) {
      return res.status(400).json({ error: 'decisao deve ser "aceita" ou "recusada"' });
    }
    if (decisao === 'recusada' && (!motivo_recusa || motivo_recusa.trim().length < 5)) {
      return res.status(400).json({ error: 'motivo_recusa obrigatorio (>= 5 chars) quando recusar' });
    }

    const { data: atual } = await supabase
      .from('marketing_kanban_cards')
      .select('*, solicitacao:solicitacoes(id, solicitante_id, eh_urgente, urgencia_decisao, titulo)')
      .eq('id', req.params.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (!atual) return res.status(404).json({ error: 'Card nao encontrado' });
    if (!atual.solicitacao_id) {
      return res.status(400).json({ error: 'Card sem solicitacao linkada · urgencia decidida no proprio card eh raia_rapida (use PATCH)' });
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
          ? 'Pedro aceitou a urgencia · entrou na raia rapida.'
          : `Pedro recusou a urgencia · ${motivo_recusa.trim()}. Segue o fluxo normal.`,
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
// ANALYTICS (Spec 013 · nivel 1)
// ═══════════════════════════════════════════════════════════════════════

router.get('/analytics/kpis', authorizeModule('marketing', 1), async (req, res) => {
  try {
    // Serie temporal dos 4 KPIs MKT-* nas ultimas N semanas (default 12)
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

    // Ultimo valor (snapshot atual)
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
    // Tempo medio que cada diretor leva pra aprovar solicitacao da area marketing
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
// ADMIN · CRUD das 4 entidades (Spec 009 · so nivel 5)
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
    const { profile_id, habilidade, horas_semanais, observacao, nome_display } = req.body || {};
    if (!habilidade) return res.status(400).json({ error: 'habilidade obrigatoria' });
    if (!profile_id && !nome_display) {
      return res.status(400).json({ error: 'profile_id OU nome_display obrigatorio (use nome_display pra pessoas sem login)' });
    }
    const { data, error } = await supabase
      .from('marketing_membros')
      .insert({
        profile_id: profile_id || null,
        nome_display: nome_display || null,
        habilidade,
        horas_semanais: horas_semanais ?? 30,
        observacao: observacao || null,
        ativo: true,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    if (/duplicate key/i.test(e.message)) {
      return res.status(409).json({ error: 'Este profile ja tem essa habilidade · use PATCH pra editar.' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.patch('/admin/membros/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const update = {};
    const { habilidade, horas_semanais, observacao, ativo, nome_display } = req.body || {};
    if (habilidade !== undefined) update.habilidade = habilidade;
    if (horas_semanais !== undefined) update.horas_semanais = horas_semanais;
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
    if (!slug || !nome) return res.status(400).json({ error: 'slug e nome obrigatorios' });
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
    if (!slug || !nome) return res.status(400).json({ error: 'slug e nome obrigatorios' });
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

// ─── Overrides de capacidade (ferias / picos) ───────────────────────────────

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
      return res.status(409).json({ error: 'Ja existe override pra esse membro nessa semana · use PATCH' });
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

// ─── Padroes por fase do ciclo criativo (2026-05-29) ────────────────────────
// (categoria do evento × nome da fase) -> etiqueta + dono automaticos no
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

// Backfill manual · aplica padroes aos cards de evento ativos sem dono/etiqueta
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
    if (!category_id || !nome_fase) return res.status(400).json({ error: 'category_id e nome_fase obrigatorios' });
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
      return res.status(409).json({ error: 'Ja existe padrao pra essa categoria + fase · edite o existente.' });
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
// materializa os entregaveis (cards de producao vinculados via campanha_id).

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
    // Solicitacao de origem: data que o cliente pediu + urgencia (pra triagem mostrar)
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
    if (!camp) return res.status(404).json({ error: 'Campanha nao encontrada' });
    // O que o cliente pediu (data + urgencia)
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

// Materializa um entregavel (card de producao) a partir da campanha · nivel 5.
// Card nasce origem='interna' + campanha_id · estado 'fila' (Fase 3 remapeia p/ backlog).
router.post('/campanhas/:id/cards', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { titulo, descricao, etiqueta_tipo_id, atribuido_a, pode_paralelo, data_inicio, data_fim } = req.body || {};
    if (!titulo || !titulo.trim()) return res.status(400).json({ error: 'titulo do entregavel obrigatorio' });
    const { data: camp } = await supabase
      .from('marketing_campanhas').select('id, status').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!camp) return res.status(404).json({ error: 'Campanha nao encontrada' });
    // duracao em DIAS UTEIS derivada de inicio/fim (inclusivo · pula sab/dom)
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
        estado: 'fila',
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

// ─── Capacidade por dia (Fase 4 · fundacao · 2026-05-30) ────────────────────
// Ocupacao de slots de um membro por dia, a partir dos intervalos data_inicio→
// data_fim dos cards ativos. Usado na triagem pra avisar sobrecarga (>slots_dia).
// Paralela conta 1 slot/dia · foco (nao paralela) enche o dia.
router.get('/capacidade-dia', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { membro_id, inicio, fim } = req.query;
    if (!membro_id || !inicio || !fim) return res.status(400).json({ error: 'membro_id, inicio e fim obrigatorios' });
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
    res.json({ slots_dia, dias });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Planner (Fase 4b · 2026-05-30) ─────────────────────────────────────────
// Membros (raias) + entregaveis com intervalo (barras) que cruzam [inicio, fim].
// O front desenha as barras por dia util e permite arrastar (PATCH /cards/:id).
router.get('/planner', authorizeModule('marketing', 1), async (req, res) => {
  try {
    const { inicio, fim } = req.query;
    if (!inicio || !fim) return res.status(400).json({ error: 'inicio e fim obrigatorios' });
    const { data: membrosRaw } = await supabase
      .from('marketing_membros')
      .select('id, profile_id, habilidade, nome_display, slots_dia')
      .eq('ativo', true).is('deleted_at', null);
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
    const { data: cardsRaw, error } = await supabase
      .from('marketing_kanban_cards')
      .select('id, titulo, atribuido_a, data_inicio, data_fim, pode_paralelo, estado, campanha_id, etiqueta_tipo_id')
      .is('deleted_at', null).neq('estado', 'concluido')
      .not('data_inicio', 'is', null).not('data_fim', 'is', null).not('atribuido_a', 'is', null)
      .lte('data_inicio', fim).gte('data_fim', inicio);
    if (error) throw error;
    const tipoIds = [...new Set((cardsRaw || []).map(c => c.etiqueta_tipo_id).filter(Boolean))];
    let corMap = {};
    if (tipoIds.length) {
      const { data: tipos } = await supabase.from('marketing_etiquetas_tipo').select('id, cor').in('id', tipoIds);
      corMap = Object.fromEntries((tipos || []).map(t => [t.id, t.cor]));
    }
    const cards = (cardsRaw || []).map(c => ({
      id: c.id, titulo: c.titulo, atribuido_a: c.atribuido_a,
      data_inicio: c.data_inicio, data_fim: c.data_fim,
      pode_paralelo: c.pode_paralelo, estado: c.estado, campanha_id: c.campanha_id,
      cor: corMap[c.etiqueta_tipo_id] || null,
    }));
    res.json({ membros, cards });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
