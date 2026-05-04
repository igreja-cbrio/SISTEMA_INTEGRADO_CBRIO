const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const multer = require('multer');
const { uploadModuleFile, SHAREPOINT_CONFIGURED } = require('../services/storageService');
const { notificar } = require('../services/notificar');

const uploadMw = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const sanitizePath = (s) => (s || '').replace(/[^a-zA-Z0-9\-_ ]/g, '').trim();

router.use(authenticate);

// GET /api/grupos — lista todos com contagem de membros e lider
router.get('/', async (req, res) => {
  try {
    const { ativo, categoria } = req.query;
    let q = supabase.from('mem_grupos').select('*');
    // ativo=all retorna tudo (ativos + arquivados); default e so ativos
    if (ativo === 'all') {
      // sem filtro
    } else if (ativo !== undefined) {
      q = q.eq('ativo', ativo === 'true');
    } else {
      q = q.eq('ativo', true);
    }
    if (categoria) q = q.eq('categoria', categoria);
    q = q.order('nome');
    const { data: grupos, error } = await q;
    if (error) throw error;

    // Buscar contagem de membros ativos por grupo
    const { data: participacoes } = await supabase.from('mem_grupo_membros')
      .select('grupo_id, membro_id').is('saiu_em', null);

    // Buscar dados dos lideres
    const liderIds = [...new Set((grupos || []).map(g => g.lider_id).filter(Boolean))];
    let lideresMap = {};
    if (liderIds.length > 0) {
      const { data: lideres } = await supabase.from('mem_membros').select('id, nome, foto_url').in('id', liderIds);
      (lideres || []).forEach(l => { lideresMap[l.id] = l; });
    }

    // Buscar grupo de origem
    const origemIds = [...new Set((grupos || []).map(g => g.grupo_origem_id).filter(Boolean))];
    let origensMap = {};
    if (origemIds.length > 0) {
      const { data: origens } = await supabase.from('mem_grupos').select('id, nome').in('id', origemIds);
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
router.post('/materiais', uploadMw.single('arquivo'), async (req, res) => {
  try {
    const { nome, comentario, etiquetas, grupo_ids } = req.body;
    if (!req.file) return res.status(400).json({ error: 'Arquivo nao fornecido' });
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
router.delete('/materiais/:docId', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { error } = await supabase.from('mem_grupo_documentos').delete().eq('id', req.params.docId);
    if (error) throw error;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover material' }); }
});

// ══════════════════════════════════════════════
// PARTICIPACAO (rotas especificas antes de /:id)
// ══════════════════════════════════════════════

// PATCH /api/grupos/participacao/:id/sair — remover membro
router.patch('/participacao/:id/sair', async (req, res) => {
  try {
    const { data, error } = await supabase.from('mem_grupo_membros').update({
      saiu_em: new Date().toISOString().split('T')[0],
      motivo_saida: req.body.motivo || '',
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro' }); }
});

// PATCH /api/grupos/participacao/:id/presenca — incrementar presenca atomicamente
router.patch('/participacao/:id/presenca', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('incrementar_presenca_grupo', { p_id: req.params.id });
    if (error) throw error;
    res.json(Array.isArray(data) ? data[0] : data);
  } catch (e) { console.error('[Grupos presenca]', e.message); res.status(500).json({ error: 'Erro' }); }
});

// ══════════════════════════════════════════════
// ENCONTROS (chamada / lista de presenca)
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
router.post('/:id/encontros', async (req, res) => {
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
      if (error.code === '23505') return res.status(409).json({ error: 'Ja existe encontro registrado nessa data' });
      throw error;
    }
    res.json({ id: encontroId, total_presentes: membros_presentes.length });
  } catch (e) { console.error('[Grupos encontro create]', e.message); res.status(500).json({ error: 'Erro ao registrar encontro' }); }
});

// GET /api/grupos/encontros/:encontroId — detalhe + presencas
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

// PATCH /api/grupos/encontros/:encontroId — editar encontro (tema, observacoes, data, presencas)
router.patch('/encontros/:encontroId', async (req, res) => {
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
      if (error.code === '23505') return res.status(409).json({ error: 'Ja existe encontro registrado nessa data' });
      throw error;
    }
    res.json({ success: true });
  } catch (e) { console.error('[Grupos encontro patch]', e.message); res.status(500).json({ error: 'Erro ao atualizar encontro' }); }
});

// DELETE /api/grupos/encontros/:encontroId — remove encontro (decrementa contadores)
router.delete('/encontros/:encontroId', authorize('admin', 'diretor'), async (req, res) => {
  try {
    // Buscar membros presentes para reverter contador
    const { data: presencas } = await supabase.from('mem_grupo_encontro_presencas')
      .select('membro_id, mem_grupo_encontros!inner(grupo_id)')
      .eq('encontro_id', req.params.encontroId);

    const grupoId = presencas?.[0]?.mem_grupo_encontros?.grupo_id;

    // Delete cascateia presencas; antes decrementa contador de cada membro presente
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
// METRICAS / SAUDE
// ══════════════════════════════════════════════

const RECORRENCIA_DIAS = { semanal: 7, quinzenal: 14, mensal: 30 };

function calcularMetricasGrupo(grupo, encontrosRaw, presencasPorEncontro, totalMembrosAtuais) {
  // encontrosRaw esta ordenado por data DESC
  const ultimos8 = encontrosRaw.slice(0, 8);
  const presencasUltimos8 = ultimos8.map(e => (presencasPorEncontro[e.id] || []).length);

  const freqMedia = presencasUltimos8.length
    ? presencasUltimos8.reduce((a, b) => a + b, 0) / presencasUltimos8.length
    : 0;

  // Tendencia: 4 mais novos vs 4 anteriores
  const recentes = presencasUltimos8.slice(0, 4);
  const anteriores = presencasUltimos8.slice(4, 8);
  const mediaRec = recentes.length ? recentes.reduce((a, b) => a + b, 0) / recentes.length : 0;
  const mediaAnt = anteriores.length ? anteriores.reduce((a, b) => a + b, 0) / anteriores.length : 0;
  let tendencia = 'estavel';
  if (anteriores.length >= 2) {
    if (mediaRec > mediaAnt * 1.15) tendencia = 'subindo';
    else if (mediaRec < mediaAnt * 0.85) tendencia = 'caindo';
  }

  // Regularidade: encontros nos ultimos 90 dias / esperados
  const recDias = RECORRENCIA_DIAS[grupo.recorrencia || 'semanal'] || 7;
  const limite90 = new Date(Date.now() - 90 * 86400000);
  const realizados90 = encontrosRaw.filter(e => new Date(e.data + 'T12:00:00') >= limite90).length;
  const esperados90 = Math.floor(90 / recDias);
  const regularidade = esperados90 > 0 ? Math.min(100, Math.round((realizados90 / esperados90) * 100)) : 0;

  // Taxa de presenca (% dos membros atuais)
  const taxaPresenca = totalMembrosAtuais > 0
    ? Math.min(100, Math.round((freqMedia / totalMembrosAtuais) * 100))
    : 0;

  // Score de saude composto
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
    presencas_ultimos: presencasUltimos8.reverse(), // mais antigo primeiro pra grafico
    datas_ultimos: ultimos8.slice().reverse().map(e => e.data),
  };
}

// GET /api/grupos/:id/metricas — saude do grupo individual
router.get('/:id/metricas', async (req, res) => {
  try {
    const id = req.params.id;
    const [grupoRes, encontrosRes, partRes] = await Promise.all([
      supabase.from('mem_grupos').select('id, nome, recorrencia, ativo').eq('id', id).single(),
      supabase.from('mem_grupo_encontros').select('id, data').eq('grupo_id', id).order('data', { ascending: false }).limit(20),
      supabase.from('mem_grupo_membros').select('membro_id', { count: 'exact', head: true }).eq('grupo_id', id).is('saiu_em', null),
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
    const { data: grupos } = await supabase.from('mem_grupos')
      .select('id, nome, recorrencia, lider_id')
      .eq('ativo', true);

    if (!grupos?.length) return res.json({ total: 0, em_risco: 0, saudaveis: 0, grupos: [] });

    const grupoIds = grupos.map(g => g.id);
    const [encRes, partRes, lidRes] = await Promise.all([
      supabase.from('mem_grupo_encontros').select('id, grupo_id, data').in('grupo_id', grupoIds).order('data', { ascending: false }),
      supabase.from('mem_grupo_membros').select('grupo_id, membro_id').in('grupo_id', grupoIds).is('saiu_em', null),
      supabase.from('mem_membros').select('id, nome').in('id', grupos.map(g => g.lider_id).filter(Boolean)),
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

    // Presencas em batch
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
  } catch (e) { console.error('[Grupos saude agregado]', e.message); res.status(500).json({ error: 'Erro ao calcular saude agregada' }); }
});

// ══════════════════════════════════════════════
// CRUD do grupo (rotas com /:id por ultimo)
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

    // Round 2: lider e grupo de origem (so se houver — em paralelo)
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
router.post('/', authorize('admin', 'diretor'), async (req, res) => {
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
      descricao: d.descricao || '', ativo: true,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { console.error('[Grupos create]', e.message); res.status(500).json({ error: 'Erro ao criar grupo' }); }
});

// PUT /api/grupos/:id
router.put('/:id', authorize('admin', 'diretor'), async (req, res) => {
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
      descricao: d.descricao || '', ativo: d.ativo ?? true,
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar grupo' }); }
});

// DELETE /api/grupos/:id — soft delete
router.delete('/:id', authorize('admin', 'diretor'), async (req, res) => {
  try {
    await supabase.from('mem_grupos').update({ ativo: false }).eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao desativar grupo' }); }
});

// POST /api/grupos/:id/membros — adicionar membro
router.post('/:id/membros', authorize('admin', 'diretor'), async (req, res) => {
  try {
    const { membro_id } = req.body;
    if (!membro_id) return res.status(400).json({ error: 'membro_id obrigatorio' });

    // Fechar participacao anterior ativa do membro
    await supabase.from('mem_grupo_membros')
      .update({ saiu_em: new Date().toISOString().split('T')[0], motivo_saida: 'Transferido para outro grupo' })
      .eq('membro_id', membro_id).is('saiu_em', null);

    const { data, error } = await supabase.from('mem_grupo_membros').insert({
      grupo_id: req.params.id, membro_id, entrou_em: new Date().toISOString().split('T')[0],
    }).select().single();
    if (error) throw error;

    // Notificacao imediata: novo membro no grupo
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

module.exports = router;
