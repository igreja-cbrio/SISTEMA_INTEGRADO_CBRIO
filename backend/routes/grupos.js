const router = require('express').Router();
// authorizeModule('grupos', N) respeita a matriz cargo×módulo + boost de área
// (Nélio/Natasha, donos do módulo, têm nível 5 via área Grupos mas role
// 'assistente' — o authorize() por role os bloqueava nas rotas de escrita).
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const multer = require('multer');
const { uploadModuleFile, SHAREPOINT_CONFIGURED } = require('../services/storageService');
const { notificar } = require('../services/notificar');

// Auto-sync dos vínculos do bot WhatsApp (Marcos 2026-06-10): novo líder /
// troca de líder reflete em whatsapp_lideres sem passo manual. Fire-and-forget
// após criar/editar grupo (a rede de segurança é o cron diário do bot).
function syncWhatsappLideres() {
  setImmediate(() => {
    try {
      require('../services/whatsappGrupos').sincronizarLideresGrupos()
        .catch(e => console.warn('[grupos] sync whatsapp líderes:', e.message));
    } catch (e) { console.warn('[grupos] sync whatsapp líderes:', e.message); }
  });
}

const uploadMw = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const sanitizePath = (s) => (s || '').replace(/[^a-zA-Z0-9\-_ ]/g, '').trim();

router.use(authenticate);

// ── Temporada de inscrições · flag GLOBAL (linha única em app_grupos_temporada) ──
// O app de membros lê esta flag pra liberar a auto-inscrição em grupos. Leitura
// liberada a qualquer autenticado; escrita só admin/diretor ou líder de grupos
// (authorizeModule('grupos', 3) · Nélio/Natasha entram via boost de área).
router.get('/temporada-inscricoes', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('app_grupos_temporada')
      .select('aberta, titulo, atualizado_em')
      .eq('id', true)
      .maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || { aberta: false, titulo: null, atualizado_em: null });
  } catch (e) {
    console.error('[grupos] temporada-inscricoes get:', e.message);
    res.status(500).json({ error: 'Erro ao ler a temporada de inscrições' });
  }
});

router.put('/temporada-inscricoes', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const payload = { id: true, atualizado_em: new Date().toISOString() };
    if (typeof req.body?.aberta === 'boolean') payload.aberta = req.body.aberta;
    if (req.body?.titulo !== undefined) {
      payload.titulo = (req.body.titulo || '').toString().trim().slice(0, 120) || null;
    }
    const { data, error } = await supabase
      .from('app_grupos_temporada')
      .upsert(payload, { onConflict: 'id' })
      .select('aberta, titulo, atualizado_em')
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    console.error('[grupos] temporada-inscricoes put:', e.message);
    res.status(500).json({ error: 'Erro ao salvar a temporada de inscrições' });
  }
});

// GET /api/grupos — lista todos com contagem de membros e líder
router.get('/', async (req, res) => {
  try {
    const { ativo, categoria, bairro, temporada, status_temporada, codigo } = req.query;
    let q = supabase.from('mem_grupos').select('*').is('deleted_at', null);
    // ativo=all retorna tudo (ativos + arquivados); default e so ativos
    if (ativo === 'all') {
      // sem filtro
    } else if (ativo !== undefined) {
      q = q.eq('ativo', ativo === 'true');
    } else {
      q = q.eq('ativo', true);
    }
    if (categoria) q = q.eq('categoria', categoria);
    if (bairro) q = q.eq('bairro', bairro);
    if (temporada) q = q.eq('temporada', temporada);
    if (status_temporada) q = q.eq('status_temporada', status_temporada);
    if (codigo) q = q.eq('codigo', codigo);
    q = q.order('nome');
    const { data: grupos, error } = await q;
    if (error) throw error;

    // Buscar contagem de membros ativos por grupo
    const { data: participacoes } = await supabase.from('mem_grupo_membros')
      .select('grupo_id, membro_id').is('saiu_em', null);

    // Buscar dados dos líderes
    const liderIds = [...new Set((grupos || []).map(g => g.lider_id).filter(Boolean))];
    let lideresMap = {};
    if (liderIds.length > 0) {
      const { data: lideres } = await supabase.from('mem_membros').select('id, nome, foto_url').is('deleted_at', null).in('id', liderIds);
      (lideres || []).forEach(l => { lideresMap[l.id] = l; });
    }

    // Buscar grupo de origem
    const origemIds = [...new Set((grupos || []).map(g => g.grupo_origem_id).filter(Boolean))];
    let origensMap = {};
    if (origemIds.length > 0) {
      const { data: origens } = await supabase.from('mem_grupos').select('id, nome').is('deleted_at', null).in('id', origemIds);
      (origens || []).forEach(o => { origensMap[o.id] = o.nome; });
    }

    const contagem = {};
    (participacoes || []).forEach(p => { contagem[p.grupo_id] = (contagem[p.grupo_id] || 0) + 1; });

    const result = (grupos || []).map(g => ({
      ...g,
      membros_count: contagem[g.id] || 0,
      lider_nome: lideresMap[g.lider_id]?.nome || null,
      lider_foto: lideresMap[g.lider_id]?.foto_url || null,
      grupo_origem_nome: origensMap[g.grupo_origem_id] || null,
    }));

    res.json(result);
  } catch (e) { console.error('[Grupos list]', e.message); res.status(500).json({ error: 'Erro ao buscar grupos' }); }
});

// ══════════════════════════════════════════════
// MATERIAIS (biblioteca central)
// IMPORTANTE: estas rotas precisam vir ANTES de /:id, senao o Express
// matcheia "/materiais" como /:id com id="materiais".
// ══════════════════════════════════════════════

// GET /api/grupos/materiais — lista todos com filtro por etiqueta
router.get('/materiais', async (req, res) => {
  try {
    const { etiqueta, grupo_id } = req.query;
    let q = supabase.from('mem_grupo_documentos').select('*').order('created_at', { ascending: false });
    if (etiqueta && etiqueta !== 'all') q = q.contains('etiquetas', [etiqueta]);
    if (grupo_id) q = q.contains('grupo_ids', [grupo_id]);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { console.error('[Materiais list]', e.message); res.status(500).json({ error: 'Erro ao buscar materiais' }); }
});

// POST /api/grupos/materiais — upload central
router.post('/materiais', authorizeModule('grupos', 2), uploadMw.single('arquivo'), async (req, res) => {
  try {
    const { nome, comentario, etiquetas, grupo_ids } = req.body;
    if (!req.file) return res.status(400).json({ error: 'Arquivo não fornecido' });
    const fileName = nome || req.file.originalname;
    const ext = fileName.split('.').pop().toLowerCase();
    const parsedEtiquetas = etiquetas ? JSON.parse(etiquetas) : ['Todos'];
    const parsedGrupoIds = grupo_ids ? JSON.parse(grupo_ids) : [];

    // Determinar pasta no SharePoint por etiqueta principal
    const pastaEtiqueta = parsedEtiquetas[0] === 'Todos' ? 'Geral' : sanitizePath(parsedEtiquetas[0]);

    // 1. Upload para Supabase Storage
    let storagePath = null;
    const supaPath = `grupos/materiais/${pastaEtiqueta}/${Date.now()}_${sanitizePath(fileName)}`;
    const { error: upErr } = await supabase.storage
      .from('eventos-anexos')
      .upload(supaPath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (!upErr) {
      const { data: urlData } = supabase.storage.from('eventos-anexos').getPublicUrl(supaPath);
      storagePath = urlData.publicUrl;
    }

    // 2. Salvar registro
    const { data: doc, error: dbErr } = await supabase.from('mem_grupo_documentos').insert({
      tipo: ext,
      nome: fileName,
      comentario: comentario || null,
      etiquetas: parsedEtiquetas,
      grupo_ids: parsedGrupoIds,
      storage_path: storagePath,
      uploaded_by: req.user?.userId || null,
      uploaded_by_name: req.user?.name || null,
    }).select().single();
    if (dbErr) throw dbErr;

    // 3. SharePoint + Cerebro em background
    if (SHAREPOINT_CONFIGURED) {
      (async () => {
        try {
          const result = await uploadModuleFile('ministerial', `Grupos/Materiais/${pastaEtiqueta}`, sanitizePath(fileName), req.file.buffer);
          if (result.url) {
            await supabase.from('mem_grupo_documentos')
              .update({ sharepoint_url: result.url, sharepoint_item_id: result.itemId })
              .eq('id', doc.id);
          }
          const EXTENSOES_CEREBRO = new Set(['pdf', 'xlsx', 'csv', 'docx', 'pptx', 'txt', 'md', 'json', 'png', 'jpg', 'jpeg']);
          if (EXTENSOES_CEREBRO.has(ext)) {
            await supabase.from('cerebro_fila').insert({
              drive_id: result.driveId, item_id: result.itemId,
              nome_arquivo: fileName, extensao: ext, tamanho_bytes: req.file.size,
              pasta_origem: `Grupos/Materiais/${pastaEtiqueta}`, biblioteca: 'Ministerial',
              sharepoint_url: result.url, status: 'pendente',
            });
          }
          console.log(`[Materiais] SharePoint: Materiais/${pastaEtiqueta}/${fileName}`);
        } catch (spErr) { console.error('[Materiais] SharePoint error:', spErr.message); }
      })();
    }

    res.json(doc);
  } catch (e) { console.error('[Materiais upload]', e.message); res.status(500).json({ error: 'Erro ao fazer upload' }); }
});

// DELETE /api/grupos/materiais/:docId
router.delete('/materiais/:docId', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const { error } = await supabase.from('mem_grupo_documentos').delete().eq('id', req.params.docId);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover material' }); }
});

// ══════════════════════════════════════════════
// PARTICIPAÇÃO (rotas especificas antes de /:id)
// ══════════════════════════════════════════════

// PATCH /api/grupos/participacao/:id/sair — remover membro
router.patch('/participacao/:id/sair', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const { data, error } = await supabase.from('mem_grupo_membros').update({
      saiu_em: new Date().toISOString().split('T')[0],
      motivo_saida: req.body.motivo || '',
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// PATCH /api/grupos/participacao/:id/presenca — incrementar presença atomicamente
router.patch('/participacao/:id/presenca', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('incrementar_presenca_grupo', { p_id: req.params.id });
    if (error) throw error;
    res.json(Array.isArray(data) ? data[0] : data);
  } catch (e) { console.error('[Grupos presenca]', e.message); res.status(500).json({ error: 'Erro' }); }
});

// ══════════════════════════════════════════════
// ENCONTROS (chamada / lista de presença)
// ══════════════════════════════════════════════

// GET /api/grupos/:id/encontros — lista encontros do grupo (mais recentes primeiro)
router.get('/:id/encontros', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const { data: encontros, error } = await supabase.from('mem_grupo_encontros')
      .select('*')
      .eq('grupo_id', req.params.id)
      .order('data', { ascending: false })
      .limit(limit);
    if (error) throw error;

    const ids = (encontros || []).map(e => e.id);
    let presencasMap = {};
    if (ids.length > 0) {
      const { data: presencas } = await supabase.from('mem_grupo_encontro_presencas')
        .select('encontro_id, membro_id')
        .in('encontro_id', ids);
      (presencas || []).forEach(p => {
        if (!presencasMap[p.encontro_id]) presencasMap[p.encontro_id] = [];
        presencasMap[p.encontro_id].push(p.membro_id);
      });
    }

    res.json((encontros || []).map(e => ({
      ...e,
      total_presentes: (presencasMap[e.id] || []).length,
      membros_presentes: presencasMap[e.id] || [],
    })));
  } catch (e) { console.error('[Grupos encontros list]', e.message); res.status(500).json({ error: 'Erro ao buscar encontros' }); }
});

