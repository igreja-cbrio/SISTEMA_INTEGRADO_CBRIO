const router = require('express').Router();
const { supabase } = require('../utils/supabase');
const { getGraphToken } = require('../services/storageService');
const { processarFila } = require('../services/cerebroProcessor');
const { processSyncFila, upsertNoteForEntity, getSupportedEntityTypes } = require('../services/cerebroSync');
const { authenticate, authorize } = require('../middleware/auth');

const CRON_SECRET = process.env.CRON_SECRET;
const HUB_SITE_ID = 'infracbrio.sharepoint.com,04b50f10-ea32-40ba-84bd-44a3b38ee2a7,94fe6af6-f064-455d-afc5-67a377f5e82c';

const EXTENSOES = new Set(['pdf', 'xlsx', 'csv', 'docx', 'pptx', 'txt', 'md', 'json', 'png', 'jpg', 'jpeg']);

// ══════════════════════════════════════════════
// WEBHOOK — Microsoft Graph envia notificacoes aqui
// ══════════════════════════════════════════════

// POST /api/cerebro/webhook — recebe notificacoes do Graph
// Tambem responde ao GET de validacao (obrigatorio pra criar subscription)
router.post('/webhook', async (req, res) => {
  // Validacao: Graph envia validationToken ao criar subscription
  if (req.query.validationToken) {
    console.log('[CEREBRO WEBHOOK] Validacao recebida');
    return res.set('Content-Type', 'text/plain').status(200).send(req.query.validationToken);
  }

  // Responder 202 imediatamente (Graph exige resposta rapida)
  res.status(202).send('accepted');

  // Processar notificacoes em background
  try {
    const notifications = req.body?.value || [];
    console.log(`[CEREBRO WEBHOOK] ${notifications.length} notificacao(es) recebida(s)`);

    for (const notif of notifications) {
      const resource = notif.resource || '';
      // resource format: drives/{driveId}/root
      const driveMatch = resource.match(/drives\/([^\/]+)/);
      if (!driveMatch) continue;
      const driveId = driveMatch[1];

      // Buscar itens modificados nesse drive via delta
      await detectarMudancasNoDrive(driveId);
    }

    // Processar fila (max 3 por webhook pra ser rapido)
    await processarFilaLimitada(3);
  } catch (e) {
    console.error('[CEREBRO WEBHOOK] Erro:', e.message);
  }
});

// GET /api/cerebro/webhook — validacao do Graph (duplicado pra garantir)
router.get('/webhook', (req, res) => {
  if (req.query.validationToken) {
    return res.set('Content-Type', 'text/plain').status(200).send(req.query.validationToken);
  }
  res.status(200).json({ status: 'webhook ativo' });
});

// ══════════════════════════════════════════════
// SUBSCRIPTIONS — criar/renovar webhooks no Graph
// ══════════════════════════════════════════════

