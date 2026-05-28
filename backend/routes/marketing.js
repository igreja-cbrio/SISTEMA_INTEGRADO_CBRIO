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

async function enrichCards(cards) {
  if (!cards?.length) return cards || [];

  // 1 query por dimensao p/ evitar N+1
  const tipoIds     = [...new Set(cards.map(c => c.etiqueta_tipo_id).filter(Boolean))];
  const destinoIds  = [...new Set(cards.map(c => c.etiqueta_destino_id).filter(Boolean))];
  const membroIds   = [...new Set(cards.map(c => c.atribuido_a).filter(Boolean))];
  const solicIds    = [...new Set(cards.map(c => c.solicitacao_id).filter(Boolean))];

  const [tipos, destinos, membros, solics] = await Promise.all([
    tipoIds.length    ? supabase.from('marketing_etiquetas_tipo').select('id, slug, nome, cor, habilidade_padrao, esforco_max_h').in('id', tipoIds) : Promise.resolve({ data: [] }),
    destinoIds.length ? supabase.from('marketing_etiquetas_destino').select('id, slug, nome, cor').in('id', destinoIds) : Promise.resolve({ data: [] }),
    membroIds.length  ? supabase.from('marketing_membros').select('id, profile_id, habilidade').in('id', membroIds) : Promise.resolve({ data: [] }),
    solicIds.length   ? supabase.from('solicitacoes').select('id, titulo, solicitante_id, eh_urgente, urgencia_decisao').in('id', solicIds) : Promise.resolve({ data: [] }),
  ]);

  const tipoMap     = Object.fromEntries((tipos.data    || []).map(t => [t.id, t]));
  const destinoMap  = Object.fromEntries((destinos.data || []).map(d => [d.id, d]));
  const membroMap   = Object.fromEntries((membros.data  || []).map(m => [m.id, m]));
  const solicMap    = Object.fromEntries((solics.data   || []).map(s => [s.id, s]));

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
    atribuido: c.atribuido_a ? {
      ...membroMap[c.atribuido_a],
      profile: profileMap[membroMap[c.atribuido_a]?.profile_id] || null,
    } : null,
    solicitacao: c.solicitacao_id ? {
      ...solicMap[c.solicitacao_id],
      solicitante: profileMap[solicMap[c.solicitacao_id]?.solicitante_id] || null,
    } : null,
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
      profile: profileMap[m.profile_id] || null,
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

    // Enriquece com profile.name
    const profileIds = [...new Set((data || []).map(r => r.profile_id).filter(Boolean))];
    let profileMap = {};
    if (profileIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, name, email, avatar_url').in('id', profileIds);
      profileMap = Object.fromEntries((profs || []).map(p => [p.id, p]));
    }

    const enriched = (data || []).map(r => ({
      ...r,
      profile: profileMap[r.profile_id] || null,
    }));
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
    res.json(data || []);
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
              raia_rapida, motivo_revisao } = req.body || {};
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

      const result = await spMarketing.uploadEntregavel({
        cardId: req.params.id,
        userId: req.user.userId,
        file: req.file,
      });

      // Notifica solicitante quando arquivo final eh anexado (card no estado correto)
      try {
        const { data: card } = await supabase
          .from('marketing_kanban_cards')
          .select('estado, solicitacao_id, titulo')
          .eq('id', req.params.id)
          .maybeSingle();
        if (card?.solicitacao_id && card.estado === 'concluido') {
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
    res.json((data || []).map(m => ({ ...m, profile: profileMap[m.profile_id] || null })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/membros', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { profile_id, habilidade, horas_semanais, observacao } = req.body || {};
    if (!profile_id || !habilidade) return res.status(400).json({ error: 'profile_id e habilidade obrigatorios' });
    const { data, error } = await supabase
      .from('marketing_membros')
      .insert({
        profile_id, habilidade,
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
    const { habilidade, horas_semanais, observacao, ativo } = req.body || {};
    if (habilidade !== undefined) update.habilidade = habilidade;
    if (horas_semanais !== undefined) update.horas_semanais = horas_semanais;
    if (observacao !== undefined) update.observacao = observacao;
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
    const { slug, nome, habilidade_padrao, esforco_max_h, cor, ordem } = req.body || {};
    if (!slug || !nome) return res.status(400).json({ error: 'slug e nome obrigatorios' });
    const { data, error } = await supabase
      .from('marketing_etiquetas_tipo')
      .insert({ slug, nome, habilidade_padrao, esforco_max_h, cor, ordem: ordem ?? 100, ativo: true })
      .select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/admin/etiquetas/tipo/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const update = {};
    const { nome, habilidade_padrao, esforco_max_h, cor, ordem, ativo } = req.body || {};
    if (nome !== undefined) update.nome = nome;
    if (habilidade_padrao !== undefined) update.habilidade_padrao = habilidade_padrao;
    if (esforco_max_h !== undefined) update.esforco_max_h = esforco_max_h;
    if (cor !== undefined) update.cor = cor;
    if (ordem !== undefined) update.ordem = ordem;
    if (ativo !== undefined) update.ativo = !!ativo;
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
      .order('membro_id').order('dia_semana').order('hora_inicio');
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/recorrentes', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const { membro_id, dia_semana, hora_inicio, duracao_h, descricao } = req.body || {};
    if (!membro_id || dia_semana == null || !hora_inicio || !duracao_h || !descricao) {
      return res.status(400).json({ error: 'membro_id, dia_semana, hora_inicio, duracao_h, descricao obrigatorios' });
    }
    const { data, error } = await supabase
      .from('marketing_compromissos_recorrentes')
      .insert({ membro_id, dia_semana, hora_inicio, duracao_h, descricao, ativo: true })
      .select('*').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.patch('/admin/recorrentes/:id', authorizeModule('marketing', 5), async (req, res) => {
  try {
    const update = {};
    const { dia_semana, hora_inicio, duracao_h, descricao, ativo } = req.body || {};
    if (dia_semana !== undefined) update.dia_semana = dia_semana;
    if (hora_inicio !== undefined) update.hora_inicio = hora_inicio;
    if (duracao_h !== undefined) update.duracao_h = duracao_h;
    if (descricao !== undefined) update.descricao = descricao;
    if (ativo !== undefined) update.ativo = !!ativo;
    const { data, error } = await supabase
      .from('marketing_compromissos_recorrentes')
      .update(update)
      .eq('id', req.params.id)
      .select('*').single();
    if (error) throw error;
    res.json(data);
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

module.exports = router;
