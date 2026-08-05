const router = require('express').Router();
// authorizeModule('grupos', N) respeita a matriz cargo×módulo + boost de área
// (Nélio/Natasha, donos do módulo, têm nível 5 via área Grupos mas role
// 'assistente' — o authorize() por role os bloqueava nas rotas de escrita).
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { acharOuCriarGuardado, normalizarNome, normalizarCpf, normalizarTelefone, normalizarEmail } = require('../services/membroMatch');
const { avaliarPossivelDuplicidade } = require('../services/duplicidadePolicy');
const { montarPatchFusao } = require('../services/fusaoCampos');
const multer = require('multer');
const { uploadModuleFile, SHAREPOINT_CONFIGURED } = require('../services/storageService');
const { notificar } = require('../services/notificar');
const { importarParticipantes } = require('../services/gruposImporter');
const { notificarPessoaAprovada, notificarPessoaSugestao, montarEnvioRenovacao } = require('../services/gruposWhatsapp');
const { enfileirarLote } = require('../services/whatsappFila');
const { configurado: whatsappConfigurado } = require('../services/whatsappService');
const gruposEnvios = require('../services/gruposEnvios');
const gruposEnviosConfig = require('../services/gruposEnviosConfig');
const { registrarEventoPedido } = require('../services/grupoPedidoEventos');
// Régua única de "dá pra falar com essa pessoa?" (varredura do lançamento 02/08)
const { classificarContato, digitos: contatoDigitos } = require('../services/contatoPessoa');

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

    // Buscar contagem de membros ativos por grupo · PAGINADO (o roster passa de
    // 1000 linhas · sem paginar, o cap do PostgREST subcontava os grupos e
    // quebrava a ordenação por tamanho). Filtra soft-deletados.
    const participacoes = [];
    {
      let from = 0; const size = 1000;
      for (;;) {
        const { data: page, error: eP } = await supabase.from('mem_grupo_membros')
          .select('grupo_id').is('saiu_em', null).is('deleted_at', null)
          .range(from, from + size - 1);
        if (eP) throw eP;
        participacoes.push(...(page || []));
        if (!page || page.length < size) break;
        from += size;
      }
    }

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

