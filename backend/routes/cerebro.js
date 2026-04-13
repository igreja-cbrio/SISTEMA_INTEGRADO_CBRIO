const router = require('express').Router();
const { supabase } = require('../utils/supabase');
const { detectarArquivosNovos } = require('../services/cerebroDetector');
const { processarFila } = require('../services/cerebroProcessor');

const CRON_SECRET = process.env.CRON_SECRET;

// POST /api/cerebro/processar — chamado pelo cron job
router.post('/processar', async (req, res) => {
  const auth = req.headers['x-cron-secret'] || req.headers['authorization'];
  if (auth !== CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ erro: 'Nao autorizado' });
  }

  const inicio = Date.now();
  try {
    console.log('[CEREBRO] === INICIO ===');

    // 1. Detectar novos/modificados
    const detectados = await detectarArquivosNovos();

    // 2. Processar fila
    const resultado = await processarFila();

    const duracao = Math.round((Date.now() - inicio) / 1000);
    const resposta = {
      sucesso: true, timestamp: new Date().toISOString(), duracao_segundos: duracao,
      arquivos_detectados: detectados,
      arquivos_processados: resultado.processados,
      erros: resultado.erros
    };
    console.log(`[CEREBRO] === FIM (${duracao}s) ===`);
    res.json(resposta);
  } catch (e) {
    console.error('[CEREBRO] Erro:', e.message);
    res.status(500).json({ sucesso: false, erro: e.message, duracao_segundos: Math.round((Date.now() - inicio) / 1000) });
  }
});

// GET /api/cerebro/status — dashboard rapido
router.get('/status', async (req, res) => {
  try {
    const { data: stats } = await supabase.from('cerebro_stats').select('*');
    const { data: ultimos } = await supabase.from('cerebro_fila')
      .select('nome_arquivo, biblioteca, status, processado_em, tokens_usados, resumo')
      .order('processado_em', { ascending: false }).limit(10);
    res.json({ estatisticas: stats, ultimos_processados: ultimos });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// POST /api/cerebro/scan — so detectar (sem processar)
router.post('/scan', async (req, res) => {
  const auth = req.headers['x-cron-secret'] || req.headers['authorization'];
  if (auth !== CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ erro: 'Nao autorizado' });
  }
  try {
    const detectados = await detectarArquivosNovos();
    res.json({ sucesso: true, detectados });
  } catch (e) { res.status(500).json({ sucesso: false, erro: e.message }); }
});

// POST /api/cerebro/process — so processar fila (sem detectar)
router.post('/process', async (req, res) => {
  const auth = req.headers['x-cron-secret'] || req.headers['authorization'];
  if (auth !== CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ erro: 'Nao autorizado' });
  }
  try {
    const resultado = await processarFila();
    res.json({ sucesso: true, ...resultado });
  } catch (e) { res.status(500).json({ sucesso: false, erro: e.message }); }
});

module.exports = router;
