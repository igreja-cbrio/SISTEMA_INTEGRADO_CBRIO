import { useQuery } from '@tanstack/react-query';
import { voluntariado } from '@/api';

export function useVolTeams() {
  return useQuery<string[]>({
    queryKey: ['vol', 'teams'],
    queryFn: () => voluntariado.teams(),
  });
}
