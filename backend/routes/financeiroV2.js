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
const crypto = require('crypto');
const multer = require('multer');
const { authenticate, authorizeModule } = require('../middleware/auth');
const { supabase } = require('../utils/supabase');
const { montarGrade } = require('../utils/decendioComparativo');
const { parseOfx } = require('../services/ofxParser');
const { parsePixExtrato } = require('../services/pixExtratoParser');
const { vincularIdentidadeOfx } = require('../services/ofxIdentidade');
const conciliacaoOfx = require('../services/conciliacaoBalancoOfx');
const {
  matchOfxPix, classificarBatch, aprenderClassificacao, resolverMembroPorDocumento, sugerirLoteIA,
} = require('../services/financeiroClassificador');
const { sugerirMatches, aplicarMatch, baixaAutomaticaPorTransacao } = require('../services/finConciliador');
const {
  vincularTransacaoNaFatura, fecharFaturasVencidas, itensDaFatura, sincronizarFatura,
} = require('../services/finFaturas');
const { notificar } = require('../services/notificar');

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

router.delete('/plano-contas/:id', authorizeModule('financeiro', 4), async (req, res) => {
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

router.delete('/centros-custo/:id', authorizeModule('financeiro', 4), async (req, res) => {
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

router.delete('/identificadores/:id', authorizeModule('financeiro', 4), async (req, res) => {
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

router.delete('/culto-slots/:id', authorizeModule('financeiro', 4), async (req, res) => {
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

router.delete('/regras-classificacao/:id', authorizeModule('financeiro', 4), async (req, res) => {
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

    // Fase 1 · OFX alimenta identidade por CPF: resolve UM membro por CPF/CNPJ
    // único (observação de identidade + vínculo por CPF exato + cria avulso só
    // em PIX de crédito). Best-effort — se falhar, o import segue sem membro_id.
    let identidadeStats = null;
    let mapaDoc = new Map();
    try {
      const r = await vincularIdentidadeOfx(parsed.transactions, { criarAvulso: true });
      mapaDoc = r.mapaDoc;
      identidadeStats = r.stats;
    } catch (e) {
      console.error('[FIN-V2] identidade OFX:', e.message);
    }

    // Insere lancamentos brutos (ignora duplicados via UNIQUE)
    let inseridos = 0;
    let duplicados = 0;

    for (const t of parsed.transactions) {
      const docLimpo = t.documento_contraparte ? String(t.documento_contraparte).replace(/\D/g, '') : null;
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
        membro_id: (docLimpo && mapaDoc.get(docLimpo)) || null,
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

    // Baixa automática pós-import: pares PERFEITOS extrato × contas a pagar
    // (score 100 = valor exato + débito único + contraparte casa) são aplicados
    // sozinhos — conta baixada + transação conciliada. Best-effort.
    let conciliadasAuto = 0;
    try {
      const { pares } = await sugerirMatches();
      for (const p of pares.filter((x) => x.score === 100)) {
        const r = await aplicarMatch({ contaId: p.conta.id, brutoId: p.bruto.id, userId: req.user.userId, score: 100, origem: 'conciliacao_auto' });
        if (!r.erro) conciliadasAuto++;
      }
    } catch (e) { console.error('[FIN-V2] conciliação pós-OFX:', e.message); }

    // Identifica doadores automaticamente: casa cada doação do balanço
    // (nome+valor+data, sem CPF) com o PIX do OFX (CPF) e vincula ao membro na
    // LINHA DO BALANÇO (não cria transação → não duplica). Só o inequívoco é
    // vinculado; ambíguo fica sem atribuição (a fila de revisão é opcional).
    // Best-effort — não derruba o import.
    let doadoresIdentificados = null;
    try {
      if (parsed.header.dtStart && parsed.header.dtEnd) {
        const r = await conciliacaoOfx.conciliar({
          inicio: parsed.header.dtStart, fim: parsed.header.dtEnd,
          dryRun: false, userId: req.user.userId,
        });
        doadoresIdentificados = { vinculados: r.stats.vinculados || 0, avulsos: r.stats.avulsos_criados || 0, pendentes: r.stats.revisao || 0 };
      }
    } catch (e) { console.error('[FIN-V2] identificação de doadores pós-OFX:', e.message); }

    res.json({
      upload_id: uploadRow.id,
      total, inseridos, duplicados,
      match_pix: matchResult,
      classificacao: classifResult,
      conciliadas_auto: conciliadasAuto,
      identidade: identidadeStats,
      doadores_identificados: doadoresIdentificados,
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
// IMPORTAR BALANÇO (planilha do sistema financeiro legado · .xlsx)
// ====================================================================
// Sobe a planilha exportada do sistema financeiro (formato "Balanço") direto
// pra fin_transacoes. Idempotente (dedup por codigo_legado · só entra o novo),
// classe_movimento e o get-or-create de plano/centro/conta/grupo são resolvidos
// pela RPC balanco_importar_linha (respeita a regra "empréstimo não é receita").
router.post('/importar/balanco', authorizeModule('financeiro', 4), upload.single('arquivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo do balanço (.xlsx) obrigatório' });

  const { importarBalanco } = require('../services/balancoImporter');
  let uploadRow = null;
  try {
    const { data: up } = await supabase
      .from('fin_uploads')
      .insert({
        tipo: 'balanco',
        arquivo_nome: req.file.originalname,
        arquivo_tamanho: req.file.size,
        status: 'processando',
        created_by: req.user.userId,
      })
      .select().single();
    uploadRow = up;

    const r = await importarBalanco(req.file.buffer);

    if (uploadRow) {
      await supabase.from('fin_uploads')
        .update({
          total_registros: r.lidas,
          total_novos: r.inseridas,
          total_duplicados: r.ja_existentes,
          data_inicio: r.periodo?.inicio || null,
          data_fim: r.periodo?.fim || null,
          status: r.erros.length ? 'erro' : 'concluido',
          erro_msg: r.erros.length ? r.erros.join(' | ').slice(0, 500) : null,
          concluido_em: new Date().toISOString(),
        })
        .eq('id', uploadRow.id);
    }

    // Notifica o financeiro quando entra dado novo (best-effort · não quebra o fluxo)
    if (r.inseridas > 0) {
      try {
        await notificar({
          modulo: 'financeiro',
          tipo: 'balanco_importado',
          titulo: 'Balanço importado',
          mensagem: `${r.inseridas} novo(s) lançamento(s) do balanço importado(s)`
            + (r.periodo ? ` · ${r.periodo.inicio} a ${r.periodo.fim}` : ''),
          link: '/financeiro-v2?tab=importar',
        });
      } catch (_) { /* notificação não é crítica */ }
    }

    // Identifica doadores automaticamente pro período do balanço recém-importado
    // (casa com o OFX já existente por CPF · vincula só o inequívoco · best-effort).
    let doadoresIdentificados = null;
    if (r.inseridas > 0 && r.periodo?.inicio && r.periodo?.fim) {
      try {
        const c = await conciliacaoOfx.conciliar({
          inicio: r.periodo.inicio, fim: r.periodo.fim,
          dryRun: false, userId: req.user.userId,
        });
        doadoresIdentificados = { vinculados: c.stats.vinculados || 0, avulsos: c.stats.avulsos_criados || 0, pendentes: c.stats.revisao || 0 };
      } catch (e) { console.error('[FIN-V2] identificação de doadores pós-balanço:', e.message); }
    }

    res.json({ upload_id: uploadRow?.id, ...r, doadores_identificados: doadoresIdentificados });
  } catch (e) {
    console.error('[FIN-V2] Balanço:', e);
    if (uploadRow) {
      try {
        await supabase.from('fin_uploads')
          .update({ status: 'erro', erro_msg: (e.message || '').slice(0, 500), concluido_em: new Date().toISOString() })
          .eq('id', uploadRow.id);
      } catch (_) { /* ignore */ }
    }
    res.status(500).json({ error: e.message || 'Erro ao importar balanço' });
  }
});

// ====================================================================
// IMPORTAR CONTRIBUIÇÕES NOMINAIS (por pessoa · .xlsx/.csv)
// ====================================================================
// Sobe a planilha nominal de contribuições (uma linha por doação, com o nome/CPF
// do contribuinte) direto pra mem_contribuicoes. Idempotente (dedup por
// referencia_externa = sha256(membro|data|valor|tipo) · só entra o que é novo).
// Casa cada linha a um membro EXISTENTE (nunca cria membro · linhas sem match
// viram "sem vínculo" no relatório). Mesmo guard/nível do /importar/balanco.
//
// Duas rotas: /previa (commit=false · calcula o resumo sem gravar, pra tela
// mostrar antes de confirmar) e a rota base (commit=true · grava).
router.post('/importar/contribuicoes/previa', authorizeModule('financeiro', 4), upload.single('arquivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo de contribuições (.xlsx/.csv) obrigatório' });
  const { parsePlanilha, processar } = require('../services/contribuicoesImporter');
  try {
    const { rows, colunas_detectadas, faltando } = parsePlanilha(req.file.buffer);
    if (faltando.length) {
      return res.status(400).json({
        error: `Planilha não reconhecida · faltam colunas obrigatórias: ${faltando.join(', ')}`,
        colunas_detectadas,
        faltando,
      });
    }
    const r = await processar(rows, { commit: false });
    res.json({ ...r, colunas_detectadas });
  } catch (e) {
    console.error('[FIN-V2] contribuições prévia:', e);
    res.status(500).json({ error: e.message || 'Erro ao pré-visualizar contribuições' });
  }
});

router.post('/importar/contribuicoes', authorizeModule('financeiro', 4), upload.single('arquivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo de contribuições (.xlsx/.csv) obrigatório' });
  const { parsePlanilha, processar } = require('../services/contribuicoesImporter');
  try {
    const { rows, colunas_detectadas, faltando } = parsePlanilha(req.file.buffer);
    if (faltando.length) {
      return res.status(400).json({
        error: `Planilha não reconhecida · faltam colunas obrigatórias: ${faltando.join(', ')}`,
        colunas_detectadas,
        faltando,
      });
    }

    // Registra no histórico de importações (fin_uploads · tipo 'contribuicoes'
    // liberado na migration 20260722240000). A idempotência real vive na
    // mem_contribuicoes (referencia_externa); o histórico é só rastro/auditoria.
    let uploadRow = null;
    try {
      const { data: up } = await supabase
        .from('fin_uploads')
        .insert({
          tipo: 'contribuicoes',
          arquivo_nome: req.file.originalname,
          arquivo_tamanho: req.file.size,
          status: 'processando',
          created_by: req.user.userId,
        })
        .select().single();
      uploadRow = up;
    } catch (_) { /* histórico é best-effort · não bloqueia a importação */ }

    const r = await processar(rows, { userId: req.user.userId, commit: true });

    if (uploadRow) {
      try {
        await supabase.from('fin_uploads')
          .update({
            total_registros: r.total,
            total_novos: r.inseridos,
            total_duplicados: r.duplicados,
            status: r.erros.length ? 'erro' : 'concluido',
            erro_msg: r.erros.length ? r.erros.map(e => `L${e.linha}: ${e.motivo}`).join(' | ').slice(0, 500) : null,
            concluido_em: new Date().toISOString(),
          })
          .eq('id', uploadRow.id);
      } catch (_) { /* ignore */ }
    }

    if (r.inseridos > 0) {
      try {
        await notificar({
          modulo: 'financeiro',
          tipo: 'contribuicoes_importadas',
          titulo: 'Contribuições importadas',
          mensagem: `${r.inseridos} nova(s) contribuição(ões) nominal(is) importada(s)`
            + (r.sem_vinculo ? ` · ${r.sem_vinculo} sem vínculo` : ''),
          link: '/financeiro-v2?tab=importar',
        });
      } catch (_) { /* notificação não é crítica */ }
    }

    res.json({ upload_id: uploadRow?.id, ...r, colunas_detectadas });
  } catch (e) {
    console.error('[FIN-V2] contribuições:', e);
    res.status(500).json({ error: e.message || 'Erro ao importar contribuições' });
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

    // Baixa automática no Contas a Pagar: se esta despesa bate com exatamente
    // UMA conta pendente (mesmo valor, vencimento ±10d), dá baixa sozinho.
    let contaBaixada = null;
    if (transacao?.tipo === 'despesa') {
      contaBaixada = await baixaAutomaticaPorTransacao(transacao, req.user.userId);
    }

    res.json({ transacao, conta_pagar_baixada: contaBaixada });
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
// NOTAS DE COMPRAS · notas fiscais escaneadas pela logística
// (fluxo: compras escaneia/revisa → enviada_financeiro → aqui o
//  financeiro confere a categorização e lança como fin_transacoes)
// ====================================================================
router.get('/notas-compras', async (req, res) => {
  try {
    const { status = 'enviada_financeiro', limit = 100 } = req.query;
    let query = supabase.from('log_notas_fiscais')
      .select('*, log_fornecedores(razao_social, nome_fantasia)')
      .order('enviada_financeiro_em', { ascending: false, nullsFirst: false })
      .limit(Number(limit));
    if (status !== 'todas') query = query.eq('status', status);
    else query = query.neq('status', 'registrada');
    const { data: notas, error } = await query;
    if (error) return res.status(400).json({ error: error.message });
    if (!notas?.length) return res.json([]);

    // Resolve nomes das sugestões em batch (mesmo padrão da fila de classificação)
    const planoIds = [...new Set(notas.map(n => n.sugestao_plano_contas_id).filter(Boolean))];
    const centroIds = [...new Set(notas.map(n => n.sugestao_centro_custo_id).filter(Boolean))];
    const [planos, centros] = await Promise.all([
      planoIds.length ? supabase.from('fin_plano_contas').select('id, codigo, nome').in('id', planoIds) : { data: [] },
      centroIds.length ? supabase.from('fin_centros_custo').select('id, codigo, nome').in('id', centroIds) : { data: [] },
    ]);
    const pMap = new Map((planos.data || []).map(p => [p.id, p]));
    const cMap = new Map((centros.data || []).map(c => [c.id, c]));

    res.json(notas.map(n => ({
      ...n,
      sugestao_plano: pMap.get(n.sugestao_plano_contas_id) || null,
      sugestao_centro: cMap.get(n.sugestao_centro_custo_id) || null,
    })));
  } catch (e) { res.status(500).json({ error: 'Erro ao listar notas de compras: ' + e.message }); }
});

// Lançar a nota: cria fin_transacoes (despesa) e tenta conciliar com o extrato.
// Se existir exatamente 1 débito OFX não classificado com o mesmo valor na
// janela da emissão, a transação nasce conciliada e o item sai da fila.
router.post('/notas-compras/:id/lancar', async (req, res) => {
  try {
    const { plano_contas_id, centro_custo_id, conta_id, data_pagamento, observacoes } = req.body;

    const { data: nota, error: errNota } = await supabase.from('log_notas_fiscais')
      .select('*').eq('id', req.params.id).single();
    if (errNota || !nota) return res.status(404).json({ error: 'Nota não encontrada' });
    if (nota.status !== 'enviada_financeiro') {
      return res.status(400).json({ error: `Nota com status "${nota.status}" não está na fila de lançamento` });
    }

    const finalPlano = plano_contas_id || nota.sugestao_plano_contas_id;
    const finalCentro = centro_custo_id !== undefined ? (centro_custo_id || null) : nota.sugestao_centro_custo_id;
    if (!finalPlano) return res.status(400).json({ error: 'plano_contas_id obrigatório' });
    const valor = Math.abs(Number(nota.valor) || 0);
    if (!valor) return res.status(400).json({ error: 'Nota sem valor' });

    // Conciliação com o extrato: débito não classificado, mesmo valor,
    // data entre a emissão e emissão+15d
    let bruto = null;
    try {
      const emissao = nota.data_emissao;
      const fimJanela = new Date(new Date(`${emissao}T12:00:00`).getTime() + 15 * 86400000).toISOString().slice(0, 10);
      const { data: candidatos } = await supabase.from('fin_lancamentos_brutos')
        .select('id, conta_id, valor, tipo_trn, data_lancamento, memo')
        .eq('ja_classificado', false)
        .in('valor', [-valor, valor])
        .gte('data_lancamento', emissao)
        .lte('data_lancamento', fimJanela);
      const debitos = (candidatos || []).filter(c => c.tipo_trn === 'DEBIT' || Number(c.valor) < 0);
      if (debitos.length === 1) bruto = debitos[0];
    } catch (e) { console.error('[FIN-V2] match NF×extrato:', e.message); }

    const finalConta = bruto?.conta_id || conta_id;
    if (!finalConta) return res.status(400).json({ error: 'Sem débito correspondente no extrato — informe a conta bancária (conta_id)' });

    const origemMap = { memoria: 'memoria', regra: 'regra', ia: 'ia' };
    const usouSugestao = !plano_contas_id || plano_contas_id === nota.sugestao_plano_contas_id;
    const classificacaoOrigem = usouSugestao ? (origemMap[nota.sugestao_origem] || 'manual') : 'manual';

    const { data: transacao, error: errTrans } = await supabase.from('fin_transacoes')
      .insert({
        conta_id: finalConta,
        tipo: 'despesa',
        descricao: nota.descricao || `NF ${nota.numero}${nota.emitente_nome ? ` · ${nota.emitente_nome}` : ''}`,
        valor,
        data_competencia: nota.data_emissao,
        data_pagamento: bruto?.data_lancamento || data_pagamento || nota.data_emissao,
        status: bruto ? 'conciliado' : 'pendente',
        referencia: nota.chave_acesso || `NF ${nota.numero}`,
        observacoes: observacoes || null,
        plano_contas_id: finalPlano,
        centro_custo_id: finalCentro,
        lancamento_bruto_id: bruto?.id || null,
        classificacao_origem: classificacaoOrigem,
        classificacao_confianca: classificacaoOrigem === 'manual' ? 1.0 : (nota.sugestao_confianca || null),
        created_by: req.user.userId,
      })
      .select().single();
    if (errTrans) return res.status(400).json({ error: errTrans.message });

    // Secundárias best-effort · o write primário (transação) já decidiu o sucesso
    if (bruto) {
      try {
        await supabase.from('fin_lancamentos_brutos').update({ ja_classificado: true }).eq('id', bruto.id);
        await supabase.from('fin_fila_classificacao')
          .update({ status: 'ignorado', decidido_em: new Date().toISOString(), decidido_por: req.user.userId })
          .eq('lancamento_bruto_id', bruto.id).eq('status', 'pendente');
      } catch (e) { console.error('[FIN-V2] marcar bruto da NF:', e.message); }
    }
    try {
      await supabase.from('log_notas_fiscais')
        .update({
          status: 'lancada',
          transacao_id: transacao.id,
          lancada_em: new Date().toISOString(),
          lancada_por: req.user.userId,
          sugestao_plano_contas_id: finalPlano,
          sugestao_centro_custo_id: finalCentro,
        })
        .eq('id', nota.id);
    } catch (e) { console.error('[FIN-V2] atualizar nota lançada:', e.message); }
    try {
      // Memória do classificador: próximo débito desse fornecedor já vem sugerido
      await aprenderClassificacao({
        documento: nota.emitente_cnpj,
        nome: nota.emitente_nome,
        plano_contas_id: finalPlano,
        centro_custo_id: finalCentro,
      });
    } catch (e) { console.error('[FIN-V2] aprender NF:', e.message); }
    try {
      await notificar({
        modulo: 'logistica',
        tipo: 'nf_compra_lancada',
        titulo: 'Nota fiscal lançada pelo financeiro',
        mensagem: `${nota.emitente_nome || `NF ${nota.numero}`} · ${valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · ${bruto ? 'conciliada com o extrato' : 'lançada como pendente'}.`,
        link: '/admin/logistica',
        severidade: 'info',
        chaveDedup: `nf_lancada_${nota.id}`,
      });
    } catch (e) { console.error('[FIN-V2] notificar NF lançada:', e.message); }

    res.json({ transacao, conciliada: !!bruto });
  } catch (e) {
    console.error('[FIN-V2] lançar NF:', e);
    res.status(500).json({ error: e.message || 'Erro ao lançar nota' });
  }
});

// Devolver pra equipe de compras (dados incompletos, duplicada etc.)
router.post('/notas-compras/:id/rejeitar', async (req, res) => {
  try {
    const { motivo } = req.body;
    const { data: nota, error: errNota } = await supabase.from('log_notas_fiscais')
      .select('id, status, numero, emitente_nome').eq('id', req.params.id).single();
    if (errNota || !nota) return res.status(404).json({ error: 'Nota não encontrada' });
    if (nota.status !== 'enviada_financeiro') {
      return res.status(400).json({ error: `Nota com status "${nota.status}" não está na fila de lançamento` });
    }

    const { data, error } = await supabase.from('log_notas_fiscais')
      .update({ status: 'rejeitada', rejeitada_motivo: motivo || null })
      .eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });

    try {
      await notificar({
        modulo: 'logistica',
        tipo: 'nf_compra_rejeitada',
        titulo: 'Nota fiscal devolvida pelo financeiro',
        mensagem: `${nota.emitente_nome || `NF ${nota.numero}`} foi devolvida${motivo ? `: ${motivo.slice(0, 120)}` : ''}.`,
        link: '/admin/logistica',
        severidade: 'aviso',
        chaveDedup: `nf_rejeitada_${nota.id}`,
      });
    } catch (e) { console.error('[FIN-V2] notificar NF rejeitada:', e.message); }

    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao rejeitar nota' }); }
});

// GET /api/financeiro-v2/kpis/taticos — KPI TÁTICO OFICIAL da área
// 'generosidade' (kpi_indicadores_taticos + vw_kpi_trajetoria_atual), mesmo
// padrão do piloto em grupos.js/voluntariado.js/cuidados.js/integracao.js.
// ⚠️ Não existe area='financeiro' na tabela — os KPIs táticos de doação/dízimo
// vivem em 'generosidade' (GEN-01..GEN-05). É essa a fonte aqui, distinta do
// número operacional do Dashboard Financeiro Semanal (fin_transacoes/vw_fin_semana_*).
router.get('/kpis/taticos', async (req, res) => {
  try {
    const { data: kpisRaw, error: kpisErr } = await supabase
      .from('kpi_indicadores_taticos')
      .select('id, indicador, descricao, meta_descricao, meta_valor, unidade, periodicidade, lider_funcionario_id')
      .eq('ativo', true)
      .ilike('area', 'generosidade')
      .order('indicador', { ascending: true });
    if (kpisErr) throw kpisErr;
    const kpis = kpisRaw || [];
    const kpiIds = kpis.map(k => k.id);

    let trajByKpi = {};
    if (kpiIds.length > 0) {
      const { data: traj, error: trajErr } = await supabase
        .from('vw_kpi_trajetoria_atual')
        .select('kpi_id, status_trajetoria, ultimo_periodo, ultimo_valor, checkpoint_meta, percentual_meta')
        .in('kpi_id', kpiIds);
      if (trajErr) console.error('[financeiro kpis/taticos] trajetoria falhou:', trajErr.message);
      (traj || []).forEach(t => { trajByKpi[t.kpi_id] = t; });
    }

    const enriched = kpis.map(k => ({
      id: k.id,
      indicador: k.indicador,
      descricao: k.descricao,
      meta_descricao: k.meta_descricao,
      meta_valor: k.meta_valor,
      unidade: k.unidade,
      periodicidade: k.periodicidade,
      trajetoria: trajByKpi[k.id] || null,
    }));

    res.json({ area: 'generosidade', total: enriched.length, kpis: enriched });
  } catch (e) {
    console.error('[financeiro kpis/taticos]', e.message);
    res.status(500).json({ error: 'Erro ao buscar KPIs táticos de generosidade' });
  }
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
      .neq('status', 'cancelado')
      // Guardrail dupla contagem: balanço = verdade; ignora linhas do OFX aprovado.
      .is('lancamento_bruto_id', null);

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

// ====================================================================
// TRANSAÇÕES · Fase 1 da reforma (lançamento manual moderno, detalhe,
// anexos de comprovante). O DELETE fica FORA desta fase de propósito:
// fin_transacoes não tem soft-delete (sem deleted_at).
// ====================================================================

// Match com o extrato — mesma lógica de services/finLancamento.js
// (lancarDespesaConciliando): exatamente 1 débito OFX NÃO classificado, mesmo
// valor, janela [dataBase, +15d]. Replicado aqui (em vez de chamar o service)
// porque a assinatura de lá exige plano_contas_id e força data_pagamento mesmo
// sem match — no lançamento manual o plano é opcional e sem pagamento a
// transação deve nascer 'pendente' com data_pagamento nula.
async function matchDebitoExtrato(valor, dataBase) {
  try {
    const fimJanela = new Date(new Date(`${dataBase}T12:00:00`).getTime() + 15 * 86400000).toISOString().slice(0, 10);
    const { data: candidatos } = await supabase.from('fin_lancamentos_brutos')
      .select('id, conta_id, valor, tipo_trn, data_lancamento, memo')
      .eq('ja_classificado', false)
      .in('valor', [-valor, valor])
      .gte('data_lancamento', dataBase)
      .lte('data_lancamento', fimJanela);
    const debitos = (candidatos || []).filter(c => c.tipo_trn === 'DEBIT' || Number(c.valor) < 0);
    if (debitos.length === 1) return debitos[0]; // >1 → não escolhe sozinho (fica pendente · match manual)
  } catch (e) { console.error('[FIN-V2] match extrato manual:', e.message); }
  return null;
}

// Lançamento manual moderno (substitui o create da v1 no modal novo)
router.post('/transacoes', async (req, res) => {
  try {
    const {
      tipo, descricao, valor, data_competencia, data_pagamento, conta_id,
      plano_contas_id, centro_custo_id, forma_pagamento,
      parcelas_total, parcela_num, observacoes, tentar_conciliar, cartao_id,
    } = req.body;

    if (!['receita', 'despesa'].includes(tipo)) {
      return res.status(400).json({ error: "tipo deve ser 'receita' ou 'despesa'" });
    }
    if (!descricao || !String(descricao).trim()) return res.status(400).json({ error: 'descrição obrigatória' });
    const v = Math.abs(Number(valor) || 0);
    if (!v) return res.status(400).json({ error: 'valor obrigatório (maior que zero)' });
    if (!data_competencia) return res.status(400).json({ error: 'data_competencia obrigatória' });
    if (!conta_id) return res.status(400).json({ error: 'conta_id obrigatório' });

    // Conciliação opcional (só despesa): mesma lógica do finLancamento
    let bruto = null;
    if (tentar_conciliar && tipo === 'despesa') {
      bruto = await matchDebitoExtrato(v, data_competencia);
    }

    const { data: transacao, error } = await supabase.from('fin_transacoes')
      .insert({
        conta_id: bruto?.conta_id || conta_id,
        tipo,
        descricao: String(descricao).trim(),
        valor: v,
        data_competencia,
        data_pagamento: bruto?.data_lancamento || data_pagamento || null,
        // Conciliado se casou com o extrato; senão, pago (data_pagamento) =
        // conciliado, sem pagamento = pendente.
        status: bruto ? 'conciliado' : (data_pagamento ? 'conciliado' : 'pendente'),
        plano_contas_id: plano_contas_id || null,
        centro_custo_id: centro_custo_id || null,
        forma_pagamento: forma_pagamento || null,
        parcelas_total: parcelas_total ? Number(parcelas_total) : null,
        parcela_num: parcela_num ? Number(parcela_num) : null,
        observacoes: observacoes || null,
        lancamento_bruto_id: bruto?.id || null,
        classificacao_origem: 'manual',
        classificacao_confianca: 1.0,
        created_by: req.user.userId,
      })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });

    // Secundárias best-effort (mesmo pós-match do finLancamento): marca o bruto
    // como classificado e tira da fila de classificação.
    if (bruto) {
      try {
        await supabase.from('fin_lancamentos_brutos').update({ ja_classificado: true }).eq('id', bruto.id);
        await supabase.from('fin_fila_classificacao')
          .update({ status: 'ignorado', decidido_em: new Date().toISOString(), decidido_por: req.user.userId })
          .eq('lancamento_bruto_id', bruto.id).eq('status', 'pendente');
      } catch (e) { console.error('[FIN-V2] marcar bruto (transação manual):', e.message); }
    }

    // Despesa no CARTÃO → entra na fatura aberta do ciclo (Fase 4)
    let faturaId = null;
    if (transacao?.tipo === 'despesa' && cartao_id) {
      faturaId = await vincularTransacaoNaFatura(transacao, cartao_id);
    }

    // Baixa automática no Contas a Pagar (candidato único · best-effort).
    // Compra de cartão NÃO baixa conta avulsa (ela compõe a fatura).
    let contaBaixada = null;
    if (transacao?.tipo === 'despesa' && !faturaId) {
      contaBaixada = await baixaAutomaticaPorTransacao(transacao, req.user.userId);
    }

    res.json({ ...transacao, conciliada: !!bruto, conta_pagar_baixada: contaBaixada, fatura_id: faturaId });
  } catch (e) {
    console.error('[FIN-V2] criar transação:', e);
    res.status(500).json({ error: 'Erro ao criar transação' });
  }
});

// Edita os campos do lançamento (NÃO mexe em status/lancamento_bruto_id —
// conciliação não se desfaz por edição)
router.put('/transacoes/:id', async (req, res) => {
  try {
    const {
      tipo, descricao, valor, data_competencia, data_pagamento, conta_id,
      plano_contas_id, centro_custo_id, forma_pagamento,
      parcelas_total, parcela_num, observacoes,
    } = req.body;

    const upd = {};
    if (tipo !== undefined) {
      if (!['receita', 'despesa'].includes(tipo)) return res.status(400).json({ error: "tipo deve ser 'receita' ou 'despesa'" });
      upd.tipo = tipo;
    }
    if (descricao !== undefined) {
      if (!String(descricao).trim()) return res.status(400).json({ error: 'descrição não pode ficar vazia' });
      upd.descricao = String(descricao).trim();
    }
    if (valor !== undefined) {
      const v = Math.abs(Number(valor) || 0);
      if (!v) return res.status(400).json({ error: 'valor deve ser maior que zero' });
      upd.valor = v;
    }
    if (data_competencia !== undefined) {
      if (!data_competencia) return res.status(400).json({ error: 'data_competencia não pode ficar vazia' });
      upd.data_competencia = data_competencia;
    }
    if (data_pagamento !== undefined) upd.data_pagamento = data_pagamento || null;
    if (conta_id !== undefined) {
      if (!conta_id) return res.status(400).json({ error: 'conta_id não pode ficar vazio' });
      upd.conta_id = conta_id;
    }
    if (plano_contas_id !== undefined) upd.plano_contas_id = plano_contas_id || null;
    if (centro_custo_id !== undefined) upd.centro_custo_id = centro_custo_id || null;
    if (forma_pagamento !== undefined) upd.forma_pagamento = forma_pagamento || null;
    if (parcelas_total !== undefined) upd.parcelas_total = parcelas_total ? Number(parcelas_total) : null;
    if (parcela_num !== undefined) upd.parcela_num = parcela_num ? Number(parcela_num) : null;
    if (observacoes !== undefined) upd.observacoes = observacoes || null;
    if (!Object.keys(upd).length) return res.status(400).json({ error: 'Nada pra atualizar' });

    const { data, error } = await supabase.from('fin_transacoes')
      .update(upd).eq('id', req.params.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    console.error('[FIN-V2] atualizar transação:', e);
    res.status(500).json({ error: 'Erro ao atualizar transação' });
  }
});

// Detalhe completo: transação + nomes (conta/plano/centro) + NF vinculada +
// conta a pagar vinculada + anexos
router.get('/transacoes/:id/detalhe', async (req, res) => {
  try {
    const { data: t, error } = await supabase.from('fin_transacoes')
      .select('*, conta:fin_contas(id, nome, banco), plano:fin_plano_contas(id, codigo, nome, tipo), centro:fin_centros_custo(id, codigo, nome)')
      .eq('id', req.params.id).single();
    if (error || !t) return res.status(404).json({ error: 'Transação não encontrada' });

    const [nf, cp] = await Promise.all([
      supabase.from('log_notas_fiscais')
        .select('id, numero, emitente_nome, emitente_cnpj, valor, storage_path')
        .eq('transacao_id', t.id).limit(1),
      supabase.from('fin_contas_pagar')
        .select('id, descricao, fornecedor, valor, data_vencimento, status')
        .eq('fin_transacao_id', t.id).is('deleted_at', null).limit(1),
    ]);

    res.json({
      ...t,
      anexos_url: Array.isArray(t.anexos_url) ? t.anexos_url : [],
      nota_fiscal: nf.data?.[0] || null,
      conta_pagar: cp.data?.[0] || null,
    });
  } catch (e) {
    console.error('[FIN-V2] detalhe transação:', e);
    res.status(500).json({ error: 'Erro ao carregar o detalhe da transação' });
  }
});

// Anexos (comprovantes/notas) · bucket público log-arquivos, mesmo padrão do
// upload de /logistica/compras/escanear
const uploadAnexo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
});

router.post('/transacoes/:id/anexos', uploadAnexo.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[req.file.mimetype];
    if (!ext) return res.status(400).json({ error: 'Formato não suportado — envie JPG, PNG, WEBP ou PDF' });

    const { data: t, error: errT } = await supabase.from('fin_transacoes')
      .select('id, anexos_url').eq('id', req.params.id).single();
    if (errT || !t) return res.status(404).json({ error: 'Transação não encontrada' });

    const path = `fin-comprovantes/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const { error: upErr } = await supabase.storage.from('log-arquivos')
      .upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    if (upErr) return res.status(500).json({ error: `Erro ao salvar arquivo: ${upErr.message}` });
    const url = supabase.storage.from('log-arquivos').getPublicUrl(path).data.publicUrl;

    const anexos = [
      ...(Array.isArray(t.anexos_url) ? t.anexos_url : []),
      { url, nome: req.file.originalname || `comprovante.${ext}`, tipo: req.file.mimetype, em: new Date().toISOString() },
    ];
    const { error: errUpd } = await supabase.from('fin_transacoes')
      .update({ anexos_url: anexos }).eq('id', t.id);
    if (errUpd) return res.status(400).json({ error: errUpd.message });

    res.json(anexos);
  } catch (e) {
    console.error('[FIN-V2] anexar comprovante:', e);
    res.status(500).json({ error: 'Erro ao anexar comprovante' });
  }
});

// Remove um anexo do array (o arquivo permanece no storage — histórico barato)
router.delete('/transacoes/:id/anexos', async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url obrigatória' });

    const { data: t, error: errT } = await supabase.from('fin_transacoes')
      .select('id, anexos_url').eq('id', req.params.id).single();
    if (errT || !t) return res.status(404).json({ error: 'Transação não encontrada' });

    const anexos = (Array.isArray(t.anexos_url) ? t.anexos_url : []).filter(a => a?.url !== url);
    const { error: errUpd } = await supabase.from('fin_transacoes')
      .update({ anexos_url: anexos }).eq('id', t.id);
    if (errUpd) return res.status(400).json({ error: errUpd.message });

    res.json(anexos);
  } catch (e) {
    console.error('[FIN-V2] remover anexo:', e);
    res.status(500).json({ error: 'Erro ao remover anexo' });
  }
});

// ====================================================================
// CONCILIAÇÃO EM LOTE · extrato × contas a pagar (Fase 3)
// ====================================================================

// Sugestões de match (score 100/85 = seguras · 60 = manual)
router.get('/conciliacao/sugestoes', async (_req, res) => {
  try {
    const r = await sugerirMatches();
    res.json(r);
  } catch (e) {
    console.error('[FIN-V2] conciliação sugestões:', e);
    res.status(500).json({ error: 'Erro ao montar as sugestões de conciliação' });
  }
});

// Aplica pares escolhidos { pares: [{conta_id, bruto_id}] } · coleta erros por par
router.post('/conciliacao/aplicar', async (req, res) => {
  try {
    const pares = Array.isArray(req.body?.pares) ? req.body.pares : [];
    if (!pares.length) return res.status(400).json({ error: 'Nenhum par selecionado' });
    const resultados = [];
    for (const p of pares) {
      const r = await aplicarMatch({ contaId: p.conta_id, brutoId: p.bruto_id, userId: req.user.userId });
      resultados.push({ conta_id: p.conta_id, bruto_id: p.bruto_id, ok: !r.erro, erro: r.erro || null });
    }
    res.json({ aplicados: resultados.filter(r => r.ok).length, erros: resultados.filter(r => !r.ok), resultados });
  } catch (e) {
    console.error('[FIN-V2] conciliação aplicar:', e);
    res.status(500).json({ error: 'Erro ao aplicar a conciliação' });
  }
});

// Aplica TODAS as seguras (score >= 85) · recalcula na hora (nada de par stale)
router.post('/conciliacao/aplicar-seguros', async (req, res) => {
  try {
    const { pares } = await sugerirMatches();
    const seguras = pares.filter((p) => p.score >= 85);
    let aplicados = 0;
    const erros = [];
    for (const p of seguras) {
      const r = await aplicarMatch({ contaId: p.conta.id, brutoId: p.bruto.id, userId: req.user.userId, score: p.score });
      if (r.erro) erros.push({ conta_id: p.conta.id, erro: r.erro });
      else aplicados++;
    }
    res.json({ aplicados, erros });
  } catch (e) {
    console.error('[FIN-V2] conciliação seguras:', e);
    res.status(500).json({ error: 'Erro ao aplicar as conciliações seguras' });
  }
});

// Fila de classificação · sugestão por IA em lote pros itens SEM sugestão
// (máx ~40 por chamada pra caber no timeout serverless · o front repete até
// restantes=0)
router.post('/fila-classificacao/sugerir-lote', async (_req, res) => {
  try {
    const r = await sugerirLoteIA({ maxItens: 40 });
    res.json(r);
  } catch (e) {
    console.error('[FIN-V2] sugerir lote IA:', e);
    res.status(500).json({ error: 'Erro ao sugerir com IA' });
  }
});

// ====================================================================
// CARTÕES DE CRÉDITO + FATURAS (Fase 4)
// ====================================================================

// CRUD de cartões (Configuração)
router.get('/cartoes', async (_req, res) => {
  try {
    const { data, error } = await supabase.from('fin_cartoes')
      .select('*, conta:conta_id(nome)').order('nome');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar cartões' }); }
});

router.post('/cartoes', authorizeModule('financeiro', 4), async (req, res) => {
  try {
    const { nome, bandeira, final, dia_fechamento, dia_vencimento, conta_id } = req.body || {};
    if (!nome || !String(nome).trim()) return res.status(400).json({ error: 'Nome do cartão obrigatório' });
    const df = parseInt(dia_fechamento, 10), dv = parseInt(dia_vencimento, 10);
    if (!(df >= 1 && df <= 31)) return res.status(400).json({ error: 'Dia de fechamento inválido (1-31)' });
    if (!(dv >= 1 && dv <= 31)) return res.status(400).json({ error: 'Dia de vencimento inválido (1-31)' });
    const { data, error } = await supabase.from('fin_cartoes')
      .insert({
        nome: String(nome).trim(), bandeira: bandeira || null,
        final: final ? String(final).replace(/\D/g, '').slice(-4) : null,
        dia_fechamento: df, dia_vencimento: dv, conta_id: conta_id || null,
      }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.status(201).json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao criar cartão' }); }
});

router.put('/cartoes/:id', authorizeModule('financeiro', 4), async (req, res) => {
  try {
    const b = req.body || {};
    const patch = { updated_at: new Date().toISOString() };
    if (b.nome !== undefined) patch.nome = String(b.nome).trim();
    if (b.bandeira !== undefined) patch.bandeira = b.bandeira || null;
    if (b.final !== undefined) patch.final = b.final ? String(b.final).replace(/\D/g, '').slice(-4) : null;
    if (b.dia_fechamento !== undefined) {
      const df = parseInt(b.dia_fechamento, 10);
      if (!(df >= 1 && df <= 31)) return res.status(400).json({ error: 'Dia de fechamento inválido (1-31)' });
      patch.dia_fechamento = df;
    }
    if (b.dia_vencimento !== undefined) {
      const dv = parseInt(b.dia_vencimento, 10);
      if (!(dv >= 1 && dv <= 31)) return res.status(400).json({ error: 'Dia de vencimento inválido (1-31)' });
      patch.dia_vencimento = dv;
    }
    if (b.conta_id !== undefined) patch.conta_id = b.conta_id || null;
    if (b.ativo !== undefined) patch.ativo = !!b.ativo;
    const { data, error } = await supabase.from('fin_cartoes')
      .update(patch).eq('id', req.params.id).select().maybeSingle();
    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Cartão não encontrado' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: 'Erro ao atualizar cartão' }); }
});

// Faturas (lista · por cartão opcional)
router.get('/faturas', async (req, res) => {
  try {
    await fecharFaturasVencidas(); // best-effort: fecha ciclos passados
    let q = supabase.from('fin_faturas')
      .select('*, cartao:cartao_id(nome, final, bandeira)')
      .order('vencimento', { ascending: false }).limit(60);
    if (req.query.cartao_id) q = q.eq('cartao_id', req.query.cartao_id);
    const { data, error } = await q;
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: 'Erro ao listar faturas' }); }
});

// Detalhe da fatura: rubricas (por plano de contas) + cada compra
router.get('/faturas/:id', async (req, res) => {
  try {
    const { data: fatura, error } = await supabase.from('fin_faturas')
      .select('*, cartao:cartao_id(nome, final, bandeira, dia_fechamento, dia_vencimento)')
      .eq('id', req.params.id).maybeSingle();
    if (error || !fatura) return res.status(404).json({ error: 'Fatura não encontrada' });
    const { itens, rubricas } = await itensDaFatura(fatura.id);
    res.json({ ...fatura, itens, rubricas });
  } catch (e) { res.status(500).json({ error: 'Erro ao carregar a fatura' }); }
});

// Recalcula o total (se algum item entrou por fora)
router.post('/faturas/:id/sincronizar', async (req, res) => {
  try {
    const total = await sincronizarFatura(req.params.id);
    if (total === null) return res.status(404).json({ error: 'Fatura não encontrada' });
    res.json({ ok: true, total });
  } catch (e) { res.status(500).json({ error: 'Erro ao sincronizar a fatura' }); }
});

// IA compara o PDF da fatura com o que está lançado (aceita PDF com senha)
const uploadFatura = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
router.post('/faturas/:id/comparar', uploadFatura.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Envie o PDF da fatura' });
    if (!/pdf/i.test(req.file.mimetype || '')) return res.status(400).json({ error: 'O arquivo precisa ser um PDF' });
    const { compararFatura } = require('../services/finFaturaComparador');
    const r = await compararFatura({
      faturaId: req.params.id,
      buffer: req.file.buffer,
      senha: req.body?.senha || null,
    });
    res.json(r);
  } catch (e) {
    console.error('[FIN-V2] comparar fatura:', e.message);
    res.status(e.status || 500).json({ error: e.message || 'Erro ao comparar a fatura' });
  }
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

    // Calcula semana anterior + mesma semana do MÊS anterior + mesma semana ano anterior.
    const anterior = new Date(range.inicio); anterior.setDate(anterior.getDate() - 7);
    // "Mesma semana do mês anterior" = 4 semanas atrás (−28d) · o início continua
    // numa quarta, então casa exato com um semana_inicio da view (semana qua→ter).
    const mesAnt = new Date(range.inicio); mesAnt.setDate(mesAnt.getDate() - 28);
    const yoy = new Date(range.inicio); yoy.setFullYear(yoy.getFullYear() - 1);

    // Filtros globais (centro de custo / plano de contas) · quando presentes,
    // recomputa os valores MONETÁRIOS a partir das transações (as views
    // pré-agregadas não têm dimensão de centro/plano). Frequência (presencial/
    // online) não tem centro de custo → segue da view. Match por código é
    // HIERÁRQUICO (escolher um pai inclui os filhos · prefixo).
    const centroId = req.query.centro_custo_id || null;
    const planoId = req.query.plano_contas_id || null;
    // Botão "sem extraordinárias": arrecadação só com receita ordinária. Força o
    // recompute das transações (as views pré-agregadas somam ord+extra).
    const semExtra = req.query.sem_extra === '1' || req.query.sem_extra === 'true';
    const classesAceitas = semExtra ? ['ordinaria'] : ['ordinaria', 'extraordinaria'];
    const temFiltro = !!(centroId || planoId) || semExtra;
    let centroCodigo = null, planoCodigo = null;
    if (temFiltro) {
      const [cc, pc] = await Promise.all([
        centroId ? supabase.from('fin_centros_custo').select('codigo').eq('id', centroId).maybeSingle() : Promise.resolve({ data: null }),
        planoId ? supabase.from('fin_plano_contas').select('codigo').eq('id', planoId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      centroCodigo = cc.data?.codigo || null;
      planoCodigo = pc.data?.codigo || null;
    }
    const fetchTxFiltradas = async (ini, fim, cols) => {
      let q = supabase.from('vw_fin_transacoes_completa')
        .select(cols)
        .gte('data_competencia', ini).lte('data_competencia', fim)
        .eq('tipo', 'receita').neq('status', 'cancelado')
        .in('classe_movimento', classesAceitas)
        // Guardrail dupla contagem: balanço é a fonte de verdade; ignora receita
        // vinda do OFX aprovado (que teria lancamento_bruto_id). O balanço nunca
        // tem lancamento_bruto_id, então isso mantém balanço+manual e exclui OFX.
        .is('lancamento_bruto_id', null);
      if (centroCodigo) q = q.like('centro_custo_codigo', `${centroCodigo}%`);
      if (planoCodigo) q = q.like('plano_contas_codigo', `${planoCodigo}%`);
      return (await q.limit(50000)).data || [];
    };

    const [
      cultosSemana,
      resumo,
      resumoAnterior,
      resumoMesAnterior,
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
      // Mesma semana do MÊS anterior (4 semanas atrás)
      supabase.from('vw_fin_semana_resumo').select('*')
        .eq('semana_inicio', mesAnt.toISOString().slice(0, 10)).maybeSingle(),
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
        .eq('tipo', 'receita').neq('status', 'cancelado')
        // Guardrail dupla contagem: ignora receita do OFX aprovado (balanço = verdade).
        .is('lancamento_bruto_id', null),
    ]);

    // Quando há filtro, recomputa receita/buckets/cultos/top/histórico das transações
    let catRows = categorias.data || [];
    let recPorCulto = null, topFiltrado = null, recPorSemana = null;
    let receitaFiltrada = 0, receitaAntFiltrada = 0, receitaMesAntFiltrada = 0, receitaYoyFiltrada = null;
    if (temFiltro) {
      const rowsSemana = await fetchTxFiltradas(range.inicio, range.fim,
        'valor, plano_contas_codigo, plano_contas_nome, plano_contas_natureza, culto_nome, culto_service_type_slug, data_competencia, classe_movimento, membro_nome, membro_cpf');
      catRows = rowsSemana;
      receitaFiltrada = rowsSemana.reduce((s, t) => s + Number(t.valor || 0), 0);
      recPorCulto = {};
      const topMap = {};
      rowsSemana.forEach((t) => {
        const ck = t.culto_nome || '—';
        recPorCulto[ck] = (recPorCulto[ck] || 0) + Number(t.valor || 0);
        if (t.membro_nome) {
          const mk = t.membro_cpf || t.membro_nome;
          if (!topMap[mk]) topMap[mk] = { membro_nome: t.membro_nome, membro_cpf: t.membro_cpf || null, total_doado: 0, qtd_doacoes: 0 };
          topMap[mk].total_doado += Number(t.valor || 0);
          topMap[mk].qtd_doacoes += 1;
        }
      });
      topFiltrado = Object.values(topMap).sort((a, b) => b.total_doado - a.total_doado).slice(0, 10);
      // receita da semana anterior (janela qua-ter, 7 dias antes)
      const antFim = new Date(anterior); antFim.setDate(antFim.getDate() + 6);
      const rowsAnt = await fetchTxFiltradas(anterior.toISOString().slice(0, 10), antFim.toISOString().slice(0, 10), 'valor');
      receitaAntFiltrada = rowsAnt.reduce((s, t) => s + Number(t.valor || 0), 0);
      // receita da mesma semana do mês anterior (4 semanas atrás · janela qua-ter)
      const mesAntFim = new Date(mesAnt); mesAntFim.setDate(mesAntFim.getDate() + 6);
      const rowsMesAnt = await fetchTxFiltradas(mesAnt.toISOString().slice(0, 10), mesAntFim.toISOString().slice(0, 10), 'valor');
      receitaMesAntFiltrada = rowsMesAnt.reduce((s, t) => s + Number(t.valor || 0), 0);
      // receita YoY (semana qua-ter que contém a data de 1 ano atrás)
      const { data: yoyRangeRow } = await supabase.rpc('fin_semana_qua_ter', { p_data: yoy.toISOString().slice(0, 10) });
      const yoyRange = (yoyRangeRow || [])[0];
      if (yoyRange) {
        const rowsYoy = await fetchTxFiltradas(yoyRange.inicio, yoyRange.fim, 'valor');
        receitaYoyFiltrada = rowsYoy.reduce((s, t) => s + Number(t.valor || 0), 0);
      }
      // receita por semana (12 semanas) pro histórico
      const ini12 = new Date(range.inicio); ini12.setDate(ini12.getDate() - 11 * 7);
      const rows12 = await fetchTxFiltradas(ini12.toISOString().slice(0, 10), range.fim, 'valor, data_competencia');
      const quartaDe = (dstr) => { const d = new Date(dstr + 'T12:00:00Z'); const off = (d.getUTCDay() + 4) % 7; d.setUTCDate(d.getUTCDate() - off); return d.toISOString().slice(0, 10); };
      recPorSemana = {};
      rows12.forEach((t) => { if (!t.data_competencia) return; const k = quartaDe(t.data_competencia); recPorSemana[k] = (recPorSemana[k] || 0) + Number(t.valor || 0); });
    }

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

    // Bucket pela DATA da transação. A arrecadação do FIM DE SEMANA compensa/é
    // datada na SEGUNDA (Pix/cartão/depósito liquidam em D+1 · vale pro histórico
    // todo e pros balanços importados), então a segunda entra no balde
    // "Final de Semana":
    //   Sun=0 Mon=1 Tue=2 Wed=3 Thu=4 Fri=5 Sat=6
    //   w=3 (Quarta)          → "Quarta com Deus"
    //   w=6/0/1 (Sáb/Dom/Seg) → "Final de Semana" (seg = compensação do fim de semana)
    //   else                  → "Durante a Semana"
    // Empréstimo / transferência / estorno NÃO entram em arrecadação por culto.
    for (const t of catRows) {
      if (['emprestimo','transferencia','estorno'].includes(t.classe_movimento)) continue;
      const cat = labelCategoria(t.plano_contas_codigo, t.plano_contas_nome, t.plano_contas_natureza);
      const v = Number(t.valor);
      const data = t.data_competencia ? new Date(t.data_competencia + 'T12:00:00Z') : null;
      const dow = data ? data.getUTCDay() : -1; // 0=Sun..6=Sat
      let key;
      if (dow === 3) key = 'quarta';
      else if (dow === 0 || dow === 6 || dow === 1) key = 'domingo'; // fim de semana compensa na segunda
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
    const rmes = resumoMesAnterior.data || { receita_total: 0 };
    const ry = resumoYoY.data || null;

    const delta = (atual, ant) => ant > 0 ? ((atual - ant) / ant) * 100 : null;

    // Receita/ticket · filtrados vêm das transações; sem filtro, da view.
    const receitaAtual = temFiltro ? receitaFiltrada : Number(r.receita_total);
    const receitaAnt = temFiltro ? receitaAntFiltrada : Number(ra.receita_total);
    const receitaMesAnt = temFiltro ? receitaMesAntFiltrada : Number(rmes.receita_total);
    const receitaYoyV = temFiltro ? receitaYoyFiltrada : (ry ? Number(ry.receita_total) : null);
    const presAtual = Number(r.total_presencial);
    const presAnt = Number(ra.total_presencial);
    const ticketMedio = temFiltro ? (presAtual > 0 ? receitaFiltrada / presAtual : 0) : Number(r.ticket_medio_presencial || 0);
    const ticketAnt = temFiltro ? (presAnt > 0 ? receitaAntFiltrada / presAnt : 0) : Number(ra.ticket_medio_presencial);

    res.json({
      semana: range,
      kpis: {
        receita: receitaAtual,
        receita_delta_wow: delta(receitaAtual, receitaAnt),
        receita_mes_anterior: receitaMesAnt,
        receita_delta_mom: delta(receitaAtual, receitaMesAnt),
        receita_yoy: receitaYoyV,
        receita_delta_yoy: receitaYoyV != null ? delta(receitaAtual, receitaYoyV) : null,
        presencial: presAtual,
        presencial_delta_wow: delta(presAtual, presAnt),
        online: Number(r.total_online || 0),
        ticket_medio: ticketMedio,
        ticket_delta_wow: delta(ticketMedio, ticketAnt),
      },
      cultos: (cultosSemana.data || []).map(c => {
        const rec = temFiltro ? (recPorCulto[c.culto_nome] || 0) : Number(c.receita_total);
        return {
          ...c,
          receita_total: rec,
          ticket: c.total_presencial > 0 ? rec / c.total_presencial : 0,
        };
      }),
      buckets: {
        quarta: formatBucket(buckets.quarta),
        domingo: formatBucket(buckets.domingo),
        outros: formatBucket(buckets.outros),
        acumulada: formatBucket(buckets.acumulada),
      },
      historico: (historico.data || []).reverse().map(h => {
        const rec = temFiltro ? (recPorSemana[h.semana_inicio] || 0) : Number(h.receita_total);
        return {
          semana_label: h.semana_label,
          semana_inicio: h.semana_inicio,
          receita: rec,
          presencial: Number(h.total_presencial),
          ticket: temFiltro ? (Number(h.total_presencial) > 0 ? rec / Number(h.total_presencial) : 0) : Number(h.ticket_medio_presencial),
        };
      }),
      top_contribuintes: temFiltro ? topFiltrado : (topContribuintes.data || []),
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
      // ⚠️ Era `.eq('mes', mesAtual)` — só o mês corrente. Agora vem a série,
      // porque comparar decêndio com decêndio dos outros meses exige tê-los.
      supabase.from('vw_fin_decendio').select('*')
        .gte('mes', inicio12m.slice(0, 7)).order('mes').order('decendio'),
      supabase.from('vw_fin_ano_acumulado').select('*')
        .in('ano', [anoAtual, anoAnterior]),
      supabase.from('vw_fin_yoy_semanal').select('*')
        .eq('ano_atual', anoAtual).order('semana_inicio'),
      supabase.from('vw_fin_freq_vs_receita_mensal').select('*')
        .gte('mes', inicio12m.slice(0, 7)).order('mes'),
    ]);

    // "Sem extraordinárias": remove a receita extraordinária de TODAS as séries
    // e RECOMPUTA resultado/YTD delta/elasticidade sobre a receita já filtrada.
    const semExtra = req.query.sem_extra === '1' || req.query.sem_extra === 'true';
    // Série receita/despesa/resultado (mensal/semanal): subtrai extra, refaz resultado.
    const ajSerie = (r) => {
      const receita = Number(r.receita || 0) - (semExtra ? Number(r.receita_extraordinaria || 0) : 0);
      const despesa = Number(r.despesa || 0);
      return { ...r, receita, despesa, resultado: semExtra ? receita - despesa : Number(r.resultado || 0) };
    };

    const ytdMap = new Map((ytd.data || []).map(r => [r.ano, r]));
    const ytdAtual = ytdMap.get(anoAtual) || { receita_ytd: 0, despesa_ytd: 0, resultado_ytd: 0 };
    const ytdAnt = ytdMap.get(anoAnterior) || { receita_ytd: 0, despesa_ytd: 0, resultado_ytd: 0 };
    const recYtd = (y) => Number(y.receita_ytd || 0) - (semExtra ? Number(y.receita_extraordinaria_ytd || 0) : 0);
    const recYtdAtual = recYtd(ytdAtual);
    const recYtdAnt = recYtd(ytdAnt);
    const resYtdAtual = semExtra ? recYtdAtual - Number(ytdAtual.despesa_ytd || 0) : Number(ytdAtual.resultado_ytd || 0);
    const resYtdAnt = semExtra ? recYtdAnt - Number(ytdAnt.despesa_ytd || 0) : Number(ytdAnt.resultado_ytd || 0);
    const ytdDelta = recYtdAnt > 0 ? ((recYtdAtual - recYtdAnt) / recYtdAnt) * 100 : null;

    // Frequência vs Arrecadacao · crescimento % mês a mês (sobre receita ajustada)
    const fr = (freqReceita.data || []).map(m => ({
      ...m,
      receita: Number(m.receita || 0) - (semExtra ? Number(m.receita_extraordinaria || 0) : 0),
    }));
    const freqVsReceita = fr.map((m, i) => {
      if (i === 0) return { ...m, delta_freq_pct: null, delta_receita_pct: null, elasticidade: null };
      const ant = fr[i - 1];
      const dFreq = Number(ant.presencial) > 0 ? ((Number(m.presencial) - Number(ant.presencial)) / Number(ant.presencial)) * 100 : null;
      const dRec = Number(ant.receita) > 0 ? ((Number(m.receita) - Number(ant.receita)) / Number(ant.receita)) * 100 : null;
      const elast = (dFreq !== null && dFreq !== 0) ? dRec / dFreq : null;
      return { ...m, delta_freq_pct: dFreq, delta_receita_pct: dRec, elasticidade: elast };
    });

    // ⚠️ O "hoje" é BRT: em UTC o dia vira às 21h, e no dia 10 às 22h o decêndio
    // já seria contado como fechado um dia antes do que é.
    const hojeBRT = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const decendioSerie = (decendio.data || []).map(r => ({
      ...r,
      receita: Number(r.receita || 0) - (semExtra ? Number(r.receita_extraordinaria || 0) : 0),
      despesa: Number(r.despesa),
    }));

    res.json({
      mes_atual: mesAtual,
      ano_atual: anoAtual,
      ano_anterior: anoAnterior,
      sem_extra: semExtra,
      mensal: (mensal.data || []).map(ajSerie),
      semanal: (semanal.data || []).map(ajSerie),
      // O card do mês continua recebendo o mesmo formato de antes.
      decendio: decendioSerie.filter(r => r.mes === mesAtual),
      // ⚠️ A grade comparativa sai do MESMO array já ajustado pelo "sem
      // extraordinárias": calcular de novo a partir do cru faria o comparativo
      // discordar do card logo acima dele, com o toggle ligado.
      decendio_comparativo: montarGrade(decendioSerie, hojeBRT),
      ytd: {
        ano_atual: {
          ano: anoAtual,
          receita: recYtdAtual,
          despesa: Number(ytdAtual.despesa_ytd || 0),
          resultado: resYtdAtual,
        },
        ano_anterior: {
          ano: anoAnterior,
          receita: recYtdAnt,
          despesa: Number(ytdAnt.despesa_ytd || 0),
          resultado: resYtdAnt,
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
// ASSISTENTE FINANCEIRO · leitura por aba (Haiku · cache · fallback auto)
//   Cada aba do Dashboard Financeiro tem um card de IA que fala
//   especificamente sobre aquela aba, usando os números já calculados.
//   Numeros sao computados no servidor (corretos) e a IA so escreve a prosa
//   (instruida a NAO inventar valores). Cache em memoria por (aba, semana)
//   pra nao chamar o Haiku a cada troca de aba. Sem a chave → fallback auto.
// ====================================================================
const _assistenteCache = new Map(); // `${aba}:${inicio}` -> { texto, fatos, fonte, ts }
const ASSISTENTE_TTL_MS = 30 * 60 * 1000;

const ASSISTENTE_ABAS = {
  resumo:        { label: 'Resumo',          foco: 'foto da semana: receita, presença, ticket médio e variação vs. a semana anterior' },
  por_culto:     { label: 'Por Culto',       foco: 'como a arrecadação se distribuiu entre Quarta com Deus, Final de Semana e Durante a Semana, e dízimos vs. ofertas' },
  performance:   { label: 'Performance',     foco: 'a relação entre frequência presencial e arrecadação (ticket médio) na semana' },
  tendencias:    { label: 'Tendências',      foco: 'a tendência da arrecadação no ano (acumulado) vs. o ano anterior' },
  saude:         { label: 'Saúde',           foco: 'saúde financeira: resultado do mês, comprometimento com a folha e concentração dos doadores (risco)' },
  comparativos:  { label: 'Comparativos',    foco: 'receita, despesa e resultado acumulados no ano (YTD) vs. o ano anterior' },
  dizimo_oferta: { label: 'Dízimo × Oferta', foco: 'a proporção entre dízimos e ofertas na semana' },
  controle:      { label: 'Saídas',          foco: 'as despesas/saídas e o resultado do período' },
  metas:         { label: 'Metas',           foco: 'a receita do período como base pro acompanhamento das metas financeiras' },
};

router.get('/dashboard/assistente', async (req, res) => {
  const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtN = (v) => Number(v || 0).toLocaleString('pt-BR');
  const pct = (v) => v == null ? null : `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)}%`;
  const delta = (a, b) => Number(b) > 0 ? ((Number(a) - Number(b)) / Number(b)) * 100 : null;
  try {
    const aba = ASSISTENTE_ABAS[req.query.aba] ? req.query.aba : 'resumo';
    const meta = ASSISTENTE_ABAS[aba];
    const dataRef = req.query.semana || new Date().toISOString().slice(0, 10);
    const { data: rangeRow } = await supabase.rpc('fin_semana_qua_ter', { p_data: dataRef });
    const range = (rangeRow || [])[0];
    if (!range) return res.json({ aba, label: meta.label, texto: 'Sem dados para a semana selecionada.', fonte: 'auto' });

    const semExtra = req.query.sem_extra === '1' || req.query.sem_extra === 'true';
    const cacheKey = `${aba}:${range.inicio}:${semExtra ? 'se' : 'ce'}`;
    const hit = _assistenteCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < ASSISTENTE_TTL_MS) {
      return res.json({ aba, label: meta.label, texto: hit.texto, fatos: hit.fatos, fonte: hit.fonte, cached: true });
    }

    const ano = Number(range.inicio.slice(0, 4));
    const anteriorIni = new Date(range.inicio); anteriorIni.setDate(anteriorIni.getDate() - 7);

    const [resumoAtual, resumoAnt, ytdRes, saudeRes, catRes] = await Promise.all([
      supabase.from('vw_fin_semana_resumo').select('*').eq('semana_inicio', range.inicio).maybeSingle(),
      supabase.from('vw_fin_semana_resumo').select('*').eq('semana_inicio', anteriorIni.toISOString().slice(0, 10)).maybeSingle(),
      supabase.from('vw_fin_ano_acumulado').select('*').in('ano', [ano, ano - 1]),
      supabase.rpc('fin_saude_financeira', { p_ano: ano, p_sem_extra: semExtra }),
      supabase.from('vw_fin_transacoes_completa')
        .select('plano_contas_codigo, plano_contas_natureza, valor, data_competencia, classe_movimento')
        .gte('data_competencia', range.inicio).lte('data_competencia', range.fim)
        .eq('tipo', 'receita').neq('status', 'cancelado'),
    ]);

    // "Sem extraordinárias": receita sem a extraordinária + ticket recomputado.
    const recAj = (v, ex) => Number(v || 0) - (semExtra ? Number(ex || 0) : 0);
    const r = resumoAtual.data || {};
    const ra = resumoAnt.data || {};
    const receita = recAj(r.receita_total, r.receita_extraordinaria);
    const receitaAnt = recAj(ra.receita_total, ra.receita_extraordinaria);
    const presencial = Number(r.total_presencial || 0);
    const presAnt = Number(ra.total_presencial || 0);
    const ticket = presencial > 0 ? receita / presencial : 0;
    const ticketAnt = presAnt > 0 ? receitaAnt / presAnt : 0;
    const receitaWow = delta(receita, receitaAnt);
    const presWow = delta(presencial, presAnt);
    const ticketWow = delta(ticket, ticketAnt);

    const ytdMap = new Map((ytdRes.data || []).map(x => [x.ano, x]));
    const yA = ytdMap.get(ano) || {};
    const yB = ytdMap.get(ano - 1) || {};
    const receitaYtd = recAj(yA.receita_ytd, yA.receita_extraordinaria_ytd);
    const despesaYtd = Number(yA.despesa_ytd || 0);
    const resultadoYtd = semExtra ? receitaYtd - despesaYtd : Number(yA.resultado_ytd || 0);
    const receitaYtdYoy = delta(receitaYtd, recAj(yB.receita_ytd, yB.receita_extraordinaria_ytd));

    const saude = saudeRes.data || {};
    const top20 = Number(saude.concentracao_top20pct_pct || 0);
    const pctFolha = Number(saude.pct_folha || 0);
    const resultadoMes = Number(saude.resultado_mes || 0);
    const concLabel = top20 < 60 ? 'base diluída' : top20 < 80 ? 'concentração média' : 'concentração alta';
    const folhaLabel = pctFolha <= 45 ? 'saudável' : pctFolha <= 55 ? 'atenção' : 'crítico';

    // buckets por dia da semana + dízimo/oferta da semana (empréstimos fora)
    const isOferta = (cod) => cod?.startsWith('3.01.02') || cod?.startsWith('3.02.03');
    const isDizimo = (cod) => cod?.startsWith('3.01.01');
    const bkt = { quarta: 0, fds: 0, durante: 0 };
    const oferta = { quarta: 0, fds: 0, durante: 0 };
    let dizimoTot = 0, ofertaTot = 0;
    for (const t of catRes.data || []) {
      if (['emprestimo', 'transferencia', 'estorno'].includes(t.classe_movimento)) continue;
      if (semExtra && t.classe_movimento === 'extraordinaria') continue;
      const v = Number(t.valor || 0);
      const dow = t.data_competencia ? new Date(t.data_competencia + 'T12:00:00Z').getUTCDay() : -1;
      const k = dow === 3 ? 'quarta' : (dow === 0 || dow === 6 || dow === 1) ? 'fds' : 'durante'; // seg = compensação do fim de semana
      bkt[k] += v;
      if (isDizimo(t.plano_contas_codigo)) dizimoTot += v;
      if (isOferta(t.plano_contas_codigo)) { ofertaTot += v; oferta[k] += v; }
    }
    const bucketNome = { quarta: 'Quarta com Deus', fds: 'Final de Semana', durante: 'Durante a Semana' };
    const ofertaPuxou = ['quarta', 'fds', 'durante'].reduce((best, k) => oferta[k] > oferta[best] ? k : best, 'quarta');
    const recBase = dizimoTot + ofertaTot;
    const dizimoPctV = recBase > 0 ? (dizimoTot / recBase) * 100 : null;
    const ofertaPctV = recBase > 0 ? (ofertaTot / recBase) * 100 : null;

    // Fatos por aba (já formatados · a IA usa exatamente esses valores)
    const semanaTxt = `${range.inicio} a ${range.fim}`;
    let fatos;
    switch (aba) {
      case 'por_culto':
        fatos = { semana: semanaTxt, total: fmt(receita), quarta_com_deus: fmt(bkt.quarta), final_de_semana: fmt(bkt.fds),
          durante_a_semana: fmt(bkt.durante), dizimos: fmt(dizimoTot), ofertas: fmt(ofertaTot), culto_que_puxou_ofertas: bucketNome[ofertaPuxou] };
        break;
      case 'performance':
        fatos = { semana: semanaTxt, presenca: fmtN(presencial), presenca_variacao: pct(presWow),
          arrecadacao: fmt(receita), arrecadacao_variacao: pct(receitaWow), ticket_medio: fmt(ticket), ticket_variacao: pct(ticketWow) };
        break;
      case 'tendencias':
        fatos = { ano, receita_acumulada_ano: fmt(receitaYtd), variacao_vs_ano_anterior: pct(receitaYtdYoy), arrecadacao_da_semana: fmt(receita) };
        break;
      case 'saude':
        fatos = { resultado_do_mes: fmt(resultadoMes), folha_pct: `${pctFolha.toFixed(1)}%`, folha_situacao: folhaLabel,
          concentracao_top20pct: `${top20.toFixed(1)}%`, concentracao_situacao: concLabel };
        break;
      case 'comparativos':
        fatos = { ano, receita_ytd: fmt(receitaYtd), despesa_ytd: fmt(despesaYtd), resultado_ytd: fmt(resultadoYtd), receita_vs_ano_anterior: pct(receitaYtdYoy) };
        break;
      case 'dizimo_oferta':
        fatos = { semana: semanaTxt, dizimos: fmt(dizimoTot), dizimos_pct: dizimoPctV == null ? null : `${dizimoPctV.toFixed(1)}%`,
          ofertas: fmt(ofertaTot), ofertas_pct: ofertaPctV == null ? null : `${ofertaPctV.toFixed(1)}%` };
        break;
      case 'controle':
        fatos = { ano, despesa_ytd: fmt(despesaYtd), resultado_ytd: fmt(resultadoYtd), resultado_do_mes: fmt(resultadoMes) };
        break;
      case 'metas':
        fatos = { semana: semanaTxt, arrecadacao_da_semana: fmt(receita), receita_ytd: fmt(receitaYtd), resultado_ytd: fmt(resultadoYtd) };
        break;
      default: // resumo
        fatos = { semana: semanaTxt, arrecadacao: fmt(receita), variacao_vs_semana_anterior: pct(receitaWow),
          presenca: fmtN(presencial), presenca_variacao: pct(presWow), ticket_medio: fmt(ticket), ticket_variacao: pct(ticketWow) };
    }

    const semDados = receita <= 0 && ['resumo', 'por_culto', 'dizimo_oferta', 'performance'].includes(aba);

    // Texto determinístico (base + fallback se a IA não estiver disponível)
    const auto = (() => {
      if (semDados) return 'Ainda não há lançamentos de arrecadação nesta semana. Assim que os cultos forem lançados, a leitura aparece aqui.';
      switch (aba) {
        case 'por_culto':
          return `Dos ${fmt(receita)} arrecadados na semana, a ${bucketNome[ofertaPuxou]} puxou as ofertas. Dízimos somaram ${fmt(dizimoTot)} e ofertas ${fmt(ofertaTot)}.`;
        case 'performance':
          return `${fmtN(presencial)} presentes${presWow != null ? ` (${pct(presWow)})` : ''} geraram ${fmt(receita)} de arrecadação${receitaWow != null ? ` (${pct(receitaWow)})` : ''} — ticket médio de ${fmt(ticket)}.`;
        case 'tendencias':
          return `Receita acumulada de ${fmt(receitaYtd)} no ano${receitaYtdYoy != null ? `, ${pct(receitaYtdYoy)} vs. o ano anterior` : ''}.`;
        case 'saude':
          return `Resultado do mês de ${fmt(resultadoMes)}; folha em ${pctFolha.toFixed(1)}% (${folhaLabel}) e ${top20.toFixed(1)}% da arrecadação vem dos top 20% doadores (${concLabel}).`;
        case 'comparativos':
          return `No ano: receita ${fmt(receitaYtd)}${receitaYtdYoy != null ? ` (${pct(receitaYtdYoy)} vs. ${ano - 1})` : ''}, despesa ${fmt(despesaYtd)} e resultado ${fmt(resultadoYtd)}.`;
        case 'dizimo_oferta':
          return `Na semana, dízimos foram ${dizimoPctV != null ? `${dizimoPctV.toFixed(1)}%` : '—'} (${fmt(dizimoTot)}) e ofertas ${ofertaPctV != null ? `${ofertaPctV.toFixed(1)}%` : '—'} (${fmt(ofertaTot)}) da arrecadação.`;
        case 'controle':
          return `Despesa acumulada de ${fmt(despesaYtd)} no ano, com resultado de ${fmt(resultadoYtd)} (YTD) e ${fmt(resultadoMes)} no mês.`;
        case 'metas':
          return `Receita de ${fmt(receita)} na semana e ${fmt(receitaYtd)} acumulados no ano — base pro acompanhamento das metas abaixo.`;
        default: // resumo
          return `Arrecadação de ${fmt(receita)}${receitaWow != null ? ` (${pct(receitaWow)} vs. a semana anterior)` : ''}, com ${fmtN(presencial)} presentes e ticket médio de ${fmt(ticket)}.`;
      }
    })();

    let texto = auto;
    let fonte = 'auto';
    if (!semDados && process.env.ANTHROPIC_API_KEY) {
      try {
        const Anthropic = require('@anthropic-ai/sdk');
        const client = new Anthropic();
        const system = `Você é o assistente financeiro do dashboard da igreja CBRio.
Dada uma aba do painel e os números JÁ CALCULADOS, escreva uma leitura curta e específica sobre essa aba.
Regras:
- 1 a 2 frases, no máximo ~45 palavras, em português do Brasil com acentuação correta.
- Use SOMENTE os números fornecidos. NUNCA invente, recalcule nem arredonde valores.
- Tom de analista: direto e útil, destacando o ponto mais relevante e qualquer alerta.
- Sem saudação, sem markdown, sem listas, sem emojis. Responda apenas com o texto.`;
        const user = `Aba: "${meta.label}" — foco: ${meta.foco}.\nNúmeros (use exatamente assim):\n${JSON.stringify(fatos, null, 2)}`;
        const resp = await client.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 220,
          system,
          messages: [{ role: 'user', content: user }],
        });
        const out = (resp.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
        if (out) { texto = out; fonte = 'ia'; }
      } catch (e) {
        console.warn('[FIN-V2] assistente IA:', e?.message);
      }
    }

    _assistenteCache.set(cacheKey, { texto, fatos, fonte, ts: Date.now() });
    res.json({ aba, label: meta.label, texto, fatos, fonte });
  } catch (e) {
    console.error('[FIN-V2] assistente:', e);
    res.status(500).json({ error: e.message || 'Erro no assistente financeiro' });
  }
});

// ── Análise APROFUNDADA (sob demanda · botão no card do assistente) ─────────
// Diferente do resumo (1-2 frases · Haiku), aqui a IA recebe a série mensal
// dos 2 anos + nº de semanas de contribuição (qua→ter) por mês + saúde + YTD
// e explica CAUSAS (ex.: mês arrecadou mais porque teve 5 semanas), riscos e
// recomendações. Modelo maior, só quando o usuário clica. Cache 30 min.
const _analiseCache = new Map(); // inicio-semana -> { texto, ts }

router.get('/dashboard/analise-profunda', async (req, res) => {
  const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const delta = (a, b) => Number(b) > 0 ? ((Number(a) - Number(b)) / Number(b)) * 100 : null;
  const pct = (v) => v == null ? null : `${v >= 0 ? '+' : ''}${Number(v).toFixed(1)}%`;
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'IA não configurada no servidor' });
    }
    const dataRef = req.query.semana || new Date().toISOString().slice(0, 10);
    const { data: rangeRow } = await supabase.rpc('fin_semana_qua_ter', { p_data: dataRef });
    const range = (rangeRow || [])[0];
    if (!range) return res.status(400).json({ error: 'Semana inválida' });

    const semExtra = req.query.sem_extra === '1' || req.query.sem_extra === 'true';
    const cacheKey = `${range.inicio}:${semExtra ? 'se' : 'ce'}`;
    const hit = _analiseCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < ASSISTENTE_TTL_MS) {
      return res.json({ texto: hit.texto, cached: true });
    }

    const ano = Number(range.inicio.slice(0, 4));
    const anteriorIni = new Date(range.inicio); anteriorIni.setDate(anteriorIni.getDate() - 7);

    const [resumoAtual, resumoAnt, ytdRes, saudeRes, mensalRes] = await Promise.all([
      supabase.from('vw_fin_semana_resumo').select('*').eq('semana_inicio', range.inicio).maybeSingle(),
      supabase.from('vw_fin_semana_resumo').select('*').eq('semana_inicio', anteriorIni.toISOString().slice(0, 10)).maybeSingle(),
      supabase.from('vw_fin_ano_acumulado').select('*').in('ano', [ano, ano - 1]),
      supabase.rpc('fin_saude_financeira', { p_ano: ano, p_sem_extra: semExtra }),
      supabase.from('vw_fin_arrecadacao_mensal')
        .select('ano, mes, receita, despesa, resultado, receita_extraordinaria')
        .in('ano', [ano, ano - 1]).order('mes', { ascending: true }),
    ]);

    const r = resumoAtual.data || {};
    const ra = resumoAnt.data || {};
    const ytdMap = new Map((ytdRes.data || []).map(x => [x.ano, x]));
    const yA = ytdMap.get(ano) || {};
    const yB = ytdMap.get(ano - 1) || {};
    const saude = saudeRes.data || {};
    // Receita ajustada (sem extraordinária) quando o toggle liga.
    const rec = (v, ex) => Number(v || 0) - (semExtra ? Number(ex || 0) : 0);
    const recSemana = rec(r.receita_total, r.receita_extraordinaria);
    const recSemanaAnt = rec(ra.receita_total, ra.receita_extraordinaria);
    const recYtdA = rec(yA.receita_ytd, yA.receita_extraordinaria_ytd);
    const recYtdB = rec(yB.receita_ytd, yB.receita_extraordinaria_ytd);
    const ticketSemana = Number(r.total_presencial || 0) > 0 ? recSemana / Number(r.total_presencial) : 0;

    // Série mensal dos 2 anos com nº de semanas de contribuição (qua→ter)
    const mensal = (mensalRes.data || []).map(m => {
      const [aY, aM] = String(m.mes).split('-').map(Number);
      const receita = rec(m.receita, m.receita_extraordinaria);
      return {
        mes: m.mes,
        receita: fmt(receita),
        despesa: fmt(m.despesa),
        resultado: fmt(semExtra ? receita - Number(m.despesa || 0) : m.resultado),
        semanas_de_contribuicao: contarQuartasNoMes(aY, aM),
      };
    });

    const dados = {
      semana_analisada: `${range.inicio} a ${range.fim}`,
      sem_extraordinarias: semExtra,
      semana: {
        receita: fmt(recSemana), presenca: Number(r.total_presencial || 0),
        ticket_medio: fmt(ticketSemana),
        variacao_receita_vs_semana_anterior: pct(delta(recSemana, recSemanaAnt)),
        variacao_presenca_vs_semana_anterior: pct(delta(r.total_presencial, ra.total_presencial)),
      },
      acumulado_ano: {
        [ano]: { receita: fmt(recYtdA), despesa: fmt(yA.despesa_ytd), resultado: fmt(semExtra ? recYtdA - Number(yA.despesa_ytd || 0) : yA.resultado_ytd) },
        [ano - 1]: { receita: fmt(recYtdB), despesa: fmt(yB.despesa_ytd), resultado: fmt(semExtra ? recYtdB - Number(yB.despesa_ytd || 0) : yB.resultado_ytd) },
        variacao_receita_yoy: pct(delta(recYtdA, recYtdB)),
      },
      saude: {
        resultado_do_mes: fmt(saude.resultado_mes),
        folha_pct_da_receita: `${Number(saude.pct_folha || 0).toFixed(1)}%`,
        concentracao_top20pct_doadores: `${Number(saude.concentracao_top20pct_pct || 0).toFixed(1)}%`,
      },
      serie_mensal_2_anos: mensal,
      nota_semanas: 'A semana de contribuição da igreja vai de quarta a terça. Meses com 5 semanas de contribuição arrecadam naturalmente mais que meses com 4 — considere isso ao comparar meses.',
    };

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic();
    const system = `Você é o analista financeiro sênior da igreja CBRio, escrevendo pro gestor.
Com base nos dados JÁ CALCULADOS, escreva uma análise aprofundada e ACIONÁVEL.
Regras:
- Português do Brasil com acentuação correta. Sem saudação, sem emojis, sem markdown de títulos (#).
- Estruture em parágrafos curtos e bullets começando com "• " quando listar.
- EXPLIQUE CAUSAS: se um mês arrecadou mais/menos, verifique se teve 5 semanas de contribuição (campo semanas_de_contribuicao) e diga isso explicitamente; compare com o mesmo mês do ano anterior; comente ticket médio vs. presença.
- Aponte riscos (concentração de doadores, folha, tendência) e 2-3 recomendações práticas no final.
- Use SOMENTE os números fornecidos. NUNCA invente valores.
- Entre 150 e 300 palavras.`;
    const userMsg = `Dados do dashboard financeiro:\n${JSON.stringify(dados, null, 2)}`;
    const extrairTexto = (resp) => (resp?.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();

    // max_tokens folgado: modelos com raciocínio podem gastar tokens "pensando"
    // antes de escrever — com budget curto a resposta vinha SEM bloco de texto
    // ("A IA não retornou análise" · bug 2026-07-09).
    let texto = '';
    try {
      const resp = await client.messages.create({
        model: 'claude-sonnet-5',
        max_tokens: 4000,
        system,
        messages: [{ role: 'user', content: userMsg }],
      });
      texto = extrairTexto(resp);
      if (!texto) console.warn('[FIN-V2] analise-profunda sonnet vazio:', resp?.stop_reason, (resp?.content || []).map(b => b.type).join(','));
    } catch (e) {
      console.warn('[FIN-V2] analise-profunda sonnet falhou:', e?.message);
    }
    // Fallback: Haiku (sempre devolve texto direto)
    if (!texto) {
      const resp2 = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system,
        messages: [{ role: 'user', content: userMsg }],
      });
      texto = extrairTexto(resp2);
    }
    if (!texto) return res.status(502).json({ error: 'A IA não retornou análise' });

    _analiseCache.set(cacheKey, { texto, ts: Date.now() });
    res.json({ texto, semana: `${range.inicio} a ${range.fim}` });
  } catch (e) {
    console.error('[FIN-V2] analise-profunda:', e);
    res.status(500).json({ error: e.message || 'Erro na análise aprofundada' });
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

router.delete('/metas/:id', authorizeModule('financeiro', 4), async (req, res) => {
  try {
    const { error } = await supabase.from('fin_metas').delete().eq('id', req.params.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erro ao remover meta' }); }
});

// ====================================================================
// SAÍDAS DETALHADAS · por categoria, plano, centro
// ====================================================================
// ⚠️ RESTRIÇÃO (pedido do Matheus · 2026-07-10): o detalhamento de saídas
// expõe pagamento de FOLHA por pessoa. Acesso APENAS pra lista nominal
// abaixo — mais ninguém vê a aba Saídas do dashboard semanal (o front
// esconde o slide ao receber 403). Alterar a lista = decisão de diretoria.
const SAIDAS_ALLOWLIST = new Set([
  'matheus.toscano@cbrio.org', 'matheus@cbrio.com.br',            // Matheus Toscano
  'marcospaulo.almeida@cbrio.org', 'marcos@cbrio.com',            // Marcos Paulo
  'yago.torres@cbrio.org',                                        // Yago Torres
  'eduardo@cbrio.com.br',                                         // Eduardo Gnisci
  'juliana.leao@cbrio.org',                                       // Juliana Leão
  'juninho.lit@cbrio.org', 'juninho@cbrio.com.br',                // Pedro Luis Litwinczuk Júnior
  'pepe.menezes@cbrio.org',                                       // Pedro Paulo Menezes
  'arthur.serpa@cbrio.org',                                       // Arthur Serpa
]);
const podeVerSaidas = (req) => SAIDAS_ALLOWLIST.has(String(req.user?.email || '').toLowerCase());

router.get('/dashboard/saidas-detalhadas', async (req, res) => {
  try {
    if (!podeVerSaidas(req)) {
      return res.status(403).json({ error: 'Sem acesso ao detalhamento de saídas' });
    }
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
    const semExtra = req.query.sem_extra === '1' || req.query.sem_extra === 'true';
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

    const limpas = (data || []).slice(-semanas).map(r => {
      const presencial = Number(r.presencial || 0);
      // "Sem extraordinárias": remove receita extraordinária e RECOMPUTA resultado
      // e ticket médio sobre a receita já filtrada (não reusar o pré-calculado).
      const receita = Number(r.receita || 0) - (semExtra ? Number(r.receita_extraordinaria || 0) : 0);
      const despesa = Number(r.despesa || 0);
      return {
        semana_inicio: r.semana_inicio,
        semana_fim: r.semana_fim,
        semana_label: r.semana_label,
        ano: r.ano,
        receita,
        despesa,
        resultado: semExtra ? receita - despesa : Number(r.resultado || 0),
        presencial,
        online: Number(r.online || 0),
        total_freq: Number(r.total_freq || 0),
        decisoes: Number(r.decisoes || 0),
        qtd_cultos: Number(r.qtd_cultos || 0),
        ticket_medio_presencial: semExtra
          ? (presencial > 0 ? receita / presencial : 0)
          : Number(r.ticket_medio_presencial || 0),
      };
    });

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
// Nº de quartas-feiras num mês calendário = nº de semanas de contribuição
// (qua→ter) daquele mês. 4 na maioria; 5 em ~4 meses/ano.
function contarQuartasNoMes(ano, mes1a12) {
  let n = 0;
  const d = new Date(Date.UTC(ano, mes1a12 - 1, 1));
  while (d.getUTCMonth() === mes1a12 - 1) {
    if (d.getUTCDay() === 3) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

router.get('/arrecadacao-anual', async (req, res) => {
  try {
    const ano = Number(req.query.ano) || new Date().getFullYear();
    const centroId = req.query.centro_custo_id || null;
    const planoId = req.query.plano_contas_id || null;
    // "Sem extraordinárias": arrecadação só com receita ordinária (despesa intacta).
    const semExtra = req.query.sem_extra === '1' || req.query.sem_extra === 'true';

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
      // Agrega em JS por mês (receita extraordinária removida quando semExtra)
      const aggMap = {};
      (res2.data || []).forEach(r => {
        const k = (r.data_competencia || '').slice(0, 7);
        if (!aggMap[k]) aggMap[k] = { mes: k, receita: 0, despesa: 0, qtd: 0 };
        const v = Number(r.valor || 0);
        if (r.tipo === 'receita') {
          if (!(semExtra && r.classe_movimento === 'extraordinaria')) aggMap[k].receita += v;
        } else if (r.tipo === 'despesa') aggMap[k].despesa += v;
        aggMap[k].qtd += 1;
      });
      data = Object.values(aggMap);
      Object.values(aggMap).forEach(r => { r.resultado = r.receita - r.despesa; });
    } else {
      const res2 = await supabase
        .from('vw_fin_arrecadacao_mensal')
        .select('mes, receita, despesa, resultado, qtd, receita_extraordinaria')
        .eq('ano', ano)
        .order('mes', { ascending: true });
      if (res2.error) return res.status(400).json({ error: res2.error.message });
      data = (res2.data || []).map(r => {
        if (!semExtra) return r;
        const receita = Number(r.receita || 0) - Number(r.receita_extraordinaria || 0);
        return { ...r, receita, resultado: receita - Number(r.despesa || 0) };
      });
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
        // Semanas de contribuição (qua→ter) do mês = nº de QUARTAS no mês
        // calendário (a semana da igreja pertence ao mês da sua quarta-feira).
        // Meses com 5 semanas arrecadam naturalmente mais — o front sinaliza.
        semanas_qua_ter: contarQuartasNoMes(ano, m),
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

    const semExtra = req.query.sem_extra === '1' || req.query.sem_extra === 'true';
    const { data, error } = await supabase
      .from('vw_fin_arrecadacao_semanal')
      .select('ano, semana_inicio, semana_fim, semana_label, receita, receita_extraordinaria')
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
      const receita = Number(r.receita || 0) - (semExtra ? Number(r.receita_extraordinaria || 0) : 0);
      slot[String(r.ano)] = receita;
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
    const semExtra = req.query.sem_extra === '1' || req.query.sem_extra === 'true';
    const { data, error } = await supabase.rpc('fin_saude_financeira', { p_ano: ano, p_sem_extra: semExtra });
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
    const semExtra = req.query.sem_extra === '1' || req.query.sem_extra === 'true';
    const { data, error } = await supabase.rpc('fin_dizimo_oferta_mensal', { p_ano: ano, p_sem_extra: semExtra });
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
    rpcArgs.p_sem_extra = req.query.sem_extra === '1' || req.query.sem_extra === 'true';

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

// ====================================================================
// CONTAS A PAGAR · importação da planilha externa + lista/resumo
// (tabela fin_contas_pagar · ver migration 20260619140000)
// ====================================================================

// Lista paginada com filtros (evita o cap de 1000 do PostgREST)
router.get('/contas-pagar', async (req, res) => {
  try {
    const { status, ano, mes, fornecedor, q, plano_contas_id, centro_custo_id, vinculo_status, vencido, order } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize, 10) || 100));
    const from = (page - 1) * pageSize;
    // Ordenação por data de vencimento: asc (padrão · mais próximo primeiro) ou desc.
    const vencAsc = order !== 'venc_desc';

    let query = supabase
      .from('fin_contas_pagar')
      .select('*, plano:fin_plano_contas(codigo,nome), centro:fin_centros_custo(codigo,nome)', { count: 'exact' })
      .is('deleted_at', null)
      .order('data_vencimento', { ascending: vencAsc, nullsFirst: false });

    if (status) query = query.eq('status', status);
    if (plano_contas_id) query = query.eq('plano_contas_id', plano_contas_id);
    if (centro_custo_id) query = query.eq('centro_custo_id', centro_custo_id);
    if (vinculo_status) query = query.eq('vinculo_status', vinculo_status);
    if (ano && mes) {
      const a = parseInt(ano, 10); const m = parseInt(mes, 10);
      const ini = `${a}-${String(m).padStart(2, '0')}-01`;
      const fim = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
      query = query.gte('data_vencimento', ini).lt('data_vencimento', fim);
    } else if (ano) {
      query = query.eq('ano', parseInt(ano, 10));
    }
    if (vencido === 'true') {
      query = query.not('status', 'in', '(pago,cancelado)').lt('data_vencimento', new Date().toISOString().slice(0, 10));
    }
    if (fornecedor) {
      const s = String(fornecedor).replace(/[%,()*]/g, ' ').trim();
      if (s) query = query.ilike('fornecedor', `%${s}%`);
    }
    if (q) {
      const s = String(q).replace(/[%,()*]/g, ' ').trim();
      if (s) query = query.or(`descricao.ilike.%${s}%,historico.ilike.%${s}%,fornecedor.ilike.%${s}%`);
    }

    query = query.range(from, from + pageSize - 1);
    const { data, error, count } = await query;
    if (error) return res.status(400).json({ error: error.message });

    // F2 · enriquece com o nome do colaborador quando a conta é salário.
    // Feito em JS (e não via embed no select) pra não quebrar a lista caso a
    // migration das colunas eh_salario/funcionario_id ainda não tenha rodado.
    const items = data || [];
    const funcIds = [...new Set(items.map(i => i.funcionario_id).filter(Boolean))];
    if (funcIds.length) {
      const { data: funcs } = await supabase
        .from('rh_funcionarios').select('id, nome').in('id', funcIds);
      const nomePorId = new Map((funcs || []).map(f => [f.id, f.nome]));
      for (const i of items) {
        if (i.funcionario_id) i.funcionario_nome = nomePorId.get(i.funcionario_id) || null;
      }
    }

    res.json({ items, total: count || 0, page, pageSize });
  } catch (e) {
    console.error('[FIN-V2] contas-pagar list:', e);
    res.status(500).json({ error: 'Erro ao listar contas a pagar' });
  }
});

// Resumo agregado (KPIs) — via RPC pra não esbarrar no cap de 1000
router.get('/contas-pagar/resumo', async (req, res) => {
  try {
    const { status, ano, mes, fornecedor, plano_contas_id, centro_custo_id, q } = req.query;
    const { data, error } = await supabase.rpc('fn_contas_pagar_resumo', {
      p_ano: ano ? parseInt(ano, 10) : null,
      p_mes: mes ? parseInt(mes, 10) : null,
      p_status: status || null,
      p_fornecedor: fornecedor || null,
      p_plano: plano_contas_id || null,
      p_centro: centro_custo_id || null,
      p_busca: q || null,
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || {});
  } catch (e) {
    console.error('[FIN-V2] contas-pagar resumo:', e);
    res.status(500).json({ error: 'Erro ao calcular resumo' });
  }
});

// Importar planilha (xlsx) → fin_contas_pagar (idempotente por import_chave)
router.post('/contas-pagar/importar', authorizeModule('financeiro', 4), upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo não enviado' });
    const { importar } = require('../services/contasPagarImporter');
    const origem = (req.body?.origem ? String(req.body.origem).toLowerCase().replace(/[^a-z0-9_-]/g, '') : 'toscano') || 'toscano';
    const userId = req.user?.userId || req.user?.id || null;
    const r = await importar(req.file.buffer, userId, origem);

    if (r.gravadas > 0) {
      try {
        await notificar({
          modulo: 'financeiro',
          tipo: 'contas_pagar_importadas',
          titulo: 'Contas a pagar importadas',
          mensagem: `${r.gravadas} título(s) importado(s) (${r.baixadas} baixado(s), ${r.abertas} em aberto)`,
          link: '/financeiro-v2?tab=3',
        });
      } catch (_) { /* best-effort */ }
    }
    res.json(r);
  } catch (e) {
    console.error('[FIN-V2] contas-pagar importar:', e);
    res.status(500).json({ error: e.message || 'Erro ao importar contas a pagar' });
  }
});

// ====================================================================
// CONTAS A PAGAR · F2 da reforma (CRUD moderno + salário do RH + recorrência)
//
// Pedidos da gestão: ao clicar numa conta, poder marcar que é RECORRENTE e/ou
// que é SALÁRIO de um colaborador — nesse caso o valor NÃO é digitado: vem de
// rh_funcionarios.salario (fonte de verdade é o RH).
// ====================================================================

// Salário atual do colaborador no RH (fonte de verdade quando eh_salario).
// Retorna { salario } ou { erro } pronto pro 400.
async function salarioDoRh(funcionarioId) {
  const { data: func, error } = await supabase
    .from('rh_funcionarios')
    .select('id, nome, salario')
    .eq('id', funcionarioId)
    .is('deleted_at', null)
    .single();
  if (error || !func) return { erro: 'Colaborador não encontrado no RH' };
  const salario = Number(func.salario) || 0;
  if (!salario) return { erro: 'Colaborador sem salário cadastrado no RH' };
  return { salario, nome: func.nome };
}

// Lista auxiliar de colaboradores pro select "É salário" do modal.
// O usuário do financeiro pode NÃO ter o módulo RH — por isso o aux vive aqui.
// Salário é dado sensível → mesmo nível 4 dos endpoints sensíveis do arquivo
// (quem paga a folha tem nível 4 no financeiro).
router.get('/aux/funcionarios', authorizeModule('financeiro', 4), async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('rh_funcionarios')
      .select('id, nome, cargo, salario')
      .eq('status', 'ativo')
      .is('deleted_at', null)
      .order('nome');
    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error('[FIN-V2] aux/funcionarios:', e);
    res.status(500).json({ error: 'Erro ao listar colaboradores' });
  }
});

// Criar conta a pagar (v2 · substitui o POST v1 no modal do frontend)
router.post('/contas-pagar', async (req, res) => {
  try {
    const {
      descricao, fornecedor, valor, data_vencimento, data_pagamento, status,
      conta_id, plano_contas_id, centro_custo_id, forma_pagamento, pago_cartao,
      eh_salario, funcionario_id, observacao,
    } = req.body;

    if (!descricao || !String(descricao).trim()) return res.status(400).json({ error: 'Descrição obrigatória' });
    if (!data_vencimento) return res.status(400).json({ error: 'Data de vencimento obrigatória' });

    // Regra do salário: valor do body é IGNORADO — vale o salário do RH.
    let v = Math.abs(Number(valor) || 0);
    const salario = !!eh_salario && !!funcionario_id;
    if (salario) {
      const r = await salarioDoRh(funcionario_id);
      if (r.erro) return res.status(400).json({ error: r.erro });
      v = r.salario;
    }
    if (!v) return res.status(400).json({ error: 'Valor obrigatório (maior que zero)' });

    const { data, error } = await supabase.from('fin_contas_pagar')
      .insert({
        descricao: String(descricao).trim(),
        fornecedor: fornecedor || null,
        valor: v,
        data_vencimento,
        data_pagamento: data_pagamento || null,
        status: status || 'pendente',
        conta_id: conta_id || null,
        plano_contas_id: plano_contas_id || null,
        centro_custo_id: centro_custo_id || null,
        forma_pagamento: forma_pagamento || null,
        pago_cartao: pago_cartao === undefined ? null : !!pago_cartao,
        eh_salario: salario,
        funcionario_id: salario ? funcionario_id : null,
        historico: observacao || null,       // campo livre da tabela é `historico`
        origem: 'manual',
        created_by: req.user.userId,
      })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    console.error('[FIN-V2] criar conta a pagar:', e);
    res.status(500).json({ error: 'Erro ao criar conta a pagar' });
  }
});

// Atualizar conta a pagar (parcial · só campos presentes no body)
router.put('/contas-pagar/:id', async (req, res) => {
  try {
    const {
      descricao, fornecedor, valor, data_vencimento, data_pagamento, status,
      conta_id, plano_contas_id, centro_custo_id, forma_pagamento, pago_cartao,
      eh_salario, funcionario_id, observacao,
    } = req.body;

    const upd = {};
    if (descricao !== undefined) {
      if (!String(descricao).trim()) return res.status(400).json({ error: 'Descrição não pode ficar vazia' });
      upd.descricao = String(descricao).trim();
    }
    if (fornecedor !== undefined) upd.fornecedor = fornecedor || null;
    if (data_vencimento !== undefined) {
      if (!data_vencimento) return res.status(400).json({ error: 'Data de vencimento não pode ficar vazia' });
      upd.data_vencimento = data_vencimento;
    }
    if (data_pagamento !== undefined) upd.data_pagamento = data_pagamento || null;
    if (status !== undefined) upd.status = status;
    if (conta_id !== undefined) upd.conta_id = conta_id || null;
    if (plano_contas_id !== undefined) upd.plano_contas_id = plano_contas_id || null;
    if (centro_custo_id !== undefined) upd.centro_custo_id = centro_custo_id || null;
    if (forma_pagamento !== undefined) upd.forma_pagamento = forma_pagamento || null;
    if (pago_cartao !== undefined) upd.pago_cartao = !!pago_cartao;
    if (observacao !== undefined) upd.historico = observacao || null;

    // Regra do salário: com eh_salario + funcionario_id, RE-PUXA o salário do
    // RH e ignora o valor do body. Desligando o toggle, limpa o vínculo.
    if (eh_salario !== undefined) {
      if (eh_salario && funcionario_id) {
        const r = await salarioDoRh(funcionario_id);
        if (r.erro) return res.status(400).json({ error: r.erro });
        upd.eh_salario = true;
        upd.funcionario_id = funcionario_id;
        upd.valor = r.salario;
      } else {
        upd.eh_salario = false;
        upd.funcionario_id = null;
      }
    } else if (funcionario_id !== undefined) {
      upd.funcionario_id = funcionario_id || null;
    }
    if (upd.valor === undefined && valor !== undefined) {
      const v = Math.abs(Number(valor) || 0);
      if (!v) return res.status(400).json({ error: 'Valor deve ser maior que zero' });
      upd.valor = v;
    }
    if (!Object.keys(upd).length) return res.status(400).json({ error: 'Nada pra atualizar' });

    const { data, error } = await supabase.from('fin_contas_pagar')
      .update(upd).eq('id', req.params.id).is('deleted_at', null)
      .select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    console.error('[FIN-V2] atualizar conta a pagar:', e);
    res.status(500).json({ error: 'Erro ao atualizar conta a pagar' });
  }
});

// Excluir conta a pagar · SOFT-delete (padrão de segurança da casa)
router.delete('/contas-pagar/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('fin_contas_pagar')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', req.params.id).is('deleted_at', null)
      .select('id').single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, id: data.id });
  } catch (e) {
    console.error('[FIN-V2] excluir conta a pagar:', e);
    res.status(500).json({ error: 'Erro ao excluir conta a pagar' });
  }
});

// Tornar a conta recorrente: cria fin_despesas_recorrentes a partir dela e
// grava recorrente_id na conta. Idempotente — se já tem, devolve a existente.
router.post('/contas-pagar/:id/tornar-recorrente', async (req, res) => {
  try {
    const { data: conta, error: errConta } = await supabase
      .from('fin_contas_pagar').select('*')
      .eq('id', req.params.id).is('deleted_at', null).single();
    if (errConta || !conta) return res.status(404).json({ error: 'Conta a pagar não encontrada' });

    if (conta.recorrente_id) {
      const { data: existente } = await supabase
        .from('fin_despesas_recorrentes').select('*')
        .eq('id', conta.recorrente_id).single();
      if (existente) return res.json({ ja_existia: true, recorrencia: existente });
      // recorrente_id órfão (recorrência sumiu) → segue e recria
    }

    const valor = Number(conta.valor) || 0;
    const diaVenc = conta.data_vencimento
      ? Number(String(conta.data_vencimento).slice(8, 10))
      : null;

    // Mesmo preenchimento do POST /financeiro/recorrentes (criação manual)
    const { data: recorrencia, error } = await supabase
      .from('fin_despesas_recorrentes')
      .insert({
        descricao: conta.descricao,
        fornecedor: conta.fornecedor || null,
        chave_match: (conta.fornecedor || conta.descricao).toLowerCase().trim(),
        tipo_chave: 'manual',
        valor_medio: valor,
        valor_minimo: valor,
        valor_maximo: valor,
        cadencia_dias: 30,
        dia_vencimento: diaVenc,
        plano_contas_id: conta.plano_contas_id || null,
        centro_custo_id: conta.centro_custo_id || null,
        conta_id: conta.conta_id || null,
        classe: 'fixa',
        gera_n_dias_antes: 7,
        eh_salario: !!conta.eh_salario,
        funcionario_id: conta.funcionario_id || null,
        ativa: true, confirmada: true, confianca: 1.0,
        observacao: 'Criada a partir de uma conta a pagar (F2)',
      })
      .select().single();
    if (error) return res.status(400).json({ error: error.message });

    const { error: errUpd } = await supabase.from('fin_contas_pagar')
      .update({ recorrente_id: recorrencia.id }).eq('id', conta.id);
    if (errUpd) return res.status(400).json({ error: errUpd.message });

    res.json({ ja_existia: false, recorrencia });
  } catch (e) {
    console.error('[FIN-V2] tornar recorrente:', e);
    res.status(500).json({ error: 'Erro ao tornar a conta recorrente' });
  }
});

// Desfazer a recorrência: desativa a recorrência e desamarra a conta
router.delete('/contas-pagar/:id/tornar-recorrente', async (req, res) => {
  try {
    const { data: conta, error: errConta } = await supabase
      .from('fin_contas_pagar').select('id, recorrente_id')
      .eq('id', req.params.id).is('deleted_at', null).single();
    if (errConta || !conta) return res.status(404).json({ error: 'Conta a pagar não encontrada' });
    if (!conta.recorrente_id) return res.json({ success: true, ja_desfeita: true });

    await supabase.from('fin_despesas_recorrentes')
      .update({ ativa: false, updated_at: new Date().toISOString() })
      .eq('id', conta.recorrente_id);
    const { error } = await supabase.from('fin_contas_pagar')
      .update({ recorrente_id: null }).eq('id', conta.id);
    if (error) return res.status(400).json({ error: error.message });

    res.json({ success: true });
  } catch (e) {
    console.error('[FIN-V2] desfazer recorrente:', e);
    res.status(500).json({ error: 'Erro ao desfazer a recorrência' });
  }
});

// ════════════════════════════════════════════════════════════════════
// Conciliação balanço × OFX · identificar o doador por CPF (Fase 3)
// ════════════════════════════════════════════════════════════════════
router.post('/conciliar-balanco-ofx', authorizeModule('financeiro', 4), async (req, res) => {
  try {
    const { inicio, fim, dry_run } = req.body || {};
    if (!inicio || !fim) return res.status(400).json({ error: 'inicio e fim são obrigatórios (YYYY-MM-DD)' });
    const r = await conciliacaoOfx.conciliar({ inicio, fim, dryRun: !!dry_run, userId: req.user.userId });
    res.json(r);
  } catch (e) {
    console.error('[FIN-V2] conciliar balanco×ofx:', e.message);
    res.status(500).json({ error: e.message || 'Erro na conciliação' });
  }
});

router.get('/conciliar-balanco-ofx/revisao', authorizeModule('financeiro', 4), async (req, res) => {
  try {
    const { inicio, fim } = req.query;
    if (!inicio || !fim) return res.status(400).json({ error: 'inicio e fim são obrigatórios' });
    const revisao = await conciliacaoOfx.listarRevisao({ inicio, fim });
    res.json({ revisao });
  } catch (e) {
    console.error('[FIN-V2] revisao conciliacao:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao listar revisão' });
  }
});

router.post('/conciliar-balanco-ofx/confirmar', authorizeModule('financeiro', 4), async (req, res) => {
  try {
    const { transacao_id, bruto_id } = req.body || {};
    if (!transacao_id || !bruto_id) return res.status(400).json({ error: 'transacao_id e bruto_id são obrigatórios' });
    const r = await conciliacaoOfx.confirmarVinculo({ transacaoId: transacao_id, brutoId: bruto_id, userId: req.user.userId });
    res.json(r);
  } catch (e) {
    console.error('[FIN-V2] confirmar vinculo:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao confirmar' });
  }
});

router.post('/conciliar-balanco-ofx/ignorar', authorizeModule('financeiro', 4), async (req, res) => {
  try {
    const { transacao_id } = req.body || {};
    if (!transacao_id) return res.status(400).json({ error: 'transacao_id é obrigatório' });
    const r = await conciliacaoOfx.ignorarVinculo({ transacaoId: transacao_id, userId: req.user.userId });
    res.json(r);
  } catch (e) {
    console.error('[FIN-V2] ignorar vinculo:', e.message);
    res.status(500).json({ error: e.message || 'Erro ao ignorar' });
  }
});

module.exports = router;
