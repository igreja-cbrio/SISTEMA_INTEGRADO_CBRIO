// Servico de comprovantes Santander (consult_payment_receipts v2)
// - Listagem
// - Geracao de PDF (assincrono): POST file_request -> poll -> download -> Supabase Storage
// - Bulk receipts (mes inteiro)
const { callApi, downloadBinary } = require('./httpClient');
const { supabase } = require('../../utils/supabase');

const BASE = '/consult_payment_receipts/v2';
const BUCKET = 'santander-comprovantes';

// Helpers de data
function isoDate(d) {
  if (typeof d === 'string') return d.slice(0, 10);
  return new Date(d).toISOString().slice(0, 10);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Listagem de comprovantes ───────────────────────────────────────────────
// API limita 30 dias por chamada. Backend pode fatiar e concatenar.
async function listReceipts({ startDate, endDate, limit = 50, offset = 0, category, beneficiaryDocument, accountAgency, accountNumber, userId = null } = {}) {
  if (!startDate || !endDate) throw new Error('startDate e endDate sao obrigatorios');
  return callApi(`${BASE}/payment_receipts`, {
    method: 'GET',
    query: {
      _limit: String(Math.min(Number(limit) || 50, 50)),
      _offset: String(offset),
      start_date: isoDate(startDate),
      end_date: isoDate(endDate),
      ...(category ? { category } : {}),
      ...(beneficiaryDocument ? { beneficiary_document: beneficiaryDocument } : {}),
      ...(accountAgency ? { account_agency: accountAgency } : {}),
      ...(accountNumber ? { account_number: accountNumber } : {}),
    },
    userId,
  });
}

// ── File request (assincrono) ──────────────────────────────────────────────
async function createFileRequest(paymentId, { userId = null } = {}) {
  if (!paymentId) throw new Error('paymentId obrigatorio');
  const body = { payment: { paymentId } };
  return callApi(`${BASE}/payment_receipts/${encodeURIComponent(paymentId)}/file_requests`, {
    method: 'POST',
    body,
    userId,
  });
}

async function getFileRequest(paymentId, requestId, { userId = null } = {}) {
  return callApi(`${BASE}/payment_receipts/${encodeURIComponent(paymentId)}/file_requests/${encodeURIComponent(requestId)}`, {
    method: 'GET',
    userId,
  });
}

async function listFileRequests(paymentId, { userId = null } = {}) {
  return callApi(`${BASE}/payment_receipts/${encodeURIComponent(paymentId)}/file_requests`, {
    method: 'GET',
    userId,
  });
}

// Polling ate AVAILABLE (max ~30s) · 2s intervalo
async function waitForAvailable(paymentId, requestId, { maxTries = 15, intervalMs = 2000, userId = null } = {}) {
  for (let i = 0; i < maxTries; i++) {
    const data = await getFileRequest(paymentId, requestId, { userId });
    const status = data?.file?.statusInfo?.statusCode;
    if (status === 'AVAILABLE') return data;
    if (status === 'ERROR' || status === 'EXPUNGED') {
      const err = new Error(`File request ${status} para ${paymentId}`);
      err.santanderStatus = status;
      throw err;
    }
    await sleep(intervalMs);
  }
  const err = new Error(`File request timeout para ${paymentId}`);
  err.santanderStatus = 'TIMEOUT';
  throw err;
}

// Fluxo completo: cria file_request -> polla -> baixa do Azure (5min TTL) ->
// salva em Supabase Storage permanente -> upserta santander_comprovantes
async function baixarComprovante(paymentId, { userId = null, metadata = {} } = {}) {
  if (!supabase) throw new Error('Supabase nao configurado');

  // 1. Cria file_request (ou pega existente)
  const created = await createFileRequest(paymentId, { userId });
  const requestId = created?.request?.requestId;
  if (!requestId) throw new Error('Santander nao retornou requestId');

  // Marca como requested
  await supabase
    .from('santander_comprovantes')
    .upsert({
      payment_id: paymentId,
      file_request_id: requestId,
      status: 'requested',
      status_message: 'Aguardando processamento Santander',
      raw_metadata: metadata,
    }, { onConflict: 'payment_id' });

  // 2. Poll ate AVAILABLE
  let available;
  try {
    available = await waitForAvailable(paymentId, requestId, { userId });
  } catch (err) {
    await supabase
      .from('santander_comprovantes')
      .update({
        status: 'erro',
        status_message: err.message,
      })
      .eq('payment_id', paymentId);
    throw err;
  }

  // 3. Download do link Azure (TTL 5min)
  const downloadUrl = available?.file?.fileRepository?.location;
  if (!downloadUrl) {
    await supabase
      .from('santander_comprovantes')
      .update({ status: 'erro', status_message: 'Sem link de download' })
      .eq('payment_id', paymentId);
    throw new Error('Resposta sem fileRepository.location');
  }

  const pdfBuffer = await downloadBinary(downloadUrl);

  // 4. Salva no Supabase Storage
  const dt = metadata.payment_date ? new Date(metadata.payment_date) : new Date();
  const ano = dt.getFullYear();
  const mes = String(dt.getMonth() + 1).padStart(2, '0');
  const safeId = String(paymentId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const storagePath = `${ano}/${mes}/${safeId}.pdf`;

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });
  if (upErr) {
    await supabase
      .from('santander_comprovantes')
      .update({ status: 'erro', status_message: `Storage: ${upErr.message}` })
      .eq('payment_id', paymentId);
    throw new Error(`Storage falhou: ${upErr.message}`);
  }

  // 5. UPDATE final
  const { data: updated, error: updErr } = await supabase
    .from('santander_comprovantes')
    .update({
      storage_path: storagePath,
      status: 'baixado',
      status_message: null,
      baixado_em: new Date().toISOString(),
      baixado_por: userId,
    })
    .eq('payment_id', paymentId)
    .select()
    .single();

  if (updErr) throw new Error(`Update falhou: ${updErr.message}`);

  return updated;
}

