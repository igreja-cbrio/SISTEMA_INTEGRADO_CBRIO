-- ============================================================
-- Kids — Pré-check-in pelo app de membros
-- O responsável prepara o check-in no app (escolhe os filhos), gera um
-- código/QR, e no totem o voluntário escaneia/digita pra pré-popular e
-- imprimir. NÃO substitui a mediação presencial — só adianta a fila.
-- A entrada/retirada da criança continua mediada pelo voluntário.
-- APLICADA EM PRODUÇÃO em 2026-06-14.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.kids_pre_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,                 -- 6 chars (QR + digitável)
  responsavel_membro_id uuid NOT NULL REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  responsavel_nome text NOT NULL,              -- snapshot
  responsavel_telefone text,
  crianca_ids uuid[] NOT NULL,                 -- filhos selecionados
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','usado','expirado','cancelado')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL,              -- criado_em + 12h
  usado_em timestamptz,
  usado_por uuid REFERENCES auth.users(id),    -- voluntário que aplicou no totem
  checkin_ids uuid[]                           -- resultado (kids_checkins criados)
);

CREATE INDEX IF NOT EXISTS idx_kids_pre_checkins_codigo
  ON public.kids_pre_checkins (codigo) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS idx_kids_pre_checkins_responsavel
  ON public.kids_pre_checkins (responsavel_membro_id, criado_em DESC);

ALTER TABLE public.kids_pre_checkins ENABLE ROW LEVEL SECURITY;

-- O responsável vê/cria só os PRÓPRIOS pré-check-ins (pelo seu membro_id).
DROP POLICY IF EXISTS kids_pre_checkins_proprio_select ON public.kids_pre_checkins;
CREATE POLICY kids_pre_checkins_proprio_select ON public.kids_pre_checkins
  FOR SELECT TO authenticated
  USING (responsavel_membro_id = public.current_user_membro_id());

DROP POLICY IF EXISTS kids_pre_checkins_proprio_insert ON public.kids_pre_checkins;
CREATE POLICY kids_pre_checkins_proprio_insert ON public.kids_pre_checkins
  FOR INSERT TO authenticated
  WITH CHECK (responsavel_membro_id = public.current_user_membro_id());

-- Equipe Kids (nível >= 1) lê pra aplicar no totem.
DROP POLICY IF EXISTS kids_pre_checkins_staff_select ON public.kids_pre_checkins;
CREATE POLICY kids_pre_checkins_staff_select ON public.kids_pre_checkins
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('kids') >= 1);

-- Service role (backend) faz todo o fluxo.
DROP POLICY IF EXISTS kids_pre_checkins_service ON public.kids_pre_checkins;
CREATE POLICY kids_pre_checkins_service ON public.kids_pre_checkins
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Gerador de código de 6 chars (alfabeto sem ambíguos), único entre os pendentes.
CREATE OR REPLACE FUNCTION public.fn_kids_pre_checkin_codigo()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_alfabeto text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_codigo text;
  v_i int;
  v_try int := 0;
BEGIN
  LOOP
    v_codigo := '';
    FOR v_i IN 1..6 LOOP
      v_codigo := v_codigo || substr(v_alfabeto, floor(random() * length(v_alfabeto) + 1)::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.kids_pre_checkins WHERE codigo = v_codigo AND status = 'pendente'
    );
    v_try := v_try + 1;
    IF v_try > 20 THEN EXIT; END IF;
  END LOOP;
  RETURN v_codigo;
END $$;
