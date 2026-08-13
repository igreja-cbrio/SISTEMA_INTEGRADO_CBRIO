// Inbox de WhatsApp · módulo Conversas. Lista conversas (escopo por ÁREA:
// Entrada não-triada + a área do usuário + as suas), thread, responde (texto
// livre <24h · template fora), triagem por área, atribuição e nova conversa.
const router = require('express').Router();
const multer = require('multer');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const wpp = require('../services/whatsappService');
const waInbox = require('../services/waInbox');
const { notificar } = require('../services/notificar');

// profile_id[] de todos os usuários da área (mesma fn usada pelo bot de triagem)
async function profilesDaArea(areaNome) {
  try {
    const { data } = await supabase.rpc('conversas_profiles_da_area', { area_nome: areaNome });
    return [...new Set((data || []).map(r => r.profile_id).filter(Boolean))];
  } catch { return []; }
}

// Anexos: imagem (jpg/png/webp) ou documento (pdf/doc/xls). Cap 16MB (limite Meta).
const uploadAnexo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 },
});

router.use(authenticate);

function uid(req) { return req.user?.userId || req.user?.id || null; }
function ehAdmin(req) { return ['admin', 'diretor'].includes(req.user?.role); }
function minhasAreas(req) { return (req.user?.granular?.areas || []).filter(Boolean); }
function comJanela(c) {
  const { membro, ...rest } = c || {};
  return {
    ...rest,
    foto_url: rest.foto_url ?? membro?.foto_url ?? null,
    dentro_janela: waInbox.dentroJanela24h(c.last_inbound_at),
    janela_expira_em: c.last_inbound_at
      ? new Date(new Date(c.last_inbound_at).getTime() + waInbox.JANELA_24H_MS).toISOString() : null,
  };
}
// lista de valores p/ filtro PostgREST `in.(...)` com aspas (áreas têm acento/barra/espaço)
function inList(vals) { return `(${vals.map(v => `"${String(v).replace(/"/g, '')}"`).join(',')})`; }

// foto vem do cadastro do membro (WhatsApp não expõe foto de perfil pela API)
const SEL = 'id, telefone, nome, membro_id, area, nao_lidas, resolvida, atribuido_a, notas, protocolo, satisfacao, pesquisa_estado, ultima_previa, last_message_at, last_inbound_at, membro:mem_membros(foto_url)';

// Templates aprovados p/ INICIAR conversa (fora da janela de 24h). Só entram os
// que têm env configurado. Cadastrar novos = mais uma linha + env na Vercel.
const TEMPLATES_ABERTURA = [
  { key: 'next_convite', rotulo: 'Convite NEXT', nome: process.env.WHATSAPP_TEMPLATE_NEXT_CONVITE, params: [{ label: 'Primeiro nome' }] },
  { key: 'aniversario', rotulo: 'Aniversário', nome: process.env.WHATSAPP_TEMPLATE_ANIVERSARIO2 || process.env.WHATSAPP_TEMPLATE_ANIVERSARIO, params: [{ label: 'Nome' }] },
  { key: 'batismo_lembrete', rotulo: 'Lembrete de batismo', nome: process.env.WHATSAPP_TEMPLATE_BATISMO, params: [{ label: 'Data' }, { label: 'Hora' }] },
  { key: 'cadastro_confirmado', rotulo: 'Cadastro confirmado', nome: process.env.WHATSAPP_TEMPLATE_CADASTRO, params: [{ label: 'Primeiro nome' }] },
].filter(t => t.nome);

// GET /templates — templates de abertura disponíveis p/ nova conversa
router.get('/templates', authorizeModule('conversas', 1), (req, res) => {
  res.json({ templates: TEMPLATES_ABERTURA });
});

// GET /areas — áreas ativas p/ triagem (dropdown) e chips do admin
router.get('/areas', authorizeModule('conversas', 1), async (req, res) => {
  try {
    const { data } = await supabase.from('areas')
      .select('nome, setores(nome)').neq('ativo', false).order('nome');
    const areas = (data || []).map(a => ({ nome: a.nome, setor: a.setores?.nome || null }));
    res.json({ areas });
  } catch (e) {
    console.error('[wa-inbox] areas:', e.message);
    res.status(500).json({ error: 'Erro ao listar áreas' });
  }
});

