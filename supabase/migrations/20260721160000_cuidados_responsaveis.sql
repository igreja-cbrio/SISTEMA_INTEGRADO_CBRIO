-- Responsáveis do atendimento de convertidos (Cuidados · Próximos passos).
-- Antes era lista FIXA no front (RESPONSAVEIS_ATENDIMENTO/ANTIGOS em Cuidados.tsx);
-- agora a própria equipe de Cuidados gerencia quem está disponível pelo modal
-- "Gerenciar responsáveis" (Marcos · 2026-07-21). Continua TEXTO (essas pessoas
-- não logam no sistema — o vínculo com cui_convertidos.responsavel_atendimento é
-- pelo nome), então NADA de renomear aqui: inativar preserva o histórico.
CREATE TABLE IF NOT EXISTS public.cui_responsaveis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cui_responsaveis ENABLE ROW LEVEL SECURITY;
-- Acesso pela API (service_role bypassa). Leitura direta só p/ quem tem Cuidados.
CREATE POLICY cui_responsaveis_sel ON public.cui_responsaveis FOR SELECT TO authenticated
  USING (public.current_user_module_level('cuidados') >= 1);
CREATE POLICY cui_responsaveis_srv ON public.cui_responsaveis FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed = estado atual da lista fixa do front (ativos + antigos da planilha do Marcelo).
INSERT INTO public.cui_responsaveis (nome, ativo) VALUES
  ('Arthur Cecconi', true),
  ('Renata Martins', true),
  ('Nélio Paiva', true),
  ('Wesley Ramos', true),
  ('Lorena', false),
  ('Lilian', false),
  ('Sebastião', false),
  ('Natasha', false),
  ('Mariane', false),
  ('Carmet', false),
  ('Carmet/Arthur', false),
  ('Léia', false),
  ('Kevin', false),
  ('Kevin/Arthur', false),
  ('Arthur/Kevin', false),
  ('Mari', false),
  ('Naná', false)
ON CONFLICT (nome) DO NOTHING;
