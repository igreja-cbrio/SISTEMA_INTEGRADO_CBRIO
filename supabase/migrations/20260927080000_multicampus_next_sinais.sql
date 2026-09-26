-- Conclusão pessoal global, exposta somente como sinal de atos já autorizados.
-- Nunca recebe membro_id/CPF arbitrários e nunca devolve a ficha de outro campus.
BEGIN;
-- Auditoria read-only 27/09/2026: zero overrides. Nunca inferir campus-base.
-- Se surgirem linhas antes da aplicação, exigir mapa de origem revisado.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.next_pessoa_aula_manual) THEN
    RAISE EXCEPTION 'Overrides Next sem campus exigem mapa explícito de origem antes desta migration.';
  END IF;
END $$;
ALTER TABLE public.next_pessoa_aula_manual ADD COLUMN igreja_id uuid NOT NULL REFERENCES public.igrejas(id);
ALTER TABLE public.next_pessoa_aula_manual DROP CONSTRAINT next_pessoa_aula_manual_pkey;
ALTER TABLE public.next_pessoa_aula_manual ADD PRIMARY KEY(igreja_id,membro_id);
-- PK composta: correção de presença preservada por campus, sem DELETE de histórico.
CREATE OR REPLACE FUNCTION public.tg_next_manual_campus_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.igreja_id IS DISTINCT FROM OLD.igreja_id THEN
    RAISE EXCEPTION 'A origem do override Next não pode ser alterada.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_next_manual_campus_imutavel() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER aa_next_manual_campus_imutavel BEFORE UPDATE ON public.next_pessoa_aula_manual
  FOR EACH ROW EXECUTE FUNCTION public.tg_next_manual_campus_imutavel();
