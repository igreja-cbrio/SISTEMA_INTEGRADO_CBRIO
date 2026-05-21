// Rota de cron pra sync automatico do Santander
// NAO usa authenticate · protegida por header X-Cron-Secret (CRON_SECRET env)
//
// Fluxo do POST /api/santander/cron/sync:
//   1. Valida CRON_SECRET
//   2. Verifica se ENVs Santander estao configuradas (se nao, no-op)
//   3. Busca contas Santander · acha conta cadastrada local
//   4. Pega extrato dos ultimos N dias via API
//   5. Insere em fin_lancamentos_brutos (idempotente via FITID unique)
//   6. Roda matchOfxPix + classificarBatch
//   7. Retorna resumo

const router = require('express').Router();
const { supabase } = require('../utils/supabase');
const {
  AMBIENTE, AGENCIA, CONTA, CNPJ_TITULAR,
  isConfigured, missingEnv,
} = require('../services/santander/httpClient');
const contasService = require('../services/santander/contasService');
const { matchOfxPix, classificarBatch } = require('../services/financeiroClassificador');

function checkCronSecret(req, res, next) {
  const sent = req.headers['x-cron-secret'] || req.headers['authorization']?.replace('Bearer ', '');
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return res.status(500).json({ error: 'CRON_SECRET nao configurado' });
  }
  if (!sent || sent !== expected) {
    return res.status(401).json({ error: 'Cron secret invalido' });
  }
  next();
}

router.use(checkCronSecret);

// ─────────────────────────────────────────────────────────────────────
// POST /api/santander/cron/sync · sync diario do extrato
// ─────────────────────────────────────────────────────────────────────
router.post('/sync', async (req, res) => {
  const startTime = Date.now();

  // 1. Verifica config Santander
  if (!isConfigured()) {
    return res.json({
      ok: true,
      skipped: 'santander_nao_configurado',
      missing_env: missingEnv(),
      ambiente: AMBIENTE,
    });
  }

  try {
    const { dias = 3, conta_id_override } = req.body || {};
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
      return res.json({
        ok: false,
        erro: 'conta_santander_nao_cadastrada',
        sugestao: `Cadastre uma conta com banco=Santander ou conta=${CONTA} em /admin/financeiro -> Contas`,
      });
    }

    // 3. Pega extrato via API Santander
    const extrato = await contasService.extrato({ inicio, fim, refresh: true });

    if (!extrato || !extrato.transacoes) {
      return res.json({
        ok: true,
        conta_id: contaLocal.id,
        sem_transacoes: true,
        periodo: { inicio, fim },
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
    let duplicados = 0;
    let erros = 0;

    for (const t of extrato.transacoes) {
      // Estrutura do extrato (esperado de contasService.extrato):
      //   { data, valor, tipo, descricao, id }
      const tipoTrn = Number(t.valor) >= 0 ? 'CREDIT' : 'DEBIT';
      const memo = t.descricao || t.memo || '';

      // Extrai CPF/CNPJ do memo
      let documento = null;
      const cnpjM = memo.match(/\d{14}/);
      const cpfM = memo.match(/\d{11}/);
      if (cnpjM) documento = cnpjM[0];
      else if (cpfM) documento = cpfM[0];

      const payload = {
        fonte: 'santander_api',
        conta_id: contaLocal.id,
        data_lancamento: t.data,
        valor: Number(t.valor),
        tipo_trn: tipoTrn,
        memo,
        fitid: t.id || t.fitid || `santander-${t.data}-${t.valor}-${Math.random().toString(36).slice(2, 8)}`,
        documento_contraparte: documento,
        raw_data: { santander_api: t },
        upload_id: uploadRow?.id,
      };

      const { error } = await supabase.from('fin_lancamentos_brutos').insert(payload);
      if (error) {
        if (error.code === '23505') duplicados++;
        else erros++;
      } else {
        inseridos++;
      }
    }

    // 6. Roda match com PIX detalhe + classificacao
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

    res.json({
      ok: true,
      ambiente: AMBIENTE,
      periodo: { inicio, fim },
      total: extrato.transacoes.length,
      inseridos, duplicados, erros,
      match_pix: matchResult,
      classificacao: classifResult,
      duracao_ms: Date.now() - startTime,
    });
  } catch (e) {
    console.error('[SANTANDER-CRON] erro:', e);
    res.status(500).json({ error: e.message || 'Erro no sync', stack: e.stack });
  }
});

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
