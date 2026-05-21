-- ============================================================================
-- Totem Kids · schema completo
--
-- Modulo de check-in/checkout do ministerio infantil. Substitui o Planning
-- Center Check-Ins. Sessao de Kids amarra a um culto via kids_sessoes.culto_id.
--
-- Decisoes registradas em docs/checkin-kids-plano.md (2026-05-21):
--   - Crianca NAO vira mem_membros (LGPD com menores)
--   - Sem CPF da crianca · responsavel é mem_membros
--   - Codigo de seguranca 4 chars [A-HJ-NP-Z2-9] gerado por check-in
--   - Override por coord-kids OU admin OU lider-kids-do-dia
--   - Multi-campus preparado via kids_salas.igreja_id
--   - Foto opcional com consentimento explicito (nunca na etiqueta)
--   - Idade max 0-12 anos
--   - Driver Brother QL-820NWB: ESC/P raster via TCP:9100
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ----------------------------------------------------------------------------
-- 1. kids_criancas · cadastro minimo da crianca
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kids_criancas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  data_nascimento date,                              -- LGPD: opcional, mes/ano basta
  sexo text CHECK (sexo IN ('M','F','outro')),
  familia_id uuid REFERENCES public.mem_familias(id) ON DELETE SET NULL,
  observacoes_medicas text,                          -- aparece na etiqueta da crianca
  necessidades_especiais text,
  foto_url text,                                      -- opcional, consentimento
  foto_consentimento_em timestamptz,                  -- quando responsavel deu OK
  visitante boolean NOT NULL DEFAULT true,            -- vira false apos pastoral confirmar
  ativo boolean NOT NULL DEFAULT true,
  observacoes_internas text,                          -- so coord-kids ve
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kids_criancas_familia
  ON public.kids_criancas(familia_id) WHERE familia_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kids_criancas_nome_trgm
  ON public.kids_criancas USING gin (nome gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_kids_criancas_ativo
  ON public.kids_criancas(ativo) WHERE ativo = true;

ALTER TABLE public.kids_criancas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kids_criancas_read"  ON public.kids_criancas;
DROP POLICY IF EXISTS "kids_criancas_write" ON public.kids_criancas;
DROP POLICY IF EXISTS "kids_criancas_update" ON public.kids_criancas;
DROP POLICY IF EXISTS "kids_criancas_delete" ON public.kids_criancas;
CREATE POLICY "kids_criancas_read"   ON public.kids_criancas FOR SELECT TO authenticated USING (true);
CREATE POLICY "kids_criancas_write"  ON public.kids_criancas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "kids_criancas_update" ON public.kids_criancas FOR UPDATE TO authenticated USING (true);
CREATE POLICY "kids_criancas_delete" ON public.kids_criancas FOR DELETE TO authenticated USING (true);

-- ----------------------------------------------------------------------------
-- 2. kids_responsaveis · M:N entre crianca e mem_membros
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kids_responsaveis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crianca_id uuid NOT NULL REFERENCES public.kids_criancas(id) ON DELETE CASCADE,
  membro_id uuid NOT NULL REFERENCES public.mem_membros(id) ON DELETE RESTRICT,
  parentesco text CHECK (parentesco IN
    ('mae','pai','padrasto','madrasta','avo_a','tio_a','irmao_a','tutor','outro')),
  autorizado_buscar boolean NOT NULL DEFAULT true,
  contato_emergencia boolean NOT NULL DEFAULT false,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(crianca_id, membro_id)
);

CREATE INDEX IF NOT EXISTS idx_kids_responsaveis_membro
  ON public.kids_responsaveis(membro_id);

ALTER TABLE public.kids_responsaveis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kids_responsaveis_read"   ON public.kids_responsaveis;
DROP POLICY IF EXISTS "kids_responsaveis_write"  ON public.kids_responsaveis;
DROP POLICY IF EXISTS "kids_responsaveis_update" ON public.kids_responsaveis;
DROP POLICY IF EXISTS "kids_responsaveis_delete" ON public.kids_responsaveis;
CREATE POLICY "kids_responsaveis_read"   ON public.kids_responsaveis FOR SELECT TO authenticated USING (true);
CREATE POLICY "kids_responsaveis_write"  ON public.kids_responsaveis FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "kids_responsaveis_update" ON public.kids_responsaveis FOR UPDATE TO authenticated USING (true);
CREATE POLICY "kids_responsaveis_delete" ON public.kids_responsaveis FOR DELETE TO authenticated USING (true);

