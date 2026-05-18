-- =====================================================================
-- Permissoes · matriz aprovada na reuniao com Marcos Paulo (2026-05-18)
-- =====================================================================
-- 25 cargos x ~30 modulos · matriz consolidada vinda da planilha
-- (uploads/c1b1249d-permissoesmapa.xlsx)
--
-- Modificadores:
--   pode_exportar   = 'E' (LGPD · CPF, telefone, financeiro)
--   pode_aprovar    = 'A' (aprovar workflows daquele modulo)
--   escopo_proprio  = '*' (so da propria area/valor)
--
-- Niveis 0-5:
--   0 = Sem acesso · modulo nao aparece no menu nem responde a URL
--   1 = Ver (so leitura)
--   2 = Ver + preencher dado bruto
--   3 = Ver + editar (CRUD)
--   4 = Ver + editar + deletar
--   5 = Admin do modulo (configura regras, metas, seeds, deleta tudo)
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Extensoes do schema existente
-- ---------------------------------------------------------------------

-- 1.1 · cargos · slug, nome_completo, titular_sugerido, ordem, descricao
ALTER TABLE public.cargos
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS nome_completo TEXT,
  ADD COLUMN IF NOT EXISTS titular_sugerido TEXT,
  ADD COLUMN IF NOT EXISTS categoria TEXT,
  ADD COLUMN IF NOT EXISTS ordem INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descricao TEXT,
  ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX IF NOT EXISTS cargos_slug_uidx ON public.cargos(slug) WHERE slug IS NOT NULL;

-- 1.2 · modulos · slug, rota, categoria, ordem, descricao
ALTER TABLE public.modulos
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS rota TEXT,
  ADD COLUMN IF NOT EXISTS categoria TEXT,
  ADD COLUMN IF NOT EXISTS ordem INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descricao TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS modulos_slug_uidx ON public.modulos(slug) WHERE slug IS NOT NULL;

-- 1.3 · permissoes_modulo · modificadores (override por usuario)
ALTER TABLE public.permissoes_modulo
  ADD COLUMN IF NOT EXISTS pode_exportar BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pode_aprovar BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS escopo_proprio BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expira_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo TEXT,
  ADD COLUMN IF NOT EXISTS criado_por UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------
-- 2. Tabela nova · matriz padrao por cargo (cargo_modulo_permissao)
-- ---------------------------------------------------------------------
-- cargos.id e modulos.id sao INTEGER em producao (apesar da migration
-- 20260410014723 declarar UUID, a tabela foi alterada depois). Por isso
-- cargo_id/modulo_id aqui sao INTEGER pra bater com o tipo real.
CREATE TABLE IF NOT EXISTS public.cargo_modulo_permissao (
  cargo_id INTEGER NOT NULL REFERENCES public.cargos(id) ON DELETE CASCADE,
  modulo_id INTEGER NOT NULL REFERENCES public.modulos(id) ON DELETE CASCADE,
  nivel INTEGER NOT NULL DEFAULT 0 CHECK (nivel BETWEEN 0 AND 5),
  pode_exportar BOOLEAN NOT NULL DEFAULT false,
  pode_aprovar BOOLEAN NOT NULL DEFAULT false,
  escopo_proprio BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cargo_id, modulo_id)
);

ALTER TABLE public.cargo_modulo_permissao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read cargo_modulo_permissao" ON public.cargo_modulo_permissao
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write cargo_modulo_permissao" ON public.cargo_modulo_permissao
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update cargo_modulo_permissao" ON public.cargo_modulo_permissao
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete cargo_modulo_permissao" ON public.cargo_modulo_permissao
  FOR DELETE TO authenticated USING (true);

-- ---------------------------------------------------------------------
-- 3. Marcar modulos antigos genericos como inativos (DP, Pessoas, TI, ...)
--    Mantemos as linhas no banco pra nao quebrar FKs em permissoes_modulo
--    legadas; o middleware passa a usar os novos slugs.
-- ---------------------------------------------------------------------
UPDATE public.modulos SET ativo = false
 WHERE slug IS NULL
   AND nome IN ('DP','Pessoas','TI','Agenda','Tarefas','Comunicação','IA / Agentes',
                'Cuidados');

-- ---------------------------------------------------------------------
-- 4. Seed dos 25 cargos
-- ---------------------------------------------------------------------
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita)
VALUES ('pastor-senior', 'Pastor Sr', 'Pastor Senior', 'Pr. Pedrão', 10, 'pastoral', 'Pastor senior da igreja', 5, 5)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita)
VALUES ('pastor-presidente', 'Pastor Pres', 'Pastor Presidente', 'Pr. Juninho', 20, 'pastoral', 'Pastor presidente', 5, 5)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita)
VALUES ('diretor-administrativo', 'Dir Geral', 'Diretor Administrativo (Gestão)', 'Eduardo Gnisci', 30, 'diretoria', 'Diretor administrativo / gestão', 5, 5)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita)
VALUES ('coordenador-estrategia', 'Dir Estrat', 'Coordenador de Estratégia (PMO)', 'Marcos Paulo', 40, 'diretoria', 'Coordenador de Estratégia · PMO', 5, 5)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita)
VALUES ('diretor-ministerial', 'Dir Mini', 'Diretor Ministerial', 'Arthur Serpa', 50, 'diretoria', 'Diretor da frente ministerial', 4, 4)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita)
VALUES ('diretor-criativo', 'Dir Criat', 'Diretor Criativo', 'Pedro Menezes', 60, 'diretoria', 'Diretor da frente criativa', 4, 4)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita)
VALUES ('lider-ministerial', 'Líder Mini', 'Líder Ministerial', 'Alda + líderes AMI/Bridge/Sede/Online/Kids/etc', 70, 'lideranca', 'Líder de uma área ministerial', 3, 3)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita)
VALUES ('assistente-area', 'Assist Área', 'Assistente de Área', 'Kevyn (AMI), Milena (KIDS)', 80, 'assistencia', 'Assistente ligado a uma área de culto', 3, 3)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita)
VALUES ('assistente-ministerial', 'Assist Mini', 'Assistente Ministerial', 'Ariel (Voluntariado), Natasha (Grupos), Yago (Gen.)', 90, 'assistencia', 'Assistente ligado a um valor / ministério', 3, 3)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita)
VALUES ('coordenador-financeiro', 'Coord Financ', 'Coordenador Financeiro', 'Yago Torres', 100, 'coordenacao', 'Coordenador financeiro', 3, 3)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita)
VALUES ('assistente-financeiro', 'Assist Financ', 'Assistente Financeiro', 'Francisco José (provisório)', 110, 'assistencia', 'Assistente financeiro', 3, 3)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita)
VALUES ('coordenador-marketing', 'Coord Mkt', 'Coordenador de Marketing', 'Pedro Paiva', 120, 'coordenacao', 'Coordenador de Marketing', 3, 3)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita)
VALUES ('assistente-marketing', 'Assist Mkt', 'Assistente de Marketing', 'Lorena Pariz, Kauan, Letícia, Allan', 130, 'assistencia', 'Assistente de Marketing', 3, 3)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita)
VALUES ('lider-producao', 'Líder Prod', 'Líder de Produção', 'Pedro Fernandes', 140, 'lideranca', 'Líder de Produção (criativo)', 3, 3)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita)
VALUES ('assistente-producao', 'Assist Prod', 'Assistente de Produção', 'Gabriel Munck', 150, 'assistencia', 'Assistente de Produção', 3, 3)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita)
VALUES ('lider-operacoes', 'Líder Op', 'Líder de Operações', 'Jéssica Salviano · Amaury', 160, 'lideranca', 'Líder de Operações (Hospitalidade)', 3, 3)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita)
VALUES ('lider-logistica', 'Líder Log', 'Líder de Logística', 'Amaury', 170, 'lideranca', 'Líder de Logística', 3, 3)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita)
VALUES ('assistente-logistica', 'Assist Log', 'Assistente de Logística', 'Pery, Erivelton', 180, 'assistencia', 'Assistente de Logística (compras / patrimônio)', 3, 3)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita)
VALUES ('assistente-operacoes', 'Assist Op', 'Assistente de Operações', 'Jane, Alba, Ribamar, Leonardo Pinto, Elionardo Alves', 190, 'assistencia', 'Assistente de Operações (cozinha, limpeza, manutenção)', 3, 3)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita)
VALUES ('diretor-rh', 'Dir RH', 'Diretora de RH', 'Juliana Leão', 200, 'diretoria', 'Diretora de RH', 4, 4)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita)
VALUES ('coordenador-voluntarios', 'Coord Vol', 'Coordenador de Voluntários', 'qualquer líder que escala sua equipe', 210, 'coordenacao', 'Papel atribuído a qualquer líder que escala voluntários', 3, 3)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita)
VALUES ('voluntario', 'Voluntário', 'Voluntário', 'qualquer pessoa que serve', 220, 'base', 'Voluntário ativo', 3, 3)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita)
VALUES ('membro', 'Membro', 'Membro', 'auto-cadastro · dashboard básico', 230, 'base', 'Membro da igreja', 3, 3)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita)
VALUES ('conselho', 'Conselho', 'Conselho Estatutário', 'não-funcionário · vê dashboards', 240, 'conselho', 'Conselho estatutário', 3, 3)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.cargos (slug, nome, nome_completo, titular_sugerido, ordem, categoria, descricao, nivel_padrao_leitura, nivel_padrao_escrita)
VALUES ('dev', 'Dev', 'Suporte / Dev', 'Matheus + Marcos', 250, 'tecnico', 'Suporte técnico / Dev', 5, 5)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  nome_completo = EXCLUDED.nome_completo,
  titular_sugerido = EXCLUDED.titular_sugerido,
  ordem = EXCLUDED.ordem,
  categoria = EXCLUDED.categoria,
  descricao = EXCLUDED.descricao,
  ativo = true;

