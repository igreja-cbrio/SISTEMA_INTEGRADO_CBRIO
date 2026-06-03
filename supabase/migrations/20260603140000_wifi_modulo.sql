-- =====================================================================
-- Módulo WiFi · acompanhamento de visitantes do portal WiFi (2026-06-03)
-- =====================================================================
-- Os dados de WiFi vivem num PROJETO Supabase separado (CBRio Wifi):
--   visitantes(id,nome,cpf,email,telefone,mac_address,aceite_lgpd,data_acesso)
--   connection_logs(id,usuario,mac_address,ip_address,evento,timestamp_evento)
-- Postgres não cruza 2 projetos, então um conector (backend/services/wifiSync.js)
-- copia esses dados pra cá (ERP) onde acontece todo o cruzamento por CPF/nome/tel.
--
-- A ÚNICA chave conexão↔pessoa na origem é o mac_address (o campo `usuario`
-- é sempre a constante "visitante"). Uma pessoa = agrupada por CPF (pode ter
-- vários cadastros/MACs). Frequência usa todos os MACs do CPF.
--
-- Migration ADITIVA · idempotente. Segue as regras de segurança do projeto
-- (RLS contextual, soft-delete na whitelist, sem USING(true) em PII).
-- =====================================================================

-- ── Tabela espelho dos visitantes do portal ────────────────────────────
CREATE TABLE IF NOT EXISTS public.wifi_visitantes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem_id     uuid NOT NULL,                 -- visitantes.id no projeto WiFi
  nome          text,
  cpf           text,
  email         text,
  telefone      text,
  mac_address   text,
  aceite_lgpd   boolean,
  data_acesso   timestamptz,                   -- 1º acesso/registro no portal
  -- derivados (preenchidos por fn_wifi_processar_vinculos)
  cpf_norm      text,                          -- só dígitos (11)
  tel_norm      text,                          -- só dígitos
  nome_norm     text,                          -- lower + sem acento
  membro_id     uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  match_tipo    text,                          -- cpf|telefone|nome|auto_visitante
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wifi_visitantes_origem ON public.wifi_visitantes (origem_id);
CREATE INDEX IF NOT EXISTS idx_wifi_visitantes_cpf   ON public.wifi_visitantes (cpf_norm) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wifi_visitantes_tel   ON public.wifi_visitantes (tel_norm) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wifi_visitantes_mac   ON public.wifi_visitantes (upper(mac_address)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wifi_visitantes_membro ON public.wifi_visitantes (membro_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wifi_visitantes_nome  ON public.wifi_visitantes USING gin (nome_norm gin_trgm_ops);

-- ── Tabela espelho das conexões ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wifi_conexoes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem_id         uuid NOT NULL,             -- connection_logs.id no projeto WiFi
  usuario           text,
  mac_address       text,
  ip_address        text,
  evento            text,                      -- login | logout
  timestamp_evento  timestamptz,
  wifi_visitante_id uuid REFERENCES public.wifi_visitantes(id) ON DELETE SET NULL,
  culto_id          uuid REFERENCES public.cultos(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wifi_conexoes_origem ON public.wifi_conexoes (origem_id);
CREATE INDEX IF NOT EXISTS idx_wifi_conexoes_mac    ON public.wifi_conexoes (upper(mac_address)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wifi_conexoes_ts     ON public.wifi_conexoes (timestamp_evento DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wifi_conexoes_visit  ON public.wifi_conexoes (wifi_visitante_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_wifi_conexoes_culto  ON public.wifi_conexoes (culto_id) WHERE deleted_at IS NULL;

-- ── Log de sincronização (operacional · sem soft-delete) ────────────────
CREATE TABLE IF NOT EXISTS public.wifi_sync_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iniciado_em        timestamptz NOT NULL DEFAULT now(),
  finalizado_em      timestamptz,
  status             text NOT NULL DEFAULT 'rodando',   -- rodando|ok|erro
  visitantes_novos   integer DEFAULT 0,
  conexoes_novas     integer DEFAULT 0,
  vinculos_membro    integer DEFAULT 0,
  visitantes_criados integer DEFAULT 0,
  erro               text,
  detalhe            jsonb
);
CREATE INDEX IF NOT EXISTS idx_wifi_sync_log_inicio ON public.wifi_sync_log (iniciado_em DESC);

-- ── Função de cruzamento (idempotente · roda no fim de cada sync) ───────
-- Deriva cpf/tel/nome normalizados, liga conexão→pessoa por MAC, resolve o
-- culto pela janela de horário (fuso America/Sao_Paulo), casa com mem_membros
-- (CPF→telefone) e cria visitante automático pra quem apareceu em ≥2 cultos.
CREATE OR REPLACE FUNCTION public.fn_wifi_processar_vinculos()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vinc_membro integer := 0;
  v_criados     integer := 0;
BEGIN
  -- 1) normalizações (barato · recomputa sempre)
  UPDATE public.wifi_visitantes SET
    cpf_norm  = NULLIF(regexp_replace(COALESCE(cpf,''),'\D','','g'),''),
    tel_norm  = NULLIF(regexp_replace(COALESCE(telefone,''),'\D','','g'),''),
    nome_norm = NULLIF(lower(public.unaccent(trim(regexp_replace(COALESCE(nome,''),'\s+',' ','g')))),'')
  WHERE deleted_at IS NULL
    AND (cpf_norm IS DISTINCT FROM NULLIF(regexp_replace(COALESCE(cpf,''),'\D','','g'),'')
      OR tel_norm IS DISTINCT FROM NULLIF(regexp_replace(COALESCE(telefone,''),'\D','','g'),'')
      OR nome_norm IS NULL);

  -- 2) liga conexão → visitante pelo MAC (prefere o cadastro mais recente)
  WITH m AS (
    SELECT cx.id AS conexao_id, v.id AS visitante_id,
           row_number() OVER (PARTITION BY cx.id
             ORDER BY v.data_acesso DESC NULLS LAST) AS rn
    FROM public.wifi_conexoes cx
    JOIN public.wifi_visitantes v
      ON v.deleted_at IS NULL
     AND upper(v.mac_address) = upper(cx.mac_address)
    WHERE cx.wifi_visitante_id IS NULL
      AND COALESCE(cx.mac_address,'') <> ''
  )
  UPDATE public.wifi_conexoes x
     SET wifi_visitante_id = m.visitante_id
    FROM m WHERE m.conexao_id = x.id AND m.rn = 1;

  -- 3) resolve culto pela janela de horário (login mais próximo do início)
  WITH cand AS (
    SELECT cx.id AS conexao_id, c.id AS culto_id,
           row_number() OVER (PARTITION BY cx.id ORDER BY
             abs(EXTRACT(EPOCH FROM (
               (cx.timestamp_evento AT TIME ZONE 'America/Sao_Paulo')::time - st.recurrence_time
             )))) AS rn
    FROM public.wifi_conexoes cx
    JOIN public.cultos c
      ON c.deleted_at IS NULL
     AND c.data = (cx.timestamp_evento AT TIME ZONE 'America/Sao_Paulo')::date
    JOIN public.vol_service_types st
      ON st.id = c.service_type_id
     AND (cx.timestamp_evento AT TIME ZONE 'America/Sao_Paulo')::time
         BETWEEN st.recurrence_time - interval '30 min'
             AND st.recurrence_time + interval '120 min'
    WHERE cx.evento = 'login' AND cx.culto_id IS NULL
  )
  UPDATE public.wifi_conexoes x
     SET culto_id = cand.culto_id
    FROM cand WHERE cand.conexao_id = x.id AND cand.rn = 1;

  -- 4) match com membro · por CPF (mais confiável)
  UPDATE public.wifi_visitantes v
     SET membro_id = m.id, match_tipo = 'cpf', updated_at = now()
    FROM public.mem_membros m
   WHERE v.membro_id IS NULL
     AND v.deleted_at IS NULL
     AND v.cpf_norm ~ '^[0-9]{11}$'
     AND m.deleted_at IS NULL
     AND m.cpf = v.cpf_norm;
  GET DIAGNOSTICS v_vinc_membro = ROW_COUNT;

  -- 5) match com membro · por telefone (quando não casou por CPF)
  UPDATE public.wifi_visitantes v
     SET membro_id = m.id, match_tipo = 'telefone', updated_at = now()
    FROM public.mem_membros m
   WHERE v.membro_id IS NULL
     AND v.deleted_at IS NULL
     AND v.tel_norm ~ '^[0-9]{10,11}$'
     AND m.deleted_at IS NULL
     AND regexp_replace(COALESCE(m.telefone,''),'\D','','g') = v.tel_norm;

  -- 6) visitante automático · CPF com ≥2 cultos distintos e sem membro
  WITH pessoas AS (
    SELECT v.cpf_norm,
           (array_agg(v.nome     ORDER BY v.data_acesso DESC NULLS LAST))[1] AS nome,
           (array_agg(v.email    ORDER BY v.data_acesso DESC NULLS LAST))[1] AS email,
           (array_agg(v.tel_norm ORDER BY v.data_acesso DESC NULLS LAST))[1] AS telefone
    FROM public.wifi_visitantes v
    JOIN public.wifi_conexoes cx
      ON cx.wifi_visitante_id = v.id AND cx.culto_id IS NOT NULL AND cx.deleted_at IS NULL
    WHERE v.deleted_at IS NULL AND v.membro_id IS NULL AND v.cpf_norm ~ '^[0-9]{11}$'
    GROUP BY v.cpf_norm
    HAVING count(DISTINCT cx.culto_id) >= 2
  ),
  novos AS (
    INSERT INTO public.mem_membros (cpf, nome, email, telefone, status, origem_cadastro, active)
    SELECT p.cpf_norm, COALESCE(p.nome,'Visitante WiFi'), NULLIF(p.email,''), p.telefone,
           'visitante', 'wifi', true
    FROM pessoas p
    WHERE NOT EXISTS (SELECT 1 FROM public.mem_membros m WHERE m.cpf = p.cpf_norm)
    RETURNING id, cpf
  )
  UPDATE public.wifi_visitantes v
     SET membro_id = n.id, match_tipo = 'auto_visitante', updated_at = now()
    FROM novos n WHERE v.cpf_norm = n.cpf AND v.membro_id IS NULL;
  GET DIAGNOSTICS v_criados = ROW_COUNT;

  -- 7) re-liga por CPF quem já tinha membro criado em execução anterior
  UPDATE public.wifi_visitantes v
     SET membro_id = m.id, match_tipo = COALESCE(v.match_tipo,'cpf'), updated_at = now()
    FROM public.mem_membros m
   WHERE v.membro_id IS NULL
     AND v.deleted_at IS NULL
     AND v.cpf_norm ~ '^[0-9]{11}$'
     AND m.deleted_at IS NULL
     AND m.cpf = v.cpf_norm;

  RETURN jsonb_build_object('vinculos_membro', v_vinc_membro, 'visitantes_criados', v_criados);
