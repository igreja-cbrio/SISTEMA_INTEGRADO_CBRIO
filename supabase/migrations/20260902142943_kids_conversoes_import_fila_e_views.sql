-- ============================================================================
-- KIDS · decisões de fé importadas de planilha + FILA de conferência (2026-09-02)
-- APLICADA EM PRODUÇÃO em 02/09/2026 (registrada como 20260902142943).
--
-- Pedido do Matheus: "vinculasse a cada criança se der" · "pode fazer, inclusive
-- deixar o kids-02 subir" · "preciso de uma tela para gerenciar as decisoes".
--
-- ⚠️⚠️ MEDIDO ANTES: `cultos.decisoes_kids` = ZERO em 26 das 27 datas da
-- planilha (só 30/08 tinha 20). A planilha NÃO contradizia o agregado — era a
-- ÚNICA fonte que existia. KIDS-02 publicava 0 em 13 das 14 últimas semanas.
-- E `kids_checkins.fez_decisao_jesus` era `true` em 0 de 1.740 check-ins.
--
-- ⚠️ ESTE ARQUIVO É O SCHEMA. A carga das 66 linhas e o reparo de dado foram
-- aplicados junto, em produção, e vivem em
--   backend/scripts/_reparo_kids_conversoes_planilha_20260902.sql
-- (num replay do zero: aplicar esta migration e depois rodar o script).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · `fonte` ganha o valor de IMPORTAÇÃO (proveniência)
-- ⚠️ Importar como 'manual' LAVARIA a proveniência: as linhas importadas
-- ficariam indistinguíveis das digitadas por uma pessoa no culto.
-- ⚠️ A lista é DERIVADA do CHECK VIVO (lei da casa: lista estática num
-- CREATE OR REPLACE é remoção silenciosa disfarçada de acréscimo).
-- ----------------------------------------------------------------------------
DO $$
DECLARE v_def text; v_novo text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def FROM pg_constraint
   WHERE conrelid = 'public.cultos_decisoes_pessoas'::regclass
     AND conname  = 'cultos_decisoes_pessoas_fonte_check';
  IF v_def IS NULL THEN RAISE EXCEPTION 'DRIFT: CHECK de fonte nao encontrado'; END IF;
  IF position('importacao_planilha_kids' in v_def) > 0 THEN
    RAISE NOTICE 'idempotente: valor ja esta no CHECK'; RETURN;
  END IF;
  IF NOT (v_def LIKE '%manual%' AND v_def LIKE '%form_publico%' AND v_def LIKE '%chat%'
          AND v_def LIKE '%app%' AND v_def LIKE '%link_culto%') THEN
    RAISE EXCEPTION 'DRIFT: CHECK de fonte com forma inesperada: %', v_def;
  END IF;
  v_novo := replace(v_def, ']))', ', ''importacao_planilha_kids''::text]))');
  IF v_novo = v_def THEN RAISE EXCEPTION 'DRIFT: nao derivei o CHECK novo de: %', v_def; END IF;
  EXECUTE 'ALTER TABLE public.cultos_decisoes_pessoas DROP CONSTRAINT cultos_decisoes_pessoas_fonte_check';
  EXECUTE 'ALTER TABLE public.cultos_decisoes_pessoas ADD CONSTRAINT cultos_decisoes_pessoas_fonte_check ' || v_novo;
END $$;

-- ----------------------------------------------------------------------------
-- 2 · IDEMPOTÊNCIA — `cultos_decisoes_pessoas` não tem NENHUM índice único
-- ⚠️ Sem isto, rodar o import duas vezes cria 132 linhas. O trigger
-- fn_kids_decisao_para_culto se protege com NOT EXISTS em plpgsql, que não
-- alcança o INSERT direto das linhas pré-totem.
-- ⚠️ PARCIAL só nesta fonte: não impõe regra nova às 158 linhas existentes.
-- NULLS NOT DISTINCT porque culto_id é nulo nas de domingo manhã — sem isso
-- elas escapariam justamente da unicidade que precisam.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_cdp_import_planilha_kids
  ON public.cultos_decisoes_pessoas (kids_crianca_id, decidiu_em, culto_id)
  NULLS NOT DISTINCT
  WHERE fonte = 'importacao_planilha_kids' AND deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- 3 · A FILA (tabela de produto, com tela) + trilha do reparo no mesmo lugar
