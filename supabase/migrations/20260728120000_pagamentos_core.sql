-- ═══════════════════════════════════════════════════════════════════════════
-- Núcleo de pagamentos · provider-agnostic (2026-07-28)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Serve QUALQUER módulo que precise cobrar (retiro, cursos, eventos, e o
-- módulo de inscrições genérico do Marcos quando existir). O contrato com o
-- módulo de domínio é `origem_tipo` + um handler registrado no JS —
-- nenhum `if (origem_tipo = ...)` mora aqui.
--
-- DECISÕES QUE SÃO LEI NESTE NÚCLEO (não regredir):
--
--  1. DINHEIRO SEMPRE EM CENTAVOS INTEIROS. Nenhum float, em nenhuma coluna.
--
--  2. `status` é o estado CANÔNICO DO CBRIO, nunca a string do PSP. Todo
--     mapeamento vive em `services/pagamentos/providers/<nome>.js`.
--
--  3. IDEMPOTÊNCIA DO WEBHOOK É A UNIQUE, não um `if` no código.
--     `pag_webhook_eventos (provider, evento_id)` + `ON CONFLICT DO NOTHING`:
--     só processa quem conseguiu INSERIR. Dedup por SELECT-depois-INSERT NÃO
--     é dedup — duas entregas concorrentes do PSP (retry + entrega original,
--     comum) veem ambas "não existe" e ambas inserem. Foi exatamente o bug do
--     `generosidade-webhook` do app.
--
--  4. `pago` NUNCA REGRIDE. Um webhook fora de ordem (reentrega do PSP
--     chegando depois do cron de expiração) não pode "despagar" uma inscrição
--     confirmada. A trava é no trigger, não só no JS.
--
--  5. NUNCA armazenar PAN / CVV / validade / nome impresso / trilha. Só
--     `cartao_brand` e `cartao_last4`, e só como o PSP devolveu. Dado de
--     cartão não entra no nosso banco, nos nossos logs, nem no nosso Express.
--
--  6. `pag_pagamentos` é RAZÃO AUXILIAR (quem pagou o quê) e NUNCA é somada
--     em view/dashboard financeiro. O caixa recebe UMA receita por REPASSE do
--     PSP em `fin_transacoes` (+ uma despesa de tarifa), conciliada contra o
--     crédito do extrato. Somar as duas camadas é como nasce dupla contagem.
--
-- Aditiva e idempotente. Nada aqui altera tabela existente além de anexar
-- `pag_cobrancas` à whitelist de soft-delete.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Cobranças ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pag_cobrancas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Token público: a página de pagamento é acessada POR ELE, nunca pelo uuid
  -- (uuid vaza em log/referer e é usado como chave interna em outros lugares).
  public_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),

  -- ── CONTRATO com os módulos de domínio ──
  -- origem_tipo: 'retiro_inscricao' | 'inscricao' | 'curso' | 'generosidade' | 'manual'
  -- (texto livre de propósito: módulo novo não exige migration aqui)
  origem_tipo text NOT NULL,
  origem_id uuid,
  -- Chave de NEGÓCIO idempotente (ex.: 'retiro:<edicao_id>:<cpf>'): reenvio de
  -- formulário / duplo clique devolve a MESMA cobrança em vez de criar outra.
  referencia text UNIQUE,
  idempotency_key text UNIQUE,

  valor_centavos integer NOT NULL CHECK (valor_centavos > 0),
  valor_pago_centavos integer NOT NULL DEFAULT 0 CHECK (valor_pago_centavos >= 0),
  moeda text NOT NULL DEFAULT 'BRL',

  provider text NOT NULL,
  provider_cobranca_id text,
  provider_cliente_id text,

  metodo text CHECK (metodo IS NULL OR metodo IN
    ('pix', 'boleto', 'cartao', 'apple_pay', 'dinheiro', 'transferencia')),
  metodos_ofertados text[] NOT NULL DEFAULT '{}',
  parcelas_total integer CHECK (parcelas_total IS NULL OR parcelas_total >= 1),
  parcelas_max integer CHECK (parcelas_max IS NULL OR parcelas_max >= 1),
  -- Juros do parcelado repassados ao pagador (decisão do Marcos 2026-07-28:
  -- repassar é o default; a alternativa é a igreja pagar antecipação ao PSP).
  juros_repassados boolean NOT NULL DEFAULT true,

  checkout_url text,
  pix_payload text,
  pix_qrcode_base64 text,
  boleto_linha_digitavel text,
  boleto_url text,
  vencimento date,

  status text NOT NULL DEFAULT 'criada' CHECK (status IN (
    'criada', 'aguardando_pagamento', 'pago_parcial', 'pago',
    'expirada', 'cancelada', 'falhou', 'estornado_parcial', 'estornado',
    'chargeback')),
  expira_em timestamptz,
  pago_em timestamptz,

  -- PII do PAGADOR (pode não ser o participante — no retiro, mãe paga pelo filho)
  pagador_nome text,
  pagador_cpf text,
  pagador_email text,
  pagador_telefone text,
  membro_id uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,

  -- ⚠️ SÓ isto de cartão. NUNCA PAN/CVV/validade.
  cartao_brand text,
  cartao_last4 text CHECK (cartao_last4 IS NULL OR cartao_last4 ~ '^[0-9]{4}$'),

  descricao text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ultimo_erro text,

  criado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

