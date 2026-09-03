// Rota de cron pra sync automático do Santander
// NÃO usa authenticate · protegida por header X-Cron-Secret (CRON_SECRET env)
//
// Fluxo do POST /api/santander/cron/sync:
//   1. Valida CRON_SECRET
//   2. Verifica se ENVs Santander estão configuradas (se não, no-op)
//   3. Busca contas Santander · acha conta cadastrada local
//   4. Pega extrato dos últimos N dias via API
//   5. Insere em fin_lancamentos_brutos (idempotente via FITID unique)
//   6. Roda matchOfxPix + classificarBatch
//   7. Retorna resumo

const router = require('express').Router();
const { extrairDocumentoDoMemo } = require('../utils/documentoBr');
const { supabase } = require('../utils/supabase');
const {
  AMBIENTE, AGENCIA, CONTA, CNPJ_TITULAR,
  isConfigured, missingEnv,
} = require('../services/santander/httpClient');
const contasService = require('../services/santander/contasService');
const pixApiService = require('../services/santander/pixApiService');
const { matchOfxPix, classificarBatch } = require('../services/financeiroClassificador');
const { isAuthorizedCron } = require('../utils/cronAuth');
const { AppError, ERROR_CODES } = require('../utils/appError');
const { captureHandledException } = require('../utils/sentry');
const { setSystemJobOutcome } = require('../services/systemJobOutcome');
const { reconcileTransactions, summarizeInsertErrors } = require('../services/santander/reconciliation');
const { parseDateBR } = require('../services/pixExtratoParser');

function bankSyncError(error, publicMessage) {
  return new AppError(error?.message || publicMessage, {
    code: ERROR_CODES.BANK_SYNC_FAILED,
    publicMessage,
    cause: error,
    isOperational: false,
  });
}


function checkCronSecret(req, res, next) {
  if (!process.env.CRON_SECRET) {
    return next(new AppError('CRON_SECRET nao configurado', {
      status: 503,
      code: ERROR_CODES.DEPENDENCY_UNAVAILABLE,
      publicMessage: 'Serviço temporariamente indisponível.',
      isOperational: false,
    }));
  }
  // NAO confiar em User-Agent (header controlavel pelo cliente). So o secret vale.
  if (!isAuthorizedCron(req)) {
    return res.status(401).json({ error: 'Cron secret invalido' });
  }
  next();
}

router.use(checkCronSecret);

// Extrato do Santander normalizado · { transacoes: [...] }.
//
// A API devolve o formato cru do banco (`_content`) e o service exporta
// `consultarExtrato` (NAO `extrato`). Este helper e' o unico ponto que conhece
// a estrutura real do banco — os dois consumidores (sync do extrato e pix-sync)
// passam por aqui. Estrutura de cada item:
//   { transactionId, transactionDate, type, transactionName,
//     creditDebitType: 'CREDITO'|'DEBITO', amount, partieNumber, ... }
// Debito vira valor NEGATIVO (o consumidor filtra credito por valor > 0).
async function extratoNormalizado({ inicio, fim, usarCache = false, tolerarDiaIncompleto = false } = {}) {
  const extratoApi = await contasService.consultarExtrato({ inicio, fim, usarCache, tolerarDiaIncompleto });
  const itens = Array.isArray(extratoApi?._content) ? extratoApi._content : [];
  const transacoes = itens.map((t) => {
    const isDebito = t.creditDebitType === 'DEBITO';
    const valorAbs = Number(t.amount || 0);
    return {
      id: t.transactionId,
      // O Santander manda transactionDate em DD/MM/YYYY (ex: "06/08/2026").
      // NUNCA passar a string crua pro Postgres: com DateStyle padrão (ISO, MDY)
      // dia<=12 é SILENCIOSAMENTE trocado com o mês (06/08 vira 2026-06-08 em vez
      // de 2026-08-06) e dia>12 estoura 22008 "date/time field value out of
      // range" — foi isso que zerou 8 sincronizações seguidas em 08/2026.
      data: parseDateBR(t.transactionDate) || t.transactionDate,
      valor: isDebito ? -valorAbs : valorAbs,
      tipo: t.type,
      descricao: t.transactionName,
      partieNome: t.partieName || null,
      partieDoc: t.partieDocumentNumber || null,
      partieBranch: t.partieBranchCode || null,
      partieAccount: t.partieNumber || null,
      raw: t,
    };
  });
  return { transacoes, diasIncompletos: Array.isArray(extratoApi?._diasIncompletos) ? extratoApi._diasIncompletos : [] };
}