// GET /api/grupos/:id/entradas-saidas — histórico simples de quem entrou e saiu
// ⚠️ Pedido do Marcos (05/08/2026), com o formato definido por ele: "deve ser uma
// tela pequena, com pouco destaque, como se fosse uma tela de histórico de
// entradas e saídas SEM MUITA INTERAÇÃO". Então é leitura pura — nenhuma ação
// aqui. Aprovar pedido (inclusive transferência vinda do app) continua onde
// sempre foi: a Caixa de entrada.
// Saída é soft (`saiu_em`), então a MESMA linha do roster aparece como entrada e,
// se a pessoa saiu, também como saída.
router.get('/:id/entradas-saidas', async (req, res) => {
  try {
    const { data, error } = await supabase.from('mem_grupo_membros')
      .select('id, entrou_em, saiu_em, motivo_saida, funcao, created_at, membro:mem_membros(id, nome)')
      .eq('grupo_id', req.params.id).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(200);
    if (error) throw error;

    const eventos = [];
    for (const r of data || []) {
      const m = Array.isArray(r.membro) ? r.membro[0] : r.membro;
      const nome = m?.nome || '—';
      eventos.push({
        tipo: 'entrada', nome, membro_id: m?.id || null, funcao: r.funcao || null,
        data: r.entrou_em || (r.created_at ? String(r.created_at).slice(0, 10) : null),
        motivo: null,
      });
      if (r.saiu_em) {
        eventos.push({
          tipo: 'saida', nome, membro_id: m?.id || null, funcao: r.funcao || null,
          data: String(r.saiu_em).slice(0, 10), motivo: r.motivo_saida || null,
        });
      }
    }
    eventos.sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
    res.json({ eventos: eventos.slice(0, 60) });
  } catch (e) {
    console.error('[Grupos entradas-saidas]', e.message);
    res.status(500).json({ error: 'Erro ao buscar o histórico' });
  }
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

// Status de frequência POR pessoa a partir da data da última presença (mesma
// régua da aba Pessoas · Marcos 2026-07-23): em dia ≤30d · atenção 31-90d ·
// ausente >90d · sem_presenca = nunca teve presença (neutro).
function statusFrequenciaPorData(ultimaData) {
  if (!ultimaData) return 'sem_presenca';
  const dias = Math.floor((Date.now() - new Date(ultimaData + 'T12:00:00').getTime()) / 86400000);
  if (dias <= 30) return 'em_dia';
  if (dias <= 90) return 'atencao';
  return 'ausente';
}

// GET /api/grupos/:id/frequencia — frequência DAQUELE grupo (Marcos 2026-07-23:
// "quem não está indo naquele grupo" + % de frequência). % = presenças ÷
// (encontros × inscritos). Inscritos do grupo = roster ativo ∪ líder ∪
// supervisor (todos deviam comparecer). Nasce vazio até a 1ª chamada.
router.get('/:id/frequencia', async (req, res) => {
  try {
    const id = req.params.id;
    const { data: grupo, error: eG } = await supabase.from('mem_grupos')
      .select('id, nome, lider_id, supervisor_id').eq('id', id).is('deleted_at', null).single();
    if (eG || !grupo) return res.status(404).json({ error: 'Grupo não encontrado' });

    const { data: encontros } = await supabase.from('mem_grupo_encontros')
      .select('id, data').eq('grupo_id', id).is('deleted_at', null).order('data', { ascending: true });
    const encData = {}; (encontros || []).forEach(e => { encData[e.id] = e.data; });
    const encIds = Object.keys(encData);

    // Inscritos do grupo (papel por pessoa · líder/supervisor entram)
    const { data: roster } = await supabase.from('mem_grupo_membros')
      .select('membro_id, funcao').eq('grupo_id', id).is('saiu_em', null).is('deleted_at', null);
    const papelDe = new Map();
    (roster || []).forEach(r => { if (r.membro_id) papelDe.set(r.membro_id, r.funcao || 'membro'); });
    if (grupo.lider_id) papelDe.set(grupo.lider_id, 'lider');
    if (grupo.supervisor_id && !papelDe.has(grupo.supervisor_id)) papelDe.set(grupo.supervisor_id, 'supervisor');
    const inscritoIds = [...papelDe.keys()];

    // Presenças da pessoa NESTE grupo (contagem + última data)
    const presDe = {}; // membro_id -> { count, ultima }
    for (let i = 0; i < encIds.length; i += 200) {
      const { data: pres } = await supabase.from('mem_grupo_encontro_presencas')
        .select('encontro_id, membro_id').eq('presente', true).in('encontro_id', encIds.slice(i, i + 200));
      (pres || []).forEach(p => {
        const d = encData[p.encontro_id];
        const cur = presDe[p.membro_id] || { count: 0, ultima: null };
        cur.count += 1;
        if (d && (!cur.ultima || d > cur.ultima)) cur.ultima = d;
        presDe[p.membro_id] = cur;
      });
    }

    // Nomes
    const nomes = {};
    for (let i = 0; i < inscritoIds.length; i += 400) {
      const { data: ms } = await supabase.from('mem_membros')
        .select('id, nome, telefone').in('id', inscritoIds.slice(i, i + 400)).is('deleted_at', null);
      (ms || []).forEach(m => { nomes[m.id] = m; });
    }

    const nEnc = encIds.length;
    const nInsc = inscritoIds.length;
    let totalPres = 0;
    const membros = inscritoIds.map(mid => {
      const pm = presDe[mid] || { count: 0, ultima: null };
      totalPres += pm.count;
      return {
        membro_id: mid, nome: nomes[mid]?.nome || '—', telefone: nomes[mid]?.telefone || null,
        papel: papelDe.get(mid), presencas: pm.count, ultima: pm.ultima,
        status: statusFrequenciaPorData(pm.ultima),
      };
    }).sort((a, b) => a.presencas - b.presencas || (a.nome || '').localeCompare(b.nome || ''));

    res.json({
      grupo_id: id, nome: grupo.nome,
      total_encontros: nEnc, total_inscritos: nInsc,
      presenca_media: nEnc > 0 ? Math.round((totalPres / nEnc) * 10) / 10 : 0,
      pct_frequencia: (nEnc > 0 && nInsc > 0) ? Math.round((totalPres / (nEnc * nInsc)) * 100) : 0,
      tem_encontro: nEnc > 0,
      membros,
    });
  } catch (e) { console.error('[Grupos frequencia grupo]', e.message); res.status(500).json({ error: 'Erro ao calcular a frequência do grupo' }); }
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

// GET /api/grupos/kpis/frequencia-grupos?temporada=X — ranking de % de frequência
// POR grupo (Marcos 2026-07-23: indicador por grupo pra achar quem está caindo).
// Mesma definição do /:id/frequencia (% = presenças ÷ (encontros × inscritos),
// inscritos = roster ∪ líder ∪ supervisor). Pior primeiro. Vazio até a 1ª chamada.
router.get('/kpis/frequencia-grupos', async (req, res) => {
  try {
    const { temporada } = req.query;
    let q = supabase.from('mem_grupos')
      .select('id, nome, lider_id, supervisor_id').eq('ativo', true).is('deleted_at', null);
    if (temporada) q = q.eq('temporada', temporada);
    const { data: grupos } = await q;
    if (!grupos?.length) return res.json({ tem_encontro: false, grupos: [] });
    const grupoIds = grupos.map(g => g.id);

    // Encontros de todos os grupos (data por encontro + grupo do encontro)
    const encGrupo = {}; const encData = {}; const encDoGrupo = {};
    for (let i = 0; i < grupoIds.length; i += 200) {
      const { data: enc } = await supabase.from('mem_grupo_encontros')
        .select('id, grupo_id, data').is('deleted_at', null).in('grupo_id', grupoIds.slice(i, i + 200));
      (enc || []).forEach(e => { encGrupo[e.id] = e.grupo_id; encData[e.id] = e.data; (encDoGrupo[e.grupo_id] = encDoGrupo[e.grupo_id] || []).push(e.id); });
    }
    const allEncIds = Object.keys(encGrupo);

    // Inscritos por grupo (roster ∪ líder ∪ supervisor · distinct)
    const inscDoGrupo = {}; // grupo_id -> Set(membro_id)
    grupos.forEach(g => { inscDoGrupo[g.id] = new Set(); if (g.lider_id) inscDoGrupo[g.id].add(g.lider_id); if (g.supervisor_id) inscDoGrupo[g.id].add(g.supervisor_id); });
    for (let off = 0; ; off += 1000) {
      const { data: pg } = await supabase.from('mem_grupo_membros')
        .select('membro_id, grupo_id').in('grupo_id', grupoIds)
        .is('saiu_em', null).is('deleted_at', null).order('id').range(off, off + 999);
      (pg || []).forEach(v => { if (v.membro_id && inscDoGrupo[v.grupo_id]) inscDoGrupo[v.grupo_id].add(v.membro_id); });
      if (!pg || pg.length < 1000) break;
    }

    // Total de presenças por grupo
    const presGrupo = {}; // grupo_id -> total presenças
    for (let i = 0; i < allEncIds.length; i += 200) {
      const { data: pres } = await supabase.from('mem_grupo_encontro_presencas')
        .select('encontro_id').eq('presente', true).in('encontro_id', allEncIds.slice(i, i + 200));
      (pres || []).forEach(p => { const gid = encGrupo[p.encontro_id]; if (gid) presGrupo[gid] = (presGrupo[gid] || 0) + 1; });
    }

    const ranking = grupos.map(g => {
      const nEnc = (encDoGrupo[g.id] || []).length;
      const nInsc = inscDoGrupo[g.id].size;
      const totalPres = presGrupo[g.id] || 0;
      return {
        grupo_id: g.id, nome: g.nome,
        total_encontros: nEnc, total_inscritos: nInsc,
        presenca_media: nEnc > 0 ? Math.round((totalPres / nEnc) * 10) / 10 : 0,
        pct_frequencia: (nEnc > 0 && nInsc > 0) ? Math.round((totalPres / (nEnc * nInsc)) * 100) : 0,
        tem_encontro: nEnc > 0,
      };
    }).sort((a, b) => (b.tem_encontro - a.tem_encontro) || (a.pct_frequencia - b.pct_frequencia) || (a.nome || '').localeCompare(b.nome || ''));

    res.json({ tem_encontro: allEncIds.length > 0, grupos: ranking });
  } catch (e) { console.error('[Grupos frequencia-grupos]', e.message); res.status(500).json({ error: 'Erro ao gerar o ranking de frequência' }); }
});

// GET /api/grupos/kpis/temporada-metricas?temporada=X — conjunto COMPLETO de
// indicadores de UMA temporada, AO VIVO, pela MESMA função que a consolidação
// congela (fn_temporada_metricas). Garante que o relatório filtrado por
// temporada bate exatamente com o que vai pro histórico ao consolidar (Marcos
// 17/07: "indicadores completos · certeza de que coleta certo"). Nível 1.
router.get('/kpis/temporada-metricas', async (req, res) => {
  try {
    const { temporada } = req.query;
    if (!temporada) return res.status(400).json({ error: 'Informe a temporada' });
    const { data, error } = await supabase.rpc('fn_temporada_metricas', { p_temporada: temporada });
    if (error) throw error;
    // fn_temporada_metricas RETURNS TABLE → array com 1 linha.
    const met = (Array.isArray(data) ? data[0] : data) || {};

    // Vocabulário canônico (Marcos 2026-07-23):
    // - Pessoas = pessoas distintas (roster ∪ líder ∪ supervisor).
    // - Inscritos = TODA conexão pessoa×grupo (roster + liderar + supervisionar) ·
    //   o líder/supervisor também "se inscreveu naquele grupo" (Marcos 23/07) —
    //   por isso NÃO usamos num_membros da RPC (que conta só o roster).
    // - Frequentadores (>=1 presença) / Visitantes (0 presença) DERIVADOS da presença.
    try {
      const { data: gs } = await supabase.from('mem_grupos')
        .select('id, lider_id, supervisor_id').eq('temporada', temporada)
        .eq('ativo', true).is('deleted_at', null).limit(2000);
      const gids = (gs || []).map(g => g.id);
      const pessoas = new Set();            // membro_id distintos
      const conex = new Set();              // 'membro_id|grupo_id' distintos = Inscritos
      if (gids.length) {
        for (let off = 0; ; off += 1000) {
          const { data: pg } = await supabase.from('mem_grupo_membros')
            .select('membro_id, grupo_id').in('grupo_id', gids)
            .is('saiu_em', null).is('deleted_at', null).order('id').range(off, off + 999);
          (pg || []).forEach(v => { if (v.membro_id) { pessoas.add(v.membro_id); conex.add(v.membro_id + '|' + v.grupo_id); } });
          if (!pg || pg.length < 1000) break;
        }
      }
      // Líder e supervisor de cada grupo também contam (pessoa + inscrição)
      (gs || []).forEach(g => {
        if (g.lider_id) { pessoas.add(g.lider_id); conex.add(g.lider_id + '|' + g.id); }
        if (g.supervisor_id) { pessoas.add(g.supervisor_id); conex.add(g.supervisor_id + '|' + g.id); }
      });
      // Quem tem >=1 presença (fn_grupos_ultima_frequencia = grupos ativos)
      const comPresenca = new Set();
      try {
        const { data: fr } = await supabase.rpc('fn_grupos_ultima_frequencia');
        (fr || []).forEach(f => { if (pessoas.has(f.membro_id)) comPresenca.add(f.membro_id); });
      } catch { /* best-effort */ }
      met.pessoas_distintas = pessoas.size;
      met.inscritos = conex.size;                       // conexões pessoa×grupo (todos os papéis)
      met.frequentadores = comPresenca.size;            // pessoas com >=1 presença
      met.visitantes = pessoas.size - comPresenca.size; // inscritos sem presença ainda
      met.tem_presenca = comPresenca.size > 0;          // frequência já começou?
    } catch (eCalc) { console.error('[temporada-metricas derivados]', eCalc.message); }

    res.json(met);
  } catch (e) {
    console.error('[Grupos temporada-metricas]', e.message);
    res.status(500).json({ error: 'Erro ao buscar as métricas da temporada' });
  }
});

// GET /api/grupos/kpis/temporada-series?temporada=X — séries mensais
// (frequência, inscrições, membresia) + tamanho/média dos grupos, escopadas
// pela janela de data da temporada (fn_temporada_series · cap-safe em SQL).
router.get('/kpis/temporada-series', async (req, res) => {
  try {
    const { temporada } = req.query;
    if (!temporada) return res.status(400).json({ error: 'Informe a temporada' });
    const { data, error } = await supabase.rpc('fn_temporada_series', { p_temporada: temporada });
    if (error) throw error;
    res.json(data || { serie: [], tamanho: null });
  } catch (e) {
    console.error('[Grupos temporada-series]', e.message);
    res.status(500).json({ error: 'Erro ao buscar as séries da temporada' });
  }
});

// GET /api/grupos/kpis/sem-presenca?temporada=X — revisão de fim de temporada:
// membros (só participantes · nunca liderança) sem NENHUMA presença na temporada,
// agrupados por grupo · SÓ grupos que registraram encontro (fn_temporada_sem_presenca).
// Nível 3 (expõe lista de pessoas pra ação de remoção · gate humano na UI).
router.get('/kpis/sem-presenca', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const { temporada } = req.query;
    if (!temporada) return res.status(400).json({ error: 'Informe a temporada' });
    const { data, error } = await supabase.rpc('fn_temporada_sem_presenca', { p_temporada: temporada });
    if (error) throw error;
    res.json(Array.isArray(data) ? data : (data || []));
  } catch (e) {
    console.error('[Grupos sem-presenca]', e.message);
    res.status(500).json({ error: 'Erro ao buscar a revisão de frequência' });
  }
});

// GET /api/grupos/kpis/prontidao?temporada=X — checklist de prontidão pra abrir a
// temporada: grupos sem líder, líder sem WhatsApp válido, grupos sem supervisor e
// grupos ainda no modo de inscrição padrão (a revisar). Sem temporada → usa a ativa.
// Nível 3 (expõe listas de grupos/líderes pra ação · visão da coordenação · Naná).
router.get('/kpis/prontidao', authorizeModule('grupos', 3), async (req, res) => {
  try {
    let { temporada } = req.query;
    if (!temporada) {
      const { data: ativa } = await supabase.from('mem_temporadas').select('id').eq('ativa', true).limit(1);
      temporada = ativa && ativa[0] ? ativa[0].id : null;
    }
    if (!temporada) return res.status(400).json({ error: 'Informe a temporada' });

    // Grupos ativos da temporada · paginado (cap do PostgREST)
    let grupos = [], offset = 0;
    while (true) {
      const { data: page, error } = await supabase
        .from('mem_grupos')
        .select('id, nome, lider_id, supervisor_id, modo_inscricao')
        .eq('ativo', true).is('deleted_at', null).eq('temporada', temporada)
        .range(offset, offset + 999);
      if (error) throw error;
      grupos = grupos.concat(page || []);
      if (!page || page.length < 1000) break;
      offset += 1000;
    }

    // Telefone/nome dos líderes · .in() em chunks (limite de URL)
    const liderIds = [...new Set(grupos.map(g => g.lider_id).filter(Boolean))];
    const mMap = {};
    for (let i = 0; i < liderIds.length; i += 400) {
      const { data: ms } = await supabase
        .from('mem_membros').select('id, nome, telefone')
        .in('id', liderIds.slice(i, i + 400)).is('deleted_at', null);
      (ms || []).forEach(m => { mMap[m.id] = m; });
    }
    const telOk = (t) => String(t || '').replace(/\D/g, '').length === 11;

    const semLider = grupos.filter(g => !g.lider_id)
      .map(g => ({ grupo_id: g.id, grupo_nome: g.nome }));
    const liderSemTel = grupos.filter(g => g.lider_id && !telOk(mMap[g.lider_id]?.telefone))
      .map(g => ({ grupo_id: g.id, grupo_nome: g.nome, lider_nome: mMap[g.lider_id]?.nome || '(líder sem cadastro)' }));
    const semSupervisor = grupos.filter(g => !g.supervisor_id)
      .map(g => ({ grupo_id: g.id, grupo_nome: g.nome }));
    const modoPadrao = grupos.filter(g => !g.modo_inscricao || g.modo_inscricao === 'temporada').length;

    const checks = [
      { key: 'sem_lider', label: 'Grupos sem líder definido', severidade: 'alta',
        hint: 'Grupo sem líder não recebe pedidos nem dispara o WhatsApp. Defina um líder antes de abrir.',
        count: semLider.length, itens: semLider },
      { key: 'lider_sem_whatsapp', label: 'Líderes sem WhatsApp válido', severidade: 'alta',
        hint: 'Sem telefone de 11 dígitos, o líder não recebe a notificação de novo pedido. Complete o cadastro do líder.',
        count: liderSemTel.length, itens: liderSemTel },
      { key: 'sem_supervisor', label: 'Grupos sem supervisor', severidade: 'media',
        hint: 'Não bloqueia a abertura, mas o grupo fica sem acompanhamento de supervisão.',
        count: semSupervisor.length, itens: semSupervisor },
      { key: 'modo_a_revisar', label: 'Grupos no modo de inscrição padrão', severidade: 'baixa',
        hint: 'Nasceram como "temporada" (só aparecem no formulário com as inscrições abertas). Revise se algum deveria ser contínuo (sempre aberto) ou por convite (fechado).',
        count: modoPadrao, itens: [] },
    ];

    res.json({ temporada, total_grupos: grupos.length, checks });
  } catch (e) {
    console.error('[grupos] kpis/prontidao:', e.message);
    res.status(500).json({ error: 'Erro ao carregar a prontidão da temporada' });
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
        // deleted_at (31/07): a lista trazia pedidos soft-deletados (16 da limpeza
        // de 17/07). Os cards de resumo da aba somam ESTA lista no cliente, entao
        // "aprovados"/"recusados" contavam linha morta; e um PENDENTE apagado
        // apareceria acionavel — aprovar devolveria 404 sem explicacao, porque
        // aprovarPedidoCore filtra. /pedidos/resumo ja filtrava.
        .is('deleted_at', null)
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

    // Contato alcançável + entrega das mensagens (varredura do lançamento de
    // 02/08 · ver services/contatoPessoa.js). Dois selos que a triagem precisa:
    //   · contato_status → "Número errado — impossível contato" (telefone que o
    //     envio não alcança OU número que a Meta disse "undeliverable"), com o
    //     e-mail como caminho alternativo. NÃO bloqueia nada: é leitura.
    //   · avisos → o líder foi avisado? a pessoa recebeu? (enviado/entregue/
    //     lido/falhou) — no domingo isso só era respondível consultando a fila
    //     na mão, e o "líder não recebeu" foi o incidente de 30/07.
    try {
      const telsPedido = [...new Set(rows.map(p => contatoDigitos(p.telefone)).filter(t => t.length >= 8))];
      // Falha de entrega é POR NÚMERO (não por pedido): o mesmo telefone pode
      // ter recebido por outro contexto. Só as falhas interessam aqui.
      const falhou = new Set();
      const avisoPorRef = {}; // ref_id → { lider, pessoa }
      for (let i = 0; i < telsPedido.length; i += 200) {
        const { data: envs } = await supabase.from('whatsapp_envios')
          .select('telefone, failed_at')
          .in('telefone', telsPedido.slice(i, i + 200))
          .not('failed_at', 'is', null);
        (envs || []).forEach(e => falhou.add(contatoDigitos(e.telefone)));
      }
      // ⚠️ `whatsapp_envios.telefone` guarda o que o CHAMADOR passou, não uma
      // forma canônica: hoje os envios de grupos vão digits-only (conferido nos
      // 3 `failed_at` do lançamento), mas `whatsapp_lideres` guarda com o 55 na
      // frente e outros fluxos podem passar E.164. Comparar cru dependeria de
      // sorte — os 8 últimos dígitos sobrevivem ao 55/DDD e não colidem em
      // volume desta ordem.
      const fim8 = (t) => contatoDigitos(t).slice(-8);
      const falhou8 = new Set([...falhou].map(fim8));
      const refIds = rows.map(p => p.id);
      for (let i = 0; i < refIds.length; i += 200) {
        const { data: envs } = await supabase.from('whatsapp_envios')
          .select('ref_id, contexto, status, delivered_at, read_at, failed_at')
          .in('ref_id', refIds.slice(i, i + 200));
        (envs || []).forEach(e => {
          const alvo = e.contexto === 'grupos.pedido_novo_lider' ? 'lider'
            : (e.contexto === 'grupos.inscricao_confirmada' || e.contexto === 'grupos.pedido_aprovado') ? 'pessoa'
            : null;
          if (!alvo) return;
          const estado = e.failed_at ? 'falhou' : e.read_at ? 'lido' : e.delivered_at ? 'entregue'
            : e.status === 'enviado' ? 'enviado' : e.status;
          const at = (avisoPorRef[e.ref_id] = avisoPorRef[e.ref_id] || {});
          // Mais informativo vence (lido > entregue > enviado); falha sempre aparece.
          const peso = { falhou: 4, lido: 3, entregue: 2, enviado: 1 };
          if (!at[alvo] || (peso[estado] || 0) > (peso[at[alvo]] || 0)) at[alvo] = estado;
        });
      }
      rows.forEach(p => {
        p.contato_status = classificarContato({
          telefone: p.telefone,
          email: p.email,
          entregaFalhou: falhou8.has(fim8(p.telefone)),
        });
        p.avisos = avisoPorRef[p.id] || {};
      });
    } catch (e) { console.error('[Pedidos list contato_status]', e.message); }

    // Pessoa NOVA na plataforma? (varredura 02/08: 85 de 160 eram inéditas)
    // Novo = virou cadastro pendente, ou o membro nasceu junto com o pedido
    // (a diferença de segundos entre criar o membro e criar o pedido).
    try {
      const memIds = [...new Set(rows.map(p => p.membro_id).filter(Boolean))];
      const criadoEm = {};
      for (let i = 0; i < memIds.length; i += 200) {
        const { data: mems } = await supabase.from('mem_membros')
          .select('id, created_at').in('id', memIds.slice(i, i + 200));
        (mems || []).forEach(m => { criadoEm[m.id] = m.created_at; });
      }
      rows.forEach(p => {
        if (p.cadastro_pendente_id) { p.pessoa_nova = true; return; }
        const c = p.membro_id ? criadoEm[p.membro_id] : null;
        if (!c) { p.pessoa_nova = null; return; } // não deu pra saber
        // 10 min de folga: o membro criado no mesmo fluxo do pedido é "novo";
        // quem já existia tem created_at de dias/meses antes.
        p.pessoa_nova = (new Date(p.created_at) - new Date(c)) < 10 * 60000;
      });
    } catch (e) { console.error('[Pedidos list pessoa_nova]', e.message); }

    res.json(rows);
  } catch (e) { console.error('[Pedidos list]', e.message); res.status(500).json({ error: 'Erro ao listar pedidos' }); }
});

// GET /api/grupos/entrada/cobertura?desde=ISO — a ÚNICA coisa do painel da
// Caixa de entrada que a lista de pedidos não responde: quais grupos ativos
// NÃO receberam pedido nenhum no período (no lançamento de 02/08 foram 30 de
// 87 — é onde o Pr. Nélio precisa divulgar). Os outros números do painel são
// derivados da própria lista no cliente, pra não existirem duas verdades.
router.get('/entrada/cobertura', async (req, res) => {
  try {
    const { desde } = req.query;
    const desdeISO = desde && !Number.isNaN(new Date(desde).getTime())
      ? new Date(desde).toISOString() : null;

    const { data: grupos, error: eg } = await supabase.from('mem_grupos')
      .select('id, codigo, nome, bairro, modo_inscricao, temporada')
      .eq('ativo', true).is('deleted_at', null);
    if (eg) throw eg;

    let q = supabase.from('mem_grupo_pedidos').select('grupo_id').is('deleted_at', null);
    if (desdeISO) q = q.gte('created_at', desdeISO);
    const { data: peds, error: ep } = await q.limit(1000);
    if (ep) throw ep;
    const comPedido = new Set((peds || []).map(p => p.grupo_id).filter(Boolean));

    // Grupo 'fechado' não recebe inscrição pelo formulário — não faz sentido
    // cobrar divulgação dele.
    const elegiveis = (grupos || []).filter(g => g.modo_inscricao !== 'fechado');
    const semPedido = elegiveis.filter(g => !comPedido.has(g.id))
      .map(g => ({ id: g.id, codigo: g.codigo, nome: g.nome, bairro: g.bairro }))
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome)));

    res.json({
      grupos_ativos: (grupos || []).length,
      grupos_elegiveis: elegiveis.length,
      grupos_com_pedido: elegiveis.length - semPedido.length,
      sem_pedido: semPedido,
    });
  } catch (e) {
    console.error('[Entrada cobertura]', e.message);
    res.status(500).json({ error: 'Erro ao calcular a cobertura dos grupos' });
  }
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
        .select('id', { count: 'exact', head: true }).eq('status', 'pendente').is('deleted_at', null).in('grupo_id', ids);
      mine = count || 0;
    }
    let total = mine;
    if (isAdmin) {
      const { count } = await supabase.from('mem_grupo_pedidos')
        .select('id', { count: 'exact', head: true }).eq('status', 'pendente').is('deleted_at', null);
      total = count || 0;
    }
    // Candidaturas de líder/anfitrião aguardando a triagem (badge da caixa)
    let lideresPendentes = 0;
    try {
      const { count } = await supabase.from('mem_lider_inscricoes')
        .select('id', { count: 'exact', head: true }).eq('status', 'pendente').is('deleted_at', null);
      lideresPendentes = count || 0;
    } catch { /* migration ainda não aplicada → badge segue sem essa parcela */ }
    // Renovações "líder não continua" aguardando triagem (badge da caixa)
    let renovacoesTriagem = 0;
    try {
      const { count } = await supabase.from('mem_grupo_renovacoes')
        .select('id', { count: 'exact', head: true }).eq('status', 'nao_continua').is('deleted_at', null);
      renovacoesTriagem = count || 0;
    } catch { /* migration ainda não aplicada → badge segue sem essa parcela */ }
    res.json({ pendentes: isAdmin ? total : mine, mine, total, lideres_pendentes: lideresPendentes, renovacoes_triagem: renovacoesTriagem });
  } catch (e) {
    console.error('[Pedidos count]', e.message);
    res.status(500).json({ error: 'Erro ao contar pedidos' });
  }
});

