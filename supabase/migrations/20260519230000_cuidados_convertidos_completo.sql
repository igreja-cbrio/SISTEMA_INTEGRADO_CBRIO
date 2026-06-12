-- ============================================================================
-- Cuidados · aba Convertidos populada com TODOS os convertidos
--
-- Marcos (19/05/2026): "a aba de convertidos deve ser alimentada com todos
-- os convertidos. para os lideres de cuidados fazerem seus acompanhamentos.
-- deixe campos para observacoes, campos para marcar encontro marcado,
-- deixe uma opcao para tagear com alguma coisa, por exemplo, problema no
-- casamento, problema na familia e etc. e um modulo para cuidado com a
-- membresia."
--
-- Estrategia:
--   1) Extender `cui_convertidos` com 3 colunas pastorais
--      (encontro_marcado, data_encontro, tags[])
--   2) Backfill da tabela com convertidos que ja existem em outras fontes:
--        - cultos_decisoes_pessoas (sistema novo, modal de culto · skip kids)
--        - mem_membros + mem_trilha_valores etapa='conversao'
--          (cobre o backfill de 275 do form antigo + qualquer
--           cadastro pastoral antigo)
--   3) Trigger automatica · toda nova decisao em culto vira linha em
--      cui_convertidos pra o time pastoral abordar.
--
-- LGPD: kids ('tipo_decisao=kids') NAO entram em cui_convertidos
-- automaticamente · cadastro de menor exige intervencao pastoral consciente
-- via responsavel (mesma politica das outras triggers de decisoes).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colunas novas em cui_convertidos
-- ----------------------------------------------------------------------------
ALTER TABLE public.cui_convertidos
  ADD COLUMN IF NOT EXISTS encontro_marcado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_encontro    date,
  ADD COLUMN IF NOT EXISTS tags             text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_cui_conv_encontro
  ON public.cui_convertidos(encontro_marcado, data_encontro);

CREATE INDEX IF NOT EXISTS idx_cui_conv_tags
  ON public.cui_convertidos USING GIN (tags);

COMMENT ON COLUMN public.cui_convertidos.encontro_marcado IS
  'true = lider de cuidados ja marcou encontro pastoral com a pessoa';
COMMENT ON COLUMN public.cui_convertidos.data_encontro IS
  'Quando o encontro foi/sera realizado · NULL se ainda nao marcado';
COMMENT ON COLUMN public.cui_convertidos.tags IS
  'Tags livres pra triagem pastoral: casamento, familia, espiritual, saude, financeiro, luto, emocional, vicios, profissional, outro';

-- ----------------------------------------------------------------------------
-- 2. Backfill · cultos_decisoes_pessoas (excluindo kids)
-- ----------------------------------------------------------------------------
INSERT INTO public.cui_convertidos
  (data_culto, culto_id, membro_id, nome, telefone, cpf, observacoes,
   atendido_apos_culto, cadastrado, created_at)
SELECT
  c.data,
  dp.culto_id,
  dp.membro_id,
  TRIM(dp.nome),
  dp.telefone,
  dp.cpf,
  -- preserva observacao do registro + observacao de followup (se houver)
  NULLIF(
    TRIM(
      COALESCE(dp.observacoes, '') ||
      CASE
        WHEN dp.observacoes_followup IS NOT NULL AND length(trim(dp.observacoes_followup)) > 0
          THEN E'\nFollowup: ' || dp.observacoes_followup
        ELSE ''
      END
    ),
    ''
  ),
  -- atendido se o followup ja avancou alem de 'pendente'
  (dp.status_followup IN ('em_acompanhamento', 'integrado')),
  (dp.membro_id IS NOT NULL),
  dp.registrado_em
