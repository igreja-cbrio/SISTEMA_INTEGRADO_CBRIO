// Check-in offline do totem de voluntariado.
//
// Objetivo: o totem continua registrando check-ins mesmo quando a internet
// cai ou o sinal fica ruim. Tudo que é feito offline entra numa FILA local
// (localStorage) e é sincronizado com o servidor assim que a rede volta.
//
// Idempotência: o backend tem UNIQUE indexes em vol_check_ins
//   - (schedule_id) quando is_unscheduled = false
//   - (volunteer_id, service_id) quando is_unscheduled = true
// Logo, reenviar um item já gravado devolve 409 — que tratamos como SUCESSO
// na sincronização (não duplica). Por isso não precisamos de migration.
//
// Escopo offline: Manual + QR (QR resolvido pelo vol_profiles.qr_code que já
// vem no cache de perfis). Facial continua exigindo internet (o match roda no
// servidor) e o QR de cartão de membro unificado não resolve offline.

import { voluntariado } from '@/api';
import { ehFalhaDeRedeOuServidor, ehDuplicado } from '@/lib/falhaDeRede';
import type { VolSchedule } from '../types';

// ── Tipos ───────────────────────────────────────────────────────────────────

export type CheckinMethod = 'qr_code' | 'manual' | 'facial' | 'self_service';

export interface CheckinPayload {
  schedule_id?: string | null;
  volunteer_id?: string | null;
  service_id: string;
  method: CheckinMethod;
  is_unscheduled?: boolean;
  // Voluntário cadastrado na hora pelo totem (não estava no sistema) · o backend
  // sinaliza pra coordenação revisar o cadastro.
  novo_cadastro?: boolean;
}

export interface CheckinDisplay {
  name: string;
  team?: string | null;
  position?: string | null;
  unscheduled?: boolean;
}

export interface PendingCheckin extends CheckinPayload {
  client_id: string;
  checked_in_at: string; // ISO · hora real em que o check-in foi feito (offline)
  display: CheckinDisplay;
}

export interface QrResolution {
  payload: CheckinPayload;
  display: CheckinDisplay;
}

const KEYS = {
  SERVICES: 'vol_totem_services',
  PROFILES: 'vol_totem_profiles',
  SCHED: (serviceId: string) => `vol_totem_sched_${serviceId}`,
  QUEUE: 'vol_totem_checkin_queue',
};

// ── Helpers de localStorage ───────────────────────────────────────────────────

