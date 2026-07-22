import { useQuery } from '@tanstack/react-query';
import { voluntariado } from '@/api';
import { subDays, subMonths, startOfWeek, endOfWeek, format } from 'date-fns';
import type { VolSchedule, VolCheckIn, VolService } from '../types';
import { normName } from '../volMatch';

type Period = 'week' | 'month' | '3months' | 'custom';

function getPeriodRange(period: Period, customRange?: { start: string; end: string }) {
  const now = new Date();
  if (period === 'custom' && customRange) return { start: customRange.start, end: customRange.end };
  if (period === 'week') return { start: startOfWeek(now).toISOString(), end: endOfWeek(now).toISOString() };
  if (period === 'month') return { start: subDays(now, 30).toISOString(), end: now.toISOString() };
  return { start: subMonths(now, 3).toISOString(), end: now.toISOString() };
}

// Generic report data — fetches services, schedules, check-ins in a period
export function useVolReportData(period: Period = 'month', customRange?: { start: string; end: string }) {
  return useQuery({
    queryKey: ['vol', 'report-data', period, customRange],
    queryFn: async () => {
      // Busca por PERÍODO no servidor (paginação interna) — buscar tudo e
      // filtrar no cliente esbarrava no cap de 1000 do PostgREST e escalas
      // de cultos recentes sumiam do relatório (bug 06/07).
      const range = getPeriodRange(period, customRange);
      const desde = range.start.slice(0, 10);
      const ate = range.end.slice(0, 10);
      const dados = await voluntariado.relatorioDados(desde, ate) as {
        services: VolService[]; schedules: VolSchedule[]; checkIns: VolCheckIn[];
      };
      return { services: dados.services, schedules: dados.schedules, checkIns: dados.checkIns };
    },
  });
}

// Weekly report
export function useWeeklyReport(period: Period = 'month', teamName?: string) {
  return useQuery({
    queryKey: ['vol', 'weekly-report', period, teamName],
    queryFn: async () => {
      // Busca por PERÍODO no servidor (paginação interna) · buscar tudo e filtrar
      // no cliente estourava o cap de 1000 do PostgREST (bug 06/07).
      const range = getPeriodRange(period);
      const { services, schedules, checkIns } = await voluntariado.relatorioDados(
        range.start.slice(0, 10), range.end.slice(0, 10)
      ) as { services: VolService[]; schedules: VolSchedule[]; checkIns: VolCheckIn[] };
      const startDate = new Date(range.start);
      const endDate = new Date(range.end);

      const filteredServices = services.filter(s => {
        const d = new Date(s.scheduled_at);
        return d >= startDate && d <= endDate;
      });

      // Group by week
      const weeks: Record<string, { services: VolService[]; schedules: VolSchedule[]; checkIns: VolCheckIn[] }> = {};
      for (const svc of filteredServices) {
        const weekStart = format(startOfWeek(new Date(svc.scheduled_at)), 'yyyy-MM-dd');
        if (!weeks[weekStart]) weeks[weekStart] = { services: [], schedules: [], checkIns: [] };
        weeks[weekStart].services.push(svc);
      }

      for (const sch of schedules) {
        const svc = filteredServices.find(s => s.id === sch.service_id);
        if (!svc) continue;
        if (teamName && sch.team_name && !sch.team_name.includes(teamName)) continue;
        const weekStart = format(startOfWeek(new Date(svc.scheduled_at)), 'yyyy-MM-dd');
        if (weeks[weekStart]) weeks[weekStart].schedules.push(sch);
      }

      for (const ci of checkIns) {
        const svc = filteredServices.find(s => s.id === ci.service_id);
        if (!svc) continue;
        const weekStart = format(startOfWeek(new Date(svc.scheduled_at)), 'yyyy-MM-dd');
        if (weeks[weekStart]) weeks[weekStart].checkIns.push(ci);
      }

      return weeks;
    },
  });
}

