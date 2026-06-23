// ============================================================================
// Reconhecimento facial na entrada do templo
//
// Fundação de software (testável com webcam · device edge/Jetson pluga depois).
// Reusa o MESMO embedding 128-d do face-api do voluntariado.
//   • POST /reconhecer  → membro-ou-anônimo + grava presença (núcleo do device)
//   • GET  /anonimos    → rostos a resolver (best-shot via signed URL)
//   • POST /anonimos/:id/vincular|cadastrar|descartar
//   • POST /membros/:id/enroll  → enrolla rosto de um membro (consentimento)
//   • GET  /presencas/resumo    → analytics (frequência · recorrentes · anônimos)
//   • GET  /cron/expurgo        → retenção LGPD (apaga anônimos vencidos)
//
// ⚠️ LGPD: biometria é dado sensível. Membros = consentimento. Anônimos =
// pseudonimizados + retenção curta + acesso restrito. Go-live exige aval do DPO.
// ============================================================================
const router = require('express').Router();
const crypto = require('crypto');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { notificar } = require('../services/notificar');
const { requireCron } = require('../utils/cronAuth');

const BUCKET = 'face-anonimos';
const LIMIAR_PADRAO = 0.55; // distância L2 face-api (< = mesmo rosto)

// pgvector aceita o literal '[a,b,c]' nos parâmetros vector(128).
const vecLiteral = (arr) => `[${arr.join(',')}]`;
const isDescriptor = (d) => Array.isArray(d) && d.length === 128 && d.every((n) => typeof n === 'number' && isFinite(n));

// Sobe a miniatura best-shot (dataURL base64) pro bucket privado · retorna path.
async function uploadBestShot(dataUrl, prefix = 'anon') {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const m = dataUrl.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  if (!m) return null;
  try {
    const ext = (m[1].split('/')[1] || 'jpg').replace(/[^\w]/g, '') || 'jpg';
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 2_000_000) return null; // best-shot é pequeno
    const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, buf, { contentType: m[1], upsert: false });
    if (error) { console.error('[face] upload best-shot:', error.message); return null; }
    return path;
  } catch (e) { console.error('[face] best-shot:', e.message); return null; }
}

async function removerBestShot(path) {
  if (!path) return;
  try { await supabase.storage.from(BUCKET).remove([path]); } catch (e) { /* best-effort */ }
}

// ── CRON · expurgo por retenção (LGPD) ──────────────────────────────────────
// Declarado ANTES do guard global (usa CRON_SECRET, não JWT).
router.get('/cron/expurgo', requireCron, async (_req, res) => {
  try {
    const { data, error } = await supabase.rpc('face_expurgar_anonimos');
    if (error) throw error;
    res.json({ ok: true, expurgados: data || 0 });
  } catch (e) {
    console.error('[face] expurgo:', e.message);
    res.status(500).json({ error: 'Erro no expurgo de anônimos' });
  }
});

// Daqui pra baixo exige login + nível no módulo face.
router.use(authenticate, authorizeModule('face', 1));

