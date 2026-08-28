const crypto = require('crypto');

function fitidForTransaction(transaction) {
  if (transaction.id) return String(transaction.id);
  const stable = JSON.stringify(transaction.raw || transaction);
  return `santander-${crypto.createHash('sha256').update(stable).digest('hex').slice(0, 40)}`;
}

function summarizeInsertErrors(errors = []) {
  const counts = new Map();
  for (const error of errors) {
    const code = String(error?.code || 'UNKNOWN').slice(0, 40);
    const constraint = String(error?.constraint || '').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80);
    const key = constraint ? `${code}:${constraint}` : code;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 8)
    .map(([key, count]) => `${key}=${count}`)
    .join(', ');
}

async function findExistingValues(supabase, table, column, values) {
  const unique = [...new Set(values.filter(Boolean).map(String))];
  const found = new Set();
  for (let index = 0; index < unique.length; index += 100) {
    const chunk = unique.slice(index, index + 100);
    const { data, error } = await supabase.from(table).select(column).in(column, chunk);
    if (error) throw error;
    for (const row of data || []) if (row[column]) found.add(String(row[column]));
  }
  return found;
}

async function reconcileTransactions(supabase, transactions) {
  const prepared = transactions.map((transaction) => ({ ...transaction, fitid: fitidForTransaction(transaction) }));
  const fitids = prepared.map((transaction) => transaction.fitid);
  const [existingRaw, existingFinal] = await Promise.all([
    findExistingValues(supabase, 'fin_lancamentos_brutos', 'fitid', fitids),
    findExistingValues(supabase, 'fin_transacoes', 'referencia', fitids),
  ]);
  const seen = new Set();
  const candidates = [];
  let duplicateInOrigin = 0;
  for (const transaction of prepared) {
    if (seen.has(transaction.fitid)) { duplicateInOrigin += 1; continue; }
    seen.add(transaction.fitid);
    if (!existingRaw.has(transaction.fitid) && !existingFinal.has(transaction.fitid)) candidates.push(transaction);
  }
  const byDate = {};
  for (const transaction of prepared) {
    const date = String(transaction.data || '').slice(0, 10) || 'sem_data';
    byDate[date] ||= { origem: 0, ja_existentes: 0, candidatos: 0 };
    byDate[date].origem += 1;
    if (existingRaw.has(transaction.fitid) || existingFinal.has(transaction.fitid)) byDate[date].ja_existentes += 1;
  }
  for (const transaction of candidates) {
    const date = String(transaction.data || '').slice(0, 10) || 'sem_data';
    byDate[date].candidatos += 1;
  }
  return { prepared, candidates, existingRaw, existingFinal, duplicateInOrigin, byDate };
}

module.exports = { findExistingValues, fitidForTransaction, reconcileTransactions, summarizeInsertErrors };