-- ---------------------------------------------------------------------
-- 5. Seed dos 30 modulos novos (com slug)
-- ---------------------------------------------------------------------
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('dashboard', 'Dashboard', '/dashboard', 'estrategica', 10, 'Home com cards resumo', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('painel-cbrio', 'Painel CBRio', '/painel', 'estrategica', 20, 'NSM · mandalas · matrizes · alertas', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('minha-area', 'Minha Área', '/minha-area', 'estrategica', 30, 'KPIs do líder (filtrado por área/valor)', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('gestao', 'Gestão (PMO)', '/gestao', 'estrategica', 40, 'Estrutura OKR · configurar metas · saúde sistema', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('planejamento', 'Planejamento', '/planejamento', 'estrategica', 50, 'Ritual mensal causa-decisão', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('ritual', 'Ritual Mensal', '/ritual', 'estrategica', 60, 'Revisão da Diretoria Geral (5 nominais)', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('governanca', 'Governança', '/governanca', 'estrategica', 70, 'Ciclo mensal OKR · DRE · KPI · Conselho', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('revisao-estrategica', 'Revisão Estratégica', '/revisao-estrategica', 'estrategica', 80, 'Edição direta de projetos/marcos · cascata de impacto', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('integracao', 'Integração', '/ministerial/integracao', 'ministerial', 110, 'Cultos · Frequência · Decisões · Batismos · Histórico', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('cuidados', 'Cuidados', '/ministerial/cuidados', 'ministerial', 120, 'Acompanhamentos pastorais · Jornada 180 · Convertidos', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('online', 'Online (YouTube)', '/ministerial/online', 'ministerial', 130, 'Desempenho do canal (read-only)', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('next', 'NEXT', '/ministerial/next', 'ministerial', 140, 'Curso de novos membros', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('voluntariado', 'Voluntariado', '/ministerial/voluntariado', 'ministerial', 150, 'Checkin · escalas · perfil · disponibilidade', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('membresia', 'Membresia', '/ministerial/membresia', 'ministerial', 160, 'CRM de pessoas · jornada · cartão digital', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('grupos', 'Grupos', '/grupos', 'ministerial', 170, 'Grupos de conexão · supervisão · pedidos', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('eventos', 'Eventos', '/eventos', 'operacional', 210, 'Ciclo criativo · fases · documentos · KPIs por evento', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('projetos', 'Projetos', '/projetos', 'operacional', 220, 'Projetos com fases', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('expansao', 'Expansão', '/expansao', 'operacional', 230, 'Marcos estratégicos até 2029', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('rh', 'RH', '/admin/rh', 'operacional', 250, 'Funcionários · documentos · treinamentos', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('financeiro', 'Financeiro', '/admin/financeiro', 'operacional', 260, 'Receitas · despesas · relatórios', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('logistica', 'Logística', '/admin/logistica', 'operacional', 270, 'Estoque · compras · almoxarifado', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('patrimonio', 'Patrimônio', '/admin/patrimonio', 'operacional', 280, 'Espaços · equipamentos · inventário', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('solicitacoes', 'Solicitações', '/solicitacoes', 'operacional', 290, 'Backbone administrativo · SLA · aprovações', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('dados-brutos', 'Dados Brutos', '/dados-brutos', 'admin_dados', 310, 'Líder preenche números absolutos', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('nps', 'NPS', '/nps', 'admin_dados', 320, 'Pesquisas · respostas · link público', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('notificacoes-config', 'Notificações', '/admin/notificacoes', 'admin_dados', 330, 'Regras de quem recebe alertas de cada módulo', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('assistente-ia', 'Assistente IA', '/assistente-ia', 'admin_dados', 340, 'Agente Claude conversacional', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('cerebro', 'Cérebro CBRio', '(backend)', 'admin_dados', 350, 'Sync SharePoint → Obsidian via Haiku', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('perfil', 'Perfil próprio', '/perfil', 'admin_dados', 360, 'Dados pessoais do próprio usuário', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('permissoes-admin', 'Permissões', '/admin/permissoes', 'admin_dados', 370, 'UI deste sistema · gestão de cargos + overrides', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;
INSERT INTO public.modulos (slug, nome, rota, categoria, ordem, descricao, ativo)
VALUES ('usuarios-admin', 'Usuários', '/admin/usuarios', 'admin_dados', 380, 'Cadastrar/desativar pessoas', true)
ON CONFLICT (slug) WHERE slug IS NOT NULL DO UPDATE SET
  nome = EXCLUDED.nome,
  rota = EXCLUDED.rota,
  categoria = EXCLUDED.categoria,
  ordem = EXCLUDED.ordem,
  descricao = EXCLUDED.descricao,
  ativo = true;

-- ---------------------------------------------------------------------
-- 6. Seed da matriz cargo x modulo
--    Politica de defaults para celulas em branco:
--    - Lider/Assist da area em 'Dados Brutos': 2* (preencher pr propria area)
--    - Demais combinacoes nao listadas: 0 (sem acesso)
--    Esta tabela e a SOURCE OF TRUTH; overrides vivem em permissoes_modulo.
-- ---------------------------------------------------------------------

-- 6.1 · limpa qualquer linha previa
DELETE FROM public.cargo_modulo_permissao;

-- 6.2 · insere 757 linhas vindas da planilha

WITH dados(cargo_slug, modulo_slug, nivel, exportar, aprovar, escopo) AS (VALUES
  ('assistente-area', 'assistente-ia', 2, false, false, true),
  ('assistente-area', 'cerebro', 0, false, false, false),
  ('assistente-area', 'cuidados', 3, false, false, true),
  ('assistente-area', 'dados-brutos', 2, false, false, true),
  ('assistente-area', 'dashboard', 1, true, false, false),
  ('assistente-area', 'eventos', 1, false, false, false),
  ('assistente-area', 'expansao', 1, false, false, false),
  ('assistente-area', 'financeiro', 0, false, false, false),
  ('assistente-area', 'gestao', 1, true, false, true),
  ('assistente-area', 'governanca', 0, false, false, false),
  ('assistente-area', 'grupos', 3, false, false, true),
  ('assistente-area', 'integracao', 3, false, false, true),
  ('assistente-area', 'logistica', 0, false, false, false),
  ('assistente-area', 'membresia', 3, false, false, true),
  ('assistente-area', 'minha-area', 3, true, true, true),
  ('assistente-area', 'next', 3, false, false, true),
  ('assistente-area', 'notificacoes-config', 0, false, false, false),
  ('assistente-area', 'nps', 2, false, false, false),
  ('assistente-area', 'online', 3, false, false, true),
  ('assistente-area', 'painel-cbrio', 1, true, false, false),
  ('assistente-area', 'patrimonio', 0, false, false, false),
  ('assistente-area', 'perfil', 3, false, false, true),
  ('assistente-area', 'permissoes-admin', 0, false, false, false),
  ('assistente-area', 'planejamento', 1, false, false, false),
  ('assistente-area', 'projetos', 1, false, false, false),
  ('assistente-area', 'revisao-estrategica', 0, false, false, false),
  ('assistente-area', 'rh', 0, false, false, false),
  ('assistente-area', 'ritual', 0, false, false, false),
  ('assistente-area', 'solicitacoes', 2, false, false, false),
  ('assistente-area', 'usuarios-admin', 0, false, false, false),
  ('assistente-area', 'voluntariado', 3, false, false, true),
  ('assistente-financeiro', 'assistente-ia', 2, false, false, true),
  ('assistente-financeiro', 'cerebro', 0, false, false, false),
  ('assistente-financeiro', 'cuidados', 1, false, false, false),
  ('assistente-financeiro', 'dados-brutos', 2, false, false, true),
  ('assistente-financeiro', 'dashboard', 1, false, false, false),
  ('assistente-financeiro', 'eventos', 2, false, false, true),
  ('assistente-financeiro', 'expansao', 2, false, false, true),
  ('assistente-financeiro', 'financeiro', 4, false, false, false),
  ('assistente-financeiro', 'gestao', 0, false, false, false),
  ('assistente-financeiro', 'governanca', 0, false, false, false),
  ('assistente-financeiro', 'grupos', 1, false, false, false),
  ('assistente-financeiro', 'integracao', 1, false, false, false),
  ('assistente-financeiro', 'logistica', 1, false, false, false),
  ('assistente-financeiro', 'membresia', 1, false, false, false),
  ('assistente-financeiro', 'minha-area', 3, true, true, true),
  ('assistente-financeiro', 'next', 1, false, false, false),
  ('assistente-financeiro', 'notificacoes-config', 0, false, false, false),
  ('assistente-financeiro', 'nps', 2, false, false, false),
  ('assistente-financeiro', 'online', 1, false, false, false),
  ('assistente-financeiro', 'painel-cbrio', 1, false, false, false),
  ('assistente-financeiro', 'patrimonio', 1, false, false, false),
  ('assistente-financeiro', 'perfil', 3, false, false, true),
  ('assistente-financeiro', 'permissoes-admin', 0, false, false, false),
  ('assistente-financeiro', 'planejamento', 0, false, false, false),
  ('assistente-financeiro', 'projetos', 2, false, false, true),
  ('assistente-financeiro', 'revisao-estrategica', 0, false, false, false),
  ('assistente-financeiro', 'rh', 1, false, false, false),
  ('assistente-financeiro', 'ritual', 0, false, false, false),
  ('assistente-financeiro', 'solicitacoes', 2, false, false, false),
  ('assistente-financeiro', 'usuarios-admin', 0, false, false, false),
  ('assistente-financeiro', 'voluntariado', 1, false, false, false),
  ('assistente-logistica', 'assistente-ia', 2, false, false, true),
  ('assistente-logistica', 'cerebro', 0, false, false, false),
  ('assistente-logistica', 'cuidados', 1, false, false, false),
  ('assistente-logistica', 'dados-brutos', 2, false, false, true),
  ('assistente-logistica', 'dashboard', 1, false, false, false),
  ('assistente-logistica', 'eventos', 1, false, false, true),
  ('assistente-logistica', 'expansao', 1, false, false, true),
  ('assistente-logistica', 'financeiro', 0, false, false, false),
  ('assistente-logistica', 'gestao', 1, false, false, true),
  ('assistente-logistica', 'governanca', 0, false, false, false),
  ('assistente-logistica', 'grupos', 1, false, false, false),
  ('assistente-logistica', 'integracao', 1, false, false, false),
  ('assistente-logistica', 'logistica', 4, false, false, false),
  ('assistente-logistica', 'membresia', 1, false, false, false),
  ('assistente-logistica', 'minha-area', 3, true, true, true),
  ('assistente-logistica', 'next', 1, false, false, false),
  ('assistente-logistica', 'notificacoes-config', 0, false, false, false),
  ('assistente-logistica', 'nps', 2, false, false, false),
  ('assistente-logistica', 'online', 1, false, false, false),
  ('assistente-logistica', 'painel-cbrio', 1, false, false, false),
  ('assistente-logistica', 'patrimonio', 4, false, false, false),
  ('assistente-logistica', 'perfil', 3, false, false, true),
  ('assistente-logistica', 'permissoes-admin', 0, false, false, false),
  ('assistente-logistica', 'planejamento', 1, false, false, true),
  ('assistente-logistica', 'projetos', 1, false, false, true),
  ('assistente-logistica', 'revisao-estrategica', 0, false, false, false),
  ('assistente-logistica', 'rh', 0, false, false, false),
  ('assistente-logistica', 'ritual', 0, false, false, false),
  ('assistente-logistica', 'solicitacoes', 2, false, false, false),
  ('assistente-logistica', 'usuarios-admin', 0, false, false, false),
  ('assistente-logistica', 'voluntariado', 1, false, false, false),
  ('assistente-marketing', 'assistente-ia', 2, false, false, true),
  ('assistente-marketing', 'cerebro', 0, false, false, false),
  ('assistente-marketing', 'cuidados', 1, false, false, false),
  ('assistente-marketing', 'dados-brutos', 2, false, false, true),
  ('assistente-marketing', 'dashboard', 1, false, false, false),
  ('assistente-marketing', 'eventos', 1, false, false, true),
  ('assistente-marketing', 'expansao', 1, false, false, true),
  ('assistente-marketing', 'financeiro', 0, false, false, false),
  ('assistente-marketing', 'gestao', 1, false, false, true),
  ('assistente-marketing', 'governanca', 0, false, false, false),
  ('assistente-marketing', 'grupos', 1, false, false, false),
  ('assistente-marketing', 'integracao', 1, false, false, false),
  ('assistente-marketing', 'logistica', 0, false, false, false),
  ('assistente-marketing', 'membresia', 1, false, false, false),
  ('assistente-marketing', 'minha-area', 1, false, false, true),
  ('assistente-marketing', 'next', 1, false, false, false),
  ('assistente-marketing', 'notificacoes-config', 0, false, false, false),
  ('assistente-marketing', 'nps', 2, false, false, false),
  ('assistente-marketing', 'online', 1, false, false, false),
  ('assistente-marketing', 'painel-cbrio', 1, false, false, false),
  ('assistente-marketing', 'patrimonio', 0, false, false, false),
  ('assistente-marketing', 'perfil', 3, false, false, true),
  ('assistente-marketing', 'permissoes-admin', 0, false, false, false),
  ('assistente-marketing', 'planejamento', 1, false, false, true),
  ('assistente-marketing', 'projetos', 1, false, false, true),
  ('assistente-marketing', 'revisao-estrategica', 0, false, false, false),
  ('assistente-marketing', 'rh', 0, false, false, false),
  ('assistente-marketing', 'ritual', 0, false, false, false),
  ('assistente-marketing', 'solicitacoes', 2, false, false, false),
  ('assistente-marketing', 'usuarios-admin', 0, false, false, false),
  ('assistente-marketing', 'voluntariado', 1, false, false, false),
  ('assistente-ministerial', 'assistente-ia', 2, false, false, true),
  ('assistente-ministerial', 'cerebro', 0, false, false, false),
  ('assistente-ministerial', 'cuidados', 3, false, false, true),
  ('assistente-ministerial', 'dados-brutos', 2, false, false, true),
  ('assistente-ministerial', 'dashboard', 1, true, false, false),
  ('assistente-ministerial', 'eventos', 1, false, false, false),
  ('assistente-ministerial', 'expansao', 1, false, false, false),
  ('assistente-ministerial', 'financeiro', 0, false, false, false),
  ('assistente-ministerial', 'gestao', 1, true, false, true),
  ('assistente-ministerial', 'governanca', 0, false, false, false),
  ('assistente-ministerial', 'grupos', 3, false, false, true),
  ('assistente-ministerial', 'integracao', 3, false, false, true),
  ('assistente-ministerial', 'logistica', 0, false, false, false),
  ('assistente-ministerial', 'membresia', 3, false, false, true),
  ('assistente-ministerial', 'minha-area', 3, true, true, true),
  ('assistente-ministerial', 'next', 3, false, false, true),
  ('assistente-ministerial', 'notificacoes-config', 0, false, false, false),
  ('assistente-ministerial', 'nps', 2, false, false, false),
  ('assistente-ministerial', 'online', 3, false, false, true),
  ('assistente-ministerial', 'painel-cbrio', 1, true, false, false),
  ('assistente-ministerial', 'patrimonio', 0, false, false, false),
  ('assistente-ministerial', 'perfil', 3, false, false, true),
  ('assistente-ministerial', 'permissoes-admin', 0, false, false, false),
  ('assistente-ministerial', 'planejamento', 1, false, false, false),
  ('assistente-ministerial', 'projetos', 1, false, false, false),
  ('assistente-ministerial', 'revisao-estrategica', 0, false, false, false),
  ('assistente-ministerial', 'rh', 0, false, false, false),
  ('assistente-ministerial', 'ritual', 0, false, false, false),
  ('assistente-ministerial', 'solicitacoes', 2, false, false, false),
  ('assistente-ministerial', 'usuarios-admin', 0, false, false, false),
  ('assistente-ministerial', 'voluntariado', 3, false, false, true),
  ('assistente-operacoes', 'assistente-ia', 2, false, false, true),
  ('assistente-operacoes', 'cerebro', 0, false, false, false),
  ('assistente-operacoes', 'cuidados', 1, false, false, false),
  ('assistente-operacoes', 'dados-brutos', 2, false, false, true),
  ('assistente-operacoes', 'dashboard', 1, false, false, false),
  ('assistente-operacoes', 'eventos', 1, false, false, true),
  ('assistente-operacoes', 'expansao', 1, false, false, true),
  ('assistente-operacoes', 'financeiro', 0, false, false, false),
  ('assistente-operacoes', 'gestao', 1, false, false, true),
  ('assistente-operacoes', 'governanca', 0, false, false, false),
  ('assistente-operacoes', 'grupos', 1, false, false, false),
  ('assistente-operacoes', 'integracao', 1, false, false, false),
  ('assistente-operacoes', 'logistica', 4, false, false, false),
  ('assistente-operacoes', 'membresia', 1, false, false, false),
  ('assistente-operacoes', 'minha-area', 3, true, true, true),
  ('assistente-operacoes', 'next', 1, false, false, false),
  ('assistente-operacoes', 'notificacoes-config', 0, false, false, false),
  ('assistente-operacoes', 'nps', 2, false, false, false),
  ('assistente-operacoes', 'online', 1, false, false, false),
  ('assistente-operacoes', 'painel-cbrio', 1, false, false, false),
  ('assistente-operacoes', 'patrimonio', 4, false, false, false),
  ('assistente-operacoes', 'perfil', 3, false, false, true),
  ('assistente-operacoes', 'permissoes-admin', 0, false, false, false),
  ('assistente-operacoes', 'planejamento', 1, false, false, true),
  ('assistente-operacoes', 'projetos', 1, false, false, true),
  ('assistente-operacoes', 'revisao-estrategica', 0, false, false, false),
  ('assistente-operacoes', 'rh', 0, false, false, false),
  ('assistente-operacoes', 'ritual', 0, false, false, false),
  ('assistente-operacoes', 'solicitacoes', 2, false, false, false),
  ('assistente-operacoes', 'usuarios-admin', 0, false, false, false),
  ('assistente-operacoes', 'voluntariado', 1, false, false, false),
  ('assistente-producao', 'assistente-ia', 2, false, false, true),
  ('assistente-producao', 'cerebro', 0, false, false, false),
  ('assistente-producao', 'cuidados', 1, false, false, false),
  ('assistente-producao', 'dados-brutos', 2, false, false, true),
  ('assistente-producao', 'dashboard', 1, false, false, false),
  ('assistente-producao', 'eventos', 1, false, false, true),
  ('assistente-producao', 'expansao', 1, false, false, true),
  ('assistente-producao', 'financeiro', 0, false, false, false),
  ('assistente-producao', 'gestao', 1, false, false, true),
  ('assistente-producao', 'governanca', 0, false, false, false),
  ('assistente-producao', 'grupos', 1, false, false, false),
  ('assistente-producao', 'integracao', 1, false, false, false),
  ('assistente-producao', 'logistica', 0, false, false, false),
  ('assistente-producao', 'membresia', 1, false, false, false),
  ('assistente-producao', 'minha-area', 3, true, true, true),
  ('assistente-producao', 'next', 1, false, false, false),
  ('assistente-producao', 'notificacoes-config', 0, false, false, false),
  ('assistente-producao', 'nps', 2, false, false, false),
  ('assistente-producao', 'online', 1, false, false, false),
  ('assistente-producao', 'painel-cbrio', 1, false, false, false),
  ('assistente-producao', 'patrimonio', 0, false, false, false),
  ('assistente-producao', 'perfil', 3, false, false, true),
  ('assistente-producao', 'permissoes-admin', 0, false, false, false),
  ('assistente-producao', 'planejamento', 1, false, false, true),
  ('assistente-producao', 'projetos', 1, false, false, true),
  ('assistente-producao', 'revisao-estrategica', 0, false, false, false),
  ('assistente-producao', 'rh', 0, false, false, false),
  ('assistente-producao', 'ritual', 0, false, false, false),
  ('assistente-producao', 'solicitacoes', 2, false, false, false),
  ('assistente-producao', 'usuarios-admin', 0, false, false, false),
  ('assistente-producao', 'voluntariado', 1, false, false, false),
  ('conselho', 'assistente-ia', 2, false, false, true),
  ('conselho', 'cerebro', 0, false, false, false),
  ('conselho', 'cuidados', 0, false, false, false),
  ('conselho', 'dashboard', 1, false, false, false),
  ('conselho', 'eventos', 0, false, false, false),
  ('conselho', 'expansao', 0, false, false, false),
  ('conselho', 'financeiro', 0, false, false, false),
  ('conselho', 'gestao', 0, false, false, false),
  ('conselho', 'governanca', 0, false, false, false),
  ('conselho', 'grupos', 0, false, false, false),
  ('conselho', 'integracao', 0, false, false, false),
  ('conselho', 'logistica', 0, false, false, false),
  ('conselho', 'membresia', 0, false, false, false),
  ('conselho', 'minha-area', 0, false, false, false),
  ('conselho', 'next', 0, false, false, false),
  ('conselho', 'notificacoes-config', 0, false, false, false),
  ('conselho', 'nps', 2, false, false, false),
  ('conselho', 'online', 0, false, false, false),
  ('conselho', 'painel-cbrio', 1, false, false, false),
  ('conselho', 'patrimonio', 0, false, false, false),
  ('conselho', 'perfil', 3, false, false, true),
  ('conselho', 'permissoes-admin', 0, false, false, false),
  ('conselho', 'planejamento', 0, false, false, false),
  ('conselho', 'projetos', 0, false, false, false),
  ('conselho', 'revisao-estrategica', 0, false, false, false),
  ('conselho', 'rh', 0, false, false, false),
  ('conselho', 'ritual', 0, false, false, false),
  ('conselho', 'solicitacoes', 2, false, false, false),
  ('conselho', 'usuarios-admin', 0, false, false, false),
  ('conselho', 'voluntariado', 0, false, false, false),
  ('coordenador-estrategia', 'assistente-ia', 2, false, false, true),
  ('coordenador-estrategia', 'cerebro', 0, false, false, false),
  ('coordenador-estrategia', 'cuidados', 5, true, true, false),
  ('coordenador-estrategia', 'dados-brutos', 1, false, false, false),
  ('coordenador-estrategia', 'dashboard', 5, true, true, false),
  ('coordenador-estrategia', 'eventos', 5, true, true, false),
  ('coordenador-estrategia', 'expansao', 5, true, true, false),
  ('coordenador-estrategia', 'financeiro', 5, true, true, false),
  ('coordenador-estrategia', 'gestao', 5, true, true, false),
  ('coordenador-estrategia', 'governanca', 5, true, true, false),
  ('coordenador-estrategia', 'grupos', 5, true, true, false),
  ('coordenador-estrategia', 'integracao', 5, true, true, false),
  ('coordenador-estrategia', 'logistica', 5, true, true, false),
  ('coordenador-estrategia', 'membresia', 5, true, true, false),
  ('coordenador-estrategia', 'minha-area', 5, true, true, false),
  ('coordenador-estrategia', 'next', 5, true, true, false),
  ('coordenador-estrategia', 'notificacoes-config', 0, false, false, false),
  ('coordenador-estrategia', 'nps', 2, false, false, false),
  ('coordenador-estrategia', 'online', 5, true, true, false),
  ('coordenador-estrategia', 'painel-cbrio', 5, true, true, false),
  ('coordenador-estrategia', 'patrimonio', 5, true, true, false),
  ('coordenador-estrategia', 'perfil', 3, false, false, true),
  ('coordenador-estrategia', 'permissoes-admin', 0, false, false, false),
  ('coordenador-estrategia', 'planejamento', 5, true, true, false),
  ('coordenador-estrategia', 'projetos', 5, true, true, false),
  ('coordenador-estrategia', 'revisao-estrategica', 5, true, true, false),
  ('coordenador-estrategia', 'rh', 5, true, true, false),
  ('coordenador-estrategia', 'ritual', 5, true, true, false),
  ('coordenador-estrategia', 'solicitacoes', 5, true, true, false),
  ('coordenador-estrategia', 'usuarios-admin', 0, false, false, false),
  ('coordenador-estrategia', 'voluntariado', 5, true, true, false),
  ('coordenador-financeiro', 'assistente-ia', 2, false, false, true),
  ('coordenador-financeiro', 'cerebro', 0, false, false, false),
  ('coordenador-financeiro', 'cuidados', 1, false, false, false),
  ('coordenador-financeiro', 'dados-brutos', 2, false, false, true),
  ('coordenador-financeiro', 'dashboard', 1, false, false, false),
  ('coordenador-financeiro', 'eventos', 2, false, false, true),
  ('coordenador-financeiro', 'expansao', 2, false, false, true),
  ('coordenador-financeiro', 'financeiro', 4, false, false, false),
  ('coordenador-financeiro', 'gestao', 2, false, false, true),
  ('coordenador-financeiro', 'governanca', 0, false, false, false),
  ('coordenador-financeiro', 'grupos', 1, false, false, false),
  ('coordenador-financeiro', 'integracao', 1, false, false, false),
  ('coordenador-financeiro', 'logistica', 1, false, false, false),
  ('coordenador-financeiro', 'membresia', 1, false, false, false),
  ('coordenador-financeiro', 'minha-area', 3, true, true, true),
  ('coordenador-financeiro', 'next', 1, false, false, false),
  ('coordenador-financeiro', 'notificacoes-config', 0, false, false, false),
  ('coordenador-financeiro', 'nps', 2, false, false, false),
  ('coordenador-financeiro', 'online', 1, false, false, false),
  ('coordenador-financeiro', 'painel-cbrio', 1, false, false, false),
  ('coordenador-financeiro', 'patrimonio', 1, false, false, false),
  ('coordenador-financeiro', 'perfil', 3, false, false, true),
  ('coordenador-financeiro', 'permissoes-admin', 0, false, false, false),
  ('coordenador-financeiro', 'planejamento', 2, false, false, true),
  ('coordenador-financeiro', 'projetos', 2, false, false, true),
  ('coordenador-financeiro', 'revisao-estrategica', 0, false, false, false),
  ('coordenador-financeiro', 'rh', 4, false, false, false),
  ('coordenador-financeiro', 'ritual', 0, false, false, false),
  ('coordenador-financeiro', 'solicitacoes', 2, false, false, false),
  ('coordenador-financeiro', 'usuarios-admin', 0, false, false, false),
  ('coordenador-financeiro', 'voluntariado', 1, false, false, false),
  ('coordenador-marketing', 'assistente-ia', 2, false, false, true),
  ('coordenador-marketing', 'cerebro', 0, false, false, false),
  ('coordenador-marketing', 'cuidados', 1, false, false, false),
  ('coordenador-marketing', 'dados-brutos', 2, false, false, true),
  ('coordenador-marketing', 'dashboard', 1, false, false, false),
  ('coordenador-marketing', 'eventos', 2, false, false, true),
  ('coordenador-marketing', 'expansao', 2, false, false, true),
  ('coordenador-marketing', 'financeiro', 0, false, false, false),
  ('coordenador-marketing', 'gestao', 2, true, false, true),
  ('coordenador-marketing', 'governanca', 0, false, false, false),
  ('coordenador-marketing', 'grupos', 1, false, false, false),
  ('coordenador-marketing', 'integracao', 1, false, false, false),
  ('coordenador-marketing', 'logistica', 0, false, false, false),
  ('coordenador-marketing', 'membresia', 1, false, false, false),
  ('coordenador-marketing', 'minha-area', 1, false, false, false),
  ('coordenador-marketing', 'next', 1, false, false, false),
  ('coordenador-marketing', 'notificacoes-config', 0, false, false, false),
  ('coordenador-marketing', 'nps', 2, false, false, false),
  ('coordenador-marketing', 'online', 1, false, false, false),
  ('coordenador-marketing', 'painel-cbrio', 1, false, false, false),
  ('coordenador-marketing', 'patrimonio', 0, false, false, false),
  ('coordenador-marketing', 'perfil', 3, false, false, true),
  ('coordenador-marketing', 'permissoes-admin', 0, false, false, false),
  ('coordenador-marketing', 'planejamento', 4, true, false, true),
  ('coordenador-marketing', 'projetos', 2, false, false, true),
  ('coordenador-marketing', 'revisao-estrategica', 0, false, false, false),
  ('coordenador-marketing', 'rh', 0, false, false, false),
  ('coordenador-marketing', 'ritual', 0, false, false, false),
  ('coordenador-marketing', 'solicitacoes', 2, false, false, false),
  ('coordenador-marketing', 'usuarios-admin', 0, false, false, false),
  ('coordenador-marketing', 'voluntariado', 1, false, false, false),
  ('coordenador-voluntarios', 'assistente-ia', 2, false, false, true),
  ('coordenador-voluntarios', 'cerebro', 0, false, false, false),
  ('coordenador-voluntarios', 'cuidados', 0, false, false, false),
  ('coordenador-voluntarios', 'dashboard', 1, false, false, false),
  ('coordenador-voluntarios', 'eventos', 0, false, false, false),
  ('coordenador-voluntarios', 'expansao', 0, false, false, false),
  ('coordenador-voluntarios', 'financeiro', 0, false, false, false),
  ('coordenador-voluntarios', 'gestao', 0, false, false, false),
  ('coordenador-voluntarios', 'governanca', 0, false, false, false),
  ('coordenador-voluntarios', 'grupos', 0, false, false, false),
  ('coordenador-voluntarios', 'integracao', 0, false, false, false),
  ('coordenador-voluntarios', 'logistica', 0, false, false, false),
  ('coordenador-voluntarios', 'membresia', 0, false, false, false),
  ('coordenador-voluntarios', 'minha-area', 0, false, false, false),
  ('coordenador-voluntarios', 'next', 0, false, false, false),
  ('coordenador-voluntarios', 'notificacoes-config', 0, false, false, false),
  ('coordenador-voluntarios', 'nps', 2, false, false, false),
  ('coordenador-voluntarios', 'online', 0, false, false, false),
  ('coordenador-voluntarios', 'painel-cbrio', 1, false, false, false),
  ('coordenador-voluntarios', 'patrimonio', 0, false, false, false),
  ('coordenador-voluntarios', 'perfil', 3, false, false, true),
  ('coordenador-voluntarios', 'permissoes-admin', 0, false, false, false),
  ('coordenador-voluntarios', 'planejamento', 0, false, false, false),
  ('coordenador-voluntarios', 'projetos', 0, false, false, false),
  ('coordenador-voluntarios', 'revisao-estrategica', 0, false, false, false),
  ('coordenador-voluntarios', 'rh', 0, false, false, false),
  ('coordenador-voluntarios', 'ritual', 0, false, false, false),
  ('coordenador-voluntarios', 'solicitacoes', 2, false, false, false),
  ('coordenador-voluntarios', 'usuarios-admin', 0, false, false, false),
  ('coordenador-voluntarios', 'voluntariado', 4, false, false, true),
  ('dev', 'assistente-ia', 5, true, true, false),
  ('dev', 'cerebro', 5, true, true, false),
  ('dev', 'cuidados', 5, true, true, false),
  ('dev', 'dados-brutos', 5, true, true, false),
  ('dev', 'dashboard', 1, false, false, false),
  ('dev', 'eventos', 5, true, true, false),
  ('dev', 'expansao', 5, true, true, false),
  ('dev', 'financeiro', 5, true, true, false),
  ('dev', 'gestao', 0, false, false, false),
  ('dev', 'governanca', 0, false, false, false),
  ('dev', 'grupos', 5, true, true, false),
  ('dev', 'integracao', 5, true, true, false),
  ('dev', 'logistica', 5, true, true, false),
  ('dev', 'membresia', 5, true, true, false),
  ('dev', 'minha-area', 0, false, false, false),
  ('dev', 'next', 5, true, true, false),
  ('dev', 'notificacoes-config', 5, true, true, false),
  ('dev', 'nps', 5, true, true, false),
  ('dev', 'online', 5, true, true, false),
  ('dev', 'painel-cbrio', 1, false, false, false),
  ('dev', 'patrimonio', 5, true, true, false),
  ('dev', 'perfil', 5, true, true, false),
  ('dev', 'permissoes-admin', 5, true, true, false),
  ('dev', 'planejamento', 0, false, false, false),
  ('dev', 'projetos', 5, true, true, false),
  ('dev', 'revisao-estrategica', 0, false, false, false),
  ('dev', 'rh', 5, true, true, false),
  ('dev', 'ritual', 0, false, false, false),
  ('dev', 'solicitacoes', 5, true, true, false),
  ('dev', 'usuarios-admin', 5, true, true, false),
  ('dev', 'voluntariado', 5, true, true, false),
  ('diretor-administrativo', 'assistente-ia', 2, false, false, true),
  ('diretor-administrativo', 'cerebro', 0, false, false, false),
  ('diretor-administrativo', 'cuidados', 1, false, false, false),
  ('diretor-administrativo', 'dados-brutos', 1, false, false, false),
  ('diretor-administrativo', 'dashboard', 5, true, true, false),
  ('diretor-administrativo', 'eventos', 1, true, false, false),
  ('diretor-administrativo', 'expansao', 1, true, false, false),
  ('diretor-administrativo', 'financeiro', 1, true, false, false),
  ('diretor-administrativo', 'gestao', 5, true, true, false),
  ('diretor-administrativo', 'governanca', 5, true, true, false),
  ('diretor-administrativo', 'grupos', 1, false, false, false),
  ('diretor-administrativo', 'integracao', 1, false, false, false),
  ('diretor-administrativo', 'logistica', 1, true, false, false),
  ('diretor-administrativo', 'membresia', 1, false, false, false),
  ('diretor-administrativo', 'minha-area', 5, true, true, false),
  ('diretor-administrativo', 'next', 1, false, false, false),
  ('diretor-administrativo', 'notificacoes-config', 0, false, false, false),
  ('diretor-administrativo', 'nps', 2, false, false, false),
  ('diretor-administrativo', 'online', 1, false, false, false),
  ('diretor-administrativo', 'painel-cbrio', 5, true, true, false),
  ('diretor-administrativo', 'patrimonio', 1, true, false, false),
  ('diretor-administrativo', 'perfil', 3, false, false, true),
  ('diretor-administrativo', 'permissoes-admin', 0, false, false, false),
  ('diretor-administrativo', 'planejamento', 5, true, true, false),
  ('diretor-administrativo', 'projetos', 1, true, false, false),
  ('diretor-administrativo', 'revisao-estrategica', 5, true, true, false),
  ('diretor-administrativo', 'rh', 1, true, false, false),
  ('diretor-administrativo', 'ritual', 5, true, true, false),
  ('diretor-administrativo', 'solicitacoes', 2, false, false, false),
  ('diretor-administrativo', 'usuarios-admin', 0, false, false, false),
  ('diretor-administrativo', 'voluntariado', 1, false, false, false),
  ('diretor-criativo', 'assistente-ia', 2, false, false, true),
  ('diretor-criativo', 'cerebro', 0, false, false, false),
  ('diretor-criativo', 'cuidados', 1, false, false, false),
  ('diretor-criativo', 'dados-brutos', 1, false, false, false),
  ('diretor-criativo', 'dashboard', 1, true, false, false),
  ('diretor-criativo', 'eventos', 1, false, false, false),
  ('diretor-criativo', 'expansao', 1, false, false, false),
  ('diretor-criativo', 'financeiro', 1, false, false, false),
  ('diretor-criativo', 'gestao', 1, true, false, false),
  ('diretor-criativo', 'governanca', 5, true, true, false),
  ('diretor-criativo', 'grupos', 1, false, false, false),
  ('diretor-criativo', 'integracao', 1, false, false, false),
  ('diretor-criativo', 'logistica', 1, false, false, false),
  ('diretor-criativo', 'membresia', 1, false, false, false),
  ('diretor-criativo', 'minha-area', 1, true, false, false),
  ('diretor-criativo', 'next', 1, false, false, false),
  ('diretor-criativo', 'notificacoes-config', 0, false, false, false),
  ('diretor-criativo', 'nps', 2, false, false, false),
  ('diretor-criativo', 'online', 1, false, false, false),
  ('diretor-criativo', 'painel-cbrio', 1, true, false, false),
  ('diretor-criativo', 'patrimonio', 1, false, false, false),
  ('diretor-criativo', 'perfil', 3, false, false, true),
  ('diretor-criativo', 'permissoes-admin', 0, false, false, false),
  ('diretor-criativo', 'planejamento', 5, true, true, false),
  ('diretor-criativo', 'projetos', 1, false, false, false),
  ('diretor-criativo', 'revisao-estrategica', 5, true, true, false),
  ('diretor-criativo', 'rh', 1, false, false, false),
  ('diretor-criativo', 'ritual', 5, true, true, false),
  ('diretor-criativo', 'solicitacoes', 2, false, false, false),
  ('diretor-criativo', 'usuarios-admin', 0, false, false, false),
  ('diretor-criativo', 'voluntariado', 1, false, false, false),
  ('diretor-ministerial', 'assistente-ia', 2, false, false, true),
  ('diretor-ministerial', 'cerebro', 0, false, false, false),
  ('diretor-ministerial', 'cuidados', 1, false, false, false),
  ('diretor-ministerial', 'dados-brutos', 1, false, false, false),
  ('diretor-ministerial', 'dashboard', 1, true, false, false),
  ('diretor-ministerial', 'eventos', 1, false, false, false),
  ('diretor-ministerial', 'expansao', 1, false, false, false),
  ('diretor-ministerial', 'financeiro', 1, false, false, false),
  ('diretor-ministerial', 'gestao', 1, true, false, false),
  ('diretor-ministerial', 'governanca', 5, true, true, false),
  ('diretor-ministerial', 'grupos', 1, false, false, false),
  ('diretor-ministerial', 'integracao', 1, false, false, false),
  ('diretor-ministerial', 'logistica', 1, false, false, false),
  ('diretor-ministerial', 'membresia', 1, false, false, false),
  ('diretor-ministerial', 'minha-area', 1, true, false, false),
  ('diretor-ministerial', 'next', 1, false, false, false),
  ('diretor-ministerial', 'notificacoes-config', 0, false, false, false),
  ('diretor-ministerial', 'nps', 2, false, false, false),
  ('diretor-ministerial', 'online', 1, false, false, false),
  ('diretor-ministerial', 'painel-cbrio', 1, true, false, false),
  ('diretor-ministerial', 'patrimonio', 1, false, false, false),
  ('diretor-ministerial', 'perfil', 3, false, false, true),
  ('diretor-ministerial', 'permissoes-admin', 0, false, false, false),
  ('diretor-ministerial', 'planejamento', 5, true, true, false),
  ('diretor-ministerial', 'projetos', 1, false, false, false),
  ('diretor-ministerial', 'revisao-estrategica', 5, true, true, false),
  ('diretor-ministerial', 'rh', 1, false, false, false),
  ('diretor-ministerial', 'ritual', 5, true, true, false),
  ('diretor-ministerial', 'solicitacoes', 2, false, false, false),
  ('diretor-ministerial', 'usuarios-admin', 0, false, false, false),
  ('diretor-ministerial', 'voluntariado', 1, false, false, false),
  ('diretor-rh', 'assistente-ia', 2, false, false, true),
  ('diretor-rh', 'cerebro', 0, false, false, false),
  ('diretor-rh', 'cuidados', 1, false, false, false),
  ('diretor-rh', 'dados-brutos', 2, false, false, true),
  ('diretor-rh', 'dashboard', 1, false, false, false),
  ('diretor-rh', 'eventos', 1, false, false, false),
  ('diretor-rh', 'expansao', 1, false, false, false),
  ('diretor-rh', 'financeiro', 4, false, false, false),
  ('diretor-rh', 'gestao', 3, true, true, true),
  ('diretor-rh', 'governanca', 0, false, false, false),
  ('diretor-rh', 'grupos', 1, false, false, false),
  ('diretor-rh', 'integracao', 1, false, false, false),
  ('diretor-rh', 'logistica', 1, false, false, false),
  ('diretor-rh', 'membresia', 1, false, false, false),
  ('diretor-rh', 'minha-area', 3, true, true, true),
  ('diretor-rh', 'next', 1, false, false, false),
  ('diretor-rh', 'notificacoes-config', 0, false, false, false),
  ('diretor-rh', 'nps', 2, false, false, false),
  ('diretor-rh', 'online', 1, false, false, false),
  ('diretor-rh', 'painel-cbrio', 1, false, false, false),
  ('diretor-rh', 'patrimonio', 1, false, false, false),
  ('diretor-rh', 'perfil', 3, false, false, true),
  ('diretor-rh', 'permissoes-admin', 0, false, false, false),
  ('diretor-rh', 'planejamento', 0, false, false, false),
  ('diretor-rh', 'projetos', 1, false, false, false),
  ('diretor-rh', 'revisao-estrategica', 0, false, false, false),
  ('diretor-rh', 'rh', 4, false, false, false),
  ('diretor-rh', 'ritual', 0, false, false, false),
  ('diretor-rh', 'solicitacoes', 2, false, false, false),
  ('diretor-rh', 'usuarios-admin', 0, false, false, false),
  ('diretor-rh', 'voluntariado', 1, false, false, false),
  ('lider-logistica', 'assistente-ia', 2, false, false, true),
  ('lider-logistica', 'cerebro', 0, false, false, false),
  ('lider-logistica', 'cuidados', 1, false, false, false),
  ('lider-logistica', 'dados-brutos', 2, false, false, true),
  ('lider-logistica', 'dashboard', 1, false, false, false),
  ('lider-logistica', 'eventos', 2, false, false, true),
  ('lider-logistica', 'expansao', 2, false, false, true),
  ('lider-logistica', 'financeiro', 0, false, false, false),
  ('lider-logistica', 'gestao', 1, false, false, true),
  ('lider-logistica', 'governanca', 0, false, false, false),
  ('lider-logistica', 'grupos', 1, false, false, false),
  ('lider-logistica', 'integracao', 1, false, false, false),
  ('lider-logistica', 'logistica', 4, false, false, false),
  ('lider-logistica', 'membresia', 1, false, false, false),
  ('lider-logistica', 'minha-area', 3, true, true, true),
  ('lider-logistica', 'next', 1, false, false, false),
  ('lider-logistica', 'notificacoes-config', 0, false, false, false),
  ('lider-logistica', 'nps', 2, false, false, false),
  ('lider-logistica', 'online', 1, false, false, false),
  ('lider-logistica', 'painel-cbrio', 1, false, false, false),
  ('lider-logistica', 'patrimonio', 4, false, false, false),
  ('lider-logistica', 'perfil', 3, false, false, true),
  ('lider-logistica', 'permissoes-admin', 0, false, false, false),
  ('lider-logistica', 'planejamento', 1, false, false, true),
  ('lider-logistica', 'projetos', 2, false, false, true),
  ('lider-logistica', 'revisao-estrategica', 0, false, false, false),
  ('lider-logistica', 'rh', 0, false, false, false),
  ('lider-logistica', 'ritual', 0, false, false, false),
  ('lider-logistica', 'solicitacoes', 2, false, false, false),
  ('lider-logistica', 'usuarios-admin', 0, false, false, false),
  ('lider-logistica', 'voluntariado', 1, false, false, false),
  ('lider-ministerial', 'assistente-ia', 2, false, false, true),
  ('lider-ministerial', 'cerebro', 0, false, false, false),
  ('lider-ministerial', 'cuidados', 3, false, false, true),
  ('lider-ministerial', 'dados-brutos', 2, false, false, true),
  ('lider-ministerial', 'dashboard', 1, true, false, false),
  ('lider-ministerial', 'eventos', 1, false, false, false),
  ('lider-ministerial', 'expansao', 2, false, false, true),
  ('lider-ministerial', 'financeiro', 0, false, false, false),
  ('lider-ministerial', 'gestao', 1, true, false, true),
  ('lider-ministerial', 'governanca', 0, false, false, false),
  ('lider-ministerial', 'grupos', 3, false, false, true),
  ('lider-ministerial', 'integracao', 3, false, false, true),
  ('lider-ministerial', 'logistica', 0, false, false, false),
  ('lider-ministerial', 'membresia', 3, false, false, true),
  ('lider-ministerial', 'minha-area', 3, true, true, true),
  ('lider-ministerial', 'next', 3, false, false, true),
  ('lider-ministerial', 'notificacoes-config', 0, false, false, false),
  ('lider-ministerial', 'nps', 2, false, false, false),
  ('lider-ministerial', 'online', 3, false, false, true),
  ('lider-ministerial', 'painel-cbrio', 1, true, false, false),
  ('lider-ministerial', 'patrimonio', 0, false, false, false),
  ('lider-ministerial', 'perfil', 3, false, false, true),
  ('lider-ministerial', 'permissoes-admin', 0, false, false, false),
  ('lider-ministerial', 'planejamento', 1, false, false, false),
  ('lider-ministerial', 'projetos', 2, false, false, true),
  ('lider-ministerial', 'revisao-estrategica', 0, false, false, false),
  ('lider-ministerial', 'rh', 0, false, false, false),
  ('lider-ministerial', 'ritual', 0, false, false, false),
  ('lider-ministerial', 'solicitacoes', 2, false, false, false),
  ('lider-ministerial', 'usuarios-admin', 0, false, false, false),
  ('lider-ministerial', 'voluntariado', 3, false, false, true),
  ('lider-operacoes', 'assistente-ia', 2, false, false, true),
  ('lider-operacoes', 'cerebro', 0, false, false, false),
  ('lider-operacoes', 'cuidados', 1, false, false, false),
  ('lider-operacoes', 'dados-brutos', 2, false, false, true),
  ('lider-operacoes', 'dashboard', 1, false, false, false),
  ('lider-operacoes', 'eventos', 2, false, false, true),
  ('lider-operacoes', 'expansao', 2, false, false, true),
  ('lider-operacoes', 'financeiro', 0, false, false, false),
  ('lider-operacoes', 'gestao', 1, false, false, true),
  ('lider-operacoes', 'governanca', 0, false, false, false),
  ('lider-operacoes', 'grupos', 1, false, false, false),
  ('lider-operacoes', 'integracao', 1, false, false, false),
  ('lider-operacoes', 'logistica', 4, false, false, false),
  ('lider-operacoes', 'membresia', 1, false, false, false),
  ('lider-operacoes', 'minha-area', 3, true, true, true),
  ('lider-operacoes', 'next', 1, false, false, false),
  ('lider-operacoes', 'notificacoes-config', 0, false, false, false),
  ('lider-operacoes', 'nps', 2, false, false, false),
  ('lider-operacoes', 'online', 1, false, false, false),
  ('lider-operacoes', 'painel-cbrio', 1, false, false, false),
  ('lider-operacoes', 'patrimonio', 4, false, false, false),
  ('lider-operacoes', 'perfil', 3, false, false, true),
  ('lider-operacoes', 'permissoes-admin', 0, false, false, false),
  ('lider-operacoes', 'planejamento', 1, false, false, true),
  ('lider-operacoes', 'projetos', 2, false, false, true),
  ('lider-operacoes', 'revisao-estrategica', 0, false, false, false),
  ('lider-operacoes', 'rh', 0, false, false, false),
  ('lider-operacoes', 'ritual', 0, false, false, false),
  ('lider-operacoes', 'solicitacoes', 2, false, false, false),
  ('lider-operacoes', 'usuarios-admin', 0, false, false, false),
  ('lider-operacoes', 'voluntariado', 1, false, false, false),
  ('lider-producao', 'assistente-ia', 2, false, false, true),
  ('lider-producao', 'cerebro', 0, false, false, false),
  ('lider-producao', 'cuidados', 1, false, false, false),
  ('lider-producao', 'dados-brutos', 2, false, false, true),
  ('lider-producao', 'dashboard', 1, false, false, false),
  ('lider-producao', 'eventos', 2, false, false, true),
  ('lider-producao', 'expansao', 2, false, false, true),
  ('lider-producao', 'financeiro', 0, false, false, false),
  ('lider-producao', 'gestao', 1, false, false, true),
  ('lider-producao', 'governanca', 0, false, false, false),
  ('lider-producao', 'grupos', 1, false, false, false),
  ('lider-producao', 'integracao', 1, false, false, false),
  ('lider-producao', 'logistica', 0, false, false, false),
  ('lider-producao', 'membresia', 1, false, false, false),
  ('lider-producao', 'minha-area', 3, true, true, true),
  ('lider-producao', 'next', 1, false, false, false),
  ('lider-producao', 'notificacoes-config', 0, false, false, false),
  ('lider-producao', 'nps', 2, false, false, false),
  ('lider-producao', 'online', 1, false, false, false),
  ('lider-producao', 'painel-cbrio', 1, false, false, false),
  ('lider-producao', 'patrimonio', 0, false, false, false),
  ('lider-producao', 'perfil', 3, false, false, true),
  ('lider-producao', 'permissoes-admin', 0, false, false, false),
  ('lider-producao', 'planejamento', 1, false, false, true),
  ('lider-producao', 'projetos', 2, false, false, true),
  ('lider-producao', 'revisao-estrategica', 0, false, false, false),
  ('lider-producao', 'rh', 0, false, false, false),
  ('lider-producao', 'ritual', 0, false, false, false),
  ('lider-producao', 'solicitacoes', 2, false, false, false),
  ('lider-producao', 'usuarios-admin', 0, false, false, false),
  ('lider-producao', 'voluntariado', 1, false, false, false),
  ('membro', 'assistente-ia', 2, false, false, true),
  ('membro', 'cerebro', 0, false, false, false),
  ('membro', 'cuidados', 0, false, false, false),
  ('membro', 'dashboard', 1, false, false, false),
  ('membro', 'eventos', 0, false, false, false),
  ('membro', 'expansao', 0, false, false, false),
  ('membro', 'financeiro', 0, false, false, false),
  ('membro', 'gestao', 0, false, false, false),
  ('membro', 'governanca', 0, false, false, false),
  ('membro', 'grupos', 0, false, false, false),
  ('membro', 'integracao', 0, false, false, false),
  ('membro', 'logistica', 0, false, false, false),
  ('membro', 'membresia', 0, false, false, false),
  ('membro', 'minha-area', 0, false, false, false),
  ('membro', 'next', 0, false, false, false),
  ('membro', 'notificacoes-config', 0, false, false, false),
  ('membro', 'nps', 2, false, false, false),
  ('membro', 'online', 0, false, false, false),
  ('membro', 'painel-cbrio', 1, false, false, false),
  ('membro', 'patrimonio', 0, false, false, false),
  ('membro', 'perfil', 3, false, false, true),
  ('membro', 'permissoes-admin', 0, false, false, false),
  ('membro', 'planejamento', 0, false, false, false),
  ('membro', 'projetos', 0, false, false, false),
  ('membro', 'revisao-estrategica', 0, false, false, false),
  ('membro', 'rh', 0, false, false, false),
  ('membro', 'ritual', 0, false, false, false),
  ('membro', 'solicitacoes', 2, false, false, false),
  ('membro', 'usuarios-admin', 0, false, false, false),
  ('membro', 'voluntariado', 0, false, false, false),
  ('pastor-presidente', 'assistente-ia', 2, false, false, true),
  ('pastor-presidente', 'cerebro', 0, false, false, false),
  ('pastor-presidente', 'cuidados', 1, false, false, false),
  ('pastor-presidente', 'dados-brutos', 1, false, false, false),
  ('pastor-presidente', 'dashboard', 5, true, true, false),
  ('pastor-presidente', 'eventos', 1, false, false, false),
  ('pastor-presidente', 'expansao', 1, false, false, false),
  ('pastor-presidente', 'financeiro', 1, false, false, false),
  ('pastor-presidente', 'gestao', 5, true, true, false),
  ('pastor-presidente', 'governanca', 5, true, true, false),
  ('pastor-presidente', 'grupos', 1, false, false, false),
  ('pastor-presidente', 'integracao', 1, false, false, false),
  ('pastor-presidente', 'logistica', 1, false, false, false),
  ('pastor-presidente', 'membresia', 1, false, false, false),
  ('pastor-presidente', 'minha-area', 5, true, true, false),
  ('pastor-presidente', 'next', 1, false, false, false),
  ('pastor-presidente', 'notificacoes-config', 0, false, false, false),
  ('pastor-presidente', 'nps', 2, false, false, false),
  ('pastor-presidente', 'online', 1, false, false, false),
  ('pastor-presidente', 'painel-cbrio', 5, true, true, false),
  ('pastor-presidente', 'patrimonio', 1, false, false, false),
  ('pastor-presidente', 'perfil', 3, false, false, true),
  ('pastor-presidente', 'permissoes-admin', 0, false, false, false),
  ('pastor-presidente', 'planejamento', 5, true, true, false),
  ('pastor-presidente', 'projetos', 1, false, false, false),
  ('pastor-presidente', 'revisao-estrategica', 5, true, true, false),
  ('pastor-presidente', 'rh', 1, false, false, false),
  ('pastor-presidente', 'ritual', 5, true, true, false),
  ('pastor-presidente', 'solicitacoes', 2, false, false, false),
  ('pastor-presidente', 'usuarios-admin', 0, false, false, false),
  ('pastor-presidente', 'voluntariado', 1, false, false, false),
  ('pastor-senior', 'assistente-ia', 2, false, false, true),
  ('pastor-senior', 'cerebro', 0, false, false, false),
  ('pastor-senior', 'cuidados', 1, false, false, false),
  ('pastor-senior', 'dados-brutos', 1, false, false, false),
  ('pastor-senior', 'dashboard', 5, true, true, false),
  ('pastor-senior', 'eventos', 1, false, false, false),
  ('pastor-senior', 'expansao', 1, false, false, false),
  ('pastor-senior', 'financeiro', 1, false, false, false),
  ('pastor-senior', 'gestao', 5, true, true, false),
  ('pastor-senior', 'governanca', 5, true, true, false),
  ('pastor-senior', 'grupos', 1, false, false, false),
  ('pastor-senior', 'integracao', 1, false, false, false),
  ('pastor-senior', 'logistica', 1, false, false, false),
  ('pastor-senior', 'membresia', 1, false, false, false),
  ('pastor-senior', 'minha-area', 5, true, true, false),
  ('pastor-senior', 'next', 1, false, false, false),
  ('pastor-senior', 'notificacoes-config', 0, false, false, false),
  ('pastor-senior', 'nps', 2, false, false, false),
  ('pastor-senior', 'online', 1, false, false, false),
  ('pastor-senior', 'painel-cbrio', 5, true, true, false),
  ('pastor-senior', 'patrimonio', 1, false, false, false),
  ('pastor-senior', 'perfil', 3, false, false, true),
  ('pastor-senior', 'permissoes-admin', 0, false, false, false),
  ('pastor-senior', 'planejamento', 5, true, true, false),
  ('pastor-senior', 'projetos', 1, false, false, false),
  ('pastor-senior', 'revisao-estrategica', 5, true, true, false),
  ('pastor-senior', 'rh', 1, false, false, false),
  ('pastor-senior', 'ritual', 5, true, true, false),
  ('pastor-senior', 'solicitacoes', 2, false, false, false),
  ('pastor-senior', 'usuarios-admin', 0, false, false, false),
  ('pastor-senior', 'voluntariado', 1, false, false, false),
  ('voluntario', 'assistente-ia', 2, false, false, true),
  ('voluntario', 'cerebro', 0, false, false, false),
  ('voluntario', 'cuidados', 0, false, false, false),
  ('voluntario', 'dashboard', 1, false, false, false),
  ('voluntario', 'eventos', 0, false, false, false),
  ('voluntario', 'expansao', 0, false, false, false),
  ('voluntario', 'financeiro', 0, false, false, false),
  ('voluntario', 'gestao', 0, false, false, false),
  ('voluntario', 'governanca', 0, false, false, false),
  ('voluntario', 'grupos', 0, false, false, false),
  ('voluntario', 'integracao', 0, false, false, false),
  ('voluntario', 'logistica', 0, false, false, false),
  ('voluntario', 'membresia', 0, false, false, false),
  ('voluntario', 'minha-area', 0, false, false, false),
  ('voluntario', 'next', 0, false, false, false),
  ('voluntario', 'notificacoes-config', 0, false, false, false),
  ('voluntario', 'nps', 2, false, false, false),
  ('voluntario', 'online', 0, false, false, false),
  ('voluntario', 'painel-cbrio', 1, false, false, false),
  ('voluntario', 'patrimonio', 0, false, false, false),
  ('voluntario', 'perfil', 3, false, false, true),
  ('voluntario', 'permissoes-admin', 0, false, false, false),
  ('voluntario', 'planejamento', 0, false, false, false),
  ('voluntario', 'projetos', 0, false, false, false),
  ('voluntario', 'revisao-estrategica', 0, false, false, false),
  ('voluntario', 'rh', 0, false, false, false),
  ('voluntario', 'ritual', 0, false, false, false),
  ('voluntario', 'solicitacoes', 2, false, false, false),
  ('voluntario', 'usuarios-admin', 0, false, false, false),
  ('voluntario', 'voluntariado', 1, false, false, true)
)
INSERT INTO public.cargo_modulo_permissao (cargo_id, modulo_id, nivel, pode_exportar, pode_aprovar, escopo_proprio)
SELECT c.id, m.id, d.nivel, d.exportar, d.aprovar, d.escopo
  FROM dados d
  JOIN public.cargos c ON c.slug = d.cargo_slug
  JOIN public.modulos m ON m.slug = d.modulo_slug
ON CONFLICT (cargo_id, modulo_id) DO UPDATE SET
  nivel = EXCLUDED.nivel,
  pode_exportar = EXCLUDED.pode_exportar,
  pode_aprovar = EXCLUDED.pode_aprovar,
  escopo_proprio = EXCLUDED.escopo_proprio,
  updated_at = now();

-- ---------------------------------------------------------------------
-- 7. Modulo 'Processos' removido (decisao da reuniao 2026-05-18)
--    Mantemos o registro do modulo legado inativo; rotas redirecionam
--    para /eventos no frontend.
-- ---------------------------------------------------------------------
UPDATE public.modulos SET ativo = false WHERE slug IS NULL AND nome ILIKE 'Processos';

-- ---------------------------------------------------------------------
-- 8. View de conveniencia · permissao efetiva por usuario + modulo
--    EFETIVA = override (se existir) > default por cargo > (0,false,false,false)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_permissao_efetiva AS
SELECT
  u.id              AS usuario_id,
  u.email           AS usuario_email,
  c.id              AS cargo_id,
  c.slug            AS cargo_slug,
  c.nome            AS cargo_nome,
  m.id              AS modulo_id,
  m.slug            AS modulo_slug,
  m.nome            AS modulo_nome,
  m.categoria       AS modulo_categoria,
  m.rota            AS modulo_rota,
  COALESCE(pm.nivel_leitura,  cmp.nivel,         0)     AS nivel_leitura,
  COALESCE(pm.nivel_escrita,  cmp.nivel,         0)     AS nivel_escrita,
  COALESCE(pm.pode_exportar,  cmp.pode_exportar, false) AS pode_exportar,
  COALESCE(pm.pode_aprovar,   cmp.pode_aprovar,  false) AS pode_aprovar,
  COALESCE(pm.escopo_proprio, cmp.escopo_proprio,false) AS escopo_proprio,
  pm.expira_em      AS override_expira_em,
  pm.motivo         AS override_motivo,
  (pm.id IS NOT NULL) AS tem_override
 FROM public.usuarios u
 JOIN public.cargos c   ON c.id = u.cargo_id
 CROSS JOIN public.modulos m
 LEFT JOIN public.cargo_modulo_permissao cmp
        ON cmp.cargo_id = c.id AND cmp.modulo_id = m.id
 LEFT JOIN public.permissoes_modulo pm
        ON pm.usuario_id = u.id AND pm.modulo_id = m.id
 WHERE u.ativo = true AND m.ativo = true;

COMMIT;
