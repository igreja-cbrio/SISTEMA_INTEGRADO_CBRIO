import { useQuery } from '@tanstack/react-query';
import { voluntariado } from '@/api';

export function useVolCheckInHistory(volunteerId: string | undefined, period = '30days') {
  return useQuery({
    queryKey: ['vol', 'check-in-history', volunteerId, period],
    enabled: !!volunteerId,
    queryFn: () => voluntariado.checkIns.list({ volunteer_id: volunteerId! }),
  });
}

export function useServiceCheckIns(serviceId: string | undefined) {
  return useQuery({
    queryKey: ['vol', 'service-check-ins', serviceId],
    enabled: !!serviceId,
    queryFn: () => voluntariado.checkIns.list({ service_id: serviceId! }),
  });
}
