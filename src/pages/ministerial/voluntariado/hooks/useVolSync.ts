import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { voluntariado } from '@/api';
import type { SyncResult, VolSyncLog } from '../types';

export function useSyncPlanningCenter() {
  const queryClient = useQueryClient();
  return useMutation<SyncResult, Error>({
    mutationFn: () => voluntariado.sync(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vol', 'services'] });
      queryClient.invalidateQueries({ queryKey: ['vol', 'schedules'] });
      queryClient.invalidateQueries({ queryKey: ['vol', 'sync-logs'] });
    },
  });
}

export function useSyncHistorical() {
  const queryClient = useQueryClient();
  return useMutation<SyncResult, Error, { startDate: string; endDate: string }>({
    mutationFn: ({ startDate, endDate }) => voluntariado.syncHistorical(startDate, endDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vol', 'services'] });
      queryClient.invalidateQueries({ queryKey: ['vol', 'schedules'] });
      queryClient.invalidateQueries({ queryKey: ['vol', 'sync-logs'] });
    },
  });
}

export function useLastSync() {
  return useQuery<VolSyncLog | null>({
    queryKey: ['vol', 'sync-logs', 'last'],
    refetchInterval: 60000,
    queryFn: async () => {
      const logs = await voluntariado.syncLogs();
      return logs?.[0] || null;
    },
  });
}