// ─────────────────────────────────────────────────────────────
// Inscrições de NOVOS LÍDERES/ANFITRIÕES (form público /inscricao-lideres ·
// Marcos 17/07). Terceira origem da caixa de entrada. Fluxo assistido, SEM
// WhatsApp: aceitar/recusar registram a decisão; vincular coloca a pessoa num
// grupo existente como MAIS UM líder / anfitrião / líder em treinamento no
// roster — NUNCA mexe no lider_id principal (só a equipe, na tela do grupo).
// Pra "criar grupo novo já com a pessoa de líder", o front promove primeiro
// (POST /:id/promover → membro_id), cria o grupo pelo POST /api/grupos normal
// com lider_id e fecha com POST /:id/vincular.
// ─────────────────────────────────────────────────────────────

// GET /api/grupos/lideres-inscricoes/list?desde=
router.get('/lideres-inscricoes/list', async (req, res) => {
  try {
    const { desde } = req.query;
    let q = supabase.from('mem_lider_inscricoes')
      .select('*, mem_grupos:vinculado_grupo_id(id, nome, codigo)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (desde) q = q.gte('created_at', desde);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (e) {
    console.error('[Lideres inscricoes list]', e.message);
    res.status(500).json({ error: 'Erro ao listar inscrições de líderes' });
  }
});

// Carrega a inscrição viva ou responde 404/409 — usada pelas 4 ações abaixo.
async function carregarInscricaoLider(id, statusPermitidos) {
  const { data: insc, error } = await supabase.from('mem_lider_inscricoes')
    .select('*').eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) throw error;
  if (!insc) return { erro: { code: 404, msg: 'Inscrição não encontrada' } };
  if (statusPermitidos && !statusPermitidos.includes(insc.status)) {
    return { erro: { code: 409, msg: `Esta inscrição já está "${insc.status}"` } };
  }
  return { insc };
}

// Promove o cadastro pendente da inscrição a membro (idempotente) e devolve o
// membro_id. Mesmo núcleo de identidade da aprovação de pedidos: duplicado
// detectado na origem liga ao existente; senão passa pelo matcher guardado.
async function promoverInscricaoLider(insc) {
  if (insc.membro_id) return insc.membro_id;
  if (!insc.cadastro_pendente_id) throw new Error('Inscrição sem cadastro nem membro');
  const { data: cad } = await supabase.from('mem_cadastros_pendentes')
    .select('*').eq('id', insc.cadastro_pendente_id).single();
  if (!cad) throw new Error('Cadastro pendente não encontrado');

  let membroId = cad.duplicado_de_id || null;
  if (!membroId) {
    const r = await acharOuCriarGuardado({
      cpf: cad.cpf, email: cad.email, telefone: cad.telefone, nome: cad.nome,
      extra: { data_nascimento: cad.data_nascimento || null, foto_url: cad.foto_url || null, genero: cad.genero || null },
      origem: 'grupos_aprovacao', origemId: cad.id,
    }, { soChaveForte: cad.nao_vincular_fraco === true });
    membroId = r.membro_id;
  }
  // Enriquecimento só-onde-vazio (foto/sexo/nascimento/endereço declarados no
  // form — endereço era write-only na promoção, P3 do sweep 28/07)
  if ((cad.foto_url || cad.genero || cad.data_nascimento || cad.endereco) && membroId) {
    const { data: mem } = await supabase.from('mem_membros').select('foto_url, genero, data_nascimento, endereco').eq('id', membroId).maybeSingle();
    if (mem) {
      const upd = {};
      if (cad.foto_url && !mem.foto_url) upd.foto_url = cad.foto_url;
      if (cad.genero && !mem.genero) upd.genero = cad.genero;
      if (cad.data_nascimento && !mem.data_nascimento) upd.data_nascimento = cad.data_nascimento;
      if (cad.endereco && !mem.endereco) upd.endereco = cad.endereco;
      if (Object.keys(upd).length) await supabase.from('mem_membros').update(upd).eq('id', membroId);
    }
  }
  // Opt-in marcado na candidatura propaga pro membro promovido (só liga) —
  // mesma correção do aprovarPedidoCore (sweep 28/07).
  if (cad.whatsapp_optin && membroId) {
    await supabase.from('mem_membros')
      .update({ whatsapp_optin: true, whatsapp_optin_em: cad.whatsapp_optin_em || new Date().toISOString() })
      .eq('id', membroId).eq('whatsapp_optin', false);
  }
  await supabase.from('mem_cadastros_pendentes').update({ status: 'aprovado' }).eq('id', insc.cadastro_pendente_id);
  await supabase.from('mem_lider_inscricoes')
    .update({ membro_id: membroId, cadastro_pendente_id: null, updated_at: new Date().toISOString() })
    .eq('id', insc.id);
  return membroId;
}

// POST /api/grupos/lideres-inscricoes/:id/aceitar
router.post('/lideres-inscricoes/:id/aceitar', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const { insc, erro } = await carregarInscricaoLider(req.params.id, ['pendente']);
    if (erro) return res.status(erro.code).json({ error: erro.msg });
    const { error } = await supabase.from('mem_lider_inscricoes').update({
      status: 'aceito',
      decidido_por: req.user.userId || null,
      decidido_por_nome: req.user.name || null,
      decidido_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', insc.id).eq('status', 'pendente');
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[Lideres inscricoes aceitar]', e.message);
    res.status(500).json({ error: 'Erro ao aceitar inscrição' });
  }
});

