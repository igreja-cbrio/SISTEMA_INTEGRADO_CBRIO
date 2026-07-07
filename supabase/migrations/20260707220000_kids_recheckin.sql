-- Kids · check-in mais de uma vez na mesma sessão (pedido do Matheus · 2026-07-07).
-- Caso real: a criança sai (check-out) e volta pra outra celebração no mesmo dia —
-- hoje a UNIQUE(sessao_id, crianca_id) impede QUALQUER segundo check-in.
--
-- 1) A UNIQUE vira índice único PARCIAL: no máximo 1 check-in ABERTO por
--    criança/sessão (integridade preservada); após o check-out, um novo
--    check-in é permitido (gera código de segurança + etiqueta novos).
DO $$
DECLARE v_name text;
BEGIN
  SELECT con.conname INTO v_name
    FROM pg_constraint con
   WHERE con.conrelid = 'public.kids_checkins'::regclass
     AND con.contype = 'u'
     AND (
       SELECT array_agg(a.attname::text ORDER BY a.attname)
         FROM unnest(con.conkey) AS k(attnum)
         JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
     ) = ARRAY['crianca_id', 'sessao_id']
   LIMIT 1;
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.kids_checkins DROP CONSTRAINT %I', v_name);
    RAISE NOTICE 'kids_checkins: constraint % removida', v_name;
  ELSE
    RAISE NOTICE 'kids_checkins: UNIQUE(sessao_id, crianca_id) já não existe (ok)';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_kids_checkins_aberto
  ON public.kids_checkins (sessao_id, crianca_id)
  WHERE checkout_at IS NULL;

COMMENT ON INDEX public.uq_kids_checkins_aberto IS
  'No máximo 1 check-in ABERTO por criança/sessão; após o check-out pode haver novo check-in (re-entrada no mesmo dia).';

-- 2) Consolidação do culto ao encerrar a sessão: presença e decisão contam
--    CRIANÇAS DISTINTAS — re-check-in da mesma criança não infla presencial_kids.
CREATE OR REPLACE FUNCTION public.fn_kids_sessao_consolida_culto()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total int;
  v_decisoes int;
BEGIN
  IF NEW.status = 'encerrada'
     AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'encerrada') THEN

    SELECT COUNT(DISTINCT crianca_id),
           COUNT(DISTINCT crianca_id) FILTER (WHERE fez_decisao_jesus = true)
      INTO v_total, v_decisoes
      FROM public.kids_checkins
      WHERE sessao_id = NEW.id;

    UPDATE public.cultos
      SET presencial_kids = v_total,
          decisoes_kids   = v_decisoes,
          updated_at      = now()
      WHERE id = NEW.culto_id;
  END IF;
  RETURN NEW;
END $$;
