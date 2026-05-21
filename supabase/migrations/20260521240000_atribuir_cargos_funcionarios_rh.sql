-- =====================================================================
-- Atribuição de cargos formais a 19 funcionários do RH
-- =====================================================================
-- Auditoria de 2026-05-21 identificou que 19 funcionários ativos têm
-- login (usuarios row) + áreas atribuídas + acesso funcional via role
-- legado (profile.role), mas `usuarios.cargo_id = NULL`.
--
-- Quando o role legado for removido (futuro refactor), perderiam acesso.
-- Esta migration atribui o cargo formal canônico baseado em:
--   - Cargo do RH (`rh_funcionarios.cargo`)
--   - Áreas atribuídas (`usuario_areas`)
--   - Função executada (CLAUDE.md menciona alguns nomes específicos)
--
-- Idempotente: UPDATE ... WHERE LOWER(email) = ... · só atualiza quem ainda
-- não tem cargo (não sobrescreve atribuições manuais).
-- =====================================================================

DO $$
DECLARE v_pair RECORD;
BEGIN
  FOR v_pair IN
    SELECT * FROM (VALUES
      -- DIRETORIA
      ('eduardo@igrejacbrio.onmicrosoft.com', 'diretor-administrativo'),
      ('pedro.barreto@cbrio.org',             'pastor-senior'),
      ('juninho.lit@cbrio.org',               'pastor-presidente'),
      ('juliana.leao@cbrio.org',              'diretor-rh'),

      -- COORDENAÇÃO / LIDERANÇA MINISTERIAL
      ('wesley.ramos@cbrio.org',              'lider-ministerial'),   -- area Cuidados → boost
      ('nelio.paiva@cbrio.org',               'lider-ministerial'),   -- area Grupos → boost
      ('filipe.carmet@cbrio.org',             'lider-ministerial'),   -- multiplas areas
      ('jessica.salviano@cbrio.org',          'coordenador-voluntarios'),

      -- FINANCEIRO / OPERACIONAL
      ('francisco.sousa@cbrio.org',           'assistente-financeiro'), -- Chico (CLAUDE.md)

      -- TI / INFRAESTRUTURA
      ('diego.assis@cbrio.org',               'assistente-area'),     -- TI sem cargo específico
      ('erivelton@cbrio.org',                 'assistente-logistica'),
      ('pery.case@cbrio.org',                 'assistente-logistica'),
      ('elionardo.rodrigues@cbrio.org',       'assistente-operacoes'),
      ('leonardo.pinto@cbrio.org',            'assistente-operacoes'),
      ('marcelo.heredia@cbrio.org',           'assistente-operacoes'),

      -- ASSISTENTES MINISTERIAIS
      ('milena.rochet@cbrio.org',             'assistente-ministerial'),
      ('natasha.litwinczuk@cbrio.org',        'assistente-ministerial'),
      ('nicolle.litwinczuk@cbrio.org',        'assistente-ministerial'),

      -- DEV (Matheus · ja super-admin via app_super_admins)
      ('matheus.toscano@cbrio.org',           'dev')
    ) AS p(email, cargo_slug)
  LOOP
    UPDATE public.usuarios u
       SET cargo_id = c.id,
           updated_at = now()
      FROM public.cargos c
     WHERE LOWER(u.email) = LOWER(v_pair.email)
       AND c.slug = v_pair.cargo_slug
       AND c.ativo = true
       AND u.cargo_id IS NULL;  -- só atualiza quem nao tem cargo (preserva manual)
  END LOOP;
END $$;

-- Validação inline · mostra resultado
DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.usuarios u
  WHERE LOWER(u.email) IN (
    'eduardo@igrejacbrio.onmicrosoft.com','pedro.barreto@cbrio.org',
    'juninho.lit@cbrio.org','juliana.leao@cbrio.org',
    'wesley.ramos@cbrio.org','nelio.paiva@cbrio.org',
    'filipe.carmet@cbrio.org','jessica.salviano@cbrio.org',
    'francisco.sousa@cbrio.org','diego.assis@cbrio.org',
    'erivelton@cbrio.org','pery.case@cbrio.org',
    'elionardo.rodrigues@cbrio.org','leonardo.pinto@cbrio.org',
    'marcelo.heredia@cbrio.org','milena.rochet@cbrio.org',
    'natasha.litwinczuk@cbrio.org','nicolle.litwinczuk@cbrio.org',
    'matheus.toscano@cbrio.org'
  ) AND u.cargo_id IS NOT NULL;

  RAISE NOTICE 'Funcionarios com cargo atribuido (esperado 19): %', v_count;
END $$;
