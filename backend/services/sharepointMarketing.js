// ============================================================================
// SharePoint · Marketing (Spec 006)
// ============================================================================
// Sobe entregaveis Marketing pra biblioteca "Criativo" do CBRio Hub.
// Reaproveita o pipeline do storageService.js (Microsoft Graph + retry).
//
// Path no SharePoint: Criativo / Marketing / <YYYY> / <YYYY-MM> / <card_id>_<arquivo>
// (organiza por ano/mes pra facilitar consulta histórica)
//
// Banco: 1 linha em marketing_entregaveis por arquivo.
// ============================================================================

const { supabase } = require('../utils/supabase');
const storage = require('./storageService');

const MARKETING_LIBRARY_MODULE = 'criativo';
const MAX_BYTES = 50 * 1024 * 1024;  // 50 MB · alinhado com o doc da Spec 006
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_MS = 500;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function buildSubfolder(card, tipo) {
  const d = new Date();
  const ano = d.getUTCFullYear();
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const base = tipo === 'referencia' ? 'Marketing/Referencias' : 'Marketing';
  return `${base}/${ano}/${ano}-${mes}`;
}

function sanitizeFileName(fileName) {
  return String(fileName || 'arquivo')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_\-. ]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

async function withRetry(fn) {
  let lastErr;
  for (let i = 0; i < RETRY_ATTEMPTS; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (i < RETRY_ATTEMPTS - 1) await sleep(RETRY_BASE_MS * Math.pow(2, i));
    }
  }
  throw lastErr;
}

/**
 * Faz upload de um entregavel pro SharePoint + grava em marketing_entregaveis.
 * @param {Object} args
 * @param {string} args.cardId - UUID do card
 * @param {string} args.userId - profile.id de quem esta enviando
 * @param {Object} args.file - objeto multer (originalname, mimetype, size, buffer)
 * @returns {Promise<Object>} linha de marketing_entregaveis criada
 */
async function uploadEntregavel({ cardId, userId, file, tipo }) {
  const tipoFinal = tipo === 'referencia' ? 'referencia' : 'entregavel';
  if (!storage.SHAREPOINT_CONFIGURED) {
    throw new Error('SharePoint não configurado · entregaveis precisam de Microsoft Graph (configure MICROSOFT_TENANT_ID / CLIENT_ID / CLIENT_SECRET / SHAREPOINT_SITE_ID).');
  }
  if (!file?.buffer) throw new Error('Arquivo invalido · sem buffer');
  if (!file.originalname) throw new Error('Arquivo invalido · sem nome');
  if (file.size > MAX_BYTES) throw new Error(`Arquivo excede ${Math.round(MAX_BYTES / 1024 / 1024)}MB`);

  // Confirma que o card existe e não foi soft-deletado
  const { data: card, error: cardErr } = await supabase
    .from('marketing_kanban_cards')
    .select('id, titulo, origem, solicitacao_id')
    .eq('id', cardId)
    .is('deleted_at', null)
    .maybeSingle();
  if (cardErr) throw cardErr;
  if (!card) throw new Error('Card não encontrado ou já excluido');

  const subFolder = buildSubfolder(card, tipoFinal);
  const safeName = `${cardId.slice(0, 8)}_${Date.now()}_${sanitizeFileName(file.originalname)}`;

  // Upload com retry exponencial
  const upload = await withRetry(() =>
    storage.uploadModuleFile(MARKETING_LIBRARY_MODULE, subFolder, safeName, file.buffer)
  );

  // Grava no banco · service_role bypassa RLS
  const { data: row, error: insErr } = await supabase
    .from('marketing_entregaveis')
    .insert({
      card_id: cardId,
      sharepoint_path: upload.path,
      sharepoint_item_id: upload.itemId,
      nome_arquivo: file.originalname,
      tipo_mime: file.mimetype || null,
      tamanho_bytes: file.size,
      enviado_por: userId,
      tipo: tipoFinal,
    })
    .select('*')
    .single();
  if (insErr) throw insErr;

  return { ...row, url: upload.url };
}

/**
 * Lista entregaveis de um card · incluindo signed/download URL temporaria do Graph.
 */
async function listarEntregaveis(cardId) {
  const { data: entregaveis, error } = await supabase
    .from('marketing_entregaveis')
    .select('*')
    .eq('card_id', cardId)
    .is('deleted_at', null)
    .order('enviado_em', { ascending: false });
  if (error) throw error;
  return entregaveis || [];
}

/**
 * Gera URL temporaria do Graph pra download direto (TTL: ~1h).
 * Reaproveita o downloadFromSharePoint do storageService pra pegar metadata + URL.
 */
async function getDownloadUrl(entregavelId) {
  const { data: row, error } = await supabase
    .from('marketing_entregaveis')
    .select('*')
    .eq('id', entregavelId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('Entregavel não encontrado');
  if (!row.sharepoint_item_id) throw new Error('Entregavel sem sharepoint_item_id · upload incompleto');

  // graphRequest existe no storageService · usamos pra pegar metadata do item
  // com @microsoft.graph.downloadUrl (TTL ~1h)
  const token = await storage.getGraphToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${storage.CBRIO_HUB_SITE_ID}/drive/items/${row.sharepoint_item_id}?select=id,name,@microsoft.graph.downloadUrl`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    // Tenta via /drives/{driveId}/items/{itemId} caso a busca pelo site não funcione
    const txt = await res.text().catch(() => '');
    throw new Error(`Graph download falhou ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const url = data['@microsoft.graph.downloadUrl'];
  if (!url) throw new Error('Graph não retornou downloadUrl');
  return { url, nome_arquivo: row.nome_arquivo, tipo_mime: row.tipo_mime };
}

/**
 * Soft delete · so admin marketing/super-admin.
 */
async function removerEntregavel(entregavelId, userId) {
  const { data, error } = await supabase
    .from('marketing_entregaveis')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', entregavelId)
    .is('deleted_at', null)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

module.exports = { uploadEntregavel, listarEntregaveis, getDownloadUrl, removerEntregavel, MAX_BYTES };
