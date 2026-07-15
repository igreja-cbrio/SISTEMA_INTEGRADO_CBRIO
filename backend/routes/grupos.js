const router = require('express').Router();
// authorizeModule('grupos', N) respeita a matriz cargo×módulo + boost de área
// (Nélio/Natasha, donos do módulo, têm nível 5 via área Grupos mas role
// 'assistente' — o authorize() por role os bloqueava nas rotas de escrita).
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { acharOuCriarGuardado, normalizarNome, normalizarCpf, normalizarTelefone, normalizarEmail } = require('../services/membroMatch');
const multer = require('multer');
const { uploadModuleFile, SHAREPOINT_CONFIGURED } = require('../services/storageService');
const { notificar } = require('../services/notificar');
const { importarParticipantes } = require('../services/gruposImporter');
const { notificarPessoaAprovada, notificarPessoaSugestao } = require('../services/gruposWhatsapp');
const { registrarEventoPedido } = require('../services/grupoPedidoEventos');

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

// POST /api/grupos/importar-participantes · importa o consolidado (XLSX) de
// pessoas × grupos. ?dry_run=1 (ou body dry_run) devolve a prévia sem gravar.
// Regras: cria quem não existe, ignora quem existe, atualiza CPF/telefone
// faltantes, find-or-create de grupos, vínculos deduplicados. Nível 3 no módulo.
router.post('/importar-participantes', authorizeModule('grupos', 3), uploadMw.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Envie o arquivo .xlsx no campo "arquivo".' });
    const dryRun = req.query.dry_run === '1' || req.query.dry_run === 'true' || req.body?.dry_run === 'true' || req.body?.dry_run === true;
    const reconciliar = req.query.reconciliar === '1' || req.query.reconciliar === 'true' || req.body?.reconciliar === 'true' || req.body?.reconciliar === true;
    const rep = await importarParticipantes(req.file.buffer, { dryRun, reconciliar });
    res.json(rep);
  } catch (e) {
    console.error('[grupos/importar-participantes]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao importar participantes' });
  }
});

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
      const { data: lideres } = await supabase.from('mem_membros').select('id, nome, telefone, foto_url').is('deleted_at', null).in('id', liderIds);
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
      lider_telefone: lideresMap[g.lider_id]?.telefone || null,
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
        .from('mem_membros').select('id, nome').in('id', liderIds.slice(i, i + 400))
        .is('deleted_at', null);
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

    // Linha do tempo do pedido (histórico da caixa de entrada)
    registrarEventoPedido(data.id, 'criado', { origem: data.origem || 'cadastro_interno' }, req.user?.name || null);

    res.json(data);
  } catch (e) { console.error('[Pedidos create]', e.message); res.status(500).json({ error: 'Erro ao criar pedido' }); }
});

// GET /api/grupos/pedidos/list — lista pedidos (opcional: status, grupo_id,
// mine=true, desde=ISO). Pagina internamente além do cap de 1000 do PostgREST
// (o volume de uma temporada passa de 1000 e cortaria linhas em silêncio) e
// marca `veio_next` — a label de origem da caixa de entrada unificada.
router.get('/pedidos/list', async (req, res) => {
  try {
    const { status, grupo_id, mine, desde } = req.query;

    // mine=true filtra por grupos onde o user logado e o líder
    let grupoIdsMine = null;
    if (mine === 'true') {
      const { data: prof } = await supabase
        .from('vol_profiles')
        .select('membresia_id')
        .eq('auth_user_id', req.user.userId)
        .maybeSingle();
      const minhaMembresiaId = prof?.membresia_id;
      if (!minhaMembresiaId) return res.json([]);
      const { data: meusGrupos } = await supabase.from('mem_grupos').select('id').eq('lider_id', minhaMembresiaId).eq('ativo', true).is('deleted_at', null);
      grupoIdsMine = (meusGrupos || []).map(g => g.id);
      if (!grupoIdsMine.length) return res.json([]);
    }

    const desdeISO = desde && !Number.isNaN(new Date(desde).getTime())
      ? new Date(desde).toISOString() : null;

    // Query objects do supabase-js são de uso único — o builder recria por página.
    const montar = () => {
      let q = supabase.from('mem_grupo_pedidos')
        .select('*, mem_grupos(id, nome, codigo, bairro, lider_id, capacidade, aceitando_inscricoes, mem_membros!lider_id(id, nome))')
        .order('created_at', { ascending: false });
      if (status) q = q.eq('status', status);
      if (grupo_id) q = q.eq('grupo_id', grupo_id);
      if (grupoIdsMine) q = q.in('grupo_id', grupoIdsMine);
      if (desdeISO) q = q.gte('created_at', desdeISO);
      return q;
    };

    const PAGE = 1000;
    const MAX = 5000; // teto de sanidade — bem acima de uma temporada inteira
    let rows = [];
    for (let offset = 0; offset < MAX; offset += PAGE) {
      const { data, error } = await montar().range(offset, offset + PAGE - 1);
      if (error) throw error;
      rows = rows.concat(data || []);
      if (!data || data.length < PAGE) break;
    }

    // Ocupação atual dos grupos com pedido em aberto — alimenta o aviso de
    // capacidade no frontend (capacidade é conselho, não trava).
    const abertos = rows.filter(p => ['pendente', 'devolvido'].includes(p.status));
    const grupoIds = [...new Set(abertos.map(p => p.grupo_id).filter(Boolean))].slice(0, 50);
    const ocupacao = {};
    await Promise.all(grupoIds.map(async (gid) => {
      const { count } = await supabase.from('mem_grupo_membros')
        .select('id', { count: 'exact', head: true })
        .eq('grupo_id', gid).is('saiu_em', null).is('deleted_at', null);
      ocupacao[gid] = count || 0;
    }));
    rows.forEach(p => {
      if (p.mem_grupos && ocupacao[p.grupo_id] !== undefined) p.mem_grupos.membros_ativos = ocupacao[p.grupo_id];
    });

    // Contato do pedido ≠ contato do cadastro (só pros ABERTOS com membro
    // ligado — é onde orienta a decisão): a aprovação vai atualizar o
    // cadastro (somar, não substituir · Marcos 15/07) e o selo avisa a
    // triagem. Divergência = os DOIS lados têm valor e diferem (cadastro
    // vazio é só preenchido, não ganha selo). Lotes de 200 no .in().
    try {
      const abertosComMembro = rows.filter(p =>
        ['pendente', 'devolvido', 'encaminhado'].includes(p.status) && p.membro_id && (p.telefone || p.email));
      const memIds = [...new Set(abertosComMembro.map(p => p.membro_id))];
      const memMap = {};
      for (let i = 0; i < memIds.length; i += 200) {
        const { data: mems } = await supabase.from('mem_membros')
          .select('id, telefone, email').in('id', memIds.slice(i, i + 200));
        (mems || []).forEach(m => { memMap[m.id] = m; });
      }
      abertosComMembro.forEach(p => {
        const m = memMap[p.membro_id];
        if (!m) return;
        const telNovo = normalizarTelefone(p.telefone), telVelho = normalizarTelefone(m.telefone);
        const emNovo = normalizarEmail(p.email), emVelho = normalizarEmail(m.email);
        p.contato_divergente = Boolean(
          (telNovo && telVelho && telNovo !== telVelho) || (emNovo && emVelho && emNovo !== emVelho));
      });
    } catch (e) { console.error('[Pedidos list contato]', e.message); }

    // Track de origem (label "Next"): pessoa com encaminhamento do Next
    // batendo por membro ou telefone — cobre também quem foi direcionada
    // pelo Next e depois se inscreveu sozinha pelo form.
    try {
      const { data: encs } = await supabase.from('jornada_encaminhamentos')
        .select('membro_id, telefone')
        .eq('destino', 'grupos').eq('origem', 'next').is('deleted_at', null)
        .limit(2000);
      const membrosNext = new Set((encs || []).map(e => e.membro_id).filter(Boolean));
      const telsNext = new Set((encs || []).map(e => String(e.telefone || '').replace(/\D+/g, '')).filter(t => t.length >= 10));
      rows.forEach(p => {
        const tel = String(p.telefone || '').replace(/\D+/g, '');
        p.veio_next = Boolean((p.membro_id && membrosNext.has(p.membro_id)) || (tel.length >= 10 && telsNext.has(tel)));
      });
    } catch (e) { console.error('[Pedidos list veio_next]', e.message); }

    res.json(rows);
  } catch (e) { console.error('[Pedidos list]', e.message); res.status(500).json({ error: 'Erro ao listar pedidos' }); }
});