// ── Reconhecer (núcleo do device) ───────────────────────────────────────────
// Recebe o descriptor de um rosto → tenta MEMBRO; senão ANÔNIMO recorrente;
// senão cria ANÔNIMO novo. Sempre grava 1 evento de presença.
router.post('/reconhecer', authorizeModule('face', 1), async (req, res) => {
  try {
    const { descriptor, threshold, entrada, culto_id, best_shot } = req.body || {};
    if (!isDescriptor(descriptor)) return res.status(400).json({ error: 'descriptor (128 números) obrigatório' });
    const limiar = typeof threshold === 'number' ? threshold : LIMIAR_PADRAO;
    const query = vecLiteral(descriptor);
    const entradaTxt = entrada ? String(entrada).slice(0, 60) : null;
    const cultoId = culto_id || null;

    // 1) Membro consentido?
    const { data: mm, error: e1 } = await supabase.rpc('face_match_membro', { query_descriptor: query, match_threshold: limiar });
    if (e1) throw e1;
    if (mm && mm.length) {
      const hit = mm[0];
      const confianca = Math.max(0, 1 - (hit.distance || 0));
      await supabase.from('face_presencas').insert({ membro_id: hit.membro_id, culto_id: cultoId, entrada: entradaTxt, confianca });
      return res.json({ tipo: 'membro', membro: { id: hit.membro_id, nome: hit.nome }, confianca });
    }

    // 2) Anônimo recorrente?
    const { data: an, error: e2 } = await supabase.rpc('face_match_anonimo', { query_descriptor: query, match_threshold: limiar });
    if (e2) throw e2;
    if (an && an.length) {
      const hit = an[0];
      // best-shot só é guardado se ainda não houver (1 print basta pra revisão)
      const patch = { ultima_vez: new Date().toISOString(), visitas: (hit.visitas || 1) + 1, entrada: entradaTxt, ultimo_culto_id: cultoId };
      const { data: cur } = await supabase.from('face_anonimos').select('best_shot_path').eq('id', hit.anon_id).maybeSingle();
      if (cur && !cur.best_shot_path && best_shot) { const p = await uploadBestShot(best_shot); if (p) patch.best_shot_path = p; }
      await supabase.from('face_anonimos').update(patch).eq('id', hit.anon_id);
      await supabase.from('face_presencas').insert({ anon_id: hit.anon_id, culto_id: cultoId, entrada: entradaTxt, confianca: Math.max(0, 1 - (hit.distance || 0)) });
      return res.json({ tipo: 'anonimo_recorrente', anon_id: hit.anon_id, visitas: patch.visitas });
    }

    // 3) Anônimo novo (pseudonimizado · retenção 90d)
    const best_shot_path = best_shot ? await uploadBestShot(best_shot) : null;
    const { data: novo, error: e3 } = await supabase.from('face_anonimos')
      .insert({ embedding: query, best_shot_path, entrada: entradaTxt, ultimo_culto_id: cultoId })
      .select('id').single();
    if (e3) throw e3;
    await supabase.from('face_presencas').insert({ anon_id: novo.id, culto_id: cultoId, entrada: entradaTxt, confianca: null });
    res.json({ tipo: 'anonimo_novo', anon_id: novo.id, visitas: 1 });
  } catch (e) {
    console.error('[face] reconhecer:', e.message);
    res.status(500).json({ error: 'Erro no reconhecimento' });
  }
});