// POST /api/grupos/lideres-inscricoes/:id/recusar — recusa SILENCIOSA (a
// equipe devolve o contato pessoalmente; nada é enviado à pessoa).
router.post('/lideres-inscricoes/:id/recusar', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const { insc, erro } = await carregarInscricaoLider(req.params.id, ['pendente', 'aceito']);
    if (erro) return res.status(erro.code).json({ error: erro.msg });
    const motivo = req.body?.motivo ? String(req.body.motivo).trim().slice(0, 500) : null;
    const { error } = await supabase.from('mem_lider_inscricoes').update({
      status: 'recusado',
      motivo_recusa: motivo,
      decidido_por: req.user.userId || null,
      decidido_por_nome: req.user.name || null,
      decidido_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', insc.id).in('status', ['pendente', 'aceito']);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[Lideres inscricoes recusar]', e.message);
    res.status(500).json({ error: 'Erro ao recusar inscrição' });
  }
});

// POST /api/grupos/lideres-inscricoes/:id/promover — resolve/cria o membro
// (pro fluxo "criar grupo novo": o form de grupo precisa do lider_id antes).
router.post('/lideres-inscricoes/:id/promover', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const { insc, erro } = await carregarInscricaoLider(req.params.id, ['pendente', 'aceito']);
    if (erro) return res.status(erro.code).json({ error: erro.msg });
    const membroId = await promoverInscricaoLider(insc);
    const { data: mem } = await supabase.from('mem_membros').select('id, nome, telefone').eq('id', membroId).maybeSingle();
    res.json({ ok: true, membro_id: membroId, nome: mem?.nome || insc.nome });
  } catch (e) {
    console.error('[Lideres inscricoes promover]', e.message);
    res.status(500).json({ error: 'Erro ao preparar a pessoa para o vínculo' });
  }
});

// POST /api/grupos/lideres-inscricoes/:id/vincular
// body { grupo_id, funcao: 'lider' | 'anfitriao' | 'lider_treinamento' }
// Entra como MAIS UM no roster do grupo — nunca substitui o lider_id
// principal (decisão do Marcos 17/07: troca de líder principal é só na tela
// do grupo, pela equipe). Aceita pendente (vincular implica aceite).
router.post('/lideres-inscricoes/:id/vincular', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const { grupo_id, funcao } = req.body || {};
    if (!grupo_id) return res.status(400).json({ error: 'Informe o grupo' });
    if (!['lider', 'anfitriao', 'lider_treinamento'].includes(funcao)) {
      return res.status(400).json({ error: 'Função inválida (lider · anfitriao · lider_treinamento)' });
    }
    const { insc, erro } = await carregarInscricaoLider(req.params.id, ['pendente', 'aceito']);
    if (erro) return res.status(erro.code).json({ error: erro.msg });

    const { data: grupo } = await supabase.from('mem_grupos')
      .select('id, nome, lider_id, ativo').eq('id', grupo_id).is('deleted_at', null).maybeSingle();
    if (!grupo) return res.status(404).json({ error: 'Grupo não encontrado' });

    const membroId = await promoverInscricaoLider(insc);

    // Roster idempotente: se já há vínculo ativo, só ajusta a função; o líder
    // principal do grupo (lider_id === membroId) não precisa de linha extra.
    if (!(funcao === 'lider' && grupo.lider_id === membroId)) {
      const { data: jaAtivo } = await supabase.from('mem_grupo_membros')
        .select('id, funcao').eq('grupo_id', grupo_id).eq('membro_id', membroId)
        .is('saiu_em', null).is('deleted_at', null).limit(1);
      if (jaAtivo && jaAtivo.length) {
        if (jaAtivo[0].funcao !== funcao) {
          await supabase.from('mem_grupo_membros').update({ funcao }).eq('id', jaAtivo[0].id);
        }
      } else {
        const { error: eVinc } = await supabase.from('mem_grupo_membros').insert({
          grupo_id, membro_id: membroId, funcao,
          entrou_em: new Date().toISOString().slice(0, 10),
        });
        if (eVinc) throw eVinc;
      }
    }

    const { error: eUpd } = await supabase.from('mem_lider_inscricoes').update({
      status: 'vinculado',
      vinculado_grupo_id: grupo_id,
      vinculo_funcao: funcao,
      vinculado_em: new Date().toISOString(),
      decidido_por: insc.decidido_por || req.user.userId || null,
      decidido_por_nome: insc.decidido_por_nome || req.user.name || null,
      decidido_em: insc.decidido_em || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', insc.id).in('status', ['pendente', 'aceito']);
    if (eUpd) throw eUpd;

    // Novo líder no roster reflete no bot do WhatsApp pelo sync diário; o
    // fire-and-forget aqui só antecipa (não é parte do fluxo da inscrição).
    if (funcao === 'lider') syncWhatsappLideres();

    res.json({ ok: true, grupo: { id: grupo.id, nome: grupo.nome }, membro_id: membroId, funcao });
  } catch (e) {
    console.error('[Lideres inscricoes vincular]', e.message);
    res.status(500).json({ error: 'Erro ao vincular ao grupo' });
  }
});

// ─────────────────────────────────────────────────────────────
// RENOVAÇÃO DE TEMPORADA (Marcos · 21/07): 1×/semestre, com a temporada
// fechada, a coordenação DISPARA (manual · nunca cron — lei de 20/07) o
// template pra cada líder de grupo ativo perguntando se continua. A resposta
// entra pelo link público /g/r/<token> (publicGrupos.js). Aqui ficam o painel,
// o disparo e a triagem dos "não continuo" (caixa de entrada da coordenação).
// Rotas com 2 segmentos — não colidem com /:id.
// ─────────────────────────────────────────────────────────────

// GET /api/grupos/renovacao/painel?temporada=&status=
// Painel completo: resumo + 1 linha por grupo (status da renovação, líder,
// nº de membros ativos). ?status=nao_continua filtra (uso da caixa de entrada).
router.get('/renovacao/painel', authorizeModule('grupos', 1), async (req, res) => {
  try {
    let temporadaId = req.query.temporada || null;
    if (!temporadaId) {
      const { data: ativa } = await supabase.from('mem_temporadas')
        .select('id').eq('ativa', true).maybeSingle();
      temporadaId = ativa?.id || null;
    }
    if (!temporadaId) return res.status(404).json({ error: 'Nenhuma temporada ativa.' });
    const { data: temporada } = await supabase.from('mem_temporadas')
      .select('id, label, ativa, inscricoes_abertas, data_inicio, data_fim')
      .eq('id', temporadaId).maybeSingle();
    if (!temporada) return res.status(404).json({ error: 'Temporada não encontrada.' });

    // Universo = grupos ATIVOS da temporada (mesma seleção do disparo)
    const { data: grupos } = await supabase.from('mem_grupos')
      .select('id, nome, codigo, lider_id, dia_semana, horario, bairro')
      .eq('ativo', true).eq('temporada', temporadaId).is('deleted_at', null)
      .limit(1000);
    const grupoIds = (grupos || []).map(g => g.id);

    // Renovações existentes da temporada
    const { data: rens } = await supabase.from('mem_grupo_renovacoes')
      .select('*').eq('temporada_id', temporadaId).is('deleted_at', null)
      .limit(1000);
    const renPorGrupo = new Map((rens || []).map(r => [r.grupo_id, r]));

    // Líderes (nome/telefone) em lotes ≤200
    const liderIds = [...new Set((grupos || []).map(g => g.lider_id).filter(Boolean))];
    const lideres = new Map();
    for (let i = 0; i < liderIds.length; i += 200) {
      const { data: pagina } = await supabase.from('mem_membros')
        .select('id, nome, telefone').in('id', liderIds.slice(i, i + 200)).is('deleted_at', null);
      (pagina || []).forEach(l => lideres.set(l.id, l));
    }

    // Membros ativos por grupo (paginado — o total da base passa de 1000)
    const membrosPorGrupo = new Map();
    for (let offset = 0; ; offset += 1000) {
      const { data: pagina, error: eV } = await supabase.from('mem_grupo_membros')
        .select('grupo_id')
        .is('saiu_em', null).is('deleted_at', null)
        .order('id').range(offset, offset + 999);
      if (eV) throw eV;
      (pagina || []).forEach(v => membrosPorGrupo.set(v.grupo_id, (membrosPorGrupo.get(v.grupo_id) || 0) + 1));
      if (!pagina || pagina.length < 1000) break;
    }

    const telefoneOk = (t) => String(t || '').replace(/\D/g, '').length >= 10;
    let rows = (grupos || []).map(g => {
      const ren = renPorGrupo.get(g.id) || null;
      const lider = g.lider_id ? (lideres.get(g.lider_id) || null) : null;
      return {
        grupo_id: g.id, grupo_nome: g.nome, grupo_codigo: g.codigo || null,
        membros_ativos: membrosPorGrupo.get(g.id) || 0,
        lider_id: g.lider_id, lider_nome: lider?.nome || null, lider_telefone: lider?.telefone || null,
        pode_receber: !!(g.lider_id && telefoneOk(lider?.telefone)),
        renovacao: ren ? {
          id: ren.id, status: ren.status, motivo: ren.motivo,
          roster_total: ren.roster_total, confirmados_count: ren.confirmados_count,
          removidos_count: ren.removidos_count, token_geracao: ren.token_geracao,
          enviado_em: ren.enviado_em, ultima_resposta_em: ren.ultima_resposta_em,
          triagem_acao: ren.triagem_acao, triagem_obs: ren.triagem_obs,
          triado_por_nome: ren.triado_por_nome, triado_em: ren.triado_em,
        } : null,
      };
    });
    if (req.query.status) {
      rows = rows.filter(r => r.renovacao?.status === req.query.status);
    }
    // Triagem primeiro (grupo grande primeiro), depois pendentes de resposta
    rows.sort((a, b) => {
      const peso = (r) => r.renovacao?.status === 'nao_continua' ? 0
        : r.renovacao?.status === 'enviada' ? 1
        : r.renovacao ? 2 : 3;
      return peso(a) - peso(b) || b.membros_ativos - a.membros_ativos;
    });

    const dos = (s) => rows.filter(r => r.renovacao?.status === s).length;
    res.json({
      temporada,
      whatsapp_ligado: whatsappConfigurado(),
      resumo: {
        grupos: rows.length,
        podem_receber: rows.filter(r => r.pode_receber).length,
        sem_lider: rows.filter(r => !r.lider_id).length,
        lider_sem_telefone: rows.filter(r => r.lider_id && !r.pode_receber).length,
        enviadas: rows.filter(r => r.renovacao).length,
        sem_resposta: dos('enviada'),
        continuam: dos('continua'),
        nao_continuam: dos('nao_continua'),
        triadas: dos('triada'),
      },
      rows,
    });
  } catch (e) {
    console.error('[grupos renovacao painel]', e.message);
    res.status(500).json({ error: 'Erro ao carregar o painel da renovação' });
  }
});

