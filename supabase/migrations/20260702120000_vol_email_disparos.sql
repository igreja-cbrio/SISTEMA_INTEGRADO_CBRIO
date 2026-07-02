-- Disparo de e-mails para voluntários · /ministerial/voluntariado/emails
-- Campanha (vol_email_disparos) + log por destinatário (vol_email_disparo_destinatarios).
-- Envio via Microsoft Graph (backend/services/email.js) · 1 chamada por destinatário.
-- Bucket público vol-emails guarda as imagens do corpo do e-mail (URL pública no HTML).

-- ── Bucket público pras imagens do corpo ────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('vol-emails', 'vol-emails', true)
ON CONFLICT (id) DO NOTHING;

-- ── Campanha ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vol_email_disparos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assunto TEXT NOT NULL DEFAULT '',
  corpo_html TEXT NOT NULL DEFAULT '',
  -- {tipo:'todos'} | {tipo:'equipe', team_id} | {tipo:'escala', service_id}
  segmento JSONB NOT NULL DEFAULT '{"tipo":"todos"}',
  status TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','agendado','enviando','enviado','erro','cancelado')),
  agendado_para TIMESTAMPTZ,
  total_destinatarios INTEGER NOT NULL DEFAULT 0,
  total_enviados INTEGER NOT NULL DEFAULT 0,
  total_erros INTEGER NOT NULL DEFAULT 0,
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_por_nome TEXT,
  enviado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vol_email_disparos_active
  ON public.vol_email_disparos (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vol_email_disparos_pendentes
  ON public.vol_email_disparos (agendado_para)
  WHERE status IN ('agendado','enviando') AND deleted_at IS NULL;

COMMENT ON TABLE public.vol_email_disparos IS
  'Campanhas de e-mail pros voluntários (aviso/treinamento/escala). Envio individual via Graph com {{nome}}; fila drenada inline + cron */5 (limite ~30 msgs/min do Exchange).';

-- ── Log por destinatário (snapshot de PII · e-mail/nome no momento do envio) ─
CREATE TABLE IF NOT EXISTS public.vol_email_disparo_destinatarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- CASCADE intencional: o log não tem sentido sem a campanha (a campanha em si
  -- é soft-deletada; hard delete só super-admin via SQL Editor).
  disparo_id UUID NOT NULL REFERENCES public.vol_email_disparos(id) ON DELETE CASCADE,
  vol_profile_id UUID REFERENCES public.vol_profiles(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  nome TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviado','erro')),
  erro_msg TEXT,
  enviado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (disparo_id, email)
);

CREATE INDEX IF NOT EXISTS idx_vol_email_dest_pendentes
  ON public.vol_email_disparo_destinatarios (disparo_id, status) WHERE deleted_at IS NULL;

COMMENT ON TABLE public.vol_email_disparo_destinatarios IS
  'Log por destinatário de um disparo de e-mail do voluntariado. Snapshot de email/nome (PII). UNIQUE(disparo_id,email) = dedup por campanha; claim atômico pendente→enviado evita duplicata entre rota inline e cron.';

-- ── Whitelist soft-delete (lei do projeto · tabelas com PII) ────────────────
-- Lista VIVA de prod (SELECT public.app_soft_deletable_tables() · 2026-07-02)
-- + as 2 tabelas novas no final.
CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'app_decisoes','app_inscricoes','batismo_inscricoes','cui_acompanhamentos',
    'cui_convertidos','cui_jornada180','cultos','cultos_decisoes_pessoas',
    'int_visitantes','kids_checkins','kids_criancas','kids_pagers','kids_sessoes',
    'kids_vinculo_solicitacoes','kids_atendimentos','kids_sala_voluntarios',
    'kids_estoque','kpi_indicadores_taticos','kpi_metas','marketing_capacidade_override',
    'marketing_compromissos_recorrentes','marketing_entregaveis','marketing_kanban_cards',
    'marketing_membros','mem_contribuicoes','mem_devocionais','mem_familias',
    'mem_grupo_encontros','mem_grupo_membros','mem_grupo_pedidos','mem_grupos',
    'mem_historico','mem_membros','mem_trilha_valores','mem_voluntarios',
    'mem_vinculos_familiares','next_matriculas','next_turmas','nsm_eventos',
    'pcs_progressoes','projects','rh_documentos','rh_funcionarios','solicitacoes',
    'usuarios','vol_background_checks','wifi_conexoes','wifi_visitantes','log_compras',
    'fin_contas_pagar','cui_primeiro_contato_fila','cui_batismo_next_fila',
    'governance_meetings','governance_meeting_docs','governance_memoria',
    'apresentacao_criancas','ext_eventos','ext_inscricoes',
    'vol_email_disparos','vol_email_disparo_destinatarios'
  ]::TEXT[]
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Backend usa service role (guards nos middlewares); as policies protegem o
-- acesso direto via anon key.
ALTER TABLE public.vol_email_disparos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vol_email_disparo_destinatarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY vol_email_disparos_select ON public.vol_email_disparos
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('voluntariado') >= 1 OR public.is_super_admin());

CREATE POLICY vol_email_disparos_insert ON public.vol_email_disparos
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('voluntariado') >= 3 OR public.is_super_admin());

CREATE POLICY vol_email_disparos_update ON public.vol_email_disparos
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('voluntariado') >= 3 OR public.is_super_admin())
  WITH CHECK (public.current_user_module_level('voluntariado') >= 3 OR public.is_super_admin());

CREATE POLICY vol_email_disparos_delete ON public.vol_email_disparos
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY vol_email_disparos_service ON public.vol_email_disparos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY vol_email_dest_select ON public.vol_email_disparo_destinatarios
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('voluntariado') >= 1 OR public.is_super_admin());

CREATE POLICY vol_email_dest_insert ON public.vol_email_disparo_destinatarios
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('voluntariado') >= 3 OR public.is_super_admin());

CREATE POLICY vol_email_dest_update ON public.vol_email_disparo_destinatarios
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('voluntariado') >= 3 OR public.is_super_admin())
  WITH CHECK (public.current_user_module_level('voluntariado') >= 3 OR public.is_super_admin());

CREATE POLICY vol_email_dest_delete ON public.vol_email_disparo_destinatarios
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

CREATE POLICY vol_email_dest_service ON public.vol_email_disparo_destinatarios
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── updated_at automático na campanha ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_vol_email_disparos_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'vol_email_disparos_updated_at') THEN
    CREATE TRIGGER vol_email_disparos_updated_at
      BEFORE UPDATE ON public.vol_email_disparos
      FOR EACH ROW EXECUTE FUNCTION public.fn_vol_email_disparos_updated_at();
  END IF;
END $$;