// GET /nao-lidas — total de mensagens não lidas do escopo do usuário (badge do header)
router.get('/nao-lidas', authorizeModule('conversas', 1), async (req, res) => {
  try {
    const userId = uid(req);
    let query = supabase.from('wa_conversas').select('nao_lidas')
      .is('deleted_at', null).eq('resolvida', false).gt('nao_lidas', 0).limit(500);
    if (!ehAdmin(req)) {
      const vis = ['area.is.null', `atribuido_a.eq.${userId}`];
      const areas = minhasAreas(req);
      if (areas.length) vis.push(`area.in.${inList(areas)}`);
      query = query.or(vis.join(','));
    }
    const { data } = await query;
    res.json({ total: (data || []).reduce((a, c) => a + (c.nao_lidas || 0), 0), conversas: (data || []).length });
  } catch (e) {
    console.error('[wa-inbox] nao-lidas:', e.message);
    res.json({ total: 0, conversas: 0 });
  }
});

// GET /resumo-areas — pendências agrupadas por área (painel), respeitando o escopo
router.get('/resumo-areas', authorizeModule('conversas', 1), async (req, res) => {
  try {
    const userId = uid(req);
    let query = supabase.from('wa_conversas')
      .select('area, nao_lidas, resolvida, atribuido_a').is('deleted_at', null)
      .not('last_message_at', 'is', null).limit(5000);
    if (!ehAdmin(req)) {
      const vis = ['area.is.null', `atribuido_a.eq.${userId}`];
      const areas = minhasAreas(req);
      if (areas.length) vis.push(`area.in.${inList(areas)}`);
      query = query.or(vis.join(','));
    }
    const { data, error } = await query;
    if (error) throw error;
    const mapa = new Map();
    for (const c of (data || [])) {
      const chave = c.area || '__entrada__';
      const r = mapa.get(chave) || { area: c.area, entrada: !c.area, novas: 0, ativos: 0, pendentes: 0 };
      r.novas += (c.nao_lidas || 0);
      if (!c.resolvida) { r.ativos += 1; if (!c.atribuido_a) r.pendentes += 1; }
      mapa.set(chave, r);
    }
    const linhas = [...mapa.values()].sort((a, b) => (b.novas + b.ativos) - (a.novas + a.ativos));
    res.json({ areas: linhas });
  } catch (e) {
    console.error('[wa-inbox] resumo-areas:', e.message);
    res.status(500).json({ error: 'Erro ao carregar painel' });
  }
});

// ── Menu de setores do bot de triagem (editável no /admin) ──────────────
// GET /setores — lista (todos, p/ admin) · usado pelo painel e pela config
router.get('/setores', authorizeModule('conversas', 1), async (req, res) => {
  try {
    // select('*'): os campos de FLUXO entram quando a migration existir —
    // pedi-los nominalmente derrubaria a rota antes dela.
    const { data } = await supabase.from('conversas_setores')
      .select('*').order('ordem', { ascending: true });
    res.json({ setores: data || [] });
  } catch (e) {
    console.error('[wa-inbox] setores get:', e.message);
    res.status(500).json({ error: 'Erro ao listar setores' });
  }
});
// Campos do FLUXO da opção (F3 · migration 20260813150000). Devolve
// { fluxo, erro } — o erro cobre a única combinação inválida.
function camposFluxoSetor(body) {
  const b = body || {};
  const fluxo = {};
  if ('mensagem_resposta' in b) fluxo.mensagem_resposta = b.mensagem_resposta ? String(b.mensagem_resposta).slice(0, 1000) : null;
  if ('pedir_nome' in b) fluxo.pedir_nome = b.pedir_nome !== false;
  if ('destino_tipo' in b) fluxo.destino_tipo = b.destino_tipo === 'atendente' ? 'atendente' : 'area';
  if ('atendente_id' in b) fluxo.atendente_id = b.atendente_id || null;
  if (fluxo.destino_tipo === 'atendente' && !fluxo.atendente_id) {
    return { fluxo, erro: 'Destino "atendente" exige escolher o atendente.' };
  }
  return { fluxo };
}

