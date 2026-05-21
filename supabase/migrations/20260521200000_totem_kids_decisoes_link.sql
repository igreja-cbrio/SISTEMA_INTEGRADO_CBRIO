-- ============================================================================
-- Totem Kids · vincular decisoes a kids_criancas (rastreabilidade)
--
-- Marcos (2026-05-21): "futuramente atrelar o dado de frequencia do kids aos
-- check-ins e ao lançar os dados de conversão, vincular com as crianças
-- presentes no dia, da uma validação maior, vamos ter o id certo e podemos
-- inclusive contar se uma criança se decidiu mais de uma vez, deixe essa
-- lógica funcionando no sistema".
--
-- Mudancas:
--   1. Adiciona coluna kids_crianca_id em cultos_decisoes_pessoas (FK opcional)
--   2. Refaz trigger fn_kids_decisao_para_culto pra preencher kids_crianca_id
--      e usar como chave de unicidade dentro da sessao (em vez de nome)
--   3. View vw_kids_decisoes_historico_crianca · contagem por crianca
--   4. View vw_kids_criancas_presentes_sessao · usada pelo backend pra UI
--      de decisoes selecionar so quem fez check-in no culto
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Coluna kids_crianca_id em cultos_decisoes_pessoas
-- ----------------------------------------------------------------------------
ALTER TABLE public.cultos_decisoes_pessoas
  ADD COLUMN IF NOT EXISTS kids_crianca_id uuid
    REFERENCES public.kids_criancas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cultos_dec_pessoas_kids_crianca
  ON public.cultos_decisoes_pessoas (kids_crianca_id)
  WHERE kids_crianca_id IS NOT NULL;

COMMENT ON COLUMN public.cultos_decisoes_pessoas.kids_crianca_id IS
  'Quando tipo_decisao=kids · referencia o cadastro da crianca no Totem Kids. Permite contar quantas vezes a mesma crianca decidiu (em cultos diferentes) e validar que decisao tem origem em check-in real.';

-- ----------------------------------------------------------------------------
-- 2. Refaz trigger fn_kids_decisao_para_culto · agora preenche kids_crianca_id
--    Idempotencia por (culto_id, kids_crianca_id) · permite contar decisoes
--    em cultos diferentes pra mesma crianca, mas evita duplicidade dentro
--    do mesmo culto.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_kids_decisao_para_culto()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_culto_id uuid;
  v_crianca_nome text;
  v_cpf_resp text;
BEGIN
  IF NEW.fez_decisao_jesus = true
     AND (OLD.fez_decisao_jesus IS DISTINCT FROM NEW.fez_decisao_jesus) THEN

    SELECT culto_id INTO v_culto_id
      FROM public.kids_sessoes WHERE id = NEW.sessao_id;

    SELECT nome INTO v_crianca_nome
      FROM public.kids_criancas WHERE id = NEW.crianca_id;

    IF NEW.responsavel_checkin_id IS NOT NULL THEN
      SELECT cpf INTO v_cpf_resp
        FROM public.mem_membros WHERE id = NEW.responsavel_checkin_id;
    END IF;

    -- Idempotencia por kids_crianca_id no MESMO culto.
    -- Em cultos diferentes, mesma crianca cria registros distintos
    -- (Marcos quer contar quantas vezes decidiu).
    IF NOT EXISTS (
      SELECT 1 FROM public.cultos_decisoes_pessoas
       WHERE culto_id = v_culto_id
         AND tipo_decisao = 'kids'
         AND kids_crianca_id = NEW.crianca_id
    ) THEN
      INSERT INTO public.cultos_decisoes_pessoas (
        culto_id, tipo_decisao, nome,
        responsavel_nome, responsavel_telefone, responsavel_cpf,
        data_decisao, kids_crianca_id
      ) VALUES (
        v_culto_id, 'kids', v_crianca_nome,
        NEW.responsavel_checkin_nome,
        NEW.responsavel_checkin_telefone,
        v_cpf_resp,
        CURRENT_DATE,
        NEW.crianca_id
      );
    END IF;

    IF NEW.decisao_jesus_em IS NULL THEN
      NEW.decisao_jesus_em := now();
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Trigger ja existe (criado na 20260521160000), so atualiza funcao acima
-- via CREATE OR REPLACE · trigger continua apontando pra mesma funcao.

-- ----------------------------------------------------------------------------
-- 3. View historico de decisoes por crianca
--    Conta quantas vezes cada crianca decidiu, em quais cultos, ordenado
--    cronologicamente. Util pra UI mostrar "X 'a vez que decide".
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.vw_kids_decisoes_historico_crianca;

CREATE VIEW public.vw_kids_decisoes_historico_crianca AS
SELECT
  dp.id AS decisao_id,
  dp.kids_crianca_id AS crianca_id,
  k.nome AS crianca_nome,
  k.data_nascimento,
  dp.culto_id,
  c.nome AS culto_nome,
  c.data AS data_culto,
  dp.data_decisao,
  dp.responsavel_nome,
  -- Numero sequencial da decisao pra essa crianca
  ROW_NUMBER() OVER (
    PARTITION BY dp.kids_crianca_id
    ORDER BY COALESCE(dp.data_decisao, c.data), dp.id
  ) AS sequencia_decisao,
  -- Total de decisoes que essa crianca ja teve (no historico todo)
  COUNT(*) OVER (PARTITION BY dp.kids_crianca_id) AS total_decisoes_crianca
