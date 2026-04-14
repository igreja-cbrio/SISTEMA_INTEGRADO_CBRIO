import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { voluntariado } from '@/api';
import type { VolVolunteerQrCode, VolProfile } from '../types';

interface QrCodesData {
  qrcodes: VolVolunteerQrCode[];
  profiles: VolProfile[];
}

export function useVolunteersQrCodes() {
  return useQuery<QrCodesData>({
    queryKey: ['vol', 'volunteer-qrcodes'],
    queryFn: () => voluntariado.volunteerQrCodes.list(),
  });
}

export function useCreateVolunteerQrCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { planning_center_person_id: string; volunteer_name: string; avatar_url?: string }) =>
      voluntariado.volunteerQrCodes.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vol', 'volunteer-qrcodes'] }),
  });
}
