-- ============================================================
-- vw_dashboard_semanal · expõe decisões Kids (2026-06-18)
-- O resumo do Dashboard Semanal deve refletir TOTAL = templo + kids tanto em
-- presenças (já há total_presencial) quanto em decisões/aceitações. A view não
-- expunha as decisões kids (cultos.decisoes_kids) → adiciona `aceitacoes_kids`
-- no FINAL (append · não quebra consumidores existentes).
-- ============================================================
CREATE OR REPLACE VIEW public.vw_dashboard_semanal AS
 SELECT EXTRACT(isoyear FROM c.data)::integer AS ano_iso,
    EXTRACT(week FROM c.data)::integer AS semana_iso,
    EXTRACT(year FROM c.data)::integer AS ano_calendario,
    EXTRACT(month FROM c.data)::integer AS mes,
    c.service_type_id,
    vst.name AS service_type_name,
    vst.color AS service_type_color,
    vst.recurrence_day,
    vst.recurrence_time,
    count(*) AS total_cultos,
    COALESCE(sum(c.presencial_adulto), 0::bigint)::integer AS frequencia,
    COALESCE(sum(c.presencial_kids), 0::bigint)::integer AS frequencia_kids,
    COALESCE(sum(c.decisoes_presenciais), 0::bigint)::integer AS aceitacoes,
    COALESCE(sum(c.decisoes_online), 0::bigint)::integer AS aceitacoes_online,
    COALESCE(sum(c.online_pico), 0::bigint)::integer AS ao_vivo,
    COALESCE(sum(c.online_ds), 0::bigint)::integer AS online_ds,
    COALESCE(sum(c.online_ddus), 0::bigint)::integer AS online_ddus,
    COALESCE(sum(c.voluntarios), 0::bigint)::integer AS voluntariado,
    COALESCE(sum(c.presencial_adulto + c.presencial_kids), 0::bigint)::integer AS total_presencial,
    COALESCE(sum(c.decisoes_kids), 0::bigint)::integer AS aceitacoes_kids
   FROM cultos c
     LEFT JOIN vol_service_types vst ON c.service_type_id = vst.id
  GROUP BY (EXTRACT(isoyear FROM c.data)::integer), (EXTRACT(week FROM c.data)::integer), (EXTRACT(year FROM c.data)::integer), (EXTRACT(month FROM c.data)::integer), c.service_type_id, vst.name, vst.color, vst.recurrence_day, vst.recurrence_time;