// POST /api/grupos/:id/encontros — registrar encontro com chamada
router.post('/:id/encontros', authorizeModule('grupos', 2), async (req, res) => {
  try {
    const { data, tema, observacoes, membros_presentes } = req.body;
    if (!data) return res.status(400).json({ error: 'data obrigatoria' });
    if (!Array.isArray(membros_presentes)) return res.status(400).json({ error: 'membros_presentes deve ser array' });

    const { data: encontroId, error } = await supabase.rpc('registrar_encontro_grupo', {
      p_grupo_id: req.params.id,
      p_data: data,
      p_tema: tema || null,
      p_observacoes: observacoes || null,
      p_registrado_por: req.user?.userId || null,
      p_registrado_por_nome: req.user?.name || null,
      p_membros_presentes: membros_presentes,
    });
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Já existe encontro registrado nessa data' });
      throw error;
    }
    res.json({ id: encontroId, total_presentes: membros_presentes.length });
  } catch (e) { console.error('[Grupos encontro create]', e.message); res.status(500).json({ error: 'Erro ao registrar encontro' }); }
});

// GET /api/grupos/encontros/:encontroId — detalhe + presenças
router.get('/encontros/:encontroId', async (req, res) => {
  try {
    const { data: encontro, error } = await supabase.from('mem_grupo_encontros')
      .select('*').eq('id', req.params.encontroId).single();
    if (error) throw error;

    const { data: presencas } = await supabase.from('mem_grupo_encontro_presencas')
      .select('membro_id').eq('encontro_id', req.params.encontroId).eq('presente', true);

    res.json({
      ...encontro,
      membros_presentes: (presencas || []).map(p => p.membro_id),
    });
  } catch (e) { console.error('[Grupos encontro get]', e.message); res.status(500).json({ error: 'Erro ao buscar encontro' }); }
});

// PATCH /api/grupos/encontros/:encontroId — editar encontro (tema, observações, data, presenças)
router.patch('/encontros/:encontroId', authorizeModule('grupos', 2), async (req, res) => {
  try {
    const { data: dataEncontro, tema, observacoes, membros_presentes } = req.body;
    if (membros_presentes !== undefined && !Array.isArray(membros_presentes)) {
      return res.status(400).json({ error: 'membros_presentes deve ser array' });
    }

    const { error } = await supabase.rpc('atualizar_encontro_grupo', {
      p_encontro_id: req.params.encontroId,
      p_data: dataEncontro || null,
      p_tema: tema ?? null,
      p_observacoes: observacoes ?? null,
      p_membros_presentes: Array.isArray(membros_presentes) ? membros_presentes : null,
    });
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Já existe encontro registrado nessa data' });
      throw error;
    }
    res.json({ success: true });
  } catch (e) { console.error('[Grupos encontro patch]', e.message); res.status(500).json({ error: 'Erro ao atualizar encontro' }); }
});

