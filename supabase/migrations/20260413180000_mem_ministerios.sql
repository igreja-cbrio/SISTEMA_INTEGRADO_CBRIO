-- ═══════════════════════════════════════════════════════════
-- Ministérios / Voluntariado / Escalas / Check-ins
-- ═══════════════════════════════════════════════════════════

-- mem_ministerios (áreas de serviço: Louvor, Kids, Recepção, etc.)
CREATE TABLE public.mem_ministerios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  descricao text,
  lider_id uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  cor text DEFAULT '#00B39D',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mem_ministerios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read mem_ministerios" ON public.mem_ministerios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write mem_ministerios" ON public.mem_ministerios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update mem_ministerios" ON public.mem_ministerios FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete mem_ministerios" ON public.mem_ministerios FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_mem_ministerios_ativo ON public.mem_ministerios(ativo);

-- mem_voluntarios (cadastro de disponibilidade — NÃO significa que está servindo, só que é voluntário naquela área)
-- Um membro pode estar em VÁRIOS ministérios (regra do usuário).
CREATE TABLE public.mem_voluntarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id uuid NOT NULL REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  ministerio_id uuid NOT NULL REFERENCES public.mem_ministerios(id) ON DELETE CASCADE,
  papel text,               -- Ex: "Vocal", "Baterista", "Equipe azul", "Monitor"
  desde date NOT NULL DEFAULT CURRENT_DATE,
  ate date,                 -- Saiu do ministério (null = ainda é voluntário)
  motivo_saida text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mem_voluntarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read mem_voluntarios" ON public.mem_voluntarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write mem_voluntarios" ON public.mem_voluntarios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update mem_voluntarios" ON public.mem_voluntarios FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete mem_voluntarios" ON public.mem_voluntarios FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_mem_voluntarios_membro ON public.mem_voluntarios(membro_id);
CREATE INDEX idx_mem_voluntarios_ministerio ON public.mem_voluntarios(ministerio_id);

-- Mesmo membro não pode estar cadastrado 2x ativamente no mesmo ministério
CREATE UNIQUE INDEX uniq_mem_voluntarios_ativo
  ON public.mem_voluntarios(membro_id, ministerio_id)
  WHERE ate IS NULL;

-- mem_escalas (escalação de voluntários para cultos/eventos)
-- Regra do usuário: "um membro pode servir em mais de uma area, mas nao no mesmo culto"
-- Isso é garantido pelo índice único (membro_id, data, culto).
CREATE TABLE public.mem_escalas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id uuid NOT NULL REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  ministerio_id uuid NOT NULL REFERENCES public.mem_ministerios(id) ON DELETE CASCADE,
  data date NOT NULL,
  culto text,               -- Ex: "Culto da manhã", "Culto da noite", "Conexão"
  papel text,               -- Função específica nesta escala
  confirmado boolean NOT NULL DEFAULT false,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mem_escalas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read mem_escalas" ON public.mem_escalas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write mem_escalas" ON public.mem_escalas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update mem_escalas" ON public.mem_escalas FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete mem_escalas" ON public.mem_escalas FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_mem_escalas_membro_data ON public.mem_escalas(membro_id, data DESC);
CREATE INDEX idx_mem_escalas_ministerio_data ON public.mem_escalas(ministerio_id, data DESC);
CREATE INDEX idx_mem_escalas_data ON public.mem_escalas(data DESC);

-- Um membro só pode ter 1 escala por data+culto (mesmo culto = não pode escalar em 2 áreas)
CREATE UNIQUE INDEX uniq_mem_escalas_membro_data_culto
  ON public.mem_escalas(membro_id, data, COALESCE(culto, ''));

-- mem_checkins (presença efetiva no serviço — fonte de verdade do "está servindo")
-- Estrutura pronta para ser alimentada pelo sistema de check-in que será integrado depois.
CREATE TABLE public.mem_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id uuid NOT NULL REFERENCES public.mem_membros(id) ON DELETE CASCADE,
  ministerio_id uuid REFERENCES public.mem_ministerios(id) ON DELETE SET NULL,
  escala_id uuid REFERENCES public.mem_escalas(id) ON DELETE SET NULL,
  data date NOT NULL DEFAULT CURRENT_DATE,
  culto text,
  horario time,
  origem text NOT NULL DEFAULT 'manual'
    CHECK (origem IN ('manual', 'qr_code', 'app', 'importacao')),
  observacoes text,
  registrado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mem_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read mem_checkins" ON public.mem_checkins FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write mem_checkins" ON public.mem_checkins FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update mem_checkins" ON public.mem_checkins FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete mem_checkins" ON public.mem_checkins FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_mem_checkins_membro_data ON public.mem_checkins(membro_id, data DESC);
CREATE INDEX idx_mem_checkins_ministerio_data ON public.mem_checkins(ministerio_id, data DESC);
CREATE INDEX idx_mem_checkins_escala ON public.mem_checkins(escala_id) WHERE escala_id IS NOT NULL;
