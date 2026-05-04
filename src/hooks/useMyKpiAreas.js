import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Hook que expoe o conjunto de KPI areas do usuario logado e helpers.
 *
 *   const { kpiAreas, isAdmin, canEditArea, canEditAny } = useMyKpiAreas();
 *
 * - kpiAreas: array em lowercase (ex: ['voluntariado','grupos'])
 * - isAdmin: true para role 'admin' ou 'diretor' (passa por qualquer area)
 * - canEditArea(area): boolean — true se admin OU area no lowercase ∈ kpiAreas
 * - canEditAny: boolean — true se admin OU kpiAreas.length > 0
 */
export function useMyKpiAreas() {
  const { profile } = useAuth();

  const kpiAreas = useMemo(() => {
    return (profile?.kpi_areas || []).map(a => String(a).toLowerCase());
  }, [profile]);

  const isAdmin = ['admin', 'diretor'].includes(profile?.role);

  const canEditArea = (area) => {
    if (!area) return false;
    if (isAdmin) return true;
    return kpiAreas.includes(String(area).toLowerCase());
  };

  const canEditAny = isAdmin || kpiAreas.length > 0;

  return { kpiAreas, isAdmin, canEditArea, canEditAny };
}
