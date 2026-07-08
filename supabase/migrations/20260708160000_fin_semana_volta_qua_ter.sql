-- ============================================================================
-- Dashboard Financeiro · a semana das CONTRIBUIÇÕES volta a QUARTA→TERÇA
-- ============================================================================
-- Decisão do Matheus (gestão · 2026-07-08): a semana financeira da igreja é
-- QUARTA (Quarta com Deus) até a TERÇA seguinte — é assim que o sistema
-- financeiro interno concilia. Em 2026-06-01 (20260601130000) a função
-- fin_semana_qua_ter tinha sido reescrita pra ISO segunda→domingo, pra unificar
-- com a numeração da aba de cultos. Só que isso passou a divergir do fechamento
-- contábil: a virada de junho/julho batia 303k (seg-dom · 29/06–05/07) contra
-- ~418k (qua-ter · 01/07–07/07) que o financeiro interno enxerga.
--
-- Esta migration REVERTE o corpo da função pra quarta→terça. TODAS as views e
-- endpoints do dashboard financeiro chamam fin_semana_qua_ter (vw_fin_semana_resumo,
-- vw_fin_semana_cultos, vw_fin_top_contribuintes_semana + /dashboard/semana*),
-- então herdam a mudança automaticamente em query time.
--
-- ⚠️ ESCOPO: SÓ o financeiro. A FREQUÊNCIA dos cultos (Dashboard Semanal ·
-- backend/routes/dashboardSemanal.js · isoWeekRange) usa uma função JS PRÓPRIA
-- segunda→domingo e NÃO chama esta RPC — continua ISO seg-dom, intocada.
--
-- ADITIVA / não-destrutiva: nenhuma tabela ou coluna muda · só o corpo da função.
-- Offset da semana: da data volta até a quarta-feira da semana da igreja.
--   dow: Dom=0 Seg=1 Ter=2 Qua=3 Qui=4 Sex=5 Sáb=6
--   offset até a quarta = (dow + 4) % 7  →  Qua=0 · Qui=1 · … · Ter=6
-- ============================================================================

CREATE OR REPLACE FUNCTION fin_semana_qua_ter(p_data date)
RETURNS TABLE (inicio date, fim date, label text)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_dow int;        -- 0=Dom 1=Seg ... 6=Sab
  v_inicio date;    -- quarta-feira que inicia a semana da igreja
BEGIN
  v_dow := EXTRACT(DOW FROM p_data)::int;
  -- Volta até a quarta da semana da igreja: offset = (dow + 4) % 7
  v_inicio := p_data - (((v_dow + 4) % 7) || ' days')::interval;

  inicio := v_inicio;
  fim := v_inicio + interval '6 days';  -- terça seguinte
  -- Label com o número da semana ISO da quarta (referência estável de ordenação)
  label := 'Sem ' || to_char(v_inicio, 'IW') || ' · '
           || to_char(v_inicio, 'DD/MM') || '–'
           || to_char(v_inicio + interval '6 days', 'DD/MM');
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION fin_semana_qua_ter(date) IS
  'Semana financeira QUARTA->TERÇA (revertida em 2026-07-08 · decisão do Matheus). '
  'Retorna inicio (quarta), fim (terça seguinte) e label "Sem NN · dd/mm–dd/mm". '
  'Usada só pelo dashboard financeiro; a frequência dos cultos usa isoWeekRange (seg-dom).';