// POST /setores — cria (admin do módulo)
router.post('/setores', authorizeModule('conversas', 3), async (req, res) => {
  try {
    const { rotulo, area, ordem, ativo } = req.body || {};
    if (!rotulo || !area) return res.status(400).json({ error: 'Rótulo e área são obrigatórios.' });
    const { fluxo, erro: erroFluxo } = camposFluxoSetor(req.body);
    if (erroFluxo) return res.status(400).json({ error: erroFluxo });
    const base = { rotulo: String(rotulo).trim(), area: String(area).trim(), ordem: Number(ordem) || 0, ativo: ativo !== false };
    let aviso;
    let { data, error } = await supabase.from('conversas_setores')
      .insert({ ...base, ...fluxo }).select().single();
    if (error && error.code === '42703' && Object.keys(fluxo).length) {
      // Migration do fluxo ainda não aplicada → salva o básico e AVISA
      // (silêncio aqui viraria "salvei o fluxo" que não existe).
      aviso = 'Campos de fluxo ignorados — a migration 20260813150000 ainda não foi aplicada.';
      ({ data, error } = await supabase.from('conversas_setores').insert(base).select().single());
    }
    if (error) throw error;
    res.json(aviso ? { ...data, aviso } : data);
  } catch (e) {
    console.error('[wa-inbox] setores post:', e.message);
    res.status(500).json({ error: 'Erro ao criar setor' });
  }
});
// PUT /setores/:id — edita (inclui os campos de FLUXO da opção)
router.put('/setores/:id', authorizeModule('conversas', 3), async (req, res) => {
  try {
    const patch = {};
    for (const k of ['rotulo', 'area']) if (k in (req.body || {})) patch[k] = String(req.body[k] || '').trim();
    if ('ordem' in (req.body || {})) patch.ordem = Number(req.body.ordem) || 0;
    if ('ativo' in (req.body || {})) patch.ativo = !!req.body.ativo;
    const { fluxo, erro: erroFluxo } = camposFluxoSetor(req.body);
    if (erroFluxo) return res.status(400).json({ error: erroFluxo });
    if (!Object.keys(patch).length && !Object.keys(fluxo).length) return res.status(400).json({ error: 'Nada para atualizar' });
    let aviso;
    let { data, error } = await supabase.from('conversas_setores')
      .update({ ...patch, ...fluxo }).eq('id', req.params.id).select().single();
    if (error && error.code === '42703' && Object.keys(fluxo).length) {
      aviso = 'Campos de fluxo ignorados — a migration 20260813150000 ainda não foi aplicada.';
      if (Object.keys(patch).length) {
        ({ data, error } = await supabase.from('conversas_setores').update(patch).eq('id', req.params.id).select().single());
      } else {
        return res.status(409).json({ error: aviso });
      }
    }
    if (error) throw error;
    res.json(aviso ? { ...data, aviso } : data);
  } catch (e) {
    console.error('[wa-inbox] setores put:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar setor' });
  }
});
// DELETE /setores/:id — remove
router.delete('/setores/:id', authorizeModule('conversas', 3), async (req, res) => {
  try {
    await supabase.from('conversas_setores').delete().eq('id', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('[wa-inbox] setores del:', e.message);
    res.status(500).json({ error: 'Erro ao remover setor' });
  }
});

// GET /colaboradores — colaboradores REAIS (p/ atribuir responsável). Exclui:
//   - contas de AGENTE/BOT (name "Agente X" ou email agente.*@cbrio.org)
//   - membros do app (is_membro_only) — não são staff da inbox
router.get('/colaboradores', authorizeModule('conversas', 1), async (req, res) => {
  try {
    const { data } = await supabase.from('profiles')
      .select('id, name, avatar_url, email, is_membro_only').eq('active', true).order('name');
    const ehAgente = (p) => /^\s*agente\s/i.test(p.name || '') || /^agente\.[^@]+@cbrio\.org$/i.test(p.email || '');
    const colaboradores = (data || [])
      .filter(p => p.name && !p.is_membro_only && !ehAgente(p))
      .map(p => ({ id: p.id, name: p.name, avatar_url: p.avatar_url || null }));
    res.json({ colaboradores });
  } catch (e) {
    console.error('[wa-inbox] colaboradores:', e.message);
    res.status(500).json({ error: 'Erro ao listar colaboradores' });
  }
});

// ── Mensagens prontas (respostas rápidas reutilizáveis) ───────────────────
// GET lista (todos que podem usar a inbox) · POST/PATCH/DELETE (quem edita, >=2)
router.get('/mensagens-prontas', authorizeModule('conversas', 1), async (req, res) => {
  try {
    const { data, error } = await supabase.from('wa_mensagens_prontas')
      .select('id, titulo, texto').eq('ativo', true).order('titulo');
    if (error) throw error;
    res.json({ mensagens: data || [] });
  } catch (e) {
    console.error('[wa-inbox] mensagens-prontas list:', e.message);
    res.status(500).json({ error: 'Erro ao listar mensagens prontas' });
  }
});
router.post('/mensagens-prontas', authorizeModule('conversas', 2), async (req, res) => {
  try {
    const titulo = String(req.body?.titulo || '').trim().slice(0, 80);
    const texto = String(req.body?.texto || '').trim().slice(0, 4000);
    if (!titulo || !texto) return res.status(400).json({ error: 'Título e texto são obrigatórios.' });
    const { data, error } = await supabase.from('wa_mensagens_prontas')
      .insert({ titulo, texto, criado_por: uid(req) }).select('id, titulo, texto').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    console.error('[wa-inbox] mensagens-prontas create:', e.message);
    res.status(500).json({ error: 'Erro ao salvar a mensagem pronta' });
  }
});
router.patch('/mensagens-prontas/:id', authorizeModule('conversas', 2), async (req, res) => {
  try {
    const patch = { updated_at: new Date().toISOString() };
    if ('titulo' in (req.body || {})) patch.titulo = String(req.body.titulo || '').trim().slice(0, 80);
    if ('texto' in (req.body || {})) patch.texto = String(req.body.texto || '').trim().slice(0, 4000);
    const { data, error } = await supabase.from('wa_mensagens_prontas')
      .update(patch).eq('id', req.params.id).select('id, titulo, texto').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Mensagem não encontrada' });
    res.json(data);
  } catch (e) {
    console.error('[wa-inbox] mensagens-prontas patch:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar a mensagem pronta' });
  }
});
router.delete('/mensagens-prontas/:id', authorizeModule('conversas', 2), async (req, res) => {
  try {
    const { error } = await supabase.from('wa_mensagens_prontas').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[wa-inbox] mensagens-prontas delete:', e.message);
    res.status(500).json({ error: 'Erro ao remover a mensagem pronta' });
  }
});