// DELETE /api/grupos/encontros/:encontroId — remove encontro (decrementa contadores)
router.delete('/encontros/:encontroId', authorizeModule('grupos', 3), async (req, res) => {
  try {
    // Buscar membros presentes para reverter contador
    const { data: presencas } = await supabase.from('mem_grupo_encontro_presencas')
      .select('membro_id, mem_grupo_encontros!inner(grupo_id)')
      .eq('encontro_id', req.params.encontroId);

    const grupoId = presencas?.[0]?.mem_grupo_encontros?.grupo_id;

    // Delete cascateia presenças; antes decrementa contador de cada membro presente
    if (grupoId && presencas?.length) {
      for (const p of presencas) {
        await supabase.rpc('decrementar_presenca_grupo_membro', {
          p_grupo_id: grupoId, p_membro_id: p.membro_id,
        }).catch(() => {});
      }
    }

    const { error } = await supabase.from('mem_grupo_encontros').delete().eq('id', req.params.encontroId);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { console.error('[Grupos encontro delete]', e.message); res.status(500).json({ error: 'Erro ao remover encontro' }); }
});

// ══════════════════════════════════════════════
// METRICAS / SAÚDE
// ══════════════════════════════════════════════

const RECORRENCIA_DIAS = { semanal: 7, quinzenal: 14, mensal: 30 };

function calcularMetricasGrupo(grupo, encontrosRaw, presencasPorEncontro, totalMembrosAtuais) {
  // encontrosRaw esta ordenado por data DESC
  const ultimos8 = encontrosRaw.slice(0, 8);
  const presencasUltimos8 = ultimos8.map(e => (presencasPorEncontro[e.id] || []).length);

  const freqMedia = presencasUltimos8.length
    ? presencasUltimos8.reduce((a, b) => a + b, 0) / presencasUltimos8.length
    : 0;

  // Tendência: 4 mais novos vs 4 anteriores
  const recentes = presencasUltimos8.slice(0, 4);
  const anteriores = presencasUltimos8.slice(4, 8);
  const mediaRec = recentes.length ? recentes.reduce((a, b) => a + b, 0) / recentes.length : 0;
  const mediaAnt = anteriores.length ? anteriores.reduce((a, b) => a + b, 0) / anteriores.length : 0;
  let tendencia = 'estavel';
  if (anteriores.length >= 2) {
    if (mediaRec > mediaAnt * 1.15) tendencia = 'subindo';
    else if (mediaRec < mediaAnt * 0.85) tendencia = 'caindo';
  }

  // Regularidade: encontros nos últimos 90 dias / esperados
  const recDias = RECORRENCIA_DIAS[grupo.recorrencia || 'semanal'] || 7;
  const limite90 = new Date(Date.now() - 90 * 86400000);
  const realizados90 = encontrosRaw.filter(e => new Date(e.data + 'T12:00:00') >= limite90).length;
  const esperados90 = Math.floor(90 / recDias);
  const regularidade = esperados90 > 0 ? Math.min(100, Math.round((realizados90 / esperados90) * 100)) : 0;

  // Taxa de presença (% dos membros atuais)
  const taxaPresenca = totalMembrosAtuais > 0
    ? Math.min(100, Math.round((freqMedia / totalMembrosAtuais) * 100))
    : 0;

  // Score de saúde composto
  const tendBonus = tendencia === 'subindo' ? 100 : tendencia === 'caindo' ? 30 : 70;
  const score = Math.round(0.4 * regularidade + 0.4 * taxaPresenca + 0.2 * tendBonus);

  return {
    freq_media: Math.round(freqMedia * 10) / 10,
    taxa_presenca: taxaPresenca,
    regularidade,
    realizados_90d: realizados90,
    esperados_90d: esperados90,
    tendencia,
    score_saude: score,
    em_risco: score < 50,
    presencas_ultimos: presencasUltimos8.reverse(), // mais antigo primeiro pra gráfico
    datas_ultimos: ultimos8.slice().reverse().map(e => e.data),
  };
}

// GET /api/grupos/:id/metricas — saúde do grupo individual
router.get('/:id/metricas', async (req, res) => {
  try {
    const id = req.params.id;
    const [grupoRes, encontrosRes, partRes] = await Promise.all([
      supabase.from('mem_grupos').select('id, nome, recorrencia, ativo').eq('id', id).single(),
      supabase.from('mem_grupo_encontros').select('id, data').is('deleted_at', null).eq('grupo_id', id).order('data', { ascending: false }).limit(20),
      supabase.from('mem_grupo_membros').select('membro_id', { count: 'exact', head: true }).is('deleted_at', null).eq('grupo_id', id).is('saiu_em', null),
    ]);
    if (grupoRes.error) throw grupoRes.error;

    const encontrosRaw = encontrosRes.data || [];
    let presencasPorEncontro = {};
    if (encontrosRaw.length) {
      const { data: presencas } = await supabase.from('mem_grupo_encontro_presencas')
        .select('encontro_id, membro_id')
        .in('encontro_id', encontrosRaw.map(e => e.id));
      (presencas || []).forEach(p => {
        if (!presencasPorEncontro[p.encontro_id]) presencasPorEncontro[p.encontro_id] = [];
        presencasPorEncontro[p.encontro_id].push(p.membro_id);
      });
    }

    const totalMembros = partRes.count || 0;
    const metricas = calcularMetricasGrupo(grupoRes.data, encontrosRaw, presencasPorEncontro, totalMembros);
    res.json({ ...metricas, total_membros: totalMembros, total_encontros: encontrosRaw.length });
  } catch (e) { console.error('[Grupos metricas]', e.message); res.status(500).json({ error: 'Erro ao calcular metricas' }); }
});

// GET /api/grupos/saude — agregado: total ativos, em risco, ranking
router.get('/saude/agregado', async (req, res) => {
  try {
    const { temporada } = req.query;
    let q = supabase.from('mem_grupos')
      .select('id, nome, recorrencia, lider_id')
      .is('deleted_at', null)
      .eq('ativo', true);
    if (temporada) q = q.eq('temporada', temporada);
    const { data: grupos } = await q;

    if (!grupos?.length) return res.json({ total: 0, em_risco: 0, saudaveis: 0, grupos: [] });

    const grupoIds = grupos.map(g => g.id);
    const [encRes, partRes, lidRes] = await Promise.all([
      supabase.from('mem_grupo_encontros').select('id, grupo_id, data').is('deleted_at', null).in('grupo_id', grupoIds).order('data', { ascending: false }),
      supabase.from('mem_grupo_membros').select('grupo_id, membro_id').is('deleted_at', null).in('grupo_id', grupoIds).is('saiu_em', null),
      supabase.from('mem_membros').select('id, nome').is('deleted_at', null).in('id', grupos.map(g => g.lider_id).filter(Boolean)),
    ]);

    const lideresMap = {};
    (lidRes.data || []).forEach(l => { lideresMap[l.id] = l.nome; });

    // Encontros agrupados por grupo
    const encontrosPorGrupo = {};
    (encRes.data || []).forEach(e => {
      if (!encontrosPorGrupo[e.grupo_id]) encontrosPorGrupo[e.grupo_id] = [];
      encontrosPorGrupo[e.grupo_id].push(e);
    });

    // Membros ativos por grupo
    const membrosPorGrupo = {};
    (partRes.data || []).forEach(p => {
      membrosPorGrupo[p.grupo_id] = (membrosPorGrupo[p.grupo_id] || 0) + 1;
    });

    // Presenças em batch
    const todosEncontroIds = (encRes.data || []).map(e => e.id);
    let presencasPorEncontro = {};
    if (todosEncontroIds.length) {
      const { data: presencas } = await supabase.from('mem_grupo_encontro_presencas')
        .select('encontro_id, membro_id')
        .in('encontro_id', todosEncontroIds);
      (presencas || []).forEach(p => {
        if (!presencasPorEncontro[p.encontro_id]) presencasPorEncontro[p.encontro_id] = [];
        presencasPorEncontro[p.encontro_id].push(p.membro_id);
      });
    }

    const ranking = grupos.map(g => {
      const m = calcularMetricasGrupo(
        g,
        encontrosPorGrupo[g.id] || [],
        presencasPorEncontro,
        membrosPorGrupo[g.id] || 0,
      );
      return {
        id: g.id,
        nome: g.nome,
        lider_nome: lideresMap[g.lider_id] || null,
        score_saude: m.score_saude,
        em_risco: m.em_risco,
        tendencia: m.tendencia,
        regularidade: m.regularidade,
        taxa_presenca: m.taxa_presenca,
        total_membros: membrosPorGrupo[g.id] || 0,
      };
    }).sort((a, b) => b.score_saude - a.score_saude);

    const emRisco = ranking.filter(r => r.em_risco).length;
    res.json({
      total: grupos.length,
      em_risco: emRisco,
      saudaveis: grupos.length - emRisco,
      grupos: ranking,
    });
  } catch (e) { console.error('[Grupos saude agregado]', e.message); res.status(500).json({ error: 'Erro ao calcular saúde agregada' }); }
});

// GET /api/grupos/kpis/relatorio — relatório agregado de KPIs do módulo Grupos
// (aba Relatórios). Agrega tudo numa RPC para evitar o cap de 1000 linhas do
// PostgREST sobre encontros/presencas. Query: temporada (uuid), meses (1-60).
// Retorna: total_grupos, total_lideres, lideres_treinamento, satisfacao_lideres,
//          frequência { media_por_encontro, série mensal } e funções (distribuição).
router.get('/kpis/relatorio', async (req, res) => {
  try {
    const { temporada } = req.query;
    const meses = Math.min(Math.max(parseInt(req.query.meses, 10) || 12, 1), 60);
    const { data, error } = await supabase.rpc('fn_grupos_kpis_relatorio', {
      p_temporada: temporada || null,
      p_meses: meses,
    });
    if (error) throw error;
    res.json(data || {});
  } catch (e) {
    console.error('[Grupos relatorio kpis]', e.message);
    res.status(500).json({ error: 'Erro ao gerar relatório de KPIs' });
  }
});

// GET /api/grupos/kpis/sem-relato · grupos ativos com o último encontro
// registrado (qualquer via: sistema ou WhatsApp aplicado) e há quantos dias.
// Alimenta o bloco "Grupos sem relatório" da aba Relatórios (visão do Pr.
// Nélio: quem não está reportando).
router.get('/kpis/sem-relato', async (req, res) => {
  try {
    const { data: grupos, error } = await supabase
      .from('mem_grupos')
      .select('id, nome, bairro, dia_semana, lider_id')
      .eq('ativo', true).is('deleted_at', null)
      .order('nome');
    if (error) throw error;

    // Último encontro por grupo · janela de 1 ano, paginado (cap do PostgREST)
    const desde = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const ultimo = {};
    let offset = 0;
    while (true) {
      const { data: page, error: eE } = await supabase
        .from('mem_grupo_encontros')
        .select('grupo_id, data')
        .gte('data', desde)
        .order('data', { ascending: false })
        .range(offset, offset + 999);
      if (eE) throw eE;
      (page || []).forEach(e => { if (!ultimo[e.grupo_id]) ultimo[e.grupo_id] = e.data; });
      if (!page || page.length < 1000) break;
      offset += 1000;
    }

    const liderIds = [...new Set((grupos || []).map(g => g.lider_id).filter(Boolean))];
    const nomes = {};
    for (let i = 0; i < liderIds.length; i += 400) {
      const { data: ms } = await supabase
        .from('mem_membros').select('id, nome').in('id', liderIds.slice(i, i + 400));
      (ms || []).forEach(m => { nomes[m.id] = m.nome; });
    }

    const agora = Date.now();
    const lista = (grupos || []).map(g => {
      const ult = ultimo[g.id] || null;
      const dias = ult ? Math.floor((agora - new Date(ult + 'T12:00:00').getTime()) / 86400000) : null;
      return {
        id: g.id, nome: g.nome, bairro: g.bairro, dia_semana: g.dia_semana,
        lider_nome: nomes[g.lider_id] || null,
        ultimo_encontro: ult,
        dias_sem_relato: dias, // null = nenhum encontro registrado no último ano
      };
    }).sort((a, b) => (b.dias_sem_relato ?? 99999) - (a.dias_sem_relato ?? 99999));

    res.json({
      total: lista.length,
      sem_relato_4s: lista.filter(g => g.dias_sem_relato === null || g.dias_sem_relato >= 28).length,
      grupos: lista,
    });
  } catch (e) {
    console.error('[grupos] kpis/sem-relato:', e.message);
    res.status(500).json({ error: 'Erro ao carregar relatos' });
  }
});

// GET /api/grupos/kpis/lideres-treinamento — lista os líderes em treinamento
// (funcao='lider_treinamento') dos grupos ativos, com nome e grupo. Volume
// pequeno (poucos por vez); alimenta o detalhamento da aba Relatórios.
router.get('/kpis/lideres-treinamento', async (req, res) => {
  try {
    const { temporada } = req.query;
    let gq = supabase.from('mem_grupos').select('id, nome').is('deleted_at', null).eq('ativo', true);
    if (temporada) gq = gq.eq('temporada', temporada);
    const { data: grupos, error: gErr } = await gq;
    if (gErr) throw gErr;
    const grupoIds = (grupos || []).map(g => g.id);
    if (!grupoIds.length) return res.json([]);
    const nomeGrupo = Object.fromEntries((grupos || []).map(g => [g.id, g.nome]));

    const { data: membros, error } = await supabase.from('mem_grupo_membros')
      .select('id, membro_id, grupo_id, entrou_em, mem_membros(nome, foto_url)')
      .eq('funcao', 'lider_treinamento')
      .is('saiu_em', null)
      .is('deleted_at', null)
      .in('grupo_id', grupoIds);
    if (error) throw error;

    const list = (membros || []).map(m => ({
      participacao_id: m.id,
      membro_id: m.membro_id,
      nome: m.mem_membros?.nome || '—',
      foto_url: m.mem_membros?.foto_url || null,
      grupo_id: m.grupo_id,
      grupo_nome: nomeGrupo[m.grupo_id] || '—',
      desde: m.entrou_em,
    })).sort((a, b) => (a.grupo_nome || '').localeCompare(b.grupo_nome || ''));
    res.json(list);
  } catch (e) {
    console.error('[Grupos lideres-treinamento]', e.message);
    res.status(500).json({ error: 'Erro ao listar líderes em treinamento' });
  }
});

// ══════════════════════════════════════════════
// BUSCA E PEDIDOS DE INSCRIÇÃO (rotas especificas antes de /:id)
// ══════════════════════════════════════════════

// Distancia entre dois pontos em km (Haversine)
function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// GET /api/grupos/buscar — busca com filtros para o seletor
// Query: lider_nome, categoria, bairro, cep, raio_km, temporada, status_temporada
// Retorna grupos ATIVOS da temporada filtrada com info do líder
router.get('/buscar', async (req, res) => {
  try {
    const { lider_nome, categoria, bairro, cep, raio_km, temporada, status_temporada, q } = req.query;

    let query = supabase.from('mem_grupos').select('*').is('deleted_at', null).eq('ativo', true);
    if (categoria) query = query.eq('categoria', categoria);
    if (bairro) query = query.eq('bairro', bairro);
    if (temporada) query = query.eq('temporada', temporada);
    if (status_temporada) query = query.eq('status_temporada', status_temporada);
    query = query.order('nome');

    const { data: grupos, error } = await query;
    if (error) throw error;

    // Enriquecer com líder
    const liderIds = [...new Set((grupos || []).map(g => g.lider_id).filter(Boolean))];
    let lideresMap = {};
    if (liderIds.length > 0) {
      const { data: lideres } = await supabase.from('mem_membros').select('id, nome, foto_url').is('deleted_at', null).in('id', liderIds);
      (lideres || []).forEach(l => { lideresMap[l.id] = l; });
    }

    let resultado = (grupos || []).map(g => ({
      ...g,
      lider_nome: lideresMap[g.lider_id]?.nome || null,
      lider_foto: lideresMap[g.lider_id]?.foto_url || null,
    }));

    // Filtro client-side por nome do líder (texto livre)
    if (lider_nome) {
      const term = String(lider_nome).toLowerCase();
      resultado = resultado.filter(g => g.lider_nome?.toLowerCase().includes(term));
    }

    // Busca textual livre
    if (q) {
      const term = String(q).toLowerCase();
      resultado = resultado.filter(g =>
        g.nome?.toLowerCase().includes(term)
        || g.lider_nome?.toLowerCase().includes(term)
        || g.bairro?.toLowerCase().includes(term)
        || g.local?.toLowerCase().includes(term)
        || g.tema?.toLowerCase().includes(term)
        || g.codigo?.toLowerCase().includes(term)
      );
    }

    // Filtro por raio a partir do CEP
    if (cep && raio_km) {
      const cepLimpo = String(cep).replace(/\D/g, '');
      if (cepLimpo.length === 8) {
        try {
          // Geocode do CEP via ViaCEP + Nominatim (mesma lógica de membresia)
          const viaCepRes = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
          const viaCep = await viaCepRes.json();
          if (!viaCep.erro) {
            const qStr = encodeURIComponent(`${viaCep.logradouro || ''} ${viaCep.localidade} ${viaCep.uf} Brasil`.trim());
            const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?q=${qStr}&format=json&limit=1`, {
              headers: { 'User-Agent': 'CBRio-Sistema/1.0 (contato@cbrio.com.br)' },
            });
            const nom = await nomRes.json();
            const cepLat = nom?.[0] ? parseFloat(nom[0].lat) : null;
            const cepLng = nom?.[0] ? parseFloat(nom[0].lon) : null;
            const raio = parseFloat(raio_km) || 20;
            if (cepLat != null && cepLng != null) {
              resultado = resultado
                .filter(g => g.lat != null && g.lng != null)
                .map(g => ({ ...g, dist_km: distanciaKm(cepLat, cepLng, Number(g.lat), Number(g.lng)) }))
                .filter(g => g.dist_km <= raio)
                .sort((a, b) => a.dist_km - b.dist_km);
            }
          }
        } catch (geoErr) {
          console.warn('[Grupos buscar] geocode falhou:', geoErr.message);
        }
      }
    }

    res.json(resultado);
  } catch (e) { console.error('[Grupos buscar]', e.message); res.status(500).json({ error: 'Erro ao buscar grupos' }); }
});

// GET /api/grupos/lideres/buscar — autocomplete de líderes com seus grupos
// Query: q (texto), temporada
router.get('/lideres/buscar', async (req, res) => {
  try {
    const { q, temporada } = req.query;
    const term = String(q || '').trim().toLowerCase();
    if (term.length < 2) return res.json([]);

    let query = supabase.from('mem_grupos').select('lider_id').eq('ativo', true).not('lider_id', 'is', null);
    if (temporada) query = query.eq('temporada', temporada);
    const { data: grupos } = await query;
    const liderIds = [...new Set((grupos || []).map(g => g.lider_id))];
    if (!liderIds.length) return res.json([]);

    const { data: lideres } = await supabase
      .from('mem_membros')
      .select('id, nome, foto_url')
      .in('id', liderIds)
      .ilike('nome', `%${term}%`)
      .order('nome')
      .limit(20);

    res.json(lideres || []);
  } catch (e) { console.error('[Grupos lideres]', e.message); res.status(500).json({ error: 'Erro ao buscar líderes' }); }
});

// GET /api/grupos/lideres/:liderId/grupos — grupos liderados por um membro
router.get('/lideres/:liderId/grupos', async (req, res) => {
  try {
    const { temporada } = req.query;
    let query = supabase.from('mem_grupos').select('*').eq('lider_id', req.params.liderId).eq('ativo', true);
    if (temporada) query = query.eq('temporada', temporada);
    query = query.order('nome');
    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { console.error('[Grupos lideres/grupos]', e.message); res.status(500).json({ error: 'Erro ao buscar grupos do líder' }); }
});

// ── PEDIDOS DE INSCRIÇÃO ──

// POST /api/grupos/:id/pedidos — pessoa (logada como staff/totem) cria pedido em nome de um membro
// Body: { membro_id?, cadastro_pendente_id?, nome, email?, telefone?, origem?, observação? }
router.post('/:id/pedidos', async (req, res) => {
  try {
    const grupoId = req.params.id;
    const b = req.body || {};
    if (!b.membro_id && !b.cadastro_pendente_id) {
      return res.status(400).json({ error: 'membro_id ou cadastro_pendente_id obrigatório' });
    }
    if (!b.nome) return res.status(400).json({ error: 'nome obrigatorio' });

    // Verifica se já não existe pedido pendente
    if (b.membro_id) {
      const { data: ja } = await supabase.from('mem_grupo_pedidos')
        .select('id').eq('grupo_id', grupoId).eq('membro_id', b.membro_id).eq('status', 'pendente').maybeSingle();
      if (ja) return res.status(409).json({ error: 'Já existe pedido pendente desse membro pra esse grupo' });
      // E se já for membro ativo
      const { data: jaMembro } = await supabase.from('mem_grupo_membros')
        .select('id').eq('grupo_id', grupoId).eq('membro_id', b.membro_id).is('saiu_em', null).maybeSingle();
      if (jaMembro) return res.status(409).json({ error: 'Já e membro ativo desse grupo' });
    }

    const { data, error } = await supabase.from('mem_grupo_pedidos').insert({
      grupo_id: grupoId,
      membro_id: b.membro_id || null,
      cadastro_pendente_id: b.cadastro_pendente_id || null,
      nome: b.nome,
      email: b.email || null,
      telefone: b.telefone || null,
      origem: b.origem || 'cadastro_interno',
      observacao: b.observacao || null,
      status: 'pendente',
    }).select().single();
    if (error) throw error;

    // Notificar líder (em background) + admins via fallback
    (async () => {
      try {
        const { data: grupo } = await supabase.from('mem_grupos').select('nome, lider_id').eq('id', grupoId).single();
        if (!grupo) return;
        let liderAuthUserId = null;
        if (grupo.lider_id) {
          const { data: liderProf } = await supabase.from('vol_profiles')
            .select('auth_user_id').eq('membresia_id', grupo.lider_id).maybeSingle();
          liderAuthUserId = liderProf?.auth_user_id || null;
        }
        await notificar({
          modulo: 'grupos',
          tipo: 'pedido_grupo',
          titulo: `Novo pedido para ${grupo.nome}`,
          mensagem: `${b.nome} pediu para entrar no grupo ${grupo.nome}.`,
          link: '/grupos',
          severidade: 'aviso',
          chaveDedup: `pedido_grupo_${data.id}`,
          extraTargetIds: liderAuthUserId ? [liderAuthUserId] : [],
        });
      } catch (notifErr) { console.error('[Pedidos notify]', notifErr.message); }
    })();

    res.json(data);
  } catch (e) { console.error('[Pedidos create]', e.message); res.status(500).json({ error: 'Erro ao criar pedido' }); }
});

// GET /api/grupos/pedidos/list — lista pedidos (opcional: status, grupo_id, mine=true)
router.get('/pedidos/list', async (req, res) => {
  try {
    const { status, grupo_id, mine } = req.query;
    let query = supabase.from('mem_grupo_pedidos')
      .select('*, mem_grupos(id, nome, codigo, bairro, lider_id, mem_membros!lider_id(id, nome))')
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (grupo_id) query = query.eq('grupo_id', grupo_id);

    // mine=true filtra por grupos onde o user logado e o líder
    if (mine === 'true') {
      // Resolve mem_membros.id do user via vol_profiles.membresia_id ou email match
      const { data: prof } = await supabase
        .from('vol_profiles')
        .select('membresia_id')
        .eq('auth_user_id', req.user.userId)
        .maybeSingle();
      const minhaMembresiaId = prof?.membresia_id;
      if (!minhaMembresiaId) return res.json([]);
      const { data: meusGrupos } = await supabase.from('mem_grupos').select('id').eq('lider_id', minhaMembresiaId);
      const ids = (meusGrupos || []).map(g => g.id);
      if (!ids.length) return res.json([]);
      query = query.in('grupo_id', ids);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (e) { console.error('[Pedidos list]', e.message); res.status(500).json({ error: 'Erro ao listar pedidos' }); }
});

// GET /api/grupos/pedidos/count — contador de pedidos pendentes do user logado
// (grupos que ele lidera). Usado por badge na sidebar / aba Pedidos.
router.get('/pedidos/count', async (req, res) => {
  try {
    const { data: prof } = await supabase
      .from('vol_profiles').select('membresia_id').eq('auth_user_id', req.user.userId).maybeSingle();
    const minhaMembresiaId = prof?.membresia_id;
    if (!minhaMembresiaId) return res.json({ pendentes: 0, mine: 0, total: 0 });

    const { data: meusGrupos } = await supabase.from('mem_grupos').select('id').eq('lider_id', minhaMembresiaId);
    const ids = (meusGrupos || []).map(g => g.id);

    const isAdmin = ['admin', 'diretor'].includes(req.user.role);
    let mine = 0;
    if (ids.length) {
      const { count } = await supabase.from('mem_grupo_pedidos')
        .select('id', { count: 'exact', head: true }).eq('status', 'pendente').in('grupo_id', ids);
      mine = count || 0;
    }
    let total = mine;
    if (isAdmin) {
      const { count } = await supabase.from('mem_grupo_pedidos')
        .select('id', { count: 'exact', head: true }).eq('status', 'pendente');
      total = count || 0;
    }
    res.json({ pendentes: isAdmin ? total : mine, mine, total });
  } catch (e) {
    console.error('[Pedidos count]', e.message);
    res.status(500).json({ error: 'Erro ao contar pedidos' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/grupos/meu — grupos do MEMBRO logado (app do membro).
// Resolve o mem_membros do usuário (profiles.membro_id → fallback email),
// devolve onde ele participa e/ou lidera (com endereço, dia/horário, líder e
// nº de membros) + os pedidos pendentes que ELE fez. Leitura · sem nível.
// ─────────────────────────────────────────────────────────────
async function resolverMembroLogado(req) {
  const u = req.user;
  if (!u) return null;
  if (u.membro_id) {
    const { data: m } = await supabase.from('mem_membros')
      .select('id, nome, foto_url').eq('id', u.membro_id).maybeSingle();
    if (m) return m;
  }
  if (u.email) {
    const { data: m } = await supabase.from('mem_membros')
      .select('id, nome, foto_url').ilike('email', u.email).eq('active', true).maybeSingle();
    if (m) {
      await supabase.from('profiles').update({ membro_id: m.id }).eq('id', u.id);
      return m;
    }
  }
  return null;
}

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

router.get('/meu', async (req, res) => {
  try {
    const membro = await resolverMembroLogado(req);
    if (!membro) return res.json({ membro_id: null, grupos: [], pedidos_pendentes: [] });

    // Participações ativas + grupos que lidera
    const [{ data: parts }, { data: liderados }] = await Promise.all([
      supabase.from('mem_grupo_membros')
        .select('grupo_id, funcao, entrou_em')
        .eq('membro_id', membro.id).is('saiu_em', null).is('deleted_at', null),
      supabase.from('mem_grupos')
        .select('id').eq('lider_id', membro.id).eq('ativo', true).is('deleted_at', null),
    ]);

    const papelPorGrupo = {};
    (parts || []).forEach(p => { papelPorGrupo[p.grupo_id] = { papel: 'membro', funcao: p.funcao, entrou_em: p.entrou_em }; });
    (liderados || []).forEach(g => { papelPorGrupo[g.id] = { ...(papelPorGrupo[g.id] || {}), papel: 'lider' }; });

    const grupoIds = Object.keys(papelPorGrupo);
    let grupos = [];
    if (grupoIds.length) {
      const { data: gs } = await supabase.from('mem_grupos')
        .select('id, codigo, nome, categoria, dia_semana, horario, recorrencia, local, complemento, endereco, bairro, lat, lng, foto_url, descricao, tema, lider_id, status_temporada, temporada')
        .in('id', grupoIds).is('deleted_at', null);

      const liderIds = [...new Set((gs || []).map(g => g.lider_id).filter(Boolean))];
      let lideres = {};
      if (liderIds.length) {
        const { data: ls } = await supabase.from('mem_membros')
          .select('id, nome, telefone, foto_url').in('id', liderIds);
        (ls || []).forEach(l => { lideres[l.id] = l; });
      }

      // Contagem de membros ativos por grupo
      const contagem = {};
      await Promise.all(grupoIds.map(async (gid) => {
        const { count } = await supabase.from('mem_grupo_membros')
          .select('id', { count: 'exact', head: true })
          .eq('grupo_id', gid).is('saiu_em', null).is('deleted_at', null);
        contagem[gid] = count || 0;
      }));

      grupos = (gs || []).map(g => {
        const meta = papelPorGrupo[g.id] || {};
        const lider = lideres[g.lider_id] || null;
        const ondePartes = [g.local, g.complemento, g.bairro].filter(Boolean);
        return {
          ...g,
          papel: meta.papel || 'membro',
          funcao: meta.funcao || null,
          entrou_em: meta.entrou_em || null,
          dia_semana_label: g.dia_semana != null ? DIAS_SEMANA[g.dia_semana] : null,
          horario_label: g.horario ? String(g.horario).slice(0, 5) : null,
          endereco_resumo: ondePartes.length ? ondePartes.join(' — ') : null,
          total_membros: contagem[g.id] || 0,
          lider: lider ? { id: lider.id, nome: lider.nome, telefone: lider.telefone, foto_url: lider.foto_url } : null,
        };
      });
    }

    // Pedidos pendentes que o próprio membro fez
    const { data: pend } = await supabase.from('mem_grupo_pedidos')
      .select('id, grupo_id, status, created_at, mem_grupos(nome, codigo)')
      .eq('membro_id', membro.id).eq('status', 'pendente').is('deleted_at', null)
      .order('created_at', { ascending: false });
    const pedidos_pendentes = (pend || []).map(p => ({
      id: p.id, grupo_id: p.grupo_id, status: p.status, created_at: p.created_at,
      grupo_nome: p.mem_grupos?.nome || null, grupo_codigo: p.mem_grupos?.codigo || null,
    }));

    res.json({ membro_id: membro.id, grupos, pedidos_pendentes });
  } catch (e) {
    console.error('[Grupos meu]', e.message);
    res.status(500).json({ error: 'Erro ao carregar meus grupos' });
  }
});

// GET /api/grupos/:id/historico-membros — lista de entradas/saidas do grupo
// com origem e destino (para mostrar transferencias).
router.get('/:id/historico-membros', async (req, res) => {
  try {
    const grupoId = req.params.id;
    // Todas as participacoes do grupo (ativas + encerradas)
    const { data: participacoes, error } = await supabase
      .from('mem_grupo_membros')
      .select('id, membro_id, entrou_em, saiu_em, motivo_saida, mem_membros(id, nome, foto_url)')
      .eq('grupo_id', grupoId)
      .order('entrou_em', { ascending: false });
    if (error) throw error;

    // Para cada saída, tentar identificar o "destino" (próximo grupo do membro)
    const saidas = (participacoes || []).filter(p => p.saiu_em);
    const membroIds = [...new Set(saidas.map(p => p.membro_id))];
    let destinosMap = {};
    if (membroIds.length) {
      const { data: outros } = await supabase
        .from('mem_grupo_membros')
        .select('membro_id, grupo_id, entrou_em, mem_grupos(id, nome, codigo)')
        .in('membro_id', membroIds)
        .neq('grupo_id', grupoId)
        .order('entrou_em', { ascending: true });
      // Para cada saída, encontra a primeira entrada subsequente em outro grupo
      for (const s of saidas) {
        const candidatos = (outros || []).filter(o =>
          o.membro_id === s.membro_id && o.entrou_em >= s.saiu_em
        );
        if (candidatos.length > 0) destinosMap[s.id] = candidatos[0];
      }
    }

    res.json((participacoes || []).map(p => ({
      ...p,
      destino: destinosMap[p.id] || null,
    })));
  } catch (e) {
    console.error('[Historico membros]', e.message);
    res.status(500).json({ error: 'Erro ao buscar histórico' });
  }
});

// POST /api/grupos/pedidos/:pedidoId/aprovar
router.post('/pedidos/:pedidoId/aprovar', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const { data: pedido, error: ePedido } = await supabase.from('mem_grupo_pedidos')
      .select('*').eq('id', req.params.pedidoId).single();
    if (ePedido) throw ePedido;
    if (pedido.status !== 'pendente') {
      return res.status(409).json({ error: `Pedido já foi ${pedido.status}` });
    }

    let membroId = pedido.membro_id;

    // Se o pedido veio do formulário público (cadastro pendente), promove a membro
    if (!membroId && pedido.cadastro_pendente_id) {
      const { data: cad } = await supabase.from('mem_cadastros_pendentes')
        .select('*').eq('id', pedido.cadastro_pendente_id).single();
      if (cad) {
        const { data: novoMembro, error: eMembro } = await supabase.from('mem_membros').insert({
          nome: cad.nome,
          email: cad.email,
          telefone: cad.telefone,
          data_nascimento: cad.data_nascimento || null,
          status: 'visitante',
          active: true,
        }).select().single();
        if (eMembro) throw eMembro;
        membroId = novoMembro.id;
        // Marca cadastro como aprovado
        await supabase.from('mem_cadastros_pendentes')
          .update({ status: 'aprovado' }).eq('id', pedido.cadastro_pendente_id);
      }
    }

    if (!membroId) {
      return res.status(400).json({ error: 'Pedido sem membro nem cadastro pendente valido' });
    }

    // Fecha participação anterior do membro
    await supabase.from('mem_grupo_membros')
      .update({ saiu_em: new Date().toISOString().slice(0, 10), motivo_saida: 'Trocou de grupo via aprovação' })
      .eq('membro_id', membroId).is('saiu_em', null);

    // Cria nova participação
    await supabase.from('mem_grupo_membros').insert({
      grupo_id: pedido.grupo_id, membro_id: membroId,
      entrou_em: new Date().toISOString().slice(0, 10),
    });

    // Atualiza pedido
    await supabase.from('mem_grupo_pedidos').update({
      status: 'aprovado',
      decidido_por: req.user.userId,
      decidido_por_nome: req.user.name,
      decidido_em: new Date().toISOString(),
      membro_id: membroId,
    }).eq('id', pedido.id);

    // Fluxo de boas-vindas: notifica a pessoa (rica) e o líder (novo membro)
    (async () => {
      try {
        const { data: grupo } = await supabase.from('mem_grupos')
          .select('id, nome, codigo, dia_semana, horario, local, complemento, bairro, lider_id')
          .eq('id', pedido.grupo_id).single();
        if (!grupo) return;
        let liderNome = null;
        let liderTelefone = null;
        let liderAuthUserId = null;
        if (grupo.lider_id) {
          const { data: lider } = await supabase.from('mem_membros')
            .select('nome, telefone').eq('id', grupo.lider_id).maybeSingle();
          liderNome = lider?.nome || null;
          liderTelefone = lider?.telefone || null;
          const { data: liderProf } = await supabase.from('vol_profiles')
            .select('auth_user_id').eq('membresia_id', grupo.lider_id).maybeSingle();
          liderAuthUserId = liderProf?.auth_user_id || null;
        }

        const DIAS = ['Domingo','Segunda','Terca','Quarta','Quinta','Sexta','Sabado'];
        const quando = grupo.dia_semana != null
          ? `${DIAS[grupo.dia_semana]}${grupo.horario ? ` as ${String(grupo.horario).slice(0,5)}` : ''}`
          : null;
        const ondePartes = [grupo.local, grupo.complemento, grupo.bairro].filter(Boolean);
        const onde = ondePartes.length ? ondePartes.join(' — ') : null;

        const partesPessoa = [];
        partesPessoa.push(`Você foi aprovado(a) no grupo ${grupo.nome}.`);
        if (quando) partesPessoa.push(`Encontros ${quando}.`);
        if (onde) partesPessoa.push(`Local: ${onde}.`);
        if (liderNome) {
          partesPessoa.push(`Lider: ${liderNome}${liderTelefone ? ` (${liderTelefone})` : ''}.`);
        }
        partesPessoa.push('O líder entrara em contato em breve.');
        const mensagemPessoa = partesPessoa.join(' ');

        // Notifica a pessoa (so se tiver login)
        const { data: prof } = await supabase.from('vol_profiles')
          .select('auth_user_id').eq('membresia_id', membroId).maybeSingle();
        if (prof?.auth_user_id) {
          await notificar({
            modulo: 'grupos',
            tipo: 'pedido_aprovado',
            titulo: `Bem-vindo ao grupo ${grupo.nome}!`,
            mensagem: mensagemPessoa,
            link: '/grupos',
            severidade: 'info',
            chaveDedup: `pedido_aprovado_${pedido.id}`,
            targetIds: [prof.auth_user_id],
          });
        }

        // Notifica o líder — novo membro chegando
        if (liderAuthUserId) {
          await notificar({
            modulo: 'grupos',
            tipo: 'novo_membro_grupo',
            titulo: `Novo membro em ${grupo.nome}`,
            mensagem: `${pedido.nome} entrou no grupo. Faça contato para dar as boas-vindas.`,
            link: `/grupos`,
            severidade: 'info',
            chaveDedup: `novo_membro_${pedido.id}`,
            targetIds: [liderAuthUserId],
          });
        }
      } catch (e) { console.error('[Pedido aprovar notify]', e.message); }
    })();

    res.json({ success: true });
  } catch (e) { console.error('[Pedido aprovar]', e.message); res.status(500).json({ error: 'Erro ao aprovar pedido' }); }
});

// POST /api/grupos/pedidos/:pedidoId/rejeitar — body: { motivo? }
router.post('/pedidos/:pedidoId/rejeitar', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const { motivo } = req.body || {};
    const { data: pedido } = await supabase.from('mem_grupo_pedidos')
      .select('id, status, grupo_id, membro_id, nome').eq('id', req.params.pedidoId).single();
    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (pedido.status !== 'pendente') {
      return res.status(409).json({ error: `Pedido já foi ${pedido.status}` });
    }

    await supabase.from('mem_grupo_pedidos').update({
      status: 'rejeitado',
      motivo_rejeicao: motivo || null,
      decidido_por: req.user.userId,
      decidido_por_nome: req.user.name,
      decidido_em: new Date().toISOString(),
    }).eq('id', pedido.id);

    // Notifica a pessoa
    (async () => {
      try {
        const { data: grupo } = await supabase.from('mem_grupos').select('nome').eq('id', pedido.grupo_id).single();
        if (pedido.membro_id) {
          const { data: prof } = await supabase.from('vol_profiles')
            .select('auth_user_id').eq('membresia_id', pedido.membro_id).maybeSingle();
          if (prof?.auth_user_id) {
            await notificar({
              modulo: 'grupos',
              tipo: 'pedido_rejeitado',
              titulo: `Pedido para ${grupo?.nome || 'grupo'} não foi aceito`,
              mensagem: motivo
                ? `Seu pedido foi recusado: ${motivo}. Você pode tentar outro grupo.`
                : `Seu pedido foi recusado pelo líder. Você pode tentar outro grupo.`,
              link: '/grupos',
              severidade: 'info',
              chaveDedup: `pedido_rejeitado_${pedido.id}`,
              targetIds: [prof.auth_user_id],
            });
          }
        }
      } catch (e) { console.error('[Pedido rejeitar notify]', e.message); }
    })();

    res.json({ success: true });
  } catch (e) { console.error('[Pedido rejeitar]', e.message); res.status(500).json({ error: 'Erro ao rejeitar pedido' }); }
});

// ══════════════════════════════════════════════
// CRUD do grupo (rotas com /:id por último)
// ══════════════════════════════════════════════

// GET /api/grupos/:id — detalhe com membros
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;

    // Round 1: 4 queries que so dependem do id (em paralelo)
    const [grupoRes, partRes, histRes, multRes] = await Promise.all([
      supabase.from('mem_grupos').select('*').eq('id', id).single(),
      supabase.from('mem_grupo_membros')
        .select('*, mem_membros(id, nome, telefone, email, foto_url, status, data_nascimento)')
        .eq('grupo_id', id).is('saiu_em', null).order('entrou_em'),
      supabase.from('mem_grupo_membros')
        .select('*, mem_membros(id, nome)')
        .eq('grupo_id', id).not('saiu_em', 'is', null).order('saiu_em', { ascending: false }),
      supabase.from('mem_grupos').select('id, nome, ativo')
        .eq('grupo_origem_id', id).order('nome'),
    ]);
    if (grupoRes.error) throw grupoRes.error;
    const grupo = grupoRes.data;

    // Round 2: líder e grupo de origem (so se houver — em paralelo)
    const [liderRes, origemRes] = await Promise.all([
      grupo.lider_id
        ? supabase.from('mem_membros').select('id, nome, telefone, email, foto_url').eq('id', grupo.lider_id).single()
        : Promise.resolve({ data: null }),
      grupo.grupo_origem_id
        ? supabase.from('mem_grupos').select('id, nome').eq('id', grupo.grupo_origem_id).single()
        : Promise.resolve({ data: null }),
    ]);

    const membros = (partRes.data || []).map(p => ({
      participacao_id: p.id,
      entrou_em: p.entrou_em,
      presencas: p.presencas || 0,
      is_visitante: (p.presencas || 0) < 3,
      funcao: p.funcao || 'frequentador',
      ...p.mem_membros,
    }));

    res.json({
      ...grupo,
      lider: liderRes.data,
      grupo_origem: origemRes.data,
      multiplicacoes: multRes.data || [],
      membros,
      historico: (histRes.data || []).map(h => ({
        ...h, membro_nome: h.mem_membros?.nome, mem_membros: undefined,
      })),
    });
  } catch (e) { console.error('[Grupos get]', e.message); res.status(500).json({ error: 'Erro ao buscar grupo' }); }
});

// POST /api/grupos
router.post('/', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('mem_grupos').insert({
      nome: d.nome, categoria: d.categoria || '', lider_id: d.lider_id || null,
      local: d.local || '', endereco: d.endereco || '',
      dia_semana: d.dia_semana ?? null, horario: d.horario || null,
      recorrencia: d.recorrencia || 'semanal', tema: d.tema || '',
      foto_url: d.foto_url || null, observacoes: d.observacoes || '',
      grupo_origem_id: d.grupo_origem_id || null,
      lat: d.lat ?? null, lng: d.lng ?? null, cep: d.cep || null,
      complemento: d.complemento || null,
      bairro: d.bairro || null,
      status_temporada: d.status_temporada || 'novo',
      temporada: d.temporada || null,
      codigo: d.codigo || null, // se null, trigger auto-gera
      descricao: d.descricao || '', ativo: true,
    }).select().single();
    if (error) throw error;
    syncWhatsappLideres();
    res.json(data);
  } catch (e) { console.error('[Grupos create]', e.message); res.status(500).json({ error: 'Erro ao criar grupo' }); }
});

// PUT /api/grupos/:id
router.put('/:id', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const d = req.body;
    const { data, error } = await supabase.from('mem_grupos').update({
      nome: d.nome, categoria: d.categoria || '', lider_id: d.lider_id || null,
      local: d.local || '', endereco: d.endereco || '',
      dia_semana: d.dia_semana ?? null, horario: d.horario || null,
      recorrencia: d.recorrencia || 'semanal', tema: d.tema || '',
      foto_url: d.foto_url || null, observacoes: d.observacoes || '',
      grupo_origem_id: d.grupo_origem_id || null,
      lat: d.lat ?? null, lng: d.lng ?? null, cep: d.cep || null,
      complemento: d.complemento || null,
      bairro: d.bairro || null,
      status_temporada: d.status_temporada || null,
      temporada: d.temporada || null,
      descricao: d.descricao || '', ativo: d.ativo ?? true,
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    syncWhatsappLideres();
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar grupo' }); }
});

// GET /api/grupos/temporadas — lista temporadas
router.get('/temporadas/list', async (req, res) => {
  try {
    const { data, error } = await supabase.from('mem_temporadas')
      .select('*').order('ano', { ascending: false }).order('numero', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { console.error('[Grupos temporadas]', e.message); res.status(500).json({ error: 'Erro ao buscar temporadas' }); }
});

// PATCH /api/grupos/temporadas/:id — admin/diretor altera inscricoes_abertas (e outros campos)
router.patch('/temporadas/:id', authorizeModule('grupos', 5), async (req, res) => {
  try {
    const allowed = ['inscricoes_abertas', 'ativa', 'data_inicio', 'data_fim', 'label'];
    const update = {};
    for (const k of allowed) if (k in req.body) update[k] = req.body[k];
    if (Object.keys(update).length === 0) return res.status(400).json({ error: 'Nada para atualizar' });
    const { data, error } = await supabase.from('mem_temporadas')
      .update(update).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { console.error('[Grupos temporadas patch]', e.message); res.status(500).json({ error: e.message || 'Erro ao atualizar temporada' }); }
});

// GET /api/grupos/bairros/list — lista bairros distintos com contagem
router.get('/bairros/list', async (req, res) => {
  try {
    const { temporada } = req.query;
    let q = supabase.from('mem_grupos').select('bairro').not('bairro', 'is', null);
    if (temporada) q = q.eq('temporada', temporada);
    const { data, error } = await q;
    if (error) throw error;
    const counts = {};
    (data || []).forEach(r => {
      if (r.bairro) counts[r.bairro] = (counts[r.bairro] || 0) + 1;
    });
    const list = Object.entries(counts)
      .map(([bairro, total]) => ({ bairro, total }))
      .sort((a, b) => b.total - a.total);
    res.json(list);
  } catch (e) { console.error('[Grupos bairros]', e.message); res.status(500).json({ error: 'Erro ao buscar bairros' }); }
});

// POST /api/grupos/geocode-batch — geocoda em massa os grupos sem lat/lng.
// Pula grupos online (bairro=Online) e os que já tem lat/lng.
// Para cada grupo: tenta CEP -> ViaCEP+Nominatim. Se falhar, tenta texto livre
// no Nominatim. Atualiza lat/lng quando sucesso.
// Rate-limit interno: 1.1s entre chamadas (Nominatim policy).
//
// Retorna { ok: [...], falhas: [{id, código, nome, motivo, local, bairro}] }
router.post('/geocode-batch', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const { temporada, somente_sem_coords, limit, offset } = req.body || {};
    // Limita o lote para não estourar timeout do Vercel (60s).
    // Cada grupo demora ~1.1s no Nominatim, então 30 grupos = ~33s.
    const LIMITE = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 50);
    const OFFSET = Math.max(parseInt(offset, 10) || 0, 0);

    // Conta total separadamente (sem range, sem select grande) — facilita
    // troubleshoot se a query principal falhar.
    let countQ = supabase.from('mem_grupos').select('id', { count: 'exact', head: true }).eq('ativo', true);
    if (temporada) countQ = countQ.eq('temporada', temporada);
    if (somente_sem_coords) countQ = countQ.or('lat.is.null,lng.is.null');
    const { count: totalGeral, error: errCount } = await countQ;
    if (errCount) {
      console.error('[Grupos geocode-batch] count error:', errCount);
      return res.status(500).json({ error: `Falha contar grupos: ${errCount.message || 'desconhecido'}` });
    }

    // Query principal — busca o lote
    let q = supabase.from('mem_grupos')
      .select('id, codigo, nome, local, endereco, complemento, bairro, cep, lat, lng')
      .eq('ativo', true)
      .order('codigo', { ascending: true });
    if (temporada) q = q.eq('temporada', temporada);
    if (somente_sem_coords) q = q.or('lat.is.null,lng.is.null');
    q = q.range(OFFSET, OFFSET + LIMITE - 1);
    const { data: grupos, error } = await q;
    if (error) {
      console.error('[Grupos geocode-batch] select error:', error);
      return res.status(500).json({ error: `Falha buscar grupos: ${error.message || 'desconhecido'}`, code: error.code, hint: error.hint });
    }

    const count = totalGeral ?? 0;

    const ok = [];
    const falhas = [];
    const skip = [];
    const userAgent = 'CBRio-Sistema/1.0 (contato@cbrio.com.br)';
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // Coordenadas conhecidas: Igreja CBRio (Barra da Tijuca)
    // Usa ?cbrio_lat e ?cbrio_lng se passados, senao default aproximado
    const CBRIO_COORDS = { lat: -23.0044, lng: -43.3196 };

    for (const g of grupos || []) {
      // Pula online
      if (g.bairro === 'Online' || g.local?.toLowerCase().includes('online')) {
        skip.push({ id: g.id, codigo: g.codigo, nome: g.nome, motivo: 'online' });
        continue;
      }
      // Pula se já tem coords e somente_sem_coords=true
      if (somente_sem_coords && g.lat != null && g.lng != null) {
        skip.push({ id: g.id, codigo: g.codigo, nome: g.nome, motivo: 'ja_tem_coords' });
        continue;
      }
      // Igreja CBRio: usa coords fixas
      if (g.local?.toLowerCase().includes('cbrio') || g.local?.toLowerCase().includes('igreja')) {
        await supabase.from('mem_grupos').update({ lat: CBRIO_COORDS.lat, lng: CBRIO_COORDS.lng }).eq('id', g.id);
        ok.push({ id: g.id, codigo: g.codigo, nome: g.nome, fonte: 'cbrio_fixo', lat: CBRIO_COORDS.lat, lng: CBRIO_COORDS.lng });
        continue;
      }

      let foundLat = null, foundLng = null, fonte = null;

      // Tenta via CEP se tiver
      const cepLimpo = (g.cep || '').replace(/\D/g, '');
      if (cepLimpo.length === 8) {
        try {
          const vc = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`).then(r => r.json());
          if (!vc.erro) {
            await sleep(1100);
            const qStr = encodeURIComponent(`${vc.logradouro || ''} ${vc.bairro || ''} ${vc.localidade} ${vc.uf} Brasil`.trim());
            const nom = await fetch(`https://nominatim.openstreetmap.org/search?q=${qStr}&format=json&limit=1`, { headers: { 'User-Agent': userAgent } }).then(r => r.json());
            if (nom?.[0]) {
              foundLat = parseFloat(nom[0].lat);
              foundLng = parseFloat(nom[0].lon);
              fonte = 'cep';
            }
          }
        } catch (e) { /* segue tentando */ }
      }

      // Fallback: texto livre do "local"
      if ((foundLat == null || foundLng == null) && g.local) {
        await sleep(1100);
        try {
          const qStr = encodeURIComponent(`${g.local} ${g.bairro || ''} Rio de Janeiro RJ Brasil`.trim());
          const nom = await fetch(`https://nominatim.openstreetmap.org/search?q=${qStr}&format=json&limit=1`, { headers: { 'User-Agent': userAgent } }).then(r => r.json());
          if (nom?.[0]) {
            foundLat = parseFloat(nom[0].lat);
            foundLng = parseFloat(nom[0].lon);
            fonte = 'texto_local';
          }
        } catch (e) { /* segue */ }
      }

      if (foundLat != null && foundLng != null) {
        await supabase.from('mem_grupos').update({ lat: foundLat, lng: foundLng }).eq('id', g.id);
        ok.push({ id: g.id, codigo: g.codigo, nome: g.nome, fonte, lat: foundLat, lng: foundLng });
      } else {
        falhas.push({
          id: g.id, codigo: g.codigo, nome: g.nome,
          local: g.local, bairro: g.bairro, cep: g.cep,
          motivo: cepLimpo.length === 8 ? 'cep_e_texto_falharam' : (g.local ? 'sem_cep_texto_ambiguo' : 'sem_endereco'),
        });
      }

      // Pausa final pra respeitar rate limit Nominatim
      await sleep(200);
    }

    const processadosAteAgora = OFFSET + (grupos || []).length;
    res.json({
      total_lote: (grupos || []).length,
      total_geral: count ?? 0,
      offset: OFFSET,
      proximo_offset: processadosAteAgora,
      has_more: processadosAteAgora < (count ?? 0),
      ok_count: ok.length,
      falhas_count: falhas.length,
      skip_count: skip.length,
      ok, falhas, skip,
    });
  } catch (e) {
    console.error('[Grupos geocode-batch] exception:', e);
    res.status(500).json({ error: `Erro ao geocodificar: ${e.message || 'desconhecido'}` });
  }
});

// DELETE /api/grupos/:id — soft delete
router.delete('/:id', authorizeModule('grupos', 3), async (req, res) => {
  try {
    await supabase.from('mem_grupos').update({ ativo: false }).eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao desativar grupo' }); }
});

// POST /api/grupos/:id/membros — adicionar membro
router.post('/:id/membros', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const { membro_id } = req.body;
    if (!membro_id) return res.status(400).json({ error: 'membro_id obrigatorio' });

    // Fechar participação anterior ativa do membro
    await supabase.from('mem_grupo_membros')
      .update({ saiu_em: new Date().toISOString().split('T')[0], motivo_saida: 'Transferido para outro grupo' })
      .eq('membro_id', membro_id).is('saiu_em', null);

    const { data, error } = await supabase.from('mem_grupo_membros').insert({
      grupo_id: req.params.id, membro_id, entrou_em: new Date().toISOString().split('T')[0],
    }).select().single();
    if (error) throw error;

    // Notificação imediata: novo membro no grupo
    (async () => {
      try {
        const [{ data: grupo }, { data: membro }] = await Promise.all([
          supabase.from('mem_grupos').select('nome').eq('id', req.params.id).single(),
          supabase.from('mem_membros').select('nome').eq('id', membro_id).single(),
        ]);
        if (grupo && membro) {
          await notificar({
            modulo: 'grupos',
            tipo: 'novo_membro_grupo',
            titulo: `Novo membro no grupo ${grupo.nome}`,
            mensagem: `${membro.nome} entrou no grupo ${grupo.nome}.`,
            link: '/grupos',
            severidade: 'info',
            chaveDedup: `novo_membro_${req.params.id}_${membro_id}`,
          });
        }
      } catch (notifErr) { console.error('[Grupos notify add]', notifErr.message); }
    })();

    res.json(data);
  } catch (e) { console.error('[Grupos add member]', e.message); res.status(500).json({ error: 'Erro ao adicionar membro' }); }
});