// GET /api/grupos/pedidos/resumo — cockpit da caixa de entrada (Nana):
// pedidos de hoje, pendentes com envelhecimento, decididos em 30 dias e
// tempo médio de resposta. Leitura agregada, sem PII além de contagens.
router.get('/pedidos/resumo', async (req, res) => {
  try {
    const agora = Date.now();
    const hoje0 = new Date(); hoje0.setHours(0, 0, 0, 0);
    const d30 = new Date(agora - 30 * 24 * 60 * 60 * 1000).toISOString();
    const h24 = new Date(agora - 24 * 60 * 60 * 1000).toISOString();
    const h72 = new Date(agora - 72 * 60 * 60 * 1000).toISOString();

    const contar = async (mod) => {
      let q = supabase.from('mem_grupo_pedidos').select('id', { count: 'exact', head: true }).is('deleted_at', null);
      q = mod(q);
      const { count } = await q;
      return count || 0;
    };

    const [hoje, pendentes, pend24, pend72, aprov30, rejei30, devolvidos] = await Promise.all([
      contar(q => q.gte('created_at', hoje0.toISOString())),
      contar(q => q.eq('status', 'pendente')),
      contar(q => q.eq('status', 'pendente').lt('created_at', h24)),
      contar(q => q.eq('status', 'pendente').lt('created_at', h72)),
      contar(q => q.eq('status', 'aprovado').gte('decidido_em', d30)),
      contar(q => q.eq('status', 'rejeitado').gte('decidido_em', d30)),
      // Recusados pelo líder aguardando a triagem decidir (sem janela — é fila)
      contar(q => q.eq('status', 'devolvido')),
    ]);

    // Pendente mais antigo + tempo médio de decisão (últimos 30d)
    const { data: maisAntigo } = await supabase.from('mem_grupo_pedidos')
      .select('created_at').eq('status', 'pendente').is('deleted_at', null)
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    const { data: decididos } = await supabase.from('mem_grupo_pedidos')
      .select('created_at, decidido_em').in('status', ['aprovado', 'rejeitado'])
      .gte('decidido_em', d30).is('deleted_at', null).limit(1000);
    let tempoMedioHoras = null;
    if (decididos?.length) {
      const soma = decididos.reduce((acc, p) => acc + (new Date(p.decidido_em) - new Date(p.created_at)), 0);
      tempoMedioHoras = Math.round(soma / decididos.length / 36e5 * 10) / 10;
    }

    res.json({
      hoje,
      pendentes,
      pendentes_24h: pend24,
      pendentes_72h: pend72,
      aprovados_30d: aprov30,
      rejeitados_30d: rejei30,
      devolvidos,
      mais_antigo_dias: maisAntigo
        ? Math.floor((agora - new Date(maisAntigo.created_at)) / 864e5)
        : null,
      tempo_medio_horas: tempoMedioHoras,
    });
  } catch (e) { console.error('[Pedidos resumo]', e.message); res.status(500).json({ error: 'Erro ao carregar o resumo' }); }
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
    // Família compartilha e-mail → pode haver >1 membro. maybeSingle() erraria
    // (não-single) e devolveria grupos vazios. Pega o mais antigo, não deletado.
    const { data: ms } = await supabase.from('mem_membros')
      .select('id, nome, foto_url').ilike('email', u.email).eq('active', true).is('deleted_at', null)
      .order('created_at', { ascending: true }).limit(1);
    if (ms && ms[0]) {
      await supabase.from('profiles').update({ membro_id: ms[0].id }).eq('id', u.id);
      return ms[0];
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
          .select('id, nome, telefone, foto_url').in('id', liderIds).is('deleted_at', null);
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

// Núcleo da aprovação de pedido — compartilhado pelo endpoint individual e
// pelo lote (aprovar-lote). Não toca no res: devolve { ok: true } ou
// { ok: false, code, error }.
async function aprovarPedidoCore(pedidoId, user) {
    const { data: pedido, error: ePedido } = await supabase.from('mem_grupo_pedidos')
      .select('*').eq('id', pedidoId).maybeSingle();
    if (ePedido) throw ePedido; // erro de infra → 500 no chamador (não é "não encontrado")
    if (!pedido) return { ok: false, code: 404, error: 'Pedido não encontrado' };
    if (pedido.status !== 'pendente') {
      return { ok: false, code: 409, error: `Pedido já foi ${pedido.status}` };
    }

    let membroId = pedido.membro_id;

    // Se o pedido veio do formulário público (cadastro pendente), promove a membro
    if (!membroId && pedido.cadastro_pendente_id) {
      const { data: cad } = await supabase.from('mem_cadastros_pendentes')
        .select('*').eq('id', pedido.cadastro_pendente_id).single();
      if (cad) {
        // Guarda na origem: o cadastro público já detecta duplicata
        // (duplicado_de_id) · se detectou, LIGA ao membro existente em vez de
        // criar de novo. Senão, passa pelo matcher compartilhado (CPF/e-mail/
        // telefone+nome) · não faz mais INSERT cru.
        if (cad.duplicado_de_id) {
          membroId = cad.duplicado_de_id;
        } else {
          // nao_vincular_fraco = a pessoa afirmou "não sou eu" na inscrição —
          // o matcher só pode religar por CPF (nunca por e-mail/telefone de família).
          const r = await acharOuCriarGuardado({
            cpf: cad.cpf, email: cad.email, telefone: cad.telefone, nome: cad.nome,
            extra: { data_nascimento: cad.data_nascimento || null, foto_url: cad.foto_url || null, genero: cad.genero || null },
          }, { soChaveForte: cad.nao_vincular_fraco === true });
          membroId = r.membro_id;
        }
        // Carrega foto, sexo e nascimento do cadastro público pro membro quando
        // ele ainda não os tem — vale pro recém-criado e pro ligado por dedup.
        if ((cad.foto_url || cad.genero || cad.data_nascimento) && membroId) {
          const { data: mem } = await supabase.from('mem_membros').select('foto_url, genero, data_nascimento').eq('id', membroId).maybeSingle();
          if (mem) {
            const upd = {};
            if (cad.foto_url && !mem.foto_url) upd.foto_url = cad.foto_url;
            if (cad.genero && !mem.genero) upd.genero = cad.genero;
            if (cad.data_nascimento && !mem.data_nascimento) upd.data_nascimento = cad.data_nascimento;
            if (Object.keys(upd).length) await supabase.from('mem_membros').update(upd).eq('id', membroId);
          }
        }
        // Marca cadastro como aprovado
        await supabase.from('mem_cadastros_pendentes')
          .update({ status: 'aprovado' }).eq('id', pedido.cadastro_pendente_id);
      }
    }

    if (!membroId) {
      return { ok: false, code: 400, error: 'Pedido sem membro nem cadastro pendente valido' };
    }

    // Trava anti-corrida: o UPDATE condicional em status='pendente' é atômico
    // no banco — só UM decisor "reivindica" o pedido (aprovação logada × lote
    // × link do WhatsApp podem correr em paralelo). Quem perde recebe 409.
    // O guard de grupo_id cobre a realocação: se o pedido foi movido pra outro
    // grupo entre a leitura e o claim, esta aprovação não vale mais (o vínculo
    // iria pro grupo antigo com o pedido apontando pro novo).
    const { data: claimed, error: eClaim } = await supabase.from('mem_grupo_pedidos').update({
      status: 'aprovado',
      decidido_por: user.userId,
      decidido_por_nome: user.name,
      decidido_em: new Date().toISOString(),
      membro_id: membroId,
      // CHECK chk_pedido_um_solicitante é XOR estrito (membro OU cadastro):
      // com o membro resolvido/promovido, o ponteiro pro cadastro precisa ser
      // limpo no MESMO update — senão 23514 (o cadastro em si segue guardado).
      cadastro_pendente_id: null,
    }).eq('id', pedido.id).eq('status', 'pendente').eq('grupo_id', pedido.grupo_id).select('id');
    if (eClaim) throw eClaim;
    if (!claimed || !claimed.length) {
      return { ok: false, code: 409, error: 'Pedido já foi decidido por outra pessoa' };
    }

    // Multi-grupo é permitido (uma pessoa participa de vários grupos ao mesmo
    // tempo), então aprovar um pedido NÃO fecha as participações da pessoa em
    // outros grupos — só a inscreve NESTE grupo. Idempotente: se já houver um
    // vínculo ativo neste grupo, não cria outro. Se o vínculo falhar, o pedido
    // volta pra pendente (não fica "aprovado" sem a pessoa no roster).
    try {
      const { data: jaAtivo } = await supabase.from('mem_grupo_membros')
        .select('id').eq('grupo_id', pedido.grupo_id).eq('membro_id', membroId)
        .is('saiu_em', null).is('deleted_at', null).limit(1);
      if (!jaAtivo || !jaAtivo.length) {
        const { error: eVinc } = await supabase.from('mem_grupo_membros').insert({
          grupo_id: pedido.grupo_id, membro_id: membroId,
          entrou_em: new Date().toISOString().slice(0, 10),
        });
        if (eVinc) throw eVinc;
      }
    } catch (e) {
      await supabase.from('mem_grupo_pedidos').update({
        status: 'pendente', decidido_por: null, decidido_por_nome: null, decidido_em: null,
      }).eq('id', pedido.id);
      throw e;
    }

    // Linha do tempo (Marcos · 14/07): registra só o "aprovado". Os OUTROS
    // pedidos abertos da mesma pessoa NÃO fecham mais automaticamente —
    // multi-grupo pleno: ela pode se inscrever em vários grupos e cada líder
    // decide o seu pedido. (Pedidos antigos fechados como "aprovada em outro
    // grupo" seguem exibidos como histórico.)
    (async () => {
      try {
        const { data: gAlvo } = await supabase.from('mem_grupos').select('nome').eq('id', pedido.grupo_id).maybeSingle();
        await registrarEventoPedido(pedido.id, 'aprovado', { grupo: gAlvo?.nome || null }, user?.name || null);
      } catch (e) { console.error('[Pedido aprovado · eventos]', e.message); }
    })();

    // "Somar, não substituir" (Marcos · 15/07): inscrição aprovada com
    // telefone/e-mail DIFERENTES do cadastro atualiza o cadastro — quem se
    // reinscreve com contato novo mudou de contato, e a aprovação humana é o
    // gate de confiança. O contato anterior vai pras observações; campo vazio
    // no cadastro é só preenchido (sem nota). Acessório: falha aqui não
    // desfaz a aprovação.
    (async () => {
      try {
        const telPedido = normalizarTelefone(pedido.telefone);
        const emailPedido = normalizarEmail(pedido.email);
        if (!telPedido && !emailPedido) return;
        const { data: mem } = await supabase.from('mem_membros')
          .select('telefone, email, observacoes').eq('id', membroId).maybeSingle();
        if (!mem) return;
        const telMem = normalizarTelefone(mem.telefone);
        const emailMem = normalizarEmail(mem.email);
        const upd = {};
        const antigos = [];
        if (telPedido && telPedido !== telMem) {
          upd.telefone = telPedido;
          if (telMem) antigos.push(`telefone anterior: ${mem.telefone}`);
        }
        if (emailPedido && emailPedido !== emailMem) {
          upd.email = emailPedido;
          if (emailMem) antigos.push(`e-mail anterior: ${mem.email}`);
        }
        if (!Object.keys(upd).length) return;
        if (antigos.length) {
          const nota = `[Contato atualizado na inscrição · ${new Date().toLocaleDateString('pt-BR')}] ${antigos.join(' · ')}`;
          upd.observacoes = mem.observacoes ? `${mem.observacoes}\n${nota}` : nota;
        }
        await supabase.from('mem_membros').update(upd).eq('id', membroId);
      } catch (e) { console.error('[Pedido aprovado · contato]', e.message); }
    })();

    // Fluxo de boas-vindas: notifica a pessoa (rica) e o líder (novo membro)
    (async () => {
      try {
        const { data: grupo } = await supabase.from('mem_grupos')
          .select('id, nome, codigo, dia_semana, horario, local, endereco, complemento, bairro, lider_id')
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
        const ondePartes = [grupo.local, grupo.endereco, grupo.complemento, grupo.bairro].filter(Boolean);
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

        // F3 · WhatsApp de boas-vindas à pessoa aprovada (template
        // grupos_pedido_aprovado). Cobre aprovação logada E via link do
        // líder. Gated por WHATSAPP_ENABLED no whatsappService.
        await notificarPessoaAprovada({
          telefone: pedido.telefone,
          grupo,
          liderNome,
          liderTelefone,
        });
      } catch (e) { console.error('[Pedido aprovar notify]', e.message); }
    })();

    // grupo_id devolvido = onde a aprovação DE FATO caiu (o chamador do aceite
    // de sugestão usa pra responder com o grupo certo).
    return { ok: true, grupo_id: pedido.grupo_id };
}

// POST /api/grupos/pedidos/:pedidoId/sugerir — body { grupo_sugerido_id, motivo? }
// Realocação: em vez de aprovar/rejeitar, quem triageia sugere OUTRO grupo
// pra pessoa (WhatsApp com link de aceite /g/s/<token> + notificação in-app).
// O pedido continua valendo no grupo original até a pessoa aceitar. O `motivo`
// (opcional · escolhido pela triagem) VAI pra pessoa no WhatsApp — é o único
// motivo que ela recebe (o do líder na recusa é interno).
router.post('/pedidos/:pedidoId/sugerir', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const { grupo_sugerido_id, motivo } = req.body || {};
    if (!grupo_sugerido_id) return res.status(400).json({ error: 'Informe grupo_sugerido_id' });

    const { data: pedido } = await supabase.from('mem_grupo_pedidos')
      .select('id, status, grupo_id, nome, telefone, membro_id')
      .eq('id', req.params.pedidoId).maybeSingle();
    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
    // 'devolvido' também aceita sugestão (é a fila da triagem), 'encaminhado'
    // aceita RE-encaminhar (outra opção antes de a pessoa decidir) e
    // 'rejeitado' aceita REABRIR encaminhando (Marcos · 14/07: a opção de
    // encaminhar fica disponível independente de quem recusou — a sugestão
    // reabre o pedido como 'encaminhado').
    if (!['pendente', 'devolvido', 'encaminhado', 'rejeitado'].includes(pedido.status)) return res.status(409).json({ error: `Pedido já foi ${pedido.status}` });
    if (grupo_sugerido_id === pedido.grupo_id) {
      return res.status(400).json({ error: 'Sugira um grupo diferente do pedido original' });
    }

    const { data: grupoSugerido } = await supabase.from('mem_grupos')
      .select('id, nome, codigo, dia_semana, horario, local, endereco, complemento, bairro, ativo, aceitando_inscricoes')
      .eq('id', grupo_sugerido_id).is('deleted_at', null).maybeSingle();
    if (!grupoSugerido || !grupoSugerido.ativo) {
      return res.status(404).json({ error: 'Grupo sugerido não encontrado ou inativo' });
    }
    if (grupoSugerido.aceitando_inscricoes === false) {
      // Trava explícita do líder do grupo sugerido — a sugestão não passa por
      // cima (capacidade é conselho; a pausa não).
      return res.status(400).json({ error: 'Esse grupo pausou novas inscrições — combine com o líder dele antes de sugerir' });
    }

    // O template da sugestão cita o grupo ORIGINAL do pedido ({{2}}).
    const { data: grupoOriginal } = await supabase.from('mem_grupos')
      .select('nome').eq('id', pedido.grupo_id).maybeSingle();

    // WhatsApp com o link de aceite (gated por WHATSAPP_ENABLED · sem
    // telefone no pedido, só a notificação in-app abaixo alcança a pessoa).
    const wpp = await notificarPessoaSugestao({
      telefone: pedido.telefone,
      pessoaNome: pedido.nome,
      grupoOriginalNome: grupoOriginal?.nome || null,
      grupoSugerido,
      pedidoId: pedido.id,
      motivo, // sanitizado no service (vira o {{3}} do template de utilidade)
    });

    // Status dinâmico (Marcos · 13/07): sugerir marca o pedido como
    // 'encaminhado' — a caixa mostra "Encaminhado" até a pessoa decidir.
    // Tolerante à migration pendente: sem as colunas, o update falha
    // silencioso e o fluxo (WhatsApp/in-app) segue idêntico.
    const { data: marcado } = await supabase.from('mem_grupo_pedidos').update({
      status: 'encaminhado',
      sugerido_grupo_id: grupoSugerido.id,
      sugerido_em: new Date().toISOString(),
      sugerido_por_nome: req.user.name || null,
    }).eq('id', pedido.id).in('status', ['pendente', 'devolvido', 'encaminhado', 'rejeitado']).select('id');
    if (marcado && marcado.length) {
      registrarEventoPedido(pedido.id, 'encaminhado', {
        grupo_sugerido: grupoSugerido.nome,
        motivo: String(motivo || '').trim() || null,
        whatsapp_enviado: wpp?.sent === true,
      }, req.user.name);
    }

    // In-app, se a pessoa tem login
    (async () => {
      try {
        if (!pedido.membro_id) return;
        const { data: prof } = await supabase.from('vol_profiles')
          .select('auth_user_id').eq('membresia_id', pedido.membro_id).maybeSingle();
        if (!prof?.auth_user_id) return;
        await notificar({
          modulo: 'grupos',
          tipo: 'pedido_sugestao',
          titulo: `Sugestão de grupo: ${grupoSugerido.nome}`,
          // Só manda a pessoa "conferir o WhatsApp" se o WhatsApp de fato
          // saiu — sem envio, o link de aceite não existe em lugar nenhum.
          mensagem: wpp?.sent
            ? `A liderança sugeriu o grupo ${grupoSugerido.nome} para você. Confira a sugestão que chegou no seu WhatsApp.`
            : `A liderança sugeriu o grupo ${grupoSugerido.nome} para você. Fale com o líder do grupo para combinar sua entrada.`,
          link: '/grupos',
          severidade: 'info',
          chaveDedup: `pedido_sugestao_${pedido.id}_${grupoSugerido.id}`,
          targetIds: [prof.auth_user_id],
        });
      } catch (e) { console.error('[Pedido sugerir notify]', e.message); }
    })();

    res.json({ success: true, whatsapp_enviado: wpp?.sent === true, whatsapp_motivo: wpp?.sent ? null : (wpp?.reason || null) });
  } catch (e) { console.error('[Pedido sugerir]', e.message); res.status(500).json({ error: 'Erro ao sugerir grupo' }); }
});

// GET /api/grupos/pedidos/:pedidoId/eventos — linha do tempo do pedido
// (criado → recusado_lider → encaminhado → aprovado/rejeitado_final/…)
router.get('/pedidos/:pedidoId/eventos', authorizeModule('grupos', 1), async (req, res) => {
  try {
    const { data, error } = await supabase.from('mem_grupo_pedido_eventos')
      .select('id, tipo, detalhe, autor_nome, created_at')
      .eq('pedido_id', req.params.pedidoId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (e) { console.error('[Pedido eventos]', e.message); res.status(500).json({ error: 'Erro ao buscar o histórico do pedido' }); }
});

// POST /api/grupos/pedidos/aprovar-lote — body { pedido_ids: [] }
// Aprova em sequência com a mesma lógica do individual; devolve o resultado
// por pedido (um pedido inválido não derruba o lote).
router.post('/pedidos/aprovar-lote', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.pedido_ids)
      ? [...new Set(req.body.pedido_ids.filter(v => typeof v === 'string' && v))]
      : [];
    if (!ids.length) return res.status(400).json({ error: 'Informe pedido_ids' });
    if (ids.length > 100) return res.status(400).json({ error: 'Máximo de 100 pedidos por lote' });

    let aprovados = 0;
    const falhas = [];
    for (const id of ids) {
      try {
        const r = await aprovarPedidoCore(id, req.user);
        if (r.ok) aprovados += 1;
        else falhas.push({ id, error: r.error });
      } catch (e) {
        console.error('[Pedidos aprovar-lote item]', id, e.message);
        falhas.push({ id, error: 'Erro ao aprovar' });
      }
    }
    res.json({ success: true, aprovados, falhas });
  } catch (e) { console.error('[Pedidos aprovar-lote]', e.message); res.status(500).json({ error: 'Erro ao aprovar pedidos' }); }
});