// ─────────────────────────────────────────────────────────────────────
// POST /api/santander/cron/sync · sync diario do extrato
// ─────────────────────────────────────────────────────────────────────
// Handler reutilizavel pra GET (Vercel cron) e POST (manual via secret)
async function handlerSync(req, res, next) {
  const startTime = Date.now();

  // 1. Verifica config Santander
  if (!isConfigured()) {
    setSystemJobOutcome(res, {
      status: 'skipped', effectStatus: 'not_applicable', result: 'santander_nao_configurado',
    });
    return res.json({
      ok: true,
      skipped: 'santander_nao_configurado',
      missing_env: missingEnv(),
      ambiente: AMBIENTE,
    });
  }

  try {
    const { dias = 3, conta_id_override } = req.body || {};
    const dryRun = req.body?.dry_run === true || req.body?.dry_run === 'true';
    const hoje = new Date();
    const desde = new Date(hoje.getTime() - dias * 86400000);
    const inicio = desde.toISOString().slice(0, 10);
    const fim = hoje.toISOString().slice(0, 10);

    // 2. Acha a conta Santander local
    let contaLocal;
    if (conta_id_override) {
      const { data } = await supabase.from('fin_contas').select('*').eq('id', conta_id_override).single();
      contaLocal = data;
    } else {
      // Busca por banco='Santander' OU conta que bate com env
      const { data: contas } = await supabase
        .from('fin_contas')
        .select('*')
        .or(`banco.ilike.%santander%,conta.ilike.%${CONTA}%`);
      contaLocal = (contas || [])[0];
    }

    if (!contaLocal) {
      setSystemJobOutcome(res, {
        status: 'failed', effectStatus: 'failed', errorCode: 'BANK_ACCOUNT_NOT_FOUND',
        errorMessage: 'Conta Santander nao cadastrada no Financeiro.', result: 'conta_santander_nao_cadastrada',
      });
      return res.json({
        ok: false,
        erro: 'conta_santander_nao_cadastrada',
        sugestao: `Cadastre uma conta com banco=Santander ou conta=${CONTA} em /admin/financeiro -> Contas`,
      });
    }

    // 3. Pega extrato via API Santander · normalizado (formato Santander _content)
    // ⚠️⚠️ `tolerarDiaIncompleto` liga a QUARENTENA POR DIA: um dia envenenado
    // deixa de descartar os dias sãos. Medido em 01–02/09: o dia 31/08 derrubou
    // 4 execuções seguidas e levou junto 01 e 02/09, que não têm defeito.
    // ⚠️ Ligar a tolerância OBRIGA a declarar — ver o desfecho no fim do handler.
    const { transacoes, diasIncompletos } = await extratoNormalizado({
      inicio, fim, usarCache: false, tolerarDiaIncompleto: true,
    });
    const resumoDiasIncompletos = () => diasIncompletos.map((d) => d.dia).join(', ');

    if (transacoes.length === 0) {
      // ⚠️⚠️ "não veio nada" e "não CONSEGUI buscar" levam a decisões OPOSTAS, e
      // este ramo dizia `success` para os dois. Com dia em quarentena, zero
      // transação não é período vazio — é extrato que não foi lido.
      setSystemJobOutcome(res, diasIncompletos.length ? {
        status: 'failed', effectStatus: 'failed', inputCount: 0, outputCount: 0,
        errorCode: 'BANK_SYNC_DIA_INCOMPLETO',
        errorMessage: `Extrato NAO lido em ${diasIncompletos.length} dia(s): ${resumoDiasIncompletos()}. ${diasIncompletos[0]?.motivo || ''}`.trim(),
        result: 'extrato_nao_lido',
      } : {
        status: 'success', effectStatus: 'confirmed', inputCount: 0, outputCount: 0,
        result: 'sem_transacoes_no_periodo',
      });
      return res.json({
        ok: true,
        conta_id: contaLocal.id,
        sem_transacoes: true,
        periodo: { inicio, fim },
      });
    }
    const reconciliation = await reconcileTransactions(supabase, transacoes);
    if (dryRun) {
      setSystemJobOutcome(res, {
        status: 'skipped', effectStatus: 'not_applicable', inputCount: transacoes.length,
        outputCount: reconciliation.candidates.length, result: 'simulacao_concluida',
      });
      return res.json({
        ok: true,
        dry_run: true,
        conta_id: contaLocal.id,
        periodo: { inicio, fim },
        origem_total: transacoes.length,
        ja_existentes_brutos: reconciliation.existingRaw.size,
        ja_existentes_transacoes: reconciliation.existingFinal.size,
        duplicados_na_origem: reconciliation.duplicateInOrigin,
        candidatos_novos: reconciliation.candidates.length,
        por_data: reconciliation.byDate,
      });
    }
    const extrato = { transacoes: reconciliation.candidates };
    if (extrato.transacoes.length === 0) {
      setSystemJobOutcome(res, {
        status: 'success', effectStatus: 'confirmed', inputCount: transacoes.length,
        outputCount: 0, result: 'todos_lancamentos_ja_existentes',
      });
      return res.json({
        ok: true, conta_id: contaLocal.id, periodo: { inicio, fim },
        origem_total: transacoes.length, inseridos: 0,
        duplicados: reconciliation.existingRaw.size + reconciliation.existingFinal.size + reconciliation.duplicateInOrigin,
      });
    }

    // 4. Cria registro de upload
    const { data: uploadRow } = await supabase
      .from('fin_uploads')
      .insert({
        tipo: 'ofx',  // tratado como OFX equivalente
        conta_id: contaLocal.id,
        arquivo_nome: `[cron] santander-sync-${fim}.json`,
        arquivo_tamanho: 0,
        total_registros: extrato.transacoes.length,
        data_inicio: inicio,
        data_fim: fim,
        status: 'processando',
      })
      .select().single();

    // 5. Insere lancamentos brutos
    let inseridos = 0;
    let duplicados = reconciliation.existingRaw.size + reconciliation.existingFinal.size + reconciliation.duplicateInOrigin;
    let erros = 0;
    const insertErrors = [];

    for (const t of extrato.transacoes) {
      const tipoTrn = Number(t.valor) >= 0 ? 'CREDIT' : 'DEBIT';
      const memo = t.descricao || '';

      // Preferência: doc da Santander (partieDoc), fallback regex no memo
      let documento = t.partieDoc || null;
      if (!documento) {
        // ⚠️ Régua ÚNICA em utils/documentoBr (a mesma do ofxParser): a versão
        // antiga colapsava o memo em dígitos, colava a data no CPF e fabricava
        // CNPJ inexistente — 5.921 casos num único extrato.
        documento = extrairDocumentoDoMemo(memo)?.documento || null;
      }

      const payload = {
        fonte: 'santander_api',
        conta_id: contaLocal.id,
        data_lancamento: t.data,
        valor: Math.abs(Number(t.valor)),
        tipo_trn: tipoTrn,
        memo,
        nome_contraparte: t.partieNome || null,
        documento_contraparte: documento,
        fitid: t.fitid,
        raw_data: { santander_api: t.raw || t },
        upload_id: uploadRow?.id,
      };

      const { error } = await supabase.from('fin_lancamentos_brutos').insert(payload);
      if (error) {
        if (error.code === '23505') duplicados++;
        else {
          erros++;
          insertErrors.push(error);
        }
      } else {
        inseridos++;
      }
    }

    // 6. Roda match com PIX detalhe + classificação
    const matchResult = await matchOfxPix({ uploadId: uploadRow?.id });
    const classifResult = await classificarBatch({ uploadId: uploadRow?.id });

    // Finaliza upload
    if (uploadRow) {
      await supabase.from('fin_uploads').update({
        total_novos: inseridos,
        total_duplicados: duplicados,
        total_matched_pix: matchResult.matched,
        total_classificados_auto: classifResult.sugeridos,
        status: erros > 0 ? 'erro' : 'concluido',
        erro_msg: erros > 0 ? `${erros} erros durante insert` : null,
        concluido_em: new Date().toISOString(),
      }).eq('id', uploadRow.id);
    }

    // ⚠️⚠️ DIA EM QUARENTENA MANDA NO DESFECHO. Os dias sãos foram importados
    // (trabalho real, e `outputCount` o reflete), mas a execução é FALHA: falta
    // extrato bancário de um dia, e isso tem de acender alarme e bloquear a
    // leitura de "está tudo em dia". Lacuna que ninguém lê é importação parcial
    // silenciosa com uma etapa a mais.
    setSystemJobOutcome(res, diasIncompletos.length ? {
      status: 'failed', effectStatus: 'failed', inputCount: extrato.transacoes.length,
      outputCount: inseridos, discardedCount: erros,
      errorCode: 'BANK_SYNC_DIA_INCOMPLETO',
      errorMessage: `Extrato NAO lido em ${diasIncompletos.length} dia(s): ${resumoDiasIncompletos()}. Os demais dias foram importados. ${diasIncompletos[0]?.motivo || ''}`.trim(),
      result: 'sincronizacao_com_dia_incompleto',
    } : erros > 0 ? {
      status: 'warning', effectStatus: 'failed', inputCount: extrato.transacoes.length,
      outputCount: inseridos, discardedCount: erros, errorCode: 'BANK_SYNC_PARTIAL',
      errorMessage: `${erros} lancamentos nao foram inseridos. ${summarizeInsertErrors(insertErrors)}`.trim(),
      result: 'sincronizacao_parcial',
    } : {
      status: 'success', effectStatus: 'confirmed', inputCount: extrato.transacoes.length,
      outputCount: inseridos, discardedCount: 0, result: 'sincronizacao_concluida',
    });

    res.json({
      ok: true,
      ambiente: AMBIENTE,
      periodo: { inicio, fim },
      total: extrato.transacoes.length,
      inseridos, duplicados, erros,
      match_pix: matchResult,
      classificacao: classifResult,
      dias_incompletos: diasIncompletos,
      duracao_ms: Date.now() - startTime,
    });
  } catch (e) {
    console.error('[SANTANDER-CRON] erro:', e.stack || e);
    next(bankSyncError(e, 'Erro ao sincronizar o extrato bancário.'));
  }
}