// ============================================================================
// PESSOAS · visão unificada de quem é quem nos grupos (aba Pessoas do /grupos)
//
// O papel de uma pessoa vive em 3 lugares: mem_grupo_membros.funcao
// (participação), mem_grupos.lider_id (líder responsável) e
// mem_grupos.supervisor_id (supervisor). Este endpoint agrega tudo em 1 linha
// por pessoa com o papel efetivo (o mais alto entre os 3).
// ============================================================================

// GET /api/grupos/pessoas/papeis
router.get('/pessoas/papeis', async (req, res) => {
  try {
    const { data: grupos, error: eG } = await supabase
      .from('mem_grupos')
      .select('id, nome, lider_id, supervisor_id')
      .eq('ativo', true)
      .is('deleted_at', null);
    if (eG) throw eG;
    const grupoIds = (grupos || []).map(g => g.id);
    const gMap = {};
    (grupos || []).forEach(g => { gMap[g.id] = g; });

    // Participações ativas · paginado (pode passar do cap de 1000 do PostgREST)
    let participacoes = [];
    if (grupoIds.length) {
      let offset = 0;
      const pageSize = 1000;
      while (true) {
        const { data: page, error: eP } = await supabase
          .from('mem_grupo_membros')
          .select('id, grupo_id, membro_id, funcao, presencas, entrou_em')
          .is('saiu_em', null)
          .in('grupo_id', grupoIds)
          .range(offset, offset + pageSize - 1);
        if (eP) throw eP;
        participacoes = participacoes.concat(page || []);
        if (!page || page.length < pageSize) break;
        offset += pageSize;
      }
    }

    // Pessoas = participantes ∪ líderes (lider_id) ∪ supervisores (supervisor_id)
    const pessoaIds = new Set(participacoes.map(p => p.membro_id).filter(Boolean));
    (grupos || []).forEach(g => {
      if (g.lider_id) pessoaIds.add(g.lider_id);
      if (g.supervisor_id) pessoaIds.add(g.supervisor_id);
    });

    // Dados básicos · .in() em chunks (URL tem limite de tamanho)
    const ids = [...pessoaIds];
    const membrosMap = {};
    for (let i = 0; i < ids.length; i += 400) {
      const { data: ms } = await supabase
        .from('mem_membros')
        .select('id, nome, foto_url, telefone')
        .in('id', ids.slice(i, i + 400))
        .is('deleted_at', null);
      (ms || []).forEach(m => { membrosMap[m.id] = m; });
    }

    const RANK = { coordenador: 7, supervisor: 6, lider: 5, co_lider: 4, lider_treinamento: 3, frequentador: 2, visitante: 1 };
    const pessoas = {};
    const garante = (mid) => {
      if (!pessoas[mid]) {
        const m = membrosMap[mid] || {};
        pessoas[mid] = {
          membro_id: mid,
          nome: m.nome || '—',
          foto_url: m.foto_url || null,
          telefone: m.telefone || null,
          papel: null,
          rank: 0,
          grupos: [],
          lidera: [],
          supervisiona: [],
          presencas_total: 0,
          entrou_em: null,
        };
      }
      return pessoas[mid];
    };

    for (const p of participacoes) {
      if (!p.membro_id) continue;
      const pe = garante(p.membro_id);
      pe.grupos.push({
        participacao_id: p.id,
        grupo_id: p.grupo_id,
        grupo_nome: gMap[p.grupo_id]?.nome || null,
        funcao: p.funcao,
        presencas: p.presencas || 0,
        entrou_em: p.entrou_em,
      });
      pe.presencas_total += (p.presencas || 0);
      if (!pe.entrou_em || (p.entrou_em && p.entrou_em < pe.entrou_em)) pe.entrou_em = p.entrou_em;
      const r = RANK[p.funcao] || 0;
      if (r > pe.rank) { pe.rank = r; pe.papel = p.funcao; }
    }
    for (const g of grupos || []) {
      if (g.lider_id) {
        const pe = garante(g.lider_id);
        pe.lidera.push({ id: g.id, nome: g.nome });
        if (RANK.lider > pe.rank) { pe.rank = RANK.lider; pe.papel = 'lider'; }
      }
      if (g.supervisor_id) {
        const pe = garante(g.supervisor_id);
        pe.supervisiona.push({ id: g.id, nome: g.nome });
        if (RANK.supervisor > pe.rank) { pe.rank = RANK.supervisor; pe.papel = 'supervisor'; }
      }
    }
    // Mesma régua do detalhe do grupo: frequentador com <3 presenças = visitante
    Object.values(pessoas).forEach(pe => {
      if (!pe.papel) pe.papel = 'frequentador';
      if (pe.papel === 'frequentador' && pe.presencas_total < 3) pe.papel = 'visitante';
    });

    const lista = Object.values(pessoas)
      .sort((a, b) => b.rank - a.rank || (a.nome || '').localeCompare(b.nome || ''));
    res.json({ total: lista.length, pessoas: lista });
  } catch (e) {
    console.error('[grupos] pessoas/papeis:', e.message);
    res.status(500).json({ error: 'Erro ao carregar pessoas' });
  }
});