-- ----------------------------------------------------------------------------
-- 3. kids_salas · salas fisicas com capacidade e faixa etaria
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kids_salas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  faixa_etaria_min_meses int NOT NULL DEFAULT 0,
  faixa_etaria_max_meses int NOT NULL DEFAULT 156,    -- 13 anos em meses
  capacidade int NOT NULL DEFAULT 30,
  cor text NOT NULL DEFAULT '#EC4899',                -- pink-500 (cor Kids)
  igreja_id uuid REFERENCES public.igrejas(id),       -- multi-campus (Sede default)
  ativo boolean NOT NULL DEFAULT true,
  ordem int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (faixa_etaria_min_meses <= faixa_etaria_max_meses),
  CHECK (capacidade > 0)
);

CREATE INDEX IF NOT EXISTS idx_kids_salas_ativo
  ON public.kids_salas(ativo, ordem) WHERE ativo = true;

ALTER TABLE public.kids_salas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kids_salas_read"   ON public.kids_salas;
DROP POLICY IF EXISTS "kids_salas_write"  ON public.kids_salas;
DROP POLICY IF EXISTS "kids_salas_update" ON public.kids_salas;
DROP POLICY IF EXISTS "kids_salas_delete" ON public.kids_salas;
CREATE POLICY "kids_salas_read"   ON public.kids_salas FOR SELECT TO authenticated USING (true);
CREATE POLICY "kids_salas_write"  ON public.kids_salas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "kids_salas_update" ON public.kids_salas FOR UPDATE TO authenticated USING (true);
CREATE POLICY "kids_salas_delete" ON public.kids_salas FOR DELETE TO authenticated USING (true);

-- ----------------------------------------------------------------------------
-- 4. kids_sessoes · uma sessao de Kids dentro de um culto
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kids_sessoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  culto_id uuid NOT NULL REFERENCES public.cultos(id) ON DELETE CASCADE,
  abrir_em timestamptz NOT NULL,
  fechar_em timestamptz,
  encerrada_at timestamptz,
  encerrada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'agendada'
    CHECK (status IN ('agendada','aberta','encerrada','cancelada')),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(culto_id)
);

CREATE INDEX IF NOT EXISTS idx_kids_sessoes_status
  ON public.kids_sessoes(status, abrir_em DESC);

ALTER TABLE public.kids_sessoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kids_sessoes_read"   ON public.kids_sessoes;
DROP POLICY IF EXISTS "kids_sessoes_write"  ON public.kids_sessoes;
DROP POLICY IF EXISTS "kids_sessoes_update" ON public.kids_sessoes;
DROP POLICY IF EXISTS "kids_sessoes_delete" ON public.kids_sessoes;
CREATE POLICY "kids_sessoes_read"   ON public.kids_sessoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "kids_sessoes_write"  ON public.kids_sessoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "kids_sessoes_update" ON public.kids_sessoes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "kids_sessoes_delete" ON public.kids_sessoes FOR DELETE TO authenticated USING (true);

-- ----------------------------------------------------------------------------
-- 5. kids_estacoes · totem fisico com sua impressora
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kids_estacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  tipo text NOT NULL DEFAULT 'manned'
    CHECK (tipo IN ('manned','self','roster')),
  sala_id uuid REFERENCES public.kids_salas(id),     -- so roster
  printer_target text,                                -- IP:9100 da Brother
  printer_modelo text NOT NULL DEFAULT 'QL-820NWB',
  printer_largura_mm numeric DEFAULT 62,              -- DK-22251 padrao
  printer_altura_mm numeric DEFAULT 100,
  ativo boolean NOT NULL DEFAULT true,
  ultima_impressao_at timestamptz,
  ultima_impressao_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kids_estacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kids_estacoes_read"   ON public.kids_estacoes;
DROP POLICY IF EXISTS "kids_estacoes_write"  ON public.kids_estacoes;
DROP POLICY IF EXISTS "kids_estacoes_update" ON public.kids_estacoes;
DROP POLICY IF EXISTS "kids_estacoes_delete" ON public.kids_estacoes;
CREATE POLICY "kids_estacoes_read"   ON public.kids_estacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "kids_estacoes_write"  ON public.kids_estacoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "kids_estacoes_update" ON public.kids_estacoes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "kids_estacoes_delete" ON public.kids_estacoes FOR DELETE TO authenticated USING (true);

