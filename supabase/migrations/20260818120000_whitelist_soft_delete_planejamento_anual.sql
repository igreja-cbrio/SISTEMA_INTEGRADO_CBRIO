-- Restaura na whitelist de soft-delete as tabelas do módulo Planejamento
-- Anual que o CÓDIGO já assume como soft-deletáveis (documentado no COMMENT
-- da própria migration `20260812120000_planejamento_anual_modulo.sql`) e que
-- tinham sumido da lista: `plan_propostas`, `plan_avaliacoes`,
-- `plan_apontamentos`.
--
-- ⚠️⚠️ POR QUE SUMIRAM (medido em 18/08/2026, mesma causa raiz de
-- `20260817180000_whitelist_soft_delete_restaura_perdidas.sql`): a migration
-- `20260814160000_time_agentes_fase0` fez `CREATE OR REPLACE` da
-- `app_soft_deletable_tables()` com uma lista ESTÁTICA. Tudo que tinha sido
-- acrescentado por PATCH DINÂMICO antes dela foi apagado em silêncio —
-- as 3 tabelas de `plan_*` entraram pela `20260812120000` (seção 15, dois
-- dias antes) e não estavam mais lá. A correção de 17/08 já restaurou
-- `vol_inscricoes`/`prop_proposta`/`whatsapp_lideres`, mas sua varredura não
-- alcançou o módulo Planejamento Anual — esta migration fecha essa lacuna.
--
-- ⚠️ Nada quebrou de forma visível em produção: o backend do módulo
-- (`backend/routes/planejamentoAnual.js`) nunca chamou a RPC
-- `app_soft_delete()` — sempre fez `UPDATE deleted_at` direto (roda com
-- service_role, bypassa RLS). O furo só apareceu ao tentar soft-deletar uma
-- proposta de teste pela RPC (o caminho documentado como "correto" no
-- CLAUDE.md), que recusou com "Tabela plan_propostas nao esta na whitelist".
--
-- ⚠️ PATCH DINÂMICO sobre a definição VIVA — é a técnica que a
-- 20260814160000 não usou, e é exatamente por isso que esta migration existe.
-- Idempotente: se as 3 já estiverem lá, não faz nada.
DO $$
DECLARE
  v_lista text;
  v_sql   text;
BEGIN
  IF 'plan_propostas' = ANY(public.app_soft_deletable_tables())
     AND 'plan_avaliacoes' = ANY(public.app_soft_deletable_tables())
     AND 'plan_apontamentos' = ANY(public.app_soft_deletable_tables()) THEN
    RAISE NOTICE 'as tres ja estao na whitelist - nada a fazer';
    RETURN;
  END IF;

  SELECT string_agg(quote_literal(t), ', ' ORDER BY t) INTO v_lista
  FROM (
    SELECT unnest(public.app_soft_deletable_tables()) AS t
    UNION SELECT 'plan_propostas'
    UNION SELECT 'plan_avaliacoes'
    UNION SELECT 'plan_apontamentos'
  ) s;

  v_sql := 'CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables() '
        || 'RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $body$ SELECT ARRAY['
        || v_lista || ']::TEXT[] $body$';
  EXECUTE v_sql;

  RAISE NOTICE 'whitelist atualizada';
END $$;