// GET /conversas/:id/perfil — resumo da pessoa (grupo, batismo, serve+onde, NEXT)
router.get('/conversas/:id/perfil', authorizeModule('conversas', 1), async (req, res) => {
  try {
    const { data: conv } = await supabase.from('wa_conversas')
      .select('membro_id, telefone').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });

    // ── DE QUAL DISPARO ELA VEIO (Matheus · 12/08/2026) ──────────────────
    // Com o bot calado, quem responde é gente — e responder sem saber o que a
    // igreja mandou antes é responder no escuro. Medido: 88 das 110 conversas
    // (80%) têm um disparo que as explica.
    // ⚠️ Best-effort e SEPARADO do resto: falha aqui não pode derrubar o perfil
    // da pessoa. `origem_erro` diz que não deu pra ler — a tela não pode mostrar
    // "não veio de disparo" quando a consulta falhou.
    let origem = [];
    let origemErro = null;
    try {
      const { disparosDoTelefone } = require('../services/whatsappOrigemConversa');
      origem = await disparosDoTelefone(conv.telefone);
    } catch (e) {
      console.error('[wa-inbox] origem do disparo:', e.message);
      origemErro = 'Não foi possível ler os disparos anteriores.';
    }

    const mid = conv.membro_id;
    if (!mid) return res.json({ membro: null, telefone: conv.telefone, origem, origem_erro: origemErro });

    const { data: m } = await supabase.from('mem_membros')
      .select('id, nome, foto_url, telefone, email, data_nascimento, status, batizado')
      .eq('id', mid).is('deleted_at', null).maybeSingle();
    if (!m) return res.json({ membro: null, telefone: conv.telefone });

    // grupo atual
    const { data: gm } = await supabase.from('mem_grupo_membros')
      .select('funcao, grupo:mem_grupos(nome)')
      .eq('membro_id', mid).is('saiu_em', null).is('deleted_at', null).limit(1).maybeSingle();

    // serve onde (voluntariado · fonte PCO vol_*)
    let ministerios = [];
    const { data: vp } = await supabase.from('vol_profiles').select('id').eq('membresia_id', mid).maybeSingle();
    if (vp?.id) {
      const { data: tm } = await supabase.from('vol_team_members')
        .select('is_active, team:vol_teams(name)').eq('volunteer_profile_id', vp.id);
      ministerios = (tm || []).filter(t => t.is_active).map(t => t.team?.name).filter(Boolean);
    }

    // batizado (flag ou inscrição realizada)
    let batizado = !!m.batizado;
    if (!batizado) {
      const { data: bi } = await supabase.from('batismo_inscricoes')
        .select('id').eq('membro_id', mid).eq('status', 'realizado').is('deleted_at', null).limit(1).maybeSingle();
      batizado = !!bi;
    }

    // fez NEXT (concluiu curso · view; fallback = compareceu ao evento)
    let fezNext = false;
    try {
      const { data: nf } = await supabase.from('vw_next_formado_pessoa')
        .select('membro_id').eq('membro_id', mid).limit(1).maybeSingle();
      fezNext = !!nf;
    } catch { /* view pode não existir · fallback abaixo */ }
    if (!fezNext) {
      const { data: ni } = await supabase.from('next_inscricoes')
        .select('id').eq('membro_id', mid).not('check_in_at', 'is', null).limit(1).maybeSingle();
      fezNext = !!ni;
    }

    res.json({
      membro: { id: m.id, nome: m.nome, foto_url: m.foto_url, telefone: m.telefone, email: m.email, data_nascimento: m.data_nascimento, status: m.status },
      grupo: gm?.grupo?.nome || null,
      grupo_funcao: gm?.funcao || null,
      batizado,
      serve: ministerios.length > 0,
      ministerios,
      fez_next: fezNext,
      origem,
      origem_erro: origemErro,
    });
  } catch (e) {
    console.error('[wa-inbox] perfil:', e.message);
    res.status(500).json({ error: 'Erro ao carregar perfil' });
  }
});

