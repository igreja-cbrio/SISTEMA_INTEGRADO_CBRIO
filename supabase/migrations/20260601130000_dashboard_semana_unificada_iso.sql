-- ============================================================================
-- Dashboard Semanal · UNIFICA a semana financeira com a dos cultos (ISO seg-dom)
-- ============================================================================
-- Ate aqui o painel tinha DOIS sistemas de semana:
--   * Cultos (aba Semanal/Mensal) -> ISO segunda->domingo (semana_iso)
--   * Financeiro -> quarta->terca ("qua-ter"), via fin_semana_qua_ter()
-- Resultado: a MESMA "Semana 21" apontava datas diferentes em cada aba -> confunde
-- a diretoria (e a conciliacao).
--
-- Decisao (Marcos, 2026-06-01): unificar TUDO em ISO segunda->domingo, igual aos
-- cultos. A oferta/dizimo de culto JA e lancada com a data do culto (domingo),
-- entao bucketizar por data_competencia em seg-dom alinha receita ao culto que a
-- gerou (a oferta do culto de domingo 24/05 cai na Semana 21 = 18-24/05, junto
-- com o culto). O qua-ter existia pelo lag D+1 do extrato bancario; como a oferta
-- ja carrega a data do culto, o lag nao afeta o balde da semana.
--
-- IMPLEMENTACAO: basta reescrever o corpo de fin_semana_qua_ter() para ISO
-- seg-dom. Todas as views (vw_fin_semana_resumo, vw_fin_semana_cultos,
-- vw_fin_top_contribuintes_semana) e o backend chamam essa funcao -> herdam a
-- mudanca automaticamente (sao views normais, recalculam em query time). O nome
-- da funcao foi MANTIDO pra nao quebrar os ~dezenas de callers; o COMMENT abaixo
-- documenta que a semantica agora e ISO seg-dom (nao mais qua-ter).
--
-- ADITIVA / nao-destrutiva: nenhuma tabela ou coluna muda · so o corpo da funcao.
-- ============================================================================

CREATE OR REPLACE FUNCTION fin_semana_qua_ter(p_data date)
RETURNS TABLE (inicio date, fim date, label text)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_dow int;        -- 0=Dom 1=Seg ... 6=Sab
  v_inicio date;    -- segunda-feira da semana ISO
BEGIN
  v_dow := EXTRACT(DOW FROM p_data)::int;
  -- Volta ate a segunda da semana (ISO): offset = (dow + 6) % 7
  --   Seg(1)->0 · Dom(0)->6 · Sab(6)->5 · etc.
  v_inicio := p_data - (((v_dow + 6) % 7) || ' days')::interval;

  inicio := v_inicio;
  fim := v_inicio + interval '6 days';
  -- Label com numero da semana ISO (casa com a numeracao da aba de cultos)
  label := 'Sem ' || to_char(v_inicio, 'IW') || ' · '
           || to_char(v_inicio, 'DD/MM') || '–'
           || to_char(v_inicio + interval '6 days', 'DD/MM');
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION fin_semana_qua_ter(date) IS
  'Semana ISO segunda->domingo (unificada com a aba de cultos em 2026-06-01). '
  'Nome mantido por compatibilidade com os callers; NAO e mais quarta->terca. '
  'Retorna inicio (segunda), fim (domingo) e label "Sem NN · dd/mm–dd/mm".';
