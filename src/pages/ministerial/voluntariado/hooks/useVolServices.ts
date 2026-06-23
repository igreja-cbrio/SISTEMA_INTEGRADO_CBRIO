import { useQuery } from '@tanstack/react-query';
import { voluntariado } from '@/api';
import type { VolService } from '../types';

export function useVolServices() {
  return useQuery<VolService[]>({
    queryKey: ['vol', 'services'],
    queryFn: () => voluntariado.services.list(),
  });
}

export function useUpcomingServices() {
  return useQuery<VolService[]>({
    queryKey: ['vol', 'services', 'upcoming'],
    queryFn: () => voluntariado.services.upcoming(),
  });
}

export function useTodaysServices() {
  return useQuery<VolService[]>({
    queryKey: ['vol', 'services', 'today'],
    queryFn: () => voluntariado.services.today(),
  });
}

// Serviços numa JANELA em torno de agora (passado recente + próximos) pro
// check-in poder ser feito fora da janela do culto — tanto do culto que vem
// quanto do que já passou. Ordenado por data (mais próximo de hoje no topo).
export function useCheckinServices() {
  return useQuery<VolService[]>({
    queryKey: ['vol', 'services', 'checkin-window'],
    queryFn: async () => {
      // Janela vem do backend (bounded · -3 semanas / +5 semanas), ordenada por
      // proximidade de hoje pra o culto mais relevante ficar no topo.
      const all = (await voluntariado.services.checkinWindow(21, 35)) as VolService[];
      const now = Date.now();
      return [...all].sort((a, b) => Math.abs(new Date(a.scheduled_at).getTime() - now) - Math.abs(new Date(b.scheduled_at).getTime() - now));
    },
    staleTime: 60 * 1000,
  });
}
