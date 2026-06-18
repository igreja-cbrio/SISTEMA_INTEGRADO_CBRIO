// Casamento robusto entre check-in e escala (vol_check_ins × vol_schedules).
//
// Por que isto existe: escalas vindas do Planning Center muitas vezes têm
// `volunteer_id` NULO (só `planning_center_person_id` + nome), e check-ins do
// totem nem sempre gravam `schedule_id`. Casar só por id/volunteer_id deixava
// voluntários que TINHAM escala e fizeram check-in aparecendo como "sem escala"
// no relatório. Aqui a ponte que faltava é
// `vol_profiles.planning_center_id` ↔ `vol_schedules.planning_center_person_id`
// (+ fallback por nome normalizado). Tolerante também à duplicação de serviço
// na mesma data (compara por data, não só por service_id).
import type { VolCheckIn, VolSchedule } from './types';

export const normName = (s?: string | null) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// Data (yyyy-mm-dd) no fuso de São Paulo — pra casar cultos da mesma data
// mesmo que o service_id tenha duplicado no sync.
export const dateOfSP = (iso?: string | null): string | null => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return iso.slice(0, 10);
  }
};

// É a mesma pessoa entre um check-in e uma escala?
export function ciMatchesSched(ci: VolCheckIn, sch: VolSchedule): boolean {
  if (ci.schedule_id && sch.id && ci.schedule_id === sch.id) return true;
  if (ci.volunteer_id && sch.volunteer_id && ci.volunteer_id === sch.volunteer_id) return true;
  const pc = ci.volunteer?.planning_center_id;
  if (pc && sch.planning_center_person_id && pc === sch.planning_center_person_id) return true;
  const n = normName(ci.volunteer?.full_name);
  const sn = normName(sch.volunteer_name);
  if (n && sn && n === sn) return true;
  return false;
}
