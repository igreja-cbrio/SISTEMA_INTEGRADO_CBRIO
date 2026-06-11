-- Fase 3b (final) · recálculo automático do KPI de J180 quando as turmas mudam.
-- _kpi_agregar_dado já lê cui_j180_turma_membros por área (migration anterior), mas o
-- cache kpi_valores_calculados só atualiza via recalcular_kpi. Como não há mais o mirror
-- em dados_brutos, nada disparava o recálculo ao mexer nas turmas. Estes triggers chamam
-- recalcular_kpis_por_dado('inscricoes_jornada180', área, data) → AMI-18/SED-13/ONL-03
-- atualizam na hora (mesmo padrão dos triggers de dados_brutos/cultos).

-- Recálculo quando participante entra/sai/muda
CREATE OR REPLACE FUNCTION public.fn_j180_recalc_kpi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT t.area, s.entrou_em
      FROM (
        SELECT (CASE WHEN TG_OP <> 'INSERT' THEN OLD.turma_id END) AS turma_id,
               (CASE WHEN TG_OP <> 'INSERT' THEN OLD.entrou_em END) AS entrou_em
        UNION ALL
        SELECT (CASE WHEN TG_OP <> 'DELETE' THEN NEW.turma_id END),
               (CASE WHEN TG_OP <> 'DELETE' THEN NEW.entrou_em END)
      ) s
      JOIN public.cui_j180_turmas t ON t.id = s.turma_id
     WHERE s.turma_id IS NOT NULL AND s.entrou_em IS NOT NULL
  LOOP
    PERFORM public.recalcular_kpis_por_dado('inscricoes_jornada180', r.area, r.entrou_em);
  END LOOP;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS tg_j180_membro_recalc_kpi ON public.cui_j180_turma_membros;
CREATE TRIGGER tg_j180_membro_recalc_kpi
  AFTER INSERT OR UPDATE OR DELETE ON public.cui_j180_turma_membros
  FOR EACH ROW EXECUTE FUNCTION public.fn_j180_recalc_kpi();

-- Recálculo quando a turma muda de área ou é (des)arquivada · cobre área antiga e nova
CREATE OR REPLACE FUNCTION public.fn_j180_turma_recalc_kpi()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT a.area, tm.entrou_em
      FROM public.cui_j180_turma_membros tm
      CROSS JOIN (VALUES (OLD.area), (NEW.area)) AS a(area)
     WHERE tm.turma_id = NEW.id AND a.area IS NOT NULL AND tm.entrou_em IS NOT NULL
  LOOP
    PERFORM public.recalcular_kpis_por_dado('inscricoes_jornada180', r.area, r.entrou_em);
  END LOOP;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS tg_j180_turma_recalc_kpi ON public.cui_j180_turmas;
CREATE TRIGGER tg_j180_turma_recalc_kpi
  AFTER UPDATE OF area, deleted_at ON public.cui_j180_turmas
  FOR EACH ROW EXECUTE FUNCTION public.fn_j180_turma_recalc_kpi();