FROM public.cultos_decisoes_pessoas dp
JOIN public.cultos c ON c.id = dp.culto_id
WHERE COALESCE(dp.tipo_decisao, 'presencial') <> 'kids'
  AND NOT EXISTS (
    SELECT 1 FROM public.cui_convertidos cv
    WHERE (
      (cv.membro_id IS NOT NULL AND cv.membro_id = dp.membro_id)
      OR (
        cv.membro_id IS NULL
        AND lower(trim(cv.nome)) = lower(trim(dp.nome))
        AND cv.data_culto = c.data
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 3. Backfill · membros com etapa 'conversao' concluida que ainda nao
--    estao em cui_convertidos. Cobre o seed de 275 do form antigo
--    (20260519100000_importar_novos_convertidos) e qualquer outro fluxo
--    que tenha marcado a trilha de conversao sem passar pelo modal de culto.
-- ----------------------------------------------------------------------------
INSERT INTO public.cui_convertidos
  (data_culto, membro_id, nome, telefone, cpf, observacoes,
   atendido_apos_culto, cadastrado, created_at)
SELECT
  COALESCE(t.data_conclusao::date, m.created_at::date) AS data_culto,
  m.id,
  m.nome,
  m.telefone,
  m.cpf,
  NULL,
  false,   -- ainda nao atendido pelo time de cuidados
  true,    -- ja esta cadastrado em mem_membros
  COALESCE(t.created_at, m.created_at)
FROM public.mem_membros m
JOIN public.mem_trilha_valores t
  ON t.membro_id = m.id
 AND t.etapa = 'conversao'
 AND t.concluida = true
WHERE NOT EXISTS (
  SELECT 1 FROM public.cui_convertidos cv WHERE cv.membro_id = m.id
);

-- ----------------------------------------------------------------------------
-- 4. Trigger · toda decisao nova em culto vira convertido pra Cuidados
--    abordar. Roda DEPOIS da trigger que cria mem_membros (sufixo z pra
--    ordem alfabetica garantir execucao apos resolve_membro e jornada).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_cultos_dec_pessoas_to_cuidados()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_data_culto date;
BEGIN
  -- Kids fora · LGPD · cadastro de menor exige intervencao pastoral consciente
  IF COALESCE(NEW.tipo_decisao, 'presencial') = 'kids' THEN
    RETURN NEW;
  END IF;

  -- Acha a data do culto · culto_id ja foi validado pela trigger anterior
  SELECT data INTO v_data_culto FROM public.cultos WHERE id = NEW.culto_id;
  IF v_data_culto IS NULL THEN
    RETURN NEW;
  END IF;

  -- Dedup · se ja existe (por membro_id ou nome+data) nao duplica
  IF EXISTS (
    SELECT 1 FROM public.cui_convertidos cv
    WHERE (NEW.membro_id IS NOT NULL AND cv.membro_id = NEW.membro_id)
       OR (
         NEW.membro_id IS NULL
         AND lower(trim(cv.nome)) = lower(trim(NEW.nome))
         AND cv.data_culto = v_data_culto
       )
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.cui_convertidos
    (data_culto, culto_id, membro_id, nome, telefone, cpf,
     atendido_apos_culto, cadastrado, observacoes)
  VALUES
    (v_data_culto, NEW.culto_id, NEW.membro_id, TRIM(NEW.nome),
     NEW.telefone, NEW.cpf,
     false,  -- recem-criado · time de cuidados ainda nao atendeu
     (NEW.membro_id IS NOT NULL),
     NEW.observacoes);

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS z_dec_pessoas_to_cuidados ON public.cultos_decisoes_pessoas;
CREATE TRIGGER z_dec_pessoas_to_cuidados
  AFTER INSERT ON public.cultos_decisoes_pessoas
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_cultos_dec_pessoas_to_cuidados();

-- ----------------------------------------------------------------------------
-- Conferencia (rodar apos aplicar):
--   SELECT count(*) FROM cui_convertidos;
--   -- esperado: >= 275 (mais o que vier de cultos_decisoes_pessoas)
--
--   SELECT count(*) FROM cui_convertidos WHERE membro_id IS NOT NULL;
--   -- esperado: alta % vinculada (todo backfill de mem_membros tem)
--
--   SELECT count(*) FROM cui_convertidos WHERE encontro_marcado = true;
--   -- esperado: 0 (lideres vao marcar pela UI)
-- ============================================================================
