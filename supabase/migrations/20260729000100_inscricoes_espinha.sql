-- ============================================================================
-- MÓDULO DE INSCRIÇÕES · F3.2 PR 1 — A ESPINHA (specs: docs/modulo-inscricoes/)
-- 6 tabelas novas: séries (recorrência), eventos, inscrições (tronco),
-- pagamentos, check-ins e sorteios. NADA consome ainda (zero comportamento);
-- o módulo /inscricoes e a página pública chegam nas PRs seguintes.
--
-- Aplicação manual: 1 colagem só (tabelas NOVAS — sem conflito com tráfego;
-- os FKs tocam mem_membros/profiles/igrejas por instantes). Se falhar com
-- "lock timeout": rodar de novo (tudo idempotente).
-- ============================================================================
SET lock_timeout = '10s';

-- ── updated_at genérico das tabelas da espinha ──
CREATE OR REPLACE FUNCTION public.fn_insc_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

-- ── 1. Séries (recorrência · decisão Marcos 28/07) ──
CREATE TABLE IF NOT EXISTS public.insc_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  slug_base TEXT NOT NULL UNIQUE,
  area TEXT NOT NULL,  -- catálogo oficial `areas` (culto ou ministerial) — nunca lista paralela
  periodicidade TEXT NOT NULL DEFAULT 'unica'
    CHECK (periodicidade IN ('unica','semanal','mensal','anual','custom')),
  tipo TEXT NOT NULL DEFAULT 'evento' CHECK (tipo IN ('evento','retiro')),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
DROP TRIGGER IF EXISTS trg_insc_series_updated ON public.insc_series;
CREATE TRIGGER trg_insc_series_updated BEFORE UPDATE ON public.insc_series
  FOR EACH ROW EXECUTE FUNCTION public.fn_insc_updated_at();