END;
$$;

-- ── View "pessoas" · agrega por CPF + flags de cruzamento ───────────────
CREATE OR REPLACE VIEW public.vw_wifi_pessoas AS
WITH base AS (
  SELECT
    v.cpf_norm,
    (array_agg(v.nome     ORDER BY v.data_acesso DESC NULLS LAST))[1] AS nome,
    (array_agg(v.email    ORDER BY v.data_acesso DESC NULLS LAST))[1] AS email,
    (array_agg(v.telefone ORDER BY v.data_acesso DESC NULLS LAST))[1] AS telefone,
    (array_agg(v.membro_id) FILTER (WHERE v.membro_id IS NOT NULL))[1] AS membro_id,
    bool_or(COALESCE(v.aceite_lgpd,false)) AS aceite_lgpd,
    max(v.data_acesso) AS ultimo_cadastro,
    count(*) AS cadastros
  FROM public.wifi_visitantes v
  WHERE v.deleted_at IS NULL AND v.cpf_norm IS NOT NULL
  GROUP BY v.cpf_norm
), conx AS (
  SELECT vv.cpf_norm,
    count(*) FILTER (WHERE cx.evento = 'login') AS total_logins,
    count(DISTINCT cx.culto_id) FILTER (WHERE cx.culto_id IS NOT NULL) AS cultos_distintos,
    max(cx.timestamp_evento) AS ultima_conexao
  FROM public.wifi_visitantes vv
  JOIN public.wifi_conexoes cx
    ON cx.wifi_visitante_id = vv.id AND cx.deleted_at IS NULL
  WHERE vv.deleted_at IS NULL AND vv.cpf_norm IS NOT NULL
  GROUP BY vv.cpf_norm
)
SELECT
  b.cpf_norm, b.nome, b.email, b.telefone, b.membro_id, b.aceite_lgpd,
  b.ultimo_cadastro, b.cadastros,
  COALESCE(c.total_logins,0)     AS total_logins,
  COALESCE(c.cultos_distintos,0) AS cultos_distintos,
  c.ultima_conexao,
  (b.membro_id IS NOT NULL)      AS eh_membro,
  m.status                       AS membro_status,
  EXISTS (SELECT 1 FROM public.mem_voluntarios mv
           WHERE mv.membro_id = b.membro_id AND mv.ate IS NULL AND mv.deleted_at IS NULL) AS serve,
  EXISTS (SELECT 1 FROM public.mem_grupo_membros gm
           WHERE gm.membro_id = b.membro_id AND gm.saiu_em IS NULL AND gm.deleted_at IS NULL) AS em_grupo,
  EXISTS (SELECT 1 FROM public.mem_contribuicoes ct
           WHERE ct.membro_id = b.membro_id AND ct.deleted_at IS NULL
             AND ct.data >= (CURRENT_DATE - 90)) AS dizima_oferta,
  EXISTS (SELECT 1 FROM public.batismo_inscricoes bi
           WHERE bi.deleted_at IS NULL
             AND (bi.membro_id = b.membro_id OR bi.cpf = b.cpf_norm)) AS tem_batismo,
  EXISTS (SELECT 1 FROM public.next_inscricoes ni
           WHERE ni.membro_id = b.membro_id OR ni.cpf = b.cpf_norm) AS tem_next,
  EXISTS (SELECT 1 FROM public.cultos_decisoes_pessoas dp
           WHERE dp.deleted_at IS NULL
             AND (dp.membro_id = b.membro_id OR dp.cpf = b.cpf_norm)) AS tem_decisao
