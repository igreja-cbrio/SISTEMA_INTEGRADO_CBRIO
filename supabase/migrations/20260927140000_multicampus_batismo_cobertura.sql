-- Sinais pessoais mínimos, derivados exclusivamente de convertidos locais.
BEGIN;
CREATE OR REPLACE FUNCTION public.fn_campus_batismo_sinais(p_igreja_id uuid,p_convertido_ids uuid[])
RETURNS TABLE(registro_id uuid,batizado boolean,inscrito boolean)
LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE ids uuid[];
BEGIN
 IF p_igreja_id IS NULL OR p_convertido_ids IS NULL OR cardinality(p_convertido_ids)>500
   OR array_position(p_convertido_ids,NULL) IS NOT NULL THEN
   RAISE EXCEPTION 'Atos locais inválidos.' USING ERRCODE='23514';
 END IF;
 SELECT coalesce(array_agg(DISTINCT id),'{}'::uuid[]) INTO ids FROM unnest(p_convertido_ids) AS id;
 IF cardinality(ids)<>(SELECT count(*) FROM cui_convertidos WHERE id=ANY(ids) AND igreja_id=p_igreja_id AND deleted_at IS NULL) THEN
   RAISE EXCEPTION 'Convertido não encontrado neste campus.' USING ERRCODE='23514';
 END IF;
 RETURN QUERY SELECT c.id,
   EXISTS(SELECT 1 FROM batismo_inscricoes b WHERE b.deleted_at IS NULL AND b.status='realizado'
     AND ((c.membro_id IS NOT NULL AND b.membro_id=c.membro_id)
       OR (b.igreja_id=p_igreja_id AND c.cpf ~ '^[0-9]{11}$' AND b.cpf=c.cpf))),
   EXISTS(SELECT 1 FROM batismo_inscricoes b WHERE b.deleted_at IS NULL AND b.status IN('pendente','confirmado')
     AND ((c.membro_id IS NOT NULL AND b.membro_id=c.membro_id)
       OR (b.igreja_id=p_igreja_id AND c.cpf ~ '^[0-9]{11}$' AND b.cpf=c.cpf)))
 FROM cui_convertidos c WHERE c.id=ANY(ids) AND c.igreja_id=p_igreja_id AND c.deleted_at IS NULL;
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_batismo_sinais(uuid,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_campus_batismo_sinais(uuid,uuid[]) TO service_role;
COMMIT;
