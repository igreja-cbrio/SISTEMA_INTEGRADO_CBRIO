import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { voluntariado } from '@/api';
import type { VolSchedule, VolCheckIn, QrCodeResult } from '../types';
import { saveMySchedules, getMySchedules } from '../services/offlineStorage';

export function useServiceSchedules(serviceId: string | undefined) {
  return useQuery<VolSchedule[]>({
    queryKey: ['vol', 'schedules', serviceId],
    enabled: !!serviceId,
    queryFn: () => voluntariado.schedules.list({ service_id: serviceId! }),
  });
}

// Escalas de um BLOCO (vários cultos do mesmo período, ex.: manhã = 08:30/10:00/
// 11:30). Junta as escalas dos serviços e DEDUPLICA por pessoa, preservando o
// check-in (se a pessoa marcou presença em qualquer culto do bloco, aparece como
// "Presente"). Assim o operador vê cada voluntário UMA vez.
export function useBlockSchedules(serviceIds: string[]) {
  const key = [...serviceIds].sort().join(',');
  return useQuery<VolSchedule[]>({
    queryKey: ['vol', 'schedules', 'block', key],
    enabled: serviceIds.length > 0,
    queryFn: async () => {
      const lists = await Promise.all(serviceIds.map(id => voluntariado.schedules.list({ service_id: id })));
      const all = lists.flat() as VolSchedule[];
      const norm = (s?: string | null) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
      const byPerson = new Map<string, VolSchedule>();
      for (const s of all) {
        const k = s.planning_center_person_id || s.volunteer_id || norm(s.volunteer_name) || s.id;
        const ex = byPerson.get(k) as any;
        if (!ex) byPerson.set(k, { ...s });
        else if (!ex.check_in && (s as any).check_in) ex.check_in = (s as any).check_in;
      }
      return [...byPerson.values()];
    },
  });
}

export function useMySchedules(volunteerId: string | undefined) {
  return useQuery<VolSchedule[]>({
    queryKey: ['vol', 'schedules', 'my', volunteerId],
    enabled: !!volunteerId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 60,
    placeholderData: () => {
      const cached = getMySchedules();
      return cached.length > 0 ? cached : undefined;
    },
    queryFn: async () => {
      const data = await voluntariado.schedules.list({ volunteer_id: volunteerId! });
      saveMySchedules(data);
      return data;
    },
  });
}

interface CheckInParams {
  schedule_id?: string;
  volunteer_id?: string;
  service_id?: string;
  method: 'qr_code' | 'manual' | 'facial' | 'self_service';
  is_unscheduled?: boolean;
  // Nome digitado no fluxo "check-in sem escala" — vira snapshot no banco
  volunteer_name?: string;
}

export function useCheckIn() {
  const queryClient = useQueryClient();
  return useMutation<VolCheckIn, Error, CheckInParams>({
    mutationFn: (params) => voluntariado.checkIns.create(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vol', 'schedules'] });
      queryClient.invalidateQueries({ queryKey: ['vol', 'check-ins'] });
    },
  });
}

export function useScheduleByQrCode() {
  return useMutation<QrCodeResult, Error, string>({
    mutationFn: (qrCode) => voluntariado.qrLookup(qrCode),
  });
}

export function useUnscheduledCheckIns(serviceId: string | undefined) {
  return useQuery({
    queryKey: ['vol', 'check-ins', 'unscheduled', serviceId],
    enabled: !!serviceId,
    queryFn: () => voluntariado.checkIns.list({ service_id: serviceId!, is_unscheduled: 'true' }),
  });
}