// ── Rostos anônimos a resolver ──────────────────────────────────────────────
router.get('/anonimos', authorizeModule('face', 1), async (req, res) => {
  try {
    const minVisitas = parseInt(req.query.min_visitas, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
    const { data, error } = await supabase.from('face_anonimos')
      .select('id, visitas, primeira_vez, ultima_vez, entrada, best_shot_path, expurgar_em')
      .eq('status', 'pendente')
      .gte('visitas', minVisitas)
      .order('visitas', { ascending: false })
      .order('ultima_vez', { ascending: false })
      .limit(limit);
    if (error) throw error;
    // signed URLs do best-shot (15 min) pra revisão humana
    const out = await Promise.all((data || []).map(async (a) => {
      let best_shot_url = null;
      if (a.best_shot_path) {
        const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(a.best_shot_path, 900);
        best_shot_url = s?.signedUrl || null;
      }
      const { best_shot_path, ...rest } = a;
      return { ...rest, best_shot_url };
    }));
    res.json(out);
  } catch (e) {
    console.error('[face] anonimos:', e.message);
    res.status(500).json({ error: 'Erro ao listar anônimos' });
  }
});

// Vincular o rosto anônimo a um MEMBRO existente (enrolla + migra histórico).
router.post('/anonimos/:id/vincular', authorizeModule('face', 3), async (req, res) => {
  try {
    const { membro_id } = req.body || {};
    if (!membro_id) return res.status(400).json({ error: 'membro_id obrigatório' });
    const { data: m } = await supabase.from('mem_membros').select('id, nome').eq('id', membro_id).is('deleted_at', null).maybeSingle();
    if (!m) return res.status(404).json({ error: 'Membro não encontrado' });
    const { data: shot, error } = await supabase.rpc('face_resolver_vincular', { p_anon_id: req.params.id, p_membro_id: membro_id, p_consent: true });
    if (error) throw error;
    if (shot === null) return res.status(404).json({ error: 'Anônimo não encontrado' });
    await removerBestShot(shot);
    res.json({ ok: true, membro: m });
  } catch (e) {
    console.error('[face] vincular:', e.message);
    res.status(500).json({ error: 'Erro ao vincular rosto' });
  }
});

// Cadastrar uma NOVA pessoa a partir do rosto anônimo (cria membro + enrolla).
router.post('/anonimos/:id/cadastrar', authorizeModule('face', 3), async (req, res) => {
  try {
    const { nome, telefone, email } = req.body || {};
    if (!nome || String(nome).trim().length < 2) return res.status(400).json({ error: 'nome obrigatório' });
    const { data: novo, error: eIns } = await supabase.from('mem_membros')
      .insert({ nome: String(nome).trim(), telefone: telefone || null, email: email || null, status: 'visitante', origem: 'reconhecimento_facial' })
      .select('id, nome').single();
    if (eIns) throw eIns;
    const { data: shot, error } = await supabase.rpc('face_resolver_vincular', { p_anon_id: req.params.id, p_membro_id: novo.id, p_consent: true });
    if (error) throw error;
    if (shot === null) return res.status(404).json({ error: 'Anônimo não encontrado' });
    await removerBestShot(shot);
    res.json({ ok: true, membro: novo, criado: true });
  } catch (e) {
    console.error('[face] cadastrar:', e.message);
    res.status(500).json({ error: 'Erro ao cadastrar pessoa do rosto' });
  }
});

// Descartar (passante/equipe · não é alguém de interesse).
router.post('/anonimos/:id/descartar', authorizeModule('face', 3), async (req, res) => {
  try {
    const { data: shot, error } = await supabase.rpc('face_anonimo_descartar', { p_anon_id: req.params.id });
    if (error) throw error;
    await removerBestShot(shot);
    res.json({ ok: true });
  } catch (e) {
    console.error('[face] descartar:', e.message);
    res.status(500).json({ error: 'Erro ao descartar rosto' });
  }
});

// Importa um rosto como ANÔNIMO pendente (lote de fotos · o browser gera o
// vetor). Sempre cria (não tenta match) · rotulo = dica (ex.: nome do arquivo).
router.post('/anonimos/importar', authorizeModule('face', 3), async (req, res) => {
  try {
    const { descriptor, best_shot, rotulo } = req.body || {};
    if (!isDescriptor(descriptor)) return res.status(400).json({ error: 'descriptor (128 números) obrigatório' });
    const best_shot_path = best_shot ? await uploadBestShot(best_shot, 'import') : null;
    const { data, error } = await supabase.from('face_anonimos')
      .insert({ embedding: vecLiteral(descriptor), best_shot_path, entrada: rotulo ? String(rotulo).slice(0, 60) : 'importado' })
      .select('id').single();
    if (error) throw error;
    res.json({ ok: true, anon_id: data.id });
  } catch (e) {
    console.error('[face] importar:', e.message);
    res.status(500).json({ error: 'Erro ao importar rosto' });
  }
});

// ── Enroll de membro (consentimento) ────────────────────────────────────────
// Usado pela galeria/cadastro: salva o descriptor do membro com consentimento.
router.post('/membros/:id/enroll', authorizeModule('face', 3), async (req, res) => {
  try {
    const { descriptor, consentimento } = req.body || {};
    if (!isDescriptor(descriptor)) return res.status(400).json({ error: 'descriptor (128 números) obrigatório' });
    if (consentimento !== true) return res.status(400).json({ error: 'consentimento explícito obrigatório (LGPD · dado biométrico sensível)' });
    const { data, error } = await supabase.rpc('face_save_membro', { p_membro_id: req.params.id, descriptor, p_consent: true });
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Membro não encontrado' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[face] enroll:', e.message);
    res.status(500).json({ error: 'Erro ao enrollar rosto do membro' });
  }
});

