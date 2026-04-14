import { useMutation } from '@tanstack/react-query';
import { voluntariado } from '@/api';

interface PCPerson {
  id: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  avatar_url: string | null;
}

export function useSearchPlanningCenter() {
  return useMutation<{ people: PCPerson[] }, Error, string>({
    mutationFn: (query) => voluntariado.pc.searchPeople(query),
  });
}

export function usePlanningCenterPerson() {
  return useMutation<{ person: PCPerson }, Error, string>({
    mutationFn: (personId) => voluntariado.pc.getPerson(personId),
  });
}