// GET /conversas?status=abertas|todas&q=&area=entrada|minhas|<nome>|todas
router.get('/conversas', authorizeModule('conversas', 1), async (req, res) => {
  try {
    const status = req.query.status || 'abertas';
    const q = (req.query.q || '').trim();
    const areaParam = (req.query.area || 'todas').trim();
    const userId = uid(req);

    let query = supabase.from('wa_conversas').select(SEL)
      .is('deleted_at', null)
      .not('last_message_at', 'is', null) // esconde conversas criadas só por clique (sem nenhuma mensagem)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(200);
    if (status === 'abertas') query = query.eq('resolvida', false);
    if (q) query = query.or(`nome.ilike.%${q}%,telefone.ilike.%${q}%`);

    // Visibilidade (não-admin): Entrada (área nula) OU área do usuário OU atribuída a ele.
    if (!ehAdmin(req)) {
      const vis = ['area.is.null', `atribuido_a.eq.${userId}`];
      const areas = minhasAreas(req);
      if (areas.length) vis.push(`area.in.${inList(areas)}`);
      query = query.or(vis.join(','));
    }

    // Chip selecionado (afunila dentro do que é visível).
    if (areaParam === 'entrada') query = query.is('area', null);
    else if (areaParam === 'minhas') query = query.eq('atribuido_a', userId);
    else if (areaParam && areaParam !== 'todas') query = query.eq('area', areaParam);

    const { data, error } = await query;
    if (error) throw error;
    const rows = (data || []).map(comJanela);
    res.json({ conversas: rows, nao_lidas_total: rows.reduce((a, c) => a + (c.nao_lidas || 0), 0) });
  } catch (e) {
    console.error('[wa-inbox] conversas:', e.message);
    res.status(500).json({ error: 'Erro ao listar conversas' });
  }
});