// Remove o rosto de um membro (revoga consentimento).
router.delete('/membros/:id/enroll', authorizeModule('face', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('mem_membros')
      .update({ face_descriptor: null, face_consentimento: false, face_consentimento_em: null, face_cadastrado_em: null })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[face] revoke:', e.message);
    res.status(500).json({ error: 'Erro ao remover rosto do membro' });
  }
});

// ── Galeria de membros pra cadastro de rosto em lote ───────────────────────
// O browser roda o face-api nas FOTOS já existentes e enrolla cada descriptor.
// Fonte da foto: mem_membros.foto_url (membresia) OU profiles.avatar_url (foto
// de perfil do APP) — assim quem se cadastra no app com foto também entra.
router.get('/membros/galeria', authorizeModule('face', 3), async (req, res) => {
  try {
    const semRosto = req.query.sem_rosto === '1';
    const limit = Math.min(parseInt(req.query.limit, 10) || 1500, 3000);
    const fotoPorMembro = new Map(); // membro_id -> { nome?, foto, ja }

    // A) membros com foto na membresia
    let qa = supabase.from('mem_membros')
      .select('id, nome, foto_url, face_cadastrado_em')
      .is('deleted_at', null).not('foto_url', 'is', null)
      .order('face_cadastrado_em', { ascending: true, nullsFirst: true }).limit(limit);
    if (semRosto) qa = qa.is('face_cadastrado_em', null);
    const { data: a, error: ea } = await qa;
    if (ea) throw ea;
    for (const m of a || []) fotoPorMembro.set(m.id, { nome: m.nome, foto: m.foto_url, ja: !!m.face_cadastrado_em });

    // B) avatares do app (profiles.avatar_url → membro_id) — paginado
    const avatarPorMembro = new Map();
    let off = 0;
    while (true) {
      const { data: profs, error: ep } = await supabase.from('profiles')
        .select('membro_id, avatar_url').not('avatar_url', 'is', null).not('membro_id', 'is', null)
        .range(off, off + 999);
      if (ep) break;
      if (!profs || !profs.length) break;
      for (const p of profs) if (!avatarPorMembro.has(p.membro_id)) avatarPorMembro.set(p.membro_id, p.avatar_url);
      if (profs.length < 1000) break;
      off += 1000;
    }
    const avMemIds = [...avatarPorMembro.keys()].filter((id) => !fotoPorMembro.has(id));
    for (let i = 0; i < avMemIds.length; i += 300) {
      const chunk = avMemIds.slice(i, i + 300);
      let qb = supabase.from('mem_membros').select('id, nome, face_cadastrado_em').is('deleted_at', null).in('id', chunk);
      if (semRosto) qb = qb.is('face_cadastrado_em', null);
      const { data: b } = await qb;
      for (const m of b || []) fotoPorMembro.set(m.id, { nome: m.nome, foto: avatarPorMembro.get(m.id), ja: !!m.face_cadastrado_em });
    }

    let itens = [...fotoPorMembro.entries()].map(([id, v]) => ({ id, nome: v.nome, foto_url: v.foto, ja: v.ja }));
    itens.sort((x, y) => Number(x.ja) - Number(y.ja));
    itens = itens.slice(0, limit);
    const { count: cadastrados } = await supabase.from('mem_membros')
      .select('id', { count: 'exact', head: true }).is('deleted_at', null).not('face_cadastrado_em', 'is', null);
    res.json({ itens, com_foto: itens.length, cadastrados: cadastrados || 0 });
  } catch (e) {
    console.error('[face] galeria:', e.message);
    res.status(500).json({ error: 'Erro ao listar galeria de membros' });
  }
});