// POST /api/grupos/renovacao/disparar — body { temporada_id }
// Cria/atualiza 1 renovação por grupo ativo da temporada e ENFILEIRA o
// template pro líder. Idempotente e re-executável: grupo já RESPONDIDO é
// pulado; sem resposta é REENVIADO com token_geracao+1 (o link antigo morre).
// Janela anti-duplo-clique: enviado há <10 min é pulado. Nível 5 (operação
// semestral em massa · boost de área dá 5 pra coordenação de Grupos).
router.post('/renovacao/disparar', authorizeModule('grupos', 5), async (req, res) => {
  try {
    // Bloqueio geral vence tudo (garantia 100% · Marcos 2026-07-23).
    if (await gruposEnviosConfig.bloqueioTotalAtivo()) {
      return res.status(409).json({ error: 'Envios de grupos estão BLOQUEADOS (bloqueio geral ligado na aba Envios). Desligue pra poder disparar.' });
    }
    const temporadaId = req.body?.temporada_id;
    if (!temporadaId) return res.status(400).json({ error: 'Informe a temporada.' });
    const { data: temporada } = await supabase.from('mem_temporadas')
      .select('id, label, inscricoes_abertas').eq('id', temporadaId).maybeSingle();
    if (!temporada) return res.status(404).json({ error: 'Temporada não encontrada.' });
    if (temporada.inscricoes_abertas) {
      return res.status(409).json({ error: 'As inscrições desta temporada já estão abertas — a renovação é feita ANTES da abertura.' });
    }
    // Erro visível, não sucesso-zero (lição do conselho): sem WhatsApp
    // configurado o disparo não tem como acontecer.
    if (!whatsappConfigurado()) {
      return res.status(409).json({ error: 'O envio de WhatsApp não está configurado no servidor — nada foi enviado.' });
    }

    const { data: grupos } = await supabase.from('mem_grupos')
      .select('id, nome, lider_id')
      .eq('ativo', true).eq('temporada', temporadaId).is('deleted_at', null)
      .limit(1000);
    if (!grupos?.length) return res.status(404).json({ error: 'Nenhum grupo ativo nesta temporada.' });

    const { data: rens } = await supabase.from('mem_grupo_renovacoes')
      .select('*').eq('temporada_id', temporadaId).is('deleted_at', null).limit(1000);
    const renPorGrupo = new Map((rens || []).map(r => [r.grupo_id, r]));

    const liderIds = [...new Set(grupos.map(g => g.lider_id).filter(Boolean))];
    const lideres = new Map();
    for (let i = 0; i < liderIds.length; i += 200) {
      const { data: pagina } = await supabase.from('mem_membros')
        .select('id, nome, telefone').in('id', liderIds.slice(i, i + 200)).is('deleted_at', null);
      (pagina || []).forEach(l => lideres.set(l.id, l));
    }

    const agora = Date.now();
    const envios = [];
    const pulados = { sem_lider: 0, sem_telefone: 0, ja_respondida: 0, enviada_ha_pouco: 0, erro: 0 };
    for (const g of grupos) {
      if (!g.lider_id) { pulados.sem_lider++; continue; }
      const lider = lideres.get(g.lider_id);
      if (!lider || String(lider.telefone || '').replace(/\D/g, '').length < 10) { pulados.sem_telefone++; continue; }

      const atual = renPorGrupo.get(g.id);
      if (atual && atual.status !== 'enviada') { pulados.ja_respondida++; continue; }
      if (atual?.enviado_em && (agora - new Date(atual.enviado_em).getTime()) < 10 * 60 * 1000) {
        pulados.enviada_ha_pouco++; continue;
      }

      let renId = atual?.id || null;
      let geracao = 1;
      if (atual) {
        // Reenvio deliberado ao sem-resposta: nova geração mata o link antigo
        geracao = (atual.token_geracao || 1) + 1;
        const { error: eUp } = await supabase.from('mem_grupo_renovacoes')
          .update({
            token_geracao: geracao,
            lider_membro_id: g.lider_id, lider_nome: lider.nome || null, lider_telefone: lider.telefone || null,
            enviado_em: new Date().toISOString(), updated_at: new Date().toISOString(),
          }).eq('id', atual.id);
        if (eUp) { pulados.erro++; continue; }
      } else {
        const { data: nova, error: eIns } = await supabase.from('mem_grupo_renovacoes')
          .insert({
            grupo_id: g.id, temporada_id: temporadaId,
            lider_membro_id: g.lider_id, lider_nome: lider.nome || null, lider_telefone: lider.telefone || null,
            status: 'enviada', token_geracao: 1, enviado_em: new Date().toISOString(),
          }).select('id').single();
        if (eIns || !nova) { pulados.erro++; continue; }
        renId = nova.id;
      }

      const m = montarEnvioRenovacao({ grupo: g, lider, temporada, renovacaoId: renId, geracao });
      if (m.erro) { pulados.erro++; continue; }
      envios.push(m.envio);
    }

    const lote = envios.length ? await enfileirarLote(envios) : { queued: 0 };
    console.log(`[grupos renovacao] ${temporadaId}: ${lote.queued} na fila ·`, JSON.stringify(pulados));
    res.json({ ok: true, temporada: temporadaId, enfileirados: lote.queued, pulados });
  } catch (e) {
    console.error('[grupos renovacao disparar]', e.message);
    res.status(500).json({ error: 'Erro ao disparar a renovação' });
  }
});

// POST /api/grupos/renovacao/:renId/triar — body { acao, obs }
// Triagem da coordenação pro "não continuo": fechar_grupo (desativa o grupo),
// buscar_lider (grupo segue ativo · a busca é operacional) ou manter. Nota
// curta obrigatória — triagem sem registro é buraco de auditoria.
router.post('/renovacao/:renId/triar', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const { acao, obs } = req.body || {};
    if (!['fechar_grupo', 'buscar_lider', 'manter'].includes(acao)) {
      return res.status(400).json({ error: 'Ação inválida.' });
    }
    const obsLimpa = String(obs || '').trim();
    if (obsLimpa.length < 3) {
      return res.status(400).json({ error: 'Escreva uma nota curta do que foi decidido.', campo: 'obs' });
    }
    const { data: ren } = await supabase.from('mem_grupo_renovacoes')
      .select('*').eq('id', req.params.renId).is('deleted_at', null).maybeSingle();
    if (!ren) return res.status(404).json({ error: 'Renovação não encontrada.' });
    if (ren.status !== 'nao_continua') {
      return res.status(409).json({ error: `Só renovações "não continua" passam por triagem (esta está "${ren.status}").` });
    }

    if (acao === 'fechar_grupo') {
      const { error: eG } = await supabase.from('mem_grupos')
        .update({ ativo: false, status_temporada: 'encerrado' })
        .eq('id', ren.grupo_id);
      if (eG) throw eG;
    }

    const agora = new Date().toISOString();
    const { error } = await supabase.from('mem_grupo_renovacoes')
      .update({
        status: 'triada', triagem_acao: acao, triagem_obs: obsLimpa.slice(0, 2000),
        triado_por: req.user.userId || null, triado_por_nome: req.user.name || null,
        triado_em: agora, updated_at: agora,
      }).eq('id', ren.id);
    if (error) throw error;

    res.json({ ok: true, acao });
  } catch (e) {
    console.error('[grupos renovacao triar]', e.message);
    res.status(500).json({ error: 'Erro ao registrar a triagem' });
  }
});

// ─────────────────────────────────────────────────────────────
// CONFIRA A LISTA DO SEU GRUPO (Marcos · 2026-07-31)
// 3º fluxo do líder (irmão da renovação · SEM "vai continuar?" e SEM trava de
// temporada aberta): a coordenação DISPARA MANUALMENTE (aba Envios) e o líder
// responde pelo link público /g/c/<token> (publicGrupos.js) desmarcando quem
// não faz mais parte. Aqui ficam o PAINEL DE TRIAGEM (quem respondeu, quantos
// saíram, quem não respondeu) e o "marcar como tratada".
// Rotas com 2 segmentos — não colidem com /:id.
// ⚠️ Tudo tolera a migration 20260731120000 AUSENTE (503/aviso · nunca 500
// opaco). Os fluxos existentes não leem essa tabela — não piscam sem ela.
// ─────────────────────────────────────────────────────────────

// GET /api/grupos/confira/painel?temporada=&status=
// Painel de triagem: resumo + 1 linha por grupo (última rodada, líder, nº de
// membros ativos, contadores da resposta).
router.get('/confira/painel', authorizeModule('grupos', 1), async (req, res) => {
  try {
    let temporadaId = req.query.temporada || null;
    if (!temporadaId) {
      const { data: ativa } = await supabase.from('mem_temporadas')
        .select('id').eq('ativa', true).maybeSingle();
      temporadaId = ativa?.id || null;
    }
    if (!temporadaId) return res.status(404).json({ error: 'Nenhuma temporada ativa.' });
    const { data: temporada } = await supabase.from('mem_temporadas')
      .select('id, label, ativa, inscricoes_abertas').eq('id', temporadaId).maybeSingle();
    if (!temporada) return res.status(404).json({ error: 'Temporada não encontrada.' });

    // Universo = grupos ATIVOS da temporada (mesma seleção do disparo)
    const { data: grupos } = await supabase.from('mem_grupos')
      .select('id, nome, codigo, lider_id')
      .eq('ativo', true).eq('temporada', temporadaId).is('deleted_at', null)
      .limit(1000);
    const grupoIds = (grupos || []).map(g => g.id);

    // Última conferência por grupo (tolera tabela ausente)
    let porGrupo = new Map();
    if (grupoIds.length) {
      try {
        porGrupo = await gruposEnvios.ultimasConferencias(grupoIds);
      } catch (e) {
        if (gruposEnvios.schemaAusenteConf(e)) {
          return res.json({
            disponivel: false, aviso: gruposEnvios.AVISO_CONF_SEM_MIGRATION,
            temporada, resumo: null, rows: [],
          });
        }
        throw e;
      }
    }

    // Líderes (nome/telefone) em lotes ≤200
    const liderIds = [...new Set((grupos || []).map(g => g.lider_id).filter(Boolean))];
    const lideres = new Map();
    for (let i = 0; i < liderIds.length; i += 200) {
      const { data: pagina } = await supabase.from('mem_membros')
        .select('id, nome, telefone').in('id', liderIds.slice(i, i + 200)).is('deleted_at', null);
      (pagina || []).forEach(l => lideres.set(l.id, l));
    }

    // Pessoas ativas por grupo (paginado — o total da base passa de 1000).
    // ⚠️ Set de membro_id, não contador de LINHAS: é a MESMA régua do {{3}} do
    // template e da tela do líder (participações × PESSOAS · CLAUDE.md 23/07).
    // Contar vínculos aqui faria o painel discordar do que o líder viu.
    const membrosPorGrupo = new Map();
    for (let offset = 0; ; offset += 1000) {
      const { data: pagina, error: eV } = await supabase.from('mem_grupo_membros')
        .select('grupo_id, membro_id')
        .is('saiu_em', null).is('deleted_at', null)
        .order('id').range(offset, offset + 999);
      if (eV) throw eV;
      (pagina || []).forEach(v => {
        if (!membrosPorGrupo.has(v.grupo_id)) membrosPorGrupo.set(v.grupo_id, new Set());
        if (v.membro_id) membrosPorGrupo.get(v.grupo_id).add(v.membro_id);
      });
      if (!pagina || pagina.length < 1000) break;
    }

    const telefoneOk = (t) => String(t || '').replace(/\D/g, '').length >= 10;
    let rows = (grupos || []).map(g => {
      const c = porGrupo.get(g.id) || null;
      const lider = g.lider_id ? (lideres.get(g.lider_id) || null) : null;
      return {
        grupo_id: g.id, grupo_nome: g.nome, grupo_codigo: g.codigo || null,
        membros_ativos: membrosPorGrupo.get(g.id)?.size || 0,
        lider_id: g.lider_id, lider_nome: lider?.nome || null, lider_telefone: lider?.telefone || null,
        pode_receber: !!(g.lider_id && telefoneOk(lider?.telefone)),
        conferencia: c ? {
          id: c.id, rodada: c.rodada, status: c.status,
          roster_total: c.roster_total, mantidos_count: c.mantidos_count,
          removidos_count: c.removidos_count, observacao: c.observacao,
          token_geracao: c.token_geracao, enviado_em: c.enviado_em,
          ultima_resposta_em: c.ultima_resposta_em, triado_em: c.triado_em,
        } : null,
      };
    });
    if (req.query.status) {
      rows = rows.filter(r => (r.conferencia?.status || 'nao_enviada') === req.query.status);
    }
    // Quem respondeu com remoção primeiro (é o que a coordenação precisa ver),
    // depois sem resposta, depois o resto — grupo grande na frente.
    rows.sort((a, b) => {
      const peso = (r) => {
        const s = r.conferencia?.status;
        if (s === 'respondida' && (r.conferencia?.removidos_count || 0) > 0) return 0;
        if (s === 'respondida') return 1;
        if (s === 'enviada') return 2;
        if (s === 'triada') return 4;
        return 3; // nunca conferida
      };
      return peso(a) - peso(b) || b.membros_ativos - a.membros_ativos;
    });

    const dos = (s) => rows.filter(r => r.conferencia?.status === s).length;
    res.json({
      disponivel: true,
      temporada,
      whatsapp_ligado: whatsappConfigurado(),
      resumo: {
        grupos: rows.length,
        podem_receber: rows.filter(r => r.pode_receber).length,
        sem_lider: rows.filter(r => !r.lider_id).length,
        lider_sem_telefone: rows.filter(r => r.lider_id && !r.pode_receber).length,
        enviadas: rows.filter(r => r.conferencia).length,
        sem_resposta: dos('enviada'),
        responderam: dos('respondida'),
        triadas: dos('triada'),
        nunca_conferidos: rows.filter(r => !r.conferencia).length,
        // Total de pessoas que os líderes tiraram da lista (leitura direta do
        // que o fluxo entregou de valor).
        removidos_total: rows.reduce((a, r) => a + (r.conferencia?.removidos_count || 0), 0),
      },
      rows,
    });
  } catch (e) {
    console.error('[grupos confira painel]', e.message);
    res.status(500).json({ error: 'Erro ao carregar o painel da conferência' });
  }
});