// POST /api/cerebro/subscriptions — criar subscriptions pra todas as bibliotecas
router.post('/subscriptions', async (req, res) => {
  const auth = req.headers['x-cron-secret'] || req.headers['authorization'];
  const isVercelCron = req.headers['user-agent']?.includes('vercel-cron');
  if (!isVercelCron && auth !== CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ erro: 'Nao autorizado' });
  }

  try {
    const token = await getGraphToken();
    const { data: cfg } = await supabase.from('cerebro_config').select('valor').eq('chave', 'bibliotecas_monitoradas').single();
    const monitoradas = String(cfg?.valor || '').split(',').map(s => s.trim());

    const drivesRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${HUB_SITE_ID}/drives`, { headers: { Authorization: `Bearer ${token}` } });
    const drives = (await drivesRes.json()).value || [];

    const baseUrl = process.env.FRONTEND_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://crmcbrio.vercel.app');
    const notificationUrl = `${baseUrl}/api/cerebro/webhook`;
    const expiration = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString(); // 29 dias

    const results = [];
    for (const drive of drives) {
      if (!monitoradas.includes(drive.name)) continue;

      // Verificar subscription existente
      const { data: existing } = await supabase.from('cerebro_config').select('valor').eq('chave', `sub_${drive.id}`).maybeSingle();

      if (existing?.valor) {
        // Renovar
        try {
          const renewRes = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${String(existing.valor).replace(/"/g, '')}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ expirationDateTime: expiration })
          });
          if (renewRes.ok) { results.push({ drive: drive.name, action: 'renewed' }); continue; }
        } catch {}
      }

      // Criar nova subscription
      const subRes = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changeType: 'created,updated',
          notificationUrl,
          resource: `/drives/${drive.id}/root`,
          expirationDateTime: expiration,
          clientState: CRON_SECRET || 'cbrio-cerebro',
        })
      });
      const subData = await subRes.json();

      if (subRes.ok) {
        await supabase.from('cerebro_config').upsert({ chave: `sub_${drive.id}`, valor: JSON.stringify(subData.id), atualizado_em: new Date().toISOString() }, { onConflict: 'chave' });
        results.push({ drive: drive.name, action: 'created', id: subData.id });
      } else {
        results.push({ drive: drive.name, action: 'error', error: subData.error?.message });
      }

      await new Promise(r => setTimeout(r, 500));
    }

    console.log('[CEREBRO] Subscriptions:', JSON.stringify(results));
    res.json({ sucesso: true, subscriptions: results });
  } catch (e) {
    console.error('[CEREBRO] Erro subscriptions:', e.message);
    res.status(500).json({ erro: e.message });
  }
});

// ══════════════════════════════════════════════
// CRON DIARIO — backup + renovar subscriptions
// ══════════════════════════════════════════════

router.all('/processar', async (req, res) => {
  const auth = req.headers['x-cron-secret'] || req.headers['authorization'];
  const isVercelCron = req.headers['user-agent']?.includes('vercel-cron');
  if (!isVercelCron && auth !== CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ erro: 'Nao autorizado' });
  }

  try {
    // 1. Detectar arquivos novos em todos os drives monitorados
    let totalDetectados = 0;
    try {
      const token = await getGraphToken();
      const { data: cfg } = await supabase.from('cerebro_config').select('valor').eq('chave', 'bibliotecas_monitoradas').single();
      const monitoradas = String(cfg?.valor || '').split(',').map(s => s.trim().replace(/["\[\]]/g, '')).filter(Boolean);

      const drivesRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${HUB_SITE_ID}/drives`, { headers: { Authorization: `Bearer ${token}` } });
      const drives = (await drivesRes.json()).value || [];

      for (const drive of drives) {
        if (monitoradas.length > 0 && !monitoradas.includes(drive.name)) continue;
        const d = await detectarMudancasNoDrive(drive.id);
        totalDetectados += d;
      }
    } catch (detectErr) {
      console.error('[CEREBRO CRON] Erro na deteccao:', detectErr.message);
    }

    // 2. Processar pendentes na fila
    const resultado = await processarFilaLimitada(10);
    res.json({ sucesso: true, detectados: totalDetectados, ...resultado });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

// GET /api/cerebro/status
router.get('/status', async (req, res) => {
  try {
    const { data: stats } = await supabase.from('cerebro_stats').select('*');
    const { data: ultimos } = await supabase.from('cerebro_fila')
      .select('nome_arquivo, biblioteca, status, processado_em, tokens_usados, resumo')
      .order('processado_em', { ascending: false }).limit(10);
    res.json({ estatisticas: stats, ultimos_processados: ultimos });
  } catch (e) { res.status(500).json({ erro: e.message }); }
});

// ══════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════

