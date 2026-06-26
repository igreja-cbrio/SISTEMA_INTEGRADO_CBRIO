// ============================================================================
// SharePoint · Governança — documentos das reuniões de diretoria
// ============================================================================
// Sobe os anexos (documentos de entrada pré-reunião + atas) pra biblioteca
// "Gestão" do CBRio Hub, reusando o pipeline do storageService.js (Microsoft
// Graph + retry exponencial). Mesmo padrão do sharepointMarketing.js.
//
// Path no SharePoint: Gestão / Governanca / <YYYY> / <YYYY-MM> / <mtg>_<arquivo>
// Banco: 1 linha em governance_meeting_docs por arquivo.
// ============================================================================

const { supabase } = require('../utils/supabase');
const storage = require('./storageService');

const GOV_LIBRARY_MODULE = 'governanca'; // -> biblioteca "Gestão" (MODULE_LIBRARY_MAP)
const GOV_LIBRARY_NAME = 'Gestão';
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const RETRY_ATTEMPTS = 3;
const RETRY_BASE_MS = 500;
const TIPOS_DOC = ['entrada', 'ata', 'apoio'];

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function buildSubfolder(dateStr) {
  // organiza por ano/mês — usa a data da reunião quando houver, senão hoje
  const d = dateStr ? new Date(dateStr) : new Date();
  const valid = isNaN(d.getTime()) ? new Date() : d;
  const ano = valid.getUTCFullYear();
  const mes = String(valid.getUTCMonth() + 1).padStart(2, '0');
  return `Governanca/${ano}/${ano}-${mes}`;
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
    catch (e) { lastErr = e; if (i < RETRY_ATTEMPTS - 1) await sleep(RETRY_BASE_MS * Math.pow(2, i)); }
  }
  throw lastErr;
}

/**
 * Upload de um documento da reunião pro SharePoint + grava em governance_meeting_docs.
 * @param {Object} args
 * @param {string} args.meetingId - UUID da reunião
 * @param {string} args.userId    - auth.users.id de quem envia (enviado_por)
 * @param {string} [args.userNome]
 * @param {Object} args.file      - objeto multer (originalname, mimetype, size, buffer)
 * @param {string} [args.tipo]    - 'entrada' | 'ata' | 'apoio'
 */
async function uploadDoc({ meetingId, userId, userNome, file, tipo }) {
  const tipoFinal = TIPOS_DOC.includes(tipo) ? tipo : 'entrada';
  if (!storage.SHAREPOINT_CONFIGURED) {
    throw new Error('SharePoint não configurado · documentos precisam do Microsoft Graph (MICROSOFT_TENANT_ID / CLIENT_ID / CLIENT_SECRET / SHAREPOINT_SITE_ID).');
  }
  if (!file?.buffer) throw new Error('Arquivo inválido · sem buffer');
  if (!file.originalname) throw new Error('Arquivo inválido · sem nome');
  if (file.size > MAX_BYTES) throw new Error(`Arquivo excede ${Math.round(MAX_BYTES / 1024 / 1024)}MB`);

  // Confirma que a reunião existe e não foi excluída
  const { data: meeting, error: mErr } = await supabase
    .from('governance_meetings')
    .select('id, date')
    .eq('id', meetingId)
    .is('deleted_at', null)
    .maybeSingle();
  if (mErr) throw mErr;
  if (!meeting) throw new Error('Reunião não encontrada ou já excluída');

  const subFolder = buildSubfolder(meeting.date);
  const safeName = `${String(meetingId).slice(0, 8)}_${Date.now()}_${sanitizeFileName(file.originalname)}`;

  const up = await withRetry(() =>
    storage.uploadModuleFile(GOV_LIBRARY_MODULE, subFolder, safeName, file.buffer)
  );

  const { data: row, error: insErr } = await supabase
    .from('governance_meeting_docs')
    .insert({
      meeting_id: meetingId,
      tipo: tipoFinal,
      nome_arquivo: file.originalname,
      mime_type: file.mimetype || null,
      tamanho_bytes: file.size,
      sharepoint_path: up.path,
      sharepoint_item_id: up.itemId,
      sharepoint_url: up.url || null,
      enviado_por: userId || null,
      enviado_por_nome: userNome || null,
    })
    .select('*')
    .single();
  if (insErr) throw insErr;

  return { ...row, url: up.url };
}

async function listarDocs(meetingId) {
  const { data, error } = await supabase
    .from('governance_meeting_docs')
    .select('*')
    .eq('meeting_id', meetingId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * URL temporária do Graph pra download direto (TTL ~1h). Resolve o drive da
 * biblioteca "Gestão" e pega o @microsoft.graph.downloadUrl do item.
 */
async function getDownloadUrl(docId) {
  const { data: row, error } = await supabase
    .from('governance_meeting_docs')
    .select('*')
    .eq('id', docId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('Documento não encontrado');
  if (!row.sharepoint_item_id) throw new Error('Documento sem sharepoint_item_id · upload incompleto');

  const driveId = await storage.getDriveIdByName(GOV_LIBRARY_NAME);
  const token = await storage.getGraphToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${row.sharepoint_item_id}?select=id,name,@microsoft.graph.downloadUrl`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Graph download falhou ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const url = data['@microsoft.graph.downloadUrl'];
  if (!url) throw new Error('Graph não retornou downloadUrl');
  return { url, nome_arquivo: row.nome_arquivo, mime_type: row.mime_type };
}

/** Soft delete (governance_meeting_docs está na whitelist app_soft_deletable_tables). */
async function removerDoc(docId, userId) {
  const { data, error } = await supabase.rpc('app_soft_delete', {
    p_table_name: 'governance_meeting_docs',
    p_row_id: docId,
    p_deleted_by: userId || null,
  });
  if (error) throw error;
  return data;
}

module.exports = { uploadDoc, listarDocs, getDownloadUrl, removerDoc, MAX_BYTES, TIPOS_DOC };