COMMENT ON TABLE public.pag_cobrancas IS
  'Cobranças provider-agnostic. Valores em CENTAVOS. status é canônico do CBRio (mapeamento do PSP vive no adapter JS). NUNCA guardar PAN/CVV.';
COMMENT ON COLUMN public.pag_cobrancas.public_token IS
  'Token da página pública de pagamento. A URL usa ELE, nunca o uuid.';
COMMENT ON COLUMN public.pag_cobrancas.referencia IS
  'Chave de negócio idempotente. Reenvio do form devolve a mesma cobrança.';

CREATE UNIQUE INDEX IF NOT EXISTS pag_cobrancas_provider_uk
  ON public.pag_cobrancas (provider, provider_cobranca_id)
  WHERE provider_cobranca_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pag_cobrancas_origem_idx
  ON public.pag_cobrancas (origem_tipo, origem_id);

CREATE INDEX IF NOT EXISTS pag_cobrancas_status_idx
  ON public.pag_cobrancas (status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS pag_cobrancas_ativas_idx
  ON public.pag_cobrancas (id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS pag_cobrancas_membro_idx
  ON public.pag_cobrancas (membro_id) WHERE membro_id IS NOT NULL;

-- Cron de expiração varre por aqui (só estado não-terminal).
CREATE INDEX IF NOT EXISTS pag_cobrancas_expirar_idx
  ON public.pag_cobrancas (expira_em)
  WHERE status IN ('criada', 'aguardando_pagamento');

-- Cron de reconciliação varre por aqui (a VERDADE do estado é ele, não o webhook).
CREATE INDEX IF NOT EXISTS pag_cobrancas_reconciliar_idx
  ON public.pag_cobrancas (created_at)
  WHERE status IN ('criada', 'aguardando_pagamento', 'pago_parcial');

-- ─── 2. Pagamentos (razão auxiliar: liquidação, estorno, chargeback, tarifa) ──

CREATE TABLE IF NOT EXISTS public.pag_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cobranca_id uuid NOT NULL REFERENCES public.pag_cobrancas(id) ON DELETE CASCADE,

  tipo text NOT NULL CHECK (tipo IN ('liquidacao', 'estorno', 'chargeback', 'tarifa')),
  -- Positivo em liquidação; negativo em estorno/chargeback/tarifa.
  valor_centavos integer NOT NULL,
  -- ⚠️ liquido/taxa vêm do PAYLOAD DO PSP, nunca calculados por nós: a taxa
  -- varia por método, por nº de parcelas e por antecipação. Calcular aqui é
  -- garantia de nunca fechar com o extrato.
  liquido_centavos integer,
  taxa_centavos integer,

  metodo text,
  parcelas integer,

  provider_pagamento_id text,
  e2e_id text,

  pago_em timestamptz NOT NULL DEFAULT now(),
  -- Data do REPASSE do PSP pra conta da igreja. É por aqui que se amarra o
  -- crédito agregado do extrato aos pagamentos individuais.
  repassado_em date,
  -- Sem FK de propósito: `fin_transacoes` é livro-caixa e não deve ganhar
  -- dependência de tabela operacional.
  fin_transacao_id uuid,

  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pag_pagamentos IS
  'Razão auxiliar de pagamentos. NUNCA somada em view/dashboard financeiro — o caixa recebe 1 receita por REPASSE em fin_transacoes. Somar as duas camadas gera dupla contagem.';

CREATE UNIQUE INDEX IF NOT EXISTS pag_pagamentos_provider_uk
  ON public.pag_pagamentos (provider_pagamento_id)
  WHERE provider_pagamento_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pag_pagamentos_cobranca_idx
  ON public.pag_pagamentos (cobranca_id, pago_em DESC);

CREATE INDEX IF NOT EXISTS pag_pagamentos_repasse_idx
  ON public.pag_pagamentos (repassado_em) WHERE repassado_em IS NOT NULL;

-- ─── 3. Eventos de webhook (a UNIQUE É o mecanismo de idempotência) ────────

CREATE TABLE IF NOT EXISTS public.pag_webhook_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  evento_id text NOT NULL,
  tipo text,
  cobranca_id uuid REFERENCES public.pag_cobrancas(id) ON DELETE SET NULL,
  assinatura_ok boolean,
  status_processamento text NOT NULL DEFAULT 'recebido'
    CHECK (status_processamento IN ('recebido', 'processado', 'ignorado', 'erro')),
  erro text,
  tentativas integer NOT NULL DEFAULT 0,
  processado_em timestamptz,
  -- Payload bruto SEMPRE gravado, inclusive quando o processamento falha —
  -- é o que permite replay sem depender de reentrega do PSP.
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, evento_id)
);

