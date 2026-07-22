-- Motivo pelo qual um voluntário está inativo · registrado na aba Controle de
-- frequência (por `chave` da vw_vol_frequencia · cpf:/membresia:/id:).
-- O motivo/detalhe pode conter dado sensível (ex.: saúde) → RLS trava tudo,
-- acesso SÓ via backend (service_role) atrás da permissão de voluntariado.
CREATE TABLE IF NOT EXISTS public.vol_inatividade (
  chave          text PRIMARY KEY,
  motivo         text NOT NULL,
  detalhe        text,
  registrado_por uuid,
  registrado_em  timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vol_inatividade ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vol_inatividade_service ON public.vol_inatividade;
CREATE POLICY vol_inatividade_service ON public.vol_inatividade
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.vol_inatividade IS 'Motivo da inatividade de um voluntário (por chave da vw_vol_frequencia). RLS service-only · acesso via backend atrás da permissão de voluntariado/membresia.';