FROM base b
LEFT JOIN conx c        ON c.cpf_norm = b.cpf_norm
LEFT JOIN public.mem_membros m ON m.id = b.membro_id;

-- ── Whitelist de soft-delete (recriada com a lista completa + as 2 novas) ─
CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'mem_membros','mem_familias','mem_grupos','mem_grupo_membros','mem_voluntarios',
    'mem_contribuicoes','mem_trilha_valores','mem_devocionais','mem_historico',
    'mem_grupo_encontros','mem_grupo_pedidos','cultos','cultos_decisoes_pessoas',
    'batismo_inscricoes','nsm_eventos','kids_criancas','kids_checkins','kids_sessoes',
    'cui_jornada180','cui_acompanhamentos','cui_convertidos','int_visitantes',
    'kpi_indicadores_taticos','kpi_metas','rh_funcionarios','rh_documentos',
    'pcs_progressoes','projects','solicitacoes','usuarios','marketing_membros',
    'marketing_kanban_cards','marketing_entregaveis','marketing_capacidade_override',
    'marketing_compromissos_recorrentes','kids_pagers',
    'wifi_visitantes','wifi_conexoes'
  ]::TEXT[]
$$;

-- ── RLS · PII (read contextual por módulo · write só backend service_role) ─
ALTER TABLE public.wifi_visitantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wifi_conexoes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wifi_sync_log   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wifi_visitantes_select ON public.wifi_visitantes;
CREATE POLICY wifi_visitantes_select ON public.wifi_visitantes
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('wifi') >= 1 OR public.is_super_admin());
DROP POLICY IF EXISTS wifi_visitantes_delete ON public.wifi_visitantes;
CREATE POLICY wifi_visitantes_delete ON public.wifi_visitantes
  FOR DELETE TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS wifi_visitantes_service ON public.wifi_visitantes;
