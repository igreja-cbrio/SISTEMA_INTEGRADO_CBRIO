-- ============================================================================
-- MIGRATION · Marketing · Cleanup legacy + Aline + Notificacoes (Spec 021)
-- ============================================================================
-- 1. Migra card "Impressos campanha" do tipo legacy 'artes' pra 'banner_lona'
-- 2. Hard-delete 7 tipos legacy inativos
-- 3. Soft-delete 5 KPIs MKT-ONL-* legacy
-- 4. Aline · profile_id NULL · nome_display direto em marketing_membros
--    · (profiles.id tem FK pra auth.users · nao da pra criar profile fantasma)
--    · rh_funcionarios com email NULL + observacoes pendentes
--    · recorrente domingo 6h
-- 5. notificacao_regras pro Pedro Paiva + Marcos
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Migra card legacy
-- ----------------------------------------------------------------------------
UPDATE public.marketing_kanban_cards
   SET etiqueta_tipo_id = (SELECT id FROM public.marketing_etiquetas_tipo WHERE slug = 'banner_lona')
 WHERE etiqueta_tipo_id = (SELECT id FROM public.marketing_etiquetas_tipo WHERE slug = 'artes');

-- ----------------------------------------------------------------------------
-- 2. Hard-delete tipos legacy
-- ----------------------------------------------------------------------------
DELETE FROM public.marketing_etiquetas_tipo
 WHERE slug IN ('redes_sociais','artes','pecas_fisicas','videos','fotos','impressos','identidade_marca');

-- ----------------------------------------------------------------------------
-- 3. Soft-delete KPIs MKT-ONL-* legacy
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos
   SET ativo = false,
       deleted_at = now()
 WHERE id IN ('MKT-ONL-COMENT-REL','MKT-ONL-COMENT-CRESC','MKT-ONL-RETENCAO','MKT-ONL-SHARE','MKT-ONL-CTR')
   AND deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 4. Schema · marketing_membros aceita membro sem profile (Aline pattern)
-- ----------------------------------------------------------------------------
ALTER TABLE public.marketing_membros
  ALTER COLUMN profile_id DROP NOT NULL;

-- UNIQUE (profile_id, habilidade) trata NULL como diferente (Postgres default)
-- · vou adicionar coluna nome_display pra membros sem profile linkado
ALTER TABLE public.marketing_membros
  ADD COLUMN IF NOT EXISTS nome_display text;

COMMENT ON COLUMN public.marketing_membros.profile_id IS
  'Profile vinculado (auth.users) · NULL pra membros que nao acessam o sistema (ex: Aline · fotografa de domingo). Use nome_display nesses casos.';

COMMENT ON COLUMN public.marketing_membros.nome_display IS
  'Nome exibido na UI quando profile_id IS NULL. Spec 021 · cadastro de pessoas sem login (cobertura ocasional · cont. PJ sem auth).';

-- ----------------------------------------------------------------------------
-- 5. Aline · marketing_membros + recorrente + rh_funcionarios
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_aline_membro_id uuid;
BEGIN
  -- Verifica se ja existe (idempotent)
  SELECT id INTO v_aline_membro_id
    FROM public.marketing_membros
   WHERE nome_display ILIKE 'Aline%fotografa%domingo%'
     AND habilidade = 'fotografo'
     AND deleted_at IS NULL
   LIMIT 1;

  IF v_aline_membro_id IS NULL THEN
    INSERT INTO public.marketing_membros
      (profile_id, nome_display, habilidade, horas_semanais, observacao, ativo)
    VALUES (
      NULL,
      'Aline (fotografa domingo)',
      'fotografo',
      6,
      'Aline · cobertura cultos domingo manha · NAO acessa o sistema · informacoes pessoais pendentes em rh_funcionarios',
      true
    )
    RETURNING id INTO v_aline_membro_id;
  END IF;

  -- Recorrente domingo 08:30 6h + junction
  IF NOT EXISTS (
    SELECT 1 FROM public.marketing_compromissos_recorrentes r
    JOIN public.marketing_recorrentes_participantes p ON p.compromisso_id = r.id
    WHERE p.membro_id = v_aline_membro_id
      AND r.dia_semana = 0
      AND r.deleted_at IS NULL
  ) THEN
    WITH novo AS (
      INSERT INTO public.marketing_compromissos_recorrentes
        (dia_semana, hora_inicio, duracao_h, descricao, ativo)
      VALUES (0, TIME '08:30', 6.0, 'Cobertura cultos domingo (08:30 · 10:00 · 11:30 · 19:00)', true)
      RETURNING id
    )
    INSERT INTO public.marketing_recorrentes_participantes (compromisso_id, membro_id)
    SELECT id, v_aline_membro_id FROM novo;
  END IF;
END $$;

-- rh_funcionarios da Aline
INSERT INTO public.rh_funcionarios
  (nome, email, cargo, tipo_contrato, data_admissao, status, observacoes)
SELECT
  'Aline (fotografa domingo)',
  NULL,
  'Fotografa de domingo (cobertura cultos)',
  'PJ',
  CURRENT_DATE,
  'ativo',
  E'INFORMACOES PENDENTES:\n- Sobrenome\n- CPF\n- Telefone\n- Email pessoal\n- Endereco\n- Valor por cobertura\n\nContexto: cobre os 4 cultos de domingo (08:30 · 10:00 · 11:30 · 19:00).\nNao acessa o sistema · cadastrada em marketing_membros com profile_id NULL + nome_display.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.rh_funcionarios
   WHERE nome ILIKE 'Aline (fotografa domingo)'
);

-- ----------------------------------------------------------------------------
-- 6. Notificacoes · Pedro Paiva + Marcos recebem do modulo marketing
-- ----------------------------------------------------------------------------
INSERT INTO public.notificacao_regras (modulo, profile_id, ativo)
SELECT 'marketing', p.id, true
  FROM public.profiles p
 WHERE p.email IN ('pedro.paiva@cbrio.org', 'infra@cbrio.com.br')
   AND p.active = true
ON CONFLICT (modulo, profile_id) DO UPDATE SET ativo = true;

-- ----------------------------------------------------------------------------
-- 7. Comentarios
-- ----------------------------------------------------------------------------
COMMENT ON TABLE public.marketing_etiquetas_tipo IS
  'Etiquetas tipo · entregas concretas (Spec 017 refator). Spec 021 removeu os 7 legacy guarda-chuva. 16 ativas + slug mockup reusado.';