// ── Janela de presença (presets de dias OU um dia de culto específico) ──────
function janelaPresenca(req) {
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(req.query.dia || '') ? req.query.dia : null;
  if (dia) {
    const base = new Date(dia + 'T00:00:00');
    return { desde: base.toISOString(), ate: new Date(base.getTime() + 864e5).toISOString(), label: dia };
  }
  const dias = Math.min(parseInt(req.query.dias, 10) || 30, 365);
  return { desde: new Date(Date.now() - dias * 864e5).toISOString(), ate: null, dias, label: `${dias} dias` };
}

async function fetchPresencas(desde, ate) {
  let rows = []; let offset = 0;
  while (true) {
    let q = supabase.from('face_presencas').select('membro_id, anon_id, reconhecido_em, culto_id').gte('reconhecido_em', desde);
    if (ate) q = q.lt('reconhecido_em', ate);
    const { data, error } = await q.range(offset, offset + 999);
    if (error) throw error;
    if (!data || !data.length) break;
    rows = rows.concat(data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  return rows;
}

// GET /cultos → cultos recentes pro filtro "dia de culto específico"
router.get('/cultos', authorizeModule('face', 1), async (_req, res) => {
  try {
    const desde = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
    const { data, error } = await supabase.from('cultos')
      .select('id, data, service_type_id').gte('data', desde).order('data', { ascending: false }).limit(80);
    if (error) throw error;
    const stIds = [...new Set((data || []).map((c) => c.service_type_id).filter(Boolean))];
    const nomes = new Map();
    if (stIds.length) {
      const { data: sts } = await supabase.from('vol_service_types').select('id, name').in('id', stIds);
      (sts || []).forEach((s) => nomes.set(s.id, s.name));
    }
    res.json((data || []).map((c) => ({ id: c.id, data: c.data, nome: nomes.get(c.service_type_id) || 'Culto' })));
  } catch (e) {
    console.error('[face] cultos:', e.message);
    res.status(500).json({ error: 'Erro ao listar cultos' });
  }
});

// Proxy da foto do membro (mesmo domínio) → o navegador lê os pixels sem CORS
// pra gerar o vetor facial. Fonte: mem_membros.foto_url OU profiles.avatar_url.
router.get('/membros/:id/foto', authorizeModule('face', 3), async (req, res) => {
  try {
    const { data: m } = await supabase.from('mem_membros').select('id, foto_url').eq('id', req.params.id).maybeSingle();
    let url = m?.foto_url || null;
    if (!url) {
      const { data: p } = await supabase.from('profiles').select('avatar_url').eq('membro_id', req.params.id).not('avatar_url', 'is', null).maybeSingle();
      url = p?.avatar_url || null;
    }
    if (!url) return res.status(404).json({ error: 'sem foto' });
    const r = await fetch(url);
    if (!r.ok) return res.status(502).json({ error: 'falha ao buscar a foto' });
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    console.error('[face] foto proxy:', e.message);
    res.status(500).json({ error: 'Erro ao carregar foto' });
  }
});

// ── Analytics de presença ───────────────────────────────────────────────────
router.get('/presencas/resumo', authorizeModule('face', 1), async (req, res) => {
  try {
    const j = janelaPresenca(req);
    const presencas = await fetchPresencas(j.desde, j.ate);
    const membrosUnicos = new Set(presencas.filter((p) => p.membro_id).map((p) => p.membro_id));
    const anonUnicos = new Set(presencas.filter((p) => p.anon_id).map((p) => p.anon_id));
    const { count: recorrentes } = await supabase.from('face_anonimos')
      .select('id', { count: 'exact', head: true }).eq('status', 'pendente').gte('visitas', 2);
    const { count: pendentes } = await supabase.from('face_anonimos')
      .select('id', { count: 'exact', head: true }).eq('status', 'pendente');
    res.json({
      janela: j.label,
      total_reconhecimentos: presencas.length,
      membros_identificados: membrosUnicos.size,
      anonimos_distintos: anonUnicos.size,
      anonimos_pendentes: pendentes || 0,
      anonimos_recorrentes: recorrentes || 0,
    });
  } catch (e) {
    console.error('[face] resumo:', e.message);
    res.status(500).json({ error: 'Erro no resumo de presença' });
  }
});

// GET /presencas/lista?tipo=todos|membros|anonimos|recorrentes&dias=&dia=
// Lista as PESSOAS dentro do filtro (1 linha por pessoa · membro ou anônimo).
router.get('/presencas/lista', authorizeModule('face', 1), async (req, res) => {
  try {
    const j = janelaPresenca(req);
    const tipo = ['todos', 'membros', 'anonimos', 'recorrentes'].includes(req.query.tipo) ? req.query.tipo : 'todos';
    const presencas = await fetchPresencas(j.desde, j.ate);
    // agrega por pessoa
    const ag = new Map(); // key -> { tipo, id, n, ultima }
    for (const p of presencas) {
      const key = p.membro_id ? 'm:' + p.membro_id : (p.anon_id ? 'a:' + p.anon_id : null);
      if (!key) continue;
      const cur = ag.get(key) || { tipo: p.membro_id ? 'membro' : 'anonimo', id: p.membro_id || p.anon_id, n: 0, ultima: null };
      cur.n += 1;
      if (!cur.ultima || p.reconhecido_em > cur.ultima) cur.ultima = p.reconhecido_em;
      ag.set(key, cur);
    }
    let itens = [...ag.values()];
    // resolve nomes/fotos
    const memIds = itens.filter((i) => i.tipo === 'membro').map((i) => i.id);
    const anonIds = itens.filter((i) => i.tipo === 'anonimo').map((i) => i.id);
    if (memIds.length) {
      const { data: ms } = await supabase.from('mem_membros').select('id, nome, foto_url, telefone').in('id', memIds);
      const map = new Map((ms || []).map((m) => [m.id, m]));
      itens.forEach((i) => { if (i.tipo === 'membro') { const m = map.get(i.id); i.nome = m?.nome || 'Membro'; i.foto_url = m?.foto_url || null; i.telefone = m?.telefone || null; } });
    }
    if (anonIds.length) {
      const { data: as } = await supabase.from('face_anonimos').select('id, visitas, best_shot_path').in('id', anonIds);
      const map = new Map((as || []).map((a) => [a.id, a]));
      for (const i of itens) {
        if (i.tipo !== 'anonimo') continue;
        const a = map.get(i.id);
        i.visitas = a?.visitas || i.n;
        i.nome = 'Anônimo';
        if (a?.best_shot_path) { const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(a.best_shot_path, 900); i.best_shot_url = s?.signedUrl || null; }
      }
    }
    if (tipo === 'membros') itens = itens.filter((i) => i.tipo === 'membro');
    else if (tipo === 'anonimos') itens = itens.filter((i) => i.tipo === 'anonimo');
    else if (tipo === 'recorrentes') itens = itens.filter((i) => i.tipo === 'anonimo' && (i.visitas || 0) >= 2);
    itens.sort((a, b) => (b.ultima || '').localeCompare(a.ultima || ''));
    res.json({ janela: j.label, total: itens.length, itens });
  } catch (e) {
    console.error('[face] lista presenças:', e.message);
    res.status(500).json({ error: 'Erro na lista de presenças' });
  }
});

module.exports = router;