CREATE POLICY wifi_visitantes_service ON public.wifi_visitantes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS wifi_conexoes_select ON public.wifi_conexoes;
CREATE POLICY wifi_conexoes_select ON public.wifi_conexoes
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('wifi') >= 1 OR public.is_super_admin());
DROP POLICY IF EXISTS wifi_conexoes_delete ON public.wifi_conexoes;
CREATE POLICY wifi_conexoes_delete ON public.wifi_conexoes
  FOR DELETE TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS wifi_conexoes_service ON public.wifi_conexoes;
CREATE POLICY wifi_conexoes_service ON public.wifi_conexoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS wifi_sync_log_select ON public.wifi_sync_log;
CREATE POLICY wifi_sync_log_select ON public.wifi_sync_log
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('wifi') >= 1 OR public.is_super_admin());
DROP POLICY IF EXISTS wifi_sync_log_service ON public.wifi_sync_log;
CREATE POLICY wifi_sync_log_service ON public.wifi_sync_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Audit log de mudanças sensíveis ─────────────────────────────────────
DROP TRIGGER IF EXISTS trg_audit_wifi_visitantes ON public.wifi_visitantes;
CREATE TRIGGER trg_audit_wifi_visitantes
AFTER INSERT OR UPDATE OR DELETE ON public.wifi_visitantes
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes('membro_id,cpf,deleted_at');

