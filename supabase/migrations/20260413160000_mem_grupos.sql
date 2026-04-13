-- mem_grupos (Grupos de Conexão / GVs)
CREATE TABLE public.mem_grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  categoria text,
  lider_id uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  local text,
  endereco text,
  dia_semana smallint CHECK (dia_semana BETWEEN 0 AND 6),
  horario time,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mem_grupos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read mem_grupos" ON public.mem_grupos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write mem_grupos" ON public.mem_grupos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update mem_grupos" ON public.mem_grupos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete mem_grupos" ON public.mem_grupos FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_mem_grupos_lider ON public.mem_grupos(lider_id) WHERE lider_id IS NOT NULL;
CREATE INDEX idx_mem_grupos_ativo ON public.mem_grupos(ativo);

-- mem_grupo_membros (histórico de participação; membro só pode ter 1 registro ativo por vez)
CREATE TABLE public.mem_grupo_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES public.mem_grupos(id) ON DELETE CASCADE,
  membro_id uuid NOT NULL REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  entrou_em date NOT NULL DEFAULT CURRENT_DATE,
  saiu_em date,
  motivo_saida text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mem_grupo_membros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read mem_grupo_membros" ON public.mem_grupo_membros FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write mem_grupo_membros" ON public.mem_grupo_membros FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update mem_grupo_membros" ON public.mem_grupo_membros FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete mem_grupo_membros" ON public.mem_grupo_membros FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_mem_grupo_membros_membro ON public.mem_grupo_membros(membro_id);
CREATE INDEX idx_mem_grupo_membros_grupo ON public.mem_grupo_membros(grupo_id);

-- Um membro só pode ter UM grupo ativo (saiu_em IS NULL) simultaneamente
CREATE UNIQUE INDEX uniq_mem_grupo_membros_ativo
  ON public.mem_grupo_membros(membro_id)
  WHERE saiu_em IS NULL;
