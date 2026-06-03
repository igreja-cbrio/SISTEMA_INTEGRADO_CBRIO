// Rotas do módulo Financeiro V2 · estrutura fiscal
//
// Cobre:
//   /plano-contas          · CRUD hierarquico do plano de contas
//   /centros-custo         · CRUD hierarquico dos centros de custo
//   /identificadores       · CRUD dos identificadores de centavo
//   /culto-slots           · CRUD dos slots de culto
//   /regras-classificacao  · CRUD das regras
//   /uploads               · histórico de uploads OFX/PIX
//   /importar/ofx          · upload OFX
//   /importar/pix-extrato  · upload Excel/CSV do extrato PIX
//   /lancamentos-brutos    · lista bruta
//   /fila-classificacao    · fila de transacoes pendentes
//   /classificar/:id       · aprova/edita sugestão
//   /transacoes            · transacoes finais classificadas (view)
//   /dashboard/semana      · resumo da semana qua-ter
//   /dashboard/culto       · receita por culto na semana

const router = require('express').Router();
const multer = require('multer');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase, query } = require('../utils/supabase');
const { parseOfx } = require('../services/ofxParser');
const { parsePixExtrato } = require('../services/pixExtratoParser');
const {
  matchOfxPix, classificarBatch, aprenderClassificacao, resolverMembroPorDocumento,
} = require('../services/financeiroClassificador');

router.use(authenticate, authorizeModule('financeiro'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
});

// ====================================================================
// PLANO DE CONTAS · CRUD hierarquico
// ====================================================================
router.get('/plano-contas', async (req, res) => {
  try {
    const { tipo, aceita_lancamento, ativo } = req.query;
    let q = supabase.from('fin_plano_contas').select('*').order('ordem');
    if (tipo) q = q.eq('tipo', tipo);
    if (aceita_lancamento === 'true') q = q.eq('aceita_lancamento', true);
    if (ativo === 'true') q = q.eq('ativo', true);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar plano de contas' }); }
});

router.post('/plano-contas', async (req, res) => {
  try {
    const { codigo, codigo_pai, nome, tipo, natureza, nivel, aceita_lancamento, ordem } = req.body;
    if (!codigo || !nome || !tipo || !nivel) {
      return res.status(400).json({ error: 'código, nome, tipo e nível obrigatórios' });
    }
    const { data, error } = await supabase
      .from('fin_plano_contas')
      .insert({ codigo, codigo_pai, nome, tipo, natureza, nivel, aceita_lancamento: !!aceita_lancamento, ordem })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar conta' }); }
});

router.put('/plano-contas/:id', async (req, res) => {
  try {
    const { nome, aceita_lancamento, ativo, ordem, natureza } = req.body;
    const upd = { updated_at: new Date().toISOString() };
    if (nome !== undefined) upd.nome = nome;
    if (aceita_lancamento !== undefined) upd.aceita_lancamento = aceita_lancamento;
    if (ativo !== undefined) upd.ativo = ativo;
    if (ordem !== undefined) upd.ordem = ordem;
    if (natureza !== undefined) upd.natureza = natureza;
    const { data, error } = await supabase
      .from('fin_plano_contas')
      .update(upd)
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar conta' }); }
});

router.delete('/plano-contas/:id', async (req, res) => {
  try {
    // Soft delete · so desativa
    const { error } = await supabase.from('fin_plano_contas')
      .update({ ativo: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover conta' }); }
});

// ====================================================================
// CENTROS DE CUSTO · CRUD hierarquico
// ====================================================================
router.get('/centros-custo', async (req, res) => {
  try {
    const { campus, area, aceita_lancamento, ativo } = req.query;
    let q = supabase.from('fin_centros_custo').select('*').order('ordem');
    if (campus) q = q.eq('campus', campus);
    if (area) q = q.eq('area_slug', area);
    if (aceita_lancamento === 'true') q = q.eq('aceita_lancamento', true);
    if (ativo === 'true') q = q.eq('ativo', true);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar centros' }); }
});

router.post('/centros-custo', async (req, res) => {
  try {
    const { codigo, codigo_pai, nome, campus, area_slug, nivel, aceita_lancamento, ordem } = req.body;
    if (!codigo || !nome || !nivel) {
      return res.status(400).json({ error: 'código, nome e nível obrigatórios' });
    }
    const { data, error } = await supabase
      .from('fin_centros_custo')
      .insert({ codigo, codigo_pai, nome, campus, area_slug, nivel, aceita_lancamento: !!aceita_lancamento, ordem })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar centro' }); }
});

router.put('/centros-custo/:id', async (req, res) => {
  try {
    const { nome, aceita_lancamento, ativo, ordem, area_slug } = req.body;
    const upd = { updated_at: new Date().toISOString() };
    if (nome !== undefined) upd.nome = nome;
    if (aceita_lancamento !== undefined) upd.aceita_lancamento = aceita_lancamento;
    if (ativo !== undefined) upd.ativo = ativo;
    if (ordem !== undefined) upd.ordem = ordem;
    if (area_slug !== undefined) upd.area_slug = area_slug;
    const { data, error } = await supabase
      .from('fin_centros_custo')
      .update(upd)
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar centro' }); }
});

router.delete('/centros-custo/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('fin_centros_custo')
      .update({ ativo: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover centro' }); }
});

// ====================================================================
// IDENTIFICADORES DE CENTAVO
// ====================================================================
router.get('/identificadores', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('fin_identificadores_centavo')
      .select('*, plano_contas:plano_contas_id(codigo, nome), centro_custo:centro_custo_id(codigo, nome)')
      .order('centavo');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar identificadores' }); }
});

router.post('/identificadores', async (req, res) => {
  try {
    const { centavo, plano_contas_id, centro_custo_id, descricao, observacao } = req.body;
    if (!centavo || !descricao) {
      return res.status(400).json({ error: 'centavo e descrição obrigatórios' });
    }
    const centavoNorm = String(centavo).padStart(2, '0');
    const { data, error } = await supabase
      .from('fin_identificadores_centavo')
      .insert({
        centavo: centavoNorm,
        plano_contas_id: plano_contas_id || null,
        centro_custo_id: centro_custo_id || null,
        descricao, observacao,
        created_by: req.user.userId,
      })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar identificador' }); }
});

router.put('/identificadores/:id', async (req, res) => {
  try {
    const { plano_contas_id, centro_custo_id, descricao, observacao, ativo } = req.body;
    const upd = { updated_at: new Date().toISOString() };
    if (plano_contas_id !== undefined) upd.plano_contas_id = plano_contas_id;
    if (centro_custo_id !== undefined) upd.centro_custo_id = centro_custo_id;
    if (descricao !== undefined) upd.descricao = descricao;
    if (observacao !== undefined) upd.observacao = observacao;
    if (ativo !== undefined) upd.ativo = ativo;
    const { data, error } = await supabase
      .from('fin_identificadores_centavo')
      .update(upd)
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar identificador' }); }
});

router.delete('/identificadores/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('fin_identificadores_centavo').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover identificador' }); }
});

// ====================================================================
// CULTO SLOTS
// ====================================================================
router.get('/culto-slots', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('fin_culto_slots')
      .select('*, plano_dizimo:plano_contas_dizimo_id(codigo, nome), plano_oferta:plano_contas_oferta_id(codigo, nome)')
      .order('ordem');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar slots' }); }
});

router.post('/culto-slots', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('fin_culto_slots')
      .insert(req.body)
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar slot' }); }
});

router.put('/culto-slots/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('fin_culto_slots')
      .update(req.body)
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar slot' }); }
});

router.delete('/culto-slots/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('fin_culto_slots').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover slot' }); }
});

// ====================================================================
// REGRAS DE CLASSIFICAÇÃO
// ====================================================================
router.get('/regras-classificacao', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('fin_regras_classificacao')
      .select('*, plano_contas:plano_contas_id(codigo, nome), centro_custo:centro_custo_id(codigo, nome)')
      .order('prioridade');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar regras' }); }
});

router.post('/regras-classificacao', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('fin_regras_classificacao')
      .insert({ ...req.body, created_by: req.user.userId })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar regra' }); }
});

router.put('/regras-classificacao/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('fin_regras_classificacao')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar regra' }); }
});

router.delete('/regras-classificacao/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('fin_regras_classificacao').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover regra' }); }
});

// ====================================================================
// UPLOAD OFX
// ====================================================================
router.post('/importar/ofx', upload.single('arquivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo OFX obrigatorio' });
  const { conta_id } = req.body;
  if (!conta_id) return res.status(400).json({ error: 'conta_id obrigatorio' });

  try {
    const parsed = parseOfx(req.file.buffer);
    const total = parsed.transactions.length;

    // Cria registro de upload
    const { data: uploadRow, error: upErr } = await supabase
      .from('fin_uploads')
      .insert({
        tipo: 'ofx',
        conta_id,
        arquivo_nome: req.file.originalname,
        arquivo_tamanho: req.file.size,
        total_registros: total,
        data_inicio: parsed.header.dtStart,
        data_fim: parsed.header.dtEnd,
        created_by: req.user.userId,
      })
      .select().single();
    if (upErr) return res.status(500).json({ error: upErr.message });

    // Insere lancamentos brutos (ignora duplicados via UNIQUE)
    let inseridos = 0;
    let duplicados = 0;

    for (const t of parsed.transactions) {
      const payload = {
        fonte: 'ofx',
        conta_id,
        data_lancamento: t.data_lancamento,
        hora_lancamento: t.hora_lancamento,
        hora_origem: t.hora_origem,
        valor: t.valor,
        tipo_trn: t.tipo_trn,
        memo: t.memo,
        fitid: t.fitid,
        documento_contraparte: t.documento_contraparte,
        nome_contraparte: t.nome_contraparte,
        raw_data: t.raw_data,
        upload_id: uploadRow.id,
        created_by: req.user.userId,
      };
      const { error: insErr } = await supabase.from('fin_lancamentos_brutos').insert(payload);
      if (insErr) {
        if (insErr.code === '23505') duplicados++;
      } else {
        inseridos++;
      }
    }

    // Roda matching com PIX detalhe (se houver)
    const matchResult = await matchOfxPix({ uploadId: uploadRow.id });
    // Roda classificação em batch
    const classifResult = await classificarBatch({ uploadId: uploadRow.id });

    // Finaliza upload
    await supabase.from('fin_uploads')
      .update({
        total_novos: inseridos,
        total_duplicados: duplicados,
        total_matched_pix: matchResult.matched,
        total_classificados_auto: classifResult.sugeridos,
        status: 'concluido',
        concluido_em: new Date().toISOString(),
      })
      .eq('id', uploadRow.id);

    res.json({
      upload_id: uploadRow.id,
      total, inseridos, duplicados,
      match_pix: matchResult,
      classificacao: classifResult,
      periodo: { inicio: parsed.header.dtStart, fim: parsed.header.dtEnd },
    });
  } catch (e) {
    console.error('[FIN-V2] OFX:', e);
    res.status(500).json({ error: e.message || 'Erro ao processar OFX' });
  }
});

