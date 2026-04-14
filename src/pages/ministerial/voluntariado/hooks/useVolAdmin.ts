import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { voluntariado } from '@/api';
import type { VolProfile, VolUserRole } from '../types';

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