COMMENT ON TABLE public.pag_webhook_eventos IS
  'Log + idempotência de webhook. Processa SÓ quem conseguiu inserir (ON CONFLICT DO NOTHING). Payload bruto guardado sempre, para replay.';

CREATE INDEX IF NOT EXISTS pag_webhook_eventos_pendente_idx
  ON public.pag_webhook_eventos (created_at DESC)
  WHERE status_processamento IN ('erro', 'recebido');

CREATE INDEX IF NOT EXISTS pag_webhook_eventos_cobranca_idx
  ON public.pag_webhook_eventos (cobranca_id) WHERE cobranca_id IS NOT NULL;

-- ─── 4. Máquina de estados (trigger · não confia só no JS) ─────────────────
--
-- Transição inválida é IGNORADA com WARNING, não abortada. Motivo: exception
-- num handler de webhook vira retry infinito no PSP. O objetivo é que o
-- estado não regrida, não punir o remetente.

CREATE OR REPLACE FUNCTION public.fn_pag_cobrancas_transicao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
       (OLD.status = 'criada'               AND NEW.status IN ('aguardando_pagamento', 'pago', 'pago_parcial', 'cancelada', 'expirada', 'falhou'))
    OR (OLD.status = 'aguardando_pagamento' AND NEW.status IN ('pago', 'pago_parcial', 'cancelada', 'expirada', 'falhou'))
    OR (OLD.status = 'pago_parcial'         AND NEW.status IN ('pago', 'cancelada', 'expirada', 'estornado', 'estornado_parcial', 'chargeback'))
    OR (OLD.status = 'pago'                 AND NEW.status IN ('estornado', 'estornado_parcial', 'chargeback'))
    OR (OLD.status = 'estornado_parcial'    AND NEW.status IN ('estornado', 'chargeback'))
  ) THEN
    RAISE WARNING '[pag_cobrancas] transicao bloqueada: % -> % (cobranca %)',
      OLD.status, NEW.status, OLD.id;
    NEW.status := OLD.status;   -- ignora a regressão, NÃO aborta
    RETURN NEW;
  END IF;

  IF NEW.status = 'pago' AND NEW.pago_em IS NULL THEN
    NEW.pago_em := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pag_cobrancas_transicao ON public.pag_cobrancas;