// POST /api/grupos/pedidos/:pedidoId/aprovar
router.post('/pedidos/:pedidoId/aprovar', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const r = await aprovarPedidoCore(req.params.pedidoId, req.user);
    if (!r.ok) return res.status(r.code).json({ error: r.error });
    res.json({ success: true });
  } catch (e) { console.error('[Pedido aprovar]', e.message); res.status(500).json({ error: 'Erro ao aprovar pedido' }); }
});

// POST /api/grupos/pedidos/:pedidoId/rejeitar — body: { motivo? }
// Quem recusa AQUI é a EQUIPE da triagem (Naná/Nélio — o líder não usa a
// plataforma: ele decide pelo link do WhatsApp, e a recusa dele DEVOLVE o
// pedido pra triagem). Recusa da equipe é FINAL (Marcos · 2026-07-14): vale
// pra pendente, devolvido ou encaminhado. O motivo segue interno.
router.post('/pedidos/:pedidoId/rejeitar', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const { motivo } = req.body || {};
    const { data: pedido } = await supabase.from('mem_grupo_pedidos')
      .select('id, status, grupo_id, membro_id, nome, motivo_rejeicao').eq('id', req.params.pedidoId).single();
    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (!['pendente', 'devolvido', 'encaminhado'].includes(pedido.status)) {
      return res.status(409).json({ error: `Pedido já foi ${pedido.status}` });
    }

    // Guarda de corrida: uma aprovação simultânea (logada ou via link do
    // líder) não pode ser sobrescrita.
    const { data: claimed } = await supabase.from('mem_grupo_pedidos').update({
      status: 'rejeitado',
      // Preserva o motivo interno do líder quando a equipe não escreve um novo
      motivo_rejeicao: motivo || pedido.motivo_rejeicao || null,
      decidido_por: req.user.userId,
      decidido_por_nome: req.user.name,
      decidido_em: new Date().toISOString(),
    }).eq('id', pedido.id).in('status', ['pendente', 'devolvido', 'encaminhado']).select('id');
    if (!claimed || !claimed.length) {
      return res.status(409).json({ error: 'Pedido já foi decidido por outra pessoa' });
    }

    registrarEventoPedido(pedido.id, 'rejeitado_final', { motivo_interno: motivo || pedido.motivo_rejeicao || null }, req.user.name);

    // Notifica a pessoa (in-app · só alcança quem tem login no sistema).
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
              mensagem: 'Seu pedido não pôde seguir. Você pode se inscrever em outro grupo.',
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

// GET /api/grupos/pessoas/buscar?q= — autocomplete de LÍDER do cadastro de
// grupo. Busca no UNIVERSO DE GRUPOS (quem lidera ou participa de algum
// grupo), não na membresia inteira (Marcos · 14/07: a base tem 3,5k+
// registros cheios de stubs de visitantes/decisões e homônimos — poluía o
// seletor). Server-side (ilike no banco · imune ao cap de 1000) e devolve
// contexto (grupo que lidera/participa + telefone) pra distinguir homônimos.
router.get('/pessoas/buscar', authorizeModule('grupos', 1), async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json([]);

    // 1) Candidatos por nome (tokens AND — "renata bispo" casa "Renata
    //    Cristina Martins Bispo"), limitados a 200 pro passo 2 caber no .in()
    const tokens = q.split(/\s+/).filter(Boolean).slice(0, 6);
    let query = supabase.from('mem_membros')
      .select('id, nome, telefone, foto_url')
      .eq('active', true)
      .is('deleted_at', null)
      .order('nome')
      .limit(200);
    for (const t of tokens) query = query.ilike('nome', `%${t}%`);
    const { data: candidatos, error } = await query;
    if (error) throw error;
    if (!candidatos || !candidatos.length) return res.json([]);

    const ids = candidatos.map(c => c.id);

    // 2) Quem do conjunto lidera algum grupo (qualquer temporada — líder da
    //    T1 conta como gente do universo de grupos)
    const { data: liderancas } = await supabase.from('mem_grupos')
      .select('nome, lider_id')
      .in('lider_id', ids)
      .is('deleted_at', null);
    const lideraMap = {};
    (liderancas || []).forEach(g => {
      (lideraMap[g.lider_id] = lideraMap[g.lider_id] || []).push(g.nome);
    });

    // 3) Quem participa de grupo (vínculo ativo)
    const { data: vinculos } = await supabase.from('mem_grupo_membros')
      .select('membro_id, mem_grupos!inner(nome)')
      .in('membro_id', ids)
      .is('saiu_em', null)
      .is('deleted_at', null)
      .is('mem_grupos.deleted_at', null)
      .limit(1000);
    const participaMap = {};
    (vinculos || []).forEach(v => {
      if (v.mem_grupos?.nome) (participaMap[v.membro_id] = participaMap[v.membro_id] || []).push(v.mem_grupos.nome);
    });

    const resultado = candidatos
      .filter(c => lideraMap[c.id] || participaMap[c.id])
      .map(c => {
        const lidera = lideraMap[c.id] || [];
        const participa = participaMap[c.id] || [];
        const contexto = lidera.length
          ? `Líder · ${lidera[0]}${lidera.length > 1 ? ` +${lidera.length - 1}` : ''}`
          : `Participa · ${participa[0]}${participa.length > 1 ? ` +${participa.length - 1}` : ''}`;
        return { id: c.id, nome: c.nome, telefone: c.telefone || null, foto_url: c.foto_url || null, contexto };
      })
      .slice(0, 20);

    res.json(resultado);
  } catch (e) { console.error('[Grupos pessoas buscar]', e.message); res.status(500).json({ error: 'Erro ao buscar pessoas' }); }
});