// ====================================================================
// UPLOAD EXTRATO PIX (Excel ou CSV)
// ====================================================================
router.post('/importar/pix-extrato', upload.single('arquivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatorio' });
  const { conta_id } = req.body;

  try {
    const parsed = parsePixExtrato(req.file.buffer, req.file.originalname);
    const tipo = /\.csv$/i.test(req.file.originalname) ? 'pix_csv' : 'pix_xlsx';

    const { data: uploadRow, error: upErr } = await supabase
      .from('fin_uploads')
      .insert({
        tipo,
        conta_id,
        arquivo_nome: req.file.originalname,
        arquivo_tamanho: req.file.size,
        total_registros: parsed.records.length,
        created_by: req.user.userId,
      })
      .select().single();
    if (upErr) return res.status(500).json({ error: upErr.message });

    let inseridos = 0;
    let duplicados = 0;

    for (const r of parsed.records) {
      const { error: insErr } = await supabase
        .from('fin_pix_detalhe')
        .insert({
          ...r,
          conta_id: conta_id || null,
          upload_id: uploadRow.id,
        });
      if (insErr) {
        if (insErr.code === '23505') duplicados++;
      } else {
        inseridos++;
      }
    }

    // Roda match com OFX brutos existentes
    const matchResult = await matchOfxPix({ conta_id });

    await supabase.from('fin_uploads')
      .update({
        total_novos: inseridos,
        total_duplicados: duplicados,
        total_matched_pix: matchResult.matched,
        status: 'concluido',
        concluido_em: new Date().toISOString(),
      })
      .eq('id', uploadRow.id);

    res.json({
      upload_id: uploadRow.id,
      total: parsed.records.length,
      inseridos, duplicados,
      match_pix: matchResult,
    });
  } catch (e) {
    console.error('[FIN-V2] PIX:', e);
    res.status(500).json({ error: e.message || 'Erro ao processar extrato PIX' });
  }
});

