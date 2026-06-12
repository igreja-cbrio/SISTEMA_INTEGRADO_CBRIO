-- ============================================================================
-- Totem Kids · seed inicial
--
-- 1. Cinco salas padrao (Bercario / Maternal / Infantil 1 / Infantil 2 / Pre-AMI)
--    vinculadas à CBRio Sede. Mariane ajusta capacidade/divisao depois pela UI.
-- 2. Uma estacao default (vai precisar o admin configurar o IP da Brother).
-- 3. Ajuste de permissoes:
--    - coordenador-kids ja tem nivel 5 via boost de area KIDS (auth.js)
--    - admin sempre passa (backward compat em authorizeModule)
--    - lider Kids do dia: middleware customizado verifica vol_check_ins
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Seed das 5 salas padrao (CBRio Sede)
-- ----------------------------------------------------------------------------
INSERT INTO public.kids_salas
  (nome, faixa_etaria_min_meses, faixa_etaria_max_meses, capacidade, cor, igreja_id, ordem, ativo)
VALUES
  ('Berçário',    0,   24, 20, '#F472B6', '00000000-0000-0000-0000-000000000001', 1, true),  -- pink-400
  ('Maternal',   25,   47, 25, '#EC4899', '00000000-0000-0000-0000-000000000001', 2, true),  -- pink-500
  ('Infantil 1', 48,   83, 30, '#DB2777', '00000000-0000-0000-0000-000000000001', 3, true),  -- pink-600
  ('Infantil 2', 84,  119, 30, '#BE185D', '00000000-0000-0000-0000-000000000001', 4, true),  -- pink-700
  ('Pré-AMI',   120,  155, 25, '#9D174D', '00000000-0000-0000-0000-000000000001', 5, true)   -- pink-800
ON CONFLICT (nome) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. Uma estacao default (manned) · admin preenche printer_target depois
-- ----------------------------------------------------------------------------
INSERT INTO public.kids_estacoes (nome, tipo, printer_modelo, ativo)
VALUES ('Totem Recepção 1', 'manned', 'QL-820NWB', true)
ON CONFLICT (nome) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Conferencia da matriz · coord-kids
-- A migration 20260520150000_cultos_finalizacao.sql ja criou o cargo
-- 'coordenador-kids' e o middleware AREA_MODULO_BOOST eleva pra nivel 5
-- automatico pra quem tem area KIDS. Vamos so garantir o nivel 3 default
-- de leitura/escrita na matriz pro modulo kids (alem do boost).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_cargo_id int;
  v_modulo_id int;
BEGIN
  SELECT id INTO v_cargo_id FROM public.cargos WHERE slug = 'coordenador-kids';
  SELECT id INTO v_modulo_id FROM public.modulos WHERE slug = 'kids';

  IF v_cargo_id IS NOT NULL AND v_modulo_id IS NOT NULL THEN
    INSERT INTO public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
    VALUES (v_cargo_id, v_modulo_id, 3, false, true, false)
    ON CONFLICT (cargo_id, modulo_id) DO UPDATE
      SET nivel = GREATEST(public.cargo_modulo_permissao.nivel, 3),
          pode_aprovar = true,   -- coord-kids pode aprovar override
          updated_at = now();
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Comentarios nas tabelas pra documentar contexto
-- ----------------------------------------------------------------------------
COMMENT ON TABLE public.kids_criancas IS
  'Cadastro minimo de criancas do ministerio Kids. NAO vira mem_membros (decisao LGPD 2026-05-18). Sem CPF da crianca. Foto opcional com consentimento.';

COMMENT ON TABLE public.kids_responsaveis IS
  'M:N entre crianca e mem_membros · quem pode entregar/buscar. Multiplos por crianca (mae, pai, avos, etc).';

COMMENT ON TABLE public.kids_salas IS
  'Salas fisicas do Kids · faixa etaria em meses · capacidade · cor pra UI/etiqueta. Multi-campus via igreja_id.';

COMMENT ON TABLE public.kids_sessoes IS
  '1 sessao por culto (culto_id UNIQUE). Status agendada→aberta→encerrada. Ao encerrar, trigger consolida cultos.presencial_kids.';

COMMENT ON TABLE public.kids_estacoes IS
  'Totem fisico com sua impressora Brother. printer_target=IP:9100. tipo=manned (MVP) · self e roster ficam para fase seguinte.';

COMMENT ON TABLE public.kids_checkins IS
  '1 checkin por (sessao, crianca). codigo_seguranca de 4 chars unico entre abertos. Snapshot do responsavel pra UI nao quebrar.';

COMMENT ON TABLE public.kids_etiquetas_log IS
  'Auditoria de cada impressao. Suporta reimpressao quando etiqueta rasga ou impressora falha.';

COMMIT;

-- ============================================================================
-- Conferencia:
--   SELECT nome, faixa_etaria_min_meses, faixa_etaria_max_meses, capacidade FROM kids_salas ORDER BY ordem;
--   SELECT nome, tipo, printer_modelo FROM kids_estacoes;
--   SELECT cmp.nivel FROM cargo_modulo_permissao cmp
--     JOIN cargos c ON c.id = cmp.cargo_id
--     JOIN modulos m ON m.id = cmp.modulo_id
--     WHERE c.slug = 'coordenador-kids' AND m.slug = 'kids';
-- ============================================================================