// ── Ficha da pessoa (aba Pessoas · Marcos 15/07: "deve ter uma forma de
// editar, caso seja necessário excluir algum desses dados") ──
// GET devolve os dados cadastrais; PATCH edita — campo enviado vazio/null
// LIMPA o dado (é o "excluir"); campo ausente não mexe. Restrito ao universo
// de grupos (escopo da triagem) e auditado pelo trigger de mem_membros.

function _cpfValidoAdm(cpf) {
  const d = String(cpf || '').replace(/\D+/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(d[i]) * (10 - i);
  let r = (s * 10) % 11;
  if (r === 10) r = 0;
  if (r !== parseInt(d[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(d[i]) * (11 - i);
  r = (s * 10) % 11;
  if (r === 10) r = 0;
  return r === parseInt(d[10]);
}

// GET /api/grupos/pessoas/:membroId/ficha — dados cadastrais pra ficha/edição.
// (Sufixo /ficha de propósito: /pessoas/:membroId cru capturaria as rotas
// /pessoas/papeis e /pessoas/buscar definidas em outros pontos do arquivo.)
router.get('/pessoas/:membroId/ficha', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const gruposDe = await universoGrupos();
    if (!gruposDe.has(req.params.membroId)) {
      return res.status(403).json({ error: 'Pessoa fora do universo de grupos.' });
    }
    const { data, error } = await supabase.from('mem_membros')
      .select('id, nome, cpf, telefone, email, data_nascimento, genero, status, foto_url, observacoes')
      .eq('id', req.params.membroId).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Pessoa não encontrada.' });
    res.json(data);
  } catch (e) { console.error('[Grupos pessoa GET]', e.message); res.status(500).json({ error: 'Erro ao carregar a pessoa' }); }
});

// PATCH /api/grupos/pessoas/:membroId/ficha — body: { nome?, telefone?,
// email?, cpf?, data_nascimento?, observacoes? } · '' ou null limpa o campo.
router.patch('/pessoas/:membroId/ficha', authorizeModule('grupos', 5), async (req, res) => {
  try {
    const gruposDe = await universoGrupos();
    if (!gruposDe.has(req.params.membroId)) {
      return res.status(403).json({ error: 'Pessoa fora do universo de grupos.' });
    }

    const body = req.body || {};
    const upd = {};
    const limpo = (v) => String(v ?? '').trim();

    if ('nome' in body) {
      const nome = limpo(body.nome);
      if (nome.length < 3) return res.status(400).json({ error: 'O nome não pode ficar vazio.', campo: 'nome' });
      upd.nome = nome.slice(0, 200);
    }
    if ('telefone' in body) {
      const dig = limpo(body.telefone).replace(/\D+/g, '');
      if (dig && (dig.length < 10 || dig.length > 13)) return res.status(400).json({ error: 'Telefone inválido — use DDD + número.', campo: 'telefone' });
      upd.telefone = dig || null;
    }
    if ('email' in body) {
      const email = limpo(body.email).toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'E-mail inválido.', campo: 'email' });
      upd.email = email || null;
    }
    if ('cpf' in body) {
      const dig = limpo(body.cpf).replace(/\D+/g, '');
      if (dig) {
        if (!_cpfValidoAdm(dig)) return res.status(400).json({ error: 'CPF inválido — confira os números.', campo: 'cpf' });
        // CPF é chave de identidade: se OUTRA pessoa ativa já o tem, é a
        // MESMA pessoa em dois cadastros (Marcos · 15/07) — o 409 devolve o
        // outro cadastro estruturado e o front oferece FUNDIR na hora.
        const { data: outro } = await supabase.from('mem_membros')
          .select('id, nome').eq('cpf', dig).neq('id', req.params.membroId)
          .is('deleted_at', null).limit(1);
        if (outro && outro.length) {
          return res.status(409).json({
            error: `Este CPF já está no cadastro de "${outro[0].nome}".`,
            codigo: 'cpf_em_uso',
            campo: 'cpf',
            outro: { id: outro[0].id, nome: outro[0].nome },
          });
        }
      }
      upd.cpf = dig || null;
    }
    if ('data_nascimento' in body) {
      const v = limpo(body.data_nascimento);
      if (v) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return res.status(400).json({ error: 'Data de nascimento inválida.', campo: 'data_nascimento' });
        const d = new Date(v + 'T12:00:00');
        if (Number.isNaN(d.getTime()) || d > new Date() || d.getFullYear() < 1900) {
          return res.status(400).json({ error: 'Confira a data de nascimento.', campo: 'data_nascimento' });
        }
      }
      upd.data_nascimento = v || null;
    }
    if ('observacoes' in body) {
      const v = limpo(body.observacoes);
      upd.observacoes = v ? v.slice(0, 4000) : null;
    }

    if (!Object.keys(upd).length) return res.status(400).json({ error: 'Nada a atualizar.' });

    const { data, error } = await supabase.from('mem_membros')
      .update(upd).eq('id', req.params.membroId).is('deleted_at', null)
      .select('id, nome, cpf, telefone, email, data_nascimento, genero, status, foto_url, observacoes')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Pessoa não encontrada.' });

    _dupCache = { ts: 0, payload: null }; // dados mudaram → reanalisar duplicatas
    res.json(data);
  } catch (e) { console.error('[Grupos pessoa PATCH]', e.message); res.status(500).json({ error: 'Erro ao salvar a ficha' }); }
});