// ============================================================================
// SUPERVISAO · funções hierarquicas + visitas + observações mensais
//
// Modelo de papéis (na pratica · descobrimos pelo membro_id do user):
//   - admin/diretor (role) → ve TUDO
//   - coordenador (existe row em mem_grupo_membros com funcao='coordenador') → ve TODOS os supervisores e grupos
//   - supervisor (mem_grupos.supervisor_id = my_membro_id) → ve apenas os grupos que supervisiona
//   - outros → 403
// ============================================================================

// Helper · resolve membro_id e papel mais alto do user logado.
// papel 'admin' cobre role admin/diretor E quem tem nível >=3 no módulo grupos
// (donos do módulo via matriz/boost de área · ex.: Pr. Nélio e Natasha), pra
// eles enxergarem/agendarem visitas em todos os grupos sem precisar de cargo
// na hierarquia (coordenador/supervisor em mem_grupo_membros).
async function getMeuPerfilGrupo(user) {
  const { userId, role } = user;
  // Pega membro vinculado ao user
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, name')
    .eq('id', userId)
    .maybeSingle();

  let meuMembroId = null;
  if (profile?.email) {
    const { data: membro } = await supabase
      .from('mem_membros')
      .select('id')
      .eq('email', profile.email)
      .maybeSingle();
    meuMembroId = membro?.id || null;
  }

  const gp = user.granular?.modulePerms?.grupos || {};
  const editaModuloGrupos = (gp.escrita ?? 0) >= 3 || (gp.leitura ?? 0) >= 3;
  if (['admin', 'diretor'].includes(role) || editaModuloGrupos) {
    return { papel: 'admin', membro_id: meuMembroId };
  }

  if (!meuMembroId) return { papel: null, membro_id: null };

  // Coordenador? Tem alguma participação ativa com funcao=coordenador
  const { data: coordRow } = await supabase
    .from('mem_grupo_membros')
    .select('id')
    .eq('membro_id', meuMembroId)
    .eq('funcao', 'coordenador')
    .is('saiu_em', null)
    .limit(1)
    .maybeSingle();
  if (coordRow) return { papel: 'coordenador', membro_id: meuMembroId };

  // Supervisor? Aparece como supervisor_id em algum grupo ativo
  const { data: supervisorRow } = await supabase
    .from('mem_grupos')
    .select('id')
    .eq('supervisor_id', meuMembroId)
    .eq('ativo', true)
    .limit(1)
    .maybeSingle();
  if (supervisorRow) return { papel: 'supervisor', membro_id: meuMembroId };

  return { papel: null, membro_id: meuMembroId };
}