// POST /api/grupos/confira/preview — body { audiencia, nova_rodada }
// Prévia do disparo (contagem + exemplo + quem não recebe + quem é pulado).
router.post('/confira/preview', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const r = await gruposEnvios.previewConfira(req.body?.audiencia, { nova_rodada: !!req.body?.nova_rodada });
    if (r?.sem_migration) return res.status(503).json({ error: r.erro });
    if (r?.erro) return res.status(400).json({ error: r.erro });
    res.json(r);
  } catch (e) {
    console.error('[grupos confira preview]', e.message);
    res.status(500).json({ error: 'Erro ao gerar a prévia da conferência' });
  }
});

// POST /api/grupos/confira/disparar — body { audiencia, nova_rodada }
// Disparo MANUAL (nível 5 · operação em massa pro líder · boost de área dá 5
// pra coordenação de Grupos). Reenvio manda só pra quem NÃO respondeu; grupo
// que já respondeu só entra de novo com nova_rodada=true. 2 segmentos, como o
// /renovacao/disparar — nunca colide com /:id.
router.post('/confira/disparar', authorizeModule('grupos', 5), async (req, res) => {
  try {
    // Bloqueio geral vence tudo (garantia 100% · Marcos 2026-07-23).
    if (await gruposEnviosConfig.bloqueioTotalAtivo()) {
      return res.status(409).json({ error: 'Envios de grupos estão BLOQUEADOS (bloqueio geral ligado na aba Envios). Desligue pra poder disparar.' });
    }
    // Erro visível, não sucesso-zero (lição do conselho na renovação).
    if (!whatsappConfigurado()) {
      return res.status(409).json({ error: 'O envio de WhatsApp não está configurado no servidor — nada foi enviado.' });
    }
    const r = await gruposEnvios.dispararConfira(req.body?.audiencia, { nova_rodada: !!req.body?.nova_rodada });
    if (r?.sem_migration) return res.status(503).json({ error: r.erro });
    if (r?.erro) return res.status(409).json({ error: r.erro });
    console.log('[grupos confira] disparo:', JSON.stringify({ enfileirados: r.enfileirados, destinatarios: r.destinatarios, pulados: r.pulados, erros: r.erros }));
    res.json({ ok: true, ...r });
  } catch (e) {
    console.error('[grupos confira disparar]', e.message);
    res.status(500).json({ error: 'Erro ao disparar a conferência da lista' });
  }
});

// POST /api/grupos/confira/:confId/triar — body { obs }
// A coordenação marca a conferência como TRATADA (sai da fila de pendências e
// o link do líder morre). Nota curta obrigatória — triagem sem registro é
// buraco de auditoria (mesma régua da renovação).
router.post('/confira/:confId/triar', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const obsLimpa = String(req.body?.obs || '').trim();
    if (obsLimpa.length < 3) {
      return res.status(400).json({ error: 'Escreva uma nota curta do que foi conferido.', campo: 'obs' });
    }
    const { data: conf, error: eSel } = await supabase.from('mem_grupo_conferencias')
      .select('id, status').eq('id', req.params.confId).is('deleted_at', null).maybeSingle();
    if (eSel) {
      if (gruposEnvios.schemaAusenteConf(eSel)) return res.status(503).json({ error: gruposEnvios.AVISO_CONF_SEM_MIGRATION });
      throw eSel;
    }
    if (!conf) return res.status(404).json({ error: 'Conferência não encontrada.' });
    if (conf.status !== 'respondida') {
      return res.status(409).json({ error: `Só conferências respondidas passam por triagem (esta está "${conf.status}").` });
    }
    const agora = new Date().toISOString();
    const { error } = await supabase.from('mem_grupo_conferencias')
      .update({
        status: 'triada', triagem_obs: obsLimpa.slice(0, 2000),
        triado_por: req.user.userId || null, triado_por_nome: req.user.name || null,
        triado_em: agora, updated_at: agora,
      }).eq('id', conf.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    console.error('[grupos confira triar]', e.message);
    res.status(500).json({ error: 'Erro ao registrar a triagem' });
  }
});

// ─────────────────────────────────────────────────────────────
// CONSOLE DE ENVIOS (Marcos 2026-07-23) — "aba Envios" do /grupos.
// Barreira central + disparo MANUAL da coordenação (frequência por líder/
// bairro/rede/todos). Rotas de 2 segmentos — antes de /:id.
//   - GET  /envios/config        · estado do kill-switch (nível 1)
//   - PUT  /envios/config        · liga/desliga envios automáticos (nível 5)
//   - GET  /envios/aux           · redes + bairros + grupos p/ os seletores
//   - POST /envios/frequencia/preview · prévia (contagem/exemplo/exclusões)
//   - POST /envios/frequencia    · dispara a chamada do mês (nível 5)
//   - GET  /envios/historico     · últimos envios de grupos (visibilidade)
// ─────────────────────────────────────────────────────────────

router.get('/envios/config', authorizeModule('grupos', 1), async (req, res) => {
  try { res.json(await gruposEnviosConfig.getConfigEnvios()); }
  catch (e) { console.error('[grupos envios config get]', e.message); res.status(500).json({ error: 'Erro ao ler config de envios' }); }
});

router.put('/envios/config', authorizeModule('grupos', 5), async (req, res) => {
  try {
    // Grava só o que veio: bloqueio_total (garantia 100%) e/ou auto_frequencia.
    const patch = {};
    if ('bloqueio_total' in (req.body || {})) patch.bloqueio_total = req.body.bloqueio_total === true;
    if ('auto_frequencia' in (req.body || {})) patch.auto_frequencia = req.body.auto_frequencia === true;
    // compat: aceita o antigo { auto_envios } como auto_frequencia
    if ('auto_envios' in (req.body || {}) && !('auto_frequencia' in patch)) patch.auto_frequencia = req.body.auto_envios === true;
    const r = await gruposEnviosConfig.setConfigEnvios(patch, req.user?.userId || null);
    res.json(r);
  } catch (e) { console.error('[grupos envios config put]', e.message); res.status(500).json({ error: 'Erro ao salvar config de envios' }); }
});

router.get('/envios/aux', authorizeModule('grupos', 1), async (req, res) => {
  try {
    const { data: temp } = await supabase.from('mem_temporadas').select('id, label').eq('ativa', true).maybeSingle();
    const { data: redes } = await supabase.from('mem_redes').select('id, nome').eq('ativa', true).order('nome');
    let grupos = [];
    if (temp) {
      const { data: gs } = await supabase.from('mem_grupos')
        .select('id, nome, bairro, rede_id, lider_id')
        .eq('temporada', temp.id).eq('ativo', true).is('deleted_at', null).order('nome').limit(2000);
      const liderIds = [...new Set((gs || []).map(g => g.lider_id).filter(Boolean))];
      const nomes = {};
      for (let i = 0; i < liderIds.length; i += 200) {
        const { data: ms } = await supabase.from('mem_membros').select('id, nome').in('id', liderIds.slice(i, i + 200));
        (ms || []).forEach(m => { nomes[m.id] = m.nome; });
      }
      grupos = (gs || []).map(g => ({ id: g.id, nome: g.nome, bairro: g.bairro || null, rede_id: g.rede_id || null, lider_nome: g.lider_id ? (nomes[g.lider_id] || null) : null }));
    }
    const bairros = [...new Set(grupos.map(g => g.bairro).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    res.json({ temporada: temp || null, redes: redes || [], bairros, grupos });
  } catch (e) { console.error('[grupos envios aux]', e.message); res.status(500).json({ error: 'Erro ao carregar opções de envio' }); }
});

router.post('/envios/frequencia/preview', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const r = await gruposEnvios.previewFrequencia(req.body?.audiencia || {});
    if (r.erro) return res.status(400).json({ error: r.erro });
    res.json(r);
  } catch (e) { console.error('[grupos envios freq preview]', e.message); res.status(500).json({ error: 'Erro ao gerar prévia' }); }
});

router.post('/envios/frequencia', authorizeModule('grupos', 5), async (req, res) => {
  try {
    if (!whatsappConfigurado()) return res.status(409).json({ error: 'O envio de WhatsApp não está configurado no servidor.' });
    const r = await gruposEnvios.dispararFrequencia(req.body?.audiencia || {});
    if (r.erro) return res.status(400).json({ error: r.erro });
    res.json({ ok: true, ...r });
  } catch (e) { console.error('[grupos envios freq disparar]', e.message); res.status(500).json({ error: 'Erro ao disparar a frequência' }); }
});

// ABERTURA — convite pros LÍDERES (Utility · template abertura_grupos_convite_lider)
// avisando que as inscrições abriram, pra eles encaminharem o link no grupo.
// Todo líder de grupo ativo (não exige roster). Só sai de fato após o template
// ser aprovado na Meta (a fila falha por-mensagem enquanto não estiver).
router.post('/envios/abertura/preview', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const r = await gruposEnvios.previewAbertura(req.body?.audiencia || {});
    if (r.erro) return res.status(400).json({ error: r.erro });
    res.json(r);
  } catch (e) { console.error('[grupos envios abertura preview]', e.message); res.status(500).json({ error: 'Erro ao gerar prévia' }); }
});

router.post('/envios/abertura', authorizeModule('grupos', 5), async (req, res) => {
  try {
    if (!whatsappConfigurado()) return res.status(409).json({ error: 'O envio de WhatsApp não está configurado no servidor.' });
    const r = await gruposEnvios.dispararAbertura(req.body?.audiencia || {});
    if (r.erro) return res.status(400).json({ error: r.erro });
    res.json({ ok: true, ...r });
  } catch (e) { console.error('[grupos envios abertura disparar]', e.message); res.status(500).json({ error: 'Erro ao disparar o convite de abertura' }); }
});

// MATERIAL — mesmo público da frequência, mas anexa um arquivo (Marcos 23/07).
// Preview idêntico (quem recebe); o disparo sobe o arquivo e manda o link por
// template. ⚠️ Sem template de material aprovado na Meta, nada sai (motivo
// 'template_material_nao_configurado') — o arquivo fica salvo pra testar depois.
router.post('/envios/material/preview', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const r = await gruposEnvios.previewMaterial(req.body?.audiencia || {});
    if (r.erro) return res.status(400).json({ error: r.erro });
    res.json(r);
  } catch (e) { console.error('[grupos envios material preview]', e.message); res.status(500).json({ error: 'Erro ao gerar prévia' }); }
});

router.post('/envios/material', authorizeModule('grupos', 5), uploadMw.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Anexe o arquivo do material.' });
    if (!whatsappConfigurado()) return res.status(409).json({ error: 'O envio de WhatsApp não está configurado no servidor.' });
    let audiencia = {};
    try { audiencia = JSON.parse(req.body?.audiencia || '{}'); } catch { /* audiência inválida → vazia */ }
    const titulo = (req.body?.titulo || req.file.originalname || 'Material do grupo').slice(0, 120);
    // Sobe o arquivo pro storage (mesmo bucket dos materiais) → link público.
    const supaPath = `grupos/materiais/envios/${Date.now()}_${sanitizePath(req.file.originalname)}`;
    const { error: upErr } = await supabase.storage
      .from('eventos-anexos')
      .upload(supaPath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
    if (upErr) throw upErr;
    const { data: urlData } = supabase.storage.from('eventos-anexos').getPublicUrl(supaPath);
    const link = urlData?.publicUrl || null;
    const r = await gruposEnvios.dispararMaterial(audiencia, { link, titulo });
    if (r.erro) return res.status(400).json({ error: r.erro });
    res.json({ ok: true, link, ...r });
  } catch (e) { console.error('[grupos envios material disparar]', e.message); res.status(500).json({ error: 'Erro ao enviar o material' }); }
});