-- ⚠️ PII de MENOR + convicção religiosa (LGPD art. 5º II + art. 14 §1º):
-- nasce com deleted_at + índice parcial + RLS do módulo kids. Sem policy para
-- anon. Escrita só nível 3.
-- ⚠️ `data_conversao_antes` é o UNDO (medido: NULL em 4.386/4.386 antes).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kids_conversoes_import (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lote                 text NOT NULL,
  linha                int  NOT NULL,
  nome_planilha        text NOT NULL,
  nome_norm_planilha   text NOT NULL,
  nome_base_pin        text,
  idade_planilha       int,
  tel_planilha         text,
  data_decisao         date NOT NULL,
  periodo              text CHECK (periodo IS NULL OR periodo IN ('manha','noite')),
  culto_txt            text NOT NULL,
  obs_planilha         text,
  faixa                text NOT NULL CHECK (faixa IN ('A','B')),
  motivo               text NOT NULL,
  crianca_id           uuid REFERENCES public.kids_criancas(id) ON DELETE SET NULL,
  culto_id             uuid REFERENCES public.cultos(id) ON DELETE SET NULL,
  culto_origem         text,
  decisao_id           uuid REFERENCES public.cultos_decisoes_pessoas(id) ON DELETE SET NULL,
  data_conversao_antes date,
  status               text NOT NULL DEFAULT 'pendente'
                       CHECK (status IN ('aplicada','pendente','resolvida','descartada')),
  decidido_por         uuid,
  decidido_em          timestamptz,
  decisao_nota         text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz,
  CONSTRAINT uq_kids_conv_import_lote_linha UNIQUE (lote, linha)
);

CREATE INDEX IF NOT EXISTS idx_kids_conv_import_ativo
  ON public.kids_conversoes_import (status, data_decisao) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_kids_conv_import_crianca
  ON public.kids_conversoes_import (crianca_id) WHERE deleted_at IS NULL AND crianca_id IS NOT NULL;

COMMENT ON TABLE public.kids_conversoes_import IS
  'Decisoes de fe de criancas importadas de planilha + fila de conferencia humana. '
  'faixa A = casou com >=1 corroborador independente (check-in na data / idade exata / telefone do responsavel) e virou vinculo. '
  'faixa B = ambiguidade ou contradicao: NAO grava, espera a coordenacao do Kids. '
  'status aplicada|pendente|resolvida|descartada. As linhas do lote SEMPRE fecham aqui (lei da ausencia declarada). '
  'PII de menor + conviccao religiosa: LGPD art.5 II + art.14 §1.';
COMMENT ON COLUMN public.kids_conversoes_import.data_conversao_antes IS
  'Valor de kids_criancas.data_conversao ANTES do reparo. E o undo.';
COMMENT ON COLUMN public.kids_conversoes_import.culto_origem IS
  'checkin = o culto veio do check-in da propria crianca naquela data (mais forte) · '
  'turno_unico = o dia tinha exatamente 1 culto no turno declarado · '
  'nao_resolvido = domingo manha tem 2 a 3 cultos candidatos, culto_id fica NULO (chutar seria inventar fato).';

ALTER TABLE public.kids_conversoes_import ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kids_conv_import_select  ON public.kids_conversoes_import;
DROP POLICY IF EXISTS kids_conv_import_update  ON public.kids_conversoes_import;
DROP POLICY IF EXISTS kids_conv_import_service ON public.kids_conversoes_import;

CREATE POLICY kids_conv_import_select ON public.kids_conversoes_import
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('kids') >= 1 OR public.is_super_admin());

CREATE POLICY kids_conv_import_update ON public.kids_conversoes_import
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('kids') >= 3 OR public.is_super_admin())
  WITH CHECK (public.current_user_module_level('kids') >= 3 OR public.is_super_admin());

CREATE POLICY kids_conv_import_service ON public.kids_conversoes_import
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ⚠️ whitelist de soft-delete: PATCH DINÂMICO sobre a definição VIVA (lei de
-- 17/08 — lista estática num CREATE OR REPLACE apaga em silêncio o que entrou
-- por patch antes, e o sintoma aparece meses depois em OUTRO módulo).
DO $$
DECLARE v_lista text; v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM unnest(public.app_soft_deletable_tables()) t
   WHERE t = 'kids_conversoes_import';
  IF v_n > 0 THEN RAISE NOTICE 'idempotente: ja esta na whitelist'; RETURN; END IF;

  SELECT string_agg(quote_literal(t), ', ' ORDER BY t) INTO v_lista
    FROM (SELECT unnest(public.app_soft_deletable_tables()) AS t
          UNION SELECT 'kids_conversoes_import') s;
  IF v_lista IS NULL THEN RAISE EXCEPTION 'DRIFT: whitelist viva veio vazia'; END IF;

  EXECUTE 'CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables() '
       || 'RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $f$ SELECT ARRAY['
       || v_lista || ']::TEXT[] $f$';