// Inactive volunteers — two modes: 'checkin' (no check-in) and 'schedule' (not scheduled)
export function useInactiveVolunteers(period = '3months', teamName?: string, mode: 'checkin' | 'schedule' = 'checkin') {
  return useQuery({
    queryKey: ['vol', 'inactive', period, teamName, mode],
    queryFn: async () => {
      // Precisa do histórico COMPLETO (não só do período) pra achar a ÚLTIMA
      // atividade de cada voluntário e comparar com o cutoff. Busca tudo via
      // /relatorio-dados (paginação interna · sem o cap de 1000 do PostgREST,
      // que truncava as escalas · vol_schedules tem 4k+ linhas).
      const hoje = new Date().toISOString().slice(0, 10);
      const { services, schedules, checkIns } = await voluntariado.relatorioDados('2000-01-01', hoje) as {
        services: VolService[]; schedules: VolSchedule[]; checkIns: VolCheckIn[];
      };

      const periodMonths: Record<string, number> = { week: 0.25, month: 1, '2months': 2, '3months': 3, '4months': 4, '6months': 6 };
      const months = periodMonths[period] || 3;
      const cutoff = months < 1 ? subDays(new Date(), Math.round(months * 30)) : subMonths(new Date(), months);
      const now = new Date();

      if (mode === 'schedule') {
        // Volunteers who haven't been SCHEDULED in the period
        const volunteerMap = new Map<string, { name: string; team: string | null; lastSchedule: Date | null }>();

        for (const sch of schedules) {
          if (teamName && sch.team_name && !sch.team_name.includes(teamName)) continue;
          const svc = services.find(s => s.id === sch.service_id);
          const schedDate = svc ? new Date(svc.scheduled_at) : new Date(sch.created_at);

          if (!volunteerMap.has(sch.planning_center_person_id)) {
            volunteerMap.set(sch.planning_center_person_id, { name: sch.volunteer_name, team: sch.team_name, lastSchedule: schedDate });
          } else {
            const existing = volunteerMap.get(sch.planning_center_person_id)!;
            if (!existing.lastSchedule || schedDate > existing.lastSchedule) existing.lastSchedule = schedDate;
          }
        }

        return Array.from(volunteerMap.entries())
          .filter(([, v]) => !v.lastSchedule || v.lastSchedule < cutoff)
          .map(([id, v]) => {
            const monthsInactive = v.lastSchedule
              ? Math.max(1, Math.round((now.getTime() - v.lastSchedule.getTime()) / (30 * 24 * 60 * 60 * 1000)))
              : null;
            return { planningCenterId: id, name: v.name, team: v.team, lastDate: v.lastSchedule?.toISOString() || null, monthsInactive };
          })
          .sort((a, b) => (b.monthsInactive || 999) - (a.monthsInactive || 999));
      }

      // mode === 'checkin' — Volunteers who haven't done CHECK-IN in the period
      const volunteerMap = new Map<string, { name: string; team: string | null; lastCheckIn: Date | null }>();
      for (const sch of schedules) {
        if (teamName && sch.team_name && !sch.team_name.includes(teamName)) continue;
        if (!volunteerMap.has(sch.planning_center_person_id)) {
          volunteerMap.set(sch.planning_center_person_id, { name: sch.volunteer_name, team: sch.team_name, lastCheckIn: null });
        }
      }

      for (const ci of checkIns) {
        const sch = schedules.find(s => s.id === ci.schedule_id);
        if (!sch) continue;
        const vol = volunteerMap.get(sch.planning_center_person_id);
        if (vol) {
          const ciDate = new Date(ci.checked_in_at);
          if (!vol.lastCheckIn || ciDate > vol.lastCheckIn) vol.lastCheckIn = ciDate;
        }
      }

      return Array.from(volunteerMap.entries())
        .filter(([, v]) => !v.lastCheckIn || v.lastCheckIn < cutoff)
        .map(([id, v]) => {
          const monthsInactive = v.lastCheckIn
            ? Math.max(1, Math.round((now.getTime() - v.lastCheckIn.getTime()) / (30 * 24 * 60 * 60 * 1000)))
            : null;
          return { planningCenterId: id, name: v.name, team: v.team, lastDate: v.lastCheckIn?.toISOString() || null, monthsInactive };
        })
        .sort((a, b) => (b.monthsInactive || 999) - (a.monthsInactive || 999));
    },
  });
}

