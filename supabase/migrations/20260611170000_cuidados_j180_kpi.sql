-- Fase 3b · religa o KPI de J180 (inscritos no Jornada 180 · valor Investir) à fonte REAL.
-- Os KPIs AMI-18/SED-13/ONL-03 (tipo_calculo='soma_periodo', dado_tipo='inscricoes_jornada180',
-- agregacao='count') CONTAM as linhas de dados_brutos por (área, semestre). Esse feed ficou
-- órfão quando a aba Mensal/Agregado saiu (Fase 2). Aqui espelhamos cada PARTICIPANTE de turma
-- de J180 (cui_j180_turma_membros) em 1 linha de dados_brutos → count(*) = inscritos no semestre.
-- Idempotente.

-- 1) Mirror 1:1 de cada participante de turma → dados_brutos (tipo inscricoes_jornada180).
--    data = entrou_em (cai no semestre certo) · area = área da turma · contexto carrega o
--    turma_membro_id (mantém a linha única e permite update/delete preciso).
CREATE OR REPLACE FUNCTION public.fn_j180_membro_mirror_db()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_area text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.dados_brutos
     WHERE tipo_id = 'inscricoes_jornada180'
       AND contexto->>'turma_membro_id' = OLD.id::text;
    RETURN OLD;
  END IF;

  SELECT area INTO v_area FROM public.cui_j180_turmas WHERE id = NEW.turma_id;
  IF v_area IS NULL THEN RETURN NEW; END IF;

  -- recria o espelho (cobre mudança de turma/área/data de entrada)
  DELETE FROM public.dados_brutos
   WHERE tipo_id = 'inscricoes_jornada180'
     AND contexto->>'turma_membro_id' = NEW.id::text;

  INSERT INTO public.dados_brutos (tipo_id, area, data, valor, contexto, origem)
  VALUES ('inscricoes_jornada180', v_area, NEW.entrou_em, 1,
          jsonb_build_object('origem', 'cuidados.j180', 'turma_membro_id', NEW.id::text), 'auto');

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tg_j180_membro_mirror_db ON public.cui_j180_turma_membros;
CREATE TRIGGER tg_j180_membro_mirror_db
  AFTER INSERT OR UPDATE OR DELETE ON public.cui_j180_turma_membros
  FOR EACH ROW EXECUTE FUNCTION public.fn_j180_membro_mirror_db();

-- 2) Se a ÁREA da turma muda, realinha a área dos espelhos dos seus participantes.
CREATE OR REPLACE FUNCTION public.fn_j180_turma_area_sync_db()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.area IS DISTINCT FROM OLD.area THEN
    UPDATE public.dados_brutos db
       SET area = NEW.area
      FROM public.cui_j180_turma_membros tm
     WHERE tm.turma_id = NEW.id
       AND db.tipo_id = 'inscricoes_jornada180'
       AND db.contexto->>'turma_membro_id' = tm.id::text;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tg_j180_turma_area_sync_db ON public.cui_j180_turmas;
CREATE TRIGGER tg_j180_turma_area_sync_db
  AFTER UPDATE OF area ON public.cui_j180_turmas
  FOR EACH ROW EXECUTE FUNCTION public.fn_j180_turma_area_sync_db();

-- 3) Limpa o feed manual stale (Agregado removido na Fase 2) pra não inflar o count.
--    O trigger de recálculo de dados_brutos recalcula os KPIs afetados automaticamente.
DELETE FROM public.dados_brutos
 WHERE tipo_id = 'inscricoes_jornada180'
   AND contexto->>'origem' = 'cuidados.agregado';

-- 4) Backfill: espelha os participantes de turmas já existentes (idempotente).
INSERT INTO public.dados_brutos (tipo_id, area, data, valor, contexto, origem)
SELECT 'inscricoes_jornada180', t.area, tm.entrou_em, 1,
       jsonb_build_object('origem', 'cuidados.j180', 'turma_membro_id', tm.id::text), 'auto'
  FROM public.cui_j180_turma_membros tm
  JOIN public.cui_j180_turmas t ON t.id = tm.turma_id AND t.deleted_at IS NULL
 ON CONFLICT (tipo_id, area, data, contexto) DO NOTHING;