// GET /api/grupos/supervisao/me · papel + grupos visíveis na hierarquia
router.get('/supervisao/me', async (req, res) => {
  try {
    const { papel, membro_id } = await getMeuPerfilGrupo(req.user);
    if (!papel) return res.status(403).json({ error: 'Você não tem papel ativo nos grupos (supervisor/coordenador/admin)' });

    let grupos = [];
    if (papel === 'admin' || papel === 'coordenador') {
      const { data } = await supabase
        .from('vw_grupos_supervisao')
        .select('*')
        .order('supervisor_nome', { ascending: true })
        .order('nome', { ascending: true });
      grupos = data || [];
    } else if (papel === 'supervisor') {
      const { data } = await supabase
        .from('vw_grupos_supervisao')
        .select('*')
        .eq('supervisor_id', membro_id)
        .order('nome', { ascending: true });
      grupos = data || [];
    }

    // Agrupa por supervisor (pra UI expansível)
    const porSupervisor = {};
    grupos.forEach(g => {
      const key = g.supervisor_id || 'sem_supervisor';
      if (!porSupervisor[key]) {
        porSupervisor[key] = {
          supervisor_id: g.supervisor_id,
          supervisor_nome: g.supervisor_nome || 'Sem supervisor',
          grupos: [],
          total_grupos: 0,
          total_visitas_mes: 0,
        };
      }
      porSupervisor[key].grupos.push(g);
      porSupervisor[key].total_grupos++;
      porSupervisor[key].total_visitas_mes += Number(g.visitas_mes_atual || 0);
    });

    res.json({
      papel,
      membro_id,
      total_grupos: grupos.length,
      supervisores: Object.values(porSupervisor),
      grupos, // também lista flat
    });
  } catch (e) {
    console.error('[grupos] supervisao/me:', e.message);
    res.status(500).json({ error: 'Erro ao carregar supervisao' });
  }
});