// Volunteer thermometer
export function useVolunteerThermometer(period: Period = 'month', teamName?: string) {
  return useQuery({
    queryKey: ['vol', 'thermometer', period, teamName],
    queryFn: async () => {
      // Busca por PERÍODO no servidor (paginação interna) · o fetch antigo
      // (schedules/checkIns .list) estourava o cap de 1000 do PostgREST e o
      // termômetro contava sobre dados truncados — mostrava ~204 escalados
      // quando eram ~615 em 3 meses (bug 22/07).
      const range = getPeriodRange(period);
      const { services, schedules, checkIns } = await voluntariado.relatorioDados(
        range.start.slice(0, 10), range.end.slice(0, 10)
      ) as { services: VolService[]; schedules: VolSchedule[]; checkIns: VolCheckIn[] };
      const startDate = new Date(range.start);
      const endDate = new Date(range.end);

      const serviceIds = new Set(services.filter(s => {
        const d = new Date(s.scheduled_at);
        return d >= startDate && d <= endDate;
      }).map(s => s.id));

      const periodSchedules = schedules.filter(s => serviceIds.has(s.service_id));
      const periodCheckIns = checkIns.filter(c => c.service_id && serviceIds.has(c.service_id));

      // Count schedules & check-ins per volunteer
      const volStats = new Map<string, { name: string; team: string | null; scheduled: number; checkedIn: number }>();
      for (const sch of periodSchedules) {
        if (teamName && sch.team_name && !sch.team_name.includes(teamName)) continue;
        if (!volStats.has(sch.planning_center_person_id)) {
          volStats.set(sch.planning_center_person_id, { name: sch.volunteer_name, team: sch.team_name, scheduled: 0, checkedIn: 0 });
        }
        volStats.get(sch.planning_center_person_id)!.scheduled++;
      }

      // Mapas de fallback: volunteer_id → PCID e nome normalizado → PCID.
      // Necessário porque escalas do Planning Center costumam ter volunteer_id
      // nulo — a ponte real é o planning_center_id do perfil do check-in.
      const volIdToPcId = new Map<string, string>();
      const nameToPcId = new Map<string, string>();
      for (const sch of periodSchedules) {
        if (sch.volunteer_id) volIdToPcId.set(sch.volunteer_id, sch.planning_center_person_id);
        const n = normName(sch.volunteer_name);
        if (n) nameToPcId.set(n, sch.planning_center_person_id);
      }

      for (const ci of periodCheckIns) {
        let matchedPcId: string | null = null;

        // 1. Match by schedule_id
        if (ci.schedule_id) {
          const sch = periodSchedules.find(s => s.id === ci.schedule_id);
          if (sch) matchedPcId = sch.planning_center_person_id;
        }
        // 2. Fallback: volunteer_id ↔ escala.volunteer_id
        if (!matchedPcId && ci.volunteer_id) matchedPcId = volIdToPcId.get(ci.volunteer_id) || null;
        // 3. Ponte que faltava: planning_center_id do perfil do check-in
        if (!matchedPcId && ci.volunteer?.planning_center_id) matchedPcId = ci.volunteer.planning_center_id;
        // 4. Último recurso: nome normalizado
        if (!matchedPcId) matchedPcId = nameToPcId.get(normName(ci.volunteer?.full_name)) || null;

        if (matchedPcId) {
          const stat = volStats.get(matchedPcId);
          if (stat) stat.checkedIn++;
        }
      }

      return Array.from(volStats.entries()).map(([id, stat]) => {
        const rate = stat.scheduled > 0 ? stat.checkedIn / stat.scheduled : 0;
        let level: 'very_active' | 'regular' | 'low' | 'inactive';
        if (rate >= 0.8) level = 'very_active';
        else if (rate >= 0.5) level = 'regular';
        else if (rate > 0) level = 'low';
        else level = 'inactive';
        return { planningCenterId: id, ...stat, rate, level };
      });
    },
  });
}