-- ----------------------------------------------------------------------------
-- 6. kids_checkins · registro de presenca · 1 por crianca/sessao
-- Snapshot do responsavel pra UI funcionar mesmo se mem_membros mudar.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kids_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id uuid NOT NULL REFERENCES public.kids_sessoes(id) ON DELETE CASCADE,
  crianca_id uuid NOT NULL REFERENCES public.kids_criancas(id) ON DELETE RESTRICT,
  sala_id uuid NOT NULL REFERENCES public.kids_salas(id),
  estacao_checkin_id uuid REFERENCES public.kids_estacoes(id),

  -- Quem entregou (snapshot)
  responsavel_checkin_id uuid REFERENCES public.mem_membros(id),
  responsavel_checkin_nome text NOT NULL,
  responsavel_checkin_telefone text,
  responsavel_checkin_parentesco text,

  -- Codigo de seguranca + barcode
  codigo_seguranca text NOT NULL,
  codigo_barras text NOT NULL,

  checkin_at timestamptz NOT NULL DEFAULT now(),
  checkin_por uuid REFERENCES auth.users(id),         -- voluntario operador

  -- Checkout
  checkout_at timestamptz,
  responsavel_checkout_id uuid REFERENCES public.mem_membros(id),
  responsavel_checkout_nome text,
  checkout_metodo text CHECK (checkout_metodo IN
    ('codigo_digitado','barcode_escaneado','responsavel_autorizado',
     'override_supervisor','checkout_forcado')),
  checkout_por uuid REFERENCES auth.users(id),
  override_motivo text,
  override_aprovado_por uuid REFERENCES auth.users(id),

  -- Observacoes da sessao
  observacoes_no_dia text,
  fez_decisao_jesus boolean NOT NULL DEFAULT false,
  decisao_jesus_marcada_por uuid REFERENCES auth.users(id),
  decisao_jesus_em timestamptz,

  labels_impressas int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(sessao_id, crianca_id)
);

CREATE INDEX IF NOT EXISTS idx_kids_checkins_sessao
  ON public.kids_checkins(sessao_id);
CREATE INDEX IF NOT EXISTS idx_kids_checkins_abertos
  ON public.kids_checkins(sessao_id, sala_id) WHERE checkout_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_kids_checkins_codigo
  ON public.kids_checkins(codigo_seguranca) WHERE checkout_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_kids_checkins_crianca
  ON public.kids_checkins(crianca_id, checkin_at DESC);

ALTER TABLE public.kids_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kids_checkins_read"   ON public.kids_checkins;
DROP POLICY IF EXISTS "kids_checkins_write"  ON public.kids_checkins;
DROP POLICY IF EXISTS "kids_checkins_update" ON public.kids_checkins;
DROP POLICY IF EXISTS "kids_checkins_delete" ON public.kids_checkins;
CREATE POLICY "kids_checkins_read"   ON public.kids_checkins FOR SELECT TO authenticated USING (true);
CREATE POLICY "kids_checkins_write"  ON public.kids_checkins FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "kids_checkins_update" ON public.kids_checkins FOR UPDATE TO authenticated USING (true);
CREATE POLICY "kids_checkins_delete" ON public.kids_checkins FOR DELETE TO authenticated USING (true);

-- ----------------------------------------------------------------------------
-- 7. kids_etiquetas_log · auditoria de impressao
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kids_etiquetas_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkin_id uuid NOT NULL REFERENCES public.kids_checkins(id) ON DELETE CASCADE,
  estacao_id uuid REFERENCES public.kids_estacoes(id),
  tipo text NOT NULL CHECK (tipo IN ('crianca','responsavel','extra_responsavel','teste')),
  conteudo_json jsonb NOT NULL,
  reimpressao boolean NOT NULL DEFAULT false,
  motivo_reimpressao text,
  impressa_por uuid REFERENCES auth.users(id),
  impressa_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'enviada'
    CHECK (status IN ('enviada','sucesso','falha')),
  erro text
);

CREATE INDEX IF NOT EXISTS idx_kids_etiquetas_log_checkin
  ON public.kids_etiquetas_log(checkin_id);
CREATE INDEX IF NOT EXISTS idx_kids_etiquetas_log_data
  ON public.kids_etiquetas_log(impressa_at DESC);

ALTER TABLE public.kids_etiquetas_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kids_etiquetas_log_read"  ON public.kids_etiquetas_log;
DROP POLICY IF EXISTS "kids_etiquetas_log_write" ON public.kids_etiquetas_log;
CREATE POLICY "kids_etiquetas_log_read"  ON public.kids_etiquetas_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "kids_etiquetas_log_write" ON public.kids_etiquetas_log FOR INSERT TO authenticated WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 8. Funcao: gerar codigo de seguranca (4 chars, sem ambiguos)
-- Alfabeto sem 0/O/I/1 → 32 chars → 32^4 = 1.048.576 combinacoes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_kids_gerar_codigo_seguranca()
RETURNS text LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  alfabeto text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  codigo text;
  tentativas int := 0;