-- ── Módulo no catálogo + matriz de permissão (copia de 'integracao') ────
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
SELECT 'wifi', 'WiFi', '/wifi', 'ministerial', 305,
       'Acompanhamento dos visitantes do WiFi · frequência por culto e cruzamento com membresia',
       true
WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'wifi');

DO $$
DECLARE base_modulo_id int; novo_id int;
BEGIN
  SELECT id INTO base_modulo_id FROM public.modulos WHERE slug = 'integracao';
  SELECT id INTO novo_id        FROM public.modulos WHERE slug = 'wifi';
  IF base_modulo_id IS NOT NULL AND novo_id IS NOT NULL THEN
    INSERT INTO public.cargo_modulo_permissao
      (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
    SELECT cmp.cargo_id, novo_id, cmp.nivel, cmp.pode_exportar, cmp.pode_aprovar, cmp.escopo_proprio
      FROM public.cargo_modulo_permissao cmp
     WHERE cmp.modulo_id = base_modulo_id
    ON CONFLICT (cargo_id, modulo_id) DO NOTHING;
  END IF;
END $$;

COMMENT ON TABLE public.wifi_visitantes IS 'Espelho dos cadastros do portal WiFi (projeto CBRio Wifi) + vínculo com mem_membros por CPF/telefone.';
COMMENT ON TABLE public.wifi_conexoes  IS 'Espelho dos logs de conexão do portal WiFi · ligado à pessoa por MAC e ao culto pela janela de horário.';
COMMENT ON FUNCTION public.fn_wifi_processar_vinculos() IS 'Deriva normalizações, liga conexão↔pessoa↔culto, casa com membros e cria visitante automático (≥2 cultos). Idempotente.';