function readJSON<T>(key: string, fallback: T): T {
  try {
    const d = localStorage.getItem(key);
    return d ? (JSON.parse(d) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage cheio/indisponível — não quebra o check-in
  }
}

function uuid(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {}
  return 'cid-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// ── Cache de dados (pra check-in offline) ─────────────────────────────────────

export function saveTodayServices(services: any[]): void {
  writeJSON(KEYS.SERVICES, services || []);
}
export function getTodayServices(): any[] {
  return readJSON<any[]>(KEYS.SERVICES, []);
}

export function saveProfiles(profiles: any[]): void {
  writeJSON(KEYS.PROFILES, profiles || []);
}
export function getProfiles(): any[] {
  return readJSON<any[]>(KEYS.PROFILES, []);
}

export function saveServiceSchedules(serviceId: string, schedules: VolSchedule[]): void {
  if (!serviceId) return;
  writeJSON(KEYS.SCHED(serviceId), schedules || []);
}
export function getServiceSchedules(serviceId: string): VolSchedule[] {
  if (!serviceId) return [];
  return readJSON<VolSchedule[]>(KEYS.SCHED(serviceId), []);
}

// ── Fila de check-ins pendentes ──────────────────────────────────────────────

export function getQueue(): PendingCheckin[] {
  return readJSON<PendingCheckin[]>(KEYS.QUEUE, []);
}

export function getQueueCount(): number {
  return getQueue().length;
}

export function enqueueCheckin(payload: CheckinPayload, display: CheckinDisplay): PendingCheckin {
  const item: PendingCheckin = {
    ...payload,
    client_id: uuid(),
    checked_in_at: new Date().toISOString(),
    display,
  };
  const queue = getQueue();
  queue.push(item);
  writeJSON(KEYS.QUEUE, queue);
  return item;
}

function removeFromQueue(clientId: string): void {
  const queue = getQueue().filter((i) => i.client_id !== clientId);
  writeJSON(KEYS.QUEUE, queue);
}

// Chave canônica de um check-in pra detectar duplicata local (mesma régua dos
// UNIQUE indexes do banco). Sem schedule_id nem volunteer_id não dá pra deduzir.
export function checkinKey(p: { schedule_id?: string | null; volunteer_id?: string | null; service_id?: string | null }): string | null {
  if (p.schedule_id) return `sch:${p.schedule_id}`;
  if (p.volunteer_id && p.service_id) return `uns:${p.volunteer_id}:${p.service_id}`;
  return null;
}

// Conjunto de check-ins já feitos (servidor cacheado + fila local) pra marcar a
// lista manual como "Presente" e barrar re-scan offline.
export function buildLocalDoneSet(serviceId: string): Set<string> {
  const set = new Set<string>();
  // Escalas já com check-in no cache do servidor
  for (const s of getServiceSchedules(serviceId)) {
    if ((s as any).check_in && s.id) set.add(`sch:${s.id}`);
  }
  // Itens na fila local
  for (const q of getQueue()) {
    const k = checkinKey(q);
    if (k) set.add(k);
  }
  return set;
}

// ── Resolução de QR offline (vol_profiles.qr_code) ────────────────────────────

export function resolveQrOffline(qrCode: string, serviceId: string): QrResolution | null {
  if (!qrCode || !serviceId) return null;
  const profiles = getProfiles();
  const profile = profiles.find((p) => p && p.qr_code && p.qr_code === qrCode);
  if (!profile) return null; // QR legado / cartão de membro não resolve offline

  const schedules = getServiceSchedules(serviceId);
  const sched = schedules.find(
    (s) => s.volunteer_id && s.volunteer_id === profile.id && !(s as any).check_in
  );

  if (sched) {
    return {
      payload: {
        schedule_id: sched.id,
        volunteer_id: profile.id,
        service_id: serviceId,
        method: 'qr_code',
      },
      display: { name: sched.volunteer_name || profile.full_name || 'Voluntário', team: sched.team_name, position: sched.position_name },
    };
  }
  return {
    payload: { volunteer_id: profile.id, service_id: serviceId, method: 'qr_code', is_unscheduled: true },
    display: { name: profile.full_name || 'Voluntário', unscheduled: true },
  };
}

// ── Detecção de erro de rede ──────────────────────────────────────────────────

// fetch lança TypeError quando não há rede; o api.js também lança um Error
// específico quando o backend devolve HTML (proxy/offline).
/**
 * ⚠️⚠️ DELEGA para a régua ÚNICA (`src/lib/falhaDeRede`) desde 02/09/2026.
 * A versão anterior fazia `if (err.status) return false`, e por isso o BANCO
 * FORA (que responde 5xx COM status) não ligava esta fila — ela cobria só WiFi
 * caído. Na queda de 1h34 daquele dia a fila existia e ficou desligada.
 */
export function isNetworkError(err: any): boolean {
  return ehFalhaDeRedeOuServidor(err);
}

/** ⚠️ Delega para a régua única (ver `isNetworkError` acima). */
export function isDuplicateError(err: any): boolean {
  return ehDuplicado(err);
}

// ── Sincronização da fila ─────────────────────────────────────────────────────

let flushing = false;

export interface SyncResult {
  attempted: number;
  synced: number;
  remaining: number;
}

// Envia cada item da fila. Sucesso (2xx) e 409 (já existe) removem o item.
// Erro de rede para o flush (mantém pra próxima tentativa). Outros erros de
// servidor mantêm o item (não perde check-in) e param o flush.
export async function syncQueue(): Promise<SyncResult> {
  if (flushing) return { attempted: 0, synced: 0, remaining: getQueueCount() };
  flushing = true;
  let synced = 0;
  let attempted = 0;
  try {
    const queue = getQueue();
    for (const item of queue) {
      attempted++;
      try {
        await voluntariado.checkIns.create({
          schedule_id: item.schedule_id || undefined,
          volunteer_id: item.volunteer_id || undefined,
          service_id: item.service_id,
          method: item.method,
          is_unscheduled: item.is_unscheduled,
          checked_in_at: item.checked_in_at,
        } as any);
        removeFromQueue(item.client_id);
        synced++;
      } catch (err: any) {
        if (isDuplicateError(err)) {
          // Já estava gravado no servidor — idempotente, considera sincronizado.
          removeFromQueue(item.client_id);
          synced++;
          continue;
        }
        if (isNetworkError(err)) {
          // Rede caiu de novo — para e tenta depois (item permanece na fila).
          break;
        }
        // Erro de servidor (401/403/5xx/etc): mantém o item e para o flush.
        // Não perde o check-in; tenta de novo na próxima rodada.
        break;
      }
    }
  } finally {
    flushing = false;
  }
  return { attempted, synced, remaining: getQueueCount() };
}