CREATE TRIGGER trg_pag_cobrancas_transicao
  BEFORE UPDATE ON public.pag_cobrancas
  FOR EACH ROW EXECUTE FUNCTION public.fn_pag_cobrancas_transicao();

-- `expirada`/`cancelada`/`falhou` são ABSORVENTES: não aparecem como OLD em
-- nenhum ramo permitido acima, então nada as reabre. Reabrir = cobrança nova.

-- ─── 5. Soft-delete · whitelist ───────────────────────────────────────────
-- Lê a lista VIVA e só acrescenta (não hardcoda o conteúdo: hardcodar já
-- causou perda de entradas em levas anteriores).

DO $$
DECLARE
  lista text[];
  novas text[] := ARRAY['pag_cobrancas'];
  faltando text[] := '{}';
  t text;
BEGIN
  SELECT public.app_soft_deletable_tables() INTO lista;

  FOREACH t IN ARRAY novas LOOP
    IF NOT (t = ANY(lista)) THEN
      faltando := faltando || t;
    END IF;
  END LOOP;

  IF array_length(faltando, 1) IS NULL THEN
    RAISE NOTICE '[pagamentos] whitelist de soft-delete ja continha tudo';
    RETURN;
  END IF;

  lista := lista || faltando;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables() '
    'RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $f$ SELECT %L::TEXT[] $f$',
    lista
  );

  RAISE NOTICE '[pagamentos] whitelist += % (total %)',
    array_to_string(faltando, ', '), array_length(lista, 1);
END $$;

-- ─── 6. Audit log (dinheiro e identidade do pagador) ──────────────────────

DROP TRIGGER IF EXISTS trg_audit_pag_cobrancas ON public.pag_cobrancas;
CREATE TRIGGER trg_audit_pag_cobrancas
  AFTER INSERT OR UPDATE OR DELETE ON public.pag_cobrancas
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
    'status,valor_centavos,valor_pago_centavos,membro_id,pagador_cpf,metodo,deleted_at'
  );

-- ─── 7. RLS ───────────────────────────────────────────────────────────────
-- `pag_cobrancas` tem PII (nome/CPF/e-mail/telefone do pagador) → policies
-- contextuais obrigatórias. O módulo `retiros` ainda não existe em `modulos`;
-- `current_user_module_level` devolve 0 pra slug desconhecido, então a
-- cláusula é inerte até o módulo ser semeado (Fase 3) — e não amplia acesso.

ALTER TABLE public.pag_cobrancas      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pag_pagamentos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pag_webhook_eventos ENABLE ROW LEVEL SECURITY;

-- pag_cobrancas
DROP POLICY IF EXISTS pag_cobrancas_select ON public.pag_cobrancas;
CREATE POLICY pag_cobrancas_select ON public.pag_cobrancas
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.current_user_module_level('financeiro') >= 2
    OR public.current_user_module_level('retiros') >= 2
    OR membro_id = public.current_user_membro_id()
  );

DROP POLICY IF EXISTS pag_cobrancas_insert ON public.pag_cobrancas;
CREATE POLICY pag_cobrancas_insert ON public.pag_cobrancas
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin()
    OR public.current_user_module_level('financeiro') >= 3
    OR public.current_user_module_level('retiros') >= 3
  );

DROP POLICY IF EXISTS pag_cobrancas_update ON public.pag_cobrancas;
CREATE POLICY pag_cobrancas_update ON public.pag_cobrancas
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR public.current_user_module_level('financeiro') >= 3
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.current_user_module_level('financeiro') >= 3
  );

DROP POLICY IF EXISTS pag_cobrancas_delete ON public.pag_cobrancas;
CREATE POLICY pag_cobrancas_delete ON public.pag_cobrancas
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS pag_cobrancas_service ON public.pag_cobrancas;
CREATE POLICY pag_cobrancas_service ON public.pag_cobrancas
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- pag_pagamentos · dado financeiro. O membro NÃO lê daqui (a UI dele mostra o
-- status da própria cobrança, que já basta); taxa/líquido é informação interna.
DROP POLICY IF EXISTS pag_pagamentos_select ON public.pag_pagamentos;
CREATE POLICY pag_pagamentos_select ON public.pag_pagamentos
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.current_user_module_level('financeiro') >= 2
    OR public.current_user_module_level('retiros') >= 2
  );

