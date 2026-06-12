-- ============================================================================
-- VOLUNTARIADO — Seed estruturado de Áreas (vol_teams) × Posições (vol_positions)
-- ----------------------------------------------------------------------------
-- Pedido do Marcos (2026-06-02): estruturar as posições do voluntariado por
-- área pra viabilizar escala automática. Cada ÁREA vira um `vol_teams` e cada
-- POSIÇÃO vira um `vol_positions` com a quantidade de vagas em `max_volunteers`
-- (quando informada). O motor de auto-fill de escala já consome team_id +
-- position_id + min/max_volunteers.
--
-- ADITIVO e IDEMPOTENTE:
--   - vol_teams      → ON CONFLICT (name)          DO UPDATE (merge com times
--                       que já existirem, ex: importados do Planning Center).
--   - vol_positions  → ON CONFLICT (team_id, name) DO UPDATE (atualiza vagas).
--   Rodar de novo não duplica nada.
--
-- Cobertura desta leva (Marcos manda as demais áreas depois):
--   Online · Integração · Kids · Produção · Voluntariado · AMI · Bridge · Marketing
--
-- OBS sobre nº de vagas (`max_volunteers`):
--   - Informado pelo Marcos: Online (chat 19 · próximos passos 7 · host 6 ·
--     comunidade 4) e Produção (câmera 8). Demais ficam com max NULL (a definir).
--   - min_volunteers = 1 (default) em tudo.
--
-- OBS sobre restrições de culto (cozinha = só domingo manhã, cuidados = só
--   quarta, etc.) ficam registradas na `description` por enquanto. Vincular
--   posição → tipo de culto pra escala 100% automática é follow-up de schema.
-- ============================================================================

DO $$
DECLARE
  t_id uuid;
