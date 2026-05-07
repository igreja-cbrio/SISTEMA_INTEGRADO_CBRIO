import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook de responsabilidades do usuario logado.
 *
 *   const {
 *     kpiAreas,             // array lowercase (areas que lidera)
 *     isAdmin,              // admin ou diretor
 *     ministerioId,         // ministerio que coordena (lidera ou assiste)
 *     ministerioPapel,      // 'lider' | 'assistente' | null
 *     isDiretoriaGeral,     // pertence a diretoria geral nominal
 *     canEditArea(area),    // pode editar KPI da area
 *     canEditDado(area, dadoTipoMinisterio),  // pode editar dado bruto
 *     canValidate(area),    // pode validar dado da area
 *     canEditAny,
 *   } = useMyKpiAreas();
 */
export function useMyKpiAreas() {
  const { profile } = useAuth();

  const kpiAreas = useMemo(() => {
    return (profile?.kpi_areas || []).map(a => String(a).toLowerCase());
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

  // Pode editar dado bruto se admin OU lider de area OU lider/assistente do ministerio do tipo
  const canEditDado = (area, dadoTipoMinisterio) => {
    if (isAdmin) return true;
    if (kpiAreas.includes(String(area || '').toLowerCase())) return true;
    if (ministerioId && ministerioId === dadoTipoMinisterio) return true;
    return false;
  };

  // So lider de area (e admin) valida dado
  const canValidate = (area) => {
    if (isAdmin) return true;
    return kpiAreas.includes(String(area || '').toLowerCase());
  };

  const canEditAny = isAdmin || kpiAreas.length > 0 || !!ministerioId;

  return {
    kpiAreas,
    isAdmin,
    ministerioId,
    ministerioPapel,
    isDiretoriaGeral,
    canEditArea,
    canEditDado,
    canValidate,
    canEditAny,
  };
}