// ─────────────────────────────────────────────────────────────
// Duplicatas do universo de grupos (Marcos · 2026-07-14)
// A base acumulou registros repetidos da mesma pessoa: cada porta de entrada
// (imports, sync RH, decisão de culto, inscrição) cria um stub quando não há
// chave forte pra ligar. O CPF obrigatório na inscrição estanca o problema
// daqui pra frente; o LEGADO é resolvido aqui — a triagem (Naná) vê os
// cadastros de grupos com possível duplicata e funde (merge_membros, com
// log/snapshot) ou marca "não é duplicata" (mem_duplicados_ignorados).
// ─────────────────────────────────────────────────────────────

function _bigramas(s) {
  const m = new Map();
  for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); }
  return m;
}
function _dice(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ba = _bigramas(a), bb = _bigramas(b);
  let inter = 0, ta = 0, tb = 0;
  for (const v of ba.values()) ta += v;
  for (const v of bb.values()) tb += v;
  for (const [g, v] of ba) inter += Math.min(v, bb.get(g) || 0);
  return ta + tb ? (2 * inter) / (ta + tb) : 0;
}
// Prenomes compostos comuns: "Carlos Alberto" como prefixo de "Carlos
// Alberto Silva Gago" NÃO sugere a mesma pessoa (o 2º nome é prenome, não
// sobrenome) — sem esta lista, stubs de 2 tokens viravam bola de neve
// juntando 5 Carlos Albertos diferentes (medido em prod · 14/07).
const PRENOMES_MEIO = new Set([
  'alberto', 'fernando', 'henrique', 'eduardo', 'augusto', 'cesar', 'luiz', 'luis',
  'carlos', 'antonio', 'paulo', 'pedro', 'miguel', 'gabriel', 'felipe', 'filipe',
  'andre', 'jose', 'joao', 'maria', 'helena', 'luiza', 'vitoria', 'eduarda',
  'cristina', 'aparecida', 'fatima', 'lucia', 'beatriz', 'gabriela', 'fernanda',
  'paula', 'clara', 'alice', 'victor', 'vitor',
]);

// "Quase o mesmo nome": dice alto (pega typo — Litwiczuk/Litwinczuk — e nome
// truncado de import) OU os tokens de um contidos no outro (pega nome de
// casada/completo — "Renata Martins Bispo" ⊆ "Renata Cristina Martins
// Bispo"). Só sugestão: quem decide é a triagem (nunca fusão automática).
function _nomesParecidos(na, nb) {
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (_dice(na, nb) >= 0.88) return true;
  const ta = na.split(' ').filter(t => t.length >= 2);
  const tb = nb.split(' ').filter(t => t.length >= 2);
  if (ta.length < 2 || tb.length < 2) return false;
  const [menor, maior] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const setMaior = new Set(maior);
  if (!menor.every(t => setMaior.has(t))) return false;
  // "Prenome composto" puro como prefixo (carlos alberto ⊆ carlos alberto
  // silva gago) é fraco demais — só quando o 2º token é sobrenome de fato
  // (elias magon ⊆ elias magon filho segue valendo).
  if (menor.length === 2 && maior.length > 2
    && maior[0] === menor[0] && maior[1] === menor[1]
    && PRENOMES_MEIO.has(menor[1])) return false;
  return true;
}

// Universo de grupos: quem lidera OU tem vínculo (qualquer época) em grupo
// não-deletado. Map<membro_id, rótulos de contexto>.
async function universoGrupos() {
  const gruposDe = new Map();
  const anota = (id, rotulo) => {
    if (!id) return;
    if (!gruposDe.has(id)) gruposDe.set(id, []);
    const arr = gruposDe.get(id);
    if (!arr.includes(rotulo)) arr.push(rotulo);
  };

  const { data: gs, error: eG } = await supabase.from('mem_grupos')
    .select('id, nome, lider_id').is('deleted_at', null).limit(2000);
  if (eG) throw eG;
  const nomeGrupo = new Map((gs || []).map(g => [g.id, g.nome]));
  (gs || []).forEach(g => anota(g.lider_id, `Líder · ${g.nome}`));

  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase.from('mem_grupo_membros')
      .select('membro_id, grupo_id, saiu_em')
      .is('deleted_at', null)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    (data || []).forEach(v => {
      const nome = nomeGrupo.get(v.grupo_id);
      if (nome) anota(v.membro_id, `${v.saiu_em ? 'Participou' : 'Participa'} · ${nome}`);
    });
    if (!data || data.length < PAGE) break;
  }
  return gruposDe;
}

// Cache do scan (o cálculo varre o universo inteiro) — bust ao fundir/ignorar.
let _dupCache = { ts: 0, payload: null };
const DUP_CACHE_MS = 5 * 60 * 1000;

// GET /api/grupos/duplicatas — clusters de possíveis duplicatas no universo
// de grupos. Critérios: mesmo CPF / telefone / e-mail / nome+nascimento
// (chaves exatas) + nome muito parecido (sugestão pra revisão humana).
router.get('/duplicatas', authorizeModule('grupos', 3), async (req, res) => {
  try {
    if (_dupCache.payload && Date.now() - _dupCache.ts < DUP_CACHE_MS && req.query.fresh !== '1') {
      return res.json(_dupCache.payload);
    }

    const gruposDe = await universoGrupos();
    const ids = [...gruposDe.keys()];
    if (!ids.length) return res.json({ clusters: [], total_pessoas_universo: 0 });

    // Dados das pessoas do universo. Lotes de 200 em PARALELO: .in() com
    // ~400+ uuids estoura a linha de request e o fetch falha (medido em
    // prod: 300 ok, 400 falha).
    const lotes = [];
    for (let i = 0; i < ids.length; i += 200) lotes.push(ids.slice(i, i + 200));
    const respostas = await Promise.all(lotes.map(lote => supabase.from('mem_membros')
      .select('id, nome, cpf, telefone, email, data_nascimento, status, foto_url, created_at')
      .in('id', lote)
      .eq('active', true).is('deleted_at', null)));
    const pessoas = [];
    for (const { data, error } of respostas) {
      if (error) throw error;
      pessoas.push(...(data || []));
    }

    // Pares já revisados ("não é duplicata") ficam fora
    const ignorados = new Set();
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from('mem_duplicados_ignorados')
        .select('membro_a_id, membro_b_id').range(offset, offset + 999);
      if (error) throw error;
      (data || []).forEach(p => ignorados.add(`${p.membro_a_id}|${p.membro_b_id}`));
      if (!data || data.length < 1000) break;
    }
    const parIgnorado = (a, b) => { const [x, y] = [a, b].sort(); return ignorados.has(`${x}|${y}`); };

    const norm = pessoas.map(p => ({
      ...p,
      _nome: normalizarNome(p.nome),
      _cpf: normalizarCpf(p.cpf),
      _tel: normalizarTelefone(p.telefone),
      _email: normalizarEmail(p.email),
    }));

    // Union-find: pares por chave exata + nome parecido → clusters
    const paiDe = new Map();
    const find = (x) => { let r = x; while (paiDe.get(r) && paiDe.get(r) !== r) r = paiDe.get(r); paiDe.set(x, r); return r; };
    const motivosPar = new Map(); // 'a|b' (ordenado) → Set<motivo>
    const unir = (a, b, motivo) => {
      // CPFs preenchidos e DIFERENTES = pessoas distintas por definição:
      // nome parecido / telefone de família não passam por cima.
      if (motivo !== 'mesmo CPF' && a._cpf && b._cpf && a._cpf !== b._cpf) return;
      if (parIgnorado(a.id, b.id)) return;
      const [x, y] = [a.id, b.id].sort();
      const k = `${x}|${y}`;
      if (!motivosPar.has(k)) motivosPar.set(k, new Set());
      motivosPar.get(k).add(motivo);
      if (!paiDe.has(a.id)) paiDe.set(a.id, a.id);
      if (!paiDe.has(b.id)) paiDe.set(b.id, b.id);
      const ra = find(a.id), rb = find(b.id);
      if (ra !== rb) paiDe.set(ra, rb);
    };

    // exigeNome: telefone e e-mail são COMPARTILHADOS em família — sozinhos
    // não indicam duplicata (juntariam mãe e filha). Só unem quando o nome
    // também é parecido. CPF e nome+nascimento são individuais: unem direto.
    const porChave = (getter, motivo, minLen = 1, exigeNome = false) => {
      const mapa = new Map();
      for (const p of norm) {
        const v = getter(p);
        if (!v || String(v).length < minLen) continue;
        if (!mapa.has(v)) mapa.set(v, []);
        mapa.get(v).push(p);
      }
      for (const lista of mapa.values()) {
        for (let i = 0; i < lista.length; i++) {
          for (let j = i + 1; j < lista.length; j++) {
            if (exigeNome && !_nomesParecidos(lista[i]._nome, lista[j]._nome)) continue;
            unir(lista[i], lista[j], motivo);
          }
        }
      }
    };
    porChave(p => p._cpf, 'mesmo CPF', 11);
    porChave(p => p._tel, 'mesmo telefone', 10, true);
    porChave(p => p._email, 'mesmo e-mail', 5, true);
    porChave(p => (p._nome && p.data_nascimento ? `${p._nome}|${p.data_nascimento}` : null), 'mesmo nome e nascimento');

    // Nome parecido — compara só dentro do bucket do 1º token do nome
    const buckets = new Map();
    for (const p of norm) {
      const t0 = (p._nome || '').split(' ')[0];
      if (!t0 || t0.length < 3) continue;
      if (!buckets.has(t0)) buckets.set(t0, []);
      buckets.get(t0).push(p);
    }
    for (const lista of buckets.values()) {
      if (lista.length < 2 || lista.length > 200) continue;
      for (let i = 0; i < lista.length; i++) {
        for (let j = i + 1; j < lista.length; j++) {
          if (_nomesParecidos(lista[i]._nome, lista[j]._nome)) unir(lista[i], lista[j], 'nome muito parecido');
        }
      }
    }

    const porRaiz = new Map();
    for (const p of norm) {
      if (!paiDe.has(p.id)) continue;
      const r = find(p.id);
      if (!porRaiz.has(r)) porRaiz.set(r, []);
      porRaiz.get(r).push(p);
    }

    const clusters = [];
    for (const lista of porRaiz.values()) {
      if (lista.length < 2) continue;
      const idsC = new Set(lista.map(p => p.id));
      const motivos = new Set();
      for (const [k, ms] of motivosPar) {
        const [x, y] = k.split('|');
        if (idsC.has(x) && idsC.has(y)) ms.forEach(m => motivos.add(m));
      }
      clusters.push({
        pessoas: lista.map(p => ({
          id: p.id, nome: p.nome, cpf: p.cpf || null, telefone: p.telefone || null,
          email: p.email || null, data_nascimento: p.data_nascimento || null,
          status: p.status || null, foto_url: p.foto_url || null, criado_em: p.created_at,
          grupos: gruposDe.get(p.id) || [],
        })).sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em)),
        motivos: [...motivos],
      });
    }
    // Confiança maior primeiro (chave forte > nome parecido)
    const peso = (ms) => ms.includes('mesmo CPF') ? 5 : ms.includes('mesmo telefone') ? 4
      : ms.includes('mesmo e-mail') ? 3 : ms.includes('mesmo nome e nascimento') ? 2 : 1;
    clusters.sort((a, b) => peso(b.motivos) - peso(a.motivos) || b.pessoas.length - a.pessoas.length);

    const payload = { clusters, total_pessoas_universo: ids.length };
    _dupCache = { ts: Date.now(), payload };
    res.json(payload);
  } catch (e) { console.error('[Grupos duplicatas]', e.message); res.status(500).json({ error: 'Erro ao analisar duplicatas' }); }
});