router.post('/sync', handlerSync);
router.get('/sync', handlerSync);  // Vercel cron usa GET

// ─────────────────────────────────────────────────────────────────────
// POST /api/santander/cron/pix-sync · sync rapido em janelas de culto
// ─────────────────────────────────────────────────────────────────────
// Diferente do /sync diario (puxa 3 dias completos), este puxa apenas
// as últimas 4h do extrato. Roda a cada 3min durante cultos pra alimentar
// a aba "Culto ao Vivo". Idempotente · transacoes já inseridas viram
// duplicados via FITID UNIQUE.
router.post('/pix-sync', async (req, res, next) => {
  const startTime = Date.now();

  if (!isConfigured()) {
    return res.json({ ok: true, skipped: 'santander_nao_configurado' });
  }

  try {
    const hoje = new Date();
    const horas = Math.min(Math.max(Number(req.body?.horas) || 4, 1), 24);
    const desde = new Date(hoje.getTime() - horas * 3600000);
    const inicio = desde.toISOString().slice(0, 10);
    const fim = hoje.toISOString().slice(0, 10);

    // Acha conta Santander
    const { data: contas } = await supabase
      .from('fin_contas')
      .select('*')
      .or(`banco.ilike.%santander%,conta.ilike.%${CONTA}%`);
    const contaLocal = (contas || [])[0];

    if (!contaLocal) {
      return res.json({ ok: false, erro: 'conta_santander_nao_cadastrada' });
    }

    // ─── ESTRATEGIA 1: API PIX dedicada (quando habilitada) ───
    // Quando SANTANDER_PIX_API_ENABLED=true, busca PIX direto da API PIX
    // que retorna End-to-End ID + hora exata. Insere em fin_pix_detalhe.
    let pixApiResult = null;
    if (pixApiService.isEnabled()) {
      try {
        pixApiResult = await pixApiService.buscarPixRecebidos({ inicio, fim });
        if (pixApiResult?.transacoes?.length) {
          let pixInseridos = 0;
          let pixDup = 0;
          for (const pix of pixApiResult.transacoes) {
            const { error } = await supabase
              .from('fin_pix_detalhe')
              .insert({
                ...pix,
                conta_id: contaLocal.id,
              });
            if (error) {
              if (error.code === '23505') pixDup++;
            } else {
              pixInseridos++;
            }
          }
          pixApiResult.inseridos = pixInseridos;
          pixApiResult.duplicados = pixDup;
        }
      } catch (e) {
        console.warn('[pix-sync] API PIX erro:', e.message);
        pixApiResult = { erro: e.message };
        captureHandledException(bankSyncError(e, 'Falha na estratégia PIX.'), req, 'bank.pix_sync.pix_api_fallback');
      }
    }

    // ─── ESTRATEGIA 2: extrato regular (sempre roda · cobre TED/DOC/PIX out) ───
    // Antes chamava contasService.extrato() — funcao INEXISTENTE (o export e'
    // consultarExtrato) → TypeError a cada execucao, e a estrategia 2 nunca rodou.
    const extrato = await extratoNormalizado({ inicio, fim, usarCache: false });
    if (!extrato?.transacoes?.length) {
      return res.json({
        ok: true,
        conta_id: contaLocal.id,
        sem_transacoes: true,
        pix_api: pixApiResult,
      });
    }

    // Filtra so creditos
    const creditos = extrato.transacoes.filter(t => Number(t.valor) > 0);

    let inseridos = 0;
    let duplicados = 0;

    for (const t of creditos) {
      const memo = t.descricao || t.memo || '';
      // ⚠️ Régua ÚNICA em utils/documentoBr — ver o comentário acima.
      const documento = extrairDocumentoDoMemo(memo)?.documento || null;

      const payload = {
        fonte: 'santander_api',
        conta_id: contaLocal.id,
        data_lancamento: t.data,
        valor: Number(t.valor),
        tipo_trn: 'CREDIT',
        memo,
        fitid: t.id || t.fitid || `santander-${t.data}-${t.valor}-${Math.random().toString(36).slice(2, 8)}`,
        documento_contraparte: documento,
        raw_data: { santander_api: t, source: 'pix-sync' },
      };

      const { error } = await supabase.from('fin_lancamentos_brutos').insert(payload);
      if (error) {
        if (error.code === '23505') duplicados++;
      } else {
        inseridos++;
      }
    }

    // Roda match com PIX detalhe + classificação em batch
    const matchResult = await matchOfxPix({ conta_id: contaLocal.id });
    const classifResult = await classificarBatch({});

    res.json({
      ok: true,
      ambiente: AMBIENTE,
      janela_horas: horas,
      total_creditos: creditos.length,
      inseridos, duplicados,
      match_pix: matchResult,
      classificacao: classifResult,
      pix_api: pixApiResult,
      duracao_ms: Date.now() - startTime,
    });
  } catch (e) {
    console.error('[SANTANDER-PIX-SYNC] erro:', e);
    next(bankSyncError(e, 'Erro ao sincronizar recebimentos PIX.'));
  }
});

