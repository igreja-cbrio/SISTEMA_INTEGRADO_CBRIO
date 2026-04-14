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
