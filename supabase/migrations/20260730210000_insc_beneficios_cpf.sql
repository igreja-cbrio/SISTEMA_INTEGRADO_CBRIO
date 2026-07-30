-- Benefício PRÉ-CADASTRADO por CPF: o líder define quem paga menos (ou nada)
-- ANTES da pessoa se inscrever; quando ela digita o CPF no formulário, o
-- sistema já aplica.
--
-- Pedido do Marcos (2026-07-30): "eu colocaria o CPF da pessoa que iria receber
-- esse benefício, e aí na inscrição dela, quando ela colocasse o CPF, o sistema
-- já iria identificar que aquele CPF tem direito ao desconto (que será definido
-- pelo líder) ou gratuidade."
--
-- ⚠️ Isto é o LADO DE ENTRADA da bolsa da migration 20260730170000, não uma
-- segunda régua de preço: o benefício é uma AUTORIZAÇÃO prévia que, ao ser
-- usada, grava exatamente as mesmas colunas em `inscricoes`
-- (`valor_cobrado_centavos` + `bolsa_tipo` + `bolsa_motivo`). Continua valendo:
-- **preço é atributo da INSCRIÇÃO**; `insc_eventos.valor_centavos` é o valor de
-- tabela. Duas fontes de preço concorrendo é como o arrecadado passa a mentir.
--
-- Quem já se inscreveu ANTES do cadastro do benefício NÃO é atingido por aqui:
-- a cobrança dela já existe com o valor cheio, e trocar o valor por baixo
-- deixaria cobrança e inscrição discordando. Esse caso é o botão "Dar bolsa" na
-- ficha (20260730170000), que cancela a cobrança antiga e emite outra.

CREATE TABLE IF NOT EXISTS public.insc_beneficios (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id    UUID NOT NULL REFERENCES public.insc_eventos(id) ON DELETE CASCADE,

  -- CPF digits-only (11). O DV é validado no backend pelo canônico do Contrato
  -- de Inscrição — CPF sem DV válido aqui seria benefício que NUNCA casa, já que
  -- a porta pública exige DV pra inscrever.
  cpf          TEXT NOT NULL CHECK (cpf ~ '^[0-9]{11}$'),
  -- Só pra equipe reconhecer a linha na tela. NÃO é usado pra casar: o vínculo
  -- é o CPF (nome sozinho nunca identifica — lei do Contrato de porta).
  nome_referencia TEXT,

  tipo         TEXT NOT NULL CHECK (tipo IN ('integral', 'parcial')),
  -- ⚠️ É O VALOR QUE A PESSOA PAGA, não o desconto. Mesma semântica de
  -- `inscricoes.valor_cobrado_centavos` — inverter aqui e não lá é como se
  -- cobra R$ 700 de quem devia pagar R$ 200.
  valor_centavos INTEGER,
  motivo       TEXT NOT NULL,

  criado_por      UUID,
  criado_por_nome TEXT,

  -- Consumo: benefício vale UMA vez. Marcar o uso é o que impede a mesma
  -- autorização render gratuidade em duas inscrições.
  usado_em     TIMESTAMPTZ,
  inscricao_id UUID REFERENCES public.inscricoes(id) ON DELETE SET NULL,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ,

  CONSTRAINT chk_insc_beneficios_valor CHECK (
    (tipo = 'integral' AND (valor_centavos IS NULL OR valor_centavos = 0))
    OR (tipo = 'parcial' AND valor_centavos > 0)
  ),
  -- Conceder benefício sem dizer por quê é registro que ninguém defende seis
  -- meses depois (mesma régua do CHECK da bolsa).
  CONSTRAINT chk_insc_beneficios_motivo CHECK (length(btrim(motivo)) >= 3)
);

-- Um benefício ATIVO por (evento, CPF): a busca da porta pública é por essa
-- chave, e duas linhas vivas fariam a aplicação depender da ordem do resultado.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_insc_beneficios_evento_cpf
  ON public.insc_beneficios (evento_id, cpf) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_insc_beneficios_evento
  ON public.insc_beneficios (evento_id, created_at DESC) WHERE deleted_at IS NULL;

-- Whitelist de soft-delete (lei nº 4 · tem CPF = PII), lida da lista VIVA.
DO $$
DECLARE atual TEXT[];
BEGIN
  SELECT public.app_soft_deletable_tables() INTO atual;
  IF NOT ('insc_beneficios' = ANY(atual)) THEN
    atual := array_append(atual, 'insc_beneficios'::text);
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION public.app_soft_deletable_tables() RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $f$ SELECT %L::TEXT[] $f$',
      atual
    );
  END IF;
END $$;

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Ler exige nível 2 (a linha CARREGA CPF · mesma régua da aba Pessoas da view
-- unificada), conceder/remover exige 3 (é ato de gestão sobre dinheiro).
-- A porta pública lê e consome via service_role.
ALTER TABLE public.insc_beneficios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS insc_beneficios_select ON public.insc_beneficios;
CREATE POLICY insc_beneficios_select ON public.insc_beneficios
  FOR SELECT TO authenticated
  USING (public.current_user_module_level('inscricoes') >= 2 OR public.is_super_admin());

DROP POLICY IF EXISTS insc_beneficios_write ON public.insc_beneficios;
CREATE POLICY insc_beneficios_write ON public.insc_beneficios
  FOR ALL TO authenticated
  USING (public.current_user_module_level('inscricoes') >= 3 OR public.is_super_admin())
  WITH CHECK (public.current_user_module_level('inscricoes') >= 3 OR public.is_super_admin());

DROP POLICY IF EXISTS insc_beneficios_service ON public.insc_beneficios;
CREATE POLICY insc_beneficios_service ON public.insc_beneficios
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Audit: quem autorizou gratuidade/desconto pra qual CPF, e quando foi usado.
DROP TRIGGER IF EXISTS trg_audit_insc_beneficios ON public.insc_beneficios;
CREATE TRIGGER trg_audit_insc_beneficios
AFTER INSERT OR UPDATE OR DELETE ON public.insc_beneficios
FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes(
  'cpf,tipo,valor_centavos,motivo,criado_por,criado_por_nome,usado_em,inscricao_id,deleted_at'
);

COMMENT ON TABLE public.insc_beneficios IS
  'Gratuidade/desconto AUTORIZADO por CPF antes da inscrição. Ao ser usado na porta pública, grava valor_cobrado_centavos + bolsa_tipo/motivo na inscrição (mesmas colunas do botão "Dar bolsa"). Vale uma vez (usado_em).';
COMMENT ON COLUMN public.insc_beneficios.valor_centavos IS
  'Quanto a pessoa VAI PAGAR (não o desconto). NULL/0 em tipo integral.';
COMMENT ON COLUMN public.insc_beneficios.nome_referencia IS
  'Só pra equipe reconhecer a linha. O casamento é pelo CPF — nome sozinho nunca identifica.';