BEGIN
  LOOP
    codigo := '';
    FOR i IN 1..4 LOOP
      codigo := codigo || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
    END LOOP;

    IF NOT EXISTS (
      SELECT 1 FROM public.kids_checkins
      WHERE codigo_seguranca = codigo AND checkout_at IS NULL
    ) THEN
      RETURN codigo;
    END IF;

    tentativas := tentativas + 1;
    IF tentativas > 50 THEN
      RAISE EXCEPTION 'kids: nao conseguiu gerar codigo unico apos 50 tentativas';
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 9. Trigger: ao encerrar sessao, atualiza cultos.presencial_kids
-- Alimenta o fonte_auto do KPI KID-01 automaticamente.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_kids_sessao_consolida_culto()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_total int;
  v_decisoes int;
BEGIN
  IF NEW.status = 'encerrada'
     AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'encerrada') THEN

    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE fez_decisao_jesus = true)
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

DROP TRIGGER IF EXISTS trg_kids_sessao_consolida ON public.kids_sessoes;
CREATE TRIGGER trg_kids_sessao_consolida
  AFTER UPDATE OF status ON public.kids_sessoes
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_kids_sessao_consolida_culto();

-- ----------------------------------------------------------------------------
-- 10. Trigger: decisao kids → cultos_decisoes_pessoas (tipo='kids')
-- Usa o schema ja existente da migration 20260518150000_decisoes_kids_e_cutoff
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_kids_decisao_para_culto()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_culto_id uuid;
  v_crianca_nome text;
  v_cpf_resp text;
BEGIN
  IF NEW.fez_decisao_jesus = true
     AND (OLD.fez_decisao_jesus IS DISTINCT FROM NEW.fez_decisao_jesus) THEN

    SELECT culto_id INTO v_culto_id
      FROM public.kids_sessoes WHERE id = NEW.sessao_id;

    SELECT nome INTO v_crianca_nome
      FROM public.kids_criancas WHERE id = NEW.crianca_id;

    -- CPF do responsavel via mem_membros (se vinculado)
    IF NEW.responsavel_checkin_id IS NOT NULL THEN
      SELECT cpf INTO v_cpf_resp
        FROM public.mem_membros WHERE id = NEW.responsavel_checkin_id;
    END IF;

    -- Evita duplicidade (idempotente)
    IF NOT EXISTS (
      SELECT 1 FROM public.cultos_decisoes_pessoas
       WHERE culto_id = v_culto_id
         AND tipo_decisao = 'kids'
         AND nome = v_crianca_nome
         AND data_decisao = CURRENT_DATE
    ) THEN
      INSERT INTO public.cultos_decisoes_pessoas (
        culto_id, tipo_decisao, nome,
        responsavel_nome, responsavel_telefone, responsavel_cpf,
        data_decisao
      ) VALUES (
        v_culto_id, 'kids', v_crianca_nome,
        NEW.responsavel_checkin_nome,
        NEW.responsavel_checkin_telefone,
        v_cpf_resp,
        CURRENT_DATE
      );
    END IF;

    -- Marca quando foi marcada (caso UI nao preencha)
    IF NEW.decisao_jesus_em IS NULL THEN
      NEW.decisao_jesus_em := now();
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_kids_decisao_para_culto ON public.kids_checkins;
CREATE TRIGGER trg_kids_decisao_para_culto
  BEFORE UPDATE OF fez_decisao_jesus ON public.kids_checkins
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_kids_decisao_para_culto();

-- ----------------------------------------------------------------------------
-- 11. Trigger: updated_at automatico
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_kids_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_kids_criancas_updated ON public.kids_criancas;
CREATE TRIGGER trg_kids_criancas_updated
  BEFORE UPDATE ON public.kids_criancas
  FOR EACH ROW EXECUTE FUNCTION public.fn_kids_set_updated_at();

DROP TRIGGER IF EXISTS trg_kids_sessoes_updated ON public.kids_sessoes;
CREATE TRIGGER trg_kids_sessoes_updated
  BEFORE UPDATE ON public.kids_sessoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_kids_set_updated_at();

DROP TRIGGER IF EXISTS trg_kids_checkins_updated ON public.kids_checkins;
CREATE TRIGGER trg_kids_checkins_updated
  BEFORE UPDATE ON public.kids_checkins
  FOR EACH ROW EXECUTE FUNCTION public.fn_kids_set_updated_at();

-- ----------------------------------------------------------------------------
-- 12. View: estado da sessao ao vivo (painel da coord)
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.vw_kids_sessao_ao_vivo;

