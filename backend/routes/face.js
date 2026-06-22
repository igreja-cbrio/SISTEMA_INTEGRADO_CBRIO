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

// ── Analytics de presença ───────────────────────────────────────────────────
router.get('/presencas/resumo', authorizeModule('face', 1), async (req, res) => {
  try {
    const dias = Math.min(parseInt(req.query.dias, 10) || 30, 365);
    const desde = new Date(Date.now() - dias * 864e5).toISOString();
    // paginação (cap 1000 do PostgREST)
    let presencas = []; let offset = 0;
    while (true) {
      const { data, error } = await supabase.from('face_presencas')
        .select('membro_id, anon_id, reconhecido_em')
        .gte('reconhecido_em', desde)
        .range(offset, offset + 999);
      if (error) throw error;
      if (!data || !data.length) break;
      presencas = presencas.concat(data);
      if (data.length < 1000) break;
      offset += 1000;
    }
    const membrosUnicos = new Set(presencas.filter((p) => p.membro_id).map((p) => p.membro_id));
    const anonUnicos = new Set(presencas.filter((p) => p.anon_id).map((p) => p.anon_id));
    // anônimos recorrentes (visitas >= 2 · prováveis frequentadores a acolher)
    const { count: recorrentes } = await supabase.from('face_anonimos')
      .select('id', { count: 'exact', head: true }).eq('status', 'pendente').gte('visitas', 2);
    const { count: pendentes } = await supabase.from('face_anonimos')
      .select('id', { count: 'exact', head: true }).eq('status', 'pendente');
    res.json({
      dias,
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

module.exports = router;