// POST /api/grupos/duplicatas/fundir — body { keep_id, merge_ids: [] }
// Funde os cadastros no escolhido via merge_membros (move FKs, enriquece o
// mantido com o que faltava, loga snapshot em mem_merge_log). Restrito ao
// universo de grupos — é o escopo da triagem.
// SOMAR, NÃO SUBSTITUIR (Marcos · 15/07): a RPC preenche o que FALTA no
// mantido; o que DIVERGE (outro e-mail/telefone, grafia do nome, nascimento
// diferente) não pode se perder — vira nota nas observações do cadastro
// mantido. O e-mail/telefone principal segue um só (concatenar no campo
// quebraria o matching), mas o alternativo fica visível na ficha.
router.post('/duplicatas/fundir', authorizeModule('grupos', 5), async (req, res) => {
  try {
    const { keep_id, merge_ids } = req.body || {};
    const merges = Array.isArray(merge_ids) ? [...new Set(merge_ids.filter(v => typeof v === 'string' && v && v !== keep_id))] : [];
    if (!keep_id || !merges.length) return res.status(400).json({ error: 'Informe keep_id e merge_ids' });
    if (merges.length > 10) return res.status(400).json({ error: 'Máximo de 10 cadastros por fusão' });

    // Escopo da triagem: PELO MENOS UM dos cadastros precisa ser do universo
    // de grupos — a duplicata dele pode ser um cadastro avulso da membresia
    // (ex.: conflito de CPF na edição da ficha · mesmo CPF = mesma pessoa).
    const gruposDe = await universoGrupos();
    const noUniverso = [keep_id, ...merges].some(id => gruposDe.has(id));
    if (!noUniverso) return res.status(403).json({ error: 'Nenhum destes cadastros é do universo de grupos — resolva pela Membresia.' });

    // Snapshot ANTES da fusão — é daqui que saem os divergentes a somar
    const { data: antes } = await supabase.from('mem_membros')
      .select('id, nome, cpf, telefone, email, data_nascimento')
      .in('id', [keep_id, ...merges]);
    const mergedAntes = (antes || []).filter(m => m.id !== keep_id);

    const { data, error } = await supabase.rpc('merge_membros', {
      p_keep_id: keep_id,
      p_merge_ids: merges,
      p_feito_por: req.user?.id || req.user?.userId || null,
      p_observacao: 'Fusão pela triagem de grupos (aba Duplicatas)',
    });
    if (error) throw error;
    _dupCache = { ts: 0, payload: null };

    // Divergências → observações do mantido (comparadas contra o keep PÓS-
    // fusão, que já absorveu os campos que estavam vazios). Nunca derruba a
    // fusão: se a nota falhar, o snapshot do mem_merge_log ainda guarda tudo.
    const dadosSomados = [];
    try {
      const { data: keepDepois } = await supabase.from('mem_membros')
        .select('nome, cpf, telefone, email, data_nascimento, observacoes').eq('id', keep_id).maybeSingle();
      if (keepDepois) {
        const emailK = normalizarEmail(keepDepois.email);
        const telK = normalizarTelefone(keepDepois.telefone);
        const nomeK = normalizarNome(keepDepois.nome);
        const cpfK = normalizarCpf(keepDepois.cpf);
        const vistos = new Set();
        const soma = (chave, texto) => { if (!vistos.has(chave)) { vistos.add(chave); dadosSomados.push(texto); } };
        const fmtBr = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso; };
        for (const m of mergedAntes) {
          const em = normalizarEmail(m.email);
          if (em && em !== emailK) soma(`em:${em}`, `e-mail alternativo: ${m.email}`);
          const tl = normalizarTelefone(m.telefone);
          if (tl && tl !== telK) soma(`tl:${tl}`, `telefone alternativo: ${m.telefone}`);
          const nm = normalizarNome(m.nome);
          if (nm && nm !== nomeK) soma(`nm:${nm}`, `também cadastrado como: ${m.nome}`);
          if (m.data_nascimento && keepDepois.data_nascimento && m.data_nascimento !== keepDepois.data_nascimento) {
            soma(`dt:${m.data_nascimento}`, `nascimento no cadastro fundido: ${fmtBr(m.data_nascimento)}`);
          }
          const cp = normalizarCpf(m.cpf);
          if (cp && cpfK && cp !== cpfK) soma(`cp:${cp}`, `CPF divergente no cadastro fundido: ${m.cpf}`);
        }
        if (dadosSomados.length) {
          const nota = `[Fusão de cadastros · ${new Date().toLocaleDateString('pt-BR')}] ${dadosSomados.join(' · ')}`.slice(0, 1500);
          const obs = keepDepois.observacoes ? `${keepDepois.observacoes}\n${nota}` : nota;
          await supabase.from('mem_membros').update({ observacoes: obs }).eq('id', keep_id);
        }
      }
    } catch (e) { console.error('[Grupos duplicatas fundir · nota]', e.message); }

    res.json({ ...(data && typeof data === 'object' ? data : {}), ok: true, dados_somados: dadosSomados });
  } catch (e) { console.error('[Grupos duplicatas fundir]', e.message); res.status(500).json({ error: e.message || 'Erro ao fundir cadastros' }); }
});

// POST /api/grupos/duplicatas/ignorar — body { ids: [] } · marca "não é
// duplicata" (todos os pares do cluster saem das próximas análises).
router.post('/duplicatas/ignorar', authorizeModule('grupos', 5), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.filter(v => typeof v === 'string' && v))] : [];
    if (ids.length < 2 || ids.length > 12) return res.status(400).json({ error: 'Informe de 2 a 12 ids' });
    const rows = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = [ids[i], ids[j]].sort();
        rows.push({ membro_a_id: a, membro_b_id: b, ignorado_por: req.user?.id || req.user?.userId || null, motivo: 'Triagem de grupos: não é duplicata' });
      }
    }
    const { error } = await supabase.from('mem_duplicados_ignorados')
      .upsert(rows, { onConflict: 'membro_a_id,membro_b_id' });
    if (error) throw error;
    _dupCache = { ts: 0, payload: null };
    res.json({ ok: true, pares: rows.length });
  } catch (e) { console.error('[Grupos duplicatas ignorar]', e.message); res.status(500).json({ error: 'Erro ao registrar a decisão' }); }
});

// ══════════════════════════════════════════════
// Redes (rede → supervisor → grupos) · ANTES das rotas /:id (Express casaria)
// ══════════════════════════════════════════════
router.get('/redes', async (req, res) => {
  try {
    const { data: redes, error } = await supabase.from('mem_redes')
      .select('id, nome, cor, supervisor_id, ativa').eq('ativa', true).order('nome');
    if (error) throw error;
    const supIds = [...new Set((redes || []).map(r => r.supervisor_id).filter(Boolean))];
    let sup = {};
    if (supIds.length) {
      const { data: ms } = await supabase.from('mem_membros').select('id, nome').in('id', supIds).is('deleted_at', null);
      (ms || []).forEach(m => { sup[m.id] = m.nome; });
    }
    res.json((redes || []).map(r => ({ ...r, supervisor_nome: sup[r.supervisor_id] || null })));
  } catch (e) { console.error('[Grupos redes]', e.message); res.status(500).json({ error: 'Erro ao listar redes' }); }
});

router.post('/redes', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const { nome, cor, supervisor_id } = req.body || {};
    if (!nome || !nome.trim()) return res.status(400).json({ error: 'Nome da rede obrigatório.' });
    const { data, error } = await supabase.from('mem_redes')
      .insert({ nome: nome.trim(), cor: cor || null, supervisor_id: supervisor_id || null }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { console.error('[Grupos rede create]', e.message); res.status(500).json({ error: 'Erro ao criar rede' }); }
});

