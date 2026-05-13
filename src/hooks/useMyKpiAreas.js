import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook de responsabilidades do usuario logado.
 *
 *   const {
 *     kpiAreas,             // areas que lidera (kids, ami etc)
 *     kpiValores,           // valores que lidera (seguir, conectar etc)
 *     isAdmin,
 *     ministerioId, ministerioPapel,
 *     isDiretoriaGeral,
 *     canEditArea(area), canEditValor(valor), canSeeKpi(kpi),
 *     canEditDado(area, dadoTipoMinisterio),
 *     canValidate(area),
 *     canEditAny,
 *   } = useMyKpiAreas();
 */
export function useMyKpiAreas() {
  const { profile } = useAuth();

  const kpiAreas = useMemo(() => {
    return (profile?.kpi_areas || []).map(a => String(a).toLowerCase());
  }, [profile]);

  const kpiValores = useMemo(() => {
    return (profile?.kpi_valores || []).map(v => String(v).toLowerCase());
  }, [profile]);

  const isAdmin = ['admin', 'diretor'].includes(profile?.role);
  const ministerioId = profile?.ministerio_id || null;
  const ministerioPapel = profile?.ministerio_papel || null;
  const isDiretoriaGeral = !!profile?.is_diretoria_geral;

  const canEditArea = (area) => {
    if (!area) return false;
    if (isAdmin) return true;
    return kpiAreas.includes(String(area).toLowerCase());
  };

  const canEditValor = (valor) => {
    if (!valor) return false;
    if (isAdmin) return true;
    return kpiValores.includes(String(valor).toLowerCase());
  };

  // Visibilidade de um KPI: admin ve tudo, demais veem se area E/OU valor batem
  const canSeeKpi = (kpi) => {
    if (isAdmin) return true;
    const area = String(kpi?.area_db || kpi?.area || '').toLowerCase();
    if (kpiAreas.includes(area)) return true;
    const valores = (kpi?.valores || []).map(v => String(v).toLowerCase());
    return valores.some(v => kpiValores.includes(v));
  };

  // Pode editar dado bruto se admin OU lider de area OU dono do valor OU lider/assistente do ministerio do tipo
  const canEditDado = (area, dadoTipoMinisterio, valores = []) => {
    if (isAdmin) return true;
    if (kpiAreas.includes(String(area || '').toLowerCase())) return true;
    if (valores.some(v => kpiValores.includes(String(v).toLowerCase()))) return true;
    if (ministerioId && ministerioId === dadoTipoMinisterio) return true;
    return false;
  };

  // So lider de area (e admin) valida dado
  const canValidate = (area) => {
    if (isAdmin) return true;
    return kpiAreas.includes(String(area || '').toLowerCase());
  };

  const canEditAny = isAdmin || kpiAreas.length > 0 || kpiValores.length > 0 || !!ministerioId;

  return {
    kpiAreas,
    kpiValores,
    isAdmin,
    ministerioId,
    ministerioPapel,
    isDiretoriaGeral,
    canEditArea,
    canEditValor,
    canSeeKpi,
    canEditDado,
    canValidate,
    canEditAny,
  };
}
