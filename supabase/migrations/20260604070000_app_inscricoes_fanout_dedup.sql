-- =====================================================================
-- app_inscricoes → fan-out · com DEDUP de voluntariado (2026-06-04)
-- =====================================================================
-- Atualiza fn_app_inscricoes_fanout: antes de criar a inscrição de
-- voluntariado em vol_inscricoes, verifica se a pessoa já tem uma inscrição
-- EM ABERTO (inscrito/enviado_ministerio). Se tiver, não duplica e marca a
-- linha do app como 'duplicado'. Evita inscrições repetidas pelo app.
-- ADITIVA · CREATE OR REPLACE.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_app_inscricoes_fanout()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d jsonb := COALESCE(NEW.dados, '{}'::jsonb);
  v_labels text[];
  v_area text;
  v_nome text; v_sobre text; v_completo text;
  v_membro uuid; v_email text;
BEGIN
  IF NEW.tipo = 'voluntariado' THEN
    v_membro := NULLIF(d->>'membro_id','')::uuid;
    v_email  := NULLIF(d->>'email','');

    -- DEDUP · já existe inscrição em aberto pra essa pessoa?
    IF EXISTS (
      SELECT 1 FROM public.vol_inscricoes vi
       WHERE vi.status IN ('inscrito','enviado_ministerio')
         AND ( (v_membro IS NOT NULL AND vi.membro_id = v_membro)
            OR (v_email IS NOT NULL AND lower(vi.email) = lower(v_email)) )
    ) THEN
      UPDATE public.app_inscricoes SET status = 'duplicado' WHERE id = NEW.id AND status = 'pendente';
      RETURN NULL;
    END IF;

    SELECT array_agg(x) INTO v_labels
      FROM jsonb_array_elements_text(COALESCE(d->'areas', '[]'::jsonb)) x;
    v_area := COALESCE((
      SELECT o.area_canonica FROM public.vol_form_opcoes o
       WHERE o.label = ANY(v_labels) AND o.area_canonica IN ('kids','bridge','ami','online')
       ORDER BY CASE o.area_canonica WHEN 'kids' THEN 1 WHEN 'bridge' THEN 2 WHEN 'ami' THEN 3 ELSE 4 END
       LIMIT 1), 'sede');
    v_nome := COALESCE(NULLIF(d->>'nome',''), split_part(COALESCE(d->>'nome_completo',''),' ',1), 'Voluntário');
    v_sobre := COALESCE(NULLIF(d->>'sobrenome',''), '-');
    v_completo := COALESCE(NULLIF(d->>'nome_completo',''), trim(v_nome || ' ' || v_sobre));

    BEGIN
      INSERT INTO public.vol_inscricoes
        (nome, sobrenome, nome_completo, cpf, email, telefone, nome_mae, data_inscricao,
         ministerios_interesse, area, status, primeiro_contato_em, membro_id, origem)
      VALUES
        (v_nome, v_sobre, v_completo,
         NULLIF(regexp_replace(COALESCE(d->>'cpf',''),'\D','','g'),''),
         v_email,
         NULLIF(regexp_replace(COALESCE(d->>'telefone',''),'\D','','g'),''),
         NULLIF(d->>'nome_mae',''),
         COALESCE(NEW.created_at, now()),
         NULLIF(array_to_string(v_labels, ', '), ''),
         v_area, 'inscrito', 'False',
         v_membro, 'app');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[app_inscricoes_fanout voluntariado] %', SQLERRM;
    END;

  ELSIF NEW.tipo = 'grupos' THEN
    IF NULLIF(d->>'grupo_id','') IS NOT NULL THEN
      BEGIN
        INSERT INTO public.mem_grupo_pedidos
          (grupo_id, membro_id, nome, email, telefone, origem, status, observacao)
        VALUES
          ((d->>'grupo_id')::uuid, NULLIF(d->>'membro_id','')::uuid,
           COALESCE(NULLIF(d->>'nome',''),'Membro'), NULLIF(d->>'email',''),
           NULLIF(regexp_replace(COALESCE(d->>'telefone',''),'\D','','g'),''),
           'app', 'pendente', NULLIF(d->>'observacao',''));
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[app_inscricoes_fanout grupos] %', SQLERRM;
      END;
    END IF;
  END IF;

  UPDATE public.app_inscricoes SET status = 'processado' WHERE id = NEW.id AND status = 'pendente';
  RETURN NULL;
END;
$$;