DROP POLICY IF EXISTS pag_pagamentos_write ON public.pag_pagamentos;
CREATE POLICY pag_pagamentos_write ON public.pag_pagamentos
  FOR ALL TO authenticated
  USING (public.is_super_admin() OR public.current_user_module_level('financeiro') >= 4)
  WITH CHECK (public.is_super_admin() OR public.current_user_module_level('financeiro') >= 4);

DROP POLICY IF EXISTS pag_pagamentos_service ON public.pag_pagamentos;
CREATE POLICY pag_pagamentos_service ON public.pag_pagamentos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- pag_webhook_eventos · payload cru do PSP. SÓ super-admin lê pela anon key;
-- o resto é service_role (backend). Nunca legível por `authenticated` comum.
DROP POLICY IF EXISTS pag_webhook_eventos_select ON public.pag_webhook_eventos;
CREATE POLICY pag_webhook_eventos_select ON public.pag_webhook_eventos
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS pag_webhook_eventos_service ON public.pag_webhook_eventos;
CREATE POLICY pag_webhook_eventos_service ON public.pag_webhook_eventos
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 8. Invariantes de conciliação (a rede que grita quando divergir) ──────
-- A ausência de algo assim é o que deixou a dupla contagem de ~R$ 1,5 mi
-- passar meses sem ninguém notar. Ler esta view faz parte do fechamento.

CREATE OR REPLACE VIEW public.vw_pag_invariantes AS
WITH liq AS (
  SELECT
    c.origem_tipo,
    count(DISTINCT c.id) FILTER (WHERE c.status = 'pago')            AS cobrancas_pagas,
    coalesce(sum(p.valor_centavos)   FILTER (WHERE p.tipo = 'liquidacao'), 0) AS bruto_centavos,
    coalesce(sum(p.liquido_centavos) FILTER (WHERE p.tipo = 'liquidacao'), 0) AS liquido_centavos,
    coalesce(sum(p.taxa_centavos)    FILTER (WHERE p.tipo = 'liquidacao'), 0) AS taxa_centavos,
    coalesce(sum(-p.valor_centavos)  FILTER (WHERE p.tipo IN ('estorno', 'chargeback')), 0) AS estornado_centavos,
    count(DISTINCT p.fin_transacao_id) FILTER (WHERE p.fin_transacao_id IS NOT NULL) AS repasses_lancados,
    count(*) FILTER (WHERE p.tipo = 'liquidacao' AND p.fin_transacao_id IS NULL)     AS liquidacoes_sem_caixa
  FROM public.pag_cobrancas c
  LEFT JOIN public.pag_pagamentos p ON p.cobranca_id = c.id
  WHERE c.deleted_at IS NULL
  GROUP BY c.origem_tipo
)
SELECT
  origem_tipo,
  cobrancas_pagas,
  bruto_centavos,
  liquido_centavos,
  taxa_centavos,
  estornado_centavos,
  repasses_lancados,
  liquidacoes_sem_caixa,
  -- bruto tem que fechar com liquido + taxa (o PSP manda os três; se não
  -- fecha, algum adapter está calculando em vez de ler o payload).
  (bruto_centavos <> liquido_centavos + taxa_centavos) AS alerta_bruto_nao_fecha,
  -- liquidação sem `fin_transacao_id` = dinheiro recebido que ainda não virou
  -- caixa. Esperado por alguns dias (até o repasse); crônico = furo no DRE.
  (liquidacoes_sem_caixa > 0)                          AS alerta_falta_lancar_caixa
FROM liq;

COMMENT ON VIEW public.vw_pag_invariantes IS
  'Invariantes de conciliação por origem. alerta_* true = investigar antes de fechar o mês. Não é dashboard: é rede de segurança contra dupla contagem.';
