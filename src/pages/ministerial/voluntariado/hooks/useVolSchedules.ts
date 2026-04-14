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
