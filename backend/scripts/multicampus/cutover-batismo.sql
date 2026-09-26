-- RASCUNHO DE CUTOVER; fora da sequência automática por decisão explícita.
-- Antes de promover para migration: adaptar serviços/API/fan-out/jobs de batismo,
-- provar onConflict igreja_id,data e igreja_id,horario, revisar todos consumidores,
-- confirmar os testes e obter aprovação para troca da PK. NÃO executar agora.
BEGIN;
LOCK TABLE public.batismo_eventos,public.batismo_horarios IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.app_campus_config WHERE id AND estado='preparacao' AND NOT ja_ativado)
    OR NOT EXISTS(SELECT 1 FROM public.app_campus_cobertura WHERE frente='batismo'
      AND api_validada AND rls_validada AND produtores_validados AND regressao_validada
      AND evidencia LIKE '%batismo-cutover-revisado%') THEN
    RAISE EXCEPTION 'Cutover do batismo exige preparação e evidência específica dos consumidores adaptados.';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_constraint WHERE confrelid='public.batismo_eventos'::regclass
    AND confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.batismo_eventos'::regclass AND attname='data')]::smallint[]) THEN
    RAISE EXCEPTION 'Existe FK legada por data. Migrar consumidor antes do cutover.';
  END IF;
END $$;
ALTER TABLE public.batismo_eventos DROP CONSTRAINT batismo_eventos_pkey;
ALTER TABLE public.batismo_eventos ADD PRIMARY KEY(id);
DROP INDEX public.uq_batismo_horarios_horario;
-- RPC antiga permanece compatível SOMENTE durante preparação. Fora dela,
-- fn_campus_legado_escrita falha fechado, exigindo RPC com campus explícito.
CREATE OR REPLACE FUNCTION public.fn_batismo_datas_abertas(p_n integer DEFAULT 3)
RETURNS TABLE(data date) LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT e.data FROM public.fn_campus_batismo_datas_abertas(public.fn_campus_legado_escrita(),p_n) e;
$$;
COMMIT;
