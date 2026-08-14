import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { voluntariado } from '@/api';

// Contexto de montagem de escala: pool anotado com indisponibilidade do dia do
// culto + quem já serve em outros cultos do mesmo dia (evita sobreposição).
export function useMontagemContexto(serviceId: string | undefined) {
  return useQuery({
    queryKey: ['vol', 'montagem-contexto', serviceId],
    enabled: !!serviceId,
    queryFn: () => voluntariado.schedules.contextoMontagem(serviceId!),
  });
}

export function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      service_id: string;
      volunteer_id?: string;
      volunteer_name: string;
      team_id?: string;
      team_name?: string;
      position_id?: string;
      position_name?: string;
      planning_center_person_id?: string;
      notes?: string;
    }) => voluntariado.schedules.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol', 'schedules'] }),
  });
}

export function useUpdateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      voluntariado.schedules.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol', 'schedules'] }),
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => voluntariado.schedules.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol', 'schedules'] }),
  });
}

export function useBulkSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      service_id: string;
      assignments: Array<{
        volunteer_id?: string;
        volunteer_name: string;
        team_id?: string;
        team_name?: string;
        position_id?: string;
        position_name?: string;
        // Amarra a escala à vaga da composição que a originou.
        escala_culto_item_id?: string;
        planning_center_person_id?: string;
        source?: string;
        notes?: string;
      }>;
    }) => voluntariado.schedules.bulk(data.service_id, data.assignments),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol', 'schedules'] }),
  });
}

export function useCopySchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ from_service_id, to_service_id }: { from_service_id: string; to_service_id: string }) =>
      voluntariado.schedules.copy(from_service_id, to_service_id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol', 'schedules'] }),
  });
}

// Auto-preencher: enche as VAGAS em aberto (composição do culto) por rodízio.
// `team_ids` vazio = todas as áreas. Devolve `schedule_ids` pro Desfazer.
export function useAutoFillSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ service_id, team_ids }: { service_id: string; team_ids?: string[] }) =>
      voluntariado.schedules.autoFill(service_id, team_ids || []),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol'] }),
  });
}

export function useDesfazerLote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ service_id, ids }: { service_id: string; ids: string[] }) =>
      voluntariado.schedules.desfazerLote(service_id, ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol'] }),
  });
}

export function useCreateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; service_type_name?: string; service_type_id?: string; scheduled_at: string }) =>
      voluntariado.services.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol', 'services'] }),
  });
}

export function useUpdateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      voluntariado.services.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol', 'services'] }),
  });
}

export function useDeleteService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => voluntariado.services.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol', 'services'] }),
  });
}