// GET /conversas/:id/mensagens — thread + marca lida
router.get('/conversas/:id/mensagens', authorizeModule('conversas', 1), async (req, res) => {
  try {
    const { data: conv } = await supabase.from('wa_conversas')
      .select('*, membro:mem_membros(foto_url)').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
    // ⚠️ desc + reverse: a conversa é 1 por telefone PRA SEMPRE — com asc+limit,
    // um histórico >500 devolvia as 500 mais ANTIGAS e a mensagem de HOJE nunca
    // aparecia na thread (a prévia da lista subia e o time respondia no escuro).
    const { data: msgs } = await supabase.from('wa_mensagens')
      .select('id, direcao, tipo, texto, media_url, autor_id, criado_em')
      .eq('conversa_id', conv.id).order('criado_em', { ascending: false }).limit(500);
    (msgs || []).reverse();
    // Mídia RECEBIDA vive em bucket PRIVADO e a linha guarda o PATH (não URL):
    // assina em LOTE por 15 min só pra esta leitura. URL http (outbound público
    // + histórico anterior à migração) passa direto. Arquivo já expurgado pela
    // retenção → ponteiro vira null e o front mostra o placeholder [tipo].
    const paths = (msgs || []).filter(m => m.media_url && !/^https?:\/\//i.test(m.media_url)).map(m => m.media_url);
    if (paths.length) {
      try {
        const { data: assinadas } = await supabase.storage.from('wa-inbox-privado').createSignedUrls(paths, 900);
        const porPath = new Map((assinadas || []).filter(s => s.signedUrl).map(s => [s.path, s.signedUrl]));
        for (const m of msgs) {
          if (m.media_url && !/^https?:\/\//i.test(m.media_url)) {
            m.media_url = porPath.get(m.media_url) || null;
          }
        }
      } catch (e) {
        console.warn('[wa-inbox] assinar mídia:', e.message);
        for (const m of msgs) if (m.media_url && !/^https?:\/\//i.test(m.media_url)) m.media_url = null;
      }
    }
    if (conv.nao_lidas > 0) await supabase.from('wa_conversas').update({ nao_lidas: 0 }).eq('id', conv.id);
    res.json({ conversa: comJanela({ ...conv, nao_lidas: 0 }), mensagens: msgs || [] });
  } catch (e) {
    console.error('[wa-inbox] mensagens:', e.message);
    res.status(500).json({ error: 'Erro ao carregar conversa' });
  }
});

// POST /conversas/abrir { telefone, nome? } — acha-ou-cria a conversa da pessoa
// (usado pelos botões de WhatsApp dos outros módulos p/ abrir direto no inbox)
router.post('/conversas/abrir', authorizeModule('conversas', 1), async (req, res) => {
  try {
    const { telefone, nome } = req.body || {};
    if (!telefone || !String(telefone).replace(/\D+/g, '')) return res.status(400).json({ error: 'Telefone inválido.' });
    const conv = await waInbox.acharOuCriarConversa(telefone);
    if (!conv) return res.status(400).json({ error: 'Telefone inválido.' });
    if (nome && !conv.nome) { await supabase.from('wa_conversas').update({ nome }).eq('id', conv.id); conv.nome = nome; }
    res.json({ conversa: comJanela(conv) });
  } catch (e) {
    console.error('[wa-inbox] abrir:', e.message);
    res.status(500).json({ error: 'Erro ao abrir conversa' });
  }
});

// POST /conversas/nova { telefone, area?, texto? , template_name?, template_params? }
router.post('/conversas/nova', authorizeModule('conversas', 2), async (req, res) => {
  try {
    const { telefone, area, texto, template_name, template_params } = req.body || {};
    if (!telefone || !String(telefone).replace(/\D+/g, '')) {
      return res.status(400).json({ error: 'Informe o telefone.' });
    }
    const conv = await waInbox.acharOuCriarConversa(telefone);
    if (!conv) return res.status(400).json({ error: 'Telefone inválido.' });

    const dentro = waInbox.dentroJanela24h(conv.last_inbound_at);
    // Multi-número: responde pelo número da CONVERSA (institucional × CBZap).
    // conv vem de select('*') — a coluna flui quando a migration existir.
    const numOpts = conv.phone_number_id ? { phoneNumberId: conv.phone_number_id } : {};
    let r, tipo, textoLog;
    if (dentro && texto && String(texto).trim()) {
      r = await wpp.sendText(conv.telefone, String(texto).trim(), numOpts);
      tipo = 'text'; textoLog = String(texto).trim();
    } else if (template_name) {
      r = await wpp.sendTemplate(conv.telefone, template_name, 'pt_BR', Array.isArray(template_params) ? template_params : [], numOpts);
      tipo = 'template'; textoLog = `[template: ${template_name}]`;
    } else {
      return res.status(400).json({
        error: 'Este número não tem conversa aberta nas últimas 24h — escolha um template aprovado para iniciar.',
        code: 'precisa_template',
      });
    }
    if (!r?.sent) return res.status(502).json({ error: 'O WhatsApp não aceitou o envio.', detail: r?.reason || r?.detail || null });

    await waInbox.registrarOutbound({ telefone: conv.telefone, texto: textoLog, tipo, autorId: uid(req) });
    if (area && String(area).trim()) await supabase.from('wa_conversas').update({ area: String(area).trim() }).eq('id', conv.id);

    const { data: fresh } = await supabase.from('wa_conversas').select('*').eq('id', conv.id).maybeSingle();
    res.json({ ok: true, conversa: comJanela(fresh || conv), messageId: r.messageId || null });
  } catch (e) {
    console.error('[wa-inbox] nova:', e.message);
    res.status(500).json({ error: 'Erro ao iniciar conversa' });
  }
});

// POST /conversas/:id/responder { texto } (dentro de 24h) OU { template_name, template_params }
router.post('/conversas/:id/responder', authorizeModule('conversas', 2), async (req, res) => {
  try {
    const { texto, template_name, template_params } = req.body || {};
    // select('*'): o phone_number_id (multi-número) entra quando a migration
    // existir — pedir a coluna nominalmente derrubaria a rota antes dela.
    const { data: conv } = await supabase.from('wa_conversas')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });

    const dentro = waInbox.dentroJanela24h(conv.last_inbound_at);
    const numOpts = conv.phone_number_id ? { phoneNumberId: conv.phone_number_id } : {};
    let r, tipo, textoLog;
    if (dentro && texto && String(texto).trim()) {
      r = await wpp.sendText(conv.telefone, String(texto).trim(), numOpts);
      tipo = 'text'; textoLog = String(texto).trim();
    } else if (template_name) {
      r = await wpp.sendTemplate(conv.telefone, template_name, 'pt_BR', Array.isArray(template_params) ? template_params : [], numOpts);
      tipo = 'template'; textoLog = `[template: ${template_name}]`;
    } else {
      return res.status(400).json({
        error: dentro ? 'Escreva uma mensagem.' : 'Fora da janela de 24h — só é possível enviar um template aprovado.',
        code: dentro ? 'texto_vazio' : 'fora_janela',
      });
    }
    if (!r?.sent) return res.status(502).json({ error: 'O WhatsApp não aceitou o envio.', detail: r?.reason || r?.detail || null });
    await waInbox.registrarOutbound({ telefone: conv.telefone, texto: textoLog, tipo, autorId: uid(req) });
    res.json({ ok: true, messageId: r.messageId || null });
  } catch (e) {
    console.error('[wa-inbox] responder:', e.message);
    res.status(500).json({ error: 'Erro ao enviar resposta' });
  }
});

