import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { voluntariado } from '@/api';
import type { VolServiceType } from '../types';

export function useVolServiceTypes() {
  return useQuery({
    queryKey: ['vol', 'service-types'],
    queryFn: () => voluntariado.serviceTypes.list() as Promise<VolServiceType[]>,
  });
}

export function useCreateServiceType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<VolServiceType>) => voluntariado.serviceTypes.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol', 'service-types'] }),
  });
}

export function useUpdateServiceType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<VolServiceType> }) =>
      voluntariado.serviceTypes.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol', 'service-types'] }),
  });
}

export function useDeleteServiceType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => voluntariado.serviceTypes.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol', 'service-types'] }),
  });
}

export function useGenerateServices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, weeks, year }: { id: string; weeks?: number; year?: number }) =>
      voluntariado.serviceTypes.generate(id, weeks, year),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vol', 'services'] });
      qc.invalidateQueries({ queryKey: ['vol', 'service-types'] });
      qc.invalidateQueries({ queryKey: ['vol', 'my-services'] });
    },
  });
}
