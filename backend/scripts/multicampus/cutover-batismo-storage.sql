-- RASCUNHO: fora da sequência automática. Nunca executar antes de adaptar
-- App lib/batismo.ts, ERP batismoFotos/publicBatismo e leitores externos.
-- Fonte em 27/09/2026: bucket legado PUBLIC=true e zero objetos (read-only).
-- Estado pode mudar: recontar/revisar antes da execução e aprovar incompatibilidade.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.app_campus_config WHERE id AND estado='preparacao' AND NOT ja_ativado)
   OR NOT EXISTS(SELECT 1 FROM public.app_campus_cobertura WHERE frente='arquivos-exportacoes'
    AND api_validada AND rls_validada AND produtores_validados AND regressao_validada
    AND evidencia LIKE '%batismo-storage-privado-revisado%') THEN
  RAISE EXCEPTION 'Privatização do legado exige revisão dos leitores e evidência específica.';
 END IF;
END $$;
UPDATE storage.buckets SET public=false WHERE id='batismos';
CREATE POLICY batismo_legado_urls_assinadas ON storage.objects AS RESTRICTIVE
 FOR SELECT TO anon,authenticated USING(bucket_id<>'batismos');
COMMIT;