-- ── 2. Eventos (edições) ──
CREATE TABLE IF NOT EXISTS public.insc_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  serie_id UUID REFERENCES public.insc_series(id) ON DELETE SET NULL,  -- NULL = avulso
  edicao_rotulo TEXT,          -- '2026-08' (mensal) · '2026' (anual)
  area TEXT NOT NULL,          -- obrigatória (28/07) — herda da série quando houver
  tipo TEXT NOT NULL DEFAULT 'evento' CHECK (tipo IN ('evento','retiro')),
  descricao TEXT,
  data DATE,
  hora TEXT,
  local TEXT,
  capa_url TEXT,
  campos JSONB NOT NULL DEFAULT '[]',       -- SÓ extras do form-builder (key opaca estável)
  vagas INT,                                -- NULL = ilimitado
  inscricoes_abrem_em TIMESTAMPTZ,
  inscricoes_encerram_em TIMESTAMPTZ,
  msg_sucesso_titulo TEXT,
  msg_sucesso_texto TEXT,
  msg_whatsapp TEXT,
  tem_sorteio BOOLEAN NOT NULL DEFAULT false,
  premios JSONB NOT NULL DEFAULT '[]',
  pagamento_ativo BOOLEAN NOT NULL DEFAULT false,
  valor_centavos INT,
  pagamento_metodos TEXT[] NOT NULL DEFAULT '{}',   -- {'pix'} fase A · +'cartao' fase B
  pagamento_expira_horas INT NOT NULL DEFAULT 48,
  checkin_ativo BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','publicado','encerrado','arquivado')),
  igreja_id UUID REFERENCES public.igrejas(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_insc_eventos_serie ON public.insc_eventos (serie_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_insc_eventos_data ON public.insc_eventos (data) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_insc_eventos_status ON public.insc_eventos (status, data) WHERE deleted_at IS NULL;
DROP TRIGGER IF EXISTS trg_insc_eventos_updated ON public.insc_eventos;
CREATE TRIGGER trg_insc_eventos_updated BEFORE UPDATE ON public.insc_eventos
  FOR EACH ROW EXECUTE FUNCTION public.fn_insc_updated_at();

-- ── 3. Inscrições (o TRONCO) ──
-- Campos do contrato são nullable no schema; a completude é exigida pelo CHECK
-- apenas quando NÃO é linha migrada de legado (legado_fonte IS NULL) — as
-- inscrições antigas do Celebra (nome+telefone) entram intactas (SPEC-04).
CREATE TABLE IF NOT EXISTS public.inscricoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id UUID NOT NULL REFERENCES public.insc_eventos(id) ON DELETE CASCADE,
  membro_id UUID REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  nome_completo TEXT NOT NULL,
  telefone TEXT,               -- digits-only
  cpf TEXT,                    -- com DV (validação na aplicação)
  email TEXT,
  data_nascimento DATE,
  sexo TEXT CHECK (sexo IS NULL OR sexo IN ('masculino','feminino')),
  endereco TEXT,
  cep TEXT,
  dados JSONB NOT NULL DEFAULT '{}',
  dados_anterior JSONB,        -- snapshot pré-merge de re-inscrição
  status TEXT NOT NULL DEFAULT 'confirmada'
    CHECK (status IN ('recebida','confirmada','cancelada')),  -- recebida = pagamento pendente
  origem TEXT NOT NULL DEFAULT 'formulario_publico',
  numero_sorte INT,
  legado_ref UUID,             -- id original na tabela de origem (migração)
  legado_fonte TEXT,           -- ex.: 'ext_inscricoes'
  whatsapp_optin BOOLEAN NOT NULL DEFAULT false,
  whatsapp_optin_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_inscricoes_contrato CHECK (
    legado_fonte IS NOT NULL OR (
      telefone IS NOT NULL AND cpf IS NOT NULL AND email IS NOT NULL
      AND data_nascimento IS NOT NULL AND sexo IS NOT NULL
    )
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inscricoes_evento_cpf
  ON public.inscricoes (evento_id, cpf) WHERE deleted_at IS NULL AND cpf IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_inscricoes_evento_sorte
  ON public.inscricoes (evento_id, numero_sorte) WHERE deleted_at IS NULL AND numero_sorte IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inscricoes_evento ON public.inscricoes (evento_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inscricoes_membro ON public.inscricoes (membro_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inscricoes_cpf ON public.inscricoes (cpf) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inscricoes_created ON public.inscricoes (created_at DESC);
DROP TRIGGER IF EXISTS trg_inscricoes_updated ON public.inscricoes;
CREATE TRIGGER trg_inscricoes_updated BEFORE UPDATE ON public.inscricoes
  FOR EACH ROW EXECUTE FUNCTION public.fn_insc_updated_at();
-- Audit de PII (padrão da casa)
DROP TRIGGER IF EXISTS trg_audit_inscricoes ON public.inscricoes;
CREATE TRIGGER trg_audit_inscricoes
AFTER INSERT OR UPDATE OR DELETE ON public.inscricoes
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'nome_completo,telefone,cpf,email,status,deleted_at'
);

-- ── 4. Pagamentos (fase A Pix · fase B cartão — SPEC-05) ──
-- SEM deleted_at de propósito: registro financeiro não se apaga.
CREATE TABLE IF NOT EXISTS public.insc_pagamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inscricao_id UUID NOT NULL REFERENCES public.inscricoes(id) ON DELETE CASCADE,
  metodo TEXT NOT NULL CHECK (metodo IN ('pix','cartao')),
  provider TEXT NOT NULL CHECK (provider IN ('santander','psp')),
  provider_ref TEXT,
  valor_centavos INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','aguardando','pago','expirado','estornado')),
  qr_payload TEXT,
  expira_em TIMESTAMPTZ,
  pago_em TIMESTAMPTZ,
  estornado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  estorno_motivo TEXT,
  webhook_log JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_insc_pag_inscricao_ativa
  ON public.insc_pagamentos (inscricao_id) WHERE status IN ('pendente','aguardando','pago');
CREATE INDEX IF NOT EXISTS idx_insc_pag_status ON public.insc_pagamentos (status, created_at DESC);
DROP TRIGGER IF EXISTS trg_insc_pag_updated ON public.insc_pagamentos;
CREATE TRIGGER trg_insc_pag_updated BEFORE UPDATE ON public.insc_pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_insc_updated_at();
DROP TRIGGER IF EXISTS trg_audit_insc_pagamentos ON public.insc_pagamentos;
CREATE TRIGGER trg_audit_insc_pagamentos
AFTER INSERT OR UPDATE OR DELETE ON public.insc_pagamentos
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'status,valor_centavos,pago_em,estornado_por'
);

-- ── 5. Check-ins (SPEC-06) ──
CREATE TABLE IF NOT EXISTS public.insc_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inscricao_id UUID NOT NULL UNIQUE REFERENCES public.inscricoes(id) ON DELETE CASCADE,
  em TIMESTAMPTZ NOT NULL DEFAULT now(),
  por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  modo TEXT CHECK (modo IN ('busca','qr'))
);

-- ── 6. Sorteios (espelho do conceito do ext) ──
CREATE TABLE IF NOT EXISTS public.insc_sorteios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id UUID NOT NULL REFERENCES public.insc_eventos(id) ON DELETE CASCADE,
  premio TEXT,
  numero_sorteado INT NOT NULL,
  inscricao_id UUID REFERENCES public.inscricoes(id) ON DELETE SET NULL,
  ganhador_nome TEXT,
  sorteado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  sorteado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_insc_sorteios_evento ON public.insc_sorteios (evento_id);

-- ── Whitelist de soft-delete (padrão array_append · preserva a lista vigente) ──
DO $$
DECLARE atual TEXT[];
BEGIN
  SELECT public.app_soft_deletable_tables() INTO atual;
  IF NOT ('insc_series' = ANY(atual)) THEN atual := array_append(atual, 'insc_series'::text); END IF;
  IF NOT ('insc_eventos' = ANY(atual)) THEN atual := array_append(atual, 'insc_eventos'::text); END IF;
  IF NOT ('inscricoes' = ANY(atual)) THEN atual := array_append(atual, 'inscricoes'::text); END IF;
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables() RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $f$ SELECT %L::TEXT[] $f$',
    atual
  );
END $$;

-- ── RLS (padrão PII da casa) ──
-- O slug 'inscricoes' entra no catálogo `modulos` na PR do módulo (UI);
-- até lá current_user_module_level('inscricoes') resolve 0 → só service_role
-- e super-admin enxergam. Público grava via backend (service_role).
ALTER TABLE public.insc_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insc_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inscricoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insc_pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insc_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insc_sorteios ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['insc_series','insc_eventos','inscricoes','insc_pagamentos','insc_checkins','insc_sorteios'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated
         USING (public.current_user_module_level(''inscricoes'') >= 1 OR public.is_super_admin())', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated
         USING (public.current_user_module_level(''inscricoes'') >= 3 OR public.is_super_admin())
         WITH CHECK (public.current_user_module_level(''inscricoes'') >= 3 OR public.is_super_admin())', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_service ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_service ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

COMMENT ON TABLE public.inscricoes IS
  'Tronco do Contrato de Inscrição (espinha · F3.2). Portas novas nascem aqui; legadas migram porta a porta (SPEC-04) com legado_ref/legado_fonte. Specs: docs/modulo-inscricoes/.';
COMMENT ON TABLE public.insc_series IS
  'Séries com periodicidade (Celebra mensal, retiro anual…) — habilitam o comparador edição×edição do dashboard.';
