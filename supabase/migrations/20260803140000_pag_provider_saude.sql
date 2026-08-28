-- ============================================================================
-- Saúde da credencial do provedor de pagamento (Asaas)
--
-- POR QUÊ: o painel do Asaas avisa, na própria tela de gerar chave, que
-- "chaves de API sem uso são desabilitadas após 3 meses e permanentemente
-- expiradas após 6 meses". Nosso sistema só conversa com o Asaas quando existe
-- cobrança — o cron de 10 min não chama a API se não há nada pra reconciliar.
-- Logo: igreja que vende inscrição em fevereiro e só tem o próximo evento pago
-- em agosto passa 6 meses sem uso e tem a chave expirada EM SILÊNCIO. O sintoma
-- apareceria no pior momento possível: lançamento do evento, ninguém consegue
-- pagar, e nada no sistema explica por quê.
--
-- Esta tabela guarda o resultado da última sonda (1 linha por provider) pra:
--   1. o cron saber quando já verificou (não checa mais de 1x/dia);
--   2. deduplicar o aviso (senão vira notificação diária);
--   3. a tela do módulo poder mostrar "chave verificada há X" ANTES do
--      lançamento, que é a pergunta operacional real.
--
-- NÃO tem PII → fora da whitelist de soft-delete, sem deleted_at. É estado
-- operacional descartável: apagar a linha só faz a próxima sonda rodar.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pag_provider_saude (
  provider              TEXT PRIMARY KEY,
  verificado_em         TIMESTAMPTZ,
  ok                    BOOLEAN,
  status_http           INTEGER,
  erro                  TEXT,
  latencia_ms           INTEGER,
  -- Contador de falhas EM SEQUÊNCIA. Existe pra separar "a rede soluçou uma
  -- vez" de "a chave morreu": erro transitório só chama gente ao insistir.
  falhas_consecutivas   INTEGER NOT NULL DEFAULT 0,
  -- Última vez que avisamos um humano. Dedup do aviso (1x/dia no máximo).
  avisado_em            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pag_provider_saude IS
  'Resultado da última sonda de credencial por provider de pagamento. Evita a chave do Asaas expirar em silêncio por desuso (3 meses desabilita, 6 meses expira).';
COMMENT ON COLUMN public.pag_provider_saude.falhas_consecutivas IS
  'Falhas em sequência. Erro transitório (rede, 5xx) só notifica ao persistir; credencial inválida (401/403) notifica na primeira.';
COMMENT ON COLUMN public.pag_provider_saude.avisado_em IS
  'Dedup da notificação — no máximo 1 aviso por dia, senão vira ruído diário.';

-- updated_at automático (mesmo padrão das outras tabelas do núcleo)
CREATE OR REPLACE FUNCTION public.fn_pag_provider_saude_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pag_provider_saude_updated_at ON public.pag_provider_saude;
CREATE TRIGGER trg_pag_provider_saude_updated_at
  BEFORE UPDATE ON public.pag_provider_saude
  FOR EACH ROW EXECUTE FUNCTION public.fn_pag_provider_saude_updated_at();

ALTER TABLE public.pag_provider_saude ENABLE ROW LEVEL SECURITY;

-- Leitura: só super-admin pelo cliente. A TELA lê via backend (service_role),
-- então não precisa abrir pra authenticated — e a linha carrega mensagem de
-- erro do provedor, que não é informação pra qualquer logado.
DROP POLICY IF EXISTS pag_provider_saude_select ON public.pag_provider_saude;
CREATE POLICY pag_provider_saude_select ON public.pag_provider_saude
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- Escrita: exclusivamente do backend. Ninguém "declara" credencial saudável
-- pelo cliente — quem escreve aqui é a sonda.
DROP POLICY IF EXISTS pag_provider_saude_service ON public.pag_provider_saude;
CREATE POLICY pag_provider_saude_service ON public.pag_provider_saude
  FOR ALL TO service_role USING (true) WITH CHECK (true);
