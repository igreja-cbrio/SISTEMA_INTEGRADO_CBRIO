-- ============================================================================
-- Módulo Eventos Externos · confirmação de presença (RSVP) + sorteio
-- ============================================================================
-- Cada evento grande (ex.: Celebra) ganha um formulário público de confirmação
-- de presença que capta dados básicos e, ao finalizar, mostra pra pessoa um
-- "número da sorte" (aleatório, único por evento) que vale pro sorteio no fim.
-- Admin: calendário de eventos, lista de inscritos (com o número) e sorteio.

-- 1. Evento
CREATE TABLE IF NOT EXISTS public.ext_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  slug text UNIQUE NOT NULL,
  data date,
  hora text,
  local text,
  descricao text,
  form_ativo boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ext_eventos_active ON public.ext_eventos (data) WHERE deleted_at IS NULL;

-- 2. Inscrição (PII: nome/telefone/email)
CREATE TABLE IF NOT EXISTS public.ext_inscricoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL REFERENCES public.ext_eventos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  telefone text,
  email text,
  numero_sorte integer NOT NULL,
  membro_id uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (evento_id, numero_sorte)
);
CREATE INDEX IF NOT EXISTS idx_ext_inscricoes_evento ON public.ext_inscricoes (evento_id) WHERE deleted_at IS NULL;

-- 3. Sorteio (histórico dos números sorteados por evento · pode ter vários prêmios)
CREATE TABLE IF NOT EXISTS public.ext_sorteios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL REFERENCES public.ext_eventos(id) ON DELETE CASCADE,
  premio text,
  numero_sorteado integer NOT NULL,
  inscricao_id uuid REFERENCES public.ext_inscricoes(id) ON DELETE SET NULL,
  ganhador_nome text,
  sorteado_em timestamptz NOT NULL DEFAULT now(),
  sorteado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_ext_sorteios_evento ON public.ext_sorteios (evento_id);

-- 4. Whitelist de soft-delete (append das 2 tabelas com deleted_at)
CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'app_decisoes','app_inscricoes','batismo_inscricoes','cui_acompanhamentos','cui_convertidos',
    'cui_jornada180','cultos','cultos_decisoes_pessoas','int_visitantes','kids_checkins','kids_criancas',
    'kids_pagers','kids_sessoes','kids_vinculo_solicitacoes','kids_atendimentos','kids_sala_voluntarios',
    'kids_estoque','kpi_indicadores_taticos','kpi_metas','marketing_capacidade_override',
    'marketing_compromissos_recorrentes','marketing_entregaveis','marketing_kanban_cards','marketing_membros',
    'mem_contribuicoes','mem_devocionais','mem_familias','mem_grupo_encontros','mem_grupo_membros',
    'mem_grupo_pedidos','mem_grupos','mem_historico','mem_membros','mem_trilha_valores','mem_voluntarios',
    'mem_vinculos_familiares','next_matriculas','next_turmas','nsm_eventos','pcs_progressoes','projects',
    'rh_documentos','rh_funcionarios','solicitacoes','usuarios','vol_background_checks','wifi_conexoes',
    'wifi_visitantes','log_compras','fin_contas_pagar','cui_primeiro_contato_fila','cui_batismo_next_fila',
    'governance_meetings','governance_meeting_docs','governance_memoria','apresentacao_criancas',
    'ext_eventos','ext_inscricoes'
  ]::TEXT[]
$$;

-- 5. RLS
ALTER TABLE public.ext_eventos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ext_inscricoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ext_sorteios   ENABLE ROW LEVEL SECURITY;

-- ext_eventos
CREATE POLICY ext_eventos_select ON public.ext_eventos FOR SELECT TO authenticated
  USING (public.current_user_module_level('eventos-externos') >= 1);
CREATE POLICY ext_eventos_insert ON public.ext_eventos FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('eventos-externos') >= 3);
CREATE POLICY ext_eventos_update ON public.ext_eventos FOR UPDATE TO authenticated
  USING (public.current_user_module_level('eventos-externos') >= 3)
  WITH CHECK (public.current_user_module_level('eventos-externos') >= 3);
CREATE POLICY ext_eventos_delete ON public.ext_eventos FOR DELETE TO authenticated
  USING (public.is_super_admin());
CREATE POLICY ext_eventos_service ON public.ext_eventos FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ext_inscricoes (PII)
CREATE POLICY ext_inscricoes_select ON public.ext_inscricoes FOR SELECT TO authenticated
  USING (public.current_user_module_level('eventos-externos') >= 1);
CREATE POLICY ext_inscricoes_insert ON public.ext_inscricoes FOR INSERT TO authenticated
  WITH CHECK (public.current_user_module_level('eventos-externos') >= 2);
CREATE POLICY ext_inscricoes_update ON public.ext_inscricoes FOR UPDATE TO authenticated
  USING (public.current_user_module_level('eventos-externos') >= 3)
  WITH CHECK (public.current_user_module_level('eventos-externos') >= 3);
CREATE POLICY ext_inscricoes_delete ON public.ext_inscricoes FOR DELETE TO authenticated
  USING (public.is_super_admin());
CREATE POLICY ext_inscricoes_service ON public.ext_inscricoes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ext_sorteios
CREATE POLICY ext_sorteios_select ON public.ext_sorteios FOR SELECT TO authenticated
  USING (public.current_user_module_level('eventos-externos') >= 1);
CREATE POLICY ext_sorteios_write ON public.ext_sorteios FOR ALL TO authenticated
  USING (public.current_user_module_level('eventos-externos') >= 3)
  WITH CHECK (public.current_user_module_level('eventos-externos') >= 3);
CREATE POLICY ext_sorteios_service ON public.ext_sorteios FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. Registro do módulo no catálogo
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'eventos-externos', 'Eventos Externos', '/eventos-externos', 'operacional', 215,
       'Eventos com formulário público de confirmação de presença e sorteio', true
WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'eventos-externos');

-- 7. Seed da matriz de permissão · copia do módulo 'eventos'
DO $$
DECLARE base_modulo_id int;
BEGIN
  SELECT id INTO base_modulo_id FROM public.modulos WHERE slug = 'eventos';
  INSERT INTO public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
  SELECT cmp.cargo_id, novo.id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
    FROM public.cargo_modulo_permissao cmp
    CROSS JOIN public.modulos novo
   WHERE cmp.modulo_id = base_modulo_id AND novo.slug = 'eventos-externos'
  ON CONFLICT (cargo_id, modulo_id) DO NOTHING;
END $$;