ALTER TABLE public.next_pessoa_aula_manual ENABLE ROW LEVEL SECURITY;
CREATE POLICY campus_next_manual_select ON public.next_pessoa_aula_manual AS RESTRICTIVE FOR SELECT TO authenticated
  USING(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY campus_next_manual_insert ON public.next_pessoa_aula_manual AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY campus_next_manual_update ON public.next_pessoa_aula_manual AS RESTRICTIVE FOR UPDATE TO authenticated
  USING(public.fn_campus_dado_pessoal_permitido(igreja_id)) WITH CHECK(public.fn_campus_dado_pessoal_permitido(igreja_id));
CREATE POLICY campus_next_manual_delete ON public.next_pessoa_aula_manual AS RESTRICTIVE FOR DELETE TO authenticated
  USING(public.fn_campus_dado_pessoal_permitido(igreja_id));

CREATE OR REPLACE VIEW public.vw_next_formado_pessoa AS
 WITH presenca AS (
         SELECT m.membro_id
           FROM next_presencas p
             JOIN next_encontros e ON e.id = p.encontro_id
             JOIN next_matriculas m ON m.id = p.matricula_id AND m.deleted_at IS NULL AND m.membro_id IS NOT NULL
          WHERE p.presente = true
          GROUP BY m.membro_id
        ), manual AS (
         SELECT next_pessoa_aula_manual.membro_id,
            min(next_pessoa_aula_manual.updated_at::date) AS dt
           FROM next_pessoa_aula_manual
          WHERE next_pessoa_aula_manual.fez_aula1 OR next_pessoa_aula_manual.fez_aula2
          GROUP BY next_pessoa_aula_manual.membro_id
        ), status_membro AS (
         SELECT DISTINCT next_matriculas.membro_id
           FROM next_matriculas
          WHERE next_matriculas.deleted_at IS NULL AND next_matriculas.status = 'formado'::text AND next_matriculas.membro_id IS NOT NULL
        ), formado_membros AS (
         SELECT presenca.membro_id FROM presenca
        UNION
         SELECT manual.membro_id FROM manual
        UNION
         SELECT status_membro.membro_id FROM status_membro
        ), mat_min AS (
         SELECT next_matriculas.membro_id,
            min(next_matriculas.created_at::date) AS dt
           FROM next_matriculas
          WHERE next_matriculas.deleted_at IS NULL AND next_matriculas.membro_id IS NOT NULL
          GROUP BY next_matriculas.membro_id
        )
 SELECT f.membro_id,
    mm.cpf,
    mm.nome,
    COALESCE(mat_min.dt, man.dt) AS formado_em
   FROM formado_membros f
     LEFT JOIN mat_min ON mat_min.membro_id = f.membro_id
     LEFT JOIN manual man ON man.membro_id = f.membro_id
     LEFT JOIN mem_membros mm ON mm.id = f.membro_id
UNION ALL
 SELECT NULL::uuid AS membro_id,
    m.cpf,
    m.nome,
    min(m.created_at::date) AS formado_em
   FROM next_matriculas m
  WHERE m.deleted_at IS NULL AND m.status = 'formado'::text AND m.membro_id IS NULL
  GROUP BY m.cpf, m.nome;


CREATE OR REPLACE FUNCTION public.fn_campus_next_sinais(
  p_igreja_id uuid,p_convertido_ids uuid[],p_matricula_ids uuid[]
) RETURNS TABLE(tipo text,registro_id uuid,fez_next boolean)
LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE v_convertidos uuid[]; v_matriculas uuid[];
BEGIN
  IF p_igreja_id IS NULL OR p_convertido_ids IS NULL OR p_matricula_ids IS NULL
    OR cardinality(p_convertido_ids)+cardinality(p_matricula_ids)>1000
    OR array_position(p_convertido_ids,NULL) IS NOT NULL OR array_position(p_matricula_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Atos locais inválidos.' USING ERRCODE='P0400';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT id),'{}'::uuid[]) INTO v_convertidos FROM unnest(p_convertido_ids) id;
  SELECT COALESCE(array_agg(DISTINCT id),'{}'::uuid[]) INTO v_matriculas FROM unnest(p_matricula_ids) id;
  IF EXISTS(SELECT 1 FROM unnest(v_convertidos) AS solicitado(id) WHERE NOT EXISTS(
    SELECT 1 FROM public.cui_convertidos c WHERE c.id=solicitado.id AND c.igreja_id=p_igreja_id AND c.deleted_at IS NULL))
    OR EXISTS(SELECT 1 FROM unnest(v_matriculas) AS solicitado(id) WHERE NOT EXISTS(
      SELECT 1 FROM public.next_matriculas m WHERE m.id=solicitado.id AND m.igreja_id=p_igreja_id AND m.deleted_at IS NULL)) THEN
    RAISE EXCEPTION 'Ato não encontrado no campus.' USING ERRCODE='P0403';
  END IF;
  RETURN QUERY
  WITH atos AS (
    SELECT 'convertido'::text AS origem,c.id,c.membro_id,c.cpf FROM public.cui_convertidos c
      WHERE c.id=ANY(v_convertidos) AND c.igreja_id=p_igreja_id AND c.deleted_at IS NULL
    UNION ALL
    SELECT 'matricula'::text,m.id,m.membro_id,m.cpf FROM public.next_matriculas m
      WHERE m.id=ANY(v_matriculas) AND m.igreja_id=p_igreja_id AND m.deleted_at IS NULL
  )
  SELECT a.origem,a.id,EXISTS(SELECT 1 FROM public.vw_next_formado_pessoa f
    WHERE (a.membro_id IS NOT NULL AND f.membro_id=a.membro_id)
      OR (length(regexp_replace(COALESCE(a.cpf,''),'[^0-9]','','g'))=11
        AND regexp_replace(COALESCE(f.cpf,''),'[^0-9]','','g')=regexp_replace(a.cpf,'[^0-9]','','g')))
  FROM atos a;
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_next_sinais(uuid,uuid[],uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_campus_next_sinais(uuid,uuid[],uuid[]) TO service_role;
CREATE OR REPLACE FUNCTION public.fn_campus_next_manual(p_igreja_id uuid,p_membro_id uuid,p_usuario_id uuid,p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_linha public.next_pessoa_aula_manual%ROWTYPE;
BEGIN
  IF p_igreja_id IS NULL OR p_membro_id IS NULL OR p_usuario_id IS NULL OR p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' THEN
    RAISE EXCEPTION 'Dados do override inválidos.' USING ERRCODE='P0400'; END IF;
  IF (p_patch ? 'fez_aula1' AND jsonb_typeof(p_patch->'fez_aula1')<>'boolean')
    OR (p_patch ? 'fez_aula2' AND jsonb_typeof(p_patch->'fez_aula2')<>'boolean') THEN
    RAISE EXCEPTION 'Informe presença como verdadeiro ou falso.' USING ERRCODE='P0400'; END IF;
  -- Prova local do vínculo; não basta conhecer um membro_id global.
  PERFORM id FROM public.next_matriculas WHERE membro_id=p_membro_id AND igreja_id=p_igreja_id AND deleted_at IS NULL LIMIT 1 FOR SHARE;
  IF NOT FOUND THEN
    PERFORM id FROM public.cui_convertidos WHERE membro_id=p_membro_id AND igreja_id=p_igreja_id AND deleted_at IS NULL LIMIT 1 FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pessoa sem ato Next ou conversão neste campus.' USING ERRCODE='P0403'; END IF;
  END IF;
  INSERT INTO public.next_pessoa_aula_manual(igreja_id,membro_id,fez_aula1,fez_aula2,observacao,marcado_por,updated_at)
    VALUES(p_igreja_id,p_membro_id,COALESCE((p_patch->>'fez_aula1')::boolean,false),COALESCE((p_patch->>'fez_aula2')::boolean,false),p_patch->>'observacao',p_usuario_id,now())
    ON CONFLICT(igreja_id,membro_id) DO UPDATE SET
      fez_aula1=CASE WHEN p_patch ? 'fez_aula1' THEN EXCLUDED.fez_aula1 ELSE next_pessoa_aula_manual.fez_aula1 END,
      fez_aula2=CASE WHEN p_patch ? 'fez_aula2' THEN EXCLUDED.fez_aula2 ELSE next_pessoa_aula_manual.fez_aula2 END,
      observacao=CASE WHEN p_patch ? 'observacao' THEN EXCLUDED.observacao ELSE next_pessoa_aula_manual.observacao END,
      marcado_por=p_usuario_id,updated_at=now()
    RETURNING * INTO v_linha;
  RETURN to_jsonb(v_linha);
END $$;
REVOKE ALL ON FUNCTION public.fn_campus_next_manual(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_campus_next_manual(uuid,uuid,uuid,jsonb) TO service_role;
COMMIT;
