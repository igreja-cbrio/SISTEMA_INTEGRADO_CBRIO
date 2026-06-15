-- Voluntariado · Controle de frequência (histórico importado da planilha)
-- "Quantas vezes cada pessoa serviu e em qual culto" + ativos/inativos.
-- Os registros vêm da planilha de controle (CONTROLE_POR_CPF). Nomes são texto
-- livre; `vol_profile_id` é preenchido quando o nome casa com um voluntário do
-- sistema (match por nome normalizado), pra unificar com os check-ins reais.

CREATE TABLE IF NOT EXISTS public.vol_servicos_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_planilha text NOT NULL,
  nome_norm     text NOT NULL,                 -- lower + sem acento + espaços colapsados
  data          date NOT NULL,
  culto_label   text NOT NULL DEFAULT '—',     -- 'Sábado' | 'Domingo' | 'Quarta'
  mes           text,                           -- 'Janeiro'... (referência da planilha)
  origem        text NOT NULL DEFAULT 'planilha_2026',
  vol_profile_id uuid REFERENCES public.vol_profiles(id) ON DELETE SET NULL,
  membro_id     uuid REFERENCES public.mem_membros(id) ON DELETE SET NULL,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Idempotência do import: a mesma pessoa/data/culto não duplica.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vol_servhist
  ON public.vol_servicos_historico (nome_norm, data, culto_label, origem)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vol_servhist_nome ON public.vol_servicos_historico (nome_norm);
CREATE INDEX IF NOT EXISTS idx_vol_servhist_profile ON public.vol_servicos_historico (vol_profile_id) WHERE vol_profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vol_servhist_data ON public.vol_servicos_historico (data);

-- RLS: acesso só via backend (service_role). O front lê pelos endpoints.
ALTER TABLE public.vol_servicos_historico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vol_servhist_service ON public.vol_servicos_historico;
CREATE POLICY vol_servhist_service ON public.vol_servicos_historico
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- View de frequência: 1 linha por pessoa (vinculada = por perfil; não vinculada
-- = por nome). Total de serviços, último serviço e status ativo (serviu nos
-- últimos 90 dias). Detalhe por culto/data vem do endpoint.
CREATE OR REPLACE VIEW public.vw_vol_frequencia AS
SELECT
  COALESCE(h.vol_profile_id::text, 'n:' || h.nome_norm)         AS chave,
  max(h.vol_profile_id::text)                                   AS vol_profile_id,
  min(h.nome_norm)                                              AS nome_norm,
  (array_agg(h.nome_planilha ORDER BY h.created_at NULLS LAST))[1] AS nome,
  count(*)::int                                                 AS total_servicos,
  max(h.data)                                                   AS ultimo_servico,
  (max(h.data) >= (current_date - interval '90 days'))          AS ativo
FROM public.vol_servicos_historico h
WHERE h.deleted_at IS NULL
GROUP BY COALESCE(h.vol_profile_id::text, 'n:' || h.nome_norm);
