-- Forma de pagamento POR PESSOA: parar de mostrar "Pix" pra todo mundo
-- (pergunta do Marcos · 2026-07-30: "pelo sistema vou conseguir saber a forma de
-- pagamento de cada pessoa?")
--
-- ⚠️ O defeito: a `vw_insc_pagamento_estado` (20260729020000) resolve status,
-- valor, `pago_em` e `expira_em` com `COALESCE(motor, espelho)` — **menos
-- `metodo`**, que lia `ip.metodo` cru, só do espelho `insc_pagamentos`. E o
-- espelho:
--
--   • nasce com `cobranca.metodo || 'pix'` — na criação a pessoa AINDA NÃO
--     escolheu, então o 'pix' é palpite gravado como fato;
--   • nunca é atualizado (o `espelhar()` do handler só toca status/pago_em), então
--     escolher cartão depois não corrigia nada;
--   • não PODIA guardar a verdade: `NOT NULL CHECK (metodo IN ('pix','cartao'))` —
--     boleto não cabia, e "ainda não escolheu" não cabia.
--
-- O método correto sempre existiu em `pag_cobrancas.metodo` (preenchido pela
-- escolha em `definirMetodo` e pelo webhook/reconciliação). Era só a LEITURA que
-- estava no lugar errado.
--
-- Sem backfill de propósito: com a view preferindo o motor, o 'pix' histórico do
-- espelho deixa de ser lido onde existe cobrança; onde NÃO existe cobrança
-- (pagamento manual, lançado por gente) o espelho é a verdade e fica como está.

-- ── 1. O espelho passa a caber a verdade ──────────────────────────────────
-- NULL = "ainda não escolheu" (estado real de toda cobrança recém-criada).
ALTER TABLE public.insc_pagamentos ALTER COLUMN metodo DROP NOT NULL;

-- Descobre o nome REAL do CHECK no catálogo antes de dropar — o nome inline
-- gerado pelo Postgres não é garantido (técnica da 20260729070000).
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.insc_pagamentos'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%metodo%'
  LOOP
    EXECUTE format('ALTER TABLE public.insc_pagamentos DROP CONSTRAINT %I', c.conname);
    RAISE NOTICE 'CHECK antigo de metodo removido: %', c.conname;
  END LOOP;
END $$;

-- Vocabulário ÚNICO: o mesmo de `pag_cobrancas.metodo` e de
-- `backend/services/pagamentos/tipos.js` (METODOS). Duas listas divergentes de
-- forma de pagamento é como o boleto tinha ficado de fora.
ALTER TABLE public.insc_pagamentos ADD CONSTRAINT insc_pagamentos_metodo_check
  CHECK (metodo IS NULL OR metodo IN
    ('pix', 'boleto', 'cartao', 'apple_pay', 'dinheiro', 'transferencia'));

COMMENT ON COLUMN public.insc_pagamentos.metodo IS
  'Forma de pagamento do ESPELHO. NULL = a pessoa ainda não escolheu. A fonte canônica é pag_cobrancas.metodo quando há cobranca_id — leia pela vw_insc_pagamento_estado.';

-- ── 2. A view lê o motor primeiro (como já faz com status e valor) ────────
-- Recriada por completo (CREATE OR REPLACE exige a mesma lista de colunas, na
-- mesma ordem): só a linha do `metodo` muda.
CREATE OR REPLACE VIEW public.vw_insc_pagamento_estado AS
SELECT
  ip.id                        AS insc_pagamento_id,
  ip.inscricao_id,
  i.evento_id,
  i.membro_id,
  i.nome_completo,
  i.cpf,
  i.status                     AS inscricao_status,
  -- ⚠️ Motor primeiro. O espelho só responde quando não há cobrança (pagamento
  -- manual), que é exatamente quando ele é a verdade.
  COALESCE(c.metodo, ip.metodo) AS metodo,
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
  'Inscrição + pagamento com o estado CANÔNICO do motor (pag_cobrancas) quando há cobrança — inclusive a FORMA de pagamento. É o que o painel/lista de inscritos deve ler pra mostrar forma e valor por pessoa.';

-- Mesma régua de sempre: acesso só pelo backend.
REVOKE ALL ON public.vw_insc_pagamento_estado FROM anon, authenticated;
