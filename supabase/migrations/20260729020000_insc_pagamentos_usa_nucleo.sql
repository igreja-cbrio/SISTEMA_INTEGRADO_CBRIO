-- ═══════════════════════════════════════════════════════════════════════════
-- Consolidação · insc_pagamentos usa o núcleo pag_* como MOTOR (2026-07-28)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CONTEXTO: `pag_cobrancas`/`pag_pagamentos`/`pag_webhook_eventos`
-- (`20260728120000`) e `insc_pagamentos` (`20260729000100`) nasceram no MESMO
-- DIA, em frentes paralelas, cobrindo pagamento. As duas estavam inertes
-- (nenhum código lia nenhuma). Decisão do Marcos (28/07): **o núcleo `pag_*` é
-- o motor; `insc_pagamentos` é a linha de DOMÍNIO que aponta pra ele.**
--
-- POR QUÊ o núcleo é o motor (não é preferência estética):
--
--  1. `insc_pagamentos.webhook_log JSONB DEFAULT '[]'` guarda histórico mas
--     **não dá idempotência**: anexar num array JSON não impede processar o
--     mesmo evento 2×, e não há UNIQUE por id de evento do PSP. O PSP reentrega
--     rotineiramente (retry + entrega original chegam juntos). Foi exatamente
--     esse furo que quebrou o `generosidade-webhook` do app.
--     `pag_webhook_eventos(provider, evento_id)` UNIQUE + `ON CONFLICT DO
--     NOTHING` resolve: processa só quem conseguiu inserir.
--  2. `pag_cobrancas` tem trigger de máquina de estados — `pago` NUNCA regride.
--     Sem isso, um webhook fora de ordem (reentrega chegando depois do cron de
--     expiração) "despaga" uma inscrição já confirmada.
--  3. O núcleo é provider-agnostic e serve TAMBÉM generosidade, cursos e
--     eventos. Trocar de PSP = 1 arquivo + 1 env, em todos os fluxos de uma vez.
--
-- DIVISÃO DE TRABALHO (é isto que evita dupla contagem):
--   `pag_cobrancas`   → a cobrança e seu estado canônico (o motor)
--   `pag_pagamentos`  → razão auxiliar: liquidação/estorno/tarifa, líquido+taxa
--   `insc_pagamentos` → a linha do DOMÍNIO: "esta inscrição tem esta cobrança",
--                       com os campos que a UI de inscrições já lê
--                       (metodo/status/qr_payload/expira_em/pago_em)
--
-- Aditiva e idempotente. NÃO remove nada de `insc_pagamentos` — a coluna
-- `webhook_log` continua existindo (histórico legível no contexto da
-- inscrição); ela só deixa de ser o mecanismo de idempotência.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Ponte domínio → motor ──────────────────────────────────────────────

ALTER TABLE public.insc_pagamentos
  ADD COLUMN IF NOT EXISTS cobranca_id uuid
    REFERENCES public.pag_cobrancas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_insc_pag_cobranca
  ON public.insc_pagamentos (cobranca_id)
  WHERE cobranca_id IS NOT NULL;

-- 1 cobrança do núcleo atende no máximo 1 linha de inscrição (o inverso —
-- inscrição sem cobrança — segue válido: pagamento manual/dinheiro).
CREATE UNIQUE INDEX IF NOT EXISTS uq_insc_pag_cobranca
  ON public.insc_pagamentos (cobranca_id)
  WHERE cobranca_id IS NOT NULL;

COMMENT ON COLUMN public.insc_pagamentos.cobranca_id IS
  'FK pro motor pag_cobrancas. O estado canônico vive LÁ; aqui é espelho pra UI de inscricoes. NULL = pagamento fora do PSP (dinheiro/transferência lançado à mão).';

COMMENT ON COLUMN public.insc_pagamentos.webhook_log IS
  'Histórico legível no contexto da inscrição. NÃO é mecanismo de idempotência — a idempotência é a UNIQUE de pag_webhook_eventos(provider, evento_id).';

-- ─── 2. Métodos alinhados ao núcleo ───────────────────────────────────────
-- Widening de CHECK (estritamente PERMISSIVO — nenhuma linha existente é
-- invalidada). Sem isso, o dia em que boleto/Apple Pay entrarem (fase 2) o
-- insert quebra numa tabela que o núcleo já sabe representar.

DO $$
BEGIN
  ALTER TABLE public.insc_pagamentos DROP CONSTRAINT IF EXISTS insc_pagamentos_metodo_check;
  ALTER TABLE public.insc_pagamentos
    ADD CONSTRAINT insc_pagamentos_metodo_check
    CHECK (metodo IN ('pix', 'cartao', 'boleto', 'apple_pay', 'dinheiro', 'transferencia'));
EXCEPTION WHEN others THEN
  RAISE WARNING '[insc_pagamentos] nao foi possivel ampliar o CHECK de metodo: %', SQLERRM;
END $$;

-- `provider` segue com o CHECK original ('santander','psp') e NÃO muda: o nome
-- real do provedor vive em `pag_cobrancas.provider`. Cobrança pelo núcleo =
-- `provider='psp'` + `cobranca_id` preenchido.

-- ─── 3. Leitura conjunta (evita cada consumidor reinventar o join) ────────

CREATE OR REPLACE VIEW public.vw_insc_pagamento_estado AS
SELECT
  ip.id                        AS insc_pagamento_id,
  ip.inscricao_id,
  i.evento_id,
  i.membro_id,
  i.nome_completo,
  i.cpf,
  i.status                     AS inscricao_status,
  ip.metodo,
  ip.provider,
  ip.cobranca_id,
  -- Estado canônico vem do MOTOR quando há cobrança; senão cai no espelho
  -- (pagamento manual nunca passa pelo PSP).
  COALESCE(c.status, ip.status) AS status_pagamento,
  COALESCE(c.valor_centavos, ip.valor_centavos) AS valor_centavos,
  c.valor_pago_centavos,
  COALESCE(c.pago_em, ip.pago_em)   AS pago_em,
  COALESCE(c.expira_em, ip.expira_em) AS expira_em,
  c.parcelas_total,
  c.checkout_url,
  COALESCE(c.pix_payload, ip.qr_payload) AS pix_payload,
  c.boleto_linha_digitavel,
  c.cartao_brand,
  c.cartao_last4,
  -- Soma da razão auxiliar (líquido/taxa vêm do payload do PSP)
  (SELECT coalesce(sum(p.liquido_centavos), 0) FROM public.pag_pagamentos p
    WHERE p.cobranca_id = c.id AND p.tipo = 'liquidacao') AS liquido_centavos,
  (SELECT coalesce(sum(p.taxa_centavos), 0) FROM public.pag_pagamentos p
    WHERE p.cobranca_id = c.id AND p.tipo = 'liquidacao') AS taxa_centavos,
  ip.created_at
FROM public.insc_pagamentos ip
JOIN public.inscricoes i ON i.id = ip.inscricao_id
LEFT JOIN public.pag_cobrancas c ON c.id = ip.cobranca_id
WHERE i.deleted_at IS NULL;

COMMENT ON VIEW public.vw_insc_pagamento_estado IS
  'Inscrição + pagamento com o estado CANÔNICO do motor (pag_cobrancas) quando há cobrança. É o que o painel/lista de inscritos deve ler pra mostrar forma de pagamento e valor por pessoa.';
