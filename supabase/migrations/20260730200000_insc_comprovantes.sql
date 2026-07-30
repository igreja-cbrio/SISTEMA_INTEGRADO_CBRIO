-- Comprovante de Pix / transferência anexado pela pessoa · conferência HUMANA
-- (pedido do Marcos · 2026-07-30: "preciso que nessa tela apareça o comprovante
-- anexado, para quando o pagamento for por pix ou transferencia")
--
-- ⚠️ LEI DESTA FEATURE (não regredir): **imagem NUNCA marca pagamento**. O
-- comprovante é EVIDÊNCIA que entra numa fila; quem baixa o pagamento é uma
-- pessoa da equipe, e o registro fica com autoria (`marcarPagoManual` exige
-- `confirmado_por`). Ler pixel de print de celular e concluir "pagou" é
-- exatamente como se aprova uma inscrição com comprovante falso — e o dinheiro
-- não está lá pra conciliar depois.
--
-- Por que tabela e não coluna em `insc_pagamentos`: a pessoa manda o arquivo
-- errado e manda de novo; recusado + reenviado é o caso NORMAL, não a exceção.
-- Uma coluna sobrescreveria a evidência da tentativa anterior — e é justamente
-- o histórico que responde "por que aceitamos este pagamento?".
--
-- O arquivo vive em bucket PRIVADO. Aqui fica só o PATH; a equipe vê por signed
-- URL gerada pelo backend (padrão do kids-documentos). Comprovante bancário tem
-- nome, agência/conta e às vezes CPF do pagador — URL pública seria vazamento
-- indexável.

CREATE TABLE IF NOT EXISTS public.insc_comprovantes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inscricao_id   UUID NOT NULL REFERENCES public.inscricoes(id) ON DELETE CASCADE,
  -- A cobrança que este comprovante alega quitar. Nullable porque pode haver
  -- inscrição sem cobrança (lançamento manual) — e o comprovante ainda serve.
  cobranca_id    UUID REFERENCES public.pag_cobrancas(id) ON DELETE SET NULL,

  -- O que a PESSOA declara ter feito. É declaração, não fato verificado: por
  -- isso vocabulário próprio e restrito, não o METODOS do núcleo inteiro
  -- (ninguém "anexa comprovante de cartão" — cartão o PSP confirma).
  metodo_declarado TEXT NOT NULL DEFAULT 'pix'
    CHECK (metodo_declarado IN ('pix', 'transferencia')),

  storage_path   TEXT NOT NULL,
  arquivo_nome   TEXT,
  arquivo_tipo   TEXT,
  arquivo_bytes  INTEGER,
  observacao     TEXT,          -- o que a pessoa escreveu junto

  status         TEXT NOT NULL DEFAULT 'em_analise'
    CHECK (status IN ('em_analise', 'aceito', 'recusado')),

  -- Autoria da CONFERÊNCIA. `revisado_por` sem FK e com nome em snapshot: quem
  -- conferiu pode sair da igreja e ter o profile apagado, e a prova de quem
  -- liberou aquele dinheiro não pode desaparecer com a conta.
  revisado_por       UUID,
  revisado_por_nome  TEXT,
  revisado_em        TIMESTAMPTZ,
  motivo_recusa      TEXT,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ,

  -- Recusa sem motivo é decisão que ninguém consegue explicar depois — e a
  -- pessoa do outro lado precisa saber o que corrigir pra reenviar.
  CONSTRAINT chk_insc_comprovantes_recusa
    CHECK (status <> 'recusado' OR (motivo_recusa IS NOT NULL AND length(btrim(motivo_recusa)) >= 3))
);

CREATE INDEX IF NOT EXISTS idx_insc_comprovantes_inscricao
  ON public.insc_comprovantes (inscricao_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_insc_comprovantes_fila
  ON public.insc_comprovantes (status, created_at) WHERE deleted_at IS NULL AND status = 'em_analise';
CREATE INDEX IF NOT EXISTS idx_insc_comprovantes_cobranca
  ON public.insc_comprovantes (cobranca_id) WHERE deleted_at IS NULL;

-- Whitelist de soft-delete (lei nº 4 · lida da lista VIVA, nunca reescrita à mão)
DO $$
DECLARE atual TEXT[];
BEGIN
  SELECT public.app_soft_deletable_tables() INTO atual;
  IF NOT ('insc_comprovantes' = ANY(atual)) THEN
    atual := array_append(atual, 'insc_comprovantes'::text);
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables() RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $f$ SELECT %L::TEXT[] $f$',
      atual
    );
  END IF;
END $$;

-- ── RLS · mesmo molde das tabelas da espinha ───────────────────────────────
-- INSERT não tem policy pra `authenticated` de propósito: quem anexa é a
-- PESSOA, sem login, pela porta pública → backend com service_role (lei nº 7
-- da segurança). Conferir (UPDATE) é ato de gestão: nível 3.
ALTER TABLE public.insc_comprovantes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS insc_comprovantes_select ON public.insc_comprovantes;
CREATE POLICY insc_comprovantes_select ON public.insc_comprovantes
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('inscricoes') >= 1 OR public.is_super_admin());

DROP POLICY IF EXISTS insc_comprovantes_update ON public.insc_comprovantes;
CREATE POLICY insc_comprovantes_update ON public.insc_comprovantes
  FOR UPDATE TO authenticated
  USING (public.current_user_module_level('inscricoes') >= 3 OR public.is_super_admin())
  WITH CHECK (public.current_user_module_level('inscricoes') >= 3 OR public.is_super_admin());

DROP POLICY IF EXISTS insc_comprovantes_delete ON public.insc_comprovantes;
CREATE POLICY insc_comprovantes_delete ON public.insc_comprovantes
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS insc_comprovantes_service ON public.insc_comprovantes;
CREATE POLICY insc_comprovantes_service ON public.insc_comprovantes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Audit: aceitar/recusar comprovante é o gatilho de dinheiro entrando na lista
-- do evento. Quem aceitou, quando e por quê fica no app_audit_log.
DROP TRIGGER IF EXISTS trg_audit_insc_comprovantes ON public.insc_comprovantes;
CREATE TRIGGER trg_audit_insc_comprovantes
AFTER INSERT OR UPDATE OR DELETE ON public.insc_comprovantes
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'status,revisado_por,revisado_por_nome,revisado_em,motivo_recusa,cobranca_id,deleted_at'
);

-- ── Bucket PRIVADO ────────────────────────────────────────────────────────
-- Nenhuma policy pra anon/authenticated: o upload vem do backend (service_role,
-- que bypassa a RLS de storage) e a leitura é só por signed URL de 15 min.
-- Diferente do kids-documentos, aqui NÃO existe insert por client autenticado —
-- quem envia não tem conta no sistema.
INSERT INTO storage.buckets (id, name, public)
VALUES ('inscricao-comprovantes', 'inscricao-comprovantes', false)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.insc_comprovantes IS
  'Comprovantes de Pix/transferência anexados pela pessoa na página pública de pagamento. Arquivo no bucket privado inscricao-comprovantes (só o path aqui). NUNCA marca pagamento por si: baixa manual com autoria via pagamentos.marcarPagoManual.';
COMMENT ON COLUMN public.insc_comprovantes.metodo_declarado IS
  'O que a pessoa DECLARA ter feito (pix|transferencia). Declaração, não fato verificado.';
COMMENT ON COLUMN public.insc_comprovantes.revisado_por IS
  'UUID de quem conferiu · SNAPSHOT sem FK (a prova não pode sumir com o profile).';
