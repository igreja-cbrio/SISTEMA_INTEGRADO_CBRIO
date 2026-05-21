// Rotas do modulo Financeiro V2 · estrutura fiscal
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
//   /classificar/:id       · aprova/edita sugestao
//   /transacoes            · transacoes finais classificadas (view)
//   /dashboard/semana      · resumo da semana qua-ter
//   /dashboard/culto       · receita por culto na semana

const router = require('express').Router();
const multer = require('multer');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
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
      return res.status(400).json({ error: 'codigo, nome, tipo e nivel obrigatorios' });
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
      return res.status(400).json({ error: 'codigo, nome e nivel obrigatorios' });
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
      return res.status(400).json({ error: 'centavo e descricao obrigatorios' });
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
// REGRAS DE CLASSIFICACAO
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
    // Roda classificacao em batch
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
// UPLOADS HISTORICO
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
// FILA DE CLASSIFICACAO
// ====================================================================
router.get('/fila-classificacao', async (req, res) => {
  try {
    const { status = 'pendente', limit = 100 } = req.query;
    const { data, error } = await supabase
      .from('fin_fila_classificacao')
      .select(`
        *,
        lancamento:lancamento_bruto_id(*),
        sugestao_plano:sugestao_plano_contas_id(codigo, nome, tipo),
        sugestao_centro:sugestao_centro_custo_id(codigo, nome),
        sugestao_membro:sugestao_membro_id(nome, cpf, status)
      `)
      .eq('status', status)
      .order('created_at', { ascending: false })
      .limit(Number(limit));
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar fila' }); }
});

// ====================================================================
// APROVAR / EDITAR classificacao
// ====================================================================
router.post('/classificar/:filaId/aprovar', async (req, res) => {
  try {
    const { plano_contas_id, centro_custo_id, membro_id, identificador_centavo, observacoes } = req.body;

    // Busca fila + lancamento bruto
    const { data: fila, error: errFila } = await supabase
      .from('fin_fila_classificacao')
      .select('*, lancamento:lancamento_bruto_id(*)')
      .eq('id', req.params.filaId).single();
    if (errFila || !fila) return res.status(404).json({ error: 'Item nao encontrado' });

    const lanc = fila.lancamento;
    const finalPlanoContas = plano_contas_id || fila.sugestao_plano_contas_id;
    const finalCentroCusto = centro_custo_id !== undefined ? centro_custo_id : fila.sugestao_centro_custo_id;
    const finalMembro = membro_id !== undefined ? membro_id : fila.sugestao_membro_id;

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

    // Cria transacao final
    const { data: transacao, error: errTrans } = await supabase
      .from('fin_transacoes')
      .insert({
        conta_id: lanc.conta_id,
        tipo: tipoTransacao,
        descricao: lanc.memo || 'Sem descricao',
        valor: Math.abs(lanc.valor),
        data_competencia: lanc.data_lancamento,
        data_pagamento: lanc.data_lancamento,
        status: 'pago',
        referencia: lanc.fitid || lanc.end_to_end_id,
        observacoes,
        plano_contas_id: finalPlanoContas,
        centro_custo_id: finalCentroCusto,
        membro_id: finalMembro,
        lancamento_bruto_id: lanc.id,
        culto_slot_id,
        hora_real: lanc.hora_lancamento,
        classificacao_origem: req.body.origem || fila.sugestao_origem || 'manual',
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

    // Aprende pra memoria
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
    const { desde, ate, plano_contas_id, centro_custo_id, culto_slot_id, limit = 200 } = req.query;
    let q = supabase
      .from('vw_fin_transacoes_completa')
      .select('*')
      .order('data_competencia', { ascending: false })
      .limit(Number(limit));
    if (desde) q = q.gte('data_competencia', desde);
    if (ate) q = q.lte('data_competencia', ate);
    if (plano_contas_id) q = q.eq('plano_contas_id', plano_contas_id);
    if (centro_custo_id) q = q.eq('centro_custo_id', centro_custo_id);
    if (culto_slot_id) q = q.eq('culto_slot_id', culto_slot_id);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar transacoes' }); }
});

// ====================================================================
// DASHBOARD OVERVIEW · agrega tudo do /admin/financeiro home
// ====================================================================

// Calcula range [inicio, fim] e ranges anteriores baseados no period
function calcPeriodRanges(period) {
  const hoje = new Date();
  let inicio, fim, inicioAnt, fimAnt;

  fim = new Date(hoje);
  fimAnt = new Date(hoje);

  if (period === 'week') {
    // Domingo a sabado (esta semana)
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

router.get('/dashboard/overview', async (req, res) => {
  try {
    const period = ['week', 'month', 'quarter', 'year'].includes(req.query.period) ? req.query.period : 'month';
    const hoje = new Date();
    const hojeStr = hoje.toISOString().slice(0, 10);
    const ranges = calcPeriodRanges(period);
    // 12 meses atras (pra grafico de fluxo de caixa anual)
    const dozeMesesAtras = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1).toISOString().slice(0, 10);

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
      supabase.from('fin_transacoes').select('tipo, valor, status')
        .gte('data_competencia', ranges.inicio).lte('data_competencia', ranges.fim)
        .neq('status', 'cancelado'),
      supabase.from('fin_transacoes').select('tipo, valor')
        .gte('data_competencia', ranges.inicio_ant).lte('data_competencia', ranges.fim_ant)
        .neq('status', 'cancelado'),
      supabase.from('fin_transacoes')
        .select('tipo, valor, data_competencia')
        .gte('data_competencia', dozeMesesAtras)
        .neq('status', 'cancelado'),
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
        .not('culto_slot_id', 'is', null),
      supabase.from('vw_fin_transacoes_completa')
        .select('plano_contas_codigo, plano_contas_nome, valor')
        .gte('data_competencia', ranges.inicio).lte('data_competencia', ranges.fim)
        .eq('tipo', 'despesa')
        .not('plano_contas_id', 'is', null),
      supabase.from('vw_fin_transacoes_completa')
        .select('id, descricao, valor, tipo, status, data_competencia, plano_contas_nome, culto_nome')
        .order('data_competencia', { ascending: false })
        .neq('status', 'cancelado')
        .limit(8),
    ]);

    const contasAtivas = (contas.data || []).filter(c => c.ativa);
    const saldoTotal = contasAtivas.reduce((s, c) => s + Number(c.saldo || 0), 0);

    const tMes = transPeriodo.data || [];
    const receitaMes = tMes.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
    const despesaMes = tMes.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);

    const tMesAnt = transPeriodoAnt.data || [];
    const receitaMesAnt = tMesAnt.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
    const despesaMesAnt = tMesAnt.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);

    // Serie 6 meses · agrupa por YYYY-MM
    const serieMap = new Map();
    for (const t of trans6m.data || []) {
      const mes = t.data_competencia.slice(0, 7);
      if (!serieMap.has(mes)) serieMap.set(mes, { mes, receita: 0, despesa: 0 });
      const row = serieMap.get(mes);
      if (t.tipo === 'receita') row.receita += Number(t.valor);
      else if (t.tipo === 'despesa') row.despesa += Number(t.valor);
    }
    const serie6m = Array.from(serieMap.values()).sort((a, b) => a.mes.localeCompare(b.mes));

    // Receita por culto · agregado dos ultimos 6 meses
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

    // Top 5 categorias de despesa do periodo
    // Mapeamento nivel 2 -> rotulo amigavel (codigo aceita curtos)
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
      transacoes_recentes: recentes.data || [],
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

      // Extrai CPF/CNPJ se houver na descricao
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
      return res.status(400).json({ error: 'mes obrigatorio no formato YYYY-MM' });
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

    // Pivot · mes → totais
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

module.exports = router;
