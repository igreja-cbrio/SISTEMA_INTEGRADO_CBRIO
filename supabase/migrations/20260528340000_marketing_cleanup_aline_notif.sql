-- ============================================================================
-- MIGRATION · Marketing · Cleanup legacy + Aline + Notificacoes (Spec 021)
-- ============================================================================
-- 1. Migra card "Impressos campanha de servico" do tipo legacy 'artes' (10h)
--    pra 'banner_lona' ativo (6h) · mais compativel com "impressos"
-- 2. Hard-delete dos 7 tipos legacy inativos (artes/redes_sociais/etc)
--    · FK em marketing_kanban_cards eh ON DELETE SET NULL · seguro
-- 3. Soft-delete dos 5 KPIs MKT-ONL-* legacy sem fonte_auto
--    · preserva audit log · UI deixa de mostrar
-- 4. Cadastra Aline (fotografa de domingo · nao acessa o sistema)
--    · profile fantasma com email placeholder
--    · rh_funcionarios com email NULL + observacoes "INFORMACOES PENDENTES"
--    · marketing_membros · habilidade fotografo · 6h/sem (so domingos)
--    · marketing_compromissos_recorrentes domingo 08:30 6h com Aline participante
-- 5. Configura notificacao_regras pro modulo marketing
--    · Pedro Paiva recebe tudo do modulo (coordenador · ponto focal)
--    · Marcos super-admin tambem (transparencia)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Migra card legacy pro tipo ativo
-- ----------------------------------------------------------------------------
UPDATE public.marketing_kanban_cards
   SET etiqueta_tipo_id = (SELECT id FROM public.marketing_etiquetas_tipo WHERE slug = 'banner_lona')
 WHERE etiqueta_tipo_id = (SELECT id FROM public.marketing_etiquetas_tipo WHERE slug = 'artes');

-- ----------------------------------------------------------------------------
-- 2. Hard-delete dos 7 tipos legacy
-- ----------------------------------------------------------------------------
DELETE FROM public.marketing_etiquetas_tipo
 WHERE slug IN ('redes_sociais','artes','pecas_fisicas','videos','fotos','impressos','identidade_marca');

-- ----------------------------------------------------------------------------
-- 3. Soft-delete dos 5 KPIs MKT-ONL-* legacy sem fonte_auto
-- ----------------------------------------------------------------------------
UPDATE public.kpi_indicadores_taticos
   SET ativo = false,
       deleted_at = now()
 WHERE id IN ('MKT-ONL-COMENT-REL','MKT-ONL-COMENT-CRESC','MKT-ONL-RETENCAO','MKT-ONL-SHARE','MKT-ONL-CTR')
   AND deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 4. Cadastra Aline · sem acesso · profile fantasma
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_aline_profile_id uuid;
  v_aline_membro_id uuid;
BEGIN
  -- Profile fantasma · idempotent · checa primeiro (profile.email nao eh UNIQUE)
  SELECT id INTO v_aline_profile_id
    FROM public.profiles
   WHERE email = 'aline.pendente@cbrio.org'
   LIMIT 1;

  IF v_aline_profile_id IS NULL THEN
    -- profile.role aceita so admin/diretor/assistente · usar assistente
    INSERT INTO public.profiles (id, name, email, role, area, active, created_at)
    VALUES (
      gen_random_uuid(),
      'Aline (fotografa domingo)',
      'aline.pendente@cbrio.org',
      'assistente',
      'Criativo',
      true,
      now()
    )
    RETURNING id INTO v_aline_profile_id;
  END IF;

  -- Marketing membros
  INSERT INTO public.marketing_membros
    (profile_id, habilidade, horas_semanais, observacao, ativo)
  VALUES (
    v_aline_profile_id,
    'fotografo',
    6,
    'Aline · cobertura cultos domingo manha · NAO acessa o sistema · informacoes pessoais pendentes em rh_funcionarios',
    true
  )
  ON CONFLICT (profile_id, habilidade) DO UPDATE
    SET ativo = true,
        observacao = EXCLUDED.observacao,
        updated_at = now()
  RETURNING id INTO v_aline_membro_id;

  -- Compromisso recorrente · domingo 08:30 6h (cobertura cultos 08:30 · 10:00 · 11:30 · 19:00)
  -- Cria 1 compromisso e vincula a Aline via junction
  WITH novo_compromisso AS (
    INSERT INTO public.marketing_compromissos_recorrentes
      (dia_semana, hora_inicio, duracao_h, descricao, ativo)
    SELECT 0, TIME '08:30', 6.0, 'Cobertura cultos domingo (08:30 · 10:00 · 11:30 · 19:00)', true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.marketing_compromissos_recorrentes r
      JOIN public.marketing_recorrentes_participantes p ON p.compromisso_id = r.id
      WHERE p.membro_id = v_aline_membro_id AND r.dia_semana = 0 AND r.deleted_at IS NULL
    )
    RETURNING id
  )
  INSERT INTO public.marketing_recorrentes_participantes (compromisso_id, membro_id)
  SELECT id, v_aline_membro_id FROM novo_compromisso;
END $$;

-- Cadastra Aline em rh_funcionarios · email NULL · observacoes pendentes
INSERT INTO public.rh_funcionarios
  (nome, email, cargo, tipo_contrato, data_admissao, status, observacoes)
SELECT
  'Aline (fotografa domingo)',
  NULL,
  'Fotografa de domingo (cobertura cultos)',
  'PJ',
  CURRENT_DATE,
  'ativo',
  E'INFORMACOES PENDENTES:\n- Sobrenome\n- CPF\n- Telefone\n- Email pessoal\n- Endereco\n- Valor por cobertura\n\nContexto: cobre os 4 cultos de domingo (08:30 · 10:00 · 11:30 · 19:00).\nNao acessa o sistema · profile fantasma so pra aparecer em marketing_membros + calendario do Pedro Paiva.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.rh_funcionarios
   WHERE nome ILIKE 'Aline (fotografa domingo)'
);

-- ----------------------------------------------------------------------------
-- 5. Notificacao regras · Pedro Paiva e Marcos recebem do modulo marketing
-- ----------------------------------------------------------------------------
-- Schema do notificacao_regras: (modulo, profile_id, ativo)
-- Sem campo "tipo" · regra eh "esse user recebe TUDO do modulo X como fallback"

INSERT INTO public.notificacao_regras (modulo, profile_id, ativo)
SELECT 'marketing', p.id, true
  FROM public.profiles p
 WHERE p.email IN ('pedro.paiva@cbrio.org', 'infra@cbrio.com.br')
   AND p.active = true
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 6. Comentarios finais (referencia)
-- ----------------------------------------------------------------------------
COMMENT ON TABLE public.marketing_etiquetas_tipo IS
  'Etiquetas tipo · entregas concretas (Spec 017 refator). Spec 021 removeu os 7 legacy guarda-chuva. 16 ativas + slug mockup reusado.';
