-- ============================================================================
-- Entradas · opção "Não tenho certeza" (adiar par de duplicidade)
--
-- Terceiro estado da triagem, além de "fundir" e "não é a mesma pessoa": o par
-- sai da fila ATIVA agora (dá pra zerar a fila hoje, sem decisão irreversível),
-- mas VOLTA sozinho quando a evidência ficar DECISIVA — quando um formulário
-- completo (CPF + nascimento obrigatórios) empurra o par para quase_confirmado
-- ou a confiança sobe materialmente acima do momento em que foi adiado.
-- NADA é fundido automaticamente; o par só reentra na fila para revisão humana.
--
-- Sem PII: guarda apenas as referências do par + a marca-d'água da confiança.
-- Só o backend (service_role) lê/escreve. O backend tolera esta tabela ausente
-- (fila se comporta como hoje até a migration ser aplicada).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.entradas_pares_adiados (
  par_key                 text PRIMARY KEY,            -- '<uuid_menor>_<uuid_maior>'
  membro_a_id             uuid NOT NULL,               -- sem FK: a fila re-deriva o par; evita
  membro_b_id             uuid NOT NULL,               -- interação com o repoint do merge_membros
  confianca_no_adiamento  smallint NOT NULL DEFAULT 0, -- marca-d'água pra decidir a reativação
  prioridade_no_adiamento text,
  adiado_por              uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  adiado_em               timestamptz NOT NULL DEFAULT now(),
  reativado_em            timestamptz,                 -- preenchido = voltou pra fila (auto/manual)
  reativado_motivo        text                         -- 'evidencia_decisiva' | 'manual'
);

CREATE INDEX IF NOT EXISTS idx_entradas_pares_adiados_ativos
  ON public.entradas_pares_adiados (adiado_em DESC) WHERE reativado_em IS NULL;

ALTER TABLE public.entradas_pares_adiados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS entradas_pares_adiados_service ON public.entradas_pares_adiados;
CREATE POLICY entradas_pares_adiados_service ON public.entradas_pares_adiados
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.entradas_pares_adiados IS
  'Pares de duplicidade adiados ("nao tenho certeza"). Ficam fora da fila ativa ate a evidencia ficar decisiva. reativado_em preenchido = voltou/tratado. Sem PII; so o backend (service_role) le/escreve.';

-- Permite registrar adiar/reativar no histórico auditável da fila (CHECK atual
-- só aceitava fundido/pessoas_distintas/…). Aditivo e idempotente.
ALTER TABLE public.entradas_resolucoes DROP CONSTRAINT IF EXISTS entradas_resolucoes_acao_check;
ALTER TABLE public.entradas_resolucoes ADD CONSTRAINT entradas_resolucoes_acao_check CHECK (acao IN (
  'fundido','pessoas_distintas','vinculado','cadastro_criado',
  'cpf_confirmado','resolvido','descartado','adiado','reativado'
));
