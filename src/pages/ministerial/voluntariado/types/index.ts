export interface VolProfile {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string | null;
  planning_center_id: string | null;
  qr_code: string | null;
  avatar_url: string | null;
  face_descriptor: number[] | null;
  created_at: string;
  updated_at: string;
}

export interface VolUserRole {
  id: string;
  profile_id: string;
  role: 'volunteer' | 'leader' | 'admin';
  created_at: string;
}

export interface VolService {
  id: string;
  planning_center_id: string | null;
  name: string;
  service_type_name: string | null;
  service_type_id: string | null;
  scheduled_at: string;
  scheduled_count?: number;
  created_at: string;
  updated_at: string;
}

export interface VolSchedule {
  id: string;
  service_id: string;
  volunteer_id: string | null;
  planning_center_person_id: string | null;
  volunteer_name: string;
  team_id: string | null;
  team_name: string | null;
  position_id: string | null;
  position_name: string | null;
  confirmation_status: 'confirmed' | 'pending' | 'declined' | 'scheduled' | null;
  source: 'planning_center' | 'manual' | 'auto_rotation';
  notes: string | null;
  created_at: string;
  service?: VolService;
  check_in?: VolCheckIn | null;
}

export interface VolCheckIn {
  id: string;
  schedule_id: string | null;
  volunteer_id: string | null;
  service_id: string | null;
  checked_in_by: string | null;
  checked_in_at: string;
  method: 'qr_code' | 'manual' | 'facial' | 'self_service';
  is_unscheduled: boolean;
  // Coluna real de `vol_check_ins`: o nome gravado no PRÓPRIO check-in. É o
  // fallback do check-in avulso, quando não há escala nem voluntário vinculado
  // (VolCheckin.tsx manda `volunteer_name` no check-in manual). Sem declarar,
  // VolRelatorios acessava um campo que o tipo dizia não existir.
  volunteer_name?: string | null;
  volunteer?: { id: string; full_name: string; planning_center_id?: string | null } | null;
  schedule?: { id: string; volunteer_name: string; volunteer_id: string | null; team_name?: string | null; position_name?: string | null } | null;
  service?: { id: string; name: string; scheduled_at: string } | null;
}

export interface VolVolunteerQrCode {
  id: string;
  planning_center_person_id: string;
  volunteer_name: string;
  qr_code: string;
  avatar_url: string | null;
  face_descriptor: number[] | null;
  created_at: string;
  updated_at: string;
}

export interface VolSyncLog {
  id: string;
  sync_type: string;
  services_synced: number;
  schedules_synced: number;
  qrcodes_generated: number;
  status: string;
  error_message: string | null;
  triggered_by: string | null;
  created_at: string;
}

export interface VolTrainingCheckin {
  id: string;
  service_id: string | null;
  volunteer_name: string;
  team_name: string;
  phone: string | null;
  registered_by: string | null;
  created_at: string;
}

export interface QrCodeResult {
  schedule?: VolSchedule;
  profile: {
    id: string | null;
    planning_center_id: string | null;
    full_name?: string;
    type: 'profile' | 'volunteer_qrcode';
  };
  isUnscheduled: boolean;
  volunteerName: string;
}

export interface SyncResult {
  success: boolean;
  services: number;
  newSchedules: number;
  qrCodesGenerated?: number;
  avatarsImported?: number;
  totalMembersFound?: number;
  totalMembersProcessed?: number;
  error?: string;
}

// ── Schedule Management Types ──────────────────────────────────────

export interface VolServiceType {
  id: string;
  name: string;
  description: string | null;
  recurrence_day: number | null;
  recurrence_time: string | null;
  is_active: boolean;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface VolTeam {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  area: string | null;
  leader_profile_id: string | null;
  is_active: boolean;
  sort_order: number;
  /**
   * Este time usa PESSOAS DIFERENTES em cada horário do bloco (03/09/2026).
   * true ⇒ o template materializa um alvo por celebração e a escala é por
   * culto; false (default) ⇒ o time serve o bloco todo com a mesma gente.
   * É o Split Team do Planning Center.
   */
  split_por_horario?: boolean;
  created_at: string;
  updated_at: string;
  leader?: { id: string; full_name: string; avatar_url: string | null } | null;
  positions?: VolPosition[];
  members?: { id: string }[];
}

export interface VolPosition {
  id: string;
  team_id: string;
  name: string;
  description: string | null;
  min_volunteers: number;
  max_volunteers: number | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  team?: { id: string; name: string } | null;
}

export interface VolTeamMember {
  id: string;
  team_id: string;
  position_id: string | null;
  volunteer_profile_id: string | null;
  planning_center_person_id: string | null;
  volunteer_name: string;
  is_active: boolean;
  /**
   * Tipos de culto em que este vínculo aceita ser escalado (04/09/2026).
   * NULL/ausente = todos — é o estado de quem nunca configurou, e é o que a
   * régua `utils/elegibilidadeVol` trata como "sem restrição". Array vazio
   * também vale como todos, pra desmarcar tudo não apagar a pessoa da escala.
   */
  service_type_ids?: string[] | null;
  joined_at: string;
  created_at: string;
  team?: { id: string; name: string; color: string | null } | null;
  position?: { id: string; name: string } | null;
  profile?: { id: string; full_name: string; avatar_url: string | null; planning_center_id: string | null } | null;
}

export interface VolAvailability {
  id: string;
  volunteer_profile_id: string | null;
  planning_center_person_id: string | null;
  unavailable_from: string;
  unavailable_to: string;
  reason: string | null;
  created_at: string;
}