FROM public.cultos_decisoes_pessoas dp
JOIN public.kids_criancas k ON k.id = dp.kids_crianca_id
JOIN public.cultos c ON c.id = dp.culto_id
WHERE dp.tipo_decisao = 'kids'
  AND dp.kids_crianca_id IS NOT NULL;

GRANT SELECT ON public.vw_kids_decisoes_historico_crianca TO authenticated, service_role;

COMMENT ON VIEW public.vw_kids_decisoes_historico_crianca IS
  'Historico de decisoes por crianca · 1 row por decisao. sequencia_decisao numera de 1 em diante cronologicamente · total_decisoes_crianca diz quantas vezes a crianca ja decidiu (todas iguais por crianca).';

-- ----------------------------------------------------------------------------
-- 4. View resumo · 1 row por crianca com total de decisoes
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.vw_kids_decisoes_resumo_crianca;

CREATE VIEW public.vw_kids_decisoes_resumo_crianca AS
SELECT
  k.id AS crianca_id,
  k.nome,
  k.data_nascimento,
  k.familia_id,
  COUNT(dp.*) AS total_decisoes,
  MIN(COALESCE(dp.data_decisao, c.data)) AS primeira_decisao_em,
  MAX(COALESCE(dp.data_decisao, c.data)) AS ultima_decisao_em
FROM public.kids_criancas k
LEFT JOIN public.cultos_decisoes_pessoas dp
       ON dp.kids_crianca_id = k.id AND dp.tipo_decisao = 'kids'
LEFT JOIN public.cultos c ON c.id = dp.culto_id
WHERE k.ativo = true
GROUP BY k.id, k.nome, k.data_nascimento, k.familia_id;

GRANT SELECT ON public.vw_kids_decisoes_resumo_crianca TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. View crianças presentes na sessao · pra UI de decisoes selecionar
--    so quem fez check-in real no culto
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.vw_kids_criancas_presentes_sessao;

CREATE VIEW public.vw_kids_criancas_presentes_sessao AS
SELECT
  ci.id AS checkin_id,
  ci.sessao_id,
  ci.crianca_id,
  k.nome AS crianca_nome,
  k.data_nascimento,
  k.foto_url,
  k.observacoes_medicas,
  ci.sala_id,
  sala.nome AS sala_nome,
  sala.cor AS sala_cor,
  ci.checkin_at,
  ci.checkout_at,
  ci.fez_decisao_jesus,
  ci.codigo_seguranca,
  -- Contagem de decisoes anteriores (nao conta a do culto atual ainda)
  (
    SELECT COUNT(*) FROM public.cultos_decisoes_pessoas dp
    JOIN public.kids_sessoes s2 ON s2.culto_id = dp.culto_id
    WHERE dp.kids_crianca_id = ci.crianca_id
      AND dp.tipo_decisao = 'kids'
      AND s2.id <> ci.sessao_id
  ) AS decisoes_anteriores
FROM public.kids_checkins ci
JOIN public.kids_criancas k ON k.id = ci.crianca_id
JOIN public.kids_salas sala ON sala.id = ci.sala_id;

GRANT SELECT ON public.vw_kids_criancas_presentes_sessao TO authenticated, service_role;

COMMENT ON VIEW public.vw_kids_criancas_presentes_sessao IS
  'Lista de criancas com check-in numa sessao especifica · usada pela UI de decisoes pra mostrar so quem realmente esta no culto. decisoes_anteriores diz quantas vezes a crianca ja decidiu antes (alem da atual).';

-- ----------------------------------------------------------------------------
-- 6. Backfill · vincula registros existentes em cultos_decisoes_pessoas
--    a kids_criancas quando der match por nome + data_decisao + sessao
--    (best effort · pra historico antigo nao perder rastreabilidade)
-- ----------------------------------------------------------------------------
UPDATE public.cultos_decisoes_pessoas dp
   SET kids_crianca_id = ci.crianca_id
  FROM public.kids_checkins ci
  JOIN public.kids_sessoes s ON s.id = ci.sessao_id
  JOIN public.kids_criancas k ON k.id = ci.crianca_id
 WHERE dp.tipo_decisao = 'kids'
   AND dp.kids_crianca_id IS NULL
   AND dp.culto_id = s.culto_id
   AND lower(trim(dp.nome)) = lower(trim(k.nome))
   AND ci.fez_decisao_jesus = true;

COMMIT;

-- ============================================================================
-- Conferencia:
--   \d cultos_decisoes_pessoas              -- ve coluna kids_crianca_id
--   SELECT * FROM vw_kids_decisoes_resumo_crianca ORDER BY total_decisoes DESC;
--   SELECT crianca_nome, sequencia_decisao, total_decisoes_crianca, culto_nome, data_culto
--     FROM vw_kids_decisoes_historico_crianca ORDER BY crianca_nome, sequencia_decisao;
--   SELECT crianca_nome, decisoes_anteriores FROM vw_kids_criancas_presentes_sessao
--    WHERE sessao_id = '<id>' ORDER BY crianca_nome;
-- ============================================================================
