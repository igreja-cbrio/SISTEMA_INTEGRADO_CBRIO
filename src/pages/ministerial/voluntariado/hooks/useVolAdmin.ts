import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { voluntariado } from '@/api';
import type { VolProfile, VolUserRole } from '../types';

// All vol_profiles with their team memberships. 5-min stale cache.
export function useVolunteersPool() {
  return useQuery({
    queryKey: ['vol', 'volunteers-pool'],
    queryFn: () => voluntariado.volunteersPool(),
    staleTime: 5 * 60 * 1000,
  });
}

// Volunteers waiting for team allocation (quero-servir queue)
export function useWaitingAllocation() {
  return useQuery({
    queryKey: ['vol', 'waiting-allocation'],
    queryFn: () => voluntariado.waitingAllocation(),
  });
}

// Mutate: allocate volunteer to a team
export function useAllocateVolunteer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, team_id, position_id }: { id: string; team_id: string; position_id?: string }) =>
      voluntariado.allocate(id, { team_id, position_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vol', 'waiting-allocation'] });
      queryClient.invalidateQueries({ queryKey: ['vol', 'volunteers-pool'] });
    },
  });
}

// Mutate: member opts in to serve (quero-servir)
export function useQueroServir() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (membroId: string) => voluntariado.queroServir(membroId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vol', 'waiting-allocation'] });
      queryClient.invalidateQueries({ queryKey: ['vol', 'volunteers-pool'] });
    },
  });
}

interface UserWithRoles {
  profile: VolProfile;
  roles: VolUserRole[];
}

export function useAllVolUsers() {
  return useQuery<UserWithRoles[]>({
    queryKey: ['vol', 'admin', 'users'],
    queryFn: async () => {
      const [profiles, roles] = await Promise.all([
        voluntariado.profiles.list(),
        voluntariado.roles.list(),
      ]);
      return (profiles || []).map((profile: VolProfile) => ({
        profile,
        roles: (roles || []).filter((r: VolUserRole) => r.profile_id === profile.id),
      }));
    },
  });
}

export function useAddVolRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, role }: { profileId: string; role: 'volunteer' | 'leader' | 'admin' }) =>
      voluntariado.roles.add(profileId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vol', 'admin', 'users'] }),
  });
}

export function useRemoveVolRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, role }: { profileId: string; role: 'volunteer' | 'leader' | 'admin' }) =>
      voluntariado.roles.remove(profileId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vol', 'admin', 'users'] }),
  });
}
