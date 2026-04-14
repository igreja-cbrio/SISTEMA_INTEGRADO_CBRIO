import type { VolProfile, VolUserRole, VolSchedule } from '../types';

const KEYS = {
  PROFILE: 'vol_offline_profile',
  ROLES: 'vol_offline_roles',
  MY_SCHEDULES: 'vol_offline_my_schedules',
  LAST_SYNC: 'vol_offline_last_sync',
};

export function saveProfile(profile: VolProfile): void {
  try { localStorage.setItem(KEYS.PROFILE, JSON.stringify(profile)); setLastSyncTime(); } catch {}
}

export function getProfile(): VolProfile | null {
  try { const d = localStorage.getItem(KEYS.PROFILE); return d ? JSON.parse(d) : null; } catch { return null; }
}

export function saveRoles(roles: VolUserRole[]): void {
  try { localStorage.setItem(KEYS.ROLES, JSON.stringify(roles)); } catch {}
}

export function getRoles(): VolUserRole[] {
  try { const d = localStorage.getItem(KEYS.ROLES); return d ? JSON.parse(d) : []; } catch { return []; }
}

export function saveMySchedules(schedules: VolSchedule[]): void {
  try { localStorage.setItem(KEYS.MY_SCHEDULES, JSON.stringify(schedules)); setLastSyncTime(); } catch {}
}

export function getMySchedules(): VolSchedule[] {
  try { const d = localStorage.getItem(KEYS.MY_SCHEDULES); return d ? JSON.parse(d) : []; } catch { return []; }
}

export function setLastSyncTime(): void {
  localStorage.setItem(KEYS.LAST_SYNC, new Date().toISOString());
}

export function getLastSyncTime(): Date | null {
  try { const d = localStorage.getItem(KEYS.LAST_SYNC); return d ? new Date(d) : null; } catch { return null; }
}

export function clearOfflineData(): void {
  Object.values(KEYS).forEach(key => localStorage.removeItem(key));
}