router.get('/envios/historico', authorizeModule('grupos', 1), async (req, res) => {
  try {
    const { data } = await supabase.from('whatsapp_envios')
      .select('id, telefone, template, contexto, status, criado_em, enviado_em, erro')
      .like('contexto', 'grupos.%')
      .order('criado_em', { ascending: false }).limit(80);
    const rows = data || [];

    // "quem foram as pessoas" (Marcos 2026-07-23): resolve telefone → nome.
    // 1º pelos líderes (whatsapp_lideres · a maioria dos envios), depois um
    // fallback em mem_membros pros não-líderes. Chave = últimos 8 dígitos
    // (robusto a formatação/DDI/9).
    const last8 = (t) => String(t || '').replace(/\D/g, '').slice(-8);
    const nomePorTel = {};
    try {
      const { data: lids } = await supabase.from('whatsapp_lideres')
        .select('telefone, nome_exibicao').is('deleted_at', null);
      (lids || []).forEach(l => { const k = last8(l.telefone); if (k && l.nome_exibicao && !nomePorTel[k]) nomePorTel[k] = l.nome_exibicao; });
    } catch { /* segue sem os líderes */ }
    // Fallback pros telefones ainda sem nome (limitado · view sob demanda)
    const faltam = [...new Set(rows.map(r => last8(r.telefone)).filter(k => k && !nomePorTel[k]))].slice(0, 60);
    for (const k of faltam) {
      const { data: m } = await supabase.from('mem_membros')
        .select('nome, telefone').ilike('telefone', `%${k}%`).is('deleted_at', null).limit(1);
      if (m && m[0]?.nome) nomePorTel[k] = m[0].nome;
    }

    const items = rows.map(r => ({ ...r, nome: nomePorTel[last8(r.telefone)] || null }));
    res.json({ items });
  } catch (e) { console.error('[grupos envios historico]', e.message); res.status(500).json({ error: 'Erro ao carregar o histórico de envios' }); }
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
      .select('*').eq('id', pedidoId).is('deleted_at', null).maybeSingle();
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
            origem: 'grupos_aprovacao', origemId: cad.id,
          }, { soChaveForte: cad.nao_vincular_fraco === true });
          membroId = r.membro_id;
        }
        // Carrega foto, sexo, nascimento e ENDEREÇO do cadastro público pro
        // membro quando ele ainda não os tem — vale pro recém-criado e pro
        // ligado por dedup. (Endereço era write-only: o form prometia "vai pro
        // cadastro da pessoa" e a promoção descartava — P3 do sweep 28/07.
        // Só-onde-vazio = nunca sobrescreve, como o contrato manda.)
        if ((cad.foto_url || cad.genero || cad.data_nascimento || cad.endereco) && membroId) {
          const { data: mem } = await supabase.from('mem_membros').select('foto_url, genero, data_nascimento, endereco').eq('id', membroId).maybeSingle();
          if (mem) {
            const upd = {};
            if (cad.foto_url && !mem.foto_url) upd.foto_url = cad.foto_url;
            if (cad.genero && !mem.genero) upd.genero = cad.genero;
            if (cad.data_nascimento && !mem.data_nascimento) upd.data_nascimento = cad.data_nascimento;
            if (cad.endereco && !mem.endereco) upd.endereco = cad.endereco;
            if (Object.keys(upd).length) await supabase.from('mem_membros').update(upd).eq('id', membroId);
          }
        }
        // Opt-in de WhatsApp marcado na inscrição pública PROPAGA pro membro
        // promovido — o comentário do form sempre prometeu isso, mas ninguém
        // gravava (achado do sweep 28/07: quem pedia avisos nunca recebia).
        // Só liga (false não desliga um optin que o membro já tinha).
        if (cad.whatsapp_optin && membroId) {
          await supabase.from('mem_membros')
            .update({ whatsapp_optin: true, whatsapp_optin_em: cad.whatsapp_optin_em || new Date().toISOString() })
            .eq('id', membroId).eq('whatsapp_optin', false);
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
          .select('id, nome, codigo, dia_semana, horario, recorrencia, local, endereco, complemento, bairro, lider_id')
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
        // ⚠️ Opt-in EFETIVO da pessoa (D4 · corrigido 31/07). Esta mensagem era
        // a única do fluxo que não checava consentimento, e 3 pessoas reais que
        // marcaram "não quero WhatsApp" receberam. Lê o membro promovido e, se
        // não houver, o cadastro pendente do pedido — em vez de confiar numa
        // variável de escopo anterior, que muda conforme o caminho da aprovação.
        let optinPessoa = null;
        try {
          if (membroId) {
            const { data: m } = await supabase.from('mem_membros')
              .select('whatsapp_optin').eq('id', membroId).maybeSingle();
            if (m) optinPessoa = m.whatsapp_optin === true;
          }
          if (optinPessoa === null && pedido.cadastro_pendente_id) {
            const { data: c } = await supabase.from('mem_cadastros_pendentes')
              .select('whatsapp_optin').eq('id', pedido.cadastro_pendente_id).maybeSingle();
            if (c) optinPessoa = c.whatsapp_optin === true;
          }
        } catch (e) { console.error('[Pedido aprovar optin]', e.message); }

        await notificarPessoaAprovada({
          telefone: pedido.telefone,
          grupo,
          liderNome,
          liderTelefone,
          optin: optinPessoa,
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
      .select('id, nome, codigo, dia_semana, horario, local, endereco, complemento, bairro, ativo, aceitando_inscricoes, modo_inscricao')
      .eq('id', grupo_sugerido_id).is('deleted_at', null).maybeSingle();
    if (!grupoSugerido || !grupoSugerido.ativo) {
      return res.status(404).json({ error: 'Grupo sugerido não encontrado ou inativo' });
    }
    if (grupoSugerido.modo_inscricao === 'fechado') {
      // Grupo por convite: quem decide quem entra é o líder dele (Marcos ·
      // 15/07) — a sugestão da triagem não passa por cima.
      return res.status(400).json({ error: 'Esse grupo é por convite do líder — combine com ele antes de sugerir' });
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

// POST /api/grupos/pedidos/:pedidoId/aprovar-direto — body: { grupo_id? }
// A TRIAGEM decide por cima (Marcos · 2026-08-05): erro humano de recusa é
// frequente (caso real: 4 mulheres devolvidas por engano na "Confira a lista"
// do MULHER ÚNICA), então a equipe pode aprovar um pedido rejeitado/devolvido/
// encaminhado E, opcionalmente, mudar o grupo ali mesmo — sem depender do link
// do líder nem do aceite da pessoa (diferente do "Sugerir outro grupo").
// O pedido é reaberto pra 'pendente' e passa pelo aprovarPedidoCore canônico
// (cria vínculo, avisa líder e pessoa, registra evento) — nada de 2º caminho
// de aprovação com regras próprias.
router.post('/pedidos/:pedidoId/aprovar-direto', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const grupoNovoId = typeof req.body?.grupo_id === 'string' && req.body.grupo_id ? req.body.grupo_id : null;
    const { data: pedido, error: ePed } = await supabase.from('mem_grupo_pedidos')
      .select('id, status, grupo_id, nome').eq('id', req.params.pedidoId).is('deleted_at', null).maybeSingle();
    if (ePed) throw ePed;
    if (!pedido) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (!['pendente', 'devolvido', 'rejeitado', 'encaminhado'].includes(pedido.status)) {
      return res.status(409).json({ error: `Pedido já foi ${pedido.status}` });
    }

    // Realocação opcional: valida o grupo de destino contra o catálogo vivo.
    let grupoDestinoNome = null;
    const vaiRealocar = grupoNovoId && grupoNovoId !== pedido.grupo_id;
    if (vaiRealocar) {
      const { data: gNovo } = await supabase.from('mem_grupos')
        .select('id, nome, ativo').eq('id', grupoNovoId).is('deleted_at', null).maybeSingle();
      if (!gNovo || gNovo.ativo === false) {
        return res.status(400).json({ error: 'Grupo de destino inválido ou inativo' });
      }
      grupoDestinoNome = gNovo.nome;
    }

    // Reabre + realoca num UPDATE só, com guarda de corrida no status atual
    // (uma aprovação/recusa simultânea não é sobrescrita — quem perde vê 409).
    const statusAntes = pedido.status;
    if (statusAntes !== 'pendente' || vaiRealocar) {
      const upd = { status: 'pendente', decidido_por: null, decidido_por_nome: null, decidido_em: null };
      if (vaiRealocar) upd.grupo_id = grupoNovoId;
      const { data: claimed, error: eUpd } = await supabase.from('mem_grupo_pedidos')
        .update(upd).eq('id', pedido.id).eq('status', statusAntes).select('id');
      if (eUpd) throw eUpd;
      if (!claimed || !claimed.length) {
        return res.status(409).json({ error: 'Pedido mudou de status — recarregue a lista' });
      }
      // Linha do tempo: a decisão "por cima" fica registrada com quem fez e de
      // onde veio (o core registra o 'aprovado' logo em seguida). Awaited de
      // propósito (serverless descarta trabalho pendente pós-res.json).
      await registrarEventoPedido(pedido.id, 'aprovado_triagem', {
        status_anterior: statusAntes,
        ...(grupoDestinoNome ? { realocado_para: grupoDestinoNome } : {}),
      }, req.user.name);
    }

    const r = await aprovarPedidoCore(pedido.id, req.user);
    if (!r.ok) return res.status(r.code).json({ error: r.error });
    res.json({ success: true, grupo_id: r.grupo_id || null });
  } catch (e) { console.error('[Pedido aprovar-direto]', e.message); res.status(500).json({ error: 'Erro ao aprovar pedido' }); }
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
// de grupos. Candidatos por mesmo CPF / telefone / e-mail / nome+nascimento
// (chaves exatas) + nome muito parecido, e cada par é validado pela política
// canônica do Entradas (duplicidadePolicy · avaliarPossivelDuplicidade) antes
// de unir — os mesmos candidatos que o Entradas mostra. A fusão continua na
// mesma RPC merge_membros; só a DETECÇÃO foi alinhada.
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
      // Alinhamento com a política canônica do Entradas
      // (backend/services/duplicidadePolicy.js): mesma régua de candidato das 3
      // telas de dedup. Nascimento conflitante exclui, e telefone/e-mail/nome
      // parecido só valem com nome compatível (Dice>=0,90 ou nome contido) —
      // Dice>=0,88 sozinho não basta. CPF exato é chave forte e não passa aqui.
      if (motivo !== 'mesmo CPF' && !avaliarPossivelDuplicidade(a, b).incluir) return;
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
    const { keep_id, merge_ids, campos } = req.body || {};
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

    // "Melhor de cada": fixa no mantido os campos escolhidos na triagem (o merge
    // já apagou os absorvidos → sem colisão de UNIQUE de CPF com o próprio grupo).
    const patch = montarPatchFusao(campos);
    let camposAplicados = [];
    if (Object.keys(patch).length) {
      const { error: upErr } = await supabase.from('mem_membros')
        .update(patch).eq('id', keep_id).is('deleted_at', null);
      if (upErr) console.error('[Grupos duplicatas fundir · campos]', upErr.message);
      else camposAplicados = Object.keys(patch);
    }

    // Divergências → observações do mantido (comparadas contra o keep PÓS-
    // fusão, que já absorveu os campos que estavam vazios + os escolhidos acima).
    // Inclui o snapshot ORIGINAL do mantido: se o operador trocou um campo pelo
    // valor de um absorvido, o valor original do mantido não se perde — vira
    // nota. Nunca derruba a fusão: o snapshot do mem_merge_log ainda guarda tudo.
    const keepAntes = (antes || []).find(m => m.id === keep_id);
    const registrosNota = [keepAntes, ...mergedAntes].filter(Boolean);
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
        for (const m of registrosNota) {
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

    res.json({ ...(data && typeof data === 'object' ? data : {}), ok: true, dados_somados: dadosSomados, campos_aplicados: camposAplicados });
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
      modo_inscricao: ['fechado', 'temporada', 'sempre_aberto'].includes(d.modo_inscricao) ? d.modo_inscricao : 'temporada',
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
      // Só atualiza se veio no body — um form com chunk antigo (sem o campo)
      // não pode resetar o modo do grupo ao salvar.
      ...('modo_inscricao' in d ? { modo_inscricao: ['fechado', 'temporada', 'sempre_aberto'].includes(d.modo_inscricao) ? d.modo_inscricao : 'temporada' } : {}),
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

// GET /api/grupos/temporadas/consolidado — comparativo entre temporadas.
// Devolve as temporadas JÁ congeladas (mem_temporada_consolidado) + as
// métricas AO VIVO da temporada ativa quando ela ainda não foi consolidada
// (linha "parcial · em andamento"). Rota estática ANTES de /temporadas/:id.
router.get('/temporadas/consolidado', async (req, res) => {
  try {
    const { data: congelados, error } = await supabase.from('mem_temporada_consolidado')
      .select('*').order('data_inicio', { ascending: true });
    if (error) throw error;

    // Temporada ativa (a "atual") — se ainda não congelada, calcula parcial.
    let atual = null;
    const { data: temps } = await supabase.from('mem_temporadas')
      .select('id, label, data_inicio, data_fim, ativa').eq('ativa', true).limit(1);
    const ativa = (temps || [])[0];
    if (ativa && !(congelados || []).some(c => c.temporada === ativa.id)) {
      const { data: m, error: eM } = await supabase.rpc('fn_temporada_metricas', { p_temporada: ativa.id });
      if (!eM && Array.isArray(m) && m[0]) {
        atual = {
          temporada: ativa.id, temporada_label: ativa.label,
          data_inicio: ativa.data_inicio, data_fim: ativa.data_fim,
          parcial: true, ...m[0],
        };
      }
    }
    res.json({ consolidados: congelados || [], atual });
  } catch (e) {
    console.error('[Grupos consolidado]', e.message);
    res.status(500).json({ error: 'Erro ao buscar o comparativo de temporadas' });
  }
});

// POST /api/grupos/temporadas/:id/consolidar — congela os KPIs da temporada
// (fechamento). Idempotente-seguro: só recalcula/sobrescreve com ?forcar=1.
router.post('/temporadas/:id/consolidar', authorizeModule('grupos', 5), async (req, res) => {
  try {
    const forcar = req.query.forcar === '1' || req.query.forcar === 'true' || req.body?.forcar === true;
    const { data, error } = await supabase.rpc('fn_consolidar_temporada', {
      p_temporada: req.params.id,
      p_por: req.user.userId || null,
      p_por_nome: req.user.name || null,
      p_forcar: forcar,
    });
    if (error) throw error;
    // A função RETURNS a linha (objeto único no supabase-js).
    res.json(Array.isArray(data) ? data[0] : data);
  } catch (e) {
    console.error('[Grupos consolidar temporada]', e.message);
    res.status(500).json({ error: e.message || 'Erro ao consolidar a temporada' });
  }
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
          .is('deleted_at', null) // alinha ao resto do módulo (Relatórios filtra) · evitava inflar +1 (23/07)
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
    // Confia na função real (o trigger fn_grupo_auto_membro promove visitante →
    // frequentador na 1ª presença · Marcos 2026-07-23). NÃO rebaixa por
    // contagem: os membros atuais são Membro por decisão do Marcos; visitante é
    // só pro novo entrante (até a 1ª presença).
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

    // Último envio de WhatsApp que a pessoa recebeu (Marcos 2026-07-23: saber se
    // estamos mandando demais/de menos pra alguém). Cruza por telefone (últimos
    // 8 dígitos) com whatsapp_envios de contexto grupos.* — best-effort.
    try {
      const last8 = (t) => String(t || '').replace(/\D/g, '').slice(-8);
      const { data: envs } = await supabase.from('whatsapp_envios')
        .select('telefone, template, criado_em')
        .like('contexto', 'grupos.%')
        .order('criado_em', { ascending: false })
        .limit(2000);
      const ultimoPorTel = {};
      (envs || []).forEach(e => { const k = last8(e.telefone); if (k && !ultimoPorTel[k]) ultimoPorTel[k] = { em: e.criado_em, template: e.template }; });
      Object.values(pessoas).forEach(pe => {
        const u = pe.telefone ? ultimoPorTel[last8(pe.telefone)] : null;
        pe.ultimo_envio = u || null;
      });
    } catch (eEnv) {
      console.error('[grupos] ultimo_envio:', eEnv.message); // best-effort
    }

    const lista = Object.values(pessoas)
      .sort((a, b) => b.rank - a.rank || (a.nome || '').localeCompare(b.nome || ''));
    // total = PESSOAS distintas · inscritos = TODA conexão pessoa×grupo (roster +
    // liderar + supervisionar · líder/supervisor também é inscrição naquele grupo,
    // Marcos 2026-07-23). Distinct (membro|grupo) pra não duplicar quem lidera e é
    // roster do mesmo grupo.
    const conex = new Set();
    participacoes.forEach(p => { if (p.membro_id && p.grupo_id) conex.add(p.membro_id + '|' + p.grupo_id); });
    (grupos || []).forEach(g => {
      if (g.lider_id) conex.add(g.lider_id + '|' + g.id);
      if (g.supervisor_id) conex.add(g.supervisor_id + '|' + g.id);
    });
    res.json({ total: lista.length, inscritos: conex.size, pessoas: lista });
  } catch (e) {
    console.error('[grupos] pessoas/papeis:', e.message);
    res.status(500).json({ error: 'Erro ao carregar pessoas' });
  }
});

// GET /api/grupos/pessoas/:membroId/frequencia — grade de frequência da pessoa
// EM CADA grupo que ela é inscrita (Marcos 2026-07-23: "clica na pessoa e vê se
// ela está frequentando TODOS os grupos" · vai no A, não vai no B). Roster ∪
// liderar ∪ supervisionar. Nasce vazio até a 1ª chamada.
router.get('/pessoas/:membroId/frequencia', async (req, res) => {
  try {
    const mid = req.params.membroId;
    // Guard UUID (o .or() abaixo interpola o valor · evita injeção PostgREST)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mid)) {
      return res.status(400).json({ error: 'membro inválido' });
    }
    const { data: rosterRows } = await supabase.from('mem_grupo_membros')
      .select('grupo_id, funcao').eq('membro_id', mid).is('saiu_em', null).is('deleted_at', null);
    const { data: papeisGrupo } = await supabase.from('mem_grupos')
      .select('id, nome, lider_id, supervisor_id')
      .or(`lider_id.eq.${mid},supervisor_id.eq.${mid}`).eq('ativo', true).is('deleted_at', null);
    const papelDe = new Map();
    (rosterRows || []).forEach(r => { if (r.grupo_id) papelDe.set(r.grupo_id, r.funcao || 'membro'); });
    (papeisGrupo || []).forEach(g => {
      if (g.lider_id === mid) papelDe.set(g.id, 'lider');
      else if (g.supervisor_id === mid && !papelDe.has(g.id)) papelDe.set(g.id, 'supervisor');
    });
    const grupoIds = [...papelDe.keys()];
    if (!grupoIds.length) return res.json({ membro_id: mid, grupos: [] });

    // Nomes dos grupos
    const gnome = {};
    for (let i = 0; i < grupoIds.length; i += 200) {
      const { data: gs } = await supabase.from('mem_grupos').select('id, nome').in('id', grupoIds.slice(i, i + 200));
      (gs || []).forEach(g => { gnome[g.id] = g.nome; });
    }

    // Encontros dos grupos (mapa encontro→grupo + total por grupo)
    const encGrupo = {}; const encData = {}; const encPorGrupo = {};
    for (let i = 0; i < grupoIds.length; i += 200) {
      const { data: enc } = await supabase.from('mem_grupo_encontros')
        .select('id, grupo_id, data').is('deleted_at', null).in('grupo_id', grupoIds.slice(i, i + 200));
      (enc || []).forEach(e => { encGrupo[e.id] = e.grupo_id; encData[e.id] = e.data; encPorGrupo[e.grupo_id] = (encPorGrupo[e.grupo_id] || 0) + 1; });
    }
    const allEncIds = Object.keys(encGrupo);

    // Presenças da pessoa (por grupo: contagem + última data)
    const presDe = {}; // grupo_id -> { count, ultima }
    for (let i = 0; i < allEncIds.length; i += 200) {
      const { data: pres } = await supabase.from('mem_grupo_encontro_presencas')
        .select('encontro_id').eq('membro_id', mid).eq('presente', true).in('encontro_id', allEncIds.slice(i, i + 200));
      (pres || []).forEach(p => {
        const gid = encGrupo[p.encontro_id]; const d = encData[p.encontro_id];
        if (!gid) return;
        const cur = presDe[gid] || { count: 0, ultima: null };
        cur.count += 1;
        if (d && (!cur.ultima || d > cur.ultima)) cur.ultima = d;
        presDe[gid] = cur;
      });
    }

    const grupos = grupoIds.map(gid => {
      const pm = presDe[gid] || { count: 0, ultima: null };
      return {
        grupo_id: gid, nome: gnome[gid] || '—', papel: papelDe.get(gid),
        total_encontros: encPorGrupo[gid] || 0, presencas: pm.count, ultima: pm.ultima,
        status: statusFrequenciaPorData(pm.ultima),
      };
    }).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    res.json({ membro_id: mid, tem_encontro: allEncIds.length > 0, grupos });
  } catch (e) { console.error('[Grupos frequencia pessoa]', e.message); res.status(500).json({ error: 'Erro ao calcular a frequência da pessoa' }); }
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

// GET /api/grupos/:id/historico-alteracoes — log de alterações do grupo e das
// participações dele, lido do app_audit_log (triggers da migration
// 20260720230000 · sem elas aplicadas, devolve lista vazia). O app_audit_log
// tem RLS só de super-admin; aqui a leitura é via service role com guard
// gerencial do módulo (grupos>=3). Autor nulo = escrita do backend (service
// role não carrega auth.uid()).
router.get('/:id/historico-alteracoes', authorizeModule('grupos', 3), async (req, res) => {
  try {
    const grupoId = req.params.id;

    // Participações do grupo (abertas e fechadas) — o audit aponta pro id do vínculo
    const vincIds = [];
    const membroDoVinc = {};
    for (let off = 0; ; off += 1000) {
      const { data, error } = await supabase
        .from('mem_grupo_membros')
        .select('id, membro_id')
        .eq('grupo_id', grupoId)
        .range(off, off + 999);
      if (error) throw error;
      (data || []).forEach(v => { vincIds.push(v.id); membroDoVinc[v.id] = v.membro_id; });
      if (!data || data.length < 1000) break;
    }

    const eventos = [];
    {
      const { data, error } = await supabase
        .from('app_audit_log')
        .select('table_name, row_id, action, user_email, changes, created_at')
        .eq('table_name', 'mem_grupos')
        .eq('row_id', grupoId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      eventos.push(...(data || []));
    }
    // .in() em lotes pequenos (lição do cap de URL do PostgREST)
    for (let i = 0; i < vincIds.length; i += 150) {
      const { data, error } = await supabase
        .from('app_audit_log')
        .select('table_name, row_id, action, user_email, changes, created_at')
        .eq('table_name', 'mem_grupo_membros')
        .in('row_id', vincIds.slice(i, i + 150))
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      eventos.push(...(data || []));
    }

    // Nome do participante pra linha ficar legível
    const membroIds = [...new Set(
      eventos.filter(e => e.table_name === 'mem_grupo_membros')
        .map(e => membroDoVinc[e.row_id]).filter(Boolean)
    )];
    const nomes = {};
    for (let i = 0; i < membroIds.length; i += 150) {
      const { data } = await supabase
        .from('mem_membros').select('id, nome')
        .in('id', membroIds.slice(i, i + 150));
      (data || []).forEach(m => { nomes[m.id] = m.nome; });
    }

    eventos.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    res.json({
      items: eventos.slice(0, 200).map(e => ({
        quando: e.created_at,
        acao: e.action,
        tabela: e.table_name,
        autor: e.user_email || null,
        membro_nome: e.table_name === 'mem_grupo_membros'
          ? (nomes[membroDoVinc[e.row_id]] || null)
          : null,
        changes: e.changes,
      })),
    });
  } catch (e) {
    console.error('[grupos historico-alteracoes]', e.message);
    res.status(500).json({ error: 'Erro ao carregar o log de alterações' });
  }
});

module.exports = router;
// Compartilhado com a rota pública de aprovação por token (publicGrupos.js /aprovar)
module.exports.aprovarPedidoCore = aprovarPedidoCore;
