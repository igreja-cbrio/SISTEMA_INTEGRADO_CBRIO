-- Voluntariado · Templates de escala de culto (PR1 · schema)
--
-- Monta a escala de um culto a partir de TEMPLATES pré-prontos que o próprio
-- coordenador cria e escolhe. Reaproveita o que já existe:
--   vol_teams      = "área"/grupo/ministério (Integração, Produção, Banda…)
--   vol_positions  = função dentro do grupo (Câmeras, Baixo, Estacionamento…)
-- e NÃO cria vocabulário novo de texto livre.
--
-- Decisões (validadas com o Matheus + conselho deliberativo 2026-07-28):
--  1) Vaga vazia com LACUNA VISÍVEL (mostrar "faltam 2 de 3 câmeras") → há um
--     denominador de cobertura por culto, que hoje não existe.
--  2) "Fixo × móvel" é uma FLAG por item (não duas tabelas). Ex.: no Domingo a
--     banda-sem-vocal é fixa e o vocal é móvel → dentro da MESMA equipe umas
--     funções são fixas e outra móvel.
--  3) Template pré-preenche PESSOAS-padrão (quem normalmente serve na função).
--  4) Template liga a TIPO de culto (N:N — "Domingo manhã" cobre 08:30/10:00/
--     11:30) e é trocável na hora.
--
-- ⚠️ Por que a "vaga vazia" NÃO é uma linha em vol_schedules:
--   vol_schedules tem UNIQUE NULLS NOT DISTINCT (service_id, pc_person_id,
--   team_name, position_name) que o PCO usa pra dedupe. N vagas vazias iguais
--   (pc_person_id NULL) colidiriam, e mexer nesse índice arriscaria o sync do
--   PCO. Então a EXPECTATIVA vive em vol_escala_culto_itens (composição
--   esperada do culto) e as ATRIBUIÇÕES reais continuam SÓ em vol_schedules
--   (check-in/KPI/frequência intactos). Cobertura = alvo − preenchidas.

BEGIN;

-- ── 1) Template (cabeçalho) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vol_escala_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- N:N template ↔ tipo de culto (auto-sugestão ao criar o culto)
CREATE TABLE IF NOT EXISTS public.vol_escala_template_tipos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.vol_escala_templates(id) ON DELETE CASCADE,
  service_type_id uuid NOT NULL REFERENCES public.vol_service_types(id) ON DELETE CASCADE,
  UNIQUE (template_id, service_type_id)
);

-- ── 2) Itens do template (equipe × função × quantidade + fixo) ────────────────
CREATE TABLE IF NOT EXISTS public.vol_escala_template_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.vol_escala_templates(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.vol_teams(id) ON DELETE CASCADE,
  position_id uuid REFERENCES public.vol_positions(id) ON DELETE SET NULL,
  quantidade int NOT NULL DEFAULT 1 CHECK (quantidade >= 1),
  fixo boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (template_id, team_id, position_id)
);

-- Pessoas-padrão por item (pré-preenchimento; N por item)
CREATE TABLE IF NOT EXISTS public.vol_escala_template_item_pessoas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.vol_escala_template_itens(id) ON DELETE CASCADE,
  volunteer_id uuid NOT NULL REFERENCES public.vol_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, volunteer_id)
);

-- ── 3) Composição esperada de UM culto (snapshot do template aplicado) ────────
-- É o denominador de cobertura: cada linha = "este culto espera N pessoas nesta
-- equipe/função". As pessoas escaladas de verdade ficam em vol_schedules.
CREATE TABLE IF NOT EXISTS public.vol_escala_culto_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.vol_services(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.vol_escala_templates(id) ON DELETE SET NULL,
  template_item_id uuid REFERENCES public.vol_escala_template_itens(id) ON DELETE SET NULL,
  team_id uuid NOT NULL REFERENCES public.vol_teams(id) ON DELETE CASCADE,
  position_id uuid REFERENCES public.vol_positions(id) ON DELETE SET NULL,
  quantidade int NOT NULL DEFAULT 1 CHECK (quantidade >= 1),
  fixo boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (service_id, team_id, position_id)
);

CREATE INDEX IF NOT EXISTS vol_esc_tpl_tipos_tpl_idx     ON public.vol_escala_template_tipos(template_id);
CREATE INDEX IF NOT EXISTS vol_esc_tpl_tipos_st_idx      ON public.vol_escala_template_tipos(service_type_id);
CREATE INDEX IF NOT EXISTS vol_esc_tpl_itens_tpl_idx     ON public.vol_escala_template_itens(template_id);
CREATE INDEX IF NOT EXISTS vol_esc_tpl_item_pess_item_idx ON public.vol_escala_template_item_pessoas(item_id);
CREATE INDEX IF NOT EXISTS vol_esc_culto_itens_svc_idx   ON public.vol_escala_culto_itens(service_id) WHERE deleted_at IS NULL;