// POST /conversas/:id/anexo — envia imagem/documento (multipart campo 'arquivo')
router.post('/conversas/:id/anexo', authorizeModule('conversas', 2), uploadAnexo.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório.' });
    const { data: conv } = await supabase.from('wa_conversas')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
    if (!waInbox.dentroJanela24h(conv.last_inbound_at)) {
      return res.status(400).json({ error: 'Fora da janela de 24h — anexos só dentro da janela.', code: 'fora_janela' });
    }
    const mime = req.file.mimetype || 'application/octet-stream';
    const kind = mime.startsWith('image/') ? 'image' : 'document';
    // sobe pro bucket público → o WhatsApp busca pelo link
    const urlPub = await waInbox.subirMedia({ buffer: req.file.buffer, mime, conversaId: conv.id, origem: 'out', filename: req.file.originalname });
    if (!urlPub) return res.status(500).json({ error: 'Falha ao subir o arquivo.' });
    const r = await wpp.sendMedia(conv.telefone, kind, urlPub, {
      filename: req.file.originalname,
      ...(conv.phone_number_id ? { phoneNumberId: conv.phone_number_id } : {}),
    });
    if (!r?.sent) return res.status(502).json({ error: 'O WhatsApp não aceitou o anexo.', detail: r?.reason || r?.detail || null });
    await waInbox.registrarOutbound({
      telefone: conv.telefone, tipo: kind, autorId: uid(req), mediaUrl: urlPub,
      texto: kind === 'document' ? (req.file.originalname || '[documento]') : null,
    });
    res.json({ ok: true, media_url: urlPub, messageId: r.messageId || null });
  } catch (e) {
    console.error('[wa-inbox] anexo:', e.message);
    res.status(500).json({ error: 'Erro ao enviar anexo' });
  }
});