BEGIN
  -- ── ONLINE ────────────────────────────────────────────────────────────────
  INSERT INTO public.vol_teams (name, description, color, sort_order, is_active)
  VALUES ('Online', 'Equipe do culto online', '#EF4444', 10, true)
  ON CONFLICT (name) DO UPDATE
    SET description = COALESCE(public.vol_teams.description, EXCLUDED.description),
        sort_order  = EXCLUDED.sort_order,
        updated_at  = now()
  RETURNING id INTO t_id;

  INSERT INTO public.vol_positions (team_id, name, description, min_volunteers, max_volunteers, sort_order, is_active) VALUES
    (t_id, 'Chat',            'Atendimento no chat durante o culto online',                 1, 19, 1, true),
    (t_id, 'Próximos Passos', 'Acompanhamento dos próximos passos online',                  1,  7, 2, true),
    (t_id, 'Host',            'Anfitrião do culto online',                                  1,  6, 3, true),
    (t_id, 'Comunidade',      'Inserção de conteúdo na comunidade online do WhatsApp',      1,  4, 4, true)
  ON CONFLICT (team_id, name) DO UPDATE
    SET description = EXCLUDED.description,
        min_volunteers = EXCLUDED.min_volunteers,
        max_volunteers = EXCLUDED.max_volunteers,
        sort_order = EXCLUDED.sort_order,
        is_active = true;

  -- ── INTEGRAÇÃO ──────────────────────────────────────────────────────────
  INSERT INTO public.vol_teams (name, description, color, sort_order, is_active)
  VALUES ('Integração', 'Equipe de integração e acolhimento', '#00B39D', 20, true)
  ON CONFLICT (name) DO UPDATE
    SET description = COALESCE(public.vol_teams.description, EXCLUDED.description),
        sort_order  = EXCLUDED.sort_order,
        updated_at  = now()
  RETURNING id INTO t_id;

  INSERT INTO public.vol_positions (team_id, name, description, min_volunteers, max_volunteers, sort_order, is_active) VALUES
    (t_id, 'Estacionamento',     NULL,                       1, NULL, 1, true),
    (t_id, 'Recepção',           'Supervisores de culto',    1, NULL, 2, true),
    (t_id, 'Batismo',            NULL,                       1, NULL, 3, true),
    (t_id, 'Ceia',               NULL,                       1, NULL, 4, true),
    (t_id, 'Assistência Médica', NULL,                       1, NULL, 5, true),
    (t_id, 'Ofertório',          NULL,                       1, NULL, 6, true),
    (t_id, 'Intercessão',        NULL,                       1, NULL, 7, true)
  ON CONFLICT (team_id, name) DO UPDATE
    SET description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        is_active = true;

  -- ── KIDS ────────────────────────────────────────────────────────────────
  INSERT INTO public.vol_teams (name, description, color, sort_order, is_active)
  VALUES ('Kids', 'Ministério infantil', '#EC4899', 30, true)
  ON CONFLICT (name) DO UPDATE
    SET description = COALESCE(public.vol_teams.description, EXCLUDED.description),
        sort_order  = EXCLUDED.sort_order,
        updated_at  = now()
  RETURNING id INTO t_id;

  INSERT INTO public.vol_positions (team_id, name, description, min_volunteers, max_volunteers, sort_order, is_active) VALUES
    (t_id, 'Coordenação de Culto', NULL,                                            1, NULL, 1, true),
    (t_id, 'Recepção',             NULL,                                            1, NULL, 2, true),
    (t_id, 'Baby',                 'Servir com bebês até 2 anos',                   1, NULL, 3, true),
    (t_id, 'Little 3-4 anos',      'Sala Little — crianças de 3 a 4 anos',          1, NULL, 4, true),
    (t_id, 'Little 5-6 anos',      'Sala Little — crianças de 5 a 6 anos',          1, NULL, 5, true),
    (t_id, 'Elevate 7-8 anos',     'Sala Elevate — crianças de 7 a 8 anos',         1, NULL, 6, true),
    (t_id, 'Elevate 9-12 anos',    'Sala Elevate — crianças de 9 a 12 anos',        1, NULL, 7, true),
    (t_id, 'Inclusão',             'Servir com crianças que possuem algum espectro',1, NULL, 8, true),
    (t_id, 'Devocional',           'Devocional das crianças, produzido na semana',  1, NULL, 9, true)
  ON CONFLICT (team_id, name) DO UPDATE
    SET description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        is_active = true;

  -- ── PRODUÇÃO ──────────────────────────────────────────────────────────────
  INSERT INTO public.vol_teams (name, description, color, sort_order, is_active)
  VALUES ('Produção', 'Equipe de produção dos cultos', '#6366F1', 40, true)
  ON CONFLICT (name) DO UPDATE
    SET description = COALESCE(public.vol_teams.description, EXCLUDED.description),
        sort_order  = EXCLUDED.sort_order,
        updated_at  = now()
  RETURNING id INTO t_id;

  INSERT INTO public.vol_positions (team_id, name, description, min_volunteers, max_volunteers, sort_order, is_active) VALUES
    (t_id, 'Câmera',                       '8 câmeras', 1, 8,   1, true),
    (t_id, 'Projeção',                     'LED e online', 1, NULL, 2, true),
    (t_id, 'Diretor de Vídeo',             NULL,        1, NULL, 3, true),
    (t_id, 'Direção de Culto',             NULL,        1, NULL, 4, true),
    (t_id, 'Supervisor de Câmeras',        NULL,        1, NULL, 5, true),
    (t_id, 'Transmissão e Infraestrutura', NULL,        1, NULL, 6, true)
  ON CONFLICT (team_id, name) DO UPDATE
    SET description = EXCLUDED.description,
        max_volunteers = EXCLUDED.max_volunteers,
        sort_order = EXCLUDED.sort_order,
        is_active = true;

  -- ── VOLUNTARIADO (área própria) ───────────────────────────────────────────
  INSERT INTO public.vol_teams (name, description, color, sort_order, is_active)
  VALUES ('Voluntariado', 'Equipe da própria área de voluntariado', '#F59E0B', 50, true)
  ON CONFLICT (name) DO UPDATE
    SET description = COALESCE(public.vol_teams.description, EXCLUDED.description),
        sort_order  = EXCLUDED.sort_order,
        updated_at  = now()
  RETURNING id INTO t_id;

  INSERT INTO public.vol_positions (team_id, name, description, min_volunteers, max_volunteers, sort_order, is_active) VALUES
    (t_id, 'Check-in',  NULL,                                  1, NULL, 1, true),
    (t_id, 'Cozinha',   'Apenas para os cultos de domingo de manhã', 1, NULL, 2, true),
    (t_id, 'Cuidados',  'Apenas para o culto de quarta',       1, NULL, 3, true)
  ON CONFLICT (team_id, name) DO UPDATE
    SET description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        is_active = true;

  -- ── AMI ─────────────────────────────────────────────────────────────────
  INSERT INTO public.vol_teams (name, description, color, sort_order, is_active)
  VALUES ('AMI', 'Equipe do culto AMI', '#8B5CF6', 60, true)
  ON CONFLICT (name) DO UPDATE
    SET description = COALESCE(public.vol_teams.description, EXCLUDED.description),
        sort_order  = EXCLUDED.sort_order,
        updated_at  = now()
  RETURNING id INTO t_id;

  INSERT INTO public.vol_positions (team_id, name, description, min_volunteers, max_volunteers, sort_order, is_active) VALUES
    (t_id, 'Produção',     NULL,               1, NULL, 1, true),
    (t_id, 'Staff',        NULL,               1, NULL, 2, true),
    (t_id, 'Integração',   NULL,               1, NULL, 3, true),
    (t_id, 'Intercessão',  NULL,               1, NULL, 4, true),
    (t_id, 'Evangelismo',  NULL,               1, NULL, 5, true),
    (t_id, 'Cuidados',     NULL,               1, NULL, 6, true),
    (t_id, 'Voluntariado', 'Apenas o check-in',1, NULL, 7, true)
  ON CONFLICT (team_id, name) DO UPDATE
    SET description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        is_active = true;

  -- ── BRIDGE ────────────────────────────────────────────────────────────────
  INSERT INTO public.vol_teams (name, description, color, sort_order, is_active)
  VALUES ('Bridge', 'Equipe do culto Bridge (teens)', '#3B82F6', 70, true)
  ON CONFLICT (name) DO UPDATE
    SET description = COALESCE(public.vol_teams.description, EXCLUDED.description),
        sort_order  = EXCLUDED.sort_order,
        updated_at  = now()
  RETURNING id INTO t_id;

  INSERT INTO public.vol_positions (team_id, name, description, min_volunteers, max_volunteers, sort_order, is_active) VALUES
    (t_id, 'Produção', NULL, 1, NULL, 1, true),
    (t_id, 'Staff',    NULL, 1, NULL, 2, true),
    (t_id, 'Cuidados', NULL, 1, NULL, 3, true)
  ON CONFLICT (team_id, name) DO UPDATE
    SET description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        is_active = true;

  -- ── MARKETING ─────────────────────────────────────────────────────────────
  INSERT INTO public.vol_teams (name, description, color, sort_order, is_active)
  VALUES ('Marketing', 'Cobertura criativa dos cultos', '#F97316', 80, true)
  ON CONFLICT (name) DO UPDATE
    SET description = COALESCE(public.vol_teams.description, EXCLUDED.description),
        sort_order  = EXCLUDED.sort_order,
        updated_at  = now()
  RETURNING id INTO t_id;

  INSERT INTO public.vol_positions (team_id, name, description, min_volunteers, max_volunteers, sort_order, is_active) VALUES
    (t_id, 'Fotografia',         NULL,      1, NULL, 1, true),
    (t_id, 'Cobertura de Culto', 'Stories', 1, NULL, 2, true),
    (t_id, 'Designer',           NULL,      1, NULL, 3, true)
  ON CONFLICT (team_id, name) DO UPDATE
    SET description = EXCLUDED.description,
        sort_order = EXCLUDED.sort_order,
        is_active = true;
END $$;