// ─────────────────────────────────────────────────────────────────────
// GET/POST /api/santander/cron/saldo · atualiza snapshot do saldo + fin_contas
// Roda de hora em hora pra manter o dashboard atualizado sem usuário sincronizar.
// ─────────────────────────────────────────────────────────────────────
async function handlerSaldoCron(req, res, next) {
  if (!isConfigured()) {
    return res.json({ ok: true, skipped: 'santander_nao_configurado' });
  }
  try {
    const contas = require('../services/santander/contasService');
    const saldo = await contas.snapshotSaldoDoDia({ userId: null });
    res.json({
      ok: true,
      available: saldo.available,
      total: saldo.total,
      atualizado_em: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[SANTANDER-CRON saldo]', e.message);
    next(bankSyncError(e, 'Erro ao atualizar o saldo bancário.'));
  }
}
router.post('/saldo', handlerSaldoCron);
router.get('/saldo', handlerSaldoCron);

// ─────────────────────────────────────────────────────────────────────
// GET /api/santander/cron/health · checa se sync vai funcionar
// ─────────────────────────────────────────────────────────────────────
router.get('/health', async (req, res) => {
  res.json({
    cron_secret_configurado: !!process.env.CRON_SECRET,
    santander_configurado: isConfigured(),
    missing_env: missingEnv(),
    ambiente: AMBIENTE,
    agencia: AGENCIA,
    conta: CONTA,
    cnpj_titular: CNPJ_TITULAR,
  });
});

module.exports = router;
