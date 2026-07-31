const { supabase } = require('../utils/supabase');

const LEGACY_FIELDS = new Set([
  'user_id', 'user_email', 'metodo', 'rota', 'mensagem', 'stack', 'status',
]);
const MISSING_COLUMN_CODES = new Set(['PGRST204', '42703']);

function legacyRow(row) {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => LEGACY_FIELDS.has(key)),
  );
}

async function recordServerError(row) {
  const { error } = await supabase.from('app_erros_servidor').insert(row);
  if (!error) return { ok: true, legacy: false };

  // Código pode ser publicado antes da migration aditiva. Mantém a telemetria
  // antiga viva e passa a correlacionar automaticamente quando as colunas existem.
  if (MISSING_COLUMN_CODES.has(error.code) || /request_id|release|environment/i.test(error.message || '')) {
    const { error: fallbackError } = await supabase
      .from('app_erros_servidor')
      .insert(legacyRow(row));
    if (!fallbackError) return { ok: true, legacy: true };
    console.warn('[app_erros_servidor/fallback]', fallbackError.message);
    return { ok: false, error: fallbackError };
  }

  console.warn('[app_erros_servidor]', error.message);
  return { ok: false, error };
}

module.exports = {
  legacyRow,
  recordServerError,
};
