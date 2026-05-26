-- Refactor: fin_sugerir_plano_por_horario usa fin_culto_slots como fonte unica
-- Antes: janela hardcoded (Quarta >= 19h), nao alinhava com slot real (18h-23h59)
-- Agora: usa fin_identifica_culto -> pega plano direto do slot configurado

-- 1) Ajusta slots pra cobrir madrugada D+1 (PIX que entra apos meia-noite)
UPDATE fin_culto_slots
   SET hora_fim = TIME '04:00',
       hora_fim_proximo_dia = true
 WHERE service_type_slug IN ('quarta-com-deus', 'domingo-19h')
   AND hora_fim_proximo_dia = false;

-- 2) Funcao de sugestao agora consulta a tabela de slots
CREATE OR REPLACE FUNCTION public.fin_sugerir_plano_por_horario(
  p_data date,
  p_hora time without time zone,
  p_tipo text
)
RETURNS TABLE(codigo text, nome text, confianca numeric, motivo text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_dt timestamp without time zone;
  v_slot_id uuid;
  v_slot_nome text;
  v_plano_id uuid;
  v_codigo text;
  v_motivo text;
  v_confianca numeric;
BEGIN
  IF p_data IS NULL OR p_hora IS NULL THEN RETURN; END IF;

  v_dt := (p_data::text || ' ' || p_hora::text)::timestamp;
  v_slot_id := fin_identifica_culto(v_dt);

  IF v_slot_id IS NOT NULL THEN
    SELECT s.nome,
           CASE WHEN p_tipo = 'dizimo' THEN s.plano_contas_dizimo_id
                ELSE s.plano_contas_oferta_id END
      INTO v_slot_nome, v_plano_id
      FROM fin_culto_slots s
     WHERE s.id = v_slot_id;

    SELECT pc.codigo INTO v_codigo
      FROM fin_plano_contas pc
     WHERE pc.id = v_plano_id;

    v_motivo := v_slot_nome || ' · PIX em ' || to_char(p_data, 'DD/MM') || ' ' || to_char(p_hora, 'HH24:MI');
    v_confianca := 0.90;
  ELSE
    v_codigo := CASE WHEN p_tipo = 'dizimo' THEN '3.01.01.04' ELSE '3.01.02.04' END;
    v_motivo := 'Fora dos horarios de culto · Em Geral';
    v_confianca := 0.60;
  END IF;

  RETURN QUERY
  SELECT pc.codigo, pc.nome, v_confianca, v_motivo
    FROM fin_plano_contas pc
   WHERE pc.codigo = v_codigo
   LIMIT 1;
END;
$$;

COMMIT;