router.put('/redes/:id', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const { nome, cor, supervisor_id, ativa } = req.body || {};
    const patch = { updated_at: new Date().toISOString() };
    if (nome !== undefined) patch.nome = nome;
    if (cor !== undefined) patch.cor = cor;
    if (supervisor_id !== undefined) patch.supervisor_id = supervisor_id || null;
    if (ativa !== undefined) patch.ativa = ativa;
    const { data, error } = await supabase.from('mem_redes').update(patch).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (e) { console.error('[Grupos rede update]', e.message); res.status(500).json({ error: 'Erro ao atualizar rede' }); }
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
    const [liderRes, origemRes, supRes] = await Promise.all([
      grupo.lider_id
        ? supabase.from('mem_membros').select('id, nome, telefone, email, foto_url').eq('id', grupo.lider_id).single()
        : Promise.resolve({ data: null }),
      grupo.grupo_origem_id
        ? supabase.from('mem_grupos').select('id, nome').eq('id', grupo.grupo_origem_id).single()
        : Promise.resolve({ data: null }),
      grupo.supervisor_id
        ? supabase.from('mem_membros').select('id, nome, foto_url').eq('id', grupo.supervisor_id).single()
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
      supervisor: supRes.data,
      grupo_origem: origemRes.data,
      multiplicacoes: multRes.data || [],
      membros,
      historico: (histRes.data || []).map(h => ({
        ...h, membro_nome: h.mem_membros?.nome, mem_membros: undefined,
      })),
    });
  } catch (e) { console.error('[Grupos get]', e.message); res.status(500).json({ error: 'Erro ao buscar grupo' }); }
});

// Normaliza idade_min/idade_max do form ('' → null · clamp defensivo 0-120).
// NULL = sem restrição — a trava do form público só age quando há limite.
function normIdade(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(120, Math.round(n)));
}

