const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const multer = require('multer');
const { uploadModuleFile, SHAREPOINT_CONFIGURED } = require('../services/storageService');

const uploadMw = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const sanitizePath = (s) => (s || '').replace(/[^a-zA-Z0-9\-_ ]/g, '').trim();

router.use(authenticate);

// GET /api/grupos — lista todos com contagem de membros e lider
router.get('/', async (req, res) => {
  try {
    const { ativo, categoria } = req.query;
    let q = supabase.from('mem_grupos').select('*');
    if (ativo !== undefined) q = q.eq('ativo', ativo === 'true');
    else q = q.eq('ativo', true);
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
// CRUD do grupo (rotas com /:id por ultimo)
// ══════════════════════════════════════════════

// GET /api/grupos/:id — detalhe com membros
router.get('/:id', async (req, res) => {
  try {
    const { data: grupo, error } = await supabase.from('mem_grupos').select('*').eq('id', req.params.id).single();
    if (error) throw error;

    // Membros ativos
    const { data: participacoes } = await supabase.from('mem_grupo_membros')
      .select('*, mem_membros(id, nome, telefone, email, foto_url, status, data_nascimento)')
      .eq('grupo_id', req.params.id).is('saiu_em', null).order('entrou_em');

    // Historico (quem saiu)
    const { data: historico } = await supabase.from('mem_grupo_membros')
      .select('*, mem_membros(id, nome)')
      .eq('grupo_id', req.params.id).not('saiu_em', 'is', null).order('saiu_em', { ascending: false });

    // Lider
    let lider = null;
    if (grupo.lider_id) {
      const { data } = await supabase.from('mem_membros').select('id, nome, telefone, email, foto_url').eq('id', grupo.lider_id).single();
      lider = data;
    }

    // Grupo de origem
    let grupoOrigem = null;
    if (grupo.grupo_origem_id) {
      const { data } = await supabase.from('mem_grupos').select('id, nome').eq('id', grupo.grupo_origem_id).single();
      grupoOrigem = data;
    }

    // Multiplicacoes (grupos que nasceram deste)
    const { data: multiplicacoes } = await supabase.from('mem_grupos').select('id, nome, ativo')
      .eq('grupo_origem_id', req.params.id).order('nome');

    const membros = (participacoes || []).map(p => ({
      participacao_id: p.id,
      entrou_em: p.entrou_em,
      presencas: p.presencas || 0,
      is_visitante: (p.presencas || 0) < 3,
      ...p.mem_membros,
    }));

    res.json({
      ...grupo,
      lider,
      grupo_origem: grupoOrigem,
      multiplicacoes: multiplicacoes || [],
      membros,
      historico: (historico || []).map(h => ({
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
    res.json(data);
  } catch (e) { console.error('[Grupos add member]', e.message); res.status(500).json({ error: 'Erro ao adicionar membro' }); }
});

module.exports = router;