CREATE VIEW public.vw_kids_sessao_ao_vivo AS
SELECT
  s.id AS sessao_id,
  s.culto_id,
  c.data AS data_culto,
  c.nome AS culto_nome,
  c.service_type_id,
  vst.name AS service_type_name,
  s.status,
  s.abrir_em,
  s.encerrada_at,
  sala.id AS sala_id,
  sala.nome AS sala_nome,
  sala.cor AS sala_cor,
  sala.capacidade,
  COUNT(ci.*)                                              AS total_checkins,
  COUNT(ci.*) FILTER (WHERE ci.checkout_at IS NULL)        AS criancas_presentes,
  COUNT(ci.*) FILTER (WHERE ci.checkout_at IS NOT NULL)    AS criancas_saidas,
  COUNT(ci.*) FILTER (WHERE ci.fez_decisao_jesus)          AS decisoes_jesus,
  COUNT(ci.*) FILTER (WHERE ci.checkout_metodo = 'override_supervisor') AS overrides,
  ROUND(
    100.0 * COUNT(ci.*) FILTER (WHERE ci.checkout_at IS NULL)
    / NULLIF(sala.capacidade, 0),
    1
  ) AS ocupacao_pct
FROM public.kids_sessoes s
JOIN public.cultos c ON c.id = s.culto_id
LEFT JOIN public.vol_service_types vst ON vst.id = c.service_type_id
LEFT JOIN public.kids_checkins ci ON ci.sessao_id = s.id
LEFT JOIN public.kids_salas sala ON sala.id = ci.sala_id
WHERE s.status IN ('aberta','encerrada')
GROUP BY s.id, s.culto_id, c.data, c.nome, c.service_type_id, vst.name,
         s.status, s.abrir_em, s.encerrada_at,
         sala.id, sala.nome, sala.cor, sala.capacidade
ORDER BY s.abrir_em DESC, sala.ordem;

GRANT SELECT ON public.vw_kids_sessao_ao_vivo TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 13. View: historico por crianca
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.vw_kids_historico_crianca;

CREATE VIEW public.vw_kids_historico_crianca AS
SELECT
  ci.id,
  ci.crianca_id,
  k.nome AS crianca_nome,
  ci.sessao_id,
  s.culto_id,
  c.data AS data_culto,
  c.nome AS culto_nome,
  sala.nome AS sala_nome,
  ci.responsavel_checkin_nome,
  ci.responsavel_checkout_nome,
  ci.checkin_at,
  ci.checkout_at,
  ci.checkout_metodo,
  ci.fez_decisao_jesus,
  ci.observacoes_no_dia
FROM public.kids_checkins ci
JOIN public.kids_criancas k ON k.id = ci.crianca_id
JOIN public.kids_sessoes s ON s.id = ci.sessao_id
JOIN public.cultos c ON c.id = s.culto_id
JOIN public.kids_salas sala ON sala.id = ci.sala_id;

GRANT SELECT ON public.vw_kids_historico_crianca TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 14. Funcao: checkout forcado (cron noturno · 23h)
-- Marca como 'checkout_forcado' qualquer checkin ainda aberto de sessoes
-- encerradas ou de mais de 8h atras.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_kids_checkout_forcado_pendentes()
RETURNS TABLE(checkins_fechados int) LANGUAGE plpgsql AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.kids_checkins
    SET checkout_at = now(),
        checkout_metodo = 'checkout_forcado',
        observacoes_no_dia = COALESCE(observacoes_no_dia || ' · ', '')
                          || 'Checkout forcado pelo cron noturno '
                          || to_char(now(), 'YYYY-MM-DD HH24:MI')
    WHERE checkout_at IS NULL
      AND (
        checkin_at < now() - INTERVAL '8 hours'
        OR EXISTS (
          SELECT 1 FROM public.kids_sessoes s
          WHERE s.id = kids_checkins.sessao_id
            AND s.status = 'encerrada'
            AND s.encerrada_at < now() - INTERVAL '1 hour'
        )
      );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  checkins_fechados := v_count;
  RETURN NEXT;
END $$;

COMMENT ON FUNCTION public.fn_kids_checkout_forcado_pendentes() IS
  'Roda diariamente 23h via pg_cron ou app job · fecha checkins esquecidos abertos > 8h ou de sessoes encerradas ha > 1h.';

COMMIT;

-- ============================================================================
-- Conferencia (rodar no Studio):
--   SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'kids_%';
--   SELECT proname FROM pg_proc WHERE proname LIKE 'fn_kids_%';
--   SELECT * FROM vw_kids_sessao_ao_vivo;
--   SELECT public.fn_kids_gerar_codigo_seguranca();  -- gera codigo de teste
-- ============================================================================
