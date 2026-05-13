// ============================================================================
// painelCache · cache em memoria + invalidacao compartilhada
//
// Centraliza o cache do painel pra outros modulos (estrategia, dadosBrutos,
// solicitacoes) poderem invalidar quando mutarem dados que afetam matrizes/
// mandalas.
//
// Importante: por ser cache de processo Node serverless, cada instancia tem
// o seu. Em volume alto multiplas instances · TTL curto cobre essa
// inconsistencia transiente.
// ============================================================================

const _cache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 60s · era 5min · curto pra refletir edicoes rapido

function get(key) {
  const e = _cache.get(key);
  if (!e) return null;
  if (Date.now() - e.t > CACHE_TTL_MS) { _cache.delete(key); return null; }
  return e.v;
}

function set(key, v) {
  _cache.set(key, { v, t: Date.now() });
}

function bust(prefix = '') {
  if (!prefix) {
    const n = _cache.size;
    _cache.clear();
    return n;
  }
  let n = 0;
  for (const k of _cache.keys()) {
    if (k.startsWith(prefix)) { _cache.delete(k); n++; }
  }
  return n;
}

function size() { return _cache.size; }

module.exports = { get, set, bust, size, CACHE_TTL_MS };