// ====================================================================
// UPLOADS HISTÓRICO
// ====================================================================
router.get('/uploads', async (req, res) => {
  try {
    const { tipo, limit = 50 } = req.query;
    let q = supabase.from('fin_uploads').select('*').order('created_at', { ascending: false }).limit(Number(limit));
    if (tipo) q = q.eq('tipo', tipo);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar uploads' }); }
});

// ====================================================================
// LANCAMENTOS BRUTOS · listagem
// ====================================================================
router.get('/lancamentos-brutos', async (req, res) => {
  try {
    const { ja_classificado, conta_id, desde, ate, limit = 200 } = req.query;
    let q = supabase
      .from('fin_lancamentos_brutos')
      .select('*')
      .order('data_lancamento', { ascending: false })
      .order('hora_lancamento', { ascending: false, nullsLast: true })
      .limit(Number(limit));
    if (ja_classificado !== undefined) q = q.eq('ja_classificado', ja_classificado === 'true');
    if (conta_id) q = q.eq('conta_id', conta_id);
    if (desde) q = q.gte('data_lancamento', desde);
    if (ate) q = q.lte('data_lancamento', ate);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar lancamentos' }); }
});

// ====================================================================
// FILA DE CLASSIFICAÇÃO
// ====================================================================
router.get('/fila-classificacao', async (req, res) => {
  try {
    const { status = 'pendente', limit = 100 } = req.query;
    // Fetch separado · evita problema do Supabase resolver FK ambiguo no nested select
    const { data: fila, error } = await supabase
      .from('fin_fila_classificacao')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(Number(limit));
    if (error) return res.status(400).json({ error: error.message });
    if (!fila?.length) return res.json([]);

    // Resolve FKs em batch
    const brutoIds = [...new Set(fila.map(f => f.lancamento_bruto_id).filter(Boolean))];
    const planoIds = [...new Set(fila.map(f => f.sugestao_plano_contas_id).filter(Boolean))];
    const centroIds = [...new Set(fila.map(f => f.sugestao_centro_custo_id).filter(Boolean))];
    const membroIds = [...new Set(fila.map(f => f.sugestao_membro_id).filter(Boolean))];

    const [brutos, planos, centros, membros, pixDetalhes] = await Promise.all([
      brutoIds.length ? supabase.from('fin_lancamentos_brutos').select('*').in('id', brutoIds) : { data: [] },
      planoIds.length ? supabase.from('fin_plano_contas').select('id, codigo, nome, tipo').in('id', planoIds) : { data: [] },
      centroIds.length ? supabase.from('fin_centros_custo').select('id, codigo, nome').in('id', centroIds) : { data: [] },
      membroIds.length ? supabase.from('mem_membros').select('id, nome, cpf, status').in('id', membroIds) : { data: [] },
      brutoIds.length ? supabase.from('fin_pix_detalhe').select('lancamento_bruto_id, pagador_nome, pagador_documento, banco_origem').in('lancamento_bruto_id', brutoIds) : { data: [] },
    ]);
    const bMap = new Map((brutos.data || []).map(b => [b.id, b]));
    const pMap = new Map((planos.data || []).map(p => [p.id, p]));
    const cMap = new Map((centros.data || []).map(c => [c.id, c]));
    const mMap = new Map((membros.data || []).map(m => [m.id, m]));
    const pixMap = new Map((pixDetalhes.data || []).map(p => [p.lancamento_bruto_id, p]));

    res.json(fila.map(f => ({
      ...f,
      lancamento: bMap.get(f.lancamento_bruto_id) || null,
      sugestao_plano: pMap.get(f.sugestao_plano_contas_id) || null,
      sugestao_centro: cMap.get(f.sugestao_centro_custo_id) || null,
      sugestao_membro: mMap.get(f.sugestao_membro_id) || null,
      pix_detalhe: pixMap.get(f.lancamento_bruto_id) || null,
    })));
  } catch (e) { res.status(500).json({ error: 'Erro ao listar fila: ' + e.message }); }
});

// ====================================================================
// APROVAR / EDITAR classificação
// ====================================================================
router.post('/classificar/:filaId/aprovar', async (req, res) => {
  try {
    const { plano_contas_id, centro_custo_id, membro_id, identificador_centavo, observacoes, criar_contribuinte } = req.body;

    // Busca fila + lancamento bruto
    const { data: fila, error: errFila } = await supabase
      .from('fin_fila_classificacao')
      .select('*, lancamento:lancamento_bruto_id(*)')
      .eq('id', req.params.filaId).single();
    if (errFila || !fila) return res.status(404).json({ error: 'Item não encontrado' });

    const lanc = fila.lancamento;
    const finalPlanoContas = plano_contas_id || fila.sugestao_plano_contas_id;
    const finalCentroCusto = centro_custo_id !== undefined ? centro_custo_id : fila.sugestao_centro_custo_id;
    let finalMembro = membro_id !== undefined ? membro_id : fila.sugestao_membro_id;

    // Auto-cadastro · se criar_contribuinte=true e não tem membro_id, busca/cria por nome+CPF
    if (!finalMembro && criar_contribuinte) {
      const { data: pix } = await supabase
        .from('fin_pix_detalhe')
        .select('pagador_nome, pagador_documento')
        .eq('lancamento_bruto_id', lanc.id)
        .maybeSingle();
      const nome = pix?.pagador_nome || lanc.nome_contraparte;
      const doc = pix?.pagador_documento || lanc.documento_contraparte;
      if (nome) {
        const { data: novoMembroId, error: errMembro } = await supabase.rpc(
          'fin_resolver_ou_criar_contribuinte',
          { p_nome: nome, p_documento: doc || null }
        );
        if (!errMembro && novoMembroId) finalMembro = novoMembroId;
      }
    }

    if (!finalPlanoContas) return res.status(400).json({ error: 'plano_contas_id obrigatorio' });

    // Determina tipo (receita/despesa) baseado no plano
    const { data: pc } = await supabase
      .from('fin_plano_contas')
      .select('tipo')
      .eq('id', finalPlanoContas).single();
    const tipoTransacao = pc?.tipo === 'receita' ? 'receita'
      : pc?.tipo === 'despesa' ? 'despesa'
      : (lanc.tipo_trn === 'CREDIT' ? 'receita' : 'despesa');

    // Identifica culto se for credito com hora_lancamento
    let culto_slot_id = null;
    if (lanc.hora_lancamento && tipoTransacao === 'receita') {
      const dt = `${lanc.data_lancamento}T${lanc.hora_lancamento}`;
      const { data: cultoId } = await supabase.rpc('fin_identifica_culto', { p_datetime: dt });
      culto_slot_id = cultoId || null;
    }

    // Busca pix_detalhe_id linkado a esse lancamento (pra histórico do pagador)
    let pixDetalheId = null;
    if (tipoTransacao === 'receita') {
      const { data: pd } = await supabase
        .from('fin_pix_detalhe')
        .select('id')
        .eq('lancamento_bruto_id', lanc.id)
        .maybeSingle();
      pixDetalheId = pd?.id || null;
    }

    // Cria transacao final
    const { data: transacao, error: errTrans } = await supabase
      .from('fin_transacoes')
      .insert({
        conta_id: lanc.conta_id,
        tipo: tipoTransacao,
        descricao: lanc.memo || 'Sem descrição',
        valor: Math.abs(lanc.valor),
        data_competencia: lanc.data_lancamento,
        data_pagamento: lanc.data_lancamento,
        status: 'conciliado',
        referencia: lanc.fitid || lanc.end_to_end_id,
        observacoes,
        plano_contas_id: finalPlanoContas,
        centro_custo_id: finalCentroCusto,
        membro_id: finalMembro,
        lancamento_bruto_id: lanc.id,
        pix_detalhe_id: pixDetalheId,
        culto_slot_id,
        hora_real: lanc.hora_lancamento,
        classificacao_origem: (() => {
          const o = req.body.origem || fila.sugestao_origem || 'manual';
          return o === 'sem_sugestao' ? 'manual' : o;
        })(),
        classificacao_confianca: req.body.origem === 'manual' ? 1.0 : fila.sugestao_confianca,
        identificador_centavo,
        created_by: req.user.userId,
      })
      .select().single();
    if (errTrans) return res.status(400).json({ error: errTrans.message });

    // Marca lancamento bruto como classificado
    await supabase.from('fin_lancamentos_brutos')
      .update({ ja_classificado: true })
      .eq('id', lanc.id);

    // Atualiza fila
    await supabase.from('fin_fila_classificacao')
      .update({
        status: 'aprovado',
        decidido_em: new Date().toISOString(),
        decidido_por: req.user.userId,
      })
      .eq('id', req.params.filaId);

    // Aprende pra memória
    await aprenderClassificacao({
      documento: lanc.documento_contraparte,
      nome: lanc.nome_contraparte,
      plano_contas_id: finalPlanoContas,
      centro_custo_id: finalCentroCusto,
    });

    res.json({ transacao });
  } catch (e) {
    console.error('[FIN-V2] aprovar:', e);
    res.status(500).json({ error: e.message || 'Erro ao aprovar' });
  }
});

router.post('/classificar/:filaId/ignorar', async (req, res) => {
  try {
    const { data, error } = await supabase.from('fin_fila_classificacao')
      .update({
        status: 'ignorado',
        decidido_em: new Date().toISOString(),
        decidido_por: req.user.userId,
      })
      .eq('id', req.params.filaId).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao ignorar' }); }
});

// ====================================================================
// DASHBOARDS
// ====================================================================
router.get('/dashboard/semana', async (req, res) => {
  try {
    const { semana } = req.query; // YYYY-MM-DD (qualquer dia da semana)
    const data = semana || new Date().toISOString().slice(0, 10);
    const { data: resumo } = await supabase.rpc('fin_semana_qua_ter', { p_data: data });
    const { inicio, fim, label } = resumo?.[0] || {};

    if (!inicio) return res.json({ erro: 'semana invalida' });

    // Resumo
    const { data: trans } = await supabase
      .from('vw_fin_transacoes_completa')
      .select('valor, tipo, plano_contas_codigo, plano_contas_natureza, centro_custo_codigo, culto_nome, culto_service_type_slug')
      .gte('data_competencia', inicio).lte('data_competencia', fim)
      .neq('status', 'cancelado');

    const receitas = (trans || []).filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
    const despesas = (trans || []).filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);

    // Agrupa por culto
    const porCulto = {};
    (trans || []).filter(t => t.tipo === 'receita' && t.culto_nome).forEach(t => {
      const k = t.culto_service_type_slug || t.culto_nome;
      if (!porCulto[k]) porCulto[k] = { nome: t.culto_nome, slug: k, dizimo: 0, oferta: 0, total: 0 };
      const isDizimo = (t.plano_contas_codigo || '').startsWith('3.01.01');
      const isOferta = (t.plano_contas_codigo || '').startsWith('3.01.02');
      if (isDizimo) porCulto[k].dizimo += Number(t.valor);
      else if (isOferta) porCulto[k].oferta += Number(t.valor);
      porCulto[k].total += Number(t.valor);
    });

    res.json({
      semana: { inicio, fim, label },
      receitas,
      despesas,
      resultado: receitas - despesas,
      total_lancamentos: (trans || []).length,
      cultos: Object.values(porCulto).sort((a, b) => b.total - a.total),
    });
  } catch (e) {
    console.error('[FIN-V2] dashboard:', e);
    res.status(500).json({ error: 'Erro ao montar dashboard' });
  }
});

router.get('/transacoes', async (req, res) => {
  try {
    // Aliases: inicio/fim (usado por Arrecadacoes) ou desde/ate (legado)
    const desde = req.query.desde || req.query.inicio;
    const ate = req.query.ate || req.query.fim;
    const tipoFilter = req.query.tipo;
    const { plano_contas_id, centro_custo_id, culto_slot_id, limit = 200 } = req.query;
    let q = supabase
      .from('vw_fin_transacoes_completa')
      .select('*')
      .order('data_competencia', { ascending: false })
      .limit(Math.min(Number(limit), 100000));
    if (desde) q = q.gte('data_competencia', desde);
    if (ate) q = q.lte('data_competencia', ate);
    if (tipoFilter) q = q.eq('tipo', tipoFilter);
    if (plano_contas_id) q = q.eq('plano_contas_id', plano_contas_id);
    if (centro_custo_id) q = q.eq('centro_custo_id', centro_custo_id);
    if (culto_slot_id) q = q.eq('culto_slot_id', culto_slot_id);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar transacoes' }); }
});

// Lista arrecadacoes (plano 3.01.*) via RPC · contorna db-max-rows do PostgREST
router.get('/arrecadacoes', async (req, res) => {
  try {
    const { inicio, fim } = req.query;
    if (!inicio || !fim) return res.status(400).json({ error: 'início e fim obrigatórios' });
    const { data, error } = await supabase.rpc('fin_arrecadacoes_listar', { p_inicio: inicio, p_fim: fim });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar arrecadacoes: ' + e.message }); }
});

// Histórico de classificação deste pagador (por CPF ou nome)
// Retorna agregacao por plano de contas pra ajudar o admin a decidir
router.get('/historico-pagador', async (req, res) => {
  try {
    const nome = (req.query.nome || '').trim();
    const documento = (req.query.documento || '').replace(/\D/g, '');
    if (!nome && !documento) return res.json({ total: 0, total_valor: 0, por_plano: [], ultimo_uso: null });

    const { data, error } = await supabase.rpc('fin_historico_pagador', {
      p_documento: documento || null,
      p_nome: nome || null,
    });
    if (error) return res.status(400).json({ error: error.message });

    const rows = Array.isArray(data) ? data : [];
    const total = rows.reduce((a, r) => a + Number(r.count || 0), 0);
    const totalValor = rows.reduce((a, r) => a + Number(r.total_valor || 0), 0);
    const ultimo = rows.reduce((acc, r) => (r.ultimo_uso && (!acc || r.ultimo_uso > acc)) ? r.ultimo_uso : acc, null);

    res.json({
      total,
      total_valor: totalValor,
      ultimo_uso: ultimo,
      por_plano: rows.map(r => ({
        codigo: r.codigo,
        nome: r.nome,
        count: Number(r.count || 0),
        total_valor: Number(r.total_valor || 0),
        ultimo_uso: r.ultimo_uso,
      })),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Sugestão de plano pelo dia/hora do PIX (detecta culto Quarta/Dom 8:30/11:30/Noite)
router.get('/sugerir-plano-horario', async (req, res) => {
  try {
    const { data, hora, tipo = 'dizimo' } = req.query;
    if (!data || !hora) return res.status(400).json({ error: 'data e hora obrigatórios' });
    const { data: rows, error } = await supabase.rpc('fin_sugerir_plano_por_horario', {
      p_data: data, p_hora: hora, p_tipo: tipo,
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json((rows && rows[0]) || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Drilldown · lista lançamentos de uma categoria de despesa (prefixo 4.01, 4.02, etc)
router.get('/despesas/detalhe', async (req, res) => {
  try {
    const { inicio, fim, prefixo } = req.query;
    if (!inicio || !fim || !prefixo) return res.status(400).json({ error: 'início, fim e prefixo obrigatórios' });
    const { data, error } = await supabase.rpc('fin_despesas_detalhe', {
      p_inicio: inicio, p_fim: fim, p_prefixo: prefixo,
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: 'Erro: ' + e.message }); }
});

// ====================================================================
// DASHBOARD OVERVIEW · agrega tudo do /admin/financeiro home
// ====================================================================

// Calcula range [início, fim] e ranges anteriores baseados no period
// Aceita period preset (week/month/quarter/year), ano/mes explicitos
// (year=2022, year=2022&month=3), ou range custom (inicio=YYYY-MM-DD&fim=YYYY-MM-DD).
function calcPeriodRanges(period, queryOpts = {}) {
  const hoje = new Date();
  let inicio, fim, inicioAnt, fimAnt;

  // 1. Range custom explicito
  if (queryOpts.inicio && queryOpts.fim) {
    inicio = new Date(queryOpts.inicio + 'T12:00:00');
    fim = new Date(queryOpts.fim + 'T12:00:00');
    const dias = Math.round((fim - inicio) / 86400000);
    fimAnt = new Date(inicio); fimAnt.setDate(inicio.getDate() - 1);
    inicioAnt = new Date(fimAnt); inicioAnt.setDate(fimAnt.getDate() - dias);
  }
  // 2. Ano + mês explicitos
  else if (queryOpts.year && queryOpts.month != null) {
    const y = Number(queryOpts.year);
    const m = Number(queryOpts.month);
    inicio = new Date(y, m, 1);
    fim = new Date(y, m + 1, 0);
    inicioAnt = new Date(y, m - 1, 1);
    fimAnt = new Date(y, m, 0);
  }
  // 3. So ano explicito · ano inteiro
  else if (queryOpts.year) {
    const y = Number(queryOpts.year);
    inicio = new Date(y, 0, 1);
    fim = new Date(y, 11, 31);
    inicioAnt = new Date(y - 1, 0, 1);
    fimAnt = new Date(y - 1, 11, 31);
  }
  // 4. Presets legados (retrocompat)
  else if (period === 'week') {
    const dow = hoje.getDay();
    inicio = new Date(hoje); inicio.setDate(hoje.getDate() - dow);
    fim = new Date(inicio); fim.setDate(inicio.getDate() + 6);
    inicioAnt = new Date(inicio); inicioAnt.setDate(inicio.getDate() - 7);
    fimAnt = new Date(fim); fimAnt.setDate(fim.getDate() - 7);
  } else if (period === 'quarter') {
    const q = Math.floor(hoje.getMonth() / 3);
    inicio = new Date(hoje.getFullYear(), q * 3, 1);
    fim = new Date(hoje.getFullYear(), q * 3 + 3, 0);
    inicioAnt = new Date(hoje.getFullYear(), (q - 1) * 3, 1);
    fimAnt = new Date(hoje.getFullYear(), q * 3, 0);
  } else if (period === 'year') {
    inicio = new Date(hoje.getFullYear(), 0, 1);
    fim = new Date(hoje.getFullYear(), 11, 31);
    inicioAnt = new Date(hoje.getFullYear() - 1, 0, 1);
    fimAnt = new Date(hoje.getFullYear() - 1, 11, 31);
  } else {
    // month (default)
    inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    inicioAnt = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    fimAnt = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
  }

  const fmt = (d) => d.toISOString().slice(0, 10);
  return {
    inicio: fmt(inicio),
    fim: fmt(fim),
    inicio_ant: fmt(inicioAnt),
    fim_ant: fmt(fimAnt),
  };
}

// Fallback · se não ha fin_transacoes classificadas, exibe lancamentos brutos
// pra dashboard não ficar vazio enquanto fila de classificação não foi processada
async function getTransacoesRecentes(transacoesClassificadas) {
  if (transacoesClassificadas && transacoesClassificadas.length > 0) {
    return transacoesClassificadas;
  }
  const { data } = await supabase
    .from('fin_lancamentos_brutos')
    .select('id, memo, valor, tipo_trn, data_lancamento, nome_contraparte')
    .order('data_lancamento', { ascending: false })
    .order('hora_lancamento', { ascending: false, nullsFirst: false })
    .limit(8);
  // Normaliza formato pro frontend não precisar mudar
  return (data || []).map(l => ({
    id: l.id,
    descricao: l.nome_contraparte || l.memo || '—',
    valor: Math.abs(Number(l.valor)),
    tipo: l.tipo_trn === 'CREDIT' ? 'receita' : 'despesa',
    status: 'bruto',
    data_competencia: l.data_lancamento,
    plano_contas_nome: null,
    culto_nome: null,
    _bruto: true,
  }));
}

router.get('/dashboard/overview', async (req, res) => {
  try {
    const period = ['week', 'month', 'quarter', 'year'].includes(req.query.period) ? req.query.period : 'month';
    const hoje = new Date();
    const hojeStr = hoje.toISOString().slice(0, 10);
    const ranges = calcPeriodRanges(period, {
      year: req.query.year,
      month: req.query.month,
      inicio: req.query.inicio,
      fim: req.query.fim,
    });
    // 12 meses atras (pra gráfico de fluxo de caixa anual)
    const dozeMesesAtras = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1).toISOString().slice(0, 10);

    // Best-effort · refresca saldo Santander se snapshot esta stale (> 5 min)
    // Garante que dashboard sempre mostra saldo atual quando o user entra.
    // Best-effort silencioso · não quebra se Santander não configurado.
    try {
      const { data: snapHoje } = await supabase
        .from('santander_saldo_snapshot')
        .select('id, capturado_em')
        .eq('data', hojeStr)
        .maybeSingle();
      const ultimoMs = snapHoje?.capturado_em ? new Date(snapHoje.capturado_em).getTime() : 0;
      const staleMs = Date.now() - ultimoMs;
      // Refresh se não tem snapshot do dia OU se último > 5 minutos
      if (!snapHoje || staleMs > 5 * 60 * 1000) {
        const santander = require('../services/santander/httpClient');
        if (santander.isConfigured()) {
          const contasService = require('../services/santander/contasService');
          await contasService.snapshotSaldoDoDia({ userId: req.user?.userId });
        }
      }
    } catch (e) {
      console.warn('[dashboard/overview] refresh santander silencioso:', e.message);
    }

    // Paralelo · todas as queries
    const [
      contas,
      transPeriodo,
      transPeriodoAnt,
      trans6m,
      pagar,
      reembolsos,
      filaPendente,
      ultimoUpload,
      naoClassificadas,
      receitaPorCulto,
      topDespesas,
      recentes,
    ] = await Promise.all([
      supabase.from('fin_contas').select('id, nome, saldo, ativa, banco'),
      // Agregação direto no banco via RPC (evita db-max-rows=1000 do PostgREST)
      supabase.rpc('fin_dashboard_periodo', { p_inicio: ranges.inicio, p_fim: ranges.fim }),
      supabase.rpc('fin_dashboard_periodo', { p_inicio: ranges.inicio_ant, p_fim: ranges.fim_ant }),
      supabase.rpc('fin_dashboard_serie_mensal', { p_desde: dozeMesesAtras }),
      supabase.from('fin_contas_pagar').select('id, valor, status, data_vencimento, descricao')
        .eq('status', 'pendente'),
      supabase.from('fin_reembolsos').select('id, valor, status').eq('status', 'pendente'),
      supabase.from('fin_fila_classificacao').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
      supabase.from('fin_uploads').select('created_at, tipo, status').order('created_at', { ascending: false }).limit(1),
      supabase.from('fin_lancamentos_brutos').select('id', { count: 'exact', head: true }).eq('ja_classificado', false),
      supabase.from('vw_fin_transacoes_completa')
        .select('culto_nome, culto_service_type_slug, plano_contas_codigo, valor')
        .gte('data_competencia', dozeMesesAtras)
        .eq('tipo', 'receita')
        .not('culto_service_type_slug', 'is', null)
        .limit(100000),
      supabase.from('vw_fin_transacoes_completa')
        .select('plano_contas_codigo, plano_contas_nome, valor')
        .gte('data_competencia', ranges.inicio).lte('data_competencia', ranges.fim)
        .eq('tipo', 'despesa')
        .not('plano_contas_codigo', 'is', null)
        .limit(100000),
      supabase.from('vw_fin_transacoes_completa')
        .select('id, descricao, valor, tipo, status, data_competencia, plano_contas_nome, culto_nome')
        .order('data_competencia', { ascending: false })
        .neq('status', 'cancelado')
        .limit(8),
    ]);

    const contasAtivas = (contas.data || []).filter(c => c.ativa);
    const saldoTotal = contasAtivas.reduce((s, c) => s + Number(c.saldo || 0), 0);

    // RPC retorna agregação já filtrada por plano 3.%/4.% (sem transferencias internas)
    const receitaMes    = Number(transPeriodo.data?.[0]?.receita || 0);
    const despesaMes    = Number(transPeriodo.data?.[0]?.despesa || 0);
    const receitaMesAnt = Number(transPeriodoAnt.data?.[0]?.receita || 0);
    const despesaMesAnt = Number(transPeriodoAnt.data?.[0]?.despesa || 0);

    // Série 12 meses já agregada por YYYY-MM no banco
    const serie6m = (trans6m.data || []).map(r => ({
      mes: r.mes,
      receita: Number(r.receita),
      despesa: Number(r.despesa),
    }));

    // Receita por culto · agregado dos últimos 6 meses
    const cultoMap = new Map();
    for (const t of receitaPorCulto.data || []) {
      const k = t.culto_service_type_slug || t.culto_nome;
      if (!k) continue;
      if (!cultoMap.has(k)) cultoMap.set(k, { slug: k, nome: t.culto_nome, dizimo: 0, oferta: 0, total: 0 });
      const r = cultoMap.get(k);
      const code = t.plano_contas_codigo || '';
      if (code.startsWith('3.01.01')) r.dizimo += Number(t.valor);
      else if (code.startsWith('3.01.02')) r.oferta += Number(t.valor);
      r.total += Number(t.valor);
    }

    // Top 5 categorias de despesa do período
    // Mapeamento nível 2 -> rotulo amigavel (código aceita curtos)
    const CATEGORIA_LABELS = {
      '4.01': 'Recursos Humanos',
      '4.02': 'Despesas Prediais',
      '4.03': 'Servicos Terceirizados',
      '4.04': 'Repasse a Missoes',
      '4.05': 'Acao Social',
      '4.06': 'Materiais de Consumo',
      '4.07': 'Viagens',
      '4.08': 'Veiculos',
      '4.09': 'Patrimoniais',
      '4.10': 'Eventos',
      '4.11': 'Marketing',
      '4.12': 'Outras',
      '4.13': 'Impostos e Tributos',
      '4.14': 'Despesas Financeiras',
    };
    const despMap = new Map();
    for (const t of topDespesas.data || []) {
      const code = t.plano_contas_codigo || '';
      const grupo = code.split('.').slice(0, 2).join('.');
      if (!grupo) continue;
      if (!despMap.has(grupo)) {
        despMap.set(grupo, {
          codigo: grupo,
          nome: CATEGORIA_LABELS[grupo] || (t.plano_contas_nome?.split(' ').slice(0, 3).join(' ') || grupo),
          total: 0,
        });
      }
      despMap.get(grupo).total += Number(t.valor);
    }
    const topDespCategorias = Array.from(despMap.values()).sort((a, b) => b.total - a.total).slice(0, 5);
    // Calcula percentual relativo
    const totalDesp = topDespCategorias.reduce((s, c) => s + c.total, 0) || 1;
    topDespCategorias.forEach(c => { c.percentual = (c.total / totalDesp) * 100; });

    // Pagar vencendo em 7 dias
    const pgList = pagar.data || [];
    const em7d = new Date(hoje.getTime() + 7 * 86400000).toISOString().slice(0, 10);
    const pagarVencendo = pgList.filter(p => p.data_vencimento <= em7d).length;
    const pagarVencidas = pgList.filter(p => p.data_vencimento < hojeStr).length;

    res.json({
      period,
      ranges,
      stats: {
        saldoTotal,
        contasAtivas: contasAtivas.length,
        receitaMes,
        receitaMesAnt,
        receitaVariacao: receitaMesAnt > 0 ? ((receitaMes - receitaMesAnt) / receitaMesAnt) * 100 : null,
        despesaMes,
        despesaMesAnt,
        despesaVariacao: despesaMesAnt > 0 ? ((despesaMes - despesaMesAnt) / despesaMesAnt) * 100 : null,
        resultadoMes: receitaMes - despesaMes,
        resultadoMesAnt: receitaMesAnt - despesaMesAnt,
      },
      pendencias: {
        fila_classificacao: filaPendente.count || 0,
        lancamentos_brutos_pendentes: naoClassificadas.count || 0,
        contas_pagar: pgList.length,
        contas_pagar_vencendo_7d: pagarVencendo,
        contas_pagar_vencidas: pagarVencidas,
        valor_pagar: pgList.reduce((s, p) => s + Number(p.valor), 0),
        reembolsos: (reembolsos.data || []).length,
        valor_reembolsos: (reembolsos.data || []).reduce((s, r) => s + Number(r.valor), 0),
      },
      contas: contasAtivas.map(c => ({ id: c.id, nome: c.nome, banco: c.banco, saldo: Number(c.saldo) })),
      serie_6_meses: serie6m,
      receita_por_culto: Array.from(cultoMap.values()).sort((a, b) => b.total - a.total),
      top_despesas: topDespCategorias,
      transacoes_recentes: await getTransacoesRecentes(recentes.data),
      ultimo_upload: (ultimoUpload.data || [])[0] || null,
    });
  } catch (e) {
    console.error('[FIN-V2] overview:', e);
    res.status(500).json({ error: e.message || 'Erro ao montar overview' });
  }
});

// ====================================================================
// BACKFILL · tenta classificar fin_transacoes sem plano_contas_id
// ====================================================================
router.post('/backfill/transacoes', async (req, res) => {
  try {
    if (!['admin', 'diretor'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Apenas admin/diretor' });
    }
    const { limit = 1000, dry_run = false } = req.body || {};

    const { data: pendentes, error } = await supabase
      .from('fin_transacoes')
      .select('id, conta_id, tipo, descricao, valor, data_competencia, referencia')
      .is('plano_contas_id', null)
      .neq('status', 'cancelado')
      .limit(Number(limit));
    if (error) return res.status(500).json({ error: error.message });

    let classificadas = 0;
    let ambiguas = 0;
    const exemplos = [];

    for (const t of pendentes || []) {
      // Monta payload simulando lancamento bruto
      const fakeLanc = {
        valor: t.tipo === 'receita' ? Math.abs(t.valor) : -Math.abs(t.valor),
        tipo_trn: t.tipo === 'receita' ? 'CREDIT' : 'DEBIT',
        memo: t.descricao || '',
        documento_contraparte: null,
        nome_contraparte: null,
        banco_origem: null,
      };

      // Extrai CPF/CNPJ se houver na descrição
      const onlyDigits = (t.descricao || '').replace(/\D/g, '');
      const cpfMatch = (t.descricao || '').match(/\d{11}/);
      const cnpjMatch = (t.descricao || '').match(/\d{14}/);
      if (cnpjMatch) fakeLanc.documento_contraparte = cnpjMatch[0];
      else if (cpfMatch) fakeLanc.documento_contraparte = cpfMatch[0];

      const sug = await classificarLancamento(fakeLanc);
      if (!sug) { ambiguas++; continue; }

      if (!dry_run) {
        await supabase.from('fin_transacoes')
          .update({
            plano_contas_id: sug.plano_contas_id,
            centro_custo_id: sug.centro_custo_id,
            classificacao_origem: sug.origem,
            classificacao_confianca: sug.confianca,
          })
          .eq('id', t.id);
      }

      classificadas++;
      if (exemplos.length < 10) {
        exemplos.push({
          id: t.id, descricao: t.descricao, valor: t.valor,
          plano_sugerido: sug.explicacao,
          origem: sug.origem,
          confianca: sug.confianca,
        });
      }
    }

    res.json({
      total_pendentes: (pendentes || []).length,
      classificadas,
      ambiguas,
      dry_run,
      exemplos,
    });
  } catch (e) {
    console.error('[FIN-V2] backfill:', e);
    res.status(500).json({ error: e.message || 'Erro no backfill' });
  }
});

// ====================================================================
// RECORRENCIAS · CRUD + detector
// ====================================================================
const { detectarRecorrencias } = require('../services/recorrenciaDetector');

router.get('/recorrencias', async (req, res) => {
  try {
    const { ativa, classe, ordem = 'valor_medio' } = req.query;
    let q = supabase
      .from('fin_despesas_recorrentes')
      .select('*, plano:plano_contas_id(codigo, nome)')
      .order(ordem, { ascending: false });
    if (ativa !== undefined) q = q.eq('ativa', ativa === 'true');
    if (classe) q = q.eq('classe', classe);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar recorrencias' }); }
});

router.put('/recorrencias/:id', async (req, res) => {
  try {
    const { confirmada, classe, ativa, observacao, plano_contas_id } = req.body;
    const upd = { updated_at: new Date().toISOString() };
    if (confirmada !== undefined) upd.confirmada = confirmada;
    if (classe !== undefined) upd.classe = classe;
    if (ativa !== undefined) upd.ativa = ativa;
    if (observacao !== undefined) upd.observacao = observacao;
    if (plano_contas_id !== undefined) upd.plano_contas_id = plano_contas_id;
    const { data, error } = await supabase
      .from('fin_despesas_recorrentes')
      .update(upd)
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar' }); }
});

router.post('/recorrencias/detectar', async (req, res) => {
  try {
    if (!['admin', 'diretor'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Apenas admin/diretor' });
    }
    const { meses = 6, dry_run = false } = req.body || {};
    const result = await detectarRecorrencias({
      mesesHistorico: Number(meses),
      dryRun: !!dry_run,
    });
    res.json(result);
  } catch (e) {
    console.error('[FIN-V2] detectar recorrencias:', e);
    res.status(500).json({ error: e.message || 'Erro ao detectar' });
  }
});

// ====================================================================
// DRE · mensal hierarquico + comparativo
// ====================================================================
router.get('/dre/mensal', async (req, res) => {
  try {
    const { mes } = req.query;
    if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
      return res.status(400).json({ error: 'mês obrigatório no formato YYYY-MM' });
    }

    const [linhas, porClasse] = await Promise.all([
      supabase.from('vw_fin_dre_mensal').select('*').eq('mes', mes),
      supabase.from('vw_fin_dre_classe').select('*').eq('mes', mes),
    ]);

    if (linhas.error) return res.status(500).json({ error: linhas.error.message });

    const rows = linhas.data || [];
    const receitasOrdinarias = rows.filter(r => r.tipo === 'receita' && r.natureza === 'ordinaria');
    const receitasExtraord = rows.filter(r => r.tipo === 'receita' && r.natureza !== 'ordinaria');
    const despesasFixas = rows.filter(r => r.tipo === 'despesa' && r.classe === 'fixa');
    const despesasVariaveis = rows.filter(r => r.tipo === 'despesa' && r.classe === 'variavel');
    const despesasEventuais = rows.filter(r => r.tipo === 'despesa' && r.classe === 'eventual');
    const despesasSemClasse = rows.filter(r => r.tipo === 'despesa' && !r.classe);

    const sumar = (arr) => arr.reduce((s, r) => s + Number(r.total), 0);

    const totalReceitasOrd = sumar(receitasOrdinarias);
    const totalReceitasExt = sumar(receitasExtraord);
    const totalReceitas = totalReceitasOrd + totalReceitasExt;
    const totalFixas = sumar(despesasFixas);
    const totalVariaveis = sumar(despesasVariaveis);
    const totalEventuais = sumar(despesasEventuais);
    const totalSemClasse = sumar(despesasSemClasse);
    const totalDespesas = totalFixas + totalVariaveis + totalEventuais + totalSemClasse;
    const resultado = totalReceitas - totalDespesas;
    const margem = totalReceitas > 0 ? (resultado / totalReceitas) * 100 : 0;

    res.json({
      mes,
      receitas: {
        ordinarias: receitasOrdinarias, total_ordinarias: totalReceitasOrd,
        extraordinarias: receitasExtraord, total_extraordinarias: totalReceitasExt,
        total: totalReceitas,
      },
      despesas: {
        fixas: despesasFixas, total_fixas: totalFixas,
        variaveis: despesasVariaveis, total_variaveis: totalVariaveis,
        eventuais: despesasEventuais, total_eventuais: totalEventuais,
        sem_classe: despesasSemClasse, total_sem_classe: totalSemClasse,
        total: totalDespesas,
      },
      resultado,
      margem,
      por_classe: porClasse.data || [],
    });
  } catch (e) {
    console.error('[FIN-V2] dre/mensal:', e);
    res.status(500).json({ error: 'Erro ao montar DRE' });
  }
});

router.get('/dre/comparativo', async (req, res) => {
  try {
    const { meses = 6 } = req.query;
    const n = Math.min(Math.max(Number(meses), 2), 24);
    const hoje = new Date();
    const mesesArray = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      mesesArray.push(d.toISOString().slice(0, 7));
    }

    const { data: classes } = await supabase
      .from('vw_fin_dre_classe')
      .select('*')
      .in('mes', mesesArray);

    // Pivot · mês → totais
    const pivot = {};
    mesesArray.forEach(m => {
      pivot[m] = { mes: m, receita: 0, fixa: 0, variavel: 0, eventual: 0, sem_classe: 0 };
    });
    for (const row of classes || []) {
      if (!pivot[row.mes]) continue;
      if (row.tipo === 'receita') pivot[row.mes].receita += Number(row.total);
      else if (row.classe === 'fixa') pivot[row.mes].fixa += Number(row.total);
      else if (row.classe === 'variavel') pivot[row.mes].variavel += Number(row.total);
      else if (row.classe === 'eventual') pivot[row.mes].eventual += Number(row.total);
      else pivot[row.mes].sem_classe += Number(row.total);
    }

    res.json({ meses: mesesArray, dados: Object.values(pivot) });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao montar comparativo' });
  }
});

// ====================================================================
// ANALISES + ALERTAS · H do roadmap
// ====================================================================
const analise = require('../services/analiseFinanceira');

router.get('/analises/heatmap', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vw_fin_heatmap_arrecadacao')
      .select('*');
    if (error) return res.status(500).json({ error: error.message });

    // Matriz 7x24 inicializada com zeros
    const matriz = Array.from({ length: 7 }, () => Array(24).fill(0));
    const qtd = Array.from({ length: 7 }, () => Array(24).fill(0));
    let maxTotal = 0;

    for (const r of data || []) {
      matriz[r.dia_semana][r.hora] = Number(r.total);
      qtd[r.dia_semana][r.hora] = Number(r.qtd);
      if (Number(r.total) > maxTotal) maxTotal = Number(r.total);
    }

    res.json({
      matriz,
      qtd,
      max: maxTotal,
      dias_label: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/analises/forecast', async (req, res) => {
  try {
    const semanasAdiante = Math.min(Math.max(Number(req.query.semanas) || 4, 1), 12);
    const result = await analise.gerarForecast({ semanasAdiante });
    if (!result) return res.json({ erro: 'historico_insuficiente', minimo: 4 });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/alertas', async (req, res) => {
  try {
    const { status = 'pendente', tipo, severidade, limit = 100 } = req.query;
    let q = supabase
      .from('fin_alertas')
      .select('*, recorrencia:recorrencia_id(descricao), membro:membro_id(nome)')
      .order('created_at', { ascending: false })
      .limit(Number(limit));
    if (status === 'pendente') q = q.is('atendido_em', null);
    if (status === 'atendido') q = q.not('atendido_em', 'is', null);
    if (tipo) q = q.eq('tipo', tipo);
    if (severidade) q = q.eq('severidade', severidade);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/alertas/:id/dismiss', async (req, res) => {
  try {
    const { comentario } = req.body || {};
    const { data, error } = await supabase
      .from('fin_alertas')
      .update({
        atendido_em: new Date().toISOString(),
        atendido_por: req.user.userId,
        comentario_atendimento: comentario || null,
      })
      .eq('id', req.params.id)
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/analises/rodar', async (req, res) => {
  try {
    if (!['admin', 'diretor'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Apenas admin/diretor' });
    }
    const result = await analise.rodarAnaliseDiaria();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ====================================================================
// DASHBOARD SEMANAL COMPLETO · receita + frequência + ticket medio
// ====================================================================
router.get('/dashboard/semana-completa', async (req, res) => {
  try {
    const { semana } = req.query;
    const dataRef = semana || new Date().toISOString().slice(0, 10);
    const { data: rangeRow } = await supabase.rpc('fin_semana_qua_ter', { p_data: dataRef });
    const range = (rangeRow || [])[0];
    if (!range) return res.json({ erro: 'semana_invalida' });

    // Calcula semana anterior + mesma semana ano anterior pra comparativos
    const anterior = new Date(range.inicio); anterior.setDate(anterior.getDate() - 7);
    const yoy = new Date(range.inicio); yoy.setFullYear(yoy.getFullYear() - 1);

    const [
      cultosSemana,
      resumo,
      resumoAnterior,
      resumoYoY,
      historico,
      topContribuintes,
      categorias,
    ] = await Promise.all([
      // Cultos da semana com frequência + receita
      supabase.from('vw_fin_semana_cultos').select('*')
        .gte('culto_data', range.inicio).lte('culto_data', range.fim)
        .order('culto_data').order('hora_culto'),
      // Resumo da semana atual
      supabase.from('vw_fin_semana_resumo').select('*')
        .eq('semana_inicio', range.inicio).maybeSingle(),
      // Semana anterior
      supabase.from('vw_fin_semana_resumo').select('*')
        .eq('semana_inicio', anterior.toISOString().slice(0, 10)).maybeSingle(),
      // YoY (mesma semana ano anterior)
      supabase.from('vw_fin_semana_resumo').select('*')
        .gte('semana_inicio', new Date(yoy.getTime() - 4 * 86400000).toISOString().slice(0, 10))
        .lte('semana_inicio', new Date(yoy.getTime() + 4 * 86400000).toISOString().slice(0, 10))
        .limit(1).maybeSingle(),
      // Histórico 12 semanas pra tendência
      supabase.from('vw_fin_semana_resumo').select('*')
        .lte('semana_inicio', range.inicio)
        .order('semana_inicio', { ascending: false }).limit(12),
      // Top 10 contribuintes da semana
      supabase.from('vw_fin_top_contribuintes_semana').select('*')
        .eq('semana_inicio', range.inicio)
        .order('total_doado', { ascending: false }).limit(10),
      // Quebra por categoria (plano de contas nível 3)
      // Inclui data_competencia + classe_movimento pra bucketing por DOW (Power BI)
      supabase.from('vw_fin_transacoes_completa')
        .select('plano_contas_codigo, plano_contas_nome, plano_contas_natureza, valor, culto_nome, culto_service_type_slug, data_competencia, classe_movimento')
        .gte('data_competencia', range.inicio).lte('data_competencia', range.fim)
        .eq('tipo', 'receita').neq('status', 'cancelado'),
    ]);

    // Agrupa categorias em 4 buckets estilo Power BI
    const buckets = {
      quarta: { nome: 'Quarta com Deus', categorias: {}, total: 0 },
      domingo: { nome: 'Final de Semana', categorias: {}, total: 0 },
      outros: { nome: 'Durante a Semana', categorias: {}, total: 0 },
      acumulada: { nome: 'Semana Acumulada', categorias: {}, total: 0 },
    };
    const labelCategoria = (codigo, nome, natureza) => {
      if (codigo?.startsWith('3.01.01')) return 'Dízimos';
      if (codigo?.startsWith('3.01.02')) return 'Ofertas Regulares';
      if (codigo?.startsWith('3.02.01')) return 'Campanha 2025';
      if (codigo?.startsWith('3.02.02')) return 'Eventos';
      if (codigo?.startsWith('3.02.03')) return 'Outras Ofertas';
      if (codigo?.startsWith('3.02.06')) return 'Financeiras';
      if (natureza === 'extraordinaria') return 'Ministerial, Campanhas e Outros';
      return nome?.split('·')[0]?.trim() || 'Outros';
    };

    // Bucket pela DATA REAL DO CULTO (2026-06-01 · oferta lançada na data do culto,
    // não mais em D+1):
    //   Sun=0 Mon=1 Tue=2 Wed=3 Thu=4 Fri=5 Sat=6
    //   w=3 (Quarta)        → "Quarta com Deus"
    //   w=6/0 (Sáb/Dom)     → "Final de Semana"
    //   else                → "Durante a Semana"
    // Empréstimo / transferência / estorno NÃO entram em arrecadação por culto.
    for (const t of categorias.data || []) {
      if (['emprestimo','transferencia','estorno'].includes(t.classe_movimento)) continue;
      const cat = labelCategoria(t.plano_contas_codigo, t.plano_contas_nome, t.plano_contas_natureza);
      const v = Number(t.valor);
      const data = t.data_competencia ? new Date(t.data_competencia + 'T12:00:00Z') : null;
      const dow = data ? data.getUTCDay() : -1; // 0=Sun..6=Sat
      let key;
      if (dow === 3) key = 'quarta';
      else if (dow === 0 || dow === 6) key = 'domingo';
      else key = 'outros';
      buckets[key].categorias[cat] = (buckets[key].categorias[cat] || 0) + v;
      buckets[key].total += v;
      buckets.acumulada.categorias[cat] = (buckets.acumulada.categorias[cat] || 0) + v;
      buckets.acumulada.total += v;
    }
    const formatBucket = (b) => ({
      nome: b.nome,
      total: b.total,
      categorias: Object.entries(b.categorias)
        .map(([cat, valor]) => ({ categoria: cat, valor, pct: b.total > 0 ? (valor / b.total) * 100 : 0 }))
        .sort((a, b) => b.valor - a.valor),
    });

    const r = resumo.data || { receita_total: 0, total_presencial: 0, total_online: 0, ticket_medio_presencial: 0 };
    const ra = resumoAnterior.data || { receita_total: 0, total_presencial: 0, ticket_medio_presencial: 0 };
    const ry = resumoYoY.data || null;

    const delta = (atual, ant) => ant > 0 ? ((atual - ant) / ant) * 100 : null;

    res.json({
      semana: range,
      kpis: {
        receita: Number(r.receita_total),
        receita_delta_wow: delta(Number(r.receita_total), Number(ra.receita_total)),
        receita_yoy: ry ? Number(ry.receita_total) : null,
        receita_delta_yoy: ry ? delta(Number(r.receita_total), Number(ry.receita_total)) : null,
        presencial: Number(r.total_presencial),
        presencial_delta_wow: delta(Number(r.total_presencial), Number(ra.total_presencial)),
        online: Number(r.total_online || 0),
        ticket_medio: Number(r.ticket_medio_presencial || 0),
        ticket_delta_wow: delta(Number(r.ticket_medio_presencial), Number(ra.ticket_medio_presencial)),
      },
      cultos: (cultosSemana.data || []).map(c => ({
        ...c,
        ticket: c.total_presencial > 0 ? Number(c.receita_total) / c.total_presencial : 0,
      })),
      buckets: {
        quarta: formatBucket(buckets.quarta),
        domingo: formatBucket(buckets.domingo),
        outros: formatBucket(buckets.outros),
        acumulada: formatBucket(buckets.acumulada),
      },
      historico: (historico.data || []).reverse().map(h => ({
        semana_label: h.semana_label,
        semana_inicio: h.semana_inicio,
        receita: Number(h.receita_total),
        presencial: Number(h.total_presencial),
        ticket: Number(h.ticket_medio_presencial),
      })),
      top_contribuintes: topContribuintes.data || [],
    });
  } catch (e) {
    console.error('[FIN-V2] semana-completa:', e);
    res.status(500).json({ error: e.message || 'Erro ao montar dashboard semanal' });
  }
});

// ====================================================================
// DASHBOARD FINANCEIRO COMPLETO · PR A do roadmap
// (gráficos mensal/semanal/decendio/YTD/YoY/freq vs receita)
// ====================================================================
router.get('/dashboard/financeiro-completo', async (req, res) => {
  try {
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const anoAnterior = anoAtual - 1;
    const mesAtual = `${anoAtual}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;

    const inicio12m = new Date(anoAtual, hoje.getMonth() - 11, 1).toISOString().slice(0, 10);
    const inicio52s = new Date(hoje.getTime() - 365 * 86400000).toISOString().slice(0, 10);

    const [
      mensal,
      semanal,
      decendio,
      ytd,
      yoySemanal,
      freqReceita,
    ] = await Promise.all([
      supabase.from('vw_fin_arrecadacao_mensal').select('*')
        .gte('mes', inicio12m.slice(0, 7)).order('mes'),
      supabase.from('vw_fin_arrecadacao_semanal').select('*')
        .gte('semana_inicio', inicio52s).order('semana_inicio'),
      supabase.from('vw_fin_decendio').select('*')
        .eq('mes', mesAtual).order('decendio'),
      supabase.from('vw_fin_ano_acumulado').select('*')
        .in('ano', [anoAtual, anoAnterior]),
      supabase.from('vw_fin_yoy_semanal').select('*')
        .eq('ano_atual', anoAtual).order('semana_inicio'),
      supabase.from('vw_fin_freq_vs_receita_mensal').select('*')
        .gte('mes', inicio12m.slice(0, 7)).order('mes'),
    ]);

    const ytdMap = new Map((ytd.data || []).map(r => [r.ano, r]));
    const ytdAtual = ytdMap.get(anoAtual) || { receita_ytd: 0, despesa_ytd: 0, resultado_ytd: 0 };
    const ytdAnt = ytdMap.get(anoAnterior) || { receita_ytd: 0, despesa_ytd: 0, resultado_ytd: 0 };
    const ytdDelta = Number(ytdAnt.receita_ytd) > 0
      ? ((Number(ytdAtual.receita_ytd) - Number(ytdAnt.receita_ytd)) / Number(ytdAnt.receita_ytd)) * 100
      : null;

    // Frequência vs Arrecadacao · crescimento % mês a mês
    const fr = (freqReceita.data || []);
    const freqVsReceita = fr.map((m, i) => {
      if (i === 0) return { ...m, delta_freq_pct: null, delta_receita_pct: null, elasticidade: null };
      const ant = fr[i - 1];
      const dFreq = Number(ant.presencial) > 0 ? ((Number(m.presencial) - Number(ant.presencial)) / Number(ant.presencial)) * 100 : null;
      const dRec = Number(ant.receita) > 0 ? ((Number(m.receita) - Number(ant.receita)) / Number(ant.receita)) * 100 : null;
      const elast = (dFreq !== null && dFreq !== 0) ? dRec / dFreq : null;
      return { ...m, delta_freq_pct: dFreq, delta_receita_pct: dRec, elasticidade: elast };
    });

    res.json({
      mes_atual: mesAtual,
      ano_atual: anoAtual,
      ano_anterior: anoAnterior,
      mensal: (mensal.data || []).map(r => ({
        ...r,
        receita: Number(r.receita),
        despesa: Number(r.despesa),
        resultado: Number(r.resultado),
      })),
      semanal: (semanal.data || []).map(r => ({
        ...r,
        receita: Number(r.receita),
        despesa: Number(r.despesa),
        resultado: Number(r.resultado),
      })),
      decendio: (decendio.data || []).map(r => ({
        ...r,
        receita: Number(r.receita),
        despesa: Number(r.despesa),
      })),
      ytd: {
        ano_atual: {
          ano: anoAtual,
          receita: Number(ytdAtual.receita_ytd || 0),
          despesa: Number(ytdAtual.despesa_ytd || 0),
          resultado: Number(ytdAtual.resultado_ytd || 0),
        },
        ano_anterior: {
          ano: anoAnterior,
          receita: Number(ytdAnt.receita_ytd || 0),
          despesa: Number(ytdAnt.despesa_ytd || 0),
          resultado: Number(ytdAnt.resultado_ytd || 0),
        },
        delta_pct: ytdDelta,
      },
      yoy_semanal: (yoySemanal.data || []).map(r => ({
        ...r,
        receita_atual: Number(r.receita_atual || 0),
        receita_ano_anterior: Number(r.receita_ano_anterior || 0),
        delta_pct: r.delta_pct !== null ? Number(r.delta_pct) : null,
      })),
      freq_vs_receita: freqVsReceita,
    });
  } catch (e) {
    console.error('[FIN-V2] financeiro-completo:', e);
    res.status(500).json({ error: e.message || 'Erro ao montar dashboard' });
  }
});

// ====================================================================
// METAS FINANCEIRAS · PR B do roadmap
// ====================================================================
router.get('/metas', async (req, res) => {
  try {
    const { ativa, ano } = req.query;
    let q = supabase
      .from('fin_metas')
      .select('*, plano:plano_contas_id(codigo, nome), centro:centro_custo_id(codigo, nome)')
      .order('tipo').order('mes_inicio');
    if (ativa !== undefined) q = q.eq('ativa', ativa === 'true');
    if (ano) q = q.eq('ano', Number(ano));
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar metas' }); }
});

router.post('/metas', async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.tipo || payload.valor === undefined) {
      return res.status(400).json({ error: 'tipo e valor obrigatórios' });
    }
    const { data, error } = await supabase
      .from('fin_metas')
      .insert({ ...payload, created_by: req.user?.userId })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar meta' }); }
});

router.put('/metas/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('fin_metas')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar meta' }); }
});

router.delete('/metas/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('fin_metas').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover meta' }); }
});

// ====================================================================
// SAÍDAS DETALHADAS · por categoria, plano, centro
// ====================================================================
router.get('/dashboard/saidas-detalhadas', async (req, res) => {
  try {
    const { mes } = req.query;
    const refMes = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : new Date().toISOString().slice(0, 7);

    const [categoria, plano, centro] = await Promise.all([
      supabase.from('vw_fin_saidas_categoria').select('*').eq('mes_label', refMes),
      supabase.from('vw_fin_saidas_plano').select('*').eq('mes_label', refMes).order('total', { ascending: false }).limit(20),
      supabase.from('vw_fin_saidas_centro').select('*').eq('mes_label', refMes).order('total', { ascending: false }).limit(20),
    ]);

    const totalCategoria = (categoria.data || []).reduce((s, r) => s + Number(r.total), 0);
    const totalPlano = (plano.data || []).reduce((s, r) => s + Number(r.total), 0);
    const totalCentro = (centro.data || []).reduce((s, r) => s + Number(r.total), 0);

    res.json({
      mes: refMes,
      categoria: {
        total: totalCategoria,
        linhas: (categoria.data || []).map(r => ({
          ...r,
          total: Number(r.total),
          pct: totalCategoria > 0 ? (Number(r.total) / totalCategoria) * 100 : 0,
        })),
      },
      plano: {
        total: totalPlano,
        linhas: (plano.data || []).map(r => ({
          ...r,
          total: Number(r.total),
          pct: totalPlano > 0 ? (Number(r.total) / totalPlano) * 100 : 0,
        })),
      },
      centro: {
        total: totalCentro,
        linhas: (centro.data || []).map(r => ({
          ...r,
          total: Number(r.total),
          pct: totalCentro > 0 ? (Number(r.total) / totalCentro) * 100 : 0,
        })),
      },
    });
  } catch (e) {
    console.error('[FIN-V2] saidas-detalhadas:', e);
    res.status(500).json({ error: 'Erro ao montar saídas' });
  }
});

// ====================================================================
// MELHOR SEMANA · do mês atual e do ano
// ====================================================================
router.get('/dashboard/melhor-semana', async (req, res) => {
  try {
    const hoje = new Date();
    const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    const anoAtual = hoje.getFullYear();

    const [mes, ano] = await Promise.all([
      supabase.from('vw_fin_melhor_semana_mes').select('*').eq('mes_label', mesAtual).maybeSingle(),
      supabase.from('vw_fin_melhor_semana_ano').select('*').eq('ano', anoAtual).maybeSingle(),
    ]);

    res.json({
      melhor_do_mes: mes.data ? {
        ...mes.data,
        receita: Number(mes.data.receita),
      } : null,
      melhor_do_ano: ano.data ? {
        ...ano.data,
        receita: Number(ano.data.receita),
      } : null,
    });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao buscar melhor semana' });
  }
});

// ====================================================================
// FORCE SYNC · saldo dos bancos via RPC SQL
// ====================================================================
router.post('/sync-saldo-bancos', async (req, res) => {
  try {
    const { data, error } = await supabase.rpc('fin_force_sync_saldo_bancos');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, atualizados: data });
  } catch (e) {
    console.error('[FIN-V2] sync-saldo-bancos:', e);
    res.status(500).json({ error: e.message });
  }
});

// ====================================================================
// FREQUÊNCIA × ARRECADAÇÃO SEMANAL (qua-ter) · 2026-05-28
// Empréstimos NÃO entram em arrecadação (regra CLAUDE.md)
// Default: últimas 20 semanas
// ====================================================================
router.get('/freq-arrecadacao-semanal', async (req, res) => {
  try {
    const semanas = Math.min(Number(req.query.semanas || 20), 104);
    const hoje = new Date();
    const hojeISO = hoje.toISOString().slice(0, 10);
    // Volta N+2 semanas pra ter cushion
    const inicio = new Date(hoje.getTime() - (semanas + 2) * 7 * 86400000)
      .toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('vw_fin_freq_vs_arrecadacao_semanal')
      .select('*')
      .gte('semana_inicio', inicio)
      .lte('semana_inicio', hojeISO) // ⚠️ corta semanas futuras (cultos agendados sem dados)
      .order('semana_inicio', { ascending: true });

    if (error) return res.status(400).json({ error: error.message });

    const limpas = (data || []).slice(-semanas).map(r => ({
      semana_inicio: r.semana_inicio,
      semana_fim: r.semana_fim,
      semana_label: r.semana_label,
      ano: r.ano,
      receita: Number(r.receita || 0),
      despesa: Number(r.despesa || 0),
      resultado: Number(r.resultado || 0),
      presencial: Number(r.presencial || 0),
      online: Number(r.online || 0),
      total_freq: Number(r.total_freq || 0),
      decisoes: Number(r.decisoes || 0),
      qtd_cultos: Number(r.qtd_cultos || 0),
      ticket_medio_presencial: Number(r.ticket_medio_presencial || 0),
    }));

    res.json({ semanas: limpas });
  } catch (e) {
    console.error('[FIN-V2] freq-arrecadacao-semanal:', e);
    res.status(500).json({ error: e.message });
  }
});

// ====================================================================
// ARRECADAÇÃO MENSAL POR ANO · 2026-05-28
// Retorna os 12 meses (Jan-Dez) do ano + acumulado · filtra empréstimo
// ====================================================================
router.get('/arrecadacao-anual', async (req, res) => {
  try {
    const ano = Number(req.query.ano) || new Date().getFullYear();
    const centroId = req.query.centro_custo_id || null;
    const planoId = req.query.plano_contas_id || null;

    const inicio = `${ano}-01-01`;
    const fim = `${ano}-12-31`;

    // Se há filtros, query direta em fin_transacoes
    // Senão usa vw_fin_arrecadacao_mensal (já agrega + filtra empréstimos)
    let data, error;
    if (centroId || planoId) {
      let q = supabase
        .from('fin_transacoes')
        .select('data_competencia, tipo, valor, classe_movimento')
        .gte('data_competencia', inicio)
        .lte('data_competencia', fim)
        .neq('status', 'cancelado')
        .in('classe_movimento', ['ordinaria', 'extraordinaria']);
      if (centroId) q = q.eq('centro_custo_id', centroId);
      if (planoId) q = q.eq('plano_contas_id', planoId);
      const res2 = await q.limit(50000);
      if (res2.error) return res.status(400).json({ error: res2.error.message });
      // Agrega em JS por mês
      const aggMap = {};
      (res2.data || []).forEach(r => {
        const k = (r.data_competencia || '').slice(0, 7);
        if (!aggMap[k]) aggMap[k] = { mes: k, receita: 0, despesa: 0, qtd: 0 };
        const v = Number(r.valor || 0);
        if (r.tipo === 'receita') aggMap[k].receita += v;
        else if (r.tipo === 'despesa') aggMap[k].despesa += v;
        aggMap[k].qtd += 1;
      });
      data = Object.values(aggMap);
      Object.values(aggMap).forEach(r => { r.resultado = r.receita - r.despesa; });
    } else {
      const res2 = await supabase
        .from('vw_fin_arrecadacao_mensal')
        .select('mes, receita, despesa, resultado, qtd')
        .eq('ano', ano)
        .order('mes', { ascending: true });
      if (res2.error) return res.status(400).json({ error: res2.error.message });
      data = res2.data;
    }

    const porMes = {};
    (data || []).forEach(r => { porMes[r.mes] = r; });
    const meses = [];
    let acumulado = 0;
    for (let m = 1; m <= 12; m++) {
      const key = `${ano}-${String(m).padStart(2, '0')}`;
      const linha = porMes[key];
      const receita = Number(linha?.receita || 0);
      acumulado += receita;
      meses.push({
        mes: key,
        mes_num: m,
        mes_label: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][m - 1],
        receita,
        despesa: Number(linha?.despesa || 0),
        resultado: Number(linha?.resultado || 0),
        acumulado,
        qtd: Number(linha?.qtd || 0),
      });
    }

    res.json({ ano, meses, total: acumulado, filtros: { centro_custo_id: centroId, plano_contas_id: planoId } });
  } catch (e) {
    console.error('[FIN-V2] arrecadacao-anual:', e);
    res.status(500).json({ error: e.message });
  }
});

// ====================================================================
// SAZONALIDADE SEMANAL · compara a mesma semana ISO em vários anos
// Retorna 52 semanas × N anos · cada slot tem valor + datas reais
// ====================================================================
router.get('/sazonalidade-semanal', async (req, res) => {
  try {
    const anosParam = req.query.anos;
    const anoBase = new Date().getFullYear();
    const anos = anosParam
      ? String(anosParam).split(',').map(n => Number(n)).filter(n => Number.isInteger(n))
      : [anoBase - 2, anoBase - 1, anoBase];

    const { data, error } = await supabase
      .from('vw_fin_arrecadacao_semanal')
      .select('ano, semana_inicio, semana_fim, semana_label, receita')
      .in('ano', anos);
    if (error) return res.status(400).json({ error: error.message });

    const isoWeekOf = (d) => {
      const date = new Date(d + 'T12:00:00Z');
      const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      const dayNum = tmp.getUTCDay() || 7;
      tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
      return Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
    };

    const semanas = [];
    for (let w = 1; w <= 52; w++) {
      const linha = { num_semana: w, label: `S${w}` };
      anos.forEach(a => {
        linha[String(a)] = 0;
        linha[`${a}_label`] = null;
        linha[`${a}_inicio`] = null;
        linha[`${a}_fim`] = null;
      });
      semanas.push(linha);
    }

    (data || []).forEach(r => {
      const w = isoWeekOf(r.semana_inicio);
      if (w < 1 || w > 52) return;
      const slot = semanas[w - 1];
      slot[String(r.ano)] = Number(r.receita || 0);
      slot[`${r.ano}_label`] = r.semana_label;
      slot[`${r.ano}_inicio`] = r.semana_inicio;
      slot[`${r.ano}_fim`] = r.semana_fim;
    });

    res.json({ anos, semanas });
  } catch (e) {
    console.error('[FIN-V2] sazonalidade-semanal:', e);
    res.status(500).json({ error: e.message });
  }
});

// ====================================================================
// DRILLDOWN · transações de uma categoria no período · 2026-05-28
// ====================================================================
router.get('/categoria-transacoes', async (req, res) => {
  try {
    const { categoria, inicio, fim } = req.query;
    if (!inicio || !fim) return res.status(400).json({ error: 'início e fim obrigatórios' });

    // Mapeia categoria do UI (label do labelCategoria do backend) → prefixos do plano de contas
    const PREFIXOS = {
      'dizimos': ['3.01.01'],
      'ofertas regulares': ['3.01.02'],
      'campanha 2025': ['3.02.01'],
      'eventos': ['3.02.02'],
      'outras ofertas': ['3.02.03'],
      'financeiras': ['3.02.06'],
    };
    const catNorm = String(categoria || '').toLowerCase().normalize('NFD').replace(/[^\w\s]/g, '').trim();
    const prefixos = PREFIXOS[catNorm] || null;

    let q = supabase
      .from('vw_fin_transacoes_completa')
      .select('id, data_competencia, descricao, valor, plano_contas_codigo, plano_contas_nome, plano_contas_natureza, membro_nome, referencia, conta_id, classe_movimento')
      .eq('tipo', 'receita')
      .neq('status', 'cancelado')
      .in('classe_movimento', ['ordinaria', 'extraordinaria'])
      .gte('data_competencia', inicio)
      .lte('data_competencia', fim)
      .order('data_competencia', { ascending: false })
      .order('valor', { ascending: false });

    if (prefixos) {
      const ors = prefixos.map(p => `plano_contas_codigo.like.${p}.%`).join(',');
      q = q.or(ors);
    } else if (catNorm.includes('ministerial') || catNorm.includes('campanhas e outros') || catNorm.includes('extraordin')) {
      q = q.eq('plano_contas_natureza', 'extraordinaria');
    }

    const { data, error } = await q.limit(2000);
    if (error) return res.status(400).json({ error: error.message });

    const total = (data || []).reduce((s, r) => s + Number(r.valor || 0), 0);
    res.json({
      categoria, inicio, fim,
      total,
      qtd: (data || []).length,
      transacoes: (data || []).map(r => ({
        ...r,
        valor: Number(r.valor || 0),
      })),
    });
  } catch (e) {
    console.error('[FIN-V2] categoria-transacoes:', e);
    res.status(500).json({ error: e.message });
  }
});

// ====================================================================
// DRILLDOWN · despesas detalhadas · 2026-05-28
// ====================================================================
router.get('/despesa-transacoes', async (req, res) => {
  try {
    const { categoria_codigo, plano_codigo, centro_codigo, inicio, fim } = req.query;
    if (!inicio || !fim) return res.status(400).json({ error: 'início e fim obrigatórios' });

    let q = supabase
      .from('vw_fin_transacoes_completa')
      .select('id, data_competencia, descricao, valor, plano_contas_codigo, plano_contas_nome, centro_custo_codigo, centro_custo_nome, referencia, classe_movimento')
      .eq('tipo', 'despesa')
      .neq('status', 'cancelado')
      .in('classe_movimento', ['ordinaria', 'extraordinaria'])
      .gte('data_competencia', inicio)
      .lte('data_competencia', fim)
      .order('data_competencia', { ascending: false })
      .order('valor', { ascending: false });

    if (categoria_codigo) q = q.like('plano_contas_codigo', `${categoria_codigo}.%`);
    if (plano_codigo) q = q.eq('plano_contas_codigo', plano_codigo);
    if (centro_codigo) q = q.eq('centro_custo_codigo', centro_codigo);

    const { data, error } = await q.limit(2000);
    if (error) return res.status(400).json({ error: error.message });

    const total = (data || []).reduce((s, r) => s + Number(r.valor || 0), 0);
    res.json({
      categoria_codigo, plano_codigo, centro_codigo, inicio, fim,
      total,
      qtd: (data || []).length,
      transacoes: (data || []).map(r => ({ ...r, valor: Number(r.valor || 0) })),
    });
  } catch (e) {
    console.error('[FIN-V2] despesa-transacoes:', e);
    res.status(500).json({ error: e.message });
  }
});

// ====================================================================
// PLANO DE CONTAS + CENTROS · listagem leve pra filtros globais
// ====================================================================
router.get('/filtros-disponiveis', async (req, res) => {
  try {
    const [planos, centros] = await Promise.all([
      supabase.from('fin_plano_contas')
        .select('id, codigo, nome, tipo, classe')
        .eq('ativo', true)
        .order('codigo'),
      supabase.from('fin_centros_custo')
        .select('id, codigo, nome, campus')
        .eq('ativo', true)
        .order('codigo'),
    ]);
    res.json({
      planos: planos.data || [],
      centros: centros.data || [],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ====================================================================
// SAÚDE FINANCEIRA · resultado + folha + concentração doadores · 2026-05-29
// ====================================================================
router.get('/saude-financeira', async (req, res) => {
  try {
    const ano = Number(req.query.ano) || new Date().getFullYear();
    const { data, error } = await supabase.rpc('fin_saude_financeira', { p_ano: ano });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || {});
  } catch (e) {
    console.error('[FIN-V2] saude-financeira:', e);
    res.status(500).json({ error: e.message });
  }
});

// Lista paginada de doadores do ano · alimenta drilldown do card "Concentração de doadores"
router.get('/doadores', async (req, res) => {
  try {
    const ano = Number(req.query.ano) || new Date().getFullYear();
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const { data, error } = await supabase.rpc('fn_fin_doadores_lista', {
      p_ano: ano, p_limit: limit, p_offset: offset,
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || { items: [], total_geral: 0, qtd_total: 0 });
  } catch (e) {
    console.error('[FIN-V2] doadores:', e);
    res.status(500).json({ error: e.message });
  }
});

// Lançamentos individuais de um doador (usado quando não está vinculado a mem_membros)
router.get('/doador/transacoes', async (req, res) => {
  try {
    const nome = String(req.query.nome || '').trim();
    if (!nome) return res.status(400).json({ error: 'parametro nome obrigatorio' });
    const ano = Number(req.query.ano) || new Date().getFullYear();
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const { data, error } = await supabase.rpc('fn_fin_transacoes_por_referencia', {
      p_nome: nome, p_ano: ano, p_limit: limit,
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || { items: [], total: 0, qtd: 0 });
  } catch (e) {
    console.error('[FIN-V2] doador transacoes:', e);
    res.status(500).json({ error: e.message });
  }
});

// ====================================================================
// DÍZIMO VS OFERTA mensal · 2026-05-29
// ====================================================================
router.get('/dizimo-oferta', async (req, res) => {
  try {
    const ano = Number(req.query.ano) || new Date().getFullYear();
    const { data, error } = await supabase.rpc('fin_dizimo_oferta_mensal', { p_ano: ano });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ano, meses: data || [] });
  } catch (e) {
    console.error('[FIN-V2] dizimo-oferta:', e);
    res.status(500).json({ error: e.message });
  }
});

// ====================================================================
// METAS · progresso de cada meta no período · 2026-05-28
// Filtros: ano, mês (1-12), semana_inicio (YYYY-MM-DD)
// Se nada passado, cada meta usa sua própria periodicidade no período atual.
// ====================================================================
router.get('/metas-progresso', async (req, res) => {
  try {
    const { ano, mes, semana_inicio, meta_id } = req.query;
    let p_inicio = null;
    let p_fim = null;

    if (semana_inicio) {
      const { data: sem } = await supabase.rpc('fin_semana_qua_ter', { p_data: semana_inicio });
      const r = (sem || [])[0];
      if (r) { p_inicio = r.inicio; p_fim = r.fim; }
    } else if (ano && mes) {
      const a = Number(ano);
      const m = Number(mes);
      p_inicio = `${a}-${String(m).padStart(2, '0')}-01`;
      const last = new Date(a, m, 0).getDate();
      p_fim = `${a}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    } else if (ano) {
      p_inicio = `${ano}-01-01`;
      p_fim = `${ano}-12-31`;
    }

    const rpcArgs = { p_inicio, p_fim };
    if (meta_id) rpcArgs.p_meta_id = meta_id;

    const { data, error } = await supabase.rpc('fin_metas_progresso', rpcArgs);
    if (error) return res.status(400).json({ error: error.message });

    res.json({
      filtro: { ano: ano || null, mes: mes || null, semana_inicio: semana_inicio || null, meta_id: meta_id || null, periodo_inicio: p_inicio, periodo_fim: p_fim },
      metas: (data || []).map(m => ({
        ...m,
        valor_meta: Number(m.valor_meta || 0),
        valor_atual: Number(m.valor_atual || 0),
        pct: Number(m.pct || 0),
      })),
    });
  } catch (e) {
    console.error('[FIN-V2] metas-progresso:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
