-- Bot de triagem do inbox Conversas: estado por conversa + menu de setores editável.
-- Aditiva (colunas + tabela nova). Já aplicada via MCP.

ALTER TABLE public.wa_conversas ADD COLUMN IF NOT EXISTS bot_estado text;        -- null|aguardando_setor|aguardando_nome|concluido
ALTER TABLE public.wa_conversas ADD COLUMN IF NOT EXISTS bot_area_pendente text; -- área escolhida antes de coletar o nome

CREATE TABLE IF NOT EXISTS public.conversas_setores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem int NOT NULL DEFAULT 0,
  rotulo text NOT NULL,
  area text NOT NULL,           -- casa com areas.nome
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.conversas_setores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversas_setores_sel ON public.conversas_setores;
CREATE POLICY conversas_setores_sel ON public.conversas_setores FOR SELECT TO authenticated
  USING (public.current_user_module_level('conversas') >= 1);
DROP POLICY IF EXISTS conversas_setores_srv ON public.conversas_setores;
CREATE POLICY conversas_setores_srv ON public.conversas_setores FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed dos 6 setores (idempotente)
INSERT INTO public.conversas_setores (ordem, rotulo, area)
SELECT * FROM (VALUES
  (1, 'Cuidados', 'Cuidados'),
  (2, 'Grupos', 'Grupos'),
  (3, 'Integração', 'Integração'),
  (4, 'Kids', 'KIDS'),
  (5, 'Online', 'Online'),
  (6, 'Voluntariado', 'Voluntariado')
) AS s(ordem, rotulo, area)
WHERE NOT EXISTS (SELECT 1 FROM public.conversas_setores);

-- Resolve os profile_id de todos os usuários vinculados a uma área (pelo nome),
-- casando usuarios(int, email) → profiles(uuid, email) por lower(email). Usado
-- pra notificar a equipe da área quando o bot tria uma conversa.
CREATE OR REPLACE FUNCTION public.conversas_profiles_da_area(area_nome text)
RETURNS TABLE(profile_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.id
  FROM public.usuario_areas ua
  JOIN public.areas a    ON a.id = ua.area_id
  JOIN public.usuarios u ON u.id = ua.usuario_id
  JOIN public.profiles p ON lower(p.email) = lower(u.email)
  WHERE a.nome = area_nome AND p.active = true;
$$;