async function getSignedUrl(paymentId, { expiresIn = 60 * 60 * 24 * 7 } = {}) {
  if (!supabase) throw new Error('Supabase nao configurado');
  const { data: row } = await supabase
    .from('santander_comprovantes')
    .select('storage_path, status')
    .eq('payment_id', paymentId)
    .single();
  if (!row || row.status !== 'baixado' || !row.storage_path) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, expiresIn);
  if (error) throw new Error(`SignedUrl falhou: ${error.message}`);
  return data?.signedUrl || null;
}

// ── Bulk receipts ──────────────────────────────────────────────────────────
async function createBulkOrder({ alias, startDate, endDate, categoryCodes, payeeDocument, userId = null } = {}) {
  if (!alias) throw new Error('alias obrigatorio');
  if (!startDate || !endDate) throw new Error('startDate e endDate obrigatorios');

  const body = {
    alias,
    batchType: 'EVENTUAL',
    period: {
      startDateTime: new Date(`${isoDate(startDate)}T00:00:00Z`).toISOString(),
      endDateTime: new Date(`${isoDate(endDate)}T23:59:59Z`).toISOString(),
    },
    ...(payeeDocument ? { payee: { documentNumber: String(payeeDocument).replace(/\D/g, '') } } : {}),
    ...(Array.isArray(categoryCodes) && categoryCodes.length
      ? { payment: { category: { codes: categoryCodes } } }
      : {}),
  };

  const resp = await callApi(`${BASE}/bulk_receipts`, { method: 'POST', body, userId });
  const orderId = resp?.orderId;
  if (orderId && supabase) {
    await supabase.from('santander_bulk_orders').insert({
      order_id: orderId,
      alias,
      data_inicio: isoDate(startDate),
      data_fim: isoDate(endDate),
      category_codes: categoryCodes || null,
      status: resp.status || 'STARTED',
      pre_receipt_count: resp.preReceiptCount || null,
      receipt_count: resp.receiptCount || null,
      criado_por: userId,
    });
  }
  return resp;
}

async function getBulkOrder(orderId, { userId = null } = {}) {
  const resp = await callApi(`${BASE}/bulk_receipts/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    userId,
  });
  if (resp && supabase) {
    await supabase.from('santander_bulk_orders')
      .update({
        status: resp.status || null,
        pre_receipt_count: resp.preReceiptCount || null,
        receipt_count: resp.receiptCount || null,
        files: resp.files || null,
        error_message: resp.errorMessage || null,
      })
      .eq('order_id', orderId);
  }
  return resp;
}

async function listBulkOrders({ userId = null } = {}) {
  return callApi(`${BASE}/bulk_receipts`, { method: 'GET', userId });
}

module.exports = {
  listReceipts,
  createFileRequest,
  getFileRequest,
  listFileRequests,
  baixarComprovante,
  getSignedUrl,
  createBulkOrder,
  getBulkOrder,
  listBulkOrders,
};
