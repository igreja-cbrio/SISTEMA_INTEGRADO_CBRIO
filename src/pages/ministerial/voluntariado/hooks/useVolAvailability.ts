import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { voluntariado } from '@/api';
import type { VolAvailability } from '../types';

export function useVolAvailability(params?: { volunteer_profile_id?: string; from?: string; to?: string }) {
  return useQuery({
    queryKey: ['vol', 'availability', params],
    queryFn: () => voluntariado.availability.list(params) as Promise<VolAvailability[]>,
  });
}

export function useCreateAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      volunteer_profile_id?: string;
      planning_center_person_id?: string;
      unavailable_from: string;
      unavailable_to: string;
      reason?: string;
    }) => voluntariado.availability.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol', 'availability'] }),
  });
}

export function useDeleteAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => voluntariado.availability.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol', 'availability'] }),
  });
}

// Retorna todos os cultos do ano com flag is_unavailable para o voluntario logado
export function useMyServices(year: number) {
  return useQuery({
    queryKey: ['vol', 'my-services', year],
    queryFn: () => voluntariado.me.services(year) as Promise<{
      id: string; name: string; service_type_name: string;
      service_type_id: string | null; scheduled_at: string;
      is_unavailable: boolean; availability_id: string | null;
    }[]>,
  });
}

// Toggle indisponibilidade para um culto especifico (marca/desmarca)
export function useToggleServiceUnavailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ serviceId, isUnavailable, availabilityId }: {
      serviceId: string; isUnavailable: boolean; availabilityId: string | null;
    }) => {
      if (isUnavailable && availabilityId) {
        return voluntariado.me.removeAvailability(availabilityId);
      }
      return voluntariado.me.addAvailability({ service_id: serviceId });
    },
    onSuccess: (_data, vars) => {
      // Optimistic invalidation — recarrega my-services de todos os anos em cache
      qc.invalidateQueries({ queryKey: ['vol', 'my-services'] });
    },
  });
}