async function detectarMudancasNoDrive(driveId) {
  const token = await getGraphToken();

  // Delta link salvo?
  const { data: deltaRow } = await supabase.from('cerebro_config').select('valor').eq('chave', `delta_${driveId}`).maybeSingle();
  let savedDelta = deltaRow?.valor ? String(deltaRow.valor).replace(/^"|"$/g, '') : null;
  let deltaUrl = (savedDelta && savedDelta.startsWith('http')) ? savedDelta : `https://graph.microsoft.com/v1.0/drives/${driveId}/root/delta`;

  let hasMore = true;
  let detectados = 0;

  while (hasMore) {
    const res = await fetch(deltaUrl, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();

    for (const item of (data.value || [])) {
      if (item.folder || item.deleted) continue;
      const nome = item.name || '';
      const ext = nome.split('.').pop()?.toLowerCase();
      if (!EXTENSOES.has(ext) || (item.size || 0) < 100 || nome.startsWith('~')) continue;

      const lastMod = item.lastModifiedDateTime || '';
      const { data: exists } = await supabase.from('cerebro_fila')
        .select('id, last_modified, status').eq('item_id', item.id).eq('drive_id', driveId).maybeSingle();

      if (exists) {
        if (exists.last_modified === lastMod && exists.status !== 'erro') continue;
        await supabase.from('cerebro_fila').update({ status: 'pendente', last_modified: lastMod, detectado_em: new Date().toISOString() }).eq('id', exists.id);
      } else {
        const pasta = item.parentReference?.path?.replace(/.*root:\//, '')?.replace(/^\//, '') || '/';
        // Buscar nome da biblioteca
        let bibNome = 'Planejamento';
        try {
          const driveInfo = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}`, { headers: { Authorization: `Bearer ${token}` } });
          const di = await driveInfo.json();
          if (di.name) bibNome = di.name;
        } catch {}

        await supabase.from('cerebro_fila').insert({
          drive_id: driveId, item_id: item.id, nome_arquivo: nome, extensao: ext,
          tamanho_bytes: item.size, pasta_origem: pasta, biblioteca: bibNome,
          sharepoint_url: item.webUrl, last_modified: lastMod,
        });
      }
      detectados++;
    }

    if (data['@odata.nextLink']) { deltaUrl = data['@odata.nextLink']; }
    else {
      if (data['@odata.deltaLink']) {
        await supabase.from('cerebro_config').upsert({ chave: `delta_${driveId}`, valor: JSON.stringify(data['@odata.deltaLink']), atualizado_em: new Date().toISOString() }, { onConflict: 'chave' });
      }
      hasMore = false;
    }
  }

  if (detectados > 0) console.log(`[CEREBRO] Drive ${driveId}: ${detectados} mudancas detectadas`);
  return detectados;
}

async function processarFilaLimitada(limite) {
  // Resetar itens travados em "processando" por mais de 5 min
  await supabase.from('cerebro_fila').update({ status: 'pendente' })
    .eq('status', 'processando')
    .lt('detectado_em', new Date(Date.now() - 5 * 60 * 1000).toISOString());

  return await processarFila();
}

// ══════════════════════════════════════════════
// SYNC REVERSO — ERP → vault (cron + backfill)
// ══════════════════════════════════════════════

// POST/GET /api/cerebro/sync-erp — cron que consome a fila de sync reverso
router.all('/sync-erp', async (req, res) => {
  const auth = req.headers['x-cron-secret'] || req.headers['authorization'];
  const isVercelCron = req.headers['user-agent']?.includes('vercel-cron');
  if (!isVercelCron && auth !== CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ erro: 'Nao autorizado' });
  }

  try {
    const limite = Math.min(parseInt(req.query.limite) || 8, 20);
    const resultado = await processSyncFila(limite);
    res.json({ sucesso: true, ...resultado });
  } catch (e) {
    console.error('[CEREBRO SYNC-ERP] Erro:', e.message);
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

// POST /api/cerebro/backfill/:entityType — admin dispara backfill por módulo
// Enfileira TODAS as entidades já cadastradas do tipo informado. Usar com cuidado:
// gera N notas no vault (pode disparar rate limit). Processe aos poucos via cron.
router.post('/backfill/:entityType', authenticate, authorize('admin', 'diretor'), async (req, res) => {
  const { entityType } = req.params;
  const supported = getSupportedEntityTypes();
  if (!supported.includes(entityType)) {
    return res.status(400).json({ erro: `entity_type inválido`, suportados: supported });
  }

  const TABLE_BY_TYPE = {
    membro:         { table: 'mem_membros',       idCol: 'id', filter: (q) => q.eq('active', true) },
    evento:         { table: 'events',            idCol: 'id', filter: (q) => q },
    projeto:        { table: 'projects',          idCol: 'id', filter: (q) => q },
    voluntario:     { table: 'vol_profiles',      idCol: 'id', filter: (q) => q },
    acompanhamento: { table: 'cui_acompanhamentos', idCol: 'id', filter: (q) => q },
    funcionario:    { table: 'rh_funcionarios',   idCol: 'id', filter: (q) => q.eq('status', 'ativo') },
  };

  try {
    let ids = [];

    if (entityType === 'contribuicao-mes') {
      // Enfileira todos os meses distintos que têm contribuição registrada.
      const { data: meses } = await supabase
        .from('mem_contribuicoes')
        .select('data')
        .order('data', { ascending: false });
      const set = new Set();
      for (const row of meses || []) {
        if (row.data) set.add(String(row.data).slice(0, 7)); // YYYY-MM
      }
      ids = Array.from(set);
    } else {
      const cfg = TABLE_BY_TYPE[entityType];
      if (!cfg) {
        return res.status(400).json({ erro: 'Backfill não implementado para este entity_type' });
      }
      let query = supabase.from(cfg.table).select(cfg.idCol);
      query = cfg.filter(query);
      const { data: rows, error } = await query;
      if (error) throw error;
      ids = (rows || []).map((r) => r[cfg.idCol]);
    }

    let enfileirados = 0;
    for (const id of ids) {
      const { data: existing } = await supabase
        .from('cerebro_sync_fila')
        .select('id')
        .eq('entity_type', entityType)
        .eq('entity_id', String(id))
        .in('status', ['pendente', 'processando'])
        .limit(1)
        .maybeSingle();
      if (existing) continue;
      const { error: insErr } = await supabase.from('cerebro_sync_fila').insert({
        entity_type: entityType,
        entity_id: String(id),
        action: 'upsert',
      });
      if (!insErr) enfileirados++;
    }

    res.json({ sucesso: true, entity_type: entityType, total_registros: ids.length, enfileirados });
  } catch (e) {
    console.error(`[CEREBRO BACKFILL ${entityType}] Erro:`, e.message);
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

// POST /api/cerebro/sync-now/:entityType/:id — força sync imediato de uma entidade (debug)
router.post('/sync-now/:entityType/:id', authenticate, authorize('admin', 'diretor'), async (req, res) => {
  try {
    const result = await upsertNoteForEntity(req.params.entityType, req.params.id);
    res.json({ sucesso: true, ...result });
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e.message });
  }
});

module.exports = router;
