import { useQuery } from '@tanstack/react-query';
import { voluntariado } from '@/api';
import { subDays, subMonths, startOfWeek, endOfWeek, format } from 'date-fns';
import type { VolSchedule, VolCheckIn, VolService } from '../types';

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
      const [services, allSchedules, allCheckIns] = await Promise.all([
        voluntariado.services.list() as Promise<VolService[]>,
        voluntariado.schedules.list({}) as Promise<VolSchedule[]>,
        voluntariado.checkIns.list({}) as Promise<VolCheckIn[]>,
      ]);

      const range = getPeriodRange(period, customRange);
      const startDate = new Date(range.start);
      const endDate = new Date(range.end);

      const filteredServices = services.filter(s => {
        const d = new Date(s.scheduled_at);
        return d >= startDate && d <= endDate;
      });

      const serviceIds = new Set(filteredServices.map(s => s.id));
      const filteredSchedules = allSchedules.filter(s => serviceIds.has(s.service_id));
      const filteredCheckIns = allCheckIns.filter(c => c.service_id && serviceIds.has(c.service_id));

      return { services: filteredServices, schedules: filteredSchedules, checkIns: filteredCheckIns };
    },
  });
}

// Weekly report
export function useWeeklyReport(period: Period = 'month', teamName?: string) {
  return useQuery({
    queryKey: ['vol', 'weekly-report', period, teamName],
    queryFn: async () => {
      const [services, schedules, checkIns] = await Promise.all([
        voluntariado.services.list() as Promise<VolService[]>,
        voluntariado.schedules.list({}) as Promise<VolSchedule[]>,
        voluntariado.checkIns.list({}) as Promise<VolCheckIn[]>,
      ]);

      const range = getPeriodRange(period);
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
      const [schedules, checkIns, services] = await Promise.all([
        voluntariado.schedules.list({}) as Promise<VolSchedule[]>,
        voluntariado.checkIns.list({}) as Promise<VolCheckIn[]>,
        voluntariado.services.list() as Promise<VolService[]>,
      ]);

      const months = period === '2months' ? 2 : period === '4months' ? 4 : period === '6months' ? 6 : 3;
      const cutoff = subMonths(new Date(), months);
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
      const [schedules, checkIns, services] = await Promise.all([
        voluntariado.schedules.list({}) as Promise<VolSchedule[]>,
        voluntariado.checkIns.list({}) as Promise<VolCheckIn[]>,
        voluntariado.services.list() as Promise<VolService[]>,
      ]);

      const range = getPeriodRange(period);
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

      for (const ci of periodCheckIns) {
        const sch = periodSchedules.find(s => s.id === ci.schedule_id);
        if (!sch) continue;
        const stat = volStats.get(sch.planning_center_person_id);
        if (stat) stat.checkedIn++;
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
