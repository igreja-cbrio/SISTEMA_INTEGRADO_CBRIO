// Escapa HTML para prevenir XSS
const escapeHtml = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
};

// Sanitiza objeto recursivamente
const sanitizeObj = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObj);
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') clean[k] = escapeHtml(v.trim());
    else if (typeof v === 'object' && v !== null) clean[k] = sanitizeObj(v);
    else clean[k] = v;
  }
  return clean;
};

// Valida UUID v4
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isValidUUID = (id) => UUID_RE.test(id);

// Log de atividade no banco
const logActivity = async (db, userId, action, entityType, entityId, entityName, oldVal, newVal) => {
  try {
    await db.query(
      `INSERT INTO activity_log (user_id, action, entity_type, entity_id, entity_name, old_value, new_value)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [userId, action, entityType, entityId, entityName,
       oldVal ? JSON.stringify(oldVal) : null,
       newVal ? JSON.stringify(newVal) : null]
    );
  } catch (e) { /* silently fail — audit shouldn't break ops */ }
};

module.exports = { escapeHtml, sanitizeObj, isValidUUID, logActivity };
