// ============================================================================
// useKpis - hook para carregar e mutar KPIs (kpi_indicadores_taticos)
//
// Substitui o array hardcoded em src/data/indicadores.js. O banco e a fonte
// de verdade. Cada chamada retorna a lista, helpers e mutators (create/update
// /delete) que invalidam o cache automaticamente.
//
// Uso:
//   const { kpis, byId, byArea, byValor, isLoading, refetch,
//           create, update, remove } = useKpis();
// ============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { kpis as kpisApi } from '../api';

// DB usa areas em lowercase ('ami','cba','kids',...) mas o frontend e o
// AREAS const usam mixed case ('AMI','CBA','CBKids',...). Mapeia.
const AREA_DB_TO_FRONTEND = {
  ami: 'AMI', cba: 'CBA', kids: 'CBKids', cuidados: 'Cuidados',
  grupos: 'Grupos', integracao: 'Integracao', voluntariado: 'Voluntariado',
  next: 'NEXT', generosidade: 'Generosidade',
  jornada: 'Jornada', igreja: 'Igreja',
};

function normalizeArea(area) {
  if (!area) return area;
  const lower = String(area).toLowerCase();
  return AREA_DB_TO_FRONTEND[lower] || area;
}

// Mapeia o formato vindo do banco (vw_kpi_taticos_status) para o formato
// "amigavel" que os componentes esperam (compatible com indicadores.js antigo).
function fromDb(row) {
  return {
    id: row.id,
    area: normalizeArea(row.area),             // 'ami' -> 'AMI', etc.
    area_db: row.area,                         // valor original (lowercase)
    nome: row.indicador,                       // alias para retrocompat
    indicador: row.indicador,
    descricao: row.descricao || '',
    periodicidade: row.periodicidade,          // 'semanal' | 'mensal' | ...
    periodo_offset_meses: row.periodo_offset_meses ?? 0,
    unidade: row.unidade,
    pilar: row.pilar,
    meta_descricao: row.meta_descricao,
    meta_2026: row.meta_descricao,             // alias para retrocompat
    meta_valor: row.meta_valor,
    apuracao: row.apuracao,
    responsavel_area: row.responsavel_area,
    sort_order: row.sort_order ?? 0,
    fonte_auto: row.fonte_auto,
    is_auto: !!row.fonte_auto,
    is_okr: !!row.is_okr,
    valores: row.valores || [],
    ativo: row.ativo !== false,
    kpi_estrategico_id: row.kpi_estrategico_id,
    lider_funcionario_id: row.lider_funcionario_id || null,
    lider_nome: row.lider_nome || null,
    lider_cargo: row.lider_cargo || null,
  };
}

let _cache = null;
let _cachePromise = null;
const _subscribers = new Set();

function notifySubscribers() {
  _subscribers.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
}

async function fetchAll(force = false) {
  if (_cache && !force) return _cache;
  if (_cachePromise && !force) return _cachePromise;
  _cachePromise = (async () => {
    const rows = await kpisApi.v2.taticos();
    _cache = (rows || []).map(fromDb).sort((a, b) =>
      a.area.localeCompare(b.area) || (a.sort_order - b.sort_order)
    );
    _cachePromise = null;
    notifySubscribers();
    return _cache;
  })();
  return _cachePromise;
}

export function invalidateKpisCache() {
  _cache = null;
  _cachePromise = null;
  notifySubscribers();
}

export function useKpis() {
  const [kpis, setKpis] = useState(_cache || []);
  const [isLoading, setIsLoading] = useState(!_cache);
  const [error, setError] = useState(null);

  const load = useCallback(async (force = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAll(force);
      setKpis(data);
    } catch (e) {
      setError(e);
      console.error('useKpis load:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // subscriber pattern: atualiza quando cache invalida
  useEffect(() => {
    const tick = () => setKpis(_cache || []);
    _subscribers.add(tick);
    if (!_cache) load(false);
    return () => _subscribers.delete(tick);
  }, [load]);

  const byId = useMemo(() => {
    const m = {};
    kpis.forEach(k => { m[k.id] = k; });
    return m;
  }, [kpis]);

  const byArea = useMemo(() => {
    const m = {};
    kpis.forEach(k => {
      if (!m[k.area]) m[k.area] = [];
      m[k.area].push(k);
    });
    return m;
  }, [kpis]);

  const byValor = useMemo(() => {
    const m = { seguir: [], conectar: [], investir: [], servir: [], generosidade: [] };
    kpis.forEach(k => (k.valores || []).forEach(v => {
      if (m[v]) m[v].push(k);
    }));
    return m;
  }, [kpis]);

  const create = useCallback(async (payload) => {
    const created = await kpisApi.v2.taticoCreate(payload);
    invalidateKpisCache();
    await fetchAll(true);
    return created;
  }, []);

  const update = useCallback(async (id, patch) => {
    const updated = await kpisApi.v2.taticoUpdate(id, patch);
    invalidateKpisCache();
    await fetchAll(true);
    return updated;
  }, []);

  const remove = useCallback(async (id, hard = false) => {
    await kpisApi.v2.taticoDelete(id, hard);
    invalidateKpisCache();
    await fetchAll(true);
  }, []);

  return { kpis, byId, byArea, byValor, isLoading, error, refetch: () => load(true), create, update, remove };
}