// Helper · anexa responsavel_nome (profiles) e supervisor_nome (mem_membros)
// a uma lista de visitas
async function enriquecerVisitas(visitas) {
  const lista = visitas || [];
  const respIds = [...new Set(lista.map(v => v.responsavel_id).filter(Boolean))];
  const supIds = [...new Set(lista.map(v => v.supervisor_id).filter(Boolean))];
  const respMap = {};
  const supMap = {};
  if (respIds.length) {
    const { data: profs } = await supabase.from('profiles').select('id, name').in('id', respIds);
    (profs || []).forEach(p => { respMap[p.id] = p.name; });
  }
  if (supIds.length) {
    const { data: sups } = await supabase.from('mem_membros').select('id, nome').in('id', supIds);
    (sups || []).forEach(s => { supMap[s.id] = s.nome; });
  }
  return lista.map(v => ({
    ...v,
    responsavel_nome: respMap[v.responsavel_id] || supMap[v.supervisor_id] || null,
    supervisor_nome: supMap[v.supervisor_id] || null,
  }));
}

// GET /api/grupos/visitas/painel · visão geral da aba Visitas do /grupos:
// todos os grupos ativos (última visita realizada + próxima agendada), as
// visitas agendadas e o histórico recente. Read-only · a escrita é autorizada
// nos POST/PATCH. `papel` null = usuário só visualiza.
router.get('/visitas/painel', async (req, res) => {
  try {
    const { papel, membro_id } = await getMeuPerfilGrupo(req.user);

    const { data: grupos, error } = await supabase
      .from('vw_grupos_supervisao')
      .select('*')
      .order('nome');
    if (error) throw error;

    const { data: agendadas } = await supabase
      .from('grupo_supervisao_visitas')
      .select('id, grupo_id, data_visita, observacao, status, responsavel_id, supervisor_id, created_at')
      .eq('status', 'agendada')
      .order('data_visita', { ascending: true })
      .limit(300);

    const { data: historico } = await supabase
      .from('grupo_supervisao_visitas')
      .select('id, grupo_id, data_visita, observacao, status, responsavel_id, supervisor_id, created_at')
      .neq('status', 'agendada')
      .order('data_visita', { ascending: false })
      .limit(60);

    const gMap = {};
    (grupos || []).forEach(g => { gMap[g.id] = g; });

    // Grupos fora da view (arquivados) que ainda têm visita listada
    const faltando = [...new Set(
      [...(agendadas || []), ...(historico || [])]
        .map(v => v.grupo_id)
        .filter(id => id && !gMap[id])
    )];
    if (faltando.length) {
      const { data: extras } = await supabase
        .from('mem_grupos').select('id, nome, bairro').in('id', faltando);
      (extras || []).forEach(g => { gMap[g.id] = g; });
    }

    const comGrupo = (lista) => (lista || []).map(v => ({
      ...v,
      grupo_nome: gMap[v.grupo_id]?.nome || null,
      grupo_bairro: gMap[v.grupo_id]?.bairro || null,
    }));

    res.json({
      papel,
      membro_id,
      grupos: grupos || [],
      agendadas: await enriquecerVisitas(comGrupo(agendadas)),
      historico: await enriquecerVisitas(comGrupo(historico)),
    });
  } catch (e) {
    console.error('[grupos] visitas/painel:', e.message);
    res.status(500).json({ error: 'Erro ao carregar painel de visitas' });
  }
});