-- ── 4) vol_schedules: aditivo (nada destrutivo em dado existente) ─────────────
-- Rastro de qual vaga esperada este agendamento preenche (nullable = ad-hoc).
ALTER TABLE public.vol_schedules
  ADD COLUMN IF NOT EXISTS escala_culto_item_id uuid
  REFERENCES public.vol_escala_culto_itens(id) ON DELETE SET NULL;

-- source ganha 'template' (aditivo · não invalida linha existente).
ALTER TABLE public.vol_schedules DROP CONSTRAINT IF EXISTS vol_schedules_source_check;
ALTER TABLE public.vol_schedules ADD CONSTRAINT vol_schedules_source_check
  CHECK (source = ANY (ARRAY['planning_center','manual','auto_rotation','template']));

CREATE INDEX IF NOT EXISTS vol_schedules_escala_item_idx
  ON public.vol_schedules(escala_culto_item_id) WHERE escala_culto_item_id IS NOT NULL;

-- ⚠️ MULTI-PESSOA NA MESMA FUNÇÃO (ex.: 3 câmeras, 7 da banda).
-- O índice vol_schedules_pc_unique é NULLS NOT DISTINCT em
-- (service_id, pc_person_id, team_name, position_name) — necessário pro dedup
-- do PCO (4.484 linhas do PCO têm team/position nulos e dependem disso). Mas
-- linhas SEM pc_person_id (template/manual) colidiriam entre si na mesma função.
-- Solução: um discriminador `slot_seq`. PCO fica tudo em slot_seq=0 (default →
-- dedup do PCO inalterado, pois todos comparam com 0); vagas não-PCO na mesma
-- função recebem slot_seq crescente (0,1,2…) e deixam de colidir.
ALTER TABLE public.vol_schedules ADD COLUMN IF NOT EXISTS slot_seq smallint NOT NULL DEFAULT 0;
ALTER TABLE public.vol_schedules DROP CONSTRAINT IF EXISTS vol_schedules_pc_unique;
ALTER TABLE public.vol_schedules ADD CONSTRAINT vol_schedules_pc_unique
  UNIQUE NULLS NOT DISTINCT (service_id, planning_center_person_id, team_name, position_name, slot_seq);

-- ── 5) updated_at automático ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vol_escala_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_vol_escala_templates_touch ON public.vol_escala_templates;
CREATE TRIGGER trg_vol_escala_templates_touch BEFORE UPDATE ON public.vol_escala_templates
  FOR EACH ROW EXECUTE FUNCTION public.vol_escala_touch_updated_at();
DROP TRIGGER IF EXISTS trg_vol_escala_culto_itens_touch ON public.vol_escala_culto_itens;
CREATE TRIGGER trg_vol_escala_culto_itens_touch BEFORE UPDATE ON public.vol_escala_culto_itens
  FOR EACH ROW EXECUTE FUNCTION public.vol_escala_touch_updated_at();

-- ── 6) RLS (molde dos vol_ recentes: leitura ≥1, escrita ≥3, service_role all) ─
ALTER TABLE public.vol_escala_templates            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vol_escala_template_tipos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vol_escala_template_itens       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vol_escala_template_item_pessoas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vol_escala_culto_itens          ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vol_escala_templates','vol_escala_template_tipos','vol_escala_template_itens',
    'vol_escala_template_item_pessoas','vol_escala_culto_itens'
  ] LOOP
    EXECUTE format($f$
      DROP POLICY IF EXISTS %1$s_select ON public.%1$s;
      CREATE POLICY %1$s_select ON public.%1$s FOR SELECT TO authenticated
        USING (public.current_user_module_level('voluntariado') >= 1 OR public.is_super_admin());
      DROP POLICY IF EXISTS %1$s_write ON public.%1$s;
      CREATE POLICY %1$s_write ON public.%1$s FOR ALL TO authenticated
        USING (public.current_user_module_level('voluntariado') >= 3 OR public.is_super_admin())
        WITH CHECK (public.current_user_module_level('voluntariado') >= 3 OR public.is_super_admin());
      DROP POLICY IF EXISTS %1$s_service ON public.%1$s;
      CREATE POLICY %1$s_service ON public.%1$s FOR ALL TO service_role USING (true) WITH CHECK (true);
    $f$, t);
  END LOOP;
END $$;

COMMIT;