END $$;

-- ----------------------------------------------------------------------------
-- 4 · As duas views do Kids passam a DIZER A VERDADE sobre a data
-- ⚠️⚠️ Elas datavam a decisão por `registrado_em::date` = quando foi DIGITADO.
-- `decidiu_em` existe desde 27/08 (leva do replay da decisão online) e NENHUMA
-- das duas o lia — foi criado 3 meses depois delas. Sem este conserto, as
-- decisões de jan..ago apareceriam todas como 02/09/2026, e o replay de 27/08
-- continuaria datado errado. `coalesce` mantém as 158 linhas existentes byte a
-- byte (decidiu_em nulo nelas cai no comportamento de hoje).
-- ⚠️⚠️ E o INNER JOIN em `cultos` fazia a linha com culto_id NULO DESAPARECER do
-- histórico da criança — ausência silenciosa, que a lei da casa proíbe. Vira
-- LEFT JOIN: decisão sem culto identificado continua sendo decisão. Era no-op
-- na aplicação (0 linhas kids com culto_id nulo naquele momento).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_kids_decisoes_historico_crianca AS
 SELECT dp.id AS decisao_id,
    dp.kids_crianca_id AS crianca_id,
    k.nome AS crianca_nome,
    k.data_nascimento,
    dp.culto_id,
    c.nome AS culto_nome,
    c.data AS data_culto,
    coalesce(dp.decidiu_em, (dp.registrado_em)::date) AS data_decisao,
    dp.responsavel_nome,
    row_number() OVER (PARTITION BY dp.kids_crianca_id
      ORDER BY coalesce(dp.decidiu_em, (dp.registrado_em)::date), dp.registrado_em, dp.id) AS sequencia_decisao,
    count(*) OVER (PARTITION BY dp.kids_crianca_id) AS total_decisoes_crianca
   FROM ((cultos_decisoes_pessoas dp
     JOIN kids_criancas k ON ((k.id = dp.kids_crianca_id)))
     LEFT JOIN cultos c ON ((c.id = dp.culto_id)))
  WHERE ((dp.tipo_decisao = 'kids'::text) AND (dp.kids_crianca_id IS NOT NULL));

CREATE OR REPLACE VIEW public.vw_kids_decisoes_resumo_crianca AS
 SELECT k.id AS crianca_id,
    k.nome,
    k.data_nascimento,
    k.familia_id,
    count(dp.*) AS total_decisoes,
    min(coalesce(dp.decidiu_em, (dp.registrado_em)::date)) AS primeira_decisao_em,
    max(coalesce(dp.decidiu_em, (dp.registrado_em)::date)) AS ultima_decisao_em
   FROM (kids_criancas k
     LEFT JOIN cultos_decisoes_pessoas dp ON (((dp.kids_crianca_id = k.id) AND (dp.tipo_decisao = 'kids'::text))))
  WHERE (k.ativo = true)
  GROUP BY k.id, k.nome, k.data_nascimento, k.familia_id;

-- ============================================================================
-- CONFERÊNCIA (rodar depois · no CATÁLOGO, não no "success")
-- ============================================================================
-- select pg_get_constraintdef(oid) from pg_constraint
--  where conrelid='public.cultos_decisoes_pessoas'::regclass and conname='cultos_decisoes_pessoas_fonte_check';
--   -> tem 'importacao_planilha_kids'
-- select count(*) from unnest(app_soft_deletable_tables()) t where t='kids_conversoes_import'; -> 1
-- select count(*) from pg_policies where tablename='kids_conversoes_import'; -> 3
--
-- ROLLBACK (o que dá pra desfazer):
--   drop view ... e recolar a definição anterior (INNER JOIN + registrado_em::date)
--   drop table public.kids_conversoes_import;
--   drop index public.uq_cdp_import_planilha_kids;
--   -- o valor no CHECK de fonte só sai depois de não haver linha usando ele
-- ⚠️ NÃO se desfaz: nada aqui escreve decisão. O reparo de dado tem rollback
-- próprio, no script.
-- ============================================================================