// GET /api/grupos/:id/visitas
router.get('/:id/visitas', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('grupo_supervisao_visitas')
      .select('id, data_visita, observacao, status, supervisor_id, responsavel_id, created_at')
      .eq('grupo_id', req.params.id)
      .order('data_visita', { ascending: false });
    if (error) throw error;
    res.json(await enriquecerVisitas(data || []));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/grupos/:id/visitas · registra (status=realizada, default) ou
// AGENDA (status=agendada) uma visita ao grupo. responsavel_id = quem fará a
// visita (default: quem está criando).
router.post('/:id/visitas', async (req, res) => {
  try {
    const { data_visita, observacao, status, responsavel_id } = req.body || {};
    const { papel, membro_id } = await getMeuPerfilGrupo(req.user);
    if (!papel) return res.status(403).json({ error: 'Sem permissão' });

    // Supervisor só registra nos seus grupos
    if (papel === 'supervisor') {
      const { data: g } = await supabase
        .from('mem_grupos')
        .select('supervisor_id')
        .eq('id', req.params.id)
        .maybeSingle();
      if (!g || g.supervisor_id !== membro_id) {
        return res.status(403).json({ error: 'Você só registra visitas nos grupos que supervisiona' });
      }
    }

    const statusFinal = ['agendada', 'realizada'].includes(status) ? status : 'realizada';
    const responsavelFinal = responsavel_id || req.user.userId;

    // Descobre supervisor_id (vínculo a mem_membros) quando existir: o meu
    // membro ou o supervisor do grupo. Pode ficar null (pastor/coordenador
    // agendando em grupo sem supervisor definido).
    let supervisorIdRow = req.body?.supervisor_id || membro_id;
    if (!supervisorIdRow) {
      const { data: g } = await supabase
        .from('mem_grupos')
        .select('supervisor_id')
        .eq('id', req.params.id)
        .maybeSingle();
      supervisorIdRow = g?.supervisor_id || null;
    }

    const { data, error } = await supabase
      .from('grupo_supervisao_visitas')
      .insert({
        grupo_id: req.params.id,
        supervisor_id: supervisorIdRow,
        data_visita: data_visita || new Date().toISOString().slice(0, 10),
        observacao: observacao || null,
        status: statusFinal,
        responsavel_id: responsavelFinal,
        registrado_por: req.user.userId,
      })
      .select()
      .single();
    if (error) throw error;

    // Agendou pra outra pessoa → avisa o responsável designado
    if (statusFinal === 'agendada' && responsavelFinal && responsavelFinal !== req.user.userId) {
      try {
        const { data: gInfo } = await supabase
          .from('mem_grupos').select('nome').eq('id', req.params.id).maybeSingle();
        const dataFmt = (data.data_visita || '').split('-').reverse().join('/');
        await notificar({
          modulo: 'grupos',
          tipo: 'visita_agendada',
          titulo: `Visita agendada — ${gInfo?.nome || 'grupo'}`,
          mensagem: `Você foi designado(a) pra visitar o grupo ${gInfo?.nome || ''} em ${dataFmt}.`,
          link: '/grupos?tab=visitas',
          severidade: 'info',
          targetIds: [responsavelFinal],
          chaveDedup: `visita_agendada_${data.id}`,
        });
      } catch (nErr) { console.warn('[grupos] notificar visita agendada:', nErr.message); }
    }

    res.status(201).json(data);
  } catch (e) {
    console.error('[grupos] post visita:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/grupos/visitas/:visitaId · concluir/cancelar/reagendar uma visita
router.patch('/visitas/:visitaId', async (req, res) => {
  try {
    const { papel, membro_id } = await getMeuPerfilGrupo(req.user);
    if (!papel) return res.status(403).json({ error: 'Sem permissão' });

    const { data: visita } = await supabase
      .from('grupo_supervisao_visitas')
      .select('id, grupo_id, status')
      .eq('id', req.params.visitaId)
      .maybeSingle();
    if (!visita) return res.status(404).json({ error: 'Visita não encontrada' });

    if (papel === 'supervisor') {
      const { data: g } = await supabase
        .from('mem_grupos')
        .select('supervisor_id')
        .eq('id', visita.grupo_id)
        .maybeSingle();
      if (!g || g.supervisor_id !== membro_id) {
        return res.status(403).json({ error: 'Você só edita visitas dos grupos que supervisiona' });
      }
    }

    const body = req.body || {};
    const patch = {};
    if (body.status) {
      if (!['agendada', 'realizada', 'cancelada'].includes(body.status)) {
        return res.status(400).json({ error: 'status inválido' });
      }
      patch.status = body.status;
    }
    if (body.data_visita) patch.data_visita = body.data_visita;
    if ('observacao' in body) patch.observacao = body.observacao || null;
    if ('responsavel_id' in body) patch.responsavel_id = body.responsavel_id || null;
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada pra atualizar' });
    patch.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('grupo_supervisao_visitas')
      .update(patch)
      .eq('id', req.params.visitaId)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[grupos] patch visita:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/grupos/visitas/:visitaId
router.delete('/visitas/:visitaId', async (req, res) => {
  try {
    const { papel } = await getMeuPerfilGrupo(req.user);
    if (!['admin', 'coordenador', 'supervisor'].includes(papel)) {
      return res.status(403).json({ error: 'Sem permissão' });
    }
    const { error } = await supabase.from('grupo_supervisao_visitas').delete().eq('id', req.params.visitaId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/grupos/:id/observacoes
router.get('/:id/observacoes', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('grupo_supervisao_observacoes')
      .select('id, periodo, observacao, supervisor_id, created_at, updated_at')
      .eq('grupo_id', req.params.id)
      .order('periodo', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/grupos/:id/observacoes/:período · upsert por mês
router.put('/:id/observacoes/:periodo', async (req, res) => {
  try {
    const { observacao } = req.body || {};
    if (!observacao) return res.status(400).json({ error: 'observacao obrigatoria' });
    if (!/^\d{4}-\d{2}$/.test(req.params.periodo)) {
      return res.status(400).json({ error: 'período deve ser YYYY-MM' });
    }

    const { papel, membro_id } = await getMeuPerfilGrupo(req.user);
    if (!papel) return res.status(403).json({ error: 'Sem permissão' });

    if (papel === 'supervisor') {
      const { data: g } = await supabase
        .from('mem_grupos')
        .select('supervisor_id')
        .eq('id', req.params.id)
        .maybeSingle();
      if (!g || g.supervisor_id !== membro_id) {
        return res.status(403).json({ error: 'Você so escreve observação nos grupos que supervisiona' });
      }
    }

    let supervisorIdRow = membro_id;
    if (!supervisorIdRow) {
      const { data: g } = await supabase
        .from('mem_grupos')
        .select('supervisor_id')
        .eq('id', req.params.id)
        .maybeSingle();
      supervisorIdRow = g?.supervisor_id;
    }

    const { data, error } = await supabase
      .from('grupo_supervisao_observacoes')
      .upsert({
        grupo_id: req.params.id,
        supervisor_id: supervisorIdRow,
        periodo: req.params.periodo,
        observacao,
        registrado_por: req.user.userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'grupo_id,periodo' })
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error('[grupos] put observacao:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/grupos/:id/supervisor · admin define supervisor do grupo
router.put('/:id/supervisor', authorizeModule('grupos', 5), async (req, res) => {
  try {
    const { supervisor_id } = req.body || {};
    const { data, error } = await supabase
      .from('mem_grupos')
      .update({ supervisor_id: supervisor_id || null, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/grupos/membros/:membroRowId/funcao · trocar função de um membro
router.put('/membros/:membroRowId/funcao', async (req, res) => {
  try {
    const { funcao } = req.body || {};
    const VALIDAS = ['visitante', 'frequentador', 'lider_treinamento', 'lider', 'co_lider', 'supervisor', 'coordenador'];
    if (!VALIDAS.includes(funcao)) {
      return res.status(400).json({ error: `função deve ser uma de: ${VALIDAS.join(', ')}` });
    }
    // Autoriza quem edita grupos (mesma regra de podeEditarGrupos no front:
    // admin/diretor ou nível >=3 no módulo grupos) OU papel da hierarquia
    // (coordenador/supervisor). O módulo de permissões é a fonte canônica.
    const isAdminRole = ['admin', 'diretor'].includes(req.user.role);
    const gp = req.user.granular?.modulePerms?.grupos || {};
    const editaGrupos = isAdminRole || (gp.escrita ?? 0) >= 3 || (gp.leitura ?? 0) >= 3;
    let autorizado = editaGrupos;
    if (!autorizado) {
      const { papel } = await getMeuPerfilGrupo(req.user);
      autorizado = ['admin', 'coordenador', 'supervisor'].includes(papel);
    }
    if (!autorizado) {
      return res.status(403).json({ error: 'Sem permissão' });
    }
    const { data, error } = await supabase
      .from('mem_grupo_membros')
      .update({ funcao })
      .eq('id', req.params.membroRowId)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
