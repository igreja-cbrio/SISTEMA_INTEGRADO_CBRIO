-- ============================================================================
-- Opcoes do formulario publico de voluntariado · editaveis pelo modulo
-- ----------------------------------------------------------------------------
-- Antes, a lista "Onde voce quer servir" era um array fixo no front. Agora vive
-- aqui, e a equipe de voluntariado pode ativar/desativar (ex: tirar "Online"
-- quando as vagas enchem), adicionar ou remover opcoes em /ministerial/voluntariado/admin.
--
-- Campos por opcao:
--   label             · texto do chip (e o que vai em vol_inscricoes.ministerios_interesse)
--   area_canonica     · area enviada ao backend (kids/sede/ami/bridge/online)
--   exige_dados_menor · pede CPF + nome da mae + aviso (Kids/Bridge)
--   aviso_titulo/texto· aviso exibido ao marcar a opcao (verificacao de antecedentes)
--   ativo             · aparece (ou nao) no formulario
--   ordem             · ordenacao dos chips
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.vol_form_opcoes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label             text NOT NULL UNIQUE,
  ordem             int  NOT NULL DEFAULT 0,
  ativo             boolean NOT NULL DEFAULT true,
  area_canonica     text NOT NULL DEFAULT 'sede'
                      CHECK (area_canonica IN ('kids','sede','ami','bridge','online')),
  exige_dados_menor boolean NOT NULL DEFAULT false,
  aviso_titulo      text,
  aviso_texto       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vol_form_opcoes_ativo_ordem
  ON public.vol_form_opcoes (ativo, ordem);

ALTER TABLE public.vol_form_opcoes ENABLE ROW LEVEL SECURITY;

-- Catalogo sem PII · leitura liberada pra autenticado; escrita so via backend
-- (service_role bypassa RLS). O formulario publico le via backend service_role.
DROP POLICY IF EXISTS vol_form_opcoes_select ON public.vol_form_opcoes;
CREATE POLICY vol_form_opcoes_select ON public.vol_form_opcoes
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS vol_form_opcoes_service ON public.vol_form_opcoes;
CREATE POLICY vol_form_opcoes_service ON public.vol_form_opcoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed com as opcoes atuais + Louvor. Idempotente (ON CONFLICT no label).
INSERT INTO public.vol_form_opcoes (label, ordem, area_canonica, exige_dados_menor, aviso_titulo, aviso_texto)
VALUES
  ('Kids', 10, 'kids', true,
    'Para servir no CBKids, precisamos de algumas informações específicas',
    'Prezamos pelo bem-estar e segurança das nossas crianças, e para garantir que estamos proporcionando um ambiente seguro e confiável, realizamos a verificação de antecedentes criminais de todos os envolvidos. Assim, reforçamos nosso compromisso com a proteção e o cuidado contínuo de nossos pequenos.'),
  ('AMI', 20, 'ami', false, NULL, NULL),
  ('Bridge', 30, 'bridge', true,
    'Para servir no Bridge, precisamos de algumas informações específicas',
    'Prezamos pelo bem-estar e segurança dos nossos adolescentes, e para garantir que estamos proporcionando um ambiente seguro e confiável, realizamos a verificação de antecedentes criminais de todos os envolvidos. Assim, reforçamos nosso compromisso com a proteção e o cuidado contínuo dos nossos jovens.'),
  ('Online', 40, 'online', false, NULL, NULL),
  ('Recepção - Integração', 50, 'sede', false, NULL, NULL),
  ('Estacionamento - Integração', 60, 'sede', false, NULL, NULL),
  ('Intercessão - Integração', 70, 'sede', false, NULL, NULL),
  ('Check-in do voluntariado', 80, 'sede', false, NULL, NULL),
  ('Cozinha do voluntariado', 90, 'sede', false, NULL, NULL),
  ('Cuidados', 100, 'sede', false, NULL, NULL),
  ('Louvor', 110, 'sede', false, NULL, NULL),
  ('Produção', 120, 'sede', false, NULL, NULL),
  ('Marketing - Fotografia', 130, 'sede', false, NULL, NULL),
  ('Marketing - Vídeo', 140, 'sede', false, NULL, NULL),
  ('Next', 150, 'sede', false, NULL, NULL),
  ('Grupos', 160, 'sede', false, NULL, NULL),
  ('Onde for mais necessário', 170, 'sede', false, NULL, NULL)
ON CONFLICT (label) DO NOTHING;
