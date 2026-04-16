import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { voluntariado } from '@/api';
import type { VolTeam, VolPosition, VolTeamMember } from '../types';

// ── Teams ──────────────────────────────────────────────────────────────

export function useVolTeamsManaged() {
  return useQuery({
    queryKey: ['vol', 'teams-managed'],
    queryFn: () => voluntariado.teamsManage.list() as Promise<VolTeam[]>,
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<VolTeam>) => voluntariado.teamsManage.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol', 'teams-managed'] }),
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<VolTeam> }) =>
      voluntariado.teamsManage.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol', 'teams-managed'] }),
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => voluntariado.teamsManage.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol', 'teams-managed'] }),
  });
}

export function useImportTeamsFromSchedules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => voluntariado.teamsManage.importFromSchedules(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol', 'teams-managed'] }),
  });
}

export function useSyncTeamMembersFromSchedules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => voluntariado.teamsManage.syncMembersFromSchedules(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vol', 'teams-managed'] });
      qc.invalidateQueries({ queryKey: ['vol', 'volunteers'] });
    },
  });
}

// ── Positions ──────────────────────────────────────────────────────────

export function useVolPositions(teamId?: string) {
  return useQuery({
    queryKey: ['vol', 'positions', teamId],
    queryFn: () => voluntariado.positions.list(teamId ? { team_id: teamId } : undefined) as Promise<VolPosition[]>,
  });
}

export function useCreatePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<VolPosition>) => voluntariado.positions.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vol', 'positions'] });
      qc.invalidateQueries({ queryKey: ['vol', 'teams-managed'] });
    },
  });
}

export function useUpdatePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<VolPosition> }) =>
      voluntariado.positions.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vol', 'positions'] });
      qc.invalidateQueries({ queryKey: ['vol', 'teams-managed'] });
    },
  });
}

export function useDeletePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => voluntariado.positions.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vol', 'positions'] });
      qc.invalidateQueries({ queryKey: ['vol', 'teams-managed'] });
    },
  });
}

// ── Team Members ───────────────────────────────────────────────────────

export function useVolTeamMembers(teamId?: string) {
  return useQuery({
    queryKey: ['vol', 'team-members', teamId],
    queryFn: () => voluntariado.teamMembers.list(teamId ? { team_id: teamId } : undefined) as Promise<VolTeamMember[]>,
  });
}

export function useAddTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<VolTeamMember>) => voluntariado.teamMembers.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vol', 'team-members'] });
      qc.invalidateQueries({ queryKey: ['vol', 'teams-managed'] });
    },
  });
}

export function useUpdateTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<VolTeamMember> }) =>
      voluntariado.teamMembers.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vol', 'team-members'] }),
  });
}

export function useRemoveTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => voluntariado.teamMembers.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vol', 'team-members'] });
      qc.invalidateQueries({ queryKey: ['vol', 'teams-managed'] });
    },
  });
}