// POST /conversas/:id/ler — zera não-lidas
router.post('/conversas/:id/ler', authorizeModule('conversas', 1), async (req, res) => {
  try {
    await supabase.from('wa_conversas').update({ nao_lidas: 0 }).eq('id', req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao marcar lida' });
  }
});

// PATCH /conversas/:id — resolver/reabrir, atribuir, triar (área)
router.patch('/conversas/:id', authorizeModule('conversas', 2), async (req, res) => {
  try {
    const { data: antes } = await supabase.from('wa_conversas')
      .select('*').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!antes) return res.status(404).json({ error: 'Conversa não encontrada' });

    const patch = {};
    if (typeof req.body?.resolvida === 'boolean') patch.resolvida = req.body.resolvida;
    if ('atribuido_a' in (req.body || {})) patch.atribuido_a = req.body.atribuido_a || null;
    if ('area' in (req.body || {})) patch.area = req.body.area ? String(req.body.area).trim() : null;
    if ('notas' in (req.body || {})) patch.notas = req.body.notas ? String(req.body.notas) : null;
    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nada para atualizar' });

    // Ao FINALIZAR (resolvida: false → true): manda a pesquisa de satisfação 0-5
    // com o protocolo. Só dá pra mandar texto livre dentro da janela de 24h.
    // ⚠️ CLAIM ATÔMICO primeiro: duplo-clique no Finalizar (ou dois atendentes ao
    // mesmo tempo) fazia as DUAS requisições lerem resolvida=false e a pessoa
    // recebia a pesquisa 2×. Só quem realmente transiciona (o UPDATE guardado
    // por .eq('resolvida', false) devolve linha) envia.
    let pesquisaEnviada = false;
    if (patch.resolvida === true && !antes.resolvida) {
      const { data: claim } = await supabase.from('wa_conversas')
        .update({ resolvida: true }).eq('id', req.params.id)
        .eq('resolvida', false).select('id');
      delete patch.resolvida; // já aplicada (ou o concorrente aplicou)
      if (claim?.length && waInbox.dentroJanela24h(antes.last_inbound_at)) {
        const msg = `Sua conversa foi finalizada! 🙏\nProtocolo: *${antes.protocolo || '—'}*\n\nDe *0 a 5*, como você avalia nosso atendimento? Responda só com o número (0 = péssimo · 5 = excelente).`;
        const r = await wpp.sendText(antes.telefone, msg,
          antes.phone_number_id ? { phoneNumberId: antes.phone_number_id } : {}).catch(() => ({ sent: false }));
        if (r?.sent) {
          pesquisaEnviada = true;
          patch.pesquisa_estado = 'aguardando';
          patch.pesquisa_em = new Date().toISOString();
          await waInbox.registrarOutbound({ telefone: antes.telefone, texto: msg, tipo: 'pesquisa' }).catch(() => {});
        }
      }
    }

    let data;
    if (Object.keys(patch).length) {
      const r2 = await supabase.from('wa_conversas').update(patch).eq('id', req.params.id).select().single();
      if (r2.error) throw r2.error;
      data = r2.data;
    } else {
      // patch era só o resolvida (já aplicado no claim) → relê o estado atual
      const r2 = await supabase.from('wa_conversas').select('*').eq('id', req.params.id).single();
      if (r2.error) throw r2.error;
      data = r2.data;
    }
    res.json({ ...comJanela(data), pesquisa_enviada: pesquisaEnviada });
  } catch (e) {
    console.error('[wa-inbox] patch:', e.message);
    res.status(500).json({ error: 'Erro ao atualizar conversa' });
  }
});

// POST /conversas/:id/transferir { area } — transfere o atendimento pra outra área
router.post('/conversas/:id/transferir', authorizeModule('conversas', 2), async (req, res) => {
  try {
    const area = req.body?.area ? String(req.body.area).trim() : '';
    if (!area) return res.status(400).json({ error: 'Escolha a área de destino.' });
    const { data: conv } = await supabase.from('wa_conversas')
      .select('id, area, protocolo, nome, telefone').eq('id', req.params.id).is('deleted_at', null).maybeSingle();
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
    if (conv.area === area) return res.status(400).json({ error: 'A conversa já está nessa área.' });

    // transfere: nova área, tira da fila do responsável atual, reabre se resolvida
    await supabase.from('wa_conversas')
      .update({ area, atribuido_a: null, resolvida: false }).eq('id', conv.id);
    // nota de sistema na thread
    await supabase.from('wa_mensagens').insert({
      conversa_id: conv.id, direcao: 'out', tipo: 'sistema', autor_id: uid(req),
      texto: `🔀 Transferida de ${conv.area || 'Entrada'} para ${area}`,
    }).catch(() => {});
    // notifica a equipe da nova área
    try {
      const alvos = await profilesDaArea(area);
      await notificar({
        modulo: 'conversas', tipo: 'conversa_transferida',
        titulo: `Conversa transferida · ${area}`,
        mensagem: `${conv.nome || conv.telefone} (${conv.protocolo || '—'}) foi transferida pra ${area}.`,
        link: `/comunicacao?tab=conversas&area=${encodeURIComponent(area)}`,
        chaveDedup: `conversa_transf_${conv.id}_${area}`,
        targetIds: alvos.length ? alvos : undefined,
      });
    } catch (e) { console.error('[wa-inbox] transferir notificar:', e.message); }

    const { data: fresh } = await supabase.from('wa_conversas').select(SEL).eq('id', conv.id).maybeSingle();
    res.json(comJanela(fresh || conv));
  } catch (e) {
    console.error('[wa-inbox] transferir:', e.message);
    res.status(500).json({ error: 'Erro ao transferir' });
  }
});

module.exports = router;