// POST /api/grupos
router.post('/', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const d = req.body;
    const idadeMin = normIdade(d.idade_min);
    const idadeMax = normIdade(d.idade_max);
    if (idadeMin != null && idadeMax != null && idadeMin > idadeMax) {
      return res.status(400).json({ error: 'Idade mínima maior que a máxima.' });
    }
    const { data, error } = await supabase.from('mem_grupos').insert({
      nome: d.nome, categoria: d.categoria || '', area: d.area || 'sede', lider_id: d.lider_id || null,
      local: d.local || '', endereco: d.endereco || '',
      dia_semana: d.dia_semana ?? null, horario: d.horario || null,
      recorrencia: d.recorrencia || 'semanal', tema: d.tema || '',
      foto_url: d.foto_url || null, observacoes: d.observacoes || '',
      grupo_origem_id: d.grupo_origem_id || null,
      lat: d.lat ?? null, lng: d.lng ?? null, cep: d.cep || null,
      complemento: d.complemento || null,
      bairro: d.bairro || null,
      faixa_etaria: d.faixa_etaria || null,
      idade_min: idadeMin,
      idade_max: idadeMax,
      capacidade: (d.capacidade === '' || d.capacidade == null) ? null : Number(d.capacidade),
      aceitando_inscricoes: d.aceitando_inscricoes !== false,
      rede_id: d.rede_id || null,
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
    const idadeMin = normIdade(d.idade_min);
    const idadeMax = normIdade(d.idade_max);
    if (idadeMin != null && idadeMax != null && idadeMin > idadeMax) {
      return res.status(400).json({ error: 'Idade mínima maior que a máxima.' });
    }
    const { data, error } = await supabase.from('mem_grupos').update({
      nome: d.nome, categoria: d.categoria || '', area: d.area || 'sede', lider_id: d.lider_id || null,
      local: d.local || '', endereco: d.endereco || '',
      dia_semana: d.dia_semana ?? null, horario: d.horario || null,
      recorrencia: d.recorrencia || 'semanal', tema: d.tema || '',
      foto_url: d.foto_url || null, observacoes: d.observacoes || '',
      grupo_origem_id: d.grupo_origem_id || null,
      lat: d.lat ?? null, lng: d.lng ?? null, cep: d.cep || null,
      complemento: d.complemento || null,
      bairro: d.bairro || null,
      faixa_etaria: d.faixa_etaria || null,
      idade_min: idadeMin,
      idade_max: idadeMax,
      capacidade: (d.capacidade === '' || d.capacidade == null) ? null : Number(d.capacidade),
      aceitando_inscricoes: d.aceitando_inscricoes !== false,
      rede_id: d.rede_id || null,
      status_temporada: d.status_temporada || null,
      temporada: d.temporada || null,
      descricao: d.descricao || '', ativo: d.ativo ?? true,
    }).eq('id', req.params.id).select().single();
    if (error) throw error;
    syncWhatsappLideres();
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar grupo' }); }
});

// PATCH /api/grupos/:id/aceitando — toggle parcial de aceitando_inscricoes
// (o PUT /:id é update completo; este PATCH muda SÓ o toggle, usado pelo
// atalho "pausar/retomar inscrições" na tela de pedidos).
router.patch('/:id/aceitando', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const aceitando = req.body?.aceitando === true;
    const { data, error } = await supabase.from('mem_grupos')
      .update({ aceitando_inscricoes: aceitando })
      .eq('id', req.params.id).select('id, nome, aceitando_inscricoes').single();
    if (error) throw error;
    res.json(data);
  } catch (e) { console.error('[Grupos aceitando]', e.message); res.status(500).json({ error: 'Erro ao atualizar grupo' }); }
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
    // No modo somente_sem_coords o lote MUTA o filtro (grupos geocodados saem da
    // query), então paginar por offset numérico PULA grupos. Nesse modo, sempre
    // offset 0 — o conjunto encolhe sozinho a cada chamada até zerar.
    const OFFSET = somente_sem_coords ? 0 : Math.max(parseInt(offset, 10) || 0, 0);

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

      // Helper: consulta Nominatim (countrycodes=br) e valida que cai no RJ
      // metropolitano/Baixada (evita match errado em outra cidade homônima).
      const inRJ = (lat, lng) => lat <= -21.8 && lat >= -23.6 && lng <= -42.4 && lng >= -44.3;
      const nominatim = async (q) => {
        try {
          const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=br`;
          const nom = await fetch(url, { headers: { 'User-Agent': userAgent } }).then(r => r.json());
          if (nom?.[0]) {
            const la = parseFloat(nom[0].lat), ln = parseFloat(nom[0].lon);
            if (inRJ(la, ln)) return { lat: la, lng: ln };
          }
        } catch (e) { /* segue */ }
        return null;
      };
      const endUtil = (e) => e && !/endere[çc]o\s+n[ãa]o\s+informado/i.test(e) && e.replace(/\W/g, '').length >= 4;
      const semNumero = (e) => String(e || '').replace(/,?\s*\d+\s*$/, '').trim();
      const bairro = (g.bairro || '').trim();

      // Tenta via CEP se tiver
      const cepLimpo = (g.cep || '').replace(/\D/g, '');
      if (cepLimpo.length === 8) {
        try {
          const vc = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`).then(r => r.json());
          if (!vc.erro) {
            await sleep(1100);
            const hit = await nominatim(`${vc.logradouro || ''} ${vc.bairro || ''} ${vc.localidade} ${vc.uf} Brasil`.trim());
            if (hit) { foundLat = hit.lat; foundLng = hit.lng; fonte = 'cep'; }
          }
        } catch (e) { /* segue tentando */ }
      }

      // Texto livre: usa endereco (rua+número) ou local, + bairro
      const ruaBase = endUtil(g.endereco) ? g.endereco.trim() : (g.local || '').trim();
      if ((foundLat == null || foundLng == null) && ruaBase) {
        const tentativas = [
          `${ruaBase}, ${bairro}, Rio de Janeiro, RJ, Brasil`,
          `${ruaBase}, ${bairro}, RJ, Brasil`,
          `${semNumero(ruaBase)}, ${bairro}, Rio de Janeiro, RJ, Brasil`,
        ].filter((q, i, a) => q && a.indexOf(q) === i);
        for (const q of tentativas) {
          await sleep(1100);
          const hit = await nominatim(q);
          if (hit) { foundLat = hit.lat; foundLng = hit.lng; fonte = 'texto_endereco'; break; }
        }
      }

      // Último fallback: centroide do bairro (pin aproximado no bairro certo)
      if ((foundLat == null || foundLng == null) && bairro) {
        for (const q of [`${bairro}, Rio de Janeiro, RJ, Brasil`, `${bairro}, RJ, Brasil`]) {
          await sleep(1100);
          const hit = await nominatim(q);
          if (hit) { foundLat = hit.lat; foundLng = hit.lng; fonte = 'bairro'; break; }
        }
      }

      if (foundLat != null && foundLng != null) {
        await supabase.from('mem_grupos').update({ lat: foundLat, lng: foundLng }).eq('id', g.id);
        ok.push({ id: g.id, codigo: g.codigo, nome: g.nome, fonte, lat: foundLat, lng: foundLng });
      } else {
        falhas.push({
          id: g.id, codigo: g.codigo, nome: g.nome,
          local: g.local, endereco: g.endereco, bairro: g.bairro, cep: g.cep,
          motivo: (ruaBase || bairro) ? 'nao_geocodou' : 'sem_endereco',
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

// GET /api/grupos/:id/candidatos-adicionar — lista enxuta pro botão "Adicionar
// pessoa". Em vez da base inteira, só quem está no FUNIL DE ENTRADA de grupos:
//   (1) direcionados do Next → grupos (pendentes · servem pra qualquer grupo)
//   (2) pedidos de inscrição PENDENTES deste grupo
// Exclui quem já está ativo em algum grupo e deduplica por pessoa. Ao escolher,
// o frontend resolve a origem (engajar do Next / aprovar o pedido), então a
// pessoa sai da fila e o vínculo (NSM/KPI) é materializado pela máquina existente.
router.get('/:id/candidatos-adicionar', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const grupoId = req.params.id;
    // "pendente" do encaminhamento = ainda não resolvido (mesma régua do badge da caixa)
    const STATUS_PEND = ['pendente', 'nao_respondeu', 'em_duvida'];

    const [{ data: encs }, { data: peds }] = await Promise.all([
      supabase.from('jornada_encaminhamentos')
        .select('id, nome, membro_id, convertido_id, origem, status')
        .eq('destino', 'grupos').in('status', STATUS_PEND).is('deleted_at', null),
      supabase.from('mem_grupo_pedidos')
        .select('id, nome, telefone, membro_id, cadastro_pendente_id, origem, status')
        .eq('grupo_id', grupoId).eq('status', 'pendente'),
    ]);

    // Resolve membro_id dos encaminhamentos que só têm convertido_id
    const convIds = [...new Set((encs || []).filter(e => !e.membro_id && e.convertido_id).map(e => e.convertido_id))];
    const convMap = {};
    if (convIds.length) {
      const { data: convs } = await supabase.from('cui_convertidos')
        .select('id, membro_id').in('id', convIds);
      (convs || []).forEach(c => { convMap[c.id] = c.membro_id; });
    }

    // Quem já está ativo em algum grupo sai da fila + nome/telefone de fallback
    const membroIds = [...new Set([
      ...(encs || []).map(e => e.membro_id || convMap[e.convertido_id]).filter(Boolean),
      ...(peds || []).map(p => p.membro_id).filter(Boolean),
    ])];
    const ativosSet = new Set();
    const memMap = {};
    if (membroIds.length) {
      const [{ data: ativos }, { data: mems }] = await Promise.all([
        supabase.from('mem_grupo_membros').select('membro_id')
          .in('membro_id', membroIds).is('saiu_em', null).is('deleted_at', null),
        supabase.from('mem_membros').select('id, nome, telefone')
          .in('id', membroIds).is('deleted_at', null),
      ]);
      (ativos || []).forEach(a => ativosSet.add(a.membro_id));
      (mems || []).forEach(m => { memMap[m.id] = m; });
    }

    const out = [];
    const seen = new Set(); // dedup por pessoa (membro_id)

    // (1) Next primeiro — agnóstico de grupo. Sem membro_id resolvível, pula
    // (órfão · precisa reconciliar antes de poder ser colocado no grupo).
    for (const e of (encs || [])) {
      const mid = e.membro_id || convMap[e.convertido_id] || null;
      if (!mid || ativosSet.has(mid) || seen.has(mid)) continue;
      seen.add(mid);
      out.push({
        tipo: 'next', fonte_id: e.id, membro_id: mid,
        nome: e.nome || memMap[mid]?.nome || 'Sem nome',
        telefone: memMap[mid]?.telefone || null,
        origem: e.origem || 'next',
      });
    }
    // (2) Pedidos deste grupo (cadastro pendente sem membro_id é válido · o
    // aprovar resolve a pessoa pelo matcher)
    for (const p of (peds || [])) {
      const mid = p.membro_id || null;
      if (mid && (ativosSet.has(mid) || seen.has(mid))) continue;
      if (mid) seen.add(mid);
      out.push({
        tipo: 'inscricao', fonte_id: p.id, membro_id: mid,
        nome: p.nome || (mid && memMap[mid]?.nome) || 'Sem nome',
        telefone: p.telefone || (mid && memMap[mid]?.telefone) || null,
        origem: p.origem || 'inscricao',
      });
    }

    out.sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
    res.json(out);
  } catch (e) {
    console.error('[Grupos candidatos-adicionar]', e.message);
    res.status(500).json({ error: 'Erro ao listar candidatos' });
  }
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
          ultima_frequencia: null,
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
    // Confia na função real (o trigger fn_grupo_auto_membro mantém visitante →
    // frequentador no 4º check-in). NÃO rebaixa por contagem de presenças: os
    // membros atuais são Membro por decisão do Marcos; visitante é só pro novo
    // entrante. Alinha com o Tipo do detalhe do grupo (#1200) e o default #1207.
    Object.values(pessoas).forEach(pe => { if (!pe.papel) pe.papel = 'frequentador'; });

    // Data da última presença em grupo (status de frequência da aba Pessoas)
    try {
      const { data: freqRows, error: eF } = await supabase.rpc('fn_grupos_ultima_frequencia');
      if (eF) throw eF;
      (freqRows || []).forEach(f => {
        if (pessoas[f.membro_id]) pessoas[f.membro_id].ultima_frequencia = f.ultima_data || null;
      });
    } catch (eFreq) {
      console.error('[grupos] ultima_frequencia:', eFreq.message); // best-effort · não derruba a lista
    }

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

// ───────────────────────────────────────────────────────────────────────────
// Import de LÍDERES dos grupos (planilha) · casa o líder de cada grupo com o
// cadastro de membros (IA · review-before-apply) e grava mem_grupos.lider_id.
function _normTxt(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

// Lê .xlsx/.csv e devolve [{ grupo, lider }] detectando as colunas pelo cabeçalho.
function _parseGrupoLideres(buffer) {
  const XLSX = require('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false });
  const linhas = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    let cg = -1, cl = -1, hdr = -1;
    for (let i = 0; i < Math.min(aoa.length, 12); i++) {
      const cells = (aoa[i] || []).map(c => _normTxt(c));
      const gi = cells.findIndex(c => /(nome do grupo|grupo|celula|conex)/.test(c) && !/(lider|responsav)/.test(c));
      const li = cells.findIndex(c => /(lider|responsav|anfitri)/.test(c));
      if (gi >= 0 && li >= 0) { hdr = i; cg = gi; cl = li; break; }
    }
    if (hdr < 0) continue;
    for (let i = hdr + 1; i < aoa.length; i++) {
      const r = aoa[i] || [];
      const grupo = String(r[cg] ?? '').trim();
      const lider = String(r[cl] ?? '').trim();
      if (grupo && lider) linhas.push({ grupo, lider });
    }
  }
  return linhas;
}

// POST /api/grupos/importar-lideres/analisar (multipart 'arquivo') · NÃO grava.
router.post('/importar-lideres/analisar', authorizeModule('grupos', 3), uploadMw.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Envie o arquivo em "arquivo".' });
    let linhas;
    try { linhas = _parseGrupoLideres(req.file.buffer); }
    catch (e) { return res.status(400).json({ error: 'Não consegui ler o arquivo (.xlsx ou .csv).' }); }
    if (!linhas.length) return res.status(400).json({ error: 'Não achei as colunas. A planilha precisa de um cabeçalho com colunas tipo "Grupo" e "Líder".' });

    // grupos ativos · map por nome normalizado
    const { data: grupos } = await supabase.from('mem_grupos').select('id, nome, lider_id').eq('ativo', true);
    const gmap = new Map();
    for (const g of grupos || []) gmap.set(_normTxt(g.nome), g);

    // nomes dos líderes atuais (pra mostrar o que já está lá)
    const liderIds = [...new Set((grupos || []).map(g => g.lider_id).filter(Boolean))];
    const liderNomes = new Map();
    for (let i = 0; i < liderIds.length; i += 400) {
      const { data } = await supabase.from('mem_membros').select('id, nome').in('id', liderIds.slice(i, i + 400)).is('deleted_at', null);
      for (const m of data || []) liderNomes.set(m.id, m.nome);
    }

    // membros (paginado) → perfis pra IA
    const membros = [];
    let from = 0;
    while (true) {
      const { data } = await supabase.from('mem_membros').select('id, nome').is('deleted_at', null).range(from, from + 999);
      if (!data || !data.length) break;
      membros.push(...data);
      if (data.length < 1000) break;
      from += 1000;
    }
    const perfis = membros.map(m => ({ id: m.id, full_name: m.nome }));

    // casa os nomes de líder com os membros (IA)
    const nomesLider = [...new Set(linhas.map(l => l.lider))].map(n => ({ nome_norm: _normTxt(n), nome: n }));
    const { sugerirVinculos } = require('../services/volVinculoIA');
    const sug = await sugerirVinculos(nomesLider, perfis);
    const sugPorNome = new Map(sug.map(s => [s.nome_norm, s]));

    const vistos = new Set();
    const itens = [];
    for (const l of linhas) {
      const chave = _normTxt(l.grupo) + '|' + _normTxt(l.lider);
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      const g = gmap.get(_normTxt(l.grupo));
      const s = sugPorNome.get(_normTxt(l.lider));
      itens.push({
        grupo_planilha: l.grupo,
        grupo_id: g?.id || null,
        grupo_nome: g?.nome || null,
        lider_planilha: l.lider,
        sugestao: g && s?.sugestao ? { membro_id: s.sugestao.profile_id, nome: s.sugestao.full_name } : null,
        confianca: !g ? 'grupo_nao_encontrado' : (s?.confianca || 'nenhuma'),
        lider_atual_nome: g?.lider_id ? (liderNomes.get(g.lider_id) || null) : null,
      });
    }
    res.json({ itens });
  } catch (e) {
    console.error('[grupos] importar-lideres analisar', e.message);
    res.status(500).json({ error: 'Erro ao analisar a planilha' });
  }
});

// POST /api/grupos/importar-lideres/aplicar { vinculos: [{ grupo_id, membro_id }] }
router.post('/importar-lideres/aplicar', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const vinculos = Array.isArray(req.body?.vinculos) ? req.body.vinculos : [];
    let aplicados = 0;
    for (const v of vinculos) {
      if (!v?.grupo_id || !v?.membro_id) continue;
      const { error } = await supabase.from('mem_grupos').update({ lider_id: v.membro_id }).eq('id', v.grupo_id);
      if (!error) aplicados += 1;
    }
    res.json({ aplicados });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao aplicar os líderes' });
  }
});

module.exports = router;
// Compartilhado com a rota pública de aprovação por token (publicGrupos.js /aprovar)
module.exports.aprovarPedidoCore = aprovarPedidoCore;
